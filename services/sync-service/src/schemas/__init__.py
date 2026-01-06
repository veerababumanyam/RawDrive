"""
Pydantic schemas for Sync Service.

Provides request/response schemas for:
- Sync mappings (folder-to-gallery mappings)
- Sync sessions (active sync sessions)
- Sync events (file upload events)
- File event processing
"""

from src.schemas.mappings import (
    SyncMappingBase,
    SyncMappingCreate,
    SyncMappingUpdate,
    SyncMappingResponse,
    SyncMappingListResponse,
    SyncMappingStats,
)
from src.schemas.sessions import (
    SyncSessionBase,
    SyncSessionCreate,
    SyncSessionResponse,
    SyncSessionListResponse,
    SyncProgress,
    SyncStatusUpdate,
)
from src.schemas.events import (
    FileEventBase,
    FileEventCreate,
    FileEventBatchRequest,
    FileEventBatchResponse,
    FileUploadInstruction,
    SyncEventResponse,
)
from src.schemas.common import (
    SyncMappingStatus,
    SyncSessionStatus,
    SyncFileState,
    FileEventType,
    SyncEventType,
    SyncErrorCode,
    PaginationParams,
    PaginatedResponse,
)

__all__ = [
    # Mapping schemas
    "SyncMappingBase",
    "SyncMappingCreate",
    "SyncMappingUpdate",
    "SyncMappingResponse",
    "SyncMappingListResponse",
    "SyncMappingStats",
    # Session schemas
    "SyncSessionBase",
    "SyncSessionCreate",
    "SyncSessionResponse",
    "SyncSessionListResponse",
    "SyncProgress",
    "SyncStatusUpdate",
    # Event schemas
    "FileEventBase",
    "FileEventCreate",
    "FileEventBatchRequest",
    "FileEventBatchResponse",
    "FileUploadInstruction",
    "SyncEventResponse",
    # Common schemas
    "SyncMappingStatus",
    "SyncSessionStatus",
    "SyncFileState",
    "FileEventType",
    "SyncEventType",
    "SyncErrorCode",
    "PaginationParams",
    "PaginatedResponse",
]
