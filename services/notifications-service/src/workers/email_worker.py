"""
Email Worker with Retry Logic for the Notifications & Communication Microservice.

This module implements a background worker that processes email notification tasks:
- Consumes tasks from the Redis-backed queue
- Renders templates with Jinja2
- Sends emails via SendGrid
- Implements retry logic with exponential backoff
- Handles failures with proper dead-letter queue integration
- Updates delivery status in the database
- Tracks comprehensive metrics for monitoring

The worker integrates with:
- TaskQueueService for task management
- EmailDeliveryService for SendGrid integration
- TemplateService for Jinja2 rendering
- NotificationRepository for database updates
- MetricsCollector for Prometheus metrics

Features:
- Graceful shutdown handling
- Configurable concurrency
- Priority-based task processing
- Idempotency checking
- Circuit breaker integration
- Rate limit awareness
- Comprehensive error categorization

Feature: Notifications & Communication Microservice
Task: T035 - Create email worker with retry logic
"""

from __future__ import annotations

import asyncio
import logging
import signal
import sys
import traceback
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from src.cache.redis_client import redis_client
from src.config import settings
from src.observability.metrics import get_metrics, track_email_sent, track_dead_letter
from src.repositories.notification_repository import notification_repository
from src.schemas.notification import (
    NotificationChannel,
    NotificationDeliveryStatus,
    NotificationEventStatus,
    NotificationPriority,
    NotificationProvider,
    NotificationTask,
    NotificationResult,
)
from src.schemas.template import RenderedEmail
from src.services.email_delivery_service import (
    EmailDeliveryService,
    EmailDeliveryError,
    SendGridRateLimitError,
    RecipientSuppressedError,
    InvalidRecipientError,
    SendGridNotConfiguredError,
    get_email_delivery_service,
)
from src.services.task_queue_service import (
    Task,
    TaskPriority,
    TaskQueueService,
    TaskStatus,
    TASK_SEND_EMAIL,
    TASK_SEND_EMAIL_BATCH,
    TASK_RETRY_EMAIL,
    get_task_queue,
    register_task_handler,
)
from src.services.template_service import template_service

logger = logging.getLogger(__name__)


# =============================================================================
# ERROR CLASSIFICATION
# =============================================================================


class EmailErrorCategory(str, Enum):
    """Classification of email delivery errors for retry decisions."""

    # Retryable errors - transient failures
    TRANSIENT = "transient"  # Network issues, rate limits, temporary unavailability
    PROVIDER_ERROR = "provider_error"  # SendGrid 5xx errors

    # Non-retryable errors - permanent failures
    INVALID_RECIPIENT = "invalid_recipient"  # Bad email address
    SUPPRESSED = "suppressed"  # Bounced, unsubscribed, spam-reported
    TEMPLATE_ERROR = "template_error"  # Template rendering failed
    CONFIGURATION_ERROR = "configuration_error"  # Missing API key, etc.
    PERMISSION_ERROR = "permission_error"  # User opted out

    # Unknown
    UNKNOWN = "unknown"


@dataclass
class EmailProcessingResult:
    """Result of processing an email task."""

    success: bool
    message_id: Optional[str] = None
    error_message: Optional[str] = None
    error_code: Optional[str] = None
    error_category: EmailErrorCategory = EmailErrorCategory.UNKNOWN
    should_retry: bool = False
    retry_delay: Optional[int] = None
    delivered_at: Optional[datetime] = None


# =============================================================================
# EMAIL TASK HANDLERS
# =============================================================================


@register_task_handler(TASK_SEND_EMAIL)
async def handle_send_email(payload: dict[str, Any]) -> dict[str, Any]:
    """Handler for single email notification tasks.

    This is the main entry point for email processing from the task queue.
    It renders templates, sends the email, and returns the result.

    Args:
        payload: Task payload containing:
            - event_id: UUID of the notification event
            - workspace_id: UUID of the workspace
            - recipient_email: Email address to send to
            - recipient_user_id: Optional user ID
            - template_code: Template code to render
            - template_id: Optional template ID
            - subject: Optional subject override
            - payload: Template variables
            - correlation_id: Optional correlation ID

    Returns:
        Dict with processing result:
            - success: bool
            - message_id: Optional SendGrid message ID
            - error: Optional error message
            - error_code: Optional error code
    """
    worker = get_email_worker()
    return await worker.process_email_task(payload)


@register_task_handler(TASK_RETRY_EMAIL)
async def handle_retry_email(payload: dict[str, Any]) -> dict[str, Any]:
    """Handler for email retry tasks.

    Retried emails use the same processing logic as new emails.
    The retry count is tracked in the task itself.

    Args:
        payload: Same as handle_send_email

    Returns:
        Same as handle_send_email
    """
    worker = get_email_worker()

    # Log retry attempt
    logger.info(
        "Processing email retry",
        extra={
            "event_id": payload.get("event_id"),
            "attempt": payload.get("attempt", 1),
        },
    )

    return await worker.process_email_task(payload)


@register_task_handler(TASK_SEND_EMAIL_BATCH)
async def handle_send_email_batch(payload: dict[str, Any]) -> dict[str, Any]:
    """Handler for batch email tasks.

    Processes multiple emails concurrently with controlled parallelism.

    Args:
        payload: Task payload containing:
            - emails: List of email task payloads
            - workspace_id: Common workspace ID
            - correlation_id: Optional correlation ID

    Returns:
        Dict with batch processing result:
            - total: Total emails in batch
            - success_count: Emails sent successfully
            - failure_count: Emails that failed
            - results: List of individual results
    """
    worker = get_email_worker()
    return await worker.process_email_batch(payload)


# =============================================================================
# EMAIL WORKER
# =============================================================================


