"""
Redis connection module for chunk buffering and upload state management.

Provides Redis connectivity optimized for 50K concurrent uploads with:
- Async redis-py with connection pooling
- Connection health monitoring and automatic recovery
- TTL management for chunk data and metadata
- Pipeline support for batch operations
- Graceful shutdown and connection draining

Usage:
    from app.core.redis import (
        init_redis,
        close_redis,
        get_redis,
        redis_healthcheck,
    )

    # Initialize at startup
    await init_redis()

    # Get client for operations
    redis = await get_redis()
    await redis.setex("key", 3600, b"value")

    # Cleanup at shutdown
    await close_redis()
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass
from functools import wraps
from typing import (
    TYPE_CHECKING,
    Any,
    AsyncIterator,
    Callable,
    Optional,
    TypeVar,
    Union,
)

from redis.asyncio import ConnectionPool, Redis
from redis.exceptions import (
    ConnectionError as RedisConnectionError,
    RedisError,
    TimeoutError as RedisTimeoutError,
)

if TYPE_CHECKING:
    from redis.asyncio.client import Pipeline

logger = logging.getLogger(__name__)

# Type variable for generic return types
T = TypeVar("T")

# Global client and pool instances
_redis_client: Optional[Redis] = None
_connection_pool: Optional[ConnectionPool] = None


@dataclass
class RedisPoolStats:
    """Statistics about the Redis connection pool state."""

    max_connections: int
    active_connections: int
    idle_connections: int
    total_connections: int
    status: str

    @property
    def utilization_percent(self) -> float:
        """Calculate pool utilization as a percentage."""
        if self.max_connections == 0:
            return 0.0
        return (self.active_connections / self.max_connections) * 100


@dataclass
class RetryConfig:
    """Configuration for Redis operation retries."""

    max_attempts: int = 3
    base_delay: float = 0.1
    max_delay: float = 5.0
    exponential_base: float = 2.0

    # Exceptions that should trigger a retry
    retryable_exceptions: tuple[type[Exception], ...] = (
        RedisConnectionError,
        RedisTimeoutError,
    )


# Default retry configuration
DEFAULT_RETRY_CONFIG = RetryConfig()


class InMemoryRedis:
    """Lightweight Redis substitute for tests and development.

    Supports operations used by chunk buffering, upload state tracking,
    and health checks. This implementation is NOT thread-safe and should
    only be used for testing.
    """

    def __init__(self) -> None:
        self._data: dict[str, bytes] = {}
        self._expires: dict[str, float] = {}
        self._counters: dict[str, int] = {}
        self._hashes: dict[str, dict[str, bytes]] = {}
        self.closed = False
        self.ping_called = 0

    # ==========================================================================
    # Connection lifecycle
    # ==========================================================================

    async def aclose(self) -> None:
        """Close the in-memory Redis (mimic redis.asyncio)."""
        self.closed = True

    async def ping(self) -> bool:
        """Ping check - always returns True for in-memory."""
        self.ping_called += 1
        return True

    # ==========================================================================
    # Expiry helpers
    # ==========================================================================

    def _cleanup_expired(self, key: str) -> None:
        """Remove a single key if expired."""
        expiry = self._expires.get(key)
        if expiry and time.time() > expiry:
            self._data.pop(key, None)
            self._counters.pop(key, None)
            self._hashes.pop(key, None)
            self._expires.pop(key, None)

    def _cleanup_all_expired(self) -> None:
        """Clean up all expired keys."""
        now = time.time()
        expired_keys = [k for k, v in self._expires.items() if v < now]
        for key in expired_keys:
            self._data.pop(key, None)
            self._counters.pop(key, None)
            self._hashes.pop(key, None)
            self._expires.pop(key, None)

    # ==========================================================================
    # String operations (chunk data storage)
    # ==========================================================================

    async def get(self, key: str) -> Optional[bytes]:
        """Get a string value."""
        self._cleanup_expired(key)
        return self._data.get(key)

    async def set(
        self,
        key: str,
        value: Union[str, bytes],
        ex: Optional[int] = None,
        px: Optional[int] = None,
        nx: bool = False,
        xx: bool = False,
    ) -> Optional[bool]:
        """Set a string value with optional expiry."""
        self._cleanup_expired(key)

        # Handle NX (only set if not exists) and XX (only set if exists)
        exists = key in self._data
        if nx and exists:
            return None
        if xx and not exists:
            return None

        if isinstance(value, str):
            self._data[key] = value.encode("utf-8")
        else:
            self._data[key] = value

        if ex:
            self._expires[key] = time.time() + ex
        elif px:
            self._expires[key] = time.time() + (px / 1000.0)

        return True

    async def setex(self, key: str, ttl: int, value: Union[str, bytes]) -> bool:
        """Set a string value with expiry in seconds."""
        return await self.set(key, value, ex=ttl) or False

    async def setnx(self, key: str, value: Union[str, bytes]) -> bool:
        """Set a string value only if it doesn't exist."""
        result = await self.set(key, value, nx=True)
        return result is not None

    async def mget(self, keys: list[str]) -> list[Optional[bytes]]:
        """Get multiple string values."""
        self._cleanup_all_expired()
        return [self._data.get(k) for k in keys]

    async def mset(self, mapping: dict[str, Union[str, bytes]]) -> bool:
        """Set multiple string values."""
        for key, value in mapping.items():
            await self.set(key, value)
        return True

    async def exists(self, *keys: str) -> int:
        """Check how many keys exist."""
        self._cleanup_all_expired()
        count = 0
        for k in keys:
            if k in self._data or k in self._counters or k in self._hashes:
                count += 1
        return count

    async def ttl(self, key: str) -> int:
        """Get remaining TTL for a key in seconds."""
        self._cleanup_expired(key)
        if key not in self._data and key not in self._counters and key not in self._hashes:
            return -2  # Key doesn't exist
        expiry = self._expires.get(key)
        if expiry is None:
            return -1  # No expiry set
        remaining = int(expiry - time.time())
        return max(0, remaining)

    async def pttl(self, key: str) -> int:
        """Get remaining TTL for a key in milliseconds."""
        ttl_seconds = await self.ttl(key)
        if ttl_seconds < 0:
            return ttl_seconds
        return ttl_seconds * 1000

    async def delete(self, *keys: str) -> int:
        """Delete one or more keys."""
        deleted = 0
        for key in keys:
            found = False
            if key in self._data:
                del self._data[key]
                found = True
            if key in self._counters:
                del self._counters[key]
                found = True
            if key in self._hashes:
                del self._hashes[key]
                found = True
            if found:
                deleted += 1
                self._expires.pop(key, None)
        return deleted

    async def expire(self, key: str, seconds: int, nx: bool = False, xx: bool = False) -> bool:
        """Set expiry on a key."""
        if key not in self._data and key not in self._counters and key not in self._hashes:
            return False
        if nx and key in self._expires:
            return False
        if xx and key not in self._expires:
            return False
        self._expires[key] = time.time() + seconds
        return True

    async def pexpire(self, key: str, milliseconds: int) -> bool:
        """Set expiry on a key in milliseconds."""
        if key not in self._data and key not in self._counters and key not in self._hashes:
            return False
        self._expires[key] = time.time() + (milliseconds / 1000.0)
        return True

    # ==========================================================================
    # Counter operations (for metrics and tracking)
    # ==========================================================================

    async def incr(self, key: str) -> int:
        """Increment a counter by 1."""
        return await self.incrby(key, 1)

    async def incrby(self, key: str, amount: int = 1) -> int:
        """Increment a counter by specified amount."""
        self._cleanup_expired(key)
        if key not in self._counters:
            self._counters[key] = 0
        self._counters[key] += amount
        return self._counters[key]

    async def decr(self, key: str) -> int:
        """Decrement a counter by 1."""
        return await self.decrby(key, 1)

    async def decrby(self, key: str, amount: int = 1) -> int:
        """Decrement a counter by specified amount."""
        self._cleanup_expired(key)
        if key not in self._counters:
            self._counters[key] = 0
        self._counters[key] -= amount
        return self._counters[key]

    # ==========================================================================
    # Hash operations (for upload metadata)
    # ==========================================================================

    async def hset(self, key: str, field: str, value: Union[str, bytes]) -> int:
        """Set a hash field."""
        self._cleanup_expired(key)
        if key not in self._hashes:
            self._hashes[key] = {}
        is_new = field not in self._hashes[key]
        if isinstance(value, str):
            self._hashes[key][field] = value.encode("utf-8")
        else:
            self._hashes[key][field] = value
        return 1 if is_new else 0

    async def hget(self, key: str, field: str) -> Optional[bytes]:
        """Get a hash field value."""
        self._cleanup_expired(key)
        if key not in self._hashes:
            return None
        return self._hashes[key].get(field)

    async def hmset(self, key: str, mapping: dict[str, Union[str, bytes]]) -> bool:
        """Set multiple hash fields."""
        self._cleanup_expired(key)
        if key not in self._hashes:
            self._hashes[key] = {}
        for field, value in mapping.items():
            if isinstance(value, str):
                self._hashes[key][field] = value.encode("utf-8")
            else:
                self._hashes[key][field] = value
        return True

    async def hmget(self, key: str, fields: list[str]) -> list[Optional[bytes]]:
        """Get multiple hash field values."""
        self._cleanup_expired(key)
        if key not in self._hashes:
            return [None] * len(fields)
        return [self._hashes[key].get(f) for f in fields]

    async def hgetall(self, key: str) -> dict[bytes, bytes]:
        """Get all hash fields and values."""
        self._cleanup_expired(key)
        if key not in self._hashes:
            return {}
        return {k.encode("utf-8") if isinstance(k, str) else k: v for k, v in self._hashes[key].items()}

    async def hdel(self, key: str, *fields: str) -> int:
        """Delete hash fields."""
        self._cleanup_expired(key)
        if key not in self._hashes:
            return 0
        deleted = 0
        for field in fields:
            if field in self._hashes[key]:
                del self._hashes[key][field]
                deleted += 1
        return deleted

    async def hexists(self, key: str, field: str) -> bool:
        """Check if hash field exists."""
        self._cleanup_expired(key)
        if key not in self._hashes:
            return False
        return field in self._hashes[key]

    async def hlen(self, key: str) -> int:
        """Get number of hash fields."""
        self._cleanup_expired(key)
        if key not in self._hashes:
            return 0
        return len(self._hashes[key])

    # ==========================================================================
    # Scan operations (for cleanup)
    # ==========================================================================

    async def scan(
        self,
        cursor: int = 0,
        match: Optional[str] = None,
        count: int = 100,
    ) -> tuple[int, list[bytes]]:
        """Scan keys matching a pattern."""
        import fnmatch
        import re

        self._cleanup_all_expired()

        all_keys = list(
            set(
                list(self._data.keys())
                + list(self._counters.keys())
                + list(self._hashes.keys())
            )
        )

        if match:
            # Convert Redis glob pattern to regex
            pattern = match.replace("*", ".*").replace("?", ".")
            regex = re.compile(f"^{pattern}$")
            matched_keys = [k for k in all_keys if regex.match(k)]
        else:
            matched_keys = all_keys

        # Simple cursor-based pagination
        start = cursor
        end = min(start + count, len(matched_keys))
        result_keys = matched_keys[start:end]

        # Return 0 cursor when done, otherwise next position
        next_cursor = 0 if end >= len(matched_keys) else end

        return next_cursor, [k.encode("utf-8") if isinstance(k, str) else k for k in result_keys]

    # ==========================================================================
    # Pipeline emulation
    # ==========================================================================

    class Pipeline:
        """Pipeline emulation for batched operations in tests."""

        def __init__(self, parent: "InMemoryRedis") -> None:
            self.parent = parent
            self.ops: list[tuple[str, tuple, dict]] = []

        def get(self, key: str) -> "InMemoryRedis.Pipeline":
            self.ops.append(("get", (key,), {}))
            return self

        def set(self, key: str, value: Union[str, bytes], ex: Optional[int] = None) -> "InMemoryRedis.Pipeline":
            self.ops.append(("set", (key, value), {"ex": ex}))
            return self

        def setex(self, key: str, ttl: int, value: Union[str, bytes]) -> "InMemoryRedis.Pipeline":
            self.ops.append(("setex", (key, ttl, value), {}))
            return self

        def delete(self, *keys: str) -> "InMemoryRedis.Pipeline":
            self.ops.append(("delete", keys, {}))
            return self

        def expire(self, key: str, seconds: int, nx: bool = False) -> "InMemoryRedis.Pipeline":
            self.ops.append(("expire", (key, seconds), {"nx": nx}))
            return self

        def incrby(self, key: str, amount: int = 1) -> "InMemoryRedis.Pipeline":
            self.ops.append(("incrby", (key, amount), {}))
            return self

        def hset(self, key: str, field: str, value: Union[str, bytes]) -> "InMemoryRedis.Pipeline":
            self.ops.append(("hset", (key, field, value), {}))
            return self

        def hget(self, key: str, field: str) -> "InMemoryRedis.Pipeline":
            self.ops.append(("hget", (key, field), {}))
            return self

        def hmset(self, key: str, mapping: dict[str, Union[str, bytes]]) -> "InMemoryRedis.Pipeline":
            self.ops.append(("hmset", (key, mapping), {}))
            return self

        def hdel(self, key: str, *fields: str) -> "InMemoryRedis.Pipeline":
            self.ops.append(("hdel", (key, *fields), {}))
            return self

        async def execute(self) -> list[Any]:
            """Execute all queued operations."""
            results = []
            for op, args, kwargs in self.ops:
                method = getattr(self.parent, op)
                results.append(await method(*args, **kwargs))
            self.ops = []
            return results

    def pipeline(self, transaction: bool = True) -> "InMemoryRedis.Pipeline":
        """Create a pipeline for batched operations."""
        return InMemoryRedis.Pipeline(self)


