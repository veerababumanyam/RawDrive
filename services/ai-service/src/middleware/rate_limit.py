"""Rate limiting middleware for AI Service.

Implements per-IP and per-user rate limiting using slowapi.
Addresses HIGH priority from SECURITY_REVIEW.md: Missing Rate Limiting
"""

import os
import logging
from typing import Optional, Callable
from functools import wraps

from fastapi import Request, HTTPException
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)

# Rate limit configuration from environment
RATE_LIMIT_ENABLED = os.getenv("RATE_LIMIT_ENABLED", "true").lower() == "true"
RATE_LIMIT_DEFAULT = os.getenv("RATE_LIMIT_DEFAULT", "100/minute")
RATE_LIMIT_HEALTH = os.getenv("RATE_LIMIT_HEALTH", "60/minute")
RATE_LIMIT_AI_FILTER = os.getenv("RATE_LIMIT_AI_FILTER", "30/minute")


def get_user_identifier(request: Request) -> str:
    """Get rate limit key from user ID or IP address.
    
    Priority:
    1. User ID from JWT (if authenticated)
    2. Workspace ID from header
    3. Remote IP address
    """
    # Try to get user from request state (set by auth middleware)
    if hasattr(request.state, 'user') and request.state.user:
        user_id = request.state.user.get('user_id') or request.state.user.get('sub')
        if user_id:
            return f"user:{user_id}"
    
    # Try workspace ID from header
    workspace_id = request.headers.get('X-Workspace-ID')
    if workspace_id:
        return f"workspace:{workspace_id}"
    
    # Fallback to IP address
    return get_remote_address(request)


# Create limiter instance
limiter = Limiter(
    key_func=get_user_identifier,
    default_limits=[RATE_LIMIT_DEFAULT] if RATE_LIMIT_ENABLED else [],
    enabled=RATE_LIMIT_ENABLED,
    storage_uri=os.getenv("REDIS_URL", "memory://"),
)


async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """Custom handler for rate limit exceeded errors."""
    logger.warning(
        f"Rate limit exceeded: {get_user_identifier(request)} on {request.url.path}"
    )
    
    # Get retry-after from exception if available
    retry_after = getattr(exc, 'retry_after', 60)
    
    return JSONResponse(
        status_code=429,
        content={
            "error": "rate_limit_exceeded",
            "message": f"Rate limit exceeded. Try again in {retry_after} seconds.",
            "retry_after": retry_after,
        },
        headers={
            "Retry-After": str(retry_after),
            "X-RateLimit-Limit": str(exc.limit) if hasattr(exc, 'limit') else RATE_LIMIT_DEFAULT,
        }
    )


def rate_limit(limit: str = RATE_LIMIT_DEFAULT):
    """Decorator to apply rate limiting to an endpoint.
    
    Usage:
        @router.get("/endpoint")
        @rate_limit("30/minute")
        async def my_endpoint(request: Request):
            ...
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Get request from args or kwargs
            request = None
            for arg in args:
                if isinstance(arg, Request):
                    request = arg
                    break
            if not request:
                request = kwargs.get('request')
            
            if request and RATE_LIMIT_ENABLED:
                # Apply rate limit check
                key = get_user_identifier(request)
                # The actual limiting is handled by slowapi middleware
                logger.debug(f"Rate limit check: {key} -> {limit}")
            
            return await func(*args, **kwargs)
        
        # Apply slowapi decorator
        if RATE_LIMIT_ENABLED:
            return limiter.limit(limit)(wrapper)
        return wrapper
    
    return decorator


# Specific rate limiters for different endpoint types
def gallery_health_limit():
    """Rate limit for gallery health endpoints."""
    return rate_limit(RATE_LIMIT_HEALTH)


def ai_filter_limit():
    """Rate limit for AI filter endpoints."""
    return rate_limit(RATE_LIMIT_AI_FILTER)


def default_limit():
    """Default rate limit."""
    return rate_limit(RATE_LIMIT_DEFAULT)
