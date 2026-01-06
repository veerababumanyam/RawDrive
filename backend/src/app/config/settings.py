from __future__ import annotations

import json
import os
import sys
from enum import Enum
from functools import lru_cache
from pathlib import Path
from typing import Any, ClassVar, Iterable, Optional

from pydantic import AnyHttpUrl, AnyUrl, Field, RedisDsn, SecretStr, ValidationError, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

TEST_FALLBACK_ENV = {
    "APP_NAME": "RawDrive Backend",
    "APP_ENV": "test",
    "API_HOST": "127.0.0.1",
    "API_PORT": "8000",
    "DATABASE_URL": "postgresql+asyncpg://user:pass@localhost:5432/rawdrive",
    "REDIS_URL": "redis://localhost:6379/0",
    "DB_POOL_MIN_SIZE": "1",
    "DB_POOL_MAX_SIZE": "5",
    "DB_POOL_MAX_LIFETIME_SEC": "600",
    "JWT_PRIVATE_KEY_PATH": "/tmp/jwtRS256.key",
    "JWT_PUBLIC_KEY_PATH": "/tmp/jwtRS256.key.pub",
    "GOOGLE_CLIENT_ID": "test-google-client-id",
    "GOOGLE_CLIENT_SECRET": "test-google-client-secret",
    "GOOGLE_REDIRECT_URI": "https://localhost:5173/auth/callback",
}


class Environment(str, Enum):
    """Deployment environment for the service."""

    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"
    TEST = "test"


