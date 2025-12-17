from __future__ import annotations

from enum import Enum
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable

from pydantic import AnyHttpUrl, AnyUrl, Field, RedisDsn, SecretStr, ValidationError
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
    google_client_id: str = Field(..., alias="GOOGLE_CLIENT_ID")
    google_client_secret: SecretStr = Field(..., alias="GOOGLE_CLIENT_SECRET")
    google_redirect_uri: AnyHttpUrl = Field(..., alias="GOOGLE_REDIRECT_URI")

    # CORS / security
    allowed_cors_origins: list[str] = Field(default_factory=list, alias="ALLOWED_CORS_ORIGINS")

    # Observability
    log_level: str = Field("INFO", alias="LOG_LEVEL")
    sentry_dsn: SecretStr | None = Field(None, alias="SENTRY_DSN")

    SENSITIVE_FIELDS: frozenset[str] = frozenset(
        {
            "database_url",
            "redis_url",
            "jwt_private_key_path",
            "jwt_public_key_path",
            "google_client_secret",
            "sentry_dsn",
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


def iter_sensitive_keys(extra_keys: Iterable[str] | None = None) -> set[str]:
    """Return the set of sensitive keys used for masking."""

    keys = set(AppSettings.SENSITIVE_FIELDS)
    if extra_keys:
        keys.update(extra_keys)
    return keys
