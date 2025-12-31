"""Unit tests for AI Request Deduplication Service.

Feature: 010-ai-powered-features
Task: T077 - Optimize AI API calls with request deduplication
"""

import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.services.ai_request_deduplication import (
    AIRequestDeduplicationService,
    get_ai_deduplication_service,
)


@pytest.fixture
def dedup_service():
    """Create a fresh deduplication service instance."""
    return AIRequestDeduplicationService()


class TestDeduplicatedCall:
    """Tests for deduplicated_call method."""

    @pytest.mark.asyncio
    async def test_single_call_executes_operation(self, dedup_service):
        """Single call should execute the operation normally."""
        call_count = 0

        async def operation():
            nonlocal call_count
            call_count += 1
            return "result"

        result = await dedup_service.deduplicated_call(
            cache_key="test:single",
            operation=operation,
        )

        assert result == "result"
        assert call_count == 1

    @pytest.mark.asyncio
    async def test_concurrent_calls_deduplicated(self, dedup_service):
        """Concurrent calls with same key should share single operation."""
        call_count = 0

        async def slow_operation():
            nonlocal call_count
            call_count += 1
            await asyncio.sleep(0.1)  # Simulate slow operation
            return "result"

        # Launch multiple concurrent calls with same key
        results = await asyncio.gather(
            dedup_service.deduplicated_call("test:concurrent", slow_operation),
            dedup_service.deduplicated_call("test:concurrent", slow_operation),
            dedup_service.deduplicated_call("test:concurrent", slow_operation),
        )

        # All should get same result
        assert results == ["result", "result", "result"]
        # But operation should only be called once
        assert call_count == 1

    @pytest.mark.asyncio
    async def test_different_keys_not_deduplicated(self, dedup_service):
        """Calls with different keys should execute separately."""
        call_count = 0

        async def operation():
            nonlocal call_count
            call_count += 1
            await asyncio.sleep(0.05)
            return f"result-{call_count}"

        results = await asyncio.gather(
            dedup_service.deduplicated_call("test:key1", operation),
            dedup_service.deduplicated_call("test:key2", operation),
            dedup_service.deduplicated_call("test:key3", operation),
        )

        # Each should execute separately
        assert call_count == 3
        assert len(set(results)) == 3  # All different results

    @pytest.mark.asyncio
    async def test_operation_error_propagates(self, dedup_service):
        """Errors from operation should propagate to all waiting callers."""

        async def failing_operation():
            await asyncio.sleep(0.1)
            raise ValueError("Test error")

        # Launch multiple concurrent calls
        with pytest.raises(ValueError, match="Test error"):
            await asyncio.gather(
                dedup_service.deduplicated_call("test:error", failing_operation),
                dedup_service.deduplicated_call("test:error", failing_operation),
            )

    @pytest.mark.asyncio
    async def test_sequential_calls_not_deduplicated(self, dedup_service):
        """Sequential calls (after completion) should not be deduplicated."""
        call_count = 0

        async def operation():
            nonlocal call_count
            call_count += 1
            return f"result-{call_count}"

        result1 = await dedup_service.deduplicated_call("test:seq", operation)
        result2 = await dedup_service.deduplicated_call("test:seq", operation)

        # Both should execute separately
        assert call_count == 2
        assert result1 == "result-1"
        assert result2 == "result-2"


