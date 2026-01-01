"""
Rate limiter middleware using Redis sliding window algorithm.
"""

from __future__ import annotations

import logging
import time
from typing import Dict, Tuple

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from src.config import settings
from src.cache.redis_client import redis_client

logger = logging.getLogger(__name__)


# Rate limit configurations per endpoint pattern
RATE_LIMITS: Dict[str, str] = {
    # Guest endpoints
    "/api/v1/guests/import": "5/hour",
    "/api/v1/guests/bulk-invite": "10/hour",
    
    # RSVP endpoints (public)
    "/api/v1/invitations/*/rsvp": "10/minute",
    
    # AI endpoints
    "/api/v1/ai/generate": "20/hour",
    "/api/v1/ai/background": "10/hour",
    
    # Export endpoints
    "/api/v1/invitations/*/export": "20/hour",
    
    # Public view (per IP)
    "/api/v1/invitations/*/view": "60/minute",
    
    # Default
    "default": "100/minute",
}


def parse_rate_limit(limit_str: str) -> Tuple[int, int]:
    """
    Parse rate limit string like "100/minute" to (count, seconds).
    """
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
    """Get a unique identifier for the client."""
    # Check for authenticated user
    user_id = request.headers.get("X-User-ID")
    if user_id:
        return f"user:{user_id}"
    
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
        
        # Skip health checks
        if request.url.path in ["/health", "/ready"]:
            return await call_next(request)
        
        # Get rate limit for this endpoint
        limit_str = match_endpoint(request.url.path)
        max_requests, window_seconds = parse_rate_limit(limit_str)
        
        # Get client identifier
        client_id = get_client_identifier(request)
        
        # Build rate limit key
        window_start = int(time.time()) // window_seconds
        key = f"ratelimit:{request.url.path}:{client_id}:{window_start}"
        
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
            logger.warning(f"Rate limit exceeded for {client_id} on {request.url.path}")
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
        for key, value in headers.items():
            response.headers[key] = value
        
        return response
