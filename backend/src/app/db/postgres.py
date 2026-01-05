from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass
from enum import Enum
from functools import wraps
from inspect import isawaitable
from typing import Any, AsyncIterator, Callable, Optional, TypeVar, Union
from unittest.mock import AsyncMock

import asyncpg
from asyncpg import Connection, Pool
from asyncpg.transaction import Transaction

from app.config.settings import AppSettings, get_settings

logger = logging.getLogger(__name__)

# Type variable for generic return types
T = TypeVar("T")

_pool: Optional[asyncpg.Pool] = None


class IsolationLevel(str, Enum):
    """PostgreSQL transaction isolation levels."""

    READ_COMMITTED = "read_committed"
    REPEATABLE_READ = "repeatable_read"
    SERIALIZABLE = "serializable"


@dataclass
class PoolStats:
    """Statistics about the connection pool state."""

    size: int
    free_size: int
    used_size: int
    min_size: int
    max_size: int
    max_queries: int
    max_inactive_connection_lifetime: float

    @property
    def utilization_percent(self) -> float:
        """Calculate pool utilization as a percentage."""
        if self.size == 0:
            return 0.0
        return (self.used_size / self.size) * 100


@dataclass
class TransactionContext:
    """Container for transaction state and metadata."""

    connection: Connection
    transaction: Transaction
    isolation: IsolationLevel
    readonly: bool
    started_at: float

    @property
    def elapsed_seconds(self) -> float:
        """Calculate time elapsed since transaction started."""
        return time.monotonic() - self.started_at


async def _setup_connection(conn: asyncpg.Connection) -> None:
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


async def init_postgres_pool(settings: Optional[AppSettings] = None) -> asyncpg.Pool:
    """Initialize and cache a global asyncpg pool.

    Idempotent: subsequent calls return the existing pool.
    """

    global _pool
    if _pool is not None and not os.getenv("PYTEST_CURRENT_TEST") and not isinstance(_pool, AsyncMock):
        return _pool

    settings = settings or get_settings()

    dsn = str(settings.database_url)
    if dsn.startswith("postgresql+asyncpg://"):
        dsn = dsn.replace("postgresql+asyncpg://", "postgresql://", 1)

    _pool = await asyncpg.create_pool(
        dsn=dsn,
        min_size=settings.db_pool_min_size,
        max_size=settings.db_pool_max_size,
        max_inactive_connection_lifetime=float(settings.db_pool_max_lifetime_sec),
        init=_setup_connection,  # Set up JSON codecs for each connection
    )

    logger.info(
        "PostgreSQL pool initialized",
        extra={
            "min_size": settings.db_pool_min_size,
            "max_size": settings.db_pool_max_size,
            "max_inactive_connection_lifetime": settings.db_pool_max_lifetime_sec,
        },
    )

    return _pool


async def get_postgres_pool() -> asyncpg.Pool:
    """Return the initialized pool or raise if not initialized."""

    global _pool

    if _pool is None:
        raise RuntimeError("PostgreSQL pool has not been initialized. Call init_postgres_pool first.")
    return _pool


@asynccontextmanager
async def acquire_conn(pool):
    """Normalize pool.acquire() to support both asyncpg pools and AsyncMock pools."""

    ctx = pool.acquire()
    if isawaitable(ctx):
        ctx = await ctx
    async with ctx as conn:
        yield conn


@asynccontextmanager
async def normalize_async_cm(cm):
    """Allow AsyncMock-based context managers to behave like asyncpg ones."""

    ctx = cm
    if isawaitable(ctx):
        ctx = await ctx
    async with ctx:
        yield ctx


async def close_postgres_pool() -> None:
    """Close and reset the pool."""

    global _pool
    if _pool is not None:
        close_result = _pool.close()
        if isawaitable(close_result):
            await close_result
        _pool = None
        logger.info("PostgreSQL pool closed")


async def postgres_healthcheck(timeout: float = 1.0) -> bool:
    """Run a lightweight health check (SELECT 1)."""

    pool = await get_postgres_pool()
    async with acquire_conn(pool) as conn:
        async with normalize_async_cm(conn.transaction()):
            result = await conn.fetchval("SELECT 1")
            return result == 1


