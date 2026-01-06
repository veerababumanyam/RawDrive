"""Booking API endpoints.

This module provides API endpoints for:
- CRUD operations for bookings
- Booking confirmation, cancellation, and rescheduling
- Availability queries
- Calendar ICS generation

Feature: Calendar Integrations & Booking Management
"""

from datetime import datetime, date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field, EmailStr

from app.api.dependencies.auth import get_current_user, get_current_workspace_id
from app.services.booking_service import (
    get_booking_service,
    BookingService,
    BookingServiceError,
    SlotNotAvailableError,
    BookingNotFoundError,
    BookingPolicyError,
)
from app.repositories.booking_repository import get_booking_repository
from app.repositories.service_type_repository import get_service_type_repository
from app.repositories.calendar_repository import (
    get_availability_repository,
    get_booking_policies_repository,
)


router = APIRouter()


# =============================================================================
# REQUEST/RESPONSE SCHEMAS
# =============================================================================


class CreateBookingRequest(BaseModel):
    """Request schema for creating a booking."""

    service_type_id: UUID
    client_name: str = Field(..., min_length=1, max_length=200)
    client_email: EmailStr
    start_time: datetime
    client_id: Optional[UUID] = None
    client_phone: Optional[str] = Field(None, max_length=50)
    location: Optional[str] = Field(None, max_length=500)
    client_notes: Optional[str] = Field(None, max_length=2000)
    internal_notes: Optional[str] = Field(None, max_length=2000)
    skip_conflict_check: bool = False


class UpdateBookingRequest(BaseModel):
    """Request schema for updating a booking."""

    location: Optional[str] = Field(None, max_length=500)
    client_notes: Optional[str] = Field(None, max_length=2000)
    internal_notes: Optional[str] = Field(None, max_length=2000)


class ConfirmBookingRequest(BaseModel):
    """Request schema for confirming a booking."""

    payment_status: str = Field("deposit_paid", pattern="^(deposit_paid|fully_paid)$")


class CancelBookingRequest(BaseModel):
    """Request schema for canceling a booking."""

    reason: Optional[str] = Field(None, max_length=500)


class RescheduleBookingRequest(BaseModel):
    """Request schema for rescheduling a booking."""

    new_start_time: datetime
    reason: Optional[str] = Field(None, max_length=500)


class AvailabilityQueryResponse(BaseModel):
    """Response for available slots query."""

    date: str
    slots: list[dict]
    timezone: str
    service_duration_minutes: int


# =============================================================================
# BOOKING CRUD ENDPOINTS
# =============================================================================


