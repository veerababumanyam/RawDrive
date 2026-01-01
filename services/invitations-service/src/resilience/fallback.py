"""
Fallback Strategies for Graceful Degradation.

Provides mechanisms to handle failures gracefully by falling
back to alternative behaviors when primary operations fail.
"""

import asyncio
from functools import wraps
from typing import Any, Callable, Generic, Optional, TypeVar, Awaitable, Union

from src.logging import get_logger

logger = get_logger(__name__)

T = TypeVar("T")


class FallbackHandler(Generic[T]):
    """
    Handler for providing fallback values or behavior on failures.

    Usage:
        handler = FallbackHandler(
            primary=fetch_from_database,
            fallback=fetch_from_cache,
            default={"status": "unknown"},
        )

        result = await handler.execute(user_id=123)
    """

    def __init__(
        self,
        primary: Callable[..., Awaitable[T]],
        fallback: Optional[Callable[..., Awaitable[T]]] = None,
        default: Optional[T] = None,
        on_fallback: Optional[Callable[[Exception], Awaitable[None]]] = None,
    ):
        """
        Initialize fallback handler.

        Args:
            primary: Primary async function to call
            fallback: Optional fallback async function
            default: Default value if all options fail
            on_fallback: Callback when falling back (for monitoring)
        """
        self.primary = primary
        self.fallback = fallback
        self.default = default
        self.on_fallback = on_fallback

    async def execute(self, *args, **kwargs) -> Optional[T]:
        """
        Execute with fallback chain.

        Tries primary first, then fallback, then returns default.

        Returns:
            Result from primary, fallback, or default value
        """
        # Try primary
        try:
            return await self.primary(*args, **kwargs)
        except Exception as primary_error:
            logger.warning(
                "primary_failed",
                function=self.primary.__name__,
                error=str(primary_error),
            )

            # Notify fallback occurred
            if self.on_fallback:
                try:
                    await self.on_fallback(primary_error)
                except Exception:
                    pass  # Don't let callback failure affect flow

            # Try fallback
            if self.fallback:
                try:
                    result = await self.fallback(*args, **kwargs)
                    logger.info(
                        "fallback_succeeded",
                        function=self.fallback.__name__,
                    )
                    return result
                except Exception as fallback_error:
                    logger.warning(
                        "fallback_failed",
                        function=self.fallback.__name__,
                        error=str(fallback_error),
                    )

            # Return default
            if self.default is not None:
                logger.info(
                    "using_default_value",
                    primary=self.primary.__name__,
                )
                return self.default

            # Re-raise the original error if no fallback/default
            raise primary_error


def with_fallback(
    fallback_value: Optional[T] = None,
    fallback_func: Optional[Callable[..., Awaitable[T]]] = None,
    on_fallback: Optional[Callable[[Exception], Awaitable[None]]] = None,
) -> Callable:
    """
    Decorator for adding fallback behavior to async functions.

    Usage:
        @with_fallback(fallback_value={"status": "unknown"})
        async def get_user_status(user_id: str):
            ...

        @with_fallback(fallback_func=get_cached_status)
        async def get_user_status(user_id: str):
            ...
    """

    def decorator(func: Callable[..., Awaitable[T]]) -> Callable[..., Awaitable[T]]:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> Optional[T]:
            try:
                return await func(*args, **kwargs)
            except Exception as e:
                logger.warning(
                    "function_failed_using_fallback",
                    function=func.__name__,
                    error=str(e),
                )

                # Notify fallback
                if on_fallback:
                    try:
                        await on_fallback(e)
                    except Exception:
                        pass

                # Try fallback function
                if fallback_func:
                    try:
                        return await fallback_func(*args, **kwargs)
                    except Exception as fallback_error:
                        logger.warning(
                            "fallback_function_failed",
                            function=fallback_func.__name__,
                            error=str(fallback_error),
                        )

                # Return fallback value
                if fallback_value is not None:
                    return fallback_value

                # Re-raise if no fallback
                raise

        return wrapper

    return decorator


# =============================================================================
# Cache Fallback Pattern
# =============================================================================


