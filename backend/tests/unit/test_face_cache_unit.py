"""Unit tests for Face Cache system components.

Tests individual components in isolation without external dependencies.
Focuses on business logic, edge cases, and error handling.

Test Coverage:
- FaceCacheResult model
- Image hash calculation
- Cache key generation
- TTL calculation
- Similarity computation
- Error handling
"""

import hashlib
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch
from uuid import uuid4

import numpy as np
import pytest

from app.services.face_cache_manager import (
    FaceCacheResult,
    FaceTaggingCacheManager,
)


# =============================================================================
# FaceCacheResult Tests
# =============================================================================


class TestFaceCacheResult:
    """Tests for FaceCacheResult model."""

    def test_cache_hit_result(self):
        """Test creating a cache hit result."""
        data = {"faces": [{"x": 10, "y": 10, "width": 50, "height": 50}]}
        result = FaceCacheResult(found=True, source="L1", data=data)

        assert result.found is True
        assert result.is_hit is True
        assert result.is_miss is False
        assert result.source == "L1"
        assert result.data == data

    def test_cache_miss_result(self):
        """Test creating a cache miss result."""
        result = FaceCacheResult(found=False, source="miss")

        assert result.found is False
        assert result.is_hit is False
        assert result.is_miss is True
        assert result.source == "miss"
        assert result.data == {}

    def test_result_with_ttl(self):
        """Test result with TTL information."""
        result = FaceCacheResult(
            found=True, source="L2", data={"test": "data"}, ttl=3600
        )

        assert result.ttl == 3600


# =============================================================================
# Cache Key Generation Tests
# =============================================================================


class TestCacheKeyGeneration:
    """Tests for cache key generation methods."""

    def test_asset_cache_key_format(self):
        """Test asset cache key format."""
        workspace_id = uuid4()
        asset_id = uuid4()
        image_hash = "abc123"

        key = FaceTaggingCacheManager._asset_cache_key(
            workspace_id, asset_id, image_hash
        )

        assert key == f"asset:{workspace_id}:{asset_id}:{image_hash}"

    def test_group_cache_key_format(self):
        """Test group cache key format."""
        workspace_id = uuid4()
        group_id = uuid4()

        key = FaceTaggingCacheManager._group_cache_key(workspace_id, group_id)

        assert key == f"group:{workspace_id}:{group_id}"

    def test_embedding_cache_key_format(self):
        """Test embedding cache key format."""
        workspace_id = uuid4()
        face_crop_hash = "xyz789"

        key = FaceTaggingCacheManager._embedding_cache_key(
            workspace_id, face_crop_hash
        )

        assert key == f"embedding:{workspace_id}:{face_crop_hash}"


# =============================================================================
# Image Hash Calculation Tests
# =============================================================================


class TestImageHashCalculation:
    """Tests for SHA-256 image hash calculation."""

    def test_calculate_image_hash(self):
        """Test SHA-256 hash calculation for image data."""
        image_data = b"test image data"

        hash_result = FaceTaggingCacheManager.calculate_image_hash(image_data)

        # Verify it's a valid SHA-256 hex string
        assert len(hash_result) == 64
        assert all(c in "0123456789abcdef" for c in hash_result)

    def test_same_data_same_hash(self):
        """Test that same data produces same hash."""
        image_data = b"test image data"

        hash1 = FaceTaggingCacheManager.calculate_image_hash(image_data)
        hash2 = FaceTaggingCacheManager.calculate_image_hash(image_data)

        assert hash1 == hash2

    def test_different_data_different_hash(self):
        """Test that different data produces different hash."""
        hash1 = FaceTaggingCacheManager.calculate_image_hash(b"data1")
        hash2 = FaceTaggingCacheManager.calculate_image_hash(b"data2")

        assert hash1 != hash2

    def test_hash_matches_standard_sha256(self):
        """Test that our hash matches standard SHA-256."""
        image_data = b"test data"

        our_hash = FaceTaggingCacheManager.calculate_image_hash(image_data)
        standard_hash = hashlib.sha256(image_data).hexdigest()

        assert our_hash == standard_hash


