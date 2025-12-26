"""LibraryService: CRUD operations for workspace-wide asset management (DAM)."""

from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID
from datetime import datetime

from app.db.postgres import get_postgres_pool
from app.api.exceptions import NotFoundError, InternalError

logger = logging.getLogger(__name__)

class LibraryService:
    """Service for library (workspace-wide asset) operations."""

    async def list_workspace_assets(
        self,
        workspace_id: UUID,
        page: int = 1,
        limit: int = 50,
        sort: str = "created_at",
        type: Optional[str] = None,
        unassigned_only: bool = False,
        search_query: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> dict:
        """List assets in a workspace with pagination and filtering."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            offset = (page - 1) * limit
            
            # Base WHERE clause
            where_conditions = [
                "a.workspace_id = $1",
                "a.deleted = FALSE",
                "a.status = 'available'"
            ]
            params = [workspace_id]
            param_idx = 2

            if type:
                where_conditions.append(f"a.type = ${param_idx}")
                params.append(type)
                param_idx += 1

            if unassigned_only:
                # Filter for assets that are NOT present in gallery_assets
                where_conditions.append(f"""
                    NOT EXISTS (
                        SELECT 1 FROM gallery_assets ga 
                        WHERE ga.asset_id = a.asset_id
                    )
                """)

            if search_query:
                # Basic filename search for now. 
                # TODO: Integrate with GEO/Vector search in future phases
                where_conditions.append(f"LOWER(SUBSTRING(a.original_object_key FROM '[^/]+$')) LIKE ${param_idx}")
                params.append(f"%{search_query.lower()}%")
                param_idx += 1

            if start_date:
                where_conditions.append(f"(a.exif->>'date_taken')::TIMESTAMPTZ >= ${param_idx}")
                params.append(start_date)
                param_idx += 1

            if end_date:
                where_conditions.append(f"(a.exif->>'date_taken')::TIMESTAMPTZ <= ${param_idx}")
                params.append(end_date)
                param_idx += 1

            where_sql = " AND ".join(where_conditions)

            # Sort mapping
            sort_sql = "ORDER BY a.created_at DESC" # Default
            if sort == "date_taken":
                sort_sql = "ORDER BY (a.exif->>'date_taken')::TIMESTAMPTZ DESC NULLS LAST"
            elif sort == "filename":
                sort_sql = "ORDER BY SUBSTRING(a.original_object_key FROM '[^/]+$') ASC"
            
            # Get total count
            count_query = f"""
                SELECT COUNT(*)
                FROM assets a
                WHERE {where_sql}
            """
            total = await conn.fetchval(count_query, *params)

            # Get assets
            assets_query = f"""
                SELECT
                    a.asset_id,
                    a.workspace_id,
                    a.type,
                    a.status,
                    a.mime_type,
                    SUBSTRING(a.original_object_key FROM '[^/]+$') AS filename,
                    (a.exif->>'width')::INTEGER AS width,
                    (a.exif->>'height')::INTEGER AS height,
                    (a.exif->>'duration_ms')::INTEGER AS duration_ms,
                    (a.exif->>'date_taken')::TIMESTAMPTZ AS date_taken,
                    a.exif,
                    a.created_at,
                    -- Check if assigned to any gallery
                    EXISTS (
                        SELECT 1 FROM gallery_assets ga WHERE ga.asset_id = a.asset_id
                    ) as is_assigned
                FROM assets a
                WHERE {where_sql}
                {sort_sql}
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
            """
            
            params.append(limit)
            params.append(offset)
            
            assets = await conn.fetch(assets_query, *params)

            # Format response
            assets_data = []
            for row in assets:
                assets_data.append({
                    "asset_id": str(row["asset_id"]),
                    "workspace_id": str(row["workspace_id"]),
                    "type": row["type"],
                    "status": row["status"],
                    "mime_type": row["mime_type"],
                    "filename": row["filename"] or "untitled",
                    "width": row["width"],
                    "height": row["height"],
                    "duration_ms": row["duration_ms"],
                    "date_taken": row["date_taken"].isoformat() if row["date_taken"] else None,
                    "created_at": row["created_at"].isoformat(),
                    "exif": row["exif"],
                    "is_assigned": row["is_assigned"]
                })

            return {
                "data": assets_data,
                "meta": {
                    "page": page,
                    "limit": limit,
                    "total": total,
                    "totalPages": (total + limit - 1) // limit,
                },
            }

    async def delete_assets(self, workspace_id: UUID, asset_ids: list[UUID], deleted_by_user_id: UUID) -> int:
        """Soft delete assets (move to recycle bin)."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Update deleted=TRUE for assets in the list AND belonging to workspace
            result = await conn.execute(
                """
                UPDATE assets
                SET deleted = TRUE, deleted_at = NOW()
                WHERE workspace_id = $1 AND asset_id = ANY($2::uuid[])
                """,
                workspace_id,
                asset_ids,
            )
            # return number of deleted rows
            # result string format is usually "UPDATE <count>"
            try:
                count = int(result.split(" ")[1])
                return count
            except (IndexError, ValueError):
                return 0


    async def get_asset_content(
        self,
        workspace_id: UUID,
        asset_id: UUID,
        variant: str = "preview",
    ) -> tuple[bytes, str]:
        """Get decrypted asset content.

        Args:
            workspace_id: Workspace UUID
            asset_id: Asset UUID
            variant: content variant (thumbnail, preview, original)

        Returns:
            Tuple of (file_bytes, mime_type)
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT original_object_key, mime_type, type
                FROM assets
                WHERE workspace_id = $1 AND asset_id = $2
                """,
                workspace_id,
                asset_id,
            )
            
            if not row:
                raise NotFoundError("Asset", str(asset_id))
                
            original_key = row["original_object_key"]
            mime_type = row["mime_type"]
            
            # Construct key for requested variant
            # We assume structure contains /original/ and replace it
            if variant != "original":
                if "/original/" in original_key:
                    object_key = original_key.replace("/original/", f"/{variant}/")
                else:
                    # Fallback or error if structure is unexpected
                    # For now assume mostly original requested or standard structure
                    object_key = original_key # Might fail if looking for thumb
            else:
                object_key = original_key

            from app.services.r2_storage_service import get_r2_storage_service
            from app.services.encryption_service import get_encryption_service
            
            r2_service = get_r2_storage_service()
            encryption_service = get_encryption_service()
            
            # Download encrypted
            try:
                encrypted_data = await r2_service.download_by_object_key(object_key)
            except Exception as e:
                # If variant not found (e.g. preview/thumb not generated yet), try original?
                # or just raise 404
                logger.warning(f"Failed to download {variant} for {asset_id}: {e}")
                raise NotFoundError(f"Asset variant {variant}", str(asset_id))
            
            # Decrypt
            try:
                decrypted_data = await encryption_service.decrypt_file(
                    encrypted_data=encrypted_data,
                    workspace_id=workspace_id,
                    asset_id=asset_id,
                    variant=variant,
                )
            except Exception as e:
                logger.error(f"Failed to decrypt {variant} for {asset_id}: {e}")
                raise InternalError("Failed to decrypt asset")

            # Adjust mime type for thumbnails (usually jpeg)
            if variant in ("thumbnail", "preview") and row["type"] == "photo":
                 mime_type = "image/jpeg"
            
            return decrypted_data, mime_type


def get_library_service() -> LibraryService:
    """Get library service instance."""
    return LibraryService()
