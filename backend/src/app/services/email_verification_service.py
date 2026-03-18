"""Email verification service.

Handles email verification tokens and state management.

Requirements: 22.1, 22.2, 22.3, 22.4, 22.5
Property 17: Email Verification State
"""

from __future__ import annotations

import hashlib
import logging
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from app.db.postgres import get_postgres_pool
from app.db.redis import get_redis_client

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class EmailVerificationError(Exception):
    """Base email verification error."""

    def __init__(self, message: str, code: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


class TokenExpiredError(EmailVerificationError):
    """Verification token has expired."""

    def __init__(self) -> None:
        super().__init__(
            "Email verification token has expired",
            "TOKEN_EXPIRED",
            410,
        )


class TokenInvalidError(EmailVerificationError):
    """Verification token is invalid."""

    def __init__(self) -> None:
        super().__init__(
            "Invalid email verification token",
            "TOKEN_INVALID",
            400,
        )


class TokenAlreadyUsedError(EmailVerificationError):
    """Token has already been used."""

    def __init__(self) -> None:
        super().__init__(
            "Email verification token has already been used",
            "TOKEN_ALREADY_USED",
            409,
        )


class EmailAlreadyVerifiedError(EmailVerificationError):
    """Email is already verified."""

    def __init__(self) -> None:
        super().__init__(
            "Email address is already verified",
            "EMAIL_ALREADY_VERIFIED",
            409,
        )


class ResendCooldownError(EmailVerificationError):
    """Resend is on cooldown."""

    def __init__(self, wait_seconds: int) -> None:
        super().__init__(
            f"Please wait {wait_seconds} seconds before requesting another verification email",
            "RESEND_COOLDOWN",
            429,
        )
        self.wait_seconds = wait_seconds


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class VerificationToken:
    """Email verification token data."""

    token_id: uuid.UUID
    user_id: uuid.UUID
    email: str
    token_hash: str
    created_at: datetime
    expires_at: datetime
    used_at: datetime | None = None


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TOKEN_TTL_HOURS = 24
RESEND_COOLDOWN_SECONDS = 60
TOKEN_LENGTH = 64


def _hash_token(token: str) -> str:
    """SHA-256 hash of token for storage."""
    return hashlib.sha256(token.encode()).hexdigest()


def _redis_key(user_id: uuid.UUID) -> str:
    """Redis key for verification token lookup."""
    return f"email_verification:{user_id}"


def _cooldown_key(user_id: uuid.UUID) -> str:
    """Redis key for resend cooldown."""
    return f"email_verification_cooldown:{user_id}"


class EmailVerificationService:
    """Manages email verification tokens and state."""

    async def send_verification_email(
        self,
        user_id: uuid.UUID,
        email: str,
        force: bool = False,
    ) -> str:
        """Generate verification token and queue email.

        Args:
            user_id: User to verify
            email: Email address to verify
            force: Skip cooldown check

        Returns:
            The raw token (for testing/dev only)

        Raises:
            EmailAlreadyVerifiedError: If email is already verified
            ResendCooldownError: If resend is on cooldown
        """
        pool = await get_postgres_pool()
        redis = await get_redis_client()

        # Check if email already verified
        row = await pool.fetchrow(
            "SELECT email_verified FROM users WHERE user_id = $1",
            user_id,
        )
        if row and row["email_verified"]:
            raise EmailAlreadyVerifiedError()

        # Check cooldown (unless forced)
        if not force:
            cooldown_ttl = await redis.ttl(_cooldown_key(user_id))
            if cooldown_ttl > 0:
                raise ResendCooldownError(cooldown_ttl)

        # Invalidate any existing tokens
        await pool.execute(
            "DELETE FROM email_verification_tokens WHERE user_id = $1",
            user_id,
        )
        await redis.delete(_redis_key(user_id))

        # Generate new token
        raw_token = secrets.token_urlsafe(TOKEN_LENGTH)
        token_hash = _hash_token(raw_token)
        token_id = uuid.uuid4()
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(hours=TOKEN_TTL_HOURS)

        # Store in PostgreSQL
        await pool.execute(
            """
            INSERT INTO email_verification_tokens (token_id, user_id, email, token_hash, created_at, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            """,
            token_id,
            user_id,
            email,
            token_hash,
            now,
            expires_at,
        )

        # Store token hash in Redis for quick lookup
        await redis.setex(
            _redis_key(user_id),
            int((expires_at - now).total_seconds()),
            token_hash,
        )

        # Set cooldown
        await redis.setex(
            _cooldown_key(user_id),
            RESEND_COOLDOWN_SECONDS,
            "1",
        )

        # Email sending is handled by the caller (auth endpoint) after receiving
        # the raw_token back. This keeps the service focused on token management.
        logger.info(
            "Email verification token generated",
            extra={
                "user_id": str(user_id),
                "email": email,
                "token_id": str(token_id),
            },
        )

        return raw_token

    async def verify_email(self, token: str) -> uuid.UUID:
        """Verify email using token.

        Args:
            token: Raw verification token

        Returns:
            User ID that was verified

        Raises:
            TokenInvalidError: If token doesn't exist
            TokenExpiredError: If token has expired
            TokenAlreadyUsedError: If token was already used
        """
        pool = await get_postgres_pool()
        redis = await get_redis_client()

        token_hash = _hash_token(token)

        # Find token
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

        # Mark token as used
        await pool.execute(
            "UPDATE email_verification_tokens SET used_at = NOW() WHERE token_id = $1",
            row["token_id"],
        )

        # Mark email as verified
        await pool.execute(
            "UPDATE users SET email_verified = TRUE, updated_at = NOW() WHERE user_id = $1",
            user_id,
        )

        # Clean up Redis
        await redis.delete(_redis_key(user_id))

        logger.info(
            "Email verified",
            extra={"user_id": str(user_id), "email": row["email"]},
        )

        return user_id

    async def resend_verification(
        self,
        user_id: uuid.UUID,
    ) -> str:
        """Resend verification email with new token.

        Args:
            user_id: User to resend verification to

        Returns:
            New raw token

        Raises:
            EmailAlreadyVerifiedError: If already verified
            ResendCooldownError: If on cooldown
        """
        pool = await get_postgres_pool()

        # Get user email
        row = await pool.fetchrow(
            "SELECT email, email_verified FROM users WHERE user_id = $1",
            user_id,
        )

        if row is None:
            raise TokenInvalidError()

        if row["email_verified"]:
            raise EmailAlreadyVerifiedError()

        return await self.send_verification_email(user_id, row["email"])

    async def get_pending_verification(
        self,
        user_id: uuid.UUID,
    ) -> VerificationToken | None:
        """Get pending verification token info (without exposing token)."""
        pool = await get_postgres_pool()

        row = await pool.fetchrow(
            """
            SELECT token_id, user_id, email, token_hash, created_at, expires_at, used_at
            FROM email_verification_tokens
            WHERE user_id = $1 AND used_at IS NULL AND expires_at > NOW()
            ORDER BY created_at DESC
            LIMIT 1
            """,
            user_id,
        )

        if row is None:
            return None

        return VerificationToken(
            token_id=row["token_id"],
            user_id=row["user_id"],
            email=row["email"],
            token_hash=row["token_hash"],
            created_at=row["created_at"],
            expires_at=row["expires_at"],
            used_at=row["used_at"],
        )

    async def cleanup_expired_tokens(self) -> int:
        """Remove expired tokens. Run as background job."""
        pool = await get_postgres_pool()

        result = await pool.execute(
            "DELETE FROM email_verification_tokens WHERE expires_at < NOW()"
        )

        count = int(result.split()[-1])
        if count > 0:
            logger.info("Cleaned up expired email verification tokens", extra={"count": count})

        return count


# ---------------------------------------------------------------------------
# Background job helper
# ---------------------------------------------------------------------------


async def cleanup_verification_tokens_job() -> int:
    """Background job to clean up expired tokens."""
    service = EmailVerificationService()
    return await service.cleanup_expired_tokens()
