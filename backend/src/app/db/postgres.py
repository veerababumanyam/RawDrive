from __future__ import annotations

import json
import logging
from typing import Optional

import asyncpg

from app.config.settings import AppSettings, get_settings

logger = logging.getLogger(__name__)

_pool: Optional[asyncpg.Pool] = None


async def _setup_connection(conn: asyncpg.Connection) -> None:
    """Set up JSON/JSONB type codecs for a connection."""
    await conn.set_type_codec(
        'json',
        encoder=json.dumps,
        decoder=json.loads,
        schema='pg_catalog'
    )
    await conn.set_type_codec(
        'jsonb',
        encoder=json.dumps,
        decoder=json.loads,
        schema='pg_catalog'
    )


async def init_postgres_pool(settings: Optional[AppSettings] = None) -> asyncpg.Pool:
    """Initialize and cache a global asyncpg pool.

    Idempotent: subsequent calls return the existing pool.
    """

    global _pool
    if _pool is not None:
        return _pool

    settings = settings or get_settings()

    dsn = str(settings.database_url)
    if dsn.startswith("postgresql+asyncpg://"):
        dsn = dsn.replace("postgresql+asyncpg://", "postgresql://", 1)

    _pool = await asyncpg.create_pool(
        dsn=dsn,
        min_size=settings.db_pool_min_size,
        max_size=settings.db_pool_max_size,
        max_inactive_connection_lifetime=float(settings.db_pool_max_lifetime_sec),
        init=_setup_connection,  # Set up JSON codecs for each connection
    )

    logger.info(
        "PostgreSQL pool initialized",
        extra={
            "min_size": settings.db_pool_min_size,
            "max_size": settings.db_pool_max_size,
            "max_inactive_connection_lifetime": settings.db_pool_max_lifetime_sec,
        },
    )

    return _pool


async def get_postgres_pool() -> asyncpg.Pool:
    """Return the initialized pool or raise if not initialized."""

    if _pool is None:
        raise RuntimeError("PostgreSQL pool has not been initialized. Call init_postgres_pool first.")
    return _pool


async def close_postgres_pool() -> None:
    """Close and reset the pool."""

    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("PostgreSQL pool closed")


async def postgres_healthcheck(timeout: float = 1.0) -> bool:
    """Run a lightweight health check (SELECT 1)."""

    pool = await init_postgres_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            result = await conn.fetchval("SELECT 1")
            return result == 1
