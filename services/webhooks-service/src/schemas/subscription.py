"""
Pydantic schemas for webhook subscriptions.
"""

from datetime import datetime
from typing import Optional, List, Dict, Any
from uuid import UUID

from pydantic import BaseModel, Field, HttpUrl, field_validator


class CreateWebhookSubscriptionRequest(BaseModel):
    """Request to create a webhook subscription."""

    name: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Human-readable name for the webhook",
    )
    description: Optional[str] = Field(
        None,
        max_length=1000,
        description="Optional description",
    )
    endpoint_url: str = Field(
        ...,
        description="HTTPS URL to receive webhook payloads",
    )
    event_types: List[str] = Field(
        ...,
        min_length=1,
        description="List of event types to subscribe to",
    )
    http_method: str = Field(
        default="POST",
        description="HTTP method (POST, PUT, PATCH)",
    )
    custom_headers: Dict[str, str] = Field(
        default_factory=dict,
        description="Custom headers to include in requests",
    )
    max_retries: int = Field(
        default=5,
        ge=0,
        le=10,
        description="Maximum retry attempts",
    )
    timeout_seconds: int = Field(
        default=30,
        ge=5,
        le=60,
        description="HTTP request timeout in seconds",
    )
    payload_version: str = Field(
        default="v1",
        description="Payload format version",
    )
    is_active: bool = Field(
        default=True,
        description="Whether the webhook is active",
    )

    @field_validator("endpoint_url")
    @classmethod
    def validate_endpoint_url(cls, v: str) -> str:
        if not v.startswith(("http://", "https://")):
            raise ValueError("Endpoint URL must start with http:// or https://")
        return v

    @field_validator("http_method")
    @classmethod
    def validate_http_method(cls, v: str) -> str:
        v = v.upper()
        if v not in ("POST", "PUT", "PATCH"):
            raise ValueError("HTTP method must be POST, PUT, or PATCH")
        return v


class UpdateWebhookSubscriptionRequest(BaseModel):
    """Request to update a webhook subscription."""

    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    endpoint_url: Optional[str] = None
    event_types: Optional[List[str]] = None
    http_method: Optional[str] = None
    custom_headers: Optional[Dict[str, str]] = None
    max_retries: Optional[int] = Field(None, ge=0, le=10)
    timeout_seconds: Optional[int] = Field(None, ge=5, le=60)
    payload_version: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("endpoint_url")
    @classmethod
    def validate_endpoint_url(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not v.startswith(("http://", "https://")):
            raise ValueError("Endpoint URL must start with http:// or https://")
        return v

    @field_validator("http_method")
    @classmethod
    def validate_http_method(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.upper()
            if v not in ("POST", "PUT", "PATCH"):
                raise ValueError("HTTP method must be POST, PUT, or PATCH")
        return v


class WebhookSubscriptionResponse(BaseModel):
    """Response for a webhook subscription."""

    subscription_id: UUID
    workspace_id: UUID
    name: str
    description: Optional[str]
    endpoint_url: str
    http_method: str
    event_types: List[str]
    custom_headers: Dict[str, str]
    max_retries: int
    timeout_seconds: int
    payload_version: str
    is_active: bool
    secret_version: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class WebhookSubscriptionDetailResponse(WebhookSubscriptionResponse):
    """Detailed response with stats."""

    created_by_user_id: Optional[UUID]
    total_deliveries: int = 0
    successful_deliveries: int = 0
    failed_deliveries: int = 0
    last_delivery_at: Optional[datetime] = None
    success_rate: float = 0.0


class SecretRotationResponse(BaseModel):
    """Response when rotating webhook secret."""

    new_secret: str = Field(
        description="New webhook secret (only shown once)"
    )
    secret_version: int
    old_secret_valid_until: datetime


class WebhookTestRequest(BaseModel):
    """Request to test a webhook."""

    event_type: str = Field(
        default="test.ping",
        description="Event type for test payload",
    )


class WebhookTestResponse(BaseModel):
    """Response from webhook test."""

    success: bool
    status_code: Optional[int]
    response_body: Optional[str]
    duration_ms: int
    error: Optional[str]
