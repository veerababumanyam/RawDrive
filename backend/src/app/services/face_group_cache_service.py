"""Face Group Cache Service.

Provides caching layer for face group operations to improve performance
and reduce database load.

Feature: Face Detection Audit Remediation (002-face-audit-remediation)
Finding: PERF-001 - Face Group Caching

Tasks: T025-T029
"""

from __future__ import annotations

import logging
from typing import Any, Optional
from uuid import UUID

from app.services.cache_service import CacheService, CacheLayer, get_cache_service

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Cache Configuration
# ---------------------------------------------------------------------------


# Default TTLs for face group cache (in seconds)
FACE_GROUP_LIST_TTL = 300  # 5 minutes for group lists
FACE_GROUP_DETAIL_TTL = 600  # 10 minutes for group details
FACE_GROUP_STATS_TTL = 60  # 1 minute for statistics (more volatile)
FACE_GROUP_SUGGESTIONS_TTL = 900  # 15 minutes for merge suggestions
FACE_GROUP_SIMILAR_TTL = 600  # 10 minutes for similar groups

# Cache key prefixes
PREFIX_FACE_GROUP = "face_group"
PREFIX_FACE_GROUP_LIST = "face_group_list"
PREFIX_FACE_GROUP_STATS = "face_group_stats"
PREFIX_FACE_GROUP_SUGGESTIONS = "face_group_suggestions"
PREFIX_FACE_GROUP_SIMILAR = "face_group_similar"
PREFIX_FACE_GROUP_GALLERY = "face_group_gallery"


# ---------------------------------------------------------------------------
# Face Group Cache Service (T025)
# ---------------------------------------------------------------------------


