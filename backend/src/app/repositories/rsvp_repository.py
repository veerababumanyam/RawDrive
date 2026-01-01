"""Repository for RSVP and check-in data operations.

This module provides the RSVPRepository class that handles all CRUD
operations for RSVPs and check-ins with proper workspace isolation.

Security considerations:
- All queries enforce workspace_id filtering
- Edit tokens are hashed (SHA-256)
- RSVP email uniqueness per invitation

Feature: 016-save-the-date
"""

from __future__ import annotations

import hashlib
import json
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool


logger = logging.getLogger(__name__)


class RSVPRepository:
    """Data access layer for RSVP and check-in records.

    This repository handles all CRUD operations for RSVPs and check-ins,
    ensuring proper workspace isolation for multi-tenant security.
    """

    # =========================================================================
    # RSVP OPERATIONS
    # =========================================================================

    async def create_rsvp(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
        guest_name: str,
        guest_email: str,
        attending: bool,
        guest_id: Optional[UUID] = None,
        guest_phone: Optional[str] = None,
        party_size: int = 1,
        party_names: Optional[list[str]] = None,
        dietary_preferences: Optional[str] = None,
        message: Optional[str] = None,
        custom_answers: Optional[dict[str, str]] = None,
        source: str = "web",
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> tuple[dict[str, Any], str]:
        """Create a new RSVP response.

        Args:
            invitation_id: Invitation this RSVP is for
            workspace_id: Workspace ID for isolation
            guest_name: Name of the responding guest
            guest_email: Email of the guest
            attending: Whether they're attending
            Other params as documented

        Returns:
            Tuple of (RSVP record, edit_token)
            The edit_token is only returned on creation, never again.
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Generate edit token for future updates
            edit_token = secrets.token_urlsafe(32)
            edit_token_hash = hashlib.sha256(edit_token.encode()).hexdigest()
            token_expires_at = datetime.now(timezone.utc) + timedelta(days=30)

            # Determine status based on attending
            status = "confirmed" if attending else "declined"

            row = await conn.fetchrow(
                """
                INSERT INTO invitation_rsvps (
                    invitation_id, workspace_id, guest_id, guest_name, guest_email,
                    guest_phone, attending, party_size, party_names, dietary_preferences,
                    message, custom_answers, source, status, edit_token_hash,
                    token_expires_at, ip_address, user_agent
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
                RETURNING *
                """,
                invitation_id,
                workspace_id,
                guest_id,
                guest_name,
                guest_email.lower(),
                guest_phone,
                attending,
                party_size,
                party_names or [],
                dietary_preferences,
                message,
                json.dumps(custom_answers or {}),
                source,
                status,
                edit_token_hash,
                token_expires_at,
                ip_address,
                user_agent,
            )

            logger.info(
                "RSVP created",
                extra={
                    "rsvp_id": str(row["rsvp_id"]),
                    "invitation_id": str(invitation_id),
                    "attending": attending,
                },
            )

            return self._row_to_dict(row), edit_token

    async def get_rsvp_by_id(
        self,
        rsvp_id: UUID,
        workspace_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get RSVP by ID within a workspace.

        Args:
            rsvp_id: RSVP ID
            workspace_id: Workspace ID for tenant isolation

        Returns:
            RSVP record or None
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT r.*, g.name as linked_guest_name, g.personal_token
                FROM invitation_rsvps r
                LEFT JOIN invitation_guests g ON g.guest_id = r.guest_id
                WHERE r.rsvp_id = $1 AND r.workspace_id = $2
                """,
                rsvp_id,
                workspace_id,
            )

            return self._row_to_dict(row) if row else None

    async def get_rsvp_by_email(
        self,
        invitation_id: UUID,
        guest_email: str,
    ) -> Optional[dict[str, Any]]:
        """Get RSVP by email for an invitation.

        Args:
            invitation_id: Invitation ID
            guest_email: Guest email address

        Returns:
            RSVP record or None
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM invitation_rsvps
                WHERE invitation_id = $1 AND LOWER(guest_email) = LOWER($2)
                """,
                invitation_id,
                guest_email,
            )

            return self._row_to_dict(row) if row else None

    async def get_rsvp_by_edit_token(
        self,
        edit_token: str,
    ) -> Optional[dict[str, Any]]:
        """Get RSVP by edit token.

        Args:
            edit_token: The plaintext edit token

        Returns:
            RSVP record or None if not found/expired
        """
        token_hash = hashlib.sha256(edit_token.encode()).hexdigest()

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT r.*, i.title as invitation_title, i.event_datetime
                FROM invitation_rsvps r
                JOIN digital_invitations i ON i.invitation_id = r.invitation_id
                WHERE r.edit_token_hash = $1
                  AND r.token_expires_at > NOW()
                """,
                token_hash,
            )

            return self._row_to_dict(row) if row else None

    async def list_rsvps(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
        attending: Optional[bool] = None,
        status: Optional[str] = None,
        page: int = 1,
        limit: int = 50,
    ) -> tuple[list[dict[str, Any]], int]:
        """List RSVPs for an invitation with filtering.

        Args:
            invitation_id: Invitation ID
            workspace_id: Workspace ID
            attending: Filter by attending status
            status: Filter by RSVP status
            page: Page number (1-indexed)
            limit: Items per page

        Returns:
            Tuple of (RSVP list, total count)
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            conditions = ["invitation_id = $1", "workspace_id = $2"]
            params: list[Any] = [invitation_id, workspace_id]
            param_idx = 3

            if attending is not None:
                conditions.append(f"attending = ${param_idx}")
                params.append(attending)
                param_idx += 1

            if status:
                conditions.append(f"status = ${param_idx}")
                params.append(status)
                param_idx += 1

            where_clause = " AND ".join(conditions)

            # Count
            count_row = await conn.fetchrow(
                f"SELECT COUNT(*) FROM invitation_rsvps WHERE {where_clause}",
                *params,
            )
            total = count_row["count"]

            # Fetch
            offset = (page - 1) * limit
            rows = await conn.fetch(
                f"""
                SELECT * FROM invitation_rsvps
                WHERE {where_clause}
                ORDER BY created_at DESC
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
                """,
                *params,
                limit,
                offset,
            )

            return [self._row_to_dict(r) for r in rows], total

    async def get_rsvp_stats(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
    ) -> dict[str, int]:
        """Get RSVP statistics for an invitation.

        Returns:
            Dict with total, attending, not_attending, pending, maybe, total_party_size
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE attending = true) as attending,
                    COUNT(*) FILTER (WHERE attending = false) as not_attending,
                    COUNT(*) FILTER (WHERE status = 'pending') as pending,
                    COUNT(*) FILTER (WHERE status = 'maybe') as maybe,
                    COALESCE(SUM(party_size) FILTER (WHERE attending = true), 0) as total_party_size
                FROM invitation_rsvps
                WHERE invitation_id = $1 AND workspace_id = $2
                """,
                invitation_id,
                workspace_id,
            )

            return dict(row) if row else {
                "total": 0,
                "attending": 0,
                "not_attending": 0,
                "pending": 0,
                "maybe": 0,
                "total_party_size": 0,
            }

    async def update_rsvp(
        self,
        rsvp_id: UUID,
        workspace_id: UUID,
        **updates: Any,
    ) -> Optional[dict[str, Any]]:
        """Update an RSVP (owner/admin update).

        Args:
            rsvp_id: RSVP ID
            workspace_id: Workspace ID
            **updates: Fields to update

        Returns:
            Updated RSVP or None
        """
        if not updates:
            return await self.get_rsvp_by_id(rsvp_id, workspace_id)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            set_parts = []
            params = []
            param_idx = 1

            for key, value in updates.items():
                if key == "custom_answers" and isinstance(value, dict):
                    value = json.dumps(value)
                set_parts.append(f"{key} = ${param_idx}")
                params.append(value)
                param_idx += 1

            set_parts.append("updated_at = NOW()")
            set_clause = ", ".join(set_parts)

            row = await conn.fetchrow(
                f"""
                UPDATE invitation_rsvps
                SET {set_clause}
                WHERE rsvp_id = ${param_idx} AND workspace_id = ${param_idx + 1}
                RETURNING *
                """,
                *params,
                rsvp_id,
                workspace_id,
            )

            if row:
                logger.info(
                    "RSVP updated (admin)",
                    extra={"rsvp_id": str(rsvp_id), "fields": list(updates.keys())},
                )

            return self._row_to_dict(row) if row else None

    async def update_rsvp_by_token(
        self,
        edit_token: str,
        **updates: Any,
    ) -> Optional[dict[str, Any]]:
        """Update an RSVP using edit token (guest self-update).

        Args:
            edit_token: The edit token from RSVP creation
            **updates: Fields to update

        Returns:
            Updated RSVP or None if token invalid/expired
        """
        if not updates:
            return await self.get_rsvp_by_edit_token(edit_token)

        token_hash = hashlib.sha256(edit_token.encode()).hexdigest()

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            set_parts = []
            params = []
            param_idx = 1

            for key, value in updates.items():
                if key == "custom_answers" and isinstance(value, dict):
                    value = json.dumps(value)
                set_parts.append(f"{key} = ${param_idx}")
                params.append(value)
                param_idx += 1

            set_parts.append("updated_at = NOW()")
            set_clause = ", ".join(set_parts)

            row = await conn.fetchrow(
                f"""
                UPDATE invitation_rsvps
                SET {set_clause}
                WHERE edit_token_hash = ${param_idx}
                  AND token_expires_at > NOW()
                RETURNING *
                """,
                *params,
                token_hash,
            )

            if row:
                logger.info(
                    "RSVP updated (guest)",
                    extra={"rsvp_id": str(row["rsvp_id"]), "fields": list(updates.keys())},
                )

            return self._row_to_dict(row) if row else None

    async def delete_rsvp(
        self,
        rsvp_id: UUID,
        workspace_id: UUID,
    ) -> bool:
        """Delete an RSVP.

        Args:
            rsvp_id: RSVP ID
            workspace_id: Workspace ID

        Returns:
            True if deleted, False if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM invitation_rsvps
                WHERE rsvp_id = $1 AND workspace_id = $2
                """,
                rsvp_id,
                workspace_id,
            )

            deleted = result.split()[-1] != "0"
            if deleted:
                logger.info("RSVP deleted", extra={"rsvp_id": str(rsvp_id)})

            return deleted

    # =========================================================================
    # CHECK-IN OPERATIONS
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
            verification_method: How they were verified
            qr_token_used: QR token for audit trail
            checked_in_by_user_id: User who performed the check-in
            latitude: GPS latitude
            longitude: GPS longitude
            notes: Additional notes

        Returns:
            Created check-in record
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
                },
            )

            return self._row_to_dict(row)

    async def get_checkin_by_rsvp(
        self,
        rsvp_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Check if an RSVP has already been checked in.

        Args:
            rsvp_id: RSVP ID to check

        Returns:
            Check-in record if exists, None otherwise
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM invitation_checkins
                WHERE rsvp_id = $1
                """,
                rsvp_id,
            )

            return self._row_to_dict(row) if row else None

    async def list_checkins(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
        page: int = 1,
        limit: int = 50,
    ) -> tuple[list[dict[str, Any]], int]:
        """List check-ins for an invitation.

        Args:
            invitation_id: Invitation ID
            workspace_id: Workspace ID
            page: Page number
            limit: Items per page

        Returns:
            Tuple of (check-ins list, total count)
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            count_row = await conn.fetchrow(
                """
                SELECT COUNT(*) FROM invitation_checkins
                WHERE invitation_id = $1 AND workspace_id = $2
                """,
                invitation_id,
                workspace_id,
            )
            total = count_row["count"]

            offset = (page - 1) * limit
            rows = await conn.fetch(
                """
                SELECT c.*, u.display_name as checked_in_by_name
                FROM invitation_checkins c
                LEFT JOIN users u ON u.user_id = c.checked_in_by_user_id
                WHERE c.invitation_id = $1 AND c.workspace_id = $2
                ORDER BY c.checked_in_at DESC
                LIMIT $3 OFFSET $4
                """,
                invitation_id,
                workspace_id,
                limit,
                offset,
            )

            return [self._row_to_dict(r) for r in rows], total

    async def get_checkin_stats(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
    ) -> dict[str, int]:
        """Get check-in statistics for an invitation.

        Returns:
            Dict with total_checked_in, total_party_size
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) as total_checked_in,
                    COALESCE(SUM(party_size_checked_in), 0) as total_party_size
                FROM invitation_checkins
                WHERE invitation_id = $1 AND workspace_id = $2
                """,
                invitation_id,
                workspace_id,
            )

            return {
                "total_checked_in": row["total_checked_in"] if row else 0,
                "total_party_size": row["total_party_size"] if row else 0,
            }

    # =========================================================================
    # AUDIT EVENT OPERATIONS
    # =========================================================================

    async def log_event(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
        event_type: str,
        actor_type: str = "user",
        actor_user_id: Optional[UUID] = None,
        actor_guest_email: Optional[str] = None,
        actor_ip_address: Optional[str] = None,
        event_data: Optional[dict] = None,
    ) -> dict[str, Any]:
        """Log an audit event for an invitation.

        Args:
            invitation_id: Invitation ID
            workspace_id: Workspace ID
            event_type: Type of event (created, viewed, rsvp_received, etc.)
            actor_type: Who triggered it (user, guest, system)
            actor_user_id: User ID if actor is user
            actor_guest_email: Guest email if actor is guest
            actor_ip_address: IP address of actor
            event_data: Additional event data

        Returns:
            Created event record
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO invitation_events (
                    invitation_id, workspace_id, event_type, actor_type,
                    actor_user_id, actor_guest_email, actor_ip_address, event_data
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING *
                """,
                invitation_id,
                workspace_id,
                event_type,
                actor_type,
                actor_user_id,
                actor_guest_email,
                actor_ip_address,
                json.dumps(event_data or {}),
            )

            return self._row_to_dict(row)

    async def list_events(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
        event_type: Optional[str] = None,
        page: int = 1,
        limit: int = 50,
    ) -> tuple[list[dict[str, Any]], int]:
        """List audit events for an invitation.

        Args:
            invitation_id: Invitation ID
            workspace_id: Workspace ID
            event_type: Filter by event type
            page: Page number
            limit: Items per page

        Returns:
            Tuple of (events list, total count)
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            conditions = ["invitation_id = $1", "workspace_id = $2"]
            params: list[Any] = [invitation_id, workspace_id]
            param_idx = 3

            if event_type:
                conditions.append(f"event_type = ${param_idx}")
                params.append(event_type)
                param_idx += 1

            where_clause = " AND ".join(conditions)

            count_row = await conn.fetchrow(
                f"SELECT COUNT(*) FROM invitation_events WHERE {where_clause}",
                *params,
            )
            total = count_row["count"]

            offset = (page - 1) * limit
            rows = await conn.fetch(
                f"""
                SELECT e.*, u.display_name as actor_user_name
                FROM invitation_events e
                LEFT JOIN users u ON u.user_id = e.actor_user_id
                WHERE {where_clause}
                ORDER BY e.created_at DESC
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
                """,
                *params,
                limit,
                offset,
            )

            return [self._row_to_dict(r) for r in rows], total

    # =========================================================================
    # STATS REFRESH
    # =========================================================================

    async def refresh_invitation_stats(self) -> None:
        """Refresh the invitation_stats materialized view.

        This should be called periodically (e.g., every 5 minutes) or
        after significant changes.
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            await conn.execute("SELECT refresh_invitation_stats();")
            logger.info("Refreshed invitation_stats materialized view")

    async def get_invitation_stats(
        self,
        invitation_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get cached stats from materialized view.

        Args:
            invitation_id: Invitation ID

        Returns:
            Stats from materialized view or None
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM invitation_stats
                WHERE invitation_id = $1
                """,
                invitation_id,
            )

            return dict(row) if row else None

    # =========================================================================
    # HELPER METHODS
    # =========================================================================

    def _row_to_dict(self, row: Any) -> dict[str, Any]:
        """Convert database row to dictionary with JSON parsing."""
        if row is None:
            return {}

        result = dict(row)

        # Parse JSONB fields
        for key in ("custom_answers", "event_data"):
            if key in result and isinstance(result[key], str):
                try:
                    result[key] = json.loads(result[key])
                except (json.JSONDecodeError, TypeError):
                    pass

        return result

    # =========================================================================
    # ALIASES for backward compatibility with RSVP service
    # =========================================================================

    async def find_by_email(
        self,
        invitation_id: UUID,
        email: str,
    ):
        """Alias for get_rsvp_by_email."""
        return await self.get_rsvp_by_email(invitation_id, email)

    async def create(self, rsvp_data: dict):
        """Alias for create_rsvp - accepts dict and extracts parameters."""
        rsvp, edit_token = await self.create_rsvp(
            invitation_id=rsvp_data["invitation_id"],
            workspace_id=rsvp_data["workspace_id"],
            guest_name=rsvp_data["guest_name"],
            guest_email=rsvp_data["guest_email"],
            attending=rsvp_data.get("attending", True),
            guest_id=rsvp_data.get("guest_id"),
            guest_phone=rsvp_data.get("guest_phone"),
            party_size=rsvp_data.get("party_size", 1),
            party_names=rsvp_data.get("party_names"),
            dietary_preferences=rsvp_data.get("dietary_preferences"),
            message=rsvp_data.get("message"),
            custom_answers=rsvp_data.get("custom_answers"),
            source=rsvp_data.get("source", "web"),
            ip_address=rsvp_data.get("ip_address"),
            user_agent=rsvp_data.get("user_agent"),
        )
        # Add edit_token to response for service compatibility
        rsvp["edit_token"] = edit_token
        return rsvp

    async def find_by_edit_token_hash(self, hashed_token: str):
        """Find RSVP by pre-hashed edit token."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM invitation_rsvps
                WHERE edit_token_hash = $1
                  AND (token_expires_at IS NULL OR token_expires_at > NOW())
                """,
                hashed_token,
            )
            return self._row_to_dict(row) if row else None

    async def update(self, rsvp_id: UUID, update_data: dict):
        """Alias for update_rsvp."""
        return await self.update_rsvp(rsvp_id, **update_data)

    async def get_stats(self, invitation_id: UUID, workspace_id: UUID):
        """Alias for get_rsvp_stats."""
        return await self.get_rsvp_stats(invitation_id, workspace_id)

    async def list_by_invitation(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
        status_filter: str | None = None,
        page: int = 1,
        limit: int = 50,
    ):
        """Alias for list_rsvps that returns (items, total) tuple."""
        items = await self.list_rsvps(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            status=status_filter,
            offset=(page - 1) * limit,
            limit=limit,
        )
        # Get total count
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            total = await conn.fetchval(
                """
                SELECT COUNT(*) FROM invitation_rsvps
                WHERE invitation_id = $1 AND workspace_id = $2
                """,
                invitation_id,
                workspace_id,
            )
        return items, total

    async def get_by_id(self, rsvp_id: UUID, workspace_id: UUID):
        """Alias for get_rsvp_by_id."""
        return await self.get_rsvp_by_id(rsvp_id, workspace_id)

    async def delete(self, rsvp_id: UUID):
        """Alias for delete_rsvp without workspace_id."""
        return await self.delete_rsvp(rsvp_id)


# Factory function for dependency injection
_rsvp_repository: RSVPRepository | None = None


def get_rsvp_repository() -> RSVPRepository:
    """Get or create the RSVP repository singleton."""
    global _rsvp_repository
    if _rsvp_repository is None:
        _rsvp_repository = RSVPRepository()
    return _rsvp_repository
