"""Webhooks API endpoints for the Notifications & Communication Microservice.

This module provides REST API endpoints for handling email provider webhooks:
- SendGrid Event Webhooks (delivery, bounce, open, click, spam report, unsubscribe)
- Webhook signature verification
- Delivery status updates
- Suppression list management

The webhooks endpoint is designed to:
- Accept high-volume callback traffic (500/minute rate limit)
- Process events asynchronously where possible
- Update delivery logs with engagement metrics
- Handle bounces and spam reports for suppression
- Support signature verification for security

Feature: Notifications & Communication Microservice
Task: T029 - Create webhooks API router (SendGrid callbacks)
"""

import hashlib
import hmac
import time
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field

from src.config import settings
from src.log_config import get_logger
from src.observability.metrics import get_metrics
from src.repositories.notification_repository import notification_repository
from src.schemas.notification import (
    ErrorResponse,
    NotificationDeliveryStatus,
    SendGridWebhookEvent,
)
from src.services.email_delivery_service import email_delivery_service

logger = get_logger(__name__)
metrics = get_metrics()


# =============================================================================
# Response Schemas
# =============================================================================


class WebhookProcessingResult(BaseModel):
    """Response for webhook processing."""

    received: int = Field(..., description="Number of events received")
    processed: int = Field(..., description="Number of events successfully processed")
    skipped: int = Field(default=0, description="Number of events skipped")
    errors: list[str] = Field(default_factory=list, description="Error messages if any")


class WebhookHealthResponse(BaseModel):
    """Response for webhook health check."""

    status: str = Field(..., description="Webhook endpoint status")
    signature_verification: str = Field(..., description="Signature verification status")
    last_event_at: Optional[datetime] = Field(None, description="Last event timestamp")


# =============================================================================
# SendGrid Webhook Event Mapping
# =============================================================================

