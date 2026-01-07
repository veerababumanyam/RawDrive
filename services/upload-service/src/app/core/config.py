"""
Configuration settings for the Upload Microservice.

Handles 50K concurrent uploads with KEDA autoscaling.
Follows the patterns established by gallery-service and backend config modules.
"""

from __future__ import annotations

import json
import os
from enum import Enum
from functools import lru_cache
from pathlib import Path
from typing import Any, ClassVar, List, Optional

from pydantic import Field, RedisDsn, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Environment(str, Enum):
    """Deployment environment for the service."""

    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"
    TEST = "test"


class Settings(BaseSettings):
    """Application settings loaded from environment variables.

    Configuration is strict and will raise validation errors when required
    values are missing to ensure fail-fast behaviour at startup.
    """

    model_config = SettingsConfigDict(
        env_file=None,  # Disabled: use environment variables only
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ====================
    # Service Configuration
    # ====================
    SERVICE_NAME: str = Field(default="upload-service", alias="SERVICE_NAME")
    SERVICE_VERSION: str = Field(default="1.0.0", alias="SERVICE_VERSION")
    APP_ENV: Environment = Field(default=Environment.DEVELOPMENT, alias="APP_ENV")
    DEBUG: bool = Field(default=False, alias="DEBUG")
    LOG_LEVEL: str = Field(default="INFO", alias="LOG_LEVEL")
    LOG_FORMAT: str = Field(
        default="",
        alias="LOG_FORMAT",
        description="Log output format: 'json' for structured JSON, 'console' for colored dev output. Empty defaults to 'json' in production/staging, 'console' in development.",
    )

    # Server configuration
    HOST: str = Field(default="0.0.0.0", alias="HOST")
    PORT: int = Field(default=8001, alias="PORT")
    EXTERNAL_BASE_URL: Optional[str] = Field(
        default=None,
        alias="EXTERNAL_BASE_URL",
        description="External URL for client access (e.g., http://localhost:8008). If not set, defaults to http://localhost:{PORT}",
    )

    # ====================
    # Database Configuration
    # ====================
    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/rawdrive",
        alias="DATABASE_URL",
        description="PostgreSQL connection string with asyncpg driver",
    )
    DB_POOL_MIN_SIZE: int = Field(default=2, alias="DB_POOL_MIN_SIZE")
    DB_POOL_MAX_SIZE: int = Field(
        default=5,
        alias="DB_POOL_MAX_SIZE",
        description="Keep low (5) per pod - use PgBouncer for connection pooling",
    )
    DB_POOL_MAX_LIFETIME_SEC: int = Field(default=1800, alias="DB_POOL_MAX_LIFETIME_SEC")
    DB_COMMAND_TIMEOUT: int = Field(default=60, alias="DB_COMMAND_TIMEOUT")

    # PgBouncer connection pooler settings
    PGBOUNCER_ENABLED: bool = Field(
        default=False,
        alias="PGBOUNCER_ENABLED",
        description="Enable PgBouncer connection pooling for production scaling",
    )
    PGBOUNCER_HOST: str = Field(
        default="pgbouncer",
        alias="PGBOUNCER_HOST",
        description="PgBouncer hostname (used when PGBOUNCER_ENABLED=true)",
    )
    PGBOUNCER_PORT: int = Field(
        default=6432,
        alias="PGBOUNCER_PORT",
        description="PgBouncer port (default: 6432)",
    )

    # ====================
    # Redis Configuration (Chunk Buffering)
    # ====================
    REDIS_URL: str = Field(
        default="redis://localhost:6379/0",
        alias="REDIS_URL",
        description="Redis connection URL for chunk buffering",
    )
    REDIS_MAX_CONNECTIONS: int = Field(
        default=50,
        alias="REDIS_MAX_CONNECTIONS",
        description="Maximum Redis connections per pod",
    )
    REDIS_SOCKET_TIMEOUT: float = Field(default=5.0, alias="REDIS_SOCKET_TIMEOUT")
    REDIS_SOCKET_CONNECT_TIMEOUT: float = Field(default=5.0, alias="REDIS_SOCKET_CONNECT_TIMEOUT")
    REDIS_RETRY_ON_TIMEOUT: bool = Field(default=True, alias="REDIS_RETRY_ON_TIMEOUT")
    REDIS_HEALTH_CHECK_INTERVAL: int = Field(default=30, alias="REDIS_HEALTH_CHECK_INTERVAL")

    # Chunk buffering TTLs
    CHUNK_TTL_SECONDS: int = Field(
        default=86400,
        alias="CHUNK_TTL_SECONDS",
        description="TTL for chunk data in Redis (24 hours)",
    )
    CHUNK_METADATA_TTL_SECONDS: int = Field(
        default=90000,
        alias="CHUNK_METADATA_TTL_SECONDS",
        description="TTL for chunk metadata (25 hours, slightly longer than chunk data)",
    )

    # ====================
    # Kafka Configuration (Event Producer)
    # ====================
    KAFKA_BOOTSTRAP_SERVERS: str = Field(
        default="localhost:9092",
        alias="KAFKA_BOOTSTRAP_SERVERS",
        description="Comma-separated list of Kafka brokers",
    )
    KAFKA_TOPIC_ASSET_PROCESSING: str = Field(
        default="asset-processing",
        alias="KAFKA_TOPIC_ASSET_PROCESSING",
        description="Kafka topic for asset processing events",
    )
    KAFKA_TOPIC_UPLOAD_EVENTS: str = Field(
        default="upload-events",
        alias="KAFKA_TOPIC_UPLOAD_EVENTS",
        description="Kafka topic for upload lifecycle events",
    )
    KAFKA_PRODUCER_ACKS: str = Field(
        default="all",
        alias="KAFKA_PRODUCER_ACKS",
        description="Kafka producer acknowledgment mode (all, 1, 0)",
    )
    KAFKA_PRODUCER_RETRIES: int = Field(
        default=3,
        alias="KAFKA_PRODUCER_RETRIES",
        description="Number of retries for Kafka producer",
    )
    KAFKA_PRODUCER_LINGER_MS: int = Field(
        default=5,
        alias="KAFKA_PRODUCER_LINGER_MS",
        description="Kafka producer batching delay in ms",
    )
    KAFKA_ENABLED: bool = Field(
        default=False,
        alias="KAFKA_ENABLED",
        description="Enable Kafka event publishing (disabled in dev by default)",
    )

    # ====================
    # R2/S3 Storage Configuration
    # ====================
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
        description="R2 bucket name for uploads",
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

    # Multipart upload settings
    MULTIPART_PART_SIZE: int = Field(
        default=5 * 1024 * 1024,
        alias="MULTIPART_PART_SIZE",
        description="Multipart upload part size (5MB minimum for S3/R2)",
    )
    MULTIPART_MAX_PARTS: int = Field(
        default=10000,
        alias="MULTIPART_MAX_PARTS",
        description="Maximum number of multipart upload parts",
    )

    # ====================
    # JWT Authentication
    # ====================
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
        default="EdDSA",
        alias="JWT_ALGORITHM",
        description="JWT signing algorithm (EdDSA for RS256 public key, HS256 for secret)",
    )
    JWT_ISSUER: str = Field(
        default="rawdrive",
        alias="JWT_ISSUER",
        description="Expected JWT issuer claim",
    )

    # ====================
    # Encryption Configuration
    # ====================
    ENCRYPTION_MASTER_KEY: SecretStr = Field(
        default="0000000000000000000000000000000000000000000000000000000000000000",
        alias="ENCRYPTION_MASTER_KEY",
        description="32-byte hex master key for AES-256 encryption",
    )
    ENCRYPTION_KEY_VERSION: int = Field(
        default=1,
        alias="ENCRYPTION_KEY_VERSION",
        description="Current encryption key version for key rotation",
    )

    # ====================
    # Upload Configuration
    # ====================
    MAX_UPLOAD_SIZE_BYTES: int = Field(
        default=100 * 1024 * 1024 * 1024,
        alias="MAX_UPLOAD_SIZE_BYTES",
        description="Maximum file size in bytes (100GB)",
    )
    MAX_CHUNK_SIZE_BYTES: int = Field(
        default=5 * 1024 * 1024,
        alias="MAX_CHUNK_SIZE_BYTES",
        description="Maximum chunk size in bytes (5MB)",
    )
    UPLOAD_SESSION_TTL_HOURS: int = Field(
        default=24,
        alias="UPLOAD_SESSION_TTL_HOURS",
        description="Upload session expiry time in hours",
    )
    STREAMING_THRESHOLD_BYTES: int = Field(
        default=10 * 1024 * 1024,
        alias="STREAMING_THRESHOLD_BYTES",
        description="Threshold for streaming upload (files > 10MB use streaming)",
    )

    # TUS Protocol settings
    TUS_RESUMABLE_VERSION: str = Field(
        default="1.0.0",
        alias="TUS_RESUMABLE_VERSION",
        description="TUS protocol version",
    )
    TUS_MAX_SIZE: int = Field(
        default=100 * 1024 * 1024 * 1024,
        alias="TUS_MAX_SIZE",
        description="Maximum upload size for TUS protocol (100GB)",
    )
    TUS_EXTENSIONS: str = Field(
        default="creation,creation-with-upload,termination,checksum",
        alias="TUS_EXTENSIONS",
        description="Supported TUS protocol extensions",
    )

    # ====================
    # CORS Configuration
    # ====================
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
        """Parse CORS origins from JSON string or list."""
        if v is None or v == "":
            return [
                "http://localhost:3000",
                "http://localhost:5173",
                "https://rawdrive.io",
                "https://*.rawdrive.io",
            ]
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            if not v.strip():
                return []
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return parsed
                return [parsed] if parsed else []
            except json.JSONDecodeError:
                # If not JSON, treat as comma-separated string
                return [origin.strip() for origin in v.split(",") if origin.strip()]
        return []

    # ====================
    # Rate Limiting
    # ====================
    RATE_LIMIT_ENABLED: bool = Field(default=True, alias="RATE_LIMIT_ENABLED")
    RATE_LIMIT_REQUESTS_PER_SECOND: int = Field(
        default=100,
        alias="RATE_LIMIT_REQUESTS_PER_SECOND",
        description="Global rate limit per second",
    )
    RATE_LIMIT_BURST: int = Field(
        default=200,
        alias="RATE_LIMIT_BURST",
        description="Burst allowance for rate limiting",
    )
    RATE_LIMIT_PER_WORKSPACE: int = Field(
        default=50,
        alias="RATE_LIMIT_PER_WORKSPACE",
        description="Per-workspace upload rate limit per second",
    )
    RATE_LIMIT_WINDOW: int = Field(
        default=60,
        alias="RATE_LIMIT_WINDOW",
        description="Rate limit window in seconds",
    )

    # ====================
    # Circuit Breaker Configuration
    # ====================
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

    # ====================
    # Retry Configuration
    # ====================
    STORAGE_RETRY_ATTEMPTS: int = Field(
        default=5,
        alias="STORAGE_RETRY_ATTEMPTS",
        description="Number of retry attempts for storage operations",
    )
    STORAGE_RETRY_WAIT_MIN: int = Field(
        default=1,
        alias="STORAGE_RETRY_WAIT_MIN",
        description="Minimum wait time between retries (seconds)",
    )
    STORAGE_RETRY_WAIT_MAX: int = Field(
        default=30,
        alias="STORAGE_RETRY_WAIT_MAX",
        description="Maximum wait time between retries (seconds)",
    )
    STORAGE_RETRY_MULTIPLIER: int = Field(
        default=2,
        alias="STORAGE_RETRY_MULTIPLIER",
        description="Exponential backoff multiplier",
    )

    # ====================
    # Observability / Metrics
    # ====================
    METRICS_ENABLED: bool = Field(default=True, alias="METRICS_ENABLED")
    METRICS_PREFIX: str = Field(
        default="upload",
        alias="METRICS_PREFIX",
        description="Prefix for Prometheus metrics",
    )
    SENTRY_DSN: Optional[str] = Field(
        default=None,
        alias="SENTRY_DSN",
        description="Sentry DSN for error tracking",
    )

    # ====================
    # Graceful Shutdown
    # ====================
    SHUTDOWN_TIMEOUT_SECONDS: int = Field(
        default=30,
        alias="SHUTDOWN_TIMEOUT_SECONDS",
        description="Maximum time to wait for graceful shutdown",
    )
    DRAIN_TIMEOUT_SECONDS: int = Field(
        default=60,
        alias="DRAIN_TIMEOUT_SECONDS",
        description="Maximum time to wait for in-progress uploads to drain",
    )

    # ====================
    # Internal Service URLs
    # ====================
    BACKEND_SERVICE_URL: Optional[str] = Field(
        default=None,
        alias="BACKEND_SERVICE_URL",
        description="URL of main backend service for internal calls",
    )

    # ====================
    # Sensitive Fields for Masking
    # ====================
    SENSITIVE_FIELDS: ClassVar[frozenset[str]] = frozenset({
        "DATABASE_URL",
        "REDIS_URL",
        "R2_SECRET_ACCESS_KEY",
        "JWT_SECRET",
        "ENCRYPTION_MASTER_KEY",
        "SENTRY_DSN",
    })

    @model_validator(mode="after")
    def validate_config(self) -> "Settings":
        """Validate configuration after all fields are set."""
        # Validate pool sizes
        if self.DB_POOL_MIN_SIZE > self.DB_POOL_MAX_SIZE:
            raise ValueError("DB_POOL_MIN_SIZE cannot be greater than DB_POOL_MAX_SIZE")

        # Validate port range
        if not (1 <= self.PORT <= 65535):
            raise ValueError("PORT must be between 1 and 65535")

        # Validate chunk size
        if self.MAX_CHUNK_SIZE_BYTES < 1024 * 1024:
            raise ValueError("MAX_CHUNK_SIZE_BYTES must be at least 1MB")

        # Warn about production requirements
        if self.APP_ENV == Environment.PRODUCTION:
            if not self.R2_ENDPOINT:
                raise ValueError("R2_ENDPOINT is required in production")
            if not self.R2_ACCESS_KEY_ID:
                raise ValueError("R2_ACCESS_KEY_ID is required in production")
            if self.ENCRYPTION_MASTER_KEY.get_secret_value() == "0" * 64:
                raise ValueError("ENCRYPTION_MASTER_KEY must be set in production")

        return self

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
    def effective_log_format(self) -> str:
        """Get the effective log format based on environment."""
        if self.LOG_FORMAT:
            return self.LOG_FORMAT
        return "json" if self.APP_ENV in {Environment.PRODUCTION, Environment.STAGING} else "console"

    @property
    def database_url_sync(self) -> str:
        """Get synchronous database URL (for migrations, etc.)."""
        return self.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance.

    Uses lru_cache to ensure settings are only loaded once.
    Raises ValidationError if required configuration is missing.
    """
    return Settings()


# Convenience alias for consistency with gallery-service
settings = get_settings()


def reload_settings() -> Settings:
    """Force reload of settings (useful for testing).

    Clears the cache and returns a fresh Settings instance.
    """
    get_settings.cache_clear()
    return get_settings()
