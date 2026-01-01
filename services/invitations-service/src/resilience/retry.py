"""
Retry Logic with Exponential Backoff.

Provides retry policies for handling transient failures
with configurable backoff strategies.
"""

import asyncio
import random
from dataclasses import dataclass
from functools import wraps
from typing import Any, Callable, Optional, Tuple, Type, TypeVar, Awaitable

from src.logging import get_logger

logger = get_logger(__name__)


@dataclass
class RetryPolicy:
    """
    Configuration for retry behavior.

    Attributes:
        max_retries: Maximum number of retry attempts
        base_delay: Initial delay in seconds before first retry
        max_delay: Maximum delay between retries
        exponential_base: Base for exponential backoff (delay = base_delay * exponential_base^attempt)
        jitter: Add random jitter (0-1) to prevent thundering herd
        retryable_exceptions: Exception types that should trigger retry
        non_retryable_exceptions: Exception types that should NOT be retried
    """

    max_retries: int = 3
    base_delay: float = 1.0
    max_delay: float = 60.0
    exponential_base: float = 2.0
    jitter: float = 0.1
    retryable_exceptions: Tuple[Type[Exception], ...] = (Exception,)
    non_retryable_exceptions: Tuple[Type[Exception], ...] = ()


def exponential_backoff(
    attempt: int,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    exponential_base: float = 2.0,
    jitter: float = 0.1,
) -> float:
    """
    Calculate delay for exponential backoff.

    Args:
        attempt: Current attempt number (0-based)
        base_delay: Initial delay in seconds
        max_delay: Maximum delay cap
        exponential_base: Base for exponential growth
        jitter: Random jitter factor (0-1)

    Returns:
        Delay in seconds
    """
    delay = min(base_delay * (exponential_base ** attempt), max_delay)

    # Add jitter to prevent thundering herd
    if jitter > 0:
        jitter_range = delay * jitter
        delay += random.uniform(-jitter_range, jitter_range)

    return max(0, delay)


def should_retry(
    exception: Exception,
    policy: RetryPolicy,
) -> bool:
    """
    Determine if an exception should trigger a retry.

    Args:
        exception: The exception that occurred
        policy: Retry policy configuration

    Returns:
        True if the operation should be retried
    """
    # Check non-retryable first
    if isinstance(exception, policy.non_retryable_exceptions):
        return False

    # Check if it's a retryable exception
    return isinstance(exception, policy.retryable_exceptions)


async def retry_with_backoff(
    func: Callable[..., Awaitable[Any]],
    *args,
    policy: Optional[RetryPolicy] = None,
    on_retry: Optional[Callable[[int, Exception], Awaitable[None]]] = None,
    **kwargs,
) -> Any:
    """
    Execute an async function with retry logic.

    Args:
        func: Async function to call
        *args: Positional arguments for func
        policy: Retry policy (uses defaults if not provided)
        on_retry: Optional callback called before each retry
        **kwargs: Keyword arguments for func

    Returns:
        Result of func

    Raises:
        Last exception if all retries fail
    """
    policy = policy or RetryPolicy()
    last_exception: Optional[Exception] = None

    for attempt in range(policy.max_retries + 1):
        try:
            return await func(*args, **kwargs)

        except Exception as e:
            last_exception = e

            # Check if we should retry
            if attempt >= policy.max_retries:
                logger.error(
                    "retry_exhausted",
                    function=func.__name__,
                    attempts=attempt + 1,
                    error=str(e),
                )
                raise

            if not should_retry(e, policy):
                logger.warning(
                    "non_retryable_error",
                    function=func.__name__,
                    error=str(e),
                )
                raise

            # Calculate backoff delay
            delay = exponential_backoff(
                attempt,
                policy.base_delay,
                policy.max_delay,
                policy.exponential_base,
                policy.jitter,
            )

            logger.info(
                "retry_scheduled",
                function=func.__name__,
                attempt=attempt + 1,
                max_retries=policy.max_retries,
                delay_seconds=delay,
                error=str(e),
            )

            # Call retry callback if provided
            if on_retry:
                await on_retry(attempt + 1, e)

            # Wait before retrying
            await asyncio.sleep(delay)

    # This should never be reached, but just in case
    if last_exception:
        raise last_exception


def with_retry(
    policy: Optional[RetryPolicy] = None,
    on_retry: Optional[Callable[[int, Exception], Awaitable[None]]] = None,
) -> Callable:
    """
    Decorator for adding retry logic to async functions.

    Usage:
        @with_retry(RetryPolicy(max_retries=5))
        async def call_external_api():
            ...
    """

    def decorator(func: Callable[..., Awaitable[Any]]) -> Callable[..., Awaitable[Any]]:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            return await retry_with_backoff(
                func,
                *args,
                policy=policy,
                on_retry=on_retry,
                **kwargs,
            )

        return wrapper

    return decorator


# =============================================================================
# Common Retry Policies
# =============================================================================


# For database operations (quick retries)
DATABASE_RETRY_POLICY = RetryPolicy(
    max_retries=3,
    base_delay=0.1,
    max_delay=1.0,
    exponential_base=2.0,
    jitter=0.05,
)

# For external API calls (longer delays)
API_RETRY_POLICY = RetryPolicy(
    max_retries=3,
    base_delay=1.0,
    max_delay=30.0,
    exponential_base=2.0,
    jitter=0.2,
)

# For email sending (even longer, with more retries)
EMAIL_RETRY_POLICY = RetryPolicy(
    max_retries=5,
    base_delay=5.0,
    max_delay=300.0,  # 5 minutes
    exponential_base=2.0,
    jitter=0.1,
)

# For background jobs (very patient)
BACKGROUND_JOB_RETRY_POLICY = RetryPolicy(
    max_retries=10,
    base_delay=10.0,
    max_delay=3600.0,  # 1 hour
    exponential_base=2.0,
    jitter=0.3,
)
