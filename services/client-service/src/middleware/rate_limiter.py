"""
Rate limiting middleware using Redis sliding window algorithm.

Protects endpoints from abuse and ensures fair resource allocation.
Different limits for different endpoint patterns.
"""

import time
from typing import Dict
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response, JSONResponse

from src.config import settings
from src.cache.redis_client import redis_client


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

    Limits requests per client based on:
    1. Authenticated user ID (X-User-ID header)
    2. IP address (X-Forwarded-For or client.host)

    Uses Redis for distributed rate limiting across multiple instances.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        """
        Check rate limit before processing request.

        Args:
            request: Incoming request
            call_next: Next middleware/endpoint handler

        Returns:
            Response (429 if rate limited, or actual response)
        """
        # Skip if rate limiting disabled
        if not settings.RATE_LIMIT_ENABLED:
            return await call_next(request)

        # Skip health check endpoints
        if request.url.path in ["/health", "/health/live", "/health/ready", "/metrics"]:
            return await call_next(request)

        # Identify client (user ID > visitor ID > IP)
        client_id = (
            request.headers.get("X-User-ID")
            or request.headers.get("X-Visitor-ID")
            or request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
            or request.client.host
            if request.client
            else "unknown"
        )

        # Get rate limit for this endpoint
        limit_str = match_rate_limit_pattern(request.url.path)
        max_requests, window_seconds = parse_rate_limit(limit_str)

        # Redis key for this client and endpoint
        redis_key = f"ratelimit:client:{client_id}:{request.url.path}:{int(time.time() // window_seconds)}"

        # Check rate limit
        try:
            # Increment request count
            request_count = await redis_client.incr(redis_key)

            # Set expiration on first request in window
            if request_count == 1:
                await redis_client.expire(redis_key, window_seconds)

            # Check if exceeded
            if request_count > max_requests:
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

        except Exception:
            # If Redis fails, allow request (graceful degradation)
            return await call_next(request)
