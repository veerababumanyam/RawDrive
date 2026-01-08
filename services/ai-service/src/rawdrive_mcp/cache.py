"""Redis caching utilities for AI Service.

Provides response caching with TTL for frequently accessed endpoints.
Addresses HIGH priority from SECURITY_REVIEW.md: No Response Caching
"""

import os
import json
import hashlib
import logging
from functools import wraps
from typing import Optional, Any, Callable
from datetime import timedelta

import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

# Global Redis client
_redis_client: Optional[aioredis.Redis] = None


async def get_redis_client() -> aioredis.Redis:
    """Get or create Redis async client for caching."""
    global _redis_client
    
    if _redis_client is None:
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        try:
            _redis_client = aioredis.from_url(
                redis_url,
                encoding="utf-8",
                decode_responses=True,
                max_connections=int(os.getenv("REDIS_MAX_CONNECTIONS", "20")),
            )
            # Test connection
            await _redis_client.ping()
            logger.info(f"Redis cache client connected to {redis_url}")
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")
            raise
    
    return _redis_client


async def close_redis_client() -> None:
    """Close Redis connection on shutdown."""
    global _redis_client
    if _redis_client:
        await _redis_client.close()
        _redis_client = None
        logger.info("Redis cache client closed")


def generate_cache_key(prefix: str, **kwargs) -> str:
    """Generate a deterministic cache key from function arguments."""
    # Sort kwargs for consistent key generation
    sorted_args = json.dumps(kwargs, sort_keys=True, default=str)
    hash_value = hashlib.md5(sorted_args.encode()).hexdigest()[:16]
    return f"ai-service:{prefix}:{hash_value}"


def cache_response(
    prefix: str,
    ttl_seconds: int = 300,
    skip_if: Optional[Callable[..., bool]] = None,
):
    """Decorator to cache endpoint responses in Redis.
    
    Args:
        prefix: Cache key prefix (e.g., "gallery_health")
        ttl_seconds: Time-to-live in seconds (default 5 minutes)
        skip_if: Optional callable that returns True to skip caching
        
    Usage:
        @router.get("/galleries/{gallery_id}/health")
        @cache_response("gallery_health", ttl_seconds=300)
        async def get_gallery_health(...):
            ...
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Check if we should skip caching
            if skip_if and skip_if(*args, **kwargs):
                return await func(*args, **kwargs)
            
            # Extract relevant kwargs for cache key (exclude request objects)
            cache_kwargs = {
                k: v for k, v in kwargs.items() 
                if k not in ('request', 'current_user') and not hasattr(v, '__dict__')
            }
            
            # Add positional args that are UUIDs or primitives
            for i, arg in enumerate(args):
                if isinstance(arg, (str, int, float, bool)) or hasattr(arg, 'hex'):
                    cache_kwargs[f'arg_{i}'] = str(arg)
            
            cache_key = generate_cache_key(prefix, **cache_kwargs)
            
            try:
                redis = await get_redis_client()
                
                # Try to get from cache
                cached = await redis.get(cache_key)
                if cached:
                    logger.debug(f"Cache HIT: {cache_key}")
                    return json.loads(cached)
                
                logger.debug(f"Cache MISS: {cache_key}")
                
            except Exception as e:
                logger.warning(f"Redis cache read failed: {e}")
                # Continue without cache on error
                return await func(*args, **kwargs)
            
            # Execute the function
            result = await func(*args, **kwargs)
            
            # Cache the result
            try:
                # Handle Pydantic models
                if hasattr(result, 'model_dump'):
                    cache_value = json.dumps(result.model_dump(), default=str)
                elif hasattr(result, 'dict'):
                    cache_value = json.dumps(result.dict(), default=str)
                else:
                    cache_value = json.dumps(result, default=str)
                
                await redis.setex(cache_key, ttl_seconds, cache_value)
                logger.debug(f"Cached: {cache_key} (TTL={ttl_seconds}s)")
                
            except Exception as e:
                logger.warning(f"Redis cache write failed: {e}")
            
            return result
        
        return wrapper
    return decorator


async def invalidate_cache(pattern: str) -> int:
    """Invalidate cache entries matching a pattern.
    
    Args:
        pattern: Redis key pattern (e.g., "ai-service:gallery_health:*")
        
    Returns:
        Number of keys deleted
    """
    try:
        redis = await get_redis_client()
        keys = []
        async for key in redis.scan_iter(match=pattern):
            keys.append(key)
        
        if keys:
            deleted = await redis.delete(*keys)
            logger.info(f"Invalidated {deleted} cache entries matching {pattern}")
            return deleted
        return 0
        
    except Exception as e:
        logger.error(f"Cache invalidation failed: {e}")
        return 0


# Cache TTL constants (in seconds)
CACHE_TTL_GALLERY_HEALTH = 300  # 5 minutes
CACHE_TTL_AI_FILTER = 120  # 2 minutes
CACHE_TTL_QUALITY_ANALYSIS = 180  # 3 minutes
