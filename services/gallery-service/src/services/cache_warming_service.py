"""
Cache warming service for Gallery Microservice.

Preloads the most recent galleries into cache when a workspace is accessed
to improve initial load times and reduce database load.

Features:
- Preloads 5 most recent galleries on workspace load
- Background warming (non-blocking)
- Graceful handling of cache/DB failures
- Metrics tracking for monitoring
"""

from __future__ import annotations

import asyncio
from typing import Optional
from uuid import UUID

from src.cache.redis_client import redis_client, build_gallery_cache_key
from src.config import settings
from src.database import get_connection
from src.log_config import get_logger
from src.observability.metrics import get_metrics

logger = get_logger(__name__)
metrics = get_metrics()

# Number of most recent galleries to preload
CACHE_WARM_GALLERY_COUNT = 5

# Cache key for tracking workspace warm status
WORKSPACE_WARM_KEY_PREFIX = "workspace:warmed"
WORKSPACE_WARM_TTL = 300  # 5 minutes - matches gallery metadata TTL


class CacheWarmingService:
    """Service for warming gallery caches on workspace load."""

    async def warm_workspace_cache(
        self,
        workspace_id: str,
        force: bool = False,
    ) -> dict:
        """
        Warm the cache for a workspace by preloading recent galleries.

        This operation runs in the background and is non-blocking.
        It preloads the 5 most recently accessed/created galleries.

        Args:
            workspace_id: The workspace UUID to warm cache for
            force: If True, warm even if already warmed recently

        Returns:
            dict with warm status and galleries warmed count
        """
        warm_key = f"{WORKSPACE_WARM_KEY_PREFIX}:{workspace_id}"

        # Check if already warmed recently (skip if not forced)
        if not force:
            already_warmed = await redis_client.get(warm_key)
            if already_warmed:
                logger.debug(
                    f"Cache already warm for workspace",
                    extra={"workspace_id": workspace_id}
                )
                return {
                    "status": "already_warm",
                    "workspace_id": workspace_id,
                    "galleries_warmed": 0,
                }

        # Fetch 5 most recent galleries
        try:
            galleries = await self._fetch_recent_galleries(workspace_id)
        except Exception as e:
            logger.warning(
                f"Failed to fetch recent galleries for cache warming: {e}",
                extra={"workspace_id": workspace_id}
            )
            metrics.cache_warm_error("gallery_fetch")
            return {
                "status": "error",
                "workspace_id": workspace_id,
                "galleries_warmed": 0,
                "error": str(e),
            }

        if not galleries:
            # Mark as warmed even with no galleries (avoid repeated attempts)
            await redis_client.set(warm_key, "1", WORKSPACE_WARM_TTL)
            return {
                "status": "empty",
                "workspace_id": workspace_id,
                "galleries_warmed": 0,
            }

        # Warm each gallery in parallel
        warmed_count = await self._warm_galleries(workspace_id, galleries)

        # Mark workspace as warmed
        await redis_client.set(warm_key, "1", WORKSPACE_WARM_TTL)

        logger.info(
            f"Cache warmed for workspace",
            extra={
                "workspace_id": workspace_id,
                "galleries_warmed": warmed_count,
                "total_galleries": len(galleries),
            }
        )
        metrics.cache_warm_complete(warmed_count)

        return {
            "status": "warmed",
            "workspace_id": workspace_id,
            "galleries_warmed": warmed_count,
        }

    async def warm_workspace_cache_background(
        self,
        workspace_id: str,
    ) -> None:
        """
        Trigger cache warming in the background (fire-and-forget).

        This is the primary method to call from API endpoints.
        It doesn't block the response.

        Args:
            workspace_id: The workspace UUID to warm cache for
        """
        # Create background task that won't block
        asyncio.create_task(
            self._background_warm(workspace_id),
            name=f"cache_warm_{workspace_id}"
        )

    async def _background_warm(self, workspace_id: str) -> None:
        """Background task wrapper with error handling."""
        try:
            await self.warm_workspace_cache(workspace_id)
        except Exception as e:
            logger.warning(
                f"Background cache warming failed: {e}",
                extra={"workspace_id": workspace_id}
            )
            metrics.cache_warm_error("background")

    async def _fetch_recent_galleries(
        self,
        workspace_id: str,
    ) -> list[dict]:
        """
        Fetch the 5 most recent galleries for a workspace.

        Orders by last_accessed_at (if set), then created_at.

        Args:
            workspace_id: The workspace UUID

        Returns:
            List of gallery dictionaries
        """
        async with get_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    gallery_id, workspace_id, title, description, client_name,
                    client_id, shoot_date, status, branding_profile_id,
                    portal_language, layout_style, theme, download_policy,
                    exif_visible,
                    password_hash IS NOT NULL as password_protected,
                    pin_hash IS NOT NULL as pin_protected,
                    email_registration_required, expires_at, custom_domain,
                    primary_color, gradient_config, font_family, custom_links,
                    cover_asset_id, created_by_user_id, published_at,
                    created_at, updated_at, deleted, pinned_at, last_accessed_at
                FROM galleries
                WHERE workspace_id = $1 AND deleted = FALSE
                ORDER BY
                    COALESCE(last_accessed_at, created_at) DESC,
                    created_at DESC
                LIMIT $2
                """,
                UUID(workspace_id),
                CACHE_WARM_GALLERY_COUNT,
            )

            return [dict(row) for row in rows]

    async def _warm_galleries(
        self,
        workspace_id: str,
        galleries: list[dict],
    ) -> int:
        """
        Warm cache for a list of galleries.

        Args:
            workspace_id: The workspace UUID
            galleries: List of gallery dictionaries to cache

        Returns:
            Number of galleries successfully cached
        """
        from src.services.gallery_service import row_to_gallery_dict

        warmed = 0
        tasks = []

        for gallery_row in galleries:
            gallery_id = str(gallery_row["gallery_id"])
            cache_key = build_gallery_cache_key(gallery_id)

            # Convert row to response format (without sub-galleries/stats for speed)
            # Full data will be loaded on demand
            gallery_data = {
                "gallery_id": gallery_id,
                "workspace_id": str(gallery_row["workspace_id"]),
                "title": gallery_row["title"],
                "description": gallery_row["description"],
                "client_name": gallery_row["client_name"],
                "client_id": str(gallery_row["client_id"]) if gallery_row["client_id"] else None,
                "shoot_date": gallery_row["shoot_date"].isoformat() if gallery_row["shoot_date"] else None,
                "status": gallery_row["status"],
                "branding_profile_id": str(gallery_row["branding_profile_id"]) if gallery_row.get("branding_profile_id") else None,
                "portal_language": gallery_row.get("portal_language"),
                "layout_style": gallery_row.get("layout_style"),
                "theme": gallery_row.get("theme"),
                "download_policy": gallery_row.get("download_policy"),
                "exif_visible": gallery_row.get("exif_visible"),
                "password_protected": gallery_row.get("password_protected", False),
                "pin_protected": gallery_row.get("pin_protected", False),
                "email_registration_required": gallery_row.get("email_registration_required", False),
                "expires_at": gallery_row["expires_at"].isoformat() if gallery_row.get("expires_at") else None,
                "published_at": gallery_row["published_at"].isoformat() if gallery_row.get("published_at") else None,
                "cover_asset_id": str(gallery_row["cover_asset_id"]) if gallery_row.get("cover_asset_id") else None,
                "primary_color": gallery_row.get("primary_color"),
                "gradient_config": gallery_row.get("gradient_config"),
                "font_family": gallery_row.get("font_family"),
                "custom_domain": gallery_row.get("custom_domain"),
                "custom_links": gallery_row.get("custom_links") or [],
                "created_by_user_id": str(gallery_row["created_by_user_id"]),
                "created_at": gallery_row["created_at"].isoformat(),
                "pinned_at": gallery_row["pinned_at"].isoformat() if gallery_row.get("pinned_at") else None,
                "is_pinned": gallery_row.get("pinned_at") is not None,
                "last_accessed_at": gallery_row["last_accessed_at"].isoformat() if gallery_row.get("last_accessed_at") else None,
                "sub_galleries": [],  # Will be loaded on demand
                "stats": {},  # Will be loaded on demand
            }

            # Create cache task
            tasks.append(
                redis_client.set_json(
                    cache_key,
                    gallery_data,
                    settings.CACHE_TTL_GALLERY_METADATA,
                )
            )

        # Execute all cache operations in parallel
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if result is True:
                warmed += 1
            elif isinstance(result, Exception):
                logger.warning(f"Failed to cache gallery: {result}")
                metrics.cache_warm_error("cache_set")

        return warmed

    async def invalidate_workspace_warm_status(
        self,
        workspace_id: str,
    ) -> None:
        """
        Invalidate the warm status for a workspace.

        Call this when galleries are created/deleted to trigger
        re-warming on next access.

        Args:
            workspace_id: The workspace UUID
        """
        warm_key = f"{WORKSPACE_WARM_KEY_PREFIX}:{workspace_id}"
        await redis_client.delete(warm_key)
        logger.debug(
            f"Invalidated warm status for workspace",
            extra={"workspace_id": workspace_id}
        )


# Singleton instance
_cache_warming_service: Optional[CacheWarmingService] = None


def get_cache_warming_service() -> CacheWarmingService:
    """Get singleton cache warming service instance."""
    global _cache_warming_service
    if _cache_warming_service is None:
        _cache_warming_service = CacheWarmingService()
    return _cache_warming_service
