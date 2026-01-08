"""Database connection pooling with asyncpg.

Supports PgBouncer routing for 5000+ concurrent user scaling.
"""

import asyncpg
from contextlib import asynccontextmanager
from typing import Optional
from urllib.parse import urlparse, urlunparse

from src.config import settings
from src.logging import get_logger

logger = get_logger(__name__)

# Global connection pool
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

        logger.info(
            "PgBouncer enabled - routing connections through pooler",
            extra={
                "pgbouncer_host": settings.PGBOUNCER_HOST,
                "pgbouncer_port": settings.PGBOUNCER_PORT,
            },
        )
        return pgbouncer_url

    except Exception as e:
        logger.warning(f"Failed to construct PgBouncer URL, falling back to direct connection: {e}")
        return url


async def get_pool() -> asyncpg.Pool:
    """Get or create the database connection pool."""
    global _pool
    if _pool is None:
        database_url = _build_database_url(settings.DATABASE_URL)
        logger.info(
            "Creating database connection pool",
            extra={
                "min_size": settings.DB_POOL_MIN_SIZE,
                "max_size": settings.DB_POOL_MAX_SIZE,
                "pgbouncer_enabled": settings.PGBOUNCER_ENABLED,
            },
        )
        _pool = await asyncpg.create_pool(
            database_url,
            min_size=settings.DB_POOL_MIN_SIZE,
            max_size=settings.DB_POOL_MAX_SIZE,
            command_timeout=settings.DB_COMMAND_TIMEOUT,
            # PgBouncer compatibility - disable statement caching
            statement_cache_size=0,
        )
        logger.info("Database connection pool created successfully")
    return _pool


async def close_pool() -> None:
    """Close the database connection pool."""
    global _pool
    if _pool is not None:
        logger.info("Closing database connection pool")
        await _pool.close()
        _pool = None
        logger.info("Database connection pool closed")


@asynccontextmanager
async def get_connection():
    """Get a database connection from the pool."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        yield conn


async def execute_query(query: str, *args):
    """Execute a query and return results."""
    async with get_connection() as conn:
        return await conn.fetch(query, *args)


async def execute_one(query: str, *args):
    """Execute a query and return first result."""
    async with get_connection() as conn:
        return await conn.fetchrow(query, *args)


async def execute_command(query: str, *args):
    """Execute a command (INSERT/UPDATE/DELETE) without returning results."""
    async with get_connection() as conn:
        return await conn.execute(query, *args)
