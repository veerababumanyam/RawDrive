"""
Configuration settings for the Growth & Referrals Microservice.

Handles referral programs, partner/affiliate management, credit ledger,
and setup goals gamification. Designed for KEDA autoscaling.
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
        "https://rawdrive.ai",
        "https://www.rawdrive.ai",
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

    # Service Identification
    SERVICE_NAME: str = "growth-service"
    SERVICE_VERSION: str = "1.0.0"
    SERVICE_PORT: int = int(os.getenv("SERVICE_PORT", "8016"))
    SERVICE_HOST: str = os.getenv("SERVICE_HOST", "0.0.0.0")
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    # ==========================================================================
    # Database Configuration
    # ==========================================================================
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

    # ==========================================================================
    # Redis Configuration
    # ==========================================================================
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    REDIS_MAX_CONNECTIONS: int = 30
    REDIS_KEY_PREFIX: str = "growth:"

    # Cache TTLs (seconds)
    CACHE_TTL_REFERRAL_CODE: int = 3600       # 1 hour - referral code validation
    CACHE_TTL_CREDIT_BALANCE: int = 60        # 1 minute - credit balance lookup
    CACHE_TTL_PARTNER_DASHBOARD: int = 300    # 5 minutes - partner analytics
    CACHE_TTL_GOALS_PROGRESS: int = 120       # 2 minutes - setup goals progress
    CACHE_TTL_RATE_LIMIT: int = 60            # 1 minute - rate limit counters

    # ==========================================================================
    # JWT Authentication - CRITICAL: Must match backend exactly
    # ==========================================================================
    # Backend uses EdDSA with public/private key pairs
    JWT_SECRET: str = os.getenv("JWT_SECRET", "dev-secret-change-in-production")  # Fallback for HS256 (legacy)
    JWT_PUBLIC_KEY_PATH: str = os.getenv("JWT_PUBLIC_KEY_PATH", "")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "EdDSA")  # Backend uses EdDSA
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15

    # ==========================================================================
    # Rate Limiting
    # ==========================================================================
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_DEFAULT: str = "100/minute"
    RATE_LIMIT_REFERRAL_CREATE: str = "10/minute"     # Prevent referral code spam
    RATE_LIMIT_REFERRAL_VALIDATE: str = "60/minute"   # Allow frequent validation
    RATE_LIMIT_CONVERSION_CREATE: str = "5/minute"    # Prevent conversion fraud
    RATE_LIMIT_CREDIT_CHECK: str = "120/minute"       # Frequent balance checks OK
    RATE_LIMIT_PARTNER_APPLY: str = "3/hour"          # Limit partner applications
    RATE_LIMIT_PAYOUT_REQUEST: str = "5/day"          # Prevent payout spam
    RATE_LIMIT_GOALS_COMPLETE: str = "30/minute"      # Allow rapid goal completion

    # ==========================================================================
    # Referral Program Configuration
    # ==========================================================================
    REFERRAL_CODE_LENGTH: int = 8                     # Character length of referral codes
    REFERRAL_CODE_PREFIX: str = "ref_"                # Prefix for referral codes
    REFERRAL_CODE_VALIDITY_DAYS: int = 90             # Code expiration period
    REFERRAL_REWARD_REFERRER_INR: int = 500           # Referrer reward in INR
    REFERRAL_REWARD_REFERRER_USD: int = 20            # Referrer reward in USD
    REFERRAL_REWARD_REFEREE_MONTHS_FREE: int = 1      # Free months for referee
    REFERRAL_REQUIRE_PRO_PLAN: bool = True            # Only Pro+ users can create referrals
    REFERRAL_MAX_CODES_PER_USER: int = 5              # Max referral codes per user

    # ==========================================================================
    # Partner/Affiliate Program Configuration
    # ==========================================================================
    PARTNER_COMMISSION_RATE: float = 0.20             # 20% commission rate
    PARTNER_MINIMUM_PAYOUT_INR: int = 2000            # Minimum payout threshold INR
    PARTNER_MINIMUM_PAYOUT_USD: int = 50              # Minimum payout threshold USD
    PARTNER_PAYOUT_DAY: int = 1                       # Day of month for payouts (1st)
    PARTNER_COOKIE_DURATION_DAYS: int = 30            # Attribution window
    PARTNER_MANUAL_REVIEW_THRESHOLD_USD: int = 500    # Manual review for large payouts
    PARTNER_FRAUD_DETECTION_ENABLED: bool = True      # Enable fraud detection rules

    # ==========================================================================
    # Payout Configuration
    # ==========================================================================
    # Stripe Connect for international payouts
    STRIPE_SECRET_KEY: str = os.getenv("STRIPE_SECRET_KEY", "")
    STRIPE_WEBHOOK_SECRET: str = os.getenv("STRIPE_WEBHOOK_SECRET", "")
    STRIPE_CONNECT_ENABLED: bool = os.getenv("STRIPE_CONNECT_ENABLED", "true").lower() == "true"

    # PayPal for alternative payouts
    PAYPAL_CLIENT_ID: str = os.getenv("PAYPAL_CLIENT_ID", "")
    PAYPAL_CLIENT_SECRET: str = os.getenv("PAYPAL_CLIENT_SECRET", "")
    PAYPAL_ENABLED: bool = os.getenv("PAYPAL_ENABLED", "false").lower() == "true"

    # UPI for India payouts
    UPI_ENABLED: bool = os.getenv("UPI_ENABLED", "true").lower() == "true"
    RAZORPAY_KEY_ID: str = os.getenv("RAZORPAY_KEY_ID", "")
    RAZORPAY_KEY_SECRET: str = os.getenv("RAZORPAY_KEY_SECRET", "")

    # Payout processing settings
    PAYOUT_BATCH_SIZE: int = 100                      # Process payouts in batches
    PAYOUT_RETRY_MAX_ATTEMPTS: int = 3                # Max retry attempts
    PAYOUT_RETRY_DELAY_SECONDS: int = 300             # 5 minutes between retries

    # ==========================================================================
    # Setup Goals / Gamification Configuration
    # ==========================================================================
    GOALS_ENABLED: bool = True
    GOAL_CREDITS: dict = {
        "upload_profile_logo": 50,
        "create_first_gallery": 100,
        "share_gallery_with_client": 100,
        "enable_2fa": 100,
        "connect_payment_method": 150,
    }
    GOALS_TOTAL_POSSIBLE_CREDITS: int = 500           # Sum of all goal credits
    GOALS_EXPIRY_DAYS: int = 30                       # Goals must be completed within 30 days

    # ==========================================================================
    # Credit Ledger Configuration
    # ==========================================================================
    CREDIT_TYPE_AI: str = "ai_credits"
    CREDIT_TYPE_BILL: str = "bill_credits"
    CREDIT_LEDGER_RETENTION_DAYS: int = 365           # Keep transaction history for 1 year
    CREDIT_MAX_BALANCE: int = 100000                  # Maximum credit balance (fraud prevention)

    # ==========================================================================
    # Service Integration URLs
    # ==========================================================================
    BILLING_SERVICE_URL: str = os.getenv("BILLING_SERVICE_URL", "http://billing-service:8002")
    NOTIFICATIONS_SERVICE_URL: str = os.getenv("NOTIFICATIONS_SERVICE_URL", "http://notifications-service:8007")
    ONBOARDING_SERVICE_URL: str = os.getenv("ONBOARDING_SERVICE_URL", "http://onboarding-service:8010")

    # ==========================================================================
    # Metrics & Observability
    # ==========================================================================
    METRICS_ENABLED: bool = True
    METRICS_CUSTOM_PREFIX: str = "growth"

    # ==========================================================================
    # Circuit Breaker (for service calls)
    # ==========================================================================
    CIRCUIT_BREAKER_FAILURE_THRESHOLD: int = 5
    CIRCUIT_BREAKER_RECOVERY_TIMEOUT: int = 30
    CIRCUIT_BREAKER_EXPECTED_EXCEPTION: str = "ConnectionError"

    # ==========================================================================
    # Properties
    # ==========================================================================
    @property
    def CORS_ORIGINS(self) -> List[str]:
        """Get CORS origins - handled as property to avoid pydantic env parsing issues."""
        return get_cors_origins()

    @property
    def effective_read_replica_url(self) -> str:
        """Get the effective read replica URL, falling back to main if not set."""
        return self.DATABASE_READ_REPLICA_URL or self.DATABASE_URL

    @property
    def effective_database_url(self) -> str:
        """Get the effective database URL, using PgBouncer if enabled."""
        if self.PGBOUNCER_ENABLED:
            # Parse original URL and replace host/port with PgBouncer
            from urllib.parse import urlparse, urlunparse
            parsed = urlparse(self.DATABASE_URL)
            pgbouncer_netloc = f"{parsed.username}:{parsed.password}@{self.PGBOUNCER_HOST}:{self.PGBOUNCER_PORT}"
            return urlunparse((
                parsed.scheme,
                pgbouncer_netloc,
                parsed.path,
                parsed.params,
                parsed.query,
                parsed.fragment
            ))
        return self.DATABASE_URL


settings = Settings()
