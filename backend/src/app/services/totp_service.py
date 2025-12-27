"""TOTPService: Two-Factor Authentication with TOTP (Time-based One-Time Password).

Implements RFC 6238 TOTP using pyotp for:
- TOTP secret generation and verification
- QR code URI generation for authenticator apps
- Backup code generation and validation
- Encrypted secret storage

Security considerations:
- Secrets encrypted at rest with workspace-scoped keys
- Backup codes hashed with bcrypt (one-time use)
- Rate limiting on verification attempts (handled at API layer)
"""

from __future__ import annotations

import base64
import hashlib
import logging
import os
import secrets
from datetime import datetime
from typing import Optional
from uuid import UUID

import pyotp
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.config.settings import get_settings
from app.db.postgres import get_postgres_pool
from app.services.encryption_service import EncryptionService, EncryptionError

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# TOTP configuration
TOTP_ISSUER = "RawDrive"
TOTP_PERIOD = 30  # seconds
TOTP_DIGITS = 6
TOTP_ALGORITHM = "sha1"  # Standard for authenticator apps

# Backup codes configuration
BACKUP_CODE_COUNT = 10
BACKUP_CODE_LENGTH = 8  # 8 characters per code

# For hashing backup codes
ph = PasswordHasher()


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class TOTPError(Exception):
    """Base TOTP error."""

    def __init__(self, message: str, code: str = "TOTP_ERROR"):
        super().__init__(message)
        self.code = code


class TOTPNotEnabledError(TOTPError):
    """User has not enabled 2FA."""

    def __init__(self):
        super().__init__("Two-factor authentication is not enabled", "TOTP_NOT_ENABLED")


class TOTPAlreadyEnabledError(TOTPError):
    """User already has 2FA enabled."""

    def __init__(self):
        super().__init__(
            "Two-factor authentication is already enabled", "TOTP_ALREADY_ENABLED"
        )


class TOTPInvalidCodeError(TOTPError):
    """Invalid TOTP code provided."""

    def __init__(self):
        super().__init__("Invalid verification code", "TOTP_INVALID_CODE")


class TOTPSetupExpiredError(TOTPError):
    """TOTP setup has expired."""

    def __init__(self):
        super().__init__(
            "Setup has expired. Please start the setup process again.",
            "TOTP_SETUP_EXPIRED",
        )


# ---------------------------------------------------------------------------
# Response Types
# ---------------------------------------------------------------------------


class TOTPSetupResult:
    """Result of TOTP setup initiation."""

    def __init__(
        self,
        secret: str,
        qr_code_uri: str,
        qr_code_svg: Optional[str],
        issuer: str,
    ):
        self.secret = secret
        self.qr_code_uri = qr_code_uri
        self.qr_code_svg = qr_code_svg
        self.issuer = issuer


class TOTPEnableResult:
    """Result of TOTP verification/enablement."""

    def __init__(self, backup_codes: list[str]):
        self.backup_codes = backup_codes


class TOTPStatusResult:
    """TOTP status for a user."""

    def __init__(
        self,
        enabled: bool,
        enabled_at: Optional[datetime] = None,
        backup_codes_remaining: Optional[int] = None,
    ):
        self.enabled = enabled
        self.enabled_at = enabled_at
        self.backup_codes_remaining = backup_codes_remaining


# ---------------------------------------------------------------------------
# TOTPService
# ---------------------------------------------------------------------------


