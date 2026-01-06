"""EncryptionService: AES-256-CTR streaming encryption for file uploads.

Implements workspace key derivation using HKDF-SHA256 and provides
memory-efficient streaming encryption for large file uploads.

This is the migrated version for the upload microservice, adapted for:
- Microservice architecture (no direct database access for key storage)
- Streaming encryption for large files
- Integration with chunked upload service
- Memory-efficient processing

Author: Claude Code Migration
"""

from __future__ import annotations

import base64
import logging
import os
from typing import AsyncIterator, Optional
from uuid import UUID

from cryptography.hazmat.primitives import hashes, hmac
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.backends import default_backend

from app.core.config import get_settings, Environment

logger = logging.getLogger(__name__)

# =============================================================================
# Constants
# =============================================================================

# Master key environment variable name
MASTER_KEY_ENV = "ENCRYPTION_MASTER_KEY"

# HKDF context strings for key derivation
HKDF_INFO = b"rawdrive-workspace-key"  # Context for workspace key derivation
HKDF_USER_INFO = b"rawdrive-user-api-key"  # Context for user-scoped key derivation
HKDF_STREAMING_ENC_INFO = b"rawdrive-streaming-enc"  # Context for streaming encryption key
HKDF_STREAMING_MAC_INFO = b"rawdrive-streaming-mac"  # Context for streaming MAC key

# Streaming encryption constants
STREAMING_CHUNK_SIZE = 64 * 1024  # 64KB chunks for streaming
STREAMING_ALGORITHM = "AES-256-CTR-HMAC"  # Algorithm identifier

# IV sizes
GCM_IV_SIZE = 12  # 96 bits for GCM
CTR_IV_SIZE = 16  # 128 bits for CTR


# =============================================================================
# Exceptions
# =============================================================================


class EncryptionError(Exception):
    """Base encryption error with error code support.

    Attributes:
        message: Human-readable error message
        code: Machine-readable error code for client handling
    """

    def __init__(self, message: str, code: str = "ENCRYPTION_ERROR") -> None:
        super().__init__(message)
        self.message = message
        self.code = code

    def to_dict(self) -> dict[str, str]:
        """Convert to dictionary for JSON response."""
        return {
            "error": self.code,
            "message": self.message,
        }


class MasterKeyError(EncryptionError):
    """Master key configuration error."""

    def __init__(self, message: str) -> None:
        super().__init__(message, "MASTER_KEY_ERROR")


class HMACVerificationError(EncryptionError):
    """HMAC verification failed - data may be corrupted or tampered."""

    def __init__(self, message: str = "HMAC verification failed") -> None:
        super().__init__(message, "HMAC_VERIFICATION_FAILED")


class DecryptionError(EncryptionError):
    """Decryption operation failed."""

    def __init__(self, message: str = "Decryption failed") -> None:
        super().__init__(message, "DECRYPTION_FAILED")


# =============================================================================
# Streaming Encryptor
# =============================================================================


