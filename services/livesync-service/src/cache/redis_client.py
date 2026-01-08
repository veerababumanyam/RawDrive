"""
Redis client for Sync Service.

Provides Redis connection management for caching and pub/sub.
Placeholder - full implementation with pub/sub in T010.
"""

from typing import Any, Optional
import redis.asyncio as redis

from src.config import settings
from src.logging import get_logger

logger = get_logger(__name__)


class RedisClient:
    """
    Async Redis client wrapper.

    Provides connection management and common operations for
    caching and pub/sub functionality.
    """

    def __init__(self):
        self._client: Optional[redis.Redis] = None
        self._pubsub: Optional[redis.client.PubSub] = None

    async def connect(self) -> None:
        """Establish Redis connection."""
        if self._client is not None:
            return

        logger.info("Connecting to Redis...")
        self._client = redis.from_url(
            settings.REDIS_URL,
            max_connections=settings.REDIS_MAX_CONNECTIONS,
            decode_responses=True,
        )
        logger.info("Redis connection established")

    async def disconnect(self) -> None:
        """Close Redis connection."""
        if self._client is not None:
            logger.info("Closing Redis connection...")
            if self._pubsub is not None:
                await self._pubsub.close()
                self._pubsub = None
            await self._client.close()
            self._client = None
            logger.info("Redis connection closed")

    async def ping(self) -> bool:
        """Check Redis connectivity."""
        if self._client is None:
            return False
        try:
            await self._client.ping()
            return True
        except Exception as e:
            logger.warning(f"Redis ping failed: {e}")
            return False

    async def get(self, key: str) -> Optional[str]:
        """Get a value from Redis."""
        if self._client is None:
            return None
        return await self._client.get(key)

    async def set(
        self,
        key: str,
        value: Any,
        ex: Optional[int] = None,
    ) -> bool:
        """Set a value in Redis with optional expiration."""
        if self._client is None:
            return False
        await self._client.set(key, value, ex=ex)
        return True

    async def delete(self, key: str) -> bool:
        """Delete a key from Redis."""
        if self._client is None:
            return False
        await self._client.delete(key)
        return True

    async def publish(self, channel: str, message: str) -> int:
        """Publish a message to a Redis channel."""
        if self._client is None:
            return 0
        return await self._client.publish(channel, message)

    @property
    def client(self) -> Optional[redis.Redis]:
        """Get the underlying Redis client."""
        return self._client


# Global Redis client instance
redis_client = RedisClient()
