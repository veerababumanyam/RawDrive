"""
Magic Link Service - Secure gallery sharing with expiration and protection.

Handles:
- Magic link creation and validation
- PIN/password verification with rate limiting
- Visitor registration for email-required galleries
"""

from __future__ import annotations

import secrets
import hashlib
from typing import Optional
from uuid import UUID
from datetime import datetime, timezone, timedelta

from src.database import fetch, fetchrow, fetchval, execute, get_connection
from src.cache.redis_client import redis_client, build_magic_link_cache_key
from src.config import settings
from src.log_config import get_logger
from src.observability.metrics import get_metrics

logger = get_logger(__name__)
metrics = get_metrics()


# =============================================================================
# Exceptions
# =============================================================================


class MagicLinkError(Exception):
    """Base magic link error."""

    def __init__(self, message: str, code: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


class MagicLinkNotFoundError(MagicLinkError):
    """Magic link not found."""

    def __init__(self, token: str = "") -> None:
        super().__init__(
            "Invalid or expired magic link",
            "MAGIC_LINK_NOT_FOUND",
            404,
        )


class MagicLinkExpiredError(MagicLinkError):
    """Magic link has expired."""

    def __init__(self) -> None:
        super().__init__(
            "This link has expired",
            "MAGIC_LINK_EXPIRED",
            410,
        )


class MagicLinkMaxViewsError(MagicLinkError):
    """Magic link max views reached."""

    def __init__(self) -> None:
        super().__init__(
            "This link has reached its maximum number of views",
            "MAGIC_LINK_MAX_VIEWS",
            410,
        )


class PinVerificationError(MagicLinkError):
    """PIN verification failed."""

    def __init__(self, attempts_remaining: int, locked_until: Optional[datetime] = None) -> None:
        message = "Invalid PIN"
        if locked_until:
            message = f"Too many failed attempts. Try again after {locked_until.isoformat()}"
        super().__init__(message, "PIN_VERIFICATION_FAILED", 401)
        self.attempts_remaining = attempts_remaining
        self.locked_until = locked_until


class PasswordVerificationError(MagicLinkError):
    """Password verification failed."""

    def __init__(self, attempts_remaining: int, locked_until: Optional[datetime] = None) -> None:
        message = "Invalid password"
        if locked_until:
            message = f"Too many failed attempts. Try again after {locked_until.isoformat()}"
        super().__init__(message, "PASSWORD_VERIFICATION_FAILED", 401)
        self.attempts_remaining = attempts_remaining
        self.locked_until = locked_until


# =============================================================================
# Helper Functions
# =============================================================================


def generate_magic_token(length: int = 32) -> str:
    """Generate a secure random token for magic links."""
    return secrets.token_urlsafe(length)


def hash_pin(pin: str) -> str:
    """Hash a PIN for storage."""
    return hashlib.sha256(pin.encode()).hexdigest()


def hash_password(password: str) -> str:
    """Hash a password for storage (uses bcrypt via passlib in production)."""
    # For simplicity, using SHA-256 here. In production, use argon2/bcrypt
    return hashlib.sha256(password.encode()).hexdigest()


def generate_access_token() -> str:
    """Generate a temporary access token for verified visitors."""
    return secrets.token_urlsafe(32)


# =============================================================================
# Magic Link Service
# =============================================================================


class MagicLinkService:
    """Service for magic link operations."""

    async def create_magic_link(
        self,
        workspace_id: str,
        gallery_id: str,
        created_by_user_id: str,
        expires_at: Optional[datetime] = None,
        max_accesses: Optional[int] = None,
        label: Optional[str] = None,
        album_title: Optional[str] = None,
    ) -> dict:
        """Create a new magic link for a gallery.

        Note: PIN protection is set on the gallery itself, not the magic link.
        """
        token = generate_magic_token()
        token_hash = hashlib.sha256(token.encode()).hexdigest()

        with metrics.track_db_query("create_magic_link"):
            async with get_connection() as conn:
                # Verify gallery exists and belongs to workspace
                gallery = await conn.fetchrow(
                    """
                    SELECT gallery_id, title, pin_hash IS NOT NULL as has_pin
                    FROM galleries
                    WHERE workspace_id = $1 AND gallery_id = $2
                    """,
                    UUID(workspace_id),
                    UUID(gallery_id),
                )
                if not gallery:
                    raise MagicLinkError(
                        f"Gallery {gallery_id} not found",
                        "GALLERY_NOT_FOUND",
                        404,
                    )

                # Create magic link
                result = await conn.fetchrow(
                    """
                    INSERT INTO magic_links (
                        workspace_id, gallery_id, token_hash, expires_at, max_accesses,
                        label, album_title, created_by_user_id, target_type
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'gallery')
                    RETURNING link_id, created_at
                    """,
                    UUID(workspace_id),
                    UUID(gallery_id),
                    token_hash,
                    expires_at,
                    max_accesses,
                    label,
                    album_title or gallery["title"],
                    UUID(created_by_user_id),
                )

        return {
            "link_id": str(result["link_id"]),
            "gallery_id": gallery_id,
            "token": token,  # Return raw token, not the hash
            "url": f"/g/{token}",  # Frontend URL pattern
            "expires_at": expires_at.isoformat() if expires_at else None,
            "pin_protected": gallery["has_pin"],
            "max_accesses": max_accesses,
            "access_count": 0,
            "created_at": result["created_at"].isoformat(),
            "status": "active",
        }

    async def validate_magic_link(self, token: str) -> dict:
        """Validate a magic link token and return gallery access info.

        The token parameter is expected to be the raw token from the URL.
        We hash it to compare against the stored token_hash.
        """
        cache_key = build_magic_link_cache_key(token)

        # Try cache first
        cached = await redis_client.get_json(cache_key)
        if cached:
            metrics.cache_hit("magic_link")
            metrics.magic_link_validated("success" if cached.get("valid") else "invalid")
            return cached

        metrics.cache_miss("magic_link")

        # Hash the token to compare with stored hash
        token_hash = hashlib.sha256(token.encode()).hexdigest()

        with metrics.track_db_query("validate_magic_link", read_replica=True):
            async with get_connection(read_only=True) as conn:
                link = await conn.fetchrow(
                    """
                    SELECT
                        ml.link_id,
                        ml.gallery_id,
                        ml.expires_at,
                        ml.max_accesses,
                        ml.access_count,
                        ml.status,
                        g.pin_hash IS NOT NULL as requires_pin,
                        FALSE as requires_password,
                        g.title as gallery_title,
                        COALESCE(g.email_registration_required, FALSE) as requires_email,
                        g.status as gallery_status,
                        g.workspace_id,
                        g.gradient_config,
                        g.theme,
                        g.layout_style,
                        g.font_family,
                        g.primary_color
                    FROM magic_links ml
                    JOIN galleries g ON ml.gallery_id = g.gallery_id
                    WHERE ml.token_hash = $1 AND ml.status = 'active'
                    """,
                    token_hash,
                )

        if not link:
            result = {
                "valid": False,
                "gallery_id": None,
                "requires_pin": False,
                "requires_password": False,
                "requires_email": False,
                "expired": False,
                "max_views_reached": False,
            }
            metrics.magic_link_validated("invalid")
            await redis_client.set_json(cache_key, result, 60)  # Short TTL for invalid
            return result

        # Check if gallery is published (link status already checked in query)
        if link["gallery_status"] != "published":
            result = {
                "valid": False,
                "gallery_id": None,
                "requires_pin": False,
                "requires_password": False,
                "requires_email": False,
                "expired": False,
                "max_views_reached": False,
            }
            metrics.magic_link_validated("invalid")
            return result

        # Check expiration
        is_expired = link["expires_at"] and link["expires_at"] < datetime.now(timezone.utc)
        if is_expired:
            result = {
                "valid": False,
                "gallery_id": str(link["gallery_id"]),
                "requires_pin": False,
                "requires_password": False,
                "requires_email": False,
                "expired": True,
                "max_views_reached": False,
            }
            metrics.magic_link_validated("expired")
            await redis_client.set_json(cache_key, result, settings.CACHE_TTL_MAGIC_LINK)
            return result

        # Check max accesses
        max_accesses_reached = link["max_accesses"] and link["access_count"] >= link["max_accesses"]
        if max_accesses_reached:
            result = {
                "valid": False,
                "gallery_id": str(link["gallery_id"]),
                "requires_pin": False,
                "requires_password": False,
                "requires_email": False,
                "expired": False,
                "max_views_reached": True,
            }
            metrics.magic_link_validated("max_views")
            await redis_client.set_json(cache_key, result, settings.CACHE_TTL_MAGIC_LINK)
            return result

        result = {
            "valid": True,
            "link_id": str(link["link_id"]),
            "gallery_id": str(link["gallery_id"]),
            "workspace_id": str(link["workspace_id"]),
            "requires_pin": link["requires_pin"],
            "requires_password": link["requires_password"],
            "requires_email": link["requires_email"],
            "expired": False,
            "max_views_reached": False,
            "gallery_title": link["gallery_title"],
            "gradient_config": link["gradient_config"],
            "theme": link["theme"],
            "layout_style": link["layout_style"],
            "font_family": link["font_family"],
            "primary_color": link["primary_color"],
        }

        # Cache valid result
        await redis_client.set_json(cache_key, result, settings.CACHE_TTL_MAGIC_LINK)
        metrics.magic_link_validated("success")

        return result

    async def verify_pin(
        self,
        token: str,
        pin: str,
        client_ip: str,
    ) -> dict:
        """Verify PIN for gallery access with rate limiting.

        PIN is stored on the gallery table, not the magic_links table.
        """
        # Hash the token for lookup
        token_hash = hashlib.sha256(token.encode()).hexdigest()

        # Check rate limit
        rate_key = f"pin_attempts:{token}:{client_ip}"
        attempts = await redis_client.incr(rate_key, ttl=settings.PIN_LOCKOUT_MINUTES * 60)

        if attempts > settings.PIN_MAX_ATTEMPTS:
            locked_until = datetime.now(timezone.utc) + timedelta(minutes=settings.PIN_LOCKOUT_MINUTES)
            raise PinVerificationError(0, locked_until)

        with metrics.track_db_query("verify_pin"):
            async with get_connection() as conn:
                # Get pin_hash from gallery via magic_link
                result = await conn.fetchrow(
                    """
                    SELECT g.pin_hash
                    FROM magic_links ml
                    JOIN galleries g ON ml.gallery_id = g.gallery_id
                    WHERE ml.token_hash = $1 AND ml.status = 'active'
                    """,
                    token_hash,
                )

        if not result or not result["pin_hash"]:
            raise MagicLinkNotFoundError(token)

        pin_hash = hash_pin(pin)
        if pin_hash != result["pin_hash"]:
            attempts_remaining = settings.PIN_MAX_ATTEMPTS - attempts
            if attempts_remaining <= 0:
                locked_until = datetime.now(timezone.utc) + timedelta(minutes=settings.PIN_LOCKOUT_MINUTES)
                raise PinVerificationError(0, locked_until)
            raise PinVerificationError(attempts_remaining)

        # Success - clear rate limit
        await redis_client.delete(rate_key)

        # Generate access token
        access_token = generate_access_token()

        # Store access token in Redis
        await redis_client.set(
            f"access_token:{access_token}",
            token,
            settings.CACHE_TTL_SIGNED_URL,
        )

        return {
            "valid": True,
            "access_token": access_token,
            "attempts_remaining": None,
            "locked_until": None,
        }

    async def verify_password(
        self,
        token: str,
        password: str,
        client_ip: str,
    ) -> dict:
        """Verify password for gallery access with rate limiting.

        Uses Argon2id hashing (OWASP recommended) for password verification.
        Rate limiting: 5 attempts per 30 minutes per IP.

        Args:
            token: Magic link token
            password: Plain text password to verify
            client_ip: Client IP address for rate limiting

        Returns:
            Dictionary with verification result and access token

        Raises:
            MagicLinkNotFoundError: If token is invalid
            PasswordVerificationError: If password is incorrect or rate limited
        """
        from passlib.hash import argon2

        # Hash token for lookup
        token_hash = hashlib.sha256(token.encode()).hexdigest()

        # Rate limiting (reuse PIN settings but with stricter lockout)
        rate_key = f"password_attempts:{token}:{client_ip}"
        attempts = await redis_client.incr(rate_key, ttl=settings.PASSWORD_LOCKOUT_MINUTES * 60)

        if attempts > settings.PASSWORD_MAX_ATTEMPTS:
            locked_until = datetime.now(timezone.utc) + timedelta(minutes=settings.PASSWORD_LOCKOUT_MINUTES)
            logger.warning(
                f"Password verification locked",
                extra={
                    "token": token[:8],
                    "client_ip": client_ip,
                    "attempts": attempts,
                    "locked_until": locked_until.isoformat(),
                },
            )
            raise PasswordVerificationError(0, locked_until)

        # Get password_hash from database
        with metrics.track_db_query("verify_password"):
            async with get_connection() as conn:
                result = await conn.fetchrow(
                    """
                    SELECT g.password_hash
                    FROM magic_links ml
                    JOIN galleries g ON ml.gallery_id = g.gallery_id
                    WHERE ml.token_hash = $1 AND ml.status = 'active'
                    """,
                    token_hash,
                )

        if not result:
            raise MagicLinkNotFoundError(token)

        if not result["password_hash"]:
            # Gallery doesn't have password protection enabled
            raise MagicLinkError(
                "Password protection is not enabled for this gallery",
                "PASSWORD_NOT_ENABLED",
                400,
            )

        # Verify password with Argon2
        try:
            argon2.verify(password, result["password_hash"])
            logger.info(
                f"Password verification successful",
                extra={"token": token[:8], "client_ip": client_ip},
            )
        except Exception:
            # Verification failed
            attempts_remaining = settings.PASSWORD_MAX_ATTEMPTS - attempts
            logger.warning(
                f"Password verification failed",
                extra={
                    "token": token[:8],
                    "client_ip": client_ip,
                    "attempts": attempts,
                    "attempts_remaining": attempts_remaining,
                },
            )

            if attempts_remaining <= 0:
                locked_until = datetime.now(timezone.utc) + timedelta(minutes=settings.PASSWORD_LOCKOUT_MINUTES)
                raise PasswordVerificationError(0, locked_until)

            raise PasswordVerificationError(attempts_remaining)

        # Success - clear rate limit and generate access token
        await redis_client.delete(rate_key)

        access_token = generate_access_token()
        await redis_client.set(
            f"access_token:{access_token}",
            token,
            settings.CACHE_TTL_SIGNED_URL,
        )

        metrics.magic_link_validated()

        return {
            "valid": True,
            "access_token": access_token,
            "attempts_remaining": None,
            "locked_until": None,
        }

    async def increment_access_count(self, token: str) -> None:
        """Increment access count for a magic link."""
        token_hash = hashlib.sha256(token.encode()).hexdigest()

        with metrics.track_db_query("increment_access_count"):
            await execute(
                "UPDATE magic_links SET access_count = access_count + 1 WHERE token_hash = $1",
                token_hash,
            )
        # Invalidate cache
        await redis_client.delete(build_magic_link_cache_key(token))

    # Keep old method name for backward compatibility
    async def increment_view_count(self, token: str) -> None:
        """Increment view count for a magic link (alias for increment_access_count)."""
        await self.increment_access_count(token)


# =============================================================================
# Service Singleton
# =============================================================================

_magic_link_service: Optional[MagicLinkService] = None


def get_magic_link_service() -> MagicLinkService:
    """Get singleton magic link service instance."""
    global _magic_link_service
    if _magic_link_service is None:
        _magic_link_service = MagicLinkService()
    return _magic_link_service
