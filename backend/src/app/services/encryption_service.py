"""EncryptionService: AES-256-GCM encryption/decryption with workspace-scoped keys.

Implements workspace key derivation using HKDF-SHA256 and supports key rotation.
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

from app.db.postgres import get_postgres_pool
from app.config.settings import AppSettings

logger = logging.getLogger(__name__)

# Master key from environment (32 bytes = 256 bits)
MASTER_KEY_ENV = "ENCRYPTION_MASTER_KEY"
HKDF_INFO = b"rawdrive-workspace-key"  # Context for HKDF
HKDF_USER_INFO = b"rawdrive-user-api-key"  # Context for user-scoped key derivation

# Streaming encryption constants
STREAMING_CHUNK_SIZE = 64 * 1024  # 64KB chunks for streaming
STREAMING_ALGORITHM = "AES-256-CTR-HMAC"  # Algorithm identifier for database


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

        iv_len = len(iv)
        tag_len = len(auth_tag)

        try:
            # AES-256-GCM path (iv=12, tag=16)
            if iv_len == 12 and tag_len == 16:
                aesgcm = AESGCM(key)
                encrypted_with_tag = encrypted_data + auth_tag
                plaintext = aesgcm.decrypt(iv, encrypted_with_tag, None)
                return plaintext

            # AES-256-CTR + HMAC path (iv=16, tag=32)
            # Files stored in R2 as: [IV (16 bytes)][ciphertext][HMAC (32 bytes)]
            if iv_len == 16 and tag_len == 32:
                # Extract IV, ciphertext, and HMAC from encrypted_data blob
                # The upload service stores files with IV and HMAC prepended/appended
                file_iv = encrypted_data[:16]
                file_hmac = encrypted_data[-32:]
                ciphertext_only = encrypted_data[16:-32]
                
                # Verify IV matches database (sanity check)
                if file_iv != iv:
                    raise EncryptionError(
                        "IV mismatch between database and file",
                        "IV_MISMATCH"
                    )
                
                # Verify HMAC matches database (sanity check)
                if file_hmac != auth_tag:
                    # Use file HMAC for verification (it's the source of truth)
                    auth_tag = file_hmac
                
                # Two-pass decryption: first verify HMAC, then decrypt
                # Pass 1: Verify HMAC on IV + ciphertext
                verify_decryptor = StreamingDecryptor(key, iv)
                verify_decryptor.update_hmac(ciphertext_only)
                verify_decryptor.verify_hmac(auth_tag)
                
                # Pass 2: Decrypt (create fresh decryptor)
                decryptor = StreamingDecryptor(key, iv)
                plaintext = decryptor.decrypt_chunk(ciphertext_only) + decryptor.finalize()
                return plaintext

            # Unknown / unsupported format
            raise EncryptionError(
                f"Unsupported encryption metadata sizes (iv={iv_len}, tag={tag_len})",
                "UNSUPPORTED_ENCRYPTION_FORMAT",
            )
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

    # ─────────────────────────────────────────────────────────────────────────
    # STREAMING ENCRYPTION METHODS (for large files)
    # ─────────────────────────────────────────────────────────────────────────

    async def encrypt_file_streaming(
        self,
        data_iterator: AsyncIterator[bytes],
        workspace_id: UUID,
        asset_id: UUID,
        variant: str = "original",
        key_version: Optional[int] = None,
    ) -> AsyncIterator[bytes]:
        """Encrypt file using streaming AES-256-CTR + HMAC.

        Memory-efficient: processes data in chunks without loading entire file.
        First yields IV (16 bytes), then encrypted chunks, finally HMAC (32 bytes).

        Args:
            data_iterator: Async iterator of plaintext chunks
            workspace_id: Workspace UUID
            asset_id: Asset UUID
            variant: File variant ('original', 'thumbnail', etc.)
            key_version: Key version to use (None = latest active)

        Yields:
            First: 16-byte IV
            Middle: Encrypted chunks (same size as input)
            Last: 32-byte HMAC

        Note:
            Caller should store the IV and HMAC for decryption.
            This method also stores metadata in database.
        """
        # Get workspace key
        key, version = await self.get_workspace_key(workspace_id, key_version)

        # Create streaming encryptor
        encryptor = StreamingEncryptor(key)

        # Yield IV first (needed for decryption)
        yield encryptor.iv

        # Encrypt chunks as they come
        async for chunk in data_iterator:
            if chunk:  # Skip empty chunks
                yield encryptor.encrypt_chunk(chunk)

        # Finalize and get HMAC
        hmac_tag = encryptor.finalize()

        # Store encryption metadata in database
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO asset_encryption (
                    asset_id, workspace_id, variant, key_version, iv, auth_tag, algorithm
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (asset_id, variant) DO UPDATE SET
                    key_version = EXCLUDED.key_version,
                    iv = EXCLUDED.iv,
                    auth_tag = EXCLUDED.auth_tag,
                    algorithm = EXCLUDED.algorithm,
                    encrypted_at = NOW()
                """,
                asset_id,
                workspace_id,
                variant,
                version,
                base64.b64encode(encryptor.iv).decode("utf-8"),
                base64.b64encode(hmac_tag).decode("utf-8"),
                STREAMING_ALGORITHM,
            )

        # Yield HMAC last
        yield hmac_tag

    async def decrypt_file_streaming(
        self,
        data_iterator: AsyncIterator[bytes],
        workspace_id: UUID,
        asset_id: UUID,
        variant: str = "original",
        total_size: Optional[int] = None,
    ) -> AsyncIterator[bytes]:
        """Decrypt file using streaming AES-256-CTR + HMAC.

        SECURITY: This method reads the HMAC from the end of the stream,
        then verifies it before yielding any decrypted data.

        For very large files where you can't buffer, use the two-pass approach:
        1. First pass: Read all data to compute HMAC
        2. Second pass: Decrypt after verification

        Args:
            data_iterator: Async iterator of encrypted data
                          Format: [16-byte IV][ciphertext...][32-byte HMAC]
            workspace_id: Workspace UUID
            asset_id: Asset UUID
            variant: File variant ('original', 'thumbnail', etc.)
            total_size: Total size of encrypted data (optional, for optimization)

        Yields:
            Decrypted plaintext chunks

        Raises:
            EncryptionError: If HMAC verification fails
        """
        # Get encryption metadata from database
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT key_version, iv, auth_tag, algorithm
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
            expected_hmac = base64.b64decode(row["auth_tag"])
            algorithm = row.get("algorithm", "AES-256-GCM")

        # Get workspace key
        key, _ = await self.get_workspace_key(workspace_id, key_version)

        # Check if this is streaming format
        if algorithm != STREAMING_ALGORITHM:
            # Fall back to buffered decryption for GCM
            raise EncryptionError(
                f"Streaming decryption not supported for algorithm: {algorithm}. "
                "Use decrypt_file() instead.",
                "UNSUPPORTED_ALGORITHM",
            )

        # Collect all data for HMAC verification first
        # (Security requirement: verify before decrypting)
        all_chunks: list[bytes] = []
        async for chunk in data_iterator:
            all_chunks.append(chunk)

        if not all_chunks:
            raise EncryptionError("No data to decrypt", "EMPTY_DATA")

        # Concatenate and parse
        full_data = b"".join(all_chunks)

        # Extract IV from start (16 bytes) - should match stored IV
        if len(full_data) < 16 + 32:  # At least IV + HMAC
            raise EncryptionError("Data too short for streaming format", "INVALID_FORMAT")

        stream_iv = full_data[:16]
        ciphertext = full_data[16:-32]
        received_hmac = full_data[-32:]

        # Verify IV matches
        if stream_iv != iv:
            logger.warning(f"IV mismatch for asset {asset_id} - using stored IV")
            # Use stored IV as authoritative

        # Create decryptor with stored IV
        decryptor = StreamingDecryptor(key, iv)

        # Update HMAC with ciphertext
        decryptor.update_hmac(ciphertext)

        # Verify HMAC (raises on failure)
        decryptor.verify_hmac(expected_hmac)

        # Now safe to decrypt in chunks
        offset = 0
        chunk_size = STREAMING_CHUNK_SIZE
        while offset < len(ciphertext):
            chunk = ciphertext[offset : offset + chunk_size]
            yield decryptor.decrypt_chunk(chunk)
            offset += chunk_size

        # Finalize
        final = decryptor.finalize()
        if final:
            yield final

    def create_streaming_encryptor(self, workspace_key: bytes) -> StreamingEncryptor:
        """Create a streaming encryptor for manual chunk processing.

        Use this when you need fine-grained control over the encryption process,
        such as when integrating with S3 multipart upload.

        Args:
            workspace_key: 32-byte workspace encryption key

        Returns:
            StreamingEncryptor instance

        Example:
            key, version = await encryption_service.get_workspace_key(workspace_id)
            encryptor = encryption_service.create_streaming_encryptor(key)
            iv = encryptor.iv  # Store this

            for chunk in file_chunks:
                encrypted = encryptor.encrypt_chunk(chunk)
                yield encrypted

            hmac = encryptor.finalize()  # Store this
        """
        return StreamingEncryptor(workspace_key)

    def create_streaming_decryptor(
        self, workspace_key: bytes, iv: bytes
    ) -> StreamingDecryptor:
        """Create a streaming decryptor for manual chunk processing.

        Args:
            workspace_key: 32-byte workspace encryption key
            iv: 16-byte IV from encryption

        Returns:
            StreamingDecryptor instance

        Example:
            key, _ = await encryption_service.get_workspace_key(workspace_id)
            decryptor = encryption_service.create_streaming_decryptor(key, iv)

            # First pass: compute HMAC
            for chunk in encrypted_chunks:
                decryptor.update_hmac(chunk)
            decryptor.verify_hmac(expected_hmac)  # Raises on failure

            # Second pass: decrypt (only after verification)
            decryptor = encryption_service.create_streaming_decryptor(key, iv)
            for chunk in encrypted_chunks:
                plaintext = decryptor.decrypt_chunk(chunk)
                yield plaintext
        """
        return StreamingDecryptor(workspace_key, iv)


