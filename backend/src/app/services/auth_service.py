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

import logging
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Sequence, Optional

import asyncpg

from app.config.settings import AppSettings, get_settings
from app.db.postgres import get_postgres_pool
from app.db.redis import get_redis_client
from app.utils.crypto import hash_token as _hash_refresh_token
from app.utils.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    extract_permissions,
    hash_password,
    verify_password,
)
from app.services.rbac_service import WORKSPACE_PERMISSIONS, WILDCARD_SUFFIX

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


class EmailAlreadyInUseError(AuthError):
    """Email address is already registered to another account."""

    def __init__(self) -> None:
        super().__init__("Email address is already in use", "AUTH_EMAIL_IN_USE", 409)


class PasswordIncorrectError(AuthError):
    """Password verification failed."""

    def __init__(self) -> None:
        super().__init__("Current password is incorrect", "AUTH_PASSWORD_INCORRECT", 403)


class EmailChangePendingError(AuthError):
    """Email change already pending verification."""

    def __init__(self, email: str) -> None:
        super().__init__(
            f"Email change to {email} is already pending verification",
            "AUTH_EMAIL_CHANGE_PENDING",
            409,
        )


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


def _generate_token_bytes(length: int = 32) -> str:
    """Generate URL-safe random token."""
    return secrets.token_urlsafe(length)


def _expand_wildcards(permissions: list[str]) -> list[str]:
    """Expand wildcard permissions to include all sub-permissions.

    For example, 'billing:*' expands to include 'billing:read', 'billing:write'.
    """
    expanded = set(permissions)

    for perm in permissions:
        if perm.endswith(WILDCARD_SUFFIX):
            prefix = perm[: -len(WILDCARD_SUFFIX)]
            # Add all permissions that start with this prefix
            for p in WORKSPACE_PERMISSIONS:
                if p.startswith(prefix):
                    expanded.add(p)

    return list(expanded)


