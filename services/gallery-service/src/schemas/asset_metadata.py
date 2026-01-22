"""Asset metadata schemas for Pro Review Mode.

Supports rating, flag, and color_label operations for professional photo culling.
These are photographer-level metadata, separate from client interactions.
"""

from enum import Enum
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field


class AssetFlag(str, Enum):
    """Flag status for photo culling (Adobe Lightroom compatible)."""

    PICK = "pick"  # Selected/approved
    UNFLAGGED = "unflagged"  # Neutral/not reviewed
    REJECT = "reject"  # Marked for deletion


class ColorLabel(str, Enum):
    """Color label for categorization (Adobe Lightroom compatible)."""

    NONE = "none"
    RED = "red"
    YELLOW = "yellow"
    GREEN = "green"
    BLUE = "blue"
    PURPLE = "purple"


# Request schemas


class AssetMetadataUpdateRequest(BaseModel):
    """Request to update asset metadata (rating, flag, color_label)."""

    rating: Optional[int] = Field(
        None,
        ge=0,
        le=5,
        description="Star rating 0-5 (null = don't change, 0 = explicitly no rating)",
    )
    flag: Optional[AssetFlag] = Field(
        None, description="Flag status (null = don't change)"
    )
    color_label: Optional[ColorLabel] = Field(
        None, description="Color label (null = don't change)"
    )

    class Config:
        json_schema_extra = {
            "example": {"rating": 4, "flag": "pick", "color_label": "green"}
        }


class BatchAssetMetadataItem(BaseModel):
    """Single item in batch metadata update."""

    asset_id: str = Field(..., description="Gallery asset ID")
    rating: Optional[int] = Field(None, ge=0, le=5)
    flag: Optional[AssetFlag] = None
    color_label: Optional[ColorLabel] = None


class BatchAssetMetadataUpdateRequest(BaseModel):
    """Request to update metadata for multiple assets."""

    updates: List[BatchAssetMetadataItem] = Field(
        ..., min_length=1, max_length=500, description="List of updates to apply"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "updates": [
                    {"asset_id": "abc123", "rating": 5, "flag": "pick"},
                    {"asset_id": "def456", "rating": 2, "flag": "reject"},
                ]
            }
        }


class AssetFilterRequest(BaseModel):
    """Request to filter assets by rating/flag/color_label."""

    min_rating: Optional[int] = Field(None, ge=0, le=5, description="Minimum rating")
    max_rating: Optional[int] = Field(None, ge=0, le=5, description="Maximum rating")
    rating: Optional[int] = Field(None, ge=0, le=5, description="Exact rating match")
    flags: Optional[List[AssetFlag]] = Field(
        None, description="Include assets with these flags"
    )
    color_labels: Optional[List[ColorLabel]] = Field(
        None, description="Include assets with these color labels"
    )
    has_rating: Optional[bool] = Field(
        None, description="True = only rated, False = only unrated"
    )
    sub_gallery_id: Optional[str] = Field(None, description="Filter by sub-gallery")

    class Config:
        json_schema_extra = {
            "example": {
                "min_rating": 3,
                "flags": ["pick", "unflagged"],
                "color_labels": ["red", "green"],
            }
        }


# Response schemas


class AssetMetadataResponse(BaseModel):
    """Asset metadata in response."""

    asset_id: str
    gallery_id: str
    rating: Optional[int] = Field(None, description="Star rating 0-5")
    flag: AssetFlag = Field(default=AssetFlag.UNFLAGGED)
    color_label: ColorLabel = Field(default=ColorLabel.NONE)
    rating_updated_at: Optional[str] = Field(
        None, description="ISO timestamp of last rating change"
    )
    rating_updated_by: Optional[str] = Field(None, description="User ID who last updated")


class AssetMetadataUpdateResponse(BaseModel):
    """Response from metadata update."""

    asset_id: str
    rating: Optional[int] = None
    flag: AssetFlag = AssetFlag.UNFLAGGED
    color_label: ColorLabel = ColorLabel.NONE
    rating_updated_at: str
    updated: bool = True


class BatchAssetMetadataUpdateResponse(BaseModel):
    """Response from batch metadata update."""

    success_count: int
    error_count: int
    results: List[AssetMetadataUpdateResponse]
    errors: List[dict] = Field(default_factory=list)


class FilteredAssetsResponse(BaseModel):
    """Response from filtered asset query."""

    data: List[AssetMetadataResponse]
    total: int
    page: int
    limit: int
    has_more: bool
    filter_summary: dict = Field(
        default_factory=dict,
        description="Summary of applied filters",
    )
