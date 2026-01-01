"""
Unit Tests for Circuit Breaker Pattern.

Tests the circuit breaker implementation for fault tolerance.
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from src.resilience.circuit_breaker import (
    CircuitBreaker,
    CircuitBreakerConfig,
    CircuitBreakerOpen,
    CircuitState,
    get_circuit_breaker,
)


class TestCircuitBreakerStates:
    """Test circuit breaker state transitions."""

    @pytest.fixture
    def breaker(self):
        """Create a circuit breaker with low thresholds for testing."""
        config = CircuitBreakerConfig(
            failure_threshold=3,
            recovery_timeout=0.1,  # 100ms for fast tests
            success_threshold=2,
        )
        return CircuitBreaker("test", config)

    @pytest.mark.asyncio
    async def test_starts_closed(self, breaker):
        """Circuit breaker starts in closed state."""
        assert breaker.state == CircuitState.CLOSED
        assert breaker.is_closed

    @pytest.mark.asyncio
    async def test_stays_closed_on_success(self, breaker):
        """Successful calls keep circuit closed."""
        async def success():
            return "ok"

        for _ in range(10):
            await breaker.call(success)

        assert breaker.is_closed

    @pytest.mark.asyncio
    async def test_opens_after_threshold_failures(self, breaker):
        """Circuit opens after failure threshold is reached."""
        async def failing():
            raise RuntimeError("Service unavailable")

        for _ in range(3):
            with pytest.raises(RuntimeError):
                await breaker.call(failing)

        assert breaker.is_open

    @pytest.mark.asyncio
    async def test_rejects_calls_when_open(self, breaker):
        """Open circuit rejects calls immediately."""
        async def failing():
            raise RuntimeError("Service unavailable")

        # Open the circuit
        for _ in range(3):
            with pytest.raises(RuntimeError):
                await breaker.call(failing)

        # Next call should be rejected
        with pytest.raises(CircuitBreakerOpen) as exc_info:
            await breaker.call(failing)

        assert "test" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_transitions_to_half_open_after_timeout(self, breaker):
        """Circuit transitions to half-open after recovery timeout."""
        async def failing():
            raise RuntimeError("Service unavailable")

        # Open the circuit
        for _ in range(3):
            with pytest.raises(RuntimeError):
                await breaker.call(failing)

        assert breaker.is_open

        # Wait for recovery timeout
        await asyncio.sleep(0.15)

        # Circuit should allow test call
        async def success():
            return "ok"

        result = await breaker.call(success)
        assert result == "ok"
        assert breaker.is_half_open or breaker.is_closed

    @pytest.mark.asyncio
    async def test_closes_after_success_threshold_in_half_open(self, breaker):
        """Circuit closes after success threshold in half-open state."""
        async def failing():
            raise RuntimeError("Service unavailable")

        async def success():
            return "ok"

        # Open the circuit
        for _ in range(3):
            with pytest.raises(RuntimeError):
                await breaker.call(failing)

        # Wait for recovery
        await asyncio.sleep(0.15)

        # Successful calls should close circuit
        await breaker.call(success)
        await breaker.call(success)

        assert breaker.is_closed

    @pytest.mark.asyncio
    async def test_reopens_on_failure_in_half_open(self, breaker):
        """Circuit reopens on failure in half-open state."""
        async def failing():
            raise RuntimeError("Service unavailable")

        async def success():
            return "ok"

        # Open the circuit
        for _ in range(3):
            with pytest.raises(RuntimeError):
                await breaker.call(failing)

        # Wait for recovery
        await asyncio.sleep(0.15)

        # First call triggers half-open, then fails
        with pytest.raises(RuntimeError):
            await breaker.call(failing)

        # Should be open again
        assert breaker.is_open


class TestCircuitBreakerConfig:
    """Test circuit breaker configuration."""

    @pytest.mark.asyncio
    async def test_custom_failure_threshold(self):
        """Custom failure threshold is respected."""
        config = CircuitBreakerConfig(failure_threshold=5)
        breaker = CircuitBreaker("test", config)

        async def failing():
            raise RuntimeError("Error")

        # 4 failures should not open circuit
        for _ in range(4):
            with pytest.raises(RuntimeError):
                await breaker.call(failing)

        assert breaker.is_closed

        # 5th failure should open circuit
        with pytest.raises(RuntimeError):
            await breaker.call(failing)

        assert breaker.is_open

    @pytest.mark.asyncio
    async def test_excluded_exceptions_not_counted(self):
        """Excluded exceptions don't count toward threshold."""
        config = CircuitBreakerConfig(
            failure_threshold=2,
            excluded_exceptions=(ValueError,),
        )
        breaker = CircuitBreaker("test", config)

        async def validation_error():
            raise ValueError("Invalid input")

        # ValueError should not count
        for _ in range(5):
            with pytest.raises(ValueError):
                await breaker.call(validation_error)

        assert breaker.is_closed


class TestCircuitBreakerDecorator:
    """Test circuit breaker as decorator."""

    @pytest.mark.asyncio
    async def test_protect_decorator(self):
        """protect decorator wraps function correctly."""
        breaker = CircuitBreaker(
            "test",
            CircuitBreakerConfig(failure_threshold=2),
        )

        call_count = 0

        @breaker.protect
        async def protected_function():
            nonlocal call_count
            call_count += 1
            return "success"

        result = await protected_function()

        assert result == "success"
        assert call_count == 1

    @pytest.mark.asyncio
    async def test_protect_decorator_with_failures(self):
        """protect decorator opens circuit on failures."""
        breaker = CircuitBreaker(
            "test",
            CircuitBreakerConfig(failure_threshold=2, recovery_timeout=0.1),
        )

        @breaker.protect
        async def failing_function():
            raise RuntimeError("Error")

        for _ in range(2):
            with pytest.raises(RuntimeError):
                await failing_function()

        # Circuit should be open
        with pytest.raises(CircuitBreakerOpen):
            await failing_function()


class TestCircuitBreakerStats:
    """Test circuit breaker statistics."""

    @pytest.mark.asyncio
    async def test_get_stats(self):
        """get_stats returns correct information."""
        breaker = CircuitBreaker(
            "test-service",
            CircuitBreakerConfig(failure_threshold=5),
        )

        stats = breaker.get_stats()

        assert stats["name"] == "test-service"
        assert stats["state"] == "closed"
        assert stats["failures"] == 0
        assert stats["failure_threshold"] == 5

    @pytest.mark.asyncio
    async def test_manual_reset(self):
        """reset() manually closes circuit."""
        config = CircuitBreakerConfig(failure_threshold=2)
        breaker = CircuitBreaker("test", config)

        async def failing():
            raise RuntimeError("Error")

        # Open circuit
        for _ in range(2):
            with pytest.raises(RuntimeError):
                await breaker.call(failing)

        assert breaker.is_open

        # Manual reset
        await breaker.reset()

        assert breaker.is_closed


class TestGetCircuitBreaker:
    """Test global circuit breaker registry."""

    def test_returns_same_instance(self):
        """get_circuit_breaker returns same instance for same name."""
        breaker1 = get_circuit_breaker("test-singleton")
        breaker2 = get_circuit_breaker("test-singleton")

        assert breaker1 is breaker2

    def test_different_names_different_instances(self):
        """Different names create different instances."""
        breaker1 = get_circuit_breaker("service-a")
        breaker2 = get_circuit_breaker("service-b")

        assert breaker1 is not breaker2
