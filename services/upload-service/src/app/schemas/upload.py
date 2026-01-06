"""Pydantic schemas for upload request/response validation.

This module provides Pydantic models for the upload service API:
- Request validation for upload sessions, commits, and duplicate checks
- Response serialization for all upload endpoints
- TUS protocol header schemas for resumable uploads
- Error response schemas with structured error details

These schemas ensure API contract consistency and provide automatic
validation, serialization, and OpenAPI documentation.

Author: Claude Code Migration
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


# =============================================================================
# Enums
# =============================================================================


class UploadProvider(str, Enum):
    """Storage provider for uploads."""

    R2 = "r2"
    BYOS = "byos"  # Bring Your Own Storage


class UploadState(str, Enum):
    """Upload session states."""

    CREATED = "created"
    UPLOADING = "uploading"
    VERIFYING = "verifying"
    COMMITTED = "committed"
    FAILED = "failed"
    EXPIRED = "expired"


class AssetStatus(str, Enum):
    """Asset processing status after upload commit."""

    AVAILABLE = "available"
    PROCESSING = "processing"


class FileType(str, Enum):
    """Supported file types."""

    PHOTO = "photo"
    VIDEO = "video"


# =============================================================================
# Request Schemas
# =============================================================================


class CreateUploadSessionRequest(BaseModel):
    """Request schema for creating an upload session.

    This is the first step in the upload flow. The client provides file
    metadata and receives a session ID and upload URL.

    Example:
        {
            "gallery_id": "123e4567-e89b-12d3-a456-426614174000",
            "sub_gallery_id": null,
            "file_name": "IMG_1234.CR2",
            "mime_type": "image/x-canon-cr2",
            "size_bytes": 52428800,
            "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        }
    """

    gallery_id: Optional[UUID] = Field(
        None,
        description="Target gallery UUID for the uploaded asset",
    )
    sub_gallery_id: Optional[UUID] = Field(
        None,
        description="Target sub-gallery UUID (null = gallery root)",
    )
    file_name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Original filename with extension",
        examples=["IMG_1234.jpg", "DSC_9999.CR2", "video.mp4"],
    )
    mime_type: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="MIME type of the file (e.g., image/jpeg, video/mp4)",
        examples=["image/jpeg", "image/x-canon-cr2", "video/mp4"],
    )
    size_bytes: int = Field(
        ...,
        ge=1,
        le=500 * 1024 * 1024,  # 500MB max
        description="File size in bytes",
        examples=[1048576, 52428800],
    )
    sha256: Optional[str] = Field(
        None,
        min_length=64,
        max_length=64,
        pattern=r"^[a-fA-F0-9]{64}$",
        description="SHA256 checksum (hex) - optional at session creation, required at commit",
        examples=["e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    )
    relative_path: Optional[str] = Field(
        None,
        max_length=1000,
        description="Relative path for folder uploads (e.g., 'Wedding/Reception/img.jpg')",
    )

    @field_validator("file_name")
    @classmethod
    def validate_filename(cls, v: str) -> str:
        """Validate filename doesn't contain path separators or null bytes."""
        if "\x00" in v:
            raise ValueError("Filename cannot contain null bytes")
        if "/" in v or "\\" in v:
            raise ValueError("Filename cannot contain path separators")
        return v.strip()

    @field_validator("sha256")
    @classmethod
    def normalize_sha256(cls, v: Optional[str]) -> Optional[str]:
        """Normalize SHA256 to lowercase."""
        return v.lower() if v else None


class CommitUploadRequest(BaseModel):
    """Request schema for committing an upload.

    After uploading file data (directly or via chunks), the client
    commits the upload with the final SHA256 checksum for verification.

    Example:
        {
            "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            "etag": "\"d41d8cd98f00b204e9800998ecf8427e\"",
            "client_metadata": {
                "faces_detected": 3,
                "exif_orientation": 1
            }
        }
    """

    sha256: str = Field(
        ...,
        min_length=64,
        max_length=64,
        pattern=r"^[a-fA-F0-9]{64}$",
        description="SHA256 checksum (hex) for verification",
        examples=["e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    )
    etag: Optional[str] = Field(
        None,
        max_length=100,
        description="ETag from storage provider (optional)",
    )
    client_metadata: Optional[dict[str, Any]] = Field(
        None,
        description="Client-side metadata (e.g., face detection results, EXIF data)",
        examples=[{"faces_detected": 3, "exif_orientation": 1}],
    )

    @field_validator("sha256")
    @classmethod
    def normalize_sha256(cls, v: str) -> str:
        """Normalize SHA256 to lowercase."""
        return v.lower()


class CommitChunkedUploadRequest(BaseModel):
    """Request schema for committing a chunked upload.

    Used for large files uploaded in chunks via TUS protocol.
    Requires the total size for verification.

    Example:
        {
            "total_size": 104857600,
            "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            "client_metadata": null
        }
    """

    total_size: int = Field(
        ...,
        gt=0,
        le=500 * 1024 * 1024,  # 500MB max
        description="Total file size in bytes (must match uploaded chunks)",
    )
    sha256: str = Field(
        ...,
        min_length=64,
        max_length=64,
        pattern=r"^[a-fA-F0-9]{64}$",
        description="SHA256 checksum (hex) of complete file",
    )
    client_metadata: Optional[dict[str, Any]] = Field(
        None,
        description="Client-side metadata",
    )

    @field_validator("sha256")
    @classmethod
    def normalize_sha256(cls, v: str) -> str:
        """Normalize SHA256 to lowercase."""
        return v.lower()


class CheckDuplicateRequest(BaseModel):
    """Request schema for checking duplicate assets.

    Checks if an asset with the same SHA256 already exists in the
    workspace or specific gallery before uploading.

    Example:
        {
            "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            "gallery_id": "123e4567-e89b-12d3-a456-426614174000"
        }
    """

    sha256: str = Field(
        ...,
        min_length=64,
        max_length=64,
        pattern=r"^[a-fA-F0-9]{64}$",
        description="SHA256 checksum (hex) to check",
    )
    gallery_id: Optional[UUID] = Field(
        None,
        description="Optional gallery ID to limit search scope",
    )

    @field_validator("sha256")
    @classmethod
    def normalize_sha256(cls, v: str) -> str:
        """Normalize SHA256 to lowercase."""
        return v.lower()


# =============================================================================
# Response Schemas
# =============================================================================


class UploadSessionResponse(BaseModel):
    """Response schema for upload session creation.

    Returns the upload session ID and URL for uploading file data.
    The client should use the upload_url with TUS protocol headers.

    Example:
        {
            "upload_id": "123e4567-e89b-12d3-a456-426614174000",
            "provider": "r2",
            "upload_url": "https://upload.rawdrive.app/api/v1/upload/chunk/123e4567-e89b-12d3-a456-426614174000",
            "headers": {
                "Tus-Resumable": "1.0.0"
            },
            "expires_at": "2024-01-15T12:00:00Z"
        }
    """

    model_config = ConfigDict(from_attributes=True)

    upload_id: UUID = Field(
        ...,
        description="Unique upload session identifier",
    )
    provider: Literal["r2", "byos"] = Field(
        ...,
        description="Storage provider for this upload",
    )
    upload_url: str = Field(
        ...,
        description="URL for uploading file data (use with TUS headers)",
    )
    headers: dict[str, str] = Field(
        ...,
        description="Required headers for upload requests",
        examples=[{"Tus-Resumable": "1.0.0"}],
    )
    expires_at: datetime = Field(
        ...,
        description="Session expiration timestamp (UTC)",
    )


class UploadCommitResponse(BaseModel):
    """Response schema for upload commit.

    Returns the created asset ID and processing status.

    Example:
        {
            "asset_id": "123e4567-e89b-12d3-a456-426614174000",
            "status": "processing",
            "analysis_queued": true
        }
    """

    model_config = ConfigDict(from_attributes=True)

    asset_id: UUID = Field(
        ...,
        description="UUID of the created asset",
    )
    status: Literal["available", "processing"] = Field(
        ...,
        description="Asset status (processing = variants being generated)",
    )
    analysis_queued: bool = Field(
        False,
        description="Whether AI content analysis was queued",
    )


class DuplicateAssetResponse(BaseModel):
    """Information about a duplicate asset.

    Returned when checking for duplicates and matches are found.
    Includes thumbnail URL for visual verification.

    Example:
        {
            "asset_id": "123e4567-e89b-12d3-a456-426614174000",
            "workspace_id": "987fcdeb-51a2-3bc4-d567-890123456789",
            "gallery_id": "456e7890-e89b-12d3-a456-426614174111",
            "file_name": "IMG_1234.jpg",
            "mime_type": "image/jpeg",
            "size_bytes": 1048576,
            "created_at": "2024-01-01T10:00:00Z",
            "thumbnail_url": "https://cdn.rawdrive.app/..."
        }
    """

    model_config = ConfigDict(from_attributes=True)

    asset_id: UUID = Field(
        ...,
        description="UUID of the existing duplicate asset",
    )
    workspace_id: UUID = Field(
        ...,
        description="Workspace containing the duplicate",
    )
    gallery_id: Optional[UUID] = Field(
        None,
        description="Gallery containing the duplicate (if any)",
    )
    file_name: str = Field(
        ...,
        description="Original filename of the duplicate",
    )
    mime_type: str = Field(
        ...,
        description="MIME type of the duplicate",
    )
    size_bytes: int = Field(
        ...,
        description="File size in bytes",
    )
    created_at: str = Field(
        ...,
        description="ISO 8601 timestamp of when the duplicate was uploaded",
    )
    thumbnail_url: Optional[str] = Field(
        None,
        description="Signed URL for thumbnail preview",
    )


class CheckDuplicateResponse(BaseModel):
    """Response schema for duplicate check.

    Returns whether duplicates exist and their details.

    Example:
        {
            "is_duplicate": true,
            "duplicates": [
                {
                    "asset_id": "123e4567-e89b-12d3-a456-426614174000",
                    "file_name": "IMG_1234.jpg",
                    ...
                }
            ]
        }
    """

    model_config = ConfigDict(from_attributes=True)

    is_duplicate: bool = Field(
        ...,
        description="True if one or more duplicates exist",
    )
    duplicates: list[DuplicateAssetResponse] = Field(
        default_factory=list,
        description="List of matching duplicate assets",
    )


# =============================================================================
# TUS Protocol Schemas
# =============================================================================


class TUSHeadersResponse(BaseModel):
    """TUS protocol response headers.

    Provides TUS-compliant headers for resumable upload responses.
    Used internally and returned in HEAD requests for upload status.

    Example:
        {
            "upload_offset": 5242880,
            "upload_length": 52428800,
            "tus_resumable": "1.0.0",
            "tus_version": "1.0.0",
            "tus_extension": "creation,creation-with-upload,termination,checksum",
            "tus_max_size": 524288000,
            "tus_checksum_algorithm": "sha256"
        }
    """

    upload_offset: int = Field(
        ...,
        ge=0,
        description="Current byte offset (bytes uploaded so far)",
    )
    upload_length: Optional[int] = Field(
        None,
        ge=0,
        description="Total upload size in bytes",
    )
    tus_resumable: str = Field(
        "1.0.0",
        description="TUS protocol version",
    )
    tus_version: str = Field(
        "1.0.0",
        description="Supported TUS versions",
    )
    tus_extension: str = Field(
        "creation,creation-with-upload,termination,checksum",
        description="Supported TUS extensions",
    )
    tus_max_size: Optional[int] = Field(
        None,
        ge=0,
        description="Maximum upload size in bytes",
    )
    tus_checksum_algorithm: str = Field(
        "sha256",
        description="Supported checksum algorithm",
    )

    def to_http_headers(self) -> dict[str, str]:
        """Convert to HTTP header format for response."""
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


class ChunkUploadResponse(BaseModel):
    """Response schema for chunk upload (PATCH request).

    Returns the new offset after successful chunk storage.
    Client should use this offset for the next chunk.

    Note: The actual PATCH response uses HTTP 204 No Content
    with headers. This schema is for documentation purposes.

    Example:
        {
            "upload_offset": 10485760,
            "tus_resumable": "1.0.0"
        }
    """

    upload_offset: int = Field(
        ...,
        ge=0,
        description="New byte offset after this chunk",
    )
    tus_resumable: str = Field(
        "1.0.0",
        description="TUS protocol version",
    )


class UploadStatusResponse(BaseModel):
    """Response schema for upload status (HEAD request).

    Returns current upload progress for resumption.

    Example:
        {
            "upload_id": "123e4567-e89b-12d3-a456-426614174000",
            "state": "uploading",
            "upload_offset": 10485760,
            "upload_length": 52428800,
            "progress_percent": 20.0,
            "expires_at": "2024-01-15T12:00:00Z"
        }
    """

    model_config = ConfigDict(from_attributes=True)

    upload_id: UUID = Field(
        ...,
        description="Upload session identifier",
    )
    state: UploadState = Field(
        ...,
        description="Current upload session state",
    )
    upload_offset: int = Field(
        ...,
        ge=0,
        description="Current byte offset (bytes received)",
    )
    upload_length: Optional[int] = Field(
        None,
        ge=0,
        description="Total expected size in bytes",
    )
    progress_percent: Optional[float] = Field(
        None,
        ge=0,
        le=100,
        description="Upload progress percentage",
    )
    expires_at: datetime = Field(
        ...,
        description="Session expiration timestamp",
    )


# =============================================================================
# Error Response Schemas
# =============================================================================


class ErrorDetail(BaseModel):
    """Detailed error information for a specific field or issue.

    Example:
        {
            "field": "sha256",
            "message": "Checksum mismatch: expected abc123..., got def456..."
        }
    """

    field: Optional[str] = Field(
        None,
        description="Field name that caused the error (if applicable)",
    )
    message: str = Field(
        ...,
        description="Human-readable error message",
    )
    code: Optional[str] = Field(
        None,
        description="Machine-readable error code",
    )


class UploadErrorResponse(BaseModel):
    """Standard error response for upload endpoints.

    Provides structured error information with correlation ID
    for debugging and tracking.

    Example:
        {
            "status": 400,
            "code": "CHECKSUM_MISMATCH",
            "message": "File checksum verification failed",
            "details": [
                {
                    "field": "sha256",
                    "message": "Expected abc123..., got def456..."
                }
            ],
            "correlation_id": "req_123456789"
        }
    """

    status: int = Field(
        ...,
        ge=400,
        le=599,
        description="HTTP status code",
    )
    code: str = Field(
        ...,
        description="Machine-readable error code",
        examples=[
            "VALIDATION_ERROR",
            "CHECKSUM_MISMATCH",
            "SESSION_NOT_FOUND",
            "SESSION_EXPIRED",
            "STORAGE_LIMIT_EXCEEDED",
            "OFFSET_MISMATCH",
            "CHUNK_TOO_LARGE",
            "INTERNAL_ERROR",
        ],
    )
    message: str = Field(
        ...,
        description="Human-readable error message",
    )
    details: Optional[list[ErrorDetail]] = Field(
        None,
        description="Additional error details",
    )
    correlation_id: Optional[str] = Field(
        None,
        description="Request correlation ID for tracking",
    )


class ValidationErrorResponse(UploadErrorResponse):
    """Validation error response (HTTP 400).

    Returned when request validation fails.
    """

    status: Literal[400] = 400
    code: Literal["VALIDATION_ERROR"] = "VALIDATION_ERROR"


class ChecksumMismatchResponse(UploadErrorResponse):
    """Checksum mismatch error response (HTTP 400).

    Returned when the provided SHA256 doesn't match computed hash.
    """

    status: Literal[400] = 400
    code: Literal["CHECKSUM_MISMATCH"] = "CHECKSUM_MISMATCH"
    expected_sha256: Optional[str] = Field(
        None,
        description="Expected SHA256 hash",
    )
    actual_sha256: Optional[str] = Field(
        None,
        description="Computed SHA256 hash",
    )


class SessionNotFoundResponse(UploadErrorResponse):
    """Session not found error response (HTTP 404).

    Returned when the upload session doesn't exist.
    """

    status: Literal[404] = 404
    code: Literal["SESSION_NOT_FOUND"] = "SESSION_NOT_FOUND"


class SessionExpiredResponse(UploadErrorResponse):
    """Session expired error response (HTTP 410).

    Returned when the upload session has expired.
    """

    status: Literal[410] = 410
    code: Literal["SESSION_EXPIRED"] = "SESSION_EXPIRED"


class StorageLimitResponse(UploadErrorResponse):
    """Storage limit exceeded error response (HTTP 402).

    Returned when workspace storage quota is exceeded.
    """

    status: Literal[402] = 402
    code: Literal["STORAGE_LIMIT_EXCEEDED"] = "STORAGE_LIMIT_EXCEEDED"
    storage_used_bytes: Optional[int] = Field(
        None,
        description="Current storage usage in bytes",
    )
    storage_limit_bytes: Optional[int] = Field(
        None,
        description="Storage limit in bytes",
    )


class OffsetMismatchResponse(UploadErrorResponse):
    """Offset mismatch error response (HTTP 409).

    Returned when chunk offset doesn't match expected position.
    Client should use the expected_offset for the next request.
    """

    status: Literal[409] = 409
    code: Literal["OFFSET_MISMATCH"] = "OFFSET_MISMATCH"
    expected_offset: int = Field(
        ...,
        description="Expected byte offset for next chunk",
    )
    received_offset: int = Field(
        ...,
        description="Offset received in the request",
    )


class RateLimitResponse(UploadErrorResponse):
    """Rate limit exceeded error response (HTTP 429).

    Returned when too many requests are made.
    Includes retry information.
    """

    status: Literal[429] = 429
    code: Literal["RATE_LIMIT_EXCEEDED"] = "RATE_LIMIT_EXCEEDED"
    retry_after: int = Field(
        ...,
        description="Seconds to wait before retrying",
    )


# =============================================================================
# Internal Schemas (for service layer)
# =============================================================================


class UploadSessionInternal(BaseModel):
    """Internal schema for upload session data.

    Used for passing session data between service layers.
    Not exposed in API responses directly.
    """

    model_config = ConfigDict(from_attributes=True)

    upload_id: UUID
    workspace_id: UUID
    created_by_user_id: UUID
    gallery_id: Optional[UUID] = None
    sub_gallery_id: Optional[UUID] = None
    file_name: str
    mime_type: str
    size_bytes: int
    sha256: Optional[str] = None
    state: UploadState
    provider: UploadProvider
    expires_at: datetime
    asset_id: Optional[UUID] = None
    file_bytes: Optional[int] = None


class ChunkMetadataInternal(BaseModel):
    """Internal schema for chunk upload metadata.

    Stored in Redis for tracking chunked upload progress.
    """

    model_config = ConfigDict(from_attributes=True)

    upload_id: UUID
    workspace_id: UUID
    current_offset: int = 0
    total_size: Optional[int] = None
    chunk_count: int = 0
    checksum_algo: Optional[str] = "sha256"
    last_chunk_sha256: Optional[str] = None


# =============================================================================
# Message/Response Schemas
# =============================================================================


class MessageResponse(BaseModel):
    """Generic message response.

    Used for simple success/failure messages.

    Example:
        {
            "message": "Upload session cancelled successfully",
            "success": true
        }
    """

    message: str = Field(
        ...,
        description="Human-readable message",
    )
    success: bool = Field(
        True,
        description="Whether the operation succeeded",
    )


class UploadCancelResponse(MessageResponse):
    """Response for upload cancellation (TUS DELETE).

    Example:
        {
            "message": "Upload session cancelled",
            "success": true,
            "upload_id": "123e4567-e89b-12d3-a456-426614174000",
            "chunks_deleted": 5
        }
    """

    upload_id: UUID = Field(
        ...,
        description="Cancelled upload session ID",
    )
    chunks_deleted: int = Field(
        0,
        description="Number of chunks deleted from Redis",
    )


# =============================================================================
# Health Check Schemas
# =============================================================================


class ServiceHealthResponse(BaseModel):
    """Health check response for upload service.

    Used by /health and /ready endpoints.

    Example:
        {
            "status": "healthy",
            "service": "upload-service",
            "version": "1.0.0",
            "checks": {
                "database": "ok",
                "redis": "ok",
                "kafka": "ok",
                "r2": "ok"
            }
        }
    """

    status: Literal["healthy", "degraded", "unhealthy"] = Field(
        ...,
        description="Overall service health status",
    )
    service: str = Field(
        "upload-service",
        description="Service name",
    )
    version: str = Field(
        ...,
        description="Service version",
    )
    checks: dict[str, str] = Field(
        default_factory=dict,
        description="Individual component health checks",
    )
    timestamp: datetime = Field(
        default_factory=datetime.utcnow,
        description="Health check timestamp",
    )


# =============================================================================
# Module Exports
# =============================================================================


__all__ = [
    # Enums
    "UploadProvider",
    "UploadState",
    "AssetStatus",
    "FileType",
    # Request schemas
    "CreateUploadSessionRequest",
    "CommitUploadRequest",
    "CommitChunkedUploadRequest",
    "CheckDuplicateRequest",
    # Response schemas
    "UploadSessionResponse",
    "UploadCommitResponse",
    "DuplicateAssetResponse",
    "CheckDuplicateResponse",
    # TUS protocol schemas
    "TUSHeadersResponse",
    "ChunkUploadResponse",
    "UploadStatusResponse",
    # Error response schemas
    "ErrorDetail",
    "UploadErrorResponse",
    "ValidationErrorResponse",
    "ChecksumMismatchResponse",
    "SessionNotFoundResponse",
    "SessionExpiredResponse",
    "StorageLimitResponse",
    "OffsetMismatchResponse",
    "RateLimitResponse",
    # Internal schemas
    "UploadSessionInternal",
    "ChunkMetadataInternal",
    # Message schemas
    "MessageResponse",
    "UploadCancelResponse",
    # Health check schemas
    "ServiceHealthResponse",
]
