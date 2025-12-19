from __future__ import annotations

import os
from typing import Dict

import pytest
from hypothesis import given, strategies as st, HealthCheck, settings as hypothesis_settings
from pydantic import ValidationError

from app.config.settings import AppSettings, get_settings

REQUIRED_KEYS = {
    "DATABASE_URL",
    "REDIS_URL",
    "JWT_PRIVATE_KEY_PATH",
    "JWT_PUBLIC_KEY_PATH",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REDIRECT_URI",
}

VALID_ENV: Dict[str, str] = {
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
    "JWT_ALGORITHM": "EdDSA",
    "ACCESS_TOKEN_TTL_MINUTES": "15",
    "REFRESH_TOKEN_TTL_DAYS": "7",
    "ARGON2_MEMORY_COST": "65536",
    "ARGON2_TIME_COST": "3",
    "ARGON2_PARALLELISM": "4",
    "GOOGLE_CLIENT_ID": "test-google-client-id",
    "GOOGLE_CLIENT_SECRET": "test-google-client-secret",
    "GOOGLE_REDIRECT_URI": "https://localhost:5173/auth/callback",
    "LOG_LEVEL": "INFO",
}


def _apply_env(monkeypatch: pytest.MonkeyPatch, overrides: Dict[str, str]) -> None:
    for key, value in overrides.items():
        monkeypatch.setenv(key, value)


@pytest.fixture(autouse=True)
def clear_settings_cache() -> None:
    """Ensure settings cache is cleared before each test."""

    get_settings.cache_clear()


@given(
    missing_key=st.sampled_from(sorted(REQUIRED_KEYS)),
    settings=hypothesis_settings(suppress_health_check=[HealthCheck.function_scoped_fixture])
)
def test_settings_fail_fast_when_required_missing(monkeypatch: pytest.MonkeyPatch, missing_key: str) -> None:
    """Fail fast if any required configuration key is missing (Requirement 25.2)."""

    _apply_env(monkeypatch, {k: v for k, v in VALID_ENV.items() if k != missing_key})
    monkeypatch.delenv(missing_key, raising=False)

    with pytest.raises(ValidationError):
        AppSettings()


def test_settings_loads_with_valid_configuration(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ensure settings load when all required keys are present."""

    _apply_env(monkeypatch, VALID_ENV)

    settings = AppSettings()

    assert settings.database_url.host == "localhost"
    assert settings.redis_url.host == "localhost"
    assert settings.access_token_ttl_minutes == 15
    assert settings.refresh_token_ttl_days == 7
    assert settings.jwt_algorithm == "EdDSA"


def test_masking_hides_sensitive_values(monkeypatch: pytest.MonkeyPatch) -> None:
    """Sensitive fields should be masked in safe_dump() output (Requirement 25.5)."""

    _apply_env(monkeypatch, VALID_ENV)

    settings = AppSettings()
    masked = settings.safe_dump()

    for key in settings.SENSITIVE_FIELDS:
        assert key in masked
        masked_value = masked[key]
        assert isinstance(masked_value, str)
        # Either the value contains masking asterisks, or it's marked as empty
        assert "*" in masked_value or masked_value == "<empty>"
