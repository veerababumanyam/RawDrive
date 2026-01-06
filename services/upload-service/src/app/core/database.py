"""
Database connection module for PostgreSQL with async SQLAlchemy.

Provides database connectivity optimized for 50K concurrent uploads with:
- Async SQLAlchemy 2.0+ with asyncpg driver
- Connection pooling with PgBouncer support
- Transaction context managers with isolation levels
- Health check and monitoring utilities
- Automatic retry on transient failures

Usage:
    from app.core.database import (
        get_session,
        get_connection,
        transaction,
        init_database,
        close_database,
    )

    # Using async session for ORM operations
    async with get_session() as session:
        result = await session.execute(select(Asset).where(Asset.id == asset_id))
        asset = result.scalar_one_or_none()

    # Using raw connection for direct SQL
    async with get_connection() as conn:
        result = await conn.execute(text("SELECT 1"))
"""

from __future__ import annotations

import asyncio
import logging
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass
from enum import Enum
from functools import wraps
from typing import (
    TYPE_CHECKING,
    Any,
    AsyncIterator,
    Callable,
    Optional,
    TypeVar,
)
from urllib.parse import urlparse, urlunparse

from sqlalchemy import event, text
from sqlalchemy.exc import (
    DBAPIError,
    InterfaceError,
    OperationalError,
)
from sqlalchemy.ext.asyncio import (
    AsyncConnection,
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool, QueuePool

if TYPE_CHECKING:
    from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

# Type variable for generic return types in retry decorator
T = TypeVar("T")

# Global engine and session factory
_engine: Optional[AsyncEngine] = None
_session_factory: Optional[async_sessionmaker[AsyncSession]] = None


class IsolationLevel(str, Enum):
    """PostgreSQL transaction isolation levels."""

    AUTOCOMMIT = "AUTOCOMMIT"
    READ_COMMITTED = "READ COMMITTED"
    REPEATABLE_READ = "REPEATABLE READ"
    SERIALIZABLE = "SERIALIZABLE"


@dataclass
class PoolStats:
    """Statistics about the connection pool state."""

    pool_size: int
    checked_in: int
    checked_out: int
    overflow: int
    invalid: int
    max_overflow: int

    @property
    def utilization_percent(self) -> float:
        """Calculate pool utilization as a percentage."""
        total = self.pool_size + self.max_overflow
        if total == 0:
            return 0.0
        return (self.checked_out / total) * 100

    @property
    def available(self) -> int:
        """Calculate available connections."""
        return self.checked_in + (self.max_overflow - self.overflow)


@dataclass
class RetryConfig:
    """Configuration for database operation retries."""

    max_attempts: int = 3
    base_delay: float = 0.1
    max_delay: float = 5.0
    exponential_base: float = 2.0

    # Exceptions that should trigger a retry
    retryable_exceptions: tuple[type[Exception], ...] = (
        OperationalError,
        InterfaceError,
    )


# Default retry configuration
DEFAULT_RETRY_CONFIG = RetryConfig()


def _build_database_url(
    database_url: str,
    pgbouncer_enabled: bool = False,
    pgbouncer_host: str = "pgbouncer",
    pgbouncer_port: int = 6432,
) -> str:
    """Build the database URL, optionally routing through PgBouncer.

    When PgBouncer is enabled, the connection is routed through the pooler
    for efficient connection management at scale (50+ pods).

    Args:
        database_url: Original database URL (can use asyncpg or postgresql+asyncpg scheme)
        pgbouncer_enabled: Whether to route through PgBouncer
        pgbouncer_host: PgBouncer hostname
        pgbouncer_port: PgBouncer port

    Returns:
        Database URL with asyncpg driver, optionally routed through PgBouncer
    """
    # Ensure we use the asyncpg driver
    url = database_url
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif not url.startswith("postgresql+asyncpg://"):
        # Handle other formats
        url = f"postgresql+asyncpg://{url.split('://', 1)[-1]}"

    if not pgbouncer_enabled:
        return url

    try:
        parsed = urlparse(url)
        # Replace host and port with PgBouncer settings
        if parsed.username and parsed.password:
            pgbouncer_netloc = f"{parsed.username}:{parsed.password}@{pgbouncer_host}:{pgbouncer_port}"
        elif parsed.username:
            pgbouncer_netloc = f"{parsed.username}@{pgbouncer_host}:{pgbouncer_port}"
        else:
            pgbouncer_netloc = f"{pgbouncer_host}:{pgbouncer_port}"

        pgbouncer_url = urlunparse((
            parsed.scheme,
            pgbouncer_netloc,
            parsed.path,
            parsed.params,
            parsed.query,
            parsed.fragment,
        ))

        logger.info(
            "PgBouncer enabled - routing connections through connection pooler",
            extra={
                "pgbouncer_host": pgbouncer_host,
                "pgbouncer_port": pgbouncer_port,
            },
        )
        return pgbouncer_url
    except Exception as e:
        logger.warning(
            "Failed to construct PgBouncer URL, falling back to direct connection",
            extra={"error": str(e)},
        )
        return url


async def init_database(
    database_url: Optional[str] = None,
    pool_min_size: int = 2,
    pool_max_size: int = 5,
    pool_max_lifetime_sec: int = 1800,
    command_timeout: int = 60,
    pgbouncer_enabled: bool = False,
    pgbouncer_host: str = "pgbouncer",
    pgbouncer_port: int = 6432,
    echo: bool = False,
) -> AsyncEngine:
    """Initialize the async SQLAlchemy engine and session factory.

    Creates a connection pool optimized for microservice deployment with
    optional PgBouncer support for production scaling.

    Args:
        database_url: PostgreSQL connection URL. If None, loads from settings.
        pool_min_size: Minimum connections in pool (default: 2)
        pool_max_size: Maximum connections in pool (default: 5, keep low per pod)
        pool_max_lifetime_sec: Maximum connection lifetime (default: 1800s/30min)
        command_timeout: Query timeout in seconds (default: 60)
        pgbouncer_enabled: Route through PgBouncer (default: False)
        pgbouncer_host: PgBouncer hostname (default: "pgbouncer")
        pgbouncer_port: PgBouncer port (default: 6432)
        echo: Echo SQL statements to logs (default: False)

    Returns:
        AsyncEngine: The initialized SQLAlchemy async engine.

    Raises:
        ValueError: If database_url is not provided and settings are unavailable.
    """
    global _engine, _session_factory

    if _engine is not None:
        logger.debug("Database engine already initialized, returning existing engine")
        return _engine

    # Get URL from settings if not provided
    if database_url is None:
        from app.core.config import get_settings
        settings = get_settings()
        database_url = settings.DATABASE_URL
        pool_min_size = settings.DB_POOL_MIN_SIZE
        pool_max_size = settings.DB_POOL_MAX_SIZE
        pool_max_lifetime_sec = settings.DB_POOL_MAX_LIFETIME_SEC
        command_timeout = settings.DB_COMMAND_TIMEOUT
        pgbouncer_enabled = settings.PGBOUNCER_ENABLED
        pgbouncer_host = settings.PGBOUNCER_HOST
        pgbouncer_port = settings.PGBOUNCER_PORT

    # Build the connection URL
    url = _build_database_url(
        database_url,
        pgbouncer_enabled=pgbouncer_enabled,
        pgbouncer_host=pgbouncer_host,
        pgbouncer_port=pgbouncer_port,
    )

    # Configure connection arguments for asyncpg
    connect_args: dict[str, Any] = {
        "command_timeout": command_timeout,
    }

    # For async engines, always use NullPool (async engines manage their own connection lifecycle)
    # NullPool doesn't maintain persistent connections - each request gets a new connection
    # This is the recommended approach for async SQLAlchemy with asyncpg
    pool_class: type = NullPool
    pool_kwargs: dict[str, Any] = {}

    if pgbouncer_enabled:
        # Disable prepared statements when using PgBouncer transaction mode
        connect_args["prepared_statement_cache_size"] = 0
        logger.info("Using NullPool with PgBouncer - connection pooling delegated to PgBouncer")
    else:
        logger.info(f"Using NullPool for async engine (pool_size={pool_min_size}, max={pool_max_size})")

    # Create the async engine
    _engine = create_async_engine(
        url,
        poolclass=pool_class,
        echo=echo,
        connect_args=connect_args,
        **pool_kwargs,
    )

    # Create session factory
    _session_factory = async_sessionmaker(
        bind=_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
    )

    # Set up engine event listeners for monitoring
    _setup_engine_events(_engine.sync_engine)

    logger.info(
        "Database engine initialized",
        extra={
            "pool_class": pool_class.__name__,
            "pool_min_size": pool_min_size,
            "pool_max_size": pool_max_size,
            "pool_max_lifetime_sec": pool_max_lifetime_sec,
            "pgbouncer_enabled": pgbouncer_enabled,
        },
    )

    return _engine


def _setup_engine_events(engine: "Engine") -> None:
    """Set up SQLAlchemy event listeners for monitoring.

    Args:
        engine: The synchronous engine (underlying the async engine)
    """
    @event.listens_for(engine, "connect")
    def on_connect(dbapi_conn: Any, connection_record: Any) -> None:
        logger.debug("New database connection established")

    @event.listens_for(engine, "checkout")
    def on_checkout(dbapi_conn: Any, connection_record: Any, connection_proxy: Any) -> None:
        logger.debug("Connection checked out from pool")

    @event.listens_for(engine, "checkin")
    def on_checkin(dbapi_conn: Any, connection_record: Any) -> None:
        logger.debug("Connection returned to pool")


async def close_database() -> None:
    """Close the database engine and dispose of the connection pool.

    Should be called during application shutdown to cleanly close
    all database connections.
    """
    global _engine, _session_factory

    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _session_factory = None
        logger.info("Database engine closed")


async def get_engine() -> AsyncEngine:
    """Get the initialized async engine.

    Returns:
        AsyncEngine: The SQLAlchemy async engine.

    Raises:
        RuntimeError: If the engine has not been initialized.
    """
    if _engine is None:
        raise RuntimeError(
            "Database engine has not been initialized. Call init_database() first."
        )
    return _engine


# =============================================================================
# Session and Connection Context Managers
# =============================================================================


@asynccontextmanager
async def get_session() -> AsyncIterator[AsyncSession]:
    """Get an async session for ORM operations.

    Provides a session with automatic commit on success and rollback on failure.
    The session is automatically closed when the context exits.

    Example:
        async with get_session() as session:
            result = await session.execute(select(User).where(User.id == 1))
            user = result.scalar_one_or_none()

    Yields:
        AsyncSession: An async SQLAlchemy session.

    Raises:
        RuntimeError: If the database has not been initialized.
    """
    if _session_factory is None:
        raise RuntimeError(
            "Database session factory not initialized. Call init_database() first."
        )

    session = _session_factory()
    try:
        yield session
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


@asynccontextmanager
async def get_connection() -> AsyncIterator[AsyncConnection]:
    """Get a raw async connection for direct SQL operations.

    Provides a connection with automatic transaction management.
    Useful for bulk operations or when ORM overhead is not needed.

    Example:
        async with get_connection() as conn:
            result = await conn.execute(text("SELECT * FROM assets WHERE id = :id"), {"id": 1})
            row = result.fetchone()

    Yields:
        AsyncConnection: An async SQLAlchemy connection.

    Raises:
        RuntimeError: If the database has not been initialized.
    """
    engine = await get_engine()
    async with engine.connect() as conn:
        yield conn
        await conn.commit()


@asynccontextmanager
async def transaction(
    isolation_level: IsolationLevel = IsolationLevel.READ_COMMITTED,
    readonly: bool = False,
) -> AsyncIterator[AsyncSession]:
    """Execute a block within a transaction with specified isolation level.

    Provides explicit transaction control with configurable isolation level.
    The transaction is automatically committed on success and rolled back
    on failure.

    Args:
        isolation_level: Transaction isolation level (default: READ_COMMITTED)
        readonly: If True, the transaction is read-only (optimization hint)

    Example:
        async with transaction(isolation_level=IsolationLevel.SERIALIZABLE) as session:
            # Operations execute with serializable isolation
            result = await session.execute(select(Account).where(Account.id == 1))
            account = result.scalar_one()
            account.balance -= 100
            await session.flush()

    Yields:
        AsyncSession: An async session with an active transaction.

    Raises:
        RuntimeError: If the database has not been initialized.
    """
    if _session_factory is None:
        raise RuntimeError(
            "Database session factory not initialized. Call init_database() first."
        )

    session = _session_factory()
    started_at = time.monotonic()

    try:
        # Set isolation level via execution options
        if isolation_level != IsolationLevel.READ_COMMITTED:
            await session.connection(
                execution_options={"isolation_level": isolation_level.value}
            )

        # Set read-only if requested
        if readonly:
            await session.execute(text("SET TRANSACTION READ ONLY"))

        logger.debug(
            "Transaction started",
            extra={
                "isolation_level": isolation_level.value,
                "readonly": readonly,
            },
        )

        yield session
        await session.commit()

        elapsed = time.monotonic() - started_at
        logger.debug(
            "Transaction committed",
            extra={"elapsed_seconds": round(elapsed, 3)},
        )
    except Exception:
        await session.rollback()
        elapsed = time.monotonic() - started_at
        logger.debug(
            "Transaction rolled back",
            extra={"elapsed_seconds": round(elapsed, 3)},
        )
        raise
    finally:
        await session.close()


@asynccontextmanager
async def readonly_transaction() -> AsyncIterator[AsyncSession]:
    """Execute a block within a read-only transaction.

    Provides optimization hints to PostgreSQL for read operations.
    Any write attempt will fail with an error.

    Example:
        async with readonly_transaction() as session:
            result = await session.execute(select(User))
            users = result.scalars().all()

    Yields:
        AsyncSession: An async session with an active read-only transaction.
    """
    async with transaction(readonly=True) as session:
        yield session


# =============================================================================
# Retry Logic
# =============================================================================


def with_retry(
    config: Optional[RetryConfig] = None,
) -> Callable[[Callable[..., T]], Callable[..., T]]:
    """Decorator for automatic retry of database operations.

    Implements exponential backoff with jitter for retryable exceptions
    like connection errors and transient failures.

    Args:
        config: Retry configuration (uses defaults if not provided).

    Example:
        @with_retry()
        async def get_user(user_id: int) -> User:
            async with get_session() as session:
                result = await session.execute(select(User).where(User.id == user_id))
                return result.scalar_one()

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
                            "delay_seconds": round(delay, 3),
                            "error": str(e),
                        },
                    )
                    await asyncio.sleep(delay)

            # This should not be reached, but satisfy type checker
            if last_exception:
                raise last_exception
            raise RuntimeError("Unexpected retry loop exit")

        return wrapper  # type: ignore[return-value]

    return decorator


# =============================================================================
# Health Check and Monitoring
# =============================================================================


async def database_healthcheck(timeout: float = 5.0) -> bool:
    """Run a lightweight health check (SELECT 1).

    Args:
        timeout: Maximum seconds to wait for the health check.

    Returns:
        True if the database is healthy, False otherwise.

    Example:
        if not await database_healthcheck():
            logger.error("Database health check failed")
    """
    try:
        async with asyncio.timeout(timeout):
            async with get_connection() as conn:
                result = await conn.execute(text("SELECT 1"))
                return result.scalar() == 1
    except Exception as e:
        logger.warning(
            "Database health check failed",
            extra={"error": str(e)},
        )
        return False


async def get_pool_stats() -> Optional[PoolStats]:
    """Get connection pool statistics for monitoring.

    Returns None if using NullPool (with PgBouncer) since pooling
    is handled externally.

    Returns:
        PoolStats if using QueuePool, None otherwise.

    Example:
        stats = await get_pool_stats()
        if stats and stats.utilization_percent > 80:
            logger.warning("Connection pool utilization high")
    """
    try:
        engine = await get_engine()
        pool = engine.pool

        # NullPool doesn't have pool statistics
        if isinstance(pool, NullPool):
            return None

        return PoolStats(
            pool_size=pool.size(),
            checked_in=pool.checkedin(),
            checked_out=pool.checkedout(),
            overflow=pool.overflow(),
            invalid=pool.invalidatedcount() if hasattr(pool, "invalidatedcount") else 0,
            max_overflow=pool._max_overflow if hasattr(pool, "_max_overflow") else 0,
        )
    except Exception as e:
        logger.warning(
            "Failed to get pool statistics",
            extra={"error": str(e)},
        )
        return None


async def log_pool_stats() -> None:
    """Log current pool statistics at INFO level.

    Useful for periodic monitoring or debugging connection issues.
    """
    stats = await get_pool_stats()
    if stats is None:
        logger.info("Pool statistics unavailable (using NullPool with PgBouncer)")
        return

    logger.info(
        "Database pool statistics",
        extra={
            "pool_size": stats.pool_size,
            "checked_in": stats.checked_in,
            "checked_out": stats.checked_out,
            "overflow": stats.overflow,
            "utilization_percent": round(stats.utilization_percent, 2),
            "available": stats.available,
        },
    )


async def wait_for_database_ready(
    timeout: float = 30.0,
    check_interval: float = 1.0,
) -> bool:
    """Wait for the database to be ready and accepting connections.

    Useful for startup checks or waiting after database recovery.

    Args:
        timeout: Maximum seconds to wait for readiness.
        check_interval: Seconds between readiness checks.

    Returns:
        True if database is ready, False if timeout was reached.

    Example:
        if not await wait_for_database_ready(timeout=60.0):
            logger.error("Database failed to become ready")
            sys.exit(1)
    """
    start_time = time.monotonic()

    while time.monotonic() - start_time < timeout:
        if await database_healthcheck(timeout=check_interval):
            logger.info("Database is ready")
            return True
        await asyncio.sleep(check_interval)

    logger.error(
        "Database failed to become ready within timeout",
        extra={"timeout_seconds": timeout},
    )
    return False


# =============================================================================
# Convenience Functions for Direct SQL
# =============================================================================


async def execute(query: str, params: Optional[dict[str, Any]] = None) -> Any:
    """Execute a SQL query and return the result proxy.

    Args:
        query: SQL query string (use :param_name for parameters)
        params: Query parameters as a dictionary

    Returns:
        The result proxy from the query execution.

    Example:
        result = await execute(
            "UPDATE assets SET status = :status WHERE id = :id",
            {"status": "processed", "id": asset_id}
        )
    """
    async with get_connection() as conn:
        return await conn.execute(text(query), params or {})


async def fetch_one(
    query: str,
    params: Optional[dict[str, Any]] = None,
) -> Optional[Any]:
    """Execute a query and return a single row.

    Args:
        query: SQL query string
        params: Query parameters

    Returns:
        A single row or None if no results.

    Example:
        row = await fetch_one(
            "SELECT * FROM assets WHERE id = :id",
            {"id": asset_id}
        )
    """
    async with get_connection() as conn:
        result = await conn.execute(text(query), params or {})
        return result.fetchone()


async def fetch_all(
    query: str,
    params: Optional[dict[str, Any]] = None,
) -> list[Any]:
    """Execute a query and return all rows.

    Args:
        query: SQL query string
        params: Query parameters

    Returns:
        List of all rows from the query.

    Example:
        rows = await fetch_all(
            "SELECT * FROM assets WHERE workspace_id = :workspace_id",
            {"workspace_id": workspace_id}
        )
    """
    async with get_connection() as conn:
        result = await conn.execute(text(query), params or {})
        return list(result.fetchall())


async def fetch_val(
    query: str,
    params: Optional[dict[str, Any]] = None,
) -> Any:
    """Execute a query and return a single value.

    Args:
        query: SQL query string
        params: Query parameters

    Returns:
        The value from the first column of the first row.

    Example:
        count = await fetch_val(
            "SELECT COUNT(*) FROM assets WHERE workspace_id = :workspace_id",
            {"workspace_id": workspace_id}
        )
    """
    async with get_connection() as conn:
        result = await conn.execute(text(query), params or {})
        row = result.fetchone()
        return row[0] if row else None


# =============================================================================
# Module Exports
# =============================================================================

__all__ = [
    # Initialization and lifecycle
    "init_database",
    "close_database",
    "get_engine",
    # Session and connection management
    "get_session",
    "get_connection",
    "transaction",
    "readonly_transaction",
    # Retry support
    "with_retry",
    "RetryConfig",
    "DEFAULT_RETRY_CONFIG",
    # Health and monitoring
    "database_healthcheck",
    "get_pool_stats",
    "log_pool_stats",
    "wait_for_database_ready",
    # Convenience functions
    "execute",
    "fetch_one",
    "fetch_all",
    "fetch_val",
    # Types and enums
    "IsolationLevel",
    "PoolStats",
]
