"""AuthService: signup, login, refresh, logout operations.

Implements local email/password authentication with Argon2id hashing and
JWT token issuance (EdDSA). Google OAuth is handled separately.

Correctness Properties enforced:
- Property 2: Password Hashing Consistency
- Property 3: JWT Token Claims Completeness
- Property 4: Token Refresh Rotation
- Property 5: Authentication Error Opacity
"""

from __future__ import annotations

import hashlib
import logging
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Sequence, Optional, Union

import asyncpg

from app.config.settings import AppSettings, get_settings
from app.db.postgres import get_postgres_pool
from app.db.redis import get_redis_client
from app.utils.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    extract_permissions,
    hash_password,
    verify_password,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class AuthError(Exception):
    """Base authentication error."""

    def __init__(self, message: str, code: str, status: int = 401):
        super().__init__(message)
        self.code = code
        self.status = status


class InvalidCredentialsError(AuthError):
    """Invalid email or password (opaque message)."""

    def __init__(self) -> None:
        super().__init__(
            "Invalid email or password",
            "AUTH_INVALID_CREDENTIALS",
            401,
        )


class TokenExpiredError(AuthError):
    """Token has expired."""

    def __init__(self) -> None:
        super().__init__("Token has expired", "AUTH_TOKEN_EXPIRED", 401)


class TokenInvalidError(AuthError):
    """Token is invalid or malformed."""

    def __init__(self) -> None:
        super().__init__("Token is invalid", "AUTH_TOKEN_INVALID", 401)


class UserExistsError(AuthError):
    """Email already registered."""

    def __init__(self) -> None:
        super().__init__("Email already registered", "AUTH_USER_EXISTS", 409)


class SessionRevokedError(AuthError):
    """Session has been revoked."""

    def __init__(self) -> None:
        super().__init__("Session has been revoked", "AUTH_SESSION_REVOKED", 401)


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class TokenPair:
    """Access + refresh token pair returned on successful auth."""

    access_token: str
    refresh_token: str
    token_type: str = "Bearer"
    expires_in: int = 900  # seconds


@dataclass
class AuthUser:
    """Minimal user info returned by auth operations."""

    user_id: uuid.UUID
    email: str
    display_name: str
    email_verified: bool
    workspace_id: Optional[uuid.UUID] = None


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def _hash_refresh_token(token: str) -> str:
    """SHA-256 hash of refresh token for storage."""
    return hashlib.sha256(token.encode()).hexdigest()


def _generate_token_bytes(length: int = 32) -> str:
    """Generate URL-safe random token."""
    return secrets.token_urlsafe(length)


async def _get_user_permissions(
    pool: asyncpg.Pool,
    user_id: uuid.UUID,
    workspace_id: uuid.UUID,
) -> list[str]:
    """Compute effective permissions for user in workspace (union of all roles)."""
    query = """
        SELECT r.permissions
        FROM member_roles mr
        JOIN roles r ON r.role_id = mr.role_id
        JOIN workspace_memberships wm ON wm.membership_id = mr.membership_id
        WHERE wm.user_id = $1 AND wm.workspace_id = $2 AND wm.status = 'active'
    """
    rows = await pool.fetch(query, user_id, workspace_id)
    roles_perms: list[list[str]] = [row["permissions"] for row in rows]
    return extract_permissions(roles_perms)


async def _get_default_workspace(
    pool: asyncpg.Pool,
    user_id: uuid.UUID,
) -> Optional[uuid.UUID]:
    """Return first active workspace for user, or None."""
    query = """
        SELECT wm.workspace_id
        FROM workspace_memberships wm
        JOIN workspaces w ON w.workspace_id = wm.workspace_id
        WHERE wm.user_id = $1 AND wm.status = 'active' AND w.status = 'active'
        ORDER BY wm.created_at ASC
        LIMIT 1
    """
    row = await pool.fetchrow(query, user_id)
    return row["workspace_id"] if row else None


# ---------------------------------------------------------------------------
# AuthService class
# ---------------------------------------------------------------------------


