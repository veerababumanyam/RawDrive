"""
Database connection module for Sync Service.

Provides asyncpg connection pool management for PostgreSQL.
Placeholder - full implementation in T009.
"""

from typing import Optional
import asyncpg

from src.config import settings
from src.logging import get_logger

logger = get_logger(__name__)

_pool: Optional[asyncpg.Pool] = None


async def get_pool() -> asyncpg.Pool:
    """
    Get or create the database connection pool.

    Returns:
        asyncpg.Pool: The database connection pool.
    """
    global _pool
    if _pool is None:
        logger.info("Creating database connection pool...")
        _pool = await asyncpg.create_pool(
            dsn=settings.DATABASE_URL,
            min_size=settings.DB_POOL_MIN_SIZE,
            max_size=settings.DB_POOL_MAX_SIZE,
            command_timeout=settings.DB_COMMAND_TIMEOUT,
        )
        logger.info("Database connection pool created")
    return _pool


async def close_pool() -> None:
    """Close the database connection pool."""
    global _pool
    if _pool is not None:
        logger.info("Closing database connection pool...")
        await _pool.close()
        _pool = None
        logger.info("Database connection pool closed")
