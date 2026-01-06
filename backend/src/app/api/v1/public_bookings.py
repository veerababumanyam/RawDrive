"""Public Booking API endpoints.

This module provides public API endpoints for clients to:
- View available booking slots
- Book appointments
- Check booking status
- Cancel or reschedule bookings

No authentication required for these endpoints.

Feature: Calendar Integrations & Booking Management
"""

from datetime import datetime, date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel, Field, EmailStr

from app.services.booking_service import (
    get_booking_service,
    BookingServiceError,
    SlotNotAvailableError,
    BookingNotFoundError,
    BookingPolicyError,
)
from app.repositories.booking_repository import get_booking_repository
from app.repositories.service_type_repository import get_service_type_repository
from app.repositories.calendar_repository import (
    get_availability_repository,
    get_slot_hold_repository,
    get_booking_policies_repository,
)


router = APIRouter()


# =============================================================================
# REQUEST/RESPONSE SCHEMAS
# =============================================================================


class HoldSlotRequest(BaseModel):
    """Request to hold a time slot temporarily."""

    service_type_id: UUID
    start_time: datetime
    client_email: EmailStr


class CompleteBookingRequest(BaseModel):
    """Request to complete a booking."""

    hold_id: UUID
    client_name: str = Field(..., min_length=1, max_length=200)
    client_email: EmailStr
    client_phone: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = Field(None, max_length=2000)
    location: Optional[str] = Field(None, max_length=500)
    # Payment fields would go here in production
    # payment_method_id: str
    accept_terms: bool = True


class CheckStatusRequest(BaseModel):
    """Request to check booking status."""

    confirmation_code: str = Field(..., min_length=8, max_length=20)
    client_email: EmailStr


class ClientCancelRequest(BaseModel):
    """Request for client to cancel their booking."""

    confirmation_code: str = Field(..., min_length=8, max_length=20)
    client_email: EmailStr
    reason: Optional[str] = Field(None, max_length=500)


class ClientRescheduleRequest(BaseModel):
    """Request for client to reschedule their booking."""

    confirmation_code: str = Field(..., min_length=8, max_length=20)
    client_email: EmailStr
    new_start_time: datetime
    reason: Optional[str] = Field(None, max_length=500)


# =============================================================================
# PUBLIC BOOKING PAGE CONFIG
# =============================================================================


@router.get("/{workspace_slug}")
async def get_booking_page_config(
    workspace_slug: str,
):
    """Get public booking page configuration for a workspace.

    Returns business info, available service types, and booking policies.
    """
    # In production, you'd look up workspace by slug
    # For now, we'll return a 404 as this requires database lookup
    # This endpoint would be implemented with workspace repository

    raise HTTPException(
        status_code=501,
        detail="Workspace slug lookup not yet implemented. Use workspace_id directly.",
    )


# =============================================================================
# AVAILABILITY ENDPOINTS (PUBLIC)
# =============================================================================


@router.get("/{workspace_id}/service-types")
async def get_public_service_types(
    workspace_id: UUID,
):
    """Get active service types for public booking."""
    service_type_repo = get_service_type_repository()
    service_types = await service_type_repo.list_active(workspace_id)

    # Filter out private notes
    public_service_types = []
    for st in service_types:
        public_st = {
            "service_type_id": st["service_type_id"],
            "name": st["name"],
            "description": st.get("description"),
            "duration": st["duration"],
            "duration_unit": st.get("duration_unit", "minutes"),
            "price_cents": st["price_cents"],
            "currency": st.get("currency", "USD"),
            "deposit_cents": st.get("deposit_cents", 0),
            "color": st.get("color"),
            "location": st.get("location"),
            "client_location_allowed": st.get("client_location_allowed", False),
            "public_notes": st.get("public_notes"),
        }
        public_service_types.append(public_st)

    return {"data": public_service_types}


@router.get("/{workspace_id}/available-dates")
async def get_public_available_dates(
    workspace_id: UUID,
    service_type_id: UUID,
    start_date: date,
    end_date: date,
):
    """Get dates with availability for public booking."""
    booking_service = get_booking_service()

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


