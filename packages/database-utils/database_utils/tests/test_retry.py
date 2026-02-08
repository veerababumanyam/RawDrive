"""Tests for retry logic utilities."""

import pytest
import asyncio
from unittest.mock import AsyncMock, patch
import sys
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from retry import (
    RetryConfig,
    with_retry,
    RETRYABLE_EXCEPTIONS,
)


class TestRetryConfig:
    """Tests for RetryConfig class."""

    def test_default_values(self):
        """Default values are set correctly."""
        config = RetryConfig()
        assert config.max_attempts == 3
        assert config.base_delay == 0.1
        assert config.max_delay == 5.0
        assert config.exponential_base == 2.0
        assert config.jitter is True

    def test_calculate_delay_exponential(self):
        """Delay increases exponentially without jitter."""
        config = RetryConfig(
            base_delay=1.0,
            exponential_base=2.0,
            jitter=False,
        )

        assert config.calculate_delay(1) == 1.0  # 1 * 2^0
        assert config.calculate_delay(2) == 2.0  # 1 * 2^1
        assert config.calculate_delay(3) == 4.0  # 1 * 2^2

    def test_calculate_delay_respects_max(self):
        """Delay is capped at max_delay."""
        config = RetryConfig(
            base_delay=1.0,
            max_delay=3.0,
            exponential_base=2.0,
            jitter=False,
        )

        assert config.calculate_delay(10) == 3.0  # Would be 512, but capped

    def test_calculate_delay_adds_jitter(self):
        """Delay includes jitter when enabled."""
        config = RetryConfig(
            base_delay=1.0,
            exponential_base=1.0,  # No exponential growth
            jitter=True,
        )

        # With jitter, delay should be between 1.0 and 1.5
        delay = config.calculate_delay(1)
        assert 1.0 <= delay <= 1.5


class TestWithRetryDecorator:
    """Tests for with_retry decorator."""

    @pytest.mark.asyncio
    async def test_returns_result_on_success(self):
        """Returns result when function succeeds."""
        @with_retry()
        async def success_func():
            return "success"

        result = await success_func()
        assert result == "success"

    @pytest.mark.asyncio
    async def test_retries_on_retryable_exception(self):
        """Retries when retryable exception is raised."""
        call_count = 0

        @with_retry(RetryConfig(max_attempts=3, base_delay=0.01))
        async def flaky_func():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                # Simulate a retryable error
                raise Exception("Simulated error")
            return "success"

        # Mock the retryable exceptions to include our Exception
        config = RetryConfig(
            max_attempts=3,
            base_delay=0.01,
            retryable_exceptions=(Exception,),
        )

        call_count = 0

        @with_retry(config)
        async def flaky_func2():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise Exception("Simulated error")
            return "success"

        result = await flaky_func2()
        assert result == "success"
        assert call_count == 3

    @pytest.mark.asyncio
    async def test_raises_after_max_attempts(self):
        """Raises exception after max attempts exhausted."""
        config = RetryConfig(
            max_attempts=3,
            base_delay=0.01,
            retryable_exceptions=(ValueError,),
        )

        @with_retry(config)
        async def always_fails():
            raise ValueError("Always fails")

        with pytest.raises(ValueError, match="Always fails"):
            await always_fails()

    @pytest.mark.asyncio
    async def test_does_not_retry_non_retryable_exception(self):
        """Does not retry non-retryable exceptions."""
        call_count = 0
        config = RetryConfig(
            max_attempts=3,
            base_delay=0.01,
            retryable_exceptions=(ValueError,),  # Only retry ValueError
        )

        @with_retry(config)
        async def raises_type_error():
            nonlocal call_count
            call_count += 1
            raise TypeError("Not retryable")

        with pytest.raises(TypeError):
            await raises_type_error()

        # Should only be called once (no retries)
        assert call_count == 1


class TestRetryableExceptions:
    """Tests for default retryable exceptions."""

    def test_includes_common_database_errors(self):
        """Includes common transient database errors."""
        import asyncpg

        # These should all be in the default retryable exceptions
        assert asyncpg.DeadlockDetectedError in RETRYABLE_EXCEPTIONS
        assert asyncpg.SerializationError in RETRYABLE_EXCEPTIONS
        assert asyncpg.TooManyConnectionsError in RETRYABLE_EXCEPTIONS


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
