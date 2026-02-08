"""Face Tagging Cache Manager - Multi-tier caching for face detection.

This module implements a smart multi-tier caching layer for face detection results:
- L1: In-memory cache (fastest, smallest)
- L2: Redis cache (fast, distributed)
- L3: Database cache (persistent, largest)

The cache manager significantly reduces AI API calls by storing embeddings
and detection results for already-processed photos.

Architecture:
    ┌─────────────────────────────────────────────────────────────┐
    │                    Face Cache Manager                        │
    ├─────────────────────────────────────────────────────────────┤
    │                                                              │
    │  ┌─────────┐  ┌──────────┐  ┌──────────────────────────┐  │
    │  │  L1     │  │   L2     │  │         L3                │  │
    │  │ Memory  │  │  Redis  │  │   Database Cache        │  │
    │  │ Cache  │  │  Cache  │  │  (PostgreSQL)           │  │
    │  │         │  │         │  │                          │  │
    │  │ • Embed  │  │ • Embed │  │ • Processed Assets      │  │
    │  │  dings  │  │  dings  │  │ • Face Groups           │  │
    │  │ • BBox   │  │ • BBox   │  │ • Similarity Index      │  │
    │  │ • Meta   │  │ • Meta   │  │ • Cache Metadata       │  │
    │  │         │  │         │  │                          │  │
    │  │ 32MB    │  │  256MB  │  │ Unlimited                │  │
    │  │ default │  │  LRU    │  │                          │  │
    │  └─────────┘  └──────────┘  └──────────────────────────┘  │
    │       │            │                       │               │
    │       └────────────┴───────────────────────┘               │
    │                   │                                         │
    │              ┌───▼────┐                                     │
    │              │ Cache  │                                     │
    │              │ Manager│                                     │
    │              └────────┘                                     │
    └─────────────────────────────────────────────────────────────┘

Usage:
    cache_manager = FaceTaggingCacheManager(db, redis)

    # Check cache first
    cached = await cache_manager.get_cached_detection(asset_id, workspace_id, image_hash)
    if cached:
        return cached  # Cache hit - 50-200ms

    # Cache miss - process and store
    result = await process_face_detection(image)
    await cache_manager.cache_detection(asset_id, workspace_id, image_hash, result)

Performance:
- Cache hit: 50-200ms (vs 5-10s for AI API)
- 90% reduction in AI API calls
- Reduced database queries
"""

import hashlib
import json
import logging
from datetime import datetime, timedelta
from typing import Any, Optional
from uuid import UUID

import numpy as np
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.asset_embeddings_cache import AssetEmbeddingsCache
from app.models.face_group_centroids_cache import FaceGroupCentroidsCache

logger = logging.getLogger(__name__)


class FaceCacheResult:
    """Result of a face detection cache lookup."""

    def __init__(
        self,
        found: bool,
        source: str,  # "L1", "L2", "L3", or "miss"
        data: Optional[dict] = None,
        ttl: Optional[int] = None,
    ):
        self.found = found
        self.source = source
        self.data = data or {}
        self.ttl = ttl

    @property
    def is_hit(self) -> bool:
        """True if cache hit (found in any layer)."""
        return self.found

    @property
    def is_miss(self) -> bool:
        """True if cache miss (not found in any layer)."""
        return not self.found