@router.get("/{workspace_id}/available-slots")
async def get_public_available_slots(
    workspace_id: UUID,
    service_type_id: UUID,
    target_date: date = Query(..., alias="date"),
    client_timezone: Optional[str] = Query(None, description="Client's timezone for display"),
):
    """Get available time slots for a specific date."""
    booking_service = get_booking_service()

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


# =============================================================================
# BOOKING FLOW ENDPOINTS
# =============================================================================


@router.post("/{workspace_id}/hold")
async def hold_slot(
    workspace_id: UUID,
    request: HoldSlotRequest,
):
    """Hold a time slot temporarily (15 minutes).

    This prevents the slot from being booked by someone else while
    the client completes their booking.
    """
    booking_service = get_booking_service()

    try:
        hold = await booking_service.hold_slot(
            workspace_id=workspace_id,
            service_type_id=request.service_type_id,
            start_time=request.start_time,
            client_email=request.client_email,
            hold_duration_seconds=900,  # 15 minutes
        )

        return {
            "data": {
                "hold_id": hold["hold_id"],
                "start_time": hold["start_time"],
                "end_time": hold["end_time"],
                "expires_at": hold["expires_at"],
                "hold_duration_seconds": 900,
            },
            "message": "Slot held successfully. Complete your booking within 15 minutes.",
        }
    except SlotNotAvailableError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except BookingServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{workspace_id}/complete")
async def complete_booking(
    workspace_id: UUID,
    request: CompleteBookingRequest,
):
    """Complete a booking after holding a slot.

    Converts a slot hold into a confirmed booking.
    In production, this would also process payment.
    """
    booking_service = get_booking_service()
    slot_hold_repo = get_slot_hold_repository()

    # Verify the hold
    hold = await slot_hold_repo.get_by_id(request.hold_id)
    if not hold:
        raise HTTPException(status_code=404, detail="Slot hold not found or expired")

    if hold.get("is_released"):
        raise HTTPException(status_code=400, detail="Slot hold has been released")

    # Verify hold belongs to this workspace
    if str(hold.get("workspace_id")) != str(workspace_id):
        raise HTTPException(status_code=404, detail="Slot hold not found")

    # In production, process payment here before creating booking
    # payment_result = await process_payment(request.payment_method_id, ...)

    try:
        booking = await booking_service.create_booking(
            workspace_id=workspace_id,
            service_type_id=UUID(hold["service_type_id"]),
            client_name=request.client_name,
            client_email=request.client_email,
            start_time=datetime.fromisoformat(hold["start_time"].replace("Z", "+00:00")),
            client_phone=request.client_phone,
            location=request.location,
            client_notes=request.notes,
            source="public_page",
            hold_id=request.hold_id,
        )

        # In production, confirm the booking if payment succeeded
        # await booking_service.confirm_booking(workspace_id, booking["booking_id"])

        return {
            "data": {
                "booking_id": booking["booking_id"],
                "confirmation_code": booking["confirmation_code"],
                "start_time": booking["start_time"],
                "end_time": booking["end_time"],
                "status": booking["status"],
            },
            "message": "Booking created successfully!",
        }
    except SlotNotAvailableError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except BookingServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


# =============================================================================
# BOOKING STATUS ENDPOINTS
# =============================================================================


@router.post("/status")
async def check_booking_status(
    request: CheckStatusRequest,
):
    """Check the status of a booking by confirmation code."""
    booking_repo = get_booking_repository()

    booking = await booking_repo.get_by_confirmation_code(
        request.confirmation_code,
        request.client_email,
    )

    if not booking:
        raise HTTPException(
            status_code=404,
            detail="Booking not found. Please verify your confirmation code and email.",
        )

    # Get policies to determine if cancellation/reschedule is allowed
    policies_repo = get_booking_policies_repository()
    policies = await policies_repo.get(UUID(booking["workspace_id"]))

    from datetime import timedelta, timezone as tz
    booking_start = datetime.fromisoformat(booking["start_time"].replace("Z", "+00:00"))
    now = datetime.now(tz.utc)

    # Check cancellation eligibility
    can_cancel = booking["status"] in ("pending", "confirmed")
    if policies and can_cancel:
        cancellation = policies.get("cancellation_policy", {})
        free_hours = cancellation.get("free_cancellation_hours", 48)
        deadline = booking_start - timedelta(hours=free_hours)
        can_cancel = now < deadline

    # Check reschedule eligibility
    can_reschedule = booking["status"] in ("pending", "confirmed")
    if policies and can_reschedule:
        reschedule_deadline = policies.get("reschedule_deadline_hours", 24)
        deadline = booking_start - timedelta(hours=reschedule_deadline)
        can_reschedule = now < deadline and policies.get("allow_reschedule", True)

    return {
        "data": {
            "confirmation_code": booking["confirmation_code"],
            "service_name": booking["service_type_name"],
            "status": booking["status"],
            "start_time": booking["start_time"],
            "end_time": booking["end_time"],
            "timezone": booking.get("timezone", "UTC"),
            "location": booking.get("location"),
            "can_cancel": can_cancel,
            "can_reschedule": can_reschedule,
            "cancellation_deadline": (booking_start - timedelta(hours=48)).isoformat() if can_cancel else None,
        }
    }


