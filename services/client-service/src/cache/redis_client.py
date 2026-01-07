"""
Redis client with circuit breaker pattern.

Provides graceful degradation when Redis is unavailable.
Service continues to function (without caching) if Redis fails.
"""

import redis.asyncio as redis
from typing import Optional, Any, List
import json
from datetime import timedelta

from src.config import settings


class RedisClient:
    """
    Redis client with circuit breaker for graceful degradation.

    If Redis is unavailable, the service continues to function without caching.
    All cache operations fail silently and return None/False.
    """

    def __init__(self):
        """Initialize Redis client (connection established on connect())."""
        self._client: Optional[redis.Redis] = None
        self._is_connected: bool = False

    async def connect(self) -> None:
        """
        Connect to Redis server.

        Called during application startup.
        If connection fails, service continues without caching.
        """
        try:
            self._client = await redis.from_url(
                settings.REDIS_URL,
                max_connections=settings.REDIS_MAX_CONNECTIONS,
                socket_timeout=settings.REDIS_SOCKET_TIMEOUT,
                socket_connect_timeout=settings.REDIS_SOCKET_CONNECT_TIMEOUT,
                decode_responses=True,  # Automatically decode bytes to str
            )
            # Test connection
            await self._client.ping()
            self._is_connected = True
        except Exception as e:
            self._is_connected = False
            self._client = None
            # Log warning but don't crash
            print(f"WARNING: Redis connection failed: {e}. Service will run without caching.")

    async def disconnect(self) -> None:
        """
        Disconnect from Redis server.

        Called during application shutdown.
        """
        if self._client:
            await self._client.close()
            self._client = None
            self._is_connected = False

    async def ping(self) -> bool:
        """
        Check if Redis is connected and responsive.

        Returns:
            bool: True if Redis is healthy
        """
        if not self._is_connected or not self._client:
            return False

        try:
            await self._client.ping()
            return True
        except Exception:
            self._is_connected = False
            return False

    async def get(self, key: str) -> Optional[str]:
        """
        Get value from Redis.

        Args:
            key: Cache key

        Returns:
            str | None: Cached value or None if not found or Redis unavailable
        """
        if not self._is_connected or not self._client:
            return None

        try:
            return await self._client.get(key)
        except Exception:
            self._is_connected = False
            return None

    async def set(
        self,
        key: str,
        value: str,
        ex: Optional[int] = None,
        px: Optional[int] = None,
    ) -> bool:
        """
        Set value in Redis.

        Args:
            key: Cache key
            value: Value to cache
            ex: Expiration in seconds
            px: Expiration in milliseconds

        Returns:
            bool: True if set successfully
        """
        if not self._is_connected or not self._client:
            return False

        try:
            await self._client.set(key, value, ex=ex, px=px)
            return True
        except Exception:
            self._is_connected = False
            return False

    async def setex(self, key: str, seconds: int, value: str) -> bool:
        """
        Set value with expiration in seconds.

        Args:
            key: Cache key
            seconds: TTL in seconds
            value: Value to cache

        Returns:
            bool: True if set successfully
        """
        return await self.set(key, value, ex=seconds)

    async def delete(self, *keys: str) -> int:
        """
        Delete one or more keys.

        Args:
            *keys: Keys to delete

        Returns:
            int: Number of keys deleted
        """
        if not self._is_connected or not self._client or not keys:
            return 0

        try:
            return await self._client.delete(*keys)
        except Exception:
            self._is_connected = False
            return 0

    async def delete_pattern(self, pattern: str) -> int:
        """
        Delete all keys matching pattern.

        Args:
            pattern: Redis key pattern (e.g., "client:activities:*")

        Returns:
            int: Number of keys deleted
        """
        if not self._is_connected or not self._client:
            return 0

        try:
            keys = []
            async for key in self._client.scan_iter(match=pattern):
                keys.append(key)

            if keys:
                return await self._client.delete(*keys)
            return 0
        except Exception:
            self._is_connected = False
            return 0

    async def exists(self, *keys: str) -> int:
        """
        Check if keys exist.

        Args:
            *keys: Keys to check

        Returns:
            int: Number of keys that exist
        """
        if not self._is_connected or not self._client or not keys:
            return 0

        try:
            return await self._client.exists(*keys)
        except Exception:
            self._is_connected = False
            return 0

    async def expire(self, key: str, seconds: int) -> bool:
        """
        Set expiration on key.

        Args:
            key: Cache key
            seconds: TTL in seconds

        Returns:
            bool: True if expiration set successfully
        """
        if not self._is_connected or not self._client:
            return False

        try:
            return await self._client.expire(key, seconds)
        except Exception:
            self._is_connected = False
            return False

    async def incr(self, key: str) -> Optional[int]:
        """
        Increment key value.

        Args:
            key: Cache key

        Returns:
            int | None: New value or None if failed
        """
        if not self._is_connected or not self._client:
            return None

        try:
            return await self._client.incr(key)
        except Exception:
            self._is_connected = False
            return None

    async def decr(self, key: str) -> Optional[int]:
        """
        Decrement key value.

        Args:
            key: Cache key

        Returns:
            int | None: New value or None if failed
        """
        if not self._is_connected or not self._client:
            return None

        try:
            return await self._client.decr(key)
        except Exception:
            self._is_connected = False
            return None

    # ==========================================================================
    # JSON Helpers (for caching complex objects)
    # ==========================================================================

    async def get_json(self, key: str) -> Optional[Any]:
        """
        Get JSON value from Redis.

        Args:
            key: Cache key

        Returns:
            Any | None: Deserialized JSON or None
        """
        value = await self.get(key)
        if value:
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return None
        return None

    async def set_json(self, key: str, value: Any, ex: Optional[int] = None) -> bool:
        """
        Set JSON value in Redis.

        Args:
            key: Cache key
            value: Object to serialize and cache
            ex: Expiration in seconds

        Returns:
            bool: True if set successfully
        """
        try:
            json_str = json.dumps(value)
            return await self.set(key, json_str, ex=ex)
        except (TypeError, ValueError):
            return False

    # ==========================================================================
    # List Operations (for activity timelines, etc.)
    # ==========================================================================

    async def lpush(self, key: str, *values: str) -> Optional[int]:
        """
        Push values to left (head) of list.

        Args:
            key: List key
            *values: Values to push

        Returns:
            int | None: List length or None if failed
        """
        if not self._is_connected or not self._client or not values:
            return None

        try:
            return await self._client.lpush(key, *values)
        except Exception:
            self._is_connected = False
            return None

    async def lrange(self, key: str, start: int, stop: int) -> List[str]:
        """
        Get range of elements from list.

        Args:
            key: List key
            start: Start index
            stop: Stop index

        Returns:
            List[str]: List elements
        """
        if not self._is_connected or not self._client:
            return []

        try:
            return await self._client.lrange(key, start, stop)
        except Exception:
            self._is_connected = False
            return []

    async def ltrim(self, key: str, start: int, stop: int) -> bool:
        """
        Trim list to specified range.

        Args:
            key: List key
            start: Start index
            stop: Stop index

        Returns:
            bool: True if trimmed successfully
        """
        if not self._is_connected or not self._client:
            return False

        try:
            await self._client.ltrim(key, start, stop)
            return True
        except Exception:
            self._is_connected = False
            return False


# Global Redis client instance
redis_client = RedisClient()
