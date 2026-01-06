"""Schemas module - Pydantic models for request/response validation.

This module exports all Pydantic schemas used by the upload service API.
Schemas provide automatic validation, serialization, and OpenAPI documentation.

Usage:
    from app.schemas import (
        CreateUploadSessionRequest,
        UploadSessionResponse,
        UploadCommitResponse,
        CheckDuplicateRequest,
        CheckDuplicateResponse,
    )
"""

from app.schemas.upload import (
    # Enums
    UploadProvider,
    UploadState,
    AssetStatus,
    FileType,
    # Request schemas
    CreateUploadSessionRequest,
    CommitUploadRequest,
    CommitChunkedUploadRequest,
    CheckDuplicateRequest,
    # Response schemas
    UploadSessionResponse,
    UploadCommitResponse,
    DuplicateAssetResponse,
    CheckDuplicateResponse,
    # TUS protocol schemas
    TUSHeadersResponse,
    ChunkUploadResponse,
    UploadStatusResponse,
    # Error response schemas
    ErrorDetail,
    UploadErrorResponse,
    ValidationErrorResponse,
    ChecksumMismatchResponse,
    SessionNotFoundResponse,
    SessionExpiredResponse,
    StorageLimitResponse,
    OffsetMismatchResponse,
    RateLimitResponse,
    # Internal schemas
    UploadSessionInternal,
    ChunkMetadataInternal,
    # Message schemas
    MessageResponse,
    UploadCancelResponse,
    # Health check schemas
    ServiceHealthResponse,
)

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
