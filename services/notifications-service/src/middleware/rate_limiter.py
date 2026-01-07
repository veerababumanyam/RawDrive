"""
Rate limiting middleware using Redis sliding window algorithm.

Protects notification service endpoints from abuse with tiered limits:
- Webhook endpoints: high limits (500/min) for SendGrid callbacks
- Send notification: moderate limits (50/min) to prevent spam
- Template operations: lower limits (30/min) for admin operations
- Preference reads: higher limits (200/min) as read-heavy
- Default: 100/minute

Provides:
- RateLimiterMiddleware: Starlette middleware for global rate limiting
- RateLimitExceeded: HTTP exception for 429 responses
- check_rate_limit: Dependency for per-endpoint rate limiting
- rate_limit: Decorator for function-level rate limiting

Uses Redis sliding window with graceful degradation (allows requests if Redis unavailable).

Feature: Notifications & Communication Microservice
Task: T032 - Create rate limiting middleware
"""

from __future__ import annotations

import logging
import time
from functools import wraps
from typing import Callable, Dict, Optional, Tuple, TypeVar

from fastapi import HTTPException, Request, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response

from src.cache.redis_client import redis_client
from src.config import settings

logger = logging.getLogger(__name__)

T = TypeVar("T")


# =============================================================================
# Rate Limit Configuration
# =============================================================================

# Rate limit configurations per endpoint pattern
# Format: "requests/period" where period is second, minute, hour, day
RATE_LIMITS: Dict[str, str] = {
    # Webhook endpoints - HIGH limits for provider callbacks
    "/api/v1/webhooks/sendgrid": "500/minute",
    "/api/v1/webhooks/sendgrid/*": "500/minute",
    "/api/v1/webhooks/twilio": "500/minute",
    "/api/v1/webhooks/twilio/*": "500/minute",

    # Send notification endpoints - MODERATE limits to prevent spam
    "/api/v1/notifications": "50/minute",
    "/api/v1/notifications/send": "50/minute",
    "/api/v1/notifications/bulk": "10/minute",  # Bulk sends are expensive
    "/api/v1/notifications/broadcast": "5/minute",  # Broadcast to many users

    # Notification management (CRUD)
    "/api/v1/notifications/*": "100/minute",
    "/api/v1/notifications/*/retry": "20/minute",  # Retry is resource intensive
    "/api/v1/notifications/*/cancel": "50/minute",

    # Preference endpoints - HIGH read limits
    "/api/v1/preferences": "200/minute",
    "/api/v1/preferences/*": "200/minute",
    "/api/v1/preferences/*/channels": "100/minute",
    "/api/v1/preferences/*/categories": "100/minute",

    # Template endpoints - LOWER limits for admin operations
    "/api/v1/templates": "100/minute",
    "/api/v1/templates/*": "100/minute",
    "/api/v1/templates/*/render": "30/minute",  # Rendering is CPU intensive
    "/api/v1/templates/*/preview": "50/minute",

    # Queue management endpoints
    "/api/v1/queue/status": "60/minute",
    "/api/v1/queue/stats": "60/minute",
    "/api/v1/queue/dead-letter": "30/minute",
    "/api/v1/queue/dead-letter/retry": "10/minute",

    # Delivery tracking
    "/api/v1/delivery/*": "200/minute",
    "/api/v1/delivery/*/status": "200/minute",

    # Default fallback
    "default": "100/minute",
}


# =============================================================================
# Rate Limit Parsing and Matching
# =============================================================================


def parse_rate_limit(limit_str: str) -> Tuple[int, int]:
    """
    Parse rate limit string like "100/minute" to (count, seconds).

    Args:
        limit_str: Rate limit string (e.g., "100/minute", "10/hour")

    Returns:
        Tuple[int, int]: (max_requests, window_seconds)

    Examples:
        "100/minute" -> (100, 60)
        "10/hour" -> (10, 3600)
        "5/second" -> (5, 1)
    """
    parts = limit_str.split("/")
    if len(parts) != 2:
        return 100, 60  # Default fallback

    try:
        count = int(parts[0])
    except ValueError:
        count = 100

    period = parts[1].lower()
    period_seconds = {
        "second": 1,
        "minute": 60,
        "hour": 3600,
        "day": 86400,
    }

    seconds = period_seconds.get(period, 60)
    return count, seconds


