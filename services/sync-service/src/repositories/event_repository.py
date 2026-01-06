"""
Repository for sync event database operations.

Provides insert/query operations for the sync_events table
for audit logging and analytics.
"""

from datetime import datetime
from typing import List, Optional, Tuple
from uuid import UUID

import asyncpg

from src.database import get_pool
from src.schemas.common import SyncEventType, SyncErrorCode
from src.schemas.events import SyncEventResponse, SyncEventCreate
from src.logging import get_logger

logger = get_logger(__name__)


class SyncEventRepository:
    """Repository for sync event database operations."""

    async def create(self, event: SyncEventCreate) -> SyncEventResponse:
        """
        Create a new sync event.

        Args:
            event: Event data

        Returns:
            Created sync event
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO sync_events (
                    session_id,
                    mapping_id,
                    workspace_id,
                    event_type,
                    file_path,
                    file_name,
                    file_size,
                    asset_id,
                    error_message,
                    error_code,
                    event_data
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING *
                """,
                event.session_id,
                event.mapping_id,
                event.workspace_id,
                event.event_type.value,
                event.file_path,
                event.file_name,
                event.file_size,
                event.asset_id,
                event.error_message,
                event.error_code.value if event.error_code else None,
                event.event_data,
            )

            return self._row_to_response(row)

    async def create_batch(self, events: List[SyncEventCreate]) -> int:
        """
        Create multiple sync events in a batch.

        Args:
            events: List of event data

        Returns:
            Number of events created
        """
        if not events:
            return 0

        pool = await get_pool()
        async with pool.acquire() as conn:
            # Use COPY for efficient bulk insert
            records = [
                (
                    event.session_id,
                    event.mapping_id,
                    event.workspace_id,
                    event.event_type.value,
                    event.file_path,
                    event.file_name,
                    event.file_size,
                    event.asset_id,
                    event.error_message,
                    event.error_code.value if event.error_code else None,
                    event.event_data,
                )
                for event in events
            ]

            await conn.executemany(
                """
                INSERT INTO sync_events (
                    session_id,
                    mapping_id,
                    workspace_id,
                    event_type,
                    file_path,
                    file_name,
                    file_size,
                    asset_id,
                    error_message,
                    error_code,
                    event_data
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                """,
                records,
            )

            return len(events)

    async def list_by_session(
        self,
        session_id: UUID,
        workspace_id: UUID,
        event_type: Optional[SyncEventType] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> Tuple[List[SyncEventResponse], int]:
        """
        List events for a session.

        Args:
            session_id: Session ID to filter by
            workspace_id: Workspace ID for multi-tenant isolation
            event_type: Optional event type filter
            limit: Maximum results
            offset: Pagination offset

        Returns:
            Tuple of (events list, total count)
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            conditions = ["session_id = $1", "workspace_id = $2"]
            params: list = [session_id, workspace_id]
            param_idx = 3

            if event_type:
                conditions.append(f"event_type = ${param_idx}")
                params.append(event_type.value)
                param_idx += 1

            where_clause = " AND ".join(conditions)

            # Get total count
            count_row = await conn.fetchrow(
                f"SELECT COUNT(*) FROM sync_events WHERE {where_clause}",
                *params,
            )
            total = count_row["count"]

            # Get paginated results
            params.extend([limit, offset])
            rows = await conn.fetch(
                f"""
                SELECT * FROM sync_events
                WHERE {where_clause}
                ORDER BY created_at DESC
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
                """,
                *params,
            )

            return [self._row_to_response(row) for row in rows], total

    async def list_by_mapping(
        self,
        mapping_id: UUID,
        workspace_id: UUID,
        event_type: Optional[SyncEventType] = None,
        after: Optional[datetime] = None,
        before: Optional[datetime] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> Tuple[List[SyncEventResponse], int]:
        """
        List events for a mapping.

        Args:
            mapping_id: Mapping ID to filter by
            workspace_id: Workspace ID for multi-tenant isolation
            event_type: Optional event type filter
            after: Events after this time
            before: Events before this time
            limit: Maximum results
            offset: Pagination offset

        Returns:
            Tuple of (events list, total count)
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            conditions = ["mapping_id = $1", "workspace_id = $2"]
            params: list = [mapping_id, workspace_id]
            param_idx = 3

            if event_type:
                conditions.append(f"event_type = ${param_idx}")
                params.append(event_type.value)
                param_idx += 1

            if after:
                conditions.append(f"created_at >= ${param_idx}")
                params.append(after)
                param_idx += 1

            if before:
                conditions.append(f"created_at <= ${param_idx}")
                params.append(before)
                param_idx += 1

            where_clause = " AND ".join(conditions)

            # Get total count
            count_row = await conn.fetchrow(
                f"SELECT COUNT(*) FROM sync_events WHERE {where_clause}",
                *params,
            )
            total = count_row["count"]

            # Get paginated results
            params.extend([limit, offset])
            rows = await conn.fetch(
                f"""
                SELECT * FROM sync_events
                WHERE {where_clause}
                ORDER BY created_at DESC
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
                """,
                *params,
            )

            return [self._row_to_response(row) for row in rows], total

    async def get_error_events(
        self,
        session_id: UUID,
        workspace_id: UUID,
        limit: int = 50,
    ) -> List[SyncEventResponse]:
        """
        Get error events for a session.

        Args:
            session_id: Session ID
            workspace_id: Workspace ID
            limit: Maximum results

        Returns:
            List of error events
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM sync_events
                WHERE session_id = $1
                  AND workspace_id = $2
                  AND error_code IS NOT NULL
                ORDER BY created_at DESC
                LIMIT $3
                """,
                session_id,
                workspace_id,
                limit,
            )

            return [self._row_to_response(row) for row in rows]

    async def get_recent_uploads(
        self,
        session_id: UUID,
        workspace_id: UUID,
        limit: int = 20,
    ) -> List[SyncEventResponse]:
        """
        Get recent upload events for a session.

        Args:
            session_id: Session ID
            workspace_id: Workspace ID
            limit: Maximum results

        Returns:
            List of upload events
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM sync_events
                WHERE session_id = $1
                  AND workspace_id = $2
                  AND event_type IN ($3, $4, $5)
                ORDER BY created_at DESC
                LIMIT $6
                """,
                session_id,
                workspace_id,
                SyncEventType.UPLOAD_STARTED.value,
                SyncEventType.UPLOAD_COMPLETED.value,
                SyncEventType.UPLOAD_FAILED.value,
                limit,
            )

            return [self._row_to_response(row) for row in rows]

    async def count_by_type(
        self,
        session_id: UUID,
        workspace_id: UUID,
    ) -> dict:
        """
        Count events by type for a session.

        Args:
            session_id: Session ID
            workspace_id: Workspace ID

        Returns:
            Dictionary of event type to count
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT event_type, COUNT(*) as count
                FROM sync_events
                WHERE session_id = $1 AND workspace_id = $2
                GROUP BY event_type
                """,
                session_id,
                workspace_id,
            )

            return {row["event_type"]: row["count"] for row in rows}

    async def cleanup_old_events(
        self,
        days_to_keep: int = 30,
    ) -> int:
        """
        Delete events older than specified days.

        Args:
            days_to_keep: Number of days to retain events

        Returns:
            Number of events deleted
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM sync_events
                WHERE created_at < NOW() - INTERVAL '%s days'
                """,
                days_to_keep,
            )

            # Parse "DELETE N" result
            count = int(result.split()[-1]) if result else 0

            if count > 0:
                logger.info(
                    f"Cleaned up {count} old sync events",
                    extra={"days_to_keep": days_to_keep},
                )

            return count

    def _row_to_response(self, row: asyncpg.Record) -> SyncEventResponse:
        """Convert database row to response schema."""
        return SyncEventResponse(
            event_id=row["event_id"],
            session_id=row["session_id"],
            mapping_id=row["mapping_id"],
            workspace_id=row["workspace_id"],
            event_type=SyncEventType(row["event_type"]),
            file_path=row["file_path"],
            file_name=row["file_name"],
            file_size=row["file_size"],
            asset_id=row["asset_id"],
            error_message=row["error_message"],
            error_code=SyncErrorCode(row["error_code"]) if row["error_code"] else None,
            event_data=row["event_data"],
            created_at=row["created_at"],
        )
