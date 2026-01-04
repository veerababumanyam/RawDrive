from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Optional

from redis.asyncio import Redis

from app.config.settings import AppSettings, get_settings

logger = logging.getLogger(__name__)

_client: Optional[Redis] = None


class InMemoryRedis:
    """Lightweight Redis substitute for tests.

    Supports the subset of operations used by our rate limiting and health checks.
    """

    def __init__(self) -> None:
        self._zsets: dict[str, list[tuple[str, float]]] = {}
        self._expires: dict[str, float] = {}
        self.closed = False
        self.ping_called = 0

    # -- Connection lifecycle -------------------------------------------------
    async def aclose(self) -> None:  # mimic redis.asyncio
        self.closed = True

    async def ping(self) -> bool:
        self.ping_called += 1
        return True

    # -- Sorted set helpers ---------------------------------------------------
    def _cleanup_expired(self, key: str) -> None:
        expiry = self._expires.get(key)
        if expiry and time.time() > expiry:
            self._zsets.pop(key, None)
            self._expires.pop(key, None)

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

    async def expire(self, key: str, seconds: int) -> bool:
        self._expires[key] = time.time() + seconds
        return True

    async def delete(self, key: str) -> None:
        self._zsets.pop(key, None)
        self._expires.pop(key, None)

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
            self.ops: list[tuple[str, tuple]] = []

        def zremrangebyscore(self, key: str, min_score: float, max_score: float):
            self.ops.append(("zremrangebyscore", (key, min_score, max_score)))
            return self

        def zcard(self, key: str):
            self.ops.append(("zcard", (key,)))
            return self

        def zadd(self, key: str, mapping: dict[str, float]):
            self.ops.append(("zadd", (key, mapping)))
            return self

        def expire(self, key: str, seconds: int):
            self.ops.append(("expire", (key, seconds)))
            return self

        async def execute(self):
            results = []
            for op, args in self.ops:
                method = getattr(self.parent, op)
                results.append(await method(*args))
            return results

    def pipeline(self) -> "InMemoryRedis.Pipeline":
        return InMemoryRedis.Pipeline(self)


async def init_redis_client(settings: Optional[AppSettings] = None) -> Redis:
    """Initialize and cache a Redis asyncio client with health checks enabled."""

    global _client
    if _client is not None:
        return _client

    settings = settings or get_settings()

    if os.getenv("PYTEST_CURRENT_TEST"):
        _client = InMemoryRedis()
    elif getattr(Redis, "__module__", "").startswith("tests."):
        _client = Redis.from_url(
            str(settings.redis_url),
            encoding="utf-8",
            decode_responses=False,
            health_check_interval=30,
        )
    elif os.getenv("USE_IN_MEMORY_REDIS", "0") == "1":
        _client = InMemoryRedis()
    else:
        _client = Redis.from_url(
            str(settings.redis_url),
            encoding="utf-8",
            decode_responses=False,
            health_check_interval=30,
        )

    logger.info("Redis client initialized", extra={"url": settings.mask_value(settings.redis_url)} )
    return _client


async def get_redis_client() -> Redis:
    """Return the initialized Redis client or raise if not initialized."""

    if _client is None:
        raise RuntimeError("Redis client has not been initialized. Call init_redis_client first.")
    return _client


async def close_redis_client() -> None:
    """Close and reset the Redis client."""

    global _client
    if _client is not None:
        close_result = getattr(_client, "aclose", None)
        if callable(close_result):
            await close_result()
        _client = None
        logger.info("Redis client closed")


async def redis_healthcheck(timeout: float = 1.0) -> bool:
    """Ping Redis and return True if healthy."""

    client = await init_redis_client()
    pong = await asyncio.wait_for(client.ping(), timeout=timeout)
    return bool(pong)
