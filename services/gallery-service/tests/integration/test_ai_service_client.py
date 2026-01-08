"""Integration tests for AIServiceClient.

Tests integration with ai-service microservice:
- Semantic search
- Emotion detection
- Circuit breaker functionality
- Error handling

Note: These tests require ai-service to be running.
"""

import pytest
from uuid import UUID, uuid4
from unittest.mock import AsyncMock, patch, MagicMock

from src.services.ai_client import AIServiceClient, CircuitBreakerError
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