# =============================================================================
# L1 Cache Tests
# =============================================================================


class TestL1MemoryCache:
    """Tests for L1 in-memory cache operations."""

    def test_l1_set_and_get(self):
        """Test L1 cache set and get operations."""
        cache = FaceTaggingCacheManager(MagicMock(), None)
        cache_key = "test:asset:key"
        data = {"test": "value"}

        cache._l1_set_asset(cache_key, data)
        result = cache._l1_get_asset(cache_key)

        assert result == data

    def test_l1_expiration(self):
        """Test L1 cache entry expiration."""
        cache = FaceTaggingCacheManager(MagicMock(), None)
        cache_key = "test:asset:key"
        data = {"test": "value"}

        cache._l1_set_asset(cache_key, data)

        # Manually expire the entry (set timestamp to 6 minutes ago)
        old_timestamp = datetime.now() - timedelta(minutes=6)
        cache._l1_asset_cache[cache_key] = (data, old_timestamp)

        result = cache._l1_get_asset(cache_key)

        # Entry should be expired and removed
        assert result is None
        assert cache_key not in cache._l1_asset_cache

    def test_l1_lru_eviction(self):
        """Test L1 cache LRU eviction when at capacity."""
        cache = FaceTaggingCacheManager(MagicMock(), None)
        cache.L1_MAX_ASSETS = 3  # Small limit for testing

        # Fill cache to capacity
        for i in range(3):
            cache._l1_set_asset(f"key{i}", {"value": i})

        # Add one more - should evict oldest
        cache._l1_set_asset("key3", {"value": 3})

        # Oldest key should be evicted
        assert cache._l1_get_asset("key0") is None
        # Newer keys should still be present
        assert cache._l1_get_asset("key1") is not None
        assert cache._l1_get_asset("key2") is not None
        assert cache._l1_get_asset("key3") is not None

    def test_l1_invalidate_asset(self):
        """Test invalidating specific asset from L1 cache."""
        cache = FaceTaggingCacheManager(MagicMock(), None)

        workspace_id = uuid4()
        asset_id = uuid4()

        # Add multiple entries for same asset with different hashes
        for i in range(3):
            cache_key = cache._asset_cache_key(workspace_id, asset_id, f"hash{i}")
            cache._l1_set_asset(cache_key, {"value": i})

        # Invalidate asset
        count = cache._l1_invalidate_asset(asset_id, workspace_id)

        assert count == 3
        # All entries should be removed
        assert cache._l1_invalidate_asset(asset_id, workspace_id) == 0

    def test_l1_invalidate_workspace(self):
        """Test invalidating entire workspace from L1 cache."""
        cache = FaceTaggingCacheManager(MagicMock(), None)

        workspace_id = uuid4()
        workspace_id_2 = uuid4()

        # Add entries for both workspaces
        cache._l1_set_asset(
            cache._asset_cache_key(workspace_id, uuid4(), "hash1"), {"ws": 1}
        )
        cache._l1_set_asset(
            cache._asset_cache_key(workspace_id, uuid4(), "hash2"), {"ws": 1}
        )
        cache._l1_set_asset(
            cache._asset_cache_key(workspace_id_2, uuid4(), "hash1"), {"ws": 2}
        )

        # Invalidate first workspace
        count = cache._l1_invalidate_workspace(workspace_id)

        # Should have removed 2 entries
        assert count >= 2

        # Second workspace entries should remain
        remaining = [
            k for k in cache._l1_asset_cache.keys()
            if f":{workspace_id_2}:" in k
        ]
        assert len(remaining) >= 1


# =============================================================================
# Similarity Computation Tests
# =============================================================================


