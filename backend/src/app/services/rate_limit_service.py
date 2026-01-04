"""Redis-backed rate limiting service.

Implements sliding window rate limiting per IP and per user with
configurable limits per endpoint type.

Requirements: 2.2, 12.2
Property 6: Rate Limit Enforcement
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from enum import Enum

from app.config.settings import get_settings
from app.db.redis import get_redis_client

logger = logging.getLogger(__name__)


class RateLimitType(str, Enum):
    """Rate limit categories with different thresholds."""

    AUTH = "auth"  # Login, signup, password reset
    API = "api"  # General API requests
    UPLOAD = "upload"  # File uploads
    SEARCH = "search"  # Search/query endpoints
    PUBLIC = "public"  # Public profile endpoints (QR, vCard, profile view)
    AI = "ai"  # AI operations (analysis, captions, hashtags, stories, curation)


@dataclass
class RateLimitConfig:
    """Configuration for a rate limit type."""

    requests: int  # Max requests
    window_seconds: int  # Time window


# Default rate limits per type (production)
DEFAULT_LIMITS: dict[RateLimitType, RateLimitConfig] = {
    RateLimitType.AUTH: RateLimitConfig(requests=10, window_seconds=900),  # 10 req / 15 min
    RateLimitType.API: RateLimitConfig(requests=100, window_seconds=60),  # 100 req / min
    RateLimitType.UPLOAD: RateLimitConfig(requests=20, window_seconds=3600),  # 20 req / hour
    RateLimitType.SEARCH: RateLimitConfig(requests=30, window_seconds=60),  # 30 req / min
    RateLimitType.PUBLIC: RateLimitConfig(requests=60, window_seconds=60),  # 60 req / min (public profile views)
    RateLimitType.AI: RateLimitConfig(requests=30, window_seconds=60),  # 30 req / min (AI operations)
}

# Development rate limits (more lenient)
DEV_LIMITS: dict[RateLimitType, RateLimitConfig] = {
    RateLimitType.AUTH: RateLimitConfig(requests=100, window_seconds=60),  # 100 req / min
    RateLimitType.API: RateLimitConfig(requests=1000, window_seconds=60),  # 1000 req / min
    RateLimitType.UPLOAD: RateLimitConfig(requests=200, window_seconds=3600),  # 200 req / hour
    RateLimitType.SEARCH: RateLimitConfig(requests=300, window_seconds=60),  # 300 req / min
    RateLimitType.PUBLIC: RateLimitConfig(requests=300, window_seconds=60),  # 300 req / min (dev)
    RateLimitType.AI: RateLimitConfig(requests=100, window_seconds=60),  # 100 req / min (dev AI)
}


def get_rate_limits() -> dict[RateLimitType, RateLimitConfig]:
    """Get rate limits based on environment."""
    try:
        settings = get_settings()
        if settings.app_env.value == "development":
            return DEV_LIMITS
    except Exception:
        # If settings can't be loaded, default to production limits
        pass
    return DEFAULT_LIMITS


@dataclass
class RateLimitResult:
    """Result of a rate limit check."""

    allowed: bool
    limit: int
    remaining: int
    reset_at: int  # Unix timestamp
    retry_after: int | None = None  # Seconds until reset (if blocked)


def _rate_limit_key(identifier: str, limit_type: RateLimitType) -> str:
    """Redis key for rate limit counter."""
    return f"ratelimit:{limit_type.value}:{identifier}"


class RateLimitService:
    """Sliding window rate limiter using Redis sorted sets."""

    def __init__(self, limits: dict[RateLimitType, RateLimitConfig] | None = None):
        self._limits = limits or get_rate_limits()

    async def check_rate_limit(
        self,
        identifier: str,
        limit_type: RateLimitType,
        custom_config: RateLimitConfig | None = None,
    ) -> RateLimitResult:
        """Check if request is allowed under rate limit.

        Uses sliding window log algorithm for accurate limiting.

        Args:
            identifier: IP address, user ID, or API key
            limit_type: Category of rate limit
            custom_config: Override default config

        Returns:
            RateLimitResult with allowed status and metadata
        """
        default_limits = get_rate_limits()
        config = custom_config or self._limits.get(limit_type, default_limits[RateLimitType.API])

        try:
            redis = await get_redis_client()
        except RuntimeError:
            logger.warning(
                "Redis not initialized; skipping rate limit enforcement",
                extra={"identifier": identifier, "limit_type": limit_type.value},
            )
            now = time.time()
            reset_at = int(now + config.window_seconds)
            return RateLimitResult(
                allowed=True,
                limit=config.requests,
                remaining=config.requests,
                reset_at=reset_at,
            )

        key = _rate_limit_key(identifier, limit_type)
        now = time.time()
        window_start = now - config.window_seconds

        # Use Redis pipeline for atomic operations
        pipe = redis.pipeline()

        # Remove old entries outside window
        pipe.zremrangebyscore(key, 0, window_start)

        # Count current requests in window
        pipe.zcard(key)

        # Add current request
        pipe.zadd(key, {f"{now}": now})

        # Set expiry on key
        pipe.expire(key, config.window_seconds)

        results = await pipe.execute()
        current_count = results[1]

        # Calculate reset time (when oldest entry expires)
        reset_at = int(now + config.window_seconds)

        if current_count >= config.requests:
            # Rate limit exceeded
            retry_after = config.window_seconds

            # Get oldest entry to calculate more accurate retry_after
            oldest = await redis.zrange(key, 0, 0, withscores=True)
            if oldest:
                oldest_time = oldest[0][1]
                retry_after = max(1, int(oldest_time + config.window_seconds - now))

            logger.warning(
                "Rate limit exceeded",
                extra={
                    "identifier": identifier,
                    "limit_type": limit_type.value,
                    "count": current_count,
                    "limit": config.requests,
                },
            )

            return RateLimitResult(
                allowed=False,
                limit=config.requests,
                remaining=0,
                reset_at=reset_at,
                retry_after=retry_after,
            )

        remaining = max(0, config.requests - current_count - 1)

        return RateLimitResult(
            allowed=True,
            limit=config.requests,
            remaining=remaining,
            reset_at=reset_at,
        )

    async def reset_rate_limit(self, identifier: str, limit_type: RateLimitType) -> None:
        """Reset rate limit counter for an identifier."""
        redis = await get_redis_client()
        key = _rate_limit_key(identifier, limit_type)
        await redis.delete(key)

    async def get_rate_limit_status(
        self,
        identifier: str,
        limit_type: RateLimitType,
    ) -> RateLimitResult:
        """Get current rate limit status without incrementing counter."""
        redis = await get_redis_client()
        default_limits = get_rate_limits()
        config = self._limits.get(limit_type, default_limits[RateLimitType.API])

        key = _rate_limit_key(identifier, limit_type)
        now = time.time()
        window_start = now - config.window_seconds

        # Remove old entries and count
        await redis.zremrangebyscore(key, 0, window_start)
        current_count = await redis.zcard(key)

        reset_at = int(now + config.window_seconds)
        remaining = max(0, config.requests - current_count)

        return RateLimitResult(
            allowed=current_count < config.requests,
            limit=config.requests,
            remaining=remaining,
            reset_at=reset_at,
        )


# Convenience functions for common rate limit checks


async def check_auth_rate_limit(ip_address: str) -> RateLimitResult:
    """Check rate limit for authentication endpoints."""
    service = RateLimitService()
    return await service.check_rate_limit(ip_address, RateLimitType.AUTH)


async def check_api_rate_limit(identifier: str) -> RateLimitResult:
    """Check rate limit for general API endpoints."""
    service = RateLimitService()
    return await service.check_rate_limit(identifier, RateLimitType.API)


async def check_upload_rate_limit(user_id: str) -> RateLimitResult:
    """Check rate limit for upload endpoints."""
    service = RateLimitService()
    return await service.check_rate_limit(user_id, RateLimitType.UPLOAD)
