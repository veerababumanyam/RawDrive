"""
Database Retry Logic and Error Handling.

Provides automatic retry with exponential backoff for
transient database failures (deadlocks, serialization errors, etc.).
"""

from __future__ import annotations

import asyncio
import logging
import random
from dataclasses import dataclass, field
from functools import wraps
from typing import Any, Callable, Optional, Tuple, Type, TypeVar

import asyncpg

from .constants import RETRY_DEFAULTS

logger = logging.getLogger(__name__)

T = TypeVar("T")


# Default retryable exceptions
RETRYABLE_EXCEPTIONS: Tuple[Type[Exception], ...] = (
    asyncpg.DeadlockDetectedError,
    asyncpg.SerializationError,
    asyncpg.TooManyConnectionsError,
    asyncpg.ConnectionDoesNotExistError,
    asyncpg.InterfaceError,
)


@dataclass
class RetryConfig:
    """Configuration for database operation retries."""

    max_attempts: int = RETRY_DEFAULTS.MAX_ATTEMPTS
    base_delay: float = RETRY_DEFAULTS.BASE_DELAY
    max_delay: float = RETRY_DEFAULTS.MAX_DELAY
    exponential_base: float = RETRY_DEFAULTS.EXPONENTIAL_BASE
    retryable_exceptions: Tuple[Type[Exception], ...] = field(
        default_factory=lambda: RETRYABLE_EXCEPTIONS
    )
    jitter: bool = True  # Add random jitter to delays

    def calculate_delay(self, attempt: int) -> float:
        """
        Calculate delay for given attempt number.

        Args:
            attempt: Current attempt number (1-based)

        Returns:
            Delay in seconds
        """
        delay = min(
            self.base_delay * (self.exponential_base ** (attempt - 1)),
            self.max_delay,
        )

        if self.jitter:
            # Add 0-50% jitter
            delay += delay * random.uniform(0, 0.5)

        return delay


def with_retry(
    config: Optional[RetryConfig] = None,
) -> Callable[[Callable[..., T]], Callable[..., T]]:
    """
    Decorator for automatic retry of database operations.

    Implements exponential backoff with jitter for retryable exceptions
    like deadlocks and serialization failures.

    Args:
        config: Retry configuration (uses defaults if not provided)

    Returns:
        Decorated function with automatic retry behavior

    Example:
        @with_retry()
        async def transfer_funds(from_id: int, to_id: int, amount: Decimal):
            async with serializable_transaction() as conn:
                await conn.execute(
                    "UPDATE accounts SET balance = balance - $1 WHERE id = $2",
                    amount, from_id
                )
                await conn.execute(
                    "UPDATE accounts SET balance = balance + $1 WHERE id = $2",
                    amount, to_id
                )
    """
    retry_config = config or RetryConfig()

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
                                "error_type": type(e).__name__,
                            },
                        )
                        raise

                    delay = retry_config.calculate_delay(attempt)

                    logger.info(
                        "Retrying database operation",
                        extra={
                            "function": func.__name__,
                            "attempt": attempt,
                            "max_attempts": retry_config.max_attempts,
                            "delay_seconds": delay,
                            "error": str(e),
                            "error_type": type(e).__name__,
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
    conn_getter: Callable,
    query: str,
    *args: Any,
    config: Optional[RetryConfig] = None,
) -> str:
    """
    Execute a query with automatic retry on transient failures.

    Args:
        conn_getter: Async context manager that provides a connection
        query: The SQL query to execute
        *args: Query parameters
        config: Retry configuration

    Returns:
        The status of the query execution (e.g., "INSERT 0 1")

    Example:
        from database_utils import get_connection, execute_with_retry

        status = await execute_with_retry(
            get_connection,
            "UPDATE users SET last_login = NOW() WHERE id = $1",
            user_id,
        )
    """
    retry_config = config or RetryConfig()

    @with_retry(retry_config)
    async def _execute() -> str:
        async with conn_getter() as conn:
            return await conn.execute(query, *args)

    return await _execute()


async def fetch_with_retry(
    conn_getter: Callable,
    query: str,
    *args: Any,
    config: Optional[RetryConfig] = None,
) -> list[asyncpg.Record]:
    """
    Fetch results with automatic retry on transient failures.

    Args:
        conn_getter: Async context manager that provides a connection
        query: The SQL query to execute
        *args: Query parameters
        config: Retry configuration

    Returns:
        List of records from the query

    Example:
        users = await fetch_with_retry(
            get_connection,
            "SELECT * FROM users WHERE status = $1",
            "active",
        )
    """
    retry_config = config or RetryConfig()

    @with_retry(retry_config)
    async def _fetch() -> list[asyncpg.Record]:
        async with conn_getter() as conn:
            return await conn.fetch(query, *args)

    return await _fetch()


async def fetchval_with_retry(
    conn_getter: Callable,
    query: str,
    *args: Any,
    column: int = 0,
    config: Optional[RetryConfig] = None,
) -> Any:
    """
    Fetch a single value with automatic retry on transient failures.

    Args:
        conn_getter: Async context manager that provides a connection
        query: The SQL query to execute
        *args: Query parameters
        column: The column index to return (default: 0)
        config: Retry configuration

    Returns:
        The value from the specified column of the first row

    Example:
        count = await fetchval_with_retry(
            get_connection,
            "SELECT COUNT(*) FROM users WHERE status = $1",
            "active",
        )
    """
    retry_config = config or RetryConfig()

    @with_retry(retry_config)
    async def _fetchval() -> Any:
        async with conn_getter() as conn:
            return await conn.fetchval(query, *args, column=column)

    return await _fetchval()


async def fetchrow_with_retry(
    conn_getter: Callable,
    query: str,
    *args: Any,
    config: Optional[RetryConfig] = None,
) -> Optional[asyncpg.Record]:
    """
    Fetch a single row with automatic retry on transient failures.

    Args:
        conn_getter: Async context manager that provides a connection
        query: The SQL query to execute
        *args: Query parameters
        config: Retry configuration

    Returns:
        Single record or None

    Example:
        user = await fetchrow_with_retry(
            get_connection,
            "SELECT * FROM users WHERE id = $1",
            user_id,
        )
    """
    retry_config = config or RetryConfig()

    @with_retry(retry_config)
    async def _fetchrow() -> Optional[asyncpg.Record]:
        async with conn_getter() as conn:
            return await conn.fetchrow(query, *args)

    return await _fetchrow()