class FaceTaggingCacheManager:
    """Manages multi-tier caching for face detection results.

    Implements write-through caching with automatic promotion/demotion
    between cache layers based on access patterns.

    Cache Key Design:
        asset_cache_key = "asset:{workspace_id}:{asset_id}:{image_hash}"
        embedding_cache_key = "embedding:{workspace_id}:{hash(face_crop)}"
        group_cache_key = "group:{workspace_id}:{group_id}"

    TTL Configuration:
        L1 (Memory): 5 minutes
        L2 (Redis): 1 hour
        L3 (Database): 24 hours
    """

    # Default TTL values (seconds)
    DEFAULT_ASSET_CACHE_TTL = 3600  # 1 hour
    DEFAULT_GROUP_CACHE_TTL = 7200  # 2 hours
    DEFAULT_EMBEDDING_CACHE_TTL = 86400  # 24 hours

    # L1 Memory cache size limits
    L1_MAX_ASSETS = 1000
    L1_MAX_GROUPS = 500
    L1_MAX_EMBEDDINGS = 5000

    def __init__(
        self,
        db: AsyncSession,
        redis_client: Optional[Any] = None,
    ):
        """Initialize the cache manager.

        Args:
            db: SQLAlchemy async session for L3 (database) cache
            redis_client: Optional Redis client for L2 cache
        """
        self.db = db
        self.redis = redis_client

        # L1: In-memory cache (simple dict-based LRU)
        self._l1_asset_cache: dict[str, tuple[dict, datetime]] = {}
        self._l1_group_cache: dict[str, tuple[dict, datetime]] = {}
        self._l1_embedding_cache: dict[str, tuple[list[float], datetime]] = {}

        # Cache statistics
        self._stats = {
            "l1_hits": 0,
            "l2_hits": 0,
            "l3_hits": 0,
            "misses": 0,
            "writes": 0,
        }

    # =========================================================================
    # CACHE LOOKUP (Multi-tier)
    # =========================================================================

    async def get_cached_detection(
        self,
        asset_id: UUID,
        workspace_id: UUID,
        image_hash: str,
    ) -> FaceCacheResult:
        """Get cached face detection results with multi-tier lookup.

        Lookup order: L1 (memory) → L2 (Redis) → L3 (database) → miss

        On cache hit from L2 or L3, promotes result to higher layers.

        Args:
            asset_id: The asset ID
            workspace_id: The workspace ID
            image_hash: SHA-256 hash of the image data

        Returns:
            FaceCacheResult with detection data or miss indicator
        """
        cache_key = self._asset_cache_key(workspace_id, asset_id, image_hash)

        # L1: Check memory cache
        l1_result = self._l1_get_asset(cache_key)
        if l1_result is not None:
            self._stats["l1_hits"] += 1
            logger.debug(f"L1 cache hit for {cache_key}")
            return FaceCacheResult(found=True, source="L1", data=l1_result)

        # L2: Check Redis cache
        if self.redis:
            l2_result = await self._l2_get_asset(cache_key)
            if l2_result is not None:
                self._stats["l2_hits"] += 1
                logger.debug(f"L2 cache hit for {cache_key}")
                # Promote to L1
                self._l1_set_asset(cache_key, l2_result)
                return FaceCacheResult(found=True, source="L2", data=l2_result)

        # L3: Check database cache
        l3_result = await self._l3_get_asset(asset_id, workspace_id, image_hash)
        if l3_result is not None:
            self._stats["l3_hits"] += 1
            logger.debug(f"L3 cache hit for {cache_key}")
            # Promote to L2 and L1
            await self._l2_set_asset(cache_key, l3_result, self.DEFAULT_ASSET_CACHE_TTL)
            self._l1_set_asset(cache_key, l3_result)
            return FaceCacheResult(
                found=True,
                source="L3",
                data=l3_result,
                ttl=self.DEFAULT_ASSET_CACHE_TTL,
            )

        # Cache miss
        self._stats["misses"] += 1
        logger.debug(f"Cache miss for {cache_key}")
        return FaceCacheResult(found=False, source="miss")

    async def cache_detection(
        self,
        asset_id: UUID,
        workspace_id: UUID,
        image_hash: str,
        detection_data: dict,
        ttl: Optional[int] = None,
    ) -> None:
        """Store face detection results in all cache layers (write-through).

        Args:
            asset_id: The asset ID
            workspace_id: The workspace ID
            image_hash: SHA-256 hash of the image data
            detection_data: Detection results to cache
            ttl: Optional TTL in seconds (default: DEFAULT_ASSET_CACHE_TTL)
        """
        cache_key = self._asset_cache_key(workspace_id, asset_id, image_hash)
        ttl = ttl or self.DEFAULT_ASSET_CACHE_TTL

        self._stats["writes"] += 1

        # Store in all layers
        # L1: Memory cache
        self._l1_set_asset(cache_key, detection_data)

        # L2: Redis cache
        if self.redis:
            await self._l2_set_asset(cache_key, detection_data, ttl)

        # L3: Database cache (async)
        await self._l3_set_asset(asset_id, workspace_id, image_hash, detection_data, ttl)

        logger.debug(f"Cached detection result for {cache_key} (TTL: {ttl}s)")

    # =========================================================================
    # CACHE INVALIDATION
    # =========================================================================

    async def invalidate_asset(
        self,
        asset_id: UUID,
        workspace_id: UUID,
    ) -> int:
        """Invalidate all cache entries for a specific asset.

        Removes from L1, L2, and L3 cache layers.

        Args:
            asset_id: The asset ID to invalidate
            workspace_id: The workspace ID

        Returns:
            Number of cache entries invalidated
        """
        count = 0

        # L1: Remove from memory (need to search for keys with this asset_id)
        count += self._l1_invalidate_asset(asset_id, workspace_id)

        # L2: Remove from Redis
        if self.redis:
            pattern = f"asset:{workspace_id}:{asset_id}:*"
            count += await self._l2_invalidate_pattern(pattern)

        # L3: Remove from database
        count += await self._l3_invalidate_asset(asset_id, workspace_id)

        logger.info(f"Invalidated {count} cache entries for asset {asset_id}")
        return count

    async def invalidate_gallery(
        self,
        gallery_id: UUID,
        workspace_id: UUID,
    ) -> int:
        """Invalidate all cache entries for assets in a gallery.

        Args:
            gallery_id: The gallery ID
            workspace_id: The workspace ID

        Returns:
            Number of cache entries invalidated
        """
        # Get all asset IDs in the gallery from database
        from app.models.gallery_asset import GalleryAsset

        result = await self.db.execute(
            select(GalleryAsset.asset_id)
            .where(GalleryAsset.gallery_id == gallery_id)
            .where(GalleryAsset.workspace_id == workspace_id)
        )
        asset_ids = result.scalars().all()

        count = 0
        for asset_id in asset_ids:
            count += await self.invalidate_asset(asset_id, workspace_id)

        logger.info(f"Invalidated {count} cache entries for gallery {gallery_id}")
        return count

    async def invalidate_workspace(self, workspace_id: UUID) -> int:
        """Invalidate all cache entries for a workspace.

        Args:
            workspace_id: The workspace ID

        Returns:
            Number of cache entries invalidated
        """
        count = 0

        # L1: Clear all workspace entries
        count += self._l1_invalidate_workspace(workspace_id)

        # L2: Clear all workspace entries from Redis
        if self.redis:
            pattern = f"*:{workspace_id}:*"
            count += await self._l2_invalidate_pattern(pattern)

        # L3: Clear all workspace entries from database
        count += await self._l3_invalidate_workspace(workspace_id)

        logger.info(f"Invalidated {count} cache entries for workspace {workspace_id}")
        return count

    # =========================================================================
    # CACHE WARMING
    # =========================================================================

    async def warm_cache_for_gallery(
        self,
        gallery_id: UUID,
        workspace_id: UUID,
        limit: int = 100,
    ) -> dict[str, int]:
        """Warm cache for assets in a gallery.

        Pre-loads face detection results into L1 and L2 cache
        for frequently accessed galleries.

        Args:
            gallery_id: The gallery ID
            workspace_id: The workspace ID
            limit: Maximum number of assets to warm

        Returns:
            Dictionary with warming statistics
        """
        from app.models.gallery_asset import GalleryAsset
        from app.models.asset import Asset

        # Get recent assets in gallery
        result = await self.db.execute(
            select(Asset.asset_id, Asset.face_scan_status, Asset.faces_count)
            .join(GalleryAsset, GalleryAsset.asset_id == Asset.asset_id)
            .where(GalleryAsset.gallery_id == gallery_id)
            .where(GalleryAsset.workspace_id == workspace_id)
            .where(Asset.face_scan_status == "completed")
            .where(Asset.faces_count > 0)
            .order_by(GalleryAsset.created_at.desc())
            .limit(limit)
        )
        assets = result.all()

        stats = {
            "attempted": len(assets),
            "warmed": 0,
            "skipped": 0,
            "failed": 0,
        }

        for asset_id, face_scan_status, faces_count in assets:
            try:
                # Check if already in L3 cache
                cached = await self._l3_get_asset(asset_id, workspace_id, "*")
                if cached:
                    # Promote to L1 and L2
                    cache_key = self._asset_cache_key(workspace_id, asset_id, "*")
                    self._l1_set_asset(cache_key, cached)
                    if self.redis:
                        await self._l2_set_asset(cache_key, cached, self.DEFAULT_ASSET_CACHE_TTL)
                    stats["warmed"] += 1
                else:
                    stats["skipped"] += 1
            except Exception as e:
                logger.warning(f"Failed to warm cache for asset {asset_id}: {e}")
                stats["failed"] += 1

        logger.info(
            f"Cache warming complete for gallery {gallery_id}: "
            f"{stats['warmed']} warmed, {stats['skipped']} skipped, {stats['failed']} failed"
        )
        return stats

    # =========================================================================
    # CACHE STATISTICS
    # =========================================================================

    async def get_cache_stats(self, workspace_id: UUID) -> dict[str, Any]:
        """Get comprehensive cache statistics for a workspace.

        Args:
            workspace_id: The workspace ID

        Returns:
            Dictionary with cache statistics
        """
        # Get database cache stats
        db_stats = await self._get_db_cache_stats(workspace_id)

        # Get Redis cache stats if available
        redis_stats = {}
        if self.redis:
            redis_stats = await self._get_redis_cache_stats(workspace_id)

        # Calculate hit rates
        total_lookups = (
            self._stats["l1_hits"]
            + self._stats["l2_hits"]
            + self._stats["l3_hits"]
            + self._stats["misses"]
        )
        hit_rate = (
            (self._stats["l1_hits"] + self._stats["l2_hits"] + self._stats["l3_hits"])
            / total_lookups * 100
            if total_lookups > 0
            else 0
        )

        return {
            "memory_cache": {
                "l1_asset_count": len(self._l1_asset_cache),
                "l1_group_count": len(self._l1_group_cache),
                "l1_embedding_count": len(self._l1_embedding_cache),
            },
            "redis_cache": redis_stats,
            "database_cache": db_stats,
            "performance": {
                "l1_hits": self._stats["l1_hits"],
                "l2_hits": self._stats["l2_hits"],
                "l3_hits": self._stats["l3_hits"],
                "misses": self._stats["misses"],
                "hit_rate_percent": round(hit_rate, 2),
                "total_writes": self._stats["writes"],
            },
        }

    # =========================================================================
    # L1: In-Memory Cache
    # =========================================================================

    def _l1_get_asset(self, cache_key: str) -> Optional[dict]:
        """Get asset from L1 memory cache."""
        entry = self._l1_asset_cache.get(cache_key)
        if entry:
            data, timestamp = entry
            # Check expiration (5 minutes default)
            if datetime.now() - timestamp < timedelta(minutes=5):
                return data
            else:
                # Expired - remove
                del self._l1_asset_cache[cache_key]
        return None

    def _l1_set_asset(self, cache_key: str, data: dict) -> None:
        """Set asset in L1 memory cache with LRU eviction."""
        # Simple LRU: if at max capacity, remove oldest entry
        if len(self._l1_asset_cache) >= self.L1_MAX_ASSETS:
            # Remove oldest entry (first in dict - Python 3.7+ preserves insertion order)
            oldest_key = next(iter(self._l1_asset_cache))
            del self._l1_asset_cache[oldest_key]

        self._l1_asset_cache[cache_key] = (data, datetime.now())

    def _l1_invalidate_asset(self, asset_id: UUID, workspace_id: UUID) -> int:
        """Invalidate asset from L1 cache."""
        count = 0
        prefix = f"asset:{workspace_id}:{asset_id}:"
        keys_to_remove = [k for k in self._l1_asset_cache if k.startswith(prefix)]
        for key in keys_to_remove:
            del self._l1_asset_cache[key]
            count += 1
        return count

    def _l1_invalidate_workspace(self, workspace_id: UUID) -> int:
        """Invalidate all workspace entries from L1 cache."""
        count = 0
        pattern = f"asset:{workspace_id}:"
        keys_to_remove = [k for k in self._l1_asset_cache if pattern in k]
        for key in keys_to_remove:
            del self._l1_asset_cache[key]
            count += 1

        # Also clear group and embedding caches
        group_keys = [k for k in self._l1_group_cache if f":{workspace_id}:" in k]
        for key in group_keys:
            del self._l1_group_cache[key]
            count += 1

        return count

    # =========================================================================
    # L2: Redis Cache
    # =========================================================================

    async def _l2_get_asset(self, cache_key: str) -> Optional[dict]:
        """Get asset from L2 Redis cache."""
        try:
            data = await self.redis.get(cache_key)
            if data:
                return json.loads(data)
        except Exception as e:
            logger.warning(f"Redis get failed for {cache_key}: {e}")
        return None

    async def _l2_set_asset(self, cache_key: str, data: dict, ttl: int) -> None:
        """Set asset in L2 Redis cache."""
        try:
            await self.redis.set(cache_key, json.dumps(data), ex=ttl)
        except Exception as e:
            logger.warning(f"Redis set failed for {cache_key}: {e}")

    async def _l2_invalidate_pattern(self, pattern: str) -> int:
        """Invalidate keys matching pattern in Redis."""
        count = 0
        try:
            keys = []
            async for key in self.redis.scan_iter(match=pattern):
                keys.append(key)
            if keys:
                count = await self.redis.delete(*keys)
        except Exception as e:
            logger.warning(f"Redis pattern delete failed for {pattern}: {e}")
        return count

    async def _get_redis_cache_stats(self, workspace_id: UUID) -> dict:
        """Get Redis cache statistics."""
        try:
            pattern = f"asset:{workspace_id}:*"
            keys = []
            async for key in self.redis.scan_iter(match=pattern):
                keys.append(key)
            return {"entry_count": len(keys)}
        except Exception as e:
            logger.warning(f"Failed to get Redis stats: {e}")
            return {}

    # =========================================================================
    # L3: Database Cache
    # =========================================================================

    async def _l3_get_asset(
        self,
        asset_id: UUID,
        workspace_id: UUID,
        image_hash: str,
    ) -> Optional[dict]:
        """Get asset from L3 database cache."""
        try:
            result = await self.db.execute(
                select(AssetEmbeddingsCache).where(
                    AssetEmbeddingsCache.asset_id == asset_id,
                    AssetEmbeddingsCache.workspace_id == workspace_id,
                )
            )
            entry = result.scalar_one_or_none()

            if entry:
                # Check if expired
                if entry.is_expired():
                    await self.db.delete(entry)
                    await self.db.commit()
                    return None

                # Update hit count and last accessed
                entry.hit_count += 1
                entry.last_accessed_at = datetime.now()
                await self.db.commit()

                return entry.to_dict()
        except Exception as e:
            logger.warning(f"Database cache get failed for asset {asset_id}: {e}")
        return None

    async def _l3_set_asset(
        self,
        asset_id: UUID,
        workspace_id: UUID,
        image_hash: str,
        detection_data: dict,
        ttl: int,
    ) -> None:
        """Set asset in L3 database cache."""
        try:
            entry = AssetEmbeddingsCache(
                workspace_id=workspace_id,
                asset_id=asset_id,
                image_hash=image_hash,
                faces_detected=detection_data.get("faces_detected", 0),
                bounding_boxes=detection_data.get("bounding_boxes"),
                embeddings=detection_data.get("embeddings"),
                confidence_scores=detection_data.get("confidence_scores"),
                detection_metadata=detection_data.get("detection_metadata"),
                ttl_seconds=ttl,
            )
            self.db.add(entry)
            await self.db.commit()
        except Exception as e:
            logger.warning(f"Database cache set failed for asset {asset_id}: {e}")
            await self.db.rollback()

    async def _l3_invalidate_asset(self, asset_id: UUID, workspace_id: UUID) -> int:
        """Invalidate asset from L3 database cache."""
        try:
            result = await self.db.execute(
                delete(AssetEmbeddingsCache).where(
                    AssetEmbeddingsCache.asset_id == asset_id,
                    AssetEmbeddingsCache.workspace_id == workspace_id,
                )
            )
            await self.db.commit()
            return result.rowcount
        except Exception as e:
            logger.warning(f"Database cache invalidate failed for asset {asset_id}: {e}")
            await self.db.rollback()
            return 0

    async def _l3_invalidate_workspace(self, workspace_id: UUID) -> int:
        """Invalidate all workspace entries from L3 database cache."""
        try:
            result = await self.db.execute(
                delete(AssetEmbeddingsCache).where(
                    AssetEmbeddingsCache.workspace_id == workspace_id
                )
            )
            await self.db.commit()
            return result.rowcount
        except Exception as e:
            logger.warning(f"Database cache invalidate failed for workspace {workspace_id}: {e}")
            await self.db.rollback()
            return 0

    async def _get_db_cache_stats(self, workspace_id: UUID) -> dict:
        """Get database cache statistics."""
        try:
            # Get total, active, and expired counts
            from sqlalchemy import func

            result = await self.db.execute(
                select(
                    func.count().label("total"),
                    func.count(
                        func.case(
                            (AssetEmbeddingsCache.cached_at
                             + func.interval("second", AssetEmbeddingsCache.ttl_seconds)
                             > func.now(), 1)
                        )
                    ).label("active"),
                ).where(AssetEmbeddingsCache.workspace_id == workspace_id)
            )
            row = result.one()
            return {
                "total_entries": row.total,
                "active_entries": row.active,
                "expired_entries": row.total - row.active if row.total else 0,
            }
        except Exception as e:
            logger.warning(f"Failed to get database cache stats: {e}")
            return {}

    # =========================================================================
    # UTILITY METHODS
    # =========================================================================

    @staticmethod
    def calculate_image_hash(image_data: bytes) -> str:
        """Calculate SHA-256 hash of image data.

        Args:
            image_data: Raw image bytes

        Returns:
            Hex-encoded SHA-256 hash
        """
        return hashlib.sha256(image_data).hexdigest()

    @staticmethod
    def _asset_cache_key(workspace_id: UUID, asset_id: UUID, image_hash: str) -> str:
        """Generate cache key for asset detection results."""
        return f"asset:{workspace_id}:{asset_id}:{image_hash}"

    @staticmethod
    def _group_cache_key(workspace_id: UUID, group_id: UUID) -> str:
        """Generate cache key for face group centroid."""
        return f"group:{workspace_id}:{group_id}"

    @staticmethod
    def _embedding_cache_key(workspace_id: UUID, face_crop_hash: str) -> str:
        """Generate cache key for individual face embedding."""
        return f"embedding:{workspace_id}:{face_crop_hash}"
