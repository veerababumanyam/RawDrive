"""
Database Connection Pool Management.

Provides unified connection pooling with PgBouncer support
for all RawDrive microservices.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any, AsyncIterator, Callable, Optional, TypeVar

import asyncpg
from asyncpg import Connection, Pool
from asyncpg.transaction import Transaction

from .constants import IsolationLevel, POOL_DEFAULTS
from .dsn import build_pgbouncer_dsn, normalize_database_url

logger = logging.getLogger(__name__)

T = TypeVar("T")


@dataclass
class PoolConfig:
    """Configuration for database connection pool."""

    database_url: str
    min_size: int = POOL_DEFAULTS.MIN_SIZE
    max_size: int = POOL_DEFAULTS.MAX_SIZE
    command_timeout: int = POOL_DEFAULTS.COMMAND_TIMEOUT
    max_inactive_connection_lifetime: int = POOL_DEFAULTS.MAX_INACTIVE_CONNECTION_LIFETIME
    pgbouncer_enabled: bool = False
    pgbouncer_host: str = POOL_DEFAULTS.PGBOUNCER_HOST
    pgbouncer_port: int = POOL_DEFAULTS.PGBOUNCER_PORT
    application_name: Optional[str] = None

    @classmethod
    def from_env(cls, prefix: str = "") -> "PoolConfig":
        """
        Create config from environment variables.

        Args:
            prefix: Optional prefix for env vars (e.g., "GALLERY_")

        Returns:
            PoolConfig instance
        """
        import os

        def get_env(key: str, default: Any = None) -> Any:
            return os.environ.get(f"{prefix}{key}", default)

        return cls(
            database_url=get_env("DATABASE_URL", ""),
            min_size=int(get_env("DB_POOL_MIN_SIZE", POOL_DEFAULTS.MIN_SIZE)),
            max_size=int(get_env("DB_POOL_MAX_SIZE", POOL_DEFAULTS.MAX_SIZE)),
            command_timeout=int(get_env("DB_COMMAND_TIMEOUT", POOL_DEFAULTS.COMMAND_TIMEOUT)),
            max_inactive_connection_lifetime=int(
                get_env("DB_POOL_MAX_LIFETIME_SEC", POOL_DEFAULTS.MAX_INACTIVE_CONNECTION_LIFETIME)
            ),
            pgbouncer_enabled=get_env("PGBOUNCER_ENABLED", "false").lower() == "true",
            pgbouncer_host=get_env("PGBOUNCER_HOST", POOL_DEFAULTS.PGBOUNCER_HOST),
            pgbouncer_port=int(get_env("PGBOUNCER_PORT", POOL_DEFAULTS.PGBOUNCER_PORT)),
            application_name=get_env("SERVICE_NAME"),
        )


@dataclass
class PoolStats:
    """Statistics about the connection pool state."""

    size: int
    free_size: int
    used_size: int
    min_size: int
    max_size: int

    @property
    def utilization_percent(self) -> float:
        """Calculate pool utilization as a percentage."""
        if self.size == 0:
            return 0.0
        return (self.used_size / self.size) * 100

    def to_dict(self) -> dict:
        """Convert to dictionary for logging/monitoring."""
        return {
            "size": self.size,
            "free_size": self.free_size,
            "used_size": self.used_size,
            "min_size": self.min_size,
            "max_size": self.max_size,
            "utilization_percent": round(self.utilization_percent, 2),
        }


class DatabasePool:
    """
    Unified database connection pool manager.

    Provides connection pooling with PgBouncer support,
    read replica routing, and health checking.

    Example:
        pool = DatabasePool(config)
        await pool.initialize()

        async with pool.get_connection() as conn:
            result = await conn.fetch("SELECT * FROM users")

        await pool.close()
    """

    def __init__(self, config: PoolConfig):
        """
        Initialize the pool manager.

        Args:
            config: Pool configuration
        """
        self.config = config
        self._pool: Optional[Pool] = None
        self._read_pool: Optional[Pool] = None

    async def initialize(self) -> None:
        """Initialize the primary connection pool."""
        if self._pool is not None:
            return

        dsn = build_pgbouncer_dsn(
            self.config.database_url,
            pgbouncer_host=self.config.pgbouncer_host,
            pgbouncer_port=self.config.pgbouncer_port,
            enabled=self.config.pgbouncer_enabled,
        )

        pool_kwargs: dict = {
            "dsn": dsn,
            "min_size": self.config.min_size,
            "max_size": self.config.max_size,
            "command_timeout": self.config.command_timeout,
            "max_inactive_connection_lifetime": float(self.config.max_inactive_connection_lifetime),
            "init": self._setup_connection,
        }

        # Disable statement caching for PgBouncer compatibility
        if self.config.pgbouncer_enabled:
            pool_kwargs["statement_cache_size"] = 0

        if self.config.application_name:
            pool_kwargs["server_settings"] = {
                "application_name": self.config.application_name,
            }

        self._pool = await asyncpg.create_pool(**pool_kwargs)

        logger.info(
            "PostgreSQL pool initialized",
            extra={
                "min_size": self.config.min_size,
                "max_size": self.config.max_size,
                "pgbouncer_enabled": self.config.pgbouncer_enabled,
            },
        )

    async def initialize_read_replica(self, read_replica_url: str) -> None:
        """
        Initialize a separate pool for read replicas.

        Args:
            read_replica_url: Database URL for read replica
        """
        if self._read_pool is not None:
            return

        dsn = build_pgbouncer_dsn(
            read_replica_url,
            pgbouncer_host=self.config.pgbouncer_host,
            pgbouncer_port=self.config.pgbouncer_port,
            enabled=self.config.pgbouncer_enabled,
        )

        pool_kwargs: dict = {
            "dsn": dsn,
            "min_size": self.config.min_size,
            "max_size": self.config.max_size,
            "command_timeout": self.config.command_timeout,
            "init": self._setup_connection,
        }

        if self.config.pgbouncer_enabled:
            pool_kwargs["statement_cache_size"] = 0

        if self.config.application_name:
            pool_kwargs["server_settings"] = {
                "application_name": f"{self.config.application_name}-read",
            }

        self._read_pool = await asyncpg.create_pool(**pool_kwargs)

        logger.info(
            "Read replica pool initialized",
            extra={"pgbouncer_enabled": self.config.pgbouncer_enabled},
        )

    async def _setup_connection(self, conn: asyncpg.Connection) -> None:
        """Set up JSON/JSONB type codecs for a connection."""
        await conn.set_type_codec(
            'json',
            encoder=json.dumps,
            decoder=json.loads,
            schema='pg_catalog'
        )
        await conn.set_type_codec(
            'jsonb',
            encoder=json.dumps,
            decoder=json.loads,
            schema='pg_catalog'
        )

    async def close(self) -> None:
        """Close all connection pools."""
        if self._pool is not None:
            await self._pool.close()
            self._pool = None
            logger.info("Primary pool closed")

        if self._read_pool is not None:
            await self._read_pool.close()
            self._read_pool = None
            logger.info("Read replica pool closed")

    def get_pool(self, read_only: bool = False) -> Pool:
        """
        Get the appropriate pool.

        Args:
            read_only: If True, returns read replica pool (or primary if not available)

        Returns:
            Connection pool
        """
        if read_only and self._read_pool is not None:
            return self._read_pool

        if self._pool is None:
            raise RuntimeError("Pool not initialized. Call initialize() first.")

        return self._pool

    @asynccontextmanager
    async def acquire(self, read_only: bool = False) -> AsyncIterator[Connection]:
        """
        Acquire a connection from the pool.

        Args:
            read_only: If True, uses read replica pool

        Yields:
            Database connection
        """
        pool = self.get_pool(read_only=read_only)
        async with pool.acquire() as conn:
            yield conn

    async def get_stats(self, include_read_replica: bool = True) -> dict:
        """
        Get connection pool statistics.

        Args:
            include_read_replica: Include read replica stats if available

        Returns:
            Dictionary with pool statistics
        """
        stats = {}

        if self._pool is not None:
            stats["primary"] = PoolStats(
                size=self._pool.get_size(),
                free_size=self._pool.get_idle_size(),
                used_size=self._pool.get_size() - self._pool.get_idle_size(),
                min_size=self._pool.get_min_size(),
                max_size=self._pool.get_max_size(),
            ).to_dict()

        if include_read_replica and self._read_pool is not None:
            stats["read_replica"] = PoolStats(
                size=self._read_pool.get_size(),
                free_size=self._read_pool.get_idle_size(),
                used_size=self._read_pool.get_size() - self._read_pool.get_idle_size(),
                min_size=self._read_pool.get_min_size(),
                max_size=self._read_pool.get_max_size(),
            ).to_dict()

        return stats

    async def healthcheck(self, timeout: float = 1.0) -> bool:
        """
        Run a lightweight health check (SELECT 1).

        Args:
            timeout: Maximum time to wait for health check

        Returns:
            True if healthy, False otherwise
        """
        try:
            async with self.acquire() as conn:
                result = await asyncio.wait_for(
                    conn.fetchval("SELECT 1"),
                    timeout=timeout,
                )
                return result == 1
        except Exception as e:
            logger.warning("Health check failed", extra={"error": str(e)})
            return False


# =============================================================================
# Global Pool Instance (for simple service setup)
# =============================================================================

_pool: Optional[DatabasePool] = None


async def init_pool(config: PoolConfig) -> DatabasePool:
    """
    Initialize the global database pool.

    Args:
        config: Pool configuration

    Returns:
        Initialized DatabasePool instance
    """
    global _pool
    if _pool is None:
        _pool = DatabasePool(config)
        await _pool.initialize()
    return _pool


async def get_pool_instance() -> DatabasePool:
    """Get the global pool instance."""
    if _pool is None:
        raise RuntimeError("Pool not initialized. Call init_pool() first.")
    return _pool


async def close_pool() -> None:
    """Close the global pool."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


