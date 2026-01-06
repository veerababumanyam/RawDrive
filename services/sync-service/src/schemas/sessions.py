"""
Pydantic schemas for sync sessions.

Provides request/response schemas for sync session management.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field

from src.schemas.common import (
    SyncSessionStatus,
    SyncErrorCode,
    SyncFileState,
    PaginatedResponse,
)


# ---------------------------------------------------------------------------
# Sync Session Schemas
# ---------------------------------------------------------------------------


class SyncSessionBase(BaseModel):
    """Base schema for sync session."""

    mapping_id: UUID = Field(..., description="Parent mapping ID")


class SyncSessionCreate(SyncSessionBase):
    """Schema for starting a new sync session."""

    client_id: Optional[str] = Field(
        None,
        max_length=255,
        description="Optional client identifier",
    )


class SyncProgress(BaseModel):
    """Sync progress information."""

    files_detected: int = Field(default=0, description="Files detected")
    files_queued: int = Field(default=0, description="Files in queue")
    files_uploading: int = Field(default=0, description="Files uploading")
    files_completed: int = Field(default=0, description="Files completed")
    files_failed: int = Field(default=0, description="Files failed")
    files_skipped: int = Field(default=0, description="Files skipped")
    bytes_uploaded: int = Field(default=0, description="Bytes uploaded")
    bytes_total: Optional[int] = Field(None, description="Total bytes to upload")
    progress_percent: Optional[float] = Field(None, description="Upload progress (0-100)")
    upload_speed_bps: Optional[int] = Field(None, description="Upload speed (bytes/sec)")
    eta_seconds: Optional[int] = Field(None, description="Estimated time remaining")


class SyncFileInfo(BaseModel):
    """File information in sync context."""

    file_path: str = Field(..., description="Local file path")
    file_name: str = Field(..., description="File name")
    file_extension: str = Field(..., description="File extension")
    file_size: int = Field(..., description="File size in bytes")
    mime_type: Optional[str] = Field(None, description="MIME type")
    modified_at: datetime = Field(..., description="File modification time")
    file_hash: Optional[str] = Field(None, description="SHA256 hash")
    state: SyncFileState = Field(..., description="Current file state")
    upload_progress: Optional[float] = Field(None, description="Upload progress (0-100)")
    bytes_uploaded: Optional[int] = Field(None, description="Bytes uploaded")
    asset_id: Optional[UUID] = Field(None, description="Resulting asset ID")
    error: Optional[str] = Field(None, description="Error message")
    error_code: Optional[SyncErrorCode] = Field(None, description="Error code")
    retry_count: int = Field(default=0, description="Retry attempts")
    detected_at: Optional[datetime] = Field(None, description="When detected")
    upload_started_at: Optional[datetime] = Field(None, description="When upload started")
    completed_at: Optional[datetime] = Field(None, description="When completed")


class SyncSessionResponse(BaseModel):
    """Schema for sync session response."""

    session_id: UUID = Field(..., description="Unique session identifier")
    mapping_id: UUID = Field(..., description="Parent mapping ID")
    workspace_id: UUID = Field(..., description="Workspace ID")
    user_id: UUID = Field(..., description="User who started the session")
    status: SyncSessionStatus = Field(..., description="Current session status")
    started_at: datetime = Field(..., description="When the session started")
    ended_at: Optional[datetime] = Field(None, description="When the session ended")
    files_detected: int = Field(default=0, description="Total files detected")
    files_queued: int = Field(default=0, description="Files in queue")
    files_uploading: int = Field(default=0, description="Files uploading")
    files_completed: int = Field(default=0, description="Files successfully synced")
    files_failed: int = Field(default=0, description="Files failed to sync")
    files_skipped: int = Field(default=0, description="Files skipped")
    bytes_uploaded: int = Field(default=0, description="Bytes uploaded")
    upload_speed_bps: Optional[int] = Field(None, description="Current upload speed")
    eta_seconds: Optional[int] = Field(None, description="Estimated time remaining")
    last_activity_at: datetime = Field(..., description="Last activity timestamp")
    last_error: Optional[str] = Field(None, description="Last error message")
    last_error_code: Optional[SyncErrorCode] = Field(None, description="Last error code")
    client_id: Optional[str] = Field(None, description="Client identifier")
    user_agent: Optional[str] = Field(None, description="User agent string")

    model_config = {"from_attributes": True}


class SyncSessionListResponse(PaginatedResponse[SyncSessionResponse]):
    """Paginated list of sync sessions."""

    pass


class StartSyncSessionResponse(BaseModel):
    """Response after starting a sync session."""

    session: SyncSessionResponse
    websocket_url: str = Field(..., description="WebSocket URL for real-time updates")
    message: str = Field(default="Sync session started successfully")


class SyncStatusUpdate(BaseModel):
    """Real-time sync status update (sent via WebSocket)."""

    session_id: UUID = Field(..., description="Session ID")
    type: str = Field(..., description="Update type: status|progress|file|error|complete")
    status: SyncSessionStatus = Field(..., description="Session status")
    progress: SyncProgress = Field(..., description="Progress information")
    current_file: Optional[SyncFileInfo] = Field(None, description="Current file")
    error: Optional[dict] = Field(None, description="Error information")
    timestamp: datetime = Field(..., description="Update timestamp")


class SyncError(BaseModel):
    """Sync error information."""

    code: SyncErrorCode = Field(..., description="Error code")
    message: str = Field(..., description="Human-readable error message")
    file_path: Optional[str] = Field(None, description="File path (if applicable)")
    details: Optional[dict] = Field(None, description="Additional details")
    recoverable: bool = Field(default=True, description="Whether error is recoverable")
    suggested_action: Optional[str] = Field(None, description="Suggested action")
    timestamp: datetime = Field(..., description="Error timestamp")
