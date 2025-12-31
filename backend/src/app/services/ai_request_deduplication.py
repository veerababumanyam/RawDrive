"""AI Request Deduplication Service.

Provides in-flight request deduplication for AI API calls to prevent
duplicate API calls for the same request parameters.

Feature: 010-ai-powered-features
Task: T077 - Optimize AI API calls with request deduplication
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Generic, Optional, TypeVar
from uuid import UUID

import httpx

from app.db.redis import get_redis_client

logger = logging.getLogger(__name__)

T = TypeVar("T")

# Cache TTL for image data (5 minutes)
IMAGE_DATA_CACHE_TTL = 300

# In-flight request timeout (30 seconds)
IN_FLIGHT_TIMEOUT = 30


@dataclass
class PendingRequest(Generic[T]):
    """Tracks a pending/in-flight request."""

    future: asyncio.Future[T]
    created_at: float


class AIRequestDeduplicationService:
    """Service for deduplicating AI API requests.

    This service provides two main optimizations:
    1. In-flight deduplication: Multiple concurrent requests for the same
       operation share a single API call
    2. Image data caching: Fetched image data is cached to avoid redundant
       HTTP requests

    Example usage:
        dedup = get_ai_deduplication_service()

        # Deduplicate in-flight requests
        result = await dedup.deduplicated_call(
            cache_key="analysis:photo123:user456",
            operation=lambda: analyze_photo(photo_url),
        )

        # Fetch image with caching
        image_data = await dedup.fetch_image_data(photo_url)
    """

    def __init__(self):
        self._pending_requests: dict[str, PendingRequest[Any]] = {}
        self._lock = asyncio.Lock()

    async def deduplicated_call(
        self,
        cache_key: str,
        operation: Callable[[], Awaitable[T]],
        timeout: float = IN_FLIGHT_TIMEOUT,
    ) -> T:
        """Execute an operation with in-flight request deduplication.

        If a request with the same cache_key is already in progress,
        wait for that request to complete and return its result.

        Args:
            cache_key: Unique identifier for this request
            operation: Async function to execute if no pending request exists
            timeout: Maximum time to wait for a pending request (seconds)

        Returns:
            Result from the operation (either new or shared)

        Raises:
            asyncio.TimeoutError: If waiting for pending request times out
            Exception: Any exception raised by the operation
        """
        async with self._lock:
            # Clean up stale pending requests
            self._cleanup_stale_requests()

            # Check if there's already a pending request
            if cache_key in self._pending_requests:
                pending = self._pending_requests[cache_key]
                logger.debug(f"Reusing in-flight request for {cache_key}")
            else:
                # Create new pending request
                pending = PendingRequest(
                    future=asyncio.get_event_loop().create_future(),
                    created_at=time.time(),
                )
                self._pending_requests[cache_key] = pending

                # Execute operation in background
                asyncio.create_task(
                    self._execute_and_complete(cache_key, operation, pending)
                )

        # Wait for result
        try:
            return await asyncio.wait_for(pending.future, timeout=timeout)
        except asyncio.TimeoutError:
            logger.warning(f"Timeout waiting for request {cache_key}")
            raise

    async def _execute_and_complete(
        self,
        cache_key: str,
        operation: Callable[[], Awaitable[T]],
        pending: PendingRequest[T],
    ) -> None:
        """Execute operation and complete the pending future."""
        try:
            result = await operation()
            if not pending.future.done():
                pending.future.set_result(result)
        except Exception as e:
            if not pending.future.done():
                pending.future.set_exception(e)
        finally:
            # Remove from pending after completion
            async with self._lock:
                if cache_key in self._pending_requests:
                    del self._pending_requests[cache_key]

    def _cleanup_stale_requests(self) -> None:
        """Remove requests that have been pending too long."""
        now = time.time()
        stale_keys = [
            key
            for key, pending in self._pending_requests.items()
            if now - pending.created_at > IN_FLIGHT_TIMEOUT * 2
        ]
        for key in stale_keys:
            pending = self._pending_requests.pop(key, None)
            if pending and not pending.future.done():
                pending.future.set_exception(
                    asyncio.TimeoutError(f"Request {key} timed out")
                )

    async def fetch_image_data(
        self,
        photo_url: str,
        use_cache: bool = True,
    ) -> str:
        """Fetch image data from URL with caching.

        Image data is cached in Redis to avoid redundant HTTP requests
        when the same image is used for multiple AI operations.

        Args:
            photo_url: URL to fetch the image from
            use_cache: Whether to use Redis cache (default: True)

        Returns:
            Base64-encoded image data
        """
        cache_key = self._get_image_cache_key(photo_url)

        # Check cache
        if use_cache:
            try:
                redis = await get_redis_client()
                cached = await redis.get(cache_key)
                if cached:
                    logger.debug(f"Image cache hit for {photo_url[:50]}...")
                    return cached
            except Exception as e:
                logger.warning(f"Redis cache error: {e}")

        # Fetch image
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(photo_url)
            response.raise_for_status()

            import base64
            image_data = base64.b64encode(response.content).decode()

        # Cache the result
        if use_cache:
            try:
                redis = await get_redis_client()
                await redis.setex(cache_key, IMAGE_DATA_CACHE_TTL, image_data)
                logger.debug(f"Cached image data for {photo_url[:50]}...")
            except Exception as e:
                logger.warning(f"Failed to cache image data: {e}")

        return image_data

    def _get_image_cache_key(self, photo_url: str) -> str:
        """Generate cache key for image data."""
        url_hash = hashlib.md5(photo_url.encode()).hexdigest()
        return f"ai:image:{url_hash}"

    @staticmethod
    def generate_request_key(
        operation: str,
        user_id: Optional[UUID] = None,
        photo_id: Optional[UUID] = None,
        **kwargs: Any,
    ) -> str:
        """Generate a unique cache key for an AI request.

        Args:
            operation: Type of operation (e.g., "analysis", "captions")
            user_id: User making the request
            photo_id: Photo being processed
            **kwargs: Additional parameters to include in the key

        Returns:
            Unique cache key string
        """
        # Build key components
        parts = [f"ai:{operation}"]

        if user_id:
            parts.append(f"u:{user_id}")

        if photo_id:
            parts.append(f"p:{photo_id}")

        # Add sorted kwargs for consistency
        for key in sorted(kwargs.keys()):
            value = kwargs[key]
            if value is not None:
                parts.append(f"{key}:{value}")

        key_str = ":".join(parts)

        # Hash if too long
        if len(key_str) > 200:
            key_hash = hashlib.md5(key_str.encode()).hexdigest()
            return f"ai:{operation}:{key_hash}"

        return key_str


# ---------------------------------------------------------------------------
# Service Factory
# ---------------------------------------------------------------------------


_deduplication_service: Optional[AIRequestDeduplicationService] = None


def get_ai_deduplication_service() -> AIRequestDeduplicationService:
    """Get the AI request deduplication service instance."""
    global _deduplication_service
    if _deduplication_service is None:
        _deduplication_service = AIRequestDeduplicationService()
    return _deduplication_service