class StreamingEncryptor:
    """AES-256-CTR streaming encryptor with HMAC-SHA256 authentication.

    Uses Encrypt-then-MAC pattern for authenticated encryption:
    1. Encrypt each chunk with AES-256-CTR (streamable)
    2. Update HMAC with each ciphertext chunk
    3. Finalize HMAC at end for authentication

    Output format: [16-byte IV][ciphertext...][32-byte HMAC]

    This class is designed for memory-efficient encryption of large files
    during upload. It maintains state across multiple encrypt_chunk() calls
    and produces an HMAC tag at the end.

    Usage:
        encryptor = StreamingEncryptor(key)
        iv = encryptor.iv  # Store this with the encrypted file

        # Encrypt chunks
        for chunk in file_chunks:
            encrypted_chunk = encryptor.encrypt_chunk(chunk)
            yield encrypted_chunk

        # Get final HMAC
        hmac_tag = encryptor.finalize()  # Store this with the encrypted file
    """

    def __init__(self, key: bytes) -> None:
        """Initialize streaming encryptor with key derivation.

        Derives separate encryption and MAC keys from the input key
        for defense in depth (key separation).

        Args:
            key: 32-byte base encryption key
        """
        if len(key) != 32:
            raise EncryptionError(
                f"Invalid key length: expected 32 bytes, got {len(key)}",
                "INVALID_KEY_LENGTH",
            )

        # Derive separate keys for encryption and MAC (defense in depth)
        enc_key_derivation = HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=None,
            info=HKDF_STREAMING_ENC_INFO,
            backend=default_backend(),
        )
        mac_key_derivation = HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=None,
            info=HKDF_STREAMING_MAC_INFO,
            backend=default_backend(),
        )

        self._enc_key = enc_key_derivation.derive(key)
        self._mac_key = mac_key_derivation.derive(key)

        # Generate random IV (16 bytes for CTR mode)
        self._iv = os.urandom(CTR_IV_SIZE)

        # Create cipher
        cipher = Cipher(
            algorithms.AES(self._enc_key),
            modes.CTR(self._iv),
            backend=default_backend(),
        )
        self._encryptor = cipher.encryptor()

        # Create HMAC
        self._hmac = hmac.HMAC(
            self._mac_key, hashes.SHA256(), backend=default_backend()
        )
        # Include IV in MAC for authentication
        self._hmac.update(self._iv)

        self._finalized = False
        self._bytes_encrypted = 0

    @property
    def iv(self) -> bytes:
        """Get the initialization vector (16 bytes)."""
        return self._iv

    @property
    def bytes_encrypted(self) -> int:
        """Get total bytes encrypted so far."""
        return self._bytes_encrypted

    def encrypt_chunk(self, plaintext: bytes) -> bytes:
        """Encrypt a chunk of data.

        Each chunk is encrypted with AES-CTR and the ciphertext is
        added to the HMAC computation.

        Args:
            plaintext: Data to encrypt

        Returns:
            Encrypted ciphertext (same length as plaintext)

        Raises:
            EncryptionError: If encryptor already finalized
        """
        if self._finalized:
            raise EncryptionError(
                "Encryptor already finalized - create a new instance",
                "ENCRYPTOR_FINALIZED",
            )

        if not plaintext:
            return b""

        ciphertext = self._encryptor.update(plaintext)
        # Update HMAC with ciphertext (Encrypt-then-MAC pattern)
        self._hmac.update(ciphertext)
        self._bytes_encrypted += len(plaintext)

        return ciphertext

    def finalize(self) -> bytes:
        """Finalize encryption and return HMAC tag.

        Must be called exactly once after all chunks are encrypted.
        The returned HMAC must be stored with the encrypted data
        for verification during decryption.

        Returns:
            32-byte HMAC-SHA256 tag

        Raises:
            EncryptionError: If already finalized
        """
        if self._finalized:
            raise EncryptionError(
                "Encryptor already finalized",
                "ENCRYPTOR_FINALIZED",
            )

        self._finalized = True

        # Finalize cipher (for CTR mode, this is typically empty)
        final_block = self._encryptor.finalize()
        if final_block:
            self._hmac.update(final_block)

        return self._hmac.finalize()


# =============================================================================
# Streaming Decryptor
# =============================================================================


class StreamingDecryptor:
    """AES-256-CTR streaming decryptor with HMAC-SHA256 verification.

    SECURITY: This class requires HMAC verification BEFORE any decryption.
    For streaming decryption, the caller must:
    1. First pass: Read all ciphertext, compute HMAC, verify
    2. Second pass: Decrypt the verified ciphertext

    For simpler use cases, collect all ciphertext and verify before decrypting.

    Usage (two-pass for security):
        # First pass: verify HMAC
        decryptor = StreamingDecryptor(key, iv)
        for chunk in encrypted_chunks:
            decryptor.update_hmac(chunk)
        decryptor.verify_hmac(expected_hmac)  # Raises on failure

        # Second pass: decrypt after verification
        decryptor = StreamingDecryptor(key, iv)
        for chunk in encrypted_chunks:
            plaintext = decryptor.decrypt_chunk(chunk)
            yield plaintext
    """

    def __init__(self, key: bytes, iv: bytes) -> None:
        """Initialize streaming decryptor.

        Args:
            key: 32-byte base encryption key
            iv: 16-byte initialization vector from encryption
        """
        if len(key) != 32:
            raise EncryptionError(
                f"Invalid key length: expected 32 bytes, got {len(key)}",
                "INVALID_KEY_LENGTH",
            )

        if len(iv) != CTR_IV_SIZE:
            raise EncryptionError(
                f"Invalid IV length: expected {CTR_IV_SIZE} bytes, got {len(iv)}",
                "INVALID_IV_LENGTH",
            )

        # Derive same keys as encryptor
        enc_key_derivation = HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=None,
            info=HKDF_STREAMING_ENC_INFO,
            backend=default_backend(),
        )
        mac_key_derivation = HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=None,
            info=HKDF_STREAMING_MAC_INFO,
            backend=default_backend(),
        )

        self._enc_key = enc_key_derivation.derive(key)
        self._mac_key = mac_key_derivation.derive(key)
        self._iv = iv

        # Create cipher
        cipher = Cipher(
            algorithms.AES(self._enc_key),
            modes.CTR(self._iv),
            backend=default_backend(),
        )
        self._decryptor = cipher.decryptor()

        # Create HMAC for verification
        self._hmac = hmac.HMAC(
            self._mac_key, hashes.SHA256(), backend=default_backend()
        )
        self._hmac.update(iv)  # IV was included in MAC

        self._finalized = False
        self._hmac_verified = False
        self._bytes_decrypted = 0

    @property
    def bytes_decrypted(self) -> int:
        """Get total bytes decrypted so far."""
        return self._bytes_decrypted

    def update_hmac(self, ciphertext: bytes) -> None:
        """Update HMAC with ciphertext chunk for verification.

        Call this for each ciphertext chunk before calling verify_hmac().

        Args:
            ciphertext: Encrypted data chunk
        """
        if ciphertext:
            self._hmac.update(ciphertext)

    def verify_hmac(self, expected_hmac: bytes) -> bool:
        """Verify the HMAC against expected value.

        MUST be called before any decryption for security.

        Args:
            expected_hmac: 32-byte HMAC from encryption

        Returns:
            True if valid

        Raises:
            HMACVerificationError: If HMAC verification fails
        """
        try:
            self._hmac.verify(expected_hmac)
            self._hmac_verified = True
            return True
        except Exception as e:
            raise HMACVerificationError(
                "HMAC verification failed - data may be corrupted or tampered"
            ) from e

    def decrypt_chunk(self, ciphertext: bytes) -> bytes:
        """Decrypt a chunk of data.

        WARNING: Should only be called after verify_hmac() succeeds.
        Decrypting unverified data could expose you to attacks.

        Args:
            ciphertext: Encrypted data

        Returns:
            Decrypted plaintext

        Raises:
            EncryptionError: If decryptor already finalized
        """
        if self._finalized:
            raise EncryptionError(
                "Decryptor already finalized",
                "DECRYPTOR_FINALIZED",
            )

        if not ciphertext:
            return b""

        plaintext = self._decryptor.update(ciphertext)
        self._bytes_decrypted += len(plaintext)

        return plaintext

    def finalize(self) -> bytes:
        """Finalize decryption.

        Returns:
            Any remaining plaintext (usually empty for CTR mode)
        """
        if self._finalized:
            raise EncryptionError(
                "Decryptor already finalized",
                "DECRYPTOR_FINALIZED",
            )

        self._finalized = True
        return self._decryptor.finalize()


# =============================================================================
# Encryption Service
# =============================================================================


