"""Sync audit schemas for XMP sync operations.

Provides enums and schemas for audit logging of XMP import/export operations.
Supports SOC2 compliance and GDPR data subject rights.
"""

from enum import Enum
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field


class SyncAuditAction(str, Enum):
    """Types of sync operations that are audited."""

    XMP_EXPORT = "xmp_export"
    XMP_IMPORT = "xmp_import"
    RATING_UPDATE = "rating_update"
    FLAG_UPDATE = "flag_update"
    COLOR_LABEL_UPDATE = "color_label_update"
    BATCH_UPDATE = "batch_update"
    SYNC_STARTED = "sync_started"
    SYNC_COMPLETED = "sync_completed"
    SYNC_FAILED = "sync_failed"
    API_KEY_CREATED = "api_key_created"
    API_KEY_REVOKED = "api_key_revoked"


class SyncAuditSource(str, Enum):
    """Source of the sync operation."""

    WEB_UI = "web_ui"
    DESKTOP_APP = "desktop_app"
    API = "api"
    IMPORT = "import"


class SyncActorType(str, Enum):
    """Type of actor performing the sync operation."""

    USER = "user"
    API_KEY = "api_key"
    SYSTEM = "system"


class SyncAuditStatus(str, Enum):
    """Status of the sync operation."""

    SUCCESS = "success"
    PARTIAL = "partial"
    FAILED = "failed"


# Request schemas


class SyncAuditLogCreateRequest(BaseModel):
    """Request to create an audit log entry."""

    gallery_id: Optional[str] = None
    action: SyncAuditAction
    source: SyncAuditSource
    actor_type: SyncActorType
    actor_id: Optional[str] = None
    api_key_id: Optional[str] = None
    affected_asset_ids: List[str] = Field(default_factory=list)
    affected_count: int = 0
    details: dict = Field(default_factory=dict)
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    status: SyncAuditStatus = SyncAuditStatus.SUCCESS
    error_message: Optional[str] = None
    duration_ms: Optional[int] = None


class SyncAuditLogQuery(BaseModel):
    """Query parameters for audit log listing."""

    gallery_id: Optional[str] = None
    action: Optional[SyncAuditAction] = None
    source: Optional[SyncAuditSource] = None
    actor_id: Optional[str] = None
    api_key_id: Optional[str] = None
    status: Optional[SyncAuditStatus] = None
    start_date: Optional[str] = Field(None, description="ISO date for start of range")
    end_date: Optional[str] = Field(None, description="ISO date for end of range")
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=50, ge=1, le=200)


# Response schemas


class SyncAuditLogResponse(BaseModel):
    """Single audit log entry response."""

    log_id: str
    workspace_id: str
    gallery_id: Optional[str] = None
    action: SyncAuditAction
    source: SyncAuditSource
    actor_type: SyncActorType
    actor_id: Optional[str] = None
    api_key_id: Optional[str] = None
    affected_asset_ids: List[str] = Field(default_factory=list)
    affected_count: int = 0
    details: dict = Field(default_factory=dict)
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    status: SyncAuditStatus
    error_message: Optional[str] = None
    duration_ms: Optional[int] = None
    created_at: str


class SyncAuditLogListResponse(BaseModel):
    """List of audit log entries."""

    data: List[SyncAuditLogResponse]
    total: int
    page: int
    limit: int
    has_more: bool


class SyncAuditSummary(BaseModel):
    """Summary of sync audit activity."""

    total_operations: int
    success_count: int
    partial_count: int
    failed_count: int
    export_count: int
    import_count: int
    last_operation_at: Optional[str] = None
    period_start: str
    period_end: str
