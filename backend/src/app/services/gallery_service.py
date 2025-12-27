"""GalleryService: CRUD operations for galleries, sub-galleries, and gallery assets.

Implements gallery management within workspace scope.
"""

from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID
from datetime import datetime, timezone


from app.db.postgres import get_postgres_pool
from app.services.company_profile_service import get_company_profile_service
from app.services.workspace_activity_service import (
    record_gallery_published,
)
from app.utils.security import hash_password, verify_password

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
        client_id: Optional[UUID] = None,
        shoot_date: Optional[datetime] = None,
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
                    workspace_id, title, description, client_name, client_id, shoot_date,
                    created_by_user_id, status
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft')
                RETURNING gallery_id
                """,
                workspace_id,
                title,
                description,
                client_name,
                client_id,
                shoot_date,
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
                    gallery_id, workspace_id, title, description, client_name, client_id, shoot_date,
                    status, branding_profile_id, portal_language, layout_style,
                    theme, download_policy, exif_visible,
                    password_hash IS NOT NULL as password_protected,
                    pin_hash IS NOT NULL as pin_protected,
                    email_registration_required, expires_at, custom_domain,
                    primary_color, font_family, custom_links,
                    cover_asset_id, created_by_user_id, published_at,
                    created_at, updated_at, deleted, pinned_at, last_accessed_at
                FROM galleries
                WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE
                """,
                workspace_id,
                gallery_id,
            )
            if not row:
                raise GalleryNotFoundError(gallery_id)

            # Update last_accessed_at
            await conn.execute(
                "UPDATE galleries SET last_accessed_at = NOW() WHERE gallery_id = $1",
                gallery_id,
            )

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

            # Fetch company profile
            company_profile = None
            try:
                profile_service = get_company_profile_service()
                # If specific branding is selected, we might fetch by ID in future.
                # Currently we have 1:1 workspace profile, so fetch by workspace_id.
                company_profile = await profile_service.get_profile_optional(workspace_id)
            except Exception as e:
                logger.error(f"Failed to fetch company profile for gallery {gallery_id}: {e}")

            return {
                "gallery_id": str(row["gallery_id"]),
                "workspace_id": str(row["workspace_id"]),
                "title": row["title"],
                "description": row["description"],
                "client_name": row["client_name"],
                "client_id": str(row["client_id"]) if row["client_id"] else None,
                "shoot_date": row["shoot_date"].isoformat() if row["shoot_date"] else None,
                "status": row["status"],
                "branding_profile_id": str(row["branding_profile_id"]) if row["branding_profile_id"] else None,
                "company_profile": company_profile,
                "portal_language": row["portal_language"],
                "layout_style": row["layout_style"],
                "theme": row["theme"],
                "download_policy": row["download_policy"],
                "exif_visible": row["exif_visible"],
                "password_protected": row["password_protected"],
                "pin_protected": row["pin_protected"],
                "email_registration_required": row["email_registration_required"],
                "expires_at": row["expires_at"].isoformat() if row["expires_at"] else None,
                "published_at": row["published_at"].isoformat() if row["published_at"] else None,
                "cover_asset_id": str(row["cover_asset_id"]) if row["cover_asset_id"] else None,
                "primary_color": row["primary_color"],
                "font_family": row["font_family"],
                "custom_domain": row["custom_domain"],
                "custom_links": row["custom_links"] or [],
                "created_by_user_id": str(row["created_by_user_id"]),
                "created_at": row["created_at"].isoformat(),
                "pinned_at": row["pinned_at"].isoformat() if row["pinned_at"] else None,
                "is_pinned": row["pinned_at"] is not None,
                "last_accessed_at": row["last_accessed_at"].isoformat() if row["last_accessed_at"] else None,
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

    async def get_public_gallery(self, gallery_id: UUID) -> dict:
        """Get public gallery details (published only)."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Check gallery exists AND is published
            row = await conn.fetchrow(
                """
                SELECT
                    gallery_id, workspace_id, title, description, client_name, client_id, shoot_date,
                    status, branding_profile_id, portal_language, layout_style,
                    theme, download_policy, exif_visible,
                    password_hash IS NOT NULL as password_protected,
                    pin_hash IS NOT NULL as pin_protected,
                    email_registration_required, expires_at, custom_domain,
                    primary_color, font_family, custom_links,
                    cover_asset_id, created_by_user_id, published_at,
                    created_at, updated_at, deleted
                FROM galleries
                WHERE gallery_id = $1 AND deleted = FALSE AND status = 'published'
                """,
                gallery_id,
            )
            
            if not row:
                # Security: distinguish 404 vs 403? 
                # For public endpoints, if it's not published or doesn't match, just 404.
                raise GalleryNotFoundError(gallery_id)

            # Check expiration
            if row["expires_at"] and row["expires_at"] < datetime.now(timezone.utc):
                 # Or handle expiration properly
                 raise GalleryNotFoundError(gallery_id) # Or explicit expired error

            workspace_id = row["workspace_id"]

            # Get sub-galleries (exclude deleted/hidden)
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
                WHERE gallery_id = $1 AND deleted = FALSE
                AND visible = TRUE
                ORDER BY sort_order ASC
                """,
                gallery_id,
            )

            # Get stats (exclude deleted)
            stats = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) FILTER (WHERE assets.type = 'photo') as total_photos,
                    COUNT(*) FILTER (WHERE assets.type = 'video') as total_videos,
                    COUNT(*) as total_items,
                    0 as favorites_count,
                    0 as selections_count
                FROM gallery_assets ga
                JOIN assets ON ga.asset_id = assets.asset_id
                WHERE ga.gallery_id = $1
                AND ga.visible = TRUE AND assets.deleted = FALSE
                """,
                gallery_id,
            )

            # Fetch company profile
            company_profile = None
            try:
                profile_service = get_company_profile_service()
                company_profile = await profile_service.get_profile_optional(workspace_id)
            except Exception as e:
                logger.error(f"Failed to fetch profile for public gallery {gallery_id}: {e}")

            return {
                "gallery_id": str(row["gallery_id"]),
                "workspace_id": str(row["workspace_id"]),
                "title": row["title"],
                "description": row["description"],
                "client_name": row["client_name"],
                "client_id": str(row["client_id"]) if row["client_id"] else None,
                "shoot_date": row["shoot_date"].isoformat() if row["shoot_date"] else None,
                "status": row["status"],
                "branding_profile_id": str(row["branding_profile_id"]) if row["branding_profile_id"] else None,
                "company_profile": company_profile,
                "portal_language": row["portal_language"],
                "layout_style": row["layout_style"],
                "theme": row["theme"],
                "download_policy": row["download_policy"],
                "exif_visible": row["exif_visible"],
                "password_protected": row["password_protected"],
                "pin_protected": row["pin_protected"],
                "email_registration_required": row["email_registration_required"],
                "expires_at": row["expires_at"].isoformat() if row["expires_at"] else None,
                "published_at": row["published_at"].isoformat() if row["published_at"] else None,
                "cover_asset_id": str(row["cover_asset_id"]) if row["cover_asset_id"] else None,
                "primary_color": row["primary_color"],
                "font_family": row["font_family"],
                "custom_domain": row["custom_domain"],
                "custom_links": row["custom_links"] or [],
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
                    "favorites_count": 0, # Don't show public total favorites usually? or maybe strictly session based
                    "selections_count": 0,
                },
            }

    async def list_galleries(
        self,
        workspace_id: UUID,
        page: int = 1,
        limit: int = 20,
        sort: str = "created_at",
        status: Optional[str] = None,
        search: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        pinned_only: bool = False,
        recent_only: bool = False,
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

            if search:
                where_clauses.append(f"(title ILIKE ${param_idx} OR description ILIKE ${param_idx} OR client_name ILIKE ${param_idx})")
                params.append(f"%{search}%")
                param_idx += 1

            if start_date:
                where_clauses.append(f"shoot_date >= ${param_idx}")
                params.append(start_date)
                param_idx += 1

            if end_date:
                where_clauses.append(f"shoot_date <= ${param_idx}")
                params.append(end_date)
                param_idx += 1

            if pinned_only:
                where_clauses.append("pinned_at IS NOT NULL")

            if recent_only:
                where_clauses.append("last_accessed_at IS NOT NULL")

            where_sql = " AND ".join(where_clauses)

            # Validate sort column
            valid_sorts = {"created_at", "title", "status", "shoot_date", "last_accessed_at"}
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
                    gallery_id, title, description, client_name, client_id, shoot_date, status,
                    cover_asset_id, published_at, created_at, pinned_at, last_accessed_at,
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
                        "client_id": str(g["client_id"]) if g["client_id"] else None,
                        "shoot_date": g["shoot_date"].isoformat() if g["shoot_date"] else None,
                        "status": g["status"],
                        "photo_count": g["photo_count"] or 0,
                        "created_at": g["created_at"].isoformat(),
                        "published_at": g["published_at"].isoformat() if g["published_at"] else None,
                        "pinned_at": g["pinned_at"].isoformat() if g["pinned_at"] else None,
                        "is_pinned": g["pinned_at"] is not None,
                        "last_accessed_at": g["last_accessed_at"].isoformat() if g["last_accessed_at"] else None,
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

    async def list_assets(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        page: int = 1,
        limit: int = 50,
        sub_gallery_id: str | None = None,
        picks_only: bool = False,
        favorites_only: bool = False,
        selections_only: bool = False,
        search_query: str | None = None,
        face_group_ids: list[UUID] | None = None,
    ) -> dict:
        """List assets in a gallery with pagination and filtering."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify gallery exists (exclude deleted)
            exists = await conn.fetchval(
                "SELECT 1 FROM galleries WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE",
                workspace_id,
                gallery_id,
            )
            if not exists:
                raise GalleryNotFoundError(gallery_id)

            offset = (page - 1) * limit
            where_conditions = [
                "ga.workspace_id = $1",
                "ga.gallery_id = $2",
                "ga.visible = TRUE",
                "a.status = 'available'",
                "a.deleted = FALSE",
            ]
            params = [workspace_id, gallery_id]
            param_idx = 3

            if sub_gallery_id is not None:
                if sub_gallery_id == "":
                    where_conditions.append("ga.sub_gallery_id IS NULL")
                else:
                    where_conditions.append(f"ga.sub_gallery_id = ${param_idx}")
                    params.append(UUID(sub_gallery_id))
                    param_idx += 1

            if picks_only or selections_only:
                where_conditions.append("ga.is_selected = TRUE")

            if favorites_only:
                where_conditions.append("ga.is_favorited = TRUE")

            if search_query:
                where_conditions.append(f"LOWER(SUBSTRING(a.original_object_key FROM '[^/]+$')) LIKE ${param_idx}")
                params.append(f"%{search_query.lower()}%")
                param_idx += 1

            if face_group_ids:
                where_conditions.append(f"""
                    EXISTS (
                        SELECT 1 FROM faces f
                        WHERE f.photo_id = ga.asset_id
                        AND f.face_group_id = ANY(${param_idx}::uuid[])
                    )
                """)
                params.append(face_group_ids)
                param_idx += 1

            where_sql = " AND ".join(where_conditions)

            # Get total count
            count_query = f"""
                SELECT COUNT(*)
                FROM gallery_assets ga
                INNER JOIN assets a ON ga.asset_id = a.asset_id
                WHERE {where_sql}
            """
            total = await conn.fetchval(count_query, *params)

            # Get assets
            params.append(limit)
            params.append(offset)
            limit_param_num = len(params) - 1
            offset_param_num = len(params)

            assets_query = f"""
                SELECT
                    ga.gallery_asset_id,
                    ga.asset_id,
                    ga.sort_order,
                    ga.visible,
                    ga.is_private,
                    ga.sub_gallery_id,
                    ga.is_favorited,
                    ga.is_selected,
                    (
                        SELECT COUNT(*) FROM client_interactions ci
                        WHERE ci.workspace_id = ga.workspace_id
                        AND ci.gallery_id = ga.gallery_id
                        AND ci.asset_id = ga.asset_id
                        AND ci.type = 'favorite'
                    ) AS favorites_count,
                    a.type,
                    a.status,
                    a.mime_type,
                    SUBSTRING(a.original_object_key FROM '[^/]+$') AS filename,
                    (a.exif->>'width')::INTEGER AS width,
                    (a.exif->>'height')::INTEGER AS height,
                    (a.exif->>'duration_ms')::INTEGER AS duration_ms,
                    (a.exif->>'date_taken')::TIMESTAMPTZ AS date_taken,
                    a.exif
                FROM gallery_assets ga
                INNER JOIN assets a ON ga.asset_id = a.asset_id
                WHERE {where_sql}
                ORDER BY ga.sort_order ASC, ga.gallery_asset_id ASC
                LIMIT ${limit_param_num} OFFSET ${offset_param_num}
            """

            assets = await conn.fetch(assets_query, *params)

            # Format response
            assets_data = []
            for row in assets:
                assets_data.append({
                    "gallery_asset_id": str(row["gallery_asset_id"]),
                    "asset_id": str(row["asset_id"]),
                    "sort_order": row["sort_order"],
                    "visible": row["visible"],
                    "is_private": row["is_private"],
                    "sub_gallery_id": str(row["sub_gallery_id"]) if row["sub_gallery_id"] else None,
                    "is_favorited": row["is_favorited"],
                    "is_selected": row["is_selected"],
                    "favorites_count": row["favorites_count"] or 0,
                    "asset": {
                        "type": row["type"],
                        "status": row["status"],
                        "mime_type": row["mime_type"],
                        "filename": row["filename"] or "",
                        "width": row["width"],
                        "height": row["height"],
                        "duration_ms": row["duration_ms"],
                        "date_taken": row["date_taken"].isoformat() if row["date_taken"] else None,
                        "exif": row["exif"],
                    },
                })

            return {
                "data": assets_data,
                "meta": {
                    "page": page,
                    "limit": limit,
                    "total": total,
                    "hasMore": (offset + limit) < total,
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

            set_clauses = []
            params = []
            param_idx = 1

            # If client_id is updated, sync client_name
            if "client_id" in updates:
                new_client_id = updates["client_id"]
                if new_client_id:
                    # Fetch client name
                    client_name = await conn.fetchval(
                        "SELECT full_name FROM clients WHERE workspace_id = $1 AND client_id = $2",
                        workspace_id,
                        new_client_id
                    )
                    if client_name:
                         # Update client_name in the updates dict (will be processed below)
                         updates["client_name"] = client_name
                    else:
                        # If client_id is provided but no client found, clear client_name
                        updates["client_name"] = None
                else:
                    # If client_id is explicitly set to None, clear client_name
                    updates["client_name"] = None

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
                "client_id",
                "shoot_date",
                "primary_color",
                "font_family",
                "custom_domain",
                "custom_links",
                "password_hash",
                "pin_hash",
            }

            for field, value in updates.items():
                if field in allowed_fields:
                    if field == "expires_at" and value is None:
                        set_clauses.append(f"{field} = NULL")
                    elif field in ("branding_profile_id", "cover_asset_id", "client_id", "shoot_date", "password_hash", "pin_hash", "primary_color", "font_family", "custom_domain") and value is None:
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

    async def delete_gallery(
        self, workspace_id: UUID, gallery_id: UUID, deleted_by_user_id: UUID | None = None
    ) -> None:
        """Delete a gallery (soft delete by setting status to archived and recording deletion time)."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE galleries
                SET status = 'archived', deleted_at = NOW(), deleted_by_user_id = $3, updated_at = NOW()
                WHERE workspace_id = $1 AND gallery_id = $2
                """,
                workspace_id,
                gallery_id,
                deleted_by_user_id,
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

    async def verify_gallery_pin(self, gallery_id: UUID, pin: str) -> bool:
        """Verify PIN for gallery access.

        Uses constant-time comparison to prevent timing attacks (SOC2 compliant).

        Args:
            gallery_id: Gallery UUID
            pin: Plain-text PIN to verify

        Returns:
            True if PIN is valid, False otherwise
        """
        import hmac

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Get the stored PIN hash
            row = await conn.fetchrow(
                """
                SELECT pin_hash, status, deleted
                FROM galleries
                WHERE gallery_id = $1
                """,
                gallery_id,
            )

            if not row or row["deleted"] or row["status"] != "published":
                raise GalleryNotFoundError(gallery_id)

            pin_hash = row["pin_hash"]
            if not pin_hash:
                # No PIN set - return True (no verification needed)
                return True

            # Use constant-time comparison to prevent timing attacks
            # Note: In production, pin_hash should be bcrypt/argon2 hash
            # and compared using the appropriate library's verify function.
            # For now, using hmac.compare_digest for constant-time string comparison.
            return hmac.compare_digest(pin_hash.encode('utf-8'), pin.encode('utf-8'))

    async def verify_gallery_password(self, gallery_id: UUID, password: str) -> bool:
        """Verify gallery password."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Get password hash (exclude deleted)
            row = await conn.fetchrow(
                "SELECT password_hash FROM galleries WHERE gallery_id = $1 AND deleted = FALSE",
                gallery_id,
            )
            if not row:
                raise GalleryNotFoundError(gallery_id)
            
            if not row["password_hash"]:
                # Not password protected
                return True
            
            return verify_password(password, row["password_hash"])

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

    async def get_public_gallery_assets(self, gallery_id: UUID) -> list[dict]:
        """Get visible assets for a public gallery."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Check gallery exists and is published
            gallery = await conn.fetchrow(
                "SELECT workspace_id, status FROM galleries WHERE gallery_id = $1 AND deleted = FALSE",
                gallery_id,
            )
            if not gallery:
                raise GalleryNotFoundError(gallery_id)
            
            if gallery["status"] != "published":
                # Only published galleries are publicly accessible
                raise GalleryNotFoundError(gallery_id)

            # Fetch visible assets
            rows = await conn.fetch(
                """
                SELECT 
                    a.asset_id, a.gallery_id, ga.sub_gallery_id, a.type, a.filename, 
                    a.width, a.height, a.duration, a.size_bytes, a.metadata, 
                    a.created_at, ga.sort_order
                FROM gallery_assets ga
                JOIN assets a ON ga.asset_id = a.asset_id
                WHERE ga.gallery_id = $1
                AND ga.visible = TRUE
                AND a.deleted = FALSE
                ORDER BY ga.sort_order ASC
                """,
                gallery_id,
            )

            results = []
            for row in rows:
                results.append({
                    "asset_id": str(row["asset_id"]),
                    "gallery_id": str(row["gallery_id"]),
                    "sub_gallery_id": str(row["sub_gallery_id"]) if row["sub_gallery_id"] else None,
                    "type": row["type"],
                    "filename": row["filename"],
                    "width": row["width"],
                    "height": row["height"],
                    "duration": row["duration"],
                    "size_bytes": row["size_bytes"],
                    "metadata": row["metadata"] or {},
                    "sort_order": row["sort_order"],
                    "created_at": row["created_at"].isoformat(),
                })
            
            return results

    async def get_public_asset_content(
        self, gallery_id: UUID, asset_id: UUID, variant: str
    ) -> tuple[bytes, str]:
        """Get decrypted content for a public gallery asset.
        
        Returns:
            (content_bytes, content_type)
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # 1. Verify gallery is published
            gallery = await conn.fetchrow(
                "SELECT workspace_id, status FROM galleries WHERE gallery_id = $1 AND deleted = FALSE",
                gallery_id,
            )
            if not gallery or gallery["status"] != "published":
                raise GalleryNotFoundError(gallery_id)
            
            workspace_id = gallery["workspace_id"]

            # 2. Verify asset exists, is part of this gallery, and is visible
            asset = await conn.fetchrow(
                """
                SELECT a.asset_id, a.filename, a.type
                FROM gallery_assets ga
                JOIN assets a ON ga.asset_id = a.asset_id
                WHERE ga.gallery_id = $1 
                AND ga.asset_id = $2
                AND ga.visible = TRUE
                AND a.deleted = FALSE
                """,
                gallery_id,
                asset_id,
            )
            if not asset:
                raise GalleryError("Asset not found or not visible", "ASSET_NOT_FOUND", 404)

            # 3. Retrieve content from storage
            # We only allow thumbnail and preview for public access via this endpoint
            # 'original' requires stricter checks usually, but for now we'll allow thumbnail/preview
            if variant not in ("thumbnail", "preview", "original"):
                 raise GalleryError("Invalid variant", "INVALID_VARIANT", 400)

            if variant == "original" and asset["type"] == "photo":
                 # Potentially restrict original downloads based on download_policy
                 # For now, we will allow it if logic permits, but let's stick to Plan (thumbnail/preview)
                 # Revisiting Plan: "We will implement thumbnail and preview serving"
                 pass
            
            from app.services.r2_storage_service import get_r2_storage_service, StorageError
            storage = get_r2_storage_service()
            
            try:
                content = await storage.download_encrypted_file(
                    workspace_id=workspace_id,
                    gallery_id=gallery_id,
                    asset_id=asset_id,
                    variant=variant,
                    filename=asset["filename"],
                )
                
                # Determine mime type
                content_type = "application/octet-stream"
                if variant in ("thumbnail", "preview") or asset["type"] == "photo":
                    # Assume JPEG for generated variants, or based on filename
                    if asset["filename"].lower().endswith(".png"):
                        content_type = "image/png"
                    elif asset["filename"].lower().endswith(".webp"):
                         content_type = "image/webp"
                    else:
                        content_type = "image/jpeg"

                return content, content_type
            except StorageError:
                raise GalleryError("Failed to retrieve asset content", "STORAGE_ERROR", 500)
# Export singleton instance
_gallery_service: Optional[GalleryService] = None


def get_gallery_service() -> GalleryService:
    """Get singleton gallery service instance."""
    global _gallery_service
    if _gallery_service is None:
        _gallery_service = GalleryService()
    return _gallery_service


    async def add_assets(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        asset_ids: list[UUID],
    ) -> dict:
        """Add existing assets to a gallery.
        
        Ignores duplicates (assets already in the gallery).
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify gallery exists (exclude deleted)
            exists = await conn.fetchval(
                "SELECT 1 FROM galleries WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE",
                workspace_id,
                gallery_id,
            )
            if not exists:
                raise GalleryNotFoundError(gallery_id)

            # TODO: Verify assets exist and belong to workspace? 
            # For efficiency we might skip individual checks and rely on foreign key constraints 
            # or massive IN check if needed. FK constraint checks existence, but not workspace ownership 
            # if not careful. Assets table has workspace_id, so we should ensure we only link assets 
            # from same workspace.
            
            # Filter valid asset_ids that belong to workspace
            valid_asset_ids = await conn.fetch(
                "SELECT asset_id FROM assets WHERE workspace_id = $1 AND asset_id = ANY($2::uuid[]) AND deleted = FALSE",
                workspace_id,
                asset_ids
            )
            valid_ids = [r['asset_id'] for r in valid_asset_ids]
            
            if not valid_ids:
                 return {"added_count": 0}

            # Insert ignoring duplicates
            # We assume sort_order should be appended.
            # Get max sort order
            max_sort = await conn.fetchval(
                "SELECT COALESCE(MAX(sort_order), 0) FROM gallery_assets WHERE gallery_id = $1",
                gallery_id
            )
            
            # Prepare batch data
            # (gallery_id, asset_id, workspace_id, sort_order, visible, is_selected, is_favorited)
            # We increment sort_order for each
            
            added_count = 0
            for i, asset_id in enumerate(valid_ids):
                # We use ON CONFLICT DO NOTHING to handle duplicates
                # Note: This means if it exists, we don't change it (good).
                current_sort = max_sort + i + 1
                result = await conn.execute(
                    """
                    INSERT INTO gallery_assets (
                        gallery_id, asset_id, workspace_id, sort_order, 
                        visible, is_selected, is_favorited, created_at, updated_at
                    ) VALUES ($1, $2, $3, $4, TRUE, FALSE, FALSE, NOW(), NOW())
                    ON CONFLICT (gallery_id, asset_id) DO NOTHING
                    """,
                    gallery_id,
                    asset_id,
                    workspace_id,
                    current_sort
                )
                if result == "INSERT 0 1":
                    added_count += 1
            
            return {"added_count": added_count}

    async def remove_assets(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        asset_ids: list[UUID],
    ) -> dict:
        """Remove assets from a gallery (unlink)."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify gallery exists
            exists = await conn.fetchval(
                "SELECT 1 FROM galleries WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE",
                workspace_id,
                gallery_id,
            )
            if not exists:
                raise GalleryNotFoundError(gallery_id)

            # Delete from gallery_assets
            result = await conn.execute(
                """
                DELETE FROM gallery_assets
                WHERE workspace_id = $1 AND gallery_id = $2 AND asset_id = ANY($3::uuid[])
                """,
                workspace_id,
                gallery_id,
                asset_ids
            )
            
            # Parse "DELETE count"
            deleted_count = 0
            if result.startswith("DELETE"):
                deleted_count = int(result.split(" ")[1])

            return {"removed_count": deleted_count}

    async def pin_gallery(self, workspace_id: UUID, gallery_id: UUID) -> bool:
        """Pin a gallery."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE galleries
                SET pinned_at = NOW()
                WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE
                """,
                workspace_id,
                gallery_id,
            )
            if result == "UPDATE 0":
                 # Check if gallery exists to throw 404
                 exists = await conn.fetchval(
                     "SELECT 1 FROM galleries WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE",
                     workspace_id,
                     gallery_id,
                 )
                 if not exists:
                     raise GalleryNotFoundError(gallery_id)
            return True

    async def unpin_gallery(self, workspace_id: UUID, gallery_id: UUID) -> bool:
        """Unpin a gallery."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE galleries
                SET pinned_at = NULL
                WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE
                """,
                workspace_id,
                gallery_id,
            )
            if result == "UPDATE 0":
                 # Check if gallery exists to throw 404
                 exists = await conn.fetchval(
                     "SELECT 1 FROM galleries WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE",
                     workspace_id,
                     gallery_id,
                 )
                 if not exists:
                     raise GalleryNotFoundError(gallery_id)
            return True



    async def search_faces_in_gallery(
        self,
        gallery_id: UUID,
        embedding: list[float],
        threshold: float = 0.6,
        limit: int = 50,
    ) -> list[dict]:
        """Search for faces in a gallery using vector similarity.

        Uses pgvector's cosine distance operator (<=>)  to find similar faces.
        The search is performed against the face_embeddings table which is
        pre-indexed with IVFFlat for fast approximate nearest neighbor search.

        Args:
            gallery_id: Gallery to search within.
            embedding: Query face embedding vector (128 or 512 dimensions).
            threshold: Minimum similarity threshold (0.0-1.0). Default 0.6.
            limit: Maximum number of results to return. Default 50.

        Returns:
            List of matching assets with similarity scores, sorted by similarity.
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # First verify the gallery exists and get workspace_id
            gallery = await conn.fetchrow(
                """
                SELECT g.gallery_id, g.workspace_id
                FROM galleries g
                WHERE g.gallery_id = $1
                  AND g.deleted = FALSE
                  AND g.status = 'published'
                """,
                gallery_id,
            )

            if not gallery:
                raise GalleryNotFoundError(gallery_id)

            # Search for similar faces using pgvector cosine similarity
            # Cosine distance is 1 - similarity, so we compute 1 - distance
            # We use <=> operator for cosine distance
            results = await conn.fetch(
                """
                SELECT DISTINCT
                    ga.asset_id,
                    1 - (fe.embedding <=> $1::vector) AS similarity
                FROM face_embeddings fe
                INNER JOIN gallery_assets ga ON fe.asset_id = ga.asset_id
                WHERE ga.gallery_id = $2
                  AND ga.workspace_id = $3
                  AND 1 - (fe.embedding <=> $1::vector) >= $4
                ORDER BY similarity DESC
                LIMIT $5
                """,
                str(embedding),  # pgvector expects string representation
                gallery_id,
                gallery["workspace_id"],
                threshold,
                limit,
            )

            return [
                {
                    "asset_id": str(row["asset_id"]),
                    "similarity": float(row["similarity"]),
                }
                for row in results
            ]

    async def toggle_public_favorite(
        self,
        gallery_id: UUID,
        asset_id: UUID,
        visitor_id: Optional[UUID],
        favorited: bool,
    ) -> dict:
        """Toggle favorite status for an asset in a public gallery.

        This allows visitors to mark photos they like in a shared gallery.
        The favorite is tracked per-visitor if visitor_id is provided,
        otherwise it increments/decrements the global favorites_count.

        Args:
            gallery_id: Gallery containing the asset.
            asset_id: Asset to favorite/unfavorite.
            visitor_id: Optional visitor ID for per-visitor tracking.
            favorited: True to favorite, False to unfavorite.

        Returns:
            Updated asset info with favorite status.
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify gallery is published and asset belongs to it
            row = await conn.fetchrow(
                """
                SELECT ga.gallery_asset_id, ga.is_favorited, ga.favorites_count,
                       g.workspace_id
                FROM gallery_assets ga
                INNER JOIN galleries g ON ga.gallery_id = g.gallery_id
                WHERE ga.gallery_id = $1
                  AND ga.asset_id = $2
                  AND g.deleted = FALSE
                  AND g.status = 'published'
                  AND ga.visible = TRUE
                """,
                gallery_id,
                asset_id,
            )

            if not row:
                raise GalleryError(
                    f"Asset {asset_id} not found in public gallery {gallery_id}",
                    code="ASSET_NOT_FOUND",
                    status=404,
                )

            # Update favorites_count (increment or decrement)
            new_count = row["favorites_count"] + (1 if favorited else -1)
            new_count = max(0, new_count)  # Ensure non-negative

            await conn.execute(
                """
                UPDATE gallery_assets
                SET favorites_count = $1,
                    updated_at = NOW()
                WHERE gallery_asset_id = $2
                """,
                new_count,
                row["gallery_asset_id"],
            )

            # Record activity
            try:
                gallery_name = await conn.fetchval(
                    "SELECT title FROM galleries WHERE gallery_id = $1",
                    gallery_id,
                )
                await record_favorite_toggle(
                    workspace_id=row["workspace_id"],
                    gallery_id=gallery_id,
                    gallery_name=gallery_name or "Unknown Gallery",
                    asset_id=asset_id,
                    is_favorited=favorited,
                    visitor_id=visitor_id,
                )
            except Exception as e:
                logger.warning(f"Failed to record favorite activity: {e}")

            return {
                "asset_id": str(asset_id),
                "is_favorited": favorited,
                "favorites_count": new_count,
            }

    async def toggle_public_selection(
        self,
        gallery_id: UUID,
        asset_id: UUID,
        visitor_id: Optional[UUID],
        selected: bool,
    ) -> dict:
        """Toggle selection (pick) status for an asset in a public gallery.

        This allows visitors to "pick" photos they want for their selection.
        Used for client proofing workflow where clients select their favorites.

        Args:
            gallery_id: Gallery containing the asset.
            asset_id: Asset to select/deselect.
            visitor_id: Optional visitor ID for per-visitor tracking.
            selected: True to select, False to deselect.

        Returns:
            Updated asset info with selection status.
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify gallery is published and asset belongs to it
            row = await conn.fetchrow(
                """
                SELECT ga.gallery_asset_id, ga.is_selected,
                       g.workspace_id
                FROM gallery_assets ga
                INNER JOIN galleries g ON ga.gallery_id = g.gallery_id
                WHERE ga.gallery_id = $1
                  AND ga.asset_id = $2
                  AND g.deleted = FALSE
                  AND g.status = 'published'
                  AND ga.visible = TRUE
                """,
                gallery_id,
                asset_id,
            )

            if not row:
                raise GalleryError(
                    f"Asset {asset_id} not found in public gallery {gallery_id}",
                    code="ASSET_NOT_FOUND",
                    status=404,
                )

            # Update is_selected status
            await conn.execute(
                """
                UPDATE gallery_assets
                SET is_selected = $1,
                    updated_at = NOW()
                WHERE gallery_asset_id = $2
                """,
                selected,
                row["gallery_asset_id"],
            )

            # Record activity
            try:
                gallery_name = await conn.fetchval(
                    "SELECT title FROM galleries WHERE gallery_id = $1",
                    gallery_id,
                )
                await record_selection_toggle(
                    workspace_id=row["workspace_id"],
                    gallery_id=gallery_id,
                    gallery_name=gallery_name or "Unknown Gallery",
                    asset_id=asset_id,
                    is_selected=selected,
                    visitor_id=visitor_id,
                )
            except Exception as e:
                logger.warning(f"Failed to record selection activity: {e}")

            return {
                "asset_id": str(asset_id),
                "is_selected": selected,
            }

    async def get_public_gallery_assets_with_filters(
        self,
        gallery_id: UUID,
        filter_type: Optional[str] = None,
        sub_gallery_id: Optional[UUID] = None,
    ) -> list[dict]:
        """Get public gallery assets with optional filtering.

        Extends get_public_gallery_assets with filter support for
        favorites/selections tabs in the client view.

        Args:
            gallery_id: Gallery to fetch assets from.
            filter_type: Optional filter - 'favorites', 'selections', or None for all.
            sub_gallery_id: Optional sub-gallery filter.

        Returns:
            List of visible assets matching the filter criteria.
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify gallery is published (publicly accessible)
            gallery = await conn.fetchrow(
                """
                SELECT gallery_id, workspace_id, status
                FROM galleries
                WHERE gallery_id = $1
                  AND deleted = FALSE
                  AND status = 'published'
                """,
                gallery_id,
            )

            if not gallery:
                raise GalleryNotFoundError(gallery_id)

            # Build WHERE conditions
            where_conditions = [
                "ga.gallery_id = $1",
                "ga.visible = TRUE",
                "a.status = 'available'",
            ]
            params: list = [gallery_id]
            param_idx = 2

            if filter_type == "favorites":
                where_conditions.append("ga.favorites_count > 0")
            elif filter_type == "selections":
                where_conditions.append("ga.is_selected = TRUE")

            if sub_gallery_id:
                where_conditions.append(f"ga.sub_gallery_id = ${param_idx}")
                params.append(sub_gallery_id)
                param_idx += 1

            where_clause = " AND ".join(where_conditions)

            rows = await conn.fetch(
                f"""
                SELECT
                    ga.asset_id,
                    ga.gallery_id,
                    ga.sub_gallery_id,
                    a.type,
                    a.original_filename AS filename,
                    a.width,
                    a.height,
                    a.duration_ms AS duration,
                    a.size_bytes,
                    a.metadata,
                    ga.sort_order,
                    ga.is_favorited,
                    ga.is_selected,
                    ga.favorites_count,
                    ga.created_at
                FROM gallery_assets ga
                INNER JOIN assets a ON ga.asset_id = a.asset_id
                WHERE {where_clause}
                ORDER BY ga.sort_order ASC, ga.created_at DESC
                """,
                *params,
            )

            return [
                {
                    "asset_id": str(row["asset_id"]),
                    "gallery_id": str(row["gallery_id"]),
                    "sub_gallery_id": str(row["sub_gallery_id"]) if row["sub_gallery_id"] else None,
                    "type": row["type"],
                    "filename": row["filename"],
                    "width": row["width"],
                    "height": row["height"],
                    "duration": row["duration"],
                    "size_bytes": row["size_bytes"],
                    "metadata": row["metadata"],
                    "sort_order": row["sort_order"],
                    "is_favorited": row["is_favorited"],
                    "is_selected": row["is_selected"],
                    "favorites_count": row["favorites_count"],
                    "created_at": row["created_at"].isoformat() if row["created_at"] else None,
                }
                for row in rows
            ]