class AppSettings(BaseSettings):
    """Application settings loaded from environment variables.

    The configuration is intentionally strict and will raise validation errors when
    required values are missing to ensure fail-fast behaviour at startup
    (Requirements: 25.1, 25.2, 17.1).
    """

    model_config = SettingsConfigDict(
        env_file=None if os.getenv("PYTEST_CURRENT_TEST") else str(Path(__file__).parent.parent.parent.parent / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # Core service metadata and server ports (Requirement 16)
    app_name: str = Field("RawDrive Backend", alias="APP_NAME")
    app_env: Environment = Field(Environment.DEVELOPMENT, alias="APP_ENV")
    api_host: str = Field("0.0.0.0", alias="API_HOST")
    api_port: int = Field(8000, alias="API_PORT")
    api_base_url: Optional[str] = Field(
        None,
        alias="API_BASE_URL",
        description="Public base URL for API (e.g., https://rawdrive.in). Used for upload URLs. If not set, falls back to http://localhost:8000",
    )
    public_url: Optional[str] = Field(
        None,
        alias="PUBLIC_URL",
        description="Public base URL for profile pages (e.g., https://rawdrive.ai). Used for QR codes and public profile URLs. Required in production.",
    )

    # CDN and Gallery URLs
    cdn_base_url: str = Field(
        "http://localhost:8000/media",
        alias="CDN_BASE_URL",
        description="Base URL for CDN assets (thumbnails, images). In production, use your CDN domain.",
    )
    gallery_share_base_url: str = Field(
        "http://localhost:3000/g",
        alias="GALLERY_SHARE_BASE_URL",
        description="Base URL for public gallery share links. In production, use your gallery domain.",
    )

    # Database and cache (Requirements 1, 2, 19)
    database_url: AnyUrl = Field(..., alias="DATABASE_URL", description="Supports postgres:// or postgresql+asyncpg:// DSNs")
    redis_url: RedisDsn = Field(..., alias="REDIS_URL")
    db_pool_min_size: int = Field(1, alias="DB_POOL_MIN_SIZE")
    db_pool_max_size: int = Field(10, alias="DB_POOL_MAX_SIZE")
    db_pool_max_lifetime_sec: int = Field(1800, alias="DB_POOL_MAX_LIFETIME_SEC")

    # Redis connection pool settings
    redis_pool_max_connections: int = Field(50, alias="REDIS_POOL_MAX_CONNECTIONS")
    redis_socket_timeout: float = Field(5.0, alias="REDIS_SOCKET_TIMEOUT")
    redis_socket_connect_timeout: float = Field(5.0, alias="REDIS_SOCKET_CONNECT_TIMEOUT")
    redis_retry_on_timeout: bool = Field(True, alias="REDIS_RETRY_ON_TIMEOUT")
    redis_health_check_interval: int = Field(30, alias="REDIS_HEALTH_CHECK_INTERVAL")

    # PgBouncer connection pooler settings (024-5k-concurrent-autoscale)
    pgbouncer_enabled: bool = Field(
        default=False,
        alias="PGBOUNCER_ENABLED",
        description="Enable PgBouncer connection pooling for production scaling",
    )
    pgbouncer_host: str = Field(
        default="pgbouncer",
        alias="PGBOUNCER_HOST",
        description="PgBouncer hostname (used when PGBOUNCER_ENABLED=true)",
    )
    pgbouncer_port: int = Field(
        default=6432,
        alias="PGBOUNCER_PORT",
        description="PgBouncer port (default: 6432)",
    )

    # JWT and token lifetimes (Requirements 3, 5)
    jwt_private_key_path: Path = Field(..., alias="JWT_PRIVATE_KEY_PATH")
    jwt_public_key_path: Path = Field(..., alias="JWT_PUBLIC_KEY_PATH")
    jwt_algorithm: str = Field("EdDSA", alias="JWT_ALGORITHM")
    access_token_ttl_minutes: int = Field(15, alias="ACCESS_TOKEN_TTL_MINUTES")
    refresh_token_ttl_days: int = Field(7, alias="REFRESH_TOKEN_TTL_DAYS")
    extended_refresh_token_ttl_days: int = Field(
        30,
        alias="EXTENDED_REFRESH_TOKEN_TTL_DAYS",
        description="Extended refresh token TTL when 'remember me' is selected (default: 30 days)",
    )

    # Session security settings
    max_concurrent_sessions: int = Field(
        5,
        alias="MAX_CONCURRENT_SESSIONS",
        description="Maximum number of concurrent sessions per user",
    )

    # Argon2 parameters (Requirement 3.1 / 3.5)
    argon2_memory_cost: int = Field(65536, alias="ARGON2_MEMORY_COST")
    argon2_time_cost: int = Field(3, alias="ARGON2_TIME_COST")
    argon2_parallelism: int = Field(4, alias="ARGON2_PARALLELISM")

    # Google OAuth (Requirement 4)
    google_client_id: str = Field(
        default="dev-client-id",
        alias="GOOGLE_CLIENT_ID",
        description="Google OAuth client ID (required in production, optional in development)",
    )
    google_client_secret: SecretStr = Field(
        default="dev-client-secret",
        alias="GOOGLE_CLIENT_SECRET",
        description="Google OAuth client secret (required in production, optional in development)",
    )
    google_redirect_uri: AnyHttpUrl = Field(
        default="http://localhost:3000/api/v1/auth/oauth/google/callback",
        alias="GOOGLE_REDIRECT_URI",
        description="Google OAuth redirect URI",
    )

    # Cloudflare R2 Storage (S3-compatible)
    r2_access_key_id: str = Field(
        default="dev-key",
        alias="R2_ACCESS_KEY_ID",
        description="R2 access key (required in production, optional in development)",
    )
    r2_secret_access_key: SecretStr = Field(
        default="dev-secret",
        alias="R2_SECRET_ACCESS_KEY",
        description="R2 secret key (required in production, optional in development)",
    )
    r2_bucket_name: str = Field(
        default="dev-bucket",
        alias="R2_BUCKET_NAME",
        description="R2 bucket name (required in production, optional in development)",
    )
    r2_endpoint_url: str = Field(
        "https://{account_id}.r2.cloudflarestorage.com",
        alias="R2_ENDPOINT",  # Use R2_ENDPOINT from .env
        description="R2 endpoint URL template (use {account_id} placeholder)",
    )
    r2_account_id: Optional[str] = Field(None, alias="R2_ACCOUNT_ID", description="Cloudflare account ID for R2")

    # Encryption
    encryption_master_key: SecretStr = Field(
        default="0000000000000000000000000000000000000000000000000000000000000000",
        alias="ENCRYPTION_MASTER_KEY",
        description="32-byte hex key for encryption (required in production, optional in development)",
    )
    signed_url_secret: SecretStr = Field(
        default="0000000000000000000000000000000000000000000000000000000000000000",
        alias="SIGNED_URL_SECRET",
        description="32-byte hex secret for signed URLs (required in production, optional in development)",
    )

    # Payment Processing (Razorpay)
    RAZORPAY_KEY_ID: Optional[str] = Field(
        default=None,
        alias="RAZORPAY_KEY_ID",
        description="Razorpay API key ID (required for payments)",
    )
    RAZORPAY_KEY_SECRET: Optional[str] = Field(
        default=None,
        alias="RAZORPAY_KEY_SECRET",
        description="Razorpay API key secret (required for payments)",
    )
    RAZORPAY_WEBHOOK_SECRET: Optional[str] = Field(
        default=None,
        alias="RAZORPAY_WEBHOOK_SECRET",
        description="Razorpay webhook signature secret",
    )

    # SendGrid Email
    sendgrid_api_key: Optional[SecretStr] = Field(
        default=None,
        alias="SENDGRID_API_KEY",
        description="SendGrid API key for email delivery",
    )
    sendgrid_from_email: str = Field(
        default="noreply@rawdrive.in",
        alias="SENDGRID_FROM_EMAIL",
        description="Default from email address for SendGrid",
    )
    sendgrid_from_name: str = Field(
        default="RawDrive",
        alias="SENDGRID_FROM_NAME",
        description="Default from name for SendGrid emails",
    )

    # AI Providers
    gemini_api_key: Optional[SecretStr] = Field(
        default=None,
        alias="GEMINI_API_KEY",
        description="Google Gemini API key (required for AI features)",
    )
    openai_api_key: Optional[SecretStr] = Field(
        default=None,
        alias="OPENAI_API_KEY",
        description="OpenAI API key (optional)",
    )
    anthropic_api_key: Optional[SecretStr] = Field(
        default=None,
        alias="ANTHROPIC_API_KEY",
        description="Anthropic API key (optional)",
    )
    azure_openai_api_key: Optional[SecretStr] = Field(
        default=None,
        alias="AZURE_OPENAI_API_KEY",
        description="Azure OpenAI API key (optional)",
    )
    azure_openai_endpoint: Optional[str] = Field(
        default=None,
        alias="AZURE_OPENAI_ENDPOINT",
        description="Azure OpenAI endpoint URL (optional)",
    )
    azure_openai_deployment: Optional[str] = Field(
        default=None,
        alias="AZURE_OPENAI_DEPLOYMENT",
        description="Azure OpenAI deployment name (optional)",
    )
    ollama_base_url: str = Field(
        default="http://localhost:11434",
        alias="OLLAMA_BASE_URL",
        description="Ollama base URL for local AI",
    )
    lm_studio_base_url: str = Field(
        default="http://localhost:1234",
        alias="LM_STUDIO_BASE_URL",
        description="LM Studio base URL for local AI",
    )

    # CORS / security
    allowed_cors_origins: list[str] = Field(default_factory=list, alias="ALLOWED_CORS_ORIGINS")

    REQUIRED_ENV_KEYS: ClassVar[set[str]] = {
        "DATABASE_URL",
        "REDIS_URL",
        "JWT_PRIVATE_KEY_PATH",
        "JWT_PUBLIC_KEY_PATH",
        "GOOGLE_CLIENT_ID",
        "GOOGLE_CLIENT_SECRET",
        "GOOGLE_REDIRECT_URI",
    }

    @model_validator(mode="after")
    def validate_required_env(cls, values: "AppSettings") -> "AppSettings":
        # Check actual field values instead of os.getenv - pydantic-settings loads from .env
        missing = []
        for key in cls.REQUIRED_ENV_KEYS:
            field_name = key.lower()
            if not getattr(values, field_name, None):
                missing.append(key)
        if missing:
            raise ValueError(
                f"Missing required environment variables: {', '.join(sorted(missing))}"
            )
        return values

    @field_validator("allowed_cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> list[str]:
        """Parse CORS origins from JSON string or list."""
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

    # Microservices
    invitations_service_url: Optional[str] = Field(
        default=None,
        alias="INVITATIONS_SERVICE_URL",
        description="URL for invitations microservice (e.g., http://invitations-api:8000)",
    )

    # Observability
    log_level: str = Field("INFO", alias="LOG_LEVEL")
    log_format: str = Field(
        "",
        alias="LOG_FORMAT",
        description="Log output format: 'json' for structured JSON, 'console' for colored dev output, 'plain' for plain text. Empty defaults to 'json' in production/staging, 'console' in development.",
    )
    sentry_dsn: Optional[SecretStr] = Field(None, alias="SENTRY_DSN")

    SENSITIVE_FIELDS: frozenset[str] = frozenset(
        {
            "database_url",
            "redis_url",
            "jwt_private_key_path",
            "jwt_public_key_path",
            "google_client_secret",
            "sentry_dsn",
            "r2_secret_access_key",
            "encryption_master_key",
            "signed_url_secret",
            "RAZORPAY_KEY_SECRET",
            "RAZORPAY_WEBHOOK_SECRET",
            "sendgrid_api_key",
            "gemini_api_key",
            "openai_api_key",
            "anthropic_api_key",
            "azure_openai_api_key",
        }
    )

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
        return f"{text[:2]}{'*' * (len(text) - 4)}{text[-2:]}"

    def safe_dump(self) -> dict[str, Any]:
        """Return a dict with sensitive values masked for logging/diagnostics."""

        data = self.model_dump()
        for field in self.SENSITIVE_FIELDS:
            if field in data:
                data[field] = self.mask_value(data[field])
        return data

    @classmethod
    def validate_ports(cls, port: int) -> int:
        if port <= 0 or port > 65535:
            raise ValueError("port must be between 1 and 65535")
        return port

    @classmethod
    def validate_pool_bounds(cls, min_size: int, max_size: int) -> tuple[int, int]:
        if min_size <= 0:
            raise ValueError("db_pool_min_size must be positive")
        if max_size < min_size:
            raise ValueError("db_pool_max_size must be >= db_pool_min_size")
        return min_size, max_size

    def model_post_init(self, __context: Any) -> None:  # type: ignore[override]
        # Enforce additional invariants not covered by Field validators.
        self.api_port = self.validate_ports(self.api_port)
        _, _ = self.validate_pool_bounds(self.db_pool_min_size, self.db_pool_max_size)
        
        # Set default CORS origins for local development and tests when not explicitly configured
        if self.app_env in {Environment.DEVELOPMENT, Environment.TEST} and not self.allowed_cors_origins:
            self.allowed_cors_origins = [
                "http://localhost:5173",
                "http://localhost:3000",
                "http://127.0.0.1:5173",
                "http://127.0.0.1:3000",
            ]


@lru_cache
def get_settings() -> AppSettings:
    """Load and cache application settings.

    Fail-fast behaviour is achieved by raising `ValidationError` if required
    configuration is missing or invalid at import/startup time.
    """

    return AppSettings()


def ensure_settings_loaded() -> AppSettings:
    """Convenience loader that surfaces validation errors immediately."""

    try:
        return get_settings()
    except ValidationError as exc:  # pragma: no cover - behaviour asserted in tests
        is_pytest = (
            "pytest" in sys.modules
            or os.getenv("PYTEST_CURRENT_TEST")
            or os.getenv("PYTEST_DISABLE_PLUGIN_AUTOLOAD")
            or os.getenv("PYTEST_RUNNING")
            or os.getenv("PYTEST")
        )
        if is_pytest:
            for key, value in TEST_FALLBACK_ENV.items():
                os.environ.setdefault(key, value)
            return AppSettings()
        # Re-raise to fail fast on application startup
        raise exc


def iter_sensitive_keys(extra_keys: Optional[Iterable[str]] = None) -> set[str]:
    """Return the set of sensitive keys used for masking."""

    keys = set(AppSettings.SENSITIVE_FIELDS)
    if extra_keys:
        keys.update(extra_keys)
    return keys
