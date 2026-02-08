"""Integration tests for AIServiceClient.

Tests integration with ai-service microservice:
- Semantic search
- Emotion detection
- Circuit breaker functionality
- Exponential backoff with retries
- Fallback responses
- Error handling

Note: These tests require ai-service to be running.
"""

import pytest
import asyncio
from uuid import UUID, uuid4
from unittest.mock import AsyncMock, patch, MagicMock
import httpx

from src.services.ai_client import AIServiceClient, CircuitBreakerError, BackoffConfig
from src.services.ai_client.circuit_breaker import CircuitBreaker, CircuitState


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def workspace_id():
    """Test workspace ID."""
    return UUID("12345678-1234-5678-1234-567812345678")


@pytest.fixture
def photo_id():
    """Test photo ID."""
    return UUID("87654321-4321-8765-4321-876543218765")


@pytest.fixture
def auth_context():
    """Test authentication context."""
    return {
        "auth": {
            "user_id": str(uuid4()),
            "workspace_id": "12345678-1234-5678-1234-567812345678",
            "permissions": ["photos:read", "ai:analyze"],
        }
    }


@pytest.fixture
def ai_client():
    """AIServiceClient with disabled circuit breaker for basic tests."""
    return AIServiceClient(
        ai_service_url="http://ai-service:8013",
        enable_circuit_breaker=False,
    )


@pytest.fixture
def ai_client_with_breaker():
    """AIServiceClient with enabled circuit breaker."""
    return AIServiceClient(
        ai_service_url="http://ai-service:8013",
        enable_circuit_breaker=True,
    )


# =============================================================================
# Circuit Breaker Tests
# =============================================================================


class TestCircuitBreaker:
    """Test circuit breaker functionality."""

    @pytest.mark.asyncio
    async def test_circuit_breaker_closed_on_success(self):
        """Circuit breaker stays CLOSED on successful calls."""
        breaker = CircuitBreaker("test-service", failure_threshold=3, timeout=60)

        # Mock successful function
        async def success_func():
            return "success"

        # Execute multiple successful calls
        for _ in range(5):
            result = await breaker.call(success_func)
            assert result == "success"
            assert breaker.state == CircuitState.CLOSED
            assert breaker.failure_count == 0

    @pytest.mark.asyncio
    async def test_circuit_breaker_opens_on_failures(self):
        """Circuit breaker OPENS after threshold failures."""
        breaker = CircuitBreaker("test-service", failure_threshold=3, timeout=60)

        # Mock failing function
        async def failing_func():
            raise Exception("Service unavailable")

        # Execute failures until threshold
        for i in range(3):
            with pytest.raises(Exception):
                await breaker.call(failing_func)

            if i < 2:
                assert breaker.state == CircuitState.CLOSED
            else:
                assert breaker.state == CircuitState.OPEN

        # Circuit is now OPEN, should fail fast
        with pytest.raises(CircuitBreakerError) as exc_info:
            await breaker.call(failing_func)

        assert "Circuit breaker is OPEN" in str(exc_info.value)
        assert exc_info.value.service == "test-service"

    @pytest.mark.asyncio
    async def test_circuit_breaker_half_open_transition(self):
        """Circuit breaker transitions to HALF_OPEN after timeout."""
        breaker = CircuitBreaker("test-service", failure_threshold=2, timeout=0.1)

        # Mock failing function
        async def failing_func():
            raise Exception("Service unavailable")

        # Open circuit
        for _ in range(2):
            with pytest.raises(Exception):
                await breaker.call(failing_func)

        assert breaker.state == CircuitState.OPEN

        # Wait for timeout
        import asyncio
        await asyncio.sleep(0.2)

        # Should attempt HALF_OPEN
        assert breaker._should_attempt_reset()

        # Next call should transition to HALF_OPEN, then fail (back to OPEN)
        with pytest.raises(Exception):
            await breaker.call(failing_func)

        assert breaker.state == CircuitState.OPEN

    @pytest.mark.asyncio
    async def test_circuit_breaker_closes_after_success_threshold(self):
        """Circuit breaker CLOSES after success threshold in HALF_OPEN."""
        breaker = CircuitBreaker(
            "test-service", failure_threshold=2, timeout=0.1, success_threshold=2
        )

        # Mock functions
        async def failing_func():
            raise Exception("Service unavailable")

        async def success_func():
            return "success"

        # Open circuit
        for _ in range(2):
            with pytest.raises(Exception):
                await breaker.call(failing_func)

        assert breaker.state == CircuitState.OPEN

        # Wait for timeout
        import asyncio
        await asyncio.sleep(0.2)

        # Execute successful calls to close circuit
        result1 = await breaker.call(success_func)
        assert result1 == "success"
        assert breaker.state == CircuitState.HALF_OPEN

        result2 = await breaker.call(success_func)
        assert result2 == "success"
        assert breaker.state == CircuitState.CLOSED
        assert breaker.failure_count == 0

    def test_circuit_breaker_get_state(self):
        """Circuit breaker state can be retrieved."""
        breaker = CircuitBreaker("test-service")
        state = breaker.get_state()

        assert state["service_name"] == "test-service"
        assert state["state"] == "closed"
        assert state["failure_count"] == 0
        assert state["failure_threshold"] == 5

    def test_circuit_breaker_manual_reset(self):
        """Circuit breaker can be manually reset."""
        breaker = CircuitBreaker("test-service", failure_threshold=1)

        # Manually open circuit
        breaker.state = CircuitState.OPEN
        breaker.failure_count = 10

        # Reset
        breaker.reset()

        assert breaker.state == CircuitState.CLOSED
        assert breaker.failure_count == 0


