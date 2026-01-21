"""Tests for request timeout middleware.

Tests verify that request timeouts are enforced to prevent
resource exhaustion attacks.
"""

import asyncio
import pytest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from starlette.requests import Request
from starlette.responses import JSONResponse

from src.middleware.timeout import TimeoutMiddleware, TimeoutConfig


class TestTimeoutEnforcement:
    """Test that request timeouts are properly enforced."""

    @pytest.fixture
    def mock_request_factory(self):
        """Factory for creating mock requests."""
        def _create_request(
            method: str = "GET",
            path: str = "/api/v1/test/clients",  # Path that won't match route overrides
        ) -> MagicMock:
            mock = MagicMock(spec=Request)
            mock.method = method
            mock.url.path = path
            # Use SimpleNamespace instead of MagicMock for state
            # MagicMock returns True for hasattr() on any attribute,
            # which breaks _get_timeout() priority check
            mock.state = SimpleNamespace()
            mock.headers = {}
            return mock
        return _create_request

    @pytest.mark.asyncio
    async def test_get_request_exceeding_30s_returns_504(self, mock_request_factory):
        """T027: GET request exceeding 30s returns 504.

        Read operations should be terminated after 30 seconds
        to prevent slow requests from consuming resources.
        """
        # Empty route_overrides to test default read_timeout behavior
        config = TimeoutConfig(read_timeout=0.1, route_overrides={})  # 100ms for testing
        middleware = TimeoutMiddleware(app=AsyncMock(), config=config)

        request = mock_request_factory(method="GET")

        # Slow handler that exceeds timeout
        async def slow_handler(req):
            await asyncio.sleep(1)  # 1 second - exceeds 100ms timeout
            return JSONResponse({})

        response = await middleware.dispatch(request, slow_handler)

        assert response.status_code == 504, \
            "GET request exceeding timeout should return 504"

        body = response.body.decode()
        assert "REQUEST_TIMEOUT" in body, \
            "Response should contain REQUEST_TIMEOUT error code"

    @pytest.mark.asyncio
    async def test_post_request_exceeding_60s_returns_504(self, mock_request_factory):
        """T028: POST request exceeding 60s returns 504.

        Write operations should be terminated after 60 seconds.
        """
        # Empty route_overrides to test default write_timeout behavior
        config = TimeoutConfig(write_timeout=0.1, route_overrides={})  # 100ms for testing
        middleware = TimeoutMiddleware(app=AsyncMock(), config=config)

        request = mock_request_factory(method="POST")

        # Slow handler that exceeds timeout
        async def slow_handler(req):
            await asyncio.sleep(1)
            return JSONResponse({})

        response = await middleware.dispatch(request, slow_handler)

        assert response.status_code == 504, \
            "POST request exceeding timeout should return 504"

    @pytest.mark.asyncio
    async def test_request_within_limits_succeeds(self, mock_request_factory):
        """T029: Request completing within limits succeeds.

        Normal requests should complete successfully without
        interference from timeout monitoring.
        """
        config = TimeoutConfig(read_timeout=10.0)
        middleware = TimeoutMiddleware(app=AsyncMock(), config=config)

        request = mock_request_factory(method="GET")

        # Fast handler that completes within timeout
        async def fast_handler(req):
            await asyncio.sleep(0.01)  # 10ms
            return JSONResponse({"status": "ok"})

        response = await middleware.dispatch(request, fast_handler)

        assert response.status_code == 200, \
            "Request within timeout should succeed"

    @pytest.mark.asyncio
    async def test_timeout_headers_present_in_response(self, mock_request_factory):
        """T030: X-Timeout-Limit and X-Timeout-Remaining headers present.

        Responses should include timeout headers for observability.
        """
        config = TimeoutConfig(read_timeout=30.0)
        middleware = TimeoutMiddleware(app=AsyncMock(), config=config)

        request = mock_request_factory(method="GET")

        async def fast_handler(req):
            return JSONResponse({"status": "ok"})

        response = await middleware.dispatch(request, fast_handler)

        assert "X-Timeout-Limit" in response.headers, \
            "Response should include X-Timeout-Limit header"
        assert "X-Timeout-Remaining" in response.headers, \
            "Response should include X-Timeout-Remaining header"


class TestTimeoutRouteOverrides:
    """Test that route-specific timeout overrides work correctly."""

    @pytest.fixture
    def mock_request_factory(self):
        """Factory for creating mock requests."""
        def _create_request(
            method: str = "POST",
            path: str = "/api/v1/workspaces/test/clients",
        ) -> MagicMock:
            mock = MagicMock(spec=Request)
            mock.method = method
            mock.url.path = path
            # Use SimpleNamespace instead of MagicMock for state
            # MagicMock returns True for hasattr() on any attribute,
            # which breaks _get_timeout() priority check
            mock.state = SimpleNamespace()
            mock.headers = {}
            return mock
        return _create_request

    @pytest.mark.asyncio
    async def test_import_route_has_extended_timeout(self, mock_request_factory):
        """T035: Import route has extended 120s timeout."""
        config = TimeoutConfig(
            write_timeout=60.0,
            route_overrides={
                "/api/v1/workspaces/": 120.0,  # Extended timeout for import
            },
        )
        middleware = TimeoutMiddleware(app=AsyncMock(), config=config)

        request = mock_request_factory(
            method="POST",
            path="/api/v1/workspaces/test/clients/import",
        )

        # Verify the timeout is extended
        timeout = middleware._get_timeout(
            request.method,
            request.url.path,
            request,
        )

        assert timeout == 120.0, \
            "Import route should have 120s timeout"


class TestTimeoutSkipPaths:
    """Test that health check paths skip timeout enforcement."""

    @pytest.mark.asyncio
    async def test_health_check_skips_timeout(self):
        """Health check endpoints should skip timeout enforcement."""
        config = TimeoutConfig(read_timeout=0.001)  # Very short timeout
        middleware = TimeoutMiddleware(app=AsyncMock(), config=config)

        mock_request = MagicMock(spec=Request)
        mock_request.method = "GET"
        mock_request.url.path = "/health"
        mock_request.state = MagicMock()

        # Slow handler
        async def slow_handler(req):
            await asyncio.sleep(0.1)
            return JSONResponse({"status": "ok"})

        response = await middleware.dispatch(mock_request, slow_handler)

        # Should NOT timeout for health check
        assert response.status_code == 200, \
            "Health check should skip timeout enforcement"
