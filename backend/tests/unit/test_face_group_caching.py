"""Unit tests for face group caching.

Tests the Redis caching layer for face group queries (PERF-001).

Feature: Face Detection Audit Remediation (002-face-audit-remediation)
Task: T070 - Unit test for face group caching
Finding: PERF-001 (No caching for face groups)
"""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.repositories.face_group_repository import (
    FACE_GROUP_CACHE_PREFIX,
    FACE_GROUP_CACHE_TTL,
    FaceGroupCache,
    FaceGroupRepository,
    get_face_group_cache,
    get_face_group_repository,
)
from app.services.cache_service import CacheLayer


# =============================================================================
# TEST FIXTURES
# =============================================================================


@pytest.fixture
def workspace_id():
    """Sample workspace ID."""
    return uuid.uuid4()


@pytest.fixture
def gallery_id():
    """Sample gallery ID."""
    return uuid.uuid4()


@pytest.fixture
def group_id():
    """Sample face group ID."""
    return uuid.uuid4()


@pytest.fixture
def face_id():
    """Sample face ID."""
    return uuid.uuid4()


@pytest.fixture
def sample_face_groups():
    """Sample face group data for caching tests."""
    return [
        {
            "id": uuid.uuid4(),
            "name": "Person 1",
            "face_count": 10,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "gallery_photo_count": 5,
            "gallery_face_count": 8,
            "rep_face_id": uuid.uuid4(),
            "rep_thumbnail_urls": {"sm": "url1", "md": "url2"},
            "person_id": uuid.uuid4(),
            "person_name": "John Doe",
        },
        {
            "id": uuid.uuid4(),
            "name": "Person 2",
            "face_count": 5,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "gallery_photo_count": 3,
            "gallery_face_count": 4,
            "rep_face_id": uuid.uuid4(),
            "rep_thumbnail_urls": {"sm": "url3", "md": "url4"},
            "person_id": uuid.uuid4(),
            "person_name": "Jane Smith",
        },
    ]


@pytest.fixture
def mock_cache_service():
    """Mock CacheService for testing."""
    cache = MagicMock()
    cache.get = AsyncMock(return_value=None)
    cache.set = AsyncMock(return_value=True)
    cache.delete = AsyncMock(return_value=True)
    cache.invalidate_pattern = AsyncMock(return_value=5)
    return cache


# =============================================================================
# CACHE CONFIGURATION TESTS
# =============================================================================


class TestCacheConfiguration:
    """Tests for cache configuration constants."""

    def test_cache_ttl_is_120_seconds(self):
        """Cache TTL should be 120 seconds (2 minutes) per PERF-001."""
        assert FACE_GROUP_CACHE_TTL == 120

    def test_cache_prefix_is_face_groups(self):
        """Cache prefix should be 'face_groups'."""
        assert FACE_GROUP_CACHE_PREFIX == "face_groups"


# =============================================================================
# FACE GROUP CACHE CLASS TESTS
# =============================================================================


class TestFaceGroupCacheKeyBuilding:
    """Tests for FaceGroupCache key building methods."""

    def test_build_gallery_key_format(self, workspace_id, gallery_id):
        """Should build gallery key with correct format."""
        cache = FaceGroupCache()
        key = cache._build_gallery_key(workspace_id, gallery_id, 0, 50)

        assert key == (
            FACE_GROUP_CACHE_PREFIX,
            "gallery",
            str(workspace_id),
            str(gallery_id),
            "0",
            "50",
        )

    def test_build_gallery_key_with_different_pagination(self, workspace_id, gallery_id):
        """Should include pagination in key."""
        cache = FaceGroupCache()

        key1 = cache._build_gallery_key(workspace_id, gallery_id, 0, 50)
        key2 = cache._build_gallery_key(workspace_id, gallery_id, 50, 50)
        key3 = cache._build_gallery_key(workspace_id, gallery_id, 0, 100)

        # All should be different due to pagination
        assert key1 != key2
        assert key1 != key3
        assert key2 != key3

    def test_build_count_key_format(self, workspace_id, gallery_id):
        """Should build count key with correct format."""
        cache = FaceGroupCache()
        key = cache._build_count_key(workspace_id, gallery_id)

        assert key == (
            FACE_GROUP_CACHE_PREFIX,
            "count",
            str(workspace_id),
            str(gallery_id),
        )


