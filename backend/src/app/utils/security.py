"""Security utilities: password hashing and JWT handling.

Implements Argon2id hashing with project-specific parameters and JWT
helpers for issuing and decoding access/refresh tokens (EdDSA).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable, Sequence

import jwt
from argon2 import PasswordHasher
from argon2 import exceptions as argon_exc
from cryptography.hazmat.primitives.serialization import (
    load_pem_private_key,
    load_pem_public_key,
)

from app.config.settings import AppSettings, get_settings


# ---------------------------------------------------------------------------
# Password hashing (Argon2id)
# ---------------------------------------------------------------------------


@lru_cache(maxsize=None)
def _get_password_hasher(memory_cost: int, time_cost: int, parallelism: int) -> PasswordHasher:
    """Create (and cache) a configured Argon2id PasswordHasher instance."""

    return PasswordHasher(memory_cost=memory_cost, time_cost=time_cost, parallelism=parallelism)


def get_password_hasher(settings: AppSettings | None = None) -> PasswordHasher:
    """Return a configured Argon2id hasher using application settings."""

    settings = settings or get_settings()
    return _get_password_hasher(settings.argon2_memory_cost, settings.argon2_time_cost, settings.argon2_parallelism)


def hash_password(password: str, settings: AppSettings | None = None) -> str:
    """Hash a plaintext password using Argon2id.

    Raises:
        ValueError: if the password is empty.
    """

    if password is None or password == "":
        raise ValueError("password must not be empty")

    hasher = get_password_hasher(settings)
    return hasher.hash(password)


def verify_password(password: str, password_hash: str, settings: AppSettings | None = None) -> bool:
    """Verify a plaintext password against an Argon2id hash."""

    hasher = get_password_hasher(settings)
    try:
        return bool(hasher.verify(password_hash, password))
    except (argon_exc.VerifyMismatchError, argon_exc.VerificationError):
        return False


# ---------------------------------------------------------------------------
# JWT helpers (EdDSA signing)
# ---------------------------------------------------------------------------


@lru_cache(maxsize=None)
def _load_key(path: str) -> bytes:
    """Load and cache a key file as bytes."""

    key_path = Path(path).expanduser()
    if not key_path.exists():
        raise FileNotFoundError(f"JWT key not found at {key_path}")
    return key_path.read_bytes()


@lru_cache(maxsize=None)
def _load_private_key(path: str):
    """Load and cache the Ed25519 private key."""
    key_bytes = _load_key(path)
    return load_pem_private_key(key_bytes, password=None)


@lru_cache(maxsize=None)
def _load_public_key(path: str):
    """Load and cache the Ed25519 public key."""
    key_bytes = _load_key(path)
    return load_pem_public_key(key_bytes)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def create_access_token(
    *,
    user_id: str | uuid.UUID,
    workspace_id: str | uuid.UUID,
    permissions: Iterable[str],
    jti: str | None = None,
    extra_claims: dict[str, Any] | None = None,
    settings: AppSettings | None = None,
) -> str:
    """Create a signed access token with required claims.

    Required claims: user_id, workspace_id, permissions (list).
    """

    settings = settings or get_settings()

    perms_list: list[str] = list(dict.fromkeys(str(p) for p in permissions))
    if not perms_list:
        raise ValueError("permissions must contain at least one entry")

    now = _now()
    expires = now + timedelta(minutes=settings.access_token_ttl_minutes)

    payload: dict[str, Any] = {
        "sub": str(user_id),
        "user_id": str(user_id),
        "workspace_id": str(workspace_id),
        "permissions": perms_list,
        "iat": int(now.timestamp()),
        "exp": int(expires.timestamp()),
        "jti": jti or str(uuid.uuid4()),
        "iss": "rawdrive-backend",
        "token_type": "access",
    }

    if extra_claims:
        payload.update(extra_claims)

    private_key = _load_key(str(settings.jwt_private_key_path))
    return jwt.encode(payload, private_key, algorithm=settings.jwt_algorithm)


def create_refresh_token(
    *,
    user_id: str | uuid.UUID,
    workspace_id: str | uuid.UUID | None = None,
    session_id: str | uuid.UUID | None = None,
    jti: str | None = None,
    extra_claims: dict[str, Any] | None = None,
    settings: AppSettings | None = None,
) -> str:
    """Create a signed refresh token."""

    settings = settings or get_settings()

    now = _now()
    expires = now + timedelta(days=settings.refresh_token_ttl_days)

    payload: dict[str, Any] = {
        "sub": str(user_id),
        "user_id": str(user_id),
        "iat": int(now.timestamp()),
        "exp": int(expires.timestamp()),
        "jti": jti or str(uuid.uuid4()),
        "iss": "rawdrive-backend",
        "token_type": "refresh",
    }

    if workspace_id is not None:
        payload["workspace_id"] = str(workspace_id)
    if session_id is not None:
        payload["session_id"] = str(session_id)
    if extra_claims:
        payload.update(extra_claims)

    private_key = _load_key(str(settings.jwt_private_key_path))
    return jwt.encode(payload, private_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str, *, settings: AppSettings | None = None, audience: str | None = None) -> dict[str, Any]:
    """Decode and verify a token using the public key."""

    settings = settings or get_settings()
    public_key = _load_key(str(settings.jwt_public_key_path))
    options = {"verify_aud": audience is not None}
    return jwt.decode(token, public_key, algorithms=[settings.jwt_algorithm], audience=audience, options=options)


def extract_permissions(roles_permissions: Sequence[Sequence[str]]) -> list[str]:
    """Flatten and de-duplicate permissions from multiple role grants."""

    flattened: list[str] = []
    for perms in roles_permissions:
        for perm in perms:
            flattened.append(str(perm))
    return list(dict.fromkeys(flattened))