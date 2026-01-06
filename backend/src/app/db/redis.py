from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Any, Optional

from redis.asyncio import ConnectionPool, Redis

from app.config.settings import AppSettings, get_settings

logger = logging.getLogger(__name__)

_client: Optional[Redis] = None
_pool: Optional[ConnectionPool] = None


class InMemoryRedis:
    """Lightweight Redis substitute for tests.

    Supports operations used by rate limiting, health checks, and cache service.
    """

    def __init__(self) -> None:
        self._data: dict[str, bytes] = {}  # String/generic key-value store
        self._zsets: dict[str, list[tuple[str, float]]] = {}
        self._expires: dict[str, float] = {}
        self._counters: dict[str, int] = {}
        self.closed = False
        self.ping_called = 0

    # -- Connection lifecycle -------------------------------------------------
    async def aclose(self) -> None:  # mimic redis.asyncio
        self.closed = True

    async def ping(self) -> bool:
        self.ping_called += 1
        return True

    # -- Expiry helpers -------------------------------------------------------
    def _cleanup_expired(self, key: str) -> None:
        expiry = self._expires.get(key)
        if expiry and time.time() > expiry:
            self._data.pop(key, None)
            self._zsets.pop(key, None)
            self._counters.pop(key, None)
            self._expires.pop(key, None)

    def _cleanup_all_expired(self) -> None:
        """Clean up all expired keys."""
        now = time.time()
        expired_keys = [k for k, v in self._expires.items() if v < now]
        for key in expired_keys:
            self._data.pop(key, None)
            self._zsets.pop(key, None)
            self._counters.pop(key, None)
            self._expires.pop(key, None)

    # -- String operations (for cache service) ---------------------------------
    async def get(self, key: str) -> Optional[bytes]:
        """Get a string value."""
        self._cleanup_expired(key)
        return self._data.get(key)

    async def set(self, key: str, value: Any, ex: Optional[int] = None) -> bool:
        """Set a string value with optional expiry."""
        if isinstance(value, str):
            self._data[key] = value.encode("utf-8")
        elif isinstance(value, bytes):
            self._data[key] = value
        else:
            self._data[key] = str(value).encode("utf-8")
        if ex:
            self._expires[key] = time.time() + ex
        return True

    async def setex(self, key: str, ttl: int, value: Any) -> bool:
        """Set a string value with expiry."""
        return await self.set(key, value, ex=ttl)

    async def mget(self, keys: list[str]) -> list[Optional[bytes]]:
        """Get multiple string values."""
        self._cleanup_all_expired()
        return [self._data.get(k) for k in keys]

    async def exists(self, *keys: str) -> int:
        """Check if keys exist."""
        self._cleanup_all_expired()
        return sum(1 for k in keys if k in self._data or k in self._zsets or k in self._counters)

    async def ttl(self, key: str) -> int:
        """Get remaining TTL for a key."""
        self._cleanup_expired(key)
        if key not in self._data and key not in self._zsets and key not in self._counters:
            return -2  # Key doesn't exist
        expiry = self._expires.get(key)
        if expiry is None:
            return -1  # No expiry set
        remaining = int(expiry - time.time())
        return max(0, remaining)

    async def delete(self, *keys: str) -> int:
        """Delete one or more keys."""
        deleted = 0
        for key in keys:
            if key in self._data:
                del self._data[key]
                deleted += 1
            if key in self._zsets:
                del self._zsets[key]
                deleted += 1
            if key in self._counters:
                del self._counters[key]
                deleted += 1
            self._expires.pop(key, None)
        return deleted

    async def expire(self, key: str, seconds: int, nx: bool = False) -> bool:
        """Set expiry on a key."""
        if key not in self._data and key not in self._zsets and key not in self._counters:
            return False
        if nx and key in self._expires:
            return False  # Don't set if already has expiry
        self._expires[key] = time.time() + seconds
        return True

    async def scan(
        self,
        cursor: int,
        match: Optional[str] = None,
        count: int = 100,
    ) -> tuple[int, list[bytes]]:
        """Scan keys matching a pattern."""
        import fnmatch

        self._cleanup_all_expired()

        all_keys = list(set(list(self._data.keys()) + list(self._zsets.keys()) + list(self._counters.keys())))

        if match:
            # Convert Redis pattern to fnmatch pattern
            pattern = match.replace("*", ".*").replace("?", ".")
            import re

            regex = re.compile(f"^{pattern}$")
            matched_keys = [k for k in all_keys if regex.match(k)]
        else:
            matched_keys = all_keys

        # Simple cursor-based pagination
        start = cursor
        end = min(start + count, len(matched_keys))
        result_keys = matched_keys[start:end]

        # Return 0 cursor when done, otherwise next position
        next_cursor = 0 if end >= len(matched_keys) else end

        return next_cursor, [k.encode("utf-8") if isinstance(k, str) else k for k in result_keys]

    # -- Counter operations ----------------------------------------------------
    async def incrby(self, key: str, amount: int = 1) -> int:
        """Increment a counter."""
        self._cleanup_expired(key)
        if key not in self._counters:
            self._counters[key] = 0
        self._counters[key] += amount
        return self._counters[key]

    async def decrby(self, key: str, amount: int = 1) -> int:
        """Decrement a counter."""
        self._cleanup_expired(key)
        if key not in self._counters:
            self._counters[key] = 0
        self._counters[key] -= amount
        return self._counters[key]

    # -- Sorted set operations -------------------------------------------------
    async def zremrangebyscore(self, key: str, min_score: float, max_score: float) -> int:
        self._cleanup_expired(key)
        items = self._zsets.get(key, [])
        kept = [(member, score) for member, score in items if not (min_score <= score <= max_score)]
        removed = len(items) - len(kept)
        self._zsets[key] = kept
        return removed

    async def zcard(self, key: str) -> int:
        self._cleanup_expired(key)
        return len(self._zsets.get(key, []))

    async def zadd(self, key: str, mapping: dict[str, float]) -> int:
        self._cleanup_expired(key)
        items = self._zsets.setdefault(key, [])
        for member, score in mapping.items():
            # Replace existing member if present
            items = [(m, s) for m, s in items if m != member]
            items.append((member, float(score)))
        # Sort by score ascending to mimic redis
        items.sort(key=lambda pair: pair[1])
        self._zsets[key] = items
        return len(mapping)

    async def zrange(self, key: str, start: int, end: int, withscores: bool = False):
        self._cleanup_expired(key)
        items = self._zsets.get(key, [])
        slice_items = items[start : end + 1 if end != -1 else None]
        if withscores:
            return slice_items
        return [member for member, _ in slice_items]

    # -- Pipeline emulation ----------------------------------------------------
    class Pipeline:
        def __init__(self, parent: "InMemoryRedis") -> None:
            self.parent = parent
            self.ops: list[tuple[str, tuple, dict]] = []

        def zremrangebyscore(self, key: str, min_score: float, max_score: float):
            self.ops.append(("zremrangebyscore", (key, min_score, max_score), {}))
            return self

        def zcard(self, key: str):
            self.ops.append(("zcard", (key,), {}))
            return self

        def zadd(self, key: str, mapping: dict[str, float]):
            self.ops.append(("zadd", (key, mapping), {}))
            return self

        def expire(self, key: str, seconds: int, nx: bool = False):
            self.ops.append(("expire", (key, seconds), {"nx": nx}))
            return self

        def setex(self, key: str, ttl: int, value: Any):
            self.ops.append(("setex", (key, ttl, value), {}))
            return self

        def incrby(self, key: str, amount: int = 1):
            self.ops.append(("incrby", (key, amount), {}))
            return self

        def decrby(self, key: str, amount: int = 1):
            self.ops.append(("decrby", (key, amount), {}))
            return self

        def delete(self, *keys: str):
            self.ops.append(("delete", keys, {}))
            return self

        async def execute(self):
            results = []
            for op, args, kwargs in self.ops:
                method = getattr(self.parent, op)
                results.append(await method(*args, **kwargs))
            return results

    def pipeline(self) -> "InMemoryRedis.Pipeline":
        return InMemoryRedis.Pipeline(self)


