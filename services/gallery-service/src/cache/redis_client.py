"""
Redis client for Gallery Microservice with circuit breaker.

Provides 3-tier caching for 50K concurrent users:
- L1: Gallery metadata (5 min TTL)
- L2: Gallery assets (2 min TTL)
- L3: Proofing state (30 sec TTL - real-time)

Features:
- Circuit breaker for resilience
- Graceful fallback to direct DB queries
- Pub/Sub for real-time proofing updates
"""

from __future__ import annotations

import json
import asyncio
from datetime import datetime, timezone
from typing import Any, Optional, Callable, TypeVar
from functools import wraps
from enum import Enum

import redis.asyncio as redis

from src.config import settings
from src.logging import get_logger

logger = get_logger(__name__)

T = TypeVar("T")


class CircuitState(Enum):
    """Circuit breaker states."""
    CLOSED = "closed"      # Normal operation
    OPEN = "open"          # Failures detected, fast-fail
    HALF_OPEN = "half_open"  # Testing recovery


class CircuitBreaker:
    """Circuit breaker for Redis operations.

    Prevents cascading failures by fast-failing when Redis is unhealthy.
    """

    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: int = 30,
    ):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.failure_count = 0
        self.last_failure_time: Optional[datetime] = None
        self.state = CircuitState.CLOSED

    def record_success(self):
        """Record a successful operation."""
        self.failure_count = 0
        self.state = CircuitState.CLOSED

    def record_failure(self):
        """Record a failed operation."""
        self.failure_count += 1
        self.last_failure_time = datetime.now(timezone.utc)

        if self.failure_count >= self.failure_threshold:
            self.state = CircuitState.OPEN
            logger.warning(
                "Circuit breaker OPEN",
                extra={"failures": self.failure_count}
            )

    def can_execute(self) -> bool:
        """Check if operation can proceed."""
        if self.state == CircuitState.CLOSED:
            return True

        if self.state == CircuitState.OPEN:
            if self.last_failure_time:
                elapsed = (datetime.now(timezone.utc) - self.last_failure_time).seconds
                if elapsed >= self.recovery_timeout:
                    self.state = CircuitState.HALF_OPEN
                    logger.info("Circuit breaker HALF_OPEN - testing recovery")
                    return True
            return False

        # HALF_OPEN - allow one test request
        return True

    def get_state(self) -> dict:
        """Get circuit breaker state for monitoring."""
        return {
            "state": self.state.value,
            "failure_count": self.failure_count,
            "last_failure": self.last_failure_time.isoformat() if self.last_failure_time else None,
        }


class RedisClient:
    """Async Redis client with circuit breaker and pub/sub support."""

    def __init__(self):
        self._client: Optional[redis.Redis] = None
        self._pubsub: Optional[redis.client.PubSub] = None
        self._circuit_breaker = CircuitBreaker(
            failure_threshold=settings.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
            recovery_timeout=settings.CIRCUIT_BREAKER_RECOVERY_TIMEOUT,
        )

    async def connect(self):
        """Connect to Redis."""
        if self._client is None:
            self._client = redis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
                max_connections=settings.REDIS_MAX_CONNECTIONS,
            )
            logger.info("Connected to Redis")

    async def disconnect(self):
        """Disconnect from Redis."""
        if self._pubsub:
            await self._pubsub.close()
            self._pubsub = None
        if self._client:
            await self._client.close()
            self._client = None
            logger.info("Disconnected from Redis")

    async def ping(self) -> bool:
        """Check Redis connection."""
        if not self._circuit_breaker.can_execute():
            return False
        try:
            if self._client:
                await self._client.ping()
                self._circuit_breaker.record_success()
                return True
        except Exception as e:
            self._circuit_breaker.record_failure()
            logger.warning(f"Redis ping failed: {e}")
        return False

    async def get(self, key: str) -> Optional[str]:
        """Get a value from cache."""
        if not self._circuit_breaker.can_execute():
            return None
        if not self._client:
            return None
        try:
            result = await self._client.get(key)
            self._circuit_breaker.record_success()
            return result
        except Exception as e:
            self._circuit_breaker.record_failure()
            logger.warning(f"Redis GET error: {e}")
            return None

    async def set(
        self,
        key: str,
        value: str,
        ttl: int = 300,
    ) -> bool:
        """Set a value in cache with TTL."""
        if not self._circuit_breaker.can_execute():
            return False
        if not self._client:
            return False
        try:
            await self._client.setex(key, ttl, value)
            self._circuit_breaker.record_success()
            return True
        except Exception as e:
            self._circuit_breaker.record_failure()
            logger.warning(f"Redis SET error: {e}")
            return False

    async def delete(self, key: str) -> bool:
        """Delete a key from cache."""
        if not self._circuit_breaker.can_execute():
            return False
        if not self._client:
            return False
        try:
            await self._client.delete(key)
            self._circuit_breaker.record_success()
            return True
        except Exception as e:
            self._circuit_breaker.record_failure()
            logger.warning(f"Redis DELETE error: {e}")
            return False

    async def delete_pattern(self, pattern: str) -> int:
        """Delete all keys matching a pattern."""
        if not self._circuit_breaker.can_execute():
            return 0
        if not self._client:
            return 0
        try:
            keys = []
            async for key in self._client.scan_iter(match=pattern):
                keys.append(key)
            if keys:
                result = await self._client.delete(*keys)
                self._circuit_breaker.record_success()
                return result
            return 0
        except Exception as e:
            self._circuit_breaker.record_failure()
            logger.warning(f"Redis DELETE_PATTERN error: {e}")
            return 0

    async def get_json(self, key: str) -> Optional[Any]:
        """Get and deserialize JSON from cache."""
        value = await self.get(key)
        if value:
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                pass
        return None

    async def set_json(
        self,
        key: str,
        value: Any,
        ttl: int = 300,
    ) -> bool:
        """Serialize and cache JSON."""
        try:
            json_str = json.dumps(value, default=str)
            return await self.set(key, json_str, ttl)
        except Exception as e:
            logger.warning(f"Redis SET_JSON error: {e}")
            return False

    async def incr(self, key: str, ttl: int = None) -> int:
        """Increment a counter."""
        if not self._circuit_breaker.can_execute():
            return 0
        if not self._client:
            return 0
        try:
            value = await self._client.incr(key)
            if ttl and value == 1:
                await self._client.expire(key, ttl)
            self._circuit_breaker.record_success()
            return value
        except Exception as e:
            self._circuit_breaker.record_failure()
            logger.warning(f"Redis INCR error: {e}")
            return 0

    # =========================================================================
    # Pub/Sub for Real-time Proofing Updates
    # =========================================================================

    async def publish(self, channel: str, message: dict) -> bool:
        """Publish a message to a channel."""
        if not self._circuit_breaker.can_execute():
            return False
        if not self._client:
            return False
        try:
            await self._client.publish(channel, json.dumps(message, default=str))
            self._circuit_breaker.record_success()
            return True
        except Exception as e:
            self._circuit_breaker.record_failure()
            logger.warning(f"Redis PUBLISH error: {e}")
            return False

    async def subscribe(self, channel: str) -> Optional[redis.client.PubSub]:
        """Subscribe to a channel for real-time updates."""
        if not self._circuit_breaker.can_execute():
            return None
        if not self._client:
            return None
        try:
            pubsub = self._client.pubsub()
            await pubsub.subscribe(channel)
            self._circuit_breaker.record_success()
            return pubsub
        except Exception as e:
            self._circuit_breaker.record_failure()
            logger.warning(f"Redis SUBSCRIBE error: {e}")
            return None

    def get_circuit_state(self) -> dict:
        """Get circuit breaker state for health checks."""
        return self._circuit_breaker.get_state()