class TestFaceGroupCacheGetOperations:
    """Tests for FaceGroupCache get operations."""

    @pytest.mark.asyncio
    async def test_get_gallery_groups_returns_cached_data(
        self, workspace_id, gallery_id, sample_face_groups, mock_cache_service
    ):
        """Should return cached data when present."""
        mock_cache_service.get = AsyncMock(return_value=sample_face_groups)

        with patch.object(FaceGroupCache, "__init__", lambda self: None):
            cache = FaceGroupCache()
            cache._cache = mock_cache_service

            result = await cache.get_gallery_groups(
                workspace_id, gallery_id, 0, 50
            )

            assert result == sample_face_groups
            mock_cache_service.get.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_gallery_groups_returns_none_on_miss(
        self, workspace_id, gallery_id, mock_cache_service
    ):
        """Should return None when cache miss."""
        mock_cache_service.get = AsyncMock(return_value=None)

        with patch.object(FaceGroupCache, "__init__", lambda self: None):
            cache = FaceGroupCache()
            cache._cache = mock_cache_service

            result = await cache.get_gallery_groups(
                workspace_id, gallery_id, 0, 50
            )

            assert result is None

    @pytest.mark.asyncio
    async def test_get_gallery_count_returns_cached_count(
        self, workspace_id, gallery_id, mock_cache_service
    ):
        """Should return cached count when present."""
        mock_cache_service.get = AsyncMock(return_value=42)

        with patch.object(FaceGroupCache, "__init__", lambda self: None):
            cache = FaceGroupCache()
            cache._cache = mock_cache_service

            result = await cache.get_gallery_count(workspace_id, gallery_id)

            assert result == 42

    @pytest.mark.asyncio
    async def test_get_gallery_count_returns_none_on_miss(
        self, workspace_id, gallery_id, mock_cache_service
    ):
        """Should return None when count not cached."""
        mock_cache_service.get = AsyncMock(return_value=None)

        with patch.object(FaceGroupCache, "__init__", lambda self: None):
            cache = FaceGroupCache()
            cache._cache = mock_cache_service

            result = await cache.get_gallery_count(workspace_id, gallery_id)

            assert result is None


class TestFaceGroupCacheSetOperations:
    """Tests for FaceGroupCache set operations."""

    @pytest.mark.asyncio
    async def test_set_gallery_groups_with_correct_ttl(
        self, workspace_id, gallery_id, sample_face_groups, mock_cache_service
    ):
        """Should set cache with 120 second TTL."""
        with patch.object(FaceGroupCache, "__init__", lambda self: None):
            cache = FaceGroupCache()
            cache._cache = mock_cache_service

            result = await cache.set_gallery_groups(
                workspace_id, gallery_id, 0, 50, sample_face_groups
            )

            assert result is True
            mock_cache_service.set.assert_called_once()
            call_kwargs = mock_cache_service.set.call_args
            # TTL should be FACE_GROUP_CACHE_TTL (120)
            assert call_kwargs[1]["ttl"] == FACE_GROUP_CACHE_TTL

    @pytest.mark.asyncio
    async def test_set_gallery_count_with_correct_ttl(
        self, workspace_id, gallery_id, mock_cache_service
    ):
        """Should set count cache with 120 second TTL."""
        with patch.object(FaceGroupCache, "__init__", lambda self: None):
            cache = FaceGroupCache()
            cache._cache = mock_cache_service

            result = await cache.set_gallery_count(workspace_id, gallery_id, 25)

            assert result is True
            mock_cache_service.set.assert_called_once()
            call_kwargs = mock_cache_service.set.call_args
            assert call_kwargs[1]["ttl"] == FACE_GROUP_CACHE_TTL


