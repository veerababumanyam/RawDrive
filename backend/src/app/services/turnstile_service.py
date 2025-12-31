"""
Cloudflare Turnstile Verification Service

Provides bot protection for public forms (RSVPs, etc.) via Cloudflare Turnstile.

Feature: 016-save-the-date (T124)
"""

import logging
import os
from typing import Optional

import httpx
from pydantic import BaseModel


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
TURNSTILE_SECRET_KEY = os.getenv("CLOUDFLARE_TURNSTILE_SECRET_KEY", "")
TURNSTILE_SITE_KEY = os.getenv("CLOUDFLARE_TURNSTILE_SITE_KEY", "")


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------


class TurnstileVerifyResult(BaseModel):
    """Result of Turnstile token verification."""

    success: bool
    error_codes: list[str] = []
    challenge_ts: Optional[str] = None
    hostname: Optional[str] = None
    action: Optional[str] = None
    cdata: Optional[str] = None


class TurnstileVerificationError(Exception):
    """Raised when Turnstile verification fails."""

    def __init__(self, message: str, error_codes: list[str] = None):
        super().__init__(message)
        self.error_codes = error_codes or []


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class TurnstileService:
    """
    Service for verifying Cloudflare Turnstile tokens.

    Turnstile is a privacy-focused CAPTCHA alternative that verifies
    human users without visible challenges in most cases.

    Usage:
        service = TurnstileService()

        # Check if Turnstile is configured
        if service.is_configured():
            result = await service.verify(token, ip_address)
            if not result.success:
                raise TurnstileVerificationError("Verification failed")
    """

    def __init__(self, secret_key: str = None):
        """
        Initialize Turnstile service.

        Args:
            secret_key: Cloudflare Turnstile secret key.
                       If not provided, uses CLOUDFLARE_TURNSTILE_SECRET_KEY env var.
        """
        self.secret_key = secret_key or TURNSTILE_SECRET_KEY

    def is_configured(self) -> bool:
        """Check if Turnstile is properly configured."""
        return bool(self.secret_key)

    @staticmethod
    def get_site_key() -> Optional[str]:
        """Get the public site key for frontend use."""
        return TURNSTILE_SITE_KEY if TURNSTILE_SITE_KEY else None

    async def verify(
        self,
        token: str,
        ip_address: Optional[str] = None,
        idempotency_key: Optional[str] = None,
    ) -> TurnstileVerifyResult:
        """
        Verify a Turnstile token.

        Args:
            token: The Turnstile response token from the frontend.
            ip_address: Optional client IP address for additional validation.
            idempotency_key: Optional key for idempotent verification requests.

        Returns:
            TurnstileVerifyResult with verification status and metadata.

        Raises:
            TurnstileVerificationError: If the token verification fails.
        """
        if not self.is_configured():
            logger.warning("Turnstile not configured, skipping verification")
            # Return success if not configured (optional CAPTCHA)
            return TurnstileVerifyResult(success=True)

        if not token:
            raise TurnstileVerificationError(
                "Turnstile token is required",
                error_codes=["missing-input-response"],
            )

        # Prepare request data
        form_data = {
            "secret": self.secret_key,
            "response": token,
        }

        if ip_address:
            form_data["remoteip"] = ip_address

        if idempotency_key:
            form_data["idempotency_key"] = idempotency_key

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    TURNSTILE_VERIFY_URL,
                    data=form_data,
                )
                response.raise_for_status()
                data = response.json()
        except httpx.HTTPError as e:
            logger.error("Turnstile API request failed", error=str(e))
            raise TurnstileVerificationError(
                "Unable to verify Turnstile token",
                error_codes=["network-error"],
            )

        result = TurnstileVerifyResult(
            success=data.get("success", False),
            error_codes=data.get("error-codes", []),
            challenge_ts=data.get("challenge_ts"),
            hostname=data.get("hostname"),
            action=data.get("action"),
            cdata=data.get("cdata"),
        )

        if not result.success:
            logger.warning(
                "Turnstile verification failed",
                error_codes=result.error_codes,
            )

        return result


# ---------------------------------------------------------------------------
# Singleton instance
# ---------------------------------------------------------------------------

_turnstile_service: Optional[TurnstileService] = None


def get_turnstile_service() -> TurnstileService:
    """Get the singleton TurnstileService instance."""
    global _turnstile_service
    if _turnstile_service is None:
        _turnstile_service = TurnstileService()
    return _turnstile_service