async def init_redis(
    redis_url: Optional[str] = None,
    max_connections: int = 50,
    socket_timeout: float = 5.0,
    socket_connect_timeout: float = 5.0,
    retry_on_timeout: bool = True,
    health_check_interval: int = 30,
) -> Redis:
    """Initialize the async Redis client with connection pooling.

    Creates a connection pool optimized for high-concurrency chunk buffering
    with configurable timeouts and health checks.

    Args:
        redis_url: Redis connection URL. If None, loads from settings.
        max_connections: Maximum connections in pool (default: 50).
        socket_timeout: Socket timeout in seconds (default: 5.0).
        socket_connect_timeout: Connection timeout in seconds (default: 5.0).
        retry_on_timeout: Retry on timeout errors (default: True).
        health_check_interval: Health check interval in seconds (default: 30).

    Returns:
        Redis: The initialized async Redis client.

    Example:
        await init_redis()
        redis = await get_redis()
        await redis.setex("chunk:123:0", 3600, chunk_data)
    """
    global _redis_client, _connection_pool

    if _redis_client is not None:
        logger.debug("Redis client already initialized, returning existing client")
        return _redis_client

    # Load settings if URL not provided
    if redis_url is None:
        from app.core.config import get_settings
        settings = get_settings()
        redis_url = settings.REDIS_URL
        max_connections = settings.REDIS_MAX_CONNECTIONS
        socket_timeout = settings.REDIS_SOCKET_TIMEOUT
        socket_connect_timeout = settings.REDIS_SOCKET_CONNECT_TIMEOUT
        retry_on_timeout = settings.REDIS_RETRY_ON_TIMEOUT
        health_check_interval = settings.REDIS_HEALTH_CHECK_INTERVAL

    # Use in-memory Redis for tests
    if os.getenv("PYTEST_CURRENT_TEST"):
        _redis_client = InMemoryRedis()  # type: ignore[assignment]
        logger.info("Redis client initialized (in-memory test mode)")
        return _redis_client

    if os.getenv("USE_IN_MEMORY_REDIS", "0") == "1":
        _redis_client = InMemoryRedis()  # type: ignore[assignment]
        logger.info("Redis client initialized (in-memory development mode)")
        return _redis_client

    # Create connection pool with configurable settings
    _connection_pool = ConnectionPool.from_url(
        redis_url,
        encoding="utf-8",
        decode_responses=False,  # Return bytes for binary chunk data
        max_connections=max_connections,
        socket_timeout=socket_timeout,
        socket_connect_timeout=socket_connect_timeout,
        retry_on_timeout=retry_on_timeout,
        health_check_interval=health_check_interval,
    )

    _redis_client = Redis(connection_pool=_connection_pool)

    # Verify connection
    try:
        await _redis_client.ping()
        logger.info(
            "Redis client initialized with connection pool",
            extra={
                "max_connections": max_connections,
                "socket_timeout": socket_timeout,
                "health_check_interval": health_check_interval,
            },
        )
    except RedisError as e:
        logger.warning(
            "Redis connection test failed, client created but may need retry",
            extra={"error": str(e)},
        )

    return _redis_client