class TestFaceGroupCacheInvalidation:
    """Tests for FaceGroupCache invalidation operations."""

    @pytest.mark.asyncio
    async def test_invalidate_workspace_calls_pattern_invalidation(
        self, workspace_id, mock_cache_service
    ):
        """Should invalidate all cache entries for a workspace."""
        mock_cache_service.invalidate_pattern = AsyncMock(return_value=10)

        with patch.object(FaceGroupCache, "__init__", lambda self: None):
            cache = FaceGroupCache()
            cache._cache = mock_cache_service

            result = await cache.invalidate_workspace(workspace_id)

            assert result == 10
            mock_cache_service.invalidate_pattern.assert_called_once_with(
                FACE_GROUP_CACHE_PREFIX, "*", str(workspace_id)
            )

    @pytest.mark.asyncio
    async def test_invalidate_gallery_clears_gallery_queries(
        self, workspace_id, gallery_id, mock_cache_service
    ):
        """Should invalidate gallery queries and count."""
        mock_cache_service.invalidate_pattern = AsyncMock(return_value=5)
        mock_cache_service.delete = AsyncMock(return_value=True)

        with patch.object(FaceGroupCache, "__init__", lambda self: None):
            cache = FaceGroupCache()
            cache._cache = mock_cache_service

            result = await cache.invalidate_gallery(workspace_id, gallery_id)

            # Should invalidate pattern for gallery queries
            mock_cache_service.invalidate_pattern.assert_called_once()
            # Should also delete count key
            mock_cache_service.delete.assert_called_once()
            # Total should be 6 (5 pattern + 1 count)
            assert result == 6

    @pytest.mark.asyncio
    async def test_invalidate_gallery_when_count_not_exists(
        self, workspace_id, gallery_id, mock_cache_service
    ):
        """Should handle case when count key doesn't exist."""
        mock_cache_service.invalidate_pattern = AsyncMock(return_value=3)
        mock_cache_service.delete = AsyncMock(return_value=False)  # Key didn't exist

        with patch.object(FaceGroupCache, "__init__", lambda self: None):
            cache = FaceGroupCache()
            cache._cache = mock_cache_service

            result = await cache.invalidate_gallery(workspace_id, gallery_id)

            # Should be 3 (pattern only, count didn't exist)
            assert result == 3


# =============================================================================
# FACE GROUP CACHE SINGLETON TESTS
# =============================================================================


class TestFaceGroupCacheSingleton:
    """Tests for FaceGroupCache singleton."""

    def test_get_face_group_cache_returns_singleton(self):
        """Should return same instance on multiple calls."""
        # Reset singleton
        import app.repositories.face_group_repository as module
        module._face_group_cache = None

        cache1 = get_face_group_cache()
        cache2 = get_face_group_cache()

        assert cache1 is cache2

    def test_singleton_uses_api_cache_layer(self):
        """Should use CacheLayer.API."""
        import app.repositories.face_group_repository as module
        module._face_group_cache = None

        cache = get_face_group_cache()

        # Check internal cache service uses API layer
        assert cache._cache.layer == CacheLayer.API


# =============================================================================
# REPOSITORY CACHE INTEGRATION TESTS
# =============================================================================


