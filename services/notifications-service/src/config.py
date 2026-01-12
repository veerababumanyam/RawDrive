"""
Configuration settings for the Notifications & Communication Microservice.

Handles multi-channel notifications (email, SMS, in-app) with templating,
user preferences, and delivery tracking. Designed for KEDA autoscaling.
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
        protected_namespaces=('settings_',),
    )

    # Service
    SERVICE_NAME: str = "notifications-service"
    SERVICE_VERSION: str = "1.0.0"
    SERVICE_PORT: int = int(os.getenv("SERVICE_PORT", "8007"))
    SERVICE_HOST: str = os.getenv("SERVICE_HOST", "0.0.0.0")
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    # Database - Primary and read replica
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/rawdrive"
    )
    DATABASE_READ_REPLICA_URL: str = os.getenv(
        "DATABASE_READ_REPLICA_URL",
        ""  # Falls back to main if empty
    )
    DB_POOL_MIN_SIZE: int = 10
    DB_POOL_MAX_SIZE: int = 50
    DB_COMMAND_TIMEOUT: int = 60

    # Redis - Caching and queue management
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    REDIS_MAX_CONNECTIONS: int = 30
    REDIS_KEY_PREFIX: str = "notifications:"

    # JWT Authentication - CRITICAL: Must match backend exactly
    # Backend uses EdDSA with public/private key pairs
    JWT_SECRET: str = os.getenv("JWT_SECRET", "dev-secret-change-in-production")  # Fallback for HS256 (legacy)
    JWT_PUBLIC_KEY_PATH: str = os.getenv("JWT_PUBLIC_KEY_PATH", "")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "EdDSA")  # Backend uses EdDSA

    # Rate Limiting
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_DEFAULT: str = "100/minute"
    RATE_LIMIT_SEND_NOTIFICATION: str = "50/minute"
    RATE_LIMIT_WEBHOOK: str = "500/minute"  # High for SendGrid callbacks

    # Cache TTLs (seconds)
    CACHE_TTL_PREFERENCES: int = 300      # 5 minutes - user notification preferences
    CACHE_TTL_TEMPLATE: int = 600         # 10 minutes - compiled templates
    CACHE_TTL_DELIVERY_STATUS: int = 120  # 2 minutes - delivery status lookup
    CACHE_TTL_RATE_LIMIT: int = 60        # 1 minute - rate limit counters

    # Email Provider - SendGrid
    SENDGRID_API_KEY: str = os.getenv("SENDGRID_API_KEY", "")
    SENDGRID_FROM_EMAIL: str = os.getenv("SENDGRID_FROM_EMAIL", "noreply@rawdrive.io")
    SENDGRID_FROM_NAME: str = os.getenv("SENDGRID_FROM_NAME", "RawDrive")
    SENDGRID_WEBHOOK_SIGNING_KEY: str = os.getenv("SENDGRID_WEBHOOK_SIGNING_KEY", "")

    # SMS Provider - Twilio (placeholder for Phase 1)
    TWILIO_ACCOUNT_SID: str = os.getenv("TWILIO_ACCOUNT_SID", "")
    TWILIO_AUTH_TOKEN: str = os.getenv("TWILIO_AUTH_TOKEN", "")
    TWILIO_FROM_NUMBER: str = os.getenv("TWILIO_FROM_NUMBER", "")
    SMS_ENABLED: bool = False  # Placeholder - disabled in Phase 1

    # Notification Queue Settings
    QUEUE_BATCH_SIZE: int = 100  # Process notifications in batches
    QUEUE_RETRY_MAX_ATTEMPTS: int = 3
    QUEUE_RETRY_DELAY_SECONDS: int = 60  # Initial retry delay (exponential backoff)
    QUEUE_DEAD_LETTER_TTL_DAYS: int = 7  # Keep failed notifications for debugging

    # Digest Settings
    DIGEST_ENABLED: bool = True
    DIGEST_MIN_INTERVAL_MINUTES: int = 60  # Minimum time between digests
    DIGEST_MAX_ITEMS: int = 20  # Maximum items per digest email

    # Template Settings
    TEMPLATE_ENGINE: str = "jinja2"
    TEMPLATE_STRICT_MODE: bool = False  # Fallback to defaults on missing variables
    TEMPLATE_DEFAULT_LOCALE: str = "en"

    # Delivery Tracking
    DELIVERY_TRACKING_ENABLED: bool = True
    DELIVERY_TRACKING_TTL_DAYS: int = 30  # Keep delivery logs for 30 days

    # Metrics - KEDA scaling triggers
    METRICS_ENABLED: bool = True
    METRICS_CUSTOM_PREFIX: str = "notifications"

    # Circuit Breaker
    CIRCUIT_BREAKER_FAILURE_THRESHOLD: int = 5
    CIRCUIT_BREAKER_RECOVERY_TIMEOUT: int = 30
    CIRCUIT_BREAKER_EXPECTED_EXCEPTION: str = "ConnectionError"

    # Worker Settings
    WORKER_CONCURRENCY: int = 10  # Concurrent notification processing
    WORKER_PREFETCH_COUNT: int = 20  # Messages to prefetch from queue

    # Transactional vs Marketing
    TRANSACTIONAL_CATEGORIES: List[str] = [
        "billing",
        "security",
        "verification",
        "password_reset",
        "account",
    ]  # These bypass user preferences (cannot be disabled)

    @property
    def CORS_ORIGINS(self) -> List[str]:
        """Get CORS origins - handled as property to avoid pydantic env parsing issues."""
        return get_cors_origins()

    @property
    def effective_read_replica_url(self) -> str:
        """Get the effective read replica URL, falling back to main if not set."""
        return self.DATABASE_READ_REPLICA_URL or self.DATABASE_URL


settings = Settings()
