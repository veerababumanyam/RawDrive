from __future__ import annotations

import asyncio
import logging
from typing import Optional

from redis.asyncio import Redis

from app.config.settings import AppSettings, get_settings

logger = logging.getLogger(__name__)

_client: Optional[Redis] = None


async def init_redis_client(settings: Optional[AppSettings] = None) -> Redis:
    """Initialize and cache a Redis asyncio client with health checks enabled."""

    global _client
    if _client is not None:
        return _client

    settings = settings or get_settings()

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
        await _client.aclose()
        _client = None
        logger.info("Redis client closed")


async def redis_healthcheck(timeout: float = 1.0) -> bool:
    """Ping Redis and return True if healthy."""

    client = await init_redis_client()
    pong = await asyncio.wait_for(client.ping(), timeout=timeout)
    return bool(pong)