# Map SendGrid event types to our delivery status
SENDGRID_EVENT_STATUS_MAP: dict[str, NotificationDeliveryStatus] = {
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

# Events that indicate engagement (for metrics)
ENGAGEMENT_EVENTS = {"open", "click"}

# Events that indicate delivery issues
FAILURE_EVENTS = {"bounce", "dropped", "deferred", "spamreport"}

# Events that require suppression list updates
SUPPRESSION_EVENTS = {"bounce", "spamreport"}


# =============================================================================
# Router Configuration
# =============================================================================

router = APIRouter(
    prefix="/api/v1/webhooks",
    tags=["webhooks"],
)


# =============================================================================
# Signature Verification Helpers
# =============================================================================


def _verify_sendgrid_signature(
    payload: bytes,
    signature: Optional[str],
    timestamp: Optional[str],
) -> bool:
    """
    Verify SendGrid webhook signature using HMAC-SHA256.

    SendGrid's Event Webhook uses the following signature format:
    - Header: X-Twilio-Email-Event-Webhook-Signature
    - Header: X-Twilio-Email-Event-Webhook-Timestamp

    The signature is calculated as:
    Base64(HMAC-SHA256(timestamp + payload, signing_key))

    Args:
        payload: Raw request body
        signature: X-Twilio-Email-Event-Webhook-Signature header
        timestamp: X-Twilio-Email-Event-Webhook-Timestamp header

    Returns:
        True if signature is valid, False otherwise
    """
    # Skip verification if signing key is not configured
    if not settings.SENDGRID_WEBHOOK_SIGNING_KEY:
        logger.warning(
            "SendGrid webhook signing key not configured, skipping verification"
        )
        return True

    # Require signature and timestamp when key is configured
    if not signature or not timestamp:
        logger.warning(
            "Missing signature or timestamp headers for webhook verification"
        )
        return False

    try:
        import base64

        # Build verification string (timestamp + payload)
        verification_string = timestamp.encode() + payload

        # Calculate expected signature
        expected_signature = base64.b64encode(
            hmac.new(
                settings.SENDGRID_WEBHOOK_SIGNING_KEY.encode(),
                verification_string,
                hashlib.sha256,
            ).digest()
        ).decode()

        # Constant-time comparison
        return hmac.compare_digest(signature, expected_signature)

    except Exception as e:
        logger.error(
            "Webhook signature verification failed",
            extra={"error": str(e)},
        )
        return False


def _check_timestamp_validity(timestamp: Optional[str], max_age_seconds: int = 300) -> bool:
    """
    Check if the webhook timestamp is within acceptable range.

    Prevents replay attacks by rejecting old timestamps.

    Args:
        timestamp: Unix timestamp string
        max_age_seconds: Maximum age in seconds (default 5 minutes)

    Returns:
        True if timestamp is valid, False otherwise
    """
    if not timestamp:
        return True  # Skip if no timestamp provided

    try:
        webhook_time = int(timestamp)
        current_time = int(time.time())
        age = abs(current_time - webhook_time)
        return age <= max_age_seconds
    except (ValueError, TypeError):
        return False


# =============================================================================
# SendGrid Webhook Endpoint
# =============================================================================


@router.post(
    "/sendgrid",
    response_model=WebhookProcessingResult,
    status_code=status.HTTP_200_OK,
    summary="Process SendGrid webhook events",
    description="Receive and process SendGrid email event webhooks (delivery, bounce, open, click, etc.)",
)
async def process_sendgrid_webhook(
    request: Request,
    x_twilio_email_event_webhook_signature: Optional[str] = Header(
        None, description="SendGrid webhook signature"
    ),
    x_twilio_email_event_webhook_timestamp: Optional[str] = Header(
        None, description="SendGrid webhook timestamp"
    ),
) -> WebhookProcessingResult:
    """
    Process SendGrid email event webhooks.

    This endpoint receives webhook callbacks from SendGrid for various email events:
    - processed: Email accepted by SendGrid
    - dropped: Email rejected (invalid address, suppression list, etc.)
    - delivered: Email delivered to recipient's mail server
    - bounce: Email bounced (hard or soft bounce)
    - deferred: Email delivery delayed
    - open: Recipient opened the email
    - click: Recipient clicked a link
    - spamreport: Recipient reported as spam
    - unsubscribe: Recipient unsubscribed

    The endpoint:
    1. Verifies the webhook signature
    2. Processes each event in the batch
    3. Updates delivery logs with status and engagement data
    4. Adds bounced/spam-reported emails to suppression list

    Args:
        request: FastAPI request object
        x_twilio_email_event_webhook_signature: Webhook signature header
        x_twilio_email_event_webhook_timestamp: Webhook timestamp header

    Returns:
        WebhookProcessingResult: Processing results with counts

    Note:
        SendGrid sends events as a JSON array in the request body.
        Always returns 200 to prevent SendGrid from retrying.
    """
    received = 0
    processed = 0
    skipped = 0
    errors: list[str] = []

    # Get raw body for signature verification
    body = await request.body()

    # Verify webhook signature
    if settings.SENDGRID_WEBHOOK_SIGNING_KEY:
        if not _verify_sendgrid_signature(
            body,
            x_twilio_email_event_webhook_signature,
            x_twilio_email_event_webhook_timestamp,
        ):
            logger.warning("Invalid SendGrid webhook signature")
            metrics.error_occurred("webhook_signature_invalid", "/webhooks/sendgrid")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=ErrorResponse(
                    error="INVALID_SIGNATURE",
                    message="Invalid webhook signature",
                ).model_dump(),
            )

        # Check timestamp validity to prevent replay attacks
        if not _check_timestamp_validity(x_twilio_email_event_webhook_timestamp):
            logger.warning("SendGrid webhook timestamp too old")
            metrics.error_occurred("webhook_timestamp_invalid", "/webhooks/sendgrid")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=ErrorResponse(
                    error="TIMESTAMP_EXPIRED",
                    message="Webhook timestamp is too old",
                ).model_dump(),
            )

    # Parse events from body
    try:
        import json
        events = json.loads(body)
        if not isinstance(events, list):
            events = [events]
        received = len(events)
    except json.JSONDecodeError as e:
        logger.error(
            "Failed to parse SendGrid webhook payload",
            extra={"error": str(e)},
        )
        metrics.error_occurred("webhook_parse_error", "/webhooks/sendgrid")
        return WebhookProcessingResult(
            received=0,
            processed=0,
            skipped=0,
            errors=["Invalid JSON payload"],
        )

    logger.info(
        "Processing SendGrid webhook batch",
        extra={"event_count": received},
    )

    # Process each event
    with metrics.track_webhook_processing():
        for event_data in events:
            try:
                result = await _process_sendgrid_event(event_data)
                if result:
                    processed += 1
                else:
                    skipped += 1
            except Exception as e:
                logger.error(
                    "Failed to process SendGrid webhook event",
                    extra={
                        "event_type": event_data.get("event"),
                        "error": str(e),
                    },
                )
                errors.append(f"Event processing failed: {str(e)}")
                skipped += 1

    logger.info(
        "SendGrid webhook batch processed",
        extra={
            "received": received,
            "processed": processed,
            "skipped": skipped,
            "errors": len(errors),
        },
    )

    return WebhookProcessingResult(
        received=received,
        processed=processed,
        skipped=skipped,
        errors=errors[:10],  # Limit errors in response
    )