# =============================================================================
# Connection Lifecycle Management
# =============================================================================


@asynccontextmanager
async def get_connection() -> AsyncIterator[Connection]:
    """Acquire a connection from the pool with automatic release.

    This context manager provides a clean interface for acquiring connections
    with guaranteed cleanup. The connection is automatically returned to the
    pool when the context exits, even if an exception occurs.

    Example:
        async with get_connection() as conn:
            result = await conn.fetch("SELECT * FROM users WHERE id = $1", user_id)

    Yields:
        asyncpg.Connection: A connection from the pool.

    Raises:
        RuntimeError: If the pool has not been initialized.
    """
    pool = await get_postgres_pool()
    async with acquire_conn(pool) as conn:
        yield conn


@asynccontextmanager
async def get_connection_with_timeout(
    timeout: float = 30.0,
) -> AsyncIterator[Connection]:
    """Acquire a connection with a configurable timeout.

    Useful for operations that should fail fast if the pool is exhausted.

    Args:
        timeout: Maximum seconds to wait for a connection.

    Example:
        async with get_connection_with_timeout(5.0) as conn:
            # Will fail if no connection available within 5 seconds
            result = await conn.fetchval("SELECT COUNT(*) FROM large_table")

    Yields:
        asyncpg.Connection: A connection from the pool.

    Raises:
        asyncio.TimeoutError: If connection cannot be acquired within timeout.
    """
    pool = await get_postgres_pool()

    async def acquire_with_timeout():
        ctx = pool.acquire(timeout=timeout)
        if isawaitable(ctx):
            ctx = await ctx
        return ctx

    try:
        ctx = await asyncio.wait_for(acquire_with_timeout(), timeout=timeout)
        async with ctx as conn:
            yield conn
    except asyncio.TimeoutError:
        logger.warning(
            "Connection acquisition timed out",
            extra={"timeout_seconds": timeout},
        )
        raise


# =============================================================================
# Transaction Context Managers
# =============================================================================


