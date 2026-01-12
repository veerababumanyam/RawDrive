"""
Redis client for caching.

Provides 3-tier caching:
- L1: Public invitation pages (5 min TTL)
- L2: Guest list queries (1 min TTL)
- L3: Analytics aggregations (10 min TTL)
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional
from functools import wraps

import redis.asyncio as redis

from src.config import settings

logger = logging.getLogger(__name__)


class RedisClient:
    """Async Redis client wrapper."""
    
    def __init__(self):
        self._client: Optional[redis.Redis] = None
    
    async def connect(self):
        """Connect to Redis."""
        if self._client is None:
            self._client = redis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
            )
            logger.info("Connected to Redis")
    
    async def disconnect(self):
        """Disconnect from Redis."""
        if self._client:
            await self._client.close()
            self._client = None
            logger.info("Disconnected from Redis")
    
    async def ping(self) -> bool:
        """Check Redis connection."""
        try:
            if self._client:
                await self._client.ping()
                return True
        except Exception:
            pass
        return False
    
    async def get(self, key: str) -> Optional[str]:
        """Get a value from cache."""
        if not self._client:
            return None
        try:
            return await self._client.get(key)
        except Exception as e:
            logger.warning(f"Redis GET error: {e}")
            return None
    
    async def set(
        self,
        key: str,
        value: str,
        ttl: int = 300,
    ) -> bool:
        """Set a value in cache with TTL."""
        if not self._client:
            return False
        try:
            await self._client.setex(key, ttl, value)
            return True
        except Exception as e:
            logger.warning(f"Redis SET error: {e}")
            return False
    
    async def delete(self, key: str) -> bool:
        """Delete a key from cache."""
        if not self._client:
            return False
        try:
            await self._client.delete(key)
            return True
        except Exception as e:
            logger.warning(f"Redis DELETE error: {e}")
            return False
    
    async def delete_pattern(self, pattern: str) -> int:
        """Delete all keys matching a pattern."""
        if not self._client:
            return 0
        try:
            keys = []
            async for key in self._client.scan_iter(match=pattern):
                keys.append(key)
            if keys:
                return await self._client.delete(*keys)
            return 0
        except Exception as e:
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
        if not self._client:
            return 0
        try:
            value = await self._client.incr(key)
            if ttl and value == 1:
                await self._client.expire(key, ttl)
            return value
        except Exception as e:
            logger.warning(f"Redis INCR error: {e}")
            return 0
    
    # Additional methods for draft service and other features
    async def setex(self, key: str, ttl: int, value: str) -> bool:
        """Set key with expiration time."""
        return await self.set(key, value, ttl)
    
    async def scard(self, key: str) -> int:
        """Get set cardinality (number of members)."""
        if not self._client:
            return 0
        try:
            return await self._client.scard(key)
        except Exception as e:
            logger.warning(f"Redis SCARD error: {e}")
            return 0
    
    async def sadd(self, key: str, *values: str) -> int:
        """Add members to a set."""
        if not self._client:
            return 0
        try:
            return await self._client.sadd(key, *values)
        except Exception as e:
            logger.warning(f"Redis SADD error: {e}")
            return 0
    
    async def srem(self, key: str, *values: str) -> int:
        """Remove members from a set."""
        if not self._client:
            return 0
        try:
            return await self._client.srem(key, *values)
        except Exception as e:
            logger.warning(f"Redis SREM error: {e}")
            return 0
    
    async def smembers(self, key: str) -> set[str]:
        """Get all members of a set."""
        if not self._client:
            return set()
        try:
            return await self._client.smembers(key)
        except Exception as e:
            logger.warning(f"Redis SMEMBERS error: {e}")
            return set()
    
    async def expire(self, key: str, ttl: int) -> bool:
        """Set expiration time for a key."""
        if not self._client:
            return False
        try:
            return await self._client.expire(key, ttl)
        except Exception as e:
            logger.warning(f"Redis EXPIRE error: {e}")
            return False
    
    async def exists(self, key: str) -> bool:
        """Check if key exists."""
        if not self._client:
            return False
        try:
            return bool(await self._client.exists(key))
        except Exception as e:
            logger.warning(f"Redis EXISTS error: {e}")
            return False
    
    # Sorted Set operations (for task queue)
    async def zadd(self, key: str, mapping: dict[str, float]) -> int:
        """Add members to sorted set with scores."""
        if not self._client:
            return 0
        try:
            return await self._client.zadd(key, mapping)
        except Exception as e:
            logger.warning(f"Redis ZADD error: {e}")
            return 0
    
    async def zrangebyscore(self, key: str, min_score: str, max_score: str, start: int = 0, num: int = 1) -> list[str]:
        """Get members from sorted set by score range."""
        if not self._client:
            return []
        try:
            results = await self._client.zrangebyscore(key, min_score, max_score, start=start, num=num)
            return [r.decode() if isinstance(r, bytes) else r for r in results]
        except Exception as e:
            logger.warning(f"Redis ZRANGEBYSCORE error: {e}")
            return []
    
    async def zrem(self, key: str, *members: str) -> int:
        """Remove members from sorted set."""
        if not self._client:
            return 0
        try:
            return await self._client.zrem(key, *members)
        except Exception as e:
            logger.warning(f"Redis ZREM error: {e}")
            return 0
    
    async def zcard(self, key: str) -> int:
        """Get sorted set cardinality."""
        if not self._client:
            return 0
        try:
            return await self._client.zcard(key)
        except Exception as e:
            logger.warning(f"Redis ZCARD error: {e}")
            return 0
    
    # List operations
    async def lpush(self, key: str, *values: str) -> int:
        """Push values to left of list."""
        if not self._client:
            return 0
        try:
            return await self._client.lpush(key, *values)
        except Exception as e:
            logger.warning(f"Redis LPUSH error: {e}")
            return 0
    
    async def rpush(self, key: str, *values: str) -> int:
        """Push values to right of list."""
        if not self._client:
            return 0
        try:
            return await self._client.rpush(key, *values)
        except Exception as e:
            logger.warning(f"Redis RPUSH error: {e}")
            return 0
    
    async def lrange(self, key: str, start: int, end: int) -> list[str]:
        """Get range of elements from list."""
        if not self._client:
            return []
        try:
            results = await self._client.lrange(key, start, end)
            return [r.decode() if isinstance(r, bytes) else r for r in results]
        except Exception as e:
            logger.warning(f"Redis LRANGE error: {e}")
            return []
    
    async def llen(self, key: str) -> int:
        """Get list length."""
        if not self._client:
            return 0
        try:
            return await self._client.llen(key)
        except Exception as e:
            logger.warning(f"Redis LLEN error: {e}")
            return 0
    
    async def lrem(self, key: str, count: int, value: str) -> int:
        """Remove elements from list."""
        if not self._client:
            return 0
        try:
            return await self._client.lrem(key, count, value)
        except Exception as e:
            logger.warning(f"Redis LREM error: {e}")
            return 0
    
    @property
    def client(self):
        """Access underlying redis client for advanced operations."""
        return self._client


# Singleton instance
redis_client = RedisClient()


# Cache decorator
def cache_response(
    key_template: str,
    ttl: int = 300,
):
    """
    Decorator to cache function responses.
    
    Args:
        key_template: Cache key template with placeholders, e.g. "invitation:{id}"
        ttl: Time to live in seconds
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
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


# Cache invalidation helper
async def invalidate_invitation_cache(invitation_id: str):
    """Invalidate all caches for an invitation."""
    await redis_client.delete(f"invitation:{invitation_id}")
    await redis_client.delete_pattern(f"guests:{invitation_id}:*")
    await redis_client.delete(f"analytics:{invitation_id}")


async def invalidate_guest_cache(invitation_id: str):
    """Invalidate guest-related caches."""
    await redis_client.delete_pattern(f"guests:{invitation_id}:*")
