"""
Webhook event schemas for gallery service.

Defines Pydantic schemas for webhook events, payloads, and delivery tracking.
Follows the RawDrive webhook event specification from backend migrations.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID
from pydantic import BaseModel, Field, HttpUrl, field_validator
from enum import Enum


class WebhookEventType(str, Enum):
    """Gallery webhook event types."""

    GALLERY_CREATED = "gallery.created"
    GALLERY_UPDATED = "gallery.updated"
    GALLERY_DELETED = "gallery.deleted"
    GALLERY_ASSET_ADDED = "gallery_asset.added"
    GALLERY_ASSET_REMOVED = "gallery_asset.removed"
    GALLERY_PUBLISHED = "gallery.published"
    GALLERY_ACCESSED = "gallery.accessed"
    GALLERY_VIEWED = "gallery.viewed"
    GALLERY_SHARED = "gallery.shared"
    GALLERY_DOWNLOADED = "gallery.downloaded"
    GALLERY_EXPIRED = "gallery.expired"
    GALLERY_SELECTION_SUBMITTED = "gallery.selection_submitted"


class WebhookDeliveryStatus(str, Enum):
    """Webhook delivery status."""

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    RETRYING = "retrying"
    EXHAUSTED = "exhausted"


class GalleryCreatedPayload(BaseModel):
    """Payload for gallery.created event."""

    gallery_id: UUID = Field(..., description="Unique identifier for the gallery")
    workspace_id: UUID = Field(..., description="Workspace that owns the gallery")
    title: str = Field(..., description="Gallery title")
    slug: Optional[str] = Field(None, description="URL-friendly slug")
    created_by_user_id: UUID = Field(..., description="User who created the gallery")
    created_at: datetime = Field(..., description="Creation timestamp")
    is_template: bool = Field(default=False, description="Whether this is a template gallery")


class GalleryUpdatedPayload(BaseModel):
    """Payload for gallery.updated event."""

    gallery_id: UUID = Field(..., description="Unique identifier for the gallery")
    workspace_id: UUID = Field(..., description="Workspace that owns the gallery")
    title: str = Field(..., description="Updated gallery title")
    updated_by_user_id: UUID = Field(..., description="User who updated the gallery")
    updated_fields: List[str] = Field(
        ...,
        description="List of fields that were updated (e.g., ['title', 'cover_image'])"
    )
    updated_at: datetime = Field(..., description="Update timestamp")


class GalleryDeletedPayload(BaseModel):
    """Payload for gallery.deleted event."""

    gallery_id: UUID = Field(..., description="Unique identifier for the deleted gallery")
    workspace_id: UUID = Field(..., description="Workspace that owned the gallery")
    title: str = Field(..., description="Title of the deleted gallery")
    deleted_by_user_id: UUID = Field(..., description="User who deleted the gallery")
    deleted_at: datetime = Field(..., description="Deletion timestamp")
    reason: Optional[str] = Field(None, description="Optional reason for deletion")


class GalleryAssetAddedPayload(BaseModel):
    """Payload for gallery_asset.added event."""

    gallery_id: UUID = Field(..., description="Gallery that received the asset")
    workspace_id: UUID = Field(..., description="Workspace that owns the gallery")
    asset_id: UUID = Field(..., description="Unique identifier for the added asset")
    filename: str = Field(..., description="Original filename")
    content_type: str = Field(..., description="MIME type (e.g., 'image/jpeg')")
    size_bytes: int = Field(..., description="File size in bytes")
    added_by_user_id: Optional[UUID] = Field(None, description="User who added the asset")
    added_at: datetime = Field(..., description="Addition timestamp")
    position: Optional[int] = Field(None, description="Position in gallery (0-indexed)")


class GalleryAssetRemovedPayload(BaseModel):
    """Payload for gallery_asset.removed event."""

    gallery_id: UUID = Field(..., description="Gallery that lost the asset")
    workspace_id: UUID = Field(..., description="Workspace that owns the gallery")
    asset_id: UUID = Field(..., description="Unique identifier for the removed asset")
    removed_by_user_id: Optional[UUID] = Field(None, description="User who removed the asset")
    removed_at: datetime = Field(..., description="Removal timestamp")
    reason: Optional[str] = Field(None, description="Optional reason for removal")


class GalleryPublishedPayload(BaseModel):
    """Payload for gallery.published event."""

    gallery_id: UUID = Field(..., description="Unique identifier for the gallery")
    workspace_id: UUID = Field(..., description="Workspace that owns the gallery")
    title: str = Field(..., description="Gallery title")
    published_by_user_id: UUID = Field(..., description="User who published the gallery")
    published_at: datetime = Field(..., description="Publication timestamp")
    photo_count: int = Field(..., description="Number of photos in gallery")
    video_count: int = Field(default=0, description="Number of videos in gallery")
    magic_link_url: Optional[HttpUrl] = Field(None, description="Magic link URL if created")
    expires_at: Optional[datetime] = Field(None, description="Expiration date if set")
    download_policy: str = Field(
        default="watermarked_only",
        description="Download policy: view_only, web_only, watermarked_only, original_allowed"
    )


class GalleryAccessedPayload(BaseModel):
    """Payload for gallery.accessed event."""

    gallery_id: UUID = Field(..., description="Unique identifier for the gallery")
    workspace_id: UUID = Field(..., description="Workspace that owns the gallery")
    title: str = Field(..., description="Gallery title")
    accessed_at: datetime = Field(..., description="Access timestamp")
    access_method: str = Field(
        ...,
        description="How the gallery was accessed: magic_link, direct, email"
    )
    client_identifier: Optional[str] = Field(
        None,
        description="Client identifier (email, user_id, or session_id)"
    )
    ip_address: Optional[str] = Field(None, description="Client IP address")
    user_agent: Optional[str] = Field(None, description="Client user agent")


class WebhookEvent(BaseModel):
    """Standard webhook event envelope."""

    id: UUID = Field(..., description="Unique event identifier")
    event_type: WebhookEventType = Field(..., description="Type of event")
    workspace_id: UUID = Field(..., description="Workspace that owns the event")
    payload: Dict[str, Any] = Field(..., description="Event payload (type-specific)")
    timestamp: datetime = Field(..., description="Event timestamp")
    version: str = Field(default="v1", description="Payload format version")


class WebhookDeliveryAttempt(BaseModel):
    """Represents a single webhook delivery attempt."""

    delivery_id: UUID = Field(..., description="Unique delivery identifier")
    subscription_id: UUID = Field(..., description="Webhook subscription receiving the event")
    event_id: UUID = Field(..., description="Event being delivered")
    event_type: str = Field(..., description="Type of event being delivered")
    status: WebhookDeliveryStatus = Field(..., description="Current delivery status")

    request_url: str = Field(..., description="URL webhook was sent to")
    request_method: str = Field(default="POST", description="HTTP method used")
    request_timestamp: Optional[datetime] = Field(None, description="When request was sent")

    response_status_code: Optional[int] = Field(None, description="HTTP response status")
    response_timestamp: Optional[datetime] = Field(None, description="When response was received")
    response_duration_ms: Optional[int] = Field(None, description="Request duration in ms")

    attempt_number: int = Field(..., description="Current attempt number (1-indexed)")
    max_attempts: int = Field(..., description="Maximum retry attempts allowed")
    next_retry_at: Optional[datetime] = Field(None, description="Scheduled next retry time")

    error_code: Optional[str] = Field(None, description="Error classification code")
    error_message: Optional[str] = Field(None, description="Human-readable error message")

    created_at: datetime = Field(..., description="Delivery creation timestamp")


class WebhookSubscription(BaseModel):
    """Webhook subscription configuration."""

    subscription_id: UUID = Field(..., description="Unique subscription identifier")
    workspace_id: UUID = Field(..., description="Workspace that owns the subscription")
    name: str = Field(..., description="Human-readable name")
    description: Optional[str] = Field(None, description="Optional description")

    endpoint_url: str = Field(..., description="HTTPS URL to receive webhooks")
    http_method: str = Field(default="POST", description="HTTP method: POST, PUT, PATCH")

    event_types: List[str] = Field(..., description="Event types to subscribe to")
    event_filters: Dict[str, Any] = Field(default_factory=dict, description="Event filters")

    is_active: bool = Field(default=True, description="Whether subscription is active")
    include_payload: bool = Field(default=True, description="Whether to include full payload")

    max_retries: int = Field(default=5, description="Maximum retry attempts")
    timeout_seconds: int = Field(default=30, description="HTTP request timeout")

    created_at: datetime = Field(..., description="Subscription creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")

    @field_validator("endpoint_url")
    @classmethod
    def validate_endpoint_url(cls, v: str) -> str:
        """Validate that endpoint URL is HTTPS."""
        if not v.startswith(("https://", "http://localhost", "http://127.0.0.1")):
            raise ValueError("endpoint_url must use HTTPS (except for localhost)")
        return v

    @field_validator("http_method")
    @classmethod
    def validate_http_method(cls, v: str) -> str:
        """Validate HTTP method."""
        if v.upper() not in ["POST", "PUT", "PATCH"]:
            raise ValueError("http_method must be POST, PUT, or PATCH")
        return v.upper()


class WebhookMetrics(BaseModel):
    """Webhook delivery metrics."""

    total_deliveries: int = Field(..., description="Total delivery attempts")
    successful_deliveries: int = Field(..., description="Successful deliveries")
    failed_deliveries: int = Field(..., description="Failed deliveries")
    pending_deliveries: int = Field(..., description="Pending deliveries")
    exhausted_deliveries: int = Field(..., description="Exhausted retry attempts")

    avg_delivery_time_ms: Optional[float] = Field(
        None,
        description="Average successful delivery time in milliseconds"
    )
    success_rate: float = Field(..., description="Success rate (0-1)")

    last_delivery_at: Optional[datetime] = Field(None, description="Last delivery timestamp")
    last_failure_at: Optional[datetime] = Field(None, description="Last failure timestamp")


class WebhookEventBatch(BaseModel):
    """Batch of webhook events for bulk publishing."""

    events: List[WebhookEvent] = Field(..., description="Events to publish")
    workspace_id: UUID = Field(..., description="Workspace context")
    batch_id: Optional[UUID] = Field(None, description="Optional batch identifier")

    @field_validator("events")
    @classmethod
    def validate_batch_size(cls, v: List[WebhookEvent]) -> List[WebhookEvent]:
        """Validate batch size limits."""
        if len(v) > 100:
            raise ValueError("Maximum batch size is 100 events")
        if len(v) == 0:
            raise ValueError("Batch must contain at least one event")
        return v


# Type mapping for event types to payload models
EVENT_PAYLOAD_MAPPING = {
    WebhookEventType.GALLERY_CREATED: GalleryCreatedPayload,
    WebhookEventType.GALLERY_UPDATED: GalleryUpdatedPayload,
    WebhookEventType.GALLERY_DELETED: GalleryDeletedPayload,
    WebhookEventType.GALLERY_ASSET_ADDED: GalleryAssetAddedPayload,
    WebhookEventType.GALLERY_ASSET_REMOVED: GalleryAssetRemovedPayload,
    WebhookEventType.GALLERY_PUBLISHED: GalleryPublishedPayload,
    WebhookEventType.GALLERY_ACCESSED: GalleryAccessedPayload,
}


__all__ = [
    "WebhookEventType",
    "WebhookDeliveryStatus",
    "GalleryCreatedPayload",
    "GalleryUpdatedPayload",
    "GalleryDeletedPayload",
    "GalleryAssetAddedPayload",
    "GalleryAssetRemovedPayload",
    "GalleryPublishedPayload",
    "GalleryAccessedPayload",
    "WebhookEvent",
    "WebhookDeliveryAttempt",
    "WebhookSubscription",
    "WebhookMetrics",
    "WebhookEventBatch",
    "EVENT_PAYLOAD_MAPPING",
]