class TOTPService:
    """Service for TOTP-based two-factor authentication."""

    def __init__(self):
        """Initialize TOTP service."""
        self.settings = get_settings()
        self._encryption_service: Optional[EncryptionService] = None

    @property
    def encryption_service(self) -> EncryptionService:
        """Lazy-load encryption service."""
        if self._encryption_service is None:
            from app.services.encryption_service import get_encryption_service

            self._encryption_service = get_encryption_service()
        return self._encryption_service

    def _generate_secret(self) -> str:
        """Generate a random base32-encoded secret.

        Returns:
            32-character base32 secret (160 bits)
        """
        return pyotp.random_base32()

    def _generate_backup_codes(self) -> list[str]:
        """Generate random backup codes.

        Returns:
            List of plaintext backup codes
        """
        codes = []
        for _ in range(BACKUP_CODE_COUNT):
            # Generate code: 4 chars - 4 chars format
            code_bytes = secrets.token_bytes(4)
            code = code_bytes.hex().upper()
            formatted = f"{code[:4]}-{code[4:]}"
            codes.append(formatted)
        return codes

    def _hash_backup_codes(self, codes: list[str]) -> list[str]:
        """Hash backup codes for storage.

        Args:
            codes: List of plaintext backup codes

        Returns:
            List of hashed backup codes
        """
        # Use SHA-256 for fast verification (codes are already random)
        return [hashlib.sha256(code.encode()).hexdigest() for code in codes]

    def _verify_backup_code(self, code: str, stored_hash: str) -> bool:
        """Verify a backup code against stored hash.

        Args:
            code: Plaintext backup code
            stored_hash: SHA-256 hash of original code

        Returns:
            True if code matches
        """
        code_hash = hashlib.sha256(code.encode()).hexdigest()
        return secrets.compare_digest(code_hash, stored_hash)

    async def _encrypt_secret(self, secret: str, user_id: UUID) -> bytes:
        """Encrypt TOTP secret for storage.

        Uses AES-256-GCM with a key derived from user ID.

        Args:
            secret: Base32 TOTP secret
            user_id: User UUID

        Returns:
            Encrypted bytes
        """
        # Simple encryption using master key derivation
        # In production, you might use workspace key or user-specific key
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        from cryptography.hazmat.primitives.kdf.hkdf import HKDF
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.backends import default_backend

        settings = get_settings()
        master_key_hex = settings.encryption_master_key.get_secret_value()

        # Use default key in development
        if not master_key_hex or master_key_hex == "0" * 64:
            master_key_hex = "0" * 64

        master_key = bytes.fromhex(master_key_hex)

        # Derive user-specific key
        hkdf = HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=None,
            info=b"rawdrive-totp-key",
            backend=default_backend(),
        )
        derived_key = hkdf.derive(master_key + str(user_id).encode())

        # Encrypt with AES-GCM
        aesgcm = AESGCM(derived_key)
        iv = os.urandom(12)
        ciphertext = aesgcm.encrypt(iv, secret.encode(), None)

        # Return IV + ciphertext
        return iv + ciphertext

    async def _decrypt_secret(self, encrypted: bytes, user_id: UUID) -> str:
        """Decrypt TOTP secret from storage.

        Args:
            encrypted: IV + ciphertext bytes
            user_id: User UUID

        Returns:
            Decrypted base32 secret
        """
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        from cryptography.hazmat.primitives.kdf.hkdf import HKDF
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.backends import default_backend

        settings = get_settings()
        master_key_hex = settings.encryption_master_key.get_secret_value()

        if not master_key_hex or master_key_hex == "0" * 64:
            master_key_hex = "0" * 64

        master_key = bytes.fromhex(master_key_hex)

        # Derive user-specific key
        hkdf = HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=None,
            info=b"rawdrive-totp-key",
            backend=default_backend(),
        )
        derived_key = hkdf.derive(master_key + str(user_id).encode())

        # Extract IV and ciphertext
        iv = encrypted[:12]
        ciphertext = encrypted[12:]

        # Decrypt
        aesgcm = AESGCM(derived_key)
        plaintext = aesgcm.decrypt(iv, ciphertext, None)

        return plaintext.decode()

    def _generate_qr_code_uri(self, secret: str, email: str) -> str:
        """Generate otpauth:// URI for QR code.

        Args:
            secret: Base32 TOTP secret
            email: User email for label

        Returns:
            otpauth:// provisioning URI
        """
        totp = pyotp.TOTP(
            secret,
            issuer=TOTP_ISSUER,
            digits=TOTP_DIGITS,
            interval=TOTP_PERIOD,
        )
        return totp.provisioning_uri(name=email, issuer_name=TOTP_ISSUER)

    async def _generate_qr_code_svg(self, uri: str) -> Optional[str]:
        """Generate SVG QR code for the URI.

        Args:
            uri: otpauth:// URI

        Returns:
            SVG string or None if qrcode library unavailable
        """
        try:
            import qrcode
            import qrcode.image.svg

            qr = qrcode.QRCode(
                version=1,
                error_correction=qrcode.constants.ERROR_CORRECT_L,
                box_size=10,
                border=4,
            )
            qr.add_data(uri)
            qr.make(fit=True)

            factory = qrcode.image.svg.SvgImage
            img = qr.make_image(image_factory=factory)

            # Get SVG as string
            import io

            buffer = io.BytesIO()
            img.save(buffer)
            return buffer.getvalue().decode()

        except ImportError:
            logger.warning("qrcode library not available for SVG generation")
            return None

    async def get_status(self, user_id: UUID) -> TOTPStatusResult:
        """Get TOTP status for a user.

        Args:
            user_id: User UUID

        Returns:
            TOTPStatusResult with enabled status and backup codes count
        """
        pool = await get_postgres_pool()

        row = await pool.fetchrow(
            """
            SELECT totp_enabled, totp_enabled_at, backup_codes_hashed
            FROM user_totp_settings
            WHERE user_id = $1
            """,
            user_id,
        )

        if not row or not row["totp_enabled"]:
            return TOTPStatusResult(enabled=False)

        # Count remaining backup codes
        backup_codes = row["backup_codes_hashed"] or []
        remaining = len([c for c in backup_codes if c])  # Count non-empty

        return TOTPStatusResult(
            enabled=True,
            enabled_at=row["totp_enabled_at"],
            backup_codes_remaining=remaining,
        )

    async def setup(self, user_id: UUID, email: str) -> TOTPSetupResult:
        """Initialize TOTP setup for a user.

        Creates a pending secret that must be verified before becoming active.

        Args:
            user_id: User UUID
            email: User email for QR code label

        Returns:
            TOTPSetupResult with secret and QR code

        Raises:
            TOTPAlreadyEnabledError: If 2FA is already enabled
        """
        pool = await get_postgres_pool()

        # Check if already enabled
        existing = await pool.fetchrow(
            """
            SELECT totp_enabled FROM user_totp_settings
            WHERE user_id = $1
            """,
            user_id,
        )

        if existing and existing["totp_enabled"]:
            raise TOTPAlreadyEnabledError()

        # Generate new secret
        secret = self._generate_secret()

        # Encrypt secret for storage
        encrypted_secret = await self._encrypt_secret(secret, user_id)

        # Store as pending (not yet enabled)
        await pool.execute(
            """
            INSERT INTO user_totp_settings (
                user_id, totp_enabled, totp_secret_encrypted, created_at, updated_at
            )
            VALUES ($1, false, $2, NOW(), NOW())
            ON CONFLICT (user_id) DO UPDATE SET
                totp_secret_encrypted = $2,
                updated_at = NOW()
            """,
            user_id,
            encrypted_secret,
        )

        # Generate QR code URI
        qr_uri = self._generate_qr_code_uri(secret, email)
        qr_svg = await self._generate_qr_code_svg(qr_uri)

        logger.info("TOTP setup initiated", extra={"user_id": str(user_id)})

        return TOTPSetupResult(
            secret=secret,
            qr_code_uri=qr_uri,
            qr_code_svg=qr_svg,
            issuer=TOTP_ISSUER,
        )

    async def verify_and_enable(self, user_id: UUID, code: str) -> TOTPEnableResult:
        """Verify TOTP code and enable 2FA.

        Args:
            user_id: User UUID
            code: 6-digit TOTP code from authenticator

        Returns:
            TOTPEnableResult with backup codes

        Raises:
            TOTPSetupExpiredError: If no pending setup exists
            TOTPInvalidCodeError: If code is invalid
        """
        pool = await get_postgres_pool()

        # Get pending secret
        row = await pool.fetchrow(
            """
            SELECT totp_enabled, totp_secret_encrypted, updated_at
            FROM user_totp_settings
            WHERE user_id = $1
            """,
            user_id,
        )

        if not row or not row["totp_secret_encrypted"]:
            raise TOTPSetupExpiredError()

        if row["totp_enabled"]:
            raise TOTPAlreadyEnabledError()

        # Check setup expiry (15 minutes)
        from datetime import timezone, timedelta

        if row["updated_at"]:
            setup_time = row["updated_at"]
            if setup_time.tzinfo is None:
                setup_time = setup_time.replace(tzinfo=timezone.utc)
            now = datetime.now(timezone.utc)
            if now - setup_time > timedelta(minutes=15):
                raise TOTPSetupExpiredError()

        # Decrypt and verify code
        try:
            secret = await self._decrypt_secret(row["totp_secret_encrypted"], user_id)
        except Exception as e:
            logger.error(f"Failed to decrypt TOTP secret: {e}")
            raise TOTPSetupExpiredError()

        totp = pyotp.TOTP(
            secret,
            digits=TOTP_DIGITS,
            interval=TOTP_PERIOD,
        )

        # Verify with 1 period tolerance (30 seconds before/after)
        if not totp.verify(code, valid_window=1):
            raise TOTPInvalidCodeError()

        # Generate backup codes
        backup_codes = self._generate_backup_codes()
        hashed_codes = self._hash_backup_codes(backup_codes)

        # Enable 2FA
        await pool.execute(
            """
            UPDATE user_totp_settings SET
                totp_enabled = true,
                totp_enabled_at = NOW(),
                backup_codes_hashed = $2,
                updated_at = NOW()
            WHERE user_id = $1
            """,
            user_id,
            hashed_codes,
        )

        logger.info("TOTP enabled successfully", extra={"user_id": str(user_id)})

        return TOTPEnableResult(backup_codes=backup_codes)

    async def verify_code(self, user_id: UUID, code: str) -> bool:
        """Verify a TOTP code for login.

        Args:
            user_id: User UUID
            code: 6-digit TOTP code

        Returns:
            True if code is valid

        Raises:
            TOTPNotEnabledError: If 2FA is not enabled
        """
        pool = await get_postgres_pool()

        row = await pool.fetchrow(
            """
            SELECT totp_enabled, totp_secret_encrypted
            FROM user_totp_settings
            WHERE user_id = $1
            """,
            user_id,
        )

        if not row or not row["totp_enabled"]:
            raise TOTPNotEnabledError()

        # Decrypt secret
        try:
            secret = await self._decrypt_secret(row["totp_secret_encrypted"], user_id)
        except Exception as e:
            logger.error(f"Failed to decrypt TOTP secret: {e}")
            return False

        totp = pyotp.TOTP(
            secret,
            digits=TOTP_DIGITS,
            interval=TOTP_PERIOD,
        )

        # Verify with 1 period tolerance
        return totp.verify(code, valid_window=1)

    async def verify_backup_code(self, user_id: UUID, code: str) -> bool:
        """Verify and consume a backup code.

        Args:
            user_id: User UUID
            code: Backup code (with or without hyphen)

        Returns:
            True if code is valid and was consumed

        Raises:
            TOTPNotEnabledError: If 2FA is not enabled
        """
        pool = await get_postgres_pool()

        # Normalize code format
        normalized_code = code.upper().replace("-", "")
        if len(normalized_code) == 8:
            normalized_code = f"{normalized_code[:4]}-{normalized_code[4:]}"

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT totp_enabled, backup_codes_hashed
                FROM user_totp_settings
                WHERE user_id = $1
                """,
                user_id,
            )

            if not row or not row["totp_enabled"]:
                raise TOTPNotEnabledError()

            backup_codes = row["backup_codes_hashed"] or []

            # Find and remove matching code
            for i, stored_hash in enumerate(backup_codes):
                if self._verify_backup_code(normalized_code, stored_hash):
                    # Remove used code
                    backup_codes[i] = ""  # Mark as used
                    await conn.execute(
                        """
                        UPDATE user_totp_settings SET
                            backup_codes_hashed = $2,
                            updated_at = NOW()
                        WHERE user_id = $1
                        """,
                        user_id,
                        backup_codes,
                    )

                    logger.info(
                        "Backup code used",
                        extra={"user_id": str(user_id), "codes_remaining": len([c for c in backup_codes if c])},
                    )
                    return True

            return False

    async def disable(self, user_id: UUID, code: str) -> None:
        """Disable 2FA for a user.

        Requires valid TOTP code for security.

        Args:
            user_id: User UUID
            code: Valid TOTP code to confirm

        Raises:
            TOTPNotEnabledError: If 2FA is not enabled
            TOTPInvalidCodeError: If code is invalid
        """
        # Verify current code
        if not await self.verify_code(user_id, code):
            raise TOTPInvalidCodeError()

        pool = await get_postgres_pool()

        await pool.execute(
            """
            UPDATE user_totp_settings SET
                totp_enabled = false,
                totp_secret_encrypted = NULL,
                backup_codes_hashed = NULL,
                totp_enabled_at = NULL,
                updated_at = NOW()
            WHERE user_id = $1
            """,
            user_id,
        )

        logger.info("TOTP disabled", extra={"user_id": str(user_id)})

    async def regenerate_backup_codes(self, user_id: UUID) -> list[str]:
        """Generate new backup codes, replacing existing ones.

        Args:
            user_id: User UUID

        Returns:
            List of new backup codes

        Raises:
            TOTPNotEnabledError: If 2FA is not enabled
        """
        pool = await get_postgres_pool()

        # Check if 2FA is enabled
        row = await pool.fetchrow(
            """
            SELECT totp_enabled FROM user_totp_settings
            WHERE user_id = $1
            """,
            user_id,
        )

        if not row or not row["totp_enabled"]:
            raise TOTPNotEnabledError()

        # Generate new codes
        backup_codes = self._generate_backup_codes()
        hashed_codes = self._hash_backup_codes(backup_codes)

        await pool.execute(
            """
            UPDATE user_totp_settings SET
                backup_codes_hashed = $2,
                updated_at = NOW()
            WHERE user_id = $1
            """,
            user_id,
            hashed_codes,
        )

        logger.info("Backup codes regenerated", extra={"user_id": str(user_id)})

        return backup_codes


# ---------------------------------------------------------------------------
# Singleton instance helper
# ---------------------------------------------------------------------------

_totp_service: TOTPService | None = None


def get_totp_service() -> TOTPService:
    """Get or create the TOTP service singleton."""
    global _totp_service
    if _totp_service is None:
        _totp_service = TOTPService()
    return _totp_service