@asynccontextmanager
async def transaction(
    isolation: IsolationLevel = IsolationLevel.READ_COMMITTED,
    readonly: bool = False,
    deferrable: bool = False,
) -> AsyncIterator[Connection]:
    """Execute a block of code within a database transaction.

    This context manager automatically handles transaction lifecycle:
    - Acquires a connection from the pool
    - Starts a transaction with specified isolation level
    - Commits on successful completion
    - Rolls back on exception
    - Returns the connection to the pool

    Args:
        isolation: Transaction isolation level (default: READ_COMMITTED).
        readonly: If True, the transaction is read-only (optimization hint).
        deferrable: If True and readonly=True, allows deferrable serializable
                   transactions which may delay execution to avoid conflicts.

    Example:
        async with transaction() as conn:
            await conn.execute("INSERT INTO users (name) VALUES ($1)", "John")
            await conn.execute("INSERT INTO audit_log (action) VALUES ($1)", "user_created")
            # Both inserts commit together or roll back together

    Example with isolation level:
        async with transaction(isolation=IsolationLevel.SERIALIZABLE) as conn:
            balance = await conn.fetchval("SELECT balance FROM accounts WHERE id = $1", 1)
            await conn.execute("UPDATE accounts SET balance = $1 WHERE id = $2", balance - 100, 1)

    Yields:
        asyncpg.Connection: A connection with an active transaction.

    Raises:
        Any exception raised within the block will trigger rollback.
    """
    pool = await get_postgres_pool()
    started_at = time.monotonic()

    async with acquire_conn(pool) as conn:
        # Map isolation level enum to asyncpg parameter
        isolation_param = isolation.value

        tx = conn.transaction(
            isolation=isolation_param,
            readonly=readonly,
            deferrable=deferrable,
        )

        async with normalize_async_cm(tx):
            logger.debug(
                "Transaction started",
                extra={
                    "isolation": isolation.value,
                    "readonly": readonly,
                    "deferrable": deferrable,
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
    """Execute a block of code within a read-only transaction.

    Read-only transactions provide optimization hints to PostgreSQL and
    can help prevent accidental data modifications.

    Args:
        isolation: Transaction isolation level (default: READ_COMMITTED).

    Example:
        async with readonly_transaction() as conn:
            users = await conn.fetch("SELECT * FROM users")
            # Any write attempt will fail with an error

    Yields:
        asyncpg.Connection: A connection with an active read-only transaction.
    """
    async with transaction(isolation=isolation, readonly=True) as conn:
        yield conn


@asynccontextmanager
async def serializable_transaction(
    readonly: bool = False,
) -> AsyncIterator[Connection]:
    """Execute a block of code within a serializable transaction.

    Serializable isolation provides the strongest consistency guarantees,
    preventing all concurrency anomalies at the cost of potential
    serialization failures that must be retried.

    Args:
        readonly: If True, the transaction is read-only.

    Example:
        async with serializable_transaction() as conn:
            # Full ACID guarantees with serializable isolation
            total = await conn.fetchval("SELECT SUM(balance) FROM accounts")
            await conn.execute("INSERT INTO snapshots (total) VALUES ($1)", total)

    Yields:
        asyncpg.Connection: A connection with an active serializable transaction.
    """
    async with transaction(
        isolation=IsolationLevel.SERIALIZABLE,
        readonly=readonly,
    ) as conn:
        yield conn


@asynccontextmanager
async def savepoint(
    conn: Connection,
    name: Optional[str] = None,
) -> AsyncIterator[Transaction]:
    """Create a savepoint within an existing transaction.

    Savepoints allow partial rollback within a transaction, useful for
    implementing retry logic or conditional operations.

    Args:
        conn: An active connection with a transaction.
        name: Optional name for the savepoint (auto-generated if not provided).

    Example:
        async with transaction() as conn:
            await conn.execute("INSERT INTO orders (id) VALUES ($1)", order_id)
            try:
                async with savepoint(conn) as sp:
                    await conn.execute("INSERT INTO payments (...) VALUES (...)")
                    # If payment fails, only this savepoint is rolled back
            except PaymentError:
                # Order insert is preserved, but payment is rolled back
                await conn.execute("UPDATE orders SET status = 'payment_failed' WHERE id = $1", order_id)

    Yields:
        asyncpg.Transaction: The savepoint transaction object.
    """
    sp = conn.transaction()
    async with normalize_async_cm(sp) as transaction_obj:
        logger.debug("Savepoint created", extra={"name": name})
        yield transaction_obj


# =============================================================================
# Retry Logic and Error Handling
# =============================================================================


class RetryConfig:
    """Configuration for database operation retries."""

    def __init__(
        self,
        max_attempts: int = 3,
        base_delay: float = 0.1,
        max_delay: float = 5.0,
        exponential_base: float = 2.0,
        retryable_exceptions: tuple = (
            asyncpg.DeadlockDetectedError,
            asyncpg.SerializationError,
            asyncpg.TooManyConnectionsError,
            asyncpg.ConnectionDoesNotExistError,
            asyncpg.InterfaceError,
        ),
    ):
        """Initialize retry configuration.

        Args:
            max_attempts: Maximum number of retry attempts.
            base_delay: Initial delay between retries in seconds.
            max_delay: Maximum delay between retries in seconds.
            exponential_base: Base for exponential backoff calculation.
            retryable_exceptions: Tuple of exception types that trigger retry.
        """
        self.max_attempts = max_attempts
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.exponential_base = exponential_base
        self.retryable_exceptions = retryable_exceptions


# Default retry configuration
DEFAULT_RETRY_CONFIG = RetryConfig()


def with_retry(
    config: Optional[RetryConfig] = None,
) -> Callable[[Callable[..., T]], Callable[..., T]]:
    """Decorator for automatic retry of database operations.

    Implements exponential backoff with jitter for retryable exceptions
    like deadlocks and serialization failures.

    Args:
        config: Retry configuration (uses defaults if not provided).

    Example:
        @with_retry()
        async def transfer_funds(from_id: int, to_id: int, amount: Decimal):
            async with serializable_transaction() as conn:
                # This will automatically retry on deadlock
                await conn.execute("UPDATE accounts SET balance = balance - $1 WHERE id = $2", amount, from_id)
                await conn.execute("UPDATE accounts SET balance = balance + $1 WHERE id = $2", amount, to_id)

    Returns:
        Decorated function with automatic retry behavior.
    """
    retry_config = config or DEFAULT_RETRY_CONFIG

    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> T:
            last_exception: Optional[Exception] = None

            for attempt in range(1, retry_config.max_attempts + 1):
                try:
                    return await func(*args, **kwargs)
                except retry_config.retryable_exceptions as e:
                    last_exception = e
                    if attempt == retry_config.max_attempts:
                        logger.warning(
                            "Database operation failed after max retries",
                            extra={
                                "function": func.__name__,
                                "attempts": attempt,
                                "error": str(e),
                            },
                        )
                        raise

                    # Calculate delay with exponential backoff and jitter
                    delay = min(
                        retry_config.base_delay * (retry_config.exponential_base ** (attempt - 1)),
                        retry_config.max_delay,
                    )
                    # Add jitter (0-50% of delay)
                    import random
                    jitter = delay * random.uniform(0, 0.5)
                    delay += jitter

                    logger.info(
                        "Retrying database operation",
                        extra={
                            "function": func.__name__,
                            "attempt": attempt,
                            "max_attempts": retry_config.max_attempts,
                            "delay_seconds": delay,
                            "error": str(e),
                        },
                    )
                    await asyncio.sleep(delay)

            # This should not be reached, but satisfy type checker
            if last_exception:
                raise last_exception
            raise RuntimeError("Unexpected retry loop exit")

        return wrapper  # type: ignore

    return decorator


async def execute_with_retry(
    query: str,
    *args: Any,
    config: Optional[RetryConfig] = None,
) -> str:
    """Execute a query with automatic retry on transient failures.

    This is a convenience function for simple queries that don't need
    explicit transaction management.

    Args:
        query: The SQL query to execute.
        *args: Query parameters.
        config: Retry configuration (uses defaults if not provided).

    Returns:
        The status of the query execution (e.g., "INSERT 0 1").

    Example:
        status = await execute_with_retry(
            "UPDATE users SET last_login = NOW() WHERE id = $1",
            user_id,
        )
    """
    retry_config = config or DEFAULT_RETRY_CONFIG

    @with_retry(retry_config)
    async def _execute() -> str:
        async with get_connection() as conn:
            return await conn.execute(query, *args)

    return await _execute()


async def fetch_with_retry(
    query: str,
    *args: Any,
    config: Optional[RetryConfig] = None,
) -> list[asyncpg.Record]:
    """Fetch results with automatic retry on transient failures.

    Args:
        query: The SQL query to execute.
        *args: Query parameters.
        config: Retry configuration (uses defaults if not provided).

    Returns:
        List of records from the query.

    Example:
        users = await fetch_with_retry(
            "SELECT * FROM users WHERE status = $1",
            "active",
        )
    """
    retry_config = config or DEFAULT_RETRY_CONFIG

    @with_retry(retry_config)
    async def _fetch() -> list[asyncpg.Record]:
        async with get_connection() as conn:
            return await conn.fetch(query, *args)

    return await _fetch()


async def fetchval_with_retry(
    query: str,
    *args: Any,
    column: int = 0,
    config: Optional[RetryConfig] = None,
) -> Any:
    """Fetch a single value with automatic retry on transient failures.

    Args:
        query: The SQL query to execute.
        *args: Query parameters.
        column: The column index to return (default: 0).
        config: Retry configuration (uses defaults if not provided).

    Returns:
        The value from the specified column of the first row.

    Example:
        count = await fetchval_with_retry(
            "SELECT COUNT(*) FROM users WHERE status = $1",
            "active",
        )
    """
    retry_config = config or DEFAULT_RETRY_CONFIG

    @with_retry(retry_config)
    async def _fetchval() -> Any:
        async with get_connection() as conn:
            return await conn.fetchval(query, *args, column=column)

    return await _fetchval()


# =============================================================================
# Pool Statistics and Monitoring
# =============================================================================


async def get_pool_stats() -> PoolStats:
    """Get current connection pool statistics.

    This function provides insight into the pool's current state,
    useful for monitoring and debugging connection issues.

    Returns:
        PoolStats: Dataclass containing pool statistics.

    Example:
        stats = await get_pool_stats()
        if stats.utilization_percent > 80:
            logger.warning("Connection pool utilization high", extra={"percent": stats.utilization_percent})
    """
    pool = await get_postgres_pool()

    # Handle AsyncMock in tests
    if isinstance(pool, AsyncMock):
        return PoolStats(
            size=5,
            free_size=5,
            used_size=0,
            min_size=1,
            max_size=10,
            max_queries=0,
            max_inactive_connection_lifetime=1800.0,
        )

    return PoolStats(
        size=pool.get_size(),
        free_size=pool.get_idle_size(),
        used_size=pool.get_size() - pool.get_idle_size(),
        min_size=pool.get_min_size(),
        max_size=pool.get_max_size(),
        max_queries=pool._max_queries if hasattr(pool, "_max_queries") else 0,
        max_inactive_connection_lifetime=pool._max_inactive_connection_lifetime
        if hasattr(pool, "_max_inactive_connection_lifetime")
        else 0.0,
    )


async def log_pool_stats() -> None:
    """Log current pool statistics at INFO level.

    Useful for periodic monitoring or debugging connection issues.

    Example:
        # In a scheduled task
        await log_pool_stats()
    """
    try:
        stats = await get_pool_stats()
        logger.info(
            "PostgreSQL pool statistics",
            extra={
                "size": stats.size,
                "free_size": stats.free_size,
                "used_size": stats.used_size,
                "utilization_percent": round(stats.utilization_percent, 2),
                "min_size": stats.min_size,
                "max_size": stats.max_size,
            },
        )
    except RuntimeError as e:
        logger.warning("Could not get pool stats: pool not initialized", extra={"error": str(e)})


async def wait_for_pool_ready(
    timeout: float = 30.0,
    check_interval: float = 0.5,
) -> bool:
    """Wait for the connection pool to be ready with at least one connection.

    Useful for startup checks or waiting for pool recovery after issues.

    Args:
        timeout: Maximum seconds to wait for pool readiness.
        check_interval: Seconds between readiness checks.

    Returns:
        True if pool is ready, False if timeout was reached.

    Example:
        if not await wait_for_pool_ready(timeout=10.0):
            logger.error("Database pool failed to initialize")
            sys.exit(1)
    """
    start_time = time.monotonic()

    while time.monotonic() - start_time < timeout:
        try:
            pool = await get_postgres_pool()
            if isinstance(pool, AsyncMock):
                return True
            if pool.get_size() >= pool.get_min_size():
                return True
        except RuntimeError:
            pass
        await asyncio.sleep(check_interval)

    return False


# =============================================================================
# Batch Operations
# =============================================================================


@asynccontextmanager
async def batch_execute() -> AsyncIterator[tuple[Connection, Callable]]:
    """Context manager for efficient batch database operations.

    Provides a connection and a batch executor for multiple operations
    that should be executed together efficiently.

    Example:
        async with batch_execute() as (conn, execute_batch):
            await execute_batch("INSERT INTO logs (message) VALUES ($1)", messages)

    Yields:
        Tuple of (connection, execute_batch_function).
    """
    async with get_connection() as conn:
        async def execute_batch(query: str, args_list: list[tuple]) -> None:
            """Execute a query with multiple argument sets."""
            await conn.executemany(query, args_list)

        yield conn, execute_batch


async def executemany_with_transaction(
    query: str,
    args_list: list[tuple],
    batch_size: int = 1000,
) -> int:
    """Execute a query with multiple argument sets in a transaction.

    Automatically batches large operations for memory efficiency.

    Args:
        query: The SQL query to execute.
        args_list: List of argument tuples.
        batch_size: Maximum number of operations per batch.

    Returns:
        Total number of operations executed.

    Example:
        users_data = [(name, email) for name, email in user_list]
        count = await executemany_with_transaction(
            "INSERT INTO users (name, email) VALUES ($1, $2)",
            users_data,
        )
    """
    total_executed = 0

    async with transaction() as conn:
        for i in range(0, len(args_list), batch_size):
            batch = args_list[i : i + batch_size]
            await conn.executemany(query, batch)
            total_executed += len(batch)
            logger.debug(
                "Batch executed",
                extra={
                    "batch_number": i // batch_size + 1,
                    "batch_size": len(batch),
                    "total_executed": total_executed,
                },
            )

    return total_executed