@asynccontextmanager
async def get_connection(read_only: bool = False) -> AsyncIterator[Connection]:
    """
    Get a connection from the global pool.

    Args:
        read_only: If True, uses read replica pool

    Yields:
        Database connection
    """
    pool = await get_pool_instance()
    async with pool.acquire(read_only=read_only) as conn:
        yield conn


# =============================================================================
# Transaction Context Managers
# =============================================================================


@asynccontextmanager
async def get_transaction(
    isolation: IsolationLevel = IsolationLevel.READ_COMMITTED,
    readonly: bool = False,
    deferrable: bool = False,
) -> AsyncIterator[Connection]:
    """
    Execute a block of code within a database transaction.

    Automatically handles transaction lifecycle:
    - Acquires a connection from the pool
    - Starts a transaction with specified isolation level
    - Commits on successful completion
    - Rolls back on exception
    - Returns the connection to the pool

    Args:
        isolation: Transaction isolation level
        readonly: If True, the transaction is read-only
        deferrable: If True and readonly=True, allows deferrable serializable transactions

    Yields:
        Connection with active transaction

    Example:
        async with get_transaction() as conn:
            await conn.execute("INSERT INTO users (name) VALUES ($1)", "John")
            await conn.execute("INSERT INTO audit_log (action) VALUES ($1)", "user_created")
    """
    pool = await get_pool_instance()
    started_at = time.monotonic()

    async with pool.acquire() as conn:
        async with conn.transaction(
            isolation=isolation.value,
            readonly=readonly,
            deferrable=deferrable,
        ):
            logger.debug(
                "Transaction started",
                extra={
                    "isolation": isolation.value,
                    "readonly": readonly,
                },
            )
            try:
                yield conn
                elapsed = time.monotonic() - started_at
                logger.debug(
                    "Transaction committed",
                    extra={"elapsed_seconds": elapsed},
                )
            except Exception:
                elapsed = time.monotonic() - started_at
                logger.debug(
                    "Transaction rolled back",
                    extra={"elapsed_seconds": elapsed},
                )
                raise


