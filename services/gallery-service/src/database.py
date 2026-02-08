"""
Database connection module for PostgreSQL with PgBouncer support.

Optimized for 50K concurrent gallery views with:
- Connection pooling (up to 100 connections per pod)
- Read replica support for public endpoints
- Async operations with asyncpg
- PgBouncer routing for 5000+ concurrent user scaling

This module wraps @rawdrive/database-utils for service-specific configuration.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import AsyncGenerator, Optional, List
from contextlib import asynccontextmanager
import asyncpg

# Add database-utils to path for import
# In production, this would be handled by PYTHONPATH in the container
_packages_path = Path(__file__).parent.parent.parent.parent.parent / "packages" / "database-utils" / "python"
if str(_packages_path) not in sys.path:
    sys.path.insert(0, str(_packages_path))

from database_utils import (
    DatabasePool,
    PoolConfig,
    PoolStats as DBPoolStats,
)
from database_utils.dsn import build_pgbouncer_dsn

from src.config import settings
from src.log_config import get_logger

logger = get_logger(__name__)

# Global pool instance
_pool_instance: Optional[DatabasePool] = None


def _create_pool_config() -> PoolConfig:
    """Create pool configuration from service settings."""
    return PoolConfig(
        database_url=settings.DATABASE_URL,
        min_size=settings.DB_POOL_MIN_SIZE,
        max_size=settings.DB_POOL_MAX_SIZE,
        command_timeout=settings.DB_COMMAND_TIMEOUT,
        pgbouncer_enabled=settings.PGBOUNCER_ENABLED,
        pgbouncer_host=settings.PGBOUNCER_HOST,
        pgbouncer_port=settings.PGBOUNCER_PORT,
        application_name="gallery-service",
    )


async def get_pool() -> asyncpg.Pool:
    """Get or create the primary database connection pool."""
    global _pool_instance

    if _pool_instance is None:
        config = _create_pool_config()
        _pool_instance = DatabasePool(config)
        await _pool_instance.initialize()

        # Initialize read replica if configured
        if settings.DATABASE_READ_REPLICA_URL:
            await _pool_instance.initialize_read_replica(settings.DATABASE_READ_REPLICA_URL)

        logger.info(
            "Database pools initialized via @rawdrive/database-utils",
            extra={
                "min_size": config.min_size,
                "max_size": config.max_size,
                "pgbouncer_enabled": config.pgbouncer_enabled,
            }
        )

    return _pool_instance.get_pool(read_only=False)


async def get_read_pool() -> asyncpg.Pool:
    """Get or create the read replica connection pool.

    Falls back to primary pool if no read replica configured.
    """
    global _pool_instance

    if _pool_instance is None:
        await get_pool()  # Initialize pools

    return _pool_instance.get_pool(read_only=True)


async def close_pool():
    """Close all database connection pools."""
    global _pool_instance
    if _pool_instance:
        await _pool_instance.close()
        _pool_instance = None
        logger.info("Database pools closed")


@asynccontextmanager
async def get_connection(read_only: bool = False) -> AsyncGenerator[asyncpg.Connection, None]:
    """Get a database connection from the appropriate pool.

    Args:
        read_only: If True, uses read replica pool (for public gallery views)
    """
    global _pool_instance

    if _pool_instance is None:
        await get_pool()  # Initialize pools

    async with _pool_instance.acquire(read_only=read_only) as conn:
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
    global _pool_instance

    if _pool_instance is None:
        return {"error": "Pool not initialized"}

    return await _pool_instance.get_stats()


# Compatibility alias for backward compatibility with xmp_sync endpoints
get_database = get_connection
