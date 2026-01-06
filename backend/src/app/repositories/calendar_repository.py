"""Repository for calendar integration and availability data operations.

This module provides repositories for:
- CalendarIntegrationRepository: External calendar connections
- AvailabilityRepository: Working hours and overrides
- SlotHoldRepository: Temporary slot reservations

Feature: Calendar Integrations & Booking Management
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone, date
from typing import Any, Optional
from uuid import UUID, uuid4

from app.db.postgres import get_postgres_pool


logger = logging.getLogger(__name__)


# =============================================================================
# CALENDAR INTEGRATION REPOSITORY
# =============================================================================


class CalendarIntegrationRepository:
    """Data access layer for calendar integrations."""

    async def create(
        self,
        workspace_id: UUID,
        user_id: UUID,
        provider: str,
        account_email: str,
        external_calendar_id: str,
        display_name: Optional[str] = None,
        external_calendar_name: Optional[str] = None,
        sync_direction: str = "bidirectional",
        include_in_availability: bool = True,
        access_token_encrypted: Optional[str] = None,
        refresh_token_encrypted: Optional[str] = None,
        token_expires_at: Optional[datetime] = None,
    ) -> dict[str, Any]:
        """Create a new calendar integration."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            integration_id = uuid4()

            row = await conn.fetchrow(
                """
                INSERT INTO calendar_integrations (
                    integration_id, workspace_id, user_id,
                    provider, account_email, display_name,
                    external_calendar_id, external_calendar_name,
                    sync_direction, include_in_availability,
                    access_token_encrypted, refresh_token_encrypted, token_expires_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
                )
                RETURNING *
                """,
                integration_id,
                workspace_id,
                user_id,
                provider,
                account_email,
                display_name,
                external_calendar_id,
                external_calendar_name,
                sync_direction,
                include_in_availability,
                access_token_encrypted,
                refresh_token_encrypted,
                token_expires_at,
            )

            logger.info(
                "Calendar integration created",
                extra={
                    "integration_id": str(integration_id),
                    "workspace_id": str(workspace_id),
                    "provider": provider,
                },
            )

            return self._row_to_dict(row)

    async def get_by_id(
        self,
        workspace_id: UUID,
        integration_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get a calendar integration by ID."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM calendar_integrations
                WHERE integration_id = $1 AND workspace_id = $2
                """,
                integration_id,
                workspace_id,
            )
            return self._row_to_dict(row) if row else None

    async def list_by_workspace(
        self,
        workspace_id: UUID,
        provider: Optional[str] = None,
        status: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        """List calendar integrations for a workspace."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            query_parts = ["SELECT * FROM calendar_integrations WHERE workspace_id = $1"]
            params: list[Any] = [workspace_id]
            param_index = 2

            if provider:
                query_parts.append(f"AND provider = ${param_index}")
                params.append(provider)
                param_index += 1

            if status:
                query_parts.append(f"AND status = ${param_index}")
                params.append(status)

            query_parts.append("ORDER BY created_at DESC")
            query = " ".join(query_parts)

            rows = await conn.fetch(query, *params)
            return [self._row_to_dict(row) for row in rows]

    async def list_for_availability(
        self,
        workspace_id: UUID,
    ) -> list[dict[str, Any]]:
        """List integrations included in availability calculation."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM calendar_integrations
                WHERE workspace_id = $1
                  AND include_in_availability = TRUE
                  AND status = 'connected'
                ORDER BY created_at DESC
                """,
                workspace_id,
            )
            return [self._row_to_dict(row) for row in rows]

    async def update(
        self,
        workspace_id: UUID,
        integration_id: UUID,
        display_name: Optional[str] = None,
        sync_direction: Optional[str] = None,
        include_in_availability: Optional[bool] = None,
        status: Optional[str] = None,
        access_token_encrypted: Optional[str] = None,
        refresh_token_encrypted: Optional[str] = None,
        token_expires_at: Optional[datetime] = None,
        last_sync_at: Optional[datetime] = None,
        last_sync_error: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        """Update a calendar integration."""
        updates: list[str] = []
        params: list[Any] = []
        param_index = 1

        field_updates = {
            "display_name": display_name,
            "sync_direction": sync_direction,
            "include_in_availability": include_in_availability,
            "status": status,
            "access_token_encrypted": access_token_encrypted,
            "refresh_token_encrypted": refresh_token_encrypted,
            "token_expires_at": token_expires_at,
            "last_sync_at": last_sync_at,
            "last_sync_error": last_sync_error,
        }

        for field, value in field_updates.items():
            if value is not None:
                updates.append(f"{field} = ${param_index}")
                params.append(value)
                param_index += 1

        if not updates:
            return await self.get_by_id(workspace_id, integration_id)

        params.append(integration_id)
        params.append(workspace_id)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            query = f"""
                UPDATE calendar_integrations
                SET {", ".join(updates)}
                WHERE integration_id = ${param_index} AND workspace_id = ${param_index + 1}
                RETURNING *
            """
            row = await conn.fetchrow(query, *params)
            return self._row_to_dict(row) if row else None

    async def delete(
        self,
        workspace_id: UUID,
        integration_id: UUID,
    ) -> bool:
        """Delete a calendar integration."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM calendar_integrations
                WHERE integration_id = $1 AND workspace_id = $2
                """,
                integration_id,
                workspace_id,
            )
            return result == "DELETE 1"

    def _row_to_dict(self, row) -> dict[str, Any]:
        """Convert a database row to a dictionary."""
        if row is None:
            return {}

        result = dict(row)

        uuid_fields = ["integration_id", "workspace_id", "user_id"]
        for field in uuid_fields:
            if field in result and result[field] is not None:
                result[field] = str(result[field])

        datetime_fields = ["created_at", "updated_at", "token_expires_at", "last_sync_at"]
        for field in datetime_fields:
            if field in result and result[field] is not None:
                result[field] = result[field].isoformat()

        # Remove sensitive token fields from response
        result.pop("access_token_encrypted", None)
        result.pop("refresh_token_encrypted", None)

        return result


