"""Gallery Password Reset Service for client access recovery.

Implements secure token-based password reset flow for gallery access,
with rate limiting and email notification via notifications-service.

Feature: 027-gallery-feature-completion
User Story: US9 - Gallery Password Reset
"""

from __future__ import annotations

import logging
import secrets
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from typing import Optional
from uuid import UUID

from passlib.context import CryptContext
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.redis import get_redis_client
from app.metrics.registry import (
    password_reset_requests_total,
    password_reset_completions_total,
)

logger = logging.getLogger(__name__)

# Bcrypt context for token hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=10)

# Configuration
TOKEN_EXPIRY_HOURS = 1
RATE_LIMIT_REQUESTS = 3
RATE_LIMIT_WINDOW_SECONDS = 3600  # 1 hour


@dataclass
class PasswordResetResult:
    """Result of password reset operation."""

    success: bool
    error_message: Optional[str] = None
    reset_url: Optional[str] = None
    expires_at: Optional[datetime] = None


@dataclass
class TokenVerificationResult:
    """Result of token verification."""

    valid: bool
    gallery_id: Optional[UUID] = None
    email: Optional[str] = None
    error_message: Optional[str] = None


def _rate_limit_key(gallery_id: UUID, email: str) -> str:
    """Generate Redis key for rate limiting password reset requests."""
    email_hash = secrets.token_hex(8)  # Anonymize email in key
    return f"password_reset_rate:{gallery_id}:{email.lower()}"