async def _get_user_permissions(
    pool: asyncpg.Pool,
    user_id: uuid.UUID,
    workspace_id: uuid.UUID,
) -> list[str]:
    """Compute effective permissions for user in workspace (union of all roles).

    Wildcards (e.g., 'billing:*') are expanded to include all matching permissions.
    """
    query = """
        SELECT r.permissions
        FROM member_roles mr
        JOIN roles r ON r.role_id = mr.role_id
        JOIN workspace_memberships wm ON wm.membership_id = mr.membership_id
        WHERE wm.user_id = $1 AND wm.workspace_id = $2 AND wm.status = 'active'
    """
    rows = await pool.fetch(query, user_id, workspace_id)
    roles_perms: list[list[str]] = [row["permissions"] for row in rows]
    permissions = extract_permissions(roles_perms)
    return _expand_wildcards(permissions)


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
                    ["workspace:*", "members:*", "roles:*", "galleries:*", "assets:*", "billing:*", "audit:read"],
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

                # Create trial subscription - ALWAYS required for workspace to be accessible
                trial_end = now + timedelta(days=30)

                # Try to get free plan first, fall back to starter
                default_plan = await conn.fetchrow(
                    "SELECT plan_id FROM plans WHERE code = 'free' LIMIT 1"
                )
                if not default_plan:
                    logger.warning("Free plan not found during signup, falling back to starter")
                    default_plan = await conn.fetchrow(
                        "SELECT plan_id FROM plans WHERE code = 'starter' LIMIT 1"
                    )

                if not default_plan:
                    raise RuntimeError(
                        "No default plan available for signup. "
                        "Run migrations 0094 (subscription plans) and 0118 (free plan) first."
                    )

                # Create subscription (REQUIRED - without this, workspace is inaccessible)
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
                    default_plan["plan_id"],
                    now,
                    trial_end,
                )

        # Build tokens with pre-generated session ID
        session_id = uuid.uuid4()

        permissions = await _get_user_permissions(pool, user_id, workspace_id)
        if not permissions:
            permissions = ["workspace:*"]

        token_pair = self._issue_tokens(
            user_id,
            workspace_id,
            permissions,
            session_id=session_id,
        )

        # Create session with real refresh token (atomic operation)
        await self._create_session_with_id(
            session_id=session_id,
            user_id=user_id,
            workspace_id=workspace_id,
            refresh_token=token_pair.refresh_token,
            device_info=None,
            device_fingerprint=None,
            ip_address=None,
            user_agent=None,
            remember_me=False,
        )

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
        remember_me: bool = False,
        device_fingerprint: Optional[str] = None,
        device_info: Optional[dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> tuple[AuthUser, TokenPair]:
        """Authenticate user with email/password.

        Property 5 (Authentication Error Opacity): Always returns same error
        whether email or password is wrong.

        Args:
            email: User email
            password: User password
            workspace_id: Optional workspace ID
            remember_me: If True, extends refresh token TTL to 30 days
            device_fingerprint: SHA256 device fingerprint for tracking
            device_info: Device metadata (browser, OS, etc.)
            ip_address: Client IP address
            user_agent: Client User-Agent header

        Returns:
            Tuple of (AuthUser, TokenPair)
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

        # Step 1: Pre-generate session ID
        session_id = uuid.uuid4()

        # Step 2: Issue tokens with appropriate TTL based on remember_me
        token_pair = self._issue_tokens(
            user_id,
            workspace_id,
            permissions,
            session_id=session_id,
            remember_me=remember_me,
        )

        # Step 3: Create session with real refresh token (atomic operation)
        await self._create_session_with_id(
            session_id=session_id,
            user_id=user_id,
            workspace_id=workspace_id,
            refresh_token=token_pair.refresh_token,
            device_info=device_info,
            device_fingerprint=device_fingerprint,
            ip_address=ip_address,
            user_agent=user_agent,
            remember_me=remember_me,
        )

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

        Uses SessionService as single source of truth for session data and refresh token hash.
        """
        try:
            payload = decode_token(refresh_token, settings=self._settings)
        except Exception as e:
            logger.warning(
                "Token refresh failed: JWT decode error",
                extra={"error_type": type(e).__name__, "error_message": str(e)},
            )
            raise TokenInvalidError()

        if payload.get("token_type") != "refresh":
            raise TokenInvalidError()

        user_id = uuid.UUID(payload["user_id"])
        workspace_id_str = payload.get("workspace_id")
        session_id_str = payload.get("session_id")

        if not session_id_str:
            raise TokenInvalidError("Refresh token missing session_id claim")

        session_id = uuid.UUID(session_id_str)

        # Fetch session from SessionService (single source of truth)
        from app.services.session_service import SessionService

        session_service = SessionService(settings=self._settings)
        session = await session_service.get_session(session_id)

        if session is None:
            logger.warning(
                "Token refresh failed: session not found or expired",
                extra={"session_id": str(session_id), "user_id": str(user_id)},
            )
            raise SessionRevokedError()

        # Validate refresh token hash
        current_hash = _hash_refresh_token(refresh_token)
        if session.refresh_token_hash != current_hash:
            logger.warning(
                "Token refresh failed: token hash mismatch (possible reuse attack)",
                extra={
                    "session_id": str(session_id),
                    "user_id": str(user_id),
                    "expected_hash_prefix": session.refresh_token_hash[:16],
                    "provided_hash_prefix": current_hash[:16],
                },
            )
            await session_service.invalidate_session(session_id)
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

        # Rotate: update session with new refresh token hash
        await session_service.update_session_token(session_id, new_pair.refresh_token)

        logger.info(
            "Token refreshed successfully",
            extra={
                "user_id": str(user_id),
                "session_id": str(session_id),
                "workspace_id": str(workspace_id),
            }
        )
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
        remember_me: bool = False,
    ) -> TokenPair:
        """Create access and refresh tokens.

        Args:
            user_id: User ID
            workspace_id: Workspace ID
            permissions: User permissions
            session_id: Session ID for tracking
            remember_me: If True, extends refresh token TTL to 30 days (vs default 7 days)

        Returns:
            TokenPair with access and refresh tokens
        """
        access = create_access_token(
            user_id=user_id,
            workspace_id=workspace_id,
            permissions=permissions,
            session_id=session_id,
            settings=self._settings,
        )

        # Determine refresh token TTL based on remember_me flag
        refresh_ttl_days = (
            self._settings.extended_refresh_token_ttl_days
            if remember_me
            else self._settings.refresh_token_ttl_days
        )

        refresh = create_refresh_token(
            user_id=user_id,
            workspace_id=workspace_id,
            session_id=session_id,
            ttl_days=refresh_ttl_days,
            settings=self._settings,
        )
        return TokenPair(
            access_token=access,
            refresh_token=refresh,
            expires_in=self._settings.access_token_ttl_minutes * 60,
        )

    async def _create_session_with_id(
        self,
        session_id: uuid.UUID,
        user_id: uuid.UUID,
        workspace_id: Optional[uuid.UUID],
        refresh_token: str,
        device_info: Optional[dict[str, Any]] = None,
        device_fingerprint: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        remember_me: bool = False,
    ) -> uuid.UUID:
        """Create session with pre-generated ID and real refresh token.

        This is the new atomic way to create sessions - session_id is pre-generated
        before token generation, and the real refresh token is stored immediately.
        This eliminates the race condition from the old placeholder pattern.

        Args:
            session_id: Pre-generated session ID from caller
            user_id: User ID
            workspace_id: Optional workspace ID
            refresh_token: Real refresh token (not placeholder)
            device_info: Device metadata
            device_fingerprint: Device fingerprint
            ip_address: IP address
            user_agent: User agent
            remember_me: Whether to use extended TTL

        Returns:
            Session ID
        """
        from app.services.session_service import SessionService

        session_service = SessionService(settings=self._settings)

        # Calculate TTL based on remember_me
        ttl_seconds = (
            self._settings.extended_refresh_token_ttl_days * 86400
            if remember_me
            else self._settings.refresh_token_ttl_days * 86400
        )

        session = await session_service.create_session_with_id(
            session_id=session_id,
            user_id=user_id,
            workspace_id=workspace_id,
            refresh_token=refresh_token,
            device_info=device_info,
            device_fingerprint=device_fingerprint,
            ip_address=ip_address,
            user_agent=user_agent,
            ttl_seconds=ttl_seconds,
        )
        return session.session_id

    async def _revoke_session(self, session_id: uuid.UUID) -> None:
        """Revoke session using SessionService."""
        from app.services.session_service import SessionService

        session_service = SessionService(settings=self._settings)
        await session_service.invalidate_session(session_id)
        logger.info("Session revoked", extra={"session_id": str(session_id)})

    # -----------------------------------------------------------------------
    # Email Change
    # -----------------------------------------------------------------------

    async def request_email_change(
        self,
        user_id: uuid.UUID,
        new_email: str,
        current_password: str,
    ) -> str:
        """Request email address change.

        Flow:
        1. Verify current password
        2. Check new email not already in use
        3. Check no pending email change exists
        4. Generate verification token
        5. Store pending change in DB
        6. Send verification email (TODO: integrate with email service)

        Args:
            user_id: Current user's ID
            new_email: New email address
            current_password: Current password for verification

        Returns:
            Raw verification token (for testing)

        Raises:
            PasswordIncorrectError: If current password is wrong
            EmailAlreadyInUseError: If new email is already registered
            EmailChangePendingError: If there's already a pending change
        """
        pool = await get_postgres_pool()
        new_email_lower = new_email.lower().strip()

        # Get user and verify password
        row = await pool.fetchrow(
            """
            SELECT u.user_id, u.email, i.password_hash
            FROM users u
            JOIN user_identities i ON i.user_id = u.user_id AND i.provider = 'local'
            WHERE u.user_id = $1
            """,
            user_id,
        )

        if not row:
            raise PasswordIncorrectError()

        if not verify_password(current_password, row["password_hash"], self._settings):
            raise PasswordIncorrectError()

        # Check new email not already in use
        existing = await pool.fetchrow(
            "SELECT user_id FROM users WHERE email = $1",
            new_email_lower,
        )
        if existing:
            raise EmailAlreadyInUseError()

        # Check no pending email change
        pending = await pool.fetchrow(
            """
            SELECT new_email FROM pending_email_changes
            WHERE user_id = $1 AND verified_at IS NULL AND expires_at > NOW()
            """,
            user_id,
        )
        if pending:
            raise EmailChangePendingError(pending["new_email"])

        # Generate verification token
        raw_token = secrets.token_urlsafe(48)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        change_id = uuid.uuid4()
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(hours=24)

        # Store pending change
        await pool.execute(
            """
            INSERT INTO pending_email_changes (change_id, user_id, new_email, token_hash, created_at, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            """,
            change_id,
            user_id,
            new_email_lower,
            token_hash,
            now,
            expires_at,
        )

        logger.info(
            "Email change requested",
            extra={
                "user_id": str(user_id),
                "old_email": row["email"],
                "new_email": new_email_lower,
                "change_id": str(change_id),
            },
        )

        # TODO: Send verification email to new address
        # For now, return token (useful for testing)
        return raw_token

    async def verify_email_change(self, token: str) -> uuid.UUID:
        """Verify and complete email change.

        Args:
            token: Raw verification token

        Returns:
            User ID whose email was changed

        Raises:
            TokenInvalidError: If token is invalid or not found
            TokenExpiredError: If token has expired
        """
        pool = await get_postgres_pool()
        token_hash = hashlib.sha256(token.encode()).hexdigest()

        # Find pending change
        row = await pool.fetchrow(
            """
            SELECT change_id, user_id, new_email, expires_at, verified_at
            FROM pending_email_changes
            WHERE token_hash = $1
            """,
            token_hash,
        )

        if not row:
            raise TokenInvalidError()

        if row["verified_at"] is not None:
            raise TokenInvalidError()  # Already used

        if row["expires_at"] < datetime.now(timezone.utc):
            raise TokenExpiredError()

        user_id = row["user_id"]
        new_email = row["new_email"]

        async with pool.acquire() as conn:
            async with conn.transaction():
                # Update user email
                await conn.execute(
                    """
                    UPDATE users
                    SET email = $2, email_verified = TRUE, updated_at = NOW()
                    WHERE user_id = $1
                    """,
                    user_id,
                    new_email,
                )

                # Update identity email
                await conn.execute(
                    """
                    UPDATE user_identities
                    SET email = $2, email_verified = TRUE
                    WHERE user_id = $1 AND provider = 'local'
                    """,
                    user_id,
                    new_email,
                )

                # Mark change as verified
                await conn.execute(
                    """
                    UPDATE pending_email_changes
                    SET verified_at = NOW()
                    WHERE change_id = $1
                    """,
                    row["change_id"],
                )

        logger.info(
            "Email change completed",
            extra={"user_id": str(user_id), "new_email": new_email},
        )

        return user_id

    async def cancel_email_change(self, user_id: uuid.UUID) -> bool:
        """Cancel pending email change.

        Args:
            user_id: User whose pending change to cancel

        Returns:
            True if a pending change was cancelled
        """
        pool = await get_postgres_pool()

        result = await pool.execute(
            """
            DELETE FROM pending_email_changes
            WHERE user_id = $1 AND verified_at IS NULL
            """,
            user_id,
        )

        deleted = int(result.split()[-1]) > 0

        if deleted:
            logger.info(
                "Email change cancelled",
                extra={"user_id": str(user_id)},
            )

        return deleted

    async def change_password(
        self,
        user_id: uuid.UUID,
        current_password: str,
        new_password: str,
        invalidate_other_sessions: bool = True,
        current_session_id: Optional[uuid.UUID] = None,
    ) -> None:
        """Change user password with optional session invalidation.

        Args:
            user_id: User UUID
            current_password: Current password for verification
            new_password: New password to set
            invalidate_other_sessions: Whether to revoke other sessions
            current_session_id: Current session to keep active

        Raises:
            PasswordIncorrectError: If current password is wrong
        """
        pool = await get_postgres_pool()

        # Get current password hash
        row = await pool.fetchrow(
            """
            SELECT password_hash FROM user_identities
            WHERE user_id = $1 AND provider = 'local'
            """,
            user_id,
        )

        if not row:
            raise PasswordIncorrectError()

        # Verify current password
        if not verify_password(current_password, row["password_hash"], self._settings):
            raise PasswordIncorrectError()

        # Hash new password
        new_password_hash = hash_password(new_password, self._settings)

        async with pool.acquire() as conn:
            async with conn.transaction():
                # Update password hash
                await conn.execute(
                    """
                    UPDATE user_identities
                    SET password_hash = $2
                    WHERE user_id = $1 AND provider = 'local'
                    """,
                    user_id,
                    new_password_hash,
                )

                # Update last_password_changed_at in users table
                await conn.execute(
                    """
                    UPDATE users
                    SET last_password_changed_at = NOW(), updated_at = NOW()
                    WHERE user_id = $1
                    """,
                    user_id,
                )

                # Optionally invalidate other sessions
                if invalidate_other_sessions and current_session_id:
                    await conn.execute(
                        """
                        UPDATE sessions
                        SET revoked_at = NOW()
                        WHERE user_id = $1 AND session_id != $2 AND revoked_at IS NULL
                        """,
                        user_id,
                        current_session_id,
                    )

                    # Remove revoked refresh tokens from Redis
                    redis = await get_redis_client()
                    revoked_sessions = await conn.fetch(
                        """
                        SELECT session_id FROM sessions
                        WHERE user_id = $1 AND session_id != $2 AND revoked_at IS NOT NULL
                        """,
                        user_id,
                        current_session_id,
                    )

                    for session in revoked_sessions:
                        session_key = f"session:{session['session_id']}"
                        await redis.delete(session_key)

        logger.info(
            "Password changed",
            extra={
                "user_id": str(user_id),
                "other_sessions_invalidated": invalidate_other_sessions,
            },
        )