def match_endpoint(path: str) -> str:
    """
    Match a request path to a rate limit pattern.

    Supports simple glob patterns with * for single path segments.
    Returns the rate limit string for the matched pattern.

    Args:
        path: Request URL path (e.g., "/api/v1/notifications/123")

    Returns:
        str: Rate limit string (e.g., "100/minute")
    """
    # Try exact match first
    if path in RATE_LIMITS:
        return RATE_LIMITS[path]

    # Try pattern matching
    for pattern, limit in RATE_LIMITS.items():
        if pattern == "default":
            continue

        # Simple glob matching with * for single segments
        pattern_parts = pattern.split("/")
        path_parts = path.split("/")

        if len(pattern_parts) != len(path_parts):
            continue

        match = True
        for pattern_part, path_part in zip(pattern_parts, path_parts):
            if pattern_part != "*" and pattern_part != path_part:
                match = False
                break

        if match:
            return limit

    # Return default
    return RATE_LIMITS.get("default", settings.RATE_LIMIT_DEFAULT)


def get_client_identifier(request: Request) -> str:
    """
    Get a unique identifier for the client.

    Priority:
    1. Authenticated user ID (from X-User-ID header)
    2. Workspace ID (from X-Workspace-ID header)
    3. IP address (from X-Forwarded-For or client.host)

    Args:
        request: FastAPI/Starlette request object

    Returns:
        str: Client identifier with prefix (e.g., "user:123", "ip:192.168.1.1")
    """
    # Check for authenticated user (set by auth middleware)
    user_id = request.headers.get("X-User-ID")
    if user_id:
        return f"user:{user_id}"

    # Check for workspace context
    workspace_id = request.headers.get("X-Workspace-ID")
    if workspace_id:
        return f"workspace:{workspace_id}"

    # Fall back to IP address
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        # Take first IP (client IP before proxies)
        ip = forwarded.split(",")[0].strip()
    else:
        ip = request.client.host if request.client else "unknown"

    return f"ip:{ip}"


# =============================================================================
# Rate Limit Exceptions
# =============================================================================


class RateLimitExceeded(HTTPException):
    """Exception raised when rate limit is exceeded."""

    def __init__(
        self,
        limit: str,
        retry_after: int,
        detail: Optional[str] = None,
    ):
        """
        Initialize rate limit exceeded exception.

        Args:
            limit: The rate limit that was exceeded (e.g., "100/minute")
            retry_after: Seconds until the rate limit resets
            detail: Optional custom error message
        """
        super().__init__(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=detail or f"Rate limit exceeded. Limit: {limit}. Retry after {retry_after} seconds.",
            headers={
                "Retry-After": str(retry_after),
            },
        )
        self.limit = limit
        self.retry_after = retry_after


# =============================================================================
# Rate Limiter Middleware
# =============================================================================


