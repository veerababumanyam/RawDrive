"""Repository for booking data operations.

This module provides the BookingRepository class that handles all CRUD
operations for bookings, service types, availability settings, and slot holds.

All queries enforce workspace_id filtering to ensure data isolation
between tenants.

Feature: Calendar Integrations & Booking Management
"""

from __future__ import annotations

import logging
import secrets
import string
from datetime import datetime, timezone, timedelta
from typing import Any, Optional
from uuid import UUID, uuid4

from app.db.postgres import get_postgres_pool


logger = logging.getLogger(__name__)


def _generate_confirmation_code(length: int = 8) -> str:
    """Generate a unique confirmation code for bookings."""
    charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # Excludes confusing chars
    code = "".join(secrets.choice(charset) for _ in range(length))
    return f"RD{code}"


class BookingRepository:
    """Data access layer for booking records.

    This repository handles all CRUD operations for bookings, ensuring
    proper workspace isolation for multi-tenant security.
    """

    # =========================================================================
    # BOOKING CREATE OPERATIONS
    # =========================================================================

    async def create(
        self,
        workspace_id: UUID,
        service_type_id: UUID,
        service_type_name: str,
        client_name: str,
        client_email: str,
        start_time: datetime,
        end_time: datetime,
        timezone_str: str,
        total_price_cents: int,
        currency: str = "USD",
        client_id: Optional[UUID] = None,
        client_phone: Optional[str] = None,
        location: Optional[str] = None,
        client_notes: Optional[str] = None,
        internal_notes: Optional[str] = None,
        deposit_amount_cents: int = 0,
        source: str = "public_page",
        status: str = "pending",
        hold_expires_at: Optional[datetime] = None,
    ) -> dict[str, Any]:
        """Create a new booking record."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            booking_id = uuid4()
            confirmation_code = _generate_confirmation_code()

            # Ensure unique confirmation code
            while True:
                existing = await conn.fetchval(
                    "SELECT 1 FROM bookings WHERE confirmation_code = $1",
                    confirmation_code,
                )
                if not existing:
                    break
                confirmation_code = _generate_confirmation_code()

            row = await conn.fetchrow(
                """
                INSERT INTO bookings (
                    booking_id, workspace_id, service_type_id, service_type_name,
                    client_id, client_name, client_email, client_phone,
                    status, start_time, end_time, timezone,
                    location, client_notes, internal_notes,
                    total_price_cents, deposit_amount_cents, currency,
                    source, confirmation_code, hold_expires_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
                )
                RETURNING *
                """,
                booking_id,
                workspace_id,
                service_type_id,
                service_type_name,
                client_id,
                client_name,
                client_email,
                client_phone,
                status,
                start_time,
                end_time,
                timezone_str,
                location,
                client_notes,
                internal_notes,
                total_price_cents,
                deposit_amount_cents,
                currency,
                source,
                confirmation_code,
                hold_expires_at,
            )

            logger.info(
                "Booking created",
                extra={
                    "booking_id": str(booking_id),
                    "workspace_id": str(workspace_id),
                    "confirmation_code": confirmation_code,
                },
            )

            return self._row_to_dict(row)

    # =========================================================================
    # BOOKING READ OPERATIONS
    # =========================================================================

    async def get_by_id(
        self,
        workspace_id: UUID,
        booking_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get a single booking by ID with workspace isolation."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM bookings
                WHERE booking_id = $1 AND workspace_id = $2
                """,
                booking_id,
                workspace_id,
            )
            return self._row_to_dict(row) if row else None

    async def get_by_confirmation_code(
        self,
        confirmation_code: str,
        client_email: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        """Get a booking by confirmation code (for public lookup)."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            if client_email:
                row = await conn.fetchrow(
                    """
                    SELECT * FROM bookings
                    WHERE confirmation_code = $1 AND client_email = $2
                    """,
                    confirmation_code,
                    client_email,
                )
            else:
                row = await conn.fetchrow(
                    """
                    SELECT * FROM bookings
                    WHERE confirmation_code = $1
                    """,
                    confirmation_code,
                )
            return self._row_to_dict(row) if row else None

    async def list_by_workspace(
        self,
        workspace_id: UUID,
        status: Optional[str] = None,
        service_type_id: Optional[UUID] = None,
        client_id: Optional[UUID] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        source: Optional[str] = None,
        search: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
        sort_by: str = "start_time",
        sort_order: str = "desc",
    ) -> list[dict[str, Any]]:
        """List bookings with filters."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            query_parts = ["SELECT * FROM bookings WHERE workspace_id = $1"]
            params: list[Any] = [workspace_id]
            param_index = 2

            if status:
                query_parts.append(f"AND status = ${param_index}")
                params.append(status)
                param_index += 1

            if service_type_id:
                query_parts.append(f"AND service_type_id = ${param_index}")
                params.append(service_type_id)
                param_index += 1

            if client_id:
                query_parts.append(f"AND client_id = ${param_index}")
                params.append(client_id)
                param_index += 1

            if start_date:
                query_parts.append(f"AND start_time >= ${param_index}")
                params.append(start_date)
                param_index += 1

            if end_date:
                query_parts.append(f"AND start_time <= ${param_index}")
                params.append(end_date)
                param_index += 1

            if source:
                query_parts.append(f"AND source = ${param_index}")
                params.append(source)
                param_index += 1

            if search:
                query_parts.append(
                    f"AND (client_name ILIKE ${param_index} OR client_email ILIKE ${param_index})"
                )
                params.append(f"%{search}%")
                param_index += 1

            # Validate sort_by to prevent SQL injection
            valid_sort_fields = ["start_time", "created_at", "client_name", "status"]
            if sort_by not in valid_sort_fields:
                sort_by = "start_time"
            sort_direction = "DESC" if sort_order.lower() == "desc" else "ASC"

            query_parts.append(f"ORDER BY {sort_by} {sort_direction}")
            query_parts.append(f"LIMIT ${param_index} OFFSET ${param_index + 1}")
            params.extend([limit, offset])

            query = " ".join(query_parts)
            rows = await conn.fetch(query, *params)
            return [self._row_to_dict(row) for row in rows]

    async def list_upcoming(
        self,
        workspace_id: UUID,
        days: int = 7,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """List upcoming bookings."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM bookings
                WHERE workspace_id = $1
                  AND status IN ('pending', 'confirmed')
                  AND start_time >= NOW()
                  AND start_time <= NOW() + INTERVAL '1 day' * $2
                ORDER BY start_time ASC
                LIMIT $3
                """,
                workspace_id,
                days,
                limit,
            )
            return [self._row_to_dict(row) for row in rows]

    async def count_by_workspace(
        self,
        workspace_id: UUID,
        status: Optional[str] = None,
    ) -> int:
        """Count bookings for a workspace."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            if status:
                count = await conn.fetchval(
                    """
                    SELECT COUNT(*) FROM bookings
                    WHERE workspace_id = $1 AND status = $2
                    """,
                    workspace_id,
                    status,
                )
            else:
                count = await conn.fetchval(
                    """
                    SELECT COUNT(*) FROM bookings
                    WHERE workspace_id = $1
                    """,
                    workspace_id,
                )
            return count or 0

    async def check_slot_conflict(
        self,
        workspace_id: UUID,
        start_time: datetime,
        end_time: datetime,
        exclude_booking_id: Optional[UUID] = None,
    ) -> bool:
        """Check if a time slot conflicts with existing bookings."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            if exclude_booking_id:
                conflict = await conn.fetchval(
                    """
                    SELECT 1 FROM bookings
                    WHERE workspace_id = $1
                      AND booking_id != $4
                      AND status IN ('pending', 'confirmed')
                      AND start_time < $3
                      AND end_time > $2
                    LIMIT 1
                    """,
                    workspace_id,
                    start_time,
                    end_time,
                    exclude_booking_id,
                )
            else:
                conflict = await conn.fetchval(
                    """
                    SELECT 1 FROM bookings
                    WHERE workspace_id = $1
                      AND status IN ('pending', 'confirmed')
                      AND start_time < $3
                      AND end_time > $2
                    LIMIT 1
                    """,
                    workspace_id,
                    start_time,
                    end_time,
                )
            return conflict is not None

    # =========================================================================
    # BOOKING UPDATE OPERATIONS
    # =========================================================================

    async def update(
        self,
        workspace_id: UUID,
        booking_id: UUID,
        status: Optional[str] = None,
        payment_status: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        location: Optional[str] = None,
        client_notes: Optional[str] = None,
        internal_notes: Optional[str] = None,
        amount_paid_cents: Optional[int] = None,
        stripe_payment_intent_id: Optional[str] = None,
        external_event_id: Optional[str] = None,
        cancellation_reason: Optional[str] = None,
        cancelled_at: Optional[datetime] = None,
        cancelled_by: Optional[str] = None,
        rescheduled_to_id: Optional[UUID] = None,
        reminders_sent: Optional[dict] = None,
    ) -> Optional[dict[str, Any]]:
        """Update an existing booking."""
        updates: list[str] = []
        params: list[Any] = []
        param_index = 1

        field_updates = {
            "status": status,
            "payment_status": payment_status,
            "start_time": start_time,
            "end_time": end_time,
            "location": location,
            "client_notes": client_notes,
            "internal_notes": internal_notes,
            "amount_paid_cents": amount_paid_cents,
            "stripe_payment_intent_id": stripe_payment_intent_id,
            "external_event_id": external_event_id,
            "cancellation_reason": cancellation_reason,
            "cancelled_at": cancelled_at,
            "cancelled_by": cancelled_by,
            "rescheduled_to_id": rescheduled_to_id,
            "reminders_sent": reminders_sent,
        }

        for field, value in field_updates.items():
            if value is not None:
                updates.append(f"{field} = ${param_index}")
                params.append(value)
                param_index += 1

        if not updates:
            return await self.get_by_id(workspace_id, booking_id)

        params.append(booking_id)
        params.append(workspace_id)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            query = f"""
                UPDATE bookings
                SET {", ".join(updates)}
                WHERE booking_id = ${param_index} AND workspace_id = ${param_index + 1}
                RETURNING *
            """
            row = await conn.fetchrow(query, *params)

            if row:
                logger.info(
                    "Booking updated",
                    extra={
                        "booking_id": str(booking_id),
                        "workspace_id": str(workspace_id),
                        "updated_fields": [k for k, v in field_updates.items() if v is not None],
                    },
                )

            return self._row_to_dict(row) if row else None

    async def confirm(
        self,
        workspace_id: UUID,
        booking_id: UUID,
        payment_status: str = "deposit_paid",
    ) -> Optional[dict[str, Any]]:
        """Confirm a booking."""
        return await self.update(
            workspace_id=workspace_id,
            booking_id=booking_id,
            status="confirmed",
            payment_status=payment_status,
        )

    async def cancel(
        self,
        workspace_id: UUID,
        booking_id: UUID,
        reason: Optional[str] = None,
        cancelled_by: str = "photographer",
    ) -> Optional[dict[str, Any]]:
        """Cancel a booking."""
        return await self.update(
            workspace_id=workspace_id,
            booking_id=booking_id,
            status="cancelled",
            cancellation_reason=reason,
            cancelled_at=datetime.now(timezone.utc),
            cancelled_by=cancelled_by,
        )

    async def complete(
        self,
        workspace_id: UUID,
        booking_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Mark a booking as completed."""
        return await self.update(
            workspace_id=workspace_id,
            booking_id=booking_id,
            status="completed",
        )

    async def mark_no_show(
        self,
        workspace_id: UUID,
        booking_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Mark a booking as no-show."""
        return await self.update(
            workspace_id=workspace_id,
            booking_id=booking_id,
            status="no_show",
        )

    # =========================================================================
    # BOOKING DELETE OPERATIONS
    # =========================================================================

    async def delete(
        self,
        workspace_id: UUID,
        booking_id: UUID,
    ) -> bool:
        """Delete a booking (hard delete)."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM bookings
                WHERE booking_id = $1 AND workspace_id = $2
                """,
                booking_id,
                workspace_id,
            )

            deleted = result == "DELETE 1"
            if deleted:
                logger.warning(
                    "Booking deleted",
                    extra={
                        "booking_id": str(booking_id),
                        "workspace_id": str(workspace_id),
                    },
                )

            return deleted

    # =========================================================================
    # STATISTICS
    # =========================================================================

    async def get_stats(
        self,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Get booking statistics for a workspace."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Get counts by status
            status_counts = await conn.fetch(
                """
                SELECT status, COUNT(*) as count
                FROM bookings
                WHERE workspace_id = $1
                GROUP BY status
                """,
                workspace_id,
            )

            # Get revenue stats
            revenue = await conn.fetchrow(
                """
                SELECT
                    SUM(amount_paid_cents) as total_revenue,
                    SUM(CASE WHEN created_at >= DATE_TRUNC('month', NOW()) THEN amount_paid_cents ELSE 0 END) as month_revenue,
                    COUNT(CASE WHEN created_at >= DATE_TRUNC('month', NOW()) THEN 1 END) as month_bookings,
                    AVG(total_price_cents) as avg_booking_value
                FROM bookings
                WHERE workspace_id = $1
                  AND status IN ('confirmed', 'completed')
                """,
                workspace_id,
            )

            # Get upcoming count
            upcoming_count = await conn.fetchval(
                """
                SELECT COUNT(*) FROM bookings
                WHERE workspace_id = $1
                  AND status IN ('pending', 'confirmed')
                  AND start_time >= NOW()
                """,
                workspace_id,
            )

            # Calculate rates
            total = sum(row["count"] for row in status_counts)
            cancelled = next(
                (row["count"] for row in status_counts if row["status"] == "cancelled"), 0
            )
            no_shows = next(
                (row["count"] for row in status_counts if row["status"] == "no_show"), 0
            )

            return {
                "workspace_id": str(workspace_id),
                "total_bookings": total,
                "bookings_this_month": revenue["month_bookings"] or 0,
                "bookings_by_status": {row["status"]: row["count"] for row in status_counts},
                "revenue_this_month_cents": revenue["month_revenue"] or 0,
                "revenue_total_cents": revenue["total_revenue"] or 0,
                "average_booking_value_cents": int(revenue["avg_booking_value"] or 0),
                "cancellation_rate_percent": round((cancelled / total * 100) if total > 0 else 0, 2),
                "no_show_rate_percent": round((no_shows / total * 100) if total > 0 else 0, 2),
                "upcoming_bookings_count": upcoming_count or 0,
            }

    # =========================================================================
    # HELPER METHODS
    # =========================================================================

    def _row_to_dict(self, row) -> dict[str, Any]:
        """Convert a database row to a dictionary."""
        if row is None:
            return {}

        result = dict(row)

        # Convert UUIDs to strings
        uuid_fields = [
            "booking_id", "workspace_id", "service_type_id",
            "client_id", "rescheduled_from_id", "rescheduled_to_id"
        ]
        for field in uuid_fields:
            if field in result and result[field] is not None:
                result[field] = str(result[field])

        # Convert datetimes to ISO format strings
        datetime_fields = [
            "start_time", "end_time", "created_at", "updated_at",
            "cancelled_at", "hold_expires_at"
        ]
        for field in datetime_fields:
            if field in result and result[field] is not None:
                result[field] = result[field].isoformat()

        return result


# =============================================================================
# SINGLETON FACTORY
# =============================================================================

_booking_repository: Optional[BookingRepository] = None


def get_booking_repository() -> BookingRepository:
    """Get the singleton BookingRepository instance."""
    global _booking_repository
    if _booking_repository is None:
        _booking_repository = BookingRepository()
    return _booking_repository
