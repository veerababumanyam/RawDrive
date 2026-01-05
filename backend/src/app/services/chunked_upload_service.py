"""Chunked Upload Service.

Manages chunked file uploads using Redis for temporary chunk storage.
Supports TUS protocol for resumable uploads.

Chunks are stored in Redis with 1-hour expiry and assembled
when the upload is committed.
"""

from __future__ import annotations

import logging
from typing import AsyncIterator, Optional
from uuid import UUID

logger = logging.getLogger(__name__)

# Chunk expiry in seconds (1 hour)
CHUNK_EXPIRY_SECONDS = 3600

# Maximum chunk size (10MB - safety limit)
MAX_CHUNK_SIZE = 10 * 1024 * 1024


class ChunkError(Exception):
    """Exception for chunk-related errors."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


class ChunkedUploadService:
    """Service for managing chunked file uploads.

    Stores chunks in Redis with automatic expiry and provides
    streaming assembly for memory-efficient processing.
    """

    def __init__(self):
        self._redis_client = None

    async def _get_redis(self):
        """Get Redis client lazily."""
        if self._redis_client is None:
            from app.db.redis import get_redis_client
            self._redis_client = await get_redis_client()
        return self._redis_client

    def _chunk_key(self, workspace_id: UUID, upload_id: UUID, offset: int) -> str:
        """Generate Redis key for a chunk."""
        return f"chunk:{workspace_id}:{upload_id}:{offset}"

    def _metadata_key(self, workspace_id: UUID, upload_id: UUID) -> str:
        """Generate Redis key for upload metadata."""
        return f"chunk_meta:{workspace_id}:{upload_id}"

    async def store_chunk(
        self,
        workspace_id: UUID,
        upload_id: UUID,
        offset: int,
        chunk_data: bytes,
    ) -> int:
        """Store a chunk of file data.

        Args:
            workspace_id: Workspace ID
            upload_id: Upload session ID
            offset: Byte offset where this chunk starts
            chunk_data: Chunk bytes

        Returns:
            New offset (offset + len(chunk_data))

        Raises:
            ChunkError: If chunk is too large or offset mismatch
        """
        if len(chunk_data) > MAX_CHUNK_SIZE:
            raise ChunkError(f"Chunk too large: {len(chunk_data)} > {MAX_CHUNK_SIZE}")

        redis = await self._get_redis()

        # Get current expected offset from metadata
        meta_key = self._metadata_key(workspace_id, upload_id)
        current_offset_str = await redis.get(meta_key)
        current_offset = int(current_offset_str) if current_offset_str else 0

        # Verify offset matches expected (TUS protocol requirement)
        if offset != current_offset:
            raise ChunkError(
                f"Offset mismatch: expected {current_offset}, got {offset}",
                status=409,
            )

        # Store chunk
        chunk_key = self._chunk_key(workspace_id, upload_id, offset)
        await redis.setex(chunk_key, CHUNK_EXPIRY_SECONDS, chunk_data)

        # Update metadata with new offset
        new_offset = offset + len(chunk_data)
        await redis.setex(meta_key, CHUNK_EXPIRY_SECONDS, str(new_offset))

        logger.debug(
            f"Stored chunk for upload {upload_id}: offset={offset}, "
            f"size={len(chunk_data)}, new_offset={new_offset}"
        )

        return new_offset

    async def get_current_offset(
        self,
        workspace_id: UUID,
        upload_id: UUID,
    ) -> int:
        """Get current upload offset for resuming.

        Args:
            workspace_id: Workspace ID
            upload_id: Upload session ID

        Returns:
            Current byte offset (0 if no chunks stored)
        """
        redis = await self._get_redis()
        meta_key = self._metadata_key(workspace_id, upload_id)
        offset_str = await redis.get(meta_key)
        return int(offset_str) if offset_str else 0

    async def assemble_file(
        self,
        workspace_id: UUID,
        upload_id: UUID,
        total_size: int,
    ) -> AsyncIterator[bytes]:
        """Assemble chunks into a file stream.

        Yields chunks in order for streaming processing.
        Does NOT load entire file into memory.

        Args:
            workspace_id: Workspace ID
            upload_id: Upload session ID
            total_size: Expected total file size

        Yields:
            Chunk bytes in order

        Raises:
            ChunkError: If chunks are missing or incomplete
        """
        redis = await self._get_redis()
        offset = 0

        while offset < total_size:
            chunk_key = self._chunk_key(workspace_id, upload_id, offset)
            chunk_data = await redis.get(chunk_key)

            if chunk_data is None:
                raise ChunkError(
                    f"Missing chunk at offset {offset} for upload {upload_id}",
                    status=400,
                )

            yield chunk_data
            offset += len(chunk_data)

        # Verify we got all the data
        if offset != total_size:
            raise ChunkError(
                f"Size mismatch: expected {total_size}, got {offset}",
                status=400,
            )

    async def assemble_file_to_bytes(
        self,
        workspace_id: UUID,
        upload_id: UUID,
        total_size: int,
    ) -> bytes:
        """Assemble chunks into complete bytes.

        WARNING: Loads entire file into memory. Use assemble_file()
        for large files with streaming processing.

        Args:
            workspace_id: Workspace ID
            upload_id: Upload session ID
            total_size: Expected total file size

        Returns:
            Complete file bytes

        Raises:
            ChunkError: If chunks are missing or incomplete
        """
        chunks = []
        async for chunk in self.assemble_file(workspace_id, upload_id, total_size):
            chunks.append(chunk)
        return b"".join(chunks)

    async def cleanup_chunks(
        self,
        workspace_id: UUID,
        upload_id: UUID,
        total_size: Optional[int] = None,
    ) -> None:
        """Delete all chunks for an upload.

        Called after successful upload or on cancellation.

        Args:
            workspace_id: Workspace ID
            upload_id: Upload session ID
            total_size: If known, delete all chunks up to this size
        """
        redis = await self._get_redis()

        # Delete metadata
        meta_key = self._metadata_key(workspace_id, upload_id)
        await redis.delete(meta_key)

        # If we know total size, delete chunks directly
        if total_size:
            offset = 0
            chunk_size_estimate = 5 * 1024 * 1024  # 5MB estimate
            while offset < total_size:
                chunk_key = self._chunk_key(workspace_id, upload_id, offset)
                await redis.delete(chunk_key)
                offset += chunk_size_estimate
        else:
            # Pattern-based cleanup (less efficient but handles unknown sizes)
            # Note: SCAN is preferred over KEYS in production
            pattern = f"chunk:{workspace_id}:{upload_id}:*"
            cursor = 0
            while True:
                cursor, keys = await redis.scan(cursor, match=pattern, count=100)
                if keys:
                    await redis.delete(*keys)
                if cursor == 0:
                    break

        logger.debug(f"Cleaned up chunks for upload {upload_id}")


# Singleton instance
_chunked_upload_service: Optional[ChunkedUploadService] = None


def get_chunked_upload_service() -> ChunkedUploadService:
    """Get the chunked upload service singleton."""
    global _chunked_upload_service
    if _chunked_upload_service is None:
        _chunked_upload_service = ChunkedUploadService()
    return _chunked_upload_service
