"""
Audit event schemas for the Invitations Microservice.

Defines Pydantic models for audit logging and compliance reporting.
"""

from datetime import datetime
from typing import Any, Optional, List

from pydantic import BaseModel, Field


class AuditEvent(BaseModel):
    """Schema for a single audit event."""

    event_id: str = Field(
        ...,
        description="Unique identifier for this audit event",
    )
    action: str = Field(
        ...,
        description="Action type: guest.create, rsvp.submit, etc.",
    )
    resource_type: str = Field(
        ...,
        description="Type of resource: guest, invitation, rsvp",
    )
    resource_id: str = Field(
        ...,
        description="ID of the affected resource",
    )
    actor_id: str = Field(
        ...,
        description="ID of the user who performed the action",
    )
    changes: Optional[dict] = Field(
        None,
        description="Before/after values for updates",
    )
    metadata: Optional[dict] = Field(
        None,
        description="Additional context (batch_id, count, etc.)",
    )
    created_at: datetime = Field(
        ...,
        description="When the event occurred",
    )


class AuditLogResponse(BaseModel):
    """Schema for paginated audit log response."""

    events: List[AuditEvent] = Field(
        ...,
        description="List of audit events",
    )
    total: int = Field(
        ...,
        description="Total number of matching events",
    )
    has_more: bool = Field(
        ...,
        description="Whether more events exist beyond this page",
    )


class AuditEventCreate(BaseModel):
    """Schema for creating an audit event."""

    workspace_id: str = Field(
        ...,
        description="Workspace context for the event",
    )
    actor_id: str = Field(
        ...,
        description="ID of the user performing the action",
    )
    action: str = Field(
        ...,
        pattern="^(guest\\.(create|update|delete|bulk_import|bulk_invite)|rsvp\\.(submit|update)|invitation\\.(view|create|update|delete))$",
        description="Action type",
    )
    resource_type: str = Field(
        ...,
        pattern="^(guest|invitation|rsvp)$",
        description="Type of resource affected",
    )
    resource_id: str = Field(
        ...,
        description="ID of the affected resource",
    )
    changes: Optional[dict] = Field(
        None,
        description="Before/after values for updates",
    )
    metadata: Optional[dict] = Field(
        None,
        description="Additional context",
    )
    ip_address: Optional[str] = Field(
        None,
        max_length=45,
        description="Client IP address (IPv4 or IPv6)",
    )
    user_agent: Optional[str] = Field(
        None,
        description="Client user agent string",
    )


class AuditQueryParams(BaseModel):
    """Schema for audit log query parameters."""

    resource_type: Optional[str] = Field(
        None,
        pattern="^(guest|invitation|rsvp)$",
        description="Filter by resource type",
    )
    action: Optional[str] = Field(
        None,
        description="Filter by action type",
    )
    from_date: Optional[datetime] = Field(
        None,
        description="Filter events from this date (inclusive)",
    )
    to_date: Optional[datetime] = Field(
        None,
        description="Filter events to this date (exclusive)",
    )
    actor_id: Optional[str] = Field(
        None,
        description="Filter by actor ID",
    )
    resource_id: Optional[str] = Field(
        None,
        description="Filter by resource ID",
    )
    limit: int = Field(
        50,
        ge=1,
        le=100,
        description="Maximum number of events to return",
    )
    offset: int = Field(
        0,
        ge=0,
        description="Number of events to skip",
    )
