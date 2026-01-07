"""Pydantic schemas for notification events and delivery.

This module contains all schemas for the notification event system:
- Request schemas for creating and managing notifications
- Response schemas for API endpoints
- Internal schemas for processing and delivery tracking

Feature: Notifications & Communication Microservice
Task: T015 - Create Pydantic schemas for notifications
"""

from datetime import datetime
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


# =============================================================================
# ENUMS - Match database enum types from migrations
# =============================================================================


class NotificationChannel(str, Enum):
    """Notification delivery channel.

    Maps to notification_channel enum in database.
    """

    EMAIL = "email"
    SMS = "sms"
    IN_APP = "in_app"
    PUSH = "push"


class NotificationCategory(str, Enum):
    """High-level notification category for preference matching.

    Maps to notification_category enum in database.
    """

    GALLERY_ACTIVITY = "gallery_activity"
    CLIENT_INTERACTIONS = "client_interactions"
    SYSTEM_ALERTS = "system_alerts"
    BILLING = "billing"
    MARKETING = "marketing"
    INVITATION = "invitation"


class NotificationPriority(str, Enum):
    """Notification processing priority.

    Maps to notification_priority enum in database.
    """

    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class NotificationEventStatus(str, Enum):
    """Status of a notification event through its lifecycle.

    Maps to notification_event_status enum in database.
    """

    PENDING = "pending"
    PROCESSING = "processing"
    SENT = "sent"
    DELIVERED = "delivered"
    FAILED = "failed"
    CANCELLED = "cancelled"
    SKIPPED = "skipped"


class NotificationDeliveryStatus(str, Enum):
    """Status of a delivery attempt.

    Maps to notification_delivery_status enum in database.
    """

    PENDING = "pending"
    QUEUED = "queued"
    SENT = "sent"
    DELIVERED = "delivered"
    OPENED = "opened"
    CLICKED = "clicked"
    BOUNCED = "bounced"
    FAILED = "failed"
    REJECTED = "rejected"
    UNSUBSCRIBED = "unsubscribed"
    SPAM_REPORTED = "spam_reported"
    DEFERRED = "deferred"


class NotificationProvider(str, Enum):
    """Notification delivery provider.

    Maps to notification_provider enum in database.
    """

    SENDGRID = "sendgrid"
    TWILIO = "twilio"
    FIREBASE = "firebase"
    INTERNAL = "internal"
    MOCK = "mock"


# =============================================================================
# COMMON SCHEMAS
# =============================================================================


class PaginationMeta(BaseModel):
    """Pagination metadata for list responses."""

    page: int = Field(..., ge=1, description="Current page number")
    limit: int = Field(..., ge=1, le=100, description="Items per page")
    total: int = Field(..., ge=0, description="Total number of items")
    total_pages: int = Field(..., ge=0, description="Total number of pages")
    has_more: bool = Field(default=False, description="Whether there are more pages")


class ErrorResponse(BaseModel):
    """Standard error response."""

    error: str = Field(..., description="Error code")
    message: str = Field(..., description="Human-readable error message")
    details: Optional[Any] = Field(None, description="Additional error details")
    correlation_id: Optional[str] = Field(None, description="Request correlation ID")


class SuccessResponse(BaseModel):
    """Generic success response."""

    success: bool = Field(default=True)
    message: Optional[str] = Field(None, description="Success message")


# =============================================================================
# NOTIFICATION EVENT SCHEMAS - Request
# =============================================================================


class NotificationRecipient(BaseModel):
    """Recipient information for a notification."""

    user_id: Optional[UUID] = Field(None, description="User ID for registered users")
    email: Optional[EmailStr] = Field(None, description="Email address")
    phone: Optional[str] = Field(
        None,
        max_length=20,
        pattern=r"^\+?[1-9]\d{1,14}$",
        description="Phone number in E.164 format",
    )

    @field_validator("phone", mode="before")
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        """Normalize phone number format."""
        if v is None:
            return None
        # Remove spaces and dashes
        return v.replace(" ", "").replace("-", "")

    def model_post_init(self, __context: Any) -> None:
        """Validate that at least one recipient identifier is provided."""
        if not any([self.user_id, self.email, self.phone]):
            raise ValueError("At least one of user_id, email, or phone must be provided")


