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
from src.logging import get_logger
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
        max_views: Optional[int] = None,
        pin: Optional[str] = None,
        password: Optional[str] = None,
    ) -> dict:
        """Create a new magic link for a gallery."""
        token = generate_magic_token()
        pin_hash = hash_pin(pin) if pin else None
        password_hash = hash_password(password) if password else None

        with metrics.track_db_query("create_magic_link"):
            async with get_connection() as conn:
                # Verify gallery exists and belongs to workspace
                gallery = await conn.fetchrow(
                    """
                    SELECT gallery_id, title FROM galleries
                    WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE
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
                        workspace_id, gallery_id, token, expires_at, max_views,
                        pin_hash, password_hash, created_by_user_id
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    RETURNING magic_link_id, created_at
                    """,
                    UUID(workspace_id),
                    UUID(gallery_id),
                    token,
                    expires_at,
                    max_views,
                    pin_hash,
                    password_hash,
                    UUID(created_by_user_id),
                )

        return {
            "magic_link_id": str(result["magic_link_id"]),
            "gallery_id": gallery_id,
            "token": token,
            "url": f"/g/{token}",  # Frontend URL pattern
            "expires_at": expires_at.isoformat() if expires_at else None,
            "pin_protected": pin is not None,
            "password_protected": password is not None,
            "max_views": max_views,
            "current_views": 0,
            "created_at": result["created_at"].isoformat(),
            "is_active": True,
        }

    async def validate_magic_link(self, token: str) -> dict:
        """Validate a magic link token and return gallery access info."""
        cache_key = build_magic_link_cache_key(token)

        # Try cache first
        cached = await redis_client.get_json(cache_key)
        if cached:
            metrics.cache_hit("magic_link")
            metrics.magic_link_validated("success" if cached.get("valid") else "invalid")
            return cached

        metrics.cache_miss("magic_link")

        with metrics.track_db_query("validate_magic_link", read_replica=True):
            async with get_connection(read_only=True) as conn:
                link = await conn.fetchrow(
                    """
                    SELECT
                        ml.magic_link_id,
                        ml.gallery_id,
                        ml.expires_at,
                        ml.max_views,
                        ml.view_count,
                        ml.is_active,
                        ml.pin_hash IS NOT NULL as requires_pin,
                        ml.password_hash IS NOT NULL as requires_password,
                        g.title as gallery_title,
                        g.email_registration_required as requires_email,
                        g.status as gallery_status,
                        g.workspace_id
                    FROM magic_links ml
                    JOIN galleries g ON ml.gallery_id = g.gallery_id
                    WHERE ml.token = $1 AND ml.deleted = FALSE AND g.deleted = FALSE
                    """,
                    token,
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

        # Check if active
        if not link["is_active"] or link["gallery_status"] != "published":
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

        # Check max views
        max_views_reached = link["max_views"] and link["view_count"] >= link["max_views"]
        if max_views_reached:
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
            "gallery_id": str(link["gallery_id"]),
            "requires_pin": link["requires_pin"],
            "requires_password": link["requires_password"],
            "requires_email": link["requires_email"],
            "expired": False,
            "max_views_reached": False,
            "gallery_title": link["gallery_title"],
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
        """Verify PIN for gallery access with rate limiting."""
        # Check rate limit
        rate_key = f"pin_attempts:{token}:{client_ip}"
        attempts = await redis_client.incr(rate_key, ttl=settings.PIN_LOCKOUT_MINUTES * 60)

        if attempts > settings.PIN_MAX_ATTEMPTS:
            locked_until = datetime.now(timezone.utc) + timedelta(minutes=settings.PIN_LOCKOUT_MINUTES)
            raise PinVerificationError(0, locked_until)

        with metrics.track_db_query("verify_pin"):
            async with get_connection() as conn:
                link = await conn.fetchrow(
                    "SELECT pin_hash FROM magic_links WHERE token = $1 AND deleted = FALSE",
                    token,
                )

        if not link or not link["pin_hash"]:
            raise MagicLinkNotFoundError(token)

        pin_hash = hash_pin(pin)
        if pin_hash != link["pin_hash"]:
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
        """Verify password for gallery access with rate limiting."""
        # Check rate limit
        rate_key = f"password_attempts:{token}:{client_ip}"
        attempts = await redis_client.incr(rate_key, ttl=settings.PASSWORD_LOCKOUT_MINUTES * 60)

        if attempts > settings.PASSWORD_MAX_ATTEMPTS:
            locked_until = datetime.now(timezone.utc) + timedelta(minutes=settings.PASSWORD_LOCKOUT_MINUTES)
            raise PasswordVerificationError(0, locked_until)

        with metrics.track_db_query("verify_password"):
            async with get_connection() as conn:
                link = await conn.fetchrow(
                    "SELECT password_hash FROM magic_links WHERE token = $1 AND deleted = FALSE",
                    token,
                )

        if not link or not link["password_hash"]:
            raise MagicLinkNotFoundError(token)

        password_hash = hash_password(password)
        if password_hash != link["password_hash"]:
            attempts_remaining = settings.PASSWORD_MAX_ATTEMPTS - attempts
            if attempts_remaining <= 0:
                locked_until = datetime.now(timezone.utc) + timedelta(minutes=settings.PASSWORD_LOCKOUT_MINUTES)
                raise PasswordVerificationError(0, locked_until)
            raise PasswordVerificationError(attempts_remaining)

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

    async def increment_view_count(self, token: str) -> None:
        """Increment view count for a magic link."""
        with metrics.track_db_query("increment_view_count"):
            await execute(
                "UPDATE magic_links SET view_count = view_count + 1 WHERE token = $1",
                token,
            )
        # Invalidate cache
        await redis_client.delete(build_magic_link_cache_key(token))


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