class TestSimilarityComputation:
    """Tests for face similarity computation logic."""

    def test_cosine_similarity_identical_vectors(self):
        """Test cosine similarity for identical vectors."""
        vec1 = [0.5] * 512
        vec1_normalized = vec1 / np.linalg.norm(vec1)

        vec2 = [0.5] * 512
        vec2_normalized = vec2 / np.linalg.norm(vec2)

        similarity = np.dot(vec1_normalized, vec2_normalized)

        # Identical vectors should have similarity of 1.0
        assert abs(similarity - 1.0) < 0.001

    def test_cosine_similarity_opposite_vectors(self):
        """Test cosine similarity for opposite vectors."""
        vec1 = [0.5] * 512
        vec1_normalized = vec1 / np.linalg.norm(vec1)

        vec2 = [-0.5] * 512
        vec2_normalized = vec2 / np.linalg.norm(vec2)

        similarity = np.dot(vec1_normalized, vec2_normalized)

        # Opposite vectors should have similarity of -1.0
        assert abs(similarity + 1.0) < 0.001

    def test_cosine_similarity_orthogonal_vectors(self):
        """Test cosine similarity for orthogonal vectors."""
        # Create two orthogonal vectors
        vec1 = [1.0] + [0.0] * 511
        vec2 = [0.0, 1.0] + [0.0] * 510

        similarity = np.dot(vec1, vec2) / (
            np.linalg.norm(vec1) * np.linalg.norm(vec2)
        )

        # Orthogonal vectors should have similarity near 0
        assert abs(similarity) < 0.001

    def test_centroid_calculation(self):
        """Test centroid (mean) calculation for embeddings."""
        embeddings = [
            [0.1] * 512,
            [0.2] * 512,
            [0.3] * 512,
        ]

        centroid = np.mean(embeddings, axis=0)

        # Centroid should be average of embeddings
        expected = [0.2] * 512  # Mean of 0.1, 0.2, 0.3
        for i in range(512):
            assert abs(centroid[i] - expected[i]) < 0.001

    def test_centroid_normalization(self):
        """Test that centroid is properly normalized."""
        embeddings = [
            [0.1] * 512,
            [0.2] * 512,
        ]

        centroid = np.mean(embeddings, axis=0)

        # Normalize
        norm = np.linalg.norm(centroid)
        if norm > 0:
            centroid_normalized = centroid / norm
            new_norm = np.linalg.norm(centroid_normalized)

            # Normalized vector should have L2 norm of 1.0
            assert abs(new_norm - 1.0) < 0.001

    def test_similarity_threshold_filtering(self):
        """Test filtering by similarity threshold."""
        similarities = [
            {"group_id": "A", "similarity": 0.95},
            {"group_id": "B", "similarity": 0.87},
            {"group_id": "C", "similarity": 0.72},
            {"group_id": "D", "similarity": 0.91},
        ]

        threshold = 0.85
        filtered = [s for s in similarities if s["similarity"] >= threshold]

        assert len(filtered) == 3
        assert all(s["group_id"] in ["A", "B", "D"] for s in filtered)


# =============================================================================
# TTL and Expiration Tests
# =============================================================================


class TestTTLExpiration:
    """Tests for TTL and expiration logic."""

    def test_default_ttl_values(self):
        """Test that default TTL values are set correctly."""
        cache = FaceTaggingCacheManager(MagicMock(), None)

        assert cache.DEFAULT_ASSET_CACHE_TTL == 3600  # 1 hour
        assert cache.DEFAULT_GROUP_CACHE_TTL == 7200  # 2 hours
        assert cache.DEFAULT_EMBEDDING_CACHE_TTL == 86400  # 24 hours

    def test_l1_default_expiration_minutes(self):
        """Test L1 cache uses 5 minute expiration."""
        cache = FaceTaggingCacheManager(MagicMock(), None)

        cache._l1_set_asset("key", {"value": 1})

        # Get the timestamp
        entry = cache._l1_asset_cache.get("key")
        assert entry is not None

        data, timestamp = entry

        # Should expire after 5 minutes
        expiration_time = timestamp + timedelta(minutes=5)
        time_until_expiry = expiration_time - datetime.now()

        # Should be approximately 5 minutes (± 1 second for test execution)
        assert 299 <= time_until_expiry.total_seconds() <= 301


