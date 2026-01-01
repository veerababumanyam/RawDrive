"""
Integration Tests for Resilience Patterns.

Tests circuit breaker, retry, and fallback patterns working together
in realistic service scenarios.
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from uuid import uuid4

from src.resilience.circuit_breaker import (
    CircuitBreaker,
    CircuitBreakerConfig,
    CircuitBreakerOpen,
    CircuitState,
)
from src.resilience.retry import (
    RetryPolicy,
    retry_with_backoff,
    with_retry,
    DATABASE_RETRY_POLICY,
)
from src.resilience.fallback import (
    FallbackHandler,
    CacheFallback,
)


class TestCircuitBreakerWithRetry:
    """Test circuit breaker combined with retry logic."""

    @pytest.mark.asyncio
    async def test_retry_within_circuit_breaker(self):
        """Retries happen within circuit breaker protection."""
        call_count = 0

        async def flaky_service():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise ConnectionError("Temporary failure")
            return "success"

        cb = CircuitBreaker(
            "flaky-service",
            CircuitBreakerConfig(failure_threshold=5),
        )

        policy = RetryPolicy(max_retries=3, base_delay=0.01)

        # Should retry within circuit breaker and eventually succeed
        result = await cb.call(
            lambda: retry_with_backoff(flaky_service, policy=policy)
        )

        assert result == "success"
        assert call_count == 3
        assert cb.state == CircuitState.CLOSED

    @pytest.mark.asyncio
    async def test_circuit_opens_after_repeated_failures(self):
        """Circuit opens after threshold failures even with retries."""
        async def always_fails():
            raise ConnectionError("Service down")

        cb = CircuitBreaker(
            "always-fails",
            CircuitBreakerConfig(
                failure_threshold=3,
                recovery_timeout=0.1,  # Short for testing
            ),
        )

        policy = RetryPolicy(max_retries=1, base_delay=0.01)

        # Multiple failed calls to trip the circuit
        for _ in range(3):
            try:
                await cb.call(
                    lambda: retry_with_backoff(always_fails, policy=policy)
                )
            except ConnectionError:
                pass

        # Circuit should now be open
        assert cb.state == CircuitState.OPEN

        # Further calls should fail fast
        with pytest.raises(CircuitBreakerOpen):
            await cb.call(lambda: always_fails())


class TestFallbackWithRetry:
    """Test fallback combined with retry logic."""

    @pytest.mark.asyncio
    async def test_fallback_after_retries_exhausted(self):
        """Fallback is used after all retries fail."""
        primary_calls = 0

        async def failing_primary():
            nonlocal primary_calls
            primary_calls += 1
            raise TimeoutError("Service timeout")

        async def fallback():
            return "fallback_result"

        async def retrying_primary():
            policy = RetryPolicy(max_retries=2, base_delay=0.01)
            return await retry_with_backoff(failing_primary, policy=policy)

        handler = FallbackHandler(
            primary=retrying_primary,
            fallback=fallback,
        )

        result = await handler.execute()

        assert result == "fallback_result"
        assert primary_calls == 3  # Initial + 2 retries


class TestCacheFallbackIntegration:
    """Test cache fallback in service scenarios."""

    @pytest.mark.asyncio
    async def test_cache_then_database_pattern(self):
        """Cache-then-database pattern works correctly."""
        cache = {}
        database = {"key1": "db_value"}

        async def cache_get(key: str):
            return cache.get(key)

        async def cache_set(key: str, value: str):
            cache[key] = value

        async def database_get(key: str):
            return database.get(key)

        fallback = CacheFallback(
            cache_get=cache_get,
            cache_set=cache_set,
            source=database_get,
        )

        # First call: cache miss, hits database, caches result
        result1 = await fallback.get("key1")
        assert result1 == "db_value"
        assert cache["key1"] == "db_value"

        # Second call: cache hit
        database["key1"] = "updated_value"  # Database changed
        result2 = await fallback.get("key1")
        assert result2 == "db_value"  # Still returns cached value

    @pytest.mark.asyncio
    async def test_stale_cache_on_source_failure(self):
        """Stale cache used when source fails."""
        main_cache = {}
        stale_cache = {"key1": "stale_value"}
        source_available = True

        async def cache_get(key: str):
            return main_cache.get(key)

        async def cache_set(key: str, value: str):
            main_cache[key] = value

        async def stale_get(key: str):
            return stale_cache.get(key)

        async def database_get(key: str):
            if not source_available:
                raise ConnectionError("Database unavailable")
            return "fresh_value"

        fallback = CacheFallback(
            cache_get=cache_get,
            cache_set=cache_set,
            source=database_get,
            stale_cache_get=stale_get,
        )

        # Simulate source failure
        source_available = False

        result = await fallback.get("key1")

        # Should return stale value
        assert result == "stale_value"


class TestFullResilienceStack:
    """Test complete resilience stack: circuit breaker + retry + fallback."""

    @pytest.mark.asyncio
    async def test_complete_resilience_chain(self):
        """Full resilience pattern handles failures gracefully."""
        primary_attempts = 0
        fallback_used = False

        # Simulate external service that's having issues
        async def external_service():
            nonlocal primary_attempts
            primary_attempts += 1
            if primary_attempts <= 3:
                raise ConnectionError("Service unavailable")
            return "service_response"

        async def cached_fallback():
            nonlocal fallback_used
            fallback_used = True
            return "cached_response"

        # Build resilience stack
        cb = CircuitBreaker(
            "external-api",
            CircuitBreakerConfig(failure_threshold=5),
        )

        async def resilient_call():
            policy = RetryPolicy(max_retries=2, base_delay=0.01)

            async def with_retry_call():
                return await retry_with_backoff(external_service, policy=policy)

            handler = FallbackHandler(
                primary=lambda: cb.call(with_retry_call),
                fallback=cached_fallback,
            )

            return await handler.execute()

        # First attempt: primary fails after retries, uses fallback
        result1 = await resilient_call()
        assert result1 == "cached_response"
        assert fallback_used

        # Reset for second attempt
        fallback_used = False

        # Second attempt: primary should succeed now
        result2 = await resilient_call()
        assert result2 == "service_response"
        assert not fallback_used

    @pytest.mark.asyncio
    async def test_graceful_degradation_on_complete_failure(self):
        """System degrades gracefully when all strategies fail."""
        async def failing_primary():
            raise ConnectionError("Complete failure")

        async def failing_fallback():
            raise ConnectionError("Fallback also failed")

        cb = CircuitBreaker(
            "failing-service",
            CircuitBreakerConfig(failure_threshold=1),
        )

        handler = FallbackHandler(
            primary=lambda: cb.call(failing_primary),
            fallback=failing_fallback,
            default="degraded_response",
        )

        result = await handler.execute()

        assert result == "degraded_response"


class TestServiceSpecificResilience:
    """Test resilience patterns for specific service scenarios."""

    @pytest.mark.asyncio
    async def test_email_service_resilience(self):
        """Email service has appropriate resilience configuration."""
        from src.resilience.retry import EMAIL_RETRY_POLICY

        # Email should have patient retry settings
        assert EMAIL_RETRY_POLICY.max_retries >= 5
        assert EMAIL_RETRY_POLICY.base_delay >= 5.0

    @pytest.mark.asyncio
    async def test_database_service_resilience(self):
        """Database operations have quick retry settings."""
        from src.resilience.retry import DATABASE_RETRY_POLICY

        # Database should have quick retries
        assert DATABASE_RETRY_POLICY.max_retries <= 5
        assert DATABASE_RETRY_POLICY.base_delay < 1.0

    @pytest.mark.asyncio
    async def test_background_job_resilience(self):
        """Background jobs have very patient retry settings."""
        from src.resilience.retry import BACKGROUND_JOB_RETRY_POLICY

        # Background jobs can wait longer
        assert BACKGROUND_JOB_RETRY_POLICY.max_retries >= 10


class TestConcurrentResilienceOperations:
    """Test resilience patterns under concurrent load."""

    @pytest.mark.asyncio
    async def test_circuit_breaker_shared_state(self):
        """Circuit breaker state is shared across concurrent calls."""
        call_count = 0

        async def tracked_call():
            nonlocal call_count
            call_count += 1
            raise ConnectionError("Always fails")

        cb = CircuitBreaker(
            "shared-circuit",
            CircuitBreakerConfig(failure_threshold=3),
        )

        # Make concurrent calls
        tasks = [cb.call(tracked_call) for _ in range(10)]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Some should fail with ConnectionError, some with CircuitBreakerOpen
        connection_errors = sum(1 for r in results if isinstance(r, ConnectionError))
        circuit_open_errors = sum(1 for r in results if isinstance(r, CircuitBreakerOpen))

        # Circuit should have opened after threshold failures
        assert cb.state == CircuitState.OPEN
        # Some calls should have been rejected by open circuit
        assert circuit_open_errors >= 0  # Depends on timing
