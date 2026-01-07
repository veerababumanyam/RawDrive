"""Shared types package for RawDrive backend.

This package contains Python type definitions that mirror the TypeScript
types from the shared-types package for type consistency across the stack.
"""

from .gradient import ColorStop, GradientConfiguration
# Import EventType from parent types.py (it's defined there, not in invitations.py)
import importlib.util
from pathlib import Path
_parent_types_path = Path(__file__).parent.parent / "types.py"
if _parent_types_path.exists():
    spec = importlib.util.spec_from_file_location("_parent_types", _parent_types_path)
    _parent_types = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(_parent_types)
    EventType = _parent_types.EventType
    InvitationStatus = _parent_types.InvitationStatus
    RSVPStatus = _parent_types.RSVPStatus
    TemplateCategory = _parent_types.TemplateCategory
else:
    # Fallback if types.py doesn't exist
    from enum import Enum
    from .invitations import EventType as _EventType
    EventType = _EventType
    class InvitationStatus(Enum):
        draft = "draft"
        published = "published"
        archived = "archived"
        expired = "expired"
        cancelled = "cancelled"
        deleted = "deleted"
    class RSVPStatus(Enum):
        pending = "pending"
        attending = "attending"
        not_attending = "not_attending"
        maybe = "maybe"
        confirmed = "confirmed"
        declined = "declined"
    class TemplateCategory(Enum):
        wedding = "wedding"
# Import from parent types.py file (avoiding circular import by using importlib)
import importlib.util
from pathlib import Path
_parent_types_path = Path(__file__).parent.parent / "types.py"
if _parent_types_path.exists():
    spec = importlib.util.spec_from_file_location("_parent_types", _parent_types_path)
    _parent_types = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(_parent_types)
    InvitationStatus = _parent_types.InvitationStatus
    RSVPStatus = _parent_types.RSVPStatus
    TemplateCategory = _parent_types.TemplateCategory
else:
    # Fallback if types.py doesn't exist
    from enum import Enum
    class InvitationStatus(Enum):
        draft = "draft"
        published = "published"
        archived = "archived"
        expired = "expired"
        cancelled = "cancelled"
        deleted = "deleted"
    class RSVPStatus(Enum):
        pending = "pending"
        attending = "attending"
        not_attending = "not_attending"
        maybe = "maybe"
        confirmed = "confirmed"
        declined = "declined"
    class TemplateCategory(Enum):
        wedding = "wedding"
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
    "InvitationStatus",
    "RSVPStatus",
    "TemplateCategory",
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