class TestFetchImageData:
    """Tests for fetch_image_data method."""

    @pytest.mark.asyncio
    async def test_fetches_and_encodes_image(self, dedup_service):
        """Should fetch image and return base64 encoded data."""
        mock_response = MagicMock()
        mock_response.content = b"fake image data"
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get.return_value = mock_response
            mock_client_class.return_value.__aenter__.return_value = mock_client

            # Mock Redis to skip caching
            with patch("app.services.ai_request_deduplication.get_redis_client") as mock_redis:
                mock_redis_client = AsyncMock()
                mock_redis_client.get.return_value = None
                mock_redis.return_value = mock_redis_client

                result = await dedup_service.fetch_image_data(
                    "https://example.com/image.jpg"
                )

        import base64
        expected = base64.b64encode(b"fake image data").decode()
        assert result == expected

    @pytest.mark.asyncio
    async def test_returns_cached_data(self, dedup_service):
        """Should return cached data when available."""
        cached_data = "cached_base64_data"

        with patch("app.services.ai_request_deduplication.get_redis_client") as mock_redis:
            mock_redis_client = AsyncMock()
            mock_redis_client.get.return_value = cached_data
            mock_redis.return_value = mock_redis_client

            result = await dedup_service.fetch_image_data(
                "https://example.com/cached.jpg"
            )

        assert result == cached_data

    @pytest.mark.asyncio
    async def test_caches_fetched_data(self, dedup_service):
        """Should cache fetched image data."""
        mock_response = MagicMock()
        mock_response.content = b"image data"
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get.return_value = mock_response
            mock_client_class.return_value.__aenter__.return_value = mock_client

            with patch("app.services.ai_request_deduplication.get_redis_client") as mock_redis:
                mock_redis_client = AsyncMock()
                mock_redis_client.get.return_value = None  # Not cached
                mock_redis.return_value = mock_redis_client

                await dedup_service.fetch_image_data("https://example.com/new.jpg")

                # Verify cache was set
                mock_redis_client.setex.assert_called_once()

    @pytest.mark.asyncio
    async def test_skips_cache_when_disabled(self, dedup_service):
        """Should skip caching when use_cache=False."""
        mock_response = MagicMock()
        mock_response.content = b"image data"
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get.return_value = mock_response
            mock_client_class.return_value.__aenter__.return_value = mock_client

            with patch("app.services.ai_request_deduplication.get_redis_client") as mock_redis:
                mock_redis_client = AsyncMock()
                mock_redis.return_value = mock_redis_client

                await dedup_service.fetch_image_data(
                    "https://example.com/nocache.jpg",
                    use_cache=False,
                )

                # Cache should not be accessed
                mock_redis_client.get.assert_not_called()
                mock_redis_client.setex.assert_not_called()


class TestGenerateRequestKey:
    """Tests for generate_request_key method."""

    def test_basic_key_generation(self):
        """Should generate basic key with operation."""
        key = AIRequestDeduplicationService.generate_request_key(
            operation="analysis"
        )
        assert key == "ai:analysis"

    def test_key_with_user_id(self):
        """Should include user_id in key."""
        user_id = uuid4()
        key = AIRequestDeduplicationService.generate_request_key(
            operation="analysis",
            user_id=user_id,
        )
        assert f"u:{user_id}" in key

    def test_key_with_photo_id(self):
        """Should include photo_id in key."""
        photo_id = uuid4()
        key = AIRequestDeduplicationService.generate_request_key(
            operation="captions",
            photo_id=photo_id,
        )
        assert f"p:{photo_id}" in key

    def test_key_with_extra_params(self):
        """Should include extra params in sorted order."""
        key = AIRequestDeduplicationService.generate_request_key(
            operation="captions",
            style="professional",
            count=3,
        )
        # Params should be in sorted order
        assert "count:3" in key
        assert "style:professional" in key
        assert key.index("count:3") < key.index("style:professional")

    def test_long_key_hashed(self):
        """Long keys should be hashed."""
        # Generate a key with many long parameters
        key = AIRequestDeduplicationService.generate_request_key(
            operation="analysis",
            user_id=uuid4(),
            photo_id=uuid4(),
            very_long_param="x" * 200,
        )
        # Should be hashed to a reasonable length
        assert len(key) < 250


class TestServiceFactory:
    """Tests for service factory function."""

    def test_returns_singleton(self):
        """Should return same instance on multiple calls."""
        service1 = get_ai_deduplication_service()
        service2 = get_ai_deduplication_service()
        assert service1 is service2

    def test_returns_correct_type(self):
        """Should return AIRequestDeduplicationService instance."""
        service = get_ai_deduplication_service()
        assert isinstance(service, AIRequestDeduplicationService)
