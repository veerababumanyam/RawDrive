"""Batch operation schemas for request/response validation."""

from datetime import datetime
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel, Field


# =============================================================================
# Batch Signed URLs
# =============================================================================


class BatchSignedUrlsRequest(BaseModel):
    """Request for batch signed URL generation."""

    asset_ids: List[UUID] = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Asset IDs to generate signed URLs for (max 200)",
    )
    variants: List[str] = Field(
        default=["thumbnail", "preview"],
        description="URL variants to generate (thumbnail, preview, original)",
    )
    gallery_id: Optional[UUID] = Field(
        None,
        description="Optional gallery context for URL generation",
    )


class SignedUrlSet(BaseModel):
    """Signed URLs for a single asset."""

    asset_id: str
    thumbnail: Optional[str] = None
    preview: Optional[str] = None
    original: Optional[str] = None
    expires_at: str  # ISO timestamp


class BatchSignedUrlsResponse(BaseModel):
    """Batch signed URLs response."""

    urls: dict[str, SignedUrlSet]  # asset_id -> SignedUrlSet
    generated_count: int
    cache_hits: int = 0


# =============================================================================
# Batch Asset Metadata
# =============================================================================


class BatchMetadataRequest(BaseModel):
    """Request for batch asset metadata."""

    asset_ids: List[UUID] = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Asset IDs to retrieve metadata for (max 500)",
    )
    include_exif: bool = Field(
        default=False,
        description="Include full EXIF data in response",
    )
    include_signed_urls: bool = Field(
        default=True,
        description="Include signed URLs for thumbnails/previews",
    )
    include_quality_scores: bool = Field(
        default=False,
        description="Include quality analysis scores if available",
    )


class AssetMetadataItem(BaseModel):
    """Metadata for a single asset."""

    asset_id: str
    type: str  # photo, video
    status: str
    mime_type: Optional[str] = None
    filename: str
    width: Optional[int] = None
    height: Optional[int] = None
    duration_ms: Optional[int] = None  # For videos
    date_taken: Optional[str] = None
    exif: Optional[dict] = None  # Only if include_exif=True
    thumbnail_url: Optional[str] = None
    preview_url: Optional[str] = None
    original_url: Optional[str] = None
    # Quality scores (optional)
    overall_score: Optional[float] = None
    sharpness_score: Optional[float] = None
    blur_detected: Optional[bool] = None


class BatchMetadataResponse(BaseModel):
    """Batch metadata response."""

    assets: List[AssetMetadataItem]
    total: int
    not_found: List[str] = Field(
        default_factory=list,
        description="Asset IDs that were not found",
    )


# =============================================================================
# Batch Quality Scores
# =============================================================================


class BatchQualityScoresRequest(BaseModel):
    """Request for batch quality scores."""

    asset_ids: List[UUID] = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Asset IDs to retrieve quality scores for (max 500)",
    )
    session_id: Optional[UUID] = Field(
        None,
        description="Filter by curation session (uses latest if not specified)",
    )
    include_details: bool = Field(
        default=False,
        description="Include detailed analysis (blur type, crop suggestion)",
    )


class QualityScoreItem(BaseModel):
    """Quality scores for a single asset."""

    asset_id: str
    overall_score: float
    sharpness_score: float
    exposure_score: float
    composition_score: float
    blur_detected: bool
    blur_severity: Optional[str] = None
    blur_type: Optional[str] = None
    noise_level: str
    analyzed_at: str
    # Optional details
    highlights_clipped: Optional[bool] = None
    shadows_blocked: Optional[bool] = None
    horizon_tilt_degrees: Optional[float] = None
    crop_suggestion: Optional[dict] = None


class BatchQualityScoresResponse(BaseModel):
    """Batch quality scores response."""

    scores: List[QualityScoreItem]
    total: int
    not_analyzed: List[str] = Field(
        default_factory=list,
        description="Asset IDs without quality analysis",
    )