class RateLimiterMiddleware(BaseHTTPMiddleware):
    """
    Rate limiting middleware using Redis sliding window algorithm.

    Applies rate limits to all requests based on endpoint patterns.
    Uses Redis for distributed rate limiting across multiple instances.

    Features:
    - Pattern-based rate limits per endpoint
    - Graceful degradation when Redis unavailable
    - Standard rate limit headers (X-RateLimit-*)
    - Configurable via settings.RATE_LIMIT_ENABLED
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        """
        Check rate limit before processing request.

        Args:
            request: Incoming HTTP request
            call_next: Next middleware/endpoint handler

        Returns:
            Response: 429 if rate limited, or actual response
        """
        # Skip if rate limiting disabled
        if not settings.RATE_LIMIT_ENABLED:
            return await call_next(request)

        # Skip health check and metrics endpoints
        skip_paths = [
            "/health",
            "/health/live",
            "/health/ready",
            "/ready",
            "/metrics",
            "/openapi.json",
            "/docs",
            "/redoc",
        ]
        if request.url.path in skip_paths:
            return await call_next(request)

        # Get rate limit for this endpoint
        limit_str = match_endpoint(request.url.path)
        max_requests, window_seconds = parse_rate_limit(limit_str)

        # Get client identifier
        client_id = get_client_identifier(request)

        # Build rate limit key with sliding window
        window_start = int(time.time()) // window_seconds
        key = f"ratelimit:notifications:{request.url.path}:{client_id}:{window_start}"

        # Check rate limit using Redis
        try:
            current_count = await redis_client.incr(key, ttl=window_seconds)
        except Exception as e:
            # Graceful degradation: allow request if Redis fails
            logger.warning(f"Rate limit check failed, allowing request: {e}")
            return await call_next(request)

        # Calculate remaining requests and reset time
        remaining = max(0, max_requests - current_count)
        reset_time = (window_start + 1) * window_seconds

        # Build rate limit headers
        headers = {
            "X-RateLimit-Limit": str(max_requests),
            "X-RateLimit-Remaining": str(remaining),
            "X-RateLimit-Reset": str(reset_time),
            "X-RateLimit-Policy": limit_str,
        }

        # Check if limit exceeded
        if current_count > max_requests:
            retry_after = reset_time - int(time.time())

            logger.warning(
                "Rate limit exceeded",
                extra={
                    "client_id": client_id,
                    "path": request.url.path,
                    "method": request.method,
                    "limit": limit_str,
                    "current_count": current_count,
                    "retry_after": retry_after,
                },
            )

            return JSONResponse(
                status_code=429,
                content={
                    "error": "RATE_LIMIT_EXCEEDED",
                    "message": f"Too many requests. Limit: {limit_str}",
                    "retry_after": max(0, retry_after),
                    "limit": max_requests,
                    "window_seconds": window_seconds,
                },
                headers={
                    **headers,
                    "Retry-After": str(max(0, retry_after)),
                },
            )

        # Process request
        response = await call_next(request)

        # Add rate limit headers to response
        for header_key, header_value in headers.items():
            response.headers[header_key] = header_value

        return response


# =============================================================================
# FastAPI Dependency for Per-Endpoint Rate Limiting
# =============================================================================


async def check_rate_limit(
    request: Request,
    limit: str = "100/minute",
    key_suffix: str = "",
) -> None:
    """
    FastAPI dependency for checking rate limits on specific endpoints.

    Use this dependency when you need custom rate limiting logic
    that differs from the middleware's pattern-based limits.

    Usage:
        @router.post("/send")
        async def send_notification(
            request: Request,
            _: None = Depends(lambda r: check_rate_limit(r, "50/minute", "send")),
        ):
            ...

    Args:
        request: FastAPI request object
        limit: Rate limit string (e.g., "50/minute")
        key_suffix: Optional suffix to make the rate limit key unique

    Raises:
        RateLimitExceeded: If rate limit is exceeded
    """
    if not settings.RATE_LIMIT_ENABLED:
        return

    max_requests, window_seconds = parse_rate_limit(limit)
    client_id = get_client_identifier(request)

    # Build rate limit key
    window_start = int(time.time()) // window_seconds
    key_parts = ["ratelimit", "notifications", key_suffix or "custom", client_id, str(window_start)]
    key = ":".join(filter(None, key_parts))

    try:
        current_count = await redis_client.incr(key, ttl=window_seconds)
    except Exception as e:
        logger.warning(f"Rate limit check failed: {e}")
        return  # Allow on Redis failure

    if current_count > max_requests:
        reset_time = (window_start + 1) * window_seconds
        retry_after = max(0, reset_time - int(time.time()))

        logger.warning(
            "Custom rate limit exceeded",
            extra={
                "client_id": client_id,
                "key_suffix": key_suffix,
                "limit": limit,
                "current_count": current_count,
            },
        )

        raise RateLimitExceeded(
            limit=limit,
            retry_after=retry_after,
        )


def create_rate_limit_dependency(
    limit: str,
    key_suffix: str = "",
) -> Callable:
    """
    Factory to create rate limit dependencies with custom limits.

    Usage:
        SendRateLimit = Depends(create_rate_limit_dependency("50/minute", "send"))

        @router.post("/send")
        async def send_notification(
            _: None = SendRateLimit,
        ):
            ...

    Args:
        limit: Rate limit string (e.g., "50/minute")
        key_suffix: Optional suffix for the rate limit key

    Returns:
        Callable: FastAPI dependency function
    """
    async def dependency(request: Request) -> None:
        await check_rate_limit(request, limit, key_suffix)

    return dependency


# =============================================================================
# Decorator for Function-Level Rate Limiting
# =============================================================================


def rate_limit(
    limit: str = "100/minute",
    key_prefix: str = "",
):
    """
    Decorator for rate limiting async functions.

    Useful for rate limiting service layer functions that may be called
    from multiple endpoints.

    Usage:
        @rate_limit("10/hour", "send_broadcast")
        async def send_broadcast_notification(user_ids: List[str], ...):
            ...

    Args:
        limit: Rate limit string (e.g., "10/hour")
        key_prefix: Prefix for the rate limit key (uses function name if not provided)

    Returns:
        Decorator function
    """
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> T:
            if not settings.RATE_LIMIT_ENABLED:
                return await func(*args, **kwargs)

            max_requests, window_seconds = parse_rate_limit(limit)
            window_start = int(time.time()) // window_seconds

            # Build key from prefix or function name
            prefix = key_prefix or func.__name__

            # Try to extract identifier from kwargs
            identifier = (
                kwargs.get("user_id")
                or kwargs.get("workspace_id")
                or kwargs.get("client_id")
                or "global"
            )

            key = f"ratelimit:func:{prefix}:{identifier}:{window_start}"

            try:
                current_count = await redis_client.incr(key, ttl=window_seconds)
            except Exception as e:
                logger.warning(f"Function rate limit check failed: {e}")
                return await func(*args, **kwargs)

            if current_count > max_requests:
                reset_time = (window_start + 1) * window_seconds
                retry_after = max(0, reset_time - int(time.time()))

                logger.warning(
                    "Function rate limit exceeded",
                    extra={
                        "function": func.__name__,
                        "limit": limit,
                        "identifier": identifier,
                    },
                )

                raise RateLimitExceeded(
                    limit=limit,
                    retry_after=retry_after,
                    detail=f"Rate limit exceeded for {func.__name__}",
                )

            return await func(*args, **kwargs)

        return wrapper
    return decorator


# =============================================================================
# Utility Functions
# =============================================================================


async def get_rate_limit_status(
    client_id: str,
    endpoint: str,
) -> Dict:
    """
    Get current rate limit status for a client on an endpoint.

    Useful for debugging and admin dashboards.

    Args:
        client_id: Client identifier (e.g., "user:123")
        endpoint: API endpoint path

    Returns:
        Dict with limit status including current count, max, remaining, reset
    """
    limit_str = match_endpoint(endpoint)
    max_requests, window_seconds = parse_rate_limit(limit_str)

    window_start = int(time.time()) // window_seconds
    key = f"ratelimit:notifications:{endpoint}:{client_id}:{window_start}"

    # Get current count from Redis
    current = await redis_client.get(key)
    current_count = int(current) if current else 0

    reset_time = (window_start + 1) * window_seconds
    remaining = max(0, max_requests - current_count)

    return {
        "client_id": client_id,
        "endpoint": endpoint,
        "limit": limit_str,
        "max_requests": max_requests,
        "window_seconds": window_seconds,
        "current_count": current_count,
        "remaining": remaining,
        "reset_at": reset_time,
        "reset_in_seconds": max(0, reset_time - int(time.time())),
    }


async def reset_rate_limit(
    client_id: str,
    endpoint: str,
) -> bool:
    """
    Reset rate limit for a client on an endpoint.

    Admin-only function to clear rate limits (e.g., for customer support).

    Args:
        client_id: Client identifier (e.g., "user:123")
        endpoint: API endpoint path

    Returns:
        bool: True if reset successful
    """
    limit_str = match_endpoint(endpoint)
    _, window_seconds = parse_rate_limit(limit_str)

    window_start = int(time.time()) // window_seconds
    key = f"ratelimit:notifications:{endpoint}:{client_id}:{window_start}"

    success = await redis_client.delete(key)

    if success:
        logger.info(
            "Rate limit reset",
            extra={
                "client_id": client_id,
                "endpoint": endpoint,
            },
        )

    return success


# =============================================================================
# Module Exports
# =============================================================================

__all__ = [
    # Configuration
    "RATE_LIMITS",
    "parse_rate_limit",
    "match_endpoint",
    "get_client_identifier",
    # Exceptions
    "RateLimitExceeded",
    # Middleware
    "RateLimiterMiddleware",
    # Dependencies
    "check_rate_limit",
    "create_rate_limit_dependency",
    # Decorator
    "rate_limit",
    # Utilities
    "get_rate_limit_status",
    "reset_rate_limit",
]
