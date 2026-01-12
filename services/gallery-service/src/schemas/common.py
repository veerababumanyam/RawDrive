"""Common schemas shared across the gallery service."""

from typing import Optional, Any
from pydantic import BaseModel, Field


class PaginationMeta(BaseModel):
    """Pagination metadata for list responses."""

    page: int = Field(..., ge=1, description="Current page number")
    limit: int = Field(..., ge=1, le=100, description="Items per page")
    total: int = Field(..., ge=0, description="Total number of items")
    total_pages: int = Field(..., ge=0, description="Total number of pages")
    has_more: bool = Field(default=False, description="Whether there are more pages")

    class Config:
        json_schema_extra = {
            "example": {
                "page": 1,
                "limit": 20,
                "total": 150,
                "total_pages": 8,
                "has_more": True,
            }
        }


class ErrorResponse(BaseModel):
    """Standard error response."""

    error: str = Field(..., description="Error code")
    message: str = Field(..., description="Human-readable error message")
    details: Optional[Any] = Field(None, description="Additional error details")
    correlation_id: Optional[str] = Field(None, description="Request correlation ID")

    class Config:
        json_schema_extra = {
            "example": {
                "error": "GALLERY_NOT_FOUND",
                "message": "Gallery with the specified ID was not found",
                "details": None,
                "correlation_id": "abc123-def456",
            }
        }


class SuccessResponse(BaseModel):
    """Generic success response."""

    success: bool = Field(default=True)
    message: Optional[str] = Field(None, description="Success message")


class GradientColor(BaseModel):
    """Single color stop in a gradient."""

    color: str = Field(..., pattern=r"^#[0-9A-Fa-f]{6}$", description="Hex color code")
    position: int = Field(..., ge=0, le=100, description="Position in gradient (0-100)")


class GradientConfiguration(BaseModel):
    """Gallery branding gradient configuration."""

    type: str = Field(default="linear", description="Gradient type (linear, radial)")
    preset_id: Optional[str] = Field(None, description="Preset gradient ID")
    direction: int = Field(default=135, ge=0, le=360, description="Gradient direction in degrees")
    colors: list[GradientColor] = Field(default_factory=list, description="Gradient color stops")


class CustomLink(BaseModel):
    """Custom link for gallery branding."""

    label: str = Field(..., min_length=1, max_length=50, description="Link label")
    url: str = Field(..., description="Link URL")
    icon: Optional[str] = Field(None, description="Optional icon identifier")


# =============================================================================
# Gallery Configuration Schemas
# =============================================================================


class WatermarkConfig(BaseModel):
    """Watermark configuration for gallery downloads."""

    enabled: bool = Field(default=False, description="Whether watermark is enabled")
    position: Optional[str] = Field(
        default="bottom-right",
        description="Watermark position (top-left, top-right, bottom-left, bottom-right, center, tiled)"
    )
    opacity: Optional[int] = Field(default=50, ge=10, le=100, description="Watermark opacity (10-100%)")
    scale: Optional[int] = Field(default=20, ge=10, le=50, description="Watermark scale (10-50% of image)")
    custom_watermark_asset_id: Optional[str] = Field(None, description="Custom watermark image asset ID")


class FindMeConfig(BaseModel):
    """FindMe (face recognition) configuration for galleries."""

    enabled: bool = Field(default=False, description="Whether FindMe is enabled")
    confidence_threshold: Optional[float] = Field(
        default=0.7, ge=0.5, le=0.95, description="Face match confidence threshold"
    )
    max_results: Optional[int] = Field(default=100, ge=10, le=500, description="Maximum search results")
    allow_guest_search: Optional[bool] = Field(default=True, description="Allow guests to use face search")


class SlideshowConfig(BaseModel):
    """Slideshow configuration for galleries."""

    enabled: bool = Field(default=True, description="Whether slideshow is enabled")
    interval_seconds: Optional[int] = Field(default=5, ge=3, le=30, description="Slide interval in seconds")
    transition: Optional[str] = Field(
        default="fade", description="Transition effect (fade, slide, zoom, none)"
    )
    show_captions: Optional[bool] = Field(default=True, description="Show photo captions in slideshow")
    loop: Optional[bool] = Field(default=True, description="Loop slideshow")
    autoplay: Optional[bool] = Field(default=False, description="Autoplay slideshow on gallery open")


class ActivityTrackingConfig(BaseModel):
    """Activity tracking configuration for galleries."""

    track_views: bool = Field(default=True, description="Track photo views")
    track_downloads: bool = Field(default=True, description="Track photo downloads")
    track_shares: bool = Field(default=True, description="Track photo shares")
    anonymous_mode: bool = Field(default=False, description="Anonymize tracking data")