class FaceGroupCacheService:
    """Cache service specialized for face group operations.

    Provides caching for:
    - Face group lists by workspace
    - Face group details
    - Face group statistics
    - Merge suggestions
    - Similar groups

    Cache invalidation is handled automatically when groups are modified.
    """

    def __init__(self) -> None:
        """Initialize the face group cache service."""
        # Use COMPUTED layer for face group data (1 hour default TTL)
        self._cache = get_cache_service(CacheLayer.COMPUTED, version=1)

    # -----------------------------------------------------------------------
    # Face Group List Cache (T026)
    # -----------------------------------------------------------------------

    async def get_face_group_list(
        self,
        workspace_id: UUID,
        page: int = 1,
        limit: int = 50,
        order_by: str = "face_count",
        order_desc: bool = True,
        min_faces: Optional[int] = None,
    ) -> Optional[dict[str, Any]]:
        """Get cached face group list for a workspace.

        Args:
            workspace_id: Workspace ID
            page: Page number
            limit: Items per page
            order_by: Sort field
            order_desc: Sort descending
            min_faces: Minimum faces filter

        Returns:
            Cached list data or None if not cached
        """
        cache_key_params = f"{page}:{limit}:{order_by}:{order_desc}:{min_faces or 0}"
        return await self._cache.get(
            PREFIX_FACE_GROUP_LIST, str(workspace_id), cache_key_params
        )

    async def set_face_group_list(
        self,
        workspace_id: UUID,
        page: int,
        limit: int,
        order_by: str,
        order_desc: bool,
        min_faces: Optional[int],
        data: dict[str, Any],
        ttl: int = FACE_GROUP_LIST_TTL,
    ) -> bool:
        """Cache face group list for a workspace.

        Args:
            workspace_id: Workspace ID
            page: Page number
            limit: Items per page
            order_by: Sort field
            order_desc: Sort descending
            min_faces: Minimum faces filter
            data: List data to cache
            ttl: Time to live in seconds

        Returns:
            True if cached successfully
        """
        cache_key_params = f"{page}:{limit}:{order_by}:{order_desc}:{min_faces or 0}"
        return await self._cache.set(
            PREFIX_FACE_GROUP_LIST, str(workspace_id), cache_key_params,
            value=data, ttl=ttl
        )

    async def invalidate_face_group_lists(self, workspace_id: UUID) -> int:
        """Invalidate all cached group lists for a workspace.

        Args:
            workspace_id: Workspace ID

        Returns:
            Number of cache entries invalidated
        """
        return await self._cache.invalidate_pattern(
            PREFIX_FACE_GROUP_LIST, str(workspace_id)
        )

    # -----------------------------------------------------------------------
    # Face Group Detail Cache (T027)
    # -----------------------------------------------------------------------

    async def get_face_group_detail(
        self,
        workspace_id: UUID,
        group_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get cached face group detail.

        Args:
            workspace_id: Workspace ID
            group_id: Face group ID

        Returns:
            Cached group detail or None if not cached
        """
        return await self._cache.get(
            PREFIX_FACE_GROUP, str(workspace_id), str(group_id)
        )

    async def set_face_group_detail(
        self,
        workspace_id: UUID,
        group_id: UUID,
        data: dict[str, Any],
        ttl: int = FACE_GROUP_DETAIL_TTL,
    ) -> bool:
        """Cache face group detail.

        Args:
            workspace_id: Workspace ID
            group_id: Face group ID
            data: Group detail data to cache
            ttl: Time to live in seconds

        Returns:
            True if cached successfully
        """
        return await self._cache.set(
            PREFIX_FACE_GROUP, str(workspace_id), str(group_id),
            value=data, ttl=ttl
        )

    async def invalidate_face_group_detail(
        self,
        workspace_id: UUID,
        group_id: UUID,
    ) -> bool:
        """Invalidate cached face group detail.

        Args:
            workspace_id: Workspace ID
            group_id: Face group ID

        Returns:
            True if cache entry was deleted
        """
        return await self._cache.delete(
            PREFIX_FACE_GROUP, str(workspace_id), str(group_id)
        )

    # -----------------------------------------------------------------------
    # Face Group Statistics Cache (T028)
    # -----------------------------------------------------------------------

    async def get_face_group_stats(
        self,
        workspace_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get cached face group statistics for a workspace.

        Args:
            workspace_id: Workspace ID

        Returns:
            Cached statistics or None if not cached
        """
        return await self._cache.get(
            PREFIX_FACE_GROUP_STATS, str(workspace_id)
        )

    async def set_face_group_stats(
        self,
        workspace_id: UUID,
        data: dict[str, Any],
        ttl: int = FACE_GROUP_STATS_TTL,
    ) -> bool:
        """Cache face group statistics for a workspace.

        Args:
            workspace_id: Workspace ID
            data: Statistics data to cache
            ttl: Time to live in seconds

        Returns:
            True if cached successfully
        """
        return await self._cache.set(
            PREFIX_FACE_GROUP_STATS, str(workspace_id),
            value=data, ttl=ttl
        )

    async def invalidate_face_group_stats(
        self,
        workspace_id: UUID,
    ) -> bool:
        """Invalidate cached face group statistics.

        Args:
            workspace_id: Workspace ID

        Returns:
            True if cache entry was deleted
        """
        return await self._cache.delete(
            PREFIX_FACE_GROUP_STATS, str(workspace_id)
        )

    # -----------------------------------------------------------------------
    # Merge Suggestions Cache
    # -----------------------------------------------------------------------

    async def get_merge_suggestions(
        self,
        workspace_id: UUID,
        threshold: float,
        limit: int,
    ) -> Optional[list[dict[str, Any]]]:
        """Get cached merge suggestions.

        Args:
            workspace_id: Workspace ID
            threshold: Similarity threshold
            limit: Maximum suggestions

        Returns:
            Cached suggestions or None if not cached
        """
        cache_key_params = f"{threshold}:{limit}"
        return await self._cache.get(
            PREFIX_FACE_GROUP_SUGGESTIONS, str(workspace_id), cache_key_params
        )

    async def set_merge_suggestions(
        self,
        workspace_id: UUID,
        threshold: float,
        limit: int,
        data: list[dict[str, Any]],
        ttl: int = FACE_GROUP_SUGGESTIONS_TTL,
    ) -> bool:
        """Cache merge suggestions.

        Args:
            workspace_id: Workspace ID
            threshold: Similarity threshold
            limit: Maximum suggestions
            data: Suggestions data to cache
            ttl: Time to live in seconds

        Returns:
            True if cached successfully
        """
        cache_key_params = f"{threshold}:{limit}"
        return await self._cache.set(
            PREFIX_FACE_GROUP_SUGGESTIONS, str(workspace_id), cache_key_params,
            value=data, ttl=ttl
        )

    async def invalidate_merge_suggestions(
        self,
        workspace_id: UUID,
    ) -> int:
        """Invalidate all cached merge suggestions for a workspace.

        Args:
            workspace_id: Workspace ID

        Returns:
            Number of cache entries invalidated
        """
        return await self._cache.invalidate_pattern(
            PREFIX_FACE_GROUP_SUGGESTIONS, str(workspace_id)
        )

    # -----------------------------------------------------------------------
    # Similar Groups Cache
    # -----------------------------------------------------------------------

    async def get_similar_groups(
        self,
        workspace_id: UUID,
        group_id: UUID,
        threshold: float,
        limit: int,
    ) -> Optional[list[dict[str, Any]]]:
        """Get cached similar groups.

        Args:
            workspace_id: Workspace ID
            group_id: Source group ID
            threshold: Similarity threshold
            limit: Maximum results

        Returns:
            Cached similar groups or None if not cached
        """
        cache_key_params = f"{threshold}:{limit}"
        return await self._cache.get(
            PREFIX_FACE_GROUP_SIMILAR, str(workspace_id), str(group_id), cache_key_params
        )

    async def set_similar_groups(
        self,
        workspace_id: UUID,
        group_id: UUID,
        threshold: float,
        limit: int,
        data: list[dict[str, Any]],
        ttl: int = FACE_GROUP_SIMILAR_TTL,
    ) -> bool:
        """Cache similar groups.

        Args:
            workspace_id: Workspace ID
            group_id: Source group ID
            threshold: Similarity threshold
            limit: Maximum results
            data: Similar groups data to cache
            ttl: Time to live in seconds

        Returns:
            True if cached successfully
        """
        cache_key_params = f"{threshold}:{limit}"
        return await self._cache.set(
            PREFIX_FACE_GROUP_SIMILAR, str(workspace_id), str(group_id), cache_key_params,
            value=data, ttl=ttl
        )

    async def invalidate_similar_groups(
        self,
        workspace_id: UUID,
        group_id: Optional[UUID] = None,
    ) -> int:
        """Invalidate cached similar groups.

        Args:
            workspace_id: Workspace ID
            group_id: Optional specific group ID (invalidates all if not provided)

        Returns:
            Number of cache entries invalidated
        """
        if group_id:
            return await self._cache.invalidate_pattern(
                PREFIX_FACE_GROUP_SIMILAR, str(workspace_id), str(group_id)
            )
        return await self._cache.invalidate_pattern(
            PREFIX_FACE_GROUP_SIMILAR, str(workspace_id)
        )

    # -----------------------------------------------------------------------
    # Gallery Face Groups Cache
    # -----------------------------------------------------------------------

    async def get_gallery_face_groups(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        page: int = 1,
        limit: int = 50,
        search: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        """Get cached face groups for a gallery.

        Args:
            workspace_id: Workspace ID
            gallery_id: Gallery ID
            page: Page number
            limit: Items per page
            search: Search term

        Returns:
            Cached gallery groups or None if not cached
        """
        cache_key_params = f"{page}:{limit}:{search or ''}"
        return await self._cache.get(
            PREFIX_FACE_GROUP_GALLERY, str(workspace_id), str(gallery_id), cache_key_params
        )

    async def set_gallery_face_groups(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        page: int,
        limit: int,
        search: Optional[str],
        data: dict[str, Any],
        ttl: int = FACE_GROUP_LIST_TTL,
    ) -> bool:
        """Cache face groups for a gallery.

        Args:
            workspace_id: Workspace ID
            gallery_id: Gallery ID
            page: Page number
            limit: Items per page
            search: Search term
            data: Gallery groups data to cache
            ttl: Time to live in seconds

        Returns:
            True if cached successfully
        """
        cache_key_params = f"{page}:{limit}:{search or ''}"
        return await self._cache.set(
            PREFIX_FACE_GROUP_GALLERY, str(workspace_id), str(gallery_id), cache_key_params,
            value=data, ttl=ttl
        )

    async def invalidate_gallery_face_groups(
        self,
        workspace_id: UUID,
        gallery_id: Optional[UUID] = None,
    ) -> int:
        """Invalidate cached gallery face groups.

        Args:
            workspace_id: Workspace ID
            gallery_id: Optional specific gallery ID

        Returns:
            Number of cache entries invalidated
        """
        if gallery_id:
            return await self._cache.invalidate_pattern(
                PREFIX_FACE_GROUP_GALLERY, str(workspace_id), str(gallery_id)
            )
        return await self._cache.invalidate_pattern(
            PREFIX_FACE_GROUP_GALLERY, str(workspace_id)
        )

    # -----------------------------------------------------------------------
    # Bulk Invalidation (T029)
    # -----------------------------------------------------------------------

    async def invalidate_workspace_cache(self, workspace_id: UUID) -> int:
        """Invalidate all face group caches for a workspace.

        Called when significant changes occur (e.g., bulk operations).

        Args:
            workspace_id: Workspace ID

        Returns:
            Total number of cache entries invalidated
        """
        total = 0
        total += await self.invalidate_face_group_lists(workspace_id)
        total += await self._cache.invalidate_pattern(
            PREFIX_FACE_GROUP, str(workspace_id)
        )
        total += await self.invalidate_face_group_stats(workspace_id)
        total += await self.invalidate_merge_suggestions(workspace_id)
        total += await self.invalidate_similar_groups(workspace_id)
        total += await self.invalidate_gallery_face_groups(workspace_id)

        logger.info(
            "Invalidated face group cache",
            extra={
                "workspace_id": str(workspace_id),
                "entries_invalidated": total,
            },
        )
        return total

    async def invalidate_on_group_change(
        self,
        workspace_id: UUID,
        group_id: UUID,
    ) -> int:
        """Invalidate caches affected by a group change.

        Args:
            workspace_id: Workspace ID
            group_id: Changed group ID

        Returns:
            Total number of cache entries invalidated
        """
        total = 0
        # Invalidate specific group detail
        await self.invalidate_face_group_detail(workspace_id, group_id)
        total += 1

        # Invalidate lists (group may have changed position)
        total += await self.invalidate_face_group_lists(workspace_id)

        # Invalidate stats (face counts may have changed)
        await self.invalidate_face_group_stats(workspace_id)
        total += 1

        # Invalidate similar groups for this specific group
        total += await self.invalidate_similar_groups(workspace_id, group_id)

        # Invalidate merge suggestions (similarity scores may have changed)
        total += await self.invalidate_merge_suggestions(workspace_id)

        return total

    async def invalidate_on_merge(
        self,
        workspace_id: UUID,
        source_group_ids: list[UUID],
        target_group_id: UUID,
    ) -> int:
        """Invalidate caches affected by a merge operation.

        Args:
            workspace_id: Workspace ID
            source_group_ids: Source group IDs (deleted)
            target_group_id: Target group ID

        Returns:
            Total number of cache entries invalidated
        """
        total = 0

        # Invalidate all affected group details
        for group_id in source_group_ids:
            await self.invalidate_face_group_detail(workspace_id, group_id)
            total += 1
        await self.invalidate_face_group_detail(workspace_id, target_group_id)
        total += 1

        # Invalidate lists (groups deleted/changed)
        total += await self.invalidate_face_group_lists(workspace_id)

        # Invalidate stats
        await self.invalidate_face_group_stats(workspace_id)
        total += 1

        # Invalidate all similar groups and suggestions
        total += await self.invalidate_similar_groups(workspace_id)
        total += await self.invalidate_merge_suggestions(workspace_id)

        # Invalidate gallery caches (group membership may have changed)
        total += await self.invalidate_gallery_face_groups(workspace_id)

        return total


# ---------------------------------------------------------------------------
# Service Factory
# ---------------------------------------------------------------------------


_face_group_cache: Optional[FaceGroupCacheService] = None


def get_face_group_cache_service() -> FaceGroupCacheService:
    """Get the face group cache service singleton.

    Returns:
        FaceGroupCacheService instance
    """
    global _face_group_cache
    if _face_group_cache is None:
        _face_group_cache = FaceGroupCacheService()
    return _face_group_cache
