"""SignedUrlService: Generate and validate time-limited signed URLs for media access.

Implements 1-hour TTL tokens with workspace and permission verification.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
import time
from typing import Optional
from uuid import UUID

logger = logging.getLogger(__name__)

# Secret key for signing URLs (32 bytes)
SIGNED_URL_SECRET_ENV = "SIGNED_URL_SECRET"
DEFAULT_TTL = 3600  # 1 hour in seconds


class SignedUrlError(Exception):
    """Base signed URL error."""

    def __init__(self, message: str, code: str = "SIGNED_URL_ERROR"):
        super().__init__(message)
        self.code = code


class SignedUrlService:
    """Service for generating and validating signed URLs."""

    def __init__(self):
        """Initialize signed URL service with secret key."""
        secret_hex = os.getenv(SIGNED_URL_SECRET_ENV)
        if not secret_hex:
            # Generate a random secret if not set (for development only)
            logger.warning(
                f"{SIGNED_URL_SECRET_ENV} not set, generating random secret (not for production!)"
            )
            self.secret = os.urandom(32)
        else:
            try:
                self.secret = bytes.fromhex(secret_hex)
                if len(self.secret) != 32:
                    raise SignedUrlError(
                        f"{SIGNED_URL_SECRET_ENV} must be 64 hex characters (32 bytes)",
                        "INVALID_SECRET_LENGTH",
                    )
            except ValueError as e:
                raise SignedUrlError(
                    f"Invalid {SIGNED_URL_SECRET_ENV} format: {e}",
                    "INVALID_SECRET_FORMAT",
                ) from e

    def generate_token(
        self,
        workspace_id: UUID,
        asset_id: UUID,
        variant: str,
        ttl: int = DEFAULT_TTL,
        download: bool = False,
    ) -> str:
        """Generate signed token for media access.

        Args:
            workspace_id: Workspace UUID
            asset_id: Asset UUID
            variant: Media variant ('thumbnail', 'preview', 'original')
            ttl: Time to live in seconds (default: 1 hour)
            download: Whether this is for download (affects audit logging)

        Returns:
            Base64-encoded signed token
        """
        # Validate variant
        valid_variants = {"thumbnail", "preview", "original"}
        if variant not in valid_variants:
            raise SignedUrlError(
                f"Invalid variant: {variant}. Must be one of {valid_variants}",
                "INVALID_VARIANT",
            )

        # Calculate expiry timestamp
        expiry = int(time.time()) + ttl

        # Build token payload
        payload = f"{workspace_id}:{asset_id}:{variant}:{expiry}:{1 if download else 0}"

        # Generate HMAC signature
        signature = hmac.new(
            self.secret, payload.encode("utf-8"), hashlib.sha256
        ).digest()

        # Combine payload and signature
        token_data = f"{payload}:{base64.urlsafe_b64encode(signature).decode('utf-8')}"

        # Base64 encode the entire token
        token = base64.urlsafe_b64encode(token_data.encode("utf-8")).decode("utf-8")

        return token

    def validate_token(self, token: str) -> dict:
        """Validate signed token and extract information.

        Args:
            token: Base64-encoded signed token

        Returns:
            Dictionary with workspace_id, asset_id, variant, expiry, download

        Raises:
            SignedUrlError: If token is invalid or expired
        """
        try:
            # Decode token
            token_data = base64.urlsafe_b64decode(token.encode("utf-8")).decode("utf-8")

            # Split payload and signature
            parts = token_data.rsplit(":", 1)
            if len(parts) != 2:
                raise SignedUrlError("Invalid token format", "INVALID_TOKEN_FORMAT")

            payload, signature_b64 = parts

            # Verify signature
            expected_signature = hmac.new(
                self.secret, payload.encode("utf-8"), hashlib.sha256
            ).digest()
            provided_signature = base64.urlsafe_b64decode(signature_b64.encode("utf-8"))

            if not hmac.compare_digest(expected_signature, provided_signature):
                raise SignedUrlError("Invalid token signature", "INVALID_SIGNATURE")

            # Parse payload
            payload_parts = payload.split(":")
            if len(payload_parts) != 5:
                raise SignedUrlError("Invalid payload format", "INVALID_PAYLOAD")

            workspace_id_str, asset_id_str, variant, expiry_str, download_str = (
                payload_parts
            )

            # Validate expiry
            expiry = int(expiry_str)
            current_time = int(time.time())
            if expiry < current_time:
                raise SignedUrlError("Token expired", "TOKEN_EXPIRED")

            # Validate variant
            valid_variants = {"thumbnail", "preview", "original"}
            if variant not in valid_variants:
                raise SignedUrlError(
                    f"Invalid variant: {variant}", "INVALID_VARIANT"
                )

            return {
                "workspace_id": UUID(workspace_id_str),
                "asset_id": UUID(asset_id_str),
                "variant": variant,
                "expiry": expiry,
                "download": download_str == "1",
            }
        except ValueError as e:
            raise SignedUrlError(f"Invalid token: {e}", "INVALID_TOKEN") from e
        except Exception as e:
            raise SignedUrlError(f"Token validation failed: {e}", "VALIDATION_FAILED") from e

    def generate_signed_url(
        self,
        workspace_id: UUID,
        asset_id: UUID,
        variant: str,
        base_url: str = "/api/v1/media",
        ttl: int = DEFAULT_TTL,
        download: bool = False,
    ) -> dict:
        """Generate complete signed URL for media access.

        Args:
            workspace_id: Workspace UUID
            asset_id: Asset UUID
            variant: Media variant ('thumbnail', 'preview', 'original')
            base_url: Base URL for media endpoint
            ttl: Time to live in seconds
            download: Whether this is for download

        Returns:
            Dictionary with url and expires_at
        """
        token = self.generate_token(workspace_id, asset_id, variant, ttl, download)
        url = f"{base_url}/{token}"

        return {
            "url": url,
            "expires_at": int(time.time()) + ttl,
            "ttl": ttl,
        }

    def batch_generate_signed_urls(
        self,
        workspace_id: UUID,
        asset_ids: list[UUID],
        variant: str = "thumbnail",
        base_url: str = "/api/v1/media",
        ttl: int = DEFAULT_TTL,
        download: bool = False,
    ) -> dict[UUID, dict]:
        """Generate signed URLs for multiple assets in batch.

        This optimized method generates URLs for multiple assets without
        making individual calls, preventing N+1 query patterns.

        Args:
            workspace_id: Workspace UUID (same for all assets)
            asset_ids: List of asset UUIDs
            variant: Media variant ('thumbnail', 'preview', 'original')
            base_url: Base URL for media endpoint
            ttl: Time to live in seconds
            download: Whether this is for download

        Returns:
            Dictionary mapping asset_id to {url, expires_at, ttl}
        """
        if not asset_ids:
            return {}

        # Pre-calculate expiry once for all URLs (same TTL)
        expiry = int(time.time()) + ttl
        
        # Generate all URLs in one pass
        results = {}
        for asset_id in asset_ids:
            try:
                # Build token payload
                payload = f"{workspace_id}:{asset_id}:{variant}:{expiry}:{1 if download else 0}"
                
                # Generate HMAC signature
                signature = hmac.new(
                    self.secret, payload.encode("utf-8"), hashlib.sha256
                ).digest()
                
                # Combine payload and signature
                token_data = f"{payload}:{base64.urlsafe_b64encode(signature).decode('utf-8')}"
                
                # Base64 encode the entire token
                token = base64.urlsafe_b64encode(token_data.encode("utf-8")).decode("utf-8")
                url = f"{base_url}/{token}"
                
                results[asset_id] = {
                    "url": url,
                    "expires_at": expiry,
                    "ttl": ttl,
                }
            except Exception as e:
                logger.warning(f"Failed to generate URL for asset {asset_id}: {e}")
                results[asset_id] = None
        
        return results

    # =========================================================================
    # FACE THUMBNAIL URL METHODS
    # =========================================================================

    def generate_face_thumbnail_token(
        self,
        workspace_id: UUID,
        face_id: UUID,
        size: str = "medium",
        ttl: int = DEFAULT_TTL,
    ) -> str:
        """Generate signed token for face thumbnail access.

        Args:
            workspace_id: Workspace UUID
            face_id: Face UUID
            size: Thumbnail size ('small', 'medium', 'large')
            ttl: Time to live in seconds (default: 1 hour)

        Returns:
            Base64-encoded signed token
        """
        # Validate size
        valid_sizes = {"small", "medium", "large"}
        if size not in valid_sizes:
            raise SignedUrlError(
                f"Invalid size: {size}. Must be one of {valid_sizes}",
                "INVALID_SIZE",
            )

        # Calculate expiry timestamp
        expiry = int(time.time()) + ttl

        # Build token payload with 'face' prefix to distinguish from asset tokens
        payload = f"face:{workspace_id}:{face_id}:{size}:{expiry}"

        # Generate HMAC signature
        signature = hmac.new(
            self.secret, payload.encode("utf-8"), hashlib.sha256
        ).digest()

        # Combine payload and signature
        token_data = f"{payload}:{base64.urlsafe_b64encode(signature).decode('utf-8')}"

        # Base64 encode the entire token
        token = base64.urlsafe_b64encode(token_data.encode("utf-8")).decode("utf-8")

        return token

    def validate_face_thumbnail_token(self, token: str) -> dict:
        """Validate face thumbnail signed token and extract information.

        Args:
            token: Base64-encoded signed token

        Returns:
            Dictionary with workspace_id, face_id, size, expiry

        Raises:
            SignedUrlError: If token is invalid or expired
        """
        try:
            # Decode token
            token_data = base64.urlsafe_b64decode(token.encode("utf-8")).decode("utf-8")

            # Split payload and signature
            parts = token_data.rsplit(":", 1)
            if len(parts) != 2:
                raise SignedUrlError("Invalid token format", "INVALID_TOKEN_FORMAT")

            payload, signature_b64 = parts

            # Verify signature
            expected_signature = hmac.new(
                self.secret, payload.encode("utf-8"), hashlib.sha256
            ).digest()
            provided_signature = base64.urlsafe_b64decode(signature_b64.encode("utf-8"))

            if not hmac.compare_digest(expected_signature, provided_signature):
                raise SignedUrlError("Invalid token signature", "INVALID_SIGNATURE")

            # Parse payload (format: face:workspace_id:face_id:size:expiry)
            payload_parts = payload.split(":")
            if len(payload_parts) != 5 or payload_parts[0] != "face":
                raise SignedUrlError("Invalid face token format", "INVALID_PAYLOAD")

            _, workspace_id_str, face_id_str, size, expiry_str = payload_parts

            # Validate expiry
            expiry = int(expiry_str)
            current_time = int(time.time())
            if expiry < current_time:
                raise SignedUrlError("Token expired", "TOKEN_EXPIRED")

            # Validate size
            valid_sizes = {"small", "medium", "large"}
            if size not in valid_sizes:
                raise SignedUrlError(
                    f"Invalid size: {size}", "INVALID_SIZE"
                )

            return {
                "workspace_id": UUID(workspace_id_str),
                "face_id": UUID(face_id_str),
                "size": size,
                "expiry": expiry,
            }
        except SignedUrlError:
            raise
        except ValueError as e:
            raise SignedUrlError(f"Invalid token: {e}", "INVALID_TOKEN") from e
        except Exception as e:
            raise SignedUrlError(f"Token validation failed: {e}", "VALIDATION_FAILED") from e

    def generate_face_thumbnail_url(
        self,
        workspace_id: UUID,
        face_id: UUID,
        size: str = "medium",
        base_url: str = "/api/v1/media/face",
        ttl: int = DEFAULT_TTL,
    ) -> dict:
        """Generate complete signed URL for face thumbnail access.

        Args:
            workspace_id: Workspace UUID
            face_id: Face UUID
            size: Thumbnail size ('small', 'medium', 'large')
            base_url: Base URL for face media endpoint
            ttl: Time to live in seconds

        Returns:
            Dictionary with url and expires_at
        """
        token = self.generate_face_thumbnail_token(workspace_id, face_id, size, ttl)

        # Get API base URL for absolute URLs (needed for <img> tags)
        api_base = os.getenv("API_BASE_URL", "http://localhost:8000")
        url = f"{api_base}{base_url}/{token}"

        return {
            "url": url,
            "expires_at": int(time.time()) + ttl,
            "ttl": ttl,
        }


# Export singleton instance
_signed_url_service: Optional[SignedUrlService] = None


def get_signed_url_service() -> SignedUrlService:
    """Get singleton signed URL service instance."""
    global _signed_url_service
    if _signed_url_service is None:
        _signed_url_service = SignedUrlService()
    return _signed_url_service

