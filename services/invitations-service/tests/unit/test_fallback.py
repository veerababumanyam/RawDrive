"""
Unit Tests for Fallback Patterns.

Tests graceful degradation strategies when primary operations fail.
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, patch

from src.resilience.fallback import (
    FallbackHandler,
    with_fallback,
    CacheFallback,
    QueueFallback,
)


class TestFallbackHandler:
    """Test FallbackHandler class."""

    @pytest.mark.asyncio
    async def test_primary_success_skips_fallback(self):
        """When primary succeeds, fallback is not called."""
        primary = AsyncMock(return_value="primary_result")
        fallback = AsyncMock(return_value="fallback_result")

        handler = FallbackHandler(primary=primary, fallback=fallback)

        result = await handler.execute()

        assert result == "primary_result"
        primary.assert_called_once()
        fallback.assert_not_called()

    @pytest.mark.asyncio
    async def test_fallback_on_primary_failure(self):
        """When primary fails, fallback is called."""
        primary = AsyncMock(side_effect=RuntimeError("Primary failed"))
        fallback = AsyncMock(return_value="fallback_result")

        handler = FallbackHandler(primary=primary, fallback=fallback)

        result = await handler.execute()

        assert result == "fallback_result"
        primary.assert_called_once()
        fallback.assert_called_once()

    @pytest.mark.asyncio
    async def test_default_when_both_fail(self):
        """When both primary and fallback fail, default is returned."""
        primary = AsyncMock(side_effect=RuntimeError("Primary failed"))
        fallback = AsyncMock(side_effect=RuntimeError("Fallback failed"))

        handler = FallbackHandler(
            primary=primary,
            fallback=fallback,
            default="default_value",
        )

        result = await handler.execute()

        assert result == "default_value"

    @pytest.mark.asyncio
    async def test_no_fallback_returns_default(self):
        """Without fallback, default is returned on failure."""
        primary = AsyncMock(side_effect=RuntimeError("Failed"))

        handler = FallbackHandler(
            primary=primary,
            fallback=None,
            default="default_value",
        )

        result = await handler.execute()

        assert result == "default_value"

    @pytest.mark.asyncio
    async def test_no_fallback_no_default_returns_none(self):
        """Without fallback or default, None is returned."""
        primary = AsyncMock(side_effect=RuntimeError("Failed"))

        handler = FallbackHandler(primary=primary)

        result = await handler.execute()

        assert result is None

    @pytest.mark.asyncio
    async def test_passes_arguments_to_primary(self):
        """Arguments are passed to primary function."""
        primary = AsyncMock(return_value="ok")

        handler = FallbackHandler(primary=primary)

        await handler.execute("arg1", "arg2", kwarg="value")

        primary.assert_called_once_with("arg1", "arg2", kwarg="value")

    @pytest.mark.asyncio
    async def test_passes_arguments_to_fallback(self):
        """Arguments are passed to fallback function."""
        primary = AsyncMock(side_effect=RuntimeError("Failed"))
        fallback = AsyncMock(return_value="fallback_ok")

        handler = FallbackHandler(primary=primary, fallback=fallback)

        await handler.execute("arg1", kwarg="value")

        fallback.assert_called_once_with("arg1", kwarg="value")

    @pytest.mark.asyncio
    async def test_on_fallback_callback(self):
        """on_fallback callback is called when falling back."""
        primary = AsyncMock(side_effect=ValueError("Primary error"))
        fallback = AsyncMock(return_value="fallback_result")
        callback_calls = []

        async def on_fallback(error: Exception):
            callback_calls.append(str(error))

        handler = FallbackHandler(
            primary=primary,
            fallback=fallback,
            on_fallback=on_fallback,
        )

        await handler.execute()

        assert len(callback_calls) == 1
        assert "Primary error" in callback_calls[0]


class TestWithFallbackDecorator:
    """Test with_fallback decorator."""

    @pytest.mark.asyncio
    async def test_decorator_primary_success(self):
        """Decorator works with successful primary."""
        async def fallback_fn():
            return "fallback"

        @with_fallback(fallback_fn)
        async def primary():
            return "primary"

        result = await primary()
        assert result == "primary"

    @pytest.mark.asyncio
    async def test_decorator_uses_fallback(self):
        """Decorator uses fallback on failure."""
        async def fallback_fn():
            return "fallback"

        @with_fallback(fallback_fn)
        async def primary():
            raise RuntimeError("Failed")

        result = await primary()
        assert result == "fallback"

    @pytest.mark.asyncio
    async def test_decorator_with_default(self):
        """Decorator returns default when all fail."""
        async def fallback_fn():
            raise RuntimeError("Fallback failed")

        @with_fallback(fallback_fn, default="default")
        async def primary():
            raise RuntimeError("Primary failed")

        result = await primary()
        assert result == "default"

    @pytest.mark.asyncio
    async def test_decorator_preserves_function_args(self):
        """Decorator preserves function arguments."""
        async def fallback_fn(x: int, y: int):
            return x + y + 100

        @with_fallback(fallback_fn)
        async def primary(x: int, y: int):
            raise RuntimeError("Failed")

        result = await primary(10, 20)
        assert result == 130  # 10 + 20 + 100


class TestCacheFallback:
    """Test CacheFallback pattern."""

    @pytest.mark.asyncio
    async def test_cache_hit_returns_cached_value(self):
        """Cache hit returns cached value without calling source."""
        cache_data = {"key1": "cached_value"}

        async def cache_get(key: str):
            return cache_data.get(key)

        async def cache_set(key: str, value: str):
            cache_data[key] = value

        source = AsyncMock(return_value="source_value")

        fallback = CacheFallback(
            cache_get=cache_get,
            cache_set=cache_set,
            source=source,
        )

        result = await fallback.get("key1")

        assert result == "cached_value"
        source.assert_not_called()

    @pytest.mark.asyncio
    async def test_cache_miss_calls_source(self):
        """Cache miss calls source and caches result."""
        cache_data = {}

        async def cache_get(key: str):
            return cache_data.get(key)

        async def cache_set(key: str, value: str):
            cache_data[key] = value

        source = AsyncMock(return_value="source_value")

        fallback = CacheFallback(
            cache_get=cache_get,
            cache_set=cache_set,
            source=source,
        )

        result = await fallback.get("key2")

        assert result == "source_value"
        source.assert_called_once_with("key2")
        assert cache_data["key2"] == "source_value"

    @pytest.mark.asyncio
    async def test_source_failure_returns_stale_cache(self):
        """Source failure returns stale cached value if available."""
        cache_data = {"key1": "stale_value"}
        stale_data = {"key1": "stale_value"}

        async def cache_get(key: str):
            return cache_data.get(key)

        async def cache_set(key: str, value: str):
            cache_data[key] = value

        async def stale_get(key: str):
            return stale_data.get(key)

        source = AsyncMock(side_effect=RuntimeError("Source unavailable"))

        fallback = CacheFallback(
            cache_get=cache_get,
            cache_set=cache_set,
            source=source,
            stale_cache_get=stale_get,
        )

        # First, clear the main cache to simulate cache miss
        cache_data.clear()

        result = await fallback.get("key1")

        # Should return stale value when source fails
        assert result == "stale_value"


class TestQueueFallback:
    """Test QueueFallback pattern."""

    @pytest.mark.asyncio
    async def test_primary_success_skips_queue(self):
        """Primary success doesn't queue."""
        queue_calls = []

        async def enqueue(data: dict):
            queue_calls.append(data)

        primary = AsyncMock(return_value="success")

        fallback = QueueFallback(
            primary=primary,
            enqueue=enqueue,
        )

        result = await fallback.execute({"id": 1})

        assert result == "success"
        assert len(queue_calls) == 0

    @pytest.mark.asyncio
    async def test_primary_failure_queues_for_retry(self):
        """Primary failure queues data for retry."""
        queue_calls = []

        async def enqueue(data: dict):
            queue_calls.append(data)

        primary = AsyncMock(side_effect=RuntimeError("Failed"))

        fallback = QueueFallback(
            primary=primary,
            enqueue=enqueue,
        )

        result = await fallback.execute({"id": 1})

        assert result is None  # Graceful degradation
        assert len(queue_calls) == 1
        assert queue_calls[0]["id"] == 1

    @pytest.mark.asyncio
    async def test_queue_failure_logs_error(self):
        """Queue failure is handled gracefully."""
        async def failing_enqueue(data: dict):
            raise RuntimeError("Queue unavailable")

        primary = AsyncMock(side_effect=RuntimeError("Primary failed"))

        fallback = QueueFallback(
            primary=primary,
            enqueue=failing_enqueue,
        )

        # Should not raise, even when queue fails
        result = await fallback.execute({"id": 1})

        assert result is None


