from __future__ import annotations

import json
from enum import Enum
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable, Optional

from pydantic import AnyHttpUrl, AnyUrl, Field, RedisDsn, SecretStr, ValidationError, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


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
        env_file=".env",
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

    # Database and cache (Requirements 1, 2, 19)
    database_url: AnyUrl = Field(..., alias="DATABASE_URL", description="Supports postgres:// or postgresql+asyncpg:// DSNs")
    redis_url: RedisDsn = Field(..., alias="REDIS_URL")
    db_pool_min_size: int = Field(1, alias="DB_POOL_MIN_SIZE")
    db_pool_max_size: int = Field(10, alias="DB_POOL_MAX_SIZE")
    db_pool_max_lifetime_sec: int = Field(1800, alias="DB_POOL_MAX_LIFETIME_SEC")

    # JWT and token lifetimes (Requirements 3, 5)
    jwt_private_key_path: Path = Field(..., alias="JWT_PRIVATE_KEY_PATH")
    jwt_public_key_path: Path = Field(..., alias="JWT_PUBLIC_KEY_PATH")
    jwt_algorithm: str = Field("EdDSA", alias="JWT_ALGORITHM")
    access_token_ttl_minutes: int = Field(15, alias="ACCESS_TOKEN_TTL_MINUTES")
    refresh_token_ttl_days: int = Field(7, alias="REFRESH_TOKEN_TTL_DAYS")

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

    # CORS / security
    allowed_cors_origins: list[str] = Field(default_factory=list, alias="ALLOWED_CORS_ORIGINS")

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

    # Observability
    log_level: str = Field("INFO", alias="LOG_LEVEL")
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
        
        # Set default CORS origins for development
        if self.app_env == Environment.DEVELOPMENT and not self.allowed_cors_origins:
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
        # Re-raise to fail fast on application startup
        raise exc


def iter_sensitive_keys(extra_keys: Optional[Iterable[str]] = None) -> set[str]:
    """Return the set of sensitive keys used for masking."""

    keys = set(AppSettings.SENSITIVE_FIELDS)
    if extra_keys:
        keys.update(extra_keys)
    return keys
