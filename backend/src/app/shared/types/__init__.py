"""Shared types package for RawDrive backend.

This package contains Python type definitions that mirror the TypeScript
types from the shared-types package for type consistency across the stack.
"""

from .gradient import ColorStop, GradientConfiguration
from .invitations import EventType
from .sync import (
    # Enums
    SyncMappingStatus,
    SyncSessionStatus,
    SyncFileState,
    FileEventType,
    SyncEventType,
    SyncErrorCode,
    SyncWebSocketMessageType,
    # Sync Mapping types
    SyncMapping,
    CreateSyncMappingRequest,
    UpdateSyncMappingRequest,
    CreateSyncMappingResponse,
    # Sync Session types
    SyncSession,
    StartSyncSessionRequest,
    StartSyncSessionResponse,
    SyncStatusUpdate,
    SyncProgress,
    # Sync Event types
    SyncEvent,
    # File Event types
    SyncFileInfo,
    FileEvent,
    ReportFileEventsRequest,
    ReportFileEventsResponse,
    FileUploadInstruction,
    # Error types
    SyncError,
    # Statistics types
    SyncMappingStats,
    WorkspaceSyncStats,
    # WebSocket types
    SyncWebSocketMessage,
    # Query types
    ListSyncMappingsQuery,
    ListSyncSessionsQuery,
    ListSyncEventsQuery,
    # Constants
    SyncRateLimits,
    SyncTiming,
    SyncRetry,
    SyncQueueLimits,
    SyncFileLimits,
    SyncSessionLimits,
    SyncWebSocket,
    SyncQuotaThresholds,
    SyncApiPaths,
    SYNC_ERROR_MESSAGES,
    SYNC_DEFAULT_INCLUDE_PATTERNS,
    SYNC_DEFAULT_EXCLUDE_PATTERNS,
    SYNC_SIDECAR_PATTERNS,
)

__all__ = [
    # Gradient types
    "ColorStop",
    "GradientConfiguration",
    # Invitation types
    "EventType",
    # Enums
    "SyncMappingStatus",
    "SyncSessionStatus",
    "SyncFileState",
    "FileEventType",
    "SyncEventType",
    "SyncErrorCode",
    "SyncWebSocketMessageType",
    # Sync Mapping types
    "SyncMapping",
    "CreateSyncMappingRequest",
    "UpdateSyncMappingRequest",
    "CreateSyncMappingResponse",
    # Sync Session types
    "SyncSession",
    "StartSyncSessionRequest",
    "StartSyncSessionResponse",
    "SyncStatusUpdate",
    "SyncProgress",
    # Sync Event types
    "SyncEvent",
    # File Event types
    "SyncFileInfo",
    "FileEvent",
    "ReportFileEventsRequest",
    "ReportFileEventsResponse",
    "FileUploadInstruction",
    # Error types
    "SyncError",
    # Statistics types
    "SyncMappingStats",
    "WorkspaceSyncStats",
    # WebSocket types
    "SyncWebSocketMessage",
    # Query types
    "ListSyncMappingsQuery",
    "ListSyncSessionsQuery",
    "ListSyncEventsQuery",
    # Constants
    "SyncRateLimits",
    "SyncTiming",
    "SyncRetry",
    "SyncQueueLimits",
    "SyncFileLimits",
    "SyncSessionLimits",
    "SyncWebSocket",
    "SyncQuotaThresholds",
    "SyncApiPaths",
    "SYNC_ERROR_MESSAGES",
    "SYNC_DEFAULT_INCLUDE_PATTERNS",
    "SYNC_DEFAULT_EXCLUDE_PATTERNS",
    "SYNC_SIDECAR_PATTERNS",
]
