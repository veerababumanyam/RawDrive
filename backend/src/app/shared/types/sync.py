"""Python types for Live Camera Sync feature.

This module provides Python equivalents of the TypeScript types defined in
packages/shared-types/src/sync.ts for type consistency across the stack.

Types included:
- Sync mappings (folder-to-gallery mappings)
- Sync sessions (active sync sessions)
- Sync events (file upload events)
- File event processing
- Real-time sync status updates

Generated to match TypeScript definitions from:
  packages/shared-types/src/sync.ts
  packages/shared-constants/src/sync.ts
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Generic, Literal, Optional, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Core Enums
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


class SyncWebSocketMessageType(str, Enum):
    """WebSocket message types for sync communication."""

    # Client to server
    SUBSCRIBE = "subscribe"
    UNSUBSCRIBE = "unsubscribe"
    FILE_EVENT = "file_event"
    FILE_EVENTS_BATCH = "file_events_batch"
    UPLOAD_PROGRESS = "upload_progress"
    UPLOAD_COMPLETE = "upload_complete"
    UPLOAD_FAILED = "upload_failed"
    PAUSE_SESSION = "pause_session"
    RESUME_SESSION = "resume_session"
    END_SESSION = "end_session"
    HEARTBEAT = "heartbeat"

    # Server to client
    SESSION_UPDATE = "session_update"
    STATUS_UPDATE = "status_update"
    UPLOAD_INSTRUCTION = "upload_instruction"
    ERROR = "error"
    QUOTA_WARNING = "quota_warning"
    HEARTBEAT_ACK = "heartbeat_ack"


# ---------------------------------------------------------------------------
# Sync Mapping Models
# ---------------------------------------------------------------------------


class SyncMapping(BaseModel):
    """Sync mapping between a local folder and a cloud gallery."""

    model_config = ConfigDict(from_attributes=True)

    mapping_id: UUID = Field(..., description="Unique sync mapping identifier")
    workspace_id: UUID = Field(..., description="Workspace ID")
    gallery_id: UUID = Field(..., description="Target gallery ID")
    gallery_name: Optional[str] = Field(
        None, description="Gallery name (denormalized for display)"
    )
    folder_path: str = Field(..., description="Local folder path")
    display_name: Optional[str] = Field(
        None, description="Display name for the mapping"
    )
    include_subfolders: bool = Field(
        False, description="Whether to sync nested folders"
    )
    include_patterns: Optional[list[str]] = Field(
        None, description="File patterns to include (glob patterns, e.g., '*.jpg,*.raw')"
    )
    exclude_patterns: Optional[list[str]] = Field(
        None, description="File patterns to exclude"
    )
    status: SyncMappingStatus = Field(..., description="Current mapping status")
    total_files_synced: int = Field(
        0, description="Total files synced through this mapping"
    )
    total_bytes_synced: int = Field(0, description="Total bytes synced")
    last_sync_at: Optional[datetime] = Field(
        None, description="Last sync activity timestamp"
    )
    last_error: Optional[str] = Field(
        None, description="Last error message if status is ERROR"
    )
    last_error_code: Optional[SyncErrorCode] = Field(None, description="Last error code")
    created_by_user_id: UUID = Field(..., description="User who created the mapping")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")


class CreateSyncMappingRequest(BaseModel):
    """Request to create a new sync mapping."""

    gallery_id: UUID = Field(..., description="Target gallery ID")
    folder_path: str = Field(..., min_length=1, description="Local folder path")
    display_name: Optional[str] = Field(
        None, max_length=200, description="Display name for the mapping"
    )
    include_subfolders: Optional[bool] = Field(
        False, description="Whether to sync nested folders (default: false)"
    )
    include_patterns: Optional[list[str]] = Field(
        None, description="File patterns to include (glob patterns)"
    )
    exclude_patterns: Optional[list[str]] = Field(
        None, description="File patterns to exclude"
    )


class UpdateSyncMappingRequest(BaseModel):
    """Request to update an existing sync mapping."""

    display_name: Optional[str] = Field(None, max_length=200, description="Update display name")
    include_subfolders: Optional[bool] = Field(
        None, description="Update subfolder setting"
    )
    include_patterns: Optional[list[str]] = Field(
        None, description="Update include patterns"
    )
    exclude_patterns: Optional[list[str]] = Field(
        None, description="Update exclude patterns"
    )
    status: Optional[SyncMappingStatus] = Field(None, description="Update mapping status")


class CreateSyncMappingResponse(BaseModel):
    """Response after creating a sync mapping."""

    mapping: SyncMapping = Field(..., description="The created mapping")
    message: str = Field(..., description="Confirmation message")


# ---------------------------------------------------------------------------
# Sync Session Models
# ---------------------------------------------------------------------------


class SyncProgress(BaseModel):
    """Sync progress information."""

    files_detected: int = Field(0, description="Files detected")
    files_queued: int = Field(0, description="Files in queue")
    files_uploading: int = Field(0, description="Files uploading")
    files_completed: int = Field(0, description="Files completed")
    files_failed: int = Field(0, description="Files failed")
    files_skipped: int = Field(0, description="Files skipped")
    bytes_uploaded: int = Field(0, description="Bytes uploaded")
    bytes_total: Optional[int] = Field(None, description="Total bytes to upload")
    progress_percent: Optional[float] = Field(
        None, ge=0, le=100, description="Upload progress percentage (0-100)"
    )
    upload_speed_bps: Optional[int] = Field(
        None, description="Current upload speed (bytes per second)"
    )
    eta_seconds: Optional[int] = Field(
        None, description="Estimated time remaining (seconds)"
    )


class SyncSession(BaseModel):
    """Active sync session."""

    model_config = ConfigDict(from_attributes=True)

    session_id: UUID = Field(..., description="Unique session identifier")
    mapping_id: UUID = Field(..., description="Parent mapping ID")
    workspace_id: UUID = Field(..., description="Workspace ID")
    user_id: UUID = Field(..., description="User who started the session")
    status: SyncSessionStatus = Field(..., description="Current session status")
    started_at: datetime = Field(..., description="When the session started")
    ended_at: Optional[datetime] = Field(
        None, description="When the session ended (if applicable)"
    )
    files_detected: int = Field(0, description="Total files detected in this session")
    files_queued: int = Field(0, description="Files currently in queue")
    files_uploading: int = Field(0, description="Files currently uploading")
    files_completed: int = Field(0, description="Files successfully synced")
    files_failed: int = Field(0, description="Files that failed to sync")
    files_skipped: int = Field(0, description="Files skipped (duplicates, unsupported)")
    bytes_uploaded: int = Field(0, description="Total bytes uploaded in this session")
    upload_speed_bps: Optional[int] = Field(
        None, description="Current upload speed (bytes per second)"
    )
    eta_seconds: Optional[int] = Field(
        None, description="Estimated time remaining (seconds)"
    )
    last_activity_at: datetime = Field(..., description="Last activity timestamp")
    last_error: Optional[str] = Field(
        None, description="Last error message if status is ERROR"
    )
    last_error_code: Optional[SyncErrorCode] = Field(None, description="Last error code")
    client_id: Optional[str] = Field(
        None, description="Client/browser identifier for this session"
    )
    user_agent: Optional[str] = Field(None, description="User agent string")


class StartSyncSessionRequest(BaseModel):
    """Request to start a new sync session."""

    mapping_id: UUID = Field(..., description="Mapping ID to start syncing")
    client_id: Optional[str] = Field(None, description="Optional client identifier")


class StartSyncSessionResponse(BaseModel):
    """Response after starting a sync session."""

    session: SyncSession = Field(..., description="The created session")
    websocket_url: str = Field(..., description="WebSocket URL for real-time updates")
    message: str = Field(..., description="Confirmation message")


class SyncFileInfo(BaseModel):
    """File information in sync context."""

    file_path: str = Field(..., description="Local file path")
    file_name: str = Field(..., description="File name")
    file_extension: str = Field(..., description="File extension")
    file_size: int = Field(..., ge=0, description="File size in bytes")
    mime_type: Optional[str] = Field(None, description="MIME type")
    modified_at: datetime = Field(..., description="File modification time")
    file_hash: Optional[str] = Field(
        None, description="SHA256 hash for duplicate detection"
    )
    state: SyncFileState = Field(..., description="Current file state in sync process")
    upload_progress: Optional[float] = Field(
        None, ge=0, le=100, description="Upload progress percentage (0-100)"
    )
    bytes_uploaded: Optional[int] = Field(None, description="Bytes uploaded so far")
    asset_id: Optional[UUID] = Field(
        None, description="Resulting asset ID (if completed)"
    )
    error: Optional[str] = Field(None, description="Error message (if failed)")
    error_code: Optional[SyncErrorCode] = Field(None, description="Error code (if failed)")
    retry_count: Optional[int] = Field(None, description="Number of retry attempts")
    detected_at: Optional[datetime] = Field(
        None, description="When the file was first detected"
    )
    upload_started_at: Optional[datetime] = Field(
        None, description="When upload started"
    )
    completed_at: Optional[datetime] = Field(None, description="When upload completed")


class SyncError(BaseModel):
    """Sync error information."""

    code: SyncErrorCode = Field(..., description="Error code")
    message: str = Field(..., description="Human-readable error message")
    file_path: Optional[str] = Field(None, description="File path (if applicable)")
    details: Optional[dict[str, Any]] = Field(
        None, description="Additional error details"
    )
    recoverable: bool = Field(..., description="Whether the error is recoverable")
    suggested_action: Optional[str] = Field(None, description="Suggested action")
    timestamp: datetime = Field(..., description="Error timestamp")


class SyncStatusUpdate(BaseModel):
    """Real-time sync status update (sent via WebSocket)."""

    session_id: UUID = Field(..., description="Session ID")
    type: Literal["status", "progress", "file", "error", "complete"] = Field(
        ..., description="Update type"
    )
    status: SyncSessionStatus = Field(..., description="Session status")
    progress: SyncProgress = Field(..., description="Progress information")
    current_file: Optional[SyncFileInfo] = Field(
        None, description="Current file being processed (if applicable)"
    )
    error: Optional[SyncError] = Field(
        None, description="Error information (if applicable)"
    )
    timestamp: datetime = Field(..., description="Update timestamp")


# ---------------------------------------------------------------------------
# Sync Event Models
# ---------------------------------------------------------------------------


class SyncEvent(BaseModel):
    """Sync event record for audit logging."""

    model_config = ConfigDict(from_attributes=True)

    event_id: UUID = Field(..., description="Unique event identifier")
    session_id: UUID = Field(..., description="Session ID")
    mapping_id: UUID = Field(..., description="Mapping ID")
    workspace_id: UUID = Field(..., description="Workspace ID")
    event_type: SyncEventType = Field(..., description="Event type")
    file_path: Optional[str] = Field(None, description="File path (if applicable)")
    file_name: Optional[str] = Field(None, description="File name (if applicable)")
    file_size: Optional[int] = Field(None, description="File size in bytes (if applicable)")
    asset_id: Optional[UUID] = Field(None, description="Asset ID (if file was synced)")
    error_message: Optional[str] = Field(None, description="Error message (if applicable)")
    error_code: Optional[SyncErrorCode] = Field(
        None, description="Error code (if applicable)"
    )
    event_data: Optional[dict[str, Any]] = Field(
        None, description="Additional event data"
    )
    created_at: datetime = Field(..., description="Event timestamp")


# ---------------------------------------------------------------------------
# File Event Models
# ---------------------------------------------------------------------------


class FileEvent(BaseModel):
    """File event from the folder watcher (sent from frontend to backend)."""

    session_id: UUID = Field(..., description="Session ID")
    mapping_id: UUID = Field(..., description="Mapping ID")
    event_type: FileEventType = Field(..., description="Event type")
    file_path: str = Field(..., description="File path")
    file_name: str = Field(..., description="File name")
    file_size: int = Field(..., ge=0, description="File size in bytes")
    mime_type: Optional[str] = Field(None, description="MIME type")
    modified_at: datetime = Field(..., description="File modification time")
    file_hash: Optional[str] = Field(
        None, description="SHA256 hash for duplicate detection"
    )
    old_path: Optional[str] = Field(
        None, description="Previous file path (for rename events)"
    )
    timestamp: datetime = Field(..., description="Event timestamp")


class ReportFileEventsRequest(BaseModel):
    """Request to report a batch of file events."""

    session_id: UUID = Field(..., description="Session ID")
    events: list[FileEvent] = Field(..., description="File events")


class FileUploadInstruction(BaseModel):
    """Instructions for uploading a file."""

    file_path: str = Field(..., description="File path")
    upload_url: str = Field(..., description="TUS upload URL")
    upload_session_id: str = Field(..., description="Upload session ID (for TUS)")
    expected_size: int = Field(..., description="Expected file size")
    expires_at: datetime = Field(..., description="Upload deadline")


class ReportFileEventsResponse(BaseModel):
    """Response after reporting file events."""

    processed: int = Field(..., description="Number of events processed")
    queued: int = Field(..., description="Number of events queued for upload")
    duplicates_skipped: int = Field(..., description="Number of duplicates skipped")
    unsupported_skipped: int = Field(..., description="Number of unsupported files skipped")
    files_to_upload: list[FileUploadInstruction] = Field(
        ..., description="Files that need to be uploaded (with upload URLs)"
    )


# ---------------------------------------------------------------------------
# Statistics & Metrics Models
# ---------------------------------------------------------------------------


class SyncMappingStats(BaseModel):
    """Sync statistics for a mapping."""

    mapping_id: UUID = Field(..., description="Mapping ID")
    total_files_synced: int = Field(0, description="Total files synced (all time)")
    total_bytes_synced: int = Field(0, description="Total bytes synced (all time)")
    total_sessions: int = Field(0, description="Total sessions")
    files_synced_today: int = Field(0, description="Files synced today")
    bytes_synced_today: int = Field(0, description="Bytes synced today")
    average_file_size: Optional[int] = Field(None, description="Average file size")
    average_upload_speed_bps: Optional[int] = Field(
        None, description="Average upload speed (bytes per second)"
    )
    success_rate_percent: float = Field(
        0.0, ge=0, le=100, description="Success rate percentage"
    )
    last_sync_at: Optional[datetime] = Field(None, description="Last sync timestamp")
    file_type_breakdown: Optional[dict[str, int]] = Field(
        None, description="Most common file types"
    )


class WorkspaceSyncStats(BaseModel):
    """Sync statistics for a workspace."""

    workspace_id: UUID = Field(..., description="Workspace ID")
    total_mappings: int = Field(0, description="Total active mappings")
    active_sessions: int = Field(0, description="Total active sessions")
    total_files_synced: int = Field(0, description="Total files synced (all time)")
    total_bytes_synced: int = Field(0, description="Total bytes synced (all time)")
    files_synced_this_month: int = Field(0, description="Files synced this month")
    bytes_synced_this_month: int = Field(0, description="Bytes synced this month")
    storage_quota_used: int = Field(0, description="Storage quota used (bytes)")
    storage_quota_limit: int = Field(0, description="Storage quota limit (bytes)")
    storage_quota_percent: float = Field(
        0.0, ge=0, le=100, description="Storage quota percentage used"
    )


# ---------------------------------------------------------------------------
# WebSocket Message Models
# ---------------------------------------------------------------------------

T = TypeVar("T")


class SyncWebSocketMessage(BaseModel, Generic[T]):
    """Base WebSocket message structure."""

    type: SyncWebSocketMessageType = Field(..., description="Message type")
    session_id: Optional[UUID] = Field(None, description="Session ID (if applicable)")
    payload: T = Field(..., description="Message payload")
    timestamp: datetime = Field(..., description="Message timestamp")
    message_id: Optional[str] = Field(
        None, description="Message ID for acknowledgment"
    )


# ---------------------------------------------------------------------------
# Query Models
# ---------------------------------------------------------------------------


class ListSyncMappingsQuery(BaseModel):
    """Query parameters for listing sync mappings."""

    gallery_id: Optional[UUID] = Field(None, description="Filter by gallery ID")
    status: Optional[SyncMappingStatus] = Field(None, description="Filter by status")
    page: Optional[int] = Field(1, ge=1, description="Page number (1-based)")
    limit: Optional[int] = Field(20, ge=1, le=100, description="Items per page")
    sort_by: Optional[
        Literal["created_at", "updated_at", "last_sync_at", "display_name"]
    ] = Field(None, description="Sort field")
    sort_order: Optional[Literal["asc", "desc"]] = Field(None, description="Sort direction")


class ListSyncSessionsQuery(BaseModel):
    """Query parameters for listing sync sessions."""

    mapping_id: Optional[UUID] = Field(None, description="Filter by mapping ID")
    status: Optional[SyncSessionStatus] = Field(None, description="Filter by status")
    started_after: Optional[datetime] = Field(
        None, description="Filter by start date (ISO datetime)"
    )
    started_before: Optional[datetime] = Field(
        None, description="Filter by end date (ISO datetime)"
    )
    page: Optional[int] = Field(1, ge=1, description="Page number (1-based)")
    limit: Optional[int] = Field(20, ge=1, le=100, description="Items per page")


class ListSyncEventsQuery(BaseModel):
    """Query parameters for listing sync events."""

    session_id: Optional[UUID] = Field(None, description="Filter by session ID")
    mapping_id: Optional[UUID] = Field(None, description="Filter by mapping ID")
    event_type: Optional[SyncEventType] = Field(None, description="Filter by event type")
    after: Optional[datetime] = Field(
        None, description="Filter by start date (ISO datetime)"
    )
    before: Optional[datetime] = Field(
        None, description="Filter by end date (ISO datetime)"
    )
    page: Optional[int] = Field(1, ge=1, description="Page number (1-based)")
    limit: Optional[int] = Field(20, ge=1, le=100, description="Items per page")


# ---------------------------------------------------------------------------
# Sync Constants (mirrored from shared-constants/src/sync.ts)
# ---------------------------------------------------------------------------

# Storage unit constants (also defined in shared/constants.py)
_KB = 1024
_MB = 1024 * _KB
_GB = 1024 * _MB


class SyncRateLimits:
    """Rate limits for sync operations."""

    STATUS_UPDATES_PER_MINUTE: int = 50
    FILE_EVENTS_PER_MINUTE: int = 200
    WS_MESSAGES_PER_SECOND: int = 10
    MAX_CONCURRENT_UPLOADS: int = 5
    MAX_FILE_DETECTIONS_PER_SECOND: int = 20


class SyncTiming:
    """Timing constants for sync operations (in milliseconds)."""

    FILE_STABILITY_DELAY_MS: int = 2000
    FILE_EVENT_DEBOUNCE_MS: int = 500
    FILE_BATCH_MAX_WAIT_MS: int = 5000
    WS_HEARTBEAT_INTERVAL_MS: int = 30000
    WS_HEARTBEAT_TIMEOUT_MS: int = 10000
    WS_RECONNECT_BASE_DELAY_MS: int = 1000
    WS_RECONNECT_MAX_DELAY_MS: int = 30000
    STATUS_BROADCAST_INTERVAL_MS: int = 1000
    UPLOAD_CHUNK_TIMEOUT_MS: int = 60000
    UPLOAD_FILE_TIMEOUT_MS: int = 300000  # 5 minutes
    SESSION_IDLE_TIMEOUT_MS: int = 1800000  # 30 minutes
    NETWORK_POLL_INTERVAL_MS: int = 5000


class SyncRetry:
    """Retry configuration for sync operations."""

    MAX_UPLOAD_RETRIES: int = 3
    MAX_API_RETRIES: int = 3
    MAX_WS_RECONNECT_ATTEMPTS: int = 10
    RETRY_BASE_DELAY_MS: int = 1000
    RETRY_MAX_DELAY_MS: int = 30000
    RETRY_BACKOFF_MULTIPLIER: float = 2.0
    RETRY_JITTER_FACTOR: float = 0.1


class SyncQueueLimits:
    """Queue and batch size limits for sync operations."""

    MAX_QUEUE_SIZE: int = 1000
    MAX_BATCH_SIZE: int = 50
    MAX_PROCESS_PER_TICK: int = 10
    BACKPRESSURE_THRESHOLD: int = 100
    PAUSE_DETECTION_THRESHOLD: int = 500
    RESUME_DETECTION_THRESHOLD: int = 250


class SyncFileLimits:
    """File size limits specific to sync operations."""

    MAX_FILE_SIZE: int = 200 * _MB
    MIN_FILE_SIZE: int = 1
    UPLOAD_CHUNK_SIZE: int = 10 * _MB
    LARGE_FILE_THRESHOLD: int = 50 * _MB
    MAX_SESSION_UPLOAD_SIZE: int = 10 * _GB


class SyncSessionLimits:
    """Limits for sync sessions."""

    MAX_SESSIONS_PER_WORKSPACE: int = 10
    MAX_SESSIONS_PER_USER: int = 5
    MAX_MAPPINGS_PER_WORKSPACE: int = 50
    MAX_MAPPINGS_PER_GALLERY: int = 5
    MAX_WS_CONNECTIONS_PER_SESSION: int = 3
    MAX_WS_CONNECTIONS_PER_WORKSPACE: int = 100


class SyncWebSocket:
    """WebSocket configuration for sync real-time communication."""

    PATH: str = "/api/v1/sync/ws"
    SUBPROTOCOL: str = "sync-v1"
    MAX_MESSAGE_SIZE: int = 64 * _KB
    CONNECTION_TIMEOUT_MS: int = 10000
    PING_INTERVAL_MS: int = 30000
    PONG_TIMEOUT_MS: int = 10000


class SyncQuotaThresholds:
    """Storage quota thresholds for sync warnings."""

    WARNING_PERCENT: int = 80
    CRITICAL_PERCENT: int = 95
    PAUSE_SYNC_PERCENT: int = 99


class SyncApiPaths:
    """API path constants for sync endpoints."""

    BASE: str = "/api/v1/sync"
    MAPPINGS: str = "/api/v1/sync/mappings"
    SESSIONS: str = "/api/v1/sync/sessions"
    EVENTS: str = "/api/v1/sync/events"
    FILE_EVENTS: str = "/api/v1/sync/file-events"
    STATS: str = "/api/v1/sync/stats"
    WEBSOCKET: str = "/api/v1/sync/ws"


# Human-readable error messages for sync error codes
SYNC_ERROR_MESSAGES: dict[SyncErrorCode, str] = {
    SyncErrorCode.FOLDER_NOT_FOUND: "The specified folder does not exist or cannot be accessed.",
    SyncErrorCode.FOLDER_ACCESS_DENIED: "Permission denied to access the specified folder.",
    SyncErrorCode.GALLERY_NOT_FOUND: "The target gallery does not exist or has been deleted.",
    SyncErrorCode.GALLERY_ACCESS_DENIED: "You do not have permission to upload to this gallery.",
    SyncErrorCode.QUOTA_EXCEEDED: "Storage quota exceeded. Please upgrade your plan or free up space.",
    SyncErrorCode.NETWORK_ERROR: "Network connection lost. Sync will resume when connection is restored.",
    SyncErrorCode.UPLOAD_FAILED: "File upload failed. Will retry automatically.",
    SyncErrorCode.FILE_TOO_LARGE: "File exceeds the maximum allowed size of 200MB.",
    SyncErrorCode.UNSUPPORTED_FILE_TYPE: "This file type is not supported for sync.",
    SyncErrorCode.DUPLICATE_MAPPING: "A sync mapping already exists for this folder and gallery combination.",
    SyncErrorCode.SESSION_LIMIT_REACHED: "Maximum number of concurrent sync sessions reached.",
    SyncErrorCode.RATE_LIMITED: "Too many requests. Please wait before retrying.",
    SyncErrorCode.INTERNAL_ERROR: "An unexpected error occurred. Please try again later.",
}


# Default file patterns for sync operations
SYNC_DEFAULT_INCLUDE_PATTERNS: list[str] = [
    "*.jpg",
    "*.jpeg",
    "*.png",
    "*.heic",
    "*.heif",
    "*.cr2",
    "*.cr3",
    "*.nef",
    "*.arw",
    "*.raf",
    "*.orf",
    "*.rw2",
    "*.dng",
    "*.pef",
    "*.rwl",
    "*.srw",
    "*.tiff",
    "*.tif",
]

SYNC_DEFAULT_EXCLUDE_PATTERNS: list[str] = [
    ".*",  # Hidden files
    "_*",  # Temp files often prefixed with underscore
    "~*",  # Backup files
    "*.tmp",  # Temporary files
    "*.temp",  # Temporary files
    "*.partial",  # Partial downloads
    "Thumbs.db",  # Windows thumbnail cache
    ".DS_Store",  # macOS metadata
    "*.xmp",  # Sidecar files (sync separately if needed)
]

SYNC_SIDECAR_PATTERNS: list[str] = [
    "*.xmp",
    "*.pp3",  # RawTherapee
    "*.dop",  # DxO
]
