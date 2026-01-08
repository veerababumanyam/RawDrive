"""
Repository for sync mapping database operations.

Provides CRUD operations for the sync_mappings table with
multi-tenant isolation by workspace_id.
"""

from datetime import datetime
from typing import List, Optional, Tuple
from uuid import UUID

import asyncpg

from src.database import get_pool
from src.schemas.common import SyncMappingStatus
from src.schemas.mappings import (
    SyncMappingCreate,
    SyncMappingUpdate,
    SyncMappingResponse,
    SyncMappingStats,
)
from src.logging import get_logger

logger = get_logger(__name__)


class SyncMappingRepository:
    """Repository for sync mapping database operations."""

    async def create(
        self,
        workspace_id: UUID,
        user_id: UUID,
        data: SyncMappingCreate,
    ) -> SyncMappingResponse:
        """
        Create a new sync mapping.

        Args:
            workspace_id: Workspace ID for multi-tenant isolation
            user_id: User creating the mapping
            data: Mapping creation data

        Returns:
            Created sync mapping

        Raises:
            asyncpg.UniqueViolationError: If mapping already exists for folder/workspace
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO sync_mappings (
                    workspace_id,
                    gallery_id,
                    folder_path,
                    display_name,
                    include_subfolders,
                    include_patterns,
                    exclude_patterns,
                    status,
                    created_by_user_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *
                """,
                workspace_id,
                data.gallery_id,
                data.folder_path,
                data.display_name,
                data.include_subfolders,
                data.include_patterns,
                data.exclude_patterns,
                SyncMappingStatus.ACTIVE.value,
                user_id,
            )

            logger.info(
                "Created sync mapping",
                extra={
                    "mapping_id": str(row["mapping_id"]),
                    "workspace_id": str(workspace_id),
                    "gallery_id": str(data.gallery_id),
                    "folder_path": data.folder_path,
                },
            )

            return self._row_to_response(row)

    async def get_by_id(
        self,
        mapping_id: UUID,
        workspace_id: UUID,
    ) -> Optional[SyncMappingResponse]:
        """
        Get a sync mapping by ID.

        Args:
            mapping_id: Mapping ID to retrieve
            workspace_id: Workspace ID for multi-tenant isolation

        Returns:
            Sync mapping if found, None otherwise
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT sm.*, g.name as gallery_name
                FROM sync_mappings sm
                LEFT JOIN galleries g ON sm.gallery_id = g.gallery_id
                WHERE sm.mapping_id = $1 AND sm.workspace_id = $2
                """,
                mapping_id,
                workspace_id,
            )

            if row is None:
                return None

            return self._row_to_response(row)

    async def list_by_workspace(
        self,
        workspace_id: UUID,
        status: Optional[SyncMappingStatus] = None,
        gallery_id: Optional[UUID] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> Tuple[List[SyncMappingResponse], int]:
        """
        List sync mappings for a workspace.

        Args:
            workspace_id: Workspace ID for filtering
            status: Optional status filter
            gallery_id: Optional gallery filter
            limit: Maximum results to return
            offset: Offset for pagination

        Returns:
            Tuple of (list of mappings, total count)
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            # Build WHERE clause
            conditions = ["sm.workspace_id = $1"]
            params: list = [workspace_id]
            param_idx = 2

            if status:
                conditions.append(f"sm.status = ${param_idx}")
                params.append(status.value)
                param_idx += 1

            if gallery_id:
                conditions.append(f"sm.gallery_id = ${param_idx}")
                params.append(gallery_id)
                param_idx += 1

            where_clause = " AND ".join(conditions)

            # Get total count
            count_row = await conn.fetchrow(
                f"SELECT COUNT(*) FROM sync_mappings sm WHERE {where_clause}",
                *params,
            )
            total = count_row["count"]

            # Get paginated results
            params.extend([limit, offset])
            rows = await conn.fetch(
                f"""
                SELECT sm.*, g.name as gallery_name
                FROM sync_mappings sm
                LEFT JOIN galleries g ON sm.gallery_id = g.gallery_id
                WHERE {where_clause}
                ORDER BY sm.updated_at DESC
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
                """,
                *params,
            )

            return [self._row_to_response(row) for row in rows], total

    async def update(
        self,
        mapping_id: UUID,
        workspace_id: UUID,
        data: SyncMappingUpdate,
    ) -> Optional[SyncMappingResponse]:
        """
        Update a sync mapping.

        Args:
            mapping_id: Mapping ID to update
            workspace_id: Workspace ID for multi-tenant isolation
            data: Update data

        Returns:
            Updated sync mapping if found, None otherwise
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            # Build SET clause dynamically for non-None fields
            updates = []
            params = []
            param_idx = 1

            if data.display_name is not None:
                updates.append(f"display_name = ${param_idx}")
                params.append(data.display_name)
                param_idx += 1

            if data.include_subfolders is not None:
                updates.append(f"include_subfolders = ${param_idx}")
                params.append(data.include_subfolders)
                param_idx += 1

            if data.include_patterns is not None:
                updates.append(f"include_patterns = ${param_idx}")
                params.append(data.include_patterns)
                param_idx += 1

            if data.exclude_patterns is not None:
                updates.append(f"exclude_patterns = ${param_idx}")
                params.append(data.exclude_patterns)
                param_idx += 1

            if data.status is not None:
                updates.append(f"status = ${param_idx}")
                params.append(data.status.value)
                param_idx += 1

            if not updates:
                # No updates to make, just return current state
                return await self.get_by_id(mapping_id, workspace_id)

            # Add mapping_id and workspace_id to params
            params.extend([mapping_id, workspace_id])

            row = await conn.fetchrow(
                f"""
                UPDATE sync_mappings
                SET {", ".join(updates)}
                WHERE mapping_id = ${param_idx} AND workspace_id = ${param_idx + 1}
                RETURNING *
                """,
                *params,
            )

            if row is None:
                return None

            logger.info(
                "Updated sync mapping",
                extra={
                    "mapping_id": str(mapping_id),
                    "workspace_id": str(workspace_id),
                    "updated_fields": list(data.model_dump(exclude_none=True).keys()),
                },
            )

            return self._row_to_response(row)

    async def delete(
        self,
        mapping_id: UUID,
        workspace_id: UUID,
    ) -> bool:
        """
        Delete a sync mapping.

        Args:
            mapping_id: Mapping ID to delete
            workspace_id: Workspace ID for multi-tenant isolation

        Returns:
            True if deleted, False if not found
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM sync_mappings
                WHERE mapping_id = $1 AND workspace_id = $2
                """,
                mapping_id,
                workspace_id,
            )

            deleted = result == "DELETE 1"

            if deleted:
                logger.info(
                    "Deleted sync mapping",
                    extra={
                        "mapping_id": str(mapping_id),
                        "workspace_id": str(workspace_id),
                    },
                )

            return deleted

    async def update_sync_stats(
        self,
        mapping_id: UUID,
        workspace_id: UUID,
        files_synced: int = 0,
        bytes_synced: int = 0,
    ) -> None:
        """
        Update sync statistics for a mapping.

        Args:
            mapping_id: Mapping ID
            workspace_id: Workspace ID
            files_synced: Number of files synced to add
            bytes_synced: Number of bytes synced to add
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE sync_mappings
                SET
                    total_files_synced = total_files_synced + $1,
                    total_bytes_synced = total_bytes_synced + $2,
                    last_sync_at = NOW(),
                    error_count = 0,
                    last_error = NULL,
                    last_error_code = NULL
                WHERE mapping_id = $3 AND workspace_id = $4
                """,
                files_synced,
                bytes_synced,
                mapping_id,
                workspace_id,
            )

    async def update_error(
        self,
        mapping_id: UUID,
        workspace_id: UUID,
        error_message: str,
        error_code: str,
    ) -> None:
        """
        Update error state for a mapping.

        Args:
            mapping_id: Mapping ID
            workspace_id: Workspace ID
            error_message: Error description
            error_code: Error code
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE sync_mappings
                SET
                    status = $1,
                    last_error = $2,
                    last_error_code = $3,
                    error_count = error_count + 1
                WHERE mapping_id = $4 AND workspace_id = $5
                """,
                SyncMappingStatus.ERROR.value,
                error_message,
                error_code,
                mapping_id,
                workspace_id,
            )

    async def get_stats(
        self,
        mapping_id: UUID,
        workspace_id: UUID,
    ) -> Optional[SyncMappingStats]:
        """
        Get statistics for a sync mapping.

        Args:
            mapping_id: Mapping ID
            workspace_id: Workspace ID

        Returns:
            Mapping statistics if found, None otherwise
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    sm.mapping_id,
                    sm.total_files_synced,
                    sm.total_bytes_synced,
                    sm.last_sync_at,
                    COUNT(DISTINCT ss.session_id) as total_sessions,
                    COALESCE(
                        SUM(CASE WHEN ss.created_at >= CURRENT_DATE THEN ss.total_files_synced ELSE 0 END),
                        0
                    ) as files_synced_today,
                    COALESCE(
                        SUM(CASE WHEN ss.created_at >= CURRENT_DATE THEN ss.total_bytes_synced ELSE 0 END),
                        0
                    ) as bytes_synced_today
                FROM sync_mappings sm
                LEFT JOIN sync_sessions ss ON sm.mapping_id = ss.mapping_id
                WHERE sm.mapping_id = $1 AND sm.workspace_id = $2
                GROUP BY sm.mapping_id
                """,
                mapping_id,
                workspace_id,
            )

            if row is None:
                return None

            avg_file_size = None
            if row["total_files_synced"] > 0:
                avg_file_size = row["total_bytes_synced"] // row["total_files_synced"]

            return SyncMappingStats(
                mapping_id=row["mapping_id"],
                total_files_synced=row["total_files_synced"],
                total_bytes_synced=row["total_bytes_synced"],
                total_sessions=row["total_sessions"],
                files_synced_today=row["files_synced_today"],
                bytes_synced_today=row["bytes_synced_today"],
                average_file_size=avg_file_size,
                last_sync_at=row["last_sync_at"],
                success_rate_percent=100.0,  # TODO: Calculate from events
            )

    async def count_by_workspace(self, workspace_id: UUID) -> int:
        """
        Count mappings in a workspace.

        Args:
            workspace_id: Workspace ID

        Returns:
            Number of mappings
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT COUNT(*) FROM sync_mappings WHERE workspace_id = $1",
                workspace_id,
            )
            return row["count"]

    async def count_by_gallery(self, gallery_id: UUID) -> int:
        """
        Count mappings for a gallery.

        Args:
            gallery_id: Gallery ID

        Returns:
            Number of mappings
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT COUNT(*) FROM sync_mappings WHERE gallery_id = $1",
                gallery_id,
            )
            return row["count"]

    def _row_to_response(self, row: asyncpg.Record) -> SyncMappingResponse:
        """Convert database row to response schema."""
        return SyncMappingResponse(
            mapping_id=row["mapping_id"],
            workspace_id=row["workspace_id"],
            gallery_id=row["gallery_id"],
            gallery_name=row.get("gallery_name"),
            folder_path=row["folder_path"],
            display_name=row["display_name"],
            include_subfolders=row["include_subfolders"],
            include_patterns=row["include_patterns"],
            exclude_patterns=row["exclude_patterns"],
            status=SyncMappingStatus(row["status"]),
            total_files_synced=row["total_files_synced"],
            total_bytes_synced=row["total_bytes_synced"],
            last_sync_at=row["last_sync_at"],
            last_error=row["last_error"],
            last_error_code=row["last_error_code"],
            created_by_user_id=row["created_by_user_id"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )
