"""
Database connection management using asyncpg.

Provides connection pooling for primary database and optional read replicas.
All queries MUST include workspace_id for multi-tenant isolation.
Supports PgBouncer routing for 5000+ concurrent user scaling.
"""

import asyncpg
import logging
from typing import Optional
from contextlib import asynccontextmanager
from urllib.parse import urlparse, urlunparse

from src.config import settings

logger = logging.getLogger(__name__)

# Global connection pools
_pool: Optional[asyncpg.Pool] = None
_read_pool: Optional[asyncpg.Pool] = None


def _build_database_url(database_url: str) -> str:
    """
    Build database URL with optional PgBouncer routing.

    When PGBOUNCER_ENABLED=true, routes connections through PgBouncer
    connection pooler instead of directly to PostgreSQL.
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
    """
    Get or create the primary database connection pool.

    The primary pool is used for:
    - All write operations (INSERT, UPDATE, DELETE)
    - Consistent read operations
    - Transactions

    Returns:
        asyncpg.Pool: Primary database connection pool
    """
    global _pool
    if _pool is None:
        database_url = _build_database_url(settings.DATABASE_URL)
        _pool = await asyncpg.create_pool(
            database_url,
            min_size=settings.DB_POOL_MIN_SIZE,
            max_size=settings.DB_POOL_MAX_SIZE,
            command_timeout=settings.DB_COMMAND_TIMEOUT,
            statement_cache_size=settings.DB_STATEMENT_CACHE_SIZE,
            # Connection initialization
            server_settings={
                "application_name": settings.SERVICE_NAME,
            },
        )
        logger.info(
            f"Primary pool created (pgbouncer={settings.PGBOUNCER_ENABLED})"
        )
    return _pool


async def get_read_pool() -> asyncpg.Pool:
    """
    Get or create the read replica connection pool.

    The read pool is used for:
    - Read-heavy public endpoints (client lists, search)
    - Analytics and reporting
    - Fallback to primary if no replica configured

    Returns:
        asyncpg.Pool: Read replica pool or primary pool if no replica
    """
    global _read_pool

    # If no read replica configured, use primary pool
    if not settings.DATABASE_READ_REPLICA_URL:
        return await get_pool()

    if _read_pool is None:
        database_url = _build_database_url(settings.DATABASE_READ_REPLICA_URL)
        _read_pool = await asyncpg.create_pool(
            database_url,
            min_size=settings.DB_POOL_MIN_SIZE,
            max_size=settings.DB_POOL_MAX_SIZE,
            command_timeout=settings.DB_COMMAND_TIMEOUT,
            statement_cache_size=settings.DB_STATEMENT_CACHE_SIZE,
            server_settings={
                "application_name": f"{settings.SERVICE_NAME}-read",
            },
        )
        logger.info(
            f"Read replica pool created (pgbouncer={settings.PGBOUNCER_ENABLED})"
        )
    return _read_pool


async def close_pool() -> None:
    """
    Close all database connection pools.

    Called during application shutdown to gracefully close connections.
    """
    global _pool, _read_pool

    if _pool is not None:
        await _pool.close()
        _pool = None

    if _read_pool is not None:
        await _read_pool.close()
        _read_pool = None


@asynccontextmanager
async def get_connection(read_only: bool = False):
    """
    Context manager for acquiring a database connection.

    Usage:
        async with get_connection() as conn:
            await conn.fetch("SELECT * FROM clients WHERE workspace_id = $1", workspace_id)

        async with get_connection(read_only=True) as conn:
            await conn.fetch("SELECT * FROM clients WHERE workspace_id = $1", workspace_id)

    Args:
        read_only: If True, use read replica pool (falls back to primary if unavailable)

    Yields:
        asyncpg.Connection: Database connection from pool
    """
    pool = await get_read_pool() if read_only else await get_pool()
    async with pool.acquire() as connection:
        yield connection


@asynccontextmanager
async def get_transaction():
    """
    Context manager for database transactions.

    Usage:
        async with get_transaction() as conn:
            await conn.execute("INSERT INTO clients ...")
            await conn.execute("INSERT INTO client_contacts ...")
            # Automatically commits on success, rolls back on exception

    Yields:
        asyncpg.Connection: Database connection with active transaction
    """
    pool = await get_pool()
    async with pool.acquire() as connection:
        async with connection.transaction():
            yield connection


async def execute_query(
    query: str,
    *args,
    read_only: bool = False,
    fetch_one: bool = False,
    fetch_all: bool = True,
):
    """
    Execute a database query with automatic connection management.

    Args:
        query: SQL query string
        *args: Query parameters
        read_only: Use read replica if True
        fetch_one: Return single row
        fetch_all: Return all rows (default)

    Returns:
        Query results based on fetch_one/fetch_all

    Example:
        # Fetch all
        clients = await execute_query(
            "SELECT * FROM clients WHERE workspace_id = $1",
            workspace_id
        )

        # Fetch one
        client = await execute_query(
            "SELECT * FROM clients WHERE client_id = $1",
            client_id,
            fetch_one=True
        )

        # Execute (no fetch)
        await execute_query(
            "UPDATE clients SET status = $1 WHERE client_id = $2",
            "active",
            client_id,
            fetch_all=False
        )
    """
    async with get_connection(read_only=read_only) as conn:
        if fetch_one:
            return await conn.fetchrow(query, *args)
        elif fetch_all:
            return await conn.fetch(query, *args)
        else:
            return await conn.execute(query, *args)


async def check_database_connection() -> bool:
    """
    Check if database connection is healthy.

    Used by health check endpoints.

    Returns:
        bool: True if database is accessible
    """
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return True
    except Exception:
        return False
