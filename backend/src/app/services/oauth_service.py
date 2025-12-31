"""Google OAuth service for RawDrive.

Implements OAuth 2.0 authorization code flow with Google:
- Generate authorization URL with state
- Exchange code for tokens
- Fetch user info
- Create or link user account

Correctness Properties enforced:
- Property 14: OAuth Account Linking
"""

from __future__ import annotations

import json
import logging
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import httpx

from app.config.settings import AppSettings, get_settings
from app.db.postgres import get_postgres_pool
from app.db.redis import get_redis_client
from app.services.auth_service import AuthService, TokenPair, AuthUser, AuthError
from app.utils.security import extract_permissions

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"

SCOPES = ["openid", "email", "profile"]


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class OAuthError(AuthError):
    """OAuth-specific error."""

    def __init__(self, message: str, code: str = "OAUTH_ERROR", status: int = 400):
        super().__init__(message, code, status)


class OAuthStateMismatchError(OAuthError):
    """State parameter mismatch (CSRF protection)."""

    def __init__(self) -> None:
        super().__init__("Invalid state parameter", "OAUTH_STATE_MISMATCH", 400)


class OAuthCodeExchangeError(OAuthError):
    """Failed to exchange authorization code for tokens."""

    def __init__(self) -> None:
        super().__init__("Failed to exchange authorization code", "OAUTH_CODE_EXCHANGE_FAILED", 400)


class OAuthUserInfoError(OAuthError):
    """Failed to fetch user info from provider."""

    def __init__(self) -> None:
        super().__init__("Failed to fetch user information", "OAUTH_USERINFO_FAILED", 400)


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class GoogleUserInfo:
    """User info from Google OAuth."""

    sub: str  # Google user ID
    email: str
    email_verified: bool
    name: str
    picture: str | None = None


# ---------------------------------------------------------------------------
# GoogleOAuthService
# ---------------------------------------------------------------------------


