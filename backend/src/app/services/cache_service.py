"""Generic Cache Service with Key Namespacing and TTL Management.

Provides a unified interface for Redis-based caching with:
- Key namespacing for different cache layers
- Configurable TTL management
- Bulk operations and pattern invalidation
- Graceful degradation on errors

Feature: core-redis-cache
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from enum import Enum
from typing import Any, Generic, Optional, TypeVar, Union
from uuid import UUID

from app.db.redis import get_redis_client

logger = logging.getLogger(__name__)

T = TypeVar("T")


# ---------------------------------------------------------------------------
# Cache Layer Configuration
# ---------------------------------------------------------------------------


class CacheLayer(str, Enum):
    """Predefined cache layers with associated TTL and prefix configurations.

    Each layer represents a distinct caching use case with appropriate defaults.
    """

    # User session and auth data - short TTL for security
    SESSION = "session"

    # User preferences and settings - medium TTL
    USER = "user"

    # API response caching - varies by endpoint
    API = "api"

    # Computed/aggregated data - longer TTL
    COMPUTED = "computed"

    # Temporary/ephemeral data - very short TTL
    TEMP = "temp"

    # AI/ML results - long TTL (content doesn't change)
    AI = "ai"

    # Rate limiting data
    RATE_LIMIT = "ratelimit"

    # Permission/authorization cache
    PERMISSIONS = "perms"

    # Search/query cache
    SEARCH = "search"

    # Application config/feature flags
    CONFIG = "config"


@dataclass(frozen=True)
class CacheLayerConfig:
    """Configuration for a cache layer."""

    prefix: str
    default_ttl: int  # seconds
    description: str


# Default configurations for each cache layer
CACHE_LAYER_CONFIGS: dict[CacheLayer, CacheLayerConfig] = {
    CacheLayer.SESSION: CacheLayerConfig(
        prefix="session",
        default_ttl=3600,  # 1 hour
        description="User session and auth tokens",
    ),
    CacheLayer.USER: CacheLayerConfig(
        prefix="user",
        default_ttl=1800,  # 30 minutes
        description="User preferences and settings",
    ),
    CacheLayer.API: CacheLayerConfig(
        prefix="api",
        default_ttl=300,  # 5 minutes
        description="API response caching",
    ),
    CacheLayer.COMPUTED: CacheLayerConfig(
        prefix="computed",
        default_ttl=3600,  # 1 hour
        description="Computed/aggregated data",
    ),
    CacheLayer.TEMP: CacheLayerConfig(
        prefix="temp",
        default_ttl=60,  # 1 minute
        description="Temporary/ephemeral data",
    ),
    CacheLayer.AI: CacheLayerConfig(
        prefix="ai",
        default_ttl=86400 * 7,  # 7 days
        description="AI/ML analysis results",
    ),
    CacheLayer.RATE_LIMIT: CacheLayerConfig(
        prefix="ratelimit",
        default_ttl=60,  # 1 minute (varies by limit type)
        description="Rate limiting counters",
    ),
    CacheLayer.PERMISSIONS: CacheLayerConfig(
        prefix="perms",
        default_ttl=300,  # 5 minutes
        description="Permission/authorization cache",
    ),
    CacheLayer.SEARCH: CacheLayerConfig(
        prefix="search",
        default_ttl=600,  # 10 minutes
        description="Search and query results",
    ),
    CacheLayer.CONFIG: CacheLayerConfig(
        prefix="config",
        default_ttl=3600,  # 1 hour
        description="Application configuration cache",
    ),
}


# ---------------------------------------------------------------------------
# Key Builder
# ---------------------------------------------------------------------------


class CacheKeyBuilder:
    """Utility for building consistent cache keys with namespacing.

    Provides methods for constructing properly formatted cache keys
    with support for versioning, namespaces, and parameters.
    """

    SEPARATOR = ":"
    VERSION_PREFIX = "v"
    DEFAULT_VERSION = 1

    def __init__(self, layer: CacheLayer, version: int = DEFAULT_VERSION):
        """Initialize the key builder for a specific cache layer.

        Args:
            layer: The cache layer to build keys for
            version: Key version for cache invalidation on schema changes
        """
        self.layer = layer
        self.config = CACHE_LAYER_CONFIGS[layer]
        self.version = version

    def build(self, *parts: Union[str, int, UUID, None]) -> str:
        """Build a cache key from parts.

        Args:
            *parts: Key parts to join (None values are filtered out)

        Returns:
            Formatted cache key string

        Example:
            >>> builder = CacheKeyBuilder(CacheLayer.USER)
            >>> builder.build("profile", user_id)
            "user:v1:profile:123e4567-e89b-12d3-a456-426614174000"
        """
        version_part = f"{self.VERSION_PREFIX}{self.version}"
        filtered_parts = [str(p) for p in parts if p is not None]
        all_parts = [self.config.prefix, version_part] + filtered_parts
        return self.SEPARATOR.join(all_parts)

    def build_pattern(self, *parts: Union[str, int, UUID, None], wildcard: str = "*") -> str:
        """Build a pattern for key scanning/matching.

        Args:
            *parts: Key parts to join
            wildcard: Wildcard character to append

        Returns:
            Pattern string for SCAN/KEYS operations

        Example:
            >>> builder = CacheKeyBuilder(CacheLayer.USER)
            >>> builder.build_pattern("profile")
            "user:v1:profile:*"
        """
        base = self.build(*parts)
        return f"{base}{self.SEPARATOR}{wildcard}"

    @classmethod
    def from_raw(cls, prefix: str, *parts: Union[str, int, UUID, None]) -> str:
        """Build a raw key without layer/version prefixes.

        Useful for legacy keys or custom namespacing.

        Args:
            prefix: Raw prefix string
            *parts: Key parts to join

        Returns:
            Formatted cache key string
        """
        filtered_parts = [str(p) for p in parts if p is not None]
        all_parts = [prefix] + filtered_parts
        return cls.SEPARATOR.join(all_parts)


# ---------------------------------------------------------------------------
# Cache Service
# ---------------------------------------------------------------------------


class CacheService:
    """Generic cache service with namespacing and TTL management.

    Provides high-level caching operations with:
    - Automatic serialization/deserialization
    - Configurable TTL per layer or per operation
    - Pattern-based key invalidation
    - Graceful error handling
    """

    def __init__(self, layer: CacheLayer, version: int = 1):
        """Initialize the cache service for a specific layer.

        Args:
            layer: The cache layer to operate on
            version: Key version for cache busting
        """
        self.layer = layer
        self.config = CACHE_LAYER_CONFIGS[layer]
        self.key_builder = CacheKeyBuilder(layer, version)

    # -----------------------------------------------------------------------
    # Core Operations
    # -----------------------------------------------------------------------

    async def get(
        self,
        *key_parts: Union[str, int, UUID, None],
    ) -> Optional[Any]:
        """Get a cached value.

        Args:
            *key_parts: Parts to build the cache key

        Returns:
            Deserialized cached value or None if not found
        """
        cache_key = self.key_builder.build(*key_parts)
        return await self._get_raw(cache_key)

    async def set(
        self,
        *key_parts: Union[str, int, UUID, None],
        value: Any,
        ttl: Optional[int] = None,
    ) -> bool:
        """Set a cached value.

        Args:
            *key_parts: Parts to build the cache key
            value: Value to cache (will be JSON serialized)
            ttl: Time to live in seconds (uses layer default if not specified)

        Returns:
            True if successful, False otherwise
        """
        cache_key = self.key_builder.build(*key_parts)
        effective_ttl = ttl if ttl is not None else self.config.default_ttl
        return await self._set_raw(cache_key, value, effective_ttl)

    async def delete(
        self,
        *key_parts: Union[str, int, UUID, None],
    ) -> bool:
        """Delete a cached value.

        Args:
            *key_parts: Parts to build the cache key

        Returns:
            True if key was deleted, False otherwise
        """
        cache_key = self.key_builder.build(*key_parts)
        return await self._delete_raw(cache_key)

    async def exists(
        self,
        *key_parts: Union[str, int, UUID, None],
    ) -> bool:
        """Check if a key exists in cache.

        Args:
            *key_parts: Parts to build the cache key

        Returns:
            True if key exists, False otherwise
        """
        cache_key = self.key_builder.build(*key_parts)
        try:
            redis = await get_redis_client()
            return bool(await redis.exists(cache_key))
        except Exception as e:
            logger.warning(f"Cache exists check failed: {e}")
            return False

    async def get_ttl(
        self,
        *key_parts: Union[str, int, UUID, None],
    ) -> int:
        """Get remaining TTL for a key.

        Args:
            *key_parts: Parts to build the cache key

        Returns:
            TTL in seconds, -1 if no expiry, -2 if key doesn't exist
        """
        cache_key = self.key_builder.build(*key_parts)
        try:
            redis = await get_redis_client()
            return await redis.ttl(cache_key)
        except Exception as e:
            logger.warning(f"Cache TTL check failed: {e}")
            return -2

    async def refresh_ttl(
        self,
        *key_parts: Union[str, int, UUID, None],
        ttl: Optional[int] = None,
    ) -> bool:
        """Refresh the TTL of an existing key.

        Args:
            *key_parts: Parts to build the cache key
            ttl: New TTL in seconds (uses layer default if not specified)

        Returns:
            True if TTL was refreshed, False otherwise
        """
        cache_key = self.key_builder.build(*key_parts)
        effective_ttl = ttl if ttl is not None else self.config.default_ttl
        try:
            redis = await get_redis_client()
            return await redis.expire(cache_key, effective_ttl)
        except Exception as e:
            logger.warning(f"Cache TTL refresh failed: {e}")
            return False

    # -----------------------------------------------------------------------
    # Bulk Operations
    # -----------------------------------------------------------------------

    async def get_many(
        self,
        keys: list[tuple[Union[str, int, UUID, None], ...]],
    ) -> dict[str, Optional[Any]]:
        """Get multiple cached values.

        Args:
            keys: List of key part tuples

        Returns:
            Dict mapping cache keys to values (None for misses)
        """
        if not keys:
            return {}

        cache_keys = [self.key_builder.build(*k) for k in keys]
        try:
            redis = await get_redis_client()
            values = await redis.mget(cache_keys)
            result = {}
            for key, value in zip(cache_keys, values):
                if value is not None:
                    try:
                        result[key] = json.loads(value)
                    except (json.JSONDecodeError, TypeError):
                        result[key] = None
                else:
                    result[key] = None
            return result
        except Exception as e:
            logger.warning(f"Cache mget failed: {e}")
            return {k: None for k in cache_keys}

    async def set_many(
        self,
        items: dict[tuple[Union[str, int, UUID, None], ...], Any],
        ttl: Optional[int] = None,
    ) -> bool:
        """Set multiple cached values.

        Args:
            items: Dict mapping key part tuples to values
            ttl: TTL for all keys (uses layer default if not specified)

        Returns:
            True if all items were set successfully
        """
        if not items:
            return True

        effective_ttl = ttl if ttl is not None else self.config.default_ttl
        try:
            redis = await get_redis_client()
            pipe = redis.pipeline()
            for key_parts, value in items.items():
                cache_key = self.key_builder.build(*key_parts)
                serialized = json.dumps(value)
                pipe.setex(cache_key, effective_ttl, serialized)
            await pipe.execute()
            return True
        except Exception as e:
            logger.warning(f"Cache mset failed: {e}")
            return False

    async def delete_many(
        self,
        keys: list[tuple[Union[str, int, UUID, None], ...]],
    ) -> int:
        """Delete multiple cached values.

        Args:
            keys: List of key part tuples

        Returns:
            Number of keys deleted
        """
        if not keys:
            return 0

        cache_keys = [self.key_builder.build(*k) for k in keys]
        try:
            redis = await get_redis_client()
            return await redis.delete(*cache_keys)
        except Exception as e:
            logger.warning(f"Cache delete_many failed: {e}")
            return 0

    # -----------------------------------------------------------------------
    # Pattern Operations
    # -----------------------------------------------------------------------

    async def invalidate_pattern(
        self,
        *pattern_parts: Union[str, int, UUID, None],
        batch_size: int = 100,
    ) -> int:
        """Invalidate all keys matching a pattern.

        Uses SCAN to avoid blocking on large keyspaces.

        Args:
            *pattern_parts: Parts to build the pattern (wildcard appended)
            batch_size: Number of keys to fetch per SCAN iteration

        Returns:
            Number of keys deleted
        """
        pattern = self.key_builder.build_pattern(*pattern_parts)
        return await self._invalidate_by_pattern(pattern, batch_size)

    async def count_pattern(
        self,
        *pattern_parts: Union[str, int, UUID, None],
    ) -> int:
        """Count keys matching a pattern.

        Args:
            *pattern_parts: Parts to build the pattern

        Returns:
            Approximate count of matching keys
        """
        pattern = self.key_builder.build_pattern(*pattern_parts)
        try:
            redis = await get_redis_client()
            count = 0
            cursor = 0
            while True:
                cursor, keys = await redis.scan(cursor, match=pattern, count=100)
                count += len(keys)
                if cursor == 0:
                    break
            return count
        except Exception as e:
            logger.warning(f"Cache pattern count failed: {e}")
            return 0

    # -----------------------------------------------------------------------
    # Convenience Methods
    # -----------------------------------------------------------------------

    async def get_or_set(
        self,
        *key_parts: Union[str, int, UUID, None],
        factory: Any,
        ttl: Optional[int] = None,
    ) -> Optional[Any]:
        """Get cached value or compute and cache it.

        Args:
            *key_parts: Parts to build the cache key
            factory: Async callable to compute the value if not cached
            ttl: TTL for the cached value

        Returns:
            Cached or computed value
        """
        cached = await self.get(*key_parts)
        if cached is not None:
            return cached

        # Compute the value
        if callable(factory):
            import asyncio

            if asyncio.iscoroutinefunction(factory):
                value = await factory()
            else:
                value = factory()
        else:
            value = factory

        if value is not None:
            await self.set(*key_parts, value=value, ttl=ttl)

        return value

    async def increment(
        self,
        *key_parts: Union[str, int, UUID, None],
        amount: int = 1,
        ttl: Optional[int] = None,
    ) -> int:
        """Increment a counter value.

        Args:
            *key_parts: Parts to build the cache key
            amount: Amount to increment by
            ttl: TTL for the key (set only if key is new)

        Returns:
            New counter value
        """
        cache_key = self.key_builder.build(*key_parts)
        try:
            redis = await get_redis_client()
            pipe = redis.pipeline()
            pipe.incrby(cache_key, amount)
            if ttl is not None:
                pipe.expire(cache_key, ttl, nx=True)  # Only set if no existing TTL
            results = await pipe.execute()
            return results[0]
        except Exception as e:
            logger.warning(f"Cache increment failed: {e}")
            return 0

    async def decrement(
        self,
        *key_parts: Union[str, int, UUID, None],
        amount: int = 1,
    ) -> int:
        """Decrement a counter value.

        Args:
            *key_parts: Parts to build the cache key
            amount: Amount to decrement by

        Returns:
            New counter value
        """
        cache_key = self.key_builder.build(*key_parts)
        try:
            redis = await get_redis_client()
            return await redis.decrby(cache_key, amount)
        except Exception as e:
            logger.warning(f"Cache decrement failed: {e}")
            return 0

    # -----------------------------------------------------------------------
    # Internal Methods
    # -----------------------------------------------------------------------

    async def _get_raw(self, cache_key: str) -> Optional[Any]:
        """Get raw cached value by full key."""
        try:
            redis = await get_redis_client()
            cached = await redis.get(cache_key)
            if cached:
                logger.debug(f"Cache hit: {cache_key}")
                return json.loads(cached)
            logger.debug(f"Cache miss: {cache_key}")
            return None
        except Exception as e:
            logger.warning(f"Redis cache read failed: {e}")
            return None

    async def _set_raw(self, cache_key: str, value: Any, ttl: int) -> bool:
        """Set raw cached value by full key."""
        try:
            redis = await get_redis_client()
            serialized = json.dumps(value)
            await redis.setex(cache_key, ttl, serialized)
            logger.debug(f"Cache set: {cache_key} (TTL: {ttl}s)")
            return True
        except Exception as e:
            logger.warning(f"Redis cache write failed: {e}")
            return False

    async def _delete_raw(self, cache_key: str) -> bool:
        """Delete raw cached value by full key."""
        try:
            redis = await get_redis_client()
            result = await redis.delete(cache_key)
            logger.debug(f"Cache delete: {cache_key} (deleted: {result > 0})")
            return result > 0
        except Exception as e:
            logger.warning(f"Redis cache delete failed: {e}")
            return False

    async def _invalidate_by_pattern(self, pattern: str, batch_size: int = 100) -> int:
        """Invalidate all keys matching a raw pattern."""
        try:
            redis = await get_redis_client()
            cursor = 0
            deleted = 0
            while True:
                cursor, keys = await redis.scan(cursor, match=pattern, count=batch_size)
                if keys:
                    await redis.delete(*keys)
                    deleted += len(keys)
                if cursor == 0:
                    break
            logger.debug(f"Cache invalidation: {pattern} ({deleted} keys deleted)")
            return deleted
        except Exception as e:
            logger.warning(f"Cache pattern invalidation failed: {e}")
            return 0


# ---------------------------------------------------------------------------
# Specialized Cache Services
# ---------------------------------------------------------------------------


class SessionCache(CacheService):
    """Specialized cache for user session data."""

    def __init__(self):
        super().__init__(CacheLayer.SESSION)

    async def get_session(self, session_id: str) -> Optional[dict[str, Any]]:
        """Get session data by ID."""
        return await self.get(session_id)

    async def set_session(self, session_id: str, data: dict[str, Any], ttl: Optional[int] = None) -> bool:
        """Store session data."""
        return await self.set(session_id, value=data, ttl=ttl)

    async def invalidate_session(self, session_id: str) -> bool:
        """Invalidate a specific session."""
        return await self.delete(session_id)

    async def invalidate_user_sessions(self, user_id: UUID) -> int:
        """Invalidate all sessions for a user."""
        return await self.invalidate_pattern("user", str(user_id))


class ApiCache(CacheService):
    """Specialized cache for API response caching."""

    def __init__(self):
        super().__init__(CacheLayer.API)

    async def cache_response(
        self,
        endpoint: str,
        params_hash: str,
        response: dict[str, Any],
        ttl: Optional[int] = None,
    ) -> bool:
        """Cache an API response."""
        return await self.set(endpoint, params_hash, value=response, ttl=ttl)

    async def get_cached_response(
        self,
        endpoint: str,
        params_hash: str,
    ) -> Optional[dict[str, Any]]:
        """Get a cached API response."""
        return await self.get(endpoint, params_hash)

    async def invalidate_endpoint(self, endpoint: str) -> int:
        """Invalidate all cached responses for an endpoint."""
        return await self.invalidate_pattern(endpoint)


class ConfigCache(CacheService):
    """Specialized cache for application configuration."""

    def __init__(self):
        super().__init__(CacheLayer.CONFIG)

    async def get_feature_flags(self) -> Optional[dict[str, bool]]:
        """Get cached feature flags."""
        return await self.get("feature_flags")

    async def set_feature_flags(self, flags: dict[str, bool], ttl: Optional[int] = None) -> bool:
        """Cache feature flags."""
        return await self.set("feature_flags", value=flags, ttl=ttl)

    async def get_config_value(self, key: str) -> Optional[Any]:
        """Get a specific config value."""
        return await self.get("value", key)

    async def set_config_value(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Cache a config value."""
        return await self.set("value", key, value=value, ttl=ttl)


# ---------------------------------------------------------------------------
# Service Factory
# ---------------------------------------------------------------------------


_cache_services: dict[CacheLayer, CacheService] = {}


def get_cache_service(layer: CacheLayer, version: int = 1) -> CacheService:
    """Get or create a cache service instance for a specific layer.

    Args:
        layer: The cache layer to get the service for
        version: Key version for cache busting

    Returns:
        CacheService instance
    """
    key = (layer, version)
    if key not in _cache_services:
        _cache_services[key] = CacheService(layer, version)
    return _cache_services[key]


# Convenience accessors for specialized services
_session_cache: Optional[SessionCache] = None
_api_cache: Optional[ApiCache] = None
_config_cache: Optional[ConfigCache] = None


def get_session_cache() -> SessionCache:
    """Get the session cache service."""
    global _session_cache
    if _session_cache is None:
        _session_cache = SessionCache()
    return _session_cache


def get_api_cache() -> ApiCache:
    """Get the API cache service."""
    global _api_cache
    if _api_cache is None:
        _api_cache = ApiCache()
    return _api_cache


def get_config_cache() -> ConfigCache:
    """Get the config cache service."""
    global _config_cache
    if _config_cache is None:
        _config_cache = ConfigCache()
    return _config_cache
