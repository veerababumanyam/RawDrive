"""Email delivery service using SendGrid for the Notifications & Communication Microservice.

This module provides the EmailDeliveryService class that handles:
- Email sending via SendGrid API
- Template rendering integration
- Delivery tracking and logging
- Retry logic with exponential backoff
- Rate limiting and circuit breaker patterns
- Webhook event processing from SendGrid

Features:
- Async HTTP client with connection pooling
- Comprehensive error handling with categorized exceptions
- Delivery status caching in Redis
- Prometheus metrics integration
- PII-safe logging
- Suppression list management for bounced emails

Feature: Notifications & Communication Microservice
Task: T022 - Create email_delivery_service.py using SendGrid
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Optional
from uuid import UUID

import httpx

from src.cache.redis_client import (
    build_delivery_cache_key,
    build_rate_limit_key,
    redis_client,
)
from src.config import settings
from src.observability.metrics import get_metrics
from src.repositories.notification_repository import notification_repository
from src.schemas.notification import (
    NotificationChannel,
    NotificationDeliveryStatus,
    NotificationEventStatus,
    NotificationProvider,
    NotificationTask,
    NotificationResult,
)
from src.schemas.template import RenderedEmail

logger = logging.getLogger(__name__)


# =============================================================================
# EXCEPTIONS
# =============================================================================


class EmailDeliveryError(Exception):
    """Base exception for email delivery errors."""

    def __init__(
        self,
        message: str,
        code: str,
        status: int = 500,
        should_retry: bool = False,
        retry_after: Optional[int] = None,
    ):
        super().__init__(message)
        self.code = code
        self.status = status
        self.should_retry = should_retry
        self.retry_after = retry_after


class SendGridNotConfiguredError(EmailDeliveryError):
    """SendGrid API key not configured."""

    def __init__(self):
        super().__init__(
            "SendGrid is not configured. Set SENDGRID_API_KEY environment variable.",
            "SENDGRID_NOT_CONFIGURED",
            503,
            should_retry=False,
        )


class SendGridAPIError(EmailDeliveryError):
    """SendGrid API returned an error."""

    def __init__(
        self,
        message: str,
        status_code: int,
        errors: list[dict] | None = None,
    ):
        # Determine if we should retry based on status code
        should_retry = status_code in (408, 429, 500, 502, 503, 504)
        super().__init__(
            f"SendGrid API error: {message}",
            "SENDGRID_API_ERROR",
            status_code,
            should_retry=should_retry,
        )
        self.errors = errors or []


class SendGridRateLimitError(EmailDeliveryError):
    """SendGrid rate limit exceeded."""

    def __init__(self, retry_after: int | None = None):
        super().__init__(
            f"SendGrid rate limit exceeded. Retry after {retry_after or 60} seconds.",
            "SENDGRID_RATE_LIMIT",
            429,
            should_retry=True,
            retry_after=retry_after or 60,
        )


class InvalidRecipientError(EmailDeliveryError):
    """Invalid email recipient."""

    def __init__(self, email: str, reason: str = "Invalid email address"):
        # Mask email for logging
        masked = self._mask_email(email)
        super().__init__(
            f"Invalid recipient: {masked}. {reason}",
            "INVALID_RECIPIENT",
            400,
            should_retry=False,
        )
        self.email = email

    @staticmethod
    def _mask_email(email: str) -> str:
        """Mask email address for safe logging."""
        if "@" not in email:
            return "***"
        local, domain = email.rsplit("@", 1)
        if len(local) > 2:
            masked_local = local[0] + "***" + local[-1]
        else:
            masked_local = "***"
        return f"{masked_local}@{domain}"


class RecipientSuppressedError(EmailDeliveryError):
    """Recipient is on suppression list (bounced, complained, unsubscribed)."""

    def __init__(self, email: str, reason: str = "hard_bounce"):
        super().__init__(
            f"Recipient suppressed due to {reason}",
            "RECIPIENT_SUPPRESSED",
            400,
            should_retry=False,
        )
        self.email = email
        self.suppression_reason = reason


# =============================================================================
# DATA CLASSES
# =============================================================================


class EmailStatus(str, Enum):
    """Email delivery status tracking."""

    PENDING = "pending"
    QUEUED = "queued"
    SENT = "sent"
    DELIVERED = "delivered"
    OPENED = "opened"
    CLICKED = "clicked"
    BOUNCED = "bounced"
    DROPPED = "dropped"
    DEFERRED = "deferred"
    SPAM_REPORT = "spam_report"
    UNSUBSCRIBE = "unsubscribe"
    FAILED = "failed"


@dataclass
class EmailRecipient:
    """Email recipient with optional personalization."""

    email: str
    name: str | None = None
    substitutions: dict[str, Any] | None = None


@dataclass
class EmailAttachment:
    """Email attachment data."""

    content: str  # Base64 encoded content
    filename: str
    type: str  # MIME type
    disposition: str = "attachment"  # 'attachment' or 'inline'
    content_id: str | None = None  # For inline attachments


@dataclass
class EmailMessage:
    """Email message configuration for sending."""

    to: list[EmailRecipient]
    subject: str
    html_content: str | None = None
    text_content: str | None = None
    from_email: str | None = None
    from_name: str | None = None
    reply_to: str | None = None
    cc: list[EmailRecipient] | None = None
    bcc: list[EmailRecipient] | None = None
    attachments: list[EmailAttachment] | None = None
    categories: list[str] | None = None
    custom_args: dict[str, str] | None = None
    send_at: int | None = None  # Unix timestamp for scheduled send
    tracking_enabled: bool = True

    # Internal tracking
    workspace_id: UUID | None = None
    event_id: UUID | None = None
    template_code: str | None = None


@dataclass
class EmailResult:
    """Result of sending an email."""

    success: bool
    message_id: str | None = None
    status: EmailStatus = EmailStatus.PENDING
    provider: NotificationProvider = NotificationProvider.SENDGRID
    recipients: list[str] = field(default_factory=list)
    sent_at: datetime | None = None
    error_message: str | None = None
    error_code: str | None = None
    should_retry: bool = False
    retry_after: int | None = None


@dataclass
class WebhookEvent:
    """Parsed SendGrid webhook event."""

    event_id: str
    message_id: str
    email: str
    event_type: str
    timestamp: datetime
    sg_event_id: str | None = None
    sg_message_id: str | None = None
    reason: str | None = None
    bounce_type: str | None = None
    user_agent: str | None = None
    ip: str | None = None
    url: str | None = None


# =============================================================================
# HTTP CLIENT MANAGEMENT
# =============================================================================


_http_client: httpx.AsyncClient | None = None


def _get_http_client() -> httpx.AsyncClient:
    """Get or create the shared HTTP client with connection pooling."""
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(30.0, connect=10.0),
            limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
            http2=True,
        )
    return _http_client


async def close_http_client() -> None:
    """Close the HTTP client. Call on application shutdown."""
    global _http_client
    if _http_client is not None:
        await _http_client.aclose()
        _http_client = None


# =============================================================================
# CIRCUIT BREAKER FOR SENDGRID
# =============================================================================


class SendGridCircuitBreaker:
    """Circuit breaker for SendGrid API calls."""

    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: int = 30,
    ):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.failure_count = 0
        self.last_failure_time: Optional[datetime] = None
        self.state = "closed"  # closed, open, half_open

    def record_success(self) -> None:
        """Record successful API call."""
        self.failure_count = 0
        self.state = "closed"

    def record_failure(self) -> None:
        """Record failed API call."""
        self.failure_count += 1
        self.last_failure_time = datetime.now(timezone.utc)

        if self.failure_count >= self.failure_threshold:
            self.state = "open"
            logger.warning(
                "SendGrid circuit breaker OPEN",
                extra={"failures": self.failure_count},
            )

    def can_execute(self) -> bool:
        """Check if API call can proceed."""
        if self.state == "closed":
            return True

        if self.state == "open" and self.last_failure_time:
            elapsed = (datetime.now(timezone.utc) - self.last_failure_time).seconds
            if elapsed >= self.recovery_timeout:
                self.state = "half_open"
                logger.info("SendGrid circuit breaker HALF_OPEN - testing recovery")
                return True
            return False

        # half_open - allow test request
        return True

    def get_state_code(self) -> int:
        """Get numeric state code for metrics (0=closed, 1=half_open, 2=open)."""
        return {"closed": 0, "half_open": 1, "open": 2}.get(self.state, 0)


# =============================================================================
# EMAIL DELIVERY SERVICE
# =============================================================================


class EmailDeliveryService:
    """Service for sending emails via SendGrid with full delivery tracking.

    Provides:
    - Reliable email delivery with retry logic
    - Template integration for consistent branding
    - Delivery tracking and status updates
    - Rate limiting and circuit breaker patterns
    - Webhook processing for delivery events

    Usage:
        service = EmailDeliveryService()

        # Send a simple email
        result = await service.send_email(
            to_email="user@example.com",
            subject="Welcome!",
            html_content="<h1>Welcome to RawDrive</h1>",
            workspace_id=workspace_id,
        )

        # Send from rendered template
        result = await service.send_from_rendered(
            rendered=rendered_email,
            to_email="user@example.com",
            workspace_id=workspace_id,
            event_id=event_id,
        )
    """

    API_BASE_URL = "https://api.sendgrid.com/v3"

    def __init__(self):
        """Initialize the email delivery service."""
        self._circuit_breaker = SendGridCircuitBreaker(
            failure_threshold=settings.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
            recovery_timeout=settings.CIRCUIT_BREAKER_RECOVERY_TIMEOUT,
        )
        self._metrics = get_metrics()

        # Rate limiting: track requests per minute
        self._rate_limit_key = "sendgrid:rate_limit"
        self._rate_limit_window = 60  # seconds
        self._rate_limit_max = 500  # requests per minute (SendGrid's limit varies by plan)

    # =========================================================================
    # CONFIGURATION & VALIDATION
    # =========================================================================

    @property
    def is_configured(self) -> bool:
        """Check if SendGrid is configured."""
        return bool(settings.SENDGRID_API_KEY)

    def _get_api_key(self) -> str:
        """Get the SendGrid API key or raise error if not configured."""
        if not settings.SENDGRID_API_KEY:
            raise SendGridNotConfiguredError()
        return settings.SENDGRID_API_KEY

    def _get_headers(self) -> dict[str, str]:
        """Get HTTP headers for SendGrid API requests."""
        return {
            "Authorization": f"Bearer {self._get_api_key()}",
            "Content-Type": "application/json",
        }

    def _validate_email(self, email: str) -> bool:
        """Basic email validation."""
        if not email or "@" not in email:
            return False
        local, domain = email.rsplit("@", 1)
        return bool(local and domain and "." in domain)

    async def _check_suppression(self, email: str) -> str | None:
        """Check if email is on suppression list. Returns reason if suppressed."""
        # Check cached suppression list
        suppression_key = f"suppression:{hashlib.md5(email.lower().encode()).hexdigest()}"
        cached = await redis_client.get(suppression_key)
        if cached:
            return cached

        # Could also check SendGrid's suppression API here if needed
        return None

    async def _add_to_suppression(self, email: str, reason: str) -> None:
        """Add email to local suppression list."""
        suppression_key = f"suppression:{hashlib.md5(email.lower().encode()).hexdigest()}"
        # Cache suppression for 30 days
        await redis_client.set(suppression_key, reason, ttl=30 * 24 * 60 * 60)
        logger.info(
            "Added email to suppression list",
            extra={"reason": reason},  # Don't log email
        )

    # =========================================================================
    # RATE LIMITING
    # =========================================================================

    async def _check_rate_limit(self) -> bool:
        """Check if we're within rate limits. Returns True if OK to proceed."""
        current = await redis_client.incr(
            self._rate_limit_key,
            ttl=self._rate_limit_window,
        )
        if current > self._rate_limit_max:
            self._metrics.rate_limit_hit("/email/send", "sendgrid")
            return False
        return True

    async def _wait_for_rate_limit(self, seconds: int) -> None:
        """Wait before retrying after rate limit."""
        logger.info(f"Rate limited, waiting {seconds} seconds")
        await asyncio.sleep(seconds)

    # =========================================================================
    # API COMMUNICATION
    # =========================================================================

    async def _make_request(
        self,
        method: str,
        endpoint: str,
        json_data: dict[str, Any] | None = None,
    ) -> httpx.Response:
        """Make an authenticated request to SendGrid API."""
        if not self._circuit_breaker.can_execute():
            raise SendGridAPIError("Circuit breaker open", 503)

        # Update circuit breaker state in metrics
        self._metrics.set_circuit_breaker_state(
            "sendgrid",
            self._circuit_breaker.get_state_code(),
        )

        # Check rate limit
        if not await self._check_rate_limit():
            raise SendGridRateLimitError(retry_after=60)

        client = _get_http_client()
        url = f"{self.API_BASE_URL}{endpoint}"

        try:
            response = await client.request(
                method=method,
                url=url,
                headers=self._get_headers(),
                json=json_data,
            )

            # Handle rate limiting from SendGrid
            if response.status_code == 429:
                self._circuit_breaker.record_failure()
                retry_after = response.headers.get("Retry-After")
                raise SendGridRateLimitError(
                    retry_after=int(retry_after) if retry_after else None
                )

            # Handle other errors
            if response.status_code >= 400:
                self._circuit_breaker.record_failure()
                error_data = {}
                try:
                    error_data = response.json()
                except Exception:
                    pass

                errors = error_data.get("errors", [])
                message = errors[0].get("message", "Unknown error") if errors else "Unknown error"
                raise SendGridAPIError(message, response.status_code, errors)

            self._circuit_breaker.record_success()
            return response

        except httpx.TimeoutException as e:
            self._circuit_breaker.record_failure()
            logger.error(
                "SendGrid request timed out",
                extra={"endpoint": endpoint, "error": str(e)},
            )
            raise SendGridAPIError("Request timed out", 504) from e

        except httpx.RequestError as e:
            self._circuit_breaker.record_failure()
            logger.error(
                "SendGrid request failed",
                extra={"endpoint": endpoint, "error": str(e)},
            )
            raise SendGridAPIError(f"Request failed: {str(e)}", 502) from e

    # =========================================================================
    # EMAIL SENDING - MAIN METHODS
    # =========================================================================

    async def send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str | None = None,
        text_content: str | None = None,
        to_name: str | None = None,
        from_email: str | None = None,
        from_name: str | None = None,
        reply_to: str | None = None,
        categories: list[str] | None = None,
        custom_args: dict[str, str] | None = None,
        workspace_id: UUID | None = None,
        event_id: UUID | None = None,
        template_code: str | None = None,
        attachments: list[EmailAttachment] | None = None,
        tracking_enabled: bool = True,
    ) -> EmailResult:
        """Send a single email via SendGrid.

        Args:
            to_email: Recipient email address
            subject: Email subject line
            html_content: HTML email body
            text_content: Plain text email body
            to_name: Recipient display name
            from_email: Sender email (defaults to config)
            from_name: Sender display name (defaults to config)
            reply_to: Reply-to email address
            categories: SendGrid categories for tracking
            custom_args: Custom arguments for webhooks
            workspace_id: Workspace ID for multi-tenant tracking
            event_id: Notification event ID for tracking
            template_code: Template code used (for metrics)
            attachments: List of email attachments
            tracking_enabled: Enable open/click tracking

        Returns:
            EmailResult with success status and message ID

        Raises:
            SendGridNotConfiguredError: If SendGrid API key not set
            InvalidRecipientError: If recipient email is invalid
            RecipientSuppressedError: If recipient is on suppression list
            SendGridAPIError: If SendGrid returns an error
            SendGridRateLimitError: If rate limit exceeded
        """
        start_time = time.monotonic()

        # Validate recipient
        if not self._validate_email(to_email):
            raise InvalidRecipientError(to_email, "Invalid email format")

        # Check suppression list
        suppression_reason = await self._check_suppression(to_email)
        if suppression_reason:
            raise RecipientSuppressedError(to_email, suppression_reason)

        # Build message
        message = EmailMessage(
            to=[EmailRecipient(email=to_email, name=to_name)],
            subject=subject,
            html_content=html_content,
            text_content=text_content,
            from_email=from_email,
            from_name=from_name,
            reply_to=reply_to,
            categories=categories,
            custom_args=custom_args,
            attachments=attachments,
            tracking_enabled=tracking_enabled,
            workspace_id=workspace_id,
            event_id=event_id,
            template_code=template_code,
        )

        try:
            result = await self._send_message(message)

            # Track success metrics
            duration = time.monotonic() - start_time
            self._metrics.email_sent(
                status="success",
                template=template_code or "custom",
                channel="email",
            )
            with self._metrics.track_email_duration("sendgrid"):
                pass  # Duration already calculated

            logger.info(
                "Email sent successfully",
                extra={
                    "message_id": result.message_id,
                    "template": template_code,
                    "duration_ms": int(duration * 1000),
                },
            )

            return result

        except EmailDeliveryError as e:
            # Track failure metrics
            self._metrics.email_sent(
                status="failed",
                template=template_code or "custom",
                channel="email",
            )
            self._metrics.error_occurred("email_delivery", "/email/send")

            logger.error(
                "Email delivery failed",
                extra={
                    "error_code": e.code,
                    "template": template_code,
                    "should_retry": e.should_retry,
                },
            )

            return EmailResult(
                success=False,
                status=EmailStatus.FAILED,
                recipients=[to_email],
                error_message=str(e),
                error_code=e.code,
                should_retry=e.should_retry,
                retry_after=e.retry_after,
            )

    async def send_from_rendered(
        self,
        rendered: RenderedEmail,
        to_email: str,
        to_name: str | None = None,
        workspace_id: UUID | None = None,
        event_id: UUID | None = None,
        template_code: str | None = None,
        categories: list[str] | None = None,
    ) -> EmailResult:
        """Send an email from a pre-rendered template.

        Args:
            rendered: Rendered email content from template_service
            to_email: Recipient email address
            to_name: Recipient display name
            workspace_id: Workspace ID for tracking
            event_id: Notification event ID
            template_code: Template code for metrics
            categories: SendGrid categories

        Returns:
            EmailResult with delivery status
        """
        return await self.send_email(
            to_email=to_email,
            to_name=to_name,
            subject=rendered.subject,
            html_content=rendered.html,
            text_content=rendered.text,
            from_name=rendered.from_name,
            reply_to=rendered.reply_to,
            workspace_id=workspace_id,
            event_id=event_id,
            template_code=template_code,
            categories=categories,
        )

    async def send_notification_task(
        self,
        task: NotificationTask,
        rendered: RenderedEmail | None = None,
    ) -> NotificationResult:
        """Send an email for a notification task with full tracking.

        This is the main entry point for the notification worker.
        It handles:
        - Delivery log creation
        - Email sending
        - Status updates
        - Error handling and retry logic

        Args:
            task: NotificationTask with all delivery details
            rendered: Pre-rendered email content (optional, uses task content if not provided)

        Returns:
            NotificationResult with delivery status
        """
        # Create delivery log entry
        if task.workspace_id:
            delivery_log = await notification_repository.create_delivery_log_with_event(
                workspace_id=task.workspace_id,
                event_id=task.event_id,
                channel=NotificationChannel.EMAIL,
                provider=NotificationProvider.SENDGRID,
                recipient_email=task.recipient_email,
                recipient_user_id=task.recipient_user_id,
            )
            log_id = delivery_log.log_id
        else:
            log_id = None

        try:
            # Use rendered content if provided, otherwise use task content
            if rendered:
                subject = rendered.subject
                html_content = rendered.html
                text_content = rendered.text
            else:
                subject = task.rendered_subject or task.subject or "Notification"
                html_content = task.rendered_body_html
                text_content = task.rendered_body_text

            # Send the email
            result = await self.send_email(
                to_email=task.recipient_email,
                subject=subject,
                html_content=html_content,
                text_content=text_content,
                workspace_id=task.workspace_id,
                event_id=task.event_id,
                template_code=task.template_code,
            )

            # Update delivery log with result
            if log_id:
                if result.success:
                    await notification_repository.update_delivery_status(
                        log_id=log_id,
                        status=NotificationDeliveryStatus.SENT,
                        provider_message_id=result.message_id,
                        sent_at=result.sent_at or datetime.now(timezone.utc),
                    )
                else:
                    await notification_repository.update_delivery_status(
                        log_id=log_id,
                        status=NotificationDeliveryStatus.FAILED,
                        provider_error_code=result.error_code,
                        provider_error_message=result.error_message,
                        failed_at=datetime.now(timezone.utc),
                    )

            # Build notification result
            return NotificationResult(
                event_id=task.event_id,
                success=result.success,
                status=NotificationEventStatus.SENT if result.success else NotificationEventStatus.FAILED,
                provider=NotificationProvider.SENDGRID,
                provider_message_id=result.message_id,
                error_message=result.error_message,
                error_code=result.error_code,
                delivered_at=result.sent_at,
                should_retry=result.should_retry,
            )

        except Exception as e:
            # Update delivery log with failure
            if log_id:
                await notification_repository.update_delivery_status(
                    log_id=log_id,
                    status=NotificationDeliveryStatus.FAILED,
                    provider_error_message=str(e),
                    failed_at=datetime.now(timezone.utc),
                )

            # Determine if we should retry
            should_retry = isinstance(e, EmailDeliveryError) and e.should_retry

            return NotificationResult(
                event_id=task.event_id,
                success=False,
                status=NotificationEventStatus.FAILED,
                provider=NotificationProvider.SENDGRID,
                error_message=str(e),
                error_code=getattr(e, "code", "UNKNOWN_ERROR"),
                should_retry=should_retry,
            )

    async def send_batch(
        self,
        messages: list[EmailMessage],
        workspace_id: UUID | None = None,
    ) -> list[EmailResult]:
        """Send multiple emails with concurrent delivery.

        Sends up to 10 emails concurrently for performance.
        Each email is tracked independently.

        Args:
            messages: List of EmailMessage objects to send
            workspace_id: Workspace ID for tracking

        Returns:
            List of EmailResult for each message
        """
        results = []
        batch_size = 10  # Concurrent limit

        for i in range(0, len(messages), batch_size):
            batch = messages[i:i + batch_size]
            tasks = []

            for msg in batch:
                msg.workspace_id = workspace_id
                tasks.append(self._send_message(msg))

            batch_results = await asyncio.gather(*tasks, return_exceptions=True)

            for j, result in enumerate(batch_results):
                if isinstance(result, Exception):
                    results.append(EmailResult(
                        success=False,
                        status=EmailStatus.FAILED,
                        recipients=[batch[j].to[0].email] if batch[j].to else [],
                        error_message=str(result),
                        error_code=getattr(result, "code", "BATCH_ERROR"),
                        should_retry=getattr(result, "should_retry", False),
                    ))
                else:
                    results.append(result)

        return results

    # =========================================================================
    # INTERNAL SENDING LOGIC
    # =========================================================================

    async def _send_message(self, message: EmailMessage) -> EmailResult:
        """Internal method to send a single email message."""
        # Build the request payload
        payload = self._build_send_payload(message)

        # Track custom args for webhook correlation
        if message.event_id:
            payload.setdefault("custom_args", {})["event_id"] = str(message.event_id)
        if message.workspace_id:
            payload.setdefault("custom_args", {})["workspace_id"] = str(message.workspace_id)

        # Send the email
        response = await self._make_request("POST", "/mail/send", payload)

        # Extract message ID from response headers
        message_id = response.headers.get("X-Message-Id", str(uuid.uuid4()))
        sent_at = datetime.now(timezone.utc)

        # Cache delivery status
        await self._cache_delivery_status(
            message_id=message_id,
            recipients=[r.email for r in message.to],
            status=EmailStatus.SENT,
            sent_at=sent_at,
        )

        return EmailResult(
            success=True,
            message_id=message_id,
            status=EmailStatus.SENT,
            provider=NotificationProvider.SENDGRID,
            recipients=[r.email for r in message.to],
            sent_at=sent_at,
        )

    def _build_send_payload(self, message: EmailMessage) -> dict[str, Any]:
        """Build the SendGrid API payload for sending an email."""
        # Build personalizations
        personalizations: list[dict[str, Any]] = []
        personalization: dict[str, Any] = {
            "to": [self._format_recipient(r) for r in message.to],
        }

        if message.cc:
            personalization["cc"] = [self._format_recipient(r) for r in message.cc]
        if message.bcc:
            personalization["bcc"] = [self._format_recipient(r) for r in message.bcc]
        if message.subject:
            personalization["subject"] = message.subject

        personalizations.append(personalization)

        # Build base payload
        payload: dict[str, Any] = {
            "personalizations": personalizations,
            "from": {
                "email": message.from_email or settings.SENDGRID_FROM_EMAIL,
                "name": message.from_name or settings.SENDGRID_FROM_NAME,
            },
            "subject": message.subject,
        }

        # Add content
        content = []
        if message.text_content:
            content.append({"type": "text/plain", "value": message.text_content})
        if message.html_content:
            content.append({"type": "text/html", "value": message.html_content})
        if content:
            payload["content"] = content

        # Add reply-to
        if message.reply_to:
            payload["reply_to"] = {"email": message.reply_to}

        # Add attachments
        if message.attachments:
            payload["attachments"] = [
                {
                    "content": att.content,
                    "filename": att.filename,
                    "type": att.type,
                    "disposition": att.disposition,
                    **({"content_id": att.content_id} if att.content_id else {}),
                }
                for att in message.attachments
            ]

        # Add categories
        if message.categories:
            payload["categories"] = message.categories

        # Add custom args
        if message.custom_args:
            payload["custom_args"] = message.custom_args

        # Add scheduled send time
        if message.send_at:
            payload["send_at"] = message.send_at

        # Add tracking settings
        if message.tracking_enabled:
            payload["tracking_settings"] = {
                "click_tracking": {"enable": True},
                "open_tracking": {"enable": True},
            }
        else:
            payload["tracking_settings"] = {
                "click_tracking": {"enable": False},
                "open_tracking": {"enable": False},
            }

        return payload

    def _format_recipient(self, recipient: EmailRecipient) -> dict[str, str]:
        """Format a recipient for the SendGrid API."""
        result: dict[str, str] = {"email": recipient.email}
        if recipient.name:
            result["name"] = recipient.name
        return result

    # =========================================================================
    # DELIVERY STATUS TRACKING
    # =========================================================================

    async def _cache_delivery_status(
        self,
        message_id: str,
        recipients: list[str],
        status: EmailStatus,
        sent_at: datetime,
    ) -> None:
        """Cache delivery status in Redis for quick lookup."""
        cache_key = build_delivery_cache_key(message_id)
        await redis_client.set_json(
            cache_key,
            {
                "message_id": message_id,
                "recipients": recipients,
                "status": status.value,
                "sent_at": sent_at.isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            ttl=settings.CACHE_TTL_DELIVERY_STATUS,
        )

    async def get_delivery_status(self, message_id: str) -> dict[str, Any] | None:
        """Get cached delivery status for a message.

        Args:
            message_id: SendGrid message ID

        Returns:
            Dict with delivery status or None if not cached
        """
        cache_key = build_delivery_cache_key(message_id)
        cached = await redis_client.get_json(cache_key)
        if cached:
            self._metrics.cache_hit("delivery_status")
            return cached
        self._metrics.cache_miss("delivery_status")
        return None

    # =========================================================================
    # WEBHOOK EVENT PROCESSING
    # =========================================================================

    async def process_webhook_event(self, event: dict[str, Any]) -> WebhookEvent | None:
        """Process a SendGrid webhook event.

        Updates delivery status in database and cache based on event type.

        Args:
            event: Raw webhook event data from SendGrid

        Returns:
            Parsed WebhookEvent or None if event type not tracked
        """
        event_type = event.get("event", "").lower()

        # Map SendGrid event types to our delivery status
        status_map = {
            "processed": NotificationDeliveryStatus.QUEUED,
            "dropped": NotificationDeliveryStatus.REJECTED,
            "delivered": NotificationDeliveryStatus.DELIVERED,
            "bounce": NotificationDeliveryStatus.BOUNCED,
            "deferred": NotificationDeliveryStatus.DEFERRED,
            "open": NotificationDeliveryStatus.OPENED,
            "click": NotificationDeliveryStatus.CLICKED,
            "spamreport": NotificationDeliveryStatus.SPAM_REPORTED,
            "unsubscribe": NotificationDeliveryStatus.UNSUBSCRIBED,
        }

        status = status_map.get(event_type)
        if status is None:
            return None

        # Parse webhook event
        webhook_event = WebhookEvent(
            event_id=str(uuid.uuid4()),
            message_id=event.get("sg_message_id", ""),
            email=event.get("email", ""),
            event_type=event_type,
            timestamp=datetime.fromtimestamp(event.get("timestamp", 0), tz=timezone.utc),
            sg_event_id=event.get("sg_event_id"),
            sg_message_id=event.get("sg_message_id"),
            reason=event.get("reason"),
            bounce_type=event.get("type"),
            user_agent=event.get("useragent"),
            ip=event.get("ip"),
            url=event.get("url"),
        )

        # Track webhook event in metrics
        self._metrics.webhook_received("sendgrid", event_type)

        # Update delivery log if we have the message ID
        provider_message_id = event.get("sg_message_id")
        if provider_message_id:
            await notification_repository.update_delivery_from_webhook(
                provider_message_id=provider_message_id,
                status=status,
                webhook_event=event_type,
                webhook_timestamp=webhook_event.timestamp,
                bounce_type=webhook_event.bounce_type,
                bounce_reason=webhook_event.reason,
                clicked_url=webhook_event.url,
            )

            # Handle suppression for bounces and spam reports
            if status in (
                NotificationDeliveryStatus.BOUNCED,
                NotificationDeliveryStatus.SPAM_REPORTED,
            ):
                email = event.get("email")
                if email:
                    reason = "hard_bounce" if webhook_event.bounce_type == "hard" else event_type
                    await self._add_to_suppression(email, reason)

                    # Mark recipient as invalidated
                    await notification_repository.mark_recipient_as_invalidated(
                        recipient_email=email,
                        reason=reason,
                    )

        # Update cache
        if provider_message_id:
            cache_key = build_delivery_cache_key(provider_message_id)
            cached = await redis_client.get_json(cache_key)
            if cached:
                cached["status"] = status.value
                cached["updated_at"] = datetime.now(timezone.utc).isoformat()
                cached[f"event_{event_type}"] = webhook_event.timestamp.isoformat()
                await redis_client.set_json(
                    cache_key,
                    cached,
                    ttl=settings.CACHE_TTL_DELIVERY_STATUS,
                )

        logger.info(
            "Processed webhook event",
            extra={
                "event_type": event_type,
                "status": status.value,
            },
        )

        return webhook_event

    async def verify_webhook_signature(
        self,
        payload: bytes,
        signature: str,
        timestamp: str,
    ) -> bool:
        """Verify SendGrid webhook signature.

        Args:
            payload: Raw request body
            signature: X-Twilio-Email-Event-Webhook-Signature header
            timestamp: X-Twilio-Email-Event-Webhook-Timestamp header

        Returns:
            True if signature is valid
        """
        if not settings.SENDGRID_WEBHOOK_SIGNING_KEY:
            logger.warning("SendGrid webhook signing key not configured")
            return True  # Skip verification if not configured

        import hmac
        import base64

        # Build verification string
        verification_string = timestamp.encode() + payload

        # Calculate expected signature
        expected = base64.b64encode(
            hmac.new(
                settings.SENDGRID_WEBHOOK_SIGNING_KEY.encode(),
                verification_string,
                hashlib.sha256,
            ).digest()
        ).decode()

        return hmac.compare_digest(signature, expected)

    # =========================================================================
    # RETRY LOGIC
    # =========================================================================

    async def send_with_retry(
        self,
        to_email: str,
        subject: str,
        html_content: str | None = None,
        text_content: str | None = None,
        workspace_id: UUID | None = None,
        event_id: UUID | None = None,
        max_attempts: int = 3,
        initial_delay: float = 1.0,
    ) -> EmailResult:
        """Send email with exponential backoff retry.

        Args:
            to_email: Recipient email
            subject: Email subject
            html_content: HTML body
            text_content: Text body
            workspace_id: Workspace ID
            event_id: Event ID
            max_attempts: Maximum retry attempts (default 3)
            initial_delay: Initial delay in seconds (default 1.0)

        Returns:
            EmailResult with final status
        """
        last_result = None
        delay = initial_delay

        for attempt in range(1, max_attempts + 1):
            result = await self.send_email(
                to_email=to_email,
                subject=subject,
                html_content=html_content,
                text_content=text_content,
                workspace_id=workspace_id,
                event_id=event_id,
            )

            if result.success or not result.should_retry:
                return result

            last_result = result

            # Track retry attempt
            self._metrics.email_retry(template="retry", attempt=attempt)

            if attempt < max_attempts:
                # Use retry_after if provided, otherwise exponential backoff
                wait_time = result.retry_after if result.retry_after else delay
                logger.info(
                    f"Retrying email send (attempt {attempt + 1}/{max_attempts}) in {wait_time}s",
                    extra={"event_id": str(event_id)},
                )
                await asyncio.sleep(wait_time)
                delay *= 2  # Exponential backoff

        # All attempts failed
        if last_result:
            self._metrics.dead_letter("max_retries")
        return last_result or EmailResult(
            success=False,
            status=EmailStatus.FAILED,
            recipients=[to_email],
            error_message="Max retry attempts exceeded",
            error_code="MAX_RETRIES_EXCEEDED",
        )

    # =========================================================================
    # HEALTH & DIAGNOSTICS
    # =========================================================================

    async def health_check(self) -> dict[str, Any]:
        """Check SendGrid connectivity and configuration.

        Returns:
            Dict with health status information
        """
        status = {
            "configured": self.is_configured,
            "circuit_breaker_state": self._circuit_breaker.state,
            "circuit_breaker_failures": self._circuit_breaker.failure_count,
        }

        if self.is_configured and self._circuit_breaker.can_execute():
            try:
                # Quick API check - get user profile
                response = await self._make_request("GET", "/user/profile")
                status["api_reachable"] = response.status_code == 200
                status["api_status_code"] = response.status_code
            except Exception as e:
                status["api_reachable"] = False
                status["api_error"] = str(e)
        else:
            status["api_reachable"] = False

        return status

    def get_circuit_breaker_state(self) -> dict[str, Any]:
        """Get current circuit breaker state for monitoring."""
        return {
            "state": self._circuit_breaker.state,
            "failure_count": self._circuit_breaker.failure_count,
            "failure_threshold": self._circuit_breaker.failure_threshold,
            "recovery_timeout": self._circuit_breaker.recovery_timeout,
            "last_failure": (
                self._circuit_breaker.last_failure_time.isoformat()
                if self._circuit_breaker.last_failure_time
                else None
            ),
        }


# =============================================================================
# SINGLETON INSTANCE
# =============================================================================


_email_delivery_service: EmailDeliveryService | None = None


def get_email_delivery_service() -> EmailDeliveryService:
    """Get the email delivery service singleton."""
    global _email_delivery_service
    if _email_delivery_service is None:
        _email_delivery_service = EmailDeliveryService()
    return _email_delivery_service


# Convenience alias
email_delivery_service = get_email_delivery_service()
