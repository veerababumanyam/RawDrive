"""Chunked Upload Service for TUS Protocol Handling.

Manages chunked file uploads using Redis for temporary chunk storage.
Supports TUS protocol (https://tus.io/) for resumable uploads.

This is the migrated version from the monolith, adapted for microservice architecture:
- Uses the centralized Redis module from app.core.redis
- Supports 50K concurrent uploads via Redis connection pooling
- Implements TUS protocol headers and offset verification
- Provides streaming assembly for memory-efficient processing
- Includes SHA256 verification for chunk integrity

Chunks are stored in Redis with configurable expiry (24 hours default)
and assembled when the upload is committed.

Author: Claude Code Migration
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from typing import Any, AsyncIterator, Optional
from uuid import UUID

from app.core.config import get_settings
from app.core.redis import (
    get_redis,
    make_chunk_key,
    make_chunk_metadata_key,
    make_upload_lock_key,
    redis_pipeline,
    with_redis_retry,
)

logger = logging.getLogger(__name__)


# =============================================================================
# Constants
# =============================================================================

# Default chunk expiry (can be overridden by settings)
DEFAULT_CHUNK_EXPIRY_SECONDS = 86400  # 24 hours

# Maximum chunk size (safety limit to prevent abuse)
MAX_CHUNK_SIZE = 10 * 1024 * 1024  # 10MB

# Minimum chunk size (below this is inefficient)
MIN_CHUNK_SIZE = 256 * 1024  # 256KB

# Lock timeout for concurrent upload protection
UPLOAD_LOCK_TIMEOUT = 60  # seconds


# =============================================================================
# Exceptions
# =============================================================================


class ChunkError(Exception):
    """Exception for chunk-related errors.

    Attributes:
        message: Human-readable error message
        status: HTTP status code to return
        code: Machine-readable error code for client handling
        offset: Current expected offset (for TUS Upload-Offset response)
    """

    def __init__(
        self,
        message: str,
        status: int = 400,
        code: str = "CHUNK_ERROR",
        offset: Optional[int] = None,
    ):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code
        self.offset = offset

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON response."""
        result = {
            "error": self.code,
            "message": self.message,
            "status": self.status,
        }
        if self.offset is not None:
            result["offset"] = self.offset
        return result


class OffsetMismatchError(ChunkError):
    """Chunk offset doesn't match expected position (TUS protocol requirement)."""

    def __init__(self, expected: int, received: int):
        super().__init__(
            f"Offset mismatch: expected {expected}, received {received}",
            status=409,  # Conflict
            code="OFFSET_MISMATCH",
            offset=expected,
        )
        self.expected = expected
        self.received = received


class ChunkTooLargeError(ChunkError):
    """Chunk exceeds maximum allowed size."""

    def __init__(self, size: int, max_size: int = MAX_CHUNK_SIZE):
        super().__init__(
            f"Chunk too large: {size} bytes exceeds maximum {max_size} bytes",
            status=413,  # Payload Too Large
            code="CHUNK_TOO_LARGE",
        )
        self.size = size
        self.max_size = max_size


class ChunkNotFoundError(ChunkError):
    """Required chunk is missing from Redis."""

    def __init__(self, upload_id: UUID, offset: int):
        super().__init__(
            f"Missing chunk at offset {offset} for upload {upload_id}",
            status=404,
            code="CHUNK_NOT_FOUND",
            offset=offset,
        )
        self.upload_id = upload_id
        self.missing_offset = offset


class AssemblyError(ChunkError):
    """Error during file assembly from chunks."""

    def __init__(self, message: str, upload_id: UUID):
        super().__init__(
            message,
            status=500,
            code="ASSEMBLY_ERROR",
        )
        self.upload_id = upload_id


class ChecksumVerificationError(ChunkError):
    """Chunk SHA256 checksum verification failed."""

    def __init__(self, expected: str, actual: str, offset: int):
        super().__init__(
            f"Chunk checksum mismatch at offset {offset}: expected {expected}, got {actual}",
            status=400,
            code="CHECKSUM_MISMATCH",
            offset=offset,
        )
        self.expected = expected
        self.actual = actual


