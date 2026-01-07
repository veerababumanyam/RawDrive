"""
Redis client for Notifications & Communication Microservice.

Provides caching, queue management, and pub/sub for:
- User notification preferences (5 min TTL)
- Compiled email templates (10 min TTL)
- Delivery status tracking (2 min TTL)
- Rate limit counters (1 min TTL)
- Dead letter queue for failed notifications

Features:
- Circuit breaker for resilience (fails gracefully)
- Graceful fallback to direct DB queries when Redis unavailable
- Pub/Sub for real-time notification updates
- Queue operations for background notification processing
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from enum import Enum
from functools import wraps
from typing import Any, Callable, List, Optional, TypeVar

import redis.asyncio as redis

from src.config import settings

logger = logging.getLogger(__name__)

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

    def record_success(self) -> None:
        """Record a successful operation."""
        self.failure_count = 0
        self.state = CircuitState.CLOSED

    def record_failure(self) -> None:
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
    """Async Redis client with circuit breaker and queue support.

    Provides graceful degradation when Redis is unavailable.
    Service continues to function (without caching) if Redis fails.
    """

    def __init__(self):
        self._client: Optional[redis.Redis] = None
        self._pubsub: Optional[redis.client.PubSub] = None
        self._circuit_breaker = CircuitBreaker(
            failure_threshold=settings.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
            recovery_timeout=settings.CIRCUIT_BREAKER_RECOVERY_TIMEOUT,
        )
        self._key_prefix = settings.REDIS_KEY_PREFIX

    async def connect(self) -> None:
        """Connect to Redis."""
        if self._client is None:
            try:
                self._client = redis.from_url(
                    settings.REDIS_URL,
                    encoding="utf-8",
                    decode_responses=True,
                    max_connections=settings.REDIS_MAX_CONNECTIONS,
                )
                # Test connection
                await self._client.ping()
                logger.info("Connected to Redis")
            except Exception as e:
                logger.warning(f"Redis connection failed: {e}. Service will run without caching.")
                self._client = None

    async def disconnect(self) -> None:
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

    def _prefixed_key(self, key: str) -> str:
        """Add service prefix to cache key."""
        if key.startswith(self._key_prefix):
            return key
        return f"{self._key_prefix}{key}"

    # =========================================================================
    # Basic Cache Operations
    # =========================================================================

    async def get(self, key: str) -> Optional[str]:
        """Get a value from cache."""
        if not self._circuit_breaker.can_execute():
            return None
        if not self._client:
            return None
        try:
            result = await self._client.get(self._prefixed_key(key))
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
            await self._client.setex(self._prefixed_key(key), ttl, value)
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
            await self._client.delete(self._prefixed_key(key))
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
            prefixed_pattern = self._prefixed_key(pattern)
            keys = []
            async for key in self._client.scan_iter(match=prefixed_pattern):
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

    async def exists(self, key: str) -> bool:
        """Check if key exists."""
        if not self._circuit_breaker.can_execute():
            return False
        if not self._client:
            return False
        try:
            result = await self._client.exists(self._prefixed_key(key))
            self._circuit_breaker.record_success()
            return result > 0
        except Exception as e:
            self._circuit_breaker.record_failure()
            logger.warning(f"Redis EXISTS error: {e}")
            return False

    async def expire(self, key: str, seconds: int) -> bool:
        """Set expiration on key."""
        if not self._circuit_breaker.can_execute():
            return False
        if not self._client:
            return False
        try:
            result = await self._client.expire(self._prefixed_key(key), seconds)
            self._circuit_breaker.record_success()
            return result
        except Exception as e:
            self._circuit_breaker.record_failure()
            logger.warning(f"Redis EXPIRE error: {e}")
            return False

    # =========================================================================
    # JSON Operations
    # =========================================================================

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

    # =========================================================================
    # Counter Operations (for rate limiting and metrics)
    # =========================================================================

    async def incr(self, key: str, ttl: Optional[int] = None) -> int:
        """Increment a counter."""
        if not self._circuit_breaker.can_execute():
            return 0
        if not self._client:
            return 0
        try:
            prefixed_key = self._prefixed_key(key)
            value = await self._client.incr(prefixed_key)
            if ttl and value == 1:
                await self._client.expire(prefixed_key, ttl)
            self._circuit_breaker.record_success()
            return value
        except Exception as e:
            self._circuit_breaker.record_failure()
            logger.warning(f"Redis INCR error: {e}")
            return 0

    async def decr(self, key: str) -> int:
        """Decrement a counter."""
        if not self._circuit_breaker.can_execute():
            return 0
        if not self._client:
            return 0
        try:
            value = await self._client.decr(self._prefixed_key(key))
            self._circuit_breaker.record_success()
            return value
        except Exception as e:
            self._circuit_breaker.record_failure()
            logger.warning(f"Redis DECR error: {e}")
            return 0

    # =========================================================================
    # List Operations (for notification queues)
    # =========================================================================

    async def lpush(self, key: str, *values: str) -> int:
        """Push values to left (head) of list."""
        if not self._circuit_breaker.can_execute():
            return 0
        if not self._client or not values:
            return 0
        try:
            result = await self._client.lpush(self._prefixed_key(key), *values)
            self._circuit_breaker.record_success()
            return result
        except Exception as e:
            self._circuit_breaker.record_failure()
            logger.warning(f"Redis LPUSH error: {e}")
            return 0

    async def rpush(self, key: str, *values: str) -> int:
        """Push values to right (tail) of list."""
        if not self._circuit_breaker.can_execute():
            return 0
        if not self._client or not values:
            return 0
        try:
            result = await self._client.rpush(self._prefixed_key(key), *values)
            self._circuit_breaker.record_success()
            return result
        except Exception as e:
            self._circuit_breaker.record_failure()
            logger.warning(f"Redis RPUSH error: {e}")
            return 0

    async def lpop(self, key: str, count: int = 1) -> Optional[List[str]]:
        """Pop values from left (head) of list."""
        if not self._circuit_breaker.can_execute():
            return None
        if not self._client:
            return None
        try:
            result = await self._client.lpop(self._prefixed_key(key), count)
            self._circuit_breaker.record_success()
            if result is None:
                return None
            return result if isinstance(result, list) else [result]
        except Exception as e:
            self._circuit_breaker.record_failure()
            logger.warning(f"Redis LPOP error: {e}")
            return None

    async def rpop(self, key: str, count: int = 1) -> Optional[List[str]]:
        """Pop values from right (tail) of list."""
        if not self._circuit_breaker.can_execute():
            return None
        if not self._client:
            return None
        try:
            result = await self._client.rpop(self._prefixed_key(key), count)
            self._circuit_breaker.record_success()
            if result is None:
                return None
            return result if isinstance(result, list) else [result]
        except Exception as e:
            self._circuit_breaker.record_failure()
            logger.warning(f"Redis RPOP error: {e}")
            return None

    async def lrange(self, key: str, start: int, stop: int) -> List[str]:
        """Get range of elements from list."""
        if not self._circuit_breaker.can_execute():
            return []
        if not self._client:
            return []
        try:
            result = await self._client.lrange(self._prefixed_key(key), start, stop)
            self._circuit_breaker.record_success()
            return result
        except Exception as e:
            self._circuit_breaker.record_failure()
            logger.warning(f"Redis LRANGE error: {e}")
            return []

    async def llen(self, key: str) -> int:
        """Get length of list."""
        if not self._circuit_breaker.can_execute():
            return 0
        if not self._client:
            return 0
        try:
            result = await self._client.llen(self._prefixed_key(key))
            self._circuit_breaker.record_success()
            return result
        except Exception as e:
            self._circuit_breaker.record_failure()
            logger.warning(f"Redis LLEN error: {e}")
            return 0

    async def ltrim(self, key: str, start: int, stop: int) -> bool:
        """Trim list to specified range."""
        if not self._circuit_breaker.can_execute():
            return False
        if not self._client:
            return False
        try:
            await self._client.ltrim(self._prefixed_key(key), start, stop)
            self._circuit_breaker.record_success()
            return True
        except Exception as e:
            self._circuit_breaker.record_failure()
            logger.warning(f"Redis LTRIM error: {e}")
            return False

    async def lrem(self, key: str, count: int, value: str) -> int:
        """Remove elements from list.

        Args:
            key: List key
            count: Number of elements to remove (0 = all, positive = from head, negative = from tail)
            value: Value to remove

        Returns:
            Number of removed elements
        """
        if not self._circuit_breaker.can_execute():
            return 0
        if not self._client:
            return 0
        try:
            result = await self._client.lrem(self._prefixed_key(key), count, value)
            self._circuit_breaker.record_success()
            return result
        except Exception as e:
            self._circuit_breaker.record_failure()
            logger.warning(f"Redis LREM error: {e}")
            return 0

    # =========================================================================
    # Sorted Set Operations (for priority queues)
    # =========================================================================

    async def zadd(self, key: str, mapping: dict[str, float]) -> int:
        """Add members to a sorted set with scores.

        Args:
            key: Sorted set key
            mapping: Dict of {member: score}

        Returns:
            Number of elements added
        """
        if not self._circuit_breaker.can_execute():
            return 0
        if not self._client or not mapping:
            return 0
        try:
            result = await self._client.zadd(self._prefixed_key(key), mapping)
            self._circuit_breaker.record_success()
            return result
        except Exception as e:
            self._circuit_breaker.record_failure()
            logger.warning(f"Redis ZADD error: {e}")
            return 0

    async def zrem(self, key: str, *members: str) -> int:
        """Remove members from a sorted set.

        Args:
            key: Sorted set key
            members: Members to remove

        Returns:
            Number of members removed
        """
        if not self._circuit_breaker.can_execute():
            return 0
        if not self._client or not members:
            return 0
        try:
            result = await self._client.zrem(self._prefixed_key(key), *members)
            self._circuit_breaker.record_success()
            return result
        except Exception as e:
            self._circuit_breaker.record_failure()
            logger.warning(f"Redis ZREM error: {e}")
            return 0

    async def zpopmin(self, key: str, count: int = 1) -> List[tuple]:
        """Remove and return members with lowest scores.

        Args:
            key: Sorted set key
            count: Number of members to pop

        Returns:
            List of (member, score) tuples
        """
        if not self._circuit_breaker.can_execute():
            return []
        if not self._client:
            return []
        try:
            result = await self._client.zpopmin(self._prefixed_key(key), count)
            self._circuit_breaker.record_success()
            return result if result else []
        except Exception as e:
            self._circuit_breaker.record_failure()
            logger.warning(f"Redis ZPOPMIN error: {e}")
            return []

    async def zrangebyscore(
        self,
        key: str,
        min_score: float | str,
        max_score: float | str,
        start: int = 0,
        num: Optional[int] = None,
    ) -> List[str]:
        """Get members by score range.

        Args:
            key: Sorted set key
            min_score: Minimum score (or '-inf')
            max_score: Maximum score (or '+inf')
            start: Offset for pagination
            num: Limit for pagination

        Returns:
            List of members
        """
        if not self._circuit_breaker.can_execute():
            return []
        if not self._client:
            return []
        try:
            if num is not None:
                result = await self._client.zrangebyscore(
                    self._prefixed_key(key),
                    min_score,
                    max_score,
                    start=start,
                    num=num,
                )
            else:
                result = await self._client.zrangebyscore(
                    self._prefixed_key(key),
                    min_score,
                    max_score,
                )
            self._circuit_breaker.record_success()
            return result if result else []
        except Exception as e:
            self._circuit_breaker.record_failure()
            logger.warning(f"Redis ZRANGEBYSCORE error: {e}")
            return []

    async def zcard(self, key: str) -> int:
        """Get the number of members in a sorted set.

        Args:
            key: Sorted set key

        Returns:
            Number of members
        """
        if not self._circuit_breaker.can_execute():
            return 0
        if not self._client:
            return 0
        try:
            result = await self._client.zcard(self._prefixed_key(key))
            self._circuit_breaker.record_success()
            return result
        except Exception as e:
            self._circuit_breaker.record_failure()
            logger.warning(f"Redis ZCARD error: {e}")
            return 0

    # =========================================================================
    # Set Operations (for processing tracking)
    # =========================================================================

    async def sadd(self, key: str, *members: str) -> int:
        """Add members to a set.

        Args:
            key: Set key
            members: Members to add

        Returns:
            Number of members added
        """
        if not self._circuit_breaker.can_execute():
            return 0
        if not self._client or not members:
            return 0
        try:
            result = await self._client.sadd(self._prefixed_key(key), *members)
            self._circuit_breaker.record_success()
            return result
        except Exception as e:
            self._circuit_breaker.record_failure()
            logger.warning(f"Redis SADD error: {e}")
            return 0

    async def srem(self, key: str, *members: str) -> int:
        """Remove members from a set.

        Args:
            key: Set key
            members: Members to remove

        Returns:
            Number of members removed
        """
        if not self._circuit_breaker.can_execute():
            return 0
        if not self._client or not members:
            return 0
        try:
            result = await self._client.srem(self._prefixed_key(key), *members)
            self._circuit_breaker.record_success()
            return result
        except Exception as e:
            self._circuit_breaker.record_failure()
            logger.warning(f"Redis SREM error: {e}")
            return 0

    async def scard(self, key: str) -> int:
        """Get the number of members in a set.

        Args:
            key: Set key

        Returns:
            Number of members
        """
        if not self._circuit_breaker.can_execute():
            return 0
        if not self._client:
            return 0
        try:
            result = await self._client.scard(self._prefixed_key(key))
            self._circuit_breaker.record_success()
            return result
        except Exception as e:
            self._circuit_breaker.record_failure()
            logger.warning(f"Redis SCARD error: {e}")
            return 0

    async def sismember(self, key: str, member: str) -> bool:
        """Check if a member exists in a set.

        Args:
            key: Set key
            member: Member to check

        Returns:
            True if member exists
        """
        if not self._circuit_breaker.can_execute():
            return False
        if not self._client:
            return False
        try:
            result = await self._client.sismember(self._prefixed_key(key), member)
            self._circuit_breaker.record_success()
            return bool(result)
        except Exception as e:
            self._circuit_breaker.record_failure()
            logger.warning(f"Redis SISMEMBER error: {e}")
            return False

    async def smembers(self, key: str) -> set:
        """Get all members of a set.

        Args:
            key: Set key

        Returns:
            Set of members
        """
        if not self._circuit_breaker.can_execute():
            return set()
        if not self._client:
            return set()
        try:
            result = await self._client.smembers(self._prefixed_key(key))
            self._circuit_breaker.record_success()
            return result if result else set()
        except Exception as e:
            self._circuit_breaker.record_failure()
            logger.warning(f"Redis SMEMBERS error: {e}")
            return set()

    # =========================================================================
    # Pub/Sub for Real-time Notification Updates
    # =========================================================================

    async def publish(self, channel: str, message: dict) -> bool:
        """Publish a message to a channel."""
        if not self._circuit_breaker.can_execute():
            return False
        if not self._client:
            return False
        try:
            prefixed_channel = self._prefixed_key(channel)
            await self._client.publish(prefixed_channel, json.dumps(message, default=str))
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
            await pubsub.subscribe(self._prefixed_key(channel))
            self._circuit_breaker.record_success()
            return pubsub
        except Exception as e:
            self._circuit_breaker.record_failure()
            logger.warning(f"Redis SUBSCRIBE error: {e}")
            return None

    # =========================================================================
    # Hash Operations (for storing structured notification data)
    # =========================================================================

    async def hset(self, key: str, mapping: dict) -> bool:
        """Set multiple hash fields."""
        if not self._circuit_breaker.can_execute():
            return False
        if not self._client or not mapping:
            return False
        try:
            await self._client.hset(self._prefixed_key(key), mapping=mapping)
            self._circuit_breaker.record_success()
            return True
        except Exception as e:
            self._circuit_breaker.record_failure()
            logger.warning(f"Redis HSET error: {e}")
            return False

    async def hget(self, key: str, field: str) -> Optional[str]:
        """Get hash field value."""
        if not self._circuit_breaker.can_execute():
            return None
        if not self._client:
            return None
        try:
            result = await self._client.hget(self._prefixed_key(key), field)
            self._circuit_breaker.record_success()
            return result
        except Exception as e:
            self._circuit_breaker.record_failure()
            logger.warning(f"Redis HGET error: {e}")
            return None

    async def hgetall(self, key: str) -> dict:
        """Get all hash fields and values."""
        if not self._circuit_breaker.can_execute():
            return {}
        if not self._client:
            return {}
        try:
            result = await self._client.hgetall(self._prefixed_key(key))
            self._circuit_breaker.record_success()
            return result
        except Exception as e:
            self._circuit_breaker.record_failure()
            logger.warning(f"Redis HGETALL error: {e}")
            return {}

    async def hdel(self, key: str, *fields: str) -> int:
        """Delete hash fields."""
        if not self._circuit_breaker.can_execute():
            return 0
        if not self._client or not fields:
            return 0
        try:
            result = await self._client.hdel(self._prefixed_key(key), *fields)
            self._circuit_breaker.record_success()
            return result
        except Exception as e:
            self._circuit_breaker.record_failure()
            logger.warning(f"Redis HDEL error: {e}")
            return 0

    # =========================================================================
    # Health & Monitoring
    # =========================================================================

    def get_circuit_state(self) -> dict:
        """Get circuit breaker state for health checks."""
        return self._circuit_breaker.get_state()

    def is_connected(self) -> bool:
        """Check if client is connected (non-async check)."""
        return self._client is not None


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
        key_template: Cache key template with placeholders, e.g. "preferences:{user_id}"
        ttl: Time to live in seconds

    Example:
        @cache_response("preferences:{user_id}", ttl=300)
        async def get_user_preferences(user_id: str) -> dict:
            ...
    """
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> T:
            # Build cache key from kwargs
            try:
                key = key_template.format(**kwargs)
            except KeyError:
                # If we can't build the key, just call the function
                return await func(*args, **kwargs)

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


