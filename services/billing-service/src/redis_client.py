"""
Redis client for Billing Microservice with circuit breaker.

Features:
- Circuit breaker for resilience
- Graceful fallback for caching failures
- Support for idempotency keys and rate limiting
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional
from enum import Enum
import logging

import redis.asyncio as redis

from src.config import settings

logger = logging.getLogger(__name__)


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
            logger.warning(f"Circuit breaker OPEN (failures={self.failure_count})")

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
    """Async Redis client with circuit breaker."""

    def __init__(self):
        self._client: Optional[redis.Redis] = None
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
            prefixed_key = f"{settings.REDIS_KEY_PREFIX}{key}"
            result = await self._client.get(prefixed_key)
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
            prefixed_key = f"{settings.REDIS_KEY_PREFIX}{key}"
            await self._client.setex(prefixed_key, ttl, value)
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
            prefixed_key = f"{settings.REDIS_KEY_PREFIX}{key}"
            await self._client.delete(prefixed_key)
            self._circuit_breaker.record_success()
            return True
        except Exception as e:
            self._circuit_breaker.record_failure()
            logger.warning(f"Redis DELETE error: {e}")
            return False

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
        """Increment a counter (for rate limiting)."""
        if not self._circuit_breaker.can_execute():
            return 0
        if not self._client:
            return 0
        try:
            prefixed_key = f"{settings.REDIS_KEY_PREFIX}{key}"
            value = await self._client.incr(prefixed_key)
            if ttl and value == 1:
                await self._client.expire(prefixed_key, ttl)
            self._circuit_breaker.record_success()
            return value
        except Exception as e:
            self._circuit_breaker.record_failure()
            logger.warning(f"Redis INCR error: {e}")
            return 0

    async def exists(self, key: str) -> bool:
        """Check if a key exists (for idempotency)."""
        if not self._circuit_breaker.can_execute():
            return False
        if not self._client:
            return False
        try:
            prefixed_key = f"{settings.REDIS_KEY_PREFIX}{key}"
            result = await self._client.exists(prefixed_key)
            self._circuit_breaker.record_success()
            return result > 0
        except Exception as e:
            self._circuit_breaker.record_failure()
            logger.warning(f"Redis EXISTS error: {e}")
            return False

    def get_circuit_state(self) -> dict:
        """Get circuit breaker state for health checks."""
        return self._circuit_breaker.get_state()


# Singleton instance
redis_client = RedisClient()