# =============================================================================
# Cache Statistics Tests
# =============================================================================


class TestCacheStatistics:
    """Tests for cache statistics tracking."""

    def test_initial_stats(self):
        """Test initial statistics state."""
        cache = FaceTaggingCacheManager(MagicMock(), None)

        assert cache._stats["l1_hits"] == 0
        assert cache._stats["l2_hits"] == 0
        assert cache._stats["l3_hits"] == 0
        assert cache._stats["misses"] == 0
        assert cache._stats["writes"] == 0

    def test_hit_rate_calculation(self):
        """Test hit rate percentage calculation."""
        total_lookups = 100 + 50 + 20 + 30  # hits + misses
        total_hits = 100 + 50 + 20

        hit_rate = total_hits / total_lookups * 100

        expected = 170 / 200 * 100  # 85%
        assert abs(hit_rate - expected) < 0.01

    def test_zero_hit_rate_when_no_lookups(self):
        """Test hit rate when no lookups have occurred."""
        total_hits = 0
        total_misses = 0
        total_lookups = total_hits + total_misses

        hit_rate = (
            total_hits / total_lookups * 100 if total_lookups > 0 else 0
        )

        assert hit_rate == 0


# =============================================================================
# Error Handling Tests
# =============================================================================


class TestErrorHandling:
    """Tests for error handling in cache operations."""

    def test_get_with_empty_key(self):
        """Test cache get with empty key."""
        cache = FaceTaggingCacheManager(MagicMock(), None)

        result = cache._l1_get_asset("")

        assert result is None

    def test_set_with_empty_data(self):
        """Test cache set with empty data."""
        cache = FaceTaggingCacheManager(MagicMock(), None)

        # Should not raise error
        cache._l1_set_asset("key", {})

        result = cache._l1_get_asset("key")
        assert result == {}

    @pytest.mark.asyncio
    async def test_redis_get_failure_handling(self):
        """Test handling of Redis get failure."""
        redis_mock = MagicMock()
        redis_mock.get = MagicMock(side_effect=Exception("Redis connection error"))

        cache = FaceTaggingCacheManager(MagicMock(), redis_mock)

        # Should not raise error, should return None
        result = await cache._l2_get_asset("key")

        assert result is None

    @pytest.mark.asyncio
    async def test_redis_set_failure_handling(self):
        """Test handling of Redis set failure."""
        redis_mock = MagicMock()
        redis_mock.set = MagicMock(side_effect=Exception("Redis connection error"))

        cache = FaceTaggingCacheManager(MagicMock(), redis_mock)

        # Should not raise error
        await cache._l2_set_asset("key", {"value": 1}, 3600)

        # Call should have been attempted
        redis_mock.set.assert_called_once()


# =============================================================================
# L1 Cache Size Limits
# =============================================================================


class TestL1CacheSizeLimits:
    """Tests for L1 cache size limits."""

    def test_default_l1_limits(self):
        """Test default L1 cache size limits."""
        cache = FaceTaggingCacheManager(MagicMock(), None)

        assert cache.L1_MAX_ASSETS == 1000
        assert cache.L1_MAX_GROUPS == 500
        assert cache.L1_MAX_EMBEDDINGS == 5000

    def test_l1_counts(self):
        """Test L1 cache entry counting."""
        cache = FaceTaggingCacheManager(MagicMock(), None)

        # Initially empty
        assert len(cache._l1_asset_cache) == 0
        assert len(cache._l1_group_cache) == 0
        assert len(cache._l1_embedding_cache) == 0

        # Add some entries
        cache._l1_set_asset("asset1", {"test": 1})
        cache._l1_set_asset("asset2", {"test": 2})

        assert len(cache._l1_asset_cache) == 2


# =============================================================================
# Run Tests
# =============================================================================


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