async def invalidate_preferences_cache(user_id: str, workspace_id: str = None) -> None:
    """Invalidate notification preferences cache for a user."""
    await redis_client.delete(f"preferences:{user_id}")
    if workspace_id:
        await redis_client.delete(f"preferences:{workspace_id}:{user_id}")
    logger.debug(f"Invalidated preferences cache for user {user_id}")


async def invalidate_template_cache(template_id: str = None, workspace_id: str = None) -> None:
    """Invalidate template cache."""
    if template_id:
        await redis_client.delete(f"template:{template_id}")
    if workspace_id:
        await redis_client.delete_pattern(f"template:{workspace_id}:*")
    if not template_id and not workspace_id:
        await redis_client.delete_pattern("template:*")
    logger.debug(f"Invalidated template cache")


async def invalidate_delivery_cache(notification_id: str) -> None:
    """Invalidate delivery status cache for a notification."""
    await redis_client.delete(f"delivery:{notification_id}")
    logger.debug(f"Invalidated delivery cache for notification {notification_id}")


# =========================================================================
# Cache Key Builders
# =========================================================================


def build_preferences_cache_key(user_id: str, workspace_id: str = None) -> str:
    """Build cache key for user notification preferences."""
    if workspace_id:
        return f"preferences:{workspace_id}:{user_id}"
    return f"preferences:{user_id}"


def build_template_cache_key(template_id: str) -> str:
    """Build cache key for compiled template."""
    return f"template:{template_id}"


def build_template_list_cache_key(workspace_id: str, category: str = None) -> str:
    """Build cache key for template list."""
    if category:
        return f"templates:{workspace_id}:{category}"
    return f"templates:{workspace_id}"


def build_delivery_cache_key(notification_id: str) -> str:
    """Build cache key for delivery status."""
    return f"delivery:{notification_id}"


def build_rate_limit_key(identifier: str, action: str) -> str:
    """Build cache key for rate limiting."""
    return f"ratelimit:{action}:{identifier}"


def build_digest_queue_key(user_id: str) -> str:
    """Build cache key for user's digest queue."""
    return f"digest:{user_id}"


def build_dead_letter_queue_key() -> str:
    """Build cache key for dead letter queue."""
    return "queue:dead_letter"


def build_pending_queue_key() -> str:
    """Build cache key for pending notification queue."""
    return "queue:pending"


def build_processing_queue_key() -> str:
    """Build cache key for processing notification queue."""
    return "queue:processing"