# =============================================================================
# AIServiceClient Tests
# =============================================================================


class TestAIServiceClient:
    """Test AIServiceClient integration."""

    @pytest.mark.asyncio
    @patch("httpx.AsyncClient.post")
    async def test_search_photos_semantic_success(
        self, mock_post, ai_client, workspace_id, auth_context
    ):
        """Semantic search returns results successfully."""
        # Mock successful response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "results": [
                {
                    "photo": {
                        "photo_id": "photo_001",
                        "filename": "beach.jpg",
                        "relevance_score": 0.95,
                    }
                }
            ],
            "total": 1,
            "query": "happy family at beach",
        }
        mock_post.return_value = mock_response

        # Execute search
        result = await ai_client.search_photos_semantic(
            workspace_id=workspace_id,
            query="happy family at beach",
            limit=20,
            auth_context=auth_context,
        )

        # Verify
        assert result["total"] == 1
        assert result["query"] == "happy family at beach"
        assert len(result["results"]) == 1

        # Verify MCP call
        mock_post.assert_called_once()
        call_args = mock_post.call_args
        assert "/mcp/tools/search_photos" in call_args[0][0]

    @pytest.mark.asyncio
    @patch("httpx.AsyncClient.post")
    async def test_analyze_photo_emotions_success(
        self, mock_post, ai_client, workspace_id, photo_id, auth_context
    ):
        """Emotion analysis returns results successfully."""
        # Mock successful response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "photo_id": str(photo_id),
            "faces": [{"emotion": "joy", "confidence": 0.95}],
            "photo_level_summary": {"dominant_emotion": "joy"},
        }
        mock_post.return_value = mock_response

        # Execute analysis
        result = await ai_client.analyze_photo_emotions(
            workspace_id=workspace_id,
            photo_id=photo_id,
            provider="cloud_vision",
            auth_context=auth_context,
        )

        # Verify
        assert result["photo_id"] == str(photo_id)
        assert len(result["faces"]) == 1
        assert result["faces"][0]["emotion"] == "joy"

    @pytest.mark.asyncio
    @patch("httpx.AsyncClient.post")
    async def test_circuit_breaker_opens_on_failures(
        self, mock_post, ai_client_with_breaker, workspace_id, auth_context
    ):
        """Circuit breaker opens after threshold failures."""
        # Mock failing response
        mock_post.side_effect = Exception("AI service unavailable")

        # Execute failures until circuit opens
        for i in range(5):
            with pytest.raises(Exception):
                await ai_client_with_breaker.search_photos_semantic(
                    workspace_id=workspace_id,
                    query="test",
                    auth_context=auth_context,
                )

        # Next call should fail with CircuitBreakerError
        with pytest.raises(CircuitBreakerError) as exc_info:
            await ai_client_with_breaker.search_photos_semantic(
                workspace_id=workspace_id,
                query="test",
                auth_context=auth_context,
            )

        assert "Circuit breaker is OPEN" in str(exc_info.value)

    @pytest.mark.asyncio
    @patch("httpx.AsyncClient.get")
    async def test_health_check_success(self, mock_get, ai_client):
        """Health check returns healthy status."""
        # Mock successful health check
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_get.return_value = mock_response

        # Execute health check
        result = await ai_client.health_check()

        # Verify
        assert result["status"] == "healthy"
        assert "circuit_breaker" in result

    @pytest.mark.asyncio
    @patch("httpx.AsyncClient.get")
    async def test_health_check_failure(self, mock_get, ai_client):
        """Health check returns unhealthy status on error."""
        # Mock failing health check
        mock_get.side_effect = Exception("Connection refused")

        # Execute health check
        result = await ai_client.health_check()

        # Verify
        assert result["status"] == "unhealthy"
        assert "error" in result

    def test_get_circuit_breaker_state(self, ai_client_with_breaker):
        """Circuit breaker state can be retrieved."""
        state = ai_client_with_breaker.get_circuit_breaker_state()

        assert state["service_name"] == "ai-service"
        assert state["state"] == "closed"
        assert state["failure_threshold"] == 5

    def test_circuit_breaker_disabled(self, ai_client):
        """Circuit breaker can be disabled."""
        state = ai_client.get_circuit_breaker_state()
        assert state["enabled"] is False

    @pytest.mark.asyncio
    async def test_client_context_manager(self, workspace_id, auth_context):
        """AIServiceClient works as async context manager."""
        async with AIServiceClient(enable_circuit_breaker=False) as client:
            assert client.http_client is not None

        # Client should be closed after context exit
        # (http_client.aclose() was called)


