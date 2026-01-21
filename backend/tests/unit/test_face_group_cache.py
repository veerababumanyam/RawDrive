"""Unit tests for FaceGroupCacheService.

Tests cache TTL configuration, key construction, cache operations,
and invalidation patterns.

Feature: Face Detection Audit Remediation (002-face-audit-remediation)
Finding: PERF-001 - Face Group Caching
Task: T071 - Integration Tests for Face Group Caching
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4, UUID

from app.services.face_group_cache_service import (
    FaceGroupCacheService,
    FACE_GROUP_LIST_TTL,
    FACE_GROUP_DETAIL_TTL,
    FACE_GROUP_STATS_TTL,
    FACE_GROUP_SUGGESTIONS_TTL,
    FACE_GROUP_SIMILAR_TTL,
    PREFIX_FACE_GROUP,
    PREFIX_FACE_GROUP_LIST,
    PREFIX_FACE_GROUP_STATS,
    PREFIX_FACE_GROUP_SUGGESTIONS,
    PREFIX_FACE_GROUP_SIMILAR,
    PREFIX_FACE_GROUP_GALLERY,
)


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def mock_cache_service():
    """Create a mock cache service."""
    mock = MagicMock()
    mock.get = AsyncMock(return_value=None)
    mock.set = AsyncMock(return_value=True)
    mock.delete = AsyncMock(return_value=True)
    mock.invalidate_pattern = AsyncMock(return_value=1)
    return mock


@pytest.fixture
def face_group_cache_service(mock_cache_service):
    """Create FaceGroupCacheService with mocked dependencies."""
    with patch('app.services.face_group_cache_service.get_cache_service') as mock_get:
        mock_get.return_value = mock_cache_service
        service = FaceGroupCacheService()
        # Directly set _cache to ensure mocking works
        service._cache = mock_cache_service
        return service


@pytest.fixture
def workspace_id():
    """Generate a test workspace ID."""
    return uuid4()


@pytest.fixture
def gallery_id():
    """Generate a test gallery ID."""
    return uuid4()


@pytest.fixture
def group_id():
    """Generate a test group ID."""
    return uuid4()


@pytest.fixture
def sample_face_group_data():
    """Sample face group data for testing."""
    return {
        "id": str(uuid4()),
        "workspace_id": str(uuid4()),
        "name": "Test Group",
        "face_count": 10,
        "primary_thumbnail_url": "https://example.com/thumb.jpg",
        "created_at": "2026-01-01T00:00:00Z",
    }


@pytest.fixture
def sample_face_group_list():
    """Sample face group list for testing."""
    return {
        "items": [
            {"id": str(uuid4()), "name": "Group 1", "face_count": 5},
            {"id": str(uuid4()), "name": "Group 2", "face_count": 10},
        ],
        "total": 2,
        "page": 1,
        "page_size": 50,
    }


@pytest.fixture
def sample_stats_data():
    """Sample statistics data for testing."""
    return {
        "total_groups": 25,
        "total_faces": 150,
        "named_groups": 20,
        "unnamed_groups": 5,
        "avg_faces_per_group": 6.0,
    }


@pytest.fixture
def sample_suggestions():
    """Sample merge suggestions for testing."""
    return [
        {
            "source_group_id": str(uuid4()),
            "target_group_id": str(uuid4()),
            "similarity_score": 0.95,
        },
        {
            "source_group_id": str(uuid4()),
            "target_group_id": str(uuid4()),
            "similarity_score": 0.88,
        },
    ]


# =============================================================================
# Tests: Cache TTL Configuration
# =============================================================================


class TestCacheTTLConfiguration:
    """Test TTL values are set correctly."""

    def test_face_group_list_ttl_value(self):
        """Verify face group list TTL is 5 minutes (300 seconds)."""
        assert FACE_GROUP_LIST_TTL == 300

    def test_face_group_detail_ttl_value(self):
        """Verify face group detail TTL is 10 minutes (600 seconds)."""
        assert FACE_GROUP_DETAIL_TTL == 600

    def test_face_group_stats_ttl_value(self):
        """Verify face group stats TTL is 1 minute (60 seconds)."""
        assert FACE_GROUP_STATS_TTL == 60

    def test_face_group_suggestions_ttl_value(self):
        """Verify merge suggestions TTL is 15 minutes (900 seconds)."""
        assert FACE_GROUP_SUGGESTIONS_TTL == 900

    def test_face_group_similar_ttl_value(self):
        """Verify similar groups TTL is 10 minutes (600 seconds)."""
        assert FACE_GROUP_SIMILAR_TTL == 600


# =============================================================================
# Tests: Cache Key Construction
# =============================================================================


class TestCacheKeyConstruction:
    """Test cache key construction patterns."""

    @pytest.mark.asyncio
    async def test_list_cache_key_includes_workspace(
        self, face_group_cache_service, mock_cache_service, workspace_id
    ):
        """Test list cache key includes workspace ID."""
        await face_group_cache_service.get_face_group_list(
            workspace_id=workspace_id,
            page=1,
            limit=50,
        )

        mock_cache_service.get.assert_called_once()
        call_args = mock_cache_service.get.call_args[0]
        # First positional arg is prefix, second is workspace_id
        assert call_args[0] == PREFIX_FACE_GROUP_LIST
        assert call_args[1] == str(workspace_id)

    @pytest.mark.asyncio
    async def test_list_cache_key_includes_pagination(
        self, face_group_cache_service, mock_cache_service, workspace_id
    ):
        """Test list cache key includes pagination parameters."""
        await face_group_cache_service.get_face_group_list(
            workspace_id=workspace_id,
            page=2,
            limit=100,
            order_by="name",
            order_desc=False,
            min_faces=5,
        )

        mock_cache_service.get.assert_called_once()
        call_args = mock_cache_service.get.call_args[0]
        # Third positional arg is the params string
        params_key = call_args[2]
        assert "2:" in params_key  # page
        assert "100:" in params_key  # limit
        assert "name:" in params_key  # order_by
        assert ":5" in params_key  # min_faces

    @pytest.mark.asyncio
    async def test_detail_cache_key_includes_workspace_and_group(
        self, face_group_cache_service, mock_cache_service, workspace_id, group_id
    ):
        """Test detail cache key includes workspace and group ID."""
        await face_group_cache_service.get_face_group_detail(
            workspace_id=workspace_id,
            group_id=group_id,
        )

        mock_cache_service.get.assert_called_once()
        call_args = mock_cache_service.get.call_args[0]
        assert call_args[0] == PREFIX_FACE_GROUP
        assert call_args[1] == str(workspace_id)
        assert call_args[2] == str(group_id)

    @pytest.mark.asyncio
    async def test_stats_cache_key_includes_workspace(
        self, face_group_cache_service, mock_cache_service, workspace_id
    ):
        """Test stats cache key includes workspace ID."""
        await face_group_cache_service.get_face_group_stats(
            workspace_id=workspace_id,
        )

        mock_cache_service.get.assert_called_once()
        call_args = mock_cache_service.get.call_args[0]
        assert call_args[0] == PREFIX_FACE_GROUP_STATS
        assert call_args[1] == str(workspace_id)


# =============================================================================
# Tests: Face Group List Cache
# =============================================================================


class TestFaceGroupListCache:
    """Test face group list caching operations."""

    @pytest.mark.asyncio
    async def test_cache_miss_returns_none(
        self, face_group_cache_service, mock_cache_service, workspace_id
    ):
        """Test cache miss returns None."""
        mock_cache_service.get.return_value = None

        result = await face_group_cache_service.get_face_group_list(
            workspace_id=workspace_id,
        )

        assert result is None
        mock_cache_service.get.assert_called_once()

    @pytest.mark.asyncio
    async def test_cache_hit_returns_data(
        self, face_group_cache_service, mock_cache_service, workspace_id, sample_face_group_list
    ):
        """Test cache hit returns stored data."""
        mock_cache_service.get.return_value = sample_face_group_list

        result = await face_group_cache_service.get_face_group_list(
            workspace_id=workspace_id,
        )

        assert result == sample_face_group_list
        assert result["items"] == sample_face_group_list["items"]

    @pytest.mark.asyncio
    async def test_set_list_cache_uses_correct_ttl(
        self, face_group_cache_service, mock_cache_service, workspace_id, sample_face_group_list
    ):
        """Test set_face_group_list uses correct TTL."""
        await face_group_cache_service.set_face_group_list(
            workspace_id=workspace_id,
            page=1,
            limit=50,
            order_by="face_count",
            order_desc=True,
            min_faces=None,
            data=sample_face_group_list,
        )

        mock_cache_service.set.assert_called_once()
        call_kwargs = mock_cache_service.set.call_args[1]
        assert call_kwargs["ttl"] == FACE_GROUP_LIST_TTL
        assert call_kwargs["value"] == sample_face_group_list

    @pytest.mark.asyncio
    async def test_set_list_cache_with_custom_ttl(
        self, face_group_cache_service, mock_cache_service, workspace_id, sample_face_group_list
    ):
        """Test set_face_group_list with custom TTL."""
        custom_ttl = 120

        await face_group_cache_service.set_face_group_list(
            workspace_id=workspace_id,
            page=1,
            limit=50,
            order_by="face_count",
            order_desc=True,
            min_faces=None,
            data=sample_face_group_list,
            ttl=custom_ttl,
        )

        mock_cache_service.set.assert_called_once()
        call_kwargs = mock_cache_service.set.call_args[1]
        assert call_kwargs["ttl"] == custom_ttl

    @pytest.mark.asyncio
    async def test_different_pages_have_different_cache_keys(
        self, face_group_cache_service, mock_cache_service, workspace_id
    ):
        """Test different pages result in different cache keys."""
        # Get page 1
        await face_group_cache_service.get_face_group_list(
            workspace_id=workspace_id,
            page=1,
            limit=50,
        )
        first_call_args = mock_cache_service.get.call_args[0]

        # Get page 2
        await face_group_cache_service.get_face_group_list(
            workspace_id=workspace_id,
            page=2,
            limit=50,
        )
        second_call_args = mock_cache_service.get.call_args[0]

        # Params key (third arg) should differ
        assert first_call_args[2] != second_call_args[2]


# =============================================================================
# Tests: Face Group Detail Cache
# =============================================================================


class TestFaceGroupDetailCache:
    """Test face group detail caching operations."""

    @pytest.mark.asyncio
    async def test_detail_cache_miss_returns_none(
        self, face_group_cache_service, mock_cache_service, workspace_id, group_id
    ):
        """Test detail cache miss returns None."""
        mock_cache_service.get.return_value = None

        result = await face_group_cache_service.get_face_group_detail(
            workspace_id=workspace_id,
            group_id=group_id,
        )

        assert result is None

    @pytest.mark.asyncio
    async def test_detail_cache_hit_returns_data(
        self, face_group_cache_service, mock_cache_service, workspace_id, group_id, sample_face_group_data
    ):
        """Test detail cache hit returns stored data."""
        mock_cache_service.get.return_value = sample_face_group_data

        result = await face_group_cache_service.get_face_group_detail(
            workspace_id=workspace_id,
            group_id=group_id,
        )

        assert result == sample_face_group_data
        assert result["name"] == "Test Group"

    @pytest.mark.asyncio
    async def test_set_detail_cache_uses_correct_ttl(
        self, face_group_cache_service, mock_cache_service, workspace_id, group_id, sample_face_group_data
    ):
        """Test set_face_group_detail uses correct TTL."""
        await face_group_cache_service.set_face_group_detail(
            workspace_id=workspace_id,
            group_id=group_id,
            data=sample_face_group_data,
        )

        mock_cache_service.set.assert_called_once()
        call_kwargs = mock_cache_service.set.call_args[1]
        assert call_kwargs["ttl"] == FACE_GROUP_DETAIL_TTL


# =============================================================================
# Tests: Face Group Stats Cache
# =============================================================================


class TestFaceGroupStatsCache:
    """Test face group statistics caching operations."""

    @pytest.mark.asyncio
    async def test_stats_cache_miss_returns_none(
        self, face_group_cache_service, mock_cache_service, workspace_id
    ):
        """Test stats cache miss returns None."""
        mock_cache_service.get.return_value = None

        result = await face_group_cache_service.get_face_group_stats(
            workspace_id=workspace_id,
        )

        assert result is None

    @pytest.mark.asyncio
    async def test_stats_cache_hit_returns_data(
        self, face_group_cache_service, mock_cache_service, workspace_id, sample_stats_data
    ):
        """Test stats cache hit returns stored data."""
        mock_cache_service.get.return_value = sample_stats_data

        result = await face_group_cache_service.get_face_group_stats(
            workspace_id=workspace_id,
        )

        assert result == sample_stats_data
        assert result["total_groups"] == 25

    @pytest.mark.asyncio
    async def test_set_stats_cache_uses_correct_ttl(
        self, face_group_cache_service, mock_cache_service, workspace_id, sample_stats_data
    ):
        """Test set_face_group_stats uses correct TTL (short for volatile data)."""
        await face_group_cache_service.set_face_group_stats(
            workspace_id=workspace_id,
            data=sample_stats_data,
        )

        mock_cache_service.set.assert_called_once()
        call_kwargs = mock_cache_service.set.call_args[1]
        assert call_kwargs["ttl"] == FACE_GROUP_STATS_TTL  # 60 seconds


# =============================================================================
# Tests: Merge Suggestions Cache
# =============================================================================


class TestMergeSuggestionsCache:
    """Test merge suggestions caching operations."""

    @pytest.mark.asyncio
    async def test_suggestions_cache_miss_returns_none(
        self, face_group_cache_service, mock_cache_service, workspace_id
    ):
        """Test suggestions cache miss returns None."""
        mock_cache_service.get.return_value = None

        result = await face_group_cache_service.get_merge_suggestions(
            workspace_id=workspace_id,
            threshold=0.85,
            limit=10,
        )

        assert result is None

    @pytest.mark.asyncio
    async def test_suggestions_cache_hit_returns_data(
        self, face_group_cache_service, mock_cache_service, workspace_id, sample_suggestions
    ):
        """Test suggestions cache hit returns stored data."""
        mock_cache_service.get.return_value = sample_suggestions

        result = await face_group_cache_service.get_merge_suggestions(
            workspace_id=workspace_id,
            threshold=0.85,
            limit=10,
        )

        assert result == sample_suggestions
        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_set_suggestions_cache_uses_correct_ttl(
        self, face_group_cache_service, mock_cache_service, workspace_id, sample_suggestions
    ):
        """Test set_merge_suggestions uses correct TTL."""
        await face_group_cache_service.set_merge_suggestions(
            workspace_id=workspace_id,
            threshold=0.85,
            limit=10,
            data=sample_suggestions,
        )

        mock_cache_service.set.assert_called_once()
        call_kwargs = mock_cache_service.set.call_args[1]
        assert call_kwargs["ttl"] == FACE_GROUP_SUGGESTIONS_TTL


# =============================================================================
# Tests: Similar Groups Cache
# =============================================================================


class TestSimilarGroupsCache:
    """Test similar groups caching operations."""

    @pytest.mark.asyncio
    async def test_similar_cache_miss_returns_none(
        self, face_group_cache_service, mock_cache_service, workspace_id, group_id
    ):
        """Test similar cache miss returns None."""
        mock_cache_service.get.return_value = None

        result = await face_group_cache_service.get_similar_groups(
            workspace_id=workspace_id,
            group_id=group_id,
            threshold=0.8,
            limit=5,
        )

        assert result is None

    @pytest.mark.asyncio
    async def test_similar_cache_hit_returns_data(
        self, face_group_cache_service, mock_cache_service, workspace_id, group_id
    ):
        """Test similar cache hit returns stored data."""
        similar_groups = [
            {"group_id": str(uuid4()), "similarity": 0.92},
            {"group_id": str(uuid4()), "similarity": 0.88},
        ]
        mock_cache_service.get.return_value = similar_groups

        result = await face_group_cache_service.get_similar_groups(
            workspace_id=workspace_id,
            group_id=group_id,
            threshold=0.8,
            limit=5,
        )

        assert result == similar_groups

    @pytest.mark.asyncio
    async def test_set_similar_cache_uses_correct_ttl(
        self, face_group_cache_service, mock_cache_service, workspace_id, group_id
    ):
        """Test set_similar_groups uses correct TTL."""
        similar_data = [{"group_id": str(uuid4()), "similarity": 0.9}]

        await face_group_cache_service.set_similar_groups(
            workspace_id=workspace_id,
            group_id=group_id,
            threshold=0.8,
            limit=5,
            data=similar_data,
        )

        mock_cache_service.set.assert_called_once()
        call_kwargs = mock_cache_service.set.call_args[1]
        assert call_kwargs["ttl"] == FACE_GROUP_SIMILAR_TTL


# =============================================================================
# Tests: Gallery Face Groups Cache
# =============================================================================


class TestGalleryFaceGroupsCache:
    """Test gallery face groups caching operations."""

    @pytest.mark.asyncio
    async def test_gallery_groups_cache_miss_returns_none(
        self, face_group_cache_service, mock_cache_service, workspace_id, gallery_id
    ):
        """Test gallery groups cache miss returns None."""
        mock_cache_service.get.return_value = None

        result = await face_group_cache_service.get_gallery_face_groups(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
        )

        assert result is None

    @pytest.mark.asyncio
    async def test_gallery_groups_cache_hit_returns_data(
        self, face_group_cache_service, mock_cache_service, workspace_id, gallery_id, sample_face_group_list
    ):
        """Test gallery groups cache hit returns stored data."""
        mock_cache_service.get.return_value = sample_face_group_list

        result = await face_group_cache_service.get_gallery_face_groups(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
        )

        assert result == sample_face_group_list

    @pytest.mark.asyncio
    async def test_set_gallery_groups_cache(
        self, face_group_cache_service, mock_cache_service, workspace_id, gallery_id, sample_face_group_list
    ):
        """Test set_gallery_face_groups caches data correctly."""
        await face_group_cache_service.set_gallery_face_groups(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            page=1,
            limit=50,
            search=None,
            data=sample_face_group_list,
        )

        mock_cache_service.set.assert_called_once()
        call_kwargs = mock_cache_service.set.call_args[1]
        assert call_kwargs["value"] == sample_face_group_list


# =============================================================================
# Tests: Cache Invalidation
# =============================================================================


class TestCacheInvalidation:
    """Test cache invalidation patterns."""

    @pytest.mark.asyncio
    async def test_invalidate_detail_clears_cache(
        self, face_group_cache_service, mock_cache_service, workspace_id, group_id
    ):
        """Test invalidate_face_group_detail clears specific cache."""
        await face_group_cache_service.invalidate_face_group_detail(
            workspace_id=workspace_id,
            group_id=group_id,
        )

        mock_cache_service.delete.assert_called_once()
        call_args = mock_cache_service.delete.call_args[0]
        assert call_args[0] == PREFIX_FACE_GROUP
        assert call_args[1] == str(workspace_id)
        assert call_args[2] == str(group_id)

    @pytest.mark.asyncio
    async def test_invalidate_lists_clears_all_list_caches(
        self, face_group_cache_service, mock_cache_service, workspace_id
    ):
        """Test invalidate_face_group_lists clears all list caches for workspace."""
        await face_group_cache_service.invalidate_face_group_lists(
            workspace_id=workspace_id,
        )

        mock_cache_service.invalidate_pattern.assert_called_once()
        call_args = mock_cache_service.invalidate_pattern.call_args[0]
        assert call_args[0] == PREFIX_FACE_GROUP_LIST
        assert call_args[1] == str(workspace_id)

    @pytest.mark.asyncio
    async def test_invalidate_workspace_cache_clears_all(
        self, face_group_cache_service, mock_cache_service, workspace_id
    ):
        """Test invalidate_workspace_cache clears all workspace caches."""
        result = await face_group_cache_service.invalidate_workspace_cache(
            workspace_id=workspace_id,
        )

        # Should call invalidate_pattern multiple times for different prefixes
        assert mock_cache_service.invalidate_pattern.call_count >= 5
        assert result > 0

    @pytest.mark.asyncio
    async def test_invalidate_on_group_change(
        self, face_group_cache_service, mock_cache_service, workspace_id, group_id
    ):
        """Test invalidate_on_group_change clears relevant caches."""
        result = await face_group_cache_service.invalidate_on_group_change(
            workspace_id=workspace_id,
            group_id=group_id,
        )

        # Should delete specific group detail
        mock_cache_service.delete.assert_called()
        # Should invalidate patterns
        assert mock_cache_service.invalidate_pattern.call_count >= 2
        assert result > 0

    @pytest.mark.asyncio
    async def test_invalidate_on_merge_clears_both_groups(
        self, face_group_cache_service, mock_cache_service, workspace_id
    ):
        """Test invalidate_on_merge clears caches for all involved groups."""
        source_ids = [uuid4(), uuid4()]
        target_id = uuid4()

        result = await face_group_cache_service.invalidate_on_merge(
            workspace_id=workspace_id,
            source_group_ids=source_ids,
            target_group_id=target_id,
        )

        # Should delete detail for each source + target
        assert mock_cache_service.delete.call_count >= 3
        # Should invalidate patterns for lists, stats, etc.
        assert mock_cache_service.invalidate_pattern.call_count >= 3
        assert result > 0

    @pytest.mark.asyncio
    async def test_invalidate_gallery_face_groups_specific(
        self, face_group_cache_service, mock_cache_service, workspace_id, gallery_id
    ):
        """Test invalidate_gallery_face_groups for specific gallery."""
        await face_group_cache_service.invalidate_gallery_face_groups(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
        )

        mock_cache_service.invalidate_pattern.assert_called_once()
        call_args = mock_cache_service.invalidate_pattern.call_args[0]
        assert call_args[0] == PREFIX_FACE_GROUP_GALLERY
        assert call_args[1] == str(workspace_id)
        assert call_args[2] == str(gallery_id)

    @pytest.mark.asyncio
    async def test_invalidate_gallery_face_groups_all(
        self, face_group_cache_service, mock_cache_service, workspace_id
    ):
        """Test invalidate_gallery_face_groups for all galleries."""
        await face_group_cache_service.invalidate_gallery_face_groups(
            workspace_id=workspace_id,
            gallery_id=None,
        )

        mock_cache_service.invalidate_pattern.assert_called_once()
        call_args = mock_cache_service.invalidate_pattern.call_args[0]
        assert call_args[0] == PREFIX_FACE_GROUP_GALLERY
        assert call_args[1] == str(workspace_id)
        assert len(call_args) == 2  # No gallery_id


# =============================================================================
# Tests: Workspace Isolation
# =============================================================================


class TestWorkspaceIsolation:
    """Test that caches are properly isolated by workspace."""

    @pytest.mark.asyncio
    async def test_different_workspaces_have_different_cache_keys(
        self, face_group_cache_service, mock_cache_service
    ):
        """Test different workspaces result in different cache keys."""
        workspace1 = uuid4()
        workspace2 = uuid4()

        await face_group_cache_service.get_face_group_list(workspace_id=workspace1)
        first_call_args = mock_cache_service.get.call_args[0]

        await face_group_cache_service.get_face_group_list(workspace_id=workspace2)
        second_call_args = mock_cache_service.get.call_args[0]

        # Workspace IDs in cache key should differ
        assert first_call_args[1] != second_call_args[1]

    @pytest.mark.asyncio
    async def test_invalidating_workspace_does_not_affect_others(
        self, face_group_cache_service, mock_cache_service
    ):
        """Test invalidating one workspace doesn't affect others."""
        workspace1 = uuid4()

        await face_group_cache_service.invalidate_workspace_cache(workspace_id=workspace1)

        # All invalidate calls should include only workspace1
        for call in mock_cache_service.invalidate_pattern.call_args_list:
            assert str(workspace1) in call[0]


