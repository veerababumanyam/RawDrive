"""
Repository Pattern for Recycle Bin

This module separates data access logic from business logic,
making the code more testable and maintainable.
"""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool


class RecycleBinRepository:
    """Data access layer for recycle bin operations."""
    
    async def count_deleted_galleries(self, workspace_id: UUID) -> int:
        """Count deleted galleries for a workspace."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            return await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM galleries
                WHERE workspace_id = $1
                AND deleted = TRUE
                AND (delete_status IS NULL OR delete_status = 'delete_failed')
                """,
                workspace_id,
            )
    
    async def count_deleted_photos(self, workspace_id: UUID) -> int:
        """Count deleted photos for a workspace."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            return await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM assets a
                LEFT JOIN gallery_assets ga ON a.asset_id = ga.asset_id
                LEFT JOIN galleries g ON ga.gallery_id = g.gallery_id
                WHERE a.workspace_id = $1
                AND a.deleted = TRUE
                AND (a.delete_status IS NULL OR a.delete_status = 'delete_failed')
                AND (g.gallery_id IS NULL OR g.deleted = FALSE)
                """,
                workspace_id,
            )
    
    async def find_deleted_gallery(
        self,
        workspace_id: UUID,
        gallery_id: UUID
    ) -> Optional[dict]:
        """Find a deleted gallery by ID."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT gallery_id, workspace_id, title, deleted, deleted_at,
                       delete_status, parent_gallery_id
                FROM galleries
                WHERE workspace_id = $1
                AND gallery_id = $2
                AND deleted = TRUE
                """,
                workspace_id,
                gallery_id,
            )
            return dict(row) if row else None
    
    async def find_deleted_photo(
        self,
        workspace_id: UUID,
        asset_id: UUID
    ) -> Optional[dict]:
        """Find a deleted photo by ID."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT a.asset_id, a.workspace_id, a.original_object_key,
                       a.deleted, a.deleted_at, a.delete_status
                FROM assets a
                WHERE a.workspace_id = $1
                AND a.asset_id = $2
                AND a.deleted = TRUE
                """,
                workspace_id,
                asset_id,
            )
            return dict(row) if row else None
    
    async def check_gallery_name_conflict(
        self,
        workspace_id: UUID,
        parent_gallery_id: Optional[UUID],
        title: str
    ) -> bool:
        """Check if a gallery name conflicts with existing active galleries."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            exists = await conn.fetchval(
                """
                SELECT EXISTS(
                    SELECT 1 FROM galleries
                    WHERE workspace_id = $1
                    AND COALESCE(parent_gallery_id::text, '') = COALESCE($2::text, '')
                    AND title = $3
                    AND deleted = FALSE
                )
                """,
                workspace_id,
                parent_gallery_id,
                title,
            )
            return bool(exists)
    
    async def restore_gallery_record(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        new_title: Optional[str] = None
    ) -> None:
        """Restore a gallery record by clearing delete flags."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            if new_title:
                await conn.execute(
                    """
                    UPDATE galleries
                    SET deleted = FALSE,
                        deleted_at = NULL,
                        delete_status = NULL,
                        title = $3
                    WHERE workspace_id = $1
                    AND gallery_id = $2
                    """,
                    workspace_id,
                    gallery_id,
                    new_title,
                )
            else:
                await conn.execute(
                    """
                    UPDATE galleries
                    SET deleted = FALSE,
                        deleted_at = NULL,
                        delete_status = NULL
                    WHERE workspace_id = $1
                    AND gallery_id = $2
                    """,
                    workspace_id,
                    gallery_id,
                )
    
    async def restore_photo_record(
        self,
        workspace_id: UUID,
        asset_id: UUID
    ) -> None:
        """Restore a photo record by clearing delete flags."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE assets
                SET deleted = FALSE,
                    deleted_at = NULL,
                    delete_status = NULL
                WHERE workspace_id = $1
                AND asset_id = $2
                """,
                workspace_id,
                asset_id,
            )
            
            # Also restore in gallery_assets
            await conn.execute(
                """
                UPDATE gallery_assets
                SET visible = TRUE
                WHERE asset_id = $1
                """,
                asset_id,
            )
    
    async def restore_child_galleries(
        self,
        workspace_id: UUID,
        parent_gallery_id: UUID,
        deleted_after: any
    ) -> int:
        """Restore all child galleries deleted as part of parent deletion."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE galleries
                SET deleted = FALSE,
                    deleted_at = NULL,
                    delete_status = NULL
                WHERE workspace_id = $1
                AND parent_gallery_id = $2
                AND deleted = TRUE
                AND deleted_at >= $3
                """,
                workspace_id,
                parent_gallery_id,
                deleted_after,
            )
            # Extract count from "UPDATE N"
            return int(result.split()[-1]) if result else 0
    
    async def restore_gallery_assets(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        deleted_after: any
    ) -> int:
        """Restore all assets in a gallery."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE assets
                SET deleted = FALSE,
                    deleted_at = NULL,
                    delete_status = NULL
                WHERE workspace_id = $1
                AND asset_id IN (
                    SELECT asset_id FROM gallery_assets
                    WHERE gallery_id = $2
                )
                AND deleted = TRUE
                AND deleted_at >= $3
                """,
                workspace_id,
                gallery_id,
                deleted_after,
            )
            
            # Also restore visibility in gallery_assets
            await conn.execute(
                """
                UPDATE gallery_assets
                SET visible = TRUE
                WHERE gallery_id = $1
                AND asset_id IN (
                    SELECT asset_id FROM assets
                    WHERE workspace_id = $2
                    AND deleted = FALSE
                )
                """,
                gallery_id,
                workspace_id,
            )
            
            return int(result.split()[-1]) if result else 0


# Singleton instance
_repository: Optional[RecycleBinRepository] = None


def get_recycle_bin_repository() -> RecycleBinRepository:
    """Get singleton repository instance."""
    global _repository
    if _repository is None:
        _repository = RecycleBinRepository()
    return _repository