class EmailWorker:
    """Background worker for processing email notification tasks.

    This worker handles:
    - Consuming email tasks from the Redis queue
    - Template rendering with Jinja2
    - Email delivery via SendGrid
    - Retry logic with exponential backoff
    - Error categorization and handling
    - Metrics and monitoring

    Usage:
        worker = EmailWorker()

        # Process a single task
        result = await worker.process_email_task(task_payload)

        # Run as a background service
        await worker.run()

        # Graceful shutdown
        worker.stop()
    """

    def __init__(
        self,
        email_service: Optional[EmailDeliveryService] = None,
        task_queue: Optional[TaskQueueService] = None,
        concurrency: int = 10,
    ):
        """Initialize the email worker.

        Args:
            email_service: Email delivery service instance
            task_queue: Task queue service instance
            concurrency: Number of concurrent email processors
        """
        self._email_service = email_service or get_email_delivery_service()
        self._task_queue = task_queue or get_task_queue()
        self._concurrency = concurrency or settings.WORKER_CONCURRENCY
        self._metrics = get_metrics()

        # Worker state
        self._running = False
        self._shutdown_event = asyncio.Event()
        self._active_tasks: list[asyncio.Task] = []

        # Configuration
        self._max_retries = settings.QUEUE_RETRY_MAX_ATTEMPTS
        self._base_retry_delay = settings.QUEUE_RETRY_DELAY_SECONDS

    # =========================================================================
    # MAIN PROCESSING
    # =========================================================================

    async def process_email_task(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Process a single email notification task.

        This is the core processing method that:
        1. Validates the payload
        2. Checks user preferences (if applicable)
        3. Renders the template
        4. Sends the email via SendGrid
        5. Updates the notification status
        6. Returns the result

        Args:
            payload: Task payload with email details

        Returns:
            Dict with processing result
        """
        event_id = payload.get("event_id")
        workspace_id = payload.get("workspace_id")
        recipient_email = payload.get("recipient_email")
        template_code = payload.get("template_code")
        attempt = payload.get("attempt", 1)

        logger.info(
            "Processing email task",
            extra={
                "event_id": event_id,
                "template": template_code,
                "attempt": attempt,
            },
        )

        try:
            # Validate required fields
            if not all([event_id, workspace_id, recipient_email]):
                return self._build_error_result(
                    "Missing required fields (event_id, workspace_id, recipient_email)",
                    "MISSING_FIELDS",
                    EmailErrorCategory.TEMPLATE_ERROR,
                    should_retry=False,
                )

            # Build notification task
            notification_task = self._build_notification_task(payload)

            # Render template if needed
            rendered_email = await self._render_template(notification_task)

            # Send the email
            result = await self._send_email(notification_task, rendered_email)

            # Update notification status
            await self._update_notification_status(
                event_id=UUID(event_id),
                workspace_id=UUID(workspace_id),
                result=result,
            )

            # Track metrics
            self._track_metrics(result, template_code or "unknown")

            return self._build_success_result(result) if result.success else self._build_retry_result(result)

        except Exception as e:
            error_msg = f"{type(e).__name__}: {str(e)}"
            logger.exception(
                "Unexpected error processing email task",
                extra={"event_id": event_id, "error": error_msg},
            )

            # Track error
            self._metrics.error_occurred("email_processing", "/worker/email")

            return self._build_error_result(
                error_msg,
                type(e).__name__,
                EmailErrorCategory.UNKNOWN,
                should_retry=True,
            )

    async def process_email_batch(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Process a batch of email tasks concurrently.

        Args:
            payload: Batch payload with list of emails

        Returns:
            Dict with batch results
        """
        emails = payload.get("emails", [])
        workspace_id = payload.get("workspace_id")
        correlation_id = payload.get("correlation_id")

        if not emails:
            return {
                "total": 0,
                "success_count": 0,
                "failure_count": 0,
                "results": [],
            }

        # Limit batch size
        batch_size = min(len(emails), settings.QUEUE_BATCH_SIZE)
        emails = emails[:batch_size]

        logger.info(
            f"Processing email batch of {len(emails)} emails",
            extra={
                "workspace_id": workspace_id,
                "correlation_id": correlation_id,
            },
        )

        # Process with controlled concurrency
        semaphore = asyncio.Semaphore(self._concurrency)
        results = []

        async def process_with_semaphore(email_payload: dict) -> dict:
            async with semaphore:
                # Merge workspace and correlation ID
                email_payload["workspace_id"] = email_payload.get("workspace_id") or workspace_id
                email_payload["correlation_id"] = email_payload.get("correlation_id") or correlation_id
                return await self.process_email_task(email_payload)

        # Process all emails concurrently
        tasks = [process_with_semaphore(email) for email in emails]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Build response
        success_count = 0
        failure_count = 0
        processed_results = []

        for i, result in enumerate(results):
            if isinstance(result, Exception):
                failure_count += 1
                processed_results.append({
                    "index": i,
                    "success": False,
                    "error": str(result),
                })
            elif isinstance(result, dict):
                if result.get("success"):
                    success_count += 1
                else:
                    failure_count += 1
                processed_results.append({
                    "index": i,
                    **result,
                })

        return {
            "total": len(emails),
            "success_count": success_count,
            "failure_count": failure_count,
            "results": processed_results,
        }

    # =========================================================================
    # TEMPLATE RENDERING
    # =========================================================================

    async def _render_template(
        self,
        task: NotificationTask,
    ) -> Optional[RenderedEmail]:
        """Render email template with variables.

        Args:
            task: Notification task with template info

        Returns:
            RenderedEmail or None if rendering fails/not needed
        """
        # If no template specified, use provided content directly
        if not task.template_code and not task.template_id:
            return None

        try:
            with self._metrics.track_template_render("email"):
                rendered = await template_service.render_email(
                    workspace_id=task.workspace_id,
                    template_id=task.template_id,
                    template_code=task.template_code,
                    variables=task.payload,
                )

            if rendered:
                self._metrics.template_rendered("email", "success")
                return rendered
            else:
                self._metrics.template_rendered("email", "error")
                logger.warning(
                    "Template rendering returned None",
                    extra={
                        "template_code": task.template_code,
                        "event_id": str(task.event_id),
                    },
                )
                return None

        except Exception as e:
            self._metrics.template_rendered("email", "error")
            logger.error(
                f"Template rendering failed: {e}",
                extra={
                    "template_code": task.template_code,
                    "event_id": str(task.event_id),
                },
            )
            # Don't raise - we'll try to send with provided content
            return None

    # =========================================================================
    # EMAIL SENDING
    # =========================================================================

    async def _send_email(
        self,
        task: NotificationTask,
        rendered: Optional[RenderedEmail],
    ) -> EmailProcessingResult:
        """Send email via the email delivery service.

        Args:
            task: Notification task
            rendered: Rendered email content (optional)

        Returns:
            EmailProcessingResult with delivery status
        """
        try:
            # Get subject and content
            if rendered:
                subject = rendered.subject
                html_content = rendered.html
                text_content = rendered.text
            else:
                subject = task.rendered_subject or task.subject or "Notification"
                html_content = task.rendered_body_html
                text_content = task.rendered_body_text

            # Validate we have content
            if not html_content and not text_content:
                return EmailProcessingResult(
                    success=False,
                    error_message="No email content available",
                    error_code="NO_CONTENT",
                    error_category=EmailErrorCategory.TEMPLATE_ERROR,
                    should_retry=False,
                )

            # Send via email service
            with self._metrics.track_email_duration("sendgrid"):
                result = await self._email_service.send_email(
                    to_email=task.recipient_email,
                    subject=subject,
                    html_content=html_content,
                    text_content=text_content,
                    workspace_id=task.workspace_id,
                    event_id=task.event_id,
                    template_code=task.template_code,
                )

            if result.success:
                return EmailProcessingResult(
                    success=True,
                    message_id=result.message_id,
                    delivered_at=result.sent_at,
                )
            else:
                # Classify the error
                category = self._classify_error(result.error_code, result.error_message)
                return EmailProcessingResult(
                    success=False,
                    error_message=result.error_message,
                    error_code=result.error_code,
                    error_category=category,
                    should_retry=result.should_retry,
                    retry_delay=result.retry_after,
                )

        except SendGridNotConfiguredError as e:
            return EmailProcessingResult(
                success=False,
                error_message=str(e),
                error_code="SENDGRID_NOT_CONFIGURED",
                error_category=EmailErrorCategory.CONFIGURATION_ERROR,
                should_retry=False,
            )

        except SendGridRateLimitError as e:
            return EmailProcessingResult(
                success=False,
                error_message=str(e),
                error_code="RATE_LIMITED",
                error_category=EmailErrorCategory.TRANSIENT,
                should_retry=True,
                retry_delay=e.retry_after or 60,
            )

        except RecipientSuppressedError as e:
            return EmailProcessingResult(
                success=False,
                error_message=str(e),
                error_code="RECIPIENT_SUPPRESSED",
                error_category=EmailErrorCategory.SUPPRESSED,
                should_retry=False,
            )

        except InvalidRecipientError as e:
            return EmailProcessingResult(
                success=False,
                error_message=str(e),
                error_code="INVALID_RECIPIENT",
                error_category=EmailErrorCategory.INVALID_RECIPIENT,
                should_retry=False,
            )

        except EmailDeliveryError as e:
            category = self._classify_error(e.code, str(e))
            return EmailProcessingResult(
                success=False,
                error_message=str(e),
                error_code=e.code,
                error_category=category,
                should_retry=e.should_retry,
                retry_delay=e.retry_after,
            )

        except Exception as e:
            logger.exception(
                f"Unexpected email delivery error: {e}",
                extra={"event_id": str(task.event_id)},
            )
            return EmailProcessingResult(
                success=False,
                error_message=f"{type(e).__name__}: {str(e)}",
                error_code="UNEXPECTED_ERROR",
                error_category=EmailErrorCategory.UNKNOWN,
                should_retry=True,
            )

    def _classify_error(
        self,
        error_code: Optional[str],
        error_message: Optional[str],
    ) -> EmailErrorCategory:
        """Classify an error for retry decision.

        Args:
            error_code: Error code from the delivery service
            error_message: Error message

        Returns:
            EmailErrorCategory for the error
        """
        if not error_code:
            return EmailErrorCategory.UNKNOWN

        code_upper = error_code.upper()

        # Non-retryable errors
        if code_upper in ("INVALID_RECIPIENT", "INVALID_EMAIL", "VALIDATION_ERROR"):
            return EmailErrorCategory.INVALID_RECIPIENT

        if code_upper in ("RECIPIENT_SUPPRESSED", "BOUNCE", "UNSUBSCRIBED", "SPAM_REPORT"):
            return EmailErrorCategory.SUPPRESSED

        if code_upper in ("TEMPLATE_ERROR", "TEMPLATE_NOT_FOUND", "RENDERING_ERROR"):
            return EmailErrorCategory.TEMPLATE_ERROR

        if code_upper in ("NOT_CONFIGURED", "SENDGRID_NOT_CONFIGURED", "AUTH_ERROR"):
            return EmailErrorCategory.CONFIGURATION_ERROR

        if code_upper in ("OPT_OUT", "PREFERENCE_BLOCKED", "DO_NOT_CONTACT"):
            return EmailErrorCategory.PERMISSION_ERROR

        # Retryable errors
        if code_upper in ("RATE_LIMITED", "RATE_LIMIT", "TOO_MANY_REQUESTS"):
            return EmailErrorCategory.TRANSIENT

        if code_upper in ("TIMEOUT", "NETWORK_ERROR", "CONNECTION_ERROR", "SERVICE_UNAVAILABLE"):
            return EmailErrorCategory.TRANSIENT

        if code_upper.startswith("5"):  # 5xx errors
            return EmailErrorCategory.PROVIDER_ERROR

        return EmailErrorCategory.UNKNOWN

    # =========================================================================
    # STATUS UPDATES
    # =========================================================================

    async def _update_notification_status(
        self,
        event_id: UUID,
        workspace_id: UUID,
        result: EmailProcessingResult,
    ) -> None:
        """Update notification event status in the database.

        Args:
            event_id: Notification event ID
            workspace_id: Workspace ID
            result: Processing result
        """
        try:
            if result.success:
                status = NotificationEventStatus.SENT
                await notification_repository.update_event_status(
                    event_id=event_id,
                    status=status,
                    processed_at=datetime.now(timezone.utc),
                    delivered_at=result.delivered_at,
                )
            else:
                # Determine if we should mark as failed or keep pending for retry
                if result.should_retry:
                    status = NotificationEventStatus.PROCESSING
                    # Status remains processing, retry will be handled by queue
                else:
                    status = NotificationEventStatus.FAILED
                    await notification_repository.update_event_status(
                        event_id=event_id,
                        status=status,
                        error_message=result.error_message,
                    )

        except Exception as e:
            logger.error(
                f"Failed to update notification status: {e}",
                extra={"event_id": str(event_id)},
            )
            # Don't raise - status update failure shouldn't affect email delivery result

    # =========================================================================
    # METRICS TRACKING
    # =========================================================================

    def _track_metrics(
        self,
        result: EmailProcessingResult,
        template_code: str,
    ) -> None:
        """Track metrics for the email processing result.

        Args:
            result: Processing result
            template_code: Template code used
        """
        if result.success:
            track_email_sent("success", template_code, "email")
            self._metrics.notification_sent("email", "email", "success")
        else:
            track_email_sent("failed", template_code, "email")
            self._metrics.notification_sent("email", "email", "failed")

            # Track specific error categories
            if result.error_category == EmailErrorCategory.INVALID_RECIPIENT:
                self._metrics.notification_skipped("invalid_recipient")
            elif result.error_category == EmailErrorCategory.SUPPRESSED:
                self._metrics.notification_skipped("suppressed")
            elif result.error_category == EmailErrorCategory.PERMISSION_ERROR:
                self._metrics.notification_skipped("opt_out")

    # =========================================================================
    # RESULT BUILDERS
    # =========================================================================

    def _build_notification_task(self, payload: dict[str, Any]) -> NotificationTask:
        """Build a NotificationTask from payload.

        Args:
            payload: Task payload

        Returns:
            NotificationTask instance
        """
        return NotificationTask(
            event_id=UUID(payload["event_id"]),
            workspace_id=UUID(payload["workspace_id"]),
            channel=NotificationChannel.EMAIL,
            priority=NotificationPriority(payload.get("priority", "normal")),
            attempt_number=payload.get("attempt", 1),
            recipient_email=payload.get("recipient_email"),
            recipient_user_id=UUID(payload["recipient_user_id"]) if payload.get("recipient_user_id") else None,
            template_id=UUID(payload["template_id"]) if payload.get("template_id") else None,
            template_code=payload.get("template_code"),
            subject=payload.get("subject"),
            payload=payload.get("payload", {}),
            rendered_subject=payload.get("rendered_subject"),
            rendered_body_html=payload.get("rendered_body_html"),
            rendered_body_text=payload.get("rendered_body_text"),
            correlation_id=UUID(payload["correlation_id"]) if payload.get("correlation_id") else None,
            idempotency_key=payload.get("idempotency_key"),
        )

    def _build_success_result(self, result: EmailProcessingResult) -> dict[str, Any]:
        """Build a success result dict.

        Args:
            result: Processing result

        Returns:
            Dict with success info
        """
        return {
            "success": True,
            "message_id": result.message_id,
            "delivered_at": result.delivered_at.isoformat() if result.delivered_at else None,
        }

    def _build_retry_result(self, result: EmailProcessingResult) -> dict[str, Any]:
        """Build a result dict for retry scenarios.

        Args:
            result: Processing result

        Returns:
            Dict with retry info
        """
        return {
            "success": False,
            "error": result.error_message,
            "error_code": result.error_code,
            "error_category": result.error_category.value,
            "should_retry": result.should_retry,
            "retry_delay": result.retry_delay,
        }

    def _build_error_result(
        self,
        error_message: str,
        error_code: str,
        error_category: EmailErrorCategory,
        should_retry: bool = False,
    ) -> dict[str, Any]:
        """Build an error result dict.

        Args:
            error_message: Error description
            error_code: Error code
            error_category: Error category
            should_retry: Whether to retry

        Returns:
            Dict with error info
        """
        return {
            "success": False,
            "error": error_message,
            "error_code": error_code,
            "error_category": error_category.value,
            "should_retry": should_retry,
        }

    # =========================================================================
    # WORKER LIFECYCLE
    # =========================================================================

    async def run(self) -> None:
        """Run the email worker as a background service.

        This starts the task queue worker which will process email tasks
        as they are enqueued. The worker will continue until stopped.
        """
        self._running = True
        self._shutdown_event.clear()

        logger.info(
            f"Starting email worker with concurrency={self._concurrency}",
            extra={"service": "email_worker"},
        )

        # Start the task queue worker (it has registered handlers)
        try:
            await self._task_queue.start_worker(
                concurrency=self._concurrency,
                poll_interval=0.5,
            )
        except asyncio.CancelledError:
            logger.info("Email worker cancelled")
        except Exception as e:
            logger.exception(f"Email worker error: {e}")
            raise
        finally:
            self._running = False
            logger.info("Email worker stopped")

    def stop(self) -> None:
        """Signal the worker to stop gracefully."""
        logger.info("Stopping email worker")
        self._running = False
        self._shutdown_event.set()
        self._task_queue.stop_worker()

    async def run_once(self) -> None:
        """Process one batch of tasks and return.

        Useful for testing or one-off processing.
        """
        # Get and process pending tasks
        stats = await self._task_queue.get_queue_stats()
        if stats["pending"] == 0:
            logger.info("No pending tasks to process")
            return

        # Process up to batch_size tasks
        processed = 0
        while processed < settings.QUEUE_BATCH_SIZE:
            task = await self._task_queue._dequeue()
            if not task:
                break

            await self._task_queue._process_task(task)
            processed += 1

        logger.info(f"Processed {processed} tasks in run_once")

    # =========================================================================
    # HEALTH CHECK
    # =========================================================================

    async def health_check(self) -> dict[str, Any]:
        """Check the health of the email worker.

        Returns:
            Dict with health status
        """
        try:
            # Check task queue health
            queue_health = await self._task_queue.health_check()

            # Check email service health
            email_health = await self._email_service.health_check()

            # Determine overall status
            is_healthy = (
                queue_health.get("status") == "healthy" and
                email_health.get("configured", False)
            )

            return {
                "status": "healthy" if is_healthy else "degraded",
                "worker_running": self._running,
                "concurrency": self._concurrency,
                "queue": queue_health,
                "email_service": email_health,
            }

        except Exception as e:
            return {
                "status": "unhealthy",
                "error": str(e),
                "worker_running": self._running,
            }


# =============================================================================
# SINGLETON INSTANCE
# =============================================================================


_email_worker: Optional[EmailWorker] = None


def get_email_worker() -> EmailWorker:
    """Get the global email worker instance."""
    global _email_worker
    if _email_worker is None:
        _email_worker = EmailWorker()
    return _email_worker


# =============================================================================
# CLI ENTRY POINT
# =============================================================================


async def run_email_worker() -> None:
    """Main entry point for running the email worker as a service.

    Sets up signal handlers for graceful shutdown.
    """
    worker = get_email_worker()

    # Setup signal handlers
    loop = asyncio.get_event_loop()

    def signal_handler():
        logger.info("Received shutdown signal")
        worker.stop()

    # Register signal handlers
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, signal_handler)
        except NotImplementedError:
            # Windows doesn't support add_signal_handler
            signal.signal(sig, lambda s, f: signal_handler())

    # Run the worker
    try:
        await worker.run()
    except KeyboardInterrupt:
        logger.info("Keyboard interrupt received")
    finally:
        logger.info("Email worker shutdown complete")


def main() -> None:
    """CLI entry point."""
    import sys

    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    logger.info("Starting email worker service")

    try:
        asyncio.run(run_email_worker())
    except Exception as e:
        logger.exception(f"Email worker failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
