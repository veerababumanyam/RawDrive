"""Asset Domain Model.

Represents a media file (photo or video) stored in the system with its
metadata, processing status, and face scan status for face recognition features.

Feature: Face Recognition & Tagging
Task: T005 - Add face_scan_status field to Asset model
"""

from datetime import datetime
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# =============================================================================
# ENUMS
# =============================================================================


class AssetType(str, Enum):
    """Type of media asset.

    Distinguishes between photos and videos for processing pipelines
    and UI display purposes.
    """

    PHOTO = "photo"
    VIDEO = "video"


class AssetStatus(str, Enum):
    """Processing status of an asset.

    Tracks the lifecycle of an asset from upload to availability.
    """

    UPLOADING = "uploading"
    PROCESSING = "processing"
    AVAILABLE = "available"
    FAILED = "failed"
    DELETED = "deleted"


class FaceScanStatus(str, Enum):
    """Face scan processing status for an asset.

    Tracks the state of face detection and embedding extraction for an asset.
    This enables the UI to show scan progress and allows filtering by scan state.

    States:
    - NOT_SCANNED: Asset has not been processed for faces (default for new assets)
    - PENDING: Asset is queued for face scanning
    - SCANNING: Face detection/embedding extraction in progress
    - COMPLETED: Face scanning completed successfully (faces may or may not have been found)
    - FAILED: Face scanning failed (will be retried based on retry policy)
    - SKIPPED: Asset was skipped (e.g., not an image, too small, or unsupported format)
    """

    NOT_SCANNED = "not_scanned"
    PENDING = "pending"
    SCANNING = "scanning"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


# =============================================================================
# ASSET MODEL
# =============================================================================


class Asset(BaseModel):
    """Asset Domain Model.

    Represents a media file (photo or video) with comprehensive metadata
    including storage location, EXIF data, processing status, and face scan status.

    Workspace Isolation:
        All asset data is strictly isolated by workspace_id.
        Cross-workspace queries are not permitted.
    """

    model_config = ConfigDict(from_attributes=True)

    # Primary identifiers
    asset_id: UUID = Field(..., description="Unique asset identifier")
    workspace_id: UUID = Field(
        ...,
        description="Workspace ID for multi-tenant isolation",
    )

    # Optional organizational relationships
    library_id: Optional[UUID] = Field(
        None,
        description="Library this asset belongs to (if any)",
    )
    folder_id: Optional[UUID] = Field(
        None,
        description="Folder this asset is organized in (if any)",
    )

    # Asset type and content
    type: AssetType = Field(
        ...,
        description="Type of media (photo or video)",
    )
    mime_type: str = Field(
        ...,
        description="MIME type of the original file (e.g., image/jpeg)",
    )

    # Storage information
    original_object_key: str = Field(
        ...,
        description="Object storage key for the original file",
    )
    original_bytes: int = Field(
        ...,
        ge=0,
        description="Size of the original file in bytes",
    )
    sha256: str = Field(
        ...,
        min_length=64,
        max_length=64,
        description="SHA256 hash of the original file for deduplication",
    )

    # Metadata
    exif: Optional[dict[str, Any]] = Field(
        None,
        description="Extracted EXIF metadata from the file",
    )

    # Processing status
    status: AssetStatus = Field(
        default=AssetStatus.UPLOADING,
        description="Current processing status of the asset",
    )

    # Face recognition status (T005)
    face_scan_status: FaceScanStatus = Field(
        default=FaceScanStatus.NOT_SCANNED,
        description="Face scan processing status for face recognition feature",
    )
    faces_count: Optional[int] = Field(
        None,
        ge=0,
        description="Number of faces detected in this asset (NULL if not scanned)",
    )
    face_scan_error: Optional[str] = Field(
        None,
        description="Error message if face scan failed",
    )
    face_scanned_at: Optional[datetime] = Field(
        None,
        description="When face scanning was completed",
    )

    # Audit fields
    created_by_user_id: UUID = Field(
        ...,
        description="User who uploaded this asset",
    )
    created_at: datetime = Field(
        ...,
        description="When the asset was created",
    )
    updated_at: datetime = Field(
        ...,
        description="Last update timestamp",
    )

    # Computed properties
    @property
    def is_image(self) -> bool:
        """Check if asset is an image type."""
        return self.type == AssetType.PHOTO

    @property
    def is_video(self) -> bool:
        """Check if asset is a video type."""
        return self.type == AssetType.VIDEO

    @property
    def is_available(self) -> bool:
        """Check if asset is available for viewing."""
        return self.status == AssetStatus.AVAILABLE

    @property
    def needs_face_scan(self) -> bool:
        """Check if asset needs face scanning."""
        return (
            self.is_image
            and self.face_scan_status == FaceScanStatus.NOT_SCANNED
        )

    @property
    def face_scan_in_progress(self) -> bool:
        """Check if face scan is currently in progress."""
        return self.face_scan_status in (
            FaceScanStatus.PENDING,
            FaceScanStatus.SCANNING,
        )

    @property
    def has_faces(self) -> bool:
        """Check if faces were detected in this asset."""
        return (
            self.face_scan_status == FaceScanStatus.COMPLETED
            and self.faces_count is not None
            and self.faces_count > 0
        )


# =============================================================================
# CREATE MODEL
# =============================================================================


