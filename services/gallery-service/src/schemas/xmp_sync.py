"""
XMP Sync Schemas
Pydantic models for XMP sidecar file generation and parsing
Feature: 029-pro-review-xmp-sync
Task: T034
"""

from datetime import datetime
from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class XmpRating(int, Enum):
    """XMP rating values (0-5 stars)"""
    UNRATED = 0
    ONE_STAR = 1
    TWO_STARS = 2
    THREE_STARS = 3
    FOUR_STARS = 4
    FIVE_STARS = 5


class XmpLabel(str, Enum):
    """XMP label/color values (matches Lightroom)"""
    NONE = ""
    RED = "Red"
    YELLOW = "Yellow"
    GREEN = "Green"
    BLUE = "Blue"
    PURPLE = "Purple"


class XmpFlag(str, Enum):
    """XMP flag values for pick/reject"""
    UNFLAGGED = ""
    PICK = "Pick"
    REJECT = "Reject"


# Color label to XMP label mapping
COLOR_LABEL_TO_XMP: Dict[str, XmpLabel] = {
    "none": XmpLabel.NONE,
    "red": XmpLabel.RED,
    "yellow": XmpLabel.YELLOW,
    "green": XmpLabel.GREEN,
    "blue": XmpLabel.BLUE,
    "purple": XmpLabel.PURPLE,
}

# XMP label to color label mapping
XMP_TO_COLOR_LABEL: Dict[str, str] = {
    "": "none",
    "Red": "red",
    "Yellow": "yellow",
    "Green": "green",
    "Blue": "blue",
    "Purple": "purple",
}

# Flag to XMP mapping
FLAG_TO_XMP: Dict[str, XmpFlag] = {
    "unflagged": XmpFlag.UNFLAGGED,
    "pick": XmpFlag.PICK,
    "reject": XmpFlag.REJECT,
}

# XMP to flag mapping
XMP_TO_FLAG: Dict[str, str] = {
    "": "unflagged",
    "Pick": "pick",
    "Reject": "reject",
}


class XmpMetadata(BaseModel):
    """
    XMP metadata for a single asset.
    Maps to/from Adobe XMP sidecar format.
    """
    # File identification
    filename: str = Field(..., description="Original filename (without extension)")
    original_filename: str = Field(..., description="Full original filename with extension")

    # Core metadata (xmp:Rating, xmp:Label)
    rating: XmpRating = Field(default=XmpRating.UNRATED, description="Star rating 0-5")
    label: XmpLabel = Field(default=XmpLabel.NONE, description="Color label")

    # Pick/reject flag (photoshop:Urgency or custom namespace)
    flag: XmpFlag = Field(default=XmpFlag.UNFLAGGED, description="Pick/reject flag")

    # Additional metadata
    title: Optional[str] = Field(default=None, description="Asset title")
    description: Optional[str] = Field(default=None, description="Asset description/caption")
    creator: Optional[str] = Field(default=None, description="Creator/photographer name")
    copyright: Optional[str] = Field(default=None, description="Copyright notice")

    # Keywords/tags
    keywords: List[str] = Field(default_factory=list, description="Keywords/tags")

    # Timestamps
    date_created: Optional[datetime] = Field(default=None, description="Creation date")
    modify_date: Optional[datetime] = Field(default=None, description="Last modification date")

    # RawDrive-specific extensions
    rawdrive_asset_id: Optional[str] = Field(default=None, description="RawDrive asset UUID")
    rawdrive_gallery_id: Optional[str] = Field(default=None, description="RawDrive gallery UUID")
    rawdrive_sync_timestamp: Optional[datetime] = Field(default=None, description="Last sync timestamp")

    class Config:
        use_enum_values = True


class XmpExportRequest(BaseModel):
    """Request to export XMP files for assets"""
    asset_ids: Optional[List[str]] = Field(
        default=None,
        description="Specific asset IDs to export. If None, exports all assets in gallery."
    )
    sub_gallery_id: Optional[str] = Field(
        default=None,
        description="Filter by sub-gallery ID"
    )
    include_picks_only: bool = Field(
        default=False,
        description="Only export assets with pick flag"
    )
    include_rated_only: bool = Field(
        default=False,
        description="Only export assets with rating >= 1"
    )
    min_rating: Optional[int] = Field(
        default=None,
        ge=0,
        le=5,
        description="Minimum rating filter"
    )
    include_rawdrive_metadata: bool = Field(
        default=True,
        description="Include RawDrive-specific metadata in XMP"
    )


class XmpExportPreview(BaseModel):
    """Preview of XMP export operation"""
    total_assets: int = Field(..., description="Total assets matching criteria")
    sample_files: List[str] = Field(..., description="Sample of filenames that will be exported")
    estimated_size_bytes: int = Field(..., description="Estimated total size of XMP files")


class XmpExportProgress(BaseModel):
    """Progress update for XMP export operation"""
    total: int = Field(..., description="Total assets to export")
    processed: int = Field(..., description="Assets processed so far")
    current_file: Optional[str] = Field(default=None, description="Current file being processed")
    status: str = Field(default="processing", description="Current status")
    error_count: int = Field(default=0, description="Number of errors encountered")


class XmpExportResult(BaseModel):
    """Result of XMP export operation"""
    success: bool = Field(..., description="Whether export completed successfully")
    total_exported: int = Field(..., description="Number of XMP files exported")
    errors: List[Dict[str, str]] = Field(default_factory=list, description="List of errors")
    download_url: Optional[str] = Field(default=None, description="URL to download ZIP file")
    zip_filename: str = Field(..., description="Name of the generated ZIP file")
    zip_size_bytes: int = Field(..., description="Size of the ZIP file in bytes")


class XmpImportRequest(BaseModel):
    """Request to import XMP files"""
    match_by: str = Field(
        default="filename",
        description="How to match XMP to assets: 'filename' or 'rawdrive_id'"
    )
    overwrite_existing: bool = Field(
        default=True,
        description="Whether to overwrite existing metadata"
    )
    import_rating: bool = Field(default=True, description="Import rating values")
    import_label: bool = Field(default=True, description="Import color labels")
    import_flag: bool = Field(default=True, description="Import pick/reject flags")
    import_keywords: bool = Field(default=False, description="Import keywords/tags")
    dry_run: bool = Field(
        default=False,
        description="Preview changes without applying them"
    )


class XmpImportPreview(BaseModel):
    """Preview of XMP import operation"""
    total_files: int = Field(..., description="Total XMP files in upload")
    matched: int = Field(..., description="Files matched to existing assets")
    unmatched: int = Field(..., description="Files that couldn't be matched")
    changes: List[Dict[str, Any]] = Field(
        ...,
        description="List of changes that will be applied"
    )


class XmpImportResult(BaseModel):
    """Result of XMP import operation"""
    success: bool = Field(..., description="Whether import completed successfully")
    total_imported: int = Field(..., description="Number of assets updated")
    total_skipped: int = Field(..., description="Number of files skipped (no match)")
    total_errors: int = Field(..., description="Number of errors")
    details: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Detailed results for each file"
    )


class XmpSyncStatus(BaseModel):
    """Sync status for gallery XMP operations"""
    gallery_id: str = Field(..., description="Gallery UUID")
    last_export_at: Optional[datetime] = Field(default=None, description="Last export timestamp")
    last_import_at: Optional[datetime] = Field(default=None, description="Last import timestamp")
    total_assets: int = Field(..., description="Total assets in gallery")
    assets_with_xmp: int = Field(..., description="Assets that have been exported")
    pending_changes: int = Field(
        default=0,
        description="Assets with changes since last export"
    )
