"""Booking Service for business logic.

This module provides the BookingService class that handles:
- Booking creation, confirmation, cancellation, and rescheduling
- Availability calculation
- Slot conflict detection
- Calendar ICS generation

Feature: Calendar Integrations & Booking Management
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone, date, timedelta
from typing import Any, Optional
from uuid import UUID

from app.repositories.booking_repository import get_booking_repository, BookingRepository
from app.repositories.service_type_repository import get_service_type_repository, ServiceTypeRepository
from app.repositories.calendar_repository import (
    get_availability_repository,
    get_slot_hold_repository,
    get_booking_policies_repository,
    AvailabilityRepository,
    SlotHoldRepository,
    BookingPoliciesRepository,
)
from app.services.calendar_service import get_calendar_service, is_calendar_available


logger = logging.getLogger(__name__)


class BookingServiceError(Exception):
    """Base exception for booking service errors."""
    pass


class SlotNotAvailableError(BookingServiceError):
    """Raised when a requested slot is not available."""
    pass


class BookingNotFoundError(BookingServiceError):
    """Raised when a booking is not found."""
    pass


class BookingPolicyError(BookingServiceError):
    """Raised when a booking operation violates policies."""
    pass


class BookingService:
    """Service for booking business logic.

    Handles booking lifecycle management, availability calculation,
    and policy enforcement.
    """

    def __init__(
        self,
        booking_repo: Optional[BookingRepository] = None,
        service_type_repo: Optional[ServiceTypeRepository] = None,
        availability_repo: Optional[AvailabilityRepository] = None,
        slot_hold_repo: Optional[SlotHoldRepository] = None,
        policies_repo: Optional[BookingPoliciesRepository] = None,
    ):
        self.booking_repo = booking_repo or get_booking_repository()
        self.service_type_repo = service_type_repo or get_service_type_repository()
        self.availability_repo = availability_repo or get_availability_repository()
        self.slot_hold_repo = slot_hold_repo or get_slot_hold_repository()
        self.policies_repo = policies_repo or get_booking_policies_repository()

    # =========================================================================
    # BOOKING OPERATIONS
    # =========================================================================

    async def create_booking(
        self,
        workspace_id: UUID,
        service_type_id: UUID,
        client_name: str,
        client_email: str,
        start_time: datetime,
        client_id: Optional[UUID] = None,
        client_phone: Optional[str] = None,
        location: Optional[str] = None,
        client_notes: Optional[str] = None,
        internal_notes: Optional[str] = None,
        source: str = "manual",
        skip_conflict_check: bool = False,
        hold_id: Optional[UUID] = None,
    ) -> dict[str, Any]:
        """Create a new booking.

        Args:
            workspace_id: Workspace ID
            service_type_id: Service type being booked
            client_name: Client's name
            client_email: Client's email
            start_time: Booking start time
            client_id: Optional linked client record
            client_phone: Client's phone number
            location: Booking location
            client_notes: Notes from client
            internal_notes: Private photographer notes
            source: Booking source (manual, public_page, etc.)
            skip_conflict_check: Skip slot availability check
            hold_id: Slot hold ID to convert

        Returns:
            Created booking record

        Raises:
            SlotNotAvailableError: If the slot is not available
            BookingServiceError: If service type not found
        """
        # Get service type
        service_type = await self.service_type_repo.get_by_id(workspace_id, service_type_id)
        if not service_type:
            raise BookingServiceError("Service type not found")

        if not service_type.get("is_active"):
            raise BookingServiceError("Service type is not active")

        # Calculate end time based on service duration
        duration_minutes = service_type["duration"]
        if service_type.get("duration_unit") == "hours":
            duration_minutes = duration_minutes * 60

        end_time = start_time + timedelta(minutes=duration_minutes)

        # Check for conflicts
        if not skip_conflict_check:
            # Check existing bookings
            has_conflict = await self.booking_repo.check_slot_conflict(
                workspace_id, start_time, end_time
            )
            if has_conflict:
                raise SlotNotAvailableError("Time slot conflicts with existing booking")

            # Check slot holds (unless this is from a hold)
            if not hold_id:
                is_held = await self.slot_hold_repo.check_slot_held(
                    workspace_id, start_time, end_time
                )
                if is_held:
                    raise SlotNotAvailableError("Time slot is currently being held")

        # Get availability settings for timezone
        settings = await self.availability_repo.get_settings(workspace_id)
        timezone_str = settings.get("timezone", "UTC") if settings else "UTC"

        # Use service type location if not provided
        if not location:
            location = service_type.get("location")

        # Create booking
        booking = await self.booking_repo.create(
            workspace_id=workspace_id,
            service_type_id=service_type_id,
            service_type_name=service_type["name"],
            client_name=client_name,
            client_email=client_email,
            start_time=start_time,
            end_time=end_time,
            timezone_str=timezone_str,
            total_price_cents=service_type["price_cents"],
            currency=service_type.get("currency", "USD"),
            client_id=client_id,
            client_phone=client_phone,
            location=location,
            client_notes=client_notes,
            internal_notes=internal_notes,
            deposit_amount_cents=service_type.get("deposit_cents", 0),
            source=source,
        )

        # Release the hold if this was from a hold
        if hold_id:
            await self.slot_hold_repo.release(hold_id, UUID(booking["booking_id"]))

        logger.info(
            "Booking created",
            extra={
                "booking_id": booking["booking_id"],
                "workspace_id": str(workspace_id),
                "confirmation_code": booking["confirmation_code"],
            },
        )

        return booking

    async def confirm_booking(
        self,
        workspace_id: UUID,
        booking_id: UUID,
        payment_status: str = "deposit_paid",
    ) -> dict[str, Any]:
        """Confirm a pending booking.

        Args:
            workspace_id: Workspace ID
            booking_id: Booking to confirm
            payment_status: Payment status to set

        Returns:
            Updated booking record
        """
        booking = await self.booking_repo.get_by_id(workspace_id, booking_id)
        if not booking:
            raise BookingNotFoundError("Booking not found")

        if booking["status"] != "pending":
            raise BookingPolicyError(f"Cannot confirm booking with status: {booking['status']}")

        return await self.booking_repo.confirm(workspace_id, booking_id, payment_status)

    async def cancel_booking(
        self,
        workspace_id: UUID,
        booking_id: UUID,
        reason: Optional[str] = None,
        cancelled_by: str = "photographer",
        check_policy: bool = True,
    ) -> dict[str, Any]:
        """Cancel a booking.

        Args:
            workspace_id: Workspace ID
            booking_id: Booking to cancel
            reason: Cancellation reason
            cancelled_by: Who cancelled (photographer/client)
            check_policy: Whether to check cancellation policy

        Returns:
            Updated booking record
        """
        booking = await self.booking_repo.get_by_id(workspace_id, booking_id)
        if not booking:
            raise BookingNotFoundError("Booking not found")

        if booking["status"] in ("cancelled", "completed", "no_show"):
            raise BookingPolicyError(f"Cannot cancel booking with status: {booking['status']}")

        if check_policy and cancelled_by == "client":
            # Check cancellation policy
            policies = await self.policies_repo.get(workspace_id)
            if policies:
                cancellation = policies.get("cancellation_policy", {})
                free_hours = cancellation.get("free_cancellation_hours", 48)

                booking_start = datetime.fromisoformat(booking["start_time"].replace("Z", "+00:00"))
                deadline = booking_start - timedelta(hours=free_hours)

                if datetime.now(timezone.utc) > deadline:
                    # Past free cancellation window
                    policy_type = cancellation.get("type", "full_refund")
                    if policy_type == "no_refund":
                        raise BookingPolicyError("Cancellation deadline has passed. No refund available.")

        return await self.booking_repo.cancel(workspace_id, booking_id, reason, cancelled_by)

    async def reschedule_booking(
        self,
        workspace_id: UUID,
        booking_id: UUID,
        new_start_time: datetime,
        reason: Optional[str] = None,
        rescheduled_by: str = "photographer",
    ) -> dict[str, Any]:
        """Reschedule a booking to a new time.

        Creates a new booking and marks the old one as rescheduled.

        Args:
            workspace_id: Workspace ID
            booking_id: Original booking to reschedule
            new_start_time: New start time
            reason: Reason for reschedule
            rescheduled_by: Who requested reschedule

        Returns:
            New booking record
        """
        original = await self.booking_repo.get_by_id(workspace_id, booking_id)
        if not original:
            raise BookingNotFoundError("Booking not found")

        if original["status"] not in ("pending", "confirmed"):
            raise BookingPolicyError(f"Cannot reschedule booking with status: {original['status']}")

        # Check reschedule policy
        if rescheduled_by == "client":
            policies = await self.policies_repo.get(workspace_id)
            if policies:
                if not policies.get("allow_reschedule", True):
                    raise BookingPolicyError("Rescheduling is not allowed")

                # Count previous reschedules
                # (In a full implementation, we'd count the chain of rescheduled_from_id)
                max_reschedules = policies.get("max_reschedules", 3)
                # For now, we'll just check if this booking was already rescheduled from another
                if original.get("rescheduled_from_id"):
                    # This is at least the 2nd reschedule
                    pass

        # Create new booking
        new_booking = await self.create_booking(
            workspace_id=workspace_id,
            service_type_id=UUID(original["service_type_id"]),
            client_name=original["client_name"],
            client_email=original["client_email"],
            start_time=new_start_time,
            client_id=UUID(original["client_id"]) if original.get("client_id") else None,
            client_phone=original.get("client_phone"),
            location=original.get("location"),
            client_notes=original.get("client_notes"),
            internal_notes=f"Rescheduled from {original['confirmation_code']}. {reason or ''}".strip(),
            source=original["source"],
        )

        # Update original booking
        await self.booking_repo.update(
            workspace_id=workspace_id,
            booking_id=booking_id,
            status="rescheduled",
            rescheduled_to_id=UUID(new_booking["booking_id"]),
            cancellation_reason=f"Rescheduled by {rescheduled_by}: {reason}" if reason else f"Rescheduled by {rescheduled_by}",
        )

        logger.info(
            "Booking rescheduled",
            extra={
                "original_booking_id": str(booking_id),
                "new_booking_id": new_booking["booking_id"],
                "workspace_id": str(workspace_id),
            },
        )

        return new_booking

    async def complete_booking(
        self,
        workspace_id: UUID,
        booking_id: UUID,
    ) -> dict[str, Any]:
        """Mark a booking as completed."""
        booking = await self.booking_repo.get_by_id(workspace_id, booking_id)
        if not booking:
            raise BookingNotFoundError("Booking not found")

        if booking["status"] != "confirmed":
            raise BookingPolicyError(f"Cannot complete booking with status: {booking['status']}")

        return await self.booking_repo.complete(workspace_id, booking_id)

    async def mark_no_show(
        self,
        workspace_id: UUID,
        booking_id: UUID,
    ) -> dict[str, Any]:
        """Mark a booking as no-show."""
        booking = await self.booking_repo.get_by_id(workspace_id, booking_id)
        if not booking:
            raise BookingNotFoundError("Booking not found")

        if booking["status"] != "confirmed":
            raise BookingPolicyError(f"Cannot mark no-show for booking with status: {booking['status']}")

        return await self.booking_repo.mark_no_show(workspace_id, booking_id)

    # =========================================================================
    # AVAILABILITY OPERATIONS
    # =========================================================================

    async def get_available_slots(
        self,
        workspace_id: UUID,
        service_type_id: UUID,
        target_date: date,
    ) -> list[dict[str, Any]]:
        """Get available time slots for a specific date.

        Args:
            workspace_id: Workspace ID
            service_type_id: Service type for duration
            target_date: Date to get slots for

        Returns:
            List of available slots with start/end times
        """
        # Get service type for duration
        service_type = await self.service_type_repo.get_by_id(workspace_id, service_type_id)
        if not service_type:
            raise BookingServiceError("Service type not found")

        duration_minutes = service_type["duration"]
        if service_type.get("duration_unit") == "hours":
            duration_minutes = duration_minutes * 60

        # Get availability settings
        settings = await self.availability_repo.get_settings(workspace_id)
        if not settings:
            # Return empty if no settings configured
            return []

        timezone_str = settings.get("timezone", "UTC")
        weekly_schedule = settings.get("weekly_schedule", [])
        buffer_before = settings.get("buffer_before_minutes", 15)
        buffer_after = settings.get("buffer_after_minutes", 15)
        slot_increment = settings.get("slot_increment_minutes", 30)
        min_notice_hours = settings.get("minimum_notice_hours", 24)
        max_advance_days = settings.get("max_advance_days", 60)

        # Check if date is within booking window
        today = date.today()
        min_date = today + timedelta(hours=min_notice_hours / 24)
        max_date = today + timedelta(days=max_advance_days)

        if target_date < min_date.date() if hasattr(min_date, 'date') else target_date < today:
            return []  # Too soon
        if target_date > max_date:
            return []  # Too far in advance

        # Check for date override
        override = await self.availability_repo.get_override(workspace_id, target_date)
        if override:
            if not override.get("is_available"):
                return []  # Day is blocked off
            time_windows = override.get("time_windows", [])
        else:
            # Get day of week schedule
            day_name = target_date.strftime("%A").lower()
            day_schedule = next(
                (d for d in weekly_schedule if d.get("day") == day_name),
                None
            )
            if not day_schedule or not day_schedule.get("is_available"):
                return []  # Day not available
            time_windows = day_schedule.get("time_windows", [])

        if not time_windows:
            return []

        # Generate slots from time windows
        slots = []
        import pytz
        tz = pytz.timezone(timezone_str)

        for window in time_windows:
            start_str = window.get("start", "09:00")
            end_str = window.get("end", "17:00")

            start_h, start_m = map(int, start_str.split(":"))
            end_h, end_m = map(int, end_str.split(":"))

            window_start = tz.localize(
                datetime(target_date.year, target_date.month, target_date.day, start_h, start_m)
            )
            window_end = tz.localize(
                datetime(target_date.year, target_date.month, target_date.day, end_h, end_m)
            )

            # Generate slots within this window
            slot_start = window_start
            while slot_start + timedelta(minutes=duration_minutes) <= window_end:
                slot_end = slot_start + timedelta(minutes=duration_minutes)

                # Check minimum notice
                now = datetime.now(tz)
                min_start = now + timedelta(hours=min_notice_hours)
                if slot_start >= min_start:
                    slots.append({
                        "start": slot_start.isoformat(),
                        "end": slot_end.isoformat(),
                        "duration_minutes": duration_minutes,
                        "is_available": True,
                    })

                slot_start += timedelta(minutes=slot_increment)

        # Filter out slots with conflicts
        available_slots = []
        for slot in slots:
            slot_start = datetime.fromisoformat(slot["start"])
            slot_end = datetime.fromisoformat(slot["end"])

            # Add buffer times for conflict check
            check_start = slot_start - timedelta(minutes=buffer_before)
            check_end = slot_end + timedelta(minutes=buffer_after)

            # Check booking conflicts
            has_conflict = await self.booking_repo.check_slot_conflict(
                workspace_id, check_start, check_end
            )

            # Check hold conflicts
            is_held = await self.slot_hold_repo.check_slot_held(
                workspace_id, slot_start, slot_end
            )

            if not has_conflict and not is_held:
                available_slots.append(slot)

        return available_slots

    async def get_available_dates(
        self,
        workspace_id: UUID,
        service_type_id: UUID,
        start_date: date,
        end_date: date,
    ) -> list[str]:
        """Get dates with availability within a range.

        Args:
            workspace_id: Workspace ID
            service_type_id: Service type ID
            start_date: Range start
            end_date: Range end

        Returns:
            List of dates (YYYY-MM-DD) with available slots
        """
        available_dates = []
        current = start_date

        while current <= end_date:
            slots = await self.get_available_slots(workspace_id, service_type_id, current)
            if slots:
                available_dates.append(current.isoformat())
            current += timedelta(days=1)

        return available_dates

    # =========================================================================
    # SLOT HOLD OPERATIONS
    # =========================================================================

    async def hold_slot(
        self,
        workspace_id: UUID,
        service_type_id: UUID,
        start_time: datetime,
        client_email: str,
        hold_duration_seconds: int = 900,
    ) -> dict[str, Any]:
        """Create a temporary hold on a slot.

        Args:
            workspace_id: Workspace ID
            service_type_id: Service type ID
            start_time: Slot start time
            client_email: Client's email
            hold_duration_seconds: Hold duration (default 15 minutes)

        Returns:
            Hold record with expiration time
        """
        # Get service type for duration
        service_type = await self.service_type_repo.get_by_id(workspace_id, service_type_id)
        if not service_type:
            raise BookingServiceError("Service type not found")

        duration_minutes = service_type["duration"]
        if service_type.get("duration_unit") == "hours":
            duration_minutes = duration_minutes * 60

        end_time = start_time + timedelta(minutes=duration_minutes)

        # Check for conflicts
        has_conflict = await self.booking_repo.check_slot_conflict(
            workspace_id, start_time, end_time
        )
        if has_conflict:
            raise SlotNotAvailableError("Time slot conflicts with existing booking")

        is_held = await self.slot_hold_repo.check_slot_held(
            workspace_id, start_time, end_time
        )
        if is_held:
            raise SlotNotAvailableError("Time slot is currently being held")

        # Create hold
        hold = await self.slot_hold_repo.create(
            workspace_id=workspace_id,
            service_type_id=service_type_id,
            start_time=start_time,
            end_time=end_time,
            client_email=client_email,
            hold_duration_seconds=hold_duration_seconds,
        )

        return hold

    async def release_hold(
        self,
        hold_id: UUID,
    ) -> bool:
        """Release a slot hold."""
        return await self.slot_hold_repo.release(hold_id)

    # =========================================================================
    # CALENDAR OPERATIONS
    # =========================================================================

    async def generate_booking_ics(
        self,
        workspace_id: UUID,
        booking_id: UUID,
        organizer_name: str,
        organizer_email: str,
    ) -> tuple[bytes, str]:
        """Generate ICS calendar file for a booking.

        Args:
            workspace_id: Workspace ID
            booking_id: Booking ID
            organizer_name: Photographer/business name
            organizer_email: Photographer email

        Returns:
            Tuple of (ics_bytes, filename)
        """
        if not is_calendar_available():
            raise BookingServiceError("Calendar generation not available")

        booking = await self.booking_repo.get_by_id(workspace_id, booking_id)
        if not booking:
            raise BookingNotFoundError("Booking not found")

        calendar_service = get_calendar_service()

        start_time = datetime.fromisoformat(booking["start_time"].replace("Z", "+00:00"))
        end_time = datetime.fromisoformat(booking["end_time"].replace("Z", "+00:00"))

        description_parts = [
            f"Service: {booking['service_type_name']}",
            f"Confirmation Code: {booking['confirmation_code']}",
        ]
        if booking.get("client_notes"):
            description_parts.append(f"Notes: {booking['client_notes']}")

        return calendar_service.generate_ics(
            event_id=booking["booking_id"],
            title=f"{booking['service_type_name']} - {booking['client_name']}",
            event_datetime=start_time,
            event_end_datetime=end_time,
            timezone=booking.get("timezone", "UTC"),
            description="\n".join(description_parts),
            location=booking.get("location"),
            organizer_name=organizer_name,
            organizer_email=organizer_email,
            include_alarms=True,
        )


# =============================================================================
# SINGLETON FACTORY
# =============================================================================

_booking_service: Optional[BookingService] = None


def get_booking_service() -> BookingService:
    """Get the singleton BookingService instance."""
    global _booking_service
    if _booking_service is None:
        _booking_service = BookingService()
    return _booking_service