class TestRepositoryFindByGalleryWithCache:
    """Tests for FaceGroupRepository.find_by_gallery_id_with_stats caching."""

    @pytest.mark.asyncio
    async def test_returns_cached_data_on_hit(
        self, workspace_id, gallery_id, sample_face_groups
    ):
        """Should return cached data without database query on cache hit."""
        mock_cache = MagicMock()
        mock_cache.get_gallery_groups = AsyncMock(return_value=sample_face_groups)
        mock_cache.set_gallery_groups = AsyncMock(return_value=True)

        with patch(
            "app.repositories.face_group_repository.get_face_group_cache",
            return_value=mock_cache,
        ):
            with patch(
                "app.repositories.face_group_repository.get_postgres_pool"
            ) as mock_pool:
                repo = FaceGroupRepository()
                result = await repo.find_by_gallery_id_with_stats(
                    workspace_id, gallery_id, limit=50, offset=0
                )

                # Should return cached data
                assert result == sample_face_groups
                # Should NOT call database
                mock_pool.assert_not_called()
                # Should have checked cache
                mock_cache.get_gallery_groups.assert_called_once()

    @pytest.mark.asyncio
    async def test_queries_database_on_miss(self, workspace_id, gallery_id):
        """Should query database and cache result on cache miss."""
        mock_cache = MagicMock()
        mock_cache.get_gallery_groups = AsyncMock(return_value=None)
        mock_cache.set_gallery_groups = AsyncMock(return_value=True)

        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=[])
        mock_pool = MagicMock()
        mock_pool.acquire = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_conn), __aexit__=AsyncMock()))

        with patch(
            "app.repositories.face_group_repository.get_face_group_cache",
            return_value=mock_cache,
        ):
            with patch(
                "app.repositories.face_group_repository.get_postgres_pool",
                return_value=mock_pool,
            ):
                repo = FaceGroupRepository()
                result = await repo.find_by_gallery_id_with_stats(
                    workspace_id, gallery_id, limit=50, offset=0
                )

                # Should have queried database
                mock_conn.fetch.assert_called_once()
                # Should have set cache
                mock_cache.set_gallery_groups.assert_called_once()

    @pytest.mark.asyncio
    async def test_skips_cache_when_search_provided(self, workspace_id, gallery_id):
        """Should skip cache when search parameter is provided."""
        mock_cache = MagicMock()
        mock_cache.get_gallery_groups = AsyncMock(return_value=None)
        mock_cache.set_gallery_groups = AsyncMock(return_value=True)

        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=[])
        mock_pool = MagicMock()
        mock_pool.acquire = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_conn), __aexit__=AsyncMock()))

        with patch(
            "app.repositories.face_group_repository.get_face_group_cache",
            return_value=mock_cache,
        ):
            with patch(
                "app.repositories.face_group_repository.get_postgres_pool",
                return_value=mock_pool,
            ):
                repo = FaceGroupRepository()
                await repo.find_by_gallery_id_with_stats(
                    workspace_id, gallery_id, limit=50, offset=0, search="John"
                )

                # Should NOT check cache
                mock_cache.get_gallery_groups.assert_not_called()
                # Should NOT set cache
                mock_cache.set_gallery_groups.assert_not_called()
                # But should query database
                mock_conn.fetch.assert_called_once()


class TestRepositoryCountByGalleryWithCache:
    """Tests for FaceGroupRepository.count_by_gallery_id caching."""

    @pytest.mark.asyncio
    async def test_returns_cached_count_on_hit(self, workspace_id, gallery_id):
        """Should return cached count without database query."""
        mock_cache = MagicMock()
        mock_cache.get_gallery_count = AsyncMock(return_value=42)
        mock_cache.set_gallery_count = AsyncMock(return_value=True)

        with patch(
            "app.repositories.face_group_repository.get_face_group_cache",
            return_value=mock_cache,
        ):
            with patch(
                "app.repositories.face_group_repository.get_postgres_pool"
            ) as mock_pool:
                repo = FaceGroupRepository()
                result = await repo.count_by_gallery_id(workspace_id, gallery_id)

                assert result == 42
                mock_pool.assert_not_called()
                mock_cache.get_gallery_count.assert_called_once()

    @pytest.mark.asyncio
    async def test_queries_database_on_miss(self, workspace_id, gallery_id):
        """Should query database and cache result on cache miss."""
        mock_cache = MagicMock()
        mock_cache.get_gallery_count = AsyncMock(return_value=None)
        mock_cache.set_gallery_count = AsyncMock(return_value=True)

        mock_conn = AsyncMock()
        mock_conn.fetchval = AsyncMock(return_value=15)
        mock_pool = MagicMock()
        mock_pool.acquire = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_conn), __aexit__=AsyncMock()))

        with patch(
            "app.repositories.face_group_repository.get_face_group_cache",
            return_value=mock_cache,
        ):
            with patch(
                "app.repositories.face_group_repository.get_postgres_pool",
                return_value=mock_pool,
            ):
                repo = FaceGroupRepository()
                result = await repo.count_by_gallery_id(workspace_id, gallery_id)

                assert result == 15
                mock_conn.fetchval.assert_called_once()
                mock_cache.set_gallery_count.assert_called_once_with(
                    workspace_id, gallery_id, 15
                )