@router.post("/cancel")
async def client_cancel_booking(
    request: ClientCancelRequest,
):
    """Allow a client to cancel their booking."""
    booking_repo = get_booking_repository()
    booking_service = get_booking_service()

    # Find booking by confirmation code
    booking = await booking_repo.get_by_confirmation_code(
        request.confirmation_code,
        request.client_email,
    )

    if not booking:
        raise HTTPException(
            status_code=404,
            detail="Booking not found. Please verify your confirmation code and email.",
        )

    try:
        cancelled_booking = await booking_service.cancel_booking(
            workspace_id=UUID(booking["workspace_id"]),
            booking_id=UUID(booking["booking_id"]),
            reason=request.reason,
            cancelled_by="client",
            check_policy=True,
        )

        # In production, process refund here
        # refund_amount = calculate_refund(booking, policies)
        # await process_refund(booking, refund_amount)

        return {
            "data": {
                "success": True,
                "refund_amount_cents": 0,  # Would be calculated based on policy
                "message": "Your booking has been cancelled.",
            }
        }
    except BookingPolicyError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except BookingNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/reschedule")
async def client_reschedule_booking(
    request: ClientRescheduleRequest,
):
    """Allow a client to reschedule their booking."""
    booking_repo = get_booking_repository()
    booking_service = get_booking_service()

    # Find booking by confirmation code
    booking = await booking_repo.get_by_confirmation_code(
        request.confirmation_code,
        request.client_email,
    )

    if not booking:
        raise HTTPException(
            status_code=404,
            detail="Booking not found. Please verify your confirmation code and email.",
        )

    try:
        new_booking = await booking_service.reschedule_booking(
            workspace_id=UUID(booking["workspace_id"]),
            booking_id=UUID(booking["booking_id"]),
            new_start_time=request.new_start_time,
            reason=request.reason,
            rescheduled_by="client",
        )

        return {
            "data": {
                "original_booking_id": booking["booking_id"],
                "new_booking_id": new_booking["booking_id"],
                "new_confirmation_code": new_booking["confirmation_code"],
                "new_start_time": new_booking["start_time"],
                "new_end_time": new_booking["end_time"],
            },
            "message": "Your booking has been rescheduled.",
        }
    except SlotNotAvailableError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except BookingPolicyError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except BookingNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


# =============================================================================
# CALENDAR DOWNLOAD
# =============================================================================


@router.get("/ics/{confirmation_code}")
async def get_public_booking_ics(
    confirmation_code: str,
    client_email: str = Query(..., description="Client email for verification"),
):
    """Download ICS calendar file for a booking (public access)."""
    booking_repo = get_booking_repository()
    booking_service = get_booking_service()

    booking = await booking_repo.get_by_confirmation_code(
        confirmation_code,
        client_email,
    )

    if not booking:
        raise HTTPException(
            status_code=404,
            detail="Booking not found. Please verify your confirmation code and email.",
        )

    try:
        # Use generic organizer info for public access
        ics_bytes, filename = await booking_service.generate_booking_ics(
            workspace_id=UUID(booking["workspace_id"]),
            booking_id=UUID(booking["booking_id"]),
            organizer_name="Photographer",
            organizer_email="bookings@example.com",
        )

        return Response(
            content=ics_bytes,
            media_type="text/calendar",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )
    except BookingServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))