async def _process_sendgrid_event(event_data: dict[str, Any]) -> bool:
    """
    Process a single SendGrid webhook event.

    Args:
        event_data: Raw event data from SendGrid

    Returns:
        True if event was processed, False if skipped
    """
    event_type = event_data.get("event", "").lower()

    # Skip unknown event types
    if event_type not in SENDGRID_EVENT_STATUS_MAP:
        logger.debug(
            "Skipping unknown SendGrid event type",
            extra={"event_type": event_type},
        )
        return False

    # Track webhook event metric
    metrics.webhook_received("sendgrid", event_type)

    # Get our delivery status
    delivery_status = SENDGRID_EVENT_STATUS_MAP[event_type]

    # Extract event details
    provider_message_id = event_data.get("sg_message_id")
    email = event_data.get("email", "")
    timestamp = event_data.get("timestamp")
    reason = event_data.get("reason")
    bounce_type = event_data.get("type")  # hard, soft, block
    url = event_data.get("url")  # For click events
    user_agent = event_data.get("useragent")
    ip = event_data.get("ip")

    # Parse timestamp
    event_timestamp = None
    if timestamp:
        try:
            event_timestamp = datetime.fromtimestamp(int(timestamp), tz=timezone.utc)
        except (ValueError, TypeError):
            event_timestamp = datetime.now(timezone.utc)
    else:
        event_timestamp = datetime.now(timezone.utc)

    # Update delivery log if we have the message ID
    if provider_message_id:
        await notification_repository.update_delivery_from_webhook(
            provider_message_id=provider_message_id,
            status=delivery_status,
            webhook_event=event_type,
            webhook_timestamp=event_timestamp,
            bounce_type=bounce_type,
            bounce_reason=reason,
            clicked_url=url,
        )

        logger.debug(
            "Updated delivery log from webhook",
            extra={
                "event_type": event_type,
                "status": delivery_status.value,
                "provider_message_id": provider_message_id[:20] + "..." if len(provider_message_id) > 20 else provider_message_id,
            },
        )

    # Handle suppression for bounces and spam reports
    if event_type in SUPPRESSION_EVENTS and email:
        suppression_reason = _get_suppression_reason(event_type, bounce_type)
        await _handle_suppression(email, suppression_reason)

    # Handle unsubscribe events
    if event_type == "unsubscribe" and email:
        await _handle_unsubscribe(email, event_data)

    return True