async def init_redis_client(settings: Optional[AppSettings] = None) -> Redis:
    """Initialize and cache a Redis asyncio client with connection pooling and health checks enabled.

    Connection pool settings are loaded from AppSettings:
    - redis_pool_max_connections: Maximum number of connections in the pool (default: 50)
    - redis_socket_timeout: Socket timeout in seconds (default: 5.0)
    - redis_socket_connect_timeout: Socket connect timeout in seconds (default: 5.0)
    - redis_retry_on_timeout: Whether to retry on timeout (default: True)
    - redis_health_check_interval: Health check interval in seconds (default: 30)
    """

    global _client, _pool
    if _client is not None:
        return _client

    settings = settings or get_settings()

    if os.getenv("PYTEST_CURRENT_TEST"):
        _client = InMemoryRedis()
    elif os.getenv("USE_IN_MEMORY_REDIS", "0") == "1":
        _client = InMemoryRedis()
    else:
        # Create connection pool with configurable settings
        _pool = ConnectionPool.from_url(
            str(settings.redis_url),
            encoding="utf-8",
            decode_responses=False,
            max_connections=settings.redis_pool_max_connections,
            socket_timeout=settings.redis_socket_timeout,
            socket_connect_timeout=settings.redis_socket_connect_timeout,
            retry_on_timeout=settings.redis_retry_on_timeout,
            health_check_interval=settings.redis_health_check_interval,
        )

        _client = Redis(connection_pool=_pool)

        logger.info(
            "Redis client initialized with connection pool",
            extra={
                "url": settings.mask_value(settings.redis_url),
                "max_connections": settings.redis_pool_max_connections,
                "socket_timeout": settings.redis_socket_timeout,
                "health_check_interval": settings.redis_health_check_interval,
            },
        )
        return _client

    logger.info("Redis client initialized (in-memory)", extra={"url": settings.mask_value(settings.redis_url)})
    return _client


