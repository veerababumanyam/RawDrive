"""
Configuration settings for the Gallery Microservice.

Handles 50K concurrent gallery views with KEDA autoscaling.
"""

import os
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


def get_cors_origins() -> List[str]:
    """Get CORS origins from environment or return defaults."""
    env_value = os.getenv("CORS_ORIGINS", "")
    if env_value:
        return [origin.strip() for origin in env_value.split(",") if origin.strip()]
    return [
        "http://localhost:3000",
        "http://localhost:5173",
        "https://rawdrive.io",
        "https://*.rawdrive.io",
    ]


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore",  # Ignore extra env vars
    )

    # Service
    SERVICE_NAME: str = "gallery-service"
    SERVICE_VERSION: str = "1.0.0"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    # Database - Read replicas for public endpoints
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/rawdrive"
    )
    DATABASE_READ_REPLICA_URL: str = os.getenv(
        "DATABASE_READ_REPLICA_URL",
        ""  # Falls back to main if empty
    )
    DB_POOL_MIN_SIZE: int = 10
    DB_POOL_MAX_SIZE: int = 100  # High for 50K concurrent users
    DB_COMMAND_TIMEOUT: int = 60

    # Redis - Multi-tier caching
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    REDIS_MAX_CONNECTIONS: int = 50

    # JWT Authentication
    JWT_SECRET: str = os.getenv("JWT_SECRET", "dev-secret-change-in-production")
    JWT_ALGORITHM: str = "HS256"

    # Rate Limiting
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_DEFAULT: str = "1000/minute"  # High for public gallery views

    # Cache TTLs (seconds) - 3-tier caching
    CACHE_TTL_GALLERY_METADATA: int = 300      # 5 minutes - L1
    CACHE_TTL_GALLERY_ASSETS: int = 120        # 2 minutes - L2
    CACHE_TTL_PROOFING_STATE: int = 30         # 30 seconds - L3 (real-time)
    CACHE_TTL_SIGNED_URL: int = 3600           # 1 hour - R2 signed URLs
    CACHE_TTL_MAGIC_LINK: int = 600            # 10 minutes

    # Storage (R2)
    R2_ENDPOINT: str = os.getenv("R2_ENDPOINT", "")
    R2_ACCESS_KEY_ID: str = os.getenv("R2_ACCESS_KEY_ID", "")
    R2_SECRET_ACCESS_KEY: str = os.getenv("R2_SECRET_ACCESS_KEY", "")
    R2_BUCKET_NAME: str = os.getenv("R2_BUCKET_NAME", "rawdrive")
    R2_SIGNED_URL_EXPIRY: int = 3600  # 1 hour

    # WebSocket - Real-time proofing
    WS_MAX_CONNECTIONS_PER_GALLERY: int = 1000
    WS_HEARTBEAT_INTERVAL: int = 30
    WS_MESSAGE_QUEUE_SIZE: int = 100

    # Metrics - KEDA scaling triggers
    METRICS_ENABLED: bool = True
    METRICS_CUSTOM_PREFIX: str = "gallery"

    # Security
    PIN_MAX_ATTEMPTS: int = 5
    PIN_LOCKOUT_MINUTES: int = 15
    PASSWORD_MAX_ATTEMPTS: int = 5
    PASSWORD_LOCKOUT_MINUTES: int = 30

    # Circuit Breaker
    CIRCUIT_BREAKER_FAILURE_THRESHOLD: int = 5
    CIRCUIT_BREAKER_RECOVERY_TIMEOUT: int = 30
    CIRCUIT_BREAKER_EXPECTED_EXCEPTION: str = "ConnectionError"

    @property
    def CORS_ORIGINS(self) -> List[str]:
        """Get CORS origins - handled as property to avoid pydantic env parsing issues."""
        return get_cors_origins()


settings = Settings()
