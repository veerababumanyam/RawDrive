# Cache module - Redis client and caching utilities
from src.cache.redis_client import (
    redis_client,
    RedisClient,
    CircuitBreaker,
    CircuitState,
    cache_response,
    # Invalidation helpers
    invalidate_preferences_cache,
    invalidate_template_cache,
    invalidate_delivery_cache,
    # Key builders
    build_preferences_cache_key,
    build_template_cache_key,
    build_template_list_cache_key,
    build_delivery_cache_key,
    build_rate_limit_key,
    build_digest_queue_key,
    build_dead_letter_queue_key,
    build_pending_queue_key,
    build_processing_queue_key,
)

__all__ = [
    # Client
    "redis_client",
    "RedisClient",
    "CircuitBreaker",
    "CircuitState",
    "cache_response",
    # Invalidation helpers
    "invalidate_preferences_cache",
    "invalidate_template_cache",
    "invalidate_delivery_cache",
    # Key builders
    "build_preferences_cache_key",
    "build_template_cache_key",
    "build_template_list_cache_key",
    "build_delivery_cache_key",
    "build_rate_limit_key",
    "build_digest_queue_key",
    "build_dead_letter_queue_key",
    "build_pending_queue_key",
    "build_processing_queue_key",
]