class StreamingEncryptor:
    """AES-256-CTR streaming encryptor with HMAC-SHA256 authentication.

    Uses Encrypt-then-MAC pattern:
    1. Encrypt each chunk with AES-CTR (streamable)
    2. Update HMAC with each ciphertext chunk
    3. Finalize HMAC at end for authentication

    Output format: [16-byte IV][ciphertext...][32-byte HMAC]
    """

    def __init__(self, key: bytes):
        """Initialize streaming encryptor.

        Args:
            key: 32-byte encryption key (will derive separate enc/mac keys)
        """
        # Derive separate keys for encryption and MAC (defense in depth)
        enc_key_derivation = HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=None,
            info=b"rawdrive-streaming-enc",
            backend=default_backend(),
        )
        mac_key_derivation = HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=None,
            info=b"rawdrive-streaming-mac",
            backend=default_backend(),
        )

        self._enc_key = enc_key_derivation.derive(key)
        self._mac_key = mac_key_derivation.derive(key)

        # Generate random IV (16 bytes for CTR mode)
        self._iv = os.urandom(16)

        # Create cipher
        cipher = Cipher(
            algorithms.AES(self._enc_key),
            modes.CTR(self._iv),
            backend=default_backend(),
        )
        self._encryptor = cipher.encryptor()

        # Create HMAC
        self._hmac = hmac.HMAC(self._mac_key, hashes.SHA256(), backend=default_backend())
        # Include IV in MAC for authentication
        self._hmac.update(self._iv)

        self._finalized = False

    @property
    def iv(self) -> bytes:
        """Get the initialization vector."""
        return self._iv

    def encrypt_chunk(self, plaintext: bytes) -> bytes:
        """Encrypt a chunk of data.

        Args:
            plaintext: Data to encrypt

        Returns:
            Encrypted ciphertext
        """
        if self._finalized:
            raise EncryptionError("Encryptor already finalized", "ENCRYPTOR_FINALIZED")

        ciphertext = self._encryptor.update(plaintext)
        # Update HMAC with ciphertext (Encrypt-then-MAC)
        self._hmac.update(ciphertext)
        return ciphertext

    def finalize(self) -> bytes:
        """Finalize encryption and return HMAC.

        Returns:
            32-byte HMAC tag
        """
        if self._finalized:
            raise EncryptionError("Encryptor already finalized", "ENCRYPTOR_FINALIZED")

        self._finalized = True
        # Finalize cipher (for CTR mode, this is typically empty)
        final_block = self._encryptor.finalize()
        if final_block:
            self._hmac.update(final_block)

        return self._hmac.finalize()


