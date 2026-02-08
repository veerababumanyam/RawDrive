"""
Redis client for caching and rate limiting in the Growth & Referrals service.

Provides connection management and caching utilities for:
- Referral code validation caching
- Credit balance caching
- Partner dashboard data caching
- Setup goals progress caching
- Rate limiting counters
"""

import json
from typing import Any, Dict, List, Optional

import redis.asyncio as redis

from src.config import settings
from src.logging import get_logger

logger = get_logger(__name__)


class RedisClient:
    """Redis client wrapper with caching utilities for growth service."""

    def __init__(self):
        self._client: Optional[redis.Redis] = None

    @property
    def client(self) -> Optional[redis.Redis]:
        """Get the underlying Redis client."""
        return self._client

    async def connect(self) -> None:
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

    async def disconnect(self) -> None:
        """Disconnect from Redis."""
        if self._client:
            logger.info("Disconnecting from Redis")
            await self._client.close()
            self._client = None
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

    def _prefixed_key(self, key: str) -> str:
        """Add service prefix to key for namespace isolation."""
        return f"{settings.REDIS_KEY_PREFIX}{key}"

    # ==========================================================================
    # Basic String Operations
    # ==========================================================================

    async def get(self, key: str) -> Optional[str]:
        """Get value from Redis."""
        if not self._client:
            return None
        try:
            return await self._client.get(self._prefixed_key(key))
        except Exception as e:
            logger.error("Redis GET error", extra={"key": key, "error": str(e)})
            return None

    async def set(
        self, key: str, value: str, ttl: Optional[int] = None
    ) -> bool:
        """Set value in Redis with optional TTL (seconds)."""
        if not self._client:
            return False
        try:
            prefixed_key = self._prefixed_key(key)
            if ttl:
                await self._client.setex(prefixed_key, ttl, value)
            else:
                await self._client.set(prefixed_key, value)
            return True
        except Exception as e:
            logger.error("Redis SET error", extra={"key": key, "error": str(e)})
            return False

    async def delete(self, key: str) -> bool:
        """Delete key from Redis."""
        if not self._client:
            return False
        try:
            await self._client.delete(self._prefixed_key(key))
            return True
        except Exception as e:
            logger.error("Redis DELETE error", extra={"key": key, "error": str(e)})
            return False

    async def exists(self, key: str) -> bool:
        """Check if key exists in Redis."""
        if not self._client:
            return False
        try:
            return await self._client.exists(self._prefixed_key(key)) > 0
        except Exception as e:
            logger.error("Redis EXISTS error", extra={"key": key, "error": str(e)})
            return False

    async def expire(self, key: str, ttl: int) -> bool:
        """Set TTL on an existing key."""
        if not self._client:
            return False
        try:
            return await self._client.expire(self._prefixed_key(key), ttl)
        except Exception as e:
            logger.error("Redis EXPIRE error", extra={"key": key, "error": str(e)})
            return False

    async def ttl(self, key: str) -> int:
        """Get TTL of a key in seconds. Returns -1 if no TTL, -2 if key doesn't exist."""
        if not self._client:
            return -2
        try:
            return await self._client.ttl(self._prefixed_key(key))
        except Exception as e:
            logger.error("Redis TTL error", extra={"key": key, "error": str(e)})
            return -2

    # ==========================================================================
    # JSON Operations
    # ==========================================================================

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

    # ==========================================================================
    # Counter Operations (for rate limiting)
    # ==========================================================================

    async def incr(self, key: str, ttl: Optional[int] = None) -> int:
        """Increment counter in Redis. Sets TTL on first increment."""
        if not self._client:
            return 0
        try:
            prefixed_key = self._prefixed_key(key)
            value = await self._client.incr(prefixed_key)
            if ttl and value == 1:  # Set TTL only on first increment
                await self._client.expire(prefixed_key, ttl)
            return value
        except Exception as e:
            logger.error("Redis INCR error", extra={"key": key, "error": str(e)})
            return 0

    async def decr(self, key: str) -> int:
        """Decrement counter in Redis."""
        if not self._client:
            return 0
        try:
            return await self._client.decr(self._prefixed_key(key))
        except Exception as e:
            logger.error("Redis DECR error", extra={"key": key, "error": str(e)})
            return 0

    async def incrby(self, key: str, amount: int, ttl: Optional[int] = None) -> int:
        """Increment counter by specific amount."""
        if not self._client:
            return 0
        try:
            prefixed_key = self._prefixed_key(key)
            value = await self._client.incrby(prefixed_key, amount)
            if ttl and value == amount:  # Set TTL only on first increment
                await self._client.expire(prefixed_key, ttl)
            return value
        except Exception as e:
            logger.error("Redis INCRBY error", extra={"key": key, "error": str(e)})
            return 0

    # ==========================================================================
    # Hash Operations (for structured caching like partner dashboards)
    # ==========================================================================

    async def hget(self, key: str, field: str) -> Optional[str]:
        """Get field value from hash."""
        if not self._client:
            return None
        try:
            return await self._client.hget(self._prefixed_key(key), field)
        except Exception as e:
            logger.error("Redis HGET error", extra={"key": key, "field": field, "error": str(e)})
            return None

    async def hset(self, key: str, field: str, value: str) -> bool:
        """Set field value in hash."""
        if not self._client:
            return False
        try:
            await self._client.hset(self._prefixed_key(key), field, value)
            return True
        except Exception as e:
            logger.error("Redis HSET error", extra={"key": key, "field": field, "error": str(e)})
            return False

    async def hgetall(self, key: str) -> Dict[str, str]:
        """Get all fields and values from hash."""
        if not self._client:
            return {}
        try:
            return await self._client.hgetall(self._prefixed_key(key))
        except Exception as e:
            logger.error("Redis HGETALL error", extra={"key": key, "error": str(e)})
            return {}

    async def hmset(self, key: str, mapping: Dict[str, str], ttl: Optional[int] = None) -> bool:
        """Set multiple fields in hash."""
        if not self._client:
            return False
        try:
            prefixed_key = self._prefixed_key(key)
            await self._client.hset(prefixed_key, mapping=mapping)
            if ttl:
                await self._client.expire(prefixed_key, ttl)
            return True
        except Exception as e:
            logger.error("Redis HMSET error", extra={"key": key, "error": str(e)})
            return False

    async def hdel(self, key: str, *fields: str) -> int:
        """Delete fields from hash."""
        if not self._client:
            return 0
        try:
            return await self._client.hdel(self._prefixed_key(key), *fields)
        except Exception as e:
            logger.error("Redis HDEL error", extra={"key": key, "error": str(e)})
            return 0

    # ==========================================================================
    # Set Operations (for tracking unique values like referral codes)
    # ==========================================================================

    async def sadd(self, key: str, *values: str) -> int:
        """Add values to set."""
        if not self._client:
            return 0
        try:
            return await self._client.sadd(self._prefixed_key(key), *values)
        except Exception as e:
            logger.error("Redis SADD error", extra={"key": key, "error": str(e)})
            return 0

    async def sismember(self, key: str, value: str) -> bool:
        """Check if value is member of set."""
        if not self._client:
            return False
        try:
            return await self._client.sismember(self._prefixed_key(key), value)
        except Exception as e:
            logger.error("Redis SISMEMBER error", extra={"key": key, "error": str(e)})
            return False

    async def smembers(self, key: str) -> set:
        """Get all members of set."""
        if not self._client:
            return set()
        try:
            return await self._client.smembers(self._prefixed_key(key))
        except Exception as e:
            logger.error("Redis SMEMBERS error", extra={"key": key, "error": str(e)})
            return set()

    async def srem(self, key: str, *values: str) -> int:
        """Remove values from set."""
        if not self._client:
            return 0
        try:
            return await self._client.srem(self._prefixed_key(key), *values)
        except Exception as e:
            logger.error("Redis SREM error", extra={"key": key, "error": str(e)})
            return 0

    async def scard(self, key: str) -> int:
        """Get cardinality (size) of set."""
        if not self._client:
            return 0
        try:
            return await self._client.scard(self._prefixed_key(key))
        except Exception as e:
            logger.error("Redis SCARD error", extra={"key": key, "error": str(e)})
            return 0

    # ==========================================================================
    # Batch Operations
    # ==========================================================================

    async def mget(self, *keys: str) -> List[Optional[str]]:
        """Get multiple values at once."""
        if not self._client:
            return [None] * len(keys)
        try:
            prefixed_keys = [self._prefixed_key(k) for k in keys]
            return await self._client.mget(prefixed_keys)
        except Exception as e:
            logger.error("Redis MGET error", extra={"keys": keys, "error": str(e)})
            return [None] * len(keys)

    async def mset(self, mapping: Dict[str, str]) -> bool:
        """Set multiple key-value pairs at once."""
        if not self._client:
            return False
        try:
            prefixed_mapping = {
                self._prefixed_key(k): v for k, v in mapping.items()
            }
            await self._client.mset(prefixed_mapping)
            return True
        except Exception as e:
            logger.error("Redis MSET error", extra={"error": str(e)})
            return False

    async def delete_pattern(self, pattern: str) -> int:
        """Delete all keys matching pattern. Use with caution."""
        if not self._client:
            return 0
        try:
            prefixed_pattern = self._prefixed_key(pattern)
            keys = []
            async for key in self._client.scan_iter(match=prefixed_pattern):
                keys.append(key)
            if keys:
                return await self._client.delete(*keys)
            return 0
        except Exception as e:
            logger.error("Redis DELETE PATTERN error", extra={"pattern": pattern, "error": str(e)})
            return 0

    # ==========================================================================
    # Cache Key Builders (Growth Service Specific)
    # ==========================================================================

    @staticmethod
    def referral_code_key(code: str) -> str:
        """Build cache key for referral code validation."""
        return f"referral:code:{code}"

    @staticmethod
    def credit_balance_key(user_id: str, credit_type: str) -> str:
        """Build cache key for user credit balance."""
        return f"credit:balance:{user_id}:{credit_type}"

    @staticmethod
    def partner_dashboard_key(partner_id: str) -> str:
        """Build cache key for partner dashboard data."""
        return f"partner:dashboard:{partner_id}"

    @staticmethod
    def goals_progress_key(user_id: str) -> str:
        """Build cache key for user setup goals progress."""
        return f"goals:progress:{user_id}"

    @staticmethod
    def rate_limit_key(identifier: str, action: str) -> str:
        """Build cache key for rate limiting."""
        return f"ratelimit:{action}:{identifier}"

    @staticmethod
    def conversion_tracking_key(referral_code: str) -> str:
        """Build cache key for tracking conversion counts."""
        return f"referral:conversions:{referral_code}"


# Global instance
redis_client = RedisClient()
