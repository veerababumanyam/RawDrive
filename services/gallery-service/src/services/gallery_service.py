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
    # #region agent log
    import json
    import time
    try:
        debug_log_path = r'c:\Users\admin\Desktop\RawDrive\.cursor\debug.log'
        log_entry = {
            "id": "log_entry",
            "timestamp": int(time.time() * 1000),
            "location": "gallery_service.py:row_to_gallery_dict:entry",
            "message": "row_to_gallery_dict called",
            "data": {
                "row_keys": list(row.keys()) if row else None,
                "sub_galleries_count": len(sub_galleries) if sub_galleries else 0,
                "stats_is_none": stats is None
            },
            "sessionId": "debug-session",
            "runId": "run1",
            "hypothesisId": "F"
        }
        with open(debug_log_path, 'a', encoding='utf-8') as f:
            f.write(json.dumps(log_entry) + '\n')
            f.flush()
    except Exception:
        pass
    # #endregion
    
    # Process custom_links with error handling
    # asyncpg returns JSONB columns as Python objects (list/dict), not strings
    # But if stored as text, it might be a string representation
    custom_links_value = row.get("custom_links")
    custom_links = []
    try:
        # #region agent log
        try:
            debug_log_path = r'c:\Users\admin\Desktop\RawDrive\.cursor\debug.log'
            log_entry = {
                "id": "log_entry",
                "timestamp": int(time.time() * 1000),
                "location": "gallery_service.py:row_to_gallery_dict:custom_links",
                "message": "Processing custom_links",
                "data": {
                    "custom_links_type": type(custom_links_value).__name__ if custom_links_value is not None else "None",
                    "custom_links_value": str(custom_links_value)[:200] if custom_links_value is not None else None
                },
                "sessionId": "debug-session",
                "runId": "run1",
                "hypothesisId": "B"
            }
            with open(debug_log_path, 'a', encoding='utf-8') as f:
                f.write(json.dumps(log_entry) + '\n')
                f.flush()
        except Exception:
            pass
        # #endregion
        
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
        # #region agent log
        try:
            debug_log_path = r'c:\Users\admin\Desktop\RawDrive\.cursor\debug.log'
            log_entry = {
                "id": "log_entry",
                "timestamp": int(time.time() * 1000),
                "location": "gallery_service.py:row_to_gallery_dict:custom_links_exception",
                "message": "Exception processing custom_links",
                "data": {
                    "exception_type": type(e).__name__,
                    "exception_message": str(e),
                    "custom_links_value": str(custom_links_value)[:200] if custom_links_value is not None else None
                },
                "sessionId": "debug-session",
                "runId": "run1",
                "hypothesisId": "B"
            }
            with open(debug_log_path, 'a', encoding='utf-8') as f:
                f.write(json.dumps(log_entry) + '\n')
                f.flush()
        except Exception:
            pass
        # #endregion
        custom_links = []
    
    # Final safety check - ensure custom_links is always a list
    if not isinstance(custom_links, list):
        # #region agent log
        try:
            debug_log_path = r'c:\Users\admin\Desktop\RawDrive\.cursor\debug.log'
            log_entry = {
                "id": "log_entry",
                "timestamp": int(time.time() * 1000),
                "location": "gallery_service.py:row_to_gallery_dict:custom_links_type_check",
                "message": "custom_links is not a list, forcing to empty list",
                "data": {
                    "custom_links_type": type(custom_links).__name__,
                    "custom_links_value": str(custom_links)[:200]
                },
                "sessionId": "debug-session",
                "runId": "run1",
                "hypothesisId": "B"
            }
            with open(debug_log_path, 'a', encoding='utf-8') as f:
                f.write(json.dumps(log_entry) + '\n')
                f.flush()
        except Exception:
            pass
        # #endregion
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
    
    # #region agent log
    try:
        debug_log_path = r'c:\Users\admin\Desktop\RawDrive\.cursor\debug.log'
        log_entry = {
            "id": "log_entry",
            "timestamp": int(time.time() * 1000),
            "location": "gallery_service.py:row_to_gallery_dict:exit",
            "message": "row_to_gallery_dict completed",
            "data": {
                "result_keys": list(result.keys()),
                "custom_links_final": str(custom_links)[:200]
            },
            "sessionId": "debug-session",
            "runId": "run1",
            "hypothesisId": "F"
        }
        with open(debug_log_path, 'a', encoding='utf-8') as f:
            f.write(json.dumps(log_entry) + '\n')
            f.flush()
    except Exception:
        pass
    # #endregion
    
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
        # #region agent log
        import json
        import os
        import time
        try:
            debug_log_path = r'c:\Users\admin\Desktop\RawDrive\.cursor\debug.log'
            log_entry = {
                "id": "log_entry",
                "timestamp": int(time.time() * 1000),
                "location": "gallery_service.py:get_gallery:entry",
                "message": "Service method called",
                "data": {
                    "workspace_id": workspace_id,
                    "gallery_id": gallery_id,
                    "use_cache": use_cache
                },
                "sessionId": "debug-session",
                "runId": "run1",
                "hypothesisId": "B"
            }
            with open(debug_log_path, 'a', encoding='utf-8') as f:
                f.write(json.dumps(log_entry) + '\n')
                f.flush()
        except Exception:
            pass
        # #endregion
        
        cache_key = build_gallery_cache_key(gallery_id)

        # Try cache first
        if use_cache:
            # #region agent log
            try:
                debug_log_path = r'c:\Users\admin\Desktop\RawDrive\.cursor\debug.log'
                log_entry = {
                    "id": "log_entry",
                    "timestamp": int(time.time() * 1000),
                    "location": "gallery_service.py:get_gallery:before_cache",
                    "message": "Before cache check",
                    "data": {"cache_key": cache_key},
                    "sessionId": "debug-session",
                    "runId": "run1",
                    "hypothesisId": "D"
                }
                with open(debug_log_path, 'a', encoding='utf-8') as f:
                    f.write(json.dumps(log_entry) + '\n')
                    f.flush()
            except Exception:
                pass
            # #endregion
            try:
                cached = await redis_client.get_json(cache_key)
                if cached:
                    metrics.cache_hit("gallery")
                    return cached
                metrics.cache_miss("gallery")
            except Exception as e:
                # #region agent log
                try:
                    debug_log_path = r'c:\Users\admin\Desktop\RawDrive\.cursor\debug.log'
                    log_entry = {
                        "id": "log_entry",
                        "timestamp": int(time.time() * 1000),
                        "location": "gallery_service.py:get_gallery:cache_error",
                        "message": "Cache check failed",
                        "data": {
                            "exception_type": type(e).__name__,
                            "exception_message": str(e)
                        },
                        "sessionId": "debug-session",
                        "runId": "run1",
                        "hypothesisId": "D"
                    }
                    with open(debug_log_path, 'a', encoding='utf-8') as f:
                        f.write(json.dumps(log_entry) + '\n')
                        f.flush()
                except Exception:
                    pass
                # #endregion

        # Fetch from database
        # #region agent log
        try:
            debug_log_path = r'c:\Users\admin\Desktop\RawDrive\.cursor\debug.log'
            log_entry = {
                "id": "log_entry",
                "timestamp": int(time.time() * 1000),
                "location": "gallery_service.py:get_gallery:before_db",
                "message": "Before database query",
                "data": {
                    "workspace_id": workspace_id,
                    "gallery_id": gallery_id
                },
                "sessionId": "debug-session",
                "runId": "run1",
                "hypothesisId": "B"
            }
            with open(debug_log_path, 'a', encoding='utf-8') as f:
                f.write(json.dumps(log_entry) + '\n')
                f.flush()
        except Exception:
            pass
        # #endregion
        
        try:
            # #region agent log
            try:
                debug_log_path = r'c:\Users\admin\Desktop\RawDrive\.cursor\debug.log'
                log_entry = {
                    "id": "log_entry",
                    "timestamp": int(time.time() * 1000),
                    "location": "gallery_service.py:get_gallery:before_uuid",
                    "message": "Before UUID conversion",
                    "data": {
                        "workspace_id": workspace_id,
                        "gallery_id": gallery_id
                    },
                    "sessionId": "debug-session",
                    "runId": "run1",
                    "hypothesisId": "B"
                }
                with open(debug_log_path, 'a', encoding='utf-8') as f:
                    f.write(json.dumps(log_entry) + '\n')
                    f.flush()
            except Exception:
                pass
            # #endregion
            
            workspace_uuid = UUID(workspace_id)
            gallery_uuid = UUID(gallery_id)
            
            # #region agent log
            try:
                debug_log_path = r'c:\Users\admin\Desktop\RawDrive\.cursor\debug.log'
                log_entry = {
                    "id": "log_entry",
                    "timestamp": int(time.time() * 1000),
                    "location": "gallery_service.py:get_gallery:after_uuid",
                    "message": "UUID conversion succeeded",
                    "data": {
                        "workspace_uuid": str(workspace_uuid),
                        "gallery_uuid": str(gallery_uuid)
                    },
                    "sessionId": "debug-session",
                    "runId": "run1",
                    "hypothesisId": "B"
                }
                with open(debug_log_path, 'a', encoding='utf-8') as f:
                    f.write(json.dumps(log_entry) + '\n')
                    f.flush()
            except Exception:
                pass
            # #endregion
        except Exception as e:
            # #region agent log
            try:
                debug_log_path = r'c:\Users\admin\Desktop\RawDrive\.cursor\debug.log'
                log_entry = {
                    "id": "log_entry",
                    "timestamp": int(time.time() * 1000),
                    "location": "gallery_service.py:get_gallery:uuid_error",
                    "message": "UUID conversion failed",
                    "data": {
                        "exception_type": type(e).__name__,
                        "exception_message": str(e),
                        "workspace_id": workspace_id,
                        "gallery_id": gallery_id
                    },
                    "sessionId": "debug-session",
                    "runId": "run1",
                    "hypothesisId": "B"
                }
                with open(debug_log_path, 'a', encoding='utf-8') as f:
                    f.write(json.dumps(log_entry) + '\n')
                    f.flush()
            except Exception:
                pass
            # #endregion
            raise
        
        with metrics.track_db_query("get_gallery"):
            try:
                # #region agent log
                try:
                    debug_log_path = r'c:\Users\admin\Desktop\RawDrive\.cursor\debug.log'
                    log_entry = {
                        "id": "log_entry",
                        "timestamp": int(time.time() * 1000),
                        "location": "gallery_service.py:get_gallery:before_connection",
                        "message": "Before getting connection",
                        "data": {},
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
                
                async with get_connection() as conn:
                    # #region agent log
                    try:
                        debug_log_path = r'c:\Users\admin\Desktop\RawDrive\.cursor\debug.log'
                        log_entry = {
                            "id": "log_entry",
                            "timestamp": int(time.time() * 1000),
                            "location": "gallery_service.py:get_gallery:connection_acquired",
                            "message": "Connection acquired",
                            "data": {},
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
                        workspace_uuid,
                        gallery_uuid,
                    )

                    # #region agent log
                    try:
                        debug_log_path = r'c:\Users\admin\Desktop\RawDrive\.cursor\debug.log'
                        log_entry = {
                            "id": "log_entry",
                            "timestamp": int(time.time() * 1000),
                            "location": "gallery_service.py:get_gallery:after_fetchrow",
                            "message": "After fetchrow query",
                            "data": {
                                "row_is_none": row is None,
                                "row_keys": list(row.keys()) if row else None
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

                    if not row:
                        raise GalleryNotFoundError(gallery_id)

                    # Update last_accessed_at
                    await conn.execute(
                        "UPDATE galleries SET last_accessed_at = NOW() WHERE gallery_id = $1",
                        gallery_uuid,
                    )

                    # Get sub-galleries
                    # #region agent log
                    try:
                        debug_log_path = r'c:\Users\admin\Desktop\RawDrive\.cursor\debug.log'
                        log_entry = {
                            "id": "log_entry",
                            "timestamp": int(time.time() * 1000),
                            "location": "gallery_service.py:get_gallery:before_subgalleries",
                            "message": "Before sub-galleries query",
                            "data": {},
                            "sessionId": "debug-session",
                            "runId": "run1",
                            "hypothesisId": "E"
                        }
                        with open(debug_log_path, 'a', encoding='utf-8') as f:
                            f.write(json.dumps(log_entry) + '\n')
                            f.flush()
                    except Exception:
                        pass
                    # #endregion
                    
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
                        workspace_uuid,
                        gallery_uuid,
                    )

                    # #region agent log
                    try:
                        debug_log_path = r'c:\Users\admin\Desktop\RawDrive\.cursor\debug.log'
                        log_entry = {
                            "id": "log_entry",
                            "timestamp": int(time.time() * 1000),
                            "location": "gallery_service.py:get_gallery:after_subgalleries",
                            "message": "Sub-galleries query completed",
                            "data": {"count": len(sub_galleries), "sub_galleries": [{"id": str(sg["sub_gallery_id"]), "name": sg["name"], "visible": sg["visible"]} for sg in sub_galleries]},
                            "sessionId": "debug-session",
                            "runId": "post-fix",
                            "hypothesisId": "B"
                        }
                        with open(debug_log_path, 'a', encoding='utf-8') as f:
                            f.write(json.dumps(log_entry) + '\n')
                            f.flush()
                    except Exception:
                        pass
                    # #endregion
                    
                    # #region agent log
                    try:
                        debug_log_path = r'c:\Users\admin\Desktop\RawDrive\.cursor\debug.log'
                        log_entry = {
                            "id": "log_entry",
                            "timestamp": int(time.time() * 1000),
                            "location": "gallery_service.py:get_gallery:after_subgalleries",
                            "message": "After sub-galleries query",
                            "data": {
                                "sub_galleries_count": len(sub_galleries) if sub_galleries else 0
                            },
                            "sessionId": "debug-session",
                            "runId": "run1",
                            "hypothesisId": "E"
                        }
                        with open(debug_log_path, 'a', encoding='utf-8') as f:
                            f.write(json.dumps(log_entry) + '\n')
                            f.flush()
                    except Exception:
                        pass
                    # #endregion

                    # Get stats
                    # #region agent log
                    try:
                        debug_log_path = r'c:\Users\admin\Desktop\RawDrive\.cursor\debug.log'
                        log_entry = {
                            "id": "log_entry",
                            "timestamp": int(time.time() * 1000),
                            "location": "gallery_service.py:get_gallery:before_stats",
                            "message": "Before stats query",
                            "data": {},
                            "sessionId": "debug-session",
                            "runId": "run1",
                            "hypothesisId": "E"
                        }
                        with open(debug_log_path, 'a', encoding='utf-8') as f:
                            f.write(json.dumps(log_entry) + '\n')
                            f.flush()
                    except Exception:
                        pass
                    # #endregion
                    
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
                        workspace_uuid,
                        gallery_uuid,
                    )

                    # #region agent log
                    try:
                        debug_log_path = r'c:\Users\admin\Desktop\RawDrive\.cursor\debug.log'
                        log_entry = {
                            "id": "log_entry",
                            "timestamp": int(time.time() * 1000),
                            "location": "gallery_service.py:get_gallery:after_stats",
                            "message": "After stats query",
                            "data": {
                                "stats_is_none": stats is None,
                                "stats_keys": list(stats.keys()) if stats else None
                            },
                            "sessionId": "debug-session",
                            "runId": "run1",
                            "hypothesisId": "E"
                        }
                        with open(debug_log_path, 'a', encoding='utf-8') as f:
                            f.write(json.dumps(log_entry) + '\n')
                            f.flush()
                    except Exception:
                        pass
                    # #endregion
            except Exception as e:
                # #region agent log
                try:
                    debug_log_path = r'c:\Users\admin\Desktop\RawDrive\.cursor\debug.log'
                    log_entry = {
                        "id": "log_entry",
                        "timestamp": int(time.time() * 1000),
                        "location": "gallery_service.py:get_gallery:db_error",
                        "message": "Database operation failed",
                        "data": {
                            "exception_type": type(e).__name__,
                            "exception_message": str(e),
                            "exception_args": str(e.args) if hasattr(e, 'args') else None
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
                raise

        # #region agent log
        try:
            debug_log_path = r'c:\Users\admin\Desktop\RawDrive\.cursor\debug.log'
            log_entry = {
                "id": "log_entry",
                "timestamp": int(time.time() * 1000),
                "location": "gallery_service.py:get_gallery:before_row_to_dict",
                "message": "Before row_to_gallery_dict",
                "data": {
                    "row_is_none": row is None,
                    "sub_galleries_count": len(sub_galleries) if sub_galleries else 0,
                    "stats_is_none": stats is None
                },
                "sessionId": "debug-session",
                "runId": "run1",
                "hypothesisId": "F"
            }
            with open(debug_log_path, 'a', encoding='utf-8') as f:
                f.write(json.dumps(log_entry) + '\n')
                f.flush()
        except Exception:
            pass
        # #endregion
        
        try:
            result = row_to_gallery_dict(row, sub_galleries, stats)
            
            # #region agent log
            try:
                debug_log_path = r'c:\Users\admin\Desktop\RawDrive\.cursor\debug.log'
                log_entry = {
                    "id": "log_entry",
                    "timestamp": int(time.time() * 1000),
                    "location": "gallery_service.py:get_gallery:after_row_to_dict",
                    "message": "After row_to_gallery_dict",
                    "data": {
                        "result_keys": list(result.keys()) if isinstance(result, dict) else "not_dict"
                    },
                    "sessionId": "debug-session",
                    "runId": "run1",
                    "hypothesisId": "F"
                }
                with open(debug_log_path, 'a', encoding='utf-8') as f:
                    f.write(json.dumps(log_entry) + '\n')
                    f.flush()
            except Exception:
                pass
            # #endregion
        except Exception as e:
            # #region agent log
            try:
                debug_log_path = r'c:\Users\admin\Desktop\RawDrive\.cursor\debug.log'
                log_entry = {
                    "id": "log_entry",
                    "timestamp": int(time.time() * 1000),
                    "location": "gallery_service.py:get_gallery:row_to_dict_error",
                    "message": "row_to_gallery_dict failed",
                    "data": {
                        "exception_type": type(e).__name__,
                        "exception_message": str(e),
                        "exception_args": str(e.args) if hasattr(e, 'args') else None
                    },
                    "sessionId": "debug-session",
                    "runId": "run1",
                    "hypothesisId": "F"
                }
                with open(debug_log_path, 'a', encoding='utf-8') as f:
                    f.write(json.dumps(log_entry) + '\n')
                    f.flush()
            except Exception:
                pass
            # #endregion
            raise

        # Cache result
        try:
            await redis_client.set_json(
                cache_key,
                result,
                settings.CACHE_TTL_GALLERY_METADATA
            )
        except Exception as e:
            # #region agent log
            try:
                debug_log_path = r'c:\Users\admin\Desktop\RawDrive\.cursor\debug.log'
                log_entry = {
                    "id": "log_entry",
                    "timestamp": int(time.time() * 1000),
                    "location": "gallery_service.py:get_gallery:cache_set_error",
                    "message": "Cache set failed",
                    "data": {
                        "exception_type": type(e).__name__,
                        "exception_message": str(e)
                    },
                    "sessionId": "debug-session",
                    "runId": "run1",
                    "hypothesisId": "D"
                }
                with open(debug_log_path, 'a', encoding='utf-8') as f:
                    f.write(json.dumps(log_entry) + '\n')
                    f.flush()
            except Exception:
                pass
            # #endregion

        return result


    async def get_gallery_credentials(
        self,
        workspace_id: str,
        gallery_id: str,
    ) -> dict:
        """Get decrypted gallery credentials (password/PIN)."""
        with metrics.track_db_query("get_gallery_credentials"):
            async with get_connection() as conn:
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
                    UUID(workspace_id),
                    UUID(gallery_id),
                )
                
                if not row:
                    raise GalleryNotFoundError(gallery_id)
                
                from src.services.encryption_service import get_encryption_service
                enc_service = get_encryption_service()
                
                # Decrypt password if available
                password = None
                password_recoverable = False
                if row["password_encrypted"] and row["password_iv"]:
                    try:
                        password = await enc_service.decrypt_gallery_credential(
                            row["password_encrypted"],
                            row["password_iv"],
                            UUID(workspace_id)
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
                            UUID(workspace_id)
                        )
                        pin_recoverable = True
                    except Exception as e:
                        logger.error(f"Failed to decrypt PIN for gallery {gallery_id}: {e}")

                return {
                    "gallery_id": str(gallery_id),
                    "password_set": row["password_set"],
                    "password": password,
                    "password_recoverable": password_recoverable,
                    "pin_set": row["pin_set"],
                    "pin": pin,
                    "pin_recoverable": pin_recoverable,
                }

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
        
        # #region agent log
        try:
            debug_log_path = r'c:\Users\admin\Desktop\RawDrive\.cursor\debug.log'
            log_entry = {
                "id": "log_entry",
                "timestamp": int(time.time() * 1000),
                "location": "gallery_service.py:get_gallery:before_return",
                "message": "Gallery response prepared",
                "data": {"gallery_id": str(gallery_uuid), "sub_galleries_count": len(result.get("sub_galleries", [])), "sub_galleries": result.get("sub_galleries", [])},
                "sessionId": "debug-session",
                "runId": "post-fix",
                "hypothesisId": "B"
            }
            with open(debug_log_path, 'a', encoding='utf-8') as f:
                f.write(json.dumps(log_entry) + '\n')
                f.flush()
        except Exception:
            pass
        # #endregion

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
                
                # Filter out None values and handle special fields
                valid_fields = {
                    "title", "description", "client_name", "client_id", "shoot_date",
                    "status", "branding_profile_id", "portal_language", "layout_style",
                    "theme", "download_policy", "exif_visible", "passkey", "pin",
                    "email_registration_required", "expires_at", "custom_domain",
                    "primary_color", "gradient_config", "font_family", "custom_links",
                    "cover_asset_id", "pinned_at"
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
        sort_order: int = 0
    ) -> dict:
        """Create a sub-gallery."""
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
                    
                sub_gallery_id = await conn.fetchval(
                    """
                    INSERT INTO sub_galleries (gallery_id, workspace_id, name, sort_order)
                    VALUES ($1, $2, $3, $4)
                    RETURNING sub_gallery_id
                    """,
                    UUID(str(gallery_id)),
                    UUID(str(workspace_id)),
                    name,
                    sort_order,
                )
                
        await invalidate_gallery_cache(str(gallery_id))
        return {
            "sub_gallery_id": str(sub_gallery_id),
            "name": name,
            "sort_order": sort_order,
            "visible": True,
            "photo_count": 0,
            "cover_asset_id": None
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