async def get_redis() -> Redis:
    """Get the initialized Redis client.

    Returns:
        Redis: The async Redis client.

    Raises:
        RuntimeError: If Redis has not been initialized.

    Example:
        redis = await get_redis()
        value = await redis.get("key")
    """
    if _redis_client is None:
        raise RuntimeError(
            "Redis client has not been initialized. Call init_redis() first."
        )
    return _redis_client


async def close_redis() -> None:
    """Close the Redis client and connection pool.

    Should be called during application shutdown to cleanly close
    all Redis connections.

    Example:
        async def shutdown():
            await close_redis()
    """
    global _redis_client, _connection_pool

    if _redis_client is not None:
        close_method = getattr(_redis_client, "aclose", None)
        if callable(close_method):
            await close_method()
        _redis_client = None

    if _connection_pool is not None:
        await _connection_pool.disconnect()
        _connection_pool = None

    logger.info("Redis client and connection pool closed")


# =============================================================================
# Health Checks and Monitoring
# =============================================================================


async def redis_healthcheck(timeout: float = 2.0) -> bool:
    """Check Redis connectivity with a ping.

    Args:
        timeout: Maximum seconds to wait for ping response.

    Returns:
        True if Redis is healthy, False otherwise.

    Example:
        if not await redis_healthcheck():
            logger.error("Redis health check failed")
    """
    try:
        redis = await get_redis()
        async with asyncio.timeout(timeout):
            result = await redis.ping()
            return bool(result)
    except Exception as e:
        logger.warning(
            "Redis health check failed",
            extra={"error": str(e)},
        )
        return False


