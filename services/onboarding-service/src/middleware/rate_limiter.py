"""Rate limiting middleware using Redis."""

import time
from typing import Dict

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from src.cache.redis_client import redis_client
from src.config import settings
from src.logging import get_logger

logger = get_logger(__name__)


# Rate limits by endpoint pattern
RATE_LIMITS: Dict[str, str] = {
    "/api/v1/onboarding/start": settings.RATE_LIMIT_ONBOARDING_START,
    "/api/v1/onboarding/verify-email": settings.RATE_LIMIT_EMAIL_VERIFICATION,
    "/api/v1/onboarding/resend-verification": settings.RATE_LIMIT_EMAIL_VERIFICATION,
    "/api/v1/onboarding/payment/create-intent": settings.RATE_LIMIT_PAYMENT,
    "/api/v1/onboarding/payment/confirm": settings.RATE_LIMIT_PAYMENT,
    "default": settings.RATE_LIMIT_DEFAULT,
}


def parse_rate_limit(limit_str: str) -> tuple[int, int]:
    """Parse rate limit string like '100/minute' to (max_requests, window_seconds)."""
    parts = limit_str.split("/")
    max_requests = int(parts[0])

    if parts[1] == "second":
        window_seconds = 1
    elif parts[1] == "minute":
        window_seconds = 60
    elif parts[1] == "hour":
        window_seconds = 3600
    else:
        window_seconds = 60

    return max_requests, window_seconds


def get_client_identifier(request: Request) -> str:
    """Get client identifier for rate limiting (IP address or session)."""
    # Try to get IP from X-Forwarded-For header (behind proxy)
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()

    # Fall back to direct IP
    if request.client:
        return request.client.host

    return "unknown"


def match_endpoint(path: str) -> str:
    """Match endpoint path to rate limit configuration."""
    # Check for exact match
    if path in RATE_LIMITS:
        return RATE_LIMITS[path]

    # Check for prefix match
    for pattern, limit in RATE_LIMITS.items():
        if pattern != "default" and path.startswith(pattern):
            return limit

    return RATE_LIMITS["default"]


class RateLimiterMiddleware(BaseHTTPMiddleware):
    """Middleware to enforce rate limiting using Redis."""

    async def dispatch(self, request: Request, call_next):
        """Process request with rate limiting."""
        # Skip health checks and metrics
        if request.url.path in ["/health", "/health/live", "/health/ready", "/metrics"]:
            return await call_next(request)

        # Get rate limit for this endpoint
        limit_str = match_endpoint(request.url.path)
        max_requests, window_seconds = parse_rate_limit(limit_str)

        # Get client identifier
        client_id = get_client_identifier(request)

        # Create rate limit key
        window_start = int(time.time() / window_seconds) * window_seconds
        key = f"ratelimit:onboarding:{request.url.path}:{client_id}:{window_start}"

        # Increment counter in Redis
        current_count = await redis_client.incr(key, ttl=window_seconds)

        # Check if rate limit exceeded
        if current_count > max_requests:
            logger.warning(
                "Rate limit exceeded",
                extra={
                    "client_id": client_id,
                    "path": request.url.path,
                    "count": current_count,
                    "limit": max_requests,
                },
            )
            return JSONResponse(
                status_code=429,
                content={
                    "error": "rate_limit_exceeded",
                    "message": f"Rate limit exceeded. Maximum {max_requests} requests per {window_seconds} seconds.",
                    "retry_after": window_seconds,
                },
                headers={
                    "X-RateLimit-Limit": str(max_requests),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(window_start + window_seconds),
                    "Retry-After": str(window_seconds),
                },
            )

        # Process request
        response = await call_next(request)

        # Add rate limit headers
        response.headers["X-RateLimit-Limit"] = str(max_requests)
        response.headers["X-RateLimit-Remaining"] = str(
            max(0, max_requests - current_count)
        )
        response.headers["X-RateLimit-Reset"] = str(window_start + window_seconds)

        return response