# =============================================================================
# Tests: Edge Cases
# =============================================================================


class TestEdgeCases:
    """Test edge cases and error handling."""

    @pytest.mark.asyncio
    async def test_cache_handles_empty_list(
        self, face_group_cache_service, mock_cache_service, workspace_id
    ):
        """Test caching an empty list."""
        empty_list = {"items": [], "total": 0, "page": 1, "page_size": 50}

        result = await face_group_cache_service.set_face_group_list(
            workspace_id=workspace_id,
            page=1,
            limit=50,
            order_by="face_count",
            order_desc=True,
            min_faces=None,
            data=empty_list,
        )

        assert result is True
        mock_cache_service.set.assert_called_once()

    @pytest.mark.asyncio
    async def test_cache_handles_large_face_counts(
        self, face_group_cache_service, mock_cache_service, workspace_id, group_id
    ):
        """Test caching groups with large face counts."""
        large_group = {
            "id": str(group_id),
            "name": "Large Group",
            "face_count": 100000,
        }
        mock_cache_service.get.return_value = large_group

        result = await face_group_cache_service.get_face_group_detail(
            workspace_id=workspace_id,
            group_id=group_id,
        )

        assert result["face_count"] == 100000

    @pytest.mark.asyncio
    async def test_cache_set_failure_does_not_raise(
        self, face_group_cache_service, mock_cache_service, workspace_id
    ):
        """Test cache set failure is handled gracefully."""
        mock_cache_service.set.return_value = False

        result = await face_group_cache_service.set_face_group_stats(
            workspace_id=workspace_id,
            data={"total_groups": 5},
        )

        assert result is False  # Should return False but not raise

    @pytest.mark.asyncio
    async def test_cache_handles_search_filter(
        self, face_group_cache_service, mock_cache_service, workspace_id, gallery_id
    ):
        """Test gallery cache includes search filter in key."""
        await face_group_cache_service.get_gallery_face_groups(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            search="John",
        )

        call_args = mock_cache_service.get.call_args[0]
        # Search term should be in the params key
        assert "John" in call_args[3]


# =============================================================================
# Tests: Service Singleton
# =============================================================================


class TestServiceSingleton:
    """Test service factory and singleton behavior."""

    def test_get_face_group_cache_service_returns_instance(self):
        """Test factory returns FaceGroupCacheService instance."""
        from app.services.face_group_cache_service import get_face_group_cache_service

        with patch('app.services.face_group_cache_service.get_cache_service'):
            service = get_face_group_cache_service()
            assert isinstance(service, FaceGroupCacheService)

    def test_get_face_group_cache_service_returns_same_instance(self):
        """Test factory returns same instance (singleton)."""
        from app.services.face_group_cache_service import (
            get_face_group_cache_service,
            _face_group_cache,
        )
        import app.services.face_group_cache_service as module

        with patch('app.services.face_group_cache_service.get_cache_service'):
            # Reset singleton
            module._face_group_cache = None

            service1 = get_face_group_cache_service()
            service2 = get_face_group_cache_service()

            assert service1 is service2
