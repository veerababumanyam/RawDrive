"""
Unit Tests for Retry Logic.

Tests the retry mechanism with exponential backoff.
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, patch

from src.resilience.retry import (
    RetryPolicy,
    exponential_backoff,
    should_retry,
    retry_with_backoff,
    with_retry,
)


class TestExponentialBackoff:
    """Test exponential backoff calculation."""

    def test_first_attempt_uses_base_delay(self):
        """First attempt (0) uses base delay."""
        delay = exponential_backoff(
            attempt=0,
            base_delay=1.0,
            max_delay=60.0,
            jitter=0,
        )

        assert delay == 1.0

    def test_exponential_growth(self):
        """Delay grows exponentially with attempts."""
        delays = [
            exponential_backoff(i, base_delay=1.0, max_delay=1000.0, jitter=0)
            for i in range(5)
        ]

        assert delays[0] == 1.0  # 1 * 2^0
        assert delays[1] == 2.0  # 1 * 2^1
        assert delays[2] == 4.0  # 1 * 2^2
        assert delays[3] == 8.0  # 1 * 2^3
        assert delays[4] == 16.0  # 1 * 2^4

    def test_respects_max_delay(self):
        """Delay is capped at max_delay."""
        delay = exponential_backoff(
            attempt=10,  # Would be 1024 without cap
            base_delay=1.0,
            max_delay=60.0,
            jitter=0,
        )

        assert delay == 60.0

    def test_jitter_adds_randomness(self):
        """Jitter adds random variation to delay."""
        delays = [
            exponential_backoff(
                attempt=3,
                base_delay=1.0,
                max_delay=100.0,
                jitter=0.5,  # 50% jitter
            )
            for _ in range(100)
        ]

        # All delays should be around 8.0 +/- 4.0 (50% of 8)
        for delay in delays:
            assert 4.0 <= delay <= 12.0

        # Not all delays should be the same (randomness)
        assert len(set(delays)) > 1

    def test_custom_exponential_base(self):
        """Custom exponential base is used."""
        delay = exponential_backoff(
            attempt=3,
            base_delay=1.0,
            max_delay=1000.0,
            exponential_base=3.0,  # 3^3 = 27
            jitter=0,
        )

        assert delay == 27.0


class TestShouldRetry:
    """Test retry decision logic."""

    def test_retry_on_default_exceptions(self):
        """Default policy retries on any Exception."""
        policy = RetryPolicy()

        assert should_retry(RuntimeError("Error"), policy)
        assert should_retry(ValueError("Error"), policy)
        assert should_retry(ConnectionError("Error"), policy)

    def test_no_retry_on_excluded_exceptions(self):
        """Excluded exceptions are not retried."""
        policy = RetryPolicy(
            retryable_exceptions=(Exception,),
            non_retryable_exceptions=(ValueError,),
        )

        assert not should_retry(ValueError("Invalid"), policy)
        assert should_retry(RuntimeError("Error"), policy)

    def test_specific_retryable_exceptions(self):
        """Only specified exceptions trigger retry."""
        policy = RetryPolicy(
            retryable_exceptions=(ConnectionError, TimeoutError),
        )

        assert should_retry(ConnectionError("Error"), policy)
        assert should_retry(TimeoutError("Error"), policy)
        assert not should_retry(ValueError("Error"), policy)


class TestRetryWithBackoff:
    """Test retry_with_backoff function."""

    @pytest.mark.asyncio
    async def test_success_on_first_try(self):
        """Successful call doesn't retry."""
        call_count = 0

        async def success():
            nonlocal call_count
            call_count += 1
            return "ok"

        result = await retry_with_backoff(success)

        assert result == "ok"
        assert call_count == 1

    @pytest.mark.asyncio
    async def test_retries_on_failure(self):
        """Retries on transient failure."""
        call_count = 0

        async def fails_then_succeeds():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise RuntimeError("Transient error")
            return "ok"

        policy = RetryPolicy(max_retries=3, base_delay=0.01)

        result = await retry_with_backoff(fails_then_succeeds, policy=policy)

        assert result == "ok"
        assert call_count == 3

    @pytest.mark.asyncio
    async def test_raises_after_max_retries(self):
        """Raises exception after max retries exhausted."""
        async def always_fails():
            raise RuntimeError("Permanent error")

        policy = RetryPolicy(max_retries=2, base_delay=0.01)

        with pytest.raises(RuntimeError, match="Permanent error"):
            await retry_with_backoff(always_fails, policy=policy)

    @pytest.mark.asyncio
    async def test_on_retry_callback(self):
        """on_retry callback is called before each retry."""
        retry_events = []

        async def on_retry(attempt: int, error: Exception):
            retry_events.append((attempt, str(error)))

        call_count = 0

        async def fails_twice():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise ValueError(f"Error {call_count}")
            return "ok"

        policy = RetryPolicy(max_retries=3, base_delay=0.01)

        await retry_with_backoff(
            fails_twice,
            policy=policy,
            on_retry=on_retry,
        )

        assert len(retry_events) == 2
        assert retry_events[0] == (1, "Error 1")
        assert retry_events[1] == (2, "Error 2")

    @pytest.mark.asyncio
    async def test_no_retry_on_excluded_exception(self):
        """Excluded exceptions are not retried."""
        call_count = 0

        async def validation_error():
            nonlocal call_count
            call_count += 1
            raise ValueError("Invalid input")

        policy = RetryPolicy(
            max_retries=3,
            base_delay=0.01,
            non_retryable_exceptions=(ValueError,),
        )

        with pytest.raises(ValueError):
            await retry_with_backoff(validation_error, policy=policy)

        # Should only be called once (no retries)
        assert call_count == 1


