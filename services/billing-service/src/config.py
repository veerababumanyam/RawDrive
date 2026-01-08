"""
Configuration settings for the Billing Microservice.

Handles subscriptions, payments, and invoice generation.
"""

import os
from typing import List
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Service
    SERVICE_NAME: str = "billing-service"
    SERVICE_VERSION: str = "1.0.0"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    # Database
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

    # PgBouncer connection pooler (for 5000+ concurrent scaling)
    # When enabled, all connections route through PgBouncer for efficient pooling
    PGBOUNCER_ENABLED: bool = os.getenv("PGBOUNCER_ENABLED", "false").lower() == "true"
    PGBOUNCER_HOST: str = os.getenv("PGBOUNCER_HOST", "pgbouncer")
    PGBOUNCER_PORT: int = int(os.getenv("PGBOUNCER_PORT", "6432"))

    # Redis - Caching and rate limiting
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    REDIS_MAX_CONNECTIONS: int = 20
    REDIS_KEY_PREFIX: str = "billing:"

    # JWT Authentication
    JWT_SECRET: str = os.getenv("JWT_SECRET", "dev-secret-change-in-production")
    JWT_ALGORITHM: str = "HS256"

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "https://rawdrive.io",
        "https://*.rawdrive.io",
    ]

    # Rate Limiting
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_API: str = "1000/minute"
    RATE_LIMIT_WEBHOOK: str = "100/minute"

    # Payment Providers - Razorpay
    RAZORPAY_KEY_ID: str = os.getenv("RAZORPAY_KEY_ID", "")
    RAZORPAY_KEY_SECRET: str = os.getenv("RAZORPAY_KEY_SECRET", "")
    RAZORPAY_WEBHOOK_SECRET: str = os.getenv("RAZORPAY_WEBHOOK_SECRET", "")

    # Payment Providers - Stripe
    STRIPE_SECRET_KEY: str = os.getenv("STRIPE_SECRET_KEY", "")
    STRIPE_WEBHOOK_SECRET: str = os.getenv("STRIPE_WEBHOOK_SECRET", "")
    STRIPE_API_VERSION: str = "2023-10-16"

    # Invoice Settings
    INVOICE_PDF_STORAGE_PATH: str = "workspaces/{workspace_id}/invoices/"
    GST_NUMBER: str = os.getenv("GST_NUMBER", "")
    COMPANY_ADDRESS: str = os.getenv("COMPANY_ADDRESS", "")
    COMPANY_NAME: str = "RawDrive"
    COMPANY_EMAIL: str = "support@rawdrive.in"
    INVOICE_PREFIX: str = "INV-"

    # Storage (R2) - For invoice PDFs
    R2_ENDPOINT: str = os.getenv("R2_ENDPOINT", "")
    R2_ACCESS_KEY_ID: str = os.getenv("R2_ACCESS_KEY_ID", "")
    R2_SECRET_ACCESS_KEY: str = os.getenv("R2_SECRET_ACCESS_KEY", "")
    R2_BUCKET_NAME: str = os.getenv("R2_BUCKET_NAME", "rawdrive")

    # Subscription Trial Defaults
    TRIAL_DAYS: int = 14
    TRIAL_GRACE_PERIOD_DAYS: int = 3

    # Metrics - KEDA scaling triggers
    METRICS_ENABLED: bool = True
    METRICS_CUSTOM_PREFIX: str = "billing"

    # Circuit Breaker
    CIRCUIT_BREAKER_FAILURE_THRESHOLD: int = 5
    CIRCUIT_BREAKER_RECOVERY_TIMEOUT: int = 30

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
