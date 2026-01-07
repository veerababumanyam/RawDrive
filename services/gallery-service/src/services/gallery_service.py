"""
Gallery Service - Core business logic for gallery operations.

Implements gallery CRUD with Redis caching for 50K concurrent users.
Uses read replicas for public endpoints to reduce load on primary DB.
"""

from __future__ import annotations

import json
from typing import Optional, List, Any
from uuid import UUID
from datetime import datetime, timezone

from src.database import fetch, fetchrow, fetchval, execute, get_connection
from src.cache.redis_client import (
    redis_client,
    cache_response,
    invalidate_gallery_cache,
    build_gallery_cache_key,
    build_public_gallery_cache_key,
    build_assets_cache_key,
)
from src.config import settings
from src.log_config import get_logger
from src.observability.metrics import get_metrics

logger = get_logger(__name__)
metrics = get_metrics()


# =============================================================================
# Exceptions
# =============================================================================


class GalleryError(Exception):
    """Base gallery error."""

    def __init__(self, message: str, code: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


class GalleryNotFoundError(GalleryError):
    """Gallery not found."""

    def __init__(self, gallery_id: str) -> None:
        super().__init__(
            f"Gallery {gallery_id} not found",
            "GALLERY_NOT_FOUND",
            404,
        )


class GalleryEmptyError(GalleryError):
    """Gallery is empty and cannot be published."""

    def __init__(self, gallery_id: str) -> None:
        super().__init__(
            f"Gallery {gallery_id} must have at least one photo to publish",
            "GALLERY_EMPTY",
            400,
        )


class SubGalleryNotFoundError(GalleryError):
    """Sub-gallery not found."""

    def __init__(self, sub_gallery_id: str) -> None:
        super().__init__(
            f"Sub-gallery {sub_gallery_id} not found",
            "SUB_GALLERY_NOT_FOUND",
            404,
        )


# =============================================================================
# Helper Functions
# =============================================================================


def migrate_primary_color_to_gradient(primary_color: str) -> dict:
    """Convert legacy primary_color to gradient config."""
    return {
        "type": "linear",
        "preset_id": None,
        "direction": 135,
        "colors": [
            {"color": primary_color, "position": 0},
            {"color": primary_color, "position": 100},
        ]
    }


def row_to_gallery_dict(row: Any, sub_galleries: List = None, stats: Any = None) -> dict:
    """Convert database row to gallery response dict."""
    return {
        "gallery_id": str(row["gallery_id"]),
        "workspace_id": str(row["workspace_id"]),
        "title": row["title"],
        "description": row["description"],
        "client_name": row["client_name"],
        "client_id": str(row["client_id"]) if row["client_id"] else None,
        "shoot_date": row["shoot_date"].isoformat() if row["shoot_date"] else None,
        "status": row["status"],
        "branding_profile_id": str(row["branding_profile_id"]) if row.get("branding_profile_id") else None,
        "portal_language": row.get("portal_language"),
        "layout_style": row.get("layout_style"),
        "theme": row.get("theme"),
        "download_policy": row.get("download_policy"),
        "exif_visible": row.get("exif_visible"),
        "password_protected": row.get("password_protected", False),
        "pin_protected": row.get("pin_protected", False),
        "email_registration_required": row.get("email_registration_required", False),
        "expires_at": row["expires_at"].isoformat() if row.get("expires_at") else None,
        "published_at": row["published_at"].isoformat() if row.get("published_at") else None,
        "cover_asset_id": str(row["cover_asset_id"]) if row.get("cover_asset_id") else None,
        "primary_color": row.get("primary_color"),
        "gradient_config": row.get("gradient_config") if row.get("gradient_config") else (
            migrate_primary_color_to_gradient(row["primary_color"]) if row.get("primary_color") else None
        ),
        "font_family": row.get("font_family"),
        "custom_domain": row.get("custom_domain"),
        "custom_links": row.get("custom_links") or [],
        "created_by_user_id": str(row["created_by_user_id"]),
        "created_at": row["created_at"].isoformat(),
        "pinned_at": row["pinned_at"].isoformat() if row.get("pinned_at") else None,
        "is_pinned": row.get("pinned_at") is not None,
        "last_accessed_at": row["last_accessed_at"].isoformat() if row.get("last_accessed_at") else None,
        "sub_galleries": [
            {
                "sub_gallery_id": str(sg["sub_gallery_id"]),
                "name": sg["name"],
                "sort_order": sg["sort_order"],
                "visible": sg["visible"],
                "photo_count": sg["photo_count"],
                "cover_asset_id": str(sg["cover_asset_id"]) if sg["cover_asset_id"] else None,
            }
            for sg in (sub_galleries or [])
        ],
        "stats": {
            "total_photos": stats["total_photos"] if stats else 0,
            "total_videos": stats["total_videos"] if stats else 0,
            "total_items": stats["total_items"] if stats else 0,
            "favorites_count": stats["favorites_count"] if stats else 0,
            "selections_count": stats["selections_count"] if stats else 0,
        } if stats else {},
    }


# =============================================================================
# Gallery Service
# =============================================================================


class GalleryService:
    """Service for gallery operations with caching."""

    async def get_gallery(
        self,
        workspace_id: str,
        gallery_id: str,
        use_cache: bool = True,
    ) -> dict:
        """Get gallery details with caching."""
        cache_key = build_gallery_cache_key(gallery_id)

        # Try cache first
        if use_cache:
            cached = await redis_client.get_json(cache_key)
            if cached:
                metrics.cache_hit("gallery")
                return cached
            metrics.cache_miss("gallery")

        # Fetch from database
        with metrics.track_db_query("get_gallery"):
            async with get_connection() as conn:
                row = await conn.fetchrow(
                    """
                    SELECT
                        gallery_id, workspace_id, title, description, client_name, client_id, shoot_date,
                        status, branding_profile_id, portal_language, layout_style,
                        theme, download_policy, exif_visible,
                        password_hash IS NOT NULL as password_protected,
                        pin_hash IS NOT NULL as pin_protected,
                        email_registration_required, expires_at, custom_domain,
                        primary_color, gradient_config, font_family, custom_links,
                        cover_asset_id, created_by_user_id, published_at,
                        created_at, updated_at, deleted, pinned_at, last_accessed_at
                    FROM galleries
                    WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE
                    """,
                    UUID(workspace_id),
                    UUID(gallery_id),
                )

                if not row:
                    raise GalleryNotFoundError(gallery_id)

                # Update last_accessed_at
                await conn.execute(
                    "UPDATE galleries SET last_accessed_at = NOW() WHERE gallery_id = $1",
                    UUID(gallery_id),
                )

                # Get sub-galleries
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
                            AND a.status = 'available'
                        ) as photo_count
                    FROM sub_galleries
                    WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE
                    ORDER BY sort_order ASC
                    """,
                    UUID(workspace_id),
                    UUID(gallery_id),
                )

                # Get stats
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
                    WHERE ga.workspace_id = $1 AND ga.gallery_id = $2
                    AND ga.visible = TRUE AND assets.deleted = FALSE
                    """,
                    UUID(workspace_id),
                    UUID(gallery_id),
                )

        result = row_to_gallery_dict(row, sub_galleries, stats)

        # Cache result
        await redis_client.set_json(
            cache_key,
            result,
            settings.CACHE_TTL_GALLERY_METADATA
        )

        return result

    async def get_public_gallery(
        self,
        gallery_id: str,
        use_cache: bool = True,
    ) -> dict:
        """Get public gallery details (published only) with caching.

        Uses read replica for high-throughput public access.
        """
        cache_key = build_public_gallery_cache_key(gallery_id)

        # Try cache first
        if use_cache:
            cached = await redis_client.get_json(cache_key)
            if cached:
                metrics.cache_hit("gallery")
                metrics.gallery_viewed("public")
                return cached
            metrics.cache_miss("gallery")

        # Fetch from read replica
        with metrics.track_db_query("get_public_gallery", read_replica=True):
            async with get_connection(read_only=True) as conn:
                row = await conn.fetchrow(
                    """
                    SELECT
                        gallery_id, workspace_id, title, description, client_name, client_id, shoot_date,
                        status, branding_profile_id, portal_language, layout_style,
                        theme, download_policy, exif_visible,
                        password_hash IS NOT NULL as password_protected,
                        pin_hash IS NOT NULL as pin_protected,
                        email_registration_required, expires_at, custom_domain,
                        primary_color, gradient_config, font_family, custom_links,
                        cover_asset_id, created_by_user_id, published_at,
                        created_at, updated_at, deleted
                    FROM galleries
                    WHERE gallery_id = $1 AND deleted = FALSE AND status = 'published'
                    """,
                    UUID(gallery_id),
                )

                if not row:
                    raise GalleryNotFoundError(gallery_id)

                # Check expiration
                if row["expires_at"] and row["expires_at"] < datetime.now(timezone.utc):
                    raise GalleryNotFoundError(gallery_id)

                workspace_id = row["workspace_id"]

                # Get visible sub-galleries
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
                            AND a.status = 'available'
                        ) as photo_count
                    FROM sub_galleries
                    WHERE gallery_id = $1 AND deleted = FALSE AND visible = TRUE
                    ORDER BY sort_order ASC
                    """,
                    UUID(gallery_id),
                )

                # Get stats
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
                    UUID(gallery_id),
                )

        result = row_to_gallery_dict(row, sub_galleries, stats)

        # Cache result
        await redis_client.set_json(
            cache_key,
            result,
            settings.CACHE_TTL_GALLERY_METADATA
        )

        metrics.gallery_viewed("public")
        return result

    async def list_galleries(
        self,
        workspace_id: str,
        page: int = 1,
        limit: int = 20,
        sort: str = "created_at",
        status: Optional[str] = None,
        search: Optional[str] = None,
    ) -> dict:
        """List galleries for a workspace."""
        with metrics.track_db_query("list_galleries"):
            async with get_connection() as conn:
                offset = (page - 1) * limit

                # Build WHERE clause
                where_clauses = ["workspace_id = $1", "deleted = FALSE"]
                params = [UUID(workspace_id)]
                param_idx = 2

                if status:
                    where_clauses.append(f"status = ${param_idx}")
                    params.append(status)
                    param_idx += 1

                if search:
                    where_clauses.append(f"(title ILIKE ${param_idx} OR description ILIKE ${param_idx} OR client_name ILIKE ${param_idx})")
                    params.append(f"%{search}%")
                    param_idx += 1

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
                            AND a.status = 'available'
                        ) as photo_count
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
                    "cover_asset_id": str(g["cover_asset_id"]) if g["cover_asset_id"] else None,
                    "cover_image_url": None,
                }
                for g in galleries
            ],
            "meta": {
                "page": page,
                "limit": limit,
                "total": total,
                "total_pages": (total + limit - 1) // limit,
                "has_more": (offset + limit) < total,
            },
        }

    async def list_gallery_assets(
        self,
        workspace_id: str,
        gallery_id: str,
        page: int = 1,
        limit: int = 50,
        sub_gallery_id: Optional[str] = None,
        favorites_only: bool = False,
        selections_only: bool = False,
    ) -> dict:
        """List assets in a gallery with pagination."""
        with metrics.track_db_query("list_gallery_assets"):
            async with get_connection() as conn:
                # Verify gallery exists
                exists = await conn.fetchval(
                    "SELECT 1 FROM galleries WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE",
                    UUID(workspace_id),
                    UUID(gallery_id),
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
                params: list = [UUID(workspace_id), UUID(gallery_id)]
                param_idx = 3

                if sub_gallery_id is not None:
                    if sub_gallery_id == "":
                        where_conditions.append("ga.sub_gallery_id IS NULL")
                    else:
                        where_conditions.append(f"ga.sub_gallery_id = ${param_idx}")
                        params.append(UUID(sub_gallery_id))
                        param_idx += 1

                if favorites_only:
                    where_conditions.append("ga.is_favorited = TRUE")

                if selections_only:
                    where_conditions.append("ga.is_selected = TRUE")

                where_sql = " AND ".join(where_conditions)

                # Get total count
                total = await conn.fetchval(
                    f"""
                    SELECT COUNT(*)
                    FROM gallery_assets ga
                    INNER JOIN assets a ON ga.asset_id = a.asset_id
                    WHERE {where_sql}
                    """,
                    *params,
                )

                # Get assets
                params.extend([limit, offset])
                assets = await conn.fetch(
                    f"""
                    SELECT
                        ga.gallery_asset_id,
                        ga.asset_id,
                        ga.sort_order,
                        ga.visible,
                        ga.is_private,
                        ga.sub_gallery_id,
                        ga.is_favorited,
                        ga.is_selected,
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
                    LIMIT ${param_idx} OFFSET ${param_idx + 1}
                    """,
                    *params,
                )

        # Generate signed URLs for all assets
        from src.services.r2_service import get_r2_service
        r2_service = get_r2_service()

        # Build asset list for batch URL generation
        asset_list = [
            {
                "asset_id": str(row["asset_id"]),
                "filename": row["filename"] or "",
                "is_private": row["is_private"],
            }
            for row in assets
        ]

        # Generate all signed URLs in parallel (uses configured TTL: 15 minutes)
        # #region agent log
        import json
        import os
        try:
            debug_log_path = '/app/debug.log'
            log_entry = {
                "id": "log_entry",
                "timestamp": int(__import__('time').time() * 1000),
                "location": "gallery_service.py:list_gallery_assets",
                "message": "Before generating signed URLs",
                "data": {
                    "workspace_id": workspace_id,
                    "gallery_id": gallery_id,
                    "asset_count": len(asset_list),
                    "asset_ids": [a["asset_id"] for a in asset_list[:3]]
                },
                "sessionId": "debug-session",
                "runId": "run1",
                "hypothesisId": "C"
            }
            with open(debug_log_path, 'a', encoding='utf-8') as f:
                f.write(json.dumps(log_entry) + '\n')
                f.flush()
        except Exception:
            pass
        # #endregion
        signed_urls = await r2_service.generate_signed_urls_batch(
            workspace_id=workspace_id,
            assets=asset_list,
            gallery_id=gallery_id,
        )
        # #region agent log
        try:
            debug_log_path = '/app/debug.log'
            log_entry = {
                "id": "log_entry",
                "timestamp": int(__import__('time').time() * 1000),
                "location": "gallery_service.py:list_gallery_assets",
                "message": "After generating signed URLs",
                "data": {
                    "signed_urls_count": len(signed_urls),
                    "sample_urls": {
                        k: {
                            "thumbnail": bool(v.get("thumbnail")),
                            "preview": bool(v.get("preview")),
                            "original": bool(v.get("original"))
                        }
                        for k, v in list(signed_urls.items())[:3]
                    }
                },
                "sessionId": "debug-session",
                "runId": "run1",
                "hypothesisId": "C"
            }
            with open(debug_log_path, 'a', encoding='utf-8') as f:
                f.write(json.dumps(log_entry) + '\n')
                f.flush()
        except Exception:
            pass
        # #endregion

        return {
            "data": [
                {
                    "gallery_asset_id": str(row["gallery_asset_id"]),
                    "asset_id": str(row["asset_id"]),
                    "sort_order": row["sort_order"],
                    "visible": row["visible"],
                    "is_private": row["is_private"],
                    "sub_gallery_id": str(row["sub_gallery_id"]) if row["sub_gallery_id"] else None,
                    "is_favorited": row["is_favorited"],
                    "is_selected": row["is_selected"],
                    "favorites_count": 0,
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
                        # Add signed URLs from R2 service
                        "thumbnail_url": signed_urls.get(str(row["asset_id"]), {}).get("thumbnail"),
                        "preview_url": signed_urls.get(str(row["asset_id"]), {}).get("preview"),
                        "original_url": signed_urls.get(str(row["asset_id"]), {}).get("original"),
                    },
                }
                for row in assets
            ],
            "meta": {
                "page": page,
                "limit": limit,
                "total": total,
                "total_pages": (total + limit - 1) // limit,
                "has_more": (offset + limit) < total,
            },
        }


# =============================================================================
# Service Singleton
# =============================================================================

_gallery_service: Optional[GalleryService] = None


def get_gallery_service() -> GalleryService:
    """Get singleton gallery service instance."""
    global _gallery_service
    if _gallery_service is None:
        _gallery_service = GalleryService()
    return _gallery_service