def _get_suppression_reason(event_type: str, bounce_type: Optional[str]) -> str:
    """
    Get the suppression reason based on event type and bounce type.

    Args:
        event_type: SendGrid event type
        bounce_type: Bounce type (hard, soft, block) if applicable

    Returns:
        Suppression reason string
    """
    if event_type == "spamreport":
        return "spam_report"
    elif event_type == "bounce":
        if bounce_type == "hard":
            return "hard_bounce"
        elif bounce_type == "soft":
            return "soft_bounce"
        elif bounce_type == "block":
            return "blocked"
        return "bounce"
    return event_type


async def _handle_suppression(email: str, reason: str) -> None:
    """
    Handle email suppression for bounces and spam reports.

    Args:
        email: Email address to suppress
        reason: Reason for suppression
    """
    # Mark recipient as invalidated in delivery logs
    count = await notification_repository.mark_recipient_as_invalidated(
        recipient_email=email,
        reason=reason,
    )

    if count > 0:
        logger.info(
            "Marked recipient as invalidated",
            extra={
                "reason": reason,
                "records_updated": count,
            },
        )

    # Add to suppression cache in email delivery service
    await email_delivery_service._add_to_suppression(email, reason)


async def _handle_unsubscribe(email: str, event_data: dict[str, Any]) -> None:
    """
    Handle unsubscribe webhook event.

    Args:
        email: Email address that unsubscribed
        event_data: Full event data
    """
    # Track unsubscribe metric
    metrics.unsubscribe_processed(category="global")

    logger.info(
        "Processing unsubscribe webhook",
        extra={
            "event_type": "unsubscribe",
        },
    )

    # Note: Full unsubscribe handling would update user preferences
    # This is a placeholder for integration with preference_service
    # The actual preference update should happen via the preferences API
    # or through a dedicated unsubscribe token flow


# =============================================================================
# Webhook Health & Status Endpoints
# =============================================================================


@router.get(
    "/sendgrid/health",
    response_model=WebhookHealthResponse,
    summary="Check SendGrid webhook health",
    description="Check the health and configuration of the SendGrid webhook endpoint.",
)
async def get_sendgrid_webhook_health() -> WebhookHealthResponse:
    """
    Check SendGrid webhook endpoint health.

    Returns status of the webhook configuration including
    whether signature verification is enabled.

    Returns:
        WebhookHealthResponse: Health status
    """
    signature_status = (
        "enabled" if settings.SENDGRID_WEBHOOK_SIGNING_KEY else "disabled"
    )

    return WebhookHealthResponse(
        status="healthy",
        signature_verification=signature_status,
        last_event_at=None,  # Could track this in Redis if needed
    )


@router.post(
    "/sendgrid/test",
    response_model=WebhookProcessingResult,
    status_code=status.HTTP_200_OK,
    summary="Test webhook processing",
    description="Test webhook processing with sample events (development only).",
    include_in_schema=settings.DEBUG,  # Only show in docs in debug mode
)
async def test_sendgrid_webhook(
    events: list[dict[str, Any]],
) -> WebhookProcessingResult:
    """
    Test webhook processing with sample events.

    This endpoint is only available in debug mode and allows testing
    webhook processing without actual SendGrid events.

    Args:
        events: List of test event dictionaries

    Returns:
        WebhookProcessingResult: Processing results
    """
    if not settings.DEBUG:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ErrorResponse(
                error="TEST_ENDPOINT_DISABLED",
                message="Test endpoint is only available in debug mode",
            ).model_dump(),
        )

    received = len(events)
    processed = 0
    skipped = 0
    errors: list[str] = []

    for event_data in events:
        try:
            result = await _process_sendgrid_event(event_data)
            if result:
                processed += 1
            else:
                skipped += 1
        except Exception as e:
            errors.append(str(e))
            skipped += 1

    return WebhookProcessingResult(
        received=received,
        processed=processed,
        skipped=skipped,
        errors=errors,
    )