class TestWithRetryDecorator:
    """Test with_retry decorator."""

    @pytest.mark.asyncio
    async def test_decorator_success(self):
        """Decorator works with successful function."""
        @with_retry()
        async def success():
            return "ok"

        result = await success()
        assert result == "ok"

    @pytest.mark.asyncio
    async def test_decorator_with_retries(self):
        """Decorator retries on failure."""
        call_count = 0

        @with_retry(RetryPolicy(max_retries=2, base_delay=0.01))
        async def fails_once():
            nonlocal call_count
            call_count += 1
            if call_count < 2:
                raise RuntimeError("Error")
            return "ok"

        result = await fails_once()

        assert result == "ok"
        assert call_count == 2

    @pytest.mark.asyncio
    async def test_decorator_with_on_retry(self):
        """Decorator calls on_retry callback."""
        retry_count = 0

        async def count_retries(attempt, error):
            nonlocal retry_count
            retry_count += 1

        call_count = 0

        @with_retry(
            RetryPolicy(max_retries=3, base_delay=0.01),
            on_retry=count_retries,
        )
        async def fails_twice():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise RuntimeError("Error")
            return "ok"

        await fails_twice()

        assert retry_count == 2


class TestRetryPolicies:
    """Test pre-defined retry policies."""

    def test_database_policy_settings(self):
        """Database policy has quick retries."""
        from src.resilience.retry import DATABASE_RETRY_POLICY

        assert DATABASE_RETRY_POLICY.max_retries == 3
        assert DATABASE_RETRY_POLICY.base_delay < 1.0

    def test_api_policy_settings(self):
        """API policy has moderate settings."""
        from src.resilience.retry import API_RETRY_POLICY

        assert API_RETRY_POLICY.max_retries >= 3
        assert API_RETRY_POLICY.base_delay >= 1.0

    def test_email_policy_settings(self):
        """Email policy has longer delays."""
        from src.resilience.retry import EMAIL_RETRY_POLICY

        assert EMAIL_RETRY_POLICY.max_retries >= 5
        assert EMAIL_RETRY_POLICY.max_delay >= 60.0

    def test_background_policy_settings(self):
        """Background job policy is very patient."""
        from src.resilience.retry import BACKGROUND_JOB_RETRY_POLICY

        assert BACKGROUND_JOB_RETRY_POLICY.max_retries >= 10
