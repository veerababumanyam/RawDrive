"""EncryptionService - Ported for Gallery Microservice.

Handles workspace-scoped encryption for gallery credentials (passwords/PINs).
"""

from __future__ import annotations

import base64
import logging
import os
from typing import Optional, Tuple
from uuid import UUID

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.backends import default_backend

from src.database import get_connection, fetchrow, execute
from src.config import settings

logger = logging.getLogger(__name__)

HKDF_INFO = b"rawdrive-workspace-key"


class EncryptionError(Exception):
    """Base encryption error."""

    def __init__(self, message: str, code: str = "ENCRYPTION_ERROR"):
        super().__init__(message)
        self.code = code


class EncryptionService:
    """Service for encryption/decryption operations."""

    def __init__(self):
        """Initialize encryption service with master key."""
        master_key_hex = settings.ENCRYPTION_MASTER_KEY
        
        try:
            self.master_key = bytes.fromhex(master_key_hex)
            if len(self.master_key) != 32:
                raise EncryptionError(
                    "ENCRYPTION_MASTER_KEY must be 64 hex characters (32 bytes)",
                    "INVALID_MASTER_KEY_LENGTH",
                )
        except ValueError as e:
            raise EncryptionError(
                f"Invalid ENCRYPTION_MASTER_KEY format: {e}",
                "INVALID_MASTER_KEY_FORMAT",
            ) from e

    def _derive_workspace_key(self, workspace_id: UUID) -> bytes:
        """Derive workspace-specific encryption key using HKDF-SHA256."""
        workspace_bytes = str(workspace_id).encode("utf-8")
        hkdf = HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=None,
            info=HKDF_INFO,
            backend=default_backend(),
        )
        return hkdf.derive(self.master_key + workspace_bytes)

    async def get_workspace_key(
        self, workspace_id: UUID, key_version: Optional[int] = None
    ) -> Tuple[bytes, int]:
        """Get workspace encryption key from database or derive new one."""
        if key_version is None:
            # Get latest active key
            row = await fetchrow(
                """
                SELECT key_version, encrypted_key, algorithm
                FROM workspace_encryption_keys
                WHERE workspace_id = $1 AND status = 'active'
                ORDER BY key_version DESC
                LIMIT 1
                """,
                UUID(str(workspace_id)),
            )
        else:
            # Get specific key version
            row = await fetchrow(
                """
                SELECT key_version, encrypted_key, algorithm
                FROM workspace_encryption_keys
                WHERE workspace_id = $1 AND key_version = $2
                """,
                UUID(str(workspace_id)),
                key_version,
            )

        if row:
            # In a full implementation, we would decrypt the stored key.
            # Here we re-derive it for simplicity, assuming data consistency.
            key = self._derive_workspace_key(workspace_id)
            return key, row["key_version"]

        # No key exists - create initial key
        logger.info(f"Creating initial encryption key for workspace {workspace_id}")
        key = self._derive_workspace_key(workspace_id)
        key_version = 1

        # Store the key
        encrypted_key_b64 = base64.b64encode(key).decode("utf-8")

        async with get_connection() as conn:
            await conn.execute(
                """
                INSERT INTO workspace_encryption_keys (
                    workspace_id, key_version, encrypted_key, algorithm, status
                )
                VALUES ($1, $2, $3, $4, 'active')
                """,
                UUID(str(workspace_id)),
                key_version,
                encrypted_key_b64,
                "AES-256-GCM",
            )

        return key, key_version

    async def encrypt_gallery_credential(
        self, credential: str, workspace_id: UUID
    ) -> Tuple[bytes, str]:
        """Encrypt a gallery credential (password or PIN)."""
        key = self._derive_workspace_key(workspace_id)
        aesgcm = AESGCM(key)
        iv = os.urandom(12)  # 96-bit nonce for GCM

        # Encrypt (returns ciphertext + auth tag)
        ciphertext = aesgcm.encrypt(iv, credential.encode("utf-8"), None)

        # Return ciphertext and base64-encoded IV
        return ciphertext, base64.b64encode(iv).decode("utf-8")

    async def decrypt_gallery_credential(
        self, ciphertext: bytes, iv_base64: str, workspace_id: UUID
    ) -> str:
        """Decrypt a gallery credential."""
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


_encryption_service: Optional[EncryptionService] = None


def get_encryption_service() -> EncryptionService:
    """Get encryption service singleton."""
    global _encryption_service
    if _encryption_service is None:
        _encryption_service = EncryptionService()
    return _encryption_service
