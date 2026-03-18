"""
Redis Core Module

Handles Redis connections and operations for AI processing service.
Supports caching and task queuing.
"""

import json
import logging
from typing import Any, Dict, List, Optional

import redis.asyncio as redis

from config import get_settings

logger = logging.getLogger(__name__)


class RedisClient:
    """Redis client for caching and task queuing."""

    def __init__(self):
        """Initialize Redis client."""
        self.settings = get_settings()
        self.client: Optional[redis.Redis] = None
        self._initialized = False

    async def connect(self) -> None:
        """Initialize Redis connection."""
        if self._initialized:
            logger.warning("Redis already initialized")
            return

        try:
            redis_url = str(self.settings.REDIS_URL)
            logger.info(f"Connecting to Redis: {redis_url}")

            self.client = redis.from_url(
                redis_url,
                decode_responses=True,
                encoding="utf-8",
                socket_connect_timeout=self.settings.REDIS_SOCKET_TIMEOUT,
                socket_keepalive=True,
                health_check_interval=30,
            )

            await self.client.ping()

            self._initialized = True
            logger.info("Redis connection established successfully")

        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")
            raise RuntimeError(f"Redis connection failed: {e}")

    async def disconnect(self) -> None:
        """Close Redis connection."""
        if self.client:
            await self.client.close()
            self.client = None
            self._initialized = False
            logger.info("Redis connection closed")

    async def get(self, key: str) -> Optional[str]:
        """
        Get value from Redis.

        Args:
            key: Redis key

        Returns:
            Value or None if not found
        """
        if not self._initialized:
            raise RuntimeError("Redis not initialized. Call connect() first.")

        try:
            value = await self.client.get(key)
            return value
        except Exception as e:
            logger.error(f"Failed to get key {key}: {e}")
            return None

    async def set(
        self, key: str, value: str, expire: Optional[int] = None
    ) -> bool:
        """
        Set value in Redis.

        Args:
            key: Redis key
            value: Value to store
            expire: Expiration time in seconds (optional)

        Returns:
            True if successful
        """
        if not self._initialized:
            raise RuntimeError("Redis not initialized. Call connect() first.")

        try:
            await self.client.set(key, value, ex=expire)
            return True
        except Exception as e:
            logger.error(f"Failed to set key {key}: {e}")
            return False

    async def get_json(self, key: str) -> Optional[Dict[str, Any]]:
        """
        Get JSON value from Redis.

        Args:
            key: Redis key

        Returns:
            Parsed JSON dict or None
        """
        value = await self.get(key)
        if value:
            try:
                return json.loads(value)
            except json.JSONDecodeError as e:
                logger.error(f"Failed to decode JSON for key {key}: {e}")
                return None
        return None

    async def set_json(
        self, key: str, value: Dict[str, Any], expire: Optional[int] = None
    ) -> bool:
        """
        Set JSON value in Redis.

        Args:
            key: Redis key
            value: Dict to store as JSON
            expire: Expiration time in seconds (optional)

        Returns:
            True if successful
        """
        try:
            json_str = json.dumps(value)
            return await self.set(key, json_str, expire=expire)
        except Exception as e:
            logger.error(f"Failed to set JSON for key {key}: {e}")
            return False

    async def delete(self, key: str) -> bool:
        """
        Delete key from Redis.

        Args:
            key: Redis key

        Returns:
            True if successful
        """
        if not self._initialized:
            raise RuntimeError("Redis not initialized. Call connect() first.")

        try:
            await self.client.delete(key)
            return True
        except Exception as e:
            logger.error(f"Failed to delete key {key}: {e}")
            return False

    async def exists(self, key: str) -> bool:
        """
        Check if key exists in Redis.

        Args:
            key: Redis key

        Returns:
            True if key exists
        """
        if not self._initialized:
            raise RuntimeError("Redis not initialized. Call connect() first.")

        try:
            result = await self.client.exists(key)
            return bool(result)
        except Exception as e:
            logger.error(f"Failed to check key {key}: {e}")
            return False

    async def lpush(self, key: str, *values: str) -> int:
        """
        Push values to the head of a list.

        Args:
            key: List key
            *values: Values to push

        Returns:
            New list length
        """
        if not self._initialized:
            raise RuntimeError("Redis not initialized. Call connect() first.")

        try:
            return await self.client.lpush(key, *values)
        except Exception as e:
            logger.error(f"Failed to lpush to key {key}: {e}")
            return 0

    async def rpush(self, key: str, *values: str) -> int:
        """
        Push values to the tail of a list.

        Args:
            key: List key
            *values: Values to push

        Returns:
            New list length
        """
        if not self._initialized:
            raise RuntimeError("Redis not initialized. Call connect() first.")

        try:
            return await self.client.rpush(key, *values)
        except Exception as e:
            logger.error(f"Failed to rpush to key {key}: {e}")
            return 0

    async def lpop(self, key: str) -> Optional[str]:
        """
        Pop value from the head of a list.

        Args:
            key: List key

        Returns:
            Popped value or None
        """
        if not self._initialized:
            raise RuntimeError("Redis not initialized. Call connect() first.")

        try:
            return await self.client.lpop(key)
        except Exception as e:
            logger.error(f"Failed to lpop from key {key}: {e}")
            return None

    async def rpop(self, key: str) -> Optional[str]:
        """
        Pop value from the tail of a list.

        Args:
            key: List key

        Returns:
            Popped value or None
        """
        if not self._initialized:
            raise RuntimeError("Redis not initialized. Call connect() first.")

        try:
            return await self.client.rpop(key)
        except Exception as e:
            logger.error(f"Failed to rpop from key {key}: {e}")
            return None

    async def llen(self, key: str) -> int:
        """
        Get length of a list.

        Args:
            key: List key

        Returns:
            List length
        """
        if not self._initialized:
            raise RuntimeError("Redis not initialized. Call connect() first.")

        try:
            return await self.client.llen(key)
        except Exception as e:
            logger.error(f"Failed to get llen for key {key}: {e}")
            return 0

    async def cache_duplicate_check(
        self, asset_id: str, workspace_id: str, is_duplicate: bool, ttl: int = 3600
    ) -> bool:
        """
        Cache duplicate detection result.

        Args:
            asset_id: Asset UUID
            workspace_id: Workspace UUID
            is_duplicate: Duplicate detection result
            ttl: Time to live in seconds

        Returns:
            True if successful
        """
        key = f"duplicate:{workspace_id}:{asset_id}"
        value = {"is_duplicate": is_duplicate, "checked_at": "now"}
        return await self.set_json(key, value, expire=ttl)

    async def get_cached_duplicate_check(
        self, asset_id: str, workspace_id: str
    ) -> Optional[bool]:
        """
        Get cached duplicate detection result.

        Args:
            asset_id: Asset UUID
            workspace_id: Workspace UUID

        Returns:
            Cached result or None
        """
        key = f"duplicate:{workspace_id}:{asset_id}"
        cached = await self.get_json(key)
        if cached:
            return cached.get("is_duplicate")
        return None


_redis_client: Optional[RedisClient] = None


async def init_redis() -> None:
    """Initialize global Redis connection."""
    global _redis_client
    if _redis_client is None:
        _redis_client = RedisClient()
    await _redis_client.connect()


async def close_redis() -> None:
    """Close global Redis connection."""
    global _redis_client
    if _redis_client:
        await _redis_client.disconnect()
        _redis_client = None


def get_redis() -> RedisClient:
    """
    Get global Redis client instance.

    Returns:
        RedisClient instance

    Raises:
        RuntimeError: If Redis not initialized
    """
    if _redis_client is None:
        raise RuntimeError("Redis not initialized. Call init_redis() first.")
    return _redis_client


async def redis_healthcheck(timeout: float = 2.0) -> bool:
    """Check if Redis is reachable.

    Args:
        timeout: Ping timeout in seconds.

    Returns:
        True if Redis responds to ping, False otherwise.
    """
    if _redis_client is None or _redis_client.client is None:
        return False
    try:
        return await _redis_client.client.ping()
    except Exception as e:
        logger.warning(f"Redis healthcheck failed: {e}")
        return False