async def get_redis_client() -> Redis:
    """Return the initialized Redis client or raise if not initialized."""

    if _client is None:
        raise RuntimeError("Redis client has not been initialized. Call init_redis_client first.")
    return _client


async def close_redis_client() -> None:
    """Close and reset the Redis client and connection pool."""

    global _client, _pool
    if _client is not None:
        close_result = getattr(_client, "aclose", None)
        if callable(close_result):
            await close_result()
        _client = None

    if _pool is not None:
        await _pool.disconnect()
        _pool = None

    logger.info("Redis client and connection pool closed")


def get_redis_pool_stats() -> dict[str, Any]:
    """Get connection pool statistics for monitoring.

    Returns:
        dict with pool stats including:
        - max_connections: Maximum allowed connections
        - active_connections: Currently in-use connections
        - idle_connections: Available connections in pool
        - status: Pool initialization status
    """
    if _pool is None:
        return {
            "status": "not_initialized",
            "max_connections": 0,
            "active_connections": 0,
            "idle_connections": 0,
        }

    # Get connection counts from pool internals
    # Note: redis-py's ConnectionPool uses _in_use_connections and _available_connections
    active = len(_pool._in_use_connections) if hasattr(_pool, "_in_use_connections") else 0
    idle = len(_pool._available_connections) if hasattr(_pool, "_available_connections") else 0

    return {
        "status": "initialized",
        "max_connections": _pool.max_connections,
        "active_connections": active,
        "idle_connections": idle,
        "total_connections": active + idle,
    }


async def get_redis_pool_stats_async() -> dict[str, Any]:
    """Async wrapper for get_redis_pool_stats for consistency with other async functions."""
    return get_redis_pool_stats()


async def redis_healthcheck(timeout: float = 1.0) -> bool:
    """Ping Redis and return True if healthy."""

    client = await init_redis_client()
    pong = await asyncio.wait_for(client.ping(), timeout=timeout)
    return bool(pong)