@router.get("")
async def list_bookings(
    workspace_id: UUID = Depends(get_current_workspace_id),
    current_user: dict = Depends(get_current_user),
    status: Optional[str] = Query(None, description="Filter by status"),
    service_type_id: Optional[UUID] = Query(None, description="Filter by service type"),
    client_id: Optional[UUID] = Query(None, description="Filter by client"),
    start_date: Optional[datetime] = Query(None, description="Filter by start date (from)"),
    end_date: Optional[datetime] = Query(None, description="Filter by end date (to)"),
    search: Optional[str] = Query(None, description="Search by client name or email"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    sort_by: str = Query("start_time", pattern="^(start_time|created_at|client_name|status)$"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
):
    """List bookings for the workspace with optional filters."""
    booking_repo = get_booking_repository()
    offset = (page - 1) * limit

    bookings = await booking_repo.list_by_workspace(
        workspace_id=workspace_id,
        status=status,
        service_type_id=service_type_id,
        client_id=client_id,
        start_date=start_date,
        end_date=end_date,
        search=search,
        limit=limit,
        offset=offset,
        sort_by=sort_by,
        sort_order=sort_order,
    )

    total = await booking_repo.count_by_workspace(workspace_id, status)

    return {
        "data": bookings,
        "pagination": {
            "total": total,
            "page": page,
            "limit": limit,
            "pages": (total + limit - 1) // limit,
        },
    }


@router.get("/upcoming")
async def list_upcoming_bookings(
    workspace_id: UUID = Depends(get_current_workspace_id),
    current_user: dict = Depends(get_current_user),
    days: int = Query(7, ge=1, le=90, description="Number of days to look ahead"),
    limit: int = Query(50, ge=1, le=100),
):
    """List upcoming bookings."""
    booking_repo = get_booking_repository()
    bookings = await booking_repo.list_upcoming(workspace_id, days=days, limit=limit)
    return {"data": bookings}


@router.get("/stats")
async def get_booking_stats(
    workspace_id: UUID = Depends(get_current_workspace_id),
    current_user: dict = Depends(get_current_user),
):
    """Get booking statistics for the workspace."""
    booking_repo = get_booking_repository()
    stats = await booking_repo.get_stats(workspace_id)
    return {"data": stats}


@router.post("")
async def create_booking(
    request: CreateBookingRequest,
    workspace_id: UUID = Depends(get_current_workspace_id),
    current_user: dict = Depends(get_current_user),
    booking_service: BookingService = Depends(get_booking_service),
):
    """Create a new booking."""
    try:
        booking = await booking_service.create_booking(
            workspace_id=workspace_id,
            service_type_id=request.service_type_id,
            client_name=request.client_name,
            client_email=request.client_email,
            start_time=request.start_time,
            client_id=request.client_id,
            client_phone=request.client_phone,
            location=request.location,
            client_notes=request.client_notes,
            internal_notes=request.internal_notes,
            source="manual",
            skip_conflict_check=request.skip_conflict_check,
        )
        return {"data": booking, "message": "Booking created successfully"}
    except SlotNotAvailableError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except BookingServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{booking_id}")
async def get_booking(
    booking_id: UUID,
    workspace_id: UUID = Depends(get_current_workspace_id),
    current_user: dict = Depends(get_current_user),
):
    """Get a single booking by ID."""
    booking_repo = get_booking_repository()
    booking = await booking_repo.get_by_id(workspace_id, booking_id)

    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    return {"data": booking}


@router.patch("/{booking_id}")
async def update_booking(
    booking_id: UUID,
    request: UpdateBookingRequest,
    workspace_id: UUID = Depends(get_current_workspace_id),
    current_user: dict = Depends(get_current_user),
):
    """Update a booking."""
    booking_repo = get_booking_repository()

    booking = await booking_repo.update(
        workspace_id=workspace_id,
        booking_id=booking_id,
        location=request.location,
        client_notes=request.client_notes,
        internal_notes=request.internal_notes,
    )

    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    return {"data": booking, "message": "Booking updated successfully"}


@router.post("/{booking_id}/confirm")
async def confirm_booking(
    booking_id: UUID,
    request: ConfirmBookingRequest,
    workspace_id: UUID = Depends(get_current_workspace_id),
    current_user: dict = Depends(get_current_user),
    booking_service: BookingService = Depends(get_booking_service),
):
    """Confirm a pending booking."""
    try:
        booking = await booking_service.confirm_booking(
            workspace_id=workspace_id,
            booking_id=booking_id,
            payment_status=request.payment_status,
        )
        return {"data": booking, "message": "Booking confirmed successfully"}
    except BookingNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except BookingPolicyError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{booking_id}/cancel")
async def cancel_booking(
    booking_id: UUID,
    request: CancelBookingRequest,
    workspace_id: UUID = Depends(get_current_workspace_id),
    current_user: dict = Depends(get_current_user),
    booking_service: BookingService = Depends(get_booking_service),
):
    """Cancel a booking."""
    try:
        booking = await booking_service.cancel_booking(
            workspace_id=workspace_id,
            booking_id=booking_id,
            reason=request.reason,
            cancelled_by="photographer",
            check_policy=False,  # Photographer can always cancel
        )
        return {"data": booking, "message": "Booking cancelled successfully"}
    except BookingNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except BookingPolicyError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{booking_id}/reschedule")
async def reschedule_booking(
    booking_id: UUID,
    request: RescheduleBookingRequest,
    workspace_id: UUID = Depends(get_current_workspace_id),
    current_user: dict = Depends(get_current_user),
    booking_service: BookingService = Depends(get_booking_service),
):
    """Reschedule a booking to a new time."""
    try:
        new_booking = await booking_service.reschedule_booking(
            workspace_id=workspace_id,
            booking_id=booking_id,
            new_start_time=request.new_start_time,
            reason=request.reason,
            rescheduled_by="photographer",
        )
        return {"data": new_booking, "message": "Booking rescheduled successfully"}
    except SlotNotAvailableError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except BookingNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except BookingPolicyError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{booking_id}/complete")
async def complete_booking(
    booking_id: UUID,
    workspace_id: UUID = Depends(get_current_workspace_id),
    current_user: dict = Depends(get_current_user),
    booking_service: BookingService = Depends(get_booking_service),
):
    """Mark a booking as completed."""
    try:
        booking = await booking_service.complete_booking(
            workspace_id=workspace_id,
            booking_id=booking_id,
        )
        return {"data": booking, "message": "Booking marked as completed"}
    except BookingNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except BookingPolicyError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{booking_id}/no-show")
async def mark_no_show(
    booking_id: UUID,
    workspace_id: UUID = Depends(get_current_workspace_id),
    current_user: dict = Depends(get_current_user),
    booking_service: BookingService = Depends(get_booking_service),
):
    """Mark a booking as no-show."""
    try:
        booking = await booking_service.mark_no_show(
            workspace_id=workspace_id,
            booking_id=booking_id,
        )
        return {"data": booking, "message": "Booking marked as no-show"}
    except BookingNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except BookingPolicyError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{booking_id}")
async def delete_booking(
    booking_id: UUID,
    workspace_id: UUID = Depends(get_current_workspace_id),
    current_user: dict = Depends(get_current_user),
):
    """Delete a booking (hard delete)."""
    booking_repo = get_booking_repository()
    deleted = await booking_repo.delete(workspace_id, booking_id)

    if not deleted:
        raise HTTPException(status_code=404, detail="Booking not found")

    return {"message": "Booking deleted successfully"}


# =============================================================================
# AVAILABILITY ENDPOINTS
# =============================================================================


@router.get("/availability/slots")
async def get_available_slots(
    service_type_id: UUID,
    target_date: date = Query(..., alias="date"),
    workspace_id: UUID = Depends(get_current_workspace_id),
    current_user: dict = Depends(get_current_user),
    booking_service: BookingService = Depends(get_booking_service),
):
    """Get available time slots for a specific date."""
    try:
        slots = await booking_service.get_available_slots(
            workspace_id=workspace_id,
            service_type_id=service_type_id,
            target_date=target_date,
        )

        # Get service type for duration info
        service_type_repo = get_service_type_repository()
        service_type = await service_type_repo.get_by_id(workspace_id, service_type_id)

        duration_minutes = service_type["duration"] if service_type else 60
        if service_type and service_type.get("duration_unit") == "hours":
            duration_minutes = duration_minutes * 60

        # Get timezone
        availability_repo = get_availability_repository()
        settings = await availability_repo.get_settings(workspace_id)
        timezone_str = settings.get("timezone", "UTC") if settings else "UTC"

        return {
            "data": {
                "date": target_date.isoformat(),
                "slots": slots,
                "timezone": timezone_str,
                "service_duration_minutes": duration_minutes,
            }
        }
    except BookingServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/availability/dates")
async def get_available_dates(
    service_type_id: UUID,
    start_date: date,
    end_date: date,
    workspace_id: UUID = Depends(get_current_workspace_id),
    current_user: dict = Depends(get_current_user),
    booking_service: BookingService = Depends(get_booking_service),
):
    """Get dates with availability within a range."""
    try:
        dates = await booking_service.get_available_dates(
            workspace_id=workspace_id,
            service_type_id=service_type_id,
            start_date=start_date,
            end_date=end_date,
        )
        return {
            "data": {
                "available_dates": dates,
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
            }
        }
    except BookingServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


# =============================================================================
# CALENDAR ENDPOINTS
# =============================================================================


@router.get("/{booking_id}/ics")
async def get_booking_ics(
    booking_id: UUID,
    workspace_id: UUID = Depends(get_current_workspace_id),
    current_user: dict = Depends(get_current_user),
    booking_service: BookingService = Depends(get_booking_service),
):
    """Download ICS calendar file for a booking."""
    try:
        organizer_name = current_user.get("full_name", "Photographer")
        organizer_email = current_user.get("email", "")

        ics_bytes, filename = await booking_service.generate_booking_ics(
            workspace_id=workspace_id,
            booking_id=booking_id,
            organizer_name=organizer_name,
            organizer_email=organizer_email,
        )

        return Response(
            content=ics_bytes,
            media_type="text/calendar",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )
    except BookingNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except BookingServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))
