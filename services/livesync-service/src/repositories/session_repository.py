"""
Repository for sync session database operations.

Provides CRUD operations for the sync_sessions table with
multi-tenant isolation by workspace_id.
"""

from datetime import datetime, timedelta
from typing import List, Optional, Tuple
from uuid import UUID

import asyncpg

from src.database import get_pool
from src.schemas.common import SyncSessionStatus
from src.schemas.sessions import SyncSessionCreate, SyncSessionResponse
from src.logging import get_logger

logger = get_logger(__name__)


class SyncSessionRepository:
    """Repository for sync session database operations."""

    async def create(
        self,
        mapping_id: UUID,
        workspace_id: UUID,
        user_id: UUID,
        client_id: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> SyncSessionResponse:
        """
        Create a new sync session.

        Args:
            mapping_id: Parent mapping ID
            workspace_id: Workspace ID
            user_id: User starting the session
            client_id: Optional client identifier
            user_agent: Optional user agent string

        Returns:
            Created sync session
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            # Set expiration to 24 hours from now
            expires_at = datetime.utcnow() + timedelta(hours=24)

            row = await conn.fetchrow(
                """
                INSERT INTO sync_sessions (
                    mapping_id,
                    workspace_id,
                    created_by_user_id,
                    status,
                    started_at,
                    expires_at,
                    metadata
                ) VALUES ($1, $2, $3, $4, NOW(), $5, $6)
                RETURNING *
                """,
                mapping_id,
                workspace_id,
                user_id,
                SyncSessionStatus.INITIALIZING.value,
                expires_at,
                {"client_id": client_id, "user_agent": user_agent},
            )

            logger.info(
                "Created sync session",
                extra={
                    "session_id": str(row["session_id"]),
                    "mapping_id": str(mapping_id),
                    "workspace_id": str(workspace_id),
                },
            )

            return self._row_to_response(row)

    async def get_by_id(
        self,
        session_id: UUID,
        workspace_id: UUID,
    ) -> Optional[SyncSessionResponse]:
        """
        Get a sync session by ID.

        Args:
            session_id: Session ID to retrieve
            workspace_id: Workspace ID for multi-tenant isolation

        Returns:
            Sync session if found, None otherwise
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM sync_sessions
                WHERE session_id = $1 AND workspace_id = $2
                """,
                session_id,
                workspace_id,
            )

            if row is None:
                return None

            return self._row_to_response(row)

    async def list_by_mapping(
        self,
        mapping_id: UUID,
        workspace_id: UUID,
        status: Optional[SyncSessionStatus] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> Tuple[List[SyncSessionResponse], int]:
        """
        List sync sessions for a mapping.

        Args:
            mapping_id: Mapping ID to filter by
            workspace_id: Workspace ID for multi-tenant isolation
            status: Optional status filter
            limit: Maximum results
            offset: Pagination offset

        Returns:
            Tuple of (sessions list, total count)
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            conditions = ["mapping_id = $1", "workspace_id = $2"]
            params: list = [mapping_id, workspace_id]
            param_idx = 3

            if status:
                conditions.append(f"status = ${param_idx}")
                params.append(status.value)
                param_idx += 1

            where_clause = " AND ".join(conditions)

            # Get total count
            count_row = await conn.fetchrow(
                f"SELECT COUNT(*) FROM sync_sessions WHERE {where_clause}",
                *params,
            )
            total = count_row["count"]

            # Get paginated results
            params.extend([limit, offset])
            rows = await conn.fetch(
                f"""
                SELECT * FROM sync_sessions
                WHERE {where_clause}
                ORDER BY created_at DESC
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
                """,
                *params,
            )

            return [self._row_to_response(row) for row in rows], total

    async def list_active_by_workspace(
        self,
        workspace_id: UUID,
    ) -> List[SyncSessionResponse]:
        """
        List all active sync sessions for a workspace.

        Args:
            workspace_id: Workspace ID

        Returns:
            List of active sessions
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM sync_sessions
                WHERE workspace_id = $1 AND status IN ($2, $3, $4)
                ORDER BY last_activity_at DESC
                """,
                workspace_id,
                SyncSessionStatus.INITIALIZING.value,
                SyncSessionStatus.WATCHING.value,
                SyncSessionStatus.SYNCING.value,
            )

            return [self._row_to_response(row) for row in rows]

    async def update_status(
        self,
        session_id: UUID,
        workspace_id: UUID,
        status: SyncSessionStatus,
    ) -> Optional[SyncSessionResponse]:
        """
        Update session status.

        Args:
            session_id: Session ID
            workspace_id: Workspace ID
            status: New status

        Returns:
            Updated session if found
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            # Handle status-specific timestamp updates
            timestamp_update = ""
            if status == SyncSessionStatus.PAUSED:
                timestamp_update = ", paused_at = NOW()"
            elif status in (SyncSessionStatus.WATCHING, SyncSessionStatus.SYNCING):
                timestamp_update = ", resumed_at = NOW()"
            elif status in (SyncSessionStatus.COMPLETED, SyncSessionStatus.ERROR):
                timestamp_update = ", completed_at = NOW()"

            row = await conn.fetchrow(
                f"""
                UPDATE sync_sessions
                SET status = $1, last_activity_at = NOW(){timestamp_update}
                WHERE session_id = $2 AND workspace_id = $3
                RETURNING *
                """,
                status.value,
                session_id,
                workspace_id,
            )

            if row is None:
                return None

            logger.info(
                "Updated session status",
                extra={
                    "session_id": str(session_id),
                    "status": status.value,
                },
            )

            return self._row_to_response(row)

    async def update_progress(
        self,
        session_id: UUID,
        workspace_id: UUID,
        files_queued: Optional[int] = None,
        files_synced: Optional[int] = None,
        files_failed: Optional[int] = None,
        files_skipped: Optional[int] = None,
        bytes_queued: Optional[int] = None,
        bytes_synced: Optional[int] = None,
        upload_speed: Optional[int] = None,
    ) -> None:
        """
        Update session progress metrics.

        Args:
            session_id: Session ID
            workspace_id: Workspace ID
            files_queued: Files queued count
            files_synced: Files synced count
            files_failed: Files failed count
            files_skipped: Files skipped count
            bytes_queued: Bytes queued
            bytes_synced: Bytes synced
            upload_speed: Current upload speed (bytes/sec)
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            updates = []
            params = []
            param_idx = 1

            if files_queued is not None:
                updates.append(f"total_files_queued = ${param_idx}")
                params.append(files_queued)
                param_idx += 1

            if files_synced is not None:
                updates.append(f"total_files_synced = ${param_idx}")
                params.append(files_synced)
                param_idx += 1

            if files_failed is not None:
                updates.append(f"total_files_failed = ${param_idx}")
                params.append(files_failed)
                param_idx += 1

            if files_skipped is not None:
                updates.append(f"total_files_skipped = ${param_idx}")
                params.append(files_skipped)
                param_idx += 1

            if bytes_queued is not None:
                updates.append(f"total_bytes_queued = ${param_idx}")
                params.append(bytes_queued)
                param_idx += 1

            if bytes_synced is not None:
                updates.append(f"total_bytes_synced = ${param_idx}")
                params.append(bytes_synced)
                param_idx += 1

            if upload_speed is not None:
                updates.append(f"current_upload_speed = ${param_idx}")
                params.append(upload_speed)
                param_idx += 1

            if not updates:
                return

            params.extend([session_id, workspace_id])

            await conn.execute(
                f"""
                UPDATE sync_sessions
                SET {", ".join(updates)}, last_activity_at = NOW()
                WHERE session_id = ${param_idx} AND workspace_id = ${param_idx + 1}
                """,
                *params,
            )

    async def update_error(
        self,
        session_id: UUID,
        workspace_id: UUID,
        error_message: str,
        error_code: str,
    ) -> None:
        """
        Update error state for a session.

        Args:
            session_id: Session ID
            workspace_id: Workspace ID
            error_message: Error description
            error_code: Error code
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE sync_sessions
                SET
                    last_error = $1,
                    last_error_code = $2,
                    error_count = error_count + 1,
                    last_activity_at = NOW()
                WHERE session_id = $3 AND workspace_id = $4
                """,
                error_message,
                error_code,
                session_id,
                workspace_id,
            )

    async def count_active_by_workspace(self, workspace_id: UUID) -> int:
        """
        Count active sessions in a workspace.

        Args:
            workspace_id: Workspace ID

        Returns:
            Number of active sessions
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT COUNT(*) FROM sync_sessions
                WHERE workspace_id = $1 AND status IN ($2, $3, $4)
                """,
                workspace_id,
                SyncSessionStatus.INITIALIZING.value,
                SyncSessionStatus.WATCHING.value,
                SyncSessionStatus.SYNCING.value,
            )
            return row["count"]

    async def count_active_by_user(self, user_id: UUID) -> int:
        """
        Count active sessions for a user.

        Args:
            user_id: User ID

        Returns:
            Number of active sessions
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT COUNT(*) FROM sync_sessions
                WHERE created_by_user_id = $1 AND status IN ($2, $3, $4)
                """,
                user_id,
                SyncSessionStatus.INITIALIZING.value,
                SyncSessionStatus.WATCHING.value,
                SyncSessionStatus.SYNCING.value,
            )
            return row["count"]

    async def cleanup_expired(self) -> int:
        """
        Mark expired sessions as expired.

        Returns:
            Number of sessions marked as expired
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE sync_sessions
                SET status = $1, completed_at = NOW()
                WHERE status IN ($2, $3, $4) AND expires_at < NOW()
                """,
                "expired",
                SyncSessionStatus.INITIALIZING.value,
                SyncSessionStatus.WATCHING.value,
                SyncSessionStatus.SYNCING.value,
            )

            # Parse "UPDATE N" result
            count = int(result.split()[-1]) if result else 0

            if count > 0:
                logger.info(f"Marked {count} expired sessions")

            return count

    def _row_to_response(self, row: asyncpg.Record) -> SyncSessionResponse:
        """Convert database row to response schema."""
        metadata = row.get("metadata") or {}

        return SyncSessionResponse(
            session_id=row["session_id"],
            mapping_id=row["mapping_id"],
            workspace_id=row["workspace_id"],
            user_id=row["created_by_user_id"],
            status=SyncSessionStatus(row["status"]),
            started_at=row["started_at"] or row["created_at"],
            ended_at=row["completed_at"],
            files_detected=row["total_files_queued"],
            files_queued=row["total_files_queued"] - row["total_files_synced"] - row["total_files_failed"] - row["total_files_skipped"],
            files_uploading=0,  # Calculated from current activity
            files_completed=row["total_files_synced"],
            files_failed=row["total_files_failed"],
            files_skipped=row["total_files_skipped"],
            bytes_uploaded=row["total_bytes_synced"],
            upload_speed_bps=row["current_upload_speed"],
            eta_seconds=row["estimated_seconds_remaining"],
            last_activity_at=row["last_activity_at"],
            last_error=row["last_error"],
            last_error_code=row["last_error_code"],
            client_id=metadata.get("client_id"),
            user_agent=metadata.get("user_agent"),
        )