# =============================================================================
# Integration Test Markers
# =============================================================================


@pytest.mark.integration
@pytest.mark.requires_ai_service
class TestAIServiceIntegration:
    """Integration tests that require ai-service to be running.

    Run with: pytest -m integration -m requires_ai_service
    """

    @pytest.mark.asyncio
    async def test_real_semantic_search(self, workspace_id, auth_context):
        """Real semantic search against running ai-service.

        This test requires:
        - ai-service running on port 8013
        - Test data loaded in database
        - Milvus running with embeddings
        """
        pytest.skip("Requires ai-service and test data")

        async with AIServiceClient() as client:
            result = await client.search_photos_semantic(
                workspace_id=workspace_id,
                query="wedding photos",
                limit=10,
                auth_context=auth_context,
            )

            assert "results" in result
            assert "total" in result

    @pytest.mark.asyncio
    async def test_real_emotion_detection(
        self, workspace_id, photo_id, auth_context
    ):
        """Real emotion detection against running ai-service."""
        pytest.skip("Requires ai-service and test photo")

        async with AIServiceClient() as client:
            result = await client.analyze_photo_emotions(
                workspace_id=workspace_id,
                photo_id=photo_id,
                provider="cloud_vision",
                auth_context=auth_context,
            )

            assert "faces" in result
            assert "photo_level_summary" in result


# =============================================================================
# Backoff Configuration Tests
# =============================================================================


class TestBackoffConfig:
    """Test BackoffConfig functionality."""

    def test_backoff_config_defaults(self):
        """BackoffConfig has sensible defaults."""
        config = BackoffConfig()

        assert config.max_retries == 3
        assert config.base_delay == 0.1
        assert config.max_delay == 2.0
        assert config.jitter == 0.1

    def test_backoff_delay_calculation_exponential(self):
        """Delay increases exponentially with attempts."""
        config = BackoffConfig(base_delay=0.1, max_delay=10.0, jitter=0.0)

        delay_0 = config.calculate_delay(0)  # 0.1 * 2^0 = 0.1
        delay_1 = config.calculate_delay(1)  # 0.1 * 2^1 = 0.2
        delay_2 = config.calculate_delay(2)  # 0.1 * 2^2 = 0.4
        delay_3 = config.calculate_delay(3)  # 0.1 * 2^3 = 0.8

        assert delay_0 == pytest.approx(0.1, rel=0.01)
        assert delay_1 == pytest.approx(0.2, rel=0.01)
        assert delay_2 == pytest.approx(0.4, rel=0.01)
        assert delay_3 == pytest.approx(0.8, rel=0.01)

    def test_backoff_delay_respects_max(self):
        """Delay is capped at max_delay."""
        config = BackoffConfig(base_delay=1.0, max_delay=2.0, jitter=0.0)

        delay_5 = config.calculate_delay(5)  # 1.0 * 2^5 = 32, capped at 2.0

        assert delay_5 == pytest.approx(2.0, rel=0.01)

    def test_backoff_delay_includes_jitter(self):
        """Delay includes randomized jitter."""
        config = BackoffConfig(base_delay=1.0, max_delay=10.0, jitter=0.5)

        # With 50% jitter, delay should vary between base and base * 1.5
        delays = [config.calculate_delay(0) for _ in range(100)]

        min_delay = min(delays)
        max_delay = max(delays)

        # Base delay is 1.0, with 50% jitter: 1.0 to 1.5
        assert min_delay >= 1.0
        assert max_delay <= 1.5
        # Should have some variation
        assert max_delay > min_delay