# =============================================================================
# REPOSITORY CACHE INVALIDATION TESTS
# =============================================================================


class TestRepositoryCreateInvalidatesCache:
    """Tests for cache invalidation on create operations."""

    @pytest.mark.asyncio
    async def test_create_invalidates_workspace_cache(self, workspace_id):
        """Creating a face group should invalidate workspace cache."""
        mock_cache = MagicMock()
        mock_cache.invalidate_workspace = AsyncMock(return_value=5)

        mock_row = MagicMock()
        mock_row.__getitem__ = lambda s, k: {
            "id": uuid.uuid4(),
            "workspace_id": workspace_id,
            "name": "Test Group",
            "face_count": 0,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
            "centroid": None,
            "representative_face_id": None,
            "person_id": None,
        }.get(k)
        mock_row.keys = lambda: ["id", "workspace_id", "name", "face_count", "created_at", "updated_at", "centroid", "representative_face_id", "person_id"]
        mock_row.get = lambda k, d=None: mock_row.__getitem__(k) if k in mock_row.keys() else d

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(return_value=mock_row)
        mock_pool = MagicMock()
        mock_pool.acquire = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_conn), __aexit__=AsyncMock()))

        with patch(
            "app.repositories.face_group_repository.get_face_group_cache",
            return_value=mock_cache,
        ):
            with patch(
                "app.repositories.face_group_repository.get_postgres_pool",
                return_value=mock_pool,
            ):
                repo = FaceGroupRepository()
                await repo.create(workspace_id, name="Test Group")

                mock_cache.invalidate_workspace.assert_called_once_with(workspace_id)


class TestRepositoryUpdateInvalidatesCache:
    """Tests for cache invalidation on update operations."""

    @pytest.mark.asyncio
    async def test_update_invalidates_workspace_cache(self, workspace_id, group_id):
        """Updating a face group should invalidate workspace cache."""
        mock_cache = MagicMock()
        mock_cache.invalidate_workspace = AsyncMock(return_value=3)

        mock_row = MagicMock()
        mock_row.__getitem__ = lambda s, k: {
            "id": group_id,
            "workspace_id": workspace_id,
            "name": "Updated Name",
            "face_count": 5,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
            "centroid": None,
            "representative_face_id": None,
            "person_id": None,
        }.get(k)
        mock_row.keys = lambda: ["id", "workspace_id", "name", "face_count", "created_at", "updated_at", "centroid", "representative_face_id", "person_id"]
        mock_row.get = lambda k, d=None: mock_row.__getitem__(k) if k in mock_row.keys() else d

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(return_value=mock_row)
        mock_pool = MagicMock()
        mock_pool.acquire = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_conn), __aexit__=AsyncMock()))

        with patch(
            "app.repositories.face_group_repository.get_face_group_cache",
            return_value=mock_cache,
        ):
            with patch(
                "app.repositories.face_group_repository.get_postgres_pool",
                return_value=mock_pool,
            ):
                repo = FaceGroupRepository()
                await repo.update(group_id, workspace_id, name="Updated Name")

                mock_cache.invalidate_workspace.assert_called_once_with(workspace_id)


