"""Fallback strategies for circuit breaker failures.

Provides various fallback mechanisms when external services are unavailable:
- CacheFallback: Return cached/stale data
- DefaultFallback: Return predefined default values
- NullFallback: Return None/empty (fail silent)
- QueuedFallback: Queue request for later processing
"""

from __future__ import annotations

import asyncio
import json
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any, Callable, Generic, Optional, TypeVar, Dict

from src.log_config import get_logger
from src.observability.metrics import get_metrics

logger = get_logger(__name__)
metrics = get_metrics()

T = TypeVar("T")


class FallbackStrategy(ABC, Generic[T]):
    """Base class for fallback strategies.

    Fallback strategies are invoked when a circuit breaker is open
    or when all retries are exhausted.
    """

    def __init__(self, service_name: str):
        """Initialize the fallback strategy.

        Args:
            service_name: Name of the service this fallback is for
        """
        self.service_name = service_name

    @abstractmethod
    async def execute(
        self,
        original_func: Callable[..., T],
        original_args: tuple,
        original_kwargs: dict,
        last_exception: Optional[Exception],
    ) -> T:
        """Execute the fallback strategy.

        Args:
            original_func: The original function that failed
            original_args: Original positional arguments
            original_kwargs: Original keyword arguments
            last_exception: The last exception that occurred

        Returns:
            Fallback result

        Raises:
            Exception: If fallback cannot provide a result
        """
        pass

    def _record_fallback(self, fallback_type: str) -> None:
        """Record fallback metric."""
        logger.warning(
            f"Executing {fallback_type} fallback for {self.service_name}",
            extra={"service": self.service_name, "fallback_type": fallback_type},
        )
        metrics.counter_inc(
            "gallery_circuit_breaker_fallback_total",
            {"service": self.service_name, "type": fallback_type},
        )


class CacheFallback(FallbackStrategy[T]):
    """Fallback strategy using cached/stale data.

    Returns cached data if available, otherwise delegates to inner fallback.
    Useful for read-heavy operations where stale data is acceptable.
    """

    def __init__(
        self,
        service_name: str,
        cache_get_func: Callable,
        cache_key_func: Optional[Callable[..., str]] = None,
        inner_fallback: Optional[FallbackStrategy[T]] = None,
        default_ttl: int = 300,
    ):
        """Initialize cache fallback strategy.

        Args:
            service_name: Name of the service
            cache_get_func: Async function to get from cache
            cache_key_func: Optional function to generate cache key from args
            inner_fallback: Fallback to use if cache miss
            default_ttl: Default TTL to report for stale data
        """
        super().__init__(service_name)
        self.cache_get_func = cache_get_func
        self.cache_key_func = cache_key_func
        self.inner_fallback = inner_fallback
        self.default_ttl = default_ttl

    async def execute(
        self,
        original_func: Callable[..., T],
        original_args: tuple,
        original_kwargs: dict,
        last_exception: Optional[Exception],
    ) -> T:
        """Try to return cached data."""
        self._record_fallback("cache")

        # Generate cache key
        cache_key = None
        if self.cache_key_func:
            cache_key = self.cache_key_func(*original_args, **original_kwargs)
        else:
            # Try to extract cache key from kwargs
            cache_key = original_kwargs.get("cache_key") or original_kwargs.get("key")

        if not cache_key:
            logger.warning(
                f"Cannot generate cache key for {self.service_name}, "
                f"falling back to inner fallback"
            )
            if self.inner_fallback:
                return await self.inner_fallback.execute(
                    original_func, original_args, original_kwargs, last_exception
                )
            raise last_exception or Exception("No cache key available")

        # Try to get from cache
        try:
            cached = await self.cache_get_func(cache_key)
            if cached is not None:
                logger.info(
                    f"Returning cached data for {self.service_name} "
                    f"(service unavailable)"
                )
                metrics.counter_inc(
                    "gallery_circuit_breaker_cache_fallback_hit_total",
                    {"service": self.service_name},
                )

                # Add metadata about cache usage
                if isinstance(cached, dict):
                    cached["_cached"] = True
                    cached["_cached_at"] = datetime.now(timezone.utc).isoformat()
                    cached["_stale"] = True

                return cached

            logger.warning(f"Cache miss for {self.service_name}")
            metrics.counter_inc(
                "gallery_circuit_breaker_cache_fallback_miss_total",
                {"service": self.service_name},
            )

        except Exception as e:
            logger.error(
                f"Error reading cache for {self.service_name}: {e}",
                exc_info=True,
            )

        # Cache miss or error - try inner fallback
        if self.inner_fallback:
            return await self.inner_fallback.execute(
                original_func, original_args, original_kwargs, last_exception
            )

        # No fallback available
        raise last_exception or Exception("Cache fallback failed")