class AuthService:
    """Stateless service facade for authentication operations."""

    def __init__(self, settings: Optional[AppSettings] = None):
        self._settings = settings or get_settings()

    # -----------------------------------------------------------------------
    # Signup (local)
    # -----------------------------------------------------------------------

    async def signup_local(
        self,
        email: str,
        password: str,
        display_name: str,
    ) -> tuple[AuthUser, TokenPair]:
        """Register a new user with email/password.

        Creates: user, identity (local), workspace, membership, owner role.
        Returns user and token pair.
        """
        pool = await get_postgres_pool()

        # Check for existing user by email
        existing = await pool.fetchrow(
            "SELECT user_id FROM users WHERE email = $1",
            email.lower(),
        )
        if existing:
            raise UserExistsError()

        user_id = uuid.uuid4()
        identity_id = uuid.uuid4()
        workspace_id = uuid.uuid4()
        membership_id = uuid.uuid4()
        role_id = uuid.uuid4()
        now = datetime.now(timezone.utc)

        password_hash = hash_password(password, self._settings)
        workspace_slug = f"ws-{secrets.token_hex(6)}"

        async with pool.acquire() as conn:
            async with conn.transaction():
                # Create user
                await conn.execute(
                    """
                    INSERT INTO users (user_id, email, display_name, email_verified, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $5)
                    """,
                    user_id,
                    email.lower(),
                    display_name,
                    False,
                    now,
                )

                # Create identity (local provider)
                await conn.execute(
                    """
                    INSERT INTO user_identities (identity_id, user_id, provider, email, password_hash, email_verified, created_at)
                    VALUES ($1, $2, 'local', $3, $4, $5, $6)
                    """,
                    identity_id,
                    user_id,
                    email.lower(),
                    password_hash,
                    False,
                    now,
                )

                # Create workspace
                await conn.execute(
                    """
                    INSERT INTO workspaces (workspace_id, name, slug, status, created_at, updated_at)
                    VALUES ($1, $2, $3, 'active', $4, $4)
                    """,
                    workspace_id,
                    f"{display_name}'s Workspace",
                    workspace_slug,
                    now,
                )

                # Create membership
                await conn.execute(
                    """
                    INSERT INTO workspace_memberships (membership_id, workspace_id, user_id, status, created_at)
                    VALUES ($1, $2, $3, 'active', $4)
                    """,
                    membership_id,
                    workspace_id,
                    user_id,
                    now,
                )

                # Create owner role for workspace
                await conn.execute(
                    """
                    INSERT INTO roles (role_id, workspace_id, name, permissions, is_system, created_at)
                    VALUES ($1, $2, 'owner', $3, TRUE, $4)
                    """,
                    role_id,
                    workspace_id,
                    ["workspace:*", "members:*", "galleries:*", "assets:*", "billing:*"],
                    now,
                )

                # Assign owner role to membership
                await conn.execute(
                    """
                    INSERT INTO member_roles (member_role_id, membership_id, role_id, granted_at)
                    VALUES ($1, $2, $3, $4)
                    """,
                    uuid.uuid4(),
                    membership_id,
                    role_id,
                    now,
                )

                # Create trial subscription
                trial_end = now + timedelta(days=30)
                free_plan = await conn.fetchrow(
                    "SELECT plan_id FROM plans WHERE code = 'free' LIMIT 1"
                )
                if free_plan:
                    await conn.execute(
                        """
                        INSERT INTO workspace_subscriptions (
                            subscription_id, workspace_id, plan_id, status,
                            trial_started_at, trial_expires_at, created_at, updated_at
                        )
                        VALUES ($1, $2, $3, 'trialing', $4, $5, $4, $4)
                        """,
                        uuid.uuid4(),
                        workspace_id,
                        free_plan["plan_id"],
                        now,
                        trial_end,
                    )

        # Build tokens
        permissions = await _get_user_permissions(pool, user_id, workspace_id)
        if not permissions:
            permissions = ["workspace:*"]

        token_pair = self._issue_tokens(user_id, workspace_id, permissions)

        auth_user = AuthUser(
            user_id=user_id,
            email=email.lower(),
            display_name=display_name,
            email_verified=False,
            workspace_id=workspace_id,
        )

        logger.info("User signup completed", extra={"user_id": str(user_id)})
        return auth_user, token_pair

    # -----------------------------------------------------------------------
    # Login (local)
    # -----------------------------------------------------------------------

    async def login_local(
        self,
        email: str,
        password: str,
        workspace_id: Optional[uuid.UUID] = None,
    ) -> tuple[AuthUser, TokenPair]:
        """Authenticate user with email/password.

        Property 5 (Authentication Error Opacity): Always returns same error
        whether email or password is wrong.
        """
        pool = await get_postgres_pool()

        # Fetch user + identity in one query
        query = """
            SELECT u.user_id, u.email, u.display_name, u.email_verified, u.disabled_at,
                   ui.password_hash
            FROM users u
            JOIN user_identities ui ON ui.user_id = u.user_id
            WHERE u.email = $1 AND ui.provider = 'local'
        """
        row = await pool.fetchrow(query, email.lower())

        # Opaque error: user not found
        if row is None:
            raise InvalidCredentialsError()

        # Opaque error: wrong password
        if not verify_password(password, row["password_hash"], self._settings):
            raise InvalidCredentialsError()

        # Disabled account
        if row["disabled_at"] is not None:
            raise InvalidCredentialsError()

        user_id: uuid.UUID = row["user_id"]

        # Resolve workspace
        if workspace_id is None:
            workspace_id = await _get_default_workspace(pool, user_id)

        if workspace_id is None:
            raise AuthError("User has no active workspace", "AUTH_NO_WORKSPACE", 403)

        # Verify membership
        membership = await pool.fetchrow(
            """
            SELECT membership_id FROM workspace_memberships
            WHERE user_id = $1 AND workspace_id = $2 AND status = 'active'
            """,
            user_id,
            workspace_id,
        )
        if membership is None:
            raise AuthError("User is not a member of this workspace", "AUTH_NOT_MEMBER", 403)

        permissions = await _get_user_permissions(pool, user_id, workspace_id)
        if not permissions:
            permissions = ["workspace:read"]

        # Create session
        session_id = await self._create_session(user_id, workspace_id)

        token_pair = self._issue_tokens(
            user_id, workspace_id, permissions, session_id=session_id
        )

        # Store refresh token hash in Redis for rotation/revocation
        await self._store_refresh_token(session_id, token_pair.refresh_token)

        auth_user = AuthUser(
            user_id=user_id,
            email=row["email"],
            display_name=row["display_name"],
            email_verified=row["email_verified"],
            workspace_id=workspace_id,
        )

        logger.info("User login", extra={"user_id": str(user_id)})
        return auth_user, token_pair

    # -----------------------------------------------------------------------
    # Token refresh
    # -----------------------------------------------------------------------

    async def refresh_token(self, refresh_token: str) -> TokenPair:
        """Exchange refresh token for new token pair.

        Property 4 (Token Refresh Rotation): Old token is invalidated,
        new token issued.
        """
        try:
            payload = decode_token(refresh_token, settings=self._settings)
        except Exception:
            raise TokenInvalidError()

        if payload.get("token_type") != "refresh":
            raise TokenInvalidError()

        user_id = uuid.UUID(payload["user_id"])
        workspace_id_str = payload.get("workspace_id")
        session_id_str = payload.get("session_id")

        if not session_id_str:
            raise TokenInvalidError()

        session_id = uuid.UUID(session_id_str)

        # Verify session not revoked
        redis = await get_redis_client()
        stored_hash = await redis.get(f"session:{session_id}:refresh_hash")
        if stored_hash is None:
            raise SessionRevokedError()

        current_hash = _hash_refresh_token(refresh_token)
        if stored_hash.decode() != current_hash:
            # Possible token reuse attack - revoke session
            await self._revoke_session(session_id)
            raise SessionRevokedError()

        pool = await get_postgres_pool()

        # Resolve workspace
        workspace_id: Optional[uuid.UUID] = None
        if workspace_id_str:
            workspace_id = uuid.UUID(workspace_id_str)
        else:
            workspace_id = await _get_default_workspace(pool, user_id)

        if workspace_id is None:
            raise AuthError("No active workspace", "AUTH_NO_WORKSPACE", 403)

        permissions = await _get_user_permissions(pool, user_id, workspace_id)
        if not permissions:
            permissions = ["workspace:read"]

        # Issue new token pair (rotation)
        new_pair = self._issue_tokens(
            user_id, workspace_id, permissions, session_id=session_id
        )

        # Rotate: store new refresh token hash, old one becomes invalid
        await self._store_refresh_token(session_id, new_pair.refresh_token)

        logger.info("Token refreshed", extra={"user_id": str(user_id), "session_id": str(session_id)})
        return new_pair

    # -----------------------------------------------------------------------
    # Logout
    # -----------------------------------------------------------------------

    async def logout(self, refresh_token: str) -> None:
        """Invalidate session associated with refresh token."""
        try:
            payload = decode_token(refresh_token, settings=self._settings)
        except Exception:
            # Silently ignore invalid token on logout
            return

        session_id_str = payload.get("session_id")
        if session_id_str:
            session_id = uuid.UUID(session_id_str)
            await self._revoke_session(session_id)
            logger.info("User logged out", extra={"session_id": str(session_id)})

    # -----------------------------------------------------------------------
    # Internal helpers
    # -----------------------------------------------------------------------

    def _issue_tokens(
        self,
        user_id: uuid.UUID,
        workspace_id: uuid.UUID,
        permissions: Sequence[str],
        session_id: Optional[uuid.UUID] = None,
    ) -> TokenPair:
        """Create access and refresh tokens."""
        access = create_access_token(
            user_id=user_id,
            workspace_id=workspace_id,
            permissions=permissions,
            session_id=session_id,
            settings=self._settings,
        )
        refresh = create_refresh_token(
            user_id=user_id,
            workspace_id=workspace_id,
            session_id=session_id,
            settings=self._settings,
        )
        return TokenPair(
            access_token=access,
            refresh_token=refresh,
            expires_in=self._settings.access_token_ttl_minutes * 60,
        )

    async def _create_session(
        self,
        user_id: uuid.UUID,
        workspace_id: uuid.UUID,
        device_info: Optional[dict[str, Any]] = None,
    ) -> uuid.UUID:
        """Create session record in DB and Redis using SessionService."""
        from app.services.session_service import SessionService
        
        session_service = SessionService(settings=self._settings)
        # Create session with placeholder token (will be updated after token generation)
        placeholder_token = "placeholder_" + str(uuid.uuid4())
        session = await session_service.create_session(
            user_id=user_id,
            workspace_id=workspace_id,
            refresh_token=placeholder_token,
            device_info=device_info,
        )
        return session.session_id

    async def _store_refresh_token(self, session_id: uuid.UUID, refresh_token: str) -> None:
        """Store refresh token hash in Redis for validation/rotation."""
        redis = await get_redis_client()
        token_hash = _hash_refresh_token(refresh_token)
        ttl = self._settings.refresh_token_ttl_days * 86400
        await redis.setex(f"session:{session_id}:refresh_hash", ttl, token_hash)

        # Also update DB hash
        pool = await get_postgres_pool()
        await pool.execute(
            "UPDATE sessions SET refresh_token_hash = $1, last_used_at = NOW() WHERE session_id = $2",
            token_hash,
            session_id,
        )

    async def _revoke_session(self, session_id: uuid.UUID) -> None:
        """Revoke session in both Redis and DB."""
        redis = await get_redis_client()
        await redis.delete(f"session:{session_id}:refresh_hash")

        pool = await get_postgres_pool()
        await pool.execute(
            "UPDATE sessions SET revoked_at = NOW() WHERE session_id = $1",
            session_id,
        )
