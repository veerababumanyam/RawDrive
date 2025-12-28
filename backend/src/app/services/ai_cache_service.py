"""AI Cache Service.

Provides Redis-based caching for AI analysis results.
Cache keys are based on content hash (SHA256) to enable content-addressable caching.

Feature: 010-ai-powered-features
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional
from uuid import UUID

from app.db.redis import get_redis_client

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Cache key prefixes by feature type
CACHE_PREFIX_ANALYSIS = "ai:analysis"
CACHE_PREFIX_CAPTION = "ai:caption"
CACHE_PREFIX_HASHTAG = "ai:hashtag"
CACHE_PREFIX_STORY = "ai:story"
CACHE_PREFIX_CURATION = "ai:curation"

# Cache TTLs (in seconds)
# Analysis results are immutable for a given image, use longer TTL
CACHE_TTL_ANALYSIS = 86400 * 7  # 7 days - photo content doesn't change
CACHE_TTL_CAPTION = 86400  # 24 hours - may want different tones
CACHE_TTL_HASHTAG = 86400  # 24 hours - trends may change
CACHE_TTL_STORY = 3600  # 1 hour - gallery content may change
CACHE_TTL_CURATION = 1800  # 30 minutes - gallery assets may change


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class AICacheService:
    """Service for caching AI analysis results in Redis."""

    async def get_photo_analysis(
        self,
        asset_sha256: str,
    ) -> Optional[dict[str, Any]]:
        """Get cached photo analysis result.

        Args:
            asset_sha256: SHA256 hash of the asset content

        Returns:
            Cached analysis dict or None if not found
        """
        cache_key = f"{CACHE_PREFIX_ANALYSIS}:{asset_sha256}"
        return await self._get_cached(cache_key)

    async def set_photo_analysis(
        self,
        asset_sha256: str,
        analysis: dict[str, Any],
    ) -> None:
        """Cache photo analysis result.

        Args:
            asset_sha256: SHA256 hash of the asset content
            analysis: Analysis result dict to cache
        """
        cache_key = f"{CACHE_PREFIX_ANALYSIS}:{asset_sha256}"
        await self._set_cached(cache_key, analysis, CACHE_TTL_ANALYSIS)

    async def get_caption(
        self,
        asset_sha256: str,
        tone: str,
    ) -> Optional[dict[str, Any]]:
        """Get cached caption result.

        Args:
            asset_sha256: SHA256 hash of the asset content
            tone: Caption tone (professional, casual, etc.)

        Returns:
            Cached caption dict or None if not found
        """
        cache_key = f"{CACHE_PREFIX_CAPTION}:{asset_sha256}:{tone}"
        return await self._get_cached(cache_key)

    async def set_caption(
        self,
        asset_sha256: str,
        tone: str,
        caption: dict[str, Any],
    ) -> None:
        """Cache caption result.

        Args:
            asset_sha256: SHA256 hash of the asset content
            tone: Caption tone
            caption: Caption result dict to cache
        """
        cache_key = f"{CACHE_PREFIX_CAPTION}:{asset_sha256}:{tone}"
        await self._set_cached(cache_key, caption, CACHE_TTL_CAPTION)

    async def get_hashtags(
        self,
        asset_sha256: str,
        category: str,
    ) -> Optional[dict[str, Any]]:
        """Get cached hashtag result.

        Args:
            asset_sha256: SHA256 hash of the asset content
            category: Hashtag category (general, niche, trending)

        Returns:
            Cached hashtags dict or None if not found
        """
        cache_key = f"{CACHE_PREFIX_HASHTAG}:{asset_sha256}:{category}"
        return await self._get_cached(cache_key)

    async def set_hashtags(
        self,
        asset_sha256: str,
        category: str,
        hashtags: dict[str, Any],
    ) -> None:
        """Cache hashtag result.

        Args:
            asset_sha256: SHA256 hash of the asset content
            category: Hashtag category
            hashtags: Hashtags result dict to cache
        """
        cache_key = f"{CACHE_PREFIX_HASHTAG}:{asset_sha256}:{category}"
        await self._set_cached(cache_key, hashtags, CACHE_TTL_HASHTAG)

    async def get_gallery_story(
        self,
        gallery_id: UUID,
        length: str,
        tone: str,
    ) -> Optional[dict[str, Any]]:
        """Get cached gallery story.

        Args:
            gallery_id: Gallery UUID
            length: Story length (short, medium, long)
            tone: Story tone (narrative, factual, etc.)

        Returns:
            Cached story dict or None if not found
        """
        cache_key = f"{CACHE_PREFIX_STORY}:{gallery_id}:{length}:{tone}"
        return await self._get_cached(cache_key)

    async def set_gallery_story(
        self,
        gallery_id: UUID,
        length: str,
        tone: str,
        story: dict[str, Any],
    ) -> None:
        """Cache gallery story.

        Args:
            gallery_id: Gallery UUID
            length: Story length
            tone: Story tone
            story: Story result dict to cache
        """
        cache_key = f"{CACHE_PREFIX_STORY}:{gallery_id}:{length}:{tone}"
        await self._set_cached(cache_key, story, CACHE_TTL_STORY)

    async def invalidate_gallery_story(self, gallery_id: UUID) -> None:
        """Invalidate all cached stories for a gallery.

        Call this when gallery assets change.

        Args:
            gallery_id: Gallery UUID
        """
        try:
            redis = await get_redis_client()
            pattern = f"{CACHE_PREFIX_STORY}:{gallery_id}:*"
            cursor = 0
            while True:
                cursor, keys = await redis.scan(cursor, match=pattern, count=100)
                if keys:
                    await redis.delete(*keys)
                if cursor == 0:
                    break
            logger.debug(f"Invalidated story cache for gallery {gallery_id}")
        except Exception as e:
            logger.warning(f"Failed to invalidate story cache: {e}")

    async def get_curation(
        self,
        gallery_id: UUID,
        quality_threshold: float,
        diversity_weight: float,
        max_photos: Optional[int],
    ) -> Optional[dict[str, Any]]:
        """Get cached curation result.

        Args:
            gallery_id: Gallery UUID
            quality_threshold: Quality threshold used
            diversity_weight: Diversity weight used
            max_photos: Max photos limit

        Returns:
            Cached curation dict or None if not found
        """
        max_str = str(max_photos) if max_photos else "all"
        cache_key = f"{CACHE_PREFIX_CURATION}:{gallery_id}:{quality_threshold}:{diversity_weight}:{max_str}"
        return await self._get_cached(cache_key)

    async def set_curation(
        self,
        gallery_id: UUID,
        quality_threshold: float,
        diversity_weight: float,
        max_photos: Optional[int],
        curation: dict[str, Any],
    ) -> None:
        """Cache curation result.

        Args:
            gallery_id: Gallery UUID
            quality_threshold: Quality threshold used
            diversity_weight: Diversity weight used
            max_photos: Max photos limit
            curation: Curation result dict to cache
        """
        max_str = str(max_photos) if max_photos else "all"
        cache_key = f"{CACHE_PREFIX_CURATION}:{gallery_id}:{quality_threshold}:{diversity_weight}:{max_str}"
        await self._set_cached(cache_key, curation, CACHE_TTL_CURATION)

    async def invalidate_gallery_curation(self, gallery_id: UUID) -> None:
        """Invalidate all cached curations for a gallery.

        Call this when gallery assets change.

        Args:
            gallery_id: Gallery UUID
        """
        try:
            redis = await get_redis_client()
            pattern = f"{CACHE_PREFIX_CURATION}:{gallery_id}:*"
            cursor = 0
            while True:
                cursor, keys = await redis.scan(cursor, match=pattern, count=100)
                if keys:
                    await redis.delete(*keys)
                if cursor == 0:
                    break
            logger.debug(f"Invalidated curation cache for gallery {gallery_id}")
        except Exception as e:
            logger.warning(f"Failed to invalidate curation cache: {e}")

    # -----------------------------------------------------------------------
    # Internal helpers
    # -----------------------------------------------------------------------

    async def _get_cached(self, cache_key: str) -> Optional[dict[str, Any]]:
        """Get cached value from Redis.

        Args:
            cache_key: Full cache key

        Returns:
            Parsed JSON dict or None if not found/error
        """
        try:
            redis = await get_redis_client()
            cached = await redis.get(cache_key)
            if cached:
                logger.debug(f"AI cache hit: {cache_key}")
                return json.loads(cached)
            return None
        except Exception as e:
            # Log but don't fail - cache miss is okay
            logger.warning(f"Redis cache read failed: {e}")
            return None

    async def _set_cached(
        self,
        cache_key: str,
        value: dict[str, Any],
        ttl: int,
    ) -> None:
        """Set cached value in Redis.

        Args:
            cache_key: Full cache key
            value: Dict to cache (will be JSON serialized)
            ttl: Time to live in seconds
        """
        try:
            redis = await get_redis_client()
            await redis.setex(cache_key, ttl, json.dumps(value))
            logger.debug(f"AI cache set: {cache_key} (TTL: {ttl}s)")
        except Exception as e:
            # Log but don't fail - API call succeeded, cache is bonus
            logger.warning(f"Redis cache write failed: {e}")


# ---------------------------------------------------------------------------
# Service Factory
# ---------------------------------------------------------------------------


_ai_cache_service: Optional[AICacheService] = None


def get_ai_cache_service() -> AICacheService:
    """Get the AI cache service instance."""
    global _ai_cache_service
    if _ai_cache_service is None:
        _ai_cache_service = AICacheService()
    return _ai_cache_service