class GalleryPasswordResetService:
    """Service for managing gallery password reset requests."""

    def __init__(self, db: AsyncSession):
        self.db = db

    def _generate_reset_token(self) -> tuple[str, str]:
        """Generate a secure reset token and its hash.

        Returns:
            Tuple of (plain_token, hashed_token)
        """
        token = secrets.token_urlsafe(32)
        token_hash = pwd_context.hash(token)
        return token, token_hash

    async def _check_rate_limit(self, gallery_id: UUID, email: str) -> bool:
        """Check if password reset request is allowed (rate limiting).

        Returns:
            True if request is allowed, False if rate limited
        """
        rate_key = _rate_limit_key(gallery_id, email)

        try:
            redis = await get_redis_client()
        except RuntimeError:
            # Allow request if Redis unavailable
            return True

        current = await redis.get(rate_key)
        if current is not None and int(current) >= RATE_LIMIT_REQUESTS:
            return False

        return True

    async def _increment_rate_limit(self, gallery_id: UUID, email: str) -> None:
        """Increment rate limit counter for password reset requests."""
        rate_key = _rate_limit_key(gallery_id, email)

        try:
            redis = await get_redis_client()
            pipe = redis.pipeline()
            pipe.incr(rate_key)
            pipe.expire(rate_key, RATE_LIMIT_WINDOW_SECONDS)
            await pipe.execute()
        except RuntimeError:
            pass  # Ignore if Redis unavailable

    async def request_password_reset(
        self,
        gallery_id: UUID,
        email: str,
        base_url: str = "https://gallery.rawdrive.in",
    ) -> PasswordResetResult:
        """Request a password reset for gallery access.

        Creates a reset token and stores it in the database.
        The caller is responsible for sending the email.

        Args:
            gallery_id: Gallery UUID
            email: Email address of the requester
            base_url: Base URL for reset link

        Returns:
            PasswordResetResult with token info or error
        """
        email = email.lower().strip()

        # Check rate limit
        if not await self._check_rate_limit(gallery_id, email):
            password_reset_requests_total.labels(result="rate_limited").inc()
            logger.warning(
                "Password reset rate limited",
                extra={"gallery_id": str(gallery_id), "email": email},
            )
            return PasswordResetResult(
                success=False,
                error_message="Too many reset requests. Please try again later.",
            )

        # Verify gallery exists and is password-protected
        gallery_check = await self.db.execute(
            text(
                """
                SELECT gallery_id, title, password_hash, workspace_id
                FROM galleries
                WHERE gallery_id = :gallery_id
                """
            ),
            {"gallery_id": gallery_id},
        )
        gallery = gallery_check.fetchone()

        if not gallery:
            logger.warning(
                "Password reset requested for non-existent gallery",
                extra={"gallery_id": str(gallery_id)},
            )
            # Return success to prevent enumeration attacks
            return PasswordResetResult(
                success=True,
                error_message=None,
            )

        if not gallery.password_hash:
            logger.warning(
                "Password reset requested for non-password-protected gallery",
                extra={"gallery_id": str(gallery_id)},
            )
            return PasswordResetResult(
                success=False,
                error_message="This gallery does not require a password.",
            )

        # Generate reset token
        plain_token, token_hash = self._generate_reset_token()
        expires_at = datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRY_HOURS)

        # Store reset token in database
        await self.db.execute(
            text(
                """
                INSERT INTO gallery_password_resets (gallery_id, email, token_hash, expires_at)
                VALUES (:gallery_id, :email, :token_hash, :expires_at)
                """
            ),
            {
                "gallery_id": gallery_id,
                "email": email,
                "token_hash": token_hash,
                "expires_at": expires_at,
            },
        )
        await self.db.commit()

        # Increment rate limit
        await self._increment_rate_limit(gallery_id, email)

        # Generate reset URL
        reset_url = f"{base_url}/g/{gallery_id}/reset?token={plain_token}"

        # Record success metric
        password_reset_requests_total.labels(result="sent").inc()

        logger.info(
            "Password reset token created",
            extra={
                "gallery_id": str(gallery_id),
                "email": email,
                "expires_at": expires_at.isoformat(),
            },
        )

        return PasswordResetResult(
            success=True,
            reset_url=reset_url,
            expires_at=expires_at,
        )

    async def verify_reset_token(
        self,
        gallery_id: UUID,
        token: str,
    ) -> TokenVerificationResult:
        """Verify a password reset token.

        Args:
            gallery_id: Gallery UUID
            token: Plain text reset token

        Returns:
            TokenVerificationResult with validity status
        """
        # Get all unexpired, unused tokens for this gallery
        result = await self.db.execute(
            text(
                """
                SELECT reset_id, email, token_hash, expires_at
                FROM gallery_password_resets
                WHERE gallery_id = :gallery_id
                  AND used_at IS NULL
                  AND expires_at > :now
                ORDER BY created_at DESC
                LIMIT 10
                """
            ),
            {
                "gallery_id": gallery_id,
                "now": datetime.now(timezone.utc),
            },
        )
        tokens = result.fetchall()

        if not tokens:
            password_reset_completions_total.labels(result="invalid_token").inc()
            logger.warning(
                "No valid reset tokens found",
                extra={"gallery_id": str(gallery_id)},
            )
            return TokenVerificationResult(
                valid=False,
                error_message="Invalid or expired reset link.",
            )

        # Check each token (usually just one)
        for token_row in tokens:
            try:
                if pwd_context.verify(token, token_row.token_hash):
                    # Mark token as used
                    await self.db.execute(
                        text(
                            """
                            UPDATE gallery_password_resets
                            SET used_at = :now
                            WHERE reset_id = :reset_id
                            """
                        ),
                        {
                            "reset_id": token_row.reset_id,
                            "now": datetime.now(timezone.utc),
                        },
                    )
                    await self.db.commit()

                    password_reset_completions_total.labels(result="success").inc()

                    logger.info(
                        "Password reset token verified",
                        extra={
                            "gallery_id": str(gallery_id),
                            "email": token_row.email,
                        },
                    )

                    return TokenVerificationResult(
                        valid=True,
                        gallery_id=gallery_id,
                        email=token_row.email,
                    )
            except Exception:
                # Token doesn't match, try next
                continue

        password_reset_completions_total.labels(result="invalid_token").inc()

        logger.warning(
            "Password reset token verification failed",
            extra={"gallery_id": str(gallery_id)},
        )

        return TokenVerificationResult(
            valid=False,
            error_message="Invalid or expired reset link.",
        )

    async def cleanup_expired_tokens(self) -> int:
        """Remove expired password reset tokens.

        Returns:
            Number of tokens deleted
        """
        result = await self.db.execute(
            text(
                """
                DELETE FROM gallery_password_resets
                WHERE expires_at < :cutoff
                RETURNING reset_id
                """
            ),
            {"cutoff": datetime.now(timezone.utc) - timedelta(days=1)},
        )
        await self.db.commit()

        deleted = len(result.fetchall())

        if deleted > 0:
            logger.info(
                "Cleaned up expired password reset tokens",
                extra={"deleted_count": deleted},
            )

        return deleted

    async def get_gallery_info_for_email(
        self,
        gallery_id: UUID,
    ) -> Optional[dict]:
        """Get gallery info needed for reset email template.

        Args:
            gallery_id: Gallery UUID

        Returns:
            Dict with gallery title, photographer info, or None if not found
        """
        result = await self.db.execute(
            text(
                """
                SELECT g.title, g.workspace_id, w.name as workspace_name
                FROM galleries g
                JOIN workspaces w ON g.workspace_id = w.workspace_id
                WHERE g.gallery_id = :gallery_id
                """
            ),
            {"gallery_id": gallery_id},
        )
        row = result.fetchone()

        if not row:
            return None

        return {
            "gallery_title": row.title,
            "workspace_id": str(row.workspace_id),
            "photographer_name": row.workspace_name,
        }
