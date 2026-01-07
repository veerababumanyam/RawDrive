"""
Configuration settings for the Sync Service.

Handles real-time folder-to-gallery synchronization with KEDA autoscaling.

This configuration module provides:
- Environment-aware settings with validation
- Sync-specific rate limits aligned with shared-constants/sync.ts
- WebSocket, queue, and retry configurations
- Integration points with upload-service and gallery-service
- Secure handling of sensitive credentials
"""

from __future__ import annotations

import json
import os
from enum import Enum
from functools import lru_cache
from typing import Any, ClassVar, List, Optional

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Environment(str, Enum):
    """Deployment environment for the service."""

    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"
    TEST = "test"


class Settings(BaseSettings):
    """Application settings loaded from environment variables.

    Configuration follows the patterns from upload-service with sync-specific
    additions. All values are validated at startup to ensure fail-fast behavior.

    Settings are aligned with the TypeScript constants in:
    packages/shared-constants/src/sync.ts
    """

    model_config = SettingsConfigDict(
        env_file=None,  # Disabled: use environment variables only
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ==========================================================================
    # Service Configuration
    # ==========================================================================
    SERVICE_NAME: str = Field(default="sync-service", alias="SERVICE_NAME")
    SERVICE_VERSION: str = Field(default="1.0.0", alias="SERVICE_VERSION")
    APP_ENV: Environment = Field(default=Environment.DEVELOPMENT, alias="APP_ENV")
    DEBUG: bool = Field(default=False, alias="DEBUG")
    LOG_LEVEL: str = Field(default="INFO", alias="LOG_LEVEL")
    LOG_FORMAT: str = Field(
        default="",
        alias="LOG_FORMAT",
        description="Log format: 'json' for structured, 'console' for dev. Empty defaults based on APP_ENV.",
    )

    # Server Configuration
    HOST: str = Field(default="0.0.0.0", alias="HOST")
    PORT: int = Field(default=8007, alias="PORT")

    # ==========================================================================
    # Database Configuration
    # ==========================================================================
    DATABASE_URL: str = Field(
        default="postgresql://postgres:postgres@localhost:5432/rawdrive",
        alias="DATABASE_URL",
        description="PostgreSQL connection string",
    )
    DB_POOL_MIN_SIZE: int = Field(
        default=5,
        alias="DB_POOL_MIN_SIZE",
        description="Minimum database connection pool size",
    )
    DB_POOL_MAX_SIZE: int = Field(
        default=50,
        alias="DB_POOL_MAX_SIZE",
        description="Maximum database connection pool size",
    )
    DB_POOL_MAX_LIFETIME_SEC: int = Field(
        default=1800,
        alias="DB_POOL_MAX_LIFETIME_SEC",
        description="Maximum lifetime for database connections (30 minutes)",
    )
    DB_COMMAND_TIMEOUT: int = Field(
        default=60,
        alias="DB_COMMAND_TIMEOUT",
        description="Database command timeout in seconds",
    )

    # ==========================================================================
    # Redis Configuration (Caching and Pub/Sub)
    # ==========================================================================
    REDIS_URL: str = Field(
        default="redis://localhost:6379/0",
        alias="REDIS_URL",
        description="Redis connection URL for caching and pub/sub",
    )
    REDIS_MAX_CONNECTIONS: int = Field(
        default=50,
        alias="REDIS_MAX_CONNECTIONS",
        description="Maximum Redis connections per pod",
    )
    REDIS_SOCKET_TIMEOUT: float = Field(
        default=5.0,
        alias="REDIS_SOCKET_TIMEOUT",
        description="Redis socket timeout in seconds",
    )
    REDIS_SOCKET_CONNECT_TIMEOUT: float = Field(
        default=5.0,
        alias="REDIS_SOCKET_CONNECT_TIMEOUT",
        description="Redis connection timeout in seconds",
    )
    REDIS_PUBSUB_CHANNEL_PREFIX: str = Field(
        default="sync:",
        alias="REDIS_PUBSUB_CHANNEL_PREFIX",
        description="Prefix for Redis pub/sub channels",
    )
    REDIS_RETRY_ON_TIMEOUT: bool = Field(
        default=True,
        alias="REDIS_RETRY_ON_TIMEOUT",
        description="Retry Redis operations on timeout",
    )

    # ==========================================================================
    # JWT Authentication
    # ==========================================================================
    JWT_SECRET: SecretStr = Field(
        default="dev-secret-change-in-production",
        alias="JWT_SECRET",
        description="JWT secret for HS256 (fallback if public key not available)",
    )
    JWT_PUBLIC_KEY_PATH: Optional[str] = Field(
        default=None,
        alias="JWT_PUBLIC_KEY_PATH",
        description="Path to JWT public key for EdDSA verification",
    )
    JWT_ALGORITHM: str = Field(
        default="HS256",
        alias="JWT_ALGORITHM",
        description="JWT signing algorithm",
    )
    JWT_ISSUER: str = Field(
        default="rawdrive",
        alias="JWT_ISSUER",
        description="Expected JWT issuer claim",
    )

    # ==========================================================================
    # CORS Configuration
    # ==========================================================================
    CORS_ORIGINS: List[str] = Field(
        default_factory=lambda: [
            "http://localhost:3000",
            "http://localhost:5173",
            "https://rawdrive.io",
            "https://*.rawdrive.io",
        ],
        alias="CORS_ORIGINS",
        description="Allowed CORS origins",
    )

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> List[str]:
        """Parse CORS origins from JSON string, comma-separated string, or list."""
        default_origins = [
            "http://localhost:3000",
            "http://localhost:5173",
            "https://rawdrive.io",
            "https://*.rawdrive.io",
        ]
        if v is None or v == "":
            return default_origins
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            if not v.strip():
                return default_origins
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return parsed
                return [parsed] if parsed else default_origins
            except json.JSONDecodeError:
                return [origin.strip() for origin in v.split(",") if origin.strip()]
        return default_origins

    # ==========================================================================
    # Rate Limiting (aligned with SYNC_RATE_LIMITS in sync.ts)
    # ==========================================================================
    RATE_LIMIT_ENABLED: bool = Field(
        default=True,
        alias="RATE_LIMIT_ENABLED",
        description="Enable rate limiting",
    )
    RATE_LIMIT_STATUS_UPDATES: str = Field(
        default="50/minute",
        alias="RATE_LIMIT_STATUS_UPDATES",
        description="Rate limit for sync status updates (SYNC_RATE_LIMITS.STATUS_UPDATES_PER_MINUTE)",
    )
    RATE_LIMIT_FILE_EVENTS: str = Field(
        default="200/minute",
        alias="RATE_LIMIT_FILE_EVENTS",
        description="Rate limit for file events (SYNC_RATE_LIMITS.FILE_EVENTS_PER_MINUTE)",
    )
    RATE_LIMIT_DEFAULT: str = Field(
        default="100/minute",
        alias="RATE_LIMIT_DEFAULT",
        description="Default rate limit for unspecified endpoints",
    )
    MAX_CONCURRENT_UPLOADS_PER_SESSION: int = Field(
        default=5,
        alias="MAX_CONCURRENT_UPLOADS_PER_SESSION",
        description="Maximum concurrent uploads per session (SYNC_RATE_LIMITS.MAX_CONCURRENT_UPLOADS)",
    )

    # ==========================================================================
    # Sync Session Limits (aligned with SYNC_SESSION_LIMITS in sync.ts)
    # ==========================================================================
    MAX_SESSIONS_PER_WORKSPACE: int = Field(
        default=10,
        alias="MAX_SESSIONS_PER_WORKSPACE",
        description="Maximum concurrent sync sessions per workspace",
    )
    MAX_SESSIONS_PER_USER: int = Field(
        default=5,
        alias="MAX_SESSIONS_PER_USER",
        description="Maximum concurrent sync sessions per user",
    )
    MAX_MAPPINGS_PER_WORKSPACE: int = Field(
        default=50,
        alias="MAX_MAPPINGS_PER_WORKSPACE",
        description="Maximum sync mappings per workspace",
    )
    MAX_MAPPINGS_PER_GALLERY: int = Field(
        default=5,
        alias="MAX_MAPPINGS_PER_GALLERY",
        description="Maximum sync mappings per gallery",
    )

    # ==========================================================================
    # Queue & Batch Limits (aligned with SYNC_QUEUE_LIMITS in sync.ts)
    # ==========================================================================
    MAX_QUEUE_SIZE: int = Field(
        default=1000,
        alias="MAX_QUEUE_SIZE",
        description="Maximum files in upload queue per session",
    )
    MAX_BATCH_SIZE: int = Field(
        default=50,
        alias="MAX_BATCH_SIZE",
        description="Maximum file events in a single batch report",
    )
    MAX_PROCESS_PER_TICK: int = Field(
        default=10,
        alias="MAX_PROCESS_PER_TICK",
        description="Maximum files to process in a single tick",
    )
    BACKPRESSURE_THRESHOLD: int = Field(
        default=100,
        alias="BACKPRESSURE_THRESHOLD",
        description="Queue depth threshold to trigger backpressure warning",
    )
    PAUSE_DETECTION_THRESHOLD: int = Field(
        default=500,
        alias="PAUSE_DETECTION_THRESHOLD",
        description="Queue depth threshold to pause file detection",
    )
    RESUME_DETECTION_THRESHOLD: int = Field(
        default=250,
        alias="RESUME_DETECTION_THRESHOLD",
        description="Queue depth threshold to resume file detection",
    )

    # ==========================================================================
    # File Size Limits (aligned with SYNC_FILE_LIMITS in sync.ts)
    # ==========================================================================
    MAX_FILE_SIZE: int = Field(
        default=200 * 1024 * 1024,  # 200MB
        alias="MAX_FILE_SIZE",
        description="Maximum individual file size for sync",
    )
    MIN_FILE_SIZE: int = Field(
        default=1,
        alias="MIN_FILE_SIZE",
        description="Minimum file size to consider valid (skip 0-byte files)",
    )
    UPLOAD_CHUNK_SIZE: int = Field(
        default=10 * 1024 * 1024,  # 10MB
        alias="UPLOAD_CHUNK_SIZE",
        description="TUS chunk size for resumable uploads",
    )
    LARGE_FILE_THRESHOLD: int = Field(
        default=50 * 1024 * 1024,  # 50MB
        alias="LARGE_FILE_THRESHOLD",
        description="Threshold for 'large file' warning",
    )
    MAX_SESSION_UPLOAD_SIZE: int = Field(
        default=10 * 1024 * 1024 * 1024,  # 10GB
        alias="MAX_SESSION_UPLOAD_SIZE",
        description="Maximum total upload size per session",
    )

    # ==========================================================================
    # Cache TTLs (seconds)
    # ==========================================================================
    CACHE_TTL_MAPPING: int = Field(
        default=300,  # 5 minutes
        alias="CACHE_TTL_MAPPING",
        description="Cache TTL for sync mappings",
    )
    CACHE_TTL_SESSION: int = Field(
        default=60,  # 1 minute
        alias="CACHE_TTL_SESSION",
        description="Cache TTL for sync sessions",
    )
    CACHE_TTL_FILE_HASH: int = Field(
        default=86400,  # 24 hours
        alias="CACHE_TTL_FILE_HASH",
        description="Cache TTL for file hashes (duplicate detection)",
    )

    # ==========================================================================
    # WebSocket Configuration (aligned with SYNC_WEBSOCKET in sync.ts)
    # ==========================================================================
    WS_MAX_CONNECTIONS_PER_SESSION: int = Field(
        default=3,
        alias="WS_MAX_CONNECTIONS_PER_SESSION",
        description="Maximum WebSocket connections per sync session",
    )
    WS_MAX_CONNECTIONS_PER_WORKSPACE: int = Field(
        default=100,
        alias="WS_MAX_CONNECTIONS_PER_WORKSPACE",
        description="Maximum total WebSocket connections per workspace",
    )
    WS_HEARTBEAT_INTERVAL: int = Field(
        default=30,
        alias="WS_HEARTBEAT_INTERVAL",
        description="WebSocket heartbeat interval in seconds",
    )
    WS_HEARTBEAT_TIMEOUT: int = Field(
        default=10,
        alias="WS_HEARTBEAT_TIMEOUT",
        description="WebSocket heartbeat timeout in seconds",
    )
    WS_MAX_MESSAGE_SIZE: int = Field(
        default=64 * 1024,  # 64KB
        alias="WS_MAX_MESSAGE_SIZE",
        description="Maximum WebSocket message size in bytes",
    )
    WS_RECONNECT_BASE_DELAY_MS: int = Field(
        default=1000,
        alias="WS_RECONNECT_BASE_DELAY_MS",
        description="WebSocket reconnect base delay in milliseconds",
    )
    WS_RECONNECT_MAX_DELAY_MS: int = Field(
        default=30000,
        alias="WS_RECONNECT_MAX_DELAY_MS",
        description="WebSocket maximum reconnect delay in milliseconds",
    )

    # ==========================================================================
    # Timing Configuration (aligned with SYNC_TIMING in sync.ts)
    # ==========================================================================
    FILE_STABILITY_DELAY: float = Field(
        default=2.0,
        alias="FILE_STABILITY_DELAY",
        description="Wait time for file stability before upload (seconds)",
    )
    FILE_EVENT_DEBOUNCE: float = Field(
        default=0.5,
        alias="FILE_EVENT_DEBOUNCE",
        description="Debounce time for batching file events (seconds)",
    )
    FILE_BATCH_MAX_WAIT: float = Field(
        default=5.0,
        alias="FILE_BATCH_MAX_WAIT",
        description="Maximum wait time before processing file batch (seconds)",
    )
    STATUS_BROADCAST_INTERVAL: float = Field(
        default=1.0,
        alias="STATUS_BROADCAST_INTERVAL",
        description="Status update broadcast interval (seconds)",
    )
    SESSION_IDLE_TIMEOUT: int = Field(
        default=1800,  # 30 minutes
        alias="SESSION_IDLE_TIMEOUT",
        description="Session idle timeout in seconds",
    )
    UPLOAD_CHUNK_TIMEOUT: int = Field(
        default=60,
        alias="UPLOAD_CHUNK_TIMEOUT",
        description="Upload timeout for individual chunks (seconds)",
    )
    UPLOAD_FILE_TIMEOUT: int = Field(
        default=300,  # 5 minutes
        alias="UPLOAD_FILE_TIMEOUT",
        description="Upload timeout for entire file (seconds)",
    )

    # ==========================================================================
    # Retry Configuration (aligned with SYNC_RETRY in sync.ts)
    # ==========================================================================
    MAX_UPLOAD_RETRIES: int = Field(
        default=3,
        alias="MAX_UPLOAD_RETRIES",
        description="Maximum retry attempts for failed uploads",
    )
    MAX_API_RETRIES: int = Field(
        default=3,
        alias="MAX_API_RETRIES",
        description="Maximum retry attempts for failed API calls",
    )
    MAX_WS_RECONNECT_ATTEMPTS: int = Field(
        default=10,
        alias="MAX_WS_RECONNECT_ATTEMPTS",
        description="Maximum WebSocket reconnection attempts",
    )
    RETRY_BASE_DELAY: float = Field(
        default=1.0,
        alias="RETRY_BASE_DELAY",
        description="Base delay for retry backoff (seconds)",
    )
    RETRY_MAX_DELAY: float = Field(
        default=30.0,
        alias="RETRY_MAX_DELAY",
        description="Maximum delay for retry backoff (seconds)",
    )
    RETRY_BACKOFF_MULTIPLIER: float = Field(
        default=2.0,
        alias="RETRY_BACKOFF_MULTIPLIER",
        description="Backoff multiplier for exponential backoff",
    )
    RETRY_JITTER_FACTOR: float = Field(
        default=0.1,
        alias="RETRY_JITTER_FACTOR",
        description="Jitter factor for retry delays (0-1)",
    )

    # ==========================================================================
    # Graceful Shutdown
    # ==========================================================================
    SHUTDOWN_TIMEOUT_SECONDS: int = Field(
        default=30,
        alias="SHUTDOWN_TIMEOUT_SECONDS",
        description="Maximum time to wait for graceful shutdown",
    )
    DRAIN_TIMEOUT_SECONDS: int = Field(
        default=30,
        alias="DRAIN_TIMEOUT_SECONDS",
        description="Maximum time to wait for active sessions to drain",
    )

    # ==========================================================================
    # Service Integration URLs
    # ==========================================================================
    UPLOAD_SERVICE_URL: str = Field(
        default="http://localhost:8001",
        alias="UPLOAD_SERVICE_URL",
        description="URL of upload-service for TUS uploads",
    )
    UPLOAD_SERVICE_TIMEOUT: int = Field(
        default=30,
        alias="UPLOAD_SERVICE_TIMEOUT",
        description="Timeout for upload-service requests (seconds)",
    )
    GALLERY_SERVICE_URL: str = Field(
        default="http://localhost:8002",
        alias="GALLERY_SERVICE_URL",
        description="URL of gallery-service for gallery operations",
    )
    GALLERY_SERVICE_TIMEOUT: int = Field(
        default=10,
        alias="GALLERY_SERVICE_TIMEOUT",
        description="Timeout for gallery-service requests (seconds)",
    )
    BACKEND_SERVICE_URL: Optional[str] = Field(
        default=None,
        alias="BACKEND_SERVICE_URL",
        description="URL of main backend service for internal calls",
    )

    # ==========================================================================
    # Observability / Metrics (KEDA Scaling Triggers)
    # ==========================================================================
    METRICS_ENABLED: bool = Field(
        default=True,
        alias="METRICS_ENABLED",
        description="Enable Prometheus metrics",
    )
    METRICS_CUSTOM_PREFIX: str = Field(
        default="sync",
        alias="METRICS_CUSTOM_PREFIX",
        description="Prefix for Prometheus metrics",
    )
    SENTRY_DSN: Optional[str] = Field(
        default=None,
        alias="SENTRY_DSN",
        description="Sentry DSN for error tracking",
    )

    # ==========================================================================
    # Storage (R2) - for signed URL generation
    # ==========================================================================
    R2_ENDPOINT: str = Field(
        default="",
        alias="R2_ENDPOINT",
        description="Cloudflare R2 endpoint URL",
    )
    R2_ACCESS_KEY_ID: str = Field(
        default="",
        alias="R2_ACCESS_KEY_ID",
        description="R2 access key ID",
    )
    R2_SECRET_ACCESS_KEY: SecretStr = Field(
        default="",
        alias="R2_SECRET_ACCESS_KEY",
        description="R2 secret access key",
    )
    R2_BUCKET_NAME: str = Field(
        default="rawdrive",
        alias="R2_BUCKET_NAME",
        description="R2 bucket name",
    )
    R2_REGION: str = Field(
        default="auto",
        alias="R2_REGION",
        description="R2 region (usually 'auto' for Cloudflare)",
    )
    R2_SIGNED_URL_EXPIRY: int = Field(
        default=3600,
        alias="R2_SIGNED_URL_EXPIRY",
        description="Signed URL expiry time in seconds (1 hour)",
    )

    # ==========================================================================
    # Circuit Breaker Configuration
    # ==========================================================================
    CIRCUIT_BREAKER_FAILURE_THRESHOLD: int = Field(
        default=5,
        alias="CIRCUIT_BREAKER_FAILURE_THRESHOLD",
        description="Number of failures before circuit opens",
    )
    CIRCUIT_BREAKER_RECOVERY_TIMEOUT: int = Field(
        default=30,
        alias="CIRCUIT_BREAKER_RECOVERY_TIMEOUT",
        description="Seconds before attempting recovery",
    )
    CIRCUIT_BREAKER_HALF_OPEN_REQUESTS: int = Field(
        default=3,
        alias="CIRCUIT_BREAKER_HALF_OPEN_REQUESTS",
        description="Number of test requests in half-open state",
    )

    # ==========================================================================
    # Quota Thresholds (aligned with SYNC_QUOTA_THRESHOLDS in sync.ts)
    # ==========================================================================
    QUOTA_WARNING_PERCENT: int = Field(
        default=80,
        alias="QUOTA_WARNING_PERCENT",
        description="Storage quota warning threshold percentage",
    )
    QUOTA_CRITICAL_PERCENT: int = Field(
        default=95,
        alias="QUOTA_CRITICAL_PERCENT",
        description="Storage quota critical threshold percentage",
    )
    QUOTA_PAUSE_SYNC_PERCENT: int = Field(
        default=99,
        alias="QUOTA_PAUSE_SYNC_PERCENT",
        description="Storage quota threshold to pause sync",
    )

    # ==========================================================================
    # Sensitive Fields for Masking
    # ==========================================================================
    SENSITIVE_FIELDS: ClassVar[frozenset[str]] = frozenset({
        "DATABASE_URL",
        "REDIS_URL",
        "R2_SECRET_ACCESS_KEY",
        "JWT_SECRET",
        "SENTRY_DSN",
    })

    # ==========================================================================
    # Validators
    # ==========================================================================
    @model_validator(mode="after")
    def validate_config(self) -> "Settings":
        """Validate configuration after all fields are set."""
        # Validate pool sizes
        if self.DB_POOL_MIN_SIZE > self.DB_POOL_MAX_SIZE:
            raise ValueError("DB_POOL_MIN_SIZE cannot be greater than DB_POOL_MAX_SIZE")

        # Validate port range
        if not (1 <= self.PORT <= 65535):
            raise ValueError("PORT must be between 1 and 65535")

        # Validate queue thresholds
        if self.BACKPRESSURE_THRESHOLD >= self.PAUSE_DETECTION_THRESHOLD:
            raise ValueError(
                "BACKPRESSURE_THRESHOLD must be less than PAUSE_DETECTION_THRESHOLD"
            )
        if self.RESUME_DETECTION_THRESHOLD >= self.PAUSE_DETECTION_THRESHOLD:
            raise ValueError(
                "RESUME_DETECTION_THRESHOLD must be less than PAUSE_DETECTION_THRESHOLD"
            )

        # Validate quota thresholds
        if not (0 < self.QUOTA_WARNING_PERCENT < self.QUOTA_CRITICAL_PERCENT < self.QUOTA_PAUSE_SYNC_PERCENT <= 100):
            raise ValueError(
                "Quota thresholds must be in order: WARNING < CRITICAL < PAUSE_SYNC <= 100"
            )

        # Validate retry configuration
        if self.RETRY_BASE_DELAY > self.RETRY_MAX_DELAY:
            raise ValueError("RETRY_BASE_DELAY cannot be greater than RETRY_MAX_DELAY")

        if not (0 <= self.RETRY_JITTER_FACTOR <= 1):
            raise ValueError("RETRY_JITTER_FACTOR must be between 0 and 1")

        # Production requirements
        if self.APP_ENV == Environment.PRODUCTION:
            if not self.R2_ENDPOINT:
                raise ValueError("R2_ENDPOINT is required in production")
            if not self.R2_ACCESS_KEY_ID:
                raise ValueError("R2_ACCESS_KEY_ID is required in production")
            if self.JWT_SECRET.get_secret_value() == "dev-secret-change-in-production":
                raise ValueError("JWT_SECRET must be changed from default in production")

        return self

    # ==========================================================================
    # Helper Methods
    # ==========================================================================
    @classmethod
    def mask_value(cls, value: Any) -> str:
        """Mask sensitive values for safe logging."""
        if value is None:
            return "<empty>"

        if isinstance(value, SecretStr):
            value = value.get_secret_value()

        text = str(value)
        if len(text) <= 4:
            return "****"
        return f"{text[:2]}{'*' * min(len(text) - 4, 20)}{text[-2:]}"

    def safe_dump(self) -> dict[str, Any]:
        """Return a dict with sensitive values masked for logging/diagnostics."""
        data = self.model_dump()
        for field in self.SENSITIVE_FIELDS:
            field_lower = field.lower()
            if field in data:
                data[field] = self.mask_value(data[field])
            elif field_lower in data:
                data[field_lower] = self.mask_value(data[field_lower])
        return data

    @property
    def is_production(self) -> bool:
        """Check if running in production environment."""
        return self.APP_ENV == Environment.PRODUCTION

    @property
    def is_development(self) -> bool:
        """Check if running in development environment."""
        return self.APP_ENV == Environment.DEVELOPMENT

    @property
    def is_test(self) -> bool:
        """Check if running in test environment."""
        return self.APP_ENV == Environment.TEST

    @property
    def effective_log_format(self) -> str:
        """Get the effective log format based on environment."""
        if self.LOG_FORMAT:
            return self.LOG_FORMAT
        return "json" if self.APP_ENV in {Environment.PRODUCTION, Environment.STAGING} else "console"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance.

    Uses lru_cache to ensure settings are only loaded once.
    Raises ValidationError if required configuration is missing.
    """
    return Settings()


# Convenience alias for consistency with other services
settings = get_settings()


def reload_settings() -> Settings:
    """Force reload of settings (useful for testing).

    Clears the cache and returns a fresh Settings instance.
    """
    get_settings.cache_clear()
    return get_settings()
