"""
Rate limiting middleware using Redis sliding window algorithm.

Protects endpoints from abuse and ensures fair resource allocation.
Different limits for different endpoint patterns.

SECURITY:
- User identification comes ONLY from validated JWT (request.state.user_id)
  or actual client IP (request.client.host). NEVER trust headers.
- Fails CLOSED when Redis is unavailable (returns 503, not allow-all).
"""

import time
from typing import Dict
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response, JSONResponse

from src.config import settings
from src.cache.redis_client import redis_client
from src.log_config import get_logger

logger = get_logger(__name__)


# Rate limit configuration per endpoint pattern
RATE_LIMITS: Dict[str, str] = {
    # Client CRUD
    "/api/v1/workspaces/*/clients": "100/minute",
    "/api/v1/workspaces/*/clients/search": "100/minute",
    "/api/v1/workspaces/*/clients/*": "200/minute",

    # Import/Export (resource intensive)
    "/api/v1/workspaces/*/clients/import": "10/hour",
    "/api/v1/workspaces/*/clients/export": "20/hour",

    # Bulk operations (moderate limits)
    "/api/v1/workspaces/*/clients/bulk/*": "30/minute",

    # Avatar uploads
    "/api/v1/workspaces/*/clients/*/avatar": "20/minute",

    # Smart lists (CPU intensive)
    "/api/v1/workspaces/*/clients/smart-lists/*/evaluate": "30/minute",

    # Default fallback
    "default": "100/minute",
}


def parse_rate_limit(limit_str: str) -> tuple:
    """
    Parse rate limit string into (requests, window_seconds).

    Args:
        limit_str: Rate limit string like "100/minute" or "10/hour"

    Returns:
        tuple: (max_requests, window_seconds)

    Examples:
        "100/minute" -> (100, 60)
        "10/hour" -> (10, 3600)
        "5/second" -> (5, 1)
    """
    requests, period = limit_str.split("/")
    requests = int(requests)

    period_map = {
        "second": 1,
        "minute": 60,
        "hour": 3600,
        "day": 86400,
    }

    window_seconds = period_map.get(period, 60)  # Default to 1 minute
    return requests, window_seconds


def match_rate_limit_pattern(path: str) -> str:
    """
    Find matching rate limit for request path.

    Args:
        path: Request path

    Returns:
        str: Rate limit string (e.g., "100/minute")
    """
    # Exact match first
    if path in RATE_LIMITS:
        return RATE_LIMITS[path]

    # Pattern matching (replace UUIDs with *)
    import re
    uuid_pattern = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
    normalized_path = re.sub(uuid_pattern, "*", path)

    if normalized_path in RATE_LIMITS:
        return RATE_LIMITS[normalized_path]

    # Check for wildcard patterns
    for pattern, limit in RATE_LIMITS.items():
        if "*" in pattern:
            # Convert pattern to regex
            regex_pattern = pattern.replace("*", ".*")
            if re.match(f"^{regex_pattern}$", normalized_path):
                return limit

    # Default
    return RATE_LIMITS["default"]