class CacheFallback(Generic[T]):
    """
    Fallback pattern that uses cache as secondary data source.

    Provides read-through caching with stale-while-revalidate semantics.
    When primary source fails, returns cached data (even if stale).

    Usage:
        cache = CacheFallback(
            primary=fetch_from_api,
            cache_get=redis.get,
            cache_set=redis.set,
        )

        result = await cache.get("user:123")
    """

    def __init__(
        self,
        primary: Callable[[str], Awaitable[T]],
        cache_get: Callable[[str], Awaitable[Optional[T]]],
        cache_set: Callable[[str, T, int], Awaitable[None]],
        ttl_seconds: int = 300,
        stale_ttl_seconds: int = 3600,
    ):
        self.primary = primary
        self.cache_get = cache_get
        self.cache_set = cache_set
        self.ttl_seconds = ttl_seconds
        self.stale_ttl_seconds = stale_ttl_seconds

    async def get(self, key: str) -> Optional[T]:
        """
        Get value with cache fallback.

        1. Try primary source
        2. On success, update cache
        3. On failure, try cache
        4. Return None if all fail
        """
        try:
            # Try primary source
            value = await self.primary(key)

            # Update cache in background
            asyncio.create_task(
                self._update_cache(key, value)
            )

            return value

        except Exception as primary_error:
            logger.warning(
                "cache_fallback_using_cache",
                key=key,
                error=str(primary_error),
            )

            # Try cache
            try:
                cached = await self.cache_get(key)
                if cached is not None:
                    logger.info(
                        "cache_fallback_hit",
                        key=key,
                    )
                    return cached
            except Exception as cache_error:
                logger.error(
                    "cache_fallback_cache_failed",
                    key=key,
                    error=str(cache_error),
                )

            return None

    async def _update_cache(self, key: str, value: T) -> None:
        """Update cache with new value."""
        try:
            await self.cache_set(key, value, self.stale_ttl_seconds)
        except Exception as e:
            logger.warning(
                "cache_update_failed",
                key=key,
                error=str(e),
            )


# =============================================================================
# Queue Fallback Pattern
# =============================================================================


class QueueFallback:
    """
    Fallback pattern that queues failed operations for later retry.

    When a synchronous operation fails, stores it in a queue
    for background processing.

    Usage:
        queue = QueueFallback(
            operation=send_email,
            queue_add=redis.rpush,
            queue_name="failed-emails",
        )

        await queue.execute(recipient="user@example.com", subject="Hello")
    """

    def __init__(
        self,
        operation: Callable[..., Awaitable[Any]],
        queue_add: Callable[[str, dict], Awaitable[None]],
        queue_name: str,
    ):
        self.operation = operation
        self.queue_add = queue_add
        self.queue_name = queue_name

    async def execute(self, *args, **kwargs) -> bool:
        """
        Execute operation with queue fallback.

        Returns:
            True if operation succeeded or was queued
            False if both failed
        """
        try:
            await self.operation(*args, **kwargs)
            return True
        except Exception as e:
            logger.warning(
                "operation_failed_queueing",
                operation=self.operation.__name__,
                error=str(e),
            )

            # Queue for retry
            try:
                job_data = {
                    "args": args,
                    "kwargs": kwargs,
                    "error": str(e),
                }
                await self.queue_add(self.queue_name, job_data)
                logger.info(
                    "operation_queued_for_retry",
                    operation=self.operation.__name__,
                    queue=self.queue_name,
                )
                return True
            except Exception as queue_error:
                logger.error(
                    "queue_fallback_failed",
                    operation=self.operation.__name__,
                    error=str(queue_error),
                )
                return False


# =============================================================================
# Graceful Degradation Helper
# =============================================================================


async def graceful_execute(
    primary: Callable[..., Awaitable[T]],
    fallbacks: list[Callable[..., Awaitable[T]]],
    default: Optional[T] = None,
    *args,
    **kwargs,
) -> Optional[T]:
    """
    Execute with a chain of fallbacks.

    Tries each function in order until one succeeds.

    Args:
        primary: Primary function to try first
        fallbacks: List of fallback functions to try in order
        default: Default value if all fail
        *args, **kwargs: Arguments passed to each function

    Returns:
        Result from first successful function, or default
    """
    all_funcs = [primary] + fallbacks

    for func in all_funcs:
        try:
            return await func(*args, **kwargs)
        except Exception as e:
            logger.warning(
                "graceful_execute_attempt_failed",
                function=func.__name__,
                error=str(e),
            )
            continue

    if default is not None:
        logger.info("graceful_execute_using_default")
        return default

    return None
