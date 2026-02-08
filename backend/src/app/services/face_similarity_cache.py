"""Face Similarity Index Cache Service.

This module provides caching for face group centroids to speed up
similarity searches and reduce database load.

Key Features:
- Centroid caching: Average embedding per face group
- Similarity search acceleration: Cached distances between groups
- Invalidation on group changes: Auto-update when faces are added/removed
- TTL-based expiration: Auto-refresh stale data

Performance Benefits:
- Avoid recomputing centroids on every similarity check
- Fast KNN search for similar faces
- Reduced database queries for group-level operations
"""

from __future__ import annotations

import logging
import pickle
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

import numpy as np
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.redis import get_redis_client
from app.db.schema import face_groups as face_groups_table
from app.repositories.face_cache_repository import FaceCacheRepository

logger = logging.getLogger(__name__)


# =============================================================================
# Redis Keys
# =============================================================================

# Cache key format: face_group_centroid:{workspace_id}:{group_id}
CENTROID_KEY = "face_group_centroid:{workspace_id}:{group_id}"

# Group similarity cache: similarity:{workspace_id}:{group_a_id}:{group_b_id}
SIMILARITY_KEY = "face_similarity:{workspace_id}:{group_a_id}:{group_b_id}"

# Group faces list: group_faces:{workspace_id}:{group_id}
GROUP_FACES_KEY = "group_faces:{workspace_id}:{group_id}"

# TTL configuration
CENTROID_TTL_SECONDS = 86400 * 7  # 7 days
SIMILARITY_TTL_SECONDS = 86400 * 1  # 1 day
GROUP_FACES_TTL_SECONDS = 3600  # 1 hour


# =============================================================================
# Service Class
# =============================================================================


