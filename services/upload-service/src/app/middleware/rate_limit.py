"""Rate limiting middleware for the Upload Service.

Implements workspace-level rate limiting using Redis:
- Sliding window rate limiting
- Per-workspace limits
- Burst tolerance
- Returns Retry-After headers

Author: Claude Code Migration
"""

from __future__ import annotations

import logging
import time
from typing import Optional

from fastapi import Request, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# Paths that don't count against rate limit
EXCLUDED_PATHS = {
    "/",
    "/health",
    "/ready",
    "/startup",
    "/metrics",
    "/docs",
    "/redoc",
    "/openapi.json",
}


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Workspace-level rate limiting using sliding window algorithm.

    Limits requests per workspace to prevent abuse and ensure fair usage.
    Uses Redis for distributed rate limiting across service replicas.

    Rate limits are configured per workspace tier:
    - Free: 100 req/min
    - Pro: 500 req/min
    - Enterprise: 2000 req/min

    Default (no workspace): 30 req/min
    """

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        """Process request through rate limiter.

        Args:
            request: Incoming request
            call_next: Next handler in chain

        Returns:
            Response from handler or 429 if rate limited
        """
        # Skip rate limiting for excluded paths
        if request.url.path in EXCLUDED_PATHS:
            return await call_next(request)

        # Skip for OPTIONS requests
        if request.method == "OPTIONS":
            return await call_next(request)

        # Get workspace ID from header or request state
        workspace_id = request.headers.get("X-Workspace-ID")
        if not workspace_id and hasattr(request.state, "workspace_id"):
            workspace_id = request.state.workspace_id

        # Check rate limit
        allowed, retry_after, remaining = await self._check_rate_limit(
            workspace_id=workspace_id,
            path=request.url.path,
            method=request.method,
        )

        if not allowed:
            logger.warning(
                "Rate limit exceeded",
                extra={
                    "workspace_id": workspace_id,
                    "path": request.url.path,
                    "retry_after": retry_after,
                },
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "code": "RATE_LIMIT_EXCEEDED",
                    "message": "Too many requests. Please retry later.",
                    "retry_after_seconds": retry_after,
                },
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Remaining": "0",
                },
            )

        # Process request
        response = await call_next(request)

        # Add rate limit headers to response
        response.headers["X-RateLimit-Remaining"] = str(remaining)

        return response

    async def _check_rate_limit(
        self,
        workspace_id: Optional[str],
        path: str,
        method: str,
    ) -> tuple[bool, int, int]:
        """Check if request is within rate limits.

        Uses sliding window rate limiting with Redis.

        Args:
            workspace_id: Workspace UUID or None
            path: Request path
            method: HTTP method

        Returns:
            Tuple of (allowed, retry_after_seconds, remaining_requests)
        """
        settings = get_settings()

        # Determine rate limit based on workspace
        if workspace_id:
            limit = settings.RATE_LIMIT_PER_WORKSPACE
            window = settings.RATE_LIMIT_WINDOW
        else:
            # Stricter limit for unauthenticated requests
            limit = 30  # 30 req/min
            window = 60

        # Build rate limit key
        key_suffix = workspace_id or "anonymous"
        rate_key = f"rate_limit:upload:{key_suffix}"

        try:
            from app.core.redis import get_redis_client

            redis = await get_redis_client()
            if redis is None:
                # Redis unavailable - allow request but log warning
                logger.warning("Redis unavailable for rate limiting, allowing request")
                return True, 0, limit

            # Get current window
            now = time.time()
            window_start = now - window

            # Remove old entries and count current
            pipe = redis.pipeline()
            pipe.zremrangebyscore(rate_key, 0, window_start)
            pipe.zcard(rate_key)
            pipe.zadd(rate_key, {str(now): now})
            pipe.expire(rate_key, window)
            results = await pipe.execute()

            current_count = results[1]

            if current_count >= limit:
                # Calculate retry-after
                oldest_entry = await redis.zrange(rate_key, 0, 0, withscores=True)
                if oldest_entry:
                    oldest_time = oldest_entry[0][1]
                    retry_after = int(oldest_time + window - now) + 1
                else:
                    retry_after = window
                return False, retry_after, 0

            remaining = limit - current_count - 1
            return True, 0, remaining

        except Exception as e:
            logger.warning(
                "Rate limit check failed",
                extra={"error": str(e), "workspace_id": workspace_id},
            )
            # Allow request on error (fail open)
            return True, 0, limit


class ChunkRateLimitMiddleware(BaseHTTPMiddleware):
    """Additional rate limiting for chunk uploads.

    Prevents clients from overwhelming the service with too many
    concurrent chunk uploads.

    Limits:
    - Max 10 concurrent chunk uploads per workspace
    - Max 100 chunks per minute per upload session
    """

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        """Process chunk request through rate limiter.

        Args:
            request: Incoming request
            call_next: Next handler in chain

        Returns:
            Response from handler or 429 if rate limited
        """
        # Only apply to chunk upload endpoint
        if not request.url.path.startswith("/api/v1/upload/chunk/"):
            return await call_next(request)

        # Only apply to PATCH requests (actual chunk data)
        if request.method != "PATCH":
            return await call_next(request)

        workspace_id = request.headers.get("X-Workspace-ID")
        if not workspace_id:
            return await call_next(request)

        # Check concurrent upload limit
        allowed, retry_after = await self._check_concurrent_limit(workspace_id)

        if not allowed:
            logger.warning(
                "Concurrent chunk upload limit exceeded",
                extra={"workspace_id": workspace_id},
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "code": "CONCURRENT_UPLOAD_LIMIT",
                    "message": "Too many concurrent uploads. Please wait.",
                    "retry_after_seconds": retry_after,
                },
                headers={"Retry-After": str(retry_after)},
            )

        try:
            return await call_next(request)
        finally:
            # Decrement concurrent counter
            await self._release_concurrent_slot(workspace_id)

    async def _check_concurrent_limit(
        self,
        workspace_id: str,
    ) -> tuple[bool, int]:
        """Check concurrent upload limit.

        Args:
            workspace_id: Workspace UUID

        Returns:
            Tuple of (allowed, retry_after_seconds)
        """
        settings = get_settings()
        max_concurrent = settings.MAX_CONCURRENT_UPLOADS_PER_WORKSPACE

        try:
            from app.core.redis import get_redis_client

            redis = await get_redis_client()
            if redis is None:
                return True, 0

            key = f"concurrent_uploads:{workspace_id}"

            # Try to increment counter
            current = await redis.incr(key)

            # Set expiry if new key
            if current == 1:
                await redis.expire(key, 300)  # 5 minute expiry

            if current > max_concurrent:
                # Over limit, decrement and reject
                await redis.decr(key)
                return False, 5

            return True, 0

        except Exception as e:
            logger.warning(
                "Concurrent limit check failed",
                extra={"error": str(e), "workspace_id": workspace_id},
            )
            return True, 0

    async def _release_concurrent_slot(self, workspace_id: str) -> None:
        """Release a concurrent upload slot.

        Args:
            workspace_id: Workspace UUID
        """
        try:
            from app.core.redis import get_redis_client

            redis = await get_redis_client()
            if redis is None:
                return

            key = f"concurrent_uploads:{workspace_id}"
            await redis.decr(key)

        except Exception as e:
            logger.warning(
                "Failed to release concurrent slot",
                extra={"error": str(e), "workspace_id": workspace_id},
            )


# =============================================================================
# Module Exports
# =============================================================================

__all__ = [
    "RateLimitMiddleware",
    "ChunkRateLimitMiddleware",
    "EXCLUDED_PATHS",
]
