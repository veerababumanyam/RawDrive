"""Main notification orchestration service for the Notifications & Communication Microservice.

This module provides the NotificationService class that orchestrates the entire
notification lifecycle:
- Receiving notification requests
- Checking user preferences
- Rendering templates
- Dispatching to appropriate delivery channels
- Tracking delivery status
- Handling retries and error scenarios

The service acts as the central coordinator between:
- NotificationRepository: Event persistence
- PreferenceRepository: User preference checking
- TemplateService: Template rendering
- EmailDeliveryService: Email sending
- SMSDeliveryService: SMS sending (placeholder in Phase 1)

Features:
- Multi-channel support (email, SMS, in-app, push)
- Preference-based filtering and routing
- Idempotency key support to prevent duplicates
- Batch notification processing
- Scheduled notifications
- Retry with exponential backoff
- Priority-based processing
- Transactional notification bypass

Feature: Notifications & Communication Microservice
Task: T024 - Create notification_service.py orchestration
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID, uuid4

from src.cache.redis_client import redis_client
from src.config import settings
from src.observability.metrics import get_metrics
from src.repositories.notification_repository import notification_repository
from src.repositories.preference_repository import preference_repository
from src.schemas.notification import (
    DeliveryLogResponse,
    NotificationBatchCreateRequest,
    NotificationBatchCreateResponse,
    NotificationCategory,
    NotificationChannel,
    NotificationCreateRequest,
    NotificationDeliveryStatus,
    NotificationEventResponse,
    NotificationEventStatus,
    NotificationPriority,
    NotificationProvider,
    NotificationResult,
    NotificationTask,
)
from src.schemas.preference import PreferenceCheckRequest
from src.services.email_delivery_service import (
    email_delivery_service,
    EmailDeliveryError,
)
from src.services.sms_delivery_service import sms_delivery_service
from src.services.template_service import template_service

logger = logging.getLogger(__name__)


# =============================================================================
# EXCEPTIONS
# =============================================================================


class NotificationServiceError(Exception):
    """Base exception for notification service errors."""

    def __init__(
        self,
        message: str,
        code: str,
        details: dict[str, Any] | None = None,
    ):
        super().__init__(message)
        self.code = code
        self.details = details or {}


class NotificationNotFoundError(NotificationServiceError):
    """Notification event not found."""

    def __init__(self, event_id: UUID):
        super().__init__(
            f"Notification event not found: {event_id}",
            "NOTIFICATION_NOT_FOUND",
            {"event_id": str(event_id)},
        )


class DuplicateNotificationError(NotificationServiceError):
    """Duplicate notification based on idempotency key."""

    def __init__(self, idempotency_key: str, existing_event_id: UUID):
        super().__init__(
            f"Duplicate notification with idempotency key: {idempotency_key}",
            "DUPLICATE_NOTIFICATION",
            {
                "idempotency_key": idempotency_key,
                "existing_event_id": str(existing_event_id),
            },
        )
        self.existing_event_id = existing_event_id


class NotificationPreferenceBlockedError(NotificationServiceError):
    """Notification blocked by user preferences."""

    def __init__(self, reason: str, user_id: Optional[UUID] = None):
        super().__init__(
            f"Notification blocked by preferences: {reason}",
            "PREFERENCE_BLOCKED",
            {"reason": reason, "user_id": str(user_id) if user_id else None},
        )
        self.reason = reason


class NotificationProcessingError(NotificationServiceError):
    """Error during notification processing."""

    def __init__(
        self,
        message: str,
        event_id: UUID,
        should_retry: bool = False,
    ):
        super().__init__(
            message,
            "PROCESSING_ERROR",
            {"event_id": str(event_id), "should_retry": should_retry},
        )
        self.event_id = event_id
        self.should_retry = should_retry


# =============================================================================
# NOTIFICATION SERVICE
# =============================================================================


class NotificationService:
    """Main orchestration service for the notification system.

    This service coordinates the entire notification lifecycle:
    1. Receives notification requests from API or internal events
    2. Validates and deduplicates using idempotency keys
    3. Checks user preferences to determine if notification should be sent
    4. Renders content using templates
    5. Dispatches to appropriate delivery channel
    6. Tracks delivery status and handles retries

    The service is designed for high throughput with:
    - Batch processing support
    - Concurrent delivery for multiple recipients
    - Priority-based queue processing
    - Circuit breaker protection for external services

    Usage:
        service = NotificationService()

        # Send a single notification
        result = await service.send_notification(
            workspace_id=workspace_id,
            request=NotificationCreateRequest(...),
        )

        # Process pending notifications (worker)
        processed = await service.process_pending_notifications(batch_size=100)

        # Retry failed notifications
        retried = await service.retry_failed_notifications(max_items=50)
    """

    def __init__(self):
        """Initialize the notification service."""
        self._metrics = get_metrics()

        # Transactional categories that bypass preferences
        self._transactional_categories = set(settings.TRANSACTIONAL_CATEGORIES)

    # =========================================================================
    # PUBLIC METHODS - Notification Creation
    # =========================================================================

    async def send_notification(
        self,
        workspace_id: UUID,
        request: NotificationCreateRequest,
        source_service: str = "api",
        skip_preference_check: bool = False,
    ) -> NotificationEventResponse:
        """Send a notification to a recipient.

        This is the main entry point for sending notifications. It handles:
        1. Idempotency checking
        2. Preference validation
        3. Event creation
        4. Immediate dispatch (for high priority) or queuing

        Args:
            workspace_id: Workspace ID for multi-tenant isolation
            request: Notification creation request
            source_service: Name of the service triggering the notification
            skip_preference_check: Skip preference check (for transactional)

        Returns:
            NotificationEventResponse with created event details

        Raises:
            DuplicateNotificationError: If idempotency key already exists
            NotificationPreferenceBlockedError: If blocked by preferences
        """
        # Track request in metrics
        self._metrics.notification_request(
            channel=request.channel.value,
            category=request.category.value,
            priority=request.priority.value,
        )

        # Check for idempotency
        if request.idempotency_key:
            existing = await notification_repository.get_notification_event_by_idempotency_key(
                idempotency_key=request.idempotency_key
            )
            if existing:
                logger.info(
                    "Duplicate notification detected",
                    extra={
                        "idempotency_key": request.idempotency_key,
                        "existing_event_id": str(existing.event_id),
                    },
                )
                raise DuplicateNotificationError(
                    idempotency_key=request.idempotency_key,
                    existing_event_id=existing.event_id,
                )

        # Determine if this is a transactional notification
        is_transactional = self._is_transactional(request.category, request.event_type)

        # Check preferences unless skipped or transactional
        if not skip_preference_check and not is_transactional:
            if request.recipient.user_id:
                preference_check = await self._check_preferences(
                    workspace_id=workspace_id,
                    user_id=request.recipient.user_id,
                    category=request.category,
                    channel=request.channel,
                    is_transactional=is_transactional,
                )

                if not preference_check.should_send:
                    logger.info(
                        "Notification blocked by preferences",
                        extra={
                            "user_id": str(request.recipient.user_id),
                            "reason": preference_check.reason,
                            "category": request.category.value,
                            "channel": request.channel.value,
                        },
                    )
                    # Create event with skipped status for audit trail
                    event = await self._create_skipped_event(
                        workspace_id=workspace_id,
                        request=request,
                        source_service=source_service,
                        skip_reason=preference_check.reason or "Blocked by preferences",
                    )
                    return event

        # Create the notification event
        event = await notification_repository.create_notification_event(
            workspace_id=workspace_id,
            event_type=request.event_type,
            category=request.category,
            channel=request.channel,
            recipient_user_id=request.recipient.user_id,
            recipient_email=request.recipient.email,
            recipient_phone=request.recipient.phone,
            priority=request.priority,
            template_id=request.template_id,
            template_code=request.template_code,
            subject=request.subject,
            payload=request.payload,
            scheduled_for=request.scheduled_for,
            idempotency_key=request.idempotency_key,
            correlation_id=request.correlation_id,
            source_service=source_service,
            max_retries=settings.QUEUE_RETRY_MAX_ATTEMPTS,
        )

        logger.info(
            "Notification event created",
            extra={
                "event_id": str(event.event_id),
                "event_type": event.event_type,
                "channel": event.channel.value,
                "priority": event.priority.value,
            },
        )

        # For urgent/high priority and immediate scheduled, process now
        if self._should_process_immediately(event):
            await self._process_notification(event)

        return event

    async def send_batch_notifications(
        self,
        workspace_id: UUID,
        request: NotificationBatchCreateRequest,
        source_service: str = "api",
    ) -> NotificationBatchCreateResponse:
        """Send multiple notifications in a batch.

        Optimized for bulk operations like:
        - Gallery published to multiple clients
        - Marketing campaign to opted-in users
        - Reminder notifications

        Args:
            workspace_id: Workspace ID
            request: Batch notification request
            source_service: Source service name

        Returns:
            NotificationBatchCreateResponse with counts and event IDs
        """
        created_ids: list[UUID] = []
        errors: list[dict[str, Any]] = []

        # Process in parallel with concurrency limit
        semaphore = asyncio.Semaphore(10)

        async def process_one(
            notification: NotificationCreateRequest, index: int
        ) -> None:
            async with semaphore:
                try:
                    # Apply shared correlation ID if provided
                    if request.correlation_id and not notification.correlation_id:
                        notification.correlation_id = request.correlation_id

                    result = await self.send_notification(
                        workspace_id=workspace_id,
                        request=notification,
                        source_service=source_service,
                    )
                    created_ids.append(result.event_id)
                except DuplicateNotificationError as e:
                    # Still count as created (idempotent success)
                    created_ids.append(e.existing_event_id)
                except NotificationPreferenceBlockedError:
                    # Preference blocked - not an error, just skipped
                    pass
                except Exception as e:
                    errors.append({
                        "index": index,
                        "recipient": notification.recipient.model_dump(),
                        "error": str(e),
                        "error_code": getattr(e, "code", "UNKNOWN_ERROR"),
                    })

        # Execute all in parallel
        tasks = [
            process_one(notification, i)
            for i, notification in enumerate(request.notifications)
        ]
        await asyncio.gather(*tasks, return_exceptions=True)

        # Log batch result
        logger.info(
            "Batch notifications processed",
            extra={
                "total": len(request.notifications),
                "created": len(created_ids),
                "errors": len(errors),
            },
        )

        return NotificationBatchCreateResponse(
            created=len(created_ids),
            failed=len(errors),
            event_ids=created_ids,
            errors=errors,
            correlation_id=request.correlation_id,
        )

    async def schedule_notification(
        self,
        workspace_id: UUID,
        request: NotificationCreateRequest,
        scheduled_for: datetime,
        source_service: str = "api",
    ) -> NotificationEventResponse:
        """Schedule a notification for future delivery.

        Args:
            workspace_id: Workspace ID
            request: Notification request
            scheduled_for: When to send the notification
            source_service: Source service name

        Returns:
            NotificationEventResponse with scheduled event
        """
        # Override the scheduled time
        request.scheduled_for = scheduled_for

        return await self.send_notification(
            workspace_id=workspace_id,
            request=request,
            source_service=source_service,
        )

    # =========================================================================
    # PUBLIC METHODS - Notification Processing
    # =========================================================================

    async def process_pending_notifications(
        self,
        batch_size: int = 100,
    ) -> int:
        """Process pending notifications from the queue.

        This method is called by the worker to process notifications.
        It fetches pending events ordered by priority and processes them.

        Args:
            batch_size: Number of events to process in this batch

        Returns:
            Number of notifications processed
        """
        # Get pending events (respects scheduled_for)
        events = await notification_repository.get_pending_events(
            limit=batch_size,
            scheduled_before=datetime.now(timezone.utc),
        )

        if not events:
            return 0

        processed = 0
        for event in events:
            try:
                # Try to claim the event for processing
                claimed = await notification_repository.mark_as_processing(event.event_id)
                if not claimed:
                    # Already being processed by another worker
                    continue

                # Process the notification
                await self._process_notification(event)
                processed += 1

            except Exception as e:
                logger.exception(
                    "Error processing notification",
                    extra={"event_id": str(event.event_id), "error": str(e)},
                )
                self._metrics.error_occurred("notification_processing", "/worker/process")

        logger.info(
            f"Processed {processed} pending notifications",
            extra={"batch_size": batch_size},
        )

        return processed

    async def retry_failed_notifications(
        self,
        max_items: int = 50,
    ) -> int:
        """Retry failed notifications that are eligible for retry.

        Only retries events where retry_count < max_retries.

        Args:
            max_items: Maximum number of failed events to retry

        Returns:
            Number of notifications queued for retry
        """
        # Get failed events eligible for retry
        failed_events = await notification_repository.get_events_for_retry(limit=max_items)

        if not failed_events:
            return 0

        retried = 0
        for event in failed_events:
            try:
                # Increment retry count and reset to pending
                updated = await notification_repository.increment_retry_count(event.event_id)
                if updated:
                    # Track retry in metrics
                    self._metrics.email_retry(
                        template=event.template_code or "unknown",
                        attempt=updated.retry_count,
                    )
                    retried += 1
                    logger.info(
                        f"Notification queued for retry",
                        extra={
                            "event_id": str(event.event_id),
                            "retry_count": updated.retry_count,
                        },
                    )
            except Exception as e:
                logger.exception(
                    "Error queueing notification for retry",
                    extra={"event_id": str(event.event_id), "error": str(e)},
                )

        return retried

    async def process_single_notification(
        self,
        event_id: UUID,
        workspace_id: UUID,
    ) -> NotificationResult:
        """Process a single notification by ID.

        Used for manual retries or immediate processing.

        Args:
            event_id: Notification event ID
            workspace_id: Workspace ID for tenant verification

        Returns:
            NotificationResult with processing outcome

        Raises:
            NotificationNotFoundError: If event not found
        """
        event = await notification_repository.get_notification_event(
            workspace_id=workspace_id,
            event_id=event_id,
        )

        if not event:
            raise NotificationNotFoundError(event_id)

        return await self._process_notification(event)

    # =========================================================================
    # PUBLIC METHODS - Notification Management
    # =========================================================================

    async def cancel_notification(
        self,
        workspace_id: UUID,
        event_id: UUID,
        reason: Optional[str] = None,
    ) -> Optional[NotificationEventResponse]:
        """Cancel a pending notification.

        Only pending notifications can be cancelled.

        Args:
            workspace_id: Workspace ID
            event_id: Event ID to cancel
            reason: Reason for cancellation

        Returns:
            Cancelled event or None if not found/not cancellable
        """
        cancelled = await notification_repository.cancel_event(
            workspace_id=workspace_id,
            event_id=event_id,
            reason=reason,
        )

        if cancelled:
            logger.info(
                "Notification cancelled",
                extra={
                    "event_id": str(event_id),
                    "reason": reason,
                },
            )
            self._metrics.notification_cancelled(
                channel=cancelled.channel.value,
                category=cancelled.category.value,
            )

        return cancelled

    async def get_notification(
        self,
        workspace_id: UUID,
        event_id: UUID,
    ) -> Optional[NotificationEventResponse]:
        """Get a notification event by ID.

        Args:
            workspace_id: Workspace ID for tenant isolation
            event_id: Event ID to retrieve

        Returns:
            NotificationEventResponse or None if not found
        """
        return await notification_repository.get_notification_event(
            workspace_id=workspace_id,
            event_id=event_id,
        )

    async def get_notification_delivery_logs(
        self,
        workspace_id: UUID,
        event_id: UUID,
    ) -> list[DeliveryLogResponse]:
        """Get delivery logs for a notification event.

        Args:
            workspace_id: Workspace ID
            event_id: Event ID

        Returns:
            List of delivery log entries
        """
        return await notification_repository.get_delivery_logs_for_event(
            workspace_id=workspace_id,
            event_id=event_id,
        )

    # =========================================================================
    # PUBLIC METHODS - Bulk Operations
    # =========================================================================

    async def send_to_users(
        self,
        workspace_id: UUID,
        user_ids: list[UUID],
        event_type: str,
        category: NotificationCategory,
        channel: NotificationChannel,
        template_code: str,
        payload: dict[str, Any],
        priority: NotificationPriority = NotificationPriority.NORMAL,
        subject: Optional[str] = None,
        correlation_id: Optional[UUID] = None,
        source_service: str = "internal",
    ) -> NotificationBatchCreateResponse:
        """Send notifications to multiple users.

        Convenience method for internal services to send to multiple users.
        Handles preference checking and template rendering efficiently.

        Args:
            workspace_id: Workspace ID
            user_ids: List of user IDs to notify
            event_type: Event type
            category: Notification category
            channel: Delivery channel
            template_code: Template code for content
            payload: Template variables
            priority: Processing priority
            subject: Optional subject line
            correlation_id: Optional correlation ID
            source_service: Source service name

        Returns:
            NotificationBatchCreateResponse with results
        """
        from src.schemas.notification import NotificationRecipient

        # Build notification requests for each user
        notifications = [
            NotificationCreateRequest(
                recipient=NotificationRecipient(user_id=user_id),
                event_type=event_type,
                category=category,
                channel=channel,
                priority=priority,
                template_code=template_code,
                subject=subject,
                payload=payload,
                correlation_id=correlation_id,
            )
            for user_id in user_ids
        ]

        return await self.send_batch_notifications(
            workspace_id=workspace_id,
            request=NotificationBatchCreateRequest(
                notifications=notifications,
                correlation_id=correlation_id,
            ),
            source_service=source_service,
        )

    async def send_event_notification(
        self,
        workspace_id: UUID,
        event_type: str,
        recipient_user_id: Optional[UUID] = None,
        recipient_email: Optional[str] = None,
        payload: dict[str, Any] | None = None,
        source_service: str = "internal",
    ) -> NotificationEventResponse:
        """Send a notification based on an event type.

        This method provides a simplified interface for internal services
        to trigger notifications by event type. It automatically:
        - Looks up the template for the event type
        - Determines the appropriate category and channel
        - Checks user preferences
        - Dispatches the notification

        Args:
            workspace_id: Workspace ID
            event_type: Event type (e.g., "gallery.published", "billing.payment_failed")
            recipient_user_id: User ID (if registered user)
            recipient_email: Email address
            payload: Template variables
            source_service: Source service name

        Returns:
            NotificationEventResponse
        """
        from src.schemas.notification import NotificationRecipient

        # Map event types to categories
        category = self._get_category_for_event(event_type)
        channel = self._get_default_channel_for_category(category)

        # Use event type as template code (convention)
        template_code = event_type.replace(".", "_")

        return await self.send_notification(
            workspace_id=workspace_id,
            request=NotificationCreateRequest(
                recipient=NotificationRecipient(
                    user_id=recipient_user_id,
                    email=recipient_email,
                ),
                event_type=event_type,
                category=category,
                channel=channel,
                template_code=template_code,
                payload=payload or {},
            ),
            source_service=source_service,
        )

    # =========================================================================
    # PRIVATE METHODS - Processing Logic
    # =========================================================================

    async def _process_notification(
        self,
        event: NotificationEventResponse,
    ) -> NotificationResult:
        """Process a single notification event.

        This method:
        1. Renders the template
        2. Dispatches to the appropriate delivery service
        3. Updates event status based on result

        Args:
            event: Notification event to process

        Returns:
            NotificationResult with processing outcome
        """
        try:
            # Render the template
            rendered = await self._render_notification(event)

            if not rendered:
                # Template rendering failed
                await self._mark_failed(
                    event_id=event.event_id,
                    error_message="Template rendering failed",
                )
                return NotificationResult(
                    event_id=event.event_id,
                    success=False,
                    status=NotificationEventStatus.FAILED,
                    error_message="Template rendering failed",
                    error_code="TEMPLATE_RENDER_ERROR",
                    should_retry=False,
                )

            # Build the task
            task = NotificationTask(
                event_id=event.event_id,
                workspace_id=event.workspace_id,
                channel=event.channel,
                priority=event.priority,
                attempt_number=event.retry_count + 1,
                recipient_email=event.recipient_email,
                recipient_phone=event.recipient_phone,
                recipient_user_id=event.recipient_user_id,
                template_id=event.template_id,
                template_code=event.template_code,
                subject=event.subject,
                payload=event.payload,
                rendered_subject=rendered.get("subject"),
                rendered_body_html=rendered.get("html"),
                rendered_body_text=rendered.get("text"),
                correlation_id=event.correlation_id,
                idempotency_key=event.idempotency_key,
            )

            # Dispatch based on channel
            result = await self._dispatch_notification(task)

            # Update event status
            if result.success:
                await notification_repository.update_event_status(
                    event_id=event.event_id,
                    status=NotificationEventStatus.SENT,
                    processed_at=datetime.now(timezone.utc),
                    delivered_at=result.delivered_at,
                )
                self._metrics.notification_sent(
                    channel=event.channel.value,
                    category=event.category.value,
                    status="success",
                )
            else:
                if result.should_retry and event.retry_count < event.max_retries:
                    await notification_repository.update_event_status(
                        event_id=event.event_id,
                        status=NotificationEventStatus.FAILED,
                        error_message=result.error_message,
                    )
                else:
                    await self._mark_failed(
                        event_id=event.event_id,
                        error_message=result.error_message or "Max retries exceeded",
                    )
                    self._metrics.dead_letter("max_retries")

                self._metrics.notification_sent(
                    channel=event.channel.value,
                    category=event.category.value,
                    status="failed",
                )

            return result

        except Exception as e:
            logger.exception(
                "Error processing notification",
                extra={"event_id": str(event.event_id), "error": str(e)},
            )

            await self._mark_failed(
                event_id=event.event_id,
                error_message=str(e),
            )

            return NotificationResult(
                event_id=event.event_id,
                success=False,
                status=NotificationEventStatus.FAILED,
                error_message=str(e),
                error_code="PROCESSING_ERROR",
                should_retry=True,
            )

    async def _render_notification(
        self,
        event: NotificationEventResponse,
    ) -> Optional[dict[str, Any]]:
        """Render notification content using templates.

        Args:
            event: Notification event with template info

        Returns:
            Dict with rendered subject, html, text or None if failed
        """
        try:
            if event.template_id or event.template_code:
                rendered = await template_service.render_template(
                    workspace_id=event.workspace_id,
                    template_id=event.template_id,
                    template_code=event.template_code,
                    channel=event.channel,
                    variables=event.payload,
                )

                if event.channel == NotificationChannel.EMAIL and rendered.email:
                    return {
                        "subject": rendered.email.subject,
                        "html": rendered.email.html,
                        "text": rendered.email.text,
                    }
                elif event.channel == NotificationChannel.SMS and rendered.sms:
                    return {
                        "text": rendered.sms.content,
                    }
                elif event.channel == NotificationChannel.PUSH and rendered.push:
                    return {
                        "title": rendered.push.title,
                        "text": rendered.push.body,
                    }
                elif event.channel == NotificationChannel.IN_APP and rendered.in_app:
                    return {
                        "title": rendered.in_app.title,
                        "text": rendered.in_app.body,
                    }

            # No template - use subject from request
            return {
                "subject": event.subject,
                "html": None,
                "text": event.subject,
            }

        except Exception as e:
            logger.error(
                f"Template rendering failed: {e}",
                extra={
                    "event_id": str(event.event_id),
                    "template_code": event.template_code,
                },
            )
            return None

    async def _dispatch_notification(
        self,
        task: NotificationTask,
    ) -> NotificationResult:
        """Dispatch notification to appropriate delivery service.

        Args:
            task: Notification task with rendered content

        Returns:
            NotificationResult with delivery status
        """
        if task.channel == NotificationChannel.EMAIL:
            return await self._dispatch_email(task)
        elif task.channel == NotificationChannel.SMS:
            return await self._dispatch_sms(task)
        elif task.channel == NotificationChannel.PUSH:
            return await self._dispatch_push(task)
        elif task.channel == NotificationChannel.IN_APP:
            return await self._dispatch_in_app(task)
        else:
            return NotificationResult(
                event_id=task.event_id,
                success=False,
                status=NotificationEventStatus.FAILED,
                error_message=f"Unsupported channel: {task.channel}",
                error_code="UNSUPPORTED_CHANNEL",
                should_retry=False,
            )

    async def _dispatch_email(
        self,
        task: NotificationTask,
    ) -> NotificationResult:
        """Dispatch email notification via SendGrid.

        Args:
            task: Notification task with email content

        Returns:
            NotificationResult
        """
        if not task.recipient_email:
            return NotificationResult(
                event_id=task.event_id,
                success=False,
                status=NotificationEventStatus.FAILED,
                error_message="No recipient email address",
                error_code="NO_EMAIL",
                should_retry=False,
            )

        try:
            result = await email_delivery_service.send_notification_task(task)
            return result
        except EmailDeliveryError as e:
            return NotificationResult(
                event_id=task.event_id,
                success=False,
                status=NotificationEventStatus.FAILED,
                provider=NotificationProvider.SENDGRID,
                error_message=str(e),
                error_code=e.code,
                should_retry=e.should_retry,
            )

    async def _dispatch_sms(
        self,
        task: NotificationTask,
    ) -> NotificationResult:
        """Dispatch SMS notification via Twilio.

        Note: This is a placeholder in Phase 1.

        Args:
            task: Notification task with SMS content

        Returns:
            NotificationResult
        """
        if not task.recipient_phone:
            return NotificationResult(
                event_id=task.event_id,
                success=False,
                status=NotificationEventStatus.FAILED,
                error_message="No recipient phone number",
                error_code="NO_PHONE",
                should_retry=False,
            )

        # Use SMS delivery service (placeholder in Phase 1)
        return await sms_delivery_service.send_notification_task(task)

    async def _dispatch_push(
        self,
        task: NotificationTask,
    ) -> NotificationResult:
        """Dispatch push notification via Firebase.

        Placeholder for future implementation.

        Args:
            task: Notification task with push content

        Returns:
            NotificationResult
        """
        # TODO: Implement Firebase push notification
        return NotificationResult(
            event_id=task.event_id,
            success=False,
            status=NotificationEventStatus.FAILED,
            error_message="Push notifications not implemented",
            error_code="PUSH_NOT_IMPLEMENTED",
            should_retry=False,
        )

    async def _dispatch_in_app(
        self,
        task: NotificationTask,
    ) -> NotificationResult:
        """Dispatch in-app notification.

        Stores the notification for retrieval via polling/WebSocket.

        Args:
            task: Notification task with in-app content

        Returns:
            NotificationResult
        """
        if not task.recipient_user_id:
            return NotificationResult(
                event_id=task.event_id,
                success=False,
                status=NotificationEventStatus.FAILED,
                error_message="No recipient user ID for in-app notification",
                error_code="NO_USER_ID",
                should_retry=False,
            )

        try:
            import json

            # Store in-app notification in Redis for real-time retrieval
            notification_key = f"in_app:{task.workspace_id}:{task.recipient_user_id}"
            notification_data = json.dumps({
                "event_id": str(task.event_id),
                "title": task.rendered_subject,
                "body": task.rendered_body_text,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "read": False,
            })

            # Add to user's notification list (capped at 100)
            await redis_client.lpush(notification_key, notification_data)
            await redis_client.ltrim(notification_key, 0, 99)

            # Set TTL for cleanup (30 days)
            await redis_client.expire(notification_key, 30 * 24 * 60 * 60)

            # Create delivery log
            await notification_repository.create_delivery_log(
                workspace_id=task.workspace_id,
                event_id=task.event_id,
                channel=NotificationChannel.IN_APP,
                provider=NotificationProvider.INTERNAL,
                recipient_user_id=task.recipient_user_id,
                attempt_number=task.attempt_number,
            )

            return NotificationResult(
                event_id=task.event_id,
                success=True,
                status=NotificationEventStatus.DELIVERED,
                provider=NotificationProvider.INTERNAL,
                delivered_at=datetime.now(timezone.utc),
            )

        except Exception as e:
            logger.exception(
                "Error storing in-app notification",
                extra={"event_id": str(task.event_id), "error": str(e)},
            )
            return NotificationResult(
                event_id=task.event_id,
                success=False,
                status=NotificationEventStatus.FAILED,
                error_message=str(e),
                error_code="IN_APP_ERROR",
                should_retry=True,
            )

    # =========================================================================
    # PRIVATE METHODS - Preference Checking
    # =========================================================================

    async def _check_preferences(
        self,
        workspace_id: UUID,
        user_id: UUID,
        category: NotificationCategory,
        channel: NotificationChannel,
        is_transactional: bool = False,
    ) -> "PreferenceCheckResult":
        """Check user preferences for a notification.

        Args:
            workspace_id: Workspace ID
            user_id: User ID
            category: Notification category
            channel: Notification channel
            is_transactional: Whether this is a transactional notification

        Returns:
            PreferenceCheckResult indicating if notification should be sent
        """
        from src.schemas.preference import PreferenceCheckResult

        try:
            result = await preference_repository.check_notification_preference(
                request=PreferenceCheckRequest(
                    workspace_id=workspace_id,
                    user_id=user_id,
                    category=category,
                    channel=channel,
                    is_transactional=is_transactional,
                )
            )
            return result
        except Exception as e:
            logger.warning(
                f"Error checking preferences, defaulting to allow: {e}",
                extra={"user_id": str(user_id)},
            )
            # On error, default to allowing the notification
            return PreferenceCheckResult(should_send=True)

    def _is_transactional(
        self,
        category: NotificationCategory,
        event_type: str,
    ) -> bool:
        """Determine if a notification is transactional.

        Transactional notifications bypass user preferences.

        Args:
            category: Notification category
            event_type: Event type

        Returns:
            True if transactional
        """
        # Check if category is in transactional list
        if category.value in self._transactional_categories:
            return True

        # Check event type prefixes
        transactional_prefixes = [
            "password_reset",
            "verification",
            "security_alert",
            "login",
            "account_",
        ]
        return any(event_type.startswith(prefix) for prefix in transactional_prefixes)

    # =========================================================================
    # PRIVATE METHODS - Helpers
    # =========================================================================

    def _should_process_immediately(
        self,
        event: NotificationEventResponse,
    ) -> bool:
        """Determine if notification should be processed immediately.

        Args:
            event: Notification event

        Returns:
            True if should process immediately
        """
        # Process urgent/high priority immediately
        if event.priority in (NotificationPriority.URGENT, NotificationPriority.HIGH):
            return True

        # Process if not scheduled or scheduled for now
        if not event.scheduled_for or event.scheduled_for <= datetime.now(timezone.utc):
            return True

        return False

    async def _mark_failed(
        self,
        event_id: UUID,
        error_message: str,
    ) -> None:
        """Mark a notification event as permanently failed.

        Args:
            event_id: Event ID
            error_message: Error message
        """
        await notification_repository.update_event_status(
            event_id=event_id,
            status=NotificationEventStatus.FAILED,
            error_message=error_message,
            processed_at=datetime.now(timezone.utc),
        )

    async def _create_skipped_event(
        self,
        workspace_id: UUID,
        request: NotificationCreateRequest,
        source_service: str,
        skip_reason: str,
    ) -> NotificationEventResponse:
        """Create a notification event with skipped status.

        Used for audit trail when notifications are blocked by preferences.

        Args:
            workspace_id: Workspace ID
            request: Original request
            source_service: Source service
            skip_reason: Reason for skipping

        Returns:
            NotificationEventResponse with skipped status
        """
        event = await notification_repository.create_notification_event(
            workspace_id=workspace_id,
            event_type=request.event_type,
            category=request.category,
            channel=request.channel,
            recipient_user_id=request.recipient.user_id,
            recipient_email=request.recipient.email,
            recipient_phone=request.recipient.phone,
            priority=request.priority,
            template_id=request.template_id,
            template_code=request.template_code,
            subject=request.subject,
            payload=request.payload,
            idempotency_key=request.idempotency_key,
            correlation_id=request.correlation_id,
            source_service=source_service,
        )

        # Update to skipped status
        await notification_repository.update_event_status(
            event_id=event.event_id,
            status=NotificationEventStatus.SKIPPED,
            error_message=skip_reason,
            processed_at=datetime.now(timezone.utc),
        )

        # Refresh and return
        return await notification_repository.get_notification_event(
            workspace_id=workspace_id,
            event_id=event.event_id,
        ) or event

    def _get_category_for_event(self, event_type: str) -> NotificationCategory:
        """Map event type to notification category.

        Args:
            event_type: Event type string

        Returns:
            NotificationCategory
        """
        event_category_map = {
            "gallery.": NotificationCategory.GALLERY_ACTIVITY,
            "album.": NotificationCategory.GALLERY_ACTIVITY,
            "photo.": NotificationCategory.GALLERY_ACTIVITY,
            "client.": NotificationCategory.CLIENT_INTERACTIONS,
            "comment.": NotificationCategory.CLIENT_INTERACTIONS,
            "download.": NotificationCategory.CLIENT_INTERACTIONS,
            "billing.": NotificationCategory.BILLING,
            "payment.": NotificationCategory.BILLING,
            "subscription.": NotificationCategory.BILLING,
            "invoice.": NotificationCategory.BILLING,
            "system.": NotificationCategory.SYSTEM_ALERTS,
            "security.": NotificationCategory.SYSTEM_ALERTS,
            "account.": NotificationCategory.SYSTEM_ALERTS,
            "marketing.": NotificationCategory.MARKETING,
            "campaign.": NotificationCategory.MARKETING,
            "newsletter.": NotificationCategory.MARKETING,
            "invitation.": NotificationCategory.INVITATION,
            "invite.": NotificationCategory.INVITATION,
        }

        for prefix, category in event_category_map.items():
            if event_type.startswith(prefix):
                return category

        # Default to system alerts
        return NotificationCategory.SYSTEM_ALERTS

    def _get_default_channel_for_category(
        self,
        category: NotificationCategory,
    ) -> NotificationChannel:
        """Get default channel for a category.

        Args:
            category: Notification category

        Returns:
            Default notification channel
        """
        # Most categories default to email
        channel_map = {
            NotificationCategory.GALLERY_ACTIVITY: NotificationChannel.EMAIL,
            NotificationCategory.CLIENT_INTERACTIONS: NotificationChannel.EMAIL,
            NotificationCategory.SYSTEM_ALERTS: NotificationChannel.EMAIL,
            NotificationCategory.BILLING: NotificationChannel.EMAIL,
            NotificationCategory.MARKETING: NotificationChannel.EMAIL,
            NotificationCategory.INVITATION: NotificationChannel.EMAIL,
        }
        return channel_map.get(category, NotificationChannel.EMAIL)

    # =========================================================================
    # HEALTH & DIAGNOSTICS
    # =========================================================================

    async def health_check(self) -> dict[str, Any]:
        """Check notification service health.

        Returns:
            Dict with health status
        """
        email_health = await email_delivery_service.health_check()
        sms_health = await sms_delivery_service.health_check()

        return {
            "status": "healthy",
            "email_service": email_health,
            "sms_service": sms_health,
            "template_service": {
                "status": "healthy",
            },
        }


# =============================================================================
# SINGLETON INSTANCE
# =============================================================================


_notification_service: NotificationService | None = None


def get_notification_service() -> NotificationService:
    """Get the notification service singleton."""
    global _notification_service
    if _notification_service is None:
        _notification_service = NotificationService()
    return _notification_service


# Convenience alias
notification_service = get_notification_service()