class FaceSimilarityCacheService:
    """Cache service for face similarity operations.

    Provides caching for:
    - Face group centroids (average embeddings)
    - Similarity scores between face groups
    - Face lists for each group

    This reduces the need to fetch all face embeddings from the database
    for every similarity search operation.
    """

    def __init__(self, db: AsyncSession):
        """Initialize the similarity cache service.

        Args:
            db: Database session for fallback queries
        """
        self.db = db
        self.cache_repo = FaceCacheRepository(db)

    # =========================================================================
    # Centroid Caching
    # =========================================================================

    async def get_group_centroid(
        self,
        group_id: UUID,
        workspace_id: UUID,
    ) -> Optional[list[float]]:
        """Get cached centroid for a face group.

        The centroid is the average embedding of all faces in the group,
        useful for comparing groups without loading all individual faces.

        Args:
            group_id: The face group ID
            workspace_id: The workspace ID

        Returns:
            512-d centroid embedding, or None if not cached
        """
        redis = await get_redis_client()
        key = CENTROID_KEY.format(workspace_id=workspace_id, group_id=group_id)

        cached = await redis.get(key)
        if cached:
            try:
                return pickle.loads(cached)
            except (pickle.PickleError, EOFError) as e:
                logger.warning(f"Failed to unpickle centroid for group {group_id}: {e}")

        return None

    async def compute_and_cache_centroid(
        self,
        group_id: UUID,
        workspace_id: UUID,
    ) -> list[float] | None:
        """Compute centroid from database and cache it.

        Fetches all face embeddings for the group, computes the average,
        and stores it in cache for fast retrieval.

        Args:
            group_id: The face group ID
            workspace_id: The workspace ID

        Returns:
            512-d centroid embedding, or None if group has no faces
        """
        # Get all face embeddings for this group from database cache
        embeddings = await self.cache_repo.get_group_embeddings(
            group_id=group_id,
            workspace_id=workspace_id,
        )

        if not embeddings:
            logger.debug(f"No embeddings found for group {group_id}")
            return None

        # Compute centroid (mean of all embeddings)
        import numpy as np

        centroid = np.mean(embeddings, axis=0).tolist()

        # Normalize the centroid (L2 norm = 1)
        norm = np.linalg.norm(centroid)
        if norm > 0:
            centroid = (np.array(centroid) / norm).tolist()

        # Cache the centroid
        await self._cache_centroid(group_id, workspace_id, centroid)

        return centroid

    async def _cache_centroid(
        self,
        group_id: UUID,
        workspace_id: UUID,
        centroid: list[float],
    ) -> None:
        """Store centroid in cache.

        Args:
            group_id: The face group ID
            workspace_id: The workspace ID
            centroid: 512-d centroid embedding
        """
        redis = await get_redis_client()
        key = CENTROID_KEY.format(workspace_id=workspace_id, group_id=group_id)

        try:
            serialized = pickle.dumps(centroid)
            await redis.setex(key, CENTROID_TTL_SECONDS, serialized)
        except (pickle.PickleError, EOFError) as e:
            logger.error(f"Failed to serialize centroid for group {group_id}: {e}")

    async def invalidate_centroid(
        self,
        group_id: UUID,
        workspace_id: UUID,
    ) -> None:
        """Invalidate cached centroid for a group.

        Call this when faces are added/removed from a group.

        Args:
            group_id: The face group ID
            workspace_id: The workspace ID
        """
        redis = await get_redis_client()
        key = CENTROID_KEY.format(workspace_id=workspace_id, group_id=group_id)

        await redis.delete(key)

        # Also invalidate similarity scores involving this group
        await self._invalidate_group_similarities(group_id, workspace_id)

    async def invalidate_centroid_batch(
        self,
        group_ids: list[UUID],
        workspace_id: UUID,
    ) -> None:
        """Invalidate cached centroids for multiple groups.

        Useful after bulk operations like merging or splitting groups.

        Args:
            group_ids: List of face group IDs
            workspace_id: The workspace ID
        """
        if not group_ids:
            return

        redis = await get_redis_client()

        # Build keys for all groups
        keys = [
            CENTROID_KEY.format(workspace_id=workspace_id, group_id=gid)
            for gid in group_ids
        ]

        if keys:
            await redis.delete(*keys)

        # Invalidate similarities for all affected groups
        for group_id in group_ids:
            await self._invalidate_group_similarities(group_id, workspace_id)

    # =========================================================================
    # Similarity Caching
    # =========================================================================

    async def get_similarity(
        self,
        group_a_id: UUID,
        group_b_id: UUID,
        workspace_id: UUID,
    ) -> Optional[float]:
        """Get cached similarity between two face groups.

        Similarity is cosine similarity between group centroids.
        Range: -1.0 (opposite) to 1.0 (identical)

        Args:
            group_a_id: First face group ID
            group_b_id: Second face group ID
            workspace_id: The workspace ID

        Returns:
            Similarity score, or None if not cached
        """
        redis = await get_redis_client()

        # Try both orderings (similarity is symmetric)
        key1 = SIMILARITY_KEY.format(
            workspace_id=workspace_id,
            group_a_id=group_a_id,
            group_b_id=group_b_id,
        )
        key2 = SIMILARITY_KEY.format(
            workspace_id=workspace_id,
            group_a_id=group_b_id,
            group_b_id=group_a_id,
        )

        # Check both keys
        for key in (key1, key2):
            cached = await redis.get(key)
            if cached:
                try:
                    return float(cached)
                except ValueError:
                    pass

        return None

    async def compute_and_cache_similarity(
        self,
        group_a_id: UUID,
        group_b_id: UUID,
        workspace_id: UUID,
    ) -> float | None:
        """Compute similarity between two groups and cache it.

        Args:
            group_a_id: First face group ID
            group_b_id: Second face group ID
            workspace_id: The workspace ID

        Returns:
            Similarity score (-1.0 to 1.0), or None if centroids unavailable
        """
        # Get or compute centroids for both groups
        centroid_a = await self.get_group_centroid(group_a_id, workspace_id)
        if centroid_a is None:
            centroid_a = await self.compute_and_cache_centroid(group_a_id, workspace_id)
            if centroid_a is None:
                return None

        centroid_b = await self.get_group_centroid(group_b_id, workspace_id)
        if centroid_b is None:
            centroid_b = await self.compute_and_cache_centroid(group_b_id, workspace_id)
            if centroid_b is None:
                return None

        # Compute cosine similarity
        import numpy as np

        a = np.array(centroid_a)
        b = np.array(centroid_b)

        similarity = float(np.dot(a, b))  # Both are normalized

        # Cache the similarity (use lower ID first for consistent key)
        key = SIMILARITY_KEY.format(
            workspace_id=workspace_id,
            group_a_id=min(group_a_id, group_b_id),
            group_b_id=max(group_a_id, group_b_id),
        )

        redis = await get_redis_client()
        await redis.setex(key, SIMILARITY_TTL_SECONDS, str(similarity))

        return similarity

    async def _invalidate_group_similarities(
        self,
        group_id: UUID,
        workspace_id: UUID,
    ) -> None:
        """Invalidate all similarity scores for a group.

        Uses Redis SCAN to find and delete all similarity keys for the group.

        Args:
            group_id: The face group ID
            workspace_id: The workspace ID
        """
        redis = await get_redis_client()

        # Pattern to match similarity keys for this group
        pattern = f"face_similarity:{workspace_id}:*"

        async for key in redis.scan_iter(match=pattern, count=100):
            key_str = key.decode() if isinstance(key, bytes) else key

            # Check if this key involves our group
            parts = key_str.split(":")
            if len(parts) == 4:
                _, _, group_a, group_b = parts
                if group_a == str(group_id) or group_b == str(group_id):
                    await redis.delete(key_str)

    # =========================================================================
    # Group Faces Caching
    # =========================================================================

    async def get_group_faces(
        self,
        group_id: UUID,
        workspace_id: UUID,
    ) -> Optional[list[dict[str, Any]]]:
        """Get cached list of faces in a group.

        Returns basic face info (id, asset_id, bounding_box) without
        loading full face records from database.

        Args:
            group_id: The face group ID
            workspace_id: The workspace ID

        Returns:
            List of face info dicts, or None if not cached
        """
        redis = await get_redis_client()
        key = GROUP_FACES_KEY.format(workspace_id=workspace_id, group_id=group_id)

        cached = await redis.get(key)
        if cached:
            try:
                return pickle.loads(cached)
            except (pickle.PickleError, EOFError):
                pass

        return None

    async def cache_group_faces(
        self,
        group_id: UUID,
        workspace_id: UUID,
        faces: list[dict[str, Any]],
    ) -> None:
        """Cache list of faces in a group.

        Args:
            group_id: The face group ID
            workspace_id: The workspace ID
            faces: List of face info dicts
        """
        redis = await get_redis_client()
        key = GROUP_FACES_KEY.format(workspace_id=workspace_id, group_id=group_id)

        try:
            serialized = pickle.dumps(faces)
            await redis.setex(key, GROUP_FACES_TTL_SECONDS, serialized)
        except (pickle.PickleError, EOFError) as e:
            logger.error(f"Failed to serialize faces for group {group_id}: {e}")

    async def invalidate_group_faces(
        self,
        group_id: UUID,
        workspace_id: UUID,
    ) -> None:
        """Invalidate cached faces list for a group.

        Args:
            group_id: The face group ID
            workspace_id: The workspace ID
        """
        redis = await get_redis_client()
        key = GROUP_FACES_KEY.format(workspace_id=workspace_id, group_id=group_id)

        await redis.delete(key)

    # =========================================================================
    # Bulk Operations
    # =========================================================================

    async def warm_similarity_index(
        self,
        workspace_id: UUID,
        group_ids: Optional[list[UUID]] = None,
    ) -> dict[str, int]:
        """Warm similarity cache for face groups.

        Pre-computes centroids for groups to speed up subsequent
        similarity searches.

        Args:
            workspace_id: The workspace ID
            group_ids: List of group IDs to warm (None = all active groups)

        Returns:
            Dictionary with warming statistics
        """
        # Get all active groups if not specified
        if group_ids is None:
            result = await self.db.execute(
                select(face_groups_table.c.id).where(
                    face_groups_table.c.workspace_id == workspace_id,
                )
            )
            group_ids = [row[0] for row in result]

        warmed = 0
        skipped = 0
        failed = 0

        for group_id in group_ids:
            try:
                # Check if already cached
                existing = await self.get_group_centroid(group_id, workspace_id)
                if existing:
                    skipped += 1
                    continue

                # Compute and cache centroid
                centroid = await self.compute_and_cache_centroid(group_id, workspace_id)
                if centroid:
                    warmed += 1
                else:
                    skipped += 1  # No faces in group

            except Exception as e:
                logger.error(f"Failed to warm centroid for group {group_id}: {e}")
                failed += 1

        return {
            "workspace_id": str(workspace_id),
            "attempted": len(group_ids),
            "warmed": warmed,
            "skipped": skipped,
            "failed": failed,
        }

    async def find_similar_groups(
        self,
        group_id: UUID,
        workspace_id: UUID,
        threshold: float = 0.85,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """Find face groups similar to the given group.

        Uses cached centroids and similarities for fast lookup.

        Args:
            group_id: The face group ID to find similar groups for
            workspace_id: The workspace ID
            threshold: Minimum similarity score (0.0 to 1.0)
            limit: Maximum number of similar groups to return

        Returns:
            List of similar groups with similarity scores
        """
        # Get the target centroid
        target_centroid = await self.get_group_centroid(group_id, workspace_id)
        if target_centroid is None:
            target_centroid = await self.compute_and_cache_centroid(group_id, workspace_id)
            if target_centroid is None:
                return []  # Group has no faces

        # Get all other groups
        result = await self.db.execute(
            select(face_groups_table.c.id, face_groups_table.c.name).where(
                face_groups_table.c.workspace_id == workspace_id,
                face_groups_table.c.id != group_id,
            )
        )
        groups = [{"id": row[0], "name": row[1]} for row in result]

        # Check similarity for each group
        similar_groups = []
        import numpy as np

        target_vec = np.array(target_centroid)

        for group in groups:
            # Try cache first
            similarity = await self.get_similarity(group_id, workspace_id, group["id"])

            if similarity is None:
                # Compute on-the-fly and cache
                group_centroid = await self.get_group_centroid(group["id"], workspace_id)
                if group_centroid:
                    similarity = float(np.dot(target_vec, np.array(group_centroid)))
                    await self._cache_similarity(
                        group_id, group["id"], workspace_id, similarity
                    )

            if similarity is not None and similarity >= threshold:
                similar_groups.append({
                    "group_id": group["id"],
                    "name": group["name"],
                    "similarity": similarity,
                })

        # Sort by similarity (descending) and limit
        similar_groups.sort(key=lambda x: x["similarity"], reverse=True)
        return similar_groups[:limit]

    async def _cache_similarity(
        self,
        group_a_id: UUID,
        group_b_id: UUID,
        workspace_id: UUID,
        similarity: float,
    ) -> None:
        """Store similarity in cache.

        Args:
            group_a_id: First face group ID
            group_b_id: Second face group ID
            workspace_id: The workspace ID
            similarity: Similarity score
        """
        redis = await get_redis_client()

        # Use lower ID first for consistent key
        key = SIMILARITY_KEY.format(
            workspace_id=workspace_id,
            group_a_id=min(group_a_id, group_b_id),
            group_b_id=max(group_a_id, group_b_id),
        )

        await redis.setex(key, SIMILARITY_TTL_SECONDS, str(similarity))


# =============================================================================
# Singleton Instance
# =============================================================================

# Note: Not using a true singleton here because database sessions
# should not be held long-term. Instead, create a new instance per request.
# Redis connection pooling is handled by the redis client.


def get_similarity_cache(db: AsyncSession, workspace_id: UUID) -> FaceSimilarityCacheService:
    """Get a similarity cache service instance.

    Args:
        db: Database session
        workspace_id: The workspace ID

    Returns:
        FaceSimilarityCacheService instance
    """
    return FaceSimilarityCacheService(db)
