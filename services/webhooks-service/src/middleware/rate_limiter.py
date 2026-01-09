"""
Rate limiting middleware.
"""

import time
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from src.config import settings
from src.cache.redis_client import redis_client

logger = logging.getLogger(__name__)


class RateLimiterMiddleware(BaseHTTPMiddleware):
    """Simple rate limiting middleware using Redis."""

    def __init__(self, app):
        super().__init__(app)
        self.enabled = settings.RATE_LIMIT_ENABLED
        # Parse rate limit: "100/minute"
        rate, period = settings.RATE_LIMIT_DEFAULT.split("/")
        self.rate = int(rate)
        self.period = {"second": 1, "minute": 60, "hour": 3600}.get(period, 60)

    async def dispatch(self, request: Request, call_next):
        if not self.enabled:
            return await call_next(request)

        # Skip rate limiting for health checks
        if request.url.path in ["/health", "/ready", "/metrics"]:
            return await call_next(request)

        # Get client identifier
        client_ip = request.client.host if request.client else "unknown"
        workspace_id = request.headers.get("X-Workspace-ID", "")

        # Use workspace ID if available, otherwise IP
        key_suffix = workspace_id or client_ip
        rate_key = f"webhook:ratelimit:{request.url.path}:{key_suffix}"

        try:
            # Increment counter
            count = await redis_client.incr(rate_key)

            # Set expiration on first request
            if count == 1:
                await redis_client.expire(rate_key, self.period)

            # Check rate limit
            if count > self.rate:
                logger.warning(
                    f"Rate limit exceeded for {key_suffix} on {request.url.path}"
                )
                return JSONResponse(
                    status_code=429,
                    content={
                        "error": {
                            "code": "RATE_LIMIT_EXCEEDED",
                            "message": f"Rate limit exceeded. Limit: {self.rate} requests per {self.period} seconds",
                        }
                    },
                    headers={
                        "Retry-After": str(self.period),
                        "X-RateLimit-Limit": str(self.rate),
                        "X-RateLimit-Remaining": "0",
                    },
                )

        except Exception as e:
            # If Redis fails, allow request through
            logger.error(f"Rate limiter error: {e}")

        response = await call_next(request)

        # Add rate limit headers
        try:
            count = await redis_client.get(rate_key)
            remaining = max(0, self.rate - int(count or 0))
            response.headers["X-RateLimit-Limit"] = str(self.rate)
            response.headers["X-RateLimit-Remaining"] = str(remaining)
        except Exception:
            pass

        return response