# =============================================================================
# Data Classes
# =============================================================================


@dataclass
class ChunkMetadata:
    """Metadata about the current upload state in Redis.

    Used to track upload progress and enable resumption.
    """

    upload_id: UUID
    workspace_id: UUID
    current_offset: int
    total_size: Optional[int]
    chunk_count: int
    checksum_algo: Optional[str]
    last_chunk_sha256: Optional[str]

    @classmethod
    def from_redis_hash(
        cls,
        upload_id: UUID,
        workspace_id: UUID,
        data: dict[bytes, bytes],
    ) -> "ChunkMetadata":
        """Create ChunkMetadata from Redis hash data."""

        def get_int(key: str, default: int = 0) -> int:
            val = data.get(key.encode())
            return int(val) if val else default

        def get_str(key: str) -> Optional[str]:
            val = data.get(key.encode())
            return val.decode("utf-8") if val else None

        return cls(
            upload_id=upload_id,
            workspace_id=workspace_id,
            current_offset=get_int("current_offset", 0),
            total_size=get_int("total_size", 0) or None,
            chunk_count=get_int("chunk_count", 0),
            checksum_algo=get_str("checksum_algo"),
            last_chunk_sha256=get_str("last_chunk_sha256"),
        )

    def to_redis_hash(self) -> dict[str, str]:
        """Convert to Redis hash format for storage."""
        data = {
            "current_offset": str(self.current_offset),
            "chunk_count": str(self.chunk_count),
        }
        if self.total_size is not None:
            data["total_size"] = str(self.total_size)
        if self.checksum_algo:
            data["checksum_algo"] = self.checksum_algo
        if self.last_chunk_sha256:
            data["last_chunk_sha256"] = self.last_chunk_sha256
        return data


@dataclass
class TUSHeaders:
    """TUS protocol headers for responses.

    Contains all headers required for TUS protocol compliance.
    """

    upload_offset: int
    upload_length: Optional[int] = None
    tus_resumable: str = "1.0.0"
    tus_version: str = "1.0.0"
    tus_extension: str = "creation,creation-with-upload,termination,checksum"
    tus_max_size: Optional[int] = None
    tus_checksum_algorithm: str = "sha256"

    def to_dict(self) -> dict[str, str]:
        """Convert to HTTP headers dictionary."""
        headers = {
            "Upload-Offset": str(self.upload_offset),
            "Tus-Resumable": self.tus_resumable,
            "Tus-Version": self.tus_version,
            "Tus-Extension": self.tus_extension,
            "Tus-Checksum-Algorithm": self.tus_checksum_algorithm,
        }
        if self.upload_length is not None:
            headers["Upload-Length"] = str(self.upload_length)
        if self.tus_max_size is not None:
            headers["Tus-Max-Size"] = str(self.tus_max_size)
        return headers


# =============================================================================
# Chunked Upload Service
# =============================================================================


