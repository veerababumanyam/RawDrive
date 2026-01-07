"""
Database connection module for PostgreSQL with asyncpg connection pool.

Optimized for high-volume notification processing with:
- Connection pooling (configurable 10-50 connections per pod)
- Read replica support for preference lookups and analytics
- Async operations with asyncpg
- PgBouncer compatibility (disabled prepared statement caching)
- Transaction support for multi-table operations
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator, List, Optional

import asyncpg

from src.config import settings

# Use standard logging until log_config module is fully implemented
logger = logging.getLogger(__name__)

# Connection pools (module-level singletons)
_pool: Optional[asyncpg.Pool] = None
_read_pool: Optional[asyncpg.Pool] = None


async def get_pool() -> asyncpg.Pool:
    """Get or create the primary database connection pool.

    Used for all write operations and transactional reads.

    Returns:
        asyncpg.Pool: The primary database connection pool.

    Raises:
        asyncpg.PostgresError: If connection fails.
    """
    global _pool
    if _pool is None:
        logger.info("Creating primary database connection pool")
        _pool = await asyncpg.create_pool(
            settings.DATABASE_URL,
            min_size=settings.DB_POOL_MIN_SIZE,
            max_size=settings.DB_POOL_MAX_SIZE,
            command_timeout=settings.DB_COMMAND_TIMEOUT,
            # PgBouncer compatibility - disable prepared statement caching
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

    Used for read-only operations like:
    - Fetching user notification preferences
    - Analytics queries
    - Template lookups

    Falls back to primary pool if no read replica is configured.

    Returns:
        asyncpg.Pool: The read replica connection pool (or primary as fallback).
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


async def close_pools() -> None:
    """Close all database connection pools.

    Should be called during application shutdown to cleanly
    release all database connections.
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
async def get_connection(
    read_only: bool = False
) -> AsyncGenerator[asyncpg.Connection, None]:
    """Get a database connection from the appropriate pool.

    Args:
        read_only: If True, uses read replica pool for scalable reads.
                   Default False uses primary for writes.

    Yields:
        asyncpg.Connection: A database connection.

    Example:
        async with get_connection() as conn:
            await conn.execute("INSERT INTO ...")

        async with get_connection(read_only=True) as conn:
            result = await conn.fetch("SELECT ...")
    """
    pool = await get_read_pool() if read_only else await get_pool()
    async with pool.acquire() as conn:
        yield conn


@asynccontextmanager
async def transaction() -> AsyncGenerator[asyncpg.Connection, None]:
    """Get a database connection with an active transaction.

    Useful for multi-table operations that need atomicity, such as:
    - Creating notification events with delivery logs
    - Updating preferences across multiple tables

    Automatically commits on success, rolls back on exception.

    Yields:
        asyncpg.Connection: A connection with an active transaction.

    Example:
        async with transaction() as conn:
            await conn.execute("INSERT INTO notification_events ...")
            await conn.execute("INSERT INTO notification_delivery_log ...")
            # Auto-commits if no exception
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            yield conn


async def execute(
    query: str,
    *args: Any,
    read_only: bool = False
) -> str:
    """Execute a query and return the status string.

    Args:
        query: SQL query with $1, $2... placeholders.
        *args: Query parameters.
        read_only: Use read replica if True.

    Returns:
        str: Command status (e.g., "INSERT 0 1").
    """
    async with get_connection(read_only=read_only) as conn:
        return await conn.execute(query, *args)


async def executemany(
    query: str,
    args: List[tuple],
) -> None:
    """Execute a query for each set of arguments (batch insert/update).

    Args:
        query: SQL query with $1, $2... placeholders.
        args: List of tuples, each containing query parameters.

    Example:
        await executemany(
            "INSERT INTO delivery_log (event_id, status) VALUES ($1, $2)",
            [(uuid1, "pending"), (uuid2, "pending"), (uuid3, "pending")]
        )
    """
    async with get_connection() as conn:
        await conn.executemany(query, args)


async def fetch(
    query: str,
    *args: Any,
    read_only: bool = False
) -> List[asyncpg.Record]:
    """Execute a query and return all matching rows.

    Args:
        query: SQL query with $1, $2... placeholders.
        *args: Query parameters.
        read_only: Use read replica if True.

    Returns:
        List[asyncpg.Record]: All matching rows.
    """
    async with get_connection(read_only=read_only) as conn:
        return await conn.fetch(query, *args)


async def fetchrow(
    query: str,
    *args: Any,
    read_only: bool = False
) -> Optional[asyncpg.Record]:
    """Execute a query and return a single row.

    Args:
        query: SQL query with $1, $2... placeholders.
        *args: Query parameters.
        read_only: Use read replica if True.

    Returns:
        Optional[asyncpg.Record]: The first matching row, or None.
    """
    async with get_connection(read_only=read_only) as conn:
        return await conn.fetchrow(query, *args)


async def fetchval(
    query: str,
    *args: Any,
    read_only: bool = False,
    column: int = 0
) -> Any:
    """Execute a query and return a single value.

    Args:
        query: SQL query with $1, $2... placeholders.
        *args: Query parameters.
        read_only: Use read replica if True.
        column: Column index to return (default 0).

    Returns:
        Any: The value from the specified column of the first row.
    """
    async with get_connection(read_only=read_only) as conn:
        return await conn.fetchval(query, *args, column=column)


async def get_pool_stats() -> dict:
    """Get connection pool statistics for health checks and monitoring.

    Returns:
        dict: Pool statistics including size, idle connections, etc.

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


async def check_health() -> dict:
    """Check database connectivity for health endpoints.

    Returns:
        dict: Health status with connection test results.

    Example response:
        {
            "status": "healthy",
            "primary": {"connected": True, "latency_ms": 1.2},
            "read_replica": {"connected": True, "latency_ms": 0.8}
        }
    """
    import time

    result = {
        "status": "healthy",
        "primary": {"connected": False, "latency_ms": None},
    }

    # Check primary connection
    try:
        start = time.perf_counter()
        async with get_connection() as conn:
            await conn.fetchval("SELECT 1")
        result["primary"]["connected"] = True
        result["primary"]["latency_ms"] = round((time.perf_counter() - start) * 1000, 2)
    except Exception as e:
        result["status"] = "unhealthy"
        result["primary"]["error"] = str(e)
        logger.error(f"Primary database health check failed: {e}")

    # Check read replica if configured
    if settings.DATABASE_READ_REPLICA_URL:
        result["read_replica"] = {"connected": False, "latency_ms": None}
        try:
            start = time.perf_counter()
            async with get_connection(read_only=True) as conn:
                await conn.fetchval("SELECT 1")
            result["read_replica"]["connected"] = True
            result["read_replica"]["latency_ms"] = round((time.perf_counter() - start) * 1000, 2)
        except Exception as e:
            # Read replica failure is degraded, not unhealthy
            result["status"] = "degraded" if result["status"] == "healthy" else "unhealthy"
            result["read_replica"]["error"] = str(e)
            logger.warning(f"Read replica health check failed: {e}")

    return result