@asynccontextmanager
async def readonly_transaction(
    isolation: IsolationLevel = IsolationLevel.READ_COMMITTED,
) -> AsyncIterator[Connection]:
    """
    Execute a block of code within a read-only transaction.

    Read-only transactions provide optimization hints to PostgreSQL
    and prevent accidental data modifications.

    Args:
        isolation: Transaction isolation level

    Yields:
        Connection with active read-only transaction
    """
    async with get_transaction(isolation=isolation, readonly=True) as conn:
        yield conn


@asynccontextmanager
async def serializable_transaction(
    readonly: bool = False,
) -> AsyncIterator[Connection]:
    """
    Execute a block of code within a serializable transaction.

    Serializable isolation provides the strongest consistency guarantees,
    preventing all concurrency anomalies at the cost of potential
    serialization failures that must be retried.

    Args:
        readonly: If True, the transaction is read-only

    Yields:
        Connection with active serializable transaction
    """
    async with get_transaction(
        isolation=IsolationLevel.SERIALIZABLE,
        readonly=readonly,
    ) as conn:
        yield conn


@asynccontextmanager
async def savepoint(
    conn: Connection,
    name: Optional[str] = None,
) -> AsyncIterator[Transaction]:
    """
    Create a savepoint within an existing transaction.

    Savepoints allow partial rollback within a transaction,
    useful for implementing retry logic or conditional operations.

    Args:
        conn: Active connection with a transaction
        name: Optional name for the savepoint

    Yields:
        Savepoint transaction object

    Example:
        async with get_transaction() as conn:
            await conn.execute("INSERT INTO orders (id) VALUES ($1)", order_id)
            try:
                async with savepoint(conn) as sp:
                    await conn.execute("INSERT INTO payments ...")
            except PaymentError:
                # Order insert preserved, payment rolled back
                await conn.execute("UPDATE orders SET status = 'payment_failed' ...")
    """
    async with conn.transaction() as tx:
        logger.debug("Savepoint created", extra={"name": name})
        yield tx