class NotificationCreateRequest(BaseModel):
    """Request schema for creating a new notification event."""

    # Recipient (required)
    recipient: NotificationRecipient = Field(..., description="Notification recipient")

    # Event classification (required)
    event_type: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Specific event type (e.g., gallery.published, billing.payment_failed)",
    )
    category: NotificationCategory = Field(..., description="Notification category")
    channel: NotificationChannel = Field(..., description="Delivery channel")

    # Priority (optional, defaults to normal)
    priority: NotificationPriority = Field(
        default=NotificationPriority.NORMAL,
        description="Processing priority",
    )

    # Template (optional - can use template_id or template_code)
    template_id: Optional[UUID] = Field(None, description="Template UUID")
    template_code: Optional[str] = Field(
        None, max_length=100, description="Template code for lookup"
    )

    # Content
    subject: Optional[str] = Field(
        None, max_length=500, description="Notification subject (for email)"
    )
    payload: dict[str, Any] = Field(
        default_factory=dict,
        description="Template variables and additional context",
    )

    # Scheduling (optional)
    scheduled_for: Optional[datetime] = Field(
        None, description="Schedule notification for future delivery"
    )

    # Idempotency (optional)
    idempotency_key: Optional[str] = Field(
        None,
        max_length=255,
        description="Unique key to prevent duplicate notifications",
    )

    # Correlation (optional)
    correlation_id: Optional[UUID] = Field(
        None, description="Links related notifications"
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "recipient": {"email": "client@example.com"},
                "event_type": "gallery.published",
                "category": "gallery_activity",
                "channel": "email",
                "priority": "normal",
                "template_code": "gallery_published",
                "subject": "Your gallery is ready!",
                "payload": {
                    "gallery_name": "Wedding Photos",
                    "gallery_url": "https://gallery.example.com/abc123",
                    "photographer_name": "John Smith",
                },
            }
        }
    )


class NotificationBatchCreateRequest(BaseModel):
    """Request schema for creating multiple notifications at once."""

    notifications: list[NotificationCreateRequest] = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="List of notifications to create",
    )

    # Shared correlation ID for the batch
    correlation_id: Optional[UUID] = Field(
        None, description="Correlation ID for all notifications in batch"
    )


class NotificationCancelRequest(BaseModel):
    """Request schema for cancelling a pending notification."""

    reason: Optional[str] = Field(
        None, max_length=255, description="Reason for cancellation"
    )


class NotificationRetryRequest(BaseModel):
    """Request schema for retrying a failed notification."""

    reset_retry_count: bool = Field(
        default=False,
        description="Whether to reset the retry counter",
    )


# =============================================================================
# NOTIFICATION EVENT SCHEMAS - Response
# =============================================================================


class NotificationEventResponse(BaseModel):
    """Full notification event response."""

    event_id: UUID
    workspace_id: UUID

    # Recipient
    recipient_user_id: Optional[UUID] = None
    recipient_email: Optional[str] = None
    recipient_phone: Optional[str] = None

    # Event classification
    event_type: str
    category: NotificationCategory
    channel: NotificationChannel
    priority: NotificationPriority

    # Template
    template_id: Optional[UUID] = None
    template_code: Optional[str] = None
    subject: Optional[str] = None
    payload: dict[str, Any] = Field(default_factory=dict)

    # Processing status
    status: NotificationEventStatus
    error_message: Optional[str] = None
    retry_count: int = 0
    max_retries: int = 3

    # Tracking
    idempotency_key: Optional[str] = None
    correlation_id: Optional[UUID] = None
    source_service: Optional[str] = None

    # Scheduling
    scheduled_for: Optional[datetime] = None

    # Timestamps
    created_at: datetime
    updated_at: datetime
    processed_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class NotificationEventSummary(BaseModel):
    """Lightweight notification summary for list responses."""

    event_id: UUID
    event_type: str
    category: NotificationCategory
    channel: NotificationChannel
    priority: NotificationPriority
    status: NotificationEventStatus
    recipient_email: Optional[str] = None
    subject: Optional[str] = None
    created_at: datetime
    delivered_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class NotificationListResponse(BaseModel):
    """Paginated list of notifications."""

    data: list[NotificationEventSummary]
    meta: PaginationMeta


class NotificationBatchCreateResponse(BaseModel):
    """Response for batch notification creation."""

    created: int = Field(..., description="Number of notifications created")
    failed: int = Field(..., description="Number of notifications that failed")
    event_ids: list[UUID] = Field(
        default_factory=list, description="IDs of created notifications"
    )
    errors: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Error details for failed notifications",
    )
    correlation_id: Optional[UUID] = None


# =============================================================================
# NOTIFICATION DELIVERY LOG SCHEMAS
# =============================================================================


class DeliveryLogResponse(BaseModel):
    """Delivery log entry response."""

    log_id: UUID
    workspace_id: UUID
    event_id: UUID

    # Delivery details
    channel: NotificationChannel
    provider: NotificationProvider
    status: NotificationDeliveryStatus
    attempt_number: int

    # Recipient
    recipient_email: Optional[str] = None
    recipient_phone: Optional[str] = None
    recipient_user_id: Optional[UUID] = None

    # Provider response
    provider_message_id: Optional[str] = None
    provider_http_status: Optional[int] = None
    provider_error_code: Optional[str] = None
    provider_error_message: Optional[str] = None

    # Engagement metrics
    opened_at: Optional[datetime] = None
    open_count: int = 0
    clicked_at: Optional[datetime] = None
    click_count: int = 0

    # Bounce details
    bounce_type: Optional[str] = None
    bounce_reason: Optional[str] = None
    recipient_invalidated: bool = False

    # Timing
    created_at: datetime
    queued_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    failed_at: Optional[datetime] = None
    updated_at: datetime

    # Cost
    cost_cents: int = 0

    model_config = ConfigDict(from_attributes=True)


