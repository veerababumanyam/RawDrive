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
        folder_id: Optional[UUID] = None,
    ) -> dict:
        """List assets in a workspace with pagination and filtering."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            offset = (page - 1) * limit
            
            # Base WHERE clause
            # Include 'processing' status so newly uploaded assets appear immediately
            where_conditions = [
                "a.workspace_id = $1",
                "a.deleted = FALSE",
                "a.status IN ('available', 'processing')"
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

            # Filter by folder - use IS NOT DISTINCT FROM to handle NULL (root folder)
            if folder_id is not None:
                where_conditions.append(f"a.folder_id = ${param_idx}")
                params.append(folder_id)
                param_idx += 1
            else:
                # When folder_id is None, show only root-level assets (not in any folder)
                where_conditions.append("a.folder_id IS NULL")

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
            # Worker uploads variants with specific filenames:
            # - thumbnail: thumb.webp
            # - preview: preview.webp (or preview.jpg for RAW files)
            if variant != "original":
                if "/original/" in original_key:
                    # Replace /original/ with /{variant}/ and use the correct variant filename
                    base_path = original_key.rsplit("/", 1)[0]  # Remove filename
                    variant_path = base_path.replace("/original/", f"/{variant}/")

                    if variant == "thumbnail":
                        variant_filename = "thumb.webp"
                    elif variant == "preview":
                        # Preview could be webp or jpg (for RAW files)
                        # Try webp first, worker uses webp for standard images
                        variant_filename = "preview.webp"
                    else:
                        # Unknown variant, try original filename
                        variant_filename = original_key.rsplit("/", 1)[-1]

                    object_key = f"{variant_path}/{variant_filename}"
                else:
                    # Fallback or error if structure is unexpected
                    object_key = original_key  # Might fail if looking for thumb
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

            # Adjust mime type for thumbnails and previews
            # Worker generates webp for standard images, jpg for RAW files
            if variant in ("thumbnail", "preview") and row["type"] == "photo":
                # Thumbnails are always webp, previews are webp (or jpg for RAW)
                mime_type = "image/webp"
            
            return decrypted_data, mime_type

    # -----------------------------------------------------------------------
    # Folder CRUD Operations
    # -----------------------------------------------------------------------

    async def create_folder(
        self,
        workspace_id: UUID,
        name: str,
        created_by_user_id: UUID,
        parent_folder_id: Optional[UUID] = None,
        description: Optional[str] = None,
        color: Optional[str] = None,
    ) -> dict:
        """Create a new library folder."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify parent folder exists if provided
            if parent_folder_id:
                parent = await conn.fetchrow(
                    "SELECT folder_id FROM library_folders WHERE folder_id = $1 AND workspace_id = $2",
                    parent_folder_id,
                    workspace_id,
                )
                if not parent:
                    raise NotFoundError("Parent folder", str(parent_folder_id))

            # Get next sort_order
            max_order = await conn.fetchval(
                """
                SELECT COALESCE(MAX(sort_order), 0) 
                FROM library_folders 
                WHERE workspace_id = $1 AND parent_folder_id IS NOT DISTINCT FROM $2
                """,
                workspace_id,
                parent_folder_id,
            )

            row = await conn.fetchrow(
                """
                INSERT INTO library_folders (workspace_id, name, parent_folder_id, description, color, sort_order, created_by_user_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING folder_id, workspace_id, name, parent_folder_id, description, color, sort_order, created_at, updated_at
                """,
                workspace_id,
                name,
                parent_folder_id,
                description,
                color,
                (max_order or 0) + 1,
                created_by_user_id,
            )

            logger.info(f"Created library folder: {row['folder_id']} in workspace {workspace_id}")

            return {
                "folder_id": str(row["folder_id"]),
                "workspace_id": str(row["workspace_id"]),
                "name": row["name"],
                "parent_folder_id": str(row["parent_folder_id"]) if row["parent_folder_id"] else None,
                "description": row["description"],
                "color": row["color"],
                "sort_order": row["sort_order"],
                "created_at": row["created_at"].isoformat(),
                "updated_at": row["updated_at"].isoformat(),
                "asset_count": 0,
            }

    async def update_folder(
        self,
        workspace_id: UUID,
        folder_id: UUID,
        name: Optional[str] = None,
        description: Optional[str] = None,
        color: Optional[str] = None,
        parent_folder_id: Optional[UUID] = None,
        cover_asset_id: Optional[UUID] = None,
    ) -> dict:
        """Update a library folder."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify folder exists
            existing = await conn.fetchrow(
                "SELECT * FROM library_folders WHERE folder_id = $1 AND workspace_id = $2",
                folder_id,
                workspace_id,
            )
            if not existing:
                raise NotFoundError("Folder", str(folder_id))

            # Build update query dynamically
            updates = ["updated_at = NOW()"]
            params = [folder_id, workspace_id]
            param_idx = 3

            if name is not None:
                updates.append(f"name = ${param_idx}")
                params.append(name)
                param_idx += 1

            if description is not None:
                updates.append(f"description = ${param_idx}")
                params.append(description)
                param_idx += 1

            if color is not None:
                updates.append(f"color = ${param_idx}")
                params.append(color)
                param_idx += 1

            if cover_asset_id is not None:
                updates.append(f"cover_asset_id = ${param_idx}")
                params.append(cover_asset_id)
                param_idx += 1

            row = await conn.fetchrow(
                f"""
                UPDATE library_folders
                SET {', '.join(updates)}
                WHERE folder_id = $1 AND workspace_id = $2
                RETURNING folder_id, workspace_id, name, parent_folder_id, description, color, sort_order, cover_asset_id, created_at, updated_at
                """,
                *params,
            )

            # Get asset count
            asset_count = await conn.fetchval(
                "SELECT COUNT(*) FROM assets WHERE folder_id = $1 AND deleted = FALSE",
                folder_id,
            )

            logger.info(f"Updated library folder: {folder_id}")

            return {
                "folder_id": str(row["folder_id"]),
                "workspace_id": str(row["workspace_id"]),
                "name": row["name"],
                "parent_folder_id": str(row["parent_folder_id"]) if row["parent_folder_id"] else None,
                "description": row["description"],
                "color": row["color"],
                "sort_order": row["sort_order"],
                "cover_asset_id": str(row["cover_asset_id"]) if row["cover_asset_id"] else None,
                "created_at": row["created_at"].isoformat(),
                "updated_at": row["updated_at"].isoformat(),
                "asset_count": asset_count,
            }

    async def delete_folder(
        self,
        workspace_id: UUID,
        folder_id: UUID,
        move_assets_to_root: bool = True,
    ) -> dict:
        """Delete a library folder.
        
        Args:
            workspace_id: Workspace UUID
            folder_id: Folder to delete
            move_assets_to_root: If True, move assets to root. If False, delete assets.
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                # Verify folder exists
                existing = await conn.fetchrow(
                    "SELECT * FROM library_folders WHERE folder_id = $1 AND workspace_id = $2",
                    folder_id,
                    workspace_id,
                )
                if not existing:
                    raise NotFoundError("Folder", str(folder_id))

                # Get all descendant folder IDs (recursive)
                descendant_ids = await conn.fetch(
                    """
                    WITH RECURSIVE folder_tree AS (
                        SELECT folder_id FROM library_folders WHERE folder_id = $1
                        UNION ALL
                        SELECT lf.folder_id 
                        FROM library_folders lf
                        JOIN folder_tree ft ON lf.parent_folder_id = ft.folder_id
                    )
                    SELECT folder_id FROM folder_tree
                    """,
                    folder_id,
                )
                all_folder_ids = [r["folder_id"] for r in descendant_ids]

                # Handle assets
                if move_assets_to_root:
                    # Move all assets in folder and subfolders to root
                    await conn.execute(
                        "UPDATE assets SET folder_id = NULL WHERE folder_id = ANY($1::uuid[])",
                        all_folder_ids,
                    )
                else:
                    # Soft delete assets
                    await conn.execute(
                        """
                        UPDATE assets 
                        SET deleted = TRUE, deleted_at = NOW() 
                        WHERE folder_id = ANY($1::uuid[])
                        """,
                        all_folder_ids,
                    )

                # Delete folder and all subfolders (cascade handles this)
                result = await conn.execute(
                    "DELETE FROM library_folders WHERE folder_id = $1",
                    folder_id,
                )

                deleted_count = int(result.split(" ")[1]) if " " in result else 0
                
                logger.info(f"Deleted library folder: {folder_id} (subfolders: {len(all_folder_ids) - 1})")

                return {"deleted": True, "folders_deleted": len(all_folder_ids)}

    async def list_folders(
        self,
        workspace_id: UUID,
        parent_folder_id: Optional[UUID] = None,
    ) -> list[dict]:
        """List folders in a workspace, optionally filtered by parent."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT 
                    lf.folder_id,
                    lf.workspace_id,
                    lf.name,
                    lf.parent_folder_id,
                    lf.description,
                    lf.color,
                    lf.sort_order,
                    lf.cover_asset_id,
                    lf.created_at,
                    lf.updated_at,
                    COUNT(a.asset_id) FILTER (WHERE a.deleted = FALSE) as asset_count,
                    (SELECT COUNT(*) FROM library_folders sub WHERE sub.parent_folder_id = lf.folder_id) as subfolder_count
                FROM library_folders lf
                LEFT JOIN assets a ON a.folder_id = lf.folder_id
                WHERE lf.workspace_id = $1 AND lf.parent_folder_id IS NOT DISTINCT FROM $2
                GROUP BY lf.folder_id
                ORDER BY lf.sort_order ASC, lf.name ASC
                """,
                workspace_id,
                parent_folder_id,
            )

            return [
                {
                    "folder_id": str(row["folder_id"]),
                    "workspace_id": str(row["workspace_id"]),
                    "name": row["name"],
                    "parent_folder_id": str(row["parent_folder_id"]) if row["parent_folder_id"] else None,
                    "description": row["description"],
                    "color": row["color"],
                    "sort_order": row["sort_order"],
                    "cover_asset_id": str(row["cover_asset_id"]) if row["cover_asset_id"] else None,
                    "created_at": row["created_at"].isoformat(),
                    "updated_at": row["updated_at"].isoformat(),
                    "asset_count": row["asset_count"],
                    "subfolder_count": row["subfolder_count"],
                }
                for row in rows
            ]

    async def get_folder(
        self,
        workspace_id: UUID,
        folder_id: UUID,
    ) -> dict:
        """Get a folder with its details and breadcrumb path."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT 
                    lf.folder_id,
                    lf.workspace_id,
                    lf.name,
                    lf.parent_folder_id,
                    lf.description,
                    lf.color,
                    lf.sort_order,
                    lf.cover_asset_id,
                    lf.created_at,
                    lf.updated_at,
                    COUNT(a.asset_id) FILTER (WHERE a.deleted = FALSE) as asset_count
                FROM library_folders lf
                LEFT JOIN assets a ON a.folder_id = lf.folder_id
                WHERE lf.folder_id = $1 AND lf.workspace_id = $2
                GROUP BY lf.folder_id
                """,
                folder_id,
                workspace_id,
            )

            if not row:
                raise NotFoundError("Folder", str(folder_id))

            # Get breadcrumb path
            breadcrumb = await conn.fetch(
                """
                WITH RECURSIVE folder_path AS (
                    SELECT folder_id, name, parent_folder_id, 1 as depth
                    FROM library_folders
                    WHERE folder_id = $1
                    UNION ALL
                    SELECT lf.folder_id, lf.name, lf.parent_folder_id, fp.depth + 1
                    FROM library_folders lf
                    JOIN folder_path fp ON lf.folder_id = fp.parent_folder_id
                )
                SELECT folder_id, name FROM folder_path ORDER BY depth DESC
                """,
                folder_id,
            )

            return {
                "folder_id": str(row["folder_id"]),
                "workspace_id": str(row["workspace_id"]),
                "name": row["name"],
                "parent_folder_id": str(row["parent_folder_id"]) if row["parent_folder_id"] else None,
                "description": row["description"],
                "color": row["color"],
                "sort_order": row["sort_order"],
                "cover_asset_id": str(row["cover_asset_id"]) if row["cover_asset_id"] else None,
                "created_at": row["created_at"].isoformat(),
                "updated_at": row["updated_at"].isoformat(),
                "asset_count": row["asset_count"],
                "breadcrumb": [
                    {"folder_id": str(b["folder_id"]), "name": b["name"]}
                    for b in breadcrumb
                ],
            }

    async def move_assets_to_folder(
        self,
        workspace_id: UUID,
        asset_ids: list[UUID],
        folder_id: Optional[UUID] = None,
    ) -> dict:
        """Move assets to a folder (or root if folder_id is None)."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify folder exists if provided
            if folder_id:
                folder = await conn.fetchrow(
                    "SELECT folder_id FROM library_folders WHERE folder_id = $1 AND workspace_id = $2",
                    folder_id,
                    workspace_id,
                )
                if not folder:
                    raise NotFoundError("Folder", str(folder_id))

            result = await conn.execute(
                """
                UPDATE assets 
                SET folder_id = $1 
                WHERE asset_id = ANY($2::uuid[]) AND workspace_id = $3 AND deleted = FALSE
                """,
                folder_id,
                asset_ids,
                workspace_id,
            )

            try:
                count = int(result.split(" ")[1])
            except (IndexError, ValueError):
                count = 0

            logger.info(f"Moved {count} assets to folder {folder_id or 'root'}")

            return {"moved": True, "count": count}

    async def update_asset(
        self,
        workspace_id: UUID,
        asset_id: UUID,
        display_name: Optional[str] = None,
        folder_id: Optional[UUID] = None,
    ) -> dict:
        """Update asset metadata (display name, folder)."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify asset exists
            existing = await conn.fetchrow(
                "SELECT * FROM assets WHERE asset_id = $1 AND workspace_id = $2 AND deleted = FALSE",
                asset_id,
                workspace_id,
            )
            if not existing:
                raise NotFoundError("Asset", str(asset_id))

            # Build update
            updates = []
            params = [asset_id, workspace_id]
            param_idx = 3

            if folder_id is not None:
                # Verify folder exists
                if folder_id:
                    folder = await conn.fetchrow(
                        "SELECT folder_id FROM library_folders WHERE folder_id = $1 AND workspace_id = $2",
                        folder_id,
                        workspace_id,
                    )
                    if not folder:
                        raise NotFoundError("Folder", str(folder_id))
                updates.append(f"folder_id = ${param_idx}")
                params.append(folder_id if folder_id else None)
                param_idx += 1

            if not updates:
                # Nothing to update
                return {"updated": False, "asset_id": str(asset_id)}

            await conn.execute(
                f"""
                UPDATE assets SET {', '.join(updates)}
                WHERE asset_id = $1 AND workspace_id = $2
                """,
                *params,
            )

            logger.info(f"Updated asset: {asset_id}")

            return {"updated": True, "asset_id": str(asset_id)}


def get_library_service() -> LibraryService:
    """Get library service instance."""
    return LibraryService()

