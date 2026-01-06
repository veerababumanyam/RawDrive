"""
Rate limiter middleware using Redis sliding window algorithm.

Optimized for 50K concurrent gallery views with tiered limits:
- Public gallery views: high limits (1000/min per IP)
- Proofing actions: medium limits (100/min per visitor)
- API mutations: low limits (60/min per user)
"""

from __future__ import annotations

import logging
import time
from typing import Dict, Tuple

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from src.config import settings
from src.cache.redis_client import redis_client

logger = logging.getLogger(__name__)


# Rate limit configurations per endpoint pattern
# Format: "requests/period" where period is second, minute, hour, day
RATE_LIMITS: Dict[str, str] = {
    # Public gallery endpoints - high limits for 50K concurrent users
    "/api/v1/public/galleries/*/view": "1000/minute",
    "/api/v1/public/galleries/*/assets": "500/minute",
    "/api/v1/public/galleries/*/assets/*/thumbnail": "2000/minute",
    "/api/v1/public/galleries/*/assets/*/preview": "1000/minute",

    # Magic link endpoints
    "/api/v1/magic-links/*/validate": "100/minute",
    "/api/v1/magic-links/*/verify-pin": "10/minute",  # PIN brute force protection

    # Proofing endpoints - per visitor
    "/api/v1/public/galleries/*/proof/favorite": "100/minute",
    "/api/v1/public/galleries/*/proof/select": "100/minute",
    "/api/v1/public/galleries/*/proof/comment": "30/minute",

    # Face search - resource intensive
    "/api/v1/public/galleries/*/face-search": "20/minute",

    # Download endpoints
    "/api/v1/public/galleries/*/download": "30/minute",
    "/api/v1/galleries/*/export": "10/hour",

    # Authenticated gallery endpoints
    "/api/v1/galleries": "200/minute",
    "/api/v1/galleries/*": "200/minute",
    "/api/v1/galleries/*/assets": "100/minute",
    "/api/v1/galleries/*/publish": "20/minute",

    # WebSocket - connection rate
    "/api/v1/ws/*": "60/minute",

    # Default for all other endpoints
    "default": "100/minute",
}


def parse_rate_limit(limit_str: str) -> Tuple[int, int]:
    """Parse rate limit string like "100/minute" to (count, seconds)."""
    count, period = limit_str.split("/")
    count = int(count)

    period_seconds = {
        "second": 1,
        "minute": 60,
        "hour": 3600,
        "day": 86400,
    }

    seconds = period_seconds.get(period, 60)
    return count, seconds


def match_endpoint(path: str) -> str:
    """Match a path to a rate limit pattern."""
    for pattern, limit in RATE_LIMITS.items():
        if pattern == "default":
            continue

        # Simple glob matching with *
        pattern_parts = pattern.split("/")
        path_parts = path.split("/")

        if len(pattern_parts) != len(path_parts):
            continue

        match = True
        for p, actual in zip(pattern_parts, path_parts):
            if p != "*" and p != actual:
                match = False
                break

        if match:
            return limit

    return RATE_LIMITS.get("default", "100/minute")


def get_client_identifier(request: Request) -> str:
    """Get a unique identifier for the client.

    Priority:
    1. Authenticated user ID
    2. Visitor ID (from cookie/header)
    3. IP address
    """
    # Check for authenticated user
    user_id = request.headers.get("X-User-ID")
    if user_id:
        return f"user:{user_id}"

    # Check for visitor ID (proofing sessions)
    visitor_id = request.headers.get("X-Visitor-ID")
    if visitor_id:
        return f"visitor:{visitor_id}"

    # Fall back to IP address
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        ip = forwarded.split(",")[0].strip()
    else:
        ip = request.client.host if request.client else "unknown"

    return f"ip:{ip}"


class RateLimiterMiddleware(BaseHTTPMiddleware):
    """Rate limiting middleware using Redis sliding window."""

    async def dispatch(self, request: Request, call_next):
        # Skip if disabled
        if not settings.RATE_LIMIT_ENABLED:
            return await call_next(request)

        # Skip health checks and metrics
        if request.url.path in ["/health", "/ready", "/health/live", "/health/ready", "/metrics"]:
            return await call_next(request)

        # Get rate limit for this endpoint
        limit_str = match_endpoint(request.url.path)
        max_requests, window_seconds = parse_rate_limit(limit_str)

        # Get client identifier
        client_id = get_client_identifier(request)

        # Build rate limit key
        window_start = int(time.time()) // window_seconds
        key = f"ratelimit:gallery:{request.url.path}:{client_id}:{window_start}"

        # Check rate limit using Redis
        current_count = await redis_client.incr(key, ttl=window_seconds)

        # Calculate remaining and reset time
        remaining = max(0, max_requests - current_count)
        reset_time = (window_start + 1) * window_seconds

        # Add rate limit headers
        headers = {
            "X-RateLimit-Limit": str(max_requests),
            "X-RateLimit-Remaining": str(remaining),
            "X-RateLimit-Reset": str(reset_time),
        }

        # Check if limit exceeded
        if current_count > max_requests:
            logger.warning(
                f"Rate limit exceeded for {client_id} on {request.url.path}",
                extra={
                    "client_id": client_id,
                    "path": request.url.path,
                    "limit": limit_str,
                }
            )
            return JSONResponse(
                status_code=429,
                content={
                    "error": "rate_limit_exceeded",
                    "message": f"Too many requests. Limit: {limit_str}",
                    "retry_after": reset_time - int(time.time()),
                },
                headers={
                    **headers,
                    "Retry-After": str(reset_time - int(time.time())),
                },
            )

        # Process request
        response = await call_next(request)

        # Add headers to response
        for header_key, value in headers.items():
            response.headers[header_key] = value

        return response