class TestRepositoryDeleteInvalidatesCache:
    """Tests for cache invalidation on delete operations."""

    @pytest.mark.asyncio
    async def test_delete_invalidates_workspace_cache(self, workspace_id, group_id):
        """Deleting a face group should invalidate workspace cache."""
        mock_cache = MagicMock()
        mock_cache.invalidate_workspace = AsyncMock(return_value=2)

        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock(return_value="DELETE 1")
        mock_conn.transaction = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(), __aexit__=AsyncMock()))
        mock_pool = MagicMock()
        mock_pool.acquire = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_conn), __aexit__=AsyncMock()))

        with patch(
            "app.repositories.face_group_repository.get_face_group_cache",
            return_value=mock_cache,
        ):
            with patch(
                "app.repositories.face_group_repository.get_postgres_pool",
                return_value=mock_pool,
            ):
                repo = FaceGroupRepository()
                result = await repo.delete(group_id, workspace_id)

                assert result is True
                mock_cache.invalidate_workspace.assert_called_once_with(workspace_id)

    @pytest.mark.asyncio
    async def test_delete_not_found_skips_invalidation(self, workspace_id, group_id):
        """Should not invalidate cache if group not found."""
        mock_cache = MagicMock()
        mock_cache.invalidate_workspace = AsyncMock(return_value=0)

        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock(return_value="DELETE 0")
        mock_conn.transaction = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(), __aexit__=AsyncMock()))
        mock_pool = MagicMock()
        mock_pool.acquire = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_conn), __aexit__=AsyncMock()))

        with patch(
            "app.repositories.face_group_repository.get_face_group_cache",
            return_value=mock_cache,
        ):
            with patch(
                "app.repositories.face_group_repository.get_postgres_pool",
                return_value=mock_pool,
            ):
                repo = FaceGroupRepository()
                result = await repo.delete(group_id, workspace_id)

                assert result is False
                # Should NOT invalidate when nothing was deleted
                mock_cache.invalidate_workspace.assert_not_called()


class TestRepositoryDeleteByWorkspaceInvalidatesCache:
    """Tests for cache invalidation on bulk delete operations."""

    @pytest.mark.asyncio
    async def test_delete_by_workspace_invalidates_cache(self, workspace_id):
        """Deleting all groups in workspace should invalidate cache."""
        mock_cache = MagicMock()
        mock_cache.invalidate_workspace = AsyncMock(return_value=10)

        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock(return_value="DELETE 5")
        mock_pool = MagicMock()
        mock_pool.acquire = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_conn), __aexit__=AsyncMock()))

        with patch(
            "app.repositories.face_group_repository.get_face_group_cache",
            return_value=mock_cache,
        ):
            with patch(
                "app.repositories.face_group_repository.get_postgres_pool",
                return_value=mock_pool,
            ):
                repo = FaceGroupRepository()
                result = await repo.delete_by_workspace_id(workspace_id)

                assert result == 5
                mock_cache.invalidate_workspace.assert_called_once_with(workspace_id)

    @pytest.mark.asyncio
    async def test_delete_by_workspace_skips_invalidation_if_none_deleted(
        self, workspace_id
    ):
        """Should not invalidate if no groups were deleted."""
        mock_cache = MagicMock()
        mock_cache.invalidate_workspace = AsyncMock(return_value=0)

        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock(return_value="DELETE 0")
        mock_pool = MagicMock()
        mock_pool.acquire = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_conn), __aexit__=AsyncMock()))

        with patch(
            "app.repositories.face_group_repository.get_face_group_cache",
            return_value=mock_cache,
        ):
            with patch(
                "app.repositories.face_group_repository.get_postgres_pool",
                return_value=mock_pool,
            ):
                repo = FaceGroupRepository()
                result = await repo.delete_by_workspace_id(workspace_id)

                assert result == 0
                mock_cache.invalidate_workspace.assert_not_called()


class TestRepositoryDeleteEmptyGroupsInvalidatesCache:
    """Tests for cache invalidation on delete empty groups."""

    @pytest.mark.asyncio
    async def test_delete_empty_groups_invalidates_cache(self, workspace_id):
        """Deleting empty groups should invalidate workspace cache."""
        mock_cache = MagicMock()
        mock_cache.invalidate_workspace = AsyncMock(return_value=3)

        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock(return_value="DELETE 3")
        mock_pool = MagicMock()
        mock_pool.acquire = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_conn), __aexit__=AsyncMock()))

        with patch(
            "app.repositories.face_group_repository.get_face_group_cache",
            return_value=mock_cache,
        ):
            with patch(
                "app.repositories.face_group_repository.get_postgres_pool",
                return_value=mock_pool,
            ):
                repo = FaceGroupRepository()
                result = await repo.delete_empty_groups(workspace_id)

                assert result == 3
                mock_cache.invalidate_workspace.assert_called_once_with(workspace_id)


# =============================================================================
# EDGE CASES
# =============================================================================