# Singleton instance
redis_client = RedisClient()


# =========================================================================
# Cache Decorator
# =========================================================================


def cache_response(
    key_template: str,
    ttl: int = 300,
):
    """
    Decorator to cache function responses.

    Args:
        key_template: Cache key template with placeholders, e.g. "gallery:{gallery_id}"
        ttl: Time to live in seconds
    """
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> T:
            # Build cache key from kwargs
            key = key_template.format(**kwargs)

            # Try to get from cache
            cached = await redis_client.get_json(key)
            if cached is not None:
                logger.debug(f"Cache HIT: {key}")
                return cached

            # Call function
            result = await func(*args, **kwargs)

            # Store in cache
            if result is not None:
                await redis_client.set_json(key, result, ttl)
                logger.debug(f"Cache SET: {key}")

            return result
        return wrapper
    return decorator


# =========================================================================
# Cache Invalidation Helpers
# =========================================================================


async def invalidate_gallery_cache(gallery_id: str):
    """Invalidate all caches for a gallery."""
    await redis_client.delete(f"gallery:{gallery_id}")
    await redis_client.delete(f"gallery:public:{gallery_id}")
    await redis_client.delete_pattern(f"gallery:assets:{gallery_id}:*")
    await redis_client.delete_pattern(f"gallery:subgalleries:{gallery_id}:*")
    logger.debug(f"Invalidated cache for gallery {gallery_id}")


async def invalidate_proofing_cache(gallery_id: str, asset_id: str = None):
    """Invalidate proofing-related caches."""
    if asset_id:
        await redis_client.delete(f"proofing:{gallery_id}:{asset_id}")
    else:
        await redis_client.delete_pattern(f"proofing:{gallery_id}:*")
    logger.debug(f"Invalidated proofing cache for gallery {gallery_id}")


async def invalidate_magic_link_cache(token: str):
    """Invalidate magic link cache."""
    await redis_client.delete(f"magic_link:{token}")


# =========================================================================
# Cache Key Builders
# =========================================================================


def build_gallery_cache_key(gallery_id: str) -> str:
    """Build cache key for gallery metadata."""
    return f"gallery:{gallery_id}"


def build_public_gallery_cache_key(gallery_id: str) -> str:
    """Build cache key for public gallery metadata."""
    return f"gallery:public:{gallery_id}"


def build_assets_cache_key(gallery_id: str, page: int, limit: int) -> str:
    """Build cache key for gallery assets."""
    return f"gallery:assets:{gallery_id}:{page}:{limit}"


def build_proofing_cache_key(gallery_id: str, asset_id: str) -> str:
    """Build cache key for proofing state."""
    return f"proofing:{gallery_id}:{asset_id}"


def build_magic_link_cache_key(token: str) -> str:
    """Build cache key for magic link validation."""
    return f"magic_link:{token}"