class ChunkedUploadService:
    """Service for managing chunked file uploads with TUS protocol support.

    Stores chunks in Redis with automatic expiry and provides streaming
    assembly for memory-efficient processing. Implements TUS protocol
    semantics for resumable uploads.

    Key features:
    - TUS protocol compliance (offset verification, resume support)
    - Redis-based chunk storage with TTL
    - Streaming assembly (no full file in memory)
    - SHA256 checksum verification
    - Concurrent upload protection via locks

    Usage:
        service = get_chunked_upload_service()

        # Store chunks
        new_offset = await service.store_chunk(
            workspace_id, upload_id, offset=0, chunk_data=data
        )

        # Get resume offset
        offset = await service.get_current_offset(workspace_id, upload_id)

        # Assemble file (streaming)
        async for chunk in service.assemble_file(workspace_id, upload_id, total_size):
            # Process chunk
            pass

        # Cleanup
        await service.cleanup_chunks(workspace_id, upload_id)
    """

    def __init__(self) -> None:
        """Initialize the chunked upload service."""
        self._settings = get_settings()

    # =========================================================================
    # Redis Key Generation (delegates to core module for consistency)
    # =========================================================================

    def _chunk_key(self, workspace_id: UUID, upload_id: UUID, offset: int) -> str:
        """Generate Redis key for a chunk."""
        return make_chunk_key(str(workspace_id), str(upload_id), offset)

    def _metadata_key(self, workspace_id: UUID, upload_id: UUID) -> str:
        """Generate Redis key for upload metadata."""
        return make_chunk_metadata_key(str(workspace_id), str(upload_id))

    def _lock_key(self, workspace_id: UUID, upload_id: UUID) -> str:
        """Generate Redis key for upload lock."""
        return make_upload_lock_key(str(workspace_id), str(upload_id))

    # =========================================================================
    # Chunk TTL Management
    # =========================================================================

    @property
    def chunk_ttl(self) -> int:
        """Get chunk TTL in seconds from settings."""
        return self._settings.CHUNK_TTL_SECONDS

    @property
    def metadata_ttl(self) -> int:
        """Get metadata TTL in seconds from settings."""
        return self._settings.CHUNK_METADATA_TTL_SECONDS

    @property
    def max_chunk_size(self) -> int:
        """Get maximum chunk size from settings."""
        return self._settings.MAX_CHUNK_SIZE_BYTES

    # =========================================================================
    # TUS Protocol Headers
    # =========================================================================

    def get_tus_headers(
        self,
        offset: int,
        total_size: Optional[int] = None,
    ) -> TUSHeaders:
        """Generate TUS protocol response headers.

        Args:
            offset: Current upload offset
            total_size: Total upload size (Upload-Length header)

        Returns:
            TUSHeaders with all required TUS headers
        """
        return TUSHeaders(
            upload_offset=offset,
            upload_length=total_size,
            tus_resumable=self._settings.TUS_RESUMABLE_VERSION,
            tus_max_size=self._settings.TUS_MAX_SIZE,
            tus_extension=self._settings.TUS_EXTENSIONS,
        )

    # =========================================================================
    # Chunk Storage Operations
    # =========================================================================

    @with_redis_retry()
    async def store_chunk(
        self,
        workspace_id: UUID,
        upload_id: UUID,
        offset: int,
        chunk_data: bytes,
        checksum: Optional[str] = None,
        checksum_algo: str = "sha256",
    ) -> int:
        """Store a chunk of file data with TUS protocol offset verification.

        Implements TUS protocol requirements:
        - Verifies offset matches expected position
        - Returns new offset for next chunk
        - Supports checksum verification

        Args:
            workspace_id: Workspace ID for isolation
            upload_id: Upload session ID
            offset: Byte offset where this chunk starts (TUS Upload-Offset)
            chunk_data: Chunk bytes
            checksum: Optional SHA256 checksum for verification
            checksum_algo: Checksum algorithm (only "sha256" supported)

        Returns:
            New offset (offset + len(chunk_data)) for Upload-Offset response

        Raises:
            ChunkTooLargeError: If chunk exceeds maximum size
            OffsetMismatchError: If offset doesn't match expected position
            ChecksumVerificationError: If checksum verification fails
        """
        chunk_size = len(chunk_data)

        # Validate chunk size
        if chunk_size > self.max_chunk_size:
            raise ChunkTooLargeError(chunk_size, self.max_chunk_size)

        if chunk_size == 0:
            logger.warning(
                "Received empty chunk",
                extra={
                    "upload_id": str(upload_id),
                    "offset": offset,
                },
            )
            # Empty chunk is valid in TUS (e.g., for probe requests)
            return offset

        # Verify checksum if provided
        if checksum and checksum_algo == "sha256":
            computed = hashlib.sha256(chunk_data).hexdigest()
            if computed != checksum:
                raise ChecksumVerificationError(checksum, computed, offset)

        redis = await get_redis()

        # Get current expected offset from metadata
        meta_key = self._metadata_key(workspace_id, upload_id)
        current_offset_bytes = await redis.hget(meta_key, "current_offset")
        current_offset = int(current_offset_bytes) if current_offset_bytes else 0

        # TUS protocol: verify offset matches expected position
        if offset != current_offset:
            raise OffsetMismatchError(current_offset, offset)

        # Store chunk and update metadata atomically using pipeline
        chunk_key = self._chunk_key(workspace_id, upload_id, offset)
        new_offset = offset + chunk_size

        async with redis_pipeline() as pipe:
            # Store chunk data with TTL
            pipe.setex(chunk_key, self.chunk_ttl, chunk_data)

            # Update metadata
            pipe.hset(meta_key, "current_offset", str(new_offset))
            pipe.hset(meta_key, "chunk_count", str(current_offset // self.max_chunk_size + 1))

            if checksum:
                pipe.hset(meta_key, "last_chunk_sha256", checksum)

            # Refresh metadata TTL
            pipe.expire(meta_key, self.metadata_ttl)

            await pipe.execute()

        logger.debug(
            "Stored chunk",
            extra={
                "upload_id": str(upload_id),
                "workspace_id": str(workspace_id),
                "offset": offset,
                "size": chunk_size,
                "new_offset": new_offset,
            },
        )

        return new_offset

    @with_redis_retry()
    async def get_current_offset(
        self,
        workspace_id: UUID,
        upload_id: UUID,
    ) -> int:
        """Get current upload offset for TUS HEAD request / resume support.

        Used for:
        - TUS HEAD requests to check upload progress
        - Resume functionality after connection interruption
        - Upload-Offset response header

        Args:
            workspace_id: Workspace ID
            upload_id: Upload session ID

        Returns:
            Current byte offset (0 if no chunks stored)
        """
        redis = await get_redis()
        meta_key = self._metadata_key(workspace_id, upload_id)
        offset_bytes = await redis.hget(meta_key, "current_offset")
        return int(offset_bytes) if offset_bytes else 0

    @with_redis_retry()
    async def get_metadata(
        self,
        workspace_id: UUID,
        upload_id: UUID,
    ) -> Optional[ChunkMetadata]:
        """Get full upload metadata from Redis.

        Args:
            workspace_id: Workspace ID
            upload_id: Upload session ID

        Returns:
            ChunkMetadata if exists, None if upload not found
        """
        redis = await get_redis()
        meta_key = self._metadata_key(workspace_id, upload_id)
        data = await redis.hgetall(meta_key)

        if not data:
            return None

        return ChunkMetadata.from_redis_hash(upload_id, workspace_id, data)

    @with_redis_retry()
    async def initialize_upload(
        self,
        workspace_id: UUID,
        upload_id: UUID,
        total_size: Optional[int] = None,
        checksum_algo: str = "sha256",
    ) -> None:
        """Initialize upload metadata in Redis.

        Called when creating a new upload session to set up Redis metadata.

        Args:
            workspace_id: Workspace ID
            upload_id: Upload session ID
            total_size: Expected total file size (if known)
            checksum_algo: Checksum algorithm for verification
        """
        redis = await get_redis()
        meta_key = self._metadata_key(workspace_id, upload_id)

        metadata = ChunkMetadata(
            upload_id=upload_id,
            workspace_id=workspace_id,
            current_offset=0,
            total_size=total_size,
            chunk_count=0,
            checksum_algo=checksum_algo,
            last_chunk_sha256=None,
        )

        await redis.hmset(meta_key, metadata.to_redis_hash())
        await redis.expire(meta_key, self.metadata_ttl)

        logger.debug(
            "Initialized upload metadata",
            extra={
                "upload_id": str(upload_id),
                "workspace_id": str(workspace_id),
                "total_size": total_size,
            },
        )

    # =========================================================================
    # Chunk Assembly Operations
    # =========================================================================

    async def assemble_file(
        self,
        workspace_id: UUID,
        upload_id: UUID,
        total_size: int,
    ) -> AsyncIterator[bytes]:
        """Assemble chunks into a file stream.

        Yields chunks in order for streaming processing.
        Does NOT load entire file into memory - ideal for large files.

        This method is designed for:
        - Streaming encryption
        - Streaming upload to R2/S3
        - Computing file hash while streaming

        Args:
            workspace_id: Workspace ID
            upload_id: Upload session ID
            total_size: Expected total file size (for verification)

        Yields:
            Chunk bytes in order

        Raises:
            ChunkNotFoundError: If a required chunk is missing
            AssemblyError: If final size doesn't match expected
        """
        redis = await get_redis()
        offset = 0
        assembled_size = 0

        while offset < total_size:
            chunk_key = self._chunk_key(workspace_id, upload_id, offset)
            chunk_data = await redis.get(chunk_key)

            if chunk_data is None:
                raise ChunkNotFoundError(upload_id, offset)

            chunk_size = len(chunk_data)
            assembled_size += chunk_size

            logger.debug(
                "Yielding chunk",
                extra={
                    "upload_id": str(upload_id),
                    "offset": offset,
                    "chunk_size": chunk_size,
                    "assembled_size": assembled_size,
                },
            )

            yield chunk_data
            offset += chunk_size

        # Verify total size matches
        if assembled_size != total_size:
            raise AssemblyError(
                f"Size mismatch: expected {total_size}, assembled {assembled_size}",
                upload_id,
            )

    async def assemble_file_to_bytes(
        self,
        workspace_id: UUID,
        upload_id: UUID,
        total_size: int,
    ) -> bytes:
        """Assemble chunks into complete bytes.

        WARNING: Loads entire file into memory. Only use for small files
        or when you need the complete bytes. For large files, use
        assemble_file() with streaming processing.

        Args:
            workspace_id: Workspace ID
            upload_id: Upload session ID
            total_size: Expected total file size

        Returns:
            Complete file bytes

        Raises:
            ChunkNotFoundError: If chunks are missing
            AssemblyError: If size verification fails
        """
        chunks: list[bytes] = []
        async for chunk in self.assemble_file(workspace_id, upload_id, total_size):
            chunks.append(chunk)
        return b"".join(chunks)

    async def compute_file_hash(
        self,
        workspace_id: UUID,
        upload_id: UUID,
        total_size: int,
    ) -> str:
        """Compute SHA256 hash of assembled file without loading into memory.

        Streams chunks through hash computation - memory efficient for
        large files.

        Args:
            workspace_id: Workspace ID
            upload_id: Upload session ID
            total_size: Expected total file size

        Returns:
            SHA256 hex digest of complete file

        Raises:
            ChunkNotFoundError: If chunks are missing
            AssemblyError: If size verification fails
        """
        hasher = hashlib.sha256()
        async for chunk in self.assemble_file(workspace_id, upload_id, total_size):
            hasher.update(chunk)
        return hasher.hexdigest()

    # =========================================================================
    # Cleanup Operations
    # =========================================================================

    @with_redis_retry()
    async def cleanup_chunks(
        self,
        workspace_id: UUID,
        upload_id: UUID,
        total_size: Optional[int] = None,
    ) -> int:
        """Delete all chunks and metadata for an upload.

        Called after:
        - Successful upload commit
        - Upload cancellation (TUS DELETE)
        - Session expiry cleanup

        Args:
            workspace_id: Workspace ID
            upload_id: Upload session ID
            total_size: If known, enables more efficient direct cleanup

        Returns:
            Number of keys deleted
        """
        redis = await get_redis()
        deleted_count = 0

        # Delete metadata first
        meta_key = self._metadata_key(workspace_id, upload_id)
        deleted_count += await redis.delete(meta_key)

        # Delete lock if exists
        lock_key = self._lock_key(workspace_id, upload_id)
        deleted_count += await redis.delete(lock_key)

        # Delete chunks
        if total_size:
            # Direct deletion when we know the size
            offset = 0
            while offset <= total_size:
                chunk_key = self._chunk_key(workspace_id, upload_id, offset)
                deleted_count += await redis.delete(chunk_key)
                offset += self.max_chunk_size
        else:
            # Pattern-based cleanup using SCAN (safer than KEYS in production)
            pattern = f"chunk:{workspace_id}:{upload_id}:*"
            cursor = 0
            while True:
                cursor, keys = await redis.scan(cursor, match=pattern, count=100)
                if keys:
                    # Keys are returned as bytes
                    str_keys = [k.decode() if isinstance(k, bytes) else k for k in keys]
                    deleted_count += await redis.delete(*str_keys)
                if cursor == 0:
                    break

        logger.info(
            "Cleaned up chunks",
            extra={
                "upload_id": str(upload_id),
                "workspace_id": str(workspace_id),
                "deleted_keys": deleted_count,
            },
        )

        return deleted_count

    @with_redis_retry()
    async def extend_ttl(
        self,
        workspace_id: UUID,
        upload_id: UUID,
    ) -> bool:
        """Extend TTL for all chunks and metadata.

        Called when an upload is actively being used but taking longer
        than expected (e.g., slow network connection).

        Args:
            workspace_id: Workspace ID
            upload_id: Upload session ID

        Returns:
            True if TTL was extended, False if upload not found
        """
        redis = await get_redis()
        meta_key = self._metadata_key(workspace_id, upload_id)

        # Check if upload exists
        exists = await redis.exists(meta_key)
        if not exists:
            return False

        # Get current offset to know how many chunks to extend
        offset_bytes = await redis.hget(meta_key, "current_offset")
        current_offset = int(offset_bytes) if offset_bytes else 0

        # Extend metadata TTL
        await redis.expire(meta_key, self.metadata_ttl)

        # Extend chunk TTLs
        offset = 0
        while offset < current_offset:
            chunk_key = self._chunk_key(workspace_id, upload_id, offset)
            await redis.expire(chunk_key, self.chunk_ttl)
            offset += self.max_chunk_size

        logger.debug(
            "Extended TTL for upload",
            extra={
                "upload_id": str(upload_id),
                "current_offset": current_offset,
            },
        )

        return True

    # =========================================================================
    # Concurrent Upload Protection
    # =========================================================================

    @with_redis_retry()
    async def acquire_upload_lock(
        self,
        workspace_id: UUID,
        upload_id: UUID,
        timeout: int = UPLOAD_LOCK_TIMEOUT,
    ) -> bool:
        """Acquire exclusive lock for upload (prevent concurrent modifications).

        Used to prevent race conditions when multiple requests try to
        upload chunks for the same upload simultaneously.

        Args:
            workspace_id: Workspace ID
            upload_id: Upload session ID
            timeout: Lock timeout in seconds

        Returns:
            True if lock acquired, False if already locked
        """
        redis = await get_redis()
        lock_key = self._lock_key(workspace_id, upload_id)

        # Use SET NX with expiry for atomic lock acquisition
        acquired = await redis.set(lock_key, b"1", ex=timeout, nx=True)
        return bool(acquired)

    @with_redis_retry()
    async def release_upload_lock(
        self,
        workspace_id: UUID,
        upload_id: UUID,
    ) -> bool:
        """Release upload lock.

        Args:
            workspace_id: Workspace ID
            upload_id: Upload session ID

        Returns:
            True if lock was released, False if no lock existed
        """
        redis = await get_redis()
        lock_key = self._lock_key(workspace_id, upload_id)
        deleted = await redis.delete(lock_key)
        return deleted > 0


# =============================================================================
# Singleton Instance
# =============================================================================

_chunked_upload_service: Optional[ChunkedUploadService] = None


def get_chunked_upload_service() -> ChunkedUploadService:
    """Get singleton chunked upload service instance.

    Returns:
        ChunkedUploadService instance
    """
    global _chunked_upload_service
    if _chunked_upload_service is None:
        _chunked_upload_service = ChunkedUploadService()
    return _chunked_upload_service


def reset_chunked_upload_service() -> None:
    """Reset singleton instance (for testing)."""
    global _chunked_upload_service
    _chunked_upload_service = None


# =============================================================================
# Module Exports
# =============================================================================

__all__ = [
    # Service
    "ChunkedUploadService",
    "get_chunked_upload_service",
    "reset_chunked_upload_service",
    # Data classes
    "ChunkMetadata",
    "TUSHeaders",
    # Exceptions
    "ChunkError",
    "OffsetMismatchError",
    "ChunkTooLargeError",
    "ChunkNotFoundError",
    "AssemblyError",
    "ChecksumVerificationError",
    # Constants
    "MAX_CHUNK_SIZE",
    "MIN_CHUNK_SIZE",
    "DEFAULT_CHUNK_EXPIRY_SECONDS",
]