class AssetCreate(BaseModel):
    """Schema for creating a new asset record.

    Used during the upload process when committing an uploaded file.
    """

    # Required fields
    workspace_id: UUID = Field(
        ...,
        description="Workspace ID for multi-tenant isolation",
    )
    type: AssetType = Field(
        ...,
        description="Type of media (photo or video)",
    )
    original_object_key: str = Field(
        ...,
        description="Object storage key for the original file",
    )
    original_bytes: int = Field(
        ...,
        ge=0,
        description="Size of the original file in bytes",
    )
    sha256: str = Field(
        ...,
        min_length=64,
        max_length=64,
        description="SHA256 hash of the original file",
    )
    mime_type: str = Field(
        ...,
        description="MIME type of the original file",
    )
    created_by_user_id: UUID = Field(
        ...,
        description="User who uploaded this asset",
    )

    # Optional fields
    library_id: Optional[UUID] = Field(
        None,
        description="Library this asset belongs to",
    )
    folder_id: Optional[UUID] = Field(
        None,
        description="Folder this asset is organized in",
    )
    exif: Optional[dict[str, Any]] = Field(
        None,
        description="Extracted EXIF metadata",
    )
    status: AssetStatus = Field(
        default=AssetStatus.UPLOADING,
        description="Initial processing status",
    )


# =============================================================================
# UPDATE MODEL
# =============================================================================


class AssetUpdate(BaseModel):
    """Schema for updating an existing asset record.

    All fields are optional. Common update scenarios:
    - Updating processing status
    - Adding EXIF metadata after extraction
    - Updating face scan status and results
    - Moving to different folder/library
    """

    # Organizational updates
    library_id: Optional[UUID] = Field(
        None,
        description="Move to different library",
    )
    folder_id: Optional[UUID] = Field(
        None,
        description="Move to different folder",
    )

    # Metadata updates
    exif: Optional[dict[str, Any]] = Field(
        None,
        description="Update EXIF metadata",
    )

    # Status updates
    status: Optional[AssetStatus] = Field(
        None,
        description="Update processing status",
    )

    # Face scan updates (T005)
    face_scan_status: Optional[FaceScanStatus] = Field(
        None,
        description="Update face scan status",
    )
    faces_count: Optional[int] = Field(
        None,
        ge=0,
        description="Update detected faces count",
    )
    face_scan_error: Optional[str] = Field(
        None,
        description="Update face scan error message",
    )
    face_scanned_at: Optional[datetime] = Field(
        None,
        description="Update face scan completion time",
    )


# =============================================================================
# FACE SCAN STATUS UPDATE MODEL
# =============================================================================


class AssetFaceScanUpdate(BaseModel):
    """Schema specifically for updating face scan status.

    Used by the face detection service to update scan progress and results.
    """

    face_scan_status: FaceScanStatus = Field(
        ...,
        description="New face scan status",
    )
    faces_count: Optional[int] = Field(
        None,
        ge=0,
        description="Number of faces detected (required for COMPLETED status)",
    )
    face_scan_error: Optional[str] = Field(
        None,
        description="Error message (required for FAILED status)",
    )
    face_scanned_at: Optional[datetime] = Field(
        None,
        description="When face scanning completed (auto-set for COMPLETED status)",
    )


# =============================================================================
# SUMMARY MODEL
# =============================================================================


class AssetSummary(BaseModel):
    """Lightweight asset summary for list responses.

    Excludes large fields like EXIF metadata for efficient API responses.
    """

    model_config = ConfigDict(from_attributes=True)

    asset_id: UUID
    workspace_id: UUID
    type: AssetType
    mime_type: str
    original_bytes: int
    status: AssetStatus

    # Face scan summary (T005)
    face_scan_status: FaceScanStatus = Field(
        default=FaceScanStatus.NOT_SCANNED,
    )
    faces_count: Optional[int] = None

    # Timestamps
    created_at: datetime
    updated_at: datetime


# =============================================================================
# ASSET WITH FACE DATA MODEL
# =============================================================================


class AssetWithFaceData(BaseModel):
    """Asset with face detection summary.

    Used when displaying assets with their face detection results.
    """

    model_config = ConfigDict(from_attributes=True)

    asset: Asset
    face_ids: list[UUID] = Field(
        default_factory=list,
        description="IDs of detected faces in this asset",
    )
    face_group_ids: list[UUID] = Field(
        default_factory=list,
        description="IDs of face groups (people) appearing in this asset",
    )


# =============================================================================
# BATCH FACE SCAN REQUEST MODEL
# =============================================================================


class AssetBatchFaceScanRequest(BaseModel):
    """Request to queue multiple assets for face scanning.

    Used when triggering face scan for a gallery or selection of assets.
    """

    asset_ids: list[UUID] = Field(
        ...,
        min_length=1,
        description="Asset IDs to queue for face scanning",
    )
    priority: int = Field(
        default=0,
        ge=0,
        le=10,
        description="Scan priority (higher = processed sooner)",
    )
    force_rescan: bool = Field(
        default=False,
        description="Force rescan even if already scanned",
    )


class AssetBatchFaceScanResponse(BaseModel):
    """Response from batch face scan request.

    Reports how many assets were queued vs skipped.
    """

    queued_count: int = Field(
        ...,
        ge=0,
        description="Number of assets queued for scanning",
    )
    skipped_count: int = Field(
        ...,
        ge=0,
        description="Number of assets skipped (already scanned or not images)",
    )
    already_scanning_count: int = Field(
        default=0,
        ge=0,
        description="Number of assets already in scan queue",
    )
