"""Database connection management for AI Service.

Handles connection pooling for PostgreSQL using asyncpg.
"""
import os
import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import asyncpg

logger = logging.getLogger(__name__)

# Global pool instance
_pool: asyncpg.Pool | None = None


async def get_db_pool() -> asyncpg.Pool:
    """Get or create the database connection pool.
    
    Pool settings are configurable via environment variables for different workloads.
    """
    global _pool
    
    if _pool is None:
        database_url = os.getenv("DATABASE_URL")
        if not database_url:
            raise ValueError("DATABASE_URL environment variable is not set")
        
        # Configurable pool settings with sensible defaults for AI service
        min_size = int(os.getenv("DB_POOL_MIN_SIZE", "2"))
        max_size = int(os.getenv("DB_POOL_MAX_SIZE", "10"))
        command_timeout = int(os.getenv("DB_COMMAND_TIMEOUT", "60"))
        max_inactive_lifetime = float(os.getenv("DB_MAX_INACTIVE_LIFETIME", "300"))  # 5 minutes
        
        logger.info(f"Initializing database connection pool (min={min_size}, max={max_size}, timeout={command_timeout}s)")
        try:
            _pool = await asyncpg.create_pool(
                database_url,
                min_size=min_size,
                max_size=max_size,
                command_timeout=command_timeout,
                max_inactive_connection_lifetime=max_inactive_lifetime,
            )
            logger.info("Database connection pool initialized successfully")
        except Exception as e:
            logger.error(f"Failed to create database pool: {e}")
            raise

    return _pool


@asynccontextmanager
async def get_db_conn() -> AsyncGenerator[asyncpg.Connection, None]:
    """Get a database connection from the pool.
    
    Yields:
        asyncpg.Connection: Database connection
    """
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        yield conn


async def close_db_pool() -> None:
    """Close the database connection pool."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        logger.info("Database connection pool closed")