# =============================================================================
# Circuit Breaker with Retry Tests
# =============================================================================


class TestCircuitBreakerWithRetry:
    """Test circuit breaker with exponential backoff retry functionality."""

    @pytest.mark.asyncio
    async def test_call_with_retry_succeeds_on_first_try(self):
        """call_with_retry succeeds immediately without retries."""
        breaker = CircuitBreaker(
            "test-service",
            backoff_config=BackoffConfig(max_retries=3, base_delay=0.01),
        )

        async def success_func():
            return "success"

        result = await breaker.call_with_retry(success_func)

        assert result == "success"
        assert breaker.total_retries == 0

    @pytest.mark.asyncio
    async def test_call_with_retry_retries_on_timeout(self):
        """call_with_retry retries on TimeoutError."""
        breaker = CircuitBreaker(
            "test-service",
            backoff_config=BackoffConfig(max_retries=2, base_delay=0.01),
        )

        call_count = 0

        async def flaky_func():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise asyncio.TimeoutError("Timeout")
            return "success"

        result = await breaker.call_with_retry(flaky_func)

        assert result == "success"
        assert call_count == 3
        assert breaker.total_retries == 2
        assert breaker.successful_retries == 1

    @pytest.mark.asyncio
    async def test_call_with_retry_exhausts_retries(self):
        """call_with_retry raises after exhausting all retries."""
        breaker = CircuitBreaker(
            "test-service",
            backoff_config=BackoffConfig(max_retries=2, base_delay=0.01),
        )

        async def always_fails():
            raise asyncio.TimeoutError("Always timeout")

        with pytest.raises(asyncio.TimeoutError):
            await breaker.call_with_retry(always_fails)

        assert breaker.total_retries == 2

    @pytest.mark.asyncio
    async def test_call_with_retry_no_retry_for_circuit_breaker_error(self):
        """call_with_retry doesn't retry CircuitBreakerError."""
        breaker = CircuitBreaker(
            "test-service",
            failure_threshold=1,
            backoff_config=BackoffConfig(max_retries=3),
        )

        # Open the circuit
        async def failing_func():
            raise Exception("Service down")

        with pytest.raises(Exception):
            await breaker.call(failing_func)

        # Circuit is now open
        assert breaker.state == CircuitState.OPEN

        # Trying to call with retry should fail immediately with CircuitBreakerError
        with pytest.raises(CircuitBreakerError):
            await breaker.call_with_retry(failing_func)

        # No retries should have been attempted
        assert breaker.total_retries == 0

    @pytest.mark.asyncio
    async def test_call_with_retry_custom_retryable_exceptions(self):
        """call_with_retry only retries specified exception types."""
        breaker = CircuitBreaker(
            "test-service",
            backoff_config=BackoffConfig(max_retries=3, base_delay=0.01),
        )

        async def raises_value_error():
            raise ValueError("Not retryable")

        # ValueError is not in default retryable exceptions
        with pytest.raises(ValueError):
            await breaker.call_with_retry(raises_value_error)

        # Should not have retried
        assert breaker.total_retries == 0


# =============================================================================
# Fallback Response Tests
# =============================================================================