class EncryptionService:
    """Service for encryption/decryption operations in the upload microservice.

    Provides:
    - Workspace key derivation using HKDF-SHA256
    - Streaming AES-256-CTR encryption with HMAC authentication
    - AES-256-GCM encryption for small data (credentials, API keys)
    - Factory methods for creating streaming encryptors/decryptors

    This service is stateless and derives all keys from a master key.
    Workspace isolation is achieved through deterministic key derivation.
    """

    def __init__(self) -> None:
        """Initialize encryption service with master key from settings."""
        settings = get_settings()
        master_key_hex = settings.ENCRYPTION_MASTER_KEY.get_secret_value()

        # In development, allow default key
        if (
            not master_key_hex
            or master_key_hex == "0" * 64
        ):
            if settings.APP_ENV == Environment.DEVELOPMENT:
                master_key_hex = "0" * 64
                logger.warning(
                    "Using default encryption key in development mode - "
                    "NEVER use this in production"
                )
            else:
                raise MasterKeyError(
                    f"Missing {MASTER_KEY_ENV} environment variable"
                )

        try:
            self._master_key = bytes.fromhex(master_key_hex)
            if len(self._master_key) != 32:
                raise MasterKeyError(
                    f"{MASTER_KEY_ENV} must be 64 hex characters (32 bytes)"
                )
        except ValueError as e:
            raise MasterKeyError(
                f"Invalid {MASTER_KEY_ENV} format: {e}"
            ) from e

    # =========================================================================
    # Key Derivation
    # =========================================================================

    def derive_workspace_key(self, workspace_id: UUID) -> bytes:
        """Derive workspace-specific encryption key using HKDF-SHA256.

        The derived key is deterministic and unique per workspace.
        This enables workspace isolation without storing individual keys.

        Args:
            workspace_id: Workspace UUID

        Returns:
            32-byte encryption key unique to this workspace
        """
        workspace_bytes = str(workspace_id).encode("utf-8")
        hkdf = HKDF(
            algorithm=hashes.SHA256(),
            length=32,  # AES-256 requires 32 bytes
            salt=None,  # No salt needed for deterministic derivation
            info=HKDF_INFO,
            backend=default_backend(),
        )
        return hkdf.derive(self._master_key + workspace_bytes)

    def derive_user_key(self, user_id: UUID, workspace_id: UUID) -> bytes:
        """Derive user-specific encryption key using HKDF-SHA256.

        Combines workspace isolation with per-user key derivation.
        Used for encrypting user-specific secrets like API keys.

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
        return hkdf.derive(self._master_key + combined)

    # =========================================================================
    # Streaming Encryption Factory Methods
    # =========================================================================

    def create_streaming_encryptor(self, workspace_id: UUID) -> StreamingEncryptor:
        """Create a streaming encryptor for a workspace.

        Use this for encrypting large files during upload.
        The encryptor handles AES-256-CTR encryption with HMAC authentication.

        Args:
            workspace_id: Workspace UUID for key derivation

        Returns:
            StreamingEncryptor instance

        Example:
            encryptor = encryption_service.create_streaming_encryptor(workspace_id)
            iv = encryptor.iv  # Store this

            for chunk in file_chunks:
                encrypted = encryptor.encrypt_chunk(chunk)
                yield encrypted

            hmac_tag = encryptor.finalize()  # Store this
        """
        workspace_key = self.derive_workspace_key(workspace_id)
        return StreamingEncryptor(workspace_key)

    def create_streaming_decryptor(
        self, workspace_id: UUID, iv: bytes
    ) -> StreamingDecryptor:
        """Create a streaming decryptor for a workspace.

        Use this for decrypting large files.

        SECURITY: Remember to verify HMAC before decrypting!

        Args:
            workspace_id: Workspace UUID for key derivation
            iv: 16-byte IV from encryption

        Returns:
            StreamingDecryptor instance

        Example:
            # First pass: verify HMAC
            decryptor = encryption_service.create_streaming_decryptor(workspace_id, iv)
            for chunk in encrypted_chunks:
                decryptor.update_hmac(chunk)
            decryptor.verify_hmac(expected_hmac)  # Raises on failure

            # Second pass: decrypt
            decryptor = encryption_service.create_streaming_decryptor(workspace_id, iv)
            for chunk in encrypted_chunks:
                plaintext = decryptor.decrypt_chunk(chunk)
                yield plaintext
        """
        workspace_key = self.derive_workspace_key(workspace_id)
        return StreamingDecryptor(workspace_key, iv)

    # =========================================================================
    # Async Streaming Encryption
    # =========================================================================

    async def encrypt_stream(
        self,
        data_iterator: AsyncIterator[bytes],
        workspace_id: UUID,
    ) -> AsyncIterator[bytes]:
        """Encrypt an async stream of data chunks.

        Memory-efficient: processes data in chunks without loading entire file.
        First yields IV (16 bytes), then encrypted chunks, finally HMAC (32 bytes).

        Args:
            data_iterator: Async iterator of plaintext chunks
            workspace_id: Workspace UUID for key derivation

        Yields:
            First: 16-byte IV
            Middle: Encrypted chunks (same size as input)
            Last: 32-byte HMAC
        """
        encryptor = self.create_streaming_encryptor(workspace_id)

        # Yield IV first (needed for decryption)
        yield encryptor.iv

        # Encrypt chunks as they come
        async for chunk in data_iterator:
            if chunk:  # Skip empty chunks
                yield encryptor.encrypt_chunk(chunk)

        # Yield HMAC last
        yield encryptor.finalize()

    async def decrypt_stream(
        self,
        data_iterator: AsyncIterator[bytes],
        workspace_id: UUID,
        iv: bytes,
        expected_hmac: bytes,
    ) -> AsyncIterator[bytes]:
        """Decrypt an async stream of encrypted data.

        SECURITY: This method buffers all data to verify HMAC before decrypting.
        For very large files, consider a two-pass approach.

        Args:
            data_iterator: Async iterator of ciphertext chunks
            workspace_id: Workspace UUID for key derivation
            iv: 16-byte IV from encryption
            expected_hmac: 32-byte HMAC from encryption

        Yields:
            Decrypted plaintext chunks

        Raises:
            HMACVerificationError: If HMAC verification fails
        """
        # Collect all ciphertext for HMAC verification first
        all_chunks: list[bytes] = []
        async for chunk in data_iterator:
            if chunk:
                all_chunks.append(chunk)

        if not all_chunks:
            raise DecryptionError("No data to decrypt")

        full_ciphertext = b"".join(all_chunks)

        # Verify HMAC before decrypting (security requirement)
        decryptor = self.create_streaming_decryptor(workspace_id, iv)
        decryptor.update_hmac(full_ciphertext)
        decryptor.verify_hmac(expected_hmac)

        # Now safe to decrypt - create new decryptor for clean state
        decryptor = self.create_streaming_decryptor(workspace_id, iv)

        # Decrypt in chunks for memory efficiency
        offset = 0
        chunk_size = STREAMING_CHUNK_SIZE
        while offset < len(full_ciphertext):
            chunk = full_ciphertext[offset : offset + chunk_size]
            yield decryptor.decrypt_chunk(chunk)
            offset += chunk_size

        # Finalize decryption
        final = decryptor.finalize()
        if final:
            yield final

    # =========================================================================
    # AES-256-GCM for Small Data
    # =========================================================================

    def encrypt_bytes(
        self,
        plaintext: bytes,
        workspace_id: UUID,
    ) -> tuple[bytes, bytes]:
        """Encrypt bytes using AES-256-GCM (for small data).

        Use this for small pieces of data like credentials or API keys.
        For large files, use streaming encryption instead.

        Args:
            plaintext: Data to encrypt
            workspace_id: Workspace UUID for key derivation

        Returns:
            Tuple of (ciphertext_with_tag, iv)
        """
        key = self.derive_workspace_key(workspace_id)
        aesgcm = AESGCM(key)
        iv = os.urandom(GCM_IV_SIZE)

        # Encrypt (returns ciphertext + auth tag)
        ciphertext = aesgcm.encrypt(iv, plaintext, None)

        return ciphertext, iv

    def decrypt_bytes(
        self,
        ciphertext: bytes,
        iv: bytes,
        workspace_id: UUID,
    ) -> bytes:
        """Decrypt bytes using AES-256-GCM.

        Args:
            ciphertext: Encrypted data with auth tag
            iv: 12-byte initialization vector
            workspace_id: Workspace UUID for key derivation

        Returns:
            Decrypted plaintext

        Raises:
            DecryptionError: If decryption fails
        """
        key = self.derive_workspace_key(workspace_id)
        aesgcm = AESGCM(key)

        try:
            return aesgcm.decrypt(iv, ciphertext, None)
        except Exception as e:
            raise DecryptionError(f"GCM decryption failed: {e}") from e

    def encrypt_string(
        self,
        plaintext: str,
        workspace_id: UUID,
    ) -> tuple[str, str]:
        """Encrypt a string and return base64-encoded result.

        Convenience method for encrypting text data with base64 encoding.

        Args:
            plaintext: String to encrypt
            workspace_id: Workspace UUID for key derivation

        Returns:
            Tuple of (base64_ciphertext, base64_iv)
        """
        ciphertext, iv = self.encrypt_bytes(
            plaintext.encode("utf-8"),
            workspace_id,
        )
        return (
            base64.b64encode(ciphertext).decode("utf-8"),
            base64.b64encode(iv).decode("utf-8"),
        )

    def decrypt_string(
        self,
        ciphertext_b64: str,
        iv_b64: str,
        workspace_id: UUID,
    ) -> str:
        """Decrypt a base64-encoded ciphertext to string.

        Args:
            ciphertext_b64: Base64-encoded ciphertext
            iv_b64: Base64-encoded IV
            workspace_id: Workspace UUID for key derivation

        Returns:
            Decrypted string

        Raises:
            DecryptionError: If decryption fails
        """
        ciphertext = base64.b64decode(ciphertext_b64)
        iv = base64.b64decode(iv_b64)

        plaintext = self.decrypt_bytes(ciphertext, iv, workspace_id)
        return plaintext.decode("utf-8")

    # =========================================================================
    # User-Scoped Encryption (for API keys, etc.)
    # =========================================================================

    def encrypt_user_secret(
        self,
        secret: str,
        user_id: UUID,
        workspace_id: UUID,
    ) -> tuple[bytes, bytes]:
        """Encrypt a user secret using user-scoped AES-256-GCM.

        Use this for sensitive user data like API keys that should
        only be accessible to a specific user within a workspace.

        Args:
            secret: Plaintext secret to encrypt
            user_id: User UUID for key derivation
            workspace_id: Workspace UUID for key derivation

        Returns:
            Tuple of (ciphertext_with_tag, iv)
        """
        key = self.derive_user_key(user_id, workspace_id)
        aesgcm = AESGCM(key)
        iv = os.urandom(GCM_IV_SIZE)

        ciphertext = aesgcm.encrypt(iv, secret.encode("utf-8"), None)

        return ciphertext, iv

    def decrypt_user_secret(
        self,
        ciphertext: bytes,
        iv: bytes,
        user_id: UUID,
        workspace_id: UUID,
    ) -> str:
        """Decrypt a user secret using user-scoped AES-256-GCM.

        Args:
            ciphertext: Encrypted data with auth tag
            iv: Initialization vector
            user_id: User UUID for key derivation
            workspace_id: Workspace UUID for key derivation

        Returns:
            Decrypted secret as string

        Raises:
            DecryptionError: If decryption fails
        """
        key = self.derive_user_key(user_id, workspace_id)
        aesgcm = AESGCM(key)

        try:
            plaintext = aesgcm.decrypt(iv, ciphertext, None)
            return plaintext.decode("utf-8")
        except Exception as e:
            raise DecryptionError("User secret decryption failed") from e


# =============================================================================
# Singleton Instance
# =============================================================================

_encryption_service: Optional[EncryptionService] = None


def get_encryption_service() -> EncryptionService:
    """Get singleton encryption service instance.

    Returns:
        EncryptionService instance
    """
    global _encryption_service
    if _encryption_service is None:
        _encryption_service = EncryptionService()
    return _encryption_service


def reset_encryption_service() -> None:
    """Reset singleton instance (for testing)."""
    global _encryption_service
    _encryption_service = None


# =============================================================================
# Module Exports
# =============================================================================

__all__ = [
    # Service
    "EncryptionService",
    "get_encryption_service",
    "reset_encryption_service",
    # Streaming classes
    "StreamingEncryptor",
    "StreamingDecryptor",
    # Exceptions
    "EncryptionError",
    "MasterKeyError",
    "HMACVerificationError",
    "DecryptionError",
    # Constants
    "STREAMING_CHUNK_SIZE",
    "STREAMING_ALGORITHM",
    "GCM_IV_SIZE",
    "CTR_IV_SIZE",
]
