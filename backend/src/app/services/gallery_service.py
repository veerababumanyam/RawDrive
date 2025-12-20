"""GalleryService: CRUD operations for galleries, sub-galleries, and gallery assets.

Implements gallery management within workspace scope.
"""

from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID


from app.db.postgres import get_postgres_pool

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class GalleryError(Exception):
    """Base gallery error."""

    def __init__(self, message: str, code: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


class GalleryNotFoundError(GalleryError):
    """Gallery not found."""

    def __init__(self, gallery_id: UUID) -> None:
        super().__init__(
            f"Gallery {gallery_id} not found",
            "GALLERY_NOT_FOUND",
            404,
        )


class GalleryEmptyError(GalleryError):
    """Gallery is empty and cannot be published."""

    def __init__(self, gallery_id: UUID) -> None:
        super().__init__(
            f"Gallery {gallery_id} must have at least one photo to publish",
            "GALLERY_EMPTY",
            400,
        )


class SubGalleryNotFoundError(GalleryError):
    """Sub-gallery not found."""

    def __init__(self, sub_gallery_id: UUID) -> None:
        super().__init__(
            f"Sub-gallery {sub_gallery_id} not found",
            "SUB_GALLERY_NOT_FOUND",
            404,
        )


# ---------------------------------------------------------------------------
# Gallery Service
# ---------------------------------------------------------------------------


class GalleryService:
    """Service for gallery operations."""

    async def create_gallery(
        self,
        workspace_id: UUID,
        user_id: UUID,
        title: str,
        description: Optional[str] = None,
        client_name: Optional[str] = None,
    ) -> dict:
        """Create a new gallery."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Check for duplicate title (exclude deleted galleries)
            existing_id = await conn.fetchval(
                "SELECT gallery_id FROM galleries WHERE workspace_id = $1 AND title = $2 AND deleted = FALSE",
                workspace_id,
                title,
            )
            if existing_id:
                raise GalleryError(
                    f"Gallery with title '{title}' already exists",
                    "DUPLICATE_TITLE",
                    409,
                )

            gallery_id = await conn.fetchval(
                """
                INSERT INTO galleries (
                    workspace_id, title, description, client_name,
                    created_by_user_id, status
                )
                VALUES ($1, $2, $3, $4, $5, 'draft')
                RETURNING gallery_id
                """,
                workspace_id,
                title,
                description,
                client_name,
                user_id,
            )
            return await self.get_gallery(workspace_id, gallery_id)

    async def get_gallery(self, workspace_id: UUID, gallery_id: UUID) -> dict:
        """Get gallery details."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    gallery_id, workspace_id, title, description, client_name,
                    status, branding_profile_id, portal_language, layout_style,
                    theme, download_policy, exif_visible,
                    password_hash IS NOT NULL as password_protected,
                    email_registration_required, expires_at, custom_domain,
                    cover_asset_id, created_by_user_id, published_at,
                    created_at, updated_at, deleted
                FROM galleries
                WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE
                """,
                workspace_id,
                gallery_id,
            )
            if not row:
                raise GalleryNotFoundError(gallery_id)

            # Get sub-galleries (exclude deleted)
            sub_galleries = await conn.fetch(
                """
                SELECT
                    sub_gallery_id, name, sort_order, visible, cover_asset_id,
                    (
                        SELECT COUNT(*)
                        FROM gallery_assets ga
                        JOIN assets a ON ga.asset_id = a.asset_id
                        WHERE ga.sub_gallery_id = sub_galleries.sub_gallery_id
                        AND ga.visible = TRUE
                        AND a.deleted = FALSE
                    ) as photo_count
                FROM sub_galleries
                WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE
                ORDER BY sort_order ASC
                """,
                workspace_id,
                gallery_id,
            )

            # Get stats (exclude deleted assets)
            stats = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) FILTER (WHERE assets.type = 'photo') as total_photos,
                    COUNT(*) FILTER (WHERE assets.type = 'video') as total_videos,
                    COUNT(*) as total_items,
                    (
                        SELECT COUNT(DISTINCT ci.asset_id)
                        FROM client_interactions ci
                        JOIN assets a ON ci.asset_id = a.asset_id
                        WHERE ci.gallery_id = $2 AND ci.type = 'favorite' AND a.deleted = FALSE
                    ) as favorites_count,
                    (
                        SELECT COUNT(DISTINCT ci.asset_id)
                        FROM client_interactions ci
                        JOIN assets a ON ci.asset_id = a.asset_id
                        WHERE ci.gallery_id = $2 AND ci.type = 'select' AND a.deleted = FALSE
                    ) as selections_count
                FROM gallery_assets ga
                JOIN assets ON ga.asset_id = assets.asset_id
                WHERE ga.workspace_id = $1 AND ga.gallery_id = $2
                AND ga.visible = TRUE AND assets.deleted = FALSE
                """,
                workspace_id,
                gallery_id,
            )

            return {
                "gallery_id": str(row["gallery_id"]),
                "workspace_id": str(row["workspace_id"]),
                "title": row["title"],
                "description": row["description"],
                "client_name": row["client_name"],
                "status": row["status"],
                "branding_profile_id": str(row["branding_profile_id"]) if row["branding_profile_id"] else None,
                "portal_language": row["portal_language"],
                "layout_style": row["layout_style"],
                "theme": row["theme"],
                "download_policy": row["download_policy"],
                "exif_visible": row["exif_visible"],
                "password_protected": row["password_protected"],
                "email_registration_required": row["email_registration_required"],
                "expires_at": row["expires_at"].isoformat() if row["expires_at"] else None,
                "published_at": row["published_at"].isoformat() if row["published_at"] else None,
                "cover_asset_id": str(row["cover_asset_id"]) if row["cover_asset_id"] else None,
                "created_by_user_id": str(row["created_by_user_id"]),
                "created_at": row["created_at"].isoformat(),
                "sub_galleries": [
                    {
                        "sub_gallery_id": str(sg["sub_gallery_id"]),
                        "name": sg["name"],
                        "sort_order": sg["sort_order"],
                        "visible": sg["visible"],
                        "photo_count": sg["photo_count"],
                        "cover_asset_id": str(sg["cover_asset_id"]) if sg["cover_asset_id"] else None,
                    }
                    for sg in sub_galleries
                ],
                "stats": {
                    "total_photos": stats["total_photos"] or 0,
                    "total_videos": stats["total_videos"] or 0,
                    "total_items": stats["total_items"] or 0,
                    "favorites_count": stats["favorites_count"] or 0,
                    "selections_count": stats["selections_count"] or 0,
                },
            }

    async def list_galleries(
        self,
        workspace_id: UUID,
        page: int = 1,
        limit: int = 20,
        sort: str = "created_at",
        status: Optional[str] = None,
    ) -> dict:
        """List galleries for a workspace."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            offset = (page - 1) * limit

            # Build WHERE clause (always exclude deleted galleries)
            where_clauses = ["workspace_id = $1", "deleted = FALSE"]
            params = [workspace_id]
            param_idx = 2

            if status:
                where_clauses.append(f"status = ${param_idx}")
                params.append(status)
                param_idx += 1

            where_sql = " AND ".join(where_clauses)

            # Validate sort column
            valid_sorts = {"created_at", "title", "status"}
            if sort not in valid_sorts:
                sort = "created_at"
            order_sql = f"ORDER BY {sort} DESC" if sort == "created_at" else f"ORDER BY {sort} ASC"

            # Get total count
            total = await conn.fetchval(
                f"SELECT COUNT(*) FROM galleries WHERE {where_sql}",
                *params,
            )

            # Get galleries
            galleries = await conn.fetch(
                f"""
                SELECT
                    gallery_id, title, description, client_name, status,
                    cover_asset_id, published_at, created_at,
                    (
                        SELECT COUNT(*)
                        FROM gallery_assets ga
                        JOIN assets a ON ga.asset_id = a.asset_id
                        WHERE ga.gallery_id = galleries.gallery_id
                        AND ga.visible = TRUE
                        AND a.deleted = FALSE
                    ) as photo_count,
                    -- Fallback to first asset if no explicit cover is set
                    COALESCE(
                        cover_asset_id,
                        (
                            SELECT ga.asset_id
                            FROM gallery_assets ga
                            JOIN assets a ON ga.asset_id = a.asset_id
                            WHERE ga.gallery_id = galleries.gallery_id
                            AND ga.visible = TRUE
                            AND a.deleted = FALSE
                            ORDER BY ga.created_at ASC
                            LIMIT 1
                        )
                    ) as effective_cover_asset_id
                FROM galleries
                WHERE {where_sql}
                {order_sql}
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
                """,
                *params,
                limit,
                offset,
            )

            return {
                "data": [
                    {
                        "gallery_id": str(g["gallery_id"]),
                        "title": g["title"],
                        "description": g["description"],
                        "client_name": g["client_name"],
                        "status": g["status"],
                        "photo_count": g["photo_count"] or 0,
                        "created_at": g["created_at"].isoformat(),
                        "published_at": g["published_at"].isoformat() if g["published_at"] else None,
                        # Use effective_cover_asset_id which falls back to first asset
                        "cover_asset_id": str(g["effective_cover_asset_id"]) if g["effective_cover_asset_id"] else None,
                        "cover_image_url": None,  # Frontend fetches signed URL using cover_asset_id
                    }
                    for g in galleries
                ],
                "meta": {
                    "page": page,
                    "limit": limit,
                    "total": total,
                    "totalPages": (total + limit - 1) // limit,
                },
            }

    async def update_gallery(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        **updates: dict,
    ) -> dict:
        """Update gallery fields."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Check gallery exists (exclude deleted)
            exists = await conn.fetchval(
                "SELECT 1 FROM galleries WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE",
                workspace_id,
                gallery_id,
            )
            if not exists:
                raise GalleryNotFoundError(gallery_id)

            # Build update query
            set_clauses = []
            params = []
            param_idx = 1

            allowed_fields = {
                "title",
                "description",
                "client_name",
                "layout_style",
                "theme",
                "download_policy",
                "exif_visible",
                "email_registration_required",
                "expires_at",
                "branding_profile_id",
                "cover_asset_id",
            }

            for field, value in updates.items():
                if field in allowed_fields:
                    if field == "expires_at" and value is None:
                        set_clauses.append(f"{field} = NULL")
                    elif field in ("branding_profile_id", "cover_asset_id") and value is None:
                        set_clauses.append(f"{field} = NULL")
                    else:
                        set_clauses.append(f"{field} = ${param_idx}")
                        params.append(value)
                        param_idx += 1

            if not set_clauses:
                return await self.get_gallery(workspace_id, gallery_id)

            set_clauses.append("updated_at = NOW()")
            params.extend([workspace_id, gallery_id])

            await conn.execute(
                f"""
                UPDATE galleries
                SET {', '.join(set_clauses)}
                WHERE workspace_id = ${param_idx} AND gallery_id = ${param_idx + 1}
                """,
                *params,
            )

            return await self.get_gallery(workspace_id, gallery_id)

    async def delete_gallery(self, workspace_id: UUID, gallery_id: UUID) -> None:
        """Delete a gallery (soft delete by setting status to archived)."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE galleries
                SET status = 'archived', updated_at = NOW()
                WHERE workspace_id = $1 AND gallery_id = $2
                """,
                workspace_id,
                gallery_id,
            )
            if result == "UPDATE 0":
                raise GalleryNotFoundError(gallery_id)

    async def publish_gallery(self, workspace_id: UUID, gallery_id: UUID, publish: bool) -> dict:
        """Publish or unpublish a gallery."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Check gallery exists (exclude deleted)
            gallery = await conn.fetchrow(
                "SELECT status FROM galleries WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE",
                workspace_id,
                gallery_id,
            )
            if not gallery:
                raise GalleryNotFoundError(gallery_id)

            if publish:
                # Validate gallery has at least one photo (exclude deleted assets)
                photo_count = await conn.fetchval(
                    """
                    SELECT COUNT(*)
                    FROM gallery_assets ga
                    JOIN assets a ON ga.asset_id = a.asset_id
                    WHERE ga.workspace_id = $1 AND ga.gallery_id = $2
                    AND ga.visible = TRUE AND a.deleted = FALSE
                    """,
                    workspace_id,
                    gallery_id,
                )
                if photo_count == 0:
                    raise GalleryEmptyError(gallery_id)

                await conn.execute(
                    """
                    UPDATE galleries
                    SET status = 'published',
                        published_at = COALESCE(published_at, NOW()),
                        updated_at = NOW()
                    WHERE workspace_id = $1 AND gallery_id = $2
                    """,
                    workspace_id,
                    gallery_id,
                )
            else:
                await conn.execute(
                    """
                    UPDATE galleries
                    SET status = 'draft', updated_at = NOW()
                    WHERE workspace_id = $1 AND gallery_id = $2
                    """,
                    workspace_id,
                    gallery_id,
                )

            return await self.get_gallery(workspace_id, gallery_id)

    async def create_sub_gallery(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        name: str,
        sort_order: int = 0,
    ) -> dict:
        """Create a sub-gallery."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify gallery exists (exclude deleted)
            gallery = await conn.fetchrow(
                "SELECT gallery_id FROM galleries WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE",
                workspace_id,
                gallery_id,
            )
            if not gallery:
                raise GalleryNotFoundError(gallery_id)

            # Check for duplicate name (exclude deleted sub-galleries)
            existing_id = await conn.fetchval(
                "SELECT sub_gallery_id FROM sub_galleries WHERE gallery_id = $1 AND name = $2 AND deleted = FALSE",
                gallery_id,
                name,
            )
            if existing_id:
                raise GalleryError(
                    f"Sub-gallery with name '{name}' already exists",
                    "DUPLICATE_NAME",
                    409,
                )

            # Get max sort_order to append at end if not specified (exclude deleted)
            if sort_order == 0:
                max_sort = await conn.fetchval(
                    """
                    SELECT COALESCE(MAX(sort_order), 0)
                    FROM sub_galleries
                    WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE
                    """,
                    workspace_id,
                    gallery_id,
                )
                sort_order = max_sort + 1

            # Create sub-gallery
            sub_gallery_id = await conn.fetchval(
                """
                INSERT INTO sub_galleries (
                    workspace_id, gallery_id, name, sort_order, visible
                )
                VALUES ($1, $2, $3, $4, TRUE)
                RETURNING sub_gallery_id
                """,
                workspace_id,
                gallery_id,
                name,
                sort_order,
            )

            # Return sub-gallery data (photo_count excludes deleted assets)
            row = await conn.fetchrow(
                """
                SELECT
                    sub_gallery_id, name, sort_order, visible, cover_asset_id,
                    (
                        SELECT COUNT(*)
                        FROM gallery_assets ga
                        JOIN assets a ON ga.asset_id = a.asset_id
                        WHERE ga.sub_gallery_id = sub_galleries.sub_gallery_id
                        AND ga.visible = TRUE
                        AND a.deleted = FALSE
                    ) as photo_count
                FROM sub_galleries
                WHERE workspace_id = $1 AND gallery_id = $2 AND sub_gallery_id = $3
                """,
                workspace_id,
                gallery_id,
                sub_gallery_id,
            )

            return {
                "sub_gallery_id": str(row["sub_gallery_id"]),
                "name": row["name"],
                "sort_order": row["sort_order"],
                "visible": row["visible"],
                "photo_count": row["photo_count"],
                "cover_asset_id": str(row["cover_asset_id"]) if row["cover_asset_id"] else None,
            }

    async def update_sub_gallery(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        sub_gallery_id: UUID,
        name: str | None = None,
        sort_order: int | None = None,
        visible: bool | None = None,
        cover_asset_id: UUID | None = None,
    ) -> dict:
        """Update a sub-gallery."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify sub-gallery exists (exclude deleted)
            sub_gallery = await conn.fetchrow(
                """
                SELECT sub_gallery_id FROM sub_galleries
                WHERE workspace_id = $1 AND gallery_id = $2 AND sub_gallery_id = $3 AND deleted = FALSE
                """,
                workspace_id,
                gallery_id,
                sub_gallery_id,
            )
            if not sub_gallery:
                raise SubGalleryNotFoundError(sub_gallery_id)

            # Build update query
            set_clauses = []
            params = []
            param_idx = 1

            if name is not None:
                # Check for duplicate name (exclude deleted sub-galleries)
                existing_id = await conn.fetchval(
                    """
                    SELECT sub_gallery_id FROM sub_galleries
                    WHERE gallery_id = $1 AND name = $2 AND sub_gallery_id != $3 AND deleted = FALSE
                    """,
                    gallery_id,
                    name,
                    sub_gallery_id,
                )
                if existing_id:
                    raise GalleryError(
                        f"Sub-gallery with name '{name}' already exists",
                        "DUPLICATE_NAME",
                        409,
                    )
                
                set_clauses.append(f"name = ${param_idx}")
                params.append(name)
                param_idx += 1

            if sort_order is not None:
                set_clauses.append(f"sort_order = ${param_idx}")
                params.append(sort_order)
                param_idx += 1

            if visible is not None:
                set_clauses.append(f"visible = ${param_idx}")
                params.append(visible)
                param_idx += 1

            if cover_asset_id is not None:
                set_clauses.append(f"cover_asset_id = ${param_idx}")
                params.append(cover_asset_id)
                param_idx += 1

            if not set_clauses:
                # No updates, return current data (photo_count excludes deleted assets)
                row = await conn.fetchrow(
                    """
                    SELECT
                        sub_gallery_id, name, sort_order, visible, cover_asset_id,
                        (
                            SELECT COUNT(*)
                            FROM gallery_assets ga
                            JOIN assets a ON ga.asset_id = a.asset_id
                            WHERE ga.sub_gallery_id = sub_galleries.sub_gallery_id
                            AND ga.visible = TRUE
                            AND a.deleted = FALSE
                        ) as photo_count
                    FROM sub_galleries
                    WHERE workspace_id = $1 AND gallery_id = $2 AND sub_gallery_id = $3
                    """,
                    workspace_id,
                    gallery_id,
                    sub_gallery_id,
                )
            else:
                params.extend([workspace_id, gallery_id, sub_gallery_id])
                await conn.execute(
                    f"""
                    UPDATE sub_galleries
                    SET {', '.join(set_clauses)}
                    WHERE workspace_id = ${param_idx} AND gallery_id = ${param_idx + 1} AND sub_gallery_id = ${param_idx + 2}
                    """,
                    *params,
                )

                # Fetch updated data (photo_count excludes deleted assets)
                row = await conn.fetchrow(
                    """
                    SELECT
                        sub_gallery_id, name, sort_order, visible, cover_asset_id,
                        (
                            SELECT COUNT(*)
                            FROM gallery_assets ga
                            JOIN assets a ON ga.asset_id = a.asset_id
                            WHERE ga.sub_gallery_id = sub_galleries.sub_gallery_id
                            AND ga.visible = TRUE
                            AND a.deleted = FALSE
                        ) as photo_count
                    FROM sub_galleries
                    WHERE workspace_id = $1 AND gallery_id = $2 AND sub_gallery_id = $3
                    """,
                    workspace_id,
                    gallery_id,
                    sub_gallery_id,
                )

            return {
                "sub_gallery_id": str(row["sub_gallery_id"]),
                "name": row["name"],
                "sort_order": row["sort_order"],
                "visible": row["visible"],
                "photo_count": row["photo_count"],
                "cover_asset_id": str(row["cover_asset_id"]) if row["cover_asset_id"] else None,
            }

    async def delete_sub_gallery(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        sub_gallery_id: UUID,
    ) -> None:
        """Delete a sub-gallery (soft delete)."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify sub-gallery exists (exclude deleted)
            sub_gallery = await conn.fetchrow(
                """
                SELECT sub_gallery_id FROM sub_galleries
                WHERE workspace_id = $1 AND gallery_id = $2 AND sub_gallery_id = $3 AND deleted = FALSE
                """,
                workspace_id,
                gallery_id,
                sub_gallery_id,
            )
            if not sub_gallery:
                raise SubGalleryNotFoundError(sub_gallery_id)

            # Move all assets back to root gallery (set sub_gallery_id to NULL)
            await conn.execute(
                """
                UPDATE gallery_assets
                SET sub_gallery_id = NULL
                WHERE workspace_id = $1 AND gallery_id = $2 AND sub_gallery_id = $3
                """,
                workspace_id,
                gallery_id,
                sub_gallery_id,
            )

            # Soft delete sub-gallery
            result = await conn.execute(
                """
                UPDATE sub_galleries
                SET deleted = TRUE, deleted_at = NOW()
                WHERE workspace_id = $1 AND gallery_id = $2 AND sub_gallery_id = $3
                """,
                workspace_id,
                gallery_id,
                sub_gallery_id,
            )
            if result == "UPDATE 0":
                raise SubGalleryNotFoundError(sub_gallery_id)

    async def update_sub_galleries_sort_order(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        sub_gallery_ids: list[UUID],
    ) -> None:
        """Update sort order for multiple sub-galleries."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify gallery exists (exclude deleted)
            gallery = await conn.fetchrow(
                "SELECT gallery_id FROM galleries WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE",
                workspace_id,
                gallery_id,
            )
            if not gallery:
                raise GalleryNotFoundError(gallery_id)

            # Verify all sub-galleries belong to this gallery (exclude deleted)
            sub_gallery_count = await conn.fetchval(
                """
                SELECT COUNT(*) FROM sub_galleries
                WHERE workspace_id = $1 AND gallery_id = $2 AND sub_gallery_id = ANY($3::uuid[])
                AND deleted = FALSE
                """,
                workspace_id,
                gallery_id,
                sub_gallery_ids,
            )
            if sub_gallery_count != len(sub_gallery_ids):
                raise GalleryError(
                    "Some sub-galleries do not belong to this gallery",
                    "INVALID_SUB_GALLERIES",
                    400,
                )

            # Update sort_order for each sub-gallery
            for index, sub_gallery_id in enumerate(sub_gallery_ids):
                await conn.execute(
                    """
                    UPDATE sub_galleries
                    SET sort_order = $1
                    WHERE workspace_id = $2 AND gallery_id = $3 AND sub_gallery_id = $4
                    """,
                    index + 1,  # Start from 1 (Root Gallery is 0)
                    workspace_id,
                    gallery_id,
                    sub_gallery_id,
                )


# Export singleton instance
_gallery_service: Optional[GalleryService] = None


def get_gallery_service() -> GalleryService:
    """Get singleton gallery service instance."""
    global _gallery_service
    if _gallery_service is None:
        _gallery_service = GalleryService()
    return _gallery_service