class StreamingDecryptor:
    """AES-256-CTR streaming decryptor with HMAC-SHA256 verification.

    Verifies HMAC before any decryption for security.
    For streaming, caller must verify HMAC before streaming decryption.
    """

    def __init__(self, key: bytes, iv: bytes):
        """Initialize streaming decryptor.

        Args:
            key: 32-byte encryption key
            iv: 16-byte initialization vector from encryption
        """
        # Derive same keys as encryptor
        enc_key_derivation = HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=None,
            info=b"rawdrive-streaming-enc",
            backend=default_backend(),
        )
        mac_key_derivation = HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=None,
            info=b"rawdrive-streaming-mac",
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
        self._hmac = hmac.HMAC(self._mac_key, hashes.SHA256(), backend=default_backend())
        self._hmac.update(iv)  # IV was included in MAC

        self._finalized = False

    def update_hmac(self, ciphertext: bytes) -> None:
        """Update HMAC with ciphertext chunk (for verification).

        Args:
            ciphertext: Encrypted data chunk
        """
        self._hmac.update(ciphertext)

    def verify_hmac(self, expected_hmac: bytes) -> bool:
        """Verify the HMAC.

        Args:
            expected_hmac: 32-byte HMAC from encryption

        Returns:
            True if valid

        Raises:
            EncryptionError: If HMAC verification fails
        """
        try:
            self._hmac.verify(expected_hmac)
            return True
        except Exception as e:
            raise EncryptionError(
                "HMAC verification failed - data may be corrupted or tampered",
                "HMAC_VERIFICATION_FAILED",
            ) from e

    def decrypt_chunk(self, ciphertext: bytes) -> bytes:
        """Decrypt a chunk of data.

        WARNING: Should only be called after verify_hmac() succeeds.

        Args:
            ciphertext: Encrypted data

        Returns:
            Decrypted plaintext
        """
        if self._finalized:
            raise EncryptionError("Decryptor already finalized", "DECRYPTOR_FINALIZED")

        return self._decryptor.update(ciphertext)

    def finalize(self) -> bytes:
        """Finalize decryption.

        Returns:
            Any remaining plaintext (usually empty for CTR)
        """
        if self._finalized:
            raise EncryptionError("Decryptor already finalized", "DECRYPTOR_FINALIZED")

        self._finalized = True
        return self._decryptor.finalize()


# Export singleton instance
_encryption_service: Optional[EncryptionService] = None


def get_encryption_service() -> EncryptionService:
    """Get singleton encryption service instance."""
    global _encryption_service
    if _encryption_service is None:
        _encryption_service = EncryptionService()
    return _encryption_service

