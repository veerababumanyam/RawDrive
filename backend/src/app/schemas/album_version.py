"""
Album Version Pydantic Schemas
Feature: 026-album-proofing

Schemas for album version snapshots and comparison.
"""
from datetime import datetime
from typing import Optional, List, Any, Dict
from uuid import UUID

from pydantic import BaseModel, Field


class VersionMetadata(BaseModel):
    """Metadata stored with version snapshot."""
    total_photos: int = 0
    total_spreads: int = 0


class VersionSnapshot(BaseModel):
    """Complete album state snapshot."""
    album: Dict[str, Any]
    spreads: List[Dict[str, Any]]
    metadata: VersionMetadata


class AlbumVersionCreate(BaseModel):
    """Request schema for creating a version snapshot."""
    label: Optional[str] = Field(None, max_length=255, description="User-provided version label")


class AlbumVersionResponse(BaseModel):
    """Response schema for album version."""
    version_id: UUID
    album_id: UUID
    workspace_id: UUID
    version_number: int
    label: Optional[str] = None
    snapshot_data: VersionSnapshot
    created_by_user_id: UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class AlbumVersionSummary(BaseModel):
    """Summary schema for version list views."""
    version_id: UUID
    version_number: int
    label: Optional[str] = None
    spread_count: int = 0
    thumbnail_url: Optional[str] = None
    created_by_name: str
    created_at: datetime

    model_config = {"from_attributes": True}


class VersionDifferenceType(str):
    """Types of differences between versions."""
    SPREAD_ADDED = "spread_added"
    SPREAD_REMOVED = "spread_removed"
    SPREAD_MODIFIED = "spread_modified"
    ELEMENT_ADDED = "element_added"
    ELEMENT_REMOVED = "element_removed"
    ELEMENT_MODIFIED = "element_modified"


class VersionDifference(BaseModel):
    """A single difference between two versions."""
    type: str
    page_number: int
    description: str
    details: Optional[Dict[str, Any]] = None


class VersionComparison(BaseModel):
    """Comparison result between two versions."""
    version_a: AlbumVersionSummary
    version_b: AlbumVersionSummary
    differences: List[VersionDifference]
    total_changes: int = 0


class RollbackRequest(BaseModel):
    """Request schema for rolling back to a version."""
    create_backup: bool = Field(
        default=True,
        description="Create snapshot of current state before rollback"
    )


class RollbackResponse(BaseModel):
    """Response schema for rollback action."""
    success: bool
    rolled_back_to_version: int
    backup_version_id: Optional[UUID] = None
    message: str


class AlbumVersionListResponse(BaseModel):
    """Response schema for version list."""
    data: List[AlbumVersionSummary]
