"""Rate limit middleware for request throttling.

Property 6: Rate Limit Enforcement
Failed auth attempts and API calls are rate limited.
"""

import logging
from typing import Callable, Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.config.settings import get_settings
from app.services.rate_limit_service import RateLimitService, RateLimitType

logger = logging.getLogger(__name__)


def get_client_ip(request: Request) -> str:
    """Extract real client IP from request.

    Handles X-Forwarded-For header for proxied requests.
    """
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        # Take the first IP in the chain (original client)
        return forwarded.split(",")[0].strip()

    # Fallback to direct client
    if request.client:
        return request.client.host

    return "unknown"


# Route patterns and their rate limit types
# Order matters: more specific routes should come first
RATE_LIMIT_ROUTES = {
    "/api/v1/auth/": RateLimitType.AUTH,
    "/api/v1/upload": RateLimitType.UPLOAD,
    "/api/v1/search": RateLimitType.SEARCH,
    "/api/v1/public/profiles/": RateLimitType.PUBLIC,  # Public profile endpoints
    "/api/v1/public/galleries/": RateLimitType.PUBLIC,  # Public gallery endpoints (SOC2: rate limit PIN verify, favorites, selections)
    "/api/": RateLimitType.API,
}

# AI endpoint patterns - checked separately for more specific matching
AI_RATE_LIMIT_PATTERNS = [
    "/smart-tagging/",  # Smart tagging analysis, captions, hashtags
    "/stories/",  # Story generation
    "/curation/",  # Smart curation
    "/ai/",  # Direct AI endpoints
]

# Routes exempt from rate limiting
EXEMPT_ROUTES = [
    "/health",
    "/healthz",
    "/ready",
    "/readiness",
    "/metrics",
    "/docs",
    "/openapi.json",
    "/redoc",
]


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Middleware that enforces rate limits on API requests."""

    def __init__(self, app: Callable, exclude_paths: Optional[list[str]] = None):
        super().__init__(app)
        self.rate_limiter = RateLimitService()
        self.exclude_paths = exclude_paths or EXEMPT_ROUTES

    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path

        # Skip rate limiting for OPTIONS (CORS preflight) requests
        if request.method == "OPTIONS":
            return await call_next(request)

        # Skip rate limiting for exempt routes
        if any(path.startswith(exempt) for exempt in self.exclude_paths):
            return await call_next(request)

        # Determine rate limit type based on path
        limit_type = self._get_limit_type(path)
        if limit_type is None:
            return await call_next(request)

        # Get client identifier (IP for now, could include user ID)
        client_id = self._get_identifier(request)

        # Check rate limit
        result = await self.rate_limiter.check_rate_limit(client_id, limit_type)

        # Add rate limit headers to response
        response: Response
        if result.allowed:
            response = await call_next(request)
        else:
            logger.warning(
                "Rate limit exceeded",
                extra={
                    "client_id": client_id,
                    "limit_type": limit_type.value,
                    "path": path,
                    "retry_after": result.retry_after,
                },
            )
            response = JSONResponse(
                status_code=429,
                content={
                    "error": "rate_limit_exceeded",
                    "message": "Too many requests. Please try again later.",
                    "retry_after": result.retry_after,
                },
            )
            # Add CORS headers to rate limit response
            # This ensures CORS works even when rate limited
            origin = request.headers.get("origin")
            if origin:
                try:
                    settings = get_settings()
                    if origin in settings.allowed_cors_origins or "*" in settings.allowed_cors_origins:
                        response.headers["Access-Control-Allow-Origin"] = origin
                        response.headers["Access-Control-Allow-Credentials"] = "true"
                        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, PATCH, OPTIONS"
                        response.headers["Access-Control-Allow-Headers"] = "*"
                except Exception:
                    # If settings can't be loaded, don't add CORS headers
                    pass

        # Add rate limit headers
        response.headers["X-RateLimit-Limit"] = str(result.limit)
        response.headers["X-RateLimit-Remaining"] = str(result.remaining)
        response.headers["X-RateLimit-Reset"] = str(result.reset_at)
        if result.retry_after:
            response.headers["Retry-After"] = str(result.retry_after)

        return response

    def _get_limit_type(self, path: str) -> Optional[RateLimitType]:
        """Determine rate limit type for path."""
        # Check for AI-specific endpoints first (more specific matching)
        for pattern in AI_RATE_LIMIT_PATTERNS:
            if pattern in path:
                return RateLimitType.AI

        # Then check prefix-based routes
        for prefix, limit_type in RATE_LIMIT_ROUTES.items():
            if path.startswith(prefix):
                return limit_type
        return None

    def _get_identifier(self, request: Request) -> str:
        """Get rate limit identifier for request.

        Uses authenticated user ID if available, otherwise IP.
        """
        # Check for authenticated user in request state
        user_id = getattr(request.state, "user_id", None)
        if user_id:
            return f"user:{user_id}"

        # Fall back to IP-based limiting
        return f"ip:{get_client_ip(request)}"
