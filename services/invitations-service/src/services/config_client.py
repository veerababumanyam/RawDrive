"""Central Configuration Client.

Fetches configuration from a central config service and automatically
reflects updates. This allows central configuration management where
changes propagate to all microservices automatically.

Feature: Centralized Configuration Management
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, Optional
from functools import lru_cache

import httpx

logger = logging.getLogger(__name__)

# Cache TTL for config (seconds) - refresh every 5 minutes
CONFIG_CACHE_TTL = 300

# Global config cache
_config_cache: Optional[dict[str, Any]] = None
_config_cache_timestamp: float = 0


class ConfigClient:
    """Client for fetching configuration from central config service.
    
    Supports:
    - Periodic auto-refresh from central service
    - Fallback to environment variables if central service unavailable
    - Caching to reduce load on central service
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        service_name: str = "invitations-service",
        cache_ttl: int = CONFIG_CACHE_TTL,
        refresh_interval: int = 60,  # Refresh every 60 seconds
    ):
        """Initialize config client.
        
        Args:
            base_url: Central config service URL. If None, uses BACKEND_SERVICE_URL/config
            service_name: Name of this microservice
            cache_ttl: Cache TTL in seconds
            refresh_interval: Background refresh interval in seconds
        """
        # Use environment variable or default, not app_settings to avoid circular dependency
        backend_url = os.getenv("BACKEND_SERVICE_URL", "http://localhost:8000")
        self._base_url = base_url or f"{backend_url}/api/v1/config"
        self._service_name = service_name
        self._cache_ttl = cache_ttl
        self._refresh_interval = refresh_interval
        self._refresh_task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()

    async def get_config(self, key: Optional[str] = None) -> Any:
        """Get configuration value(s).
        
        Args:
            key: Specific config key to retrieve. If None, returns all config.
            
        Returns:
            Config value(s) from central service or environment variables
        """
        # Try to fetch from central service
        try:
            config = await self._fetch_from_central()
            if config:
                if key:
                    return config.get(key)
                return config
        except Exception as e:
            logger.warning(
                f"Failed to fetch config from central service: {e}. Using environment variables.",
                extra={"service": self._service_name},
            )
        
        # Fallback to environment variables
        if key:
            return self._get_from_env(key)
        return self._get_all_from_env()

    async def _fetch_from_central(self) -> Optional[dict[str, Any]]:
        """Fetch configuration from central config service."""
        global _config_cache, _config_cache_timestamp
        
        import time
        
        current_time = time.time()
        
        # Check cache first
        if _config_cache and (current_time - _config_cache_timestamp) < self._cache_ttl:
            return _config_cache
        
        # Fetch from central service
        url = f"{self._base_url}/microservices/{self._service_name}"
        
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(url)
                response.raise_for_status()
                
                config = response.json()
                
                # Update cache
                async with self._lock:
                    _config_cache = config
                    _config_cache_timestamp = current_time
                
                logger.debug(
                    f"Fetched config from central service",
                    extra={"service": self._service_name, "keys": list(config.keys())},
                )
                
                return config
        except httpx.RequestError as e:
            logger.warning(f"Config service unavailable: {e}")
            return None
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                # Config service doesn't have config for this service yet
                logger.debug(f"No central config found for {self._service_name}, using env vars")
                return None
            raise

    def _get_from_env(self, key: str) -> Any:
        """Get configuration from environment variables."""
        import os
        # Map config keys to environment variable names
        env_mapping = {
            "DATABASE_URL": "DATABASE_URL",
            "REDIS_URL": "REDIS_URL",
            "R2_ENDPOINT": "R2_ENDPOINT",
            "R2_ACCESS_KEY_ID": "R2_ACCESS_KEY_ID",
            "R2_SECRET_ACCESS_KEY": "R2_SECRET_ACCESS_KEY",
            "R2_BUCKET_NAME": "R2_BUCKET_NAME",
            "ENCRYPTION_MASTER_KEY": "ENCRYPTION_MASTER_KEY",
            "SENDGRID_API_KEY": "SENDGRID_API_KEY",
            "JWT_SECRET": "JWT_SECRET",
            "BACKEND_SERVICE_URL": "BACKEND_SERVICE_URL",
            "MAGIC_LINK_SERVICE_URL": "MAGIC_LINK_SERVICE_URL",
        }
        
        env_key = env_mapping.get(key, key)
        return os.getenv(env_key)

    def _get_all_from_env(self) -> dict[str, Any]:
        """Get all configuration from environment variables."""
        import os
        return {
            "DATABASE_URL": os.getenv("DATABASE_URL"),
            "REDIS_URL": os.getenv("REDIS_URL"),
            "R2_ENDPOINT": os.getenv("R2_ENDPOINT"),
            "R2_ACCESS_KEY_ID": os.getenv("R2_ACCESS_KEY_ID"),
            "R2_SECRET_ACCESS_KEY": os.getenv("R2_SECRET_ACCESS_KEY"),
            "R2_BUCKET_NAME": os.getenv("R2_BUCKET_NAME"),
            "ENCRYPTION_MASTER_KEY": os.getenv("ENCRYPTION_MASTER_KEY"),
            "SENDGRID_API_KEY": os.getenv("SENDGRID_API_KEY"),
            "JWT_SECRET": os.getenv("JWT_SECRET"),
            "BACKEND_SERVICE_URL": os.getenv("BACKEND_SERVICE_URL", "http://localhost:8000"),
            "MAGIC_LINK_SERVICE_URL": os.getenv("MAGIC_LINK_SERVICE_URL", "http://localhost:8001"),
        }

    async def start_background_refresh(self):
        """Start background task to periodically refresh config."""
        if self._refresh_task and not self._refresh_task.done():
            return  # Already running
        
        async def refresh_loop():
            """Background loop to refresh config periodically."""
            while True:
                try:
                    await asyncio.sleep(self._refresh_interval)
                    await self._fetch_from_central()
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.warning(f"Background config refresh failed: {e}")
        
        self._refresh_task = asyncio.create_task(refresh_loop())
        logger.info(f"Started background config refresh (interval: {self._refresh_interval}s)")

    async def stop_background_refresh(self):
        """Stop background refresh task."""
        if self._refresh_task and not self._refresh_task.done():
            self._refresh_task.cancel()
            try:
                await self._refresh_task
            except asyncio.CancelledError:
                pass
            logger.info("Stopped background config refresh")


# Singleton instance
_config_client: Optional[ConfigClient] = None


def get_config_client() -> ConfigClient:
    """Get singleton config client instance."""
    global _config_client
    if _config_client is None:
        _config_client = ConfigClient()
    return _config_client