class TestFallbackResponses:
    """Test fallback response functionality."""

    @pytest.fixture
    def ai_client_with_fallback(self):
        """AIServiceClient with fallback enabled."""
        return AIServiceClient(
            ai_service_url="http://ai-service:8013",
            timeout=0.1,  # Very short timeout for testing
            enable_circuit_breaker=False,
            enable_fallback=True,
        )

    @pytest.fixture
    def ai_client_without_fallback(self):
        """AIServiceClient with fallback disabled."""
        return AIServiceClient(
            ai_service_url="http://ai-service:8013",
            timeout=0.1,
            enable_circuit_breaker=False,
            enable_fallback=False,
        )

    @pytest.mark.asyncio
    @patch("httpx.AsyncClient.post")
    async def test_search_returns_fallback_on_timeout(
        self, mock_post, ai_client_with_fallback, workspace_id
    ):
        """Semantic search returns fallback on timeout when enabled."""
        mock_post.side_effect = httpx.TimeoutException("Request timeout")

        result = await ai_client_with_fallback.search_photos_semantic(
            workspace_id=workspace_id,
            query="test query",
        )

        assert result["fallback"] is True
        assert result["total"] == 0
        assert result["results"] == []
        assert "AI service unavailable" in result["reason"]

    @pytest.mark.asyncio
    @patch("httpx.AsyncClient.post")
    async def test_search_raises_exception_without_fallback(
        self, mock_post, ai_client_without_fallback, workspace_id
    ):
        """Semantic search raises exception when fallback disabled."""
        mock_post.side_effect = httpx.TimeoutException("Request timeout")

        with pytest.raises(httpx.TimeoutException):
            await ai_client_without_fallback.search_photos_semantic(
                workspace_id=workspace_id,
                query="test query",
            )

    @pytest.mark.asyncio
    @patch("httpx.AsyncClient.post")
    async def test_emotion_analysis_returns_fallback_on_error(
        self, mock_post, ai_client_with_fallback, workspace_id, photo_id
    ):
        """Emotion analysis returns fallback on error when enabled."""
        mock_post.side_effect = Exception("Connection refused")

        result = await ai_client_with_fallback.analyze_photo_emotions(
            workspace_id=workspace_id,
            photo_id=photo_id,
        )

        assert result["fallback"] is True
        assert result["faces"] == []
        assert result["photo_level_summary"] is None

    @pytest.mark.asyncio
    @patch("httpx.AsyncClient.post")
    async def test_per_call_fallback_override(
        self, mock_post, ai_client_without_fallback, workspace_id
    ):
        """use_fallback parameter overrides client setting."""
        mock_post.side_effect = httpx.TimeoutException("Timeout")

        # Client has fallback disabled, but we enable it per-call
        result = await ai_client_without_fallback.search_photos_semantic(
            workspace_id=workspace_id,
            query="test",
            use_fallback=True,  # Override
        )

        assert result["fallback"] is True

    @pytest.mark.asyncio
    @patch("httpx.AsyncClient.post")
    async def test_fallback_on_circuit_breaker_open(
        self, mock_post, workspace_id, auth_context
    ):
        """Fallback is returned when circuit breaker is open."""
        client = AIServiceClient(
            ai_service_url="http://ai-service:8013",
            enable_circuit_breaker=True,
            enable_fallback=True,
        )

        # Configure low failure threshold
        client.circuit_breaker.failure_threshold = 2

        mock_post.side_effect = Exception("Service unavailable")

        # Trigger failures to open circuit
        for _ in range(2):
            result = await client.search_photos_semantic(
                workspace_id=workspace_id,
                query="test",
                use_fallback=True,
            )
            assert result["fallback"] is True

        # Circuit should be open now
        assert client.circuit_breaker.state == CircuitState.OPEN

        # Next call should return fallback immediately
        result = await client.search_photos_semantic(
            workspace_id=workspace_id,
            query="test",
        )

        assert result["fallback"] is True


# =============================================================================
# Timeout Configuration Tests
# =============================================================================


class TestTimeoutConfiguration:
    """Test timeout configuration for AI service calls."""

    def test_default_timeout_is_2_seconds(self):
        """Default timeout is 2 seconds as specified."""
        client = AIServiceClient()

        # Default from settings should be 2.0 seconds
        assert client.timeout == 2.0
        assert client.connect_timeout == 1.0

    def test_custom_timeout_configuration(self):
        """Custom timeout can be configured."""
        client = AIServiceClient(
            timeout=5.0,
            connect_timeout=2.0,
        )

        assert client.timeout == 5.0
        assert client.connect_timeout == 2.0

    def test_circuit_breaker_state_includes_config(self):
        """Circuit breaker state includes configuration details."""
        client = AIServiceClient(
            timeout=2.0,
            connect_timeout=1.0,
            max_retries=3,
        )

        state = client.get_circuit_breaker_state()

        assert "client_config" in state
        assert state["client_config"]["timeout_seconds"] == 2.0
        assert state["client_config"]["connect_timeout_seconds"] == 1.0
        assert state["client_config"]["max_retries"] == 3

    def test_backoff_config_in_state(self):
        """Circuit breaker state includes backoff configuration."""
        client = AIServiceClient()
        state = client.get_circuit_breaker_state()

        assert "backoff_config" in state
        assert "max_retries" in state["backoff_config"]
        assert "base_delay" in state["backoff_config"]
        assert "max_delay" in state["backoff_config"]