# =============================================================================
# Bulk Event Replay Endpoint (Admin)
# =============================================================================


class EventReplayRequest(BaseModel):
    """Request to replay webhook events."""

    provider_message_ids: list[str] = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Provider message IDs to query status for",
    )


class EventReplayResponse(BaseModel):
    """Response for event replay."""

    queried: int = Field(..., description="Number of IDs queried")
    found: int = Field(..., description="Number of delivery logs found")
    results: list[dict[str, Any]] = Field(
        default_factory=list, description="Status for each message ID"
    )


@router.post(
    "/sendgrid/status",
    response_model=EventReplayResponse,
    summary="Get delivery status for messages",
    description="Query delivery status for specific message IDs.",
)
async def get_delivery_status_batch(
    request: EventReplayRequest,
) -> EventReplayResponse:
    """
    Get delivery status for multiple provider message IDs.

    Allows querying the current delivery status for emails sent through SendGrid.
    Useful for debugging delivery issues or building status dashboards.

    Args:
        request: Request with list of provider message IDs

    Returns:
        EventReplayResponse: Status for each message ID
    """
    results: list[dict[str, Any]] = []
    found = 0

    for message_id in request.provider_message_ids:
        # Check cached status first
        cached = await email_delivery_service.get_delivery_status(message_id)

        if cached:
            found += 1
            results.append({
                "provider_message_id": message_id,
                "status": cached.get("status"),
                "source": "cache",
                "updated_at": cached.get("updated_at"),
            })
            continue

        # Check database
        log = await notification_repository.get_delivery_log_by_provider_message_id(
            provider_message_id=message_id,
        )

        if log:
            found += 1
            results.append({
                "provider_message_id": message_id,
                "status": log.status.value,
                "source": "database",
                "delivered_at": log.delivered_at.isoformat() if log.delivered_at else None,
                "opened_at": log.opened_at.isoformat() if log.opened_at else None,
                "clicked_at": log.clicked_at.isoformat() if log.clicked_at else None,
                "bounce_type": log.bounce_type,
                "bounce_reason": log.bounce_reason,
            })
        else:
            results.append({
                "provider_message_id": message_id,
                "status": None,
                "source": None,
                "error": "Not found",
            })

    return EventReplayResponse(
        queried=len(request.provider_message_ids),
        found=found,
        results=results,
    )


# =============================================================================
# Webhook Statistics Endpoint
# =============================================================================


class WebhookStatsResponse(BaseModel):
    """Webhook processing statistics."""

    total_events_24h: int = Field(default=0, description="Total events in last 24 hours")
    events_by_type: dict[str, int] = Field(
        default_factory=dict, description="Events grouped by type"
    )
    bounce_rate: float = Field(default=0.0, description="Bounce rate percentage")
    spam_report_rate: float = Field(default=0.0, description="Spam report rate percentage")
    open_rate: float = Field(default=0.0, description="Open rate percentage")
    click_rate: float = Field(default=0.0, description="Click rate percentage")


@router.get(
    "/sendgrid/stats",
    response_model=WebhookStatsResponse,
    summary="Get webhook statistics",
    description="Get aggregated webhook event statistics.",
)
async def get_webhook_stats() -> WebhookStatsResponse:
    """
    Get aggregated webhook processing statistics.

    Returns metrics about webhook events processed, including
    delivery rates, engagement metrics, and error rates.

    Note: This is a placeholder that returns static data.
    In production, this would query Redis or the database for
    aggregated statistics.

    Returns:
        WebhookStatsResponse: Aggregated statistics
    """
    # Placeholder implementation
    # In production, this would query actual metrics from
    # Prometheus, Redis, or the database
    return WebhookStatsResponse(
        total_events_24h=0,
        events_by_type={},
        bounce_rate=0.0,
        spam_report_rate=0.0,
        open_rate=0.0,
        click_rate=0.0,
    )
