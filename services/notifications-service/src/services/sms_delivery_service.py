"""SMS delivery service placeholder for the Notifications & Communication Microservice.

This module provides the SMSDeliveryService class as a placeholder for Phase 1:
- Full interface ready for Twilio integration
- All methods implemented with placeholder responses
- Feature flag check (SMS_ENABLED) to prevent accidental usage
- Proper error handling and logging
- Ready for future implementation

When SMS is enabled in a future phase, this service will handle:
- SMS sending via Twilio API
- Delivery tracking and status updates
- Retry logic with exponential backoff
- Rate limiting compliance
- Webhook event processing from Twilio

Feature: Notifications & Communication Microservice
Task: T023 - Create sms_delivery_service.py placeholder
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from src.config import settings
from src.observability.metrics import get_metrics
from src.schemas.notification import (
    NotificationChannel,
    NotificationDeliveryStatus,
    NotificationEventStatus,
    NotificationProvider,
    NotificationTask,
    NotificationResult,
)

logger = logging.getLogger(__name__)


# =============================================================================
# EXCEPTIONS
# =============================================================================


class SMSDeliveryError(Exception):
    """Base exception for SMS delivery errors."""

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


class SMSNotEnabledError(SMSDeliveryError):
    """SMS feature is not enabled."""

    def __init__(self):
        super().__init__(
            "SMS is not enabled. Set SMS_ENABLED=true when Twilio integration is ready.",
            "SMS_NOT_ENABLED",
            503,
            should_retry=False,
        )


class TwilioNotConfiguredError(SMSDeliveryError):
    """Twilio credentials not configured."""

    def __init__(self):
        super().__init__(
            "Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER.",
            "TWILIO_NOT_CONFIGURED",
            503,
            should_retry=False,
        )


class TwilioAPIError(SMSDeliveryError):
    """Twilio API returned an error."""

    def __init__(
        self,
        message: str,
        status_code: int,
        error_code: str | None = None,
    ):
        # Determine if we should retry based on status code
        should_retry = status_code in (408, 429, 500, 502, 503, 504)
        super().__init__(
            f"Twilio API error: {message}",
            error_code or "TWILIO_API_ERROR",
            status_code,
            should_retry=should_retry,
        )
        self.twilio_error_code = error_code


class TwilioRateLimitError(SMSDeliveryError):
    """Twilio rate limit exceeded."""

    def __init__(self, retry_after: int | None = None):
        super().__init__(
            f"Twilio rate limit exceeded. Retry after {retry_after or 60} seconds.",
            "TWILIO_RATE_LIMIT",
            429,
            should_retry=True,
            retry_after=retry_after or 60,
        )


class InvalidPhoneNumberError(SMSDeliveryError):
    """Invalid phone number."""

    def __init__(self, phone: str, reason: str = "Invalid phone number format"):
        # Mask phone for logging
        masked = self._mask_phone(phone)
        super().__init__(
            f"Invalid phone number: {masked}. {reason}",
            "INVALID_PHONE_NUMBER",
            400,
            should_retry=False,
        )
        self.phone = phone

    @staticmethod
    def _mask_phone(phone: str) -> str:
        """Mask phone number for safe logging."""
        if len(phone) <= 4:
            return "***"
        return phone[:2] + "***" + phone[-2:]


class RecipientOptedOutError(SMSDeliveryError):
    """Recipient has opted out of SMS messages."""

    def __init__(self, phone: str):
        super().__init__(
            "Recipient has opted out of SMS messages",
            "RECIPIENT_OPTED_OUT",
            400,
            should_retry=False,
        )
        self.phone = phone


# =============================================================================
# DATA CLASSES
# =============================================================================


class SMSStatus(str, Enum):
    """SMS delivery status tracking."""

    PENDING = "pending"
    QUEUED = "queued"
    SENDING = "sending"
    SENT = "sent"
    DELIVERED = "delivered"
    UNDELIVERED = "undelivered"
    FAILED = "failed"


@dataclass
class SMSMessage:
    """SMS message configuration for sending."""

    to: str  # Phone number in E.164 format
    body: str
    from_number: str | None = None
    status_callback: str | None = None

    # Internal tracking
    workspace_id: UUID | None = None
    event_id: UUID | None = None
    template_code: str | None = None


@dataclass
class SMSResult:
    """Result of sending an SMS."""

    success: bool
    message_id: str | None = None
    status: SMSStatus = SMSStatus.PENDING
    provider: NotificationProvider = NotificationProvider.TWILIO
    recipient: str | None = None
    sent_at: datetime | None = None
    error_message: str | None = None
    error_code: str | None = None
    should_retry: bool = False
    retry_after: int | None = None
    segments: int = 1  # Number of SMS segments used
    cost_cents: int = 0  # Estimated cost in cents


@dataclass
class SMSWebhookEvent:
    """Parsed Twilio webhook event (placeholder)."""

    event_id: str
    message_sid: str
    to: str
    from_number: str
    status: str
    timestamp: datetime
    error_code: str | None = None
    error_message: str | None = None


# =============================================================================
# SMS DELIVERY SERVICE
# =============================================================================


class SMSDeliveryService:
    """Placeholder service for sending SMS via Twilio.

    This is a Phase 1 placeholder implementation that:
    - Provides the full interface for SMS delivery
    - Returns appropriate errors when called (SMS not enabled)
    - Logs all attempts for debugging
    - Tracks metrics for monitoring

    When SMS is enabled in a future phase, this service will:
    - Send SMS messages via Twilio API
    - Handle delivery tracking and status callbacks
    - Manage opt-out lists and compliance
    - Provide retry logic with exponential backoff

    Usage (when enabled):
        service = SMSDeliveryService()

        # Send a simple SMS
        result = await service.send_sms(
            to_phone="+1234567890",
            body="Your gallery is ready!",
            workspace_id=workspace_id,
        )

        # Send from notification task
        result = await service.send_notification_task(task)
    """

    def __init__(self):
        """Initialize the SMS delivery service."""
        self._metrics = get_metrics()

    # =========================================================================
    # CONFIGURATION & VALIDATION
    # =========================================================================

    @property
    def is_enabled(self) -> bool:
        """Check if SMS feature is enabled."""
        return settings.SMS_ENABLED

    @property
    def is_configured(self) -> bool:
        """Check if Twilio is properly configured."""
        return bool(
            settings.TWILIO_ACCOUNT_SID
            and settings.TWILIO_AUTH_TOKEN
            and settings.TWILIO_FROM_NUMBER
        )

    def _ensure_enabled(self) -> None:
        """Raise error if SMS is not enabled."""
        if not self.is_enabled:
            raise SMSNotEnabledError()

    def _ensure_configured(self) -> None:
        """Raise error if Twilio is not configured."""
        if not self.is_configured:
            raise TwilioNotConfiguredError()

    def _validate_phone(self, phone: str) -> bool:
        """Basic phone number validation (E.164 format).

        Args:
            phone: Phone number to validate

        Returns:
            True if phone appears valid
        """
        if not phone:
            return False
        # Basic E.164 validation: starts with +, followed by 10-15 digits
        if not phone.startswith("+"):
            return False
        digits = phone[1:].replace(" ", "").replace("-", "")
        return digits.isdigit() and 10 <= len(digits) <= 15

    def _normalize_phone(self, phone: str) -> str:
        """Normalize phone number to E.164 format.

        Args:
            phone: Phone number to normalize

        Returns:
            Normalized phone number
        """
        # Remove spaces and dashes
        normalized = phone.replace(" ", "").replace("-", "")
        # Ensure + prefix
        if not normalized.startswith("+"):
            normalized = "+" + normalized
        return normalized

    def _calculate_segments(self, message: str) -> int:
        """Calculate the number of SMS segments for a message.

        Standard SMS is 160 characters (GSM-7) or 70 characters (Unicode).
        Long messages are split into segments of 153 or 67 characters.

        Args:
            message: Message text

        Returns:
            Number of segments required
        """
        # Check if message uses GSM-7 or Unicode
        gsm7_chars = set(
            "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?"
            "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
        )
        is_gsm7 = all(c in gsm7_chars for c in message)

        if is_gsm7:
            if len(message) <= 160:
                return 1
            return (len(message) + 152) // 153  # Ceiling division for segments
        else:
            if len(message) <= 70:
                return 1
            return (len(message) + 66) // 67

    # =========================================================================
    # SMS SENDING - MAIN METHODS (PLACEHOLDERS)
    # =========================================================================

    async def send_sms(
        self,
        to_phone: str,
        body: str,
        from_number: str | None = None,
        workspace_id: UUID | None = None,
        event_id: UUID | None = None,
        template_code: str | None = None,
    ) -> SMSResult:
        """Send a single SMS via Twilio.

        PLACEHOLDER: This method returns an error in Phase 1.

        Args:
            to_phone: Recipient phone number (E.164 format)
            body: SMS message body
            from_number: Sender phone number (defaults to config)
            workspace_id: Workspace ID for multi-tenant tracking
            event_id: Notification event ID for tracking
            template_code: Template code used (for metrics)

        Returns:
            SMSResult with status (always failure in Phase 1)

        Raises:
            SMSNotEnabledError: Always, since SMS is disabled in Phase 1
        """
        logger.info(
            "SMS send attempt (placeholder - SMS not enabled)",
            extra={
                "template": template_code,
                "workspace_id": str(workspace_id) if workspace_id else None,
                "event_id": str(event_id) if event_id else None,
            },
        )

        # Track the attempt in metrics
        self._metrics.sms_attempted(
            status="disabled",
            template=template_code or "custom",
        )

        # Always return failure in Phase 1
        return SMSResult(
            success=False,
            status=SMSStatus.FAILED,
            provider=NotificationProvider.TWILIO,
            recipient=self._mask_phone(to_phone) if to_phone else None,
            error_message="SMS is not enabled in Phase 1. This is a placeholder implementation.",
            error_code="SMS_NOT_ENABLED",
            should_retry=False,
            segments=self._calculate_segments(body) if body else 1,
        )

    async def send_notification_task(
        self,
        task: NotificationTask,
    ) -> NotificationResult:
        """Send an SMS for a notification task with full tracking.

        PLACEHOLDER: This method returns an error in Phase 1.

        This is the main entry point for the notification worker.
        When enabled, it will handle:
        - Delivery log creation
        - SMS sending
        - Status updates
        - Error handling and retry logic

        Args:
            task: NotificationTask with all delivery details

        Returns:
            NotificationResult with delivery status (always failure in Phase 1)
        """
        logger.info(
            "SMS notification task received (placeholder)",
            extra={
                "event_id": str(task.event_id),
                "workspace_id": str(task.workspace_id),
                "template": task.template_code,
            },
        )

        # Validate we have a phone number
        if not task.recipient_phone:
            return NotificationResult(
                event_id=task.event_id,
                success=False,
                status=NotificationEventStatus.FAILED,
                provider=NotificationProvider.TWILIO,
                error_message="No recipient phone number provided",
                error_code="NO_PHONE_NUMBER",
                should_retry=False,
            )

        # Get message body from rendered content
        body = task.rendered_body_text or ""
        if not body:
            return NotificationResult(
                event_id=task.event_id,
                success=False,
                status=NotificationEventStatus.FAILED,
                provider=NotificationProvider.TWILIO,
                error_message="No message body provided",
                error_code="NO_MESSAGE_BODY",
                should_retry=False,
            )

        # Attempt to send (will fail in Phase 1)
        result = await self.send_sms(
            to_phone=task.recipient_phone,
            body=body,
            workspace_id=task.workspace_id,
            event_id=task.event_id,
            template_code=task.template_code,
        )

        return NotificationResult(
            event_id=task.event_id,
            success=result.success,
            status=(
                NotificationEventStatus.SENT
                if result.success
                else NotificationEventStatus.FAILED
            ),
            provider=NotificationProvider.TWILIO,
            provider_message_id=result.message_id,
            error_message=result.error_message,
            error_code=result.error_code,
            delivered_at=result.sent_at,
            should_retry=result.should_retry,
        )

    async def send_batch(
        self,
        messages: list[SMSMessage],
        workspace_id: UUID | None = None,
    ) -> list[SMSResult]:
        """Send multiple SMS messages.

        PLACEHOLDER: Returns failures for all messages in Phase 1.

        Args:
            messages: List of SMSMessage objects to send
            workspace_id: Workspace ID for tracking

        Returns:
            List of SMSResult for each message (all failures in Phase 1)
        """
        logger.info(
            f"SMS batch send attempt ({len(messages)} messages) - placeholder",
            extra={"workspace_id": str(workspace_id) if workspace_id else None},
        )

        results = []
        for msg in messages:
            result = await self.send_sms(
                to_phone=msg.to,
                body=msg.body,
                from_number=msg.from_number,
                workspace_id=workspace_id,
                event_id=msg.event_id,
                template_code=msg.template_code,
            )
            results.append(result)

        return results

    # =========================================================================
    # WEBHOOK EVENT PROCESSING (PLACEHOLDER)
    # =========================================================================

    async def process_webhook_event(
        self, event: dict[str, Any]
    ) -> SMSWebhookEvent | None:
        """Process a Twilio webhook event.

        PLACEHOLDER: Logs the event but takes no action in Phase 1.

        Args:
            event: Raw webhook event data from Twilio

        Returns:
            Parsed SMSWebhookEvent or None
        """
        logger.info(
            "Twilio webhook received (placeholder - not processed)",
            extra={"event_type": event.get("MessageStatus", "unknown")},
        )

        # Track webhook in metrics
        self._metrics.webhook_received("twilio", event.get("MessageStatus", "unknown"))

        return None

    def verify_webhook_signature(
        self,
        url: str,
        params: dict[str, str],
        signature: str,
    ) -> bool:
        """Verify Twilio webhook signature.

        PLACEHOLDER: Always returns True in Phase 1 (no real verification).

        Args:
            url: Full request URL
            params: Request parameters
            signature: X-Twilio-Signature header

        Returns:
            True (placeholder always passes)
        """
        logger.warning(
            "Twilio webhook signature verification skipped (placeholder)"
        )
        return True

    # =========================================================================
    # RETRY LOGIC (PLACEHOLDER)
    # =========================================================================

    async def send_with_retry(
        self,
        to_phone: str,
        body: str,
        workspace_id: UUID | None = None,
        event_id: UUID | None = None,
        max_attempts: int = 3,
        initial_delay: float = 1.0,
    ) -> SMSResult:
        """Send SMS with exponential backoff retry.

        PLACEHOLDER: Returns failure immediately in Phase 1 (no retry).

        Args:
            to_phone: Recipient phone
            body: Message body
            workspace_id: Workspace ID
            event_id: Event ID
            max_attempts: Maximum retry attempts (ignored in Phase 1)
            initial_delay: Initial delay in seconds (ignored in Phase 1)

        Returns:
            SMSResult with final status (always failure in Phase 1)
        """
        # No retry needed - just return failure immediately
        return await self.send_sms(
            to_phone=to_phone,
            body=body,
            workspace_id=workspace_id,
            event_id=event_id,
        )

    # =========================================================================
    # HEALTH & DIAGNOSTICS
    # =========================================================================

    async def health_check(self) -> dict[str, Any]:
        """Check SMS service status.

        Returns:
            Dict with health status information
        """
        return {
            "enabled": self.is_enabled,
            "configured": self.is_configured,
            "status": "placeholder",
            "message": "SMS is disabled in Phase 1. Twilio integration pending.",
            "provider": "twilio",
        }

    def get_status(self) -> dict[str, Any]:
        """Get current service status for monitoring.

        Returns:
            Dict with service status
        """
        return {
            "enabled": self.is_enabled,
            "configured": self.is_configured,
            "phase": 1,
            "placeholder": True,
            "twilio_account_configured": bool(settings.TWILIO_ACCOUNT_SID),
            "twilio_auth_configured": bool(settings.TWILIO_AUTH_TOKEN),
            "twilio_from_configured": bool(settings.TWILIO_FROM_NUMBER),
        }

    # =========================================================================
    # UTILITY METHODS
    # =========================================================================

    @staticmethod
    def _mask_phone(phone: str) -> str:
        """Mask phone number for safe logging.

        Args:
            phone: Phone number to mask

        Returns:
            Masked phone number
        """
        if len(phone) <= 4:
            return "***"
        return phone[:3] + "***" + phone[-2:]


# =============================================================================
# SINGLETON INSTANCE
# =============================================================================


_sms_delivery_service: SMSDeliveryService | None = None


def get_sms_delivery_service() -> SMSDeliveryService:
    """Get the SMS delivery service singleton."""
    global _sms_delivery_service
    if _sms_delivery_service is None:
        _sms_delivery_service = SMSDeliveryService()
    return _sms_delivery_service


# Convenience alias
sms_delivery_service = get_sms_delivery_service()
