"""Repository for event check-in data operations.

This module provides the CheckinRepository class that handles all CRUD
operations for guest check-ins at events with proper workspace isolation.

Security considerations:
- All queries enforce workspace_id filtering
- QR tokens stored for audit trail
- Idempotent check-in via unique constraint on rsvp_id

Feature: 016-save-the-date
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool


logger = logging.getLogger(__name__)


class CheckinRepository:
    """Data access layer for event check-in records.

    This repository handles all CRUD operations for check-ins,
    ensuring proper workspace isolation for multi-tenant security.
    """

    # =========================================================================
    # CREATE OPERATIONS
    # =========================================================================

    async def create_checkin(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
        guest_name: str,
        party_size_checked_in: int = 1,
        rsvp_id: Optional[UUID] = None,
        guest_id: Optional[UUID] = None,
        verification_method: str = "qr_scan",
        qr_token_used: Optional[str] = None,
        checked_in_by_user_id: Optional[UUID] = None,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        notes: Optional[str] = None,
    ) -> dict[str, Any]:
        """Create a check-in record.

        Args:
            invitation_id: Invitation ID
            workspace_id: Workspace ID
            guest_name: Name of the guest checking in
            party_size_checked_in: Number of guests in party
            rsvp_id: Link to RSVP if available
            guest_id: Link to guest if available
            verification_method: How they were verified (qr_scan, manual, name_lookup, token)
            qr_token_used: QR token for audit trail
            checked_in_by_user_id: User who performed the check-in
            latitude: GPS latitude (optional venue verification)
            longitude: GPS longitude (optional venue verification)
            notes: Additional notes

        Returns:
            Created check-in record

        Raises:
            asyncpg.UniqueViolationError: If RSVP already checked in
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO invitation_checkins (
                    invitation_id, workspace_id, rsvp_id, guest_id, guest_name,
                    party_size_checked_in, verification_method, qr_token_used,
                    checked_in_by_user_id, checkin_latitude, checkin_longitude, notes
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING *
                """,
                invitation_id,
                workspace_id,
                rsvp_id,
                guest_id,
                guest_name,
                party_size_checked_in,
                verification_method,
                qr_token_used,
                checked_in_by_user_id,
                latitude,
                longitude,
                notes,
            )

            logger.info(
                "Check-in created",
                extra={
                    "checkin_id": str(row["checkin_id"]),
                    "invitation_id": str(invitation_id),
                    "guest_name": guest_name,
                    "party_size": party_size_checked_in,
                    "verification_method": verification_method,
                },
            )

            return self._row_to_dict(row)

    # =========================================================================
    # READ OPERATIONS
    # =========================================================================

    async def get_checkin_by_id(
        self,
        checkin_id: UUID,
        workspace_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get check-in by ID.

        Args:
            checkin_id: Check-in ID
            workspace_id: Workspace ID for tenant isolation

        Returns:
            Check-in record or None
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT c.*, u.display_name as checked_in_by_name
                FROM invitation_checkins c
                LEFT JOIN users u ON u.user_id = c.checked_in_by_user_id
                WHERE c.checkin_id = $1 AND c.workspace_id = $2
                """,
                checkin_id,
                workspace_id,
            )

            return self._row_to_dict(row) if row else None

    async def get_checkin_by_rsvp(
        self,
        rsvp_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Check if an RSVP has already been checked in.

        Used for idempotency - prevents double check-ins.

        Args:
            rsvp_id: RSVP ID to check

        Returns:
            Check-in record if exists, None otherwise
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT c.*, u.display_name as checked_in_by_name
                FROM invitation_checkins c
                LEFT JOIN users u ON u.user_id = c.checked_in_by_user_id
                WHERE c.rsvp_id = $1
                """,
                rsvp_id,
            )

            return self._row_to_dict(row) if row else None

    async def get_checkin_by_qr_token(
        self,
        qr_token: str,
        invitation_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Check if a QR token has already been used for check-in.

        Args:
            qr_token: QR token string
            invitation_id: Invitation ID

        Returns:
            Check-in record if token was used, None otherwise
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT c.*, u.display_name as checked_in_by_name
                FROM invitation_checkins c
                LEFT JOIN users u ON u.user_id = c.checked_in_by_user_id
                WHERE c.qr_token_used = $1 AND c.invitation_id = $2
                """,
                qr_token,
                invitation_id,
            )

            return self._row_to_dict(row) if row else None

    async def list_checkins(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
        verification_method: Optional[str] = None,
        page: int = 1,
        limit: int = 50,
    ) -> tuple[list[dict[str, Any]], int]:
        """List check-ins for an invitation.

        Args:
            invitation_id: Invitation ID
            workspace_id: Workspace ID
            verification_method: Filter by verification method
            page: Page number (1-indexed)
            limit: Items per page

        Returns:
            Tuple of (check-ins list, total count)
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            conditions = ["c.invitation_id = $1", "c.workspace_id = $2"]
            params: list[Any] = [invitation_id, workspace_id]
            param_idx = 3

            if verification_method:
                conditions.append(f"c.verification_method = ${param_idx}")
                params.append(verification_method)
                param_idx += 1

            where_clause = " AND ".join(conditions)

            # Count total
            count_row = await conn.fetchrow(
                f"""
                SELECT COUNT(*) FROM invitation_checkins c
                WHERE {where_clause}
                """,
                *params,
            )
            total = count_row["count"]

            # Fetch page
            offset = (page - 1) * limit
            rows = await conn.fetch(
                f"""
                SELECT c.*, u.display_name as checked_in_by_name
                FROM invitation_checkins c
                LEFT JOIN users u ON u.user_id = c.checked_in_by_user_id
                WHERE {where_clause}
                ORDER BY c.checked_in_at DESC
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
                """,
                *params,
                limit,
                offset,
            )

            return [self._row_to_dict(r) for r in rows], total

    # =========================================================================
    # STATISTICS
    # =========================================================================

    async def get_checkin_stats(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Get check-in statistics for an invitation.

        Returns:
            Dict with:
            - total_checkins: Number of check-in records
            - total_guests_checked_in: Sum of party_size_checked_in
            - by_method: Breakdown by verification method
            - first_checkin_at: Timestamp of first check-in
            - last_checkin_at: Timestamp of last check-in
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Main stats
            row = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) as total_checkins,
                    COALESCE(SUM(party_size_checked_in), 0) as total_guests_checked_in,
                    MIN(checked_in_at) as first_checkin_at,
                    MAX(checked_in_at) as last_checkin_at
                FROM invitation_checkins
                WHERE invitation_id = $1 AND workspace_id = $2
                """,
                invitation_id,
                workspace_id,
            )

            # Breakdown by method
            method_rows = await conn.fetch(
                """
                SELECT
                    verification_method,
                    COUNT(*) as count,
                    COALESCE(SUM(party_size_checked_in), 0) as guests
                FROM invitation_checkins
                WHERE invitation_id = $1 AND workspace_id = $2
                GROUP BY verification_method
                """,
                invitation_id,
                workspace_id,
            )

            by_method = {
                r["verification_method"]: {
                    "count": r["count"],
                    "guests": r["guests"],
                }
                for r in method_rows
            }

            return {
                "total_checkins": row["total_checkins"] if row else 0,
                "total_guests_checked_in": row["total_guests_checked_in"] if row else 0,
                "first_checkin_at": row["first_checkin_at"].isoformat() if row and row["first_checkin_at"] else None,
                "last_checkin_at": row["last_checkin_at"].isoformat() if row and row["last_checkin_at"] else None,
                "by_method": by_method,
            }

    async def get_hourly_checkin_distribution(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
    ) -> list[dict[str, Any]]:
        """Get hourly distribution of check-ins for timeline visualization.

        Returns:
            List of {hour, count, guests} dicts
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    DATE_TRUNC('hour', checked_in_at) as hour,
                    COUNT(*) as count,
                    COALESCE(SUM(party_size_checked_in), 0) as guests
                FROM invitation_checkins
                WHERE invitation_id = $1 AND workspace_id = $2
                GROUP BY DATE_TRUNC('hour', checked_in_at)
                ORDER BY hour
                """,
                invitation_id,
                workspace_id,
            )

            return [
                {
                    "hour": r["hour"].isoformat() if r["hour"] else None,
                    "count": r["count"],
                    "guests": r["guests"],
                }
                for r in rows
            ]

    # =========================================================================
    # DELETE OPERATIONS
    # =========================================================================

    async def delete_checkin(
        self,
        checkin_id: UUID,
        workspace_id: UUID,
    ) -> bool:
        """Delete a check-in record (admin only, for corrections).

        Args:
            checkin_id: Check-in ID
            workspace_id: Workspace ID

        Returns:
            True if deleted, False if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM invitation_checkins
                WHERE checkin_id = $1 AND workspace_id = $2
                """,
                checkin_id,
                workspace_id,
            )

            deleted = result.split()[-1] != "0"
            if deleted:
                logger.info(
                    "Check-in deleted",
                    extra={"checkin_id": str(checkin_id)},
                )

            return deleted

    # =========================================================================
    # HELPER METHODS
    # =========================================================================

    def _row_to_dict(self, row: Any) -> dict[str, Any]:
        """Convert database row to dictionary."""
        if row is None:
            return {}

        result = dict(row)

        # Convert datetime fields to ISO strings for JSON serialization
        for key in ("checked_in_at", "first_checkin_at", "last_checkin_at"):
            if key in result and isinstance(result[key], datetime):
                result[key] = result[key].isoformat()

        return result
