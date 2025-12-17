from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict
from uuid import UUID

import pytest
from hypothesis import given, strategies as st

from app.config.settings import AppSettings, get_settings
from app.utils.security import create_access_token, decode_token, hash_password, verify_password


# Test key pair (non-production, for unit tests only)
TEST_PRIVATE_KEY = """-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEILvmXbT5ICbJqYnp5xpoE2mR7BfrpsbR9f7D78DveoxW
-----END PRIVATE KEY-----
"""

TEST_PUBLIC_KEY = """-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA62q7O3cu6UytzszbmWzxubUoil58x2oylZMhUlCT3oc=
-----END PUBLIC KEY-----
"""


BASE_ENV: Dict[str, str] = {
    "APP_NAME": "RawDrive Backend",
    "APP_ENV": "test",
    "API_HOST": "127.0.0.1",
    "API_PORT": "8000",
    "DATABASE_URL": "postgresql+asyncpg://user:pass@localhost:5432/rawdrive",
    "REDIS_URL": "redis://localhost:6379/0",
    "DB_POOL_MIN_SIZE": "1",
    "DB_POOL_MAX_SIZE": "5",
    "DB_POOL_MAX_LIFETIME_SEC": "600",
    "JWT_ALGORITHM": "EdDSA",
    "ACCESS_TOKEN_TTL_MINUTES": "15",
    "REFRESH_TOKEN_TTL_DAYS": "7",
    "ARGON2_MEMORY_COST": "65536",
    "ARGON2_TIME_COST": "3",
    "ARGON2_PARALLELISM": "4",
    "GOOGLE_CLIENT_ID": "test-google-client-id",
    "GOOGLE_CLIENT_SECRET": "test-google-client-secret",
    "GOOGLE_REDIRECT_URI": "https://localhost:5173/auth/callback",
    "ALLOWED_CORS_ORIGINS": "[\"http://localhost:5173\"]",
    "LOG_LEVEL": "INFO",
}


def _write_keys(tmp_path: Path) -> tuple[Path, Path]:
    priv = tmp_path / "jwtEd25519.key"
    pub = tmp_path / "jwtEd25519.key.pub"
    priv.write_text(TEST_PRIVATE_KEY)
    pub.write_text(TEST_PUBLIC_KEY)
    return priv, pub


def _load_settings(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> AppSettings:
    priv, pub = _write_keys(tmp_path)
    env = BASE_ENV | {
        "JWT_PRIVATE_KEY_PATH": str(priv),
        "JWT_PUBLIC_KEY_PATH": str(pub),
    }
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    return AppSettings()


@pytest.fixture(autouse=True)
def clear_settings_cache() -> None:
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


password_strategy = st.text(
    alphabet=st.characters(min_codepoint=33, max_codepoint=126, blacklist_categories=("Cs",)),
    min_size=8,
    max_size=64,
)


@given(password=password_strategy, other=password_strategy)
def test_password_hashing_round_trip(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, password: str, other: str) -> None:
    settings = _load_settings(monkeypatch, tmp_path)

    password_hash = hash_password(password, settings)

    assert password_hash.startswith("$argon2id$")
    assert verify_password(password, password_hash, settings)

    if other != password:
        assert not verify_password(other, password_hash, settings)


permissions_strategy = st.lists(
    st.sampled_from([
        "workspace:*",
        "members:read",
        "members:write",
        "galleries:read",
        "galleries:write",
        "billing:view",
    ]),
    min_size=1,
    max_size=5,
    unique=True,
)


@given(user_id=st.uuids(), workspace_id=st.uuids(), permissions=permissions_strategy)
def test_access_token_claims(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, user_id: UUID, workspace_id: UUID, permissions: list[str]) -> None:
    settings = _load_settings(monkeypatch, tmp_path)

    token = create_access_token(
        user_id=user_id,
        workspace_id=workspace_id,
        permissions=permissions,
        settings=settings,
    )

    payload = decode_token(token, settings=settings)

    assert payload["token_type"] == "access"
    assert payload["user_id"] == str(user_id)
    assert payload["workspace_id"] == str(workspace_id)
    assert payload["permissions"] == permissions
    assert payload["sub"] == str(user_id)

    exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
    iat = datetime.fromtimestamp(payload["iat"], tz=timezone.utc)
    assert exp - iat == timedelta(minutes=settings.access_token_ttl_minutes)