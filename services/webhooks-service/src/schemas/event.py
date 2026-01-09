"""
Pydantic schemas for webhook events.
"""

from datetime import datetime
from typing import Optional, List, Dict, Any
from uuid import UUID
from enum import Enum

from pydantic import BaseModel, Field


class WebhookEventStatus(str, Enum):
    """Event processing status."""
    PENDING = "pending"
    PROCESSING = "processing"
    DELIVERED = "delivered"
    PARTIALLY_DELIVERED = "partially_delivered"
    FAILED = "failed"
    SKIPPED = "skipped"


class WebhookEventResponse(BaseModel):
    """Response for a webhook event."""

    event_id: UUID
    workspace_id: UUID
    event_type: str
    event_version: str
    status: WebhookEventStatus
    subscriber_count: int
    delivery_count: int
    success_count: int
    failure_count: int
    source_service: str
    source_entity_id: Optional[UUID]
    source_entity_type: Optional[str]
    idempotency_key: Optional[str]
    correlation_id: Optional[UUID]
    occurred_at: datetime
    created_at: datetime
    processed_at: Optional[datetime]

    class Config:
        from_attributes = True


class WebhookEventDetailResponse(WebhookEventResponse):
    """Detailed event response with payload."""

    payload: Dict[str, Any]
    metadata: Dict[str, Any]


class WebhookEventTypeCategory(str, Enum):
    """Event type categories."""
    WORKSPACE = "workspace"
    SUBSCRIPTION = "subscription"
    USER = "user"
    ASSET = "asset"
    GALLERY = "gallery"
    INVITATION = "invitation"
    CLIENT = "client"


class WebhookEventTypeResponse(BaseModel):
    """Response for event type catalog entry."""

    event_type: str
    category: str
    name: str
    description: Optional[str]
    is_active: bool
    introduced_version: str
    deprecated_version: Optional[str]

    class Config:
        from_attributes = True


class WebhookEventTypeDetailResponse(WebhookEventTypeResponse):
    """Detailed event type with schema."""

    payload_schema: Optional[Dict[str, Any]]
    sample_payload: Optional[Dict[str, Any]]
