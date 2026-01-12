"""Access Code Service for per-photo access code verification.

Implements bcrypt verification with Redis-based lockout tracking
to prevent brute force attacks on protected gallery photos.

Feature: 027-gallery-feature-completion
User Story: US1 - Per-Photo Access Codes
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from passlib.context import CryptContext

from app.db.redis import get_redis_client
from app.metrics.registry import (
    access_code_verifications_total,
    access_code_lockouts_total,
)

logger = logging.getLogger(__name__)

# Bcrypt context with cost factor 10 (matches gallery passwords)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=10)

# Lockout configuration
MAX_FAILED_ATTEMPTS = 3
LOCKOUT_DURATION_SECONDS = 300  # 5 minutes


@dataclass
class AccessCodeVerificationResult:
    """Result of access code verification attempt."""

    verified: bool
    locked_out: bool = False
    remaining_attempts: int = MAX_FAILED_ATTEMPTS
    lockout_expires_at: Optional[datetime] = None
    error_message: Optional[str] = None


def _lockout_key(gallery_id: UUID, asset_id: UUID, client_identifier: str) -> str:
    """Generate Redis key for lockout tracking."""
    return f"access_code_lockout:{gallery_id}:{asset_id}:{client_identifier}"


class AccessCodeService:
    """Service for managing per-photo access codes with lockout protection."""

    def hash_access_code(self, access_code: str) -> str:
        """Hash an access code using bcrypt.

        Args:
            access_code: Plain text access code (4-8 characters recommended)

        Returns:
            bcrypt hash of the access code
        """
        return pwd_context.hash(access_code)

    async def verify_access_code(
        self,
        submitted_code: str,
        stored_hash: str,
        gallery_id: UUID,
        asset_id: UUID,
        client_identifier: str,
    ) -> AccessCodeVerificationResult:
        """Verify an access code with lockout protection.

        Implements brute force protection:
        - Tracks failed attempts per gallery/asset/client combination
        - Locks out after MAX_FAILED_ATTEMPTS failures
        - Lockout expires after LOCKOUT_DURATION_SECONDS

        Args:
            submitted_code: Code submitted by user
            stored_hash: bcrypt hash stored in database
            gallery_id: Gallery UUID
            asset_id: Asset UUID
            client_identifier: Client fingerprint or IP for tracking

        Returns:
            AccessCodeVerificationResult with verification status
        """
        lockout_key = _lockout_key(gallery_id, asset_id, client_identifier)

        try:
            redis = await get_redis_client()
        except RuntimeError:
            logger.warning(
                "Redis not available; proceeding without lockout tracking",
                extra={"gallery_id": str(gallery_id), "asset_id": str(asset_id)},
            )
            # Verify without lockout tracking
            verified = pwd_context.verify(submitted_code, stored_hash)
            return AccessCodeVerificationResult(verified=verified)

        # Check current lockout status
        current_attempts = await redis.get(lockout_key)
        if current_attempts is not None:
            attempts = int(current_attempts)
            if attempts >= MAX_FAILED_ATTEMPTS:
                # Get TTL to calculate lockout expiry
                ttl = await redis.ttl(lockout_key)
                lockout_expires_at = datetime.now(timezone.utc)
                if ttl > 0:
                    from datetime import timedelta

                    lockout_expires_at += timedelta(seconds=ttl)

                logger.warning(
                    "Access code verification blocked - client is locked out",
                    extra={
                        "gallery_id": str(gallery_id),
                        "asset_id": str(asset_id),
                        "client": client_identifier,
                        "ttl": ttl,
                    },
                )
                return AccessCodeVerificationResult(
                    verified=False,
                    locked_out=True,
                    remaining_attempts=0,
                    lockout_expires_at=lockout_expires_at,
                    error_message=f"Too many failed attempts. Try again in {ttl} seconds.",
                )

        # Verify the access code
        try:
            verified = pwd_context.verify(submitted_code, stored_hash)
        except Exception as e:
            logger.error(
                "Access code verification error",
                extra={"error": str(e), "gallery_id": str(gallery_id)},
            )
            verified = False

        gallery_id_str = str(gallery_id)

        if verified:
            # Clear any failed attempts on successful verification
            await redis.delete(lockout_key)

            # Record success metric
            access_code_verifications_total.labels(result="success", gallery_id=gallery_id_str).inc()

            logger.info(
                "Access code verified successfully",
                extra={"gallery_id": gallery_id_str, "asset_id": str(asset_id)},
            )
            return AccessCodeVerificationResult(verified=True, remaining_attempts=MAX_FAILED_ATTEMPTS)
        else:
            # Increment failed attempts
            pipe = redis.pipeline()
            pipe.incr(lockout_key)
            pipe.expire(lockout_key, LOCKOUT_DURATION_SECONDS)
            results = await pipe.execute()
            new_attempt_count = results[0]

            remaining = max(0, MAX_FAILED_ATTEMPTS - new_attempt_count)

            logger.warning(
                "Access code verification failed",
                extra={
                    "gallery_id": str(gallery_id),
                    "asset_id": str(asset_id),
                    "client": client_identifier,
                    "attempts": new_attempt_count,
                    "remaining": remaining,
                },
            )

            if new_attempt_count >= MAX_FAILED_ATTEMPTS:
                from datetime import timedelta

                # Record lockout metric
                access_code_verifications_total.labels(result="locked_out", gallery_id=gallery_id_str).inc()
                access_code_lockouts_total.labels(gallery_id=gallery_id_str).inc()

                lockout_expires_at = datetime.now(timezone.utc) + timedelta(seconds=LOCKOUT_DURATION_SECONDS)
                return AccessCodeVerificationResult(
                    verified=False,
                    locked_out=True,
                    remaining_attempts=0,
                    lockout_expires_at=lockout_expires_at,
                    error_message=f"Too many failed attempts. Try again in {LOCKOUT_DURATION_SECONDS} seconds.",
                )

            # Record failure metric
            access_code_verifications_total.labels(result="failure", gallery_id=gallery_id_str).inc()

            return AccessCodeVerificationResult(
                verified=False,
                locked_out=False,
                remaining_attempts=remaining,
                error_message=f"Incorrect code. {remaining} attempts remaining.",
            )

    async def get_lockout_status(
        self,
        gallery_id: UUID,
        asset_id: UUID,
        client_identifier: str,
    ) -> AccessCodeVerificationResult:
        """Check if a client is currently locked out.

        Args:
            gallery_id: Gallery UUID
            asset_id: Asset UUID
            client_identifier: Client fingerprint or IP

        Returns:
            AccessCodeVerificationResult with lockout status
        """
        lockout_key = _lockout_key(gallery_id, asset_id, client_identifier)

        try:
            redis = await get_redis_client()
        except RuntimeError:
            return AccessCodeVerificationResult(verified=False, locked_out=False)

        current_attempts = await redis.get(lockout_key)
        if current_attempts is None:
            return AccessCodeVerificationResult(
                verified=False, locked_out=False, remaining_attempts=MAX_FAILED_ATTEMPTS
            )

        attempts = int(current_attempts)
        if attempts >= MAX_FAILED_ATTEMPTS:
            ttl = await redis.ttl(lockout_key)
            from datetime import timedelta

            lockout_expires_at = datetime.now(timezone.utc) + timedelta(seconds=max(0, ttl))
            return AccessCodeVerificationResult(
                verified=False,
                locked_out=True,
                remaining_attempts=0,
                lockout_expires_at=lockout_expires_at,
            )

        return AccessCodeVerificationResult(
            verified=False,
            locked_out=False,
            remaining_attempts=MAX_FAILED_ATTEMPTS - attempts,
        )

    async def clear_lockout(
        self,
        gallery_id: UUID,
        asset_id: UUID,
        client_identifier: str,
    ) -> None:
        """Clear lockout for a specific client (admin action).

        Args:
            gallery_id: Gallery UUID
            asset_id: Asset UUID
            client_identifier: Client fingerprint or IP
        """
        lockout_key = _lockout_key(gallery_id, asset_id, client_identifier)

        try:
            redis = await get_redis_client()
            await redis.delete(lockout_key)
            logger.info(
                "Access code lockout cleared",
                extra={
                    "gallery_id": str(gallery_id),
                    "asset_id": str(asset_id),
                    "client": client_identifier,
                },
            )
        except RuntimeError:
            logger.warning("Redis not available; could not clear lockout")