def get_redis_pool_stats() -> RedisPoolStats:
    """Get connection pool statistics for monitoring.

    Returns:
        RedisPoolStats with current pool state.

    Example:
        stats = get_redis_pool_stats()
        if stats.utilization_percent > 80:
            logger.warning("Redis pool utilization high")
    """
    if _connection_pool is None:
        return RedisPoolStats(
            max_connections=0,
            active_connections=0,
            idle_connections=0,
            total_connections=0,
            status="not_initialized",
        )

    # Get connection counts from pool internals
    active = len(_connection_pool._in_use_connections) if hasattr(_connection_pool, "_in_use_connections") else 0
    idle = len(_connection_pool._available_connections) if hasattr(_connection_pool, "_available_connections") else 0

    return RedisPoolStats(
        max_connections=_connection_pool.max_connections,
        active_connections=active,
        idle_connections=idle,
        total_connections=active + idle,
        status="initialized",
    )


async def get_redis_pool_stats_async() -> RedisPoolStats:
    """Async wrapper for get_redis_pool_stats for API consistency."""
    return get_redis_pool_stats()


async def log_redis_stats() -> None:
    """Log current Redis pool statistics at INFO level.

    Useful for periodic monitoring or debugging connection issues.
    """
    stats = get_redis_pool_stats()
    if stats.status == "not_initialized":
        logger.info("Redis pool statistics unavailable (not initialized)")
        return

    logger.info(
        "Redis pool statistics",
        extra={
            "max_connections": stats.max_connections,
            "active_connections": stats.active_connections,
            "idle_connections": stats.idle_connections,
            "total_connections": stats.total_connections,
            "utilization_percent": round(stats.utilization_percent, 2),
        },
    )