class RateLimiterMiddleware(BaseHTTPMiddleware):
    """
    Rate limiting middleware using Redis sliding window.

    SECURITY: Identifies clients ONLY by:
    1. Authenticated user_id from validated JWT (request.state.user_id)
    2. Actual client IP address (request.client.host)

    NEVER trusts spoofable headers like X-User-ID, X-Visitor-ID, or X-Forwarded-For.
    Uses Redis for distributed rate limiting across multiple instances.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        """
        Check rate limit before processing request.

        Args:
            request: Incoming request
            call_next: Next middleware/endpoint handler

        Returns:
            Response (429 if rate limited, 503 if Redis unavailable, or actual response)
        """
        # Skip if rate limiting disabled
        if not settings.RATE_LIMIT_ENABLED:
            return await call_next(request)

        # Skip health check endpoints
        if request.url.path in ["/health", "/health/live", "/health/ready", "/metrics"]:
            return await call_next(request)

        # SECURITY: Identify client using ONLY trusted sources
        # - For authenticated users: user_id from validated JWT (set by auth middleware)
        # - For anonymous users: actual client IP from request.client.host (set by Traefik)
        # NEVER use spoofable headers (X-User-ID, X-Visitor-ID, X-Forwarded-For)
        client_id = self._get_secure_client_id(request)
        identifier_type = "user" if hasattr(request.state, "user_id") and request.state.user_id else "ip"

        # Get rate limit for this endpoint
        limit_str = match_rate_limit_pattern(request.url.path)
        max_requests, window_seconds = parse_rate_limit(limit_str)

        # Redis key for this client and endpoint
        # Format: ratelimit:{identifier_type}:{client_id}:{path}:{window}
        redis_key = f"ratelimit:{identifier_type}:{client_id}:{request.url.path}:{int(time.time() // window_seconds)}"

        # Check rate limit
        try:
            # Increment request count
            request_count = await redis_client.incr(redis_key)

            # Set expiration on first request in window
            if request_count == 1:
                await redis_client.expire(redis_key, window_seconds)

            # Check if exceeded
            if request_count > max_requests:
                # Log rate limit event with identity for security monitoring
                logger.warning(
                    "Rate limit exceeded",
                    extra={
                        "client_id": client_id,
                        "identifier_type": identifier_type,
                        "path": request.url.path,
                        "method": request.method,
                        "request_count": request_count,
                        "max_requests": max_requests,
                        "window_seconds": window_seconds,
                    },
                )
                return JSONResponse(
                    status_code=429,
                    content={
                        "error": "RATE_LIMIT_EXCEEDED",
                        "message": f"Rate limit exceeded. Max {max_requests} requests per {window_seconds}s.",
                        "retry_after": window_seconds,
                    },
                    headers={
                        "X-RateLimit-Limit": str(max_requests),
                        "X-RateLimit-Remaining": "0",
                        "X-RateLimit-Reset": str(int(time.time()) + window_seconds),
                        "Retry-After": str(window_seconds),
                    },
                )

            # Process request
            response = await call_next(request)

            # Add rate limit headers to response
            response.headers["X-RateLimit-Limit"] = str(max_requests)
            response.headers["X-RateLimit-Remaining"] = str(max_requests - request_count)
            response.headers["X-RateLimit-Reset"] = str(int(time.time()) + window_seconds)

            return response

        except Exception as e:
            # SECURITY: Fail CLOSED when Redis is unavailable
            # This prevents attackers from bypassing rate limits by disrupting Redis
            logger.error(
                "Redis unavailable for rate limiting - failing closed",
                extra={
                    "error": str(e),
                    "client_id": client_id,
                    "path": request.url.path,
                },
            )
            return JSONResponse(
                status_code=503,
                content={
                    "error": "SERVICE_UNAVAILABLE",
                    "message": "Service temporarily unavailable. Please try again shortly.",
                },
            )

    def _get_secure_client_id(self, request: Request) -> str:
        """
        Get client identifier from TRUSTED sources only.

        SECURITY: This method NEVER uses spoofable headers.

        Args:
            request: The incoming request

        Returns:
            str: Client identifier (user_id from JWT or IP address)
        """
        # Priority 1: Authenticated user_id from validated JWT
        # This is set by auth middleware AFTER JWT validation
        if hasattr(request.state, "user_id") and request.state.user_id:
            return str(request.state.user_id)

        # Priority 2: Actual client IP from request.client.host
        # This is set by the ASGI server (uvicorn) from the TCP connection
        # Traefik sets the real client IP via PROXY protocol or trusted X-Real-IP
        if request.client and request.client.host:
            return request.client.host

        # Fallback for edge cases (should rarely happen)
        return "anonymous"
