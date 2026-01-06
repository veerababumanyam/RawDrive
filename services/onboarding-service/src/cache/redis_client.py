"""Redis client for caching."""

import json
from typing import Optional, Any
import redis.asyncio as redis

from src.config import settings
from src.logging import get_logger

logger = get_logger(__name__)


class RedisClient:
    """Redis client wrapper with caching utilities."""

    def __init__(self):
        self._client: Optional[redis.Redis] = None

    async def connect(self):
        """Connect to Redis."""
        try:
            logger.info("Connecting to Redis", extra={"url": settings.REDIS_URL})
            self._client = redis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
                max_connections=settings.REDIS_MAX_CONNECTIONS,
            )
            # Test connection
            await self._client.ping()
            logger.info("Connected to Redis successfully")
        except Exception as e:
            logger.error("Failed to connect to Redis", extra={"error": str(e)})
            raise

    async def disconnect(self):
        """Disconnect from Redis."""
        if self._client:
            logger.info("Disconnecting from Redis")
            await self._client.close()
            logger.info("Disconnected from Redis")

    async def ping(self) -> bool:
        """Check Redis connection."""
        if not self._client:
            return False
        try:
            await self._client.ping()
            return True
        except Exception:
            return False

    async def get(self, key: str) -> Optional[str]:
        """Get value from Redis."""
        if not self._client:
            return None
        try:
            return await self._client.get(key)
        except Exception as e:
            logger.error("Redis GET error", extra={"key": key, "error": str(e)})
            return None

    async def set(
        self, key: str, value: str, ttl: Optional[int] = None
    ) -> bool:
        """Set value in Redis with optional TTL."""
        if not self._client:
            return False
        try:
            if ttl:
                await self._client.setex(key, ttl, value)
            else:
                await self._client.set(key, value)
            return True
        except Exception as e:
            logger.error("Redis SET error", extra={"key": key, "error": str(e)})
            return False

    async def get_json(self, key: str) -> Optional[Any]:
        """Get JSON value from Redis."""
        value = await self.get(key)
        if value:
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                logger.error("Failed to decode JSON from Redis", extra={"key": key})
        return None

    async def set_json(
        self, key: str, value: Any, ttl: Optional[int] = None
    ) -> bool:
        """Set JSON value in Redis with optional TTL."""
        try:
            json_str = json.dumps(value)
            return await self.set(key, json_str, ttl)
        except (TypeError, ValueError) as e:
            logger.error(
                "Failed to encode JSON for Redis", extra={"key": key, "error": str(e)}
            )
            return False

    async def delete(self, key: str) -> bool:
        """Delete key from Redis."""
        if not self._client:
            return False
        try:
            await self._client.delete(key)
            return True
        except Exception as e:
            logger.error("Redis DELETE error", extra={"key": key, "error": str(e)})
            return False

    async def incr(self, key: str, ttl: Optional[int] = None) -> int:
        """Increment counter in Redis."""
        if not self._client:
            return 0
        try:
            value = await self._client.incr(key)
            if ttl and value == 1:  # Set TTL only on first increment
                await self._client.expire(key, ttl)
            return value
        except Exception as e:
            logger.error("Redis INCR error", extra={"key": key, "error": str(e)})
            return 0


# Global instance
redis_client = RedisClient()
