"""
Common schemas and enums for Sync Service.

Provides shared enums, pagination, and base schemas used across
the sync service modules.
"""

from enum import Enum
from typing import Generic, List, Optional, TypeVar
from uuid import UUID

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums (aligned with shared-types/sync.ts)
# ---------------------------------------------------------------------------


class SyncMappingStatus(str, Enum):
    """Status of a sync mapping."""

    ACTIVE = "active"
    PAUSED = "paused"
    DISABLED = "disabled"
    ERROR = "error"


class SyncSessionStatus(str, Enum):
    """Status of a sync session."""

    INITIALIZING = "initializing"
    WATCHING = "watching"
    SYNCING = "syncing"
    PAUSED = "paused"
    COMPLETED = "completed"
    ERROR = "error"
    DISCONNECTED = "disconnected"


class SyncFileState(str, Enum):
    """State of a file in the sync queue."""

    DETECTED = "detected"
    QUEUED = "queued"
    UPLOADING = "uploading"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"
    DUPLICATE = "duplicate"


class FileEventType(str, Enum):
    """Type of file event detected by the watcher."""

    CREATED = "created"
    MODIFIED = "modified"
    RENAMED = "renamed"
    DELETED = "deleted"


class SyncEventType(str, Enum):
    """Sync event type for audit logging."""

    SESSION_STARTED = "session_started"
    SESSION_PAUSED = "session_paused"
    SESSION_RESUMED = "session_resumed"
    SESSION_ENDED = "session_ended"
    FILE_DETECTED = "file_detected"
    FILE_QUEUED = "file_queued"
    UPLOAD_STARTED = "upload_started"
    UPLOAD_PROGRESS = "upload_progress"
    UPLOAD_COMPLETED = "upload_completed"
    UPLOAD_FAILED = "upload_failed"
    DUPLICATE_DETECTED = "duplicate_detected"
    ERROR_OCCURRED = "error_occurred"
    QUOTA_WARNING = "quota_warning"
    QUOTA_EXCEEDED = "quota_exceeded"
    CONNECTION_LOST = "connection_lost"
    CONNECTION_RESTORED = "connection_restored"


class SyncErrorCode(str, Enum):
    """Sync error codes for programmatic handling."""

    FOLDER_NOT_FOUND = "FOLDER_NOT_FOUND"
    FOLDER_ACCESS_DENIED = "FOLDER_ACCESS_DENIED"
    GALLERY_NOT_FOUND = "GALLERY_NOT_FOUND"
    GALLERY_ACCESS_DENIED = "GALLERY_ACCESS_DENIED"
    QUOTA_EXCEEDED = "QUOTA_EXCEEDED"
    NETWORK_ERROR = "NETWORK_ERROR"
    UPLOAD_FAILED = "UPLOAD_FAILED"
    FILE_TOO_LARGE = "FILE_TOO_LARGE"
    UNSUPPORTED_FILE_TYPE = "UNSUPPORTED_FILE_TYPE"
    DUPLICATE_MAPPING = "DUPLICATE_MAPPING"
    SESSION_LIMIT_REACHED = "SESSION_LIMIT_REACHED"
    RATE_LIMITED = "RATE_LIMITED"
    INTERNAL_ERROR = "INTERNAL_ERROR"


# ---------------------------------------------------------------------------
# Pagination Schemas
# ---------------------------------------------------------------------------


class PaginationParams(BaseModel):
    """Pagination query parameters."""

    page: int = Field(default=1, ge=1, description="Page number (1-based)")
    limit: int = Field(default=20, ge=1, le=100, description="Items per page")

    @property
    def offset(self) -> int:
        """Calculate offset for database query."""
        return (self.page - 1) * self.limit


T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    """Generic paginated response wrapper."""

    data: List[T]
    total: int = Field(..., description="Total number of items")
    page: int = Field(..., description="Current page number")
    limit: int = Field(..., description="Items per page")
    total_pages: int = Field(..., description="Total number of pages")

    @classmethod
    def create(
        cls,
        data: List[T],
        total: int,
        page: int,
        limit: int,
    ) -> "PaginatedResponse[T]":
        """Create a paginated response with calculated total_pages."""
        total_pages = (total + limit - 1) // limit if limit > 0 else 0
        return cls(
            data=data,
            total=total,
            page=page,
            limit=limit,
            total_pages=total_pages,
        )


# ---------------------------------------------------------------------------
# Base Response Schemas
# ---------------------------------------------------------------------------


class ErrorResponse(BaseModel):
    """Standard error response."""

    error: str = Field(..., description="Error type")
    message: str = Field(..., description="Human-readable error message")
    code: Optional[SyncErrorCode] = Field(None, description="Error code")
    details: Optional[dict] = Field(None, description="Additional error details")


class SuccessResponse(BaseModel):
    """Standard success response."""

    success: bool = Field(default=True)
    message: str = Field(..., description="Success message")


class WorkspaceContext(BaseModel):
    """Workspace context extracted from JWT token."""

    workspace_id: UUID
    user_id: UUID
    role: str = Field(..., description="User's role in the workspace")
