"""
Pydantic schemas for sync mappings.

Provides request/response schemas for folder-to-gallery sync mappings.
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from src.schemas.common import SyncMappingStatus, SyncErrorCode, PaginatedResponse


# ---------------------------------------------------------------------------
# Sync Mapping Schemas
# ---------------------------------------------------------------------------


class SyncMappingBase(BaseModel):
    """Base schema for sync mapping."""

    gallery_id: UUID = Field(..., description="Target gallery ID")
    folder_path: str = Field(
        ...,
        min_length=1,
        max_length=1024,
        description="Local folder path",
    )
    display_name: Optional[str] = Field(
        None,
        max_length=255,
        description="Display name for the mapping",
    )
    include_subfolders: bool = Field(
        default=False,
        description="Whether to sync nested folders",
    )
    include_patterns: Optional[List[str]] = Field(
        default=None,
        description="File patterns to include (glob patterns)",
    )
    exclude_patterns: Optional[List[str]] = Field(
        default=None,
        description="File patterns to exclude",
    )


class SyncMappingCreate(SyncMappingBase):
    """Schema for creating a new sync mapping."""

    @field_validator("folder_path")
    @classmethod
    def validate_folder_path(cls, v: str) -> str:
        """Validate folder path is not empty and strip whitespace."""
        v = v.strip()
        if not v:
            raise ValueError("Folder path cannot be empty")
        return v

    @field_validator("include_patterns", "exclude_patterns")
    @classmethod
    def validate_patterns(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        """Validate and normalize file patterns."""
        if v is None:
            return None
        # Remove empty patterns and strip whitespace
        return [p.strip() for p in v if p.strip()]


class SyncMappingUpdate(BaseModel):
    """Schema for updating an existing sync mapping."""

    display_name: Optional[str] = Field(
        None,
        max_length=255,
        description="Update display name",
    )
    include_subfolders: Optional[bool] = Field(
        None,
        description="Update subfolder setting",
    )
    include_patterns: Optional[List[str]] = Field(
        None,
        description="Update include patterns",
    )
    exclude_patterns: Optional[List[str]] = Field(
        None,
        description="Update exclude patterns",
    )
    status: Optional[SyncMappingStatus] = Field(
        None,
        description="Update mapping status",
    )


class SyncMappingResponse(BaseModel):
    """Schema for sync mapping response."""

    mapping_id: UUID = Field(..., description="Unique mapping identifier")
    workspace_id: UUID = Field(..., description="Workspace ID")
    gallery_id: UUID = Field(..., description="Target gallery ID")
    gallery_name: Optional[str] = Field(None, description="Gallery name (denormalized)")
    folder_path: str = Field(..., description="Local folder path")
    display_name: Optional[str] = Field(None, description="Display name")
    include_subfolders: bool = Field(..., description="Whether to sync nested folders")
    include_patterns: Optional[List[str]] = Field(None, description="Include patterns")
    exclude_patterns: Optional[List[str]] = Field(None, description="Exclude patterns")
    status: SyncMappingStatus = Field(..., description="Current mapping status")
    total_files_synced: int = Field(default=0, description="Total files synced")
    total_bytes_synced: int = Field(default=0, description="Total bytes synced")
    last_sync_at: Optional[datetime] = Field(None, description="Last sync timestamp")
    last_error: Optional[str] = Field(None, description="Last error message")
    last_error_code: Optional[SyncErrorCode] = Field(None, description="Last error code")
    created_by_user_id: UUID = Field(..., description="Creator user ID")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")

    model_config = {"from_attributes": True}


class SyncMappingListResponse(PaginatedResponse[SyncMappingResponse]):
    """Paginated list of sync mappings."""

    pass


class SyncMappingStats(BaseModel):
    """Statistics for a sync mapping."""

    mapping_id: UUID = Field(..., description="Mapping ID")
    total_files_synced: int = Field(default=0, description="Total files synced (all time)")
    total_bytes_synced: int = Field(default=0, description="Total bytes synced (all time)")
    total_sessions: int = Field(default=0, description="Total sessions")
    files_synced_today: int = Field(default=0, description="Files synced today")
    bytes_synced_today: int = Field(default=0, description="Bytes synced today")
    average_file_size: Optional[int] = Field(None, description="Average file size")
    average_upload_speed_bps: Optional[int] = Field(None, description="Average upload speed")
    success_rate_percent: float = Field(default=100.0, description="Success rate percentage")
    last_sync_at: Optional[datetime] = Field(None, description="Last sync timestamp")
    file_type_breakdown: Optional[dict] = Field(None, description="File type distribution")


class CreateSyncMappingResponse(BaseModel):
    """Response after creating a sync mapping."""

    mapping: SyncMappingResponse
    message: str = Field(default="Sync mapping created successfully")
