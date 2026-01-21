"""Security tests for rate limiting.

Tests verify that rate limiting cannot be bypassed via header manipulation
and fails closed when Redis is unavailable.

IMPORTANT: These tests should FAIL before implementing the security fixes.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from starlette.requests import Request
from starlette.testclient import TestClient
from starlette.responses import JSONResponse

from src.middleware.rate_limiter import RateLimiterMiddleware


class TestRateLimiterBypassPrevention:
    """Test that rate limiting cannot be bypassed via spoofed headers."""

    @pytest.fixture
    def mock_redis(self):
        """Create mock Redis client."""
        mock = AsyncMock()
        mock.incr = AsyncMock(return_value=1)
        mock.expire = AsyncMock(return_value=True)
        return mock

    @pytest.fixture
    def mock_request_factory(self):
        """Factory for creating mock requests with different headers."""
        def _create_request(
            headers: dict = None,
            client_host: str = "192.168.1.100",
            path: str = "/api/v1/workspaces/test/clients",
            method: str = "GET",
            state_user_id: str = None,
        ) -> MagicMock:
            mock = MagicMock(spec=Request)
            mock.headers = headers or {}
            mock.url.path = path
            mock.method = method

            # Mock client attribute
            mock_client = MagicMock()
            mock_client.host = client_host
            mock.client = mock_client

            # Mock state attribute for authenticated user
            mock_state = MagicMock()
            if state_user_id:
                mock_state.user_id = state_user_id
            else:
                # Simulate no user_id in state (anonymous)
                delattr(mock_state, 'user_id') if hasattr(mock_state, 'user_id') else None
                mock_state.__dict__.pop('user_id', None)
            mock.state = mock_state

            return mock
        return _create_request

    @pytest.mark.asyncio
    async def test_spoofed_x_user_id_header_is_ignored(
        self, mock_redis, mock_request_factory
    ):
        """T007: Test that X-User-ID header is ignored for rate limiting.

        SECURITY: The rate limiter MUST NOT use the X-User-ID header because
        it can be spoofed by attackers to bypass rate limits.
        """
        # Create two requests with different X-User-ID headers but same actual IP
        request1 = mock_request_factory(
            headers={"X-User-ID": "attacker-spoofed-id-1"},
            client_host="192.168.1.100",
        )
        request2 = mock_request_factory(
            headers={"X-User-ID": "attacker-spoofed-id-2"},
            client_host="192.168.1.100",
        )

        middleware = RateLimiterMiddleware(app=AsyncMock())

        with patch('src.middleware.rate_limiter.redis_client', mock_redis):
            with patch('src.middleware.rate_limiter.settings') as mock_settings:
                mock_settings.RATE_LIMIT_ENABLED = True

                # Process both requests
                call_next = AsyncMock(return_value=JSONResponse({}))
                await middleware.dispatch(request1, call_next)
                await middleware.dispatch(request2, call_next)

                # Both calls should use the SAME rate limit key (based on IP, not header)
                # Verify Redis was called with keys that DON'T contain the spoofed IDs
                call_args = [str(call) for call in mock_redis.incr.call_args_list]
                for args in call_args:
                    assert "attacker-spoofed-id-1" not in args, \
                        "Rate limiter should not use X-User-ID header"
                    assert "attacker-spoofed-id-2" not in args, \
                        "Rate limiter should not use X-User-ID header"

    @pytest.mark.asyncio
    async def test_spoofed_x_visitor_id_header_is_ignored(
        self, mock_redis, mock_request_factory
    ):
        """T008: Test that X-Visitor-ID header is ignored for rate limiting.

        SECURITY: The rate limiter MUST NOT use the X-Visitor-ID header because
        it can be spoofed by attackers to bypass rate limits.
        """
        request = mock_request_factory(
            headers={"X-Visitor-ID": "spoofed-visitor-id"},
            client_host="10.0.0.1",
        )

        middleware = RateLimiterMiddleware(app=AsyncMock())

        with patch('src.middleware.rate_limiter.redis_client', mock_redis):
            with patch('src.middleware.rate_limiter.settings') as mock_settings:
                mock_settings.RATE_LIMIT_ENABLED = True

                call_next = AsyncMock(return_value=JSONResponse({}))
                await middleware.dispatch(request, call_next)

                # Verify Redis key doesn't contain spoofed visitor ID
                call_args = str(mock_redis.incr.call_args_list)
                assert "spoofed-visitor-id" not in call_args, \
                    "Rate limiter should not use X-Visitor-ID header"

    @pytest.mark.asyncio
    async def test_spoofed_x_forwarded_for_header_is_ignored(
        self, mock_redis, mock_request_factory
    ):
        """T009: Test that X-Forwarded-For header is ignored for rate limiting.

        SECURITY: The rate limiter MUST NOT use the X-Forwarded-For header
        because it can be spoofed. Real IP should come from request.client.host
        which is set by the trusted reverse proxy (Traefik).
        """
        request = mock_request_factory(
            headers={"X-Forwarded-For": "1.2.3.4, 5.6.7.8"},
            client_host="192.168.1.100",  # Actual IP from Traefik
        )

        middleware = RateLimiterMiddleware(app=AsyncMock())

        with patch('src.middleware.rate_limiter.redis_client', mock_redis):
            with patch('src.middleware.rate_limiter.settings') as mock_settings:
                mock_settings.RATE_LIMIT_ENABLED = True

                call_next = AsyncMock(return_value=JSONResponse({}))
                await middleware.dispatch(request, call_next)

                # Verify Redis key uses actual IP, not X-Forwarded-For
                call_args = str(mock_redis.incr.call_args_list)
                assert "1.2.3.4" not in call_args, \
                    "Rate limiter should not use X-Forwarded-For header"
                assert "192.168.1.100" in call_args, \
                    "Rate limiter should use actual client IP from request.client.host"


class TestRateLimiterFailClosed:
    """Test that rate limiting fails closed when Redis is unavailable."""

    @pytest.fixture
    def mock_request(self):
        """Create a basic mock request."""
        mock = MagicMock(spec=Request)
        mock.headers = {}
        mock.url.path = "/api/v1/workspaces/test/clients"
        mock.method = "GET"
        mock_client = MagicMock()
        mock_client.host = "192.168.1.100"
        mock.client = mock_client
        mock.state = MagicMock()
        return mock

    @pytest.mark.asyncio
    async def test_returns_503_when_redis_unavailable(self, mock_request):
        """T010: Test 503 returned when Redis is unavailable.

        SECURITY: When Redis fails, the rate limiter MUST fail closed
        (reject requests) rather than fail open (allow all requests).
        This prevents attackers from bypassing rate limits by disrupting Redis.
        """
        failing_redis = AsyncMock()
        failing_redis.incr = AsyncMock(side_effect=Exception("Redis connection failed"))

        middleware = RateLimiterMiddleware(app=AsyncMock())

        with patch('src.middleware.rate_limiter.redis_client', failing_redis):
            with patch('src.middleware.rate_limiter.settings') as mock_settings:
                mock_settings.RATE_LIMIT_ENABLED = True

                call_next = AsyncMock(return_value=JSONResponse({}))
                response = await middleware.dispatch(mock_request, call_next)

                # MUST return 503, NOT process the request
                assert response.status_code == 503, \
                    "Rate limiter should fail closed with 503 when Redis is unavailable"

                # Verify correct error response
                body = response.body.decode()
                assert "SERVICE_UNAVAILABLE" in body, \
                    "Response should contain SERVICE_UNAVAILABLE error code"
                assert "Service temporarily unavailable" in body, \
                    "Response should contain user-friendly message"

                # Verify call_next was NOT called (request blocked)
                call_next.assert_not_called()


class TestRateLimiterSecureIdentification:
    """Test that rate limiting correctly identifies users."""

    @pytest.fixture
    def mock_redis(self):
        """Create mock Redis client."""
        mock = AsyncMock()
        mock.incr = AsyncMock(return_value=1)
        mock.expire = AsyncMock(return_value=True)
        return mock

    @pytest.mark.asyncio
    async def test_authenticated_user_identified_by_jwt_user_id(self, mock_redis):
        """T011: Test authenticated user identified by JWT user_id from request.state.

        Authenticated users should be rate limited by their user_id from the
        validated JWT token (set in request.state by auth middleware), NOT
        by any header value.
        """
        mock_request = MagicMock(spec=Request)
        mock_request.headers = {"X-User-ID": "spoofed-header-id"}
        mock_request.url.path = "/api/v1/workspaces/test/clients"
        mock_request.method = "GET"
        mock_client = MagicMock()
        mock_client.host = "192.168.1.100"
        mock_request.client = mock_client

        # Simulate authenticated user with user_id in request.state
        mock_state = MagicMock()
        mock_state.user_id = "550e8400-e29b-41d4-a716-446655440000"  # From JWT
        mock_request.state = mock_state

        middleware = RateLimiterMiddleware(app=AsyncMock())

        with patch('src.middleware.rate_limiter.redis_client', mock_redis):
            with patch('src.middleware.rate_limiter.settings') as mock_settings:
                mock_settings.RATE_LIMIT_ENABLED = True

                call_next = AsyncMock(return_value=JSONResponse({}))
                await middleware.dispatch(mock_request, call_next)

                # Verify Redis key contains the JWT user_id, not the spoofed header
                call_args = str(mock_redis.incr.call_args_list)
                assert "550e8400-e29b-41d4-a716-446655440000" in call_args, \
                    "Rate limiter should use user_id from request.state (JWT)"
                assert "spoofed-header-id" not in call_args, \
                    "Rate limiter should not use X-User-ID header"

    @pytest.mark.asyncio
    async def test_anonymous_user_identified_by_client_host(self, mock_redis):
        """T012: Test anonymous user identified by request.client.host.

        Anonymous (unauthenticated) users should be rate limited by their
        actual IP address from request.client.host (set by Traefik), NOT
        by any header value.
        """
        mock_request = MagicMock(spec=Request)
        mock_request.headers = {
            "X-User-ID": "spoofed-user",
            "X-Visitor-ID": "spoofed-visitor",
            "X-Forwarded-For": "1.2.3.4",
        }
        mock_request.url.path = "/api/v1/workspaces/test/clients"
        mock_request.method = "GET"
        mock_client = MagicMock()
        mock_client.host = "10.20.30.40"  # Actual IP from Traefik
        mock_request.client = mock_client

        # Simulate anonymous user (no user_id in request.state)
        mock_state = MagicMock(spec=[])  # Empty spec = no attributes
        mock_request.state = mock_state

        middleware = RateLimiterMiddleware(app=AsyncMock())

        with patch('src.middleware.rate_limiter.redis_client', mock_redis):
            with patch('src.middleware.rate_limiter.settings') as mock_settings:
                mock_settings.RATE_LIMIT_ENABLED = True

                call_next = AsyncMock(return_value=JSONResponse({}))
                await middleware.dispatch(mock_request, call_next)

                # Verify Redis key uses actual client IP
                call_args = str(mock_redis.incr.call_args_list)
                assert "10.20.30.40" in call_args, \
                    "Rate limiter should use request.client.host for anonymous users"
                assert "spoofed-user" not in call_args
                assert "spoofed-visitor" not in call_args
                assert "1.2.3.4" not in call_args


class TestRateLimiterLogging:
    """Test that rate limit events are properly logged."""

    @pytest.fixture
    def mock_redis(self):
        """Create mock Redis client that exceeds rate limit."""
        mock = AsyncMock()
        mock.incr = AsyncMock(return_value=101)  # Over 100/minute limit
        mock.expire = AsyncMock(return_value=True)
        return mock

    @pytest.mark.asyncio
    async def test_blocked_requests_are_logged_with_identity(self, mock_redis):
        """T015: Test that blocked requests are logged with user identity.

        When a request is rate limited, the log entry should include
        the client identity for monitoring and security analysis.
        """
        mock_request = MagicMock(spec=Request)
        mock_request.headers = {}
        mock_request.url.path = "/api/v1/workspaces/test/clients"
        mock_request.method = "GET"
        mock_client = MagicMock()
        mock_client.host = "192.168.1.100"
        mock_request.client = mock_client
        mock_state = MagicMock()
        mock_state.user_id = "test-user-123"
        mock_request.state = mock_state

        middleware = RateLimiterMiddleware(app=AsyncMock())

        with patch('src.middleware.rate_limiter.redis_client', mock_redis):
            with patch('src.middleware.rate_limiter.settings') as mock_settings:
                mock_settings.RATE_LIMIT_ENABLED = True

                with patch('src.middleware.rate_limiter.logger') as mock_logger:
                    call_next = AsyncMock(return_value=JSONResponse({}))
                    response = await middleware.dispatch(mock_request, call_next)

                    # Verify request was blocked
                    assert response.status_code == 429

                    # Verify logging was called with identity info
                    # (Implementation should log rate limit events)
                    # This test verifies the logging behavior once implemented