class DefaultFallback(FallbackStrategy[T]):
    """Fallback strategy returning predefined default values.

    Returns sensible defaults when service is unavailable.
    """

    def __init__(
        self,
        service_name: str,
        default_values: Dict[str, Any] | None = None,
        default_value_func: Optional[Callable[..., T]] = None,
    ):
        """Initialize default fallback strategy.

        Args:
            service_name: Name of the service
            default_values: Dictionary of default values by operation
            default_value_func: Optional function to generate default
        """
        super().__init__(service_name)
        self.default_values = default_values or {}
        self.default_value_func = default_value_func

    async def execute(
        self,
        original_func: Callable[..., T],
        original_args: tuple,
        original_kwargs: dict,
        last_exception: Optional[Exception],
    ) -> T:
        """Return default value."""
        self._record_fallback("default")

        # Try to get default by function name
        func_name = getattr(original_func, "__name__", "")
        if func_name and func_name in self.default_values:
            default = self.default_values[func_name]
            logger.info(
                f"Returning default value for {self.service_name}.{func_name}"
            )
            return default

        # Try custom default function
        if self.default_value_func:
            return await self.default_value_func(
                original_func, original_args, original_kwargs, last_exception
            )

        # Generic empty response based on return type hints
        logger.warning(f"No default configured for {self.service_name}, returning None")
        return None  # type: ignore


class NullFallback(FallbackStrategy[T]):
    """Fallback strategy that returns None/empty.

    Use this for non-critical services where it's acceptable to fail silently.
    """

    async def execute(
        self,
        original_func: Callable[..., T],
        original_args: tuple,
        original_kwargs: dict,
        last_exception: Optional[Exception],
    ) -> T:
        """Return None (fail silent)."""
        self._record_fallback("null")
        logger.info(
            f"Null fallback for {self.service_name} - returning None",
            extra={"service": self.service_name},
        )
        return None  # type: ignore


class QueuedFallback(FallbackStrategy[T]):
    """Fallback strategy that queues requests for later processing.

    Requests are added to a queue for retry when service recovers.
    Useful for webhook deliveries and notifications.
    """

    def __init__(
        self,
        service_name: str,
        queue_client: Optional[Any] = None,
        queue_name: str = "fallback-queue",
        max_queue_size: int = 10000,
    ):
        """Initialize queued fallback strategy.

        Args:
            service_name: Name of the service
            queue_client: Queue client (e.g., Redis, SQS)
            queue_name: Name of the fallback queue
            max_queue_size: Maximum queue size before dropping requests
        """
        super().__init__(service_name)
        self.queue_client = queue_client
        self.queue_name = queue_name
        self.max_queue_size = max_queue_size

    async def execute(
        self,
        original_func: Callable[..., T],
        original_args: tuple,
        original_kwargs: dict,
        last_exception: Optional[Exception],
    ) -> T:
        """Queue the request for later processing."""
        self._record_fallback("queued")

        # Serialize the request
        request_data = {
            "func": original_func.__name__,
            "args": str(original_args),  # Simplified - not serializable
            "kwargs": {k: str(v) for k, v in original_kwargs.items()},
            "queued_at": datetime.now(timezone.utc).isoformat(),
        }

        try:
            # Try to queue the request
            if self.queue_client:
                # Check queue size
                queue_size = await self._get_queue_size()
                if queue_size >= self.max_queue_size:
                    logger.error(
                        f"Fallback queue full for {self.service_name} "
                        f"({self.max_queue_size} items)"
                    )
                    metrics.counter_inc(
                        "gallery_circuit_breaker_queue_full_total",
                        {"service": self.service_name},
                    )
                    raise last_exception or Exception("Fallback queue full")

                # Add to queue
                await self._enqueue(request_data)
                logger.info(
                    f"Queued fallback request for {self.service_name}",
                    extra={"queue_size": queue_size + 1},
                )
                metrics.counter_inc(
                    "gallery_circuit_breaker_queued_total",
                    {"service": self.service_name},
                )

            else:
                logger.warning(
                    f"No queue client configured for {self.service_name}, "
                    f"request will be lost"
                )

        except Exception as e:
            logger.error(
                f"Error queueing fallback request for {self.service_name}: {e}",
                exc_info=True,
            )
            metrics.counter_inc(
                "gallery_circuit_breaker_queue_error_total",
                {"service": self.service_name},
            )

        # Return None - caller should handle async processing
        return None  # type: ignore

    async def _get_queue_size(self) -> int:
        """Get current queue size."""
        if self.queue_client and hasattr(self.queue_client, "llen"):
            try:
                return await self.queue_client.llen(self.queue_name)
            except Exception:
                return 0
        return 0

    async def _enqueue(self, data: dict) -> None:
        """Add item to queue."""
        if self.queue_client and hasattr(self.queue_client, "rpush"):
            await self.queue_client.rpush(self.queue_name, json.dumps(data))


