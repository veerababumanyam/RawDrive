"""Password reset service.

Handles password reset token generation, validation, and password update.

Requirements: MAIL-06, MAIL-08
"""

from __future__ import annotations

import hashlib
import html
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from app.config.settings import get_settings
from app.db.postgres import get_postgres_pool
from app.db.redis import get_redis_client
from app.services.email_verification_service import (
    TokenExpiredError,
    TokenInvalidError,
    TokenAlreadyUsedError,
)
from app.services import email_service as email_service_module
from app.utils.security import hash_password

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TOKEN_TTL_HOURS = 1
TOKEN_LENGTH = 64
RESEND_COOLDOWN_SECONDS = 60


def _hash_token(token: str) -> str:
    """SHA-256 hash of token for storage."""
    return hashlib.sha256(token.encode()).hexdigest()


def _cooldown_key(email: str) -> str:
    """Redis key for password reset cooldown."""
    email_hash = hashlib.sha256(email.lower().encode()).hexdigest()[:16]
    return f"password_reset_cooldown:{email_hash}"


class PasswordResetService:
    """Manages password reset tokens and password updates."""

    async def request_password_reset(self, email: str) -> str | None:
        """Generate password reset token and send email.

        Args:
            email: User email address (case-insensitive lookup)

        Returns:
            Raw token string if user found, None if not found.
            Never raises for missing users (prevents enumeration).
        """
        pool = await get_postgres_pool()
        redis = await get_redis_client()
        settings = get_settings()

        # Look up user by email (case-insensitive)
        row = await pool.fetchrow(
            "SELECT user_id, email, display_name FROM users WHERE LOWER(email) = LOWER($1)",
            email,
        )

        if row is None:
            return None

        user_id = row["user_id"]
        user_email = row["email"]
        display_name = row["display_name"]

        # Check cooldown
        cooldown_ttl = await redis.ttl(_cooldown_key(user_email))
        if cooldown_ttl > 0:
            logger.info(
                "Password reset cooldown active",
                extra={"email_hash": hashlib.sha256(user_email.lower().encode()).hexdigest()[:16]},
            )
            # Return None silently to prevent enumeration via timing
            return None

        # Invalidate any existing pending reset tokens for this user
        await pool.execute(
            """
            UPDATE email_verification_tokens
            SET used_at = NOW()
            WHERE user_id = $1
              AND used_at IS NULL
              AND token_hash IN (
                SELECT token_hash FROM email_verification_tokens
                WHERE user_id = $1 AND used_at IS NULL
              )
            """,
            user_id,
        )

        # Generate new token
        raw_token = secrets.token_urlsafe(TOKEN_LENGTH)
        token_hash = _hash_token(raw_token)
        token_id = uuid.uuid4()
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(hours=TOKEN_TTL_HOURS)

        # Store in PostgreSQL (reuse email_verification_tokens table)
        await pool.execute(
            """
            INSERT INTO email_verification_tokens (token_id, user_id, email, token_hash, created_at, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            """,
            token_id,
            user_id,
            user_email,
            token_hash,
            now,
            expires_at,
        )

        # Set cooldown
        await redis.setex(
            _cooldown_key(user_email),
            RESEND_COOLDOWN_SECONDS,
            "1",
        )

        # Build reset URL and send email
        reset_url = f"{settings.public_url}/reset-password?token={raw_token}"
        safe_name = html.escape(display_name) if display_name else None

        try:
            await email_service_module.send_password_reset_email(
                to_email=user_email,
                reset_url=reset_url,
                user_name=safe_name,
            )
        except Exception as email_err:
            logger.warning(
                "Failed to send password reset email",
                extra={"user_id": str(user_id), "error": str(email_err)},
            )

        logger.info(
            "Password reset token generated",
            extra={
                "user_id": str(user_id),
                "token_id": str(token_id),
            },
        )

        return raw_token

    async def validate_reset_token(self, token: str) -> uuid.UUID:
        """Validate a password reset token.

        Args:
            token: Raw reset token

        Returns:
            User ID associated with the token

        Raises:
            TokenInvalidError: Token doesn't exist
            TokenExpiredError: Token has expired
            TokenAlreadyUsedError: Token was already used
        """
        pool = await get_postgres_pool()

        token_hash = _hash_token(token)

        row = await pool.fetchrow(
            """
            SELECT token_id, user_id, email, expires_at, used_at
            FROM email_verification_tokens
            WHERE token_hash = $1
            """,
            token_hash,
        )

        if row is None:
            raise TokenInvalidError()

        if row["used_at"] is not None:
            raise TokenAlreadyUsedError()

        if row["expires_at"] < datetime.now(timezone.utc):
            raise TokenExpiredError()

        return row["user_id"]

    async def reset_password(self, token: str, new_password: str) -> uuid.UUID:
        """Validate token and update user password.

        Args:
            token: Raw reset token
            new_password: New password to set

        Returns:
            User ID whose password was reset

        Raises:
            TokenInvalidError: Token doesn't exist
            TokenExpiredError: Token has expired
            TokenAlreadyUsedError: Token was already used
        """
        pool = await get_postgres_pool()
        settings = get_settings()

        # Validate token first
        token_hash = _hash_token(token)

        row = await pool.fetchrow(
            """
            SELECT token_id, user_id, email, expires_at, used_at
            FROM email_verification_tokens
            WHERE token_hash = $1
            """,
            token_hash,
        )

        if row is None:
            raise TokenInvalidError()

        if row["used_at"] is not None:
            raise TokenAlreadyUsedError()

        if row["expires_at"] < datetime.now(timezone.utc):
            raise TokenExpiredError()

        user_id = row["user_id"]

        # Hash new password
        new_hash = hash_password(new_password, settings)

        # Update password in user_identities table
        await pool.execute(
            """
            UPDATE user_identities
            SET password_hash = $1
            WHERE user_id = $2 AND provider = 'local'
            """,
            new_hash,
            user_id,
        )

        # Mark token as used
        await pool.execute(
            "UPDATE email_verification_tokens SET used_at = NOW() WHERE token_id = $1",
            row["token_id"],
        )

        logger.info(
            "Password reset completed",
            extra={"user_id": str(user_id)},
        )

        return user_id
