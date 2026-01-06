"""
Pydantic schemas for sync events and file events.

Provides request/response schemas for file event processing and audit logging.
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from src.schemas.common import FileEventType, SyncEventType, SyncErrorCode


# ---------------------------------------------------------------------------
# File Event Schemas (from frontend to backend)
# ---------------------------------------------------------------------------


class FileEventBase(BaseModel):
    """Base schema for file event."""

    event_type: FileEventType = Field(..., description="Event type")
    file_path: str = Field(..., description="File path")
    file_name: str = Field(..., description="File name")
    file_size: int = Field(..., ge=0, description="File size in bytes")
    mime_type: Optional[str] = Field(None, description="MIME type")
    modified_at: datetime = Field(..., description="File modification time")
    file_hash: Optional[str] = Field(None, description="SHA256 hash for dedup")
    old_path: Optional[str] = Field(None, description="Previous path (for renames)")


class FileEventCreate(FileEventBase):
    """Schema for creating a file event."""

    session_id: UUID = Field(..., description="Session ID")
    mapping_id: UUID = Field(..., description="Mapping ID")
    timestamp: datetime = Field(..., description="Event timestamp")

    @field_validator("file_hash")
    @classmethod
    def validate_file_hash(cls, v: Optional[str]) -> Optional[str]:
        """Validate SHA256 hash format."""
        if v is not None:
            v = v.strip().lower()
            if len(v) != 64:
                raise ValueError("file_hash must be a 64-character SHA256 hash")
            if not all(c in "0123456789abcdef" for c in v):
                raise ValueError("file_hash must be a valid hexadecimal string")
        return v


class FileEventBatchRequest(BaseModel):
    """Request to report a batch of file events."""

    session_id: UUID = Field(..., description="Session ID")
    events: List[FileEventBase] = Field(
        ...,
        min_length=1,
        max_length=50,
        description="File events (max 50 per batch)",
    )

    @field_validator("events")
    @classmethod
    def validate_events_batch(cls, v: List[FileEventBase]) -> List[FileEventBase]:
        """Validate batch size."""
        if len(v) > 50:
            raise ValueError("Maximum 50 events per batch")
        return v


class FileUploadInstruction(BaseModel):
    """Instructions for uploading a file."""

    file_path: str = Field(..., description="File path")
    upload_url: str = Field(..., description="TUS upload URL")
    upload_session_id: str = Field(..., description="Upload session ID")
    expected_size: int = Field(..., description="Expected file size")
    expires_at: datetime = Field(..., description="Upload deadline")


class FileEventBatchResponse(BaseModel):
    """Response after processing file events."""

    processed: int = Field(..., description="Events processed")
    queued: int = Field(..., description="Files queued for upload")
    duplicates_skipped: int = Field(..., description="Duplicates skipped")
    unsupported_skipped: int = Field(..., description="Unsupported files skipped")
    files_to_upload: List[FileUploadInstruction] = Field(
        default_factory=list,
        description="Files to upload with instructions",
    )


# ---------------------------------------------------------------------------
# Sync Event Schemas (audit logging)
# ---------------------------------------------------------------------------


class SyncEventResponse(BaseModel):
    """Schema for sync event response."""

    event_id: UUID = Field(..., description="Event ID")
    session_id: UUID = Field(..., description="Session ID")
    mapping_id: UUID = Field(..., description="Mapping ID")
    workspace_id: UUID = Field(..., description="Workspace ID")
    event_type: SyncEventType = Field(..., description="Event type")
    file_path: Optional[str] = Field(None, description="File path")
    file_name: Optional[str] = Field(None, description="File name")
    file_size: Optional[int] = Field(None, description="File size")
    asset_id: Optional[UUID] = Field(None, description="Asset ID")
    error_message: Optional[str] = Field(None, description="Error message")
    error_code: Optional[SyncErrorCode] = Field(None, description="Error code")
    event_data: Optional[dict] = Field(None, description="Additional data")
    created_at: datetime = Field(..., description="Event timestamp")

    model_config = {"from_attributes": True}


class SyncEventCreate(BaseModel):
    """Schema for creating a sync event."""

    session_id: UUID = Field(..., description="Session ID")
    mapping_id: UUID = Field(..., description="Mapping ID")
    workspace_id: UUID = Field(..., description="Workspace ID")
    event_type: SyncEventType = Field(..., description="Event type")
    file_path: Optional[str] = Field(None, description="File path")
    file_name: Optional[str] = Field(None, description="File name")
    file_size: Optional[int] = Field(None, description="File size")
    asset_id: Optional[UUID] = Field(None, description="Asset ID")
    error_message: Optional[str] = Field(None, description="Error message")
    error_code: Optional[SyncErrorCode] = Field(None, description="Error code")
    event_data: Optional[dict] = Field(None, description="Additional data")


# ---------------------------------------------------------------------------
# Upload Progress Schemas
# ---------------------------------------------------------------------------


class UploadProgressUpdate(BaseModel):
    """Upload progress update from frontend."""

    session_id: UUID = Field(..., description="Session ID")
    file_path: str = Field(..., description="File being uploaded")
    bytes_uploaded: int = Field(..., ge=0, description="Bytes uploaded so far")
    total_bytes: int = Field(..., ge=0, description="Total file size")
    progress_percent: float = Field(..., ge=0, le=100, description="Progress percentage")


class UploadCompleteNotification(BaseModel):
    """Notification when upload completes."""

    session_id: UUID = Field(..., description="Session ID")
    file_path: str = Field(..., description="File path")
    asset_id: UUID = Field(..., description="Created asset ID")
    file_size: int = Field(..., description="File size")
    duration_ms: int = Field(..., description="Upload duration in milliseconds")


class UploadFailedNotification(BaseModel):
    """Notification when upload fails."""

    session_id: UUID = Field(..., description="Session ID")
    file_path: str = Field(..., description="File path")
    error_code: SyncErrorCode = Field(..., description="Error code")
    error_message: str = Field(..., description="Error message")
    retry_count: int = Field(default=0, description="Number of retries attempted")
    will_retry: bool = Field(default=False, description="Whether will retry")
