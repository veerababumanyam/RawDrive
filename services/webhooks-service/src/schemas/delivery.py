"""
Pydantic schemas for webhook deliveries.
"""

from datetime import datetime
from typing import Optional, Dict, Any
from uuid import UUID
from enum import Enum

from pydantic import BaseModel, Field


class WebhookDeliveryStatus(str, Enum):
    """Delivery status."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    RETRYING = "retrying"
    EXHAUSTED = "exhausted"
    CANCELLED = "cancelled"


class WebhookDeliveryResponse(BaseModel):
    """Response for a webhook delivery."""

    delivery_id: UUID
    event_id: UUID
    subscription_id: UUID
    workspace_id: UUID
    event_type: str
    status: WebhookDeliveryStatus
    request_url: str
    request_method: str
    response_status_code: Optional[int]
    response_duration_ms: Optional[int]
    attempt_number: int
    max_attempts: int
    next_retry_at: Optional[datetime]
    error_code: Optional[str]
    error_message: Optional[str]
    created_at: datetime
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True


class WebhookDeliveryDetailResponse(WebhookDeliveryResponse):
    """Detailed delivery response with request/response data."""

    request_headers: Optional[Dict[str, Any]]
    request_body: Optional[Dict[str, Any]]
    response_headers: Optional[Dict[str, Any]]
    response_body: Optional[str]
    error_details: Optional[Dict[str, Any]]
    signature_sent: Optional[str]
    circuit_breaker_blocked: bool


class DeadLetterQueueItem(BaseModel):
    """Item in the dead letter queue."""

    delivery_id: UUID
    event_id: UUID
    subscription_id: UUID
    workspace_id: UUID
    endpoint_url: str
    event_type: str
    last_error: str
    attempts: int
    exhausted_at: datetime

    class Config:
        from_attributes = True