class DeliveryLogSummary(BaseModel):
    """Lightweight delivery log summary."""

    log_id: UUID
    event_id: UUID
    channel: NotificationChannel
    provider: NotificationProvider
    status: NotificationDeliveryStatus
    attempt_number: int
    created_at: datetime
    delivered_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class DeliveryLogListResponse(BaseModel):
    """Paginated list of delivery logs."""

    data: list[DeliveryLogSummary]
    meta: PaginationMeta


# =============================================================================
# NOTIFICATION STATISTICS SCHEMAS
# =============================================================================


class NotificationStats(BaseModel):
    """Notification statistics for a workspace."""

    total_sent: int = Field(default=0, description="Total notifications sent")
    total_delivered: int = Field(default=0, description="Total notifications delivered")
    total_failed: int = Field(default=0, description="Total notifications failed")
    total_pending: int = Field(default=0, description="Total notifications pending")

    # By channel
    email_sent: int = 0
    email_delivered: int = 0
    sms_sent: int = 0
    sms_delivered: int = 0
    in_app_sent: int = 0
    in_app_delivered: int = 0
    push_sent: int = 0
    push_delivered: int = 0

    # Engagement
    total_opened: int = 0
    total_clicked: int = 0
    open_rate: float = Field(default=0.0, ge=0.0, le=100.0)
    click_rate: float = Field(default=0.0, ge=0.0, le=100.0)

    # Time period
    period_start: Optional[datetime] = None
    period_end: Optional[datetime] = None


class NotificationStatsByCategory(BaseModel):
    """Statistics grouped by notification category."""

    category: NotificationCategory
    sent: int = 0
    delivered: int = 0
    failed: int = 0
    open_rate: float = 0.0
    click_rate: float = 0.0


class NotificationStatsResponse(BaseModel):
    """Full statistics response."""

    overall: NotificationStats
    by_category: list[NotificationStatsByCategory] = Field(default_factory=list)


# =============================================================================
# WEBHOOK SCHEMAS
# =============================================================================


class SendGridWebhookEvent(BaseModel):
    """SendGrid webhook event payload."""

    email: str = Field(..., description="Recipient email")
    timestamp: int = Field(..., description="Unix timestamp")
    event: str = Field(..., description="Event type")
    sg_message_id: Optional[str] = Field(None, description="SendGrid message ID")
    sg_event_id: Optional[str] = Field(None, description="SendGrid event ID")
    category: Optional[list[str]] = Field(None, description="Categories")
    reason: Optional[str] = Field(None, description="Reason for bounce/drop")
    status: Optional[str] = Field(None, description="SMTP status code")
    type: Optional[str] = Field(None, description="Bounce type")
    url: Optional[str] = Field(None, description="Clicked URL")
    useragent: Optional[str] = Field(None, description="User agent")
    ip: Optional[str] = Field(None, description="IP address")

    model_config = ConfigDict(extra="allow")


class SendGridWebhookPayload(BaseModel):
    """SendGrid webhook request payload (array of events)."""

    events: list[SendGridWebhookEvent] = Field(default_factory=list)

    @classmethod
    def parse_events(cls, raw_events: list[dict[str, Any]]) -> "SendGridWebhookPayload":
        """Parse raw webhook events into payload."""
        events = [SendGridWebhookEvent(**event) for event in raw_events]
        return cls(events=events)


# =============================================================================
# INTERNAL PROCESSING SCHEMAS
# =============================================================================


class NotificationTask(BaseModel):
    """Internal schema for notification processing task."""

    event_id: UUID
    workspace_id: UUID
    channel: NotificationChannel
    priority: NotificationPriority
    attempt_number: int = 1

    # Recipient
    recipient_email: Optional[str] = None
    recipient_phone: Optional[str] = None
    recipient_user_id: Optional[UUID] = None

    # Content
    template_id: Optional[UUID] = None
    template_code: Optional[str] = None
    subject: Optional[str] = None
    payload: dict[str, Any] = Field(default_factory=dict)

    # Rendered content (filled by template service)
    rendered_subject: Optional[str] = None
    rendered_body_html: Optional[str] = None
    rendered_body_text: Optional[str] = None

    # Metadata
    correlation_id: Optional[UUID] = None
    idempotency_key: Optional[str] = None


class NotificationResult(BaseModel):
    """Result of notification processing."""

    event_id: UUID
    success: bool
    status: NotificationEventStatus
    provider: Optional[NotificationProvider] = None
    provider_message_id: Optional[str] = None
    error_message: Optional[str] = None
    error_code: Optional[str] = None
    delivered_at: Optional[datetime] = None
    should_retry: bool = False