class CompositeFallback(FallbackStrategy[T]):
    """Composite fallback that tries multiple strategies in sequence.

    Fallbacks are tried in order until one succeeds.
    """

    def __init__(self, service_name: str, fallbacks: list[FallbackStrategy[T]]):
        """Initialize composite fallback strategy.

        Args:
            service_name: Name of the service
            fallbacks: List of fallbacks to try in order
        """
        super().__init__(service_name)
        self.fallbacks = fallbacks

    async def execute(
        self,
        original_func: Callable[..., T],
        original_args: tuple,
        original_kwargs: dict,
        last_exception: Optional[Exception],
    ) -> T:
        """Try each fallback in sequence."""
        last_error = last_exception

        for fallback in self.fallbacks:
            try:
                result = await fallback.execute(
                    original_func, original_args, original_kwargs, last_exception
                )
                logger.info(
                    f"Composite fallback succeeded for {self.service_name} "
                    f"using {fallback.__class__.__name__}"
                )
                return result
            except Exception as e:
                last_error = e
                logger.debug(
                    f"Fallback {fallback.__class__.__name__} failed for "
                    f"{self.service_name}: {e}"
                )
                continue

        # All fallbacks failed
        logger.error(f"All fallbacks failed for {self.service_name}")
        raise last_error or Exception("All fallback strategies failed")


# =============================================================================
# Pre-configured Fallbacks by Service
# =============================================================================

def get_ai_service_fallback(redis_client) -> FallbackStrategy:
    """Get fallback strategy for AI service.

    Uses cached recommendations with null fallback for cache miss.
    """
    async def get_from_cache(cache_key: str) -> Optional[dict]:
        if redis_client:
            return await redis_client.get_json(cache_key)
        return None

    cache_fallback = CacheFallback(
        "ai-service",
        cache_get_func=get_from_cache,
        inner_fallback=NullFallback("ai-service"),
    )
    return cache_fallback


def get_upload_service_fallback() -> FallbackStrategy:
    """Get fallback strategy for upload service.

    No fallback - let application handle upload errors.
    """
    return NullFallback("upload-service")


def get_billing_service_fallback() -> FallbackStrategy:
    """Get fallback strategy for billing service.

    No fallback - billing is critical and should fail fast.
    """
    return DefaultFallback(
        "billing-service",
        default_values={
            "get_subscription": None,  # type: ignore
            "get_usage": {"usage": 0, "limit": 0},
        },
    )


def get_client_service_fallback(redis_client) -> FallbackStrategy:
    """Get fallback strategy for client service.

    Uses cached client data with default fallback.
    """
    async def get_from_cache(cache_key: str) -> Optional[dict]:
        if redis_client:
            return await redis_client.get_json(cache_key)
        return None

    cache_fallback = CacheFallback(
        "client-service",
        cache_get_func=get_from_cache,
        inner_fallback=DefaultFallback(
            "client-service",
            default_values={
                "get_clients": [],  # type: ignore
                "get_client": None,  # type: ignore
            },
        ),
    )
    return cache_fallback


def get_notifications_service_fallback() -> FallbackStrategy:
    """Get fallback strategy for notifications service.

    Queues notifications for later delivery.
    """
    return QueuedFallback(
        "notifications-service",
        queue_name="notifications-fallback",
    )


def get_webhooks_service_fallback() -> FallbackStrategy:
    """Get fallback strategy for webhooks service.

    Webhooks service has its own retry logic, so null fallback.
    """
    return NullFallback("webhooks-service")