class TestCacheEdgeCases:
    """Tests for cache edge cases."""

    @pytest.mark.asyncio
    async def test_cache_handles_empty_result(self, workspace_id, gallery_id):
        """Should cache empty results correctly."""
        mock_cache = MagicMock()
        mock_cache.get_gallery_groups = AsyncMock(return_value=None)
        mock_cache.set_gallery_groups = AsyncMock(return_value=True)

        mock_conn = AsyncMock()
        mock_conn.fetch = AsyncMock(return_value=[])  # Empty result
        mock_pool = MagicMock()
        mock_pool.acquire = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_conn), __aexit__=AsyncMock()))

        with patch(
            "app.repositories.face_group_repository.get_face_group_cache",
            return_value=mock_cache,
        ):
            with patch(
                "app.repositories.face_group_repository.get_postgres_pool",
                return_value=mock_pool,
            ):
                repo = FaceGroupRepository()
                result = await repo.find_by_gallery_id_with_stats(
                    workspace_id, gallery_id, limit=50, offset=0
                )

                # Should cache empty list
                mock_cache.set_gallery_groups.assert_called_once()
                call_args = mock_cache.set_gallery_groups.call_args[0]
                assert call_args[4] == []  # The data argument should be empty list

    @pytest.mark.asyncio
    async def test_cache_handles_zero_count(self, workspace_id, gallery_id):
        """Should cache zero count correctly."""
        mock_cache = MagicMock()
        mock_cache.get_gallery_count = AsyncMock(return_value=None)
        mock_cache.set_gallery_count = AsyncMock(return_value=True)

        mock_conn = AsyncMock()
        mock_conn.fetchval = AsyncMock(return_value=0)
        mock_pool = MagicMock()
        mock_pool.acquire = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_conn), __aexit__=AsyncMock()))

        with patch(
            "app.repositories.face_group_repository.get_face_group_cache",
            return_value=mock_cache,
        ):
            with patch(
                "app.repositories.face_group_repository.get_postgres_pool",
                return_value=mock_pool,
            ):
                repo = FaceGroupRepository()
                result = await repo.count_by_gallery_id(workspace_id, gallery_id)

                assert result == 0
                mock_cache.set_gallery_count.assert_called_once_with(
                    workspace_id, gallery_id, 0
                )

    @pytest.mark.asyncio
    async def test_cache_hit_with_empty_list_is_valid(
        self, workspace_id, gallery_id
    ):
        """Empty list from cache should be treated as valid cache hit."""
        mock_cache = MagicMock()
        mock_cache.get_gallery_groups = AsyncMock(return_value=[])  # Empty list cached

        with patch(
            "app.repositories.face_group_repository.get_face_group_cache",
            return_value=mock_cache,
        ):
            with patch(
                "app.repositories.face_group_repository.get_postgres_pool"
            ) as mock_pool:
                repo = FaceGroupRepository()
                result = await repo.find_by_gallery_id_with_stats(
                    workspace_id, gallery_id, limit=50, offset=0
                )

                # Should return empty list and NOT query database
                assert result == []
                mock_pool.assert_not_called()

    @pytest.mark.asyncio
    async def test_cache_hit_with_zero_count_is_valid(
        self, workspace_id, gallery_id
    ):
        """Zero count from cache should be treated as valid cache hit."""
        mock_cache = MagicMock()
        mock_cache.get_gallery_count = AsyncMock(return_value=0)

        with patch(
            "app.repositories.face_group_repository.get_face_group_cache",
            return_value=mock_cache,
        ):
            with patch(
                "app.repositories.face_group_repository.get_postgres_pool"
            ) as mock_pool:
                repo = FaceGroupRepository()
                result = await repo.count_by_gallery_id(workspace_id, gallery_id)

                # Should return 0 and NOT query database
                assert result == 0
                mock_pool.assert_not_called()


# =============================================================================
# REPOSITORY SINGLETON TESTS
# =============================================================================


class TestRepositorySingleton:
    """Tests for FaceGroupRepository singleton."""

    def test_get_face_group_repository_returns_singleton(self):
        """Should return same instance on multiple calls."""
        import app.repositories.face_group_repository as module
        module._repository = None

        repo1 = get_face_group_repository()
        repo2 = get_face_group_repository()

        assert repo1 is repo2
