"""
Pydantic schemas for client activity timeline.

Activities track all interactions and events related to a client:
- Manual activities: notes, calls, meetings
- System activities: status changes, tag additions, gallery links
"""

from datetime import datetime
from typing import Optional, Dict, Any, List
from uuid import UUID

from pydantic import BaseModel, Field


class ActivityCreate(BaseModel):
    """Schema for creating a new activity."""

    activity_type: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Type of activity (note_added, call_made, status_changed, etc.)",
    )
    title: str = Field(..., min_length=1, max_length=500, description="Activity title")
    description: Optional[str] = Field(
        None, max_length=5000, description="Detailed description"
    )
    related_entity_type: Optional[str] = Field(
        None, max_length=50, description="Type of related entity (gallery, booking, etc.)"
    )
    related_entity_id: Optional[UUID] = Field(
        None, description="ID of related entity"
    )
    metadata: Optional[Dict[str, Any]] = Field(
        None, description="Additional structured data"
    )


class ActivityUpdate(BaseModel):
    """Schema for updating an activity."""

    title: Optional[str] = Field(None, min_length=1, max_length=500)
    description: Optional[str] = Field(None, max_length=5000)
    metadata: Optional[Dict[str, Any]] = None


class ActivityResponse(BaseModel):
    """Schema for activity response."""

    activity_id: UUID
    workspace_id: UUID
    client_id: UUID
    activity_type: str
    title: str
    description: Optional[str] = None
    related_entity_type: Optional[str] = None
    related_entity_id: Optional[UUID] = None
    metadata: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ActivityListResponse(BaseModel):
    """Schema for paginated activity list."""

    activities: List[ActivityResponse]
    total: int = Field(..., description="Total number of activities")
    page: int = Field(..., description="Current page number")
    limit: int = Field(..., description="Items per page")


class NoteCreate(BaseModel):
    """Schema for creating a quick note (simplified activity)."""

    title: str = Field(..., min_length=1, max_length=500, description="Note title")
    description: Optional[str] = Field(
        None, max_length=5000, description="Note content"
    )
    related_gallery_id: Optional[UUID] = Field(
        None, description="Optional related gallery"
    )


class ActivitySearchParams(BaseModel):
    """Schema for activity search/filter parameters."""

    activity_type: Optional[str] = Field(None, description="Filter by activity type")
    start_date: Optional[datetime] = Field(None, description="Filter from date")
    end_date: Optional[datetime] = Field(None, description="Filter to date")
    related_entity_type: Optional[str] = Field(
        None, description="Filter by related entity type"
    )
    related_entity_id: Optional[UUID] = Field(
        None, description="Filter by related entity ID"
    )
    page: int = Field(1, ge=1, description="Page number")
    limit: int = Field(50, ge=1, le=100, description="Items per page")
    sort_by: str = Field(
        "created_at", description="Sort field (created_at, activity_type)"
    )
    sort_order: str = Field("desc", pattern="^(asc|desc)$", description="Sort order")