class TestFallbackChaining:
    """Test chaining multiple fallbacks."""

    @pytest.mark.asyncio
    async def test_chain_of_fallbacks(self):
        """Multiple fallbacks can be chained."""
        call_order = []

        async def primary():
            call_order.append("primary")
            raise RuntimeError("Primary failed")

        async def fallback1():
            call_order.append("fallback1")
            raise RuntimeError("Fallback1 failed")

        async def fallback2():
            call_order.append("fallback2")
            return "fallback2_result"

        # Chain: primary -> fallback1 -> fallback2
        inner_handler = FallbackHandler(primary=fallback1, fallback=fallback2)
        outer_handler = FallbackHandler(
            primary=primary,
            fallback=lambda: inner_handler.execute(),
        )

        result = await outer_handler.execute()

        assert result == "fallback2_result"
        assert call_order == ["primary", "fallback1", "fallback2"]


class TestFallbackWithSpecificExceptions:
    """Test fallback only on specific exceptions."""

    @pytest.mark.asyncio
    async def test_fallback_only_on_specified_exceptions(self):
        """Fallback only triggers for specified exception types."""
        primary = AsyncMock(side_effect=ConnectionError("Network error"))
        fallback = AsyncMock(return_value="fallback")

        handler = FallbackHandler(
            primary=primary,
            fallback=fallback,
            fallback_exceptions=(ConnectionError, TimeoutError),
        )

        result = await handler.execute()
        assert result == "fallback"

    @pytest.mark.asyncio
    async def test_no_fallback_on_other_exceptions(self):
        """Non-specified exceptions are re-raised."""
        primary = AsyncMock(side_effect=ValueError("Validation error"))
        fallback = AsyncMock(return_value="fallback")

        handler = FallbackHandler(
            primary=primary,
            fallback=fallback,
            fallback_exceptions=(ConnectionError,),  # Not ValueError
        )

        with pytest.raises(ValueError):
            await handler.execute()

        fallback.assert_not_called()