async def wait_for_redis_ready(
    timeout: float = 30.0,
    check_interval: float = 1.0,
) -> bool:
    """Wait for Redis to be ready and accepting connections.

    Useful for startup checks or waiting after Redis recovery.

    Args:
        timeout: Maximum seconds to wait for readiness.
        check_interval: Seconds between readiness checks.

    Returns:
        True if Redis is ready, False if timeout was reached.

    Example:
        if not await wait_for_redis_ready(timeout=60.0):
            logger.error("Redis failed to become ready")
            sys.exit(1)
    """
    start_time = time.monotonic()

    while time.monotonic() - start_time < timeout:
        if await redis_healthcheck(timeout=check_interval):
            logger.info("Redis is ready")
            return True
        await asyncio.sleep(check_interval)

    logger.error(
        "Redis failed to become ready within timeout",
        extra={"timeout_seconds": timeout},
    )
    return False


# =============================================================================
# Retry Decorator
# =============================================================================


def with_redis_retry(
    config: Optional[RetryConfig] = None,
) -> Callable[[Callable[..., T]], Callable[..., T]]:
    """Decorator for automatic retry of Redis operations.

    Implements exponential backoff with jitter for retryable exceptions
    like connection errors and timeouts.

    Args:
        config: Retry configuration (uses defaults if not provided).

    Example:
        @with_redis_retry()
        async def get_chunk(key: str) -> bytes:
            redis = await get_redis()
            return await redis.get(key)

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
                            "Redis operation failed after max retries",
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
                        "Retrying Redis operation",
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
# Context Managers
# =============================================================================


@asynccontextmanager
async def redis_pipeline(transaction: bool = True) -> AsyncIterator["Pipeline"]:
    """Create a Redis pipeline for batched operations.

    Pipelines reduce network round-trips by batching multiple commands.
    Useful for storing multiple chunks or updating multiple keys atomically.

    Args:
        transaction: If True, execute as MULTI/EXEC transaction (default: True).

    Example:
        async with redis_pipeline() as pipe:
            pipe.setex("chunk:1:0", 3600, chunk_data_1)
            pipe.setex("chunk:1:5242880", 3600, chunk_data_2)
            results = await pipe.execute()

    Yields:
        Pipeline: A Redis pipeline object.
    """
    redis = await get_redis()
    pipe = redis.pipeline(transaction=transaction)
    try:
        yield pipe
    finally:
        # Pipeline is automatically cleaned up when context exits
        pass


# =============================================================================
# Chunk Key Helpers
# =============================================================================


def make_chunk_key(workspace_id: str, upload_id: str, offset: int) -> str:
    """Generate Redis key for chunk data.

    Key format: chunk:{workspace_id}:{upload_id}:{offset}

    Args:
        workspace_id: Workspace UUID (string format).
        upload_id: Upload session UUID (string format).
        offset: Byte offset of the chunk.

    Returns:
        Redis key string for the chunk.

    Example:
        key = make_chunk_key("ws-123", "upload-456", 0)
        # Returns: "chunk:ws-123:upload-456:0"
    """
    return f"chunk:{workspace_id}:{upload_id}:{offset}"


def make_chunk_metadata_key(workspace_id: str, upload_id: str) -> str:
    """Generate Redis key for chunk upload metadata.

    Metadata includes: current offset, total chunks, expiry time, etc.
    Key format: chunk_meta:{workspace_id}:{upload_id}

    Args:
        workspace_id: Workspace UUID (string format).
        upload_id: Upload session UUID (string format).

    Returns:
        Redis key string for the metadata.

    Example:
        key = make_chunk_metadata_key("ws-123", "upload-456")
        # Returns: "chunk_meta:ws-123:upload-456"
    """
    return f"chunk_meta:{workspace_id}:{upload_id}"


def make_upload_lock_key(workspace_id: str, upload_id: str) -> str:
    """Generate Redis key for upload lock (prevents concurrent modifications).

    Key format: upload_lock:{workspace_id}:{upload_id}

    Args:
        workspace_id: Workspace UUID (string format).
        upload_id: Upload session UUID (string format).

    Returns:
        Redis key string for the lock.

    Example:
        key = make_upload_lock_key("ws-123", "upload-456")
        # Returns: "upload_lock:ws-123:upload-456"
    """
    return f"upload_lock:{workspace_id}:{upload_id}"


# =============================================================================
# Module Exports
# =============================================================================

__all__ = [
    # Initialization and lifecycle
    "init_redis",
    "close_redis",
    "get_redis",
    # Health and monitoring
    "redis_healthcheck",
    "get_redis_pool_stats",
    "get_redis_pool_stats_async",
    "log_redis_stats",
    "wait_for_redis_ready",
    # Retry support
    "with_redis_retry",
    "RetryConfig",
    "DEFAULT_RETRY_CONFIG",
    # Context managers
    "redis_pipeline",
    # Key helpers
    "make_chunk_key",
    "make_chunk_metadata_key",
    "make_upload_lock_key",
    # Types
    "RedisPoolStats",
    # Testing
    "InMemoryRedis",
]