class GoogleOAuthService:
    """Handles Google OAuth 2.0 flow."""

    def __init__(self, settings: AppSettings | None = None):
        self._settings = settings or get_settings()
        self._auth_service = AuthService(self._settings)

    def _validate_redirect_uri(self, redirect_uri: str | None) -> str | None:
        """Validate redirect_uri against allowed origins to prevent open redirect attacks.

        Security: Prevents attackers from using our OAuth flow to redirect users
        to malicious sites with valid tokens.

        Returns:
            Validated redirect_uri or None if invalid/not provided.
        """
        if not redirect_uri:
            return None

        # Parse the redirect URI to get the origin
        from urllib.parse import urlparse
        parsed = urlparse(redirect_uri)
        origin = f"{parsed.scheme}://{parsed.netloc}"

        # Check against allowed CORS origins (same trust boundary)
        allowed_origins = list(self._settings.allowed_cors_origins)

        # In production, also allow the public_url
        if self._settings.public_url:
            allowed_origins.append(self._settings.public_url)

        if origin not in allowed_origins:
            logger.warning(
                "Rejected OAuth redirect to untrusted origin",
                extra={"origin": origin, "redirect_uri": redirect_uri},
            )
            return None

        return redirect_uri

    async def get_authorization_url(self, frontend_redirect: str | None = None) -> tuple[str, str]:
        """Generate Google OAuth authorization URL with state parameter.

        Args:
            frontend_redirect: URL to redirect to after successful OAuth (frontend URL).
                             This is stored in Redis and used after callback, NOT sent to Google.

        Returns:
            Tuple of (authorization_url, state)
        """
        state = secrets.token_urlsafe(32)

        # Validate frontend redirect to prevent open redirect attacks
        validated_redirect = self._validate_redirect_uri(frontend_redirect)

        # Store state in Redis for validation (5 minute TTL)
        # Also store the validated frontend redirect URL if provided
        redis = await get_redis_client()
        state_data = {
            "status": "pending",
            "frontend_redirect": validated_redirect or "",
        }
        await redis.setex(f"oauth:state:{state}", 300, json.dumps(state_data))

        # Always use the backend callback URL for Google OAuth
        # This URL must be registered in Google Cloud Console
        params = {
            "client_id": self._settings.google_client_id,
            "redirect_uri": str(self._settings.google_redirect_uri),
            "response_type": "code",
            "scope": " ".join(SCOPES),
            "state": state,
            "access_type": "offline",
            "prompt": "consent",
        }

        url = f"{GOOGLE_AUTH_URL}?{urlencode(params)}"
        return url, state

    async def verify_state(self, state: str) -> tuple[bool, str]:
        """Verify state parameter matches stored value.

        Returns:
            Tuple of (is_valid, frontend_redirect_url)
        """
        redis = await get_redis_client()
        stored = await redis.get(f"oauth:state:{state}")

        if stored is None:
            return False, ""

        # Delete state after verification (one-time use)
        await redis.delete(f"oauth:state:{state}")

        # Parse the stored state data
        try:
            state_data = json.loads(stored)
            frontend_redirect = state_data.get("frontend_redirect", "")
        except (json.JSONDecodeError, TypeError):
            # Legacy format - just "pending" string
            frontend_redirect = ""

        return True, frontend_redirect

    async def exchange_code(
        self,
        code: str,
        redirect_uri: str | None = None,
    ) -> dict[str, Any]:
        """Exchange authorization code for tokens.

        Returns:
            Token response dict with access_token, refresh_token, etc.
        """
        data = {
            "client_id": self._settings.google_client_id,
            "client_secret": self._settings.google_client_secret.get_secret_value(),
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri or str(self._settings.google_redirect_uri),
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(GOOGLE_TOKEN_URL, data=data)

            if response.status_code != 200:
                logger.error(
                    "OAuth code exchange failed",
                    extra={"status": response.status_code, "body": response.text},
                )
                raise OAuthCodeExchangeError()

            return response.json()

    async def get_user_info(self, access_token: str) -> GoogleUserInfo:
        """Fetch user info from Google using access token."""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {access_token}"},
            )

            if response.status_code != 200:
                logger.error(
                    "OAuth userinfo fetch failed",
                    extra={"status": response.status_code},
                )
                raise OAuthUserInfoError()

            data = response.json()

            return GoogleUserInfo(
                sub=data["sub"],
                email=data["email"],
                email_verified=data.get("email_verified", False),
                name=data.get("name", data["email"].split("@")[0]),
                picture=data.get("picture"),
            )

    async def handle_callback(
        self,
        code: str,
        state: str,
    ) -> tuple[AuthUser, TokenPair, str]:
        """Handle OAuth callback: verify state, exchange code, create/link user.

        Property 14 (OAuth Account Linking): If email matches existing user,
        link Google identity to that user.

        Returns:
            Tuple of (AuthUser, TokenPair, frontend_redirect_url)
        """
        # Verify state and get frontend redirect URL
        is_valid, frontend_redirect = await self.verify_state(state)
        if not is_valid:
            raise OAuthStateMismatchError()

        # Exchange code for tokens (always use backend callback URL)
        token_response = await self.exchange_code(code)
        google_access_token = token_response["access_token"]

        # Get user info
        user_info = await self.get_user_info(google_access_token)

        pool = await get_postgres_pool()

        # Check for existing identity by Google sub
        existing_identity = await pool.fetchrow(
            """
            SELECT ui.user_id, u.email, u.display_name, u.email_verified
            FROM user_identities ui
            JOIN users u ON u.user_id = ui.user_id
            WHERE ui.provider = 'google' AND ui.provider_user_id = $1
            """,
            user_info.sub,
        )

        if existing_identity:
            # Existing Google identity - login
            user_id = existing_identity["user_id"]
            user, tokens = await self._login_existing_user(
                user_id=user_id,
                email=existing_identity["email"],
                display_name=existing_identity["display_name"],
                email_verified=existing_identity["email_verified"],
            )
            return user, tokens, frontend_redirect

        # Check for existing user by email (Property 14: Account Linking)
        existing_user = await pool.fetchrow(
            "SELECT user_id, email, display_name, email_verified FROM users WHERE email = $1",
            user_info.email.lower(),
        )

        if existing_user:
            # Link Google identity to existing user
            user_id = existing_user["user_id"]
            await self._link_google_identity(user_id, user_info)

            logger.info(
                "Linked Google identity to existing user",
                extra={"user_id": str(user_id), "google_sub": user_info.sub},
            )

            user, tokens = await self._login_existing_user(
                user_id=user_id,
                email=existing_user["email"],
                display_name=existing_user["display_name"],
                email_verified=True,  # Google-verified email
            )
            return user, tokens, frontend_redirect

        # New user - create account
        user, tokens = await self._create_new_user(user_info)
        return user, tokens, frontend_redirect

    async def _link_google_identity(
        self,
        user_id: uuid.UUID,
        user_info: GoogleUserInfo,
    ) -> None:
        """Link Google identity to existing user."""
        pool = await get_postgres_pool()
        now = datetime.now(timezone.utc)

        await pool.execute(
            """
            INSERT INTO user_identities (identity_id, user_id, provider, provider_user_id, email, email_verified, created_at)
            VALUES ($1, $2, 'google', $3, $4, $5, $6)
            ON CONFLICT (provider, provider_user_id) DO NOTHING
            """,
            uuid.uuid4(),
            user_id,
            user_info.sub,
            user_info.email.lower(),
            user_info.email_verified,
            now,
        )

        # If Google says email is verified, update user record
        if user_info.email_verified:
            await pool.execute(
                """
                UPDATE users SET email_verified = TRUE, email_verified_at = $1
                WHERE user_id = $2 AND email_verified = FALSE
                """,
                now,
                user_id,
            )

    async def _login_existing_user(
        self,
        user_id: uuid.UUID,
        email: str,
        display_name: str,
        email_verified: bool,
    ) -> tuple[AuthUser, TokenPair]:
        """Login flow for existing user with Google."""
        pool = await get_postgres_pool()

        # Get default workspace
        workspace_row = await pool.fetchrow(
            """
            SELECT wm.workspace_id
            FROM workspace_memberships wm
            JOIN workspaces w ON w.workspace_id = wm.workspace_id
            WHERE wm.user_id = $1 AND wm.status = 'active' AND w.status = 'active'
            ORDER BY wm.created_at ASC
            LIMIT 1
            """,
            user_id,
        )

        if workspace_row is None:
            raise AuthError("User has no active workspace", "AUTH_NO_WORKSPACE", 403)

        workspace_id = workspace_row["workspace_id"]

        # Get permissions
        permissions = await self._get_user_permissions(pool, user_id, workspace_id)
        if not permissions:
            permissions = ["workspace:read"]

        # Create session
        session_id = await self._auth_service._create_session(user_id, workspace_id)

        # Issue tokens
        token_pair = self._auth_service._issue_tokens(
            user_id, workspace_id, permissions, session_id=session_id
        )

        # Store refresh token
        await self._auth_service._store_refresh_token(session_id, token_pair.refresh_token)

        auth_user = AuthUser(
            user_id=user_id,
            email=email,
            display_name=display_name,
            email_verified=email_verified,
            workspace_id=workspace_id,
        )

        logger.info("Google OAuth login", extra={"user_id": str(user_id)})
        return auth_user, token_pair

    async def _create_new_user(
        self,
        user_info: GoogleUserInfo,
    ) -> tuple[AuthUser, TokenPair]:
        """Create new user from Google OAuth."""
        pool = await get_postgres_pool()

        user_id = uuid.uuid4()
        identity_id = uuid.uuid4()
        workspace_id = uuid.uuid4()
        membership_id = uuid.uuid4()
        role_id = uuid.uuid4()
        now = datetime.now(timezone.utc)
        workspace_slug = f"ws-{secrets.token_hex(6)}"

        async with pool.acquire() as conn:
            async with conn.transaction():
                # Create user (email already verified by Google)
                await conn.execute(
                    """
                    INSERT INTO users (user_id, email, display_name, email_verified, email_verified_at, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $5, $5)
                    """,
                    user_id,
                    user_info.email.lower(),
                    user_info.name,
                    user_info.email_verified,
                    now if user_info.email_verified else None,
                )

                # Create Google identity
                await conn.execute(
                    """
                    INSERT INTO user_identities (identity_id, user_id, provider, provider_user_id, email, email_verified, created_at)
                    VALUES ($1, $2, 'google', $3, $4, $5, $6)
                    """,
                    identity_id,
                    user_id,
                    user_info.sub,
                    user_info.email.lower(),
                    user_info.email_verified,
                    now,
                )

                # Create workspace
                await conn.execute(
                    """
                    INSERT INTO workspaces (workspace_id, name, slug, status, created_at, updated_at)
                    VALUES ($1, $2, $3, 'active', $4, $4)
                    """,
                    workspace_id,
                    f"{user_info.name}'s Workspace",
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

                # Create owner role
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

                # Assign owner role
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

        # Create session and issue tokens
        session_id = await self._auth_service._create_session(user_id, workspace_id)

        permissions = ["workspace:*", "members:*", "roles:*", "galleries:*", "assets:*", "billing:*", "audit:read"]
        token_pair = self._auth_service._issue_tokens(
            user_id, workspace_id, permissions, session_id=session_id
        )

        await self._auth_service._store_refresh_token(session_id, token_pair.refresh_token)

        auth_user = AuthUser(
            user_id=user_id,
            email=user_info.email.lower(),
            display_name=user_info.name,
            email_verified=user_info.email_verified,
            workspace_id=workspace_id,
        )

        logger.info("New user created via Google OAuth", extra={"user_id": str(user_id)})
        return auth_user, token_pair

    async def _get_user_permissions(
        self,
        pool: Any,
        user_id: uuid.UUID,
        workspace_id: uuid.UUID,
    ) -> list[str]:
        """Get user permissions in workspace."""
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
