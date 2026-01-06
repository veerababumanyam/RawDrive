"""
Database connection module for PostgreSQL with PgBouncer support.

Optimized for 50K concurrent gallery views with:
- Connection pooling (up to 100 connections per pod)
- Read replica support for public endpoints
- Async operations with asyncpg
"""

from __future__ import annotations

from typing import AsyncGenerator, Optional, List
import asyncpg
from contextlib import asynccontextmanager

from src.config import settings
from src.logging import get_logger

logger = get_logger(__name__)

# Connection pools
_pool: Optional[asyncpg.Pool] = None
_read_pool: Optional[asyncpg.Pool] = None


async def get_pool() -> asyncpg.Pool:
    """Get or create the primary database connection pool."""
    global _pool
    if _pool is None:
        logger.info("Creating primary database connection pool")
        _pool = await asyncpg.create_pool(
            settings.DATABASE_URL,
            min_size=settings.DB_POOL_MIN_SIZE,
            max_size=settings.DB_POOL_MAX_SIZE,
            command_timeout=settings.DB_COMMAND_TIMEOUT,
            # PgBouncer compatibility
            statement_cache_size=0,
        )
        logger.info(
            "Primary pool created",
            extra={
                "min_size": settings.DB_POOL_MIN_SIZE,
                "max_size": settings.DB_POOL_MAX_SIZE,
            }
        )
    return _pool


async def get_read_pool() -> asyncpg.Pool:
    """Get or create the read replica connection pool.

    Falls back to primary pool if no read replica configured.
    """
    global _read_pool

    # Use primary if no read replica configured
    if not settings.DATABASE_READ_REPLICA_URL:
        return await get_pool()

    if _read_pool is None:
        logger.info("Creating read replica connection pool")
        _read_pool = await asyncpg.create_pool(
            settings.DATABASE_READ_REPLICA_URL,
            min_size=settings.DB_POOL_MIN_SIZE,
            max_size=settings.DB_POOL_MAX_SIZE,
            command_timeout=settings.DB_COMMAND_TIMEOUT,
            statement_cache_size=0,
        )
        logger.info("Read replica pool created")
    return _read_pool


async def close_pool():
    """Close all database connection pools."""
    global _pool, _read_pool
    if _pool:
        await _pool.close()
        _pool = None
        logger.info("Primary pool closed")
    if _read_pool:
        await _read_pool.close()
        _read_pool = None
        logger.info("Read replica pool closed")


@asynccontextmanager
async def get_connection(read_only: bool = False) -> AsyncGenerator[asyncpg.Connection, None]:
    """Get a database connection from the appropriate pool.

    Args:
        read_only: If True, uses read replica pool (for public gallery views)
    """
    pool = await get_read_pool() if read_only else await get_pool()
    async with pool.acquire() as conn:
        yield conn


async def execute(query: str, *args, read_only: bool = False) -> str:
    """Execute a query and return the status."""
    async with get_connection(read_only=read_only) as conn:
        return await conn.execute(query, *args)


async def fetch(query: str, *args, read_only: bool = False) -> List[asyncpg.Record]:
    """Execute a query and return all rows."""
    async with get_connection(read_only=read_only) as conn:
        return await conn.fetch(query, *args)


async def fetchrow(query: str, *args, read_only: bool = False) -> Optional[asyncpg.Record]:
    """Execute a query and return a single row."""
    async with get_connection(read_only=read_only) as conn:
        return await conn.fetchrow(query, *args)


async def fetchval(query: str, *args, read_only: bool = False):
    """Execute a query and return a single value."""
    async with get_connection(read_only=read_only) as conn:
        return await conn.fetchval(query, *args)


async def get_pool_stats() -> dict:
    """Get connection pool statistics for monitoring."""
    pool = await get_pool()
    stats = {
        "primary": {
            "size": pool.get_size(),
            "min_size": pool.get_min_size(),
            "max_size": pool.get_max_size(),
            "free_size": pool.get_idle_size(),
        }
    }

    if settings.DATABASE_READ_REPLICA_URL and _read_pool:
        stats["read_replica"] = {
            "size": _read_pool.get_size(),
            "min_size": _read_pool.get_min_size(),
            "max_size": _read_pool.get_max_size(),
            "free_size": _read_pool.get_idle_size(),
        }

    return stats
