"""
Configuration settings for the Invitations Microservice.

Supports both environment variables and central configuration service.
When CENTRAL_CONFIG_ENABLED=true, configuration is fetched from the backend
config service and automatically refreshed. Environment variables serve as
fallback and initial values.

Feature: Centralized Configuration Management
"""

import os
from typing import List, Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables or central config service.
    
    Priority:
    1. Central config service (if enabled)
    2. Environment variables
    3. Default values
    """

    # Service
    SERVICE_NAME: str = "invitations-service"
    DEBUG: bool = False

    # Central Configuration
    CENTRAL_CONFIG_ENABLED: bool = os.getenv("CENTRAL_CONFIG_ENABLED", "false").lower() == "true"
    CENTRAL_CONFIG_REFRESH_INTERVAL: int = int(os.getenv("CENTRAL_CONFIG_REFRESH_INTERVAL", "60"))  # seconds

    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/rawdrive"
    )
    DB_POOL_MIN_SIZE: int = 5
    DB_POOL_MAX_SIZE: int = 20
    DB_COMMAND_TIMEOUT: int = 60

    # PgBouncer connection pooler (for 5000+ concurrent scaling)
    PGBOUNCER_ENABLED: bool = os.getenv("PGBOUNCER_ENABLED", "false").lower() == "true"
    PGBOUNCER_HOST: str = os.getenv("PGBOUNCER_HOST", "pgbouncer")
    PGBOUNCER_PORT: int = int(os.getenv("PGBOUNCER_PORT", "6432"))

    # Redis
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    # JWT Authentication
    JWT_SECRET: str = os.getenv("JWT_SECRET", "dev-secret-change-in-production")
    
    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "http://localhost:5177",
    ]
    
    # Rate Limiting
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_DEFAULT: str = "100/minute"
    
    # Cache TTLs (seconds)
    CACHE_TTL_PUBLIC_PAGE: int = 300      # 5 minutes
    CACHE_TTL_GUEST_LIST: int = 60        # 1 minute
    CACHE_TTL_ANALYTICS: int = 600        # 10 minutes
    
    # Celery
    CELERY_BROKER_URL: str = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/1")
    CELERY_RESULT_BACKEND: str = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/2")
    
    # Email (Postal — self-hosted transactional email)
    POSTAL_API_URL: str = os.getenv("POSTAL_API_URL", "")
    POSTAL_API_KEY: str = os.getenv("POSTAL_API_KEY", "")
    POSTAL_FROM_EMAIL: str = os.getenv("POSTAL_FROM_EMAIL", "noreply@rawdrive.in")
    POSTAL_FROM_NAME: str = os.getenv("POSTAL_FROM_NAME", "RawDrive")

    # Legacy SendGrid (deprecated — kept for backward compat)
    SENDGRID_API_KEY: str = os.getenv("SENDGRID_API_KEY", "")
    EMAIL_FROM_ADDRESS: str = os.getenv("EMAIL_FROM_ADDRESS", "noreply@example.com")
    EMAIL_FROM_NAME: str = os.getenv("EMAIL_FROM_NAME", "Digital Invitations")
    
    # Storage (R2)
    R2_ENDPOINT: str = os.getenv("R2_ENDPOINT", "")
    R2_ACCESS_KEY_ID: str = os.getenv("R2_ACCESS_KEY_ID", "")
    R2_SECRET_ACCESS_KEY: str = os.getenv("R2_SECRET_ACCESS_KEY", "")
    R2_BUCKET_NAME: str = os.getenv("R2_BUCKET_NAME", "invitations")
    
    # Encryption (for API key storage)
    ENCRYPTION_MASTER_KEY: str = os.getenv("ENCRYPTION_MASTER_KEY", "0000000000000000000000000000000000000000000000000000000000000000")
    
    # Backend service URL (for services that need to call backend)
    BACKEND_SERVICE_URL: str = os.getenv("BACKEND_SERVICE_URL", "http://localhost:8000")
    
    # Magic Link service URL (for creating magic links)
    MAGIC_LINK_SERVICE_URL: str = os.getenv("MAGIC_LINK_SERVICE_URL", "http://localhost:8001")
    
    class Config:
        env_file = ".env"
        case_sensitive = True


# Initialize settings with environment variables first
_settings_instance: Optional[Settings] = None


def get_settings() -> Settings:
    """Get settings instance, optionally loading from central config.
    
    If CENTRAL_CONFIG_ENABLED=true, settings will be dynamically updated
    from the central config service. Otherwise, uses environment variables.
    """
    global _settings_instance
    if _settings_instance is None:
        _settings_instance = Settings()
    return _settings_instance


async def reload_settings_from_central() -> Settings:
    """Reload settings from central config service.
    
    This is called periodically by the background refresh task.
    Updates environment variables and recreates Settings instance.
    """
    global _settings_instance
    
    try:
        from src.services.config_client import get_config_client
        import logging
        
        logger = logging.getLogger(__name__)
        client = get_config_client()
        config = await client.get_config()
        
        if config:
            # Update environment variables (Settings reads from env)
            for key, value in config.items():
                if value:  # Only set non-empty values
                    os.environ[key] = str(value)
            
            # Recreate settings instance to pick up new env vars
            _settings_instance = Settings()
            
            logger.info(f"Settings reloaded from central config: {list(config.keys())}")
        else:
            logger.debug("No config received from central service, keeping current settings")
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"Failed to reload settings from central config: {e}")
    
    return _settings_instance


# Module-level settings accessor
# This ensures that when settings are reloaded from central config,
# all modules importing 'settings' get the updated instance
class _SettingsProxy:
    """Proxy object that always returns the current settings instance.
    
    This allows modules to import 'settings' and always get the latest
    configuration, even after central config reloads.
    
    Note: Services that cache settings values (like R2StorageService.bucket_name)
    will need to be recreated to pick up config changes. This is acceptable
    since config changes are rare and typically require service restart anyway.
    """
    def __getattr__(self, name: str):
        """Delegate attribute access to current settings instance."""
        current_settings = get_settings()
        return getattr(current_settings, name)
    
    def __setattr__(self, name: str, value: any):
        """Prevent setting attributes on proxy."""
        # Allow setting internal attributes
        if name.startswith('_'):
            object.__setattr__(self, name, value)
        else:
            raise AttributeError(
                f"Cannot set attribute '{name}' on settings proxy. "
                "Settings are managed by the central config service. "
                "To update settings, update backend environment variables."
            )
    
    def __repr__(self) -> str:
        """Return representation of proxy."""
        return f"<SettingsProxy(current={get_settings().SERVICE_NAME})>"
    
    def __str__(self) -> str:
        """Return string representation."""
        return f"SettingsProxy({get_settings().SERVICE_NAME})"

# Create proxy instance - all modules importing 'settings' will use this
settings = _SettingsProxy()
