"""
Invitation Sub-Events API Routes

Provides CRUD endpoints for managing sub-events within digital invitations.

Feature: 016-save-the-date Phase 8
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from src.api.dependencies import get_current_user
from src.models.invitation_sub_event import SubEvent
from src.services.invitation_sub_event_service import (
    get_invitation_sub_event_service,
    InvitationSubEventService,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Request/Response Models
# ---------------------------------------------------------------------------


class CreateSubEventRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    event_type: Optional[str] = Field(None, max_length=50)
    event_datetime: datetime
    event_end_datetime: Optional[datetime] = None
    event_timezone: str = Field("Asia/Kolkata", max_length=50)
    description: Optional[str] = None
    venue_name: Optional[str] = Field(None, max_length=300)
    venue_address: Optional[str] = None
    venue_city: Optional[str] = Field(None, max_length=100)
    venue_map_url: Optional[str] = None
    display_order: Optional[int] = None
    show_countdown: bool = True
    enable_individual_rsvp: bool = False


class UpdateSubEventRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    event_type: Optional[str] = Field(None, max_length=50)
    event_datetime: Optional[datetime] = None
    event_end_datetime: Optional[datetime] = None
    event_timezone: Optional[str] = Field(None, max_length=50)
    description: Optional[str] = None
    venue_name: Optional[str] = Field(None, max_length=300)
    venue_address: Optional[str] = None
    venue_city: Optional[str] = Field(None, max_length=100)
    venue_map_url: Optional[str] = None
    display_order: Optional[int] = None
    show_countdown: Optional[bool] = None
    enable_individual_rsvp: Optional[bool] = None


class ReorderSubEventsRequest(BaseModel):
    sub_event_ids: List[str] = Field(..., description="Ordered list of sub-event IDs")


class SubEventResponse(BaseModel):
    sub_event_id: UUID
    invitation_id: UUID
    workspace_id: UUID
    name: str
    event_type: Optional[str]
    event_datetime: datetime
    event_end_datetime: Optional[datetime]
    event_timezone: str
    description: Optional[str]
    venue_name: Optional[str]
    venue_address: Optional[str]
    venue_city: Optional[str]
    venue_map_url: Optional[str]
    display_order: int
    show_countdown: bool
    enable_individual_rsvp: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Dependency
# ---------------------------------------------------------------------------


def get_service() -> InvitationSubEventService:
    return get_invitation_sub_event_service()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("", response_model=List[SubEventResponse])
async def list_sub_events(
    workspace_id: UUID,
    invitation_id: UUID,
    current_user: dict = Depends(get_current_user),
    service: InvitationSubEventService = Depends(get_service),
):
    """List all sub-events for an invitation."""
    sub_events = await service.list_sub_events(workspace_id, invitation_id)
    return sub_events


@router.post("", response_model=SubEventResponse, status_code=status.HTTP_201_CREATED)
async def create_sub_event(
    workspace_id: UUID,
    invitation_id: UUID,
    request: CreateSubEventRequest,
    current_user: dict = Depends(get_current_user),
    service: InvitationSubEventService = Depends(get_service),
):
    """Create a new sub-event."""
    sub_event = await service.create_sub_event(
        workspace_id=workspace_id,
        invitation_id=invitation_id,
        name=request.name,
        event_datetime=request.event_datetime,
        event_type=request.event_type,
        event_end_datetime=request.event_end_datetime,
        event_timezone=request.event_timezone,
        description=request.description,
        venue_name=request.venue_name,
        venue_address=request.venue_address,
        venue_city=request.venue_city,
        venue_map_url=request.venue_map_url,
        display_order=request.display_order,
        show_countdown=request.show_countdown,
        enable_individual_rsvp=request.enable_individual_rsvp,
    )
    return sub_event


@router.get("/{sub_event_id}", response_model=SubEventResponse)
async def get_sub_event(
    workspace_id: UUID,
    invitation_id: UUID,
    sub_event_id: UUID,
    current_user: dict = Depends(get_current_user),
    service: InvitationSubEventService = Depends(get_service),
):
    """Get a specific sub-event."""
    sub_event = await service.get_sub_event(workspace_id, invitation_id, sub_event_id)
    if not sub_event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sub-event not found",
        )
    return sub_event


@router.patch("/{sub_event_id}", response_model=SubEventResponse)
async def update_sub_event(
    workspace_id: UUID,
    invitation_id: UUID,
    sub_event_id: UUID,
    request: UpdateSubEventRequest,
    current_user: dict = Depends(get_current_user),
    service: InvitationSubEventService = Depends(get_service),
):
    """Update a sub-event."""
    updates = request.model_dump(exclude_unset=True)
    sub_event = await service.update_sub_event(
        workspace_id, invitation_id, sub_event_id, **updates
    )
    if not sub_event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sub-event not found",
        )
    return sub_event


@router.delete("/{sub_event_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_sub_event(
    workspace_id: UUID,
    invitation_id: UUID,
    sub_event_id: UUID,
    current_user: dict = Depends(get_current_user),
    service: InvitationSubEventService = Depends(get_service),
):
    """Delete a sub-event."""
    deleted = await service.delete_sub_event(workspace_id, invitation_id, sub_event_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sub-event not found",
        )
    return None


@router.post("/reorder", response_model=List[SubEventResponse])
async def reorder_sub_events(
    workspace_id: UUID,
    invitation_id: UUID,
    request: ReorderSubEventsRequest,
    current_user: dict = Depends(get_current_user),
    service: InvitationSubEventService = Depends(get_service),
):
    """Reorder sub-events by providing an ordered list of IDs."""
    sub_event_ids = [UUID(id_str) for id_str in request.sub_event_ids]
    sub_events = await service.reorder_sub_events(
        workspace_id, invitation_id, sub_event_ids
    )
    return sub_events
