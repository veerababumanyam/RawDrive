"""Similarity Group Cache Service.

Redis-backed caching layer for similarity groups. Provides fast reads
for the curation UI while database serves as the source of truth.

Feature: 023-enhanced-smart-curate
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional
from uuid import UUID

from app.db.redis import get_redis_client

logger = logging.getLogger(__name__)

# Cache TTL: 1 hour for similarity groups
SIMILARITY_GROUP_TTL = 3600

# Redis key prefix
CACHE_KEY_PREFIX = "similarity_groups:"


def _serialize_for_json(obj: Any) -> Any:
    """Convert UUID objects to strings for JSON serialization."""
    if isinstance(obj, UUID):
        return str(obj)
    if isinstance(obj, dict):
        return {k: _serialize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_serialize_for_json(item) for item in obj]
    return obj


class SimilarityCacheService:
    """Redis caching layer for similarity groups.

    Stores serialized similarity group data in Redis with a 1-hour TTL.
    Reads return cached data when available, None on miss or error.
    Gracefully degrades if Redis is unavailable.
    """

    async def cache_similarity_groups(
        self, session_id: UUID, groups: list[dict[str, Any]]
    ) -> None:
        """Cache similarity groups in Redis.

        Args:
            session_id: Curation session ID (used as cache key)
            groups: List of group dicts from bulk_create_groups
        """
        try:
            redis = await get_redis_client()
            key = f"{CACHE_KEY_PREFIX}{session_id}"
            serializable = _serialize_for_json(groups)
            await redis.setex(key, SIMILARITY_GROUP_TTL, json.dumps(serializable))
            logger.info(
                "Cached similarity groups",
                extra={
                    "session_id": str(session_id),
                    "group_count": len(groups),
                },
            )
        except Exception as e:
            logger.warning(
                "Failed to cache similarity groups: %s",
                e,
                extra={"session_id": str(session_id)},
            )

    async def get_cached_groups(
        self, session_id: UUID
    ) -> Optional[list[dict[str, Any]]]:
        """Get cached similarity groups.

        Args:
            session_id: Curation session ID

        Returns:
            List of group dicts if cache hit, None if miss or error
        """
        try:
            redis = await get_redis_client()
            key = f"{CACHE_KEY_PREFIX}{session_id}"
            cached = await redis.get(key)
            if cached is None:
                return None
            data = cached if isinstance(cached, str) else cached.decode("utf-8")
            return json.loads(data)
        except Exception as e:
            logger.warning(
                "Failed to get cached similarity groups: %s",
                e,
                extra={"session_id": str(session_id)},
            )
            return None

    async def invalidate_cache(self, session_id: UUID) -> None:
        """Invalidate cached similarity groups.

        Args:
            session_id: Curation session ID
        """
        try:
            redis = await get_redis_client()
            key = f"{CACHE_KEY_PREFIX}{session_id}"
            await redis.delete(key)
            logger.info(
                "Invalidated similarity group cache",
                extra={"session_id": str(session_id)},
            )
        except Exception as e:
            logger.warning(
                "Failed to invalidate similarity group cache: %s",
                e,
                extra={"session_id": str(session_id)},
            )


# Module-level singleton
_similarity_cache_service: Optional[SimilarityCacheService] = None


def get_similarity_cache_service() -> SimilarityCacheService:
    """Get or create the similarity cache service singleton."""
    global _similarity_cache_service
    if _similarity_cache_service is None:
        _similarity_cache_service = SimilarityCacheService()
    return _similarity_cache_service
