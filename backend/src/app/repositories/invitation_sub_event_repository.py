from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool

logger = logging.getLogger(__name__)


class InvitationSubEventRepository:
    """Repository for invitation sub-events."""

    def _row_to_dict(self, row: Any) -> dict[str, Any]:
        return dict(row)

    async def create_sub_event(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        name: str,
        event_datetime: datetime,
        event_type: Optional[str] = None,
        event_end_datetime: Optional[datetime] = None,
        event_timezone: str = "Asia/Kolkata",
        venue_name: Optional[str] = None,
        venue_address: Optional[str] = None,
        venue_city: Optional[str] = None,
        venue_map_url: Optional[str] = None,
        display_order: int = 0,
        show_countdown: bool = True,
        enable_individual_rsvp: bool = False,
        description: Optional[str] = None,
    ) -> dict[str, Any]:
        """Create a new sub-event."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO invitation_sub_events (
                    workspace_id, invitation_id, name, event_datetime,
                    event_type, event_end_datetime, event_timezone,
                    venue_name, venue_address, venue_city, venue_map_url,
                    display_order, show_countdown, enable_individual_rsvp,
                    description
                )
                VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
                )
                RETURNING *
                """,
                workspace_id,
                invitation_id,
                name,
                event_datetime,
                event_type,
                event_end_datetime,
                event_timezone,
                venue_name,
                venue_address,
                venue_city,
                venue_map_url,
                display_order,
                show_countdown,
                enable_individual_rsvp,
                description,
            )
            return self._row_to_dict(row)

    async def list_sub_events(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
    ) -> list[dict[str, Any]]:
        """List all sub-events for an invitation."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM invitation_sub_events
                WHERE workspace_id = $1 AND invitation_id = $2
                ORDER BY display_order ASC, event_datetime ASC
                """,
                workspace_id,
                invitation_id,
            )
            return [self._row_to_dict(r) for r in rows]

    async def get_sub_event(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        sub_event_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get a specific sub-event."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM invitation_sub_events
                WHERE sub_event_id = $1 AND workspace_id = $2 AND invitation_id = $3
                """,
                sub_event_id,
                workspace_id,
                invitation_id,
            )
            return self._row_to_dict(row) if row else None

    async def update_sub_event(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        sub_event_id: UUID,
        **updates: Any,
    ) -> Optional[dict[str, Any]]:
        """Update a sub-event."""
        if not updates:
            return await self.get_sub_event(workspace_id, invitation_id, sub_event_id)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            set_parts = []
            params = []
            param_idx = 1

            for key, value in updates.items():
                set_parts.append(f"{key} = ${param_idx}")
                params.append(value)
                param_idx += 1

            set_parts.append("updated_at = NOW()")
            set_clause = ", ".join(set_parts)

            # We need to offset params for WHERE clause
            row = await conn.fetchrow(
                f"""
                UPDATE invitation_sub_events
                SET {set_clause}
                WHERE sub_event_id = ${param_idx}
                  AND workspace_id = ${param_idx + 1}
                  AND invitation_id = ${param_idx + 2}
                RETURNING *
                """,
                *params,
                sub_event_id,
                workspace_id,
                invitation_id,
            )
            return self._row_to_dict(row) if row else None

    async def delete_sub_event(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        sub_event_id: UUID,
    ) -> bool:
        """Delete a sub-event."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM invitation_sub_events
                WHERE sub_event_id = $1 AND workspace_id = $2 AND invitation_id = $3
                """,
                sub_event_id,
                workspace_id,
                invitation_id,
            )
            # result string is like "DELETE 1" or "DELETE 0"
            val = result.split()[-1]
            return val != "0"


_invitation_sub_event_repository: InvitationSubEventRepository | None = None


def get_invitation_sub_event_repository() -> InvitationSubEventRepository:
    """Get singleton instance."""
    global _invitation_sub_event_repository
    if _invitation_sub_event_repository is None:
        _invitation_sub_event_repository = InvitationSubEventRepository()
    return _invitation_sub_event_repository
