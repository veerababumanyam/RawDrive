"""Configuration settings for onboarding microservice."""

from typing import List
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings."""

    # Service identification
    SERVICE_NAME: str = "onboarding-service"
    SERVICE_VERSION: str = "1.0.0"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    # Database configuration
    DATABASE_URL: str
    DB_POOL_MIN_SIZE: int = 5
    DB_POOL_MAX_SIZE: int = 20
    DB_COMMAND_TIMEOUT: int = 60

    # Redis configuration
    REDIS_URL: str
    REDIS_MAX_CONNECTIONS: int = 20

    # JWT Authentication - CRITICAL: Must match backend exactly
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15

    # Stripe configuration
    STRIPE_SECRET_KEY: str
    STRIPE_WEBHOOK_SECRET: str = ""

    # Email configuration
    SENDGRID_API_KEY: str = ""
    EMAIL_FROM_ADDRESS: str = "noreply@rawdrive.io"
    EMAIL_FROM_NAME: str = "RawDrive"

    # CORS configuration
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "https://rawdrive.ai",
        "https://www.rawdrive.ai",
    ]
    CORS_ALLOW_CREDENTIALS: bool = True
    CORS_ALLOW_METHODS: List[str] = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    CORS_ALLOW_HEADERS: List[str] = ["*"]

    # Rate limiting
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_DEFAULT: str = "100/minute"
    RATE_LIMIT_ONBOARDING_START: str = "10/minute"
    RATE_LIMIT_EMAIL_VERIFICATION: str = "5/minute"
    RATE_LIMIT_PAYMENT: str = "20/minute"

    # Cache TTLs (seconds)
    CACHE_TTL_SESSION: int = 600  # 10 minutes
    CACHE_TTL_STATE: int = 120  # 2 minutes
    CACHE_TTL_VALIDATION: int = 30  # 30 seconds
    CACHE_TTL_PLAN: int = 3600  # 1 hour

    # Session configuration
    SESSION_TOKEN_LENGTH: int = 32
    SESSION_TTL_HOURS: int = 24
    EMAIL_VERIFICATION_TTL_HOURS: int = 24
    EMAIL_VERIFICATION_MAX_ATTEMPTS: int = 5

    # Metrics
    METRICS_ENABLED: bool = True
    METRICS_CUSTOM_PREFIX: str = "onboarding"

    class Config:
        """Pydantic configuration."""

        env_file = ".env"
        case_sensitive = True


settings = Settings()
