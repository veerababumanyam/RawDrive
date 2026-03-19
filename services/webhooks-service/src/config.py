"""
Configuration settings for the Webhooks Microservice.

Handles webhook delivery, event processing, and retry logic.
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
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "http://localhost:5177",
        "https://rawdrive.io",
        "https://*.rawdrive.io",
    ]


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore",
    )

    # Service
    SERVICE_NAME: str = "webhooks-service"
    SERVICE_VERSION: str = "1.0.0"
    # PORT is set by docker-compose from PORT_WEBHOOKS env var
    SERVICE_PORT: int = int(os.getenv("PORT", os.getenv("PORT_WEBHOOKS", "8015")))
    SERVICE_HOST: str = os.getenv("SERVICE_HOST", "0.0.0.0")
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/rawdrive"
    )
    DB_POOL_MIN_SIZE: int = 5
    DB_POOL_MAX_SIZE: int = 50
    DB_COMMAND_TIMEOUT: int = 60

    # Redis - For circuit breakers, caching, and DLQ
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    REDIS_MAX_CONNECTIONS: int = 20

    # Kafka - Event consumption
    KAFKA_BOOTSTRAP_SERVERS: str = os.getenv(
        "KAFKA_BOOTSTRAP_SERVERS",
        "localhost:9092"
    )
    KAFKA_CONSUMER_GROUP: str = "webhooks-service"
    KAFKA_AUTO_OFFSET_RESET: str = "latest"
    KAFKA_ENABLE_AUTO_COMMIT: bool = False

    # Kafka topics to consume
    KAFKA_TOPICS: List[str] = [
        "rawdrive.asset.events",
        "rawdrive.gallery.events",
        "rawdrive.subscription.events",
        "rawdrive.workspace.events",
        "rawdrive.user.events",
        "rawdrive.invitation.events",
        "rawdrive.client.events",
    ]

    # JWT Authentication
    JWT_SECRET: str = os.getenv("JWT_SECRET", "")
    JWT_ALGORITHM: str = "HS256"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Validate JWT_SECRET is set in non-development environments
        if not self.JWT_SECRET:
            if not self.DEBUG:
                raise ValueError(
                    "JWT_SECRET environment variable must be set in production. "
                    "Set DEBUG=true for development mode."
                )
            # Use a development-only secret with clear warning
            import warnings
            self._dev_secret = "dev-only-secret-do-not-use-in-production-" + "x" * 32
            warnings.warn(
                "JWT_SECRET not set - using development secret. "
                "This is NOT safe for production!",
                UserWarning,
                stacklevel=2
            )
            object.__setattr__(self, 'JWT_SECRET', self._dev_secret)

    # Webhook Delivery Settings
    WEBHOOK_DELIVERY_TIMEOUT: int = 30  # seconds
    WEBHOOK_MAX_RETRIES: int = 5
    WEBHOOK_RETRY_SCHEDULE: List[int] = [10, 60, 300, 1800, 3600]  # seconds
    WEBHOOK_MAX_RETRY_DELAY: int = 3600  # 1 hour max

    # Circuit Breaker Settings
    CIRCUIT_BREAKER_FAILURE_THRESHOLD: int = 5
    CIRCUIT_BREAKER_RECOVERY_TIMEOUT: int = 60  # seconds
    CIRCUIT_BREAKER_HALF_OPEN_REQUESTS: int = 2

    # Worker Settings
    DELIVERY_WORKER_BATCH_SIZE: int = 100
    DELIVERY_WORKER_POLL_INTERVAL: float = 1.0  # seconds
    EVENT_CONSUMER_BATCH_SIZE: int = 50

    # DLQ Settings
    DLQ_TTL_DAYS: int = 30  # Keep DLQ items for 30 days

    # Rate Limiting
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_DEFAULT: str = "100/minute"

    # Metrics
    METRICS_ENABLED: bool = True
    METRICS_CUSTOM_PREFIX: str = "webhook"

    # Response Body Truncation
    RESPONSE_BODY_MAX_LENGTH: int = 10240  # 10KB

    # Signature Settings
    SIGNATURE_MAX_TIMESTAMP_AGE: int = 300  # 5 minutes
    SECRET_ROTATION_GRACE_PERIOD: int = 86400  # 24 hours

    @property
    def CORS_ORIGINS(self) -> List[str]:
        """Get CORS origins."""
        return get_cors_origins()


settings = Settings()
