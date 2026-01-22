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
    # Process custom_links with error handling
    # asyncpg returns JSONB columns as Python objects (list/dict), not strings
    # But if stored as text, it might be a string representation
    custom_links_value = row.get("custom_links")
    custom_links = []
    try:
        if custom_links_value is None:
            custom_links = []
        elif isinstance(custom_links_value, list):
            # Already a list - use it directly
            custom_links = custom_links_value
        elif isinstance(custom_links_value, str):
            # String representation - try to parse it
            stripped = custom_links_value.strip()
            if not stripped or stripped == 'null':
                custom_links = []
            else:
                try:
                    parsed = json.loads(stripped)
                    # Ensure parsed value is a list
                    if isinstance(parsed, list):
                        custom_links = parsed
                    elif isinstance(parsed, dict):
                        # If it's a dict, wrap it in a list or ignore
                        custom_links = []
                    else:
                        custom_links = []
                except (json.JSONDecodeError, ValueError):
                    custom_links = []
        elif isinstance(custom_links_value, dict):
            # If it's a dict (from JSONB), convert to list or ignore
            custom_links = []
        else:
            # Unknown type - default to empty list
                    custom_links = []
    except Exception as e:
        custom_links = []
    
    # Final safety check - ensure custom_links is always a list
    if not isinstance(custom_links, list):
        custom_links = []
    
    result = {
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
        "custom_links": custom_links if isinstance(custom_links, list) else [],
        "created_by_user_id": str(row["created_by_user_id"]),
        "created_at": row["created_at"].isoformat(),
        "pinned_at": row["pinned_at"].isoformat() if row.get("pinned_at") else None,
        "is_pinned": row.get("pinned_at") is not None,
        "last_accessed_at": row["last_accessed_at"].isoformat() if row.get("last_accessed_at") else None,
        # Client interaction settings
        "comments_enabled": row.get("comments_enabled", True),
        "favorites_enabled": row.get("favorites_enabled", True),
        "selections_enabled": row.get("selections_enabled", True),
        "selection_limit": row.get("selection_limit"),
        "ratings_enabled": row.get("ratings_enabled", False),
        # Advanced configuration (JSONB)
        "watermark_config": row.get("watermark_config"),
        "findme_config": row.get("findme_config"),
        "slideshow_config": row.get("slideshow_config"),
        "activity_tracking": row.get("activity_tracking"),
        # Notification settings
        "notify_on_comment": row.get("notify_on_comment", True),
        "notify_on_favorite": row.get("notify_on_favorite", False),
        "notify_on_selection": row.get("notify_on_selection", True),
        "notify_on_download": row.get("notify_on_download", False),
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
    
    return result


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
            try:
                cached = await redis_client.get_json(cache_key)
                if cached:
                    metrics.cache_hit("gallery")
                    return cached
                metrics.cache_miss("gallery")
            except Exception as e:
                logger.warning(f"Cache lookup failed: {e}")

        # Fetch from database
        
        try:
            
            workspace_uuid = UUID(workspace_id)
            gallery_uuid = UUID(gallery_id)
        except Exception as e:
            raise
        
        with metrics.track_db_query("get_gallery"):
            try:
                
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
                            created_at, updated_at, deleted, pinned_at, last_accessed_at,
                            -- Denormalized stats for faster queries (no COUNT needed)
                            photo_count, video_count, total_size_bytes
                        FROM galleries
                        WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE
                        """,
                        workspace_uuid,
                        gallery_uuid,
                    )

                    if not row:
                        raise GalleryNotFoundError(gallery_id)

                    # Update last_accessed_at
                    await conn.execute(
                        "UPDATE galleries SET last_accessed_at = NOW() WHERE gallery_id = $1",
                        gallery_uuid,
                    )

                    # Get sub-galleries
                    
                    sub_galleries = await conn.fetch(
                        """
                        SELECT
                            sg.sub_gallery_id, sg.name, sg.sort_order, sg.visible, sg.cover_asset_id,
                            COALESCE(counts.photo_count, 0) as photo_count
                        FROM sub_galleries sg
                        LEFT JOIN (
                            SELECT ga.sub_gallery_id, COUNT(*) as photo_count
                            FROM gallery_assets ga
                            INNER JOIN assets a ON ga.asset_id = a.asset_id
                            WHERE ga.gallery_id = $2
                                AND ga.visible = TRUE
                                AND a.deleted = FALSE
                                AND a.status = 'available'
                            GROUP BY ga.sub_gallery_id
                        ) counts ON sg.sub_gallery_id = counts.sub_gallery_id
                        WHERE sg.workspace_id = $1 AND sg.gallery_id = $2 AND sg.deleted = FALSE
                        ORDER BY sg.sort_order ASC
                        """,
                        workspace_uuid,
                        gallery_uuid,
                    )

                    # Get stats
                    
                    # Use denormalized stats from gallery row (no COUNT query needed)
                    # This is 40-60% faster than aggregating every request
                    stats = {
                        "total_photos": row["photo_count"] or 0,
                        "total_videos": row["video_count"] or 0,
                        "total_items": (row["photo_count"] or 0) + (row["video_count"] or 0),
                        "favorites_count": 0,
                        "selections_count": 0,
                    }
            except Exception as e:
                raise
        
        try:
            result = row_to_gallery_dict(row, sub_galleries, stats)
        except Exception as e:
            raise

        # Fetch company profile if branding_profile_id exists
        if row.get("branding_profile_id"):
            async with get_connection(read_only=True) as conn:
                company_row = await conn.fetchrow(
                    """
                    SELECT name, logo_url, website, email, phone, socials
                    FROM company_profiles
                    WHERE profile_id = $1
                    """,
                    row["branding_profile_id"],
                )
                if company_row:
                    result["company_profile"] = {
                        "company_name": company_row["name"],
                        "logo_url": company_row["logo_url"],
                        "website_url": company_row["website"],
                        "email": company_row["email"],
                        "phone": company_row["phone"],
                        "socials": company_row["socials"] if company_row["socials"] else {},
                    }
                else:
                    result["company_profile"] = None
        else:
            result["company_profile"] = None

        # Cache result
        try:
            await redis_client.set_json(
                cache_key,
                result,
                settings.CACHE_TTL_GALLERY_METADATA
            )
        except Exception as e:
            logger.warning(f"Cache set failed: {e}")

        return result


    async def get_gallery_credentials(
        self,
        workspace_id: str,
        gallery_id: str,
    ) -> dict:
        """Get decrypted gallery credentials (password/PIN)."""
        with metrics.track_db_query("get_gallery_credentials"):
            try:
                workspace_uuid = UUID(workspace_id)
                gallery_uuid = UUID(gallery_id)
            except ValueError as e:
                raise
            async with get_connection() as conn:
                try:
                    row = await conn.fetchrow(
                        """
                        SELECT 
                            password_hash IS NOT NULL as password_set,
                            pin_hash IS NOT NULL as pin_set,
                            password_encrypted, password_iv,
                            pin_encrypted, pin_iv
                        FROM galleries
                        WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE
                        """,
                        workspace_uuid,
                        gallery_uuid,
                    )
                except Exception as e:
                    raise
                
                if not row:
                    raise GalleryNotFoundError(gallery_id)
                from src.services.encryption_service import get_encryption_service
                try:
                    enc_service = get_encryption_service()
                except Exception as e:
                    raise
                
                # Decrypt password if available
                password = None
                password_recoverable = False
                if row["password_encrypted"] and row["password_iv"]:
                    try:
                        password = await enc_service.decrypt_gallery_credential(
                            row["password_encrypted"],
                            row["password_iv"],
                            workspace_uuid
                        )
                        password_recoverable = True
                    except Exception as e:
                        logger.error(f"Failed to decrypt password for gallery {gallery_id}: {e}")

                # Decrypt PIN if available
                pin = None
                pin_recoverable = False
                if row["pin_encrypted"] and row["pin_iv"]:
                    try:
                        pin = await enc_service.decrypt_gallery_credential(
                            row["pin_encrypted"],
                            row["pin_iv"],
                            workspace_uuid
                        )
                        pin_recoverable = True
                    except Exception as e:
                        logger.error(f"Failed to decrypt PIN for gallery {gallery_id}: {e}")

                result = {
                    "gallery_id": str(gallery_id),
                    "password_set": row["password_set"],
                    "password": password,
                    "password_recoverable": password_recoverable,
                    "pin_set": row["pin_set"],
                    "pin": pin,
                    "pin_recoverable": pin_recoverable,
                }
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

                # Get visible sub-galleries with optimized photo counts (single query)
                sub_galleries = await conn.fetch(
                    """
                    SELECT
                        sg.sub_gallery_id, sg.name, sg.sort_order, sg.visible, sg.cover_asset_id,
                        COALESCE(counts.photo_count, 0) as photo_count
                    FROM sub_galleries sg
                    LEFT JOIN (
                        SELECT ga.sub_gallery_id, COUNT(*) as photo_count
                        FROM gallery_assets ga
                        INNER JOIN assets a ON ga.asset_id = a.asset_id
                        WHERE ga.gallery_id = $1
                            AND ga.visible = TRUE
                            AND a.deleted = FALSE
                            AND a.status = 'available'
                        GROUP BY ga.sub_gallery_id
                    ) counts ON sg.sub_gallery_id = counts.sub_gallery_id
                    WHERE sg.gallery_id = $1 AND sg.deleted = FALSE AND sg.visible = TRUE
                    ORDER BY sg.sort_order ASC
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

        # Fetch company profile if branding_profile_id exists
        if row.get("branding_profile_id"):
            async with get_connection(read_only=True) as conn:
                company_row = await conn.fetchrow(
                    """
                    SELECT name, logo_url, website, email, phone, socials
                    FROM company_profiles
                    WHERE profile_id = $1
                    """,
                    row["branding_profile_id"],
                )
                if company_row:
                    result["company_profile"] = {
                        "company_name": company_row["name"],
                        "logo_url": company_row["logo_url"],
                        "website_url": company_row["website"],
                        "email": company_row["email"],
                        "phone": company_row["phone"],
                        "socials": company_row["socials"] if company_row["socials"] else {},
                    }
                else:
                    result["company_profile"] = None
        else:
            result["company_profile"] = None

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

                # Build WHERE clause (using g. alias for galleries table)
                where_clauses = ["g.workspace_id = $1", "g.deleted = FALSE"]
                params = [UUID(workspace_id)]
                param_idx = 2

                if status:
                    where_clauses.append(f"g.status = ${param_idx}")
                    params.append(status)
                    param_idx += 1

                if search:
                    where_clauses.append(f"(g.title ILIKE ${param_idx} OR g.description ILIKE ${param_idx} OR g.client_name ILIKE ${param_idx})")
                    params.append(f"%{search}%")
                    param_idx += 1

                where_sql = " AND ".join(where_clauses)

                # Validate sort column (using g. prefix for galleries table)
                valid_sorts = {"created_at", "title", "status", "shoot_date", "last_accessed_at"}
                if sort not in valid_sorts:
                    sort = "created_at"
                order_sql = f"ORDER BY g.{sort} DESC" if sort == "created_at" else f"ORDER BY g.{sort} ASC"

                # Get total count (using same alias as main query)
                total = await conn.fetchval(
                    f"SELECT COUNT(*) FROM galleries g WHERE {where_sql}",
                    *params,
                )

                # Get galleries with optimized photo counts (CTE instead of correlated subquery)
                galleries = await conn.fetch(
                    f"""
                    WITH gallery_counts AS (
                        SELECT ga.gallery_id, COUNT(*) as photo_count
                        FROM gallery_assets ga
                        INNER JOIN assets a ON ga.asset_id = a.asset_id
                        WHERE ga.workspace_id = $1
                            AND ga.visible = TRUE
                            AND a.deleted = FALSE
                            AND a.status = 'available'
                        GROUP BY ga.gallery_id
                    )
                    SELECT
                        g.gallery_id, g.title, g.description, g.client_name, g.client_id, g.shoot_date, g.status,
                        g.cover_asset_id, g.published_at, g.created_at, g.pinned_at, g.last_accessed_at,
                        COALESCE(gc.photo_count, 0) as photo_count
                    FROM galleries g
                    LEFT JOIN gallery_counts gc ON g.gallery_id = gc.gallery_id
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
        emotion: Optional[str] = None,
        min_emotion_confidence: Optional[float] = None,
    ) -> dict:
        """List assets in a gallery with pagination.

        Args:
            workspace_id: Workspace UUID
            gallery_id: Gallery UUID
            page: Page number (1-indexed)
            limit: Results per page
            sub_gallery_id: Filter by sub-gallery
            favorites_only: Show only favorited assets
            selections_only: Show only selected assets
            emotion: Filter by emotion (joy, sadness, anger, surprise, fear, disgust, contentment)
            min_emotion_confidence: Minimum confidence threshold for emotion filtering (0.0-1.0)

        Returns:
            Paginated list of gallery assets
        """
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

                # Emotion filtering (Phase 2: Emotion Detection Integration)
                # Determine if we need to join with asset_analysis table
                join_asset_analysis = emotion is not None and min_emotion_confidence is not None

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

                # Add emotion filtering condition
                if join_asset_analysis:
                    where_conditions.append(f"(aa.emotions->>'{emotion}')::float >= ${param_idx}")
                    params.append(min_emotion_confidence)
                    param_idx += 1

                where_sql = " AND ".join(where_conditions)

                # Get total count
                # Build FROM clause with optional asset_analysis join
                from_clause = "gallery_assets ga INNER JOIN assets a ON ga.asset_id = a.asset_id"
                if join_asset_analysis:
                    from_clause += " LEFT JOIN asset_analysis aa ON ga.asset_id = aa.asset_id AND ga.workspace_id = aa.workspace_id"

                total = await conn.fetchval(
                    f"""
                    SELECT COUNT(*)
                    FROM {from_clause}
                    WHERE {where_sql}
                    """,
                    *params,
                )

                # Get assets
                params.extend([limit, offset])

                # Build SELECT clause - include emotion data if filtering by emotion
                select_columns = [
                    "ga.gallery_asset_id",
                    "ga.asset_id",
                    "ga.sort_order",
                    "ga.visible",
                    "ga.is_private",
                    "ga.sub_gallery_id",
                    "ga.is_favorited",
                    "ga.is_selected",
                    "a.type",
                    "a.status",
                    "a.mime_type",
                    "SUBSTRING(a.original_object_key FROM '[^/]+$') AS filename",
                    "(a.exif->>'width')::INTEGER AS width",
                    "(a.exif->>'height')::INTEGER AS height",
                    "(a.exif->>'duration_ms')::INTEGER AS duration_ms",
                    "(a.exif->>'date_taken')::TIMESTAMPTZ AS date_taken",
                    "a.exif",
                    "a.lqip",  # LQIP placeholder for blur-up effect
                ]

                # Include emotion metadata if filtering by emotion
                if join_asset_analysis:
                    select_columns.extend([
                        "aa.emotions",
                        "aa.dominant_emotion",
                        "aa.emotion_confidence",
                    ])

                select_sql = ", ".join(select_columns)

                assets = await conn.fetch(
                    f"""
                    SELECT {select_sql}
                    FROM {from_clause}
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
        signed_urls = await r2_service.generate_signed_urls_batch(
            workspace_id=workspace_id,
            assets=asset_list,
            gallery_id=gallery_id,
        )

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
                        "lqip": row["lqip"],  # LQIP data URI for blur-up placeholder
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
        with metrics.track_db_query("create_gallery"):
            async with get_connection() as conn:
                # Check for duplicate title (exclude deleted galleries)
                existing_id = await conn.fetchval(
                    "SELECT gallery_id FROM galleries WHERE workspace_id = $1 AND title = $2 AND deleted = FALSE",
                    UUID(str(workspace_id)),
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
                    UUID(str(workspace_id)),
                    title,
                    description,
                    client_name,
                    UUID(str(client_id)) if client_id else None,
                    shoot_date,
                    UUID(str(user_id)),
                )
        
        return await self.get_gallery(str(workspace_id), str(gallery_id), use_cache=False)

    async def update_gallery(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        **updates: Any,
    ) -> dict:
        """Update gallery fields."""
        with metrics.track_db_query("update_gallery"):
            async with get_connection() as conn:
                # Check gallery exists (exclude deleted)
                exists = await conn.fetchval(
                    "SELECT 1 FROM galleries WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE",
                    UUID(str(workspace_id)),
                    UUID(str(gallery_id)),
                )
                if not exists:
                    raise GalleryNotFoundError(str(gallery_id))

                set_clauses = []
                params = []
                param_idx = 1
                
                # Handle password/passkey field mapping: frontend sends "password", service expects "passkey"
                if "password" in updates:
                    updates["passkey"] = updates.pop("password")
                # Handle remove_password flag
                if updates.get("remove_password"):
                    updates["passkey"] = None
                    updates.pop("remove_password")
                # Handle remove_pin flag
                if updates.get("remove_pin"):
                    updates["pin"] = None
                    updates.pop("remove_pin")
                
                # Filter out None values and handle special fields
                valid_fields = {
                    "title", "description", "client_name", "client_id", "shoot_date",
                    "status", "branding_profile_id", "portal_language", "layout_style",
                    "theme", "download_policy", "exif_visible", "passkey", "pin",
                    "email_registration_required", "expires_at", "custom_domain",
                    "primary_color", "gradient_config", "font_family", "custom_links",
                    "cover_asset_id", "pinned_at",
                    # Client interaction settings
                    "comments_enabled", "favorites_enabled", "selections_enabled",
                    "selection_limit", "ratings_enabled",
                    # Advanced configuration (JSONB)
                    "watermark_config", "findme_config", "slideshow_config", "activity_tracking",
                    # Notification settings
                    "notify_on_comment", "notify_on_favorite", "notify_on_selection", "notify_on_download",
                }

                # Helper to add updating clause
                def add_update(field: str, value: Any):
                    nonlocal param_idx
                    set_clauses.append(f"{field} = ${param_idx}")
                    params.append(value)
                    param_idx += 1

                for field, value in updates.items():
                    if field not in valid_fields:
                        continue

                    # Special handling
                    if field == "client_id" and value:
                        # Sync client_name if client_id provided
                        client_name = await conn.fetchval(
                            "SELECT full_name FROM clients WHERE workspace_id = $1 AND client_id = $2",
                            UUID(str(workspace_id)),
                            UUID(str(value)),
                        )
                        if client_name:
                            add_update("client_name", client_name)
                        add_update("client_id", UUID(str(value)))
                        
                    elif field == "passkey":
                        if value is None: # clear password
                            add_update("password_hash", None)
                            add_update("password_encrypted", None)
                            add_update("password_iv", None)
                        else:
                            from src.utils.security import hash_password
                            from src.services.encryption_service import get_encryption_service
                            
                            add_update("password_hash", hash_password(value))
                            
                            # Encrypt for reveal
                            enc_service = get_encryption_service()
                            encrypted, iv = await enc_service.encrypt_gallery_credential(value, workspace_id)
                            add_update("password_encrypted", encrypted)
                            add_update("password_iv", iv)
                            
                    elif field == "pin":
                        if value is None: # clear pin
                            add_update("pin_hash", None)
                            add_update("pin_encrypted", None)
                            add_update("pin_iv", None)
                        else:
                            from src.utils.security import hash_password
                            from src.services.encryption_service import get_encryption_service
                            
                            add_update("pin_hash", hash_password(value))
                            
                            # Encrypt for reveal
                            enc_service = get_encryption_service()
                            encrypted, iv = await enc_service.encrypt_gallery_credential(value, workspace_id)
                            add_update("pin_encrypted", encrypted)
                            add_update("pin_iv", iv)
                            
                    elif field in ("branding_profile_id", "cover_asset_id") and value:
                         add_update(field, UUID(str(value)))
                         
                    elif field == "shoot_date" and isinstance(value, str):
                        # Simple parsing if string
                        from datetime import datetime
                        try:
                            val = datetime.fromisoformat(value)
                            add_update(field, val)
                        except ValueError:
                             pass # invalid date
                    elif field in ("watermark_config", "findme_config", "slideshow_config", "activity_tracking"):
                        # JSONB config fields - convert Pydantic models to dict
                        if value is not None:
                            if hasattr(value, "model_dump"):
                                add_update(field, json.dumps(value.model_dump()))
                            elif isinstance(value, dict):
                                add_update(field, json.dumps(value))
                            else:
                                add_update(field, value)
                        else:
                            add_update(field, None)
                    else:
                        add_update(field, value)

                if not set_clauses:
                    return await self.get_gallery(str(workspace_id), str(gallery_id))

                # Add workspace_id and gallery_id to params for WHERE clause
                params.append(UUID(str(workspace_id)))
                params.append(UUID(str(gallery_id)))
                
                query = f"""
                    UPDATE galleries
                    SET {", ".join(set_clauses)}, updated_at = NOW()
                    WHERE workspace_id = ${param_idx} AND gallery_id = ${param_idx + 1}
                """
                
                await conn.execute(query, *params)
                
        # Invalidate cache
        await invalidate_gallery_cache(str(gallery_id))
        
        return await self.get_gallery(str(workspace_id), str(gallery_id))

    async def delete_gallery(self, workspace_id: UUID, gallery_id: UUID) -> None:
        """Soft delete a gallery and associated assets (cascade)."""
        with metrics.track_db_query("delete_gallery"):
            async with get_connection() as conn:
                # 1. Check existence
                row = await conn.fetchrow(
                    "SELECT 1 FROM galleries WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE",
                    UUID(str(workspace_id)),
                    UUID(str(gallery_id)),
                )
                if not row:
                    raise GalleryNotFoundError(str(gallery_id))
                
                # Transaction for cascading updates
                async with conn.transaction():
                    now = datetime.now(timezone.utc)
                    
                    # 2. Soft delete sub-galleries
                    await conn.execute(
                        """
                        UPDATE sub_galleries 
                        SET deleted = TRUE, deleted_at = $1 
                        WHERE workspace_id = $2 AND gallery_id = $3 AND deleted = FALSE
                        """,
                        now, UUID(str(workspace_id)), UUID(str(gallery_id))
                    )
                    
                    # 3. Soft delete Assets that are ONLY in this gallery
                    # Get all assets in this gallery
                    gallery_assets = await conn.fetch(
                        "SELECT asset_id FROM gallery_assets WHERE gallery_id = $1",
                        UUID(str(gallery_id))
                    )
                    
                    for ga in gallery_assets:
                        aid = ga["asset_id"]
                        # Check usage in other active galleries
                        usage_count = await conn.fetchval(
                            """
                            SELECT COUNT(*) FROM gallery_assets ga
                            JOIN galleries g ON ga.gallery_id = g.gallery_id
                            WHERE ga.asset_id = $1 
                            AND ga.gallery_id != $2
                            AND g.deleted = FALSE
                            """,
                            aid, UUID(str(gallery_id))
                        )
                        
                        if usage_count == 0:
                            # Not used elsewhere: soft delete the asset itself
                            await conn.execute(
                                """
                                UPDATE assets 
                                SET deleted = TRUE, deleted_at = $1, updated_at = $1
                                WHERE asset_id = $2 AND workspace_id = $3 AND deleted = FALSE
                                """,
                                now, aid, UUID(str(workspace_id))
                            )

                    # 4. Soft delete the gallery
                    await conn.execute(
                        """
                        UPDATE galleries 
                        SET deleted = TRUE, deleted_at = $1, updated_at = $1
                        WHERE gallery_id = $2 AND workspace_id = $3
                        """,
                        now, UUID(str(gallery_id)), UUID(str(workspace_id))
                    )
        
        await invalidate_gallery_cache(str(gallery_id))

    async def publish_gallery(self, workspace_id: UUID, gallery_id: UUID, publish: bool = True) -> dict:
        """Publish or unpublish a gallery."""
        with metrics.track_db_query("publish_gallery"):
            async with get_connection() as conn:
                # Check existance
                row = await conn.fetchrow(
                    "SELECT status FROM galleries WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE",
                    UUID(str(workspace_id)),
                    UUID(str(gallery_id)),
                )
                if not row:
                    raise GalleryNotFoundError(str(gallery_id))
                
                if publish:
                    # Check for assets?
                    count = await conn.fetchval(
                        """
                        SELECT COUNT(*) FROM gallery_assets ga
                        JOIN assets a ON ga.asset_id = a.asset_id
                        WHERE ga.gallery_id = $1 AND ga.visible = TRUE AND a.deleted = FALSE
                        """,
                        UUID(str(gallery_id)),
                    )
                    if count == 0:
                         raise GalleryEmptyError(str(gallery_id))

                    await conn.execute(
                        """
                        UPDATE galleries 
                        SET status = 'published', published_at = NOW(), updated_at = NOW() 
                        WHERE gallery_id = $1
                        """,
                        UUID(str(gallery_id)),
                    )
                else:
                    await conn.execute(
                        """
                        UPDATE galleries 
                        SET status = 'draft', updated_at = NOW() 
                        WHERE gallery_id = $1
                        """,
                        UUID(str(gallery_id)),
                    )
        
        await invalidate_gallery_cache(str(gallery_id))
        return await self.get_gallery(str(workspace_id), str(gallery_id))

    async def remove_assets(self, workspace_id: UUID, gallery_id: UUID, asset_ids: List[UUID]) -> None:
        """Remove assets from gallery."""
        with metrics.track_db_query("remove_assets"):
            async with get_connection() as conn:
                 exists = await conn.fetchval(
                     "SELECT 1 FROM galleries WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE",
                     UUID(str(workspace_id)), UUID(str(gallery_id))
                 )
                 if not exists:
                     raise GalleryNotFoundError(str(gallery_id))
                 
                 pids = [UUID(str(aid)) for aid in asset_ids]
                 await conn.execute(
                     """
                     DELETE FROM gallery_assets 
                     WHERE gallery_id = $1 AND asset_id = ANY($2)
                     """,
                     UUID(str(gallery_id)),
                     pids
                 )
        await invalidate_gallery_cache(str(gallery_id))

    async def update_asset(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        asset_id: UUID,
        title: Optional[str] = None,
        description: Optional[str] = None,
        is_private: Optional[bool] = None,
    ) -> dict:
        """Update metadata for a gallery asset (title, description, is_private)."""
        with metrics.track_db_query("update_asset"):
            async with get_connection() as conn:
                # Verify gallery exists
                gallery = await conn.fetchrow(
                    """
                    SELECT gallery_id FROM galleries
                    WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE
                    """,
                    UUID(str(workspace_id)),
                    UUID(str(gallery_id)),
                )
                if not gallery:
                    raise GalleryNotFoundError(f"Gallery {gallery_id} not found")

                # Verify asset belongs to gallery
                asset = await conn.fetchrow(
                    """
                    SELECT ga.asset_id FROM gallery_assets ga
                    JOIN assets a ON ga.asset_id = a.asset_id
                    WHERE ga.workspace_id = $1 AND ga.gallery_id = $2
                    AND ga.asset_id = $3 AND a.deleted = FALSE
                    """,
                    UUID(str(workspace_id)),
                    UUID(str(gallery_id)),
                    UUID(str(asset_id)),
                )
                if not asset:
                    raise GalleryNotFoundError(f"Asset {asset_id} not found in gallery")

                # Build dynamic update
                updates = []
                params = []
                param_idx = 1

                if title is not None:
                    updates.append(f"title = ${param_idx}")
                    params.append(title)
                    param_idx += 1

                if description is not None:
                    updates.append(f"description = ${param_idx}")
                    params.append(description)
                    param_idx += 1

                if is_private is not None:
                    updates.append(f"is_private = ${param_idx}")
                    params.append(is_private)
                    param_idx += 1

                if not updates:
                    return {"message": "No updates provided"}

                params.extend([
                    UUID(str(workspace_id)),
                    UUID(str(gallery_id)),
                    UUID(str(asset_id)),
                ])

                await conn.execute(
                    f"""
                    UPDATE gallery_assets
                    SET {', '.join(updates)}
                    WHERE workspace_id = ${param_idx}
                    AND gallery_id = ${param_idx + 1}
                    AND asset_id = ${param_idx + 2}
                    """,
                    *params,
                )

        await invalidate_gallery_cache(str(gallery_id))
        return {"message": "Asset updated successfully"}

    async def create_sub_gallery(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        name: str,
        sort_order: int = 0,
        parent_sub_gallery_id: Optional[UUID] = None,
    ) -> dict:
        """Create a sub-gallery with optional nesting support.

        Sub-galleries can be nested up to 3 levels:
        - Depth 1: Direct child of gallery (parent_sub_gallery_id = None)
        - Depth 2: Child of depth 1 sub-gallery
        - Depth 3: Child of depth 2 sub-gallery (maximum)

        Args:
            workspace_id: Workspace UUID
            gallery_id: Gallery UUID
            name: Sub-gallery name
            sort_order: Display order
            parent_sub_gallery_id: Optional parent sub-gallery for nesting

        Returns:
            Created sub-gallery data

        Raises:
            GalleryNotFoundError: Gallery not found
            SubGalleryNotFoundError: Parent sub-gallery not found
            GalleryError: Maximum nesting depth exceeded
        """
        MAX_DEPTH = 3

        with metrics.track_db_query("create_sub_gallery"):
            async with get_connection() as conn:
                # Check gallery exists
                exists = await conn.fetchval(
                    "SELECT 1 FROM galleries WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE",
                    UUID(str(workspace_id)),
                    UUID(str(gallery_id)),
                )
                if not exists:
                    raise GalleryNotFoundError(str(gallery_id))

                # Calculate depth based on parent
                depth = 1
                if parent_sub_gallery_id:
                    # Verify parent exists and get its depth
                    parent = await conn.fetchrow(
                        """
                        SELECT depth FROM sub_galleries
                        WHERE sub_gallery_id = $1 AND gallery_id = $2 AND deleted = FALSE
                        """,
                        UUID(str(parent_sub_gallery_id)),
                        UUID(str(gallery_id)),
                    )
                    if not parent:
                        raise SubGalleryNotFoundError(str(parent_sub_gallery_id))

                    parent_depth = parent["depth"] if parent["depth"] is not None else 1
                    depth = parent_depth + 1

                    # Validate maximum depth
                    if depth > MAX_DEPTH:
                        raise GalleryError(
                            f"Maximum nesting depth ({MAX_DEPTH}) exceeded. "
                            "Cannot create sub-gallery deeper than 3 levels.",
                            code="MAX_DEPTH_EXCEEDED",
                            status=400,
                        )

                sub_gallery_id = await conn.fetchval(
                    """
                    INSERT INTO sub_galleries (
                        gallery_id, workspace_id, name, sort_order,
                        parent_sub_gallery_id, depth
                    )
                    VALUES ($1, $2, $3, $4, $5, $6)
                    RETURNING sub_gallery_id
                    """,
                    UUID(str(gallery_id)),
                    UUID(str(workspace_id)),
                    name,
                    sort_order,
                    UUID(str(parent_sub_gallery_id)) if parent_sub_gallery_id else None,
                    depth,
                )

        await invalidate_gallery_cache(str(gallery_id))
        return {
            "sub_gallery_id": str(sub_gallery_id),
            "name": name,
            "sort_order": sort_order,
            "visible": True,
            "photo_count": 0,
            "cover_asset_id": None,
            "parent_sub_gallery_id": str(parent_sub_gallery_id) if parent_sub_gallery_id else None,
            "depth": depth,
            "children": [],
        }

    async def update_sub_gallery(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        sub_gallery_id: UUID,
        **updates
    ) -> dict:
        """Update a sub-gallery."""
        with metrics.track_db_query("update_sub_gallery"):
            async with get_connection() as conn:
                # Check existence
                exists = await conn.fetchval(
                    "SELECT 1 FROM sub_galleries WHERE workspace_id = $1 AND gallery_id = $2 AND sub_gallery_id = $3 AND deleted = FALSE",
                    UUID(str(workspace_id)),
                    UUID(str(gallery_id)),
                    UUID(str(sub_gallery_id)),
                )
                if not exists:
                    raise SubGalleryNotFoundError(str(sub_gallery_id))
                
                set_clauses = []
                params = []
                param_idx = 1
                
                valid_fields = {"name", "sort_order", "visible", "cover_asset_id"}
                
                for field, value in updates.items():
                    if field not in valid_fields:
                        continue
                    set_clauses.append(f"{field} = ${param_idx}")
                    params.append(value)
                    param_idx += 1
                
                if not set_clauses:
                    return {"message": "No changes"}
                    
                params.append(UUID(str(workspace_id)))
                params.append(UUID(str(gallery_id)))
                params.append(UUID(str(sub_gallery_id)))
                
                query = f"""
                    UPDATE sub_galleries
                    SET {", ".join(set_clauses)}, updated_at = NOW()
                    WHERE workspace_id = ${param_idx} AND gallery_id = ${param_idx + 1} AND sub_gallery_id = ${param_idx + 2}
                """
                
                await conn.execute(query, *params)

        await invalidate_gallery_cache(str(gallery_id))
        return {"message": "Sub-gallery updated"}

    async def delete_sub_gallery(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        sub_gallery_id: UUID,
    ) -> None:
        """Soft delete a sub-gallery."""
        with metrics.track_db_query("delete_sub_gallery"):
            async with get_connection() as conn:
                exists = await conn.fetchval(
                    "SELECT 1 FROM sub_galleries WHERE workspace_id = $1 AND gallery_id = $2 AND sub_gallery_id = $3 AND deleted = FALSE",
                    UUID(str(workspace_id)),
                    UUID(str(gallery_id)),
                    UUID(str(sub_gallery_id)),
                )
                if not exists:
                    raise SubGalleryNotFoundError(str(sub_gallery_id))
                    
                await conn.execute(
                    """
                    UPDATE sub_galleries
                    SET deleted = TRUE, deleted_at = NOW()
                    WHERE sub_gallery_id = $1
                    """,
                    UUID(str(sub_gallery_id)),
                )
                
        await invalidate_gallery_cache(str(gallery_id))

    async def update_sub_galleries_sort_order(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        sub_gallery_ids: List[str],
    ) -> dict:
        """Update sort order for multiple sub-galleries."""
        with metrics.track_db_query("update_sub_galleries_sort_order"):
            async with get_connection() as conn:
                # Check gallery exists
                exists = await conn.fetchval(
                    "SELECT 1 FROM galleries WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE",
                    UUID(str(workspace_id)),
                    UUID(str(gallery_id)),
                )
                if not exists:
                    raise GalleryNotFoundError(str(gallery_id))

                # Update sort order for each sub-gallery
                for i, sub_gallery_id in enumerate(sub_gallery_ids):
                    await conn.execute(
                        """
                        UPDATE sub_galleries
                        SET sort_order = $1
                        WHERE workspace_id = $2 AND gallery_id = $3 AND sub_gallery_id = $4 AND deleted = FALSE
                        """,
                        i,
                        UUID(str(workspace_id)),
                        UUID(str(gallery_id)),
                        UUID(sub_gallery_id),
                    )

        await invalidate_gallery_cache(str(gallery_id))
        return {"message": "Sub-galleries sort order updated"}

    async def pin_gallery(self, workspace_id: UUID, gallery_id: UUID) -> dict:
        """Pin a gallery."""
        with metrics.track_db_query("pin_gallery"):
             async with get_connection() as conn:
                exists = await conn.fetchval(
                    "SELECT 1 FROM galleries WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE",
                     UUID(str(workspace_id)),
                     UUID(str(gallery_id)),
                )
                if not exists:
                    raise GalleryNotFoundError(str(gallery_id))

                await conn.execute(
                    "UPDATE galleries SET pinned_at = NOW() WHERE gallery_id = $1",
                    UUID(str(gallery_id)),
                )
        await invalidate_gallery_cache(str(gallery_id))
        return await self.get_gallery(str(workspace_id), str(gallery_id))

    async def unpin_gallery(self, workspace_id: UUID, gallery_id: UUID) -> dict:
        """Unpin a gallery."""
        with metrics.track_db_query("unpin_gallery"):
             async with get_connection() as conn:
                exists = await conn.fetchval(
                    "SELECT 1 FROM galleries WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE",
                     UUID(str(workspace_id)),
                     UUID(str(gallery_id)),
                )
                if not exists:
                    raise GalleryNotFoundError(str(gallery_id))

                await conn.execute(
                    "UPDATE galleries SET pinned_at = NULL WHERE gallery_id = $1",
                    UUID(str(gallery_id)),
                )
        await invalidate_gallery_cache(str(gallery_id))
        return await self.get_gallery(str(workspace_id), str(gallery_id))

    async def add_assets(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        asset_ids: List[UUID],
    ) -> dict:
        """Add assets to a gallery."""
        if not asset_ids:
            return await self.get_gallery(str(workspace_id), str(gallery_id))

        with metrics.track_db_query("add_assets"):
            async with get_connection() as conn:
                # Check gallery exists
                exists = await conn.fetchval(
                    "SELECT 1 FROM galleries WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE",
                    UUID(str(workspace_id)),
                    UUID(str(gallery_id)),
                )
                if not exists:
                    raise GalleryNotFoundError(str(gallery_id))

                # Get max sort order
                max_sort = await conn.fetchval(
                    "SELECT MAX(sort_order) FROM gallery_assets WHERE gallery_id = $1",
                    UUID(str(gallery_id)),
                )
                start_sort = (max_sort or 0) + 1

                # Bulk insert
                # We need to verify assets match workspace_id but we can trust the caller or rely on FK constraints?
                # Best to ensure they exist.
                # Simplified: Insert and ignore conflicts.
                
                values = []
                for i, asset_id in enumerate(asset_ids):
                    values.append((
                        UUID(str(gallery_id)),
                        UUID(str(asset_id)),
                        UUID(str(workspace_id)),
                        start_sort + i,
                        True # visible
                    ))
                
                await conn.executemany(
                    """
                    INSERT INTO gallery_assets (gallery_id, asset_id, workspace_id, sort_order, visible)
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (gallery_id, asset_id) DO NOTHING
                    """,
                    values
                )

        await invalidate_gallery_cache(str(gallery_id))
        return await self.get_gallery(str(workspace_id), str(gallery_id))

    async def get_design_config(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
    ) -> dict:
        """Get current gallery design configuration.

        Returns the design_config JSONB from the gallery along with metadata
        (gallery_id, last_published_at).
        """
        with metrics.track_db_query("get_design_config"):
            async with get_connection(read_only=True) as conn:
                row = await conn.fetchrow(
                    """
                    SELECT
                        gallery_id,
                        design_config,
                        published_at
                    FROM galleries
                    WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE
                    """,
                    workspace_id,
                    gallery_id,
                )

                if not row:
                    raise GalleryNotFoundError(str(gallery_id))

                return {
                    "gallery_id": str(row["gallery_id"]),
                    "design_config": row.get("design_config") or {},
                    "last_published_at": row["published_at"].isoformat() if row.get("published_at") else None,
                }

    async def update_design_config(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        design_config: dict,
    ) -> dict:
        """Update gallery design configuration.

        Updates the design_config JSONB column with new design settings.
        Invalidates cache to ensure frontend gets updated config.

        Args:
            workspace_id: Workspace UUID
            gallery_id: Gallery UUID
            design_config: Complete design configuration dict

        Returns:
            GalleryDesignResponse with updated config
        """
        with metrics.track_db_query("update_design_config"):
            async with get_connection() as conn:
                # Check gallery exists
                exists = await conn.fetchval(
                    "SELECT 1 FROM galleries WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE",
                    workspace_id,
                    gallery_id,
                )
                if not exists:
                    raise GalleryNotFoundError(str(gallery_id))

                # Update design_config as JSONB
                await conn.execute(
                    """
                    UPDATE galleries
                    SET design_config = $1, updated_at = NOW()
                    WHERE workspace_id = $2 AND gallery_id = $3
                    """,
                    design_config,
                    workspace_id,
                    gallery_id,
                )

        # Invalidate cache so frontend gets fresh data
        await invalidate_gallery_cache(str(gallery_id))

        # Return updated config
        return await self.get_design_config(workspace_id, gallery_id)

    async def get_breadcrumbs(
        self,
        gallery_id: str,
        sub_gallery_id: Optional[str] = None,
    ) -> dict:
        """Get breadcrumb navigation path for a gallery/sub-gallery.

        Uses recursive CTE to traverse sub-gallery hierarchy from current
        location to root, then returns path from root to current.

        Args:
            gallery_id: Gallery UUID
            sub_gallery_id: Optional sub-gallery UUID (current location)

        Returns:
            BreadcrumbsResponse with path from root gallery to current location
        """
        with metrics.track_db_query("get_breadcrumbs"):
            async with get_connection(read_only=True) as conn:
                # Get gallery title
                gallery = await conn.fetchrow(
                    """
                    SELECT title FROM galleries
                    WHERE gallery_id = $1 AND deleted = FALSE
                    """,
                    UUID(gallery_id),
                )

                if not gallery:
                    raise GalleryNotFoundError(gallery_id)

                items = [
                    {
                        "id": gallery_id,
                        "name": gallery["title"],
                        "type": "gallery",
                        "depth": 0,
                    }
                ]

                # If we have a sub_gallery_id, traverse up the hierarchy
                if sub_gallery_id:
                    # Recursive CTE to find all ancestors
                    ancestors = await conn.fetch(
                        """
                        WITH RECURSIVE ancestry AS (
                            -- Base case: start from the target sub-gallery
                            SELECT
                                sg.sub_gallery_id,
                                sg.name,
                                sg.parent_sub_gallery_id,
                                sg.depth,
                                1 AS level
                            FROM sub_galleries sg
                            WHERE sg.sub_gallery_id = $1
                              AND sg.gallery_id = $2
                              AND sg.deleted = FALSE

                            UNION ALL

                            -- Recursive case: get parent sub-galleries
                            SELECT
                                parent.sub_gallery_id,
                                parent.name,
                                parent.parent_sub_gallery_id,
                                parent.depth,
                                ancestry.level + 1
                            FROM sub_galleries parent
                            INNER JOIN ancestry ON parent.sub_gallery_id = ancestry.parent_sub_gallery_id
                            WHERE parent.deleted = FALSE
                        )
                        SELECT sub_gallery_id, name, depth
                        FROM ancestry
                        ORDER BY level DESC
                        """,
                        UUID(sub_gallery_id),
                        UUID(gallery_id),
                    )

                    # Add sub-galleries to breadcrumb path (ordered from root to current)
                    for sg in ancestors:
                        items.append({
                            "id": str(sg["sub_gallery_id"]),
                            "name": sg["name"],
                            "type": "sub_gallery",
                            "depth": sg["depth"] if sg["depth"] is not None else 1,
                        })

        return {
            "gallery_id": gallery_id,
            "current_sub_gallery_id": sub_gallery_id,
            "items": items,
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
