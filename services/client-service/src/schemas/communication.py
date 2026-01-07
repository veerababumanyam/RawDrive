"""
Pydantic schemas for client communication history.

Tracks all communications with clients:
- Emails sent/received
- Phone calls
- SMS messages
- In-person meetings
- Video calls

Supports follow-up tracking and reminders.
"""

from datetime import datetime
from typing import Optional, Dict, Any, List
from uuid import UUID

from pydantic import BaseModel, Field


class CommunicationCreate(BaseModel):
    """Schema for creating a new communication record."""

    communication_type: str = Field(
        ...,
        description="Type of communication (email, call, sms, meeting, video_call)",
    )
    direction: str = Field(
        ...,
        pattern="^(inbound|outbound)$",
        description="Direction: inbound or outbound",
    )
    subject: Optional[str] = Field(None, max_length=500, description="Subject line")
    body: Optional[str] = Field(
        None, max_length=10000, description="Communication content/notes"
    )
    related_gallery_id: Optional[UUID] = Field(
        None, description="Optional related gallery"
    )
    duration_minutes: Optional[int] = Field(
        None, ge=0, description="Duration in minutes (for calls/meetings)"
    )
    follow_up_required: bool = Field(False, description="Whether follow-up is required")
    follow_up_date: Optional[datetime] = Field(
        None, description="When to follow up"
    )
    metadata: Optional[Dict[str, Any]] = Field(
        None, description="Additional structured data"
    )


class CommunicationUpdate(BaseModel):
    """Schema for updating a communication record."""

    subject: Optional[str] = Field(None, max_length=500)
    body: Optional[str] = Field(None, max_length=10000)
    duration_minutes: Optional[int] = Field(None, ge=0)
    follow_up_required: Optional[bool] = None
    follow_up_date: Optional[datetime] = None
    follow_up_completed_at: Optional[datetime] = None
    metadata: Optional[Dict[str, Any]] = None


class CommunicationResponse(BaseModel):
    """Schema for communication response."""

    communication_id: UUID
    workspace_id: UUID
    client_id: UUID
    communication_type: str
    direction: str
    subject: Optional[str] = None
    body: Optional[str] = None
    related_gallery_id: Optional[UUID] = None
    duration_minutes: Optional[int] = None
    follow_up_required: bool = False
    follow_up_date: Optional[datetime] = None
    follow_up_completed_at: Optional[datetime] = None
    metadata: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CommunicationListResponse(BaseModel):
    """Schema for paginated communication list."""

    communications: List[CommunicationResponse]
    total: int = Field(..., description="Total number of communications")
    page: int = Field(..., description="Current page number")
    limit: int = Field(..., description="Items per page")


class CommunicationSearchParams(BaseModel):
    """Schema for communication search/filter parameters."""

    communication_type: Optional[str] = Field(
        None, description="Filter by communication type"
    )
    direction: Optional[str] = Field(None, pattern="^(inbound|outbound)$")
    start_date: Optional[datetime] = Field(None, description="Filter from date")
    end_date: Optional[datetime] = Field(None, description="Filter to date")
    related_gallery_id: Optional[UUID] = Field(None, description="Filter by gallery")
    follow_up_required: Optional[bool] = Field(
        None, description="Filter by follow-up status"
    )
    follow_up_overdue: Optional[bool] = Field(
        None, description="Filter overdue follow-ups"
    )
    page: int = Field(1, ge=1, description="Page number")
    limit: int = Field(50, ge=1, le=100, description="Items per page")
    sort_by: str = Field(
        "created_at", description="Sort field (created_at, follow_up_date)"
    )
    sort_order: str = Field("desc", pattern="^(asc|desc)$", description="Sort order")


class CompleteFollowUpRequest(BaseModel):
    """Schema for marking a follow-up as completed."""

    notes: Optional[str] = Field(
        None, max_length=1000, description="Notes about follow-up completion"
    )
