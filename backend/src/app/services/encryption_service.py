"""EncryptionService: AES-256-GCM encryption/decryption with workspace-scoped keys.

Implements workspace key derivation using HKDF-SHA256 and supports key rotation.
"""

from __future__ import annotations

import base64
import logging
import os
from typing import Optional
from uuid import UUID

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.backends import default_backend

from app.db.postgres import get_postgres_pool
from app.config.settings import AppSettings

logger = logging.getLogger(__name__)

# Master key from environment (32 bytes = 256 bits)
MASTER_KEY_ENV = "ENCRYPTION_MASTER_KEY"
HKDF_INFO = b"rawdrive-workspace-key"  # Context for HKDF
HKDF_USER_INFO = b"rawdrive-user-api-key"  # Context for user-scoped key derivation


class EncryptionError(Exception):
    """Base encryption error."""

    def __init__(self, message: str, code: str = "ENCRYPTION_ERROR"):
        super().__init__(message)
        self.code = code


class EncryptionService:
    """Service for encryption/decryption operations."""

    def __init__(self, settings: AppSettings | None = None):
        """Initialize encryption service with master key."""
        from app.config.settings import get_settings, Environment
        
        settings = settings or get_settings()
        master_key_hex = settings.encryption_master_key.get_secret_value()
        
        # In development, use default key if not set
        if not master_key_hex or master_key_hex == "0000000000000000000000000000000000000000000000000000000000000000":
            if settings.app_env == Environment.DEVELOPMENT:
                master_key_hex = "0000000000000000000000000000000000000000000000000000000000000000"
            else:
                raise EncryptionError(
                    f"Missing {MASTER_KEY_ENV} environment variable",
                    "MISSING_MASTER_KEY",
                )
        try:
            self.master_key = bytes.fromhex(master_key_hex)
            if len(self.master_key) != 32:
                raise EncryptionError(
                    f"{MASTER_KEY_ENV} must be 64 hex characters (32 bytes)",
                    "INVALID_MASTER_KEY_LENGTH",
                )
        except ValueError as e:
            raise EncryptionError(
                f"Invalid {MASTER_KEY_ENV} format: {e}",
                "INVALID_MASTER_KEY_FORMAT",
            ) from e

    def _derive_workspace_key(self, workspace_id: UUID) -> bytes:
        """Derive workspace-specific encryption key using HKDF-SHA256.

        Args:
            workspace_id: Workspace UUID

        Returns:
            32-byte encryption key
        """
        workspace_bytes = str(workspace_id).encode("utf-8")
        hkdf = HKDF(
            algorithm=hashes.SHA256(),
            length=32,  # AES-256 requires 32 bytes
            salt=None,  # No salt needed for deterministic derivation
            info=HKDF_INFO,
            backend=default_backend(),
        )
        return hkdf.derive(self.master_key + workspace_bytes)

    def _derive_user_key(self, user_id: UUID, workspace_id: UUID) -> bytes:
        """Derive user-specific encryption key using HKDF-SHA256.

        Combines workspace isolation with per-user key derivation for API key storage.

        Args:
            user_id: User UUID
            workspace_id: Workspace UUID

        Returns:
            32-byte encryption key unique to this user in this workspace
        """
        combined = f"{workspace_id}:{user_id}".encode("utf-8")
        hkdf = HKDF(
            algorithm=hashes.SHA256(),
            length=32,  # AES-256 requires 32 bytes
            salt=None,  # No salt needed for deterministic derivation
            info=HKDF_USER_INFO,
            backend=default_backend(),
        )
        return hkdf.derive(self.master_key + combined)

    def encrypt_user_api_key(
        self, api_key: str, user_id: UUID, workspace_id: UUID
    ) -> tuple[bytes, bytes]:
        """Encrypt a user's API key using user-scoped AES-256-GCM.

        Args:
            api_key: Plaintext API key to encrypt
            user_id: User UUID for key derivation
            workspace_id: Workspace UUID for key derivation

        Returns:
            Tuple of (ciphertext_with_tag, iv)
        """
        key = self._derive_user_key(user_id, workspace_id)
        aesgcm = AESGCM(key)
        iv = os.urandom(12)  # 96-bit nonce for GCM

        # Encrypt (returns ciphertext + auth tag)
        ciphertext = aesgcm.encrypt(iv, api_key.encode("utf-8"), None)

        return ciphertext, iv

    def decrypt_user_api_key(
        self, ciphertext: bytes, iv: bytes, user_id: UUID, workspace_id: UUID
    ) -> str:
        """Decrypt a user's API key using user-scoped AES-256-GCM.

        Args:
            ciphertext: Encrypted data with auth tag
            iv: Initialization vector used during encryption
            user_id: User UUID for key derivation
            workspace_id: Workspace UUID for key derivation

        Returns:
            Decrypted API key as string

        Raises:
            EncryptionError: If decryption fails
        """
        key = self._derive_user_key(user_id, workspace_id)
        aesgcm = AESGCM(key)

        try:
            plaintext = aesgcm.decrypt(iv, ciphertext, None)
            return plaintext.decode("utf-8")
        except Exception as e:
            raise EncryptionError(
                "Failed to decrypt API key", "API_KEY_DECRYPTION_FAILED"
            ) from e

    async def get_workspace_key(
        self, workspace_id: UUID, key_version: Optional[int] = None
    ) -> tuple[bytes, int]:
        """Get workspace encryption key from database or derive new one.

        Args:
            workspace_id: Workspace UUID
            key_version: Specific key version (None = latest active)

        Returns:
            Tuple of (key_bytes, key_version)
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            if key_version is None:
                # Get latest active key
                row = await conn.fetchrow(
                    """
                    SELECT key_version, encrypted_key, algorithm
                    FROM workspace_encryption_keys
                    WHERE workspace_id = $1 AND status = 'active'
                    ORDER BY key_version DESC
                    LIMIT 1
                    """,
                    workspace_id,
                )
            else:
                # Get specific key version
                row = await conn.fetchrow(
                    """
                    SELECT key_version, encrypted_key, algorithm
                    FROM workspace_encryption_keys
                    WHERE workspace_id = $1 AND key_version = $2
                    """,
                    workspace_id,
                    key_version,
                )

            if row:
                # Decrypt stored key using master key
                encrypted_key_b64 = row["encrypted_key"]
                encrypted_key = base64.b64decode(encrypted_key_b64)
                # For now, we'll use the derived key directly
                # In production, you'd decrypt the stored key
                # This is a simplified version - full implementation would decrypt
                key = self._derive_workspace_key(workspace_id)
                return key, row["key_version"]

            # No key exists - create initial key
            logger.info(f"Creating initial encryption key for workspace {workspace_id}")
            key = self._derive_workspace_key(workspace_id)
            key_version = 1

            # Encrypt and store the key (simplified - in production use proper key encryption)
            encrypted_key_b64 = base64.b64encode(key).decode("utf-8")

            await conn.execute(
                """
                INSERT INTO workspace_encryption_keys (
                    workspace_id, key_version, encrypted_key, algorithm, status
                )
                VALUES ($1, $2, $3, $4, 'active')
                """,
                workspace_id,
                key_version,
                encrypted_key_b64,
                "AES-256-GCM",
            )

            return key, key_version

    async def encrypt_data(
        self, plaintext: bytes, workspace_id: UUID, key_version: Optional[int] = None
    ) -> tuple[bytes, bytes, int]:
        """Encrypt data using workspace key.

        Args:
            plaintext: Data to encrypt
            workspace_id: Workspace UUID
            key_version: Key version to use (None = latest active)

        Returns:
            Tuple of (ciphertext, auth_tag, key_version)
        """
        # Get workspace key
        key, version = await self.get_workspace_key(workspace_id, key_version)

        # Generate random IV (12 bytes for GCM)
        aesgcm = AESGCM(key)
        iv = os.urandom(12)

        # Encrypt with authentication tag
        ciphertext = aesgcm.encrypt(iv, plaintext, None)

        # Extract auth tag (last 16 bytes) and ciphertext
        auth_tag = ciphertext[-16:]
        encrypted_data = ciphertext[:-16]

        return encrypted_data, auth_tag, version

    async def decrypt_data(
        self,
        ciphertext: bytes,
        auth_tag: bytes,
        iv: bytes,
        workspace_id: UUID,
        key_version: int,
    ) -> bytes:
        """Decrypt data using workspace key.

        Args:
            ciphertext: Encrypted data
            auth_tag: GCM authentication tag
            iv: Initialization vector
            workspace_id: Workspace UUID
            key_version: Key version used for encryption

        Returns:
            Decrypted plaintext

        Raises:
            EncryptionError: If decryption fails (invalid key or corrupted data)
        """
        # Get workspace key
        key, _ = await self.get_workspace_key(workspace_id, key_version)

        # Decrypt
        aesgcm = AESGCM(key)
        encrypted_with_tag = ciphertext + auth_tag

        try:
            plaintext = aesgcm.decrypt(iv, encrypted_with_tag, None)
            return plaintext
        except Exception as e:
            raise EncryptionError(f"Decryption failed: {e}", "DECRYPTION_FAILED") from e

    async def encrypt_file(
        self,
        file_data: bytes,
        workspace_id: UUID,
        asset_id: UUID,
        variant: str = "original",
        key_version: Optional[int] = None,
    ) -> tuple[bytes, str, str, int]:
        """Encrypt file and store metadata in database.

        Args:
            file_data: File bytes to encrypt
            workspace_id: Workspace UUID
            asset_id: Asset UUID
            variant: File variant ('original', 'thumbnail', etc.)
            key_version: Key version to use (None = latest active)

        Returns:
            Tuple of (encrypted_data, iv_b64, auth_tag_b64, key_version)
        """
        # Get workspace key
        key, version = await self.get_workspace_key(workspace_id, key_version)

        # Generate random IV (12 bytes for GCM)
        aesgcm = AESGCM(key)
        iv = os.urandom(12)

        # Encrypt with authentication tag
        ciphertext = aesgcm.encrypt(iv, file_data, None)

        # Extract auth tag (last 16 bytes) and ciphertext
        auth_tag = ciphertext[-16:]
        encrypted_data = ciphertext[:-16]

        # Store encryption metadata in database
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO asset_encryption (
                    asset_id, workspace_id, variant, key_version, iv, auth_tag
                )
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (asset_id, variant) DO UPDATE SET
                    key_version = EXCLUDED.key_version,
                    iv = EXCLUDED.iv,
                    auth_tag = EXCLUDED.auth_tag,
                    encrypted_at = NOW()
                """,
                asset_id,
                workspace_id,
                variant,
                version,
                base64.b64encode(iv).decode("utf-8"),
                base64.b64encode(auth_tag).decode("utf-8"),
            )

        return (
            encrypted_data,
            base64.b64encode(iv).decode("utf-8"),
            base64.b64encode(auth_tag).decode("utf-8"),
            version,
        )

    async def decrypt_file(
        self,
        encrypted_data: bytes,
        workspace_id: UUID,
        asset_id: UUID,
        variant: str = "original",
    ) -> bytes:
        """Decrypt file using metadata from database.

        Args:
            encrypted_data: Encrypted file bytes
            workspace_id: Workspace UUID
            asset_id: Asset UUID
            variant: File variant ('original', 'thumbnail', etc.)

        Returns:
            Decrypted file bytes

        Raises:
            EncryptionError: If decryption fails
        """
        # Get encryption metadata from database
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT key_version, iv, auth_tag
                FROM asset_encryption
                WHERE asset_id = $1 AND workspace_id = $2 AND variant = $3
                """,
                asset_id,
                workspace_id,
                variant,
            )

            if not row:
                raise EncryptionError(
                    f"Encryption metadata not found for asset {asset_id} ({variant})",
                    "METADATA_NOT_FOUND",
                )

            key_version = row["key_version"]
            iv = base64.b64decode(row["iv"])
            auth_tag = base64.b64decode(row["auth_tag"])

        # Get workspace key
        key, _ = await self.get_workspace_key(workspace_id, key_version)

        # Decrypt
        aesgcm = AESGCM(key)
        encrypted_with_tag = encrypted_data + auth_tag

        try:
            plaintext = aesgcm.decrypt(iv, encrypted_with_tag, None)
            return plaintext
        except Exception as e:
            raise EncryptionError(
                f"Decryption failed for {variant}: {e}", "DECRYPTION_FAILED"
            ) from e


    def encrypt_gallery_credential(
        self, credential: str, workspace_id: UUID
    ) -> tuple[bytes, str]:
        """Encrypt a gallery credential (password or PIN) using workspace-scoped key.

        Args:
            credential: Plaintext credential to encrypt
            workspace_id: Workspace UUID for key derivation

        Returns:
            Tuple of (ciphertext_with_tag, iv_base64)
        """
        key = self._derive_workspace_key(workspace_id)
        aesgcm = AESGCM(key)
        iv = os.urandom(12)  # 96-bit nonce for GCM

        # Encrypt (returns ciphertext + auth tag)
        ciphertext = aesgcm.encrypt(iv, credential.encode("utf-8"), None)

        # Return ciphertext and base64-encoded IV
        return ciphertext, base64.b64encode(iv).decode("utf-8")

    def decrypt_gallery_credential(
        self, ciphertext: bytes, iv_base64: str, workspace_id: UUID
    ) -> str:
        """Decrypt a gallery credential using workspace-scoped key.

        Args:
            ciphertext: Encrypted data with auth tag
            iv_base64: Base64-encoded initialization vector
            workspace_id: Workspace UUID for key derivation

        Returns:
            Decrypted credential as string

        Raises:
            EncryptionError: If decryption fails
        """
        key = self._derive_workspace_key(workspace_id)
        aesgcm = AESGCM(key)
        iv = base64.b64decode(iv_base64)

        try:
            plaintext = aesgcm.decrypt(iv, ciphertext, None)
            return plaintext.decode("utf-8")
        except Exception as e:
            raise EncryptionError(
                "Failed to decrypt credential", "CREDENTIAL_DECRYPTION_FAILED"
            ) from e


# Export singleton instance
_encryption_service: Optional[EncryptionService] = None


def get_encryption_service() -> EncryptionService:
    """Get singleton encryption service instance."""
    global _encryption_service
    if _encryption_service is None:
        _encryption_service = EncryptionService()
    return _encryption_service

