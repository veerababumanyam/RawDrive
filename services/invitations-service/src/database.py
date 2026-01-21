"""
Database connection module for PostgreSQL with PgBouncer support.

Supports PgBouncer routing for 5000+ concurrent user scaling.
"""

from __future__ import annotations

from typing import AsyncGenerator, Optional, List
from urllib.parse import urlparse, urlunparse
import asyncpg
import logging
from contextlib import asynccontextmanager

from src.config import settings

logger = logging.getLogger(__name__)

# Connection pool
_pool: Optional[asyncpg.Pool] = None


def _build_database_url(database_url: str) -> str:
    """Build database URL with optional PgBouncer routing."""
    url = database_url

    # Normalize SQLAlchemy DSN to standard PostgreSQL format
    if url.startswith("postgresql+asyncpg://"):
        url = url.replace("postgresql+asyncpg://", "postgresql://", 1)

    if not settings.PGBOUNCER_ENABLED:
        return url

    try:
        parsed = urlparse(url)
        netloc = f"{parsed.username}:{parsed.password}@{settings.PGBOUNCER_HOST}:{settings.PGBOUNCER_PORT}"
        pgbouncer_url = urlunparse((
            parsed.scheme,
            netloc,
            parsed.path,
            parsed.params,
            parsed.query,
            parsed.fragment,
        ))

        logger.info(f"PgBouncer enabled - routing to {settings.PGBOUNCER_HOST}:{settings.PGBOUNCER_PORT}")
        return pgbouncer_url

    except Exception as e:
        logger.warning(f"Failed to construct PgBouncer URL, falling back to direct connection: {e}")
        return url


async def get_pool() -> asyncpg.Pool:
    """Get or create the database connection pool."""
    global _pool
    if _pool is None:
        database_url = _build_database_url(settings.DATABASE_URL)
        _pool = await asyncpg.create_pool(
            database_url,
            min_size=settings.DB_POOL_MIN_SIZE,
            max_size=settings.DB_POOL_MAX_SIZE,
            command_timeout=settings.DB_COMMAND_TIMEOUT,
            # CRITICAL: PgBouncer compatibility - disable statement caching
            # This was previously missing and would cause errors with PgBouncer
            statement_cache_size=0,
        )
        logger.info(
            f"Database pool created (min={settings.DB_POOL_MIN_SIZE}, "
            f"max={settings.DB_POOL_MAX_SIZE}, pgbouncer={settings.PGBOUNCER_ENABLED})"
        )
    return _pool


async def close_pool():
    """Close the database connection pool."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


@asynccontextmanager
async def get_connection() -> AsyncGenerator[asyncpg.Connection, None]:
    """Get a database connection from the pool."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        yield conn


async def execute(query: str, *args) -> str:
    """Execute a query and return the status."""
    async with get_connection() as conn:
        return await conn.execute(query, *args)


async def fetch(query: str, *args) -> List[asyncpg.Record]:
    """Execute a query and return all rows."""
    async with get_connection() as conn:
        return await conn.fetch(query, *args)


async def fetchrow(query: str, *args) -> Optional[asyncpg.Record]:
    """Execute a query and return a single row."""
    async with get_connection() as conn:
        return await conn.fetchrow(query, *args)


async def fetchval(query: str, *args):
    """Execute a query and return a single value."""
    async with get_connection() as conn:
        return await conn.fetchval(query, *args)


# Alias for backward compatibility
get_postgres_pool = get_pool
