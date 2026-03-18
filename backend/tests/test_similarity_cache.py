"""Tests for SimilarityCacheService.

Validates Redis-backed caching of similarity groups with TTL,
UUID serialization, and graceful degradation on Redis errors.
"""

from __future__ import annotations

import json
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from uuid import UUID, uuid4

from app.services.similarity_cache_service import (
    SimilarityCacheService,
    SIMILARITY_GROUP_TTL,
    CACHE_KEY_PREFIX,
)


@pytest.fixture
def cache_service():
    """Create a SimilarityCacheService instance."""
    return SimilarityCacheService()


@pytest.fixture
def mock_redis():
    """Create a mock Redis client."""
    redis = AsyncMock()
    return redis


@pytest.fixture
def sample_session_id():
    return uuid4()


@pytest.fixture
def sample_groups():
    """Sample similarity group data with UUIDs."""
    return [
        {
            "best_asset_id": uuid4(),
            "avg_similarity": 0.92,
            "best_reason": "Highest quality score in group",
            "members": [
                {
                    "asset_id": uuid4(),
                    "similarity_score": 1.0,
                    "is_best": True,
                    "quality_rank": 1,
                },
                {
                    "asset_id": uuid4(),
                    "similarity_score": 0.88,
                    "is_best": False,
                    "quality_rank": 2,
                },
            ],
        },
    ]


class TestCacheSimilarityGroups:
    """Test cache_similarity_groups method."""

    @pytest.mark.asyncio
    async def test_stores_json_in_redis_with_correct_key(
        self, cache_service, mock_redis, sample_session_id, sample_groups
    ):
        """Test 1: cache_similarity_groups stores JSON in Redis with key similarity_groups:{session_id}."""
        with patch(
            "app.services.similarity_cache_service.get_redis_client",
            return_value=mock_redis,
        ):
            await cache_service.cache_similarity_groups(
                sample_session_id, sample_groups
            )

        expected_key = f"{CACHE_KEY_PREFIX}{sample_session_id}"
        mock_redis.setex.assert_called_once()
        call_args = mock_redis.setex.call_args
        assert call_args[0][0] == expected_key

        # Verify stored value is valid JSON
        stored_json = call_args[0][2]
        parsed = json.loads(stored_json)
        assert isinstance(parsed, list)
        assert len(parsed) == 1

    @pytest.mark.asyncio
    async def test_sets_ttl_of_3600_seconds(
        self, cache_service, mock_redis, sample_session_id, sample_groups
    ):
        """Test 2: cache_similarity_groups sets TTL of 3600 seconds (1 hour)."""
        with patch(
            "app.services.similarity_cache_service.get_redis_client",
            return_value=mock_redis,
        ):
            await cache_service.cache_similarity_groups(
                sample_session_id, sample_groups
            )

        call_args = mock_redis.setex.call_args
        assert call_args[0][1] == 3600
        assert SIMILARITY_GROUP_TTL == 3600

    @pytest.mark.asyncio
    async def test_handles_uuid_serialization(
        self, cache_service, mock_redis, sample_session_id, sample_groups
    ):
        """Test 6: cache_similarity_groups handles serialization of UUID fields."""
        with patch(
            "app.services.similarity_cache_service.get_redis_client",
            return_value=mock_redis,
        ):
            await cache_service.cache_similarity_groups(
                sample_session_id, sample_groups
            )

        call_args = mock_redis.setex.call_args
        stored_json = call_args[0][2]
        parsed = json.loads(stored_json)

        # All UUID fields should be strings, not UUID objects
        group = parsed[0]
        assert isinstance(group["best_asset_id"], str)
        for member in group["members"]:
            assert isinstance(member["asset_id"], str)


class TestGetCachedGroups:
    """Test get_cached_groups method."""

    @pytest.mark.asyncio
    async def test_returns_parsed_json_on_cache_hit(
        self, cache_service, mock_redis, sample_session_id
    ):
        """Test 3: get_cached_groups returns parsed JSON when cache hit."""
        cached_data = [
            {
                "best_asset_id": str(uuid4()),
                "avg_similarity": 0.92,
                "members": [],
            }
        ]
        mock_redis.get.return_value = json.dumps(cached_data).encode("utf-8")

        with patch(
            "app.services.similarity_cache_service.get_redis_client",
            return_value=mock_redis,
        ):
            result = await cache_service.get_cached_groups(sample_session_id)

        assert result is not None
        assert len(result) == 1
        assert result[0]["avg_similarity"] == 0.92

    @pytest.mark.asyncio
    async def test_returns_none_on_cache_miss(
        self, cache_service, mock_redis, sample_session_id
    ):
        """Test 4: get_cached_groups returns None when cache miss."""
        mock_redis.get.return_value = None

        with patch(
            "app.services.similarity_cache_service.get_redis_client",
            return_value=mock_redis,
        ):
            result = await cache_service.get_cached_groups(sample_session_id)

        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_on_redis_error(
        self, cache_service, mock_redis, sample_session_id
    ):
        """Test 7: get_cached_groups returns None on Redis connection error."""
        mock_redis.get.side_effect = ConnectionError("Redis unavailable")

        with patch(
            "app.services.similarity_cache_service.get_redis_client",
            return_value=mock_redis,
        ):
            result = await cache_service.get_cached_groups(sample_session_id)

        assert result is None


class TestInvalidateCache:
    """Test invalidate_cache method."""

    @pytest.mark.asyncio
    async def test_deletes_redis_key(
        self, cache_service, mock_redis, sample_session_id
    ):
        """Test 5: invalidate_cache deletes the Redis key."""
        with patch(
            "app.services.similarity_cache_service.get_redis_client",
            return_value=mock_redis,
        ):
            await cache_service.invalidate_cache(sample_session_id)

        expected_key = f"{CACHE_KEY_PREFIX}{sample_session_id}"
        mock_redis.delete.assert_called_once_with(expected_key)
