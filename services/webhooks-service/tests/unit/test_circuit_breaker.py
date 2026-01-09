"""
Unit tests for the Circuit Breaker Service.
Tests state transitions and failure tracking.
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from src.services.circuit_breaker import CircuitBreakerService, CircuitState


class TestCircuitBreakerService:
    """Test suite for circuit breaker service."""

    @pytest.fixture
    def mock_redis(self):
        """Create mock Redis client."""
        mock = AsyncMock()
        mock.get = AsyncMock(return_value=None)
        mock.set = AsyncMock(return_value=True)
        mock.setex = AsyncMock(return_value=True)
        mock.delete = AsyncMock(return_value=1)
        mock.incr = AsyncMock(return_value=1)
        mock.expire = AsyncMock(return_value=True)
        return mock

    @pytest.fixture
    def service(self, mock_redis):
        """Create circuit breaker service with mocked Redis."""
        with patch('src.services.circuit_breaker.redis_client', mock_redis):
            svc = CircuitBreakerService()
            svc.redis = mock_redis
            return svc

    @pytest.fixture
    def test_endpoint(self):
        """Test endpoint domain."""
        return "webhook.example.com"

    @pytest.mark.asyncio
    async def test_initial_state_is_closed(self, service, test_endpoint, mock_redis):
        """Test that initial circuit state is CLOSED."""
        mock_redis.get.return_value = None

        state = await service.get_state(test_endpoint)

        assert state == CircuitState.CLOSED

    @pytest.mark.asyncio
    async def test_can_execute_when_closed(self, service, test_endpoint, mock_redis):
        """Test requests are allowed when circuit is CLOSED."""
        mock_redis.get.return_value = None

        can_execute = await service.can_execute(test_endpoint)

        assert can_execute is True

    @pytest.mark.asyncio
    async def test_cannot_execute_when_open(self, service, test_endpoint, mock_redis):
        """Test requests are blocked when circuit is OPEN."""
        # Simulate OPEN state
        mock_redis.get.side_effect = [
            CircuitState.OPEN.value.encode(),  # State
            str(int(pytest.importorskip('time').time()) + 60).encode()  # Not expired
        ]

        can_execute = await service.can_execute(test_endpoint)

        assert can_execute is False

    @pytest.mark.asyncio
    async def test_record_success_resets_failures(self, service, test_endpoint, mock_redis):
        """Test recording success resets failure count."""
        await service.record_success(test_endpoint)

        # Should have deleted failure count key
        assert mock_redis.delete.called

    @pytest.mark.asyncio
    async def test_record_failure_increments_count(self, service, test_endpoint, mock_redis):
        """Test recording failure increments failure count."""
        mock_redis.incr.return_value = 1

        await service.record_failure(test_endpoint)

        mock_redis.incr.assert_called()

    @pytest.mark.asyncio
    async def test_circuit_trips_after_threshold(self, service, test_endpoint, mock_redis):
        """Test circuit trips to OPEN after failure threshold."""
        # Simulate reaching threshold
        mock_redis.incr.return_value = service.failure_threshold

        await service.record_failure(test_endpoint)

        # Should have set state to OPEN
        assert mock_redis.setex.called

    @pytest.mark.asyncio
    async def test_half_open_allows_limited_requests(self, service, test_endpoint, mock_redis):
        """Test HALF_OPEN state allows limited test requests."""
        import time
        # Simulate HALF_OPEN state (recovery timeout passed)
        mock_redis.get.side_effect = [
            CircuitState.OPEN.value.encode(),  # State is OPEN
            str(int(time.time()) - 10).encode()  # But recovery timeout passed
        ]

        can_execute = await service.can_execute(test_endpoint)

        # Should transition to HALF_OPEN and allow
        assert can_execute is True

    @pytest.mark.asyncio
    async def test_half_open_closes_on_success(self, service, test_endpoint, mock_redis):
        """Test HALF_OPEN transitions to CLOSED on success."""
        mock_redis.get.return_value = CircuitState.HALF_OPEN.value.encode()
        mock_redis.incr.return_value = service.half_open_successes

        await service.record_success(test_endpoint)

        # Should have set state to CLOSED
        mock_redis.delete.assert_called()

    @pytest.mark.asyncio
    async def test_half_open_opens_on_failure(self, service, test_endpoint, mock_redis):
        """Test HALF_OPEN transitions back to OPEN on failure."""
        mock_redis.get.return_value = CircuitState.HALF_OPEN.value.encode()

        await service.record_failure(test_endpoint)

        # Should have set state to OPEN
        assert mock_redis.setex.called


class TestCircuitState:
    """Test circuit state enum."""

    def test_states_exist(self):
        """Test all expected states exist."""
        assert CircuitState.CLOSED is not None
        assert CircuitState.OPEN is not None
        assert CircuitState.HALF_OPEN is not None

    def test_state_values(self):
        """Test state values are strings."""
        assert CircuitState.CLOSED.value == "closed"
        assert CircuitState.OPEN.value == "open"
        assert CircuitState.HALF_OPEN.value == "half_open"
