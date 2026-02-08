"""
Database connection module for PostgreSQL with PgBouncer support.

Optimized for growth service workloads with:
- Connection pooling (up to 50 connections per pod)
- Read replica support for analytics queries (partner dashboards, conversion stats)
- Async operations with asyncpg
- PgBouncer routing for 5000+ concurrent user scaling
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator, List, Optional
from urllib.parse import urlparse, urlunparse

import asyncpg

from src.config import settings

logger = logging.getLogger(__name__)

# Connection pools
_pool: Optional[asyncpg.Pool] = None
_read_pool: Optional[asyncpg.Pool] = None


def _build_database_url(database_url: str) -> str:
    """Build database URL with optional PgBouncer routing.

    When PGBOUNCER_ENABLED=true, routes connections through PgBouncer
    connection pooler instead of directly to PostgreSQL.

    Args:
        database_url: The original database connection URL

    Returns:
        Modified URL pointing to PgBouncer if enabled, otherwise original URL
    """
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
            f"PgBouncer enabled - routing to {settings.PGBOUNCER_HOST}:{settings.PGBOUNCER_PORT}"
        )
        return pgbouncer_url

    except Exception as e:
        logger.warning(f"Failed to construct PgBouncer URL, falling back to direct connection: {e}")
        return url


async def get_pool() -> asyncpg.Pool:
    """Get or create the primary database connection pool.

    The pool is configured with:
    - Min/max connections from settings
    - Command timeout for long-running queries
    - Statement cache disabled for PgBouncer compatibility

    Returns:
        The asyncpg connection pool instance
    """
    global _pool
    if _pool is None:
        database_url = _build_database_url(settings.DATABASE_URL)
        logger.info("Creating primary database connection pool")
        _pool = await asyncpg.create_pool(
            database_url,
            min_size=settings.DB_POOL_MIN_SIZE,
            max_size=settings.DB_POOL_MAX_SIZE,
            command_timeout=settings.DB_COMMAND_TIMEOUT,
            # PgBouncer compatibility - disable statement caching
            # This is required because PgBouncer may route queries to different
            # backend connections, making prepared statements invalid
            statement_cache_size=0,
        )
        logger.info(
            f"Primary pool created (min={settings.DB_POOL_MIN_SIZE}, "
            f"max={settings.DB_POOL_MAX_SIZE}, pgbouncer={settings.PGBOUNCER_ENABLED})"
        )
    return _pool


async def get_read_pool() -> asyncpg.Pool:
    """Get or create the read replica connection pool.

    Used for read-heavy operations like:
    - Partner dashboard analytics
    - Referral conversion statistics
    - Credit transaction history queries

    Falls back to primary pool if no read replica is configured.

    Returns:
        The read replica asyncpg connection pool (or primary pool as fallback)
    """
    global _read_pool

    # Use primary if no read replica configured
    if not settings.DATABASE_READ_REPLICA_URL:
        return await get_pool()

    if _read_pool is None:
        database_url = _build_database_url(settings.DATABASE_READ_REPLICA_URL)
        logger.info("Creating read replica connection pool")
        _read_pool = await asyncpg.create_pool(
            database_url,
            min_size=settings.DB_POOL_MIN_SIZE,
            max_size=settings.DB_POOL_MAX_SIZE,
            command_timeout=settings.DB_COMMAND_TIMEOUT,
            statement_cache_size=0,
        )
        logger.info(f"Read replica pool created (pgbouncer={settings.PGBOUNCER_ENABLED})")
    return _read_pool


async def close_pool() -> None:
    """Close all database connection pools.

    Should be called during application shutdown to cleanly release
    all database connections.
    """
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
        read_only: If True, uses read replica pool for analytics/reporting queries.
                   Default False uses primary pool for writes.

    Yields:
        An asyncpg connection from the pool

    Example:
        async with get_connection() as conn:
            await conn.execute("INSERT INTO ...")

        async with get_connection(read_only=True) as conn:
            rows = await conn.fetch("SELECT * FROM partner_stats WHERE ...")
    """
    pool = await get_read_pool() if read_only else await get_pool()
    async with pool.acquire() as conn:
        yield conn


@asynccontextmanager
async def transaction() -> AsyncGenerator[asyncpg.Connection, None]:
    """Get a database connection with an active transaction.

    Automatically commits on success, rolls back on exception.
    Essential for credit ledger operations to maintain ACID compliance.

    Yields:
        An asyncpg connection with active transaction

    Example:
        async with transaction() as conn:
            await conn.execute("INSERT INTO user_credits ...")
            await conn.execute("INSERT INTO credit_transactions ...")
    """
    async with get_connection() as conn:
        async with conn.transaction():
            yield conn


async def execute(query: str, *args, read_only: bool = False) -> str:
    """Execute a query and return the status.

    Args:
        query: SQL query to execute
        *args: Query parameters
        read_only: Use read replica if True

    Returns:
        Command status string (e.g., "INSERT 0 1")
    """
    async with get_connection(read_only=read_only) as conn:
        return await conn.execute(query, *args)


async def fetch(query: str, *args, read_only: bool = False) -> List[asyncpg.Record]:
    """Execute a query and return all rows.

    Args:
        query: SQL query to execute
        *args: Query parameters
        read_only: Use read replica if True (recommended for SELECT queries)

    Returns:
        List of asyncpg Record objects
    """
    async with get_connection(read_only=read_only) as conn:
        return await conn.fetch(query, *args)


async def fetchrow(query: str, *args, read_only: bool = False) -> Optional[asyncpg.Record]:
    """Execute a query and return a single row.

    Args:
        query: SQL query to execute
        *args: Query parameters
        read_only: Use read replica if True

    Returns:
        Single asyncpg Record or None if no results
    """
    async with get_connection(read_only=read_only) as conn:
        return await conn.fetchrow(query, *args)


async def fetchval(query: str, *args, read_only: bool = False):
    """Execute a query and return a single value.

    Args:
        query: SQL query to execute
        *args: Query parameters
        read_only: Use read replica if True

    Returns:
        Single value from first column of first row
    """
    async with get_connection(read_only=read_only) as conn:
        return await conn.fetchval(query, *args)


async def get_pool_stats() -> dict:
    """Get connection pool statistics for monitoring and health checks.

    Returns:
        Dictionary containing pool size, free connections, and min/max settings
        for both primary and read replica pools.

    Example response:
        {
            "primary": {
                "size": 10,
                "min_size": 10,
                "max_size": 50,
                "free_size": 8
            },
            "read_replica": {
                "size": 10,
                "min_size": 10,
                "max_size": 50,
                "free_size": 9
            }
        }
    """
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


async def check_connection() -> bool:
    """Check if database connection is healthy.

    Used by health check endpoints to verify database connectivity.

    Returns:
        True if connection is healthy, False otherwise
    """
    try:
        result = await fetchval("SELECT 1")
        return result == 1
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return False