# =============================================================================
# AVAILABILITY REPOSITORY
# =============================================================================


class AvailabilityRepository:
    """Data access layer for availability settings and overrides."""

    # -------------------------------------------------------------------------
    # AVAILABILITY SETTINGS
    # -------------------------------------------------------------------------

    async def get_settings(
        self,
        workspace_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get availability settings for a workspace."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM availability_settings
                WHERE workspace_id = $1
                """,
                workspace_id,
            )
            return self._settings_row_to_dict(row) if row else None

    async def create_settings(
        self,
        workspace_id: UUID,
        timezone_str: str = "UTC",
        weekly_schedule: Optional[list[dict]] = None,
        buffer_before_minutes: int = 15,
        buffer_after_minutes: int = 15,
        minimum_notice_hours: int = 24,
        max_advance_days: int = 60,
        slot_increment_minutes: int = 30,
    ) -> dict[str, Any]:
        """Create availability settings for a workspace."""
        pool = await get_postgres_pool()

        import json
        default_schedule = [
            {"day": "monday", "is_available": True, "time_windows": [{"start": "09:00", "end": "17:00"}]},
            {"day": "tuesday", "is_available": True, "time_windows": [{"start": "09:00", "end": "17:00"}]},
            {"day": "wednesday", "is_available": True, "time_windows": [{"start": "09:00", "end": "17:00"}]},
            {"day": "thursday", "is_available": True, "time_windows": [{"start": "09:00", "end": "17:00"}]},
            {"day": "friday", "is_available": True, "time_windows": [{"start": "09:00", "end": "17:00"}]},
            {"day": "saturday", "is_available": False, "time_windows": []},
            {"day": "sunday", "is_available": False, "time_windows": []},
        ]

        schedule = weekly_schedule or default_schedule

        async with pool.acquire() as conn:
            settings_id = uuid4()

            row = await conn.fetchrow(
                """
                INSERT INTO availability_settings (
                    settings_id, workspace_id, timezone, weekly_schedule,
                    buffer_before_minutes, buffer_after_minutes,
                    minimum_notice_hours, max_advance_days, slot_increment_minutes
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *
                """,
                settings_id,
                workspace_id,
                timezone_str,
                json.dumps(schedule),
                buffer_before_minutes,
                buffer_after_minutes,
                minimum_notice_hours,
                max_advance_days,
                slot_increment_minutes,
            )

            logger.info(
                "Availability settings created",
                extra={"workspace_id": str(workspace_id)},
            )

            return self._settings_row_to_dict(row)

    async def update_settings(
        self,
        workspace_id: UUID,
        timezone_str: Optional[str] = None,
        weekly_schedule: Optional[list[dict]] = None,
        buffer_before_minutes: Optional[int] = None,
        buffer_after_minutes: Optional[int] = None,
        minimum_notice_hours: Optional[int] = None,
        max_advance_days: Optional[int] = None,
        slot_increment_minutes: Optional[int] = None,
    ) -> Optional[dict[str, Any]]:
        """Update availability settings."""
        import json

        updates: list[str] = []
        params: list[Any] = []
        param_index = 1

        field_updates = {
            "timezone": timezone_str,
            "buffer_before_minutes": buffer_before_minutes,
            "buffer_after_minutes": buffer_after_minutes,
            "minimum_notice_hours": minimum_notice_hours,
            "max_advance_days": max_advance_days,
            "slot_increment_minutes": slot_increment_minutes,
        }

        for field, value in field_updates.items():
            if value is not None:
                updates.append(f"{field} = ${param_index}")
                params.append(value)
                param_index += 1

        if weekly_schedule is not None:
            updates.append(f"weekly_schedule = ${param_index}")
            params.append(json.dumps(weekly_schedule))
            param_index += 1

        if not updates:
            return await self.get_settings(workspace_id)

        params.append(workspace_id)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            query = f"""
                UPDATE availability_settings
                SET {", ".join(updates)}
                WHERE workspace_id = ${param_index}
                RETURNING *
            """
            row = await conn.fetchrow(query, *params)
            return self._settings_row_to_dict(row) if row else None

    # -------------------------------------------------------------------------
    # AVAILABILITY OVERRIDES
    # -------------------------------------------------------------------------

    async def create_override(
        self,
        workspace_id: UUID,
        override_date: date,
        is_available: bool,
        time_windows: Optional[list[dict]] = None,
        reason: Optional[str] = None,
    ) -> dict[str, Any]:
        """Create an availability override for a specific date."""
        import json

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            override_id = uuid4()

            row = await conn.fetchrow(
                """
                INSERT INTO availability_overrides (
                    override_id, workspace_id, override_date,
                    is_available, time_windows, reason
                ) VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (workspace_id, override_date)
                DO UPDATE SET
                    is_available = $4,
                    time_windows = $5,
                    reason = $6
                RETURNING *
                """,
                override_id,
                workspace_id,
                override_date,
                is_available,
                json.dumps(time_windows) if time_windows else None,
                reason,
            )

            logger.info(
                "Availability override created",
                extra={
                    "workspace_id": str(workspace_id),
                    "date": override_date.isoformat(),
                },
            )

            return self._override_row_to_dict(row)

    async def get_override(
        self,
        workspace_id: UUID,
        override_date: date,
    ) -> Optional[dict[str, Any]]:
        """Get an override for a specific date."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM availability_overrides
                WHERE workspace_id = $1 AND override_date = $2
                """,
                workspace_id,
                override_date,
            )
            return self._override_row_to_dict(row) if row else None

    async def list_overrides(
        self,
        workspace_id: UUID,
        start_date: date,
        end_date: date,
    ) -> list[dict[str, Any]]:
        """List overrides within a date range."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM availability_overrides
                WHERE workspace_id = $1
                  AND override_date >= $2
                  AND override_date <= $3
                ORDER BY override_date ASC
                """,
                workspace_id,
                start_date,
                end_date,
            )
            return [self._override_row_to_dict(row) for row in rows]

    async def delete_override(
        self,
        workspace_id: UUID,
        override_id: UUID,
    ) -> bool:
        """Delete an availability override."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM availability_overrides
                WHERE override_id = $1 AND workspace_id = $2
                """,
                override_id,
                workspace_id,
            )
            return result == "DELETE 1"

    # -------------------------------------------------------------------------
    # HELPER METHODS
    # -------------------------------------------------------------------------

    def _settings_row_to_dict(self, row) -> dict[str, Any]:
        """Convert settings row to dictionary."""
        if row is None:
            return {}

        result = dict(row)

        uuid_fields = ["settings_id", "workspace_id"]
        for field in uuid_fields:
            if field in result and result[field] is not None:
                result[field] = str(result[field])

        datetime_fields = ["created_at", "updated_at"]
        for field in datetime_fields:
            if field in result and result[field] is not None:
                result[field] = result[field].isoformat()

        return result

    def _override_row_to_dict(self, row) -> dict[str, Any]:
        """Convert override row to dictionary."""
        if row is None:
            return {}

        result = dict(row)

        uuid_fields = ["override_id", "workspace_id"]
        for field in uuid_fields:
            if field in result and result[field] is not None:
                result[field] = str(result[field])

        if "override_date" in result and result["override_date"] is not None:
            result["date"] = result.pop("override_date").isoformat()

        datetime_fields = ["created_at"]
        for field in datetime_fields:
            if field in result and result[field] is not None:
                result[field] = result[field].isoformat()

        return result


# =============================================================================
# SLOT HOLD REPOSITORY
# =============================================================================


class SlotHoldRepository:
    """Data access layer for slot hold records."""

    async def create(
        self,
        workspace_id: UUID,
        service_type_id: UUID,
        start_time: datetime,
        end_time: datetime,
        client_email: str,
        hold_duration_seconds: int = 900,  # 15 minutes default
    ) -> dict[str, Any]:
        """Create a temporary slot hold."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            hold_id = uuid4()
            expires_at = datetime.now(timezone.utc) + timedelta(seconds=hold_duration_seconds)

            row = await conn.fetchrow(
                """
                INSERT INTO slot_holds (
                    hold_id, workspace_id, service_type_id,
                    start_time, end_time, client_email, expires_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *
                """,
                hold_id,
                workspace_id,
                service_type_id,
                start_time,
                end_time,
                client_email,
                expires_at,
            )

            logger.info(
                "Slot hold created",
                extra={
                    "hold_id": str(hold_id),
                    "workspace_id": str(workspace_id),
                    "expires_at": expires_at.isoformat(),
                },
            )

            return self._row_to_dict(row)

    async def get_by_id(
        self,
        hold_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get a slot hold by ID."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM slot_holds
                WHERE hold_id = $1 AND is_released = FALSE
                """,
                hold_id,
            )
            return self._row_to_dict(row) if row else None

    async def check_slot_held(
        self,
        workspace_id: UUID,
        start_time: datetime,
        end_time: datetime,
        exclude_hold_id: Optional[UUID] = None,
    ) -> bool:
        """Check if a slot is held by an active hold."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            if exclude_hold_id:
                held = await conn.fetchval(
                    """
                    SELECT 1 FROM slot_holds
                    WHERE workspace_id = $1
                      AND hold_id != $4
                      AND is_released = FALSE
                      AND expires_at > NOW()
                      AND start_time < $3
                      AND end_time > $2
                    LIMIT 1
                    """,
                    workspace_id,
                    start_time,
                    end_time,
                    exclude_hold_id,
                )
            else:
                held = await conn.fetchval(
                    """
                    SELECT 1 FROM slot_holds
                    WHERE workspace_id = $1
                      AND is_released = FALSE
                      AND expires_at > NOW()
                      AND start_time < $3
                      AND end_time > $2
                    LIMIT 1
                    """,
                    workspace_id,
                    start_time,
                    end_time,
                )
            return held is not None

    async def release(
        self,
        hold_id: UUID,
        booking_id: Optional[UUID] = None,
    ) -> bool:
        """Release a slot hold (optionally linking to a booking)."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE slot_holds
                SET is_released = TRUE,
                    released_at = NOW(),
                    booking_id = $2
                WHERE hold_id = $1 AND is_released = FALSE
                """,
                hold_id,
                booking_id,
            )
            return "UPDATE 1" in result

    async def cleanup_expired(self) -> int:
        """Clean up expired holds."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE slot_holds
                SET is_released = TRUE, released_at = NOW()
                WHERE is_released = FALSE AND expires_at < NOW()
                """
            )
            count = int(result.split()[1]) if result else 0
            if count > 0:
                logger.info(f"Cleaned up {count} expired slot holds")
            return count

    def _row_to_dict(self, row) -> dict[str, Any]:
        """Convert a database row to a dictionary."""
        if row is None:
            return {}

        result = dict(row)

        uuid_fields = ["hold_id", "workspace_id", "service_type_id", "booking_id"]
        for field in uuid_fields:
            if field in result and result[field] is not None:
                result[field] = str(result[field])

        datetime_fields = ["start_time", "end_time", "expires_at", "created_at", "released_at"]
        for field in datetime_fields:
            if field in result and result[field] is not None:
                result[field] = result[field].isoformat()

        return result


# =============================================================================
# BOOKING POLICIES REPOSITORY
# =============================================================================


class BookingPoliciesRepository:
    """Data access layer for booking policies."""

    async def get(
        self,
        workspace_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get booking policies for a workspace."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM booking_policies
                WHERE workspace_id = $1
                """,
                workspace_id,
            )
            return self._row_to_dict(row) if row else None

    async def create(
        self,
        workspace_id: UUID,
        cancellation_policy: Optional[dict] = None,
        allow_reschedule: bool = True,
        reschedule_deadline_hours: int = 24,
        max_reschedules: int = 3,
        require_deposit: bool = True,
        collect_full_payment: bool = False,
        confirmation_message: Optional[str] = None,
        reminder_settings: Optional[dict] = None,
    ) -> dict[str, Any]:
        """Create booking policies for a workspace."""
        import json

        pool = await get_postgres_pool()

        default_cancellation = {
            "type": "full_refund",
            "free_cancellation_hours": 48,
            "partial_refund_percent": 50,
            "description": "Free cancellation up to 48 hours before the appointment.",
        }

        default_reminders = {
            "send_24h_reminder": True,
            "send_1h_reminder": True,
            "send_follow_up": True,
            "follow_up_delay_hours": 24,
        }

        async with pool.acquire() as conn:
            policies_id = uuid4()

            row = await conn.fetchrow(
                """
                INSERT INTO booking_policies (
                    policies_id, workspace_id,
                    cancellation_policy, allow_reschedule,
                    reschedule_deadline_hours, max_reschedules,
                    require_deposit, collect_full_payment,
                    confirmation_message, reminder_settings
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING *
                """,
                policies_id,
                workspace_id,
                json.dumps(cancellation_policy or default_cancellation),
                allow_reschedule,
                reschedule_deadline_hours,
                max_reschedules,
                require_deposit,
                collect_full_payment,
                confirmation_message,
                json.dumps(reminder_settings or default_reminders),
            )

            return self._row_to_dict(row)

    async def update(
        self,
        workspace_id: UUID,
        cancellation_policy: Optional[dict] = None,
        allow_reschedule: Optional[bool] = None,
        reschedule_deadline_hours: Optional[int] = None,
        max_reschedules: Optional[int] = None,
        require_deposit: Optional[bool] = None,
        collect_full_payment: Optional[bool] = None,
        confirmation_message: Optional[str] = None,
        reminder_settings: Optional[dict] = None,
    ) -> Optional[dict[str, Any]]:
        """Update booking policies."""
        import json

        updates: list[str] = []
        params: list[Any] = []
        param_index = 1

        if cancellation_policy is not None:
            updates.append(f"cancellation_policy = ${param_index}")
            params.append(json.dumps(cancellation_policy))
            param_index += 1

        if reminder_settings is not None:
            updates.append(f"reminder_settings = ${param_index}")
            params.append(json.dumps(reminder_settings))
            param_index += 1

        field_updates = {
            "allow_reschedule": allow_reschedule,
            "reschedule_deadline_hours": reschedule_deadline_hours,
            "max_reschedules": max_reschedules,
            "require_deposit": require_deposit,
            "collect_full_payment": collect_full_payment,
            "confirmation_message": confirmation_message,
        }

        for field, value in field_updates.items():
            if value is not None:
                updates.append(f"{field} = ${param_index}")
                params.append(value)
                param_index += 1

        if not updates:
            return await self.get(workspace_id)

        params.append(workspace_id)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            query = f"""
                UPDATE booking_policies
                SET {", ".join(updates)}
                WHERE workspace_id = ${param_index}
                RETURNING *
            """
            row = await conn.fetchrow(query, *params)
            return self._row_to_dict(row) if row else None

    def _row_to_dict(self, row) -> dict[str, Any]:
        """Convert a database row to a dictionary."""
        if row is None:
            return {}

        result = dict(row)

        uuid_fields = ["policies_id", "workspace_id"]
        for field in uuid_fields:
            if field in result and result[field] is not None:
                result[field] = str(result[field])

        datetime_fields = ["created_at", "updated_at"]
        for field in datetime_fields:
            if field in result and result[field] is not None:
                result[field] = result[field].isoformat()

        return result


# =============================================================================
# SINGLETON FACTORIES
# =============================================================================

_calendar_integration_repository: Optional[CalendarIntegrationRepository] = None
_availability_repository: Optional[AvailabilityRepository] = None
_slot_hold_repository: Optional[SlotHoldRepository] = None
_booking_policies_repository: Optional[BookingPoliciesRepository] = None


def get_calendar_integration_repository() -> CalendarIntegrationRepository:
    """Get the singleton CalendarIntegrationRepository instance."""
    global _calendar_integration_repository
    if _calendar_integration_repository is None:
        _calendar_integration_repository = CalendarIntegrationRepository()
    return _calendar_integration_repository


def get_availability_repository() -> AvailabilityRepository:
    """Get the singleton AvailabilityRepository instance."""
    global _availability_repository
    if _availability_repository is None:
        _availability_repository = AvailabilityRepository()
    return _availability_repository


def get_slot_hold_repository() -> SlotHoldRepository:
    """Get the singleton SlotHoldRepository instance."""
    global _slot_hold_repository
    if _slot_hold_repository is None:
        _slot_hold_repository = SlotHoldRepository()
    return _slot_hold_repository


def get_booking_policies_repository() -> BookingPoliciesRepository:
    """Get the singleton BookingPoliciesRepository instance."""
    global _booking_policies_repository
    if _booking_policies_repository is None:
        _booking_policies_repository = BookingPoliciesRepository()
    return _booking_policies_repository
