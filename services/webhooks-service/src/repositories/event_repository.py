"""
Repository for webhook event data access.
"""

import json
import logging
from typing import Optional, List, Dict, Any
from uuid import UUID
from datetime import datetime, timezone

from src.database import get_pool

logger = logging.getLogger(__name__)


class EventRepository:
    """Data access layer for webhook events."""

    async def create(
        self,
        workspace_id: UUID,
        event_type: str,
        payload: Dict[str, Any],
        source_service: str,
        source_entity_id: Optional[UUID] = None,
        source_entity_type: Optional[str] = None,
        idempotency_key: Optional[str] = None,
        correlation_id: Optional[UUID] = None,
        event_version: str = "v1",
        subscriber_count: int = 0,
    ) -> Dict[str, Any]:
        """Create a new webhook event."""
        from uuid import uuid4

        event_id = uuid4()
        pool = await get_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO webhook_events (
                    event_id, workspace_id, event_type, event_version,
                    payload, source_service, source_entity_id, source_entity_type,
                    status, subscriber_count, idempotency_key, correlation_id,
                    occurred_at, created_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10, $11, NOW(), NOW()
                )
                RETURNING *
                """,
                event_id,
                workspace_id,
                event_type,
                event_version,
                json.dumps(payload),
                source_service,
                source_entity_id,
                source_entity_type,
                subscriber_count,
                idempotency_key,
                correlation_id,
            )

            return dict(row) if row else {}

    async def get_by_id(
        self,
        event_id: UUID,
        workspace_id: UUID,
    ) -> Optional[Dict[str, Any]]:
        """Get event by ID."""
        pool = await get_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM webhook_events
                WHERE event_id = $1 AND workspace_id = $2
                """,
                event_id,
                workspace_id,
            )

            return dict(row) if row else None

    async def list_by_workspace(
        self,
        workspace_id: UUID,
        page: int = 1,
        limit: int = 50,
        event_type: Optional[str] = None,
        status: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> tuple[List[Dict[str, Any]], int]:
        """List events for a workspace with filtering."""
        pool = await get_pool()
        offset = (page - 1) * limit

        # Build query
        where_clauses = ["workspace_id = $1"]
        params: List[Any] = [workspace_id]

        if event_type:
            where_clauses.append(f"event_type = ${len(params) + 1}")
            params.append(event_type)

        if status:
            where_clauses.append(f"status = ${len(params) + 1}")
            params.append(status)

        if start_date:
            where_clauses.append(f"created_at >= ${len(params) + 1}")
            params.append(start_date)

        if end_date:
            where_clauses.append(f"created_at <= ${len(params) + 1}")
            params.append(end_date)

        where_sql = " AND ".join(where_clauses)

        async with pool.acquire() as conn:
            # Get total count
            count_row = await conn.fetchrow(
                f"SELECT COUNT(*) as total FROM webhook_events WHERE {where_sql}",
                *params,
            )
            total = count_row["total"]

            # Get paginated results
            params.extend([limit, offset])
            rows = await conn.fetch(
                f"""
                SELECT * FROM webhook_events
                WHERE {where_sql}
                ORDER BY created_at DESC
                LIMIT ${len(params) - 1} OFFSET ${len(params)}
                """,
                *params,
            )

            return [dict(row) for row in rows], total

    async def update_status(
        self,
        event_id: UUID,
        status: str,
        processed_at: Optional[datetime] = None,
    ) -> None:
        """Update event status."""
        pool = await get_pool()

        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE webhook_events
                SET status = $2,
                    processed_at = COALESCE($3, processed_at)
                WHERE event_id = $1
                """,
                event_id,
                status,
                processed_at,
            )

    async def get_by_idempotency_key(
        self,
        idempotency_key: str,
    ) -> Optional[Dict[str, Any]]:
        """Check if event with idempotency key exists."""
        pool = await get_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM webhook_events WHERE idempotency_key = $1",
                idempotency_key,
            )

            return dict(row) if row else None


class EventTypeRepository:
    """Data access layer for webhook event type catalog."""

    async def list_all(
        self,
        category: Optional[str] = None,
        active_only: bool = True,
    ) -> List[Dict[str, Any]]:
        """List all event types."""
        pool = await get_pool()

        where_clauses = []
        params = []

        if category:
            where_clauses.append(f"category = ${len(params) + 1}")
            params.append(category)

        if active_only:
            where_clauses.append("is_active = true")

        where_sql = " WHERE " + " AND ".join(where_clauses) if where_clauses else ""

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                f"""
                SELECT event_type, category, name, description,
                       is_active, introduced_version, deprecated_version
                FROM webhook_event_types
                {where_sql}
                ORDER BY category, event_type
                """,
                *params,
            )

            return [dict(row) for row in rows]

    async def get_by_type(self, event_type: str) -> Optional[Dict[str, Any]]:
        """Get event type details."""
        pool = await get_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM webhook_event_types WHERE event_type = $1",
                event_type,
            )

            return dict(row) if row else None


# Global singletons
event_repository = EventRepository()
event_type_repository = EventTypeRepository()
