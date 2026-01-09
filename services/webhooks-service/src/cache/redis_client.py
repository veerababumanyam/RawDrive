"""
Redis client for caching, circuit breakers, and dead letter queue.
"""

import json
import logging
from typing import Optional, Any

import redis.asyncio as redis

from src.config import settings

logger = logging.getLogger(__name__)


class RedisClient:
    """Async Redis client wrapper."""

    def __init__(self):
        self._client: Optional[redis.Redis] = None

    async def connect(self) -> None:
        """Connect to Redis."""
        if self._client is None:
            self._client = redis.from_url(
                settings.REDIS_URL,
                max_connections=settings.REDIS_MAX_CONNECTIONS,
                decode_responses=True,
            )
            logger.info("Redis client connected")

    async def disconnect(self) -> None:
        """Disconnect from Redis."""
        if self._client is not None:
            await self._client.close()
            self._client = None
            logger.info("Redis client disconnected")

    async def ping(self) -> bool:
        """Check Redis connectivity."""
        if self._client is None:
            return False
        try:
            return await self._client.ping()
        except Exception as e:
            logger.error(f"Redis ping failed: {e}")
            return False

    async def get(self, key: str) -> Optional[str]:
        """Get value by key."""
        if self._client is None:
            return None
        return await self._client.get(key)

    async def set(
        self,
        key: str,
        value: str,
        ex: Optional[int] = None,
    ) -> bool:
        """Set value with optional expiration."""
        if self._client is None:
            return False
        await self._client.set(key, value, ex=ex)
        return True

    async def delete(self, key: str) -> bool:
        """Delete a key."""
        if self._client is None:
            return False
        await self._client.delete(key)
        return True

    async def incr(self, key: str) -> int:
        """Increment a key."""
        if self._client is None:
            return 0
        return await self._client.incr(key)

    async def expire(self, key: str, seconds: int) -> bool:
        """Set expiration on a key."""
        if self._client is None:
            return False
        return await self._client.expire(key, seconds)

    async def lpush(self, key: str, value: str) -> int:
        """Push to list (left)."""
        if self._client is None:
            return 0
        return await self._client.lpush(key, value)

    async def rpop(self, key: str) -> Optional[str]:
        """Pop from list (right)."""
        if self._client is None:
            return None
        return await self._client.rpop(key)

    async def llen(self, key: str) -> int:
        """Get list length."""
        if self._client is None:
            return 0
        return await self._client.llen(key)

    async def lrange(self, key: str, start: int, end: int) -> list:
        """Get list range."""
        if self._client is None:
            return []
        return await self._client.lrange(key, start, end)

    async def hset(self, name: str, key: str, value: str) -> int:
        """Set hash field."""
        if self._client is None:
            return 0
        return await self._client.hset(name, key, value)

    async def hget(self, name: str, key: str) -> Optional[str]:
        """Get hash field."""
        if self._client is None:
            return None
        return await self._client.hget(name, key)

    async def hgetall(self, name: str) -> dict:
        """Get all hash fields."""
        if self._client is None:
            return {}
        return await self._client.hgetall(name)

    async def hdel(self, name: str, *keys: str) -> int:
        """Delete hash fields."""
        if self._client is None:
            return 0
        return await self._client.hdel(name, *keys)

    # Circuit breaker helpers
    async def get_circuit_state(self, endpoint: str) -> dict:
        """Get circuit breaker state for endpoint."""
        key = f"webhook:circuit:{endpoint}"
        data = await self.hgetall(key)
        return {
            "state": data.get("state", "closed"),
            "failure_count": int(data.get("failure_count", 0)),
            "last_failure_time": float(data.get("last_failure_time", 0)),
            "last_state_change": float(data.get("last_state_change", 0)),
        }

    async def set_circuit_state(
        self,
        endpoint: str,
        state: str,
        failure_count: int,
        last_failure_time: float,
        last_state_change: float,
    ) -> None:
        """Set circuit breaker state for endpoint."""
        key = f"webhook:circuit:{endpoint}"
        await self._client.hset(key, mapping={
            "state": state,
            "failure_count": str(failure_count),
            "last_failure_time": str(last_failure_time),
            "last_state_change": str(last_state_change),
        })
        # Expire circuit state after 1 hour of inactivity
        await self.expire(key, 3600)

    # DLQ helpers
    async def push_to_dlq(self, workspace_id: str, delivery_data: dict) -> None:
        """Push failed delivery to dead letter queue."""
        key = f"webhook:dlq:{workspace_id}"
        await self.lpush(key, json.dumps(delivery_data))
        # Set TTL on DLQ
        await self.expire(key, settings.DLQ_TTL_DAYS * 86400)

    async def get_dlq_items(
        self,
        workspace_id: str,
        limit: int = 50,
    ) -> list[dict]:
        """Get items from dead letter queue."""
        key = f"webhook:dlq:{workspace_id}"
        items = await self.lrange(key, 0, limit - 1)
        return [json.loads(item) for item in items]

    async def get_dlq_size(self, workspace_id: str) -> int:
        """Get dead letter queue size."""
        key = f"webhook:dlq:{workspace_id}"
        return await self.llen(key)


# Global singleton
redis_client = RedisClient()
