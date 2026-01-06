"""Database connection pooling with asyncpg."""

import asyncpg
from contextlib import asynccontextmanager
from typing import Optional

from src.config import settings
from src.logging import get_logger

logger = get_logger(__name__)

# Global connection pool
_pool: Optional[asyncpg.Pool] = None


async def get_pool() -> asyncpg.Pool:
    """Get or create the database connection pool."""
    global _pool
    if _pool is None:
        logger.info(
            "Creating database connection pool",
            extra={
                "min_size": settings.DB_POOL_MIN_SIZE,
                "max_size": settings.DB_POOL_MAX_SIZE,
            },
        )
        _pool = await asyncpg.create_pool(
            settings.DATABASE_URL,
            min_size=settings.DB_POOL_MIN_SIZE,
            max_size=settings.DB_POOL_MAX_SIZE,
            command_timeout=settings.DB_COMMAND_TIMEOUT,
            # PgBouncer compatibility
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
