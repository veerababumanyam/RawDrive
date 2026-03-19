"""Gallery schemas for request/response validation."""

from datetime import datetime
from typing import Optional, List, Any
from uuid import UUID
from pydantic import BaseModel, Field, field_validator

from src.schemas.common import (
    PaginationMeta,
    GradientConfiguration,
    CustomLink,
    WatermarkConfig,
    FindMeConfig,
    SlideshowConfig,
    ActivityTrackingConfig,
)
from src.schemas.asset_metadata import AssetFlag, ColorLabel


# Valid layout styles - must match LayoutStyle enum in shared-types and DB CHECK constraint
VALID_LAYOUT_STYLES = {
    'tabs', 'continuous', 'grid', 'masonry',
    'justified', 'mosaic', 'filmstrip', 'slideshow',
}


# =============================================================================
# Gallery Schemas
# =============================================================================


class GalleryStatsResponse(BaseModel):
    """Gallery statistics."""

    total_photos: int = Field(default=0)
    total_videos: int = Field(default=0)
    total_items: int = Field(default=0)
    favorites_count: int = Field(default=0)
    selections_count: int = Field(default=0)


class SubGalleryResponse(BaseModel):
    """Sub-gallery response with nested hierarchy support."""

    sub_gallery_id: str
    name: str
    sort_order: int
    visible: bool
    photo_count: int = Field(default=0)
    cover_asset_id: Optional[str] = None
    parent_sub_gallery_id: Optional[str] = Field(
        None,
        description="Parent sub-gallery ID for nested hierarchy (max 3 levels)",
    )
    depth: int = Field(
        default=1,
        ge=1,
        le=3,
        description="Nesting depth (1 = direct child of gallery, 2-3 = nested)",
    )
    children: List["SubGalleryResponse"] = Field(
        default_factory=list,
        description="Nested child sub-galleries",
    )


class SubGalleryCreateRequest(BaseModel):
    """Request to create a sub-gallery with optional nesting."""

    name: str = Field(..., min_length=1, max_length=200)
    sort_order: int = Field(default=0, ge=0)
    parent_sub_gallery_id: Optional[str] = Field(
        None,
        description="Parent sub-gallery ID for nesting (max 3 levels total)",
    )


class SubGalleryUpdateRequest(BaseModel):
    """Request to update a sub-gallery."""

    name: Optional[str] = Field(None, min_length=1, max_length=200)
    sort_order: Optional[int] = Field(None, ge=0)
    visible: Optional[bool] = None
    cover_asset_id: Optional[str] = None
    parent_sub_gallery_id: Optional[str] = Field(
        None,
        description="Move to a different parent sub-gallery",
    )


class UpdateSubGalleriesSortOrderRequest(BaseModel):
    """Request to update sort order for multiple sub-galleries."""

    sub_gallery_ids: List[str] = Field(..., min_length=1, description="List of sub-gallery IDs in new order")


class CompanyProfileResponse(BaseModel):
    """Company profile for gallery branding."""

    company_name: Optional[str] = None
    logo_url: Optional[str] = None
    website_url: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    socials: dict[str, str] = Field(default_factory=dict, description="Social media links {platform: url}")


class GalleryResponse(BaseModel):
    """Full gallery response with all details."""

    gallery_id: str
    workspace_id: str
    title: str
    description: Optional[str] = None
    client_name: Optional[str] = None
    client_id: Optional[str] = None
    shoot_date: Optional[str] = None
    status: str  # draft, published, archived
    branding_profile_id: Optional[str] = None
    company_profile: Optional[CompanyProfileResponse] = None
    portal_language: Optional[str] = None
    layout_style: Optional[str] = Field(
        None,
        description="Layout style. Valid values: tabs, continuous, grid, masonry, justified, mosaic, filmstrip, slideshow",
    )
    theme: Optional[str] = None
    download_policy: Optional[str] = None
    exif_visible: Optional[bool] = None
    password_protected: bool = False
    pin_protected: bool = False
    email_registration_required: bool = False
    expires_at: Optional[str] = None
    published_at: Optional[str] = None
    cover_asset_id: Optional[str] = None
    primary_color: Optional[str] = None
    gradient_config: Optional[GradientConfiguration] = None
    font_family: Optional[str] = None
    custom_domain: Optional[str] = None
    custom_links: List[CustomLink] = Field(default_factory=list)
    created_by_user_id: str
    created_at: str
    pinned_at: Optional[str] = None
    is_pinned: bool = False
    last_accessed_at: Optional[str] = None
    sub_galleries: List[SubGalleryResponse] = Field(default_factory=list)
    stats: GalleryStatsResponse = Field(default_factory=GalleryStatsResponse)

    # Client interaction settings
    comments_enabled: bool = True
    favorites_enabled: bool = True
    selections_enabled: bool = True
    selection_limit: Optional[int] = None
    ratings_enabled: bool = False

    # Advanced configuration
    watermark_config: Optional[WatermarkConfig] = None
    findme_config: Optional[FindMeConfig] = None
    slideshow_config: Optional[SlideshowConfig] = None
    activity_tracking: Optional[ActivityTrackingConfig] = None

    # Notification settings
    notify_on_comment: bool = True
    notify_on_favorite: bool = False
    notify_on_selection: bool = True
    notify_on_download: bool = False

    # Face recognition settings (T006)
    show_people_filter: bool = Field(
        default=False,
        description="When enabled, clients can filter photos by person names detected via face recognition",
    )

    class Config:
        from_attributes = True


class GalleryListItemResponse(BaseModel):
    """Gallery item for list responses (minimal data)."""

    gallery_id: str
    title: str
    description: Optional[str] = None
    client_name: Optional[str] = None
    client_id: Optional[str] = None
    shoot_date: Optional[str] = None
    status: str
    photo_count: int = 0
    created_at: str
    published_at: Optional[str] = None
    pinned_at: Optional[str] = None
    is_pinned: bool = False
    last_accessed_at: Optional[str] = None
    cover_asset_id: Optional[str] = None
    cover_image_url: Optional[str] = None


class GalleryListResponse(BaseModel):
    """Paginated gallery list response."""

    data: List[GalleryListItemResponse]
    meta: PaginationMeta


class GalleryCreateRequest(BaseModel):
    """Request to create a new gallery."""

    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    client_name: Optional[str] = Field(None, max_length=200)
    client_id: Optional[str] = None
    shoot_date: Optional[str] = None  # ISO date string


class GalleryUpdateRequest(BaseModel):
    """Request to update a gallery."""

    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    client_name: Optional[str] = Field(None, max_length=200)
    client_id: Optional[str] = None
    shoot_date: Optional[str] = None
    layout_style: Optional[str] = Field(
        None,
        description="Layout style for gallery. Valid values: tabs, continuous, grid, masonry, justified, mosaic, filmstrip, slideshow",
    )
    theme: Optional[str] = None
    download_policy: Optional[str] = None
    exif_visible: Optional[bool] = None
    email_registration_required: Optional[bool] = None
    expires_at: Optional[str] = None
    branding_profile_id: Optional[str] = None

    @field_validator("layout_style")
    @classmethod
    def validate_layout_style(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_LAYOUT_STYLES:
            raise ValueError(
                f"Invalid layout_style '{v}'. Must be one of: {', '.join(sorted(VALID_LAYOUT_STYLES))}"
            )
        return v
    cover_asset_id: Optional[str] = None
    primary_color: Optional[str] = None
    gradient_config: Optional[GradientConfiguration] = None
    font_family: Optional[str] = None
    custom_domain: Optional[str] = None
    custom_links: Optional[List[CustomLink]] = None

    # Access control fields (frontend sends these)
    password: Optional[str] = Field(None, description="Gallery password (will be hashed)")
    remove_password: Optional[bool] = Field(None, description="Set to true to remove password")
    pin: Optional[str] = Field(None, pattern=r"^\d{4,8}$", description="Gallery PIN (will be hashed)")
    remove_pin: Optional[bool] = Field(None, description="Set to true to remove PIN")

    # Client interaction settings
    comments_enabled: Optional[bool] = None
    favorites_enabled: Optional[bool] = None
    selections_enabled: Optional[bool] = None
    selection_limit: Optional[int] = Field(None, ge=1, le=1000)
    ratings_enabled: Optional[bool] = None

    # Advanced configuration (JSONB)
    watermark_config: Optional[WatermarkConfig] = None
    findme_config: Optional[FindMeConfig] = None
    slideshow_config: Optional[SlideshowConfig] = None
    activity_tracking: Optional[ActivityTrackingConfig] = None

    # Notification settings
    notify_on_comment: Optional[bool] = None
    notify_on_favorite: Optional[bool] = None
    notify_on_selection: Optional[bool] = None
    notify_on_download: Optional[bool] = None

    # Face recognition settings (T006)
    show_people_filter: Optional[bool] = Field(
        None,
        description="Enable/disable people filter for client gallery views",
    )

    class Config:
        extra = "allow"  # Allow extra fields to prevent validation errors


class GalleryPublishRequest(BaseModel):
    """Request to publish/unpublish a gallery."""

    publish: bool = Field(..., description="True to publish, False to unpublish")


class GalleryPasswordRequest(BaseModel):
    """Request to set gallery password."""

    password: Optional[str] = Field(None, min_length=4, max_length=100)


class GalleryPinRequest(BaseModel):
    """Request to set gallery PIN."""

    pin: Optional[str] = Field(None, pattern=r"^\d{4,8}$")


class GalleryCredentialsResponse(BaseModel):
    """Gallery credentials response."""

    gallery_id: str
    password_set: bool
    password: Optional[str] = None
    password_recoverable: bool = False
    pin_set: bool
    pin: Optional[str] = None
    pin_recoverable: bool = False



# =============================================================================
# Gallery Asset Schemas
# =============================================================================


class AssetMetadata(BaseModel):
    """Asset metadata (EXIF, dimensions, etc.)."""

    type: str  # photo, video
    status: str  # available, processing, failed
    mime_type: Optional[str] = None
    filename: str
    width: Optional[int] = None
    height: Optional[int] = None
    duration_ms: Optional[int] = None
    date_taken: Optional[str] = None
    exif: Optional[dict] = None

    # Signed URLs for different variants (populated by R2 service)
    thumbnail_url: Optional[str] = None
    preview_url: Optional[str] = None
    original_url: Optional[str] = None


class GalleryAssetResponse(BaseModel):
    """Gallery asset response."""

    gallery_asset_id: str
    asset_id: str
    sort_order: int
    visible: bool
    is_private: bool = False
    sub_gallery_id: Optional[str] = None
    is_favorited: bool = False
    is_selected: bool = False
    favorites_count: int = 0
    asset: AssetMetadata

    # Caption fields
    caption: Optional[str] = None
    caption_visible: bool = True
    average_rating: Optional[float] = None

    # Pro Review Mode metadata (photographer ratings, not client ratings)
    rating: Optional[int] = Field(
        None, ge=0, le=5, description="Photographer star rating 0-5"
    )
    flag: AssetFlag = Field(
        default=AssetFlag.UNFLAGGED,
        description="Pick/Unflagged/Reject status for culling",
    )
    color_label: ColorLabel = Field(
        default=ColorLabel.NONE,
        description="Adobe Lightroom compatible color label",
    )
    rating_updated_at: Optional[str] = Field(
        None, description="ISO timestamp of last rating/flag change"
    )

    class Config:
        from_attributes = True


class GalleryAssetsListResponse(BaseModel):
    """Paginated gallery assets list response."""

    data: List[GalleryAssetResponse]
    meta: PaginationMeta


class MoveAssetsRequest(BaseModel):
    """Request to move assets to a sub-gallery."""

    asset_ids: List[str] = Field(..., min_length=1)
    sub_gallery_id: Optional[str] = Field(None, description="Target sub-gallery ID, null for root")


class UpdateAssetsSortRequest(BaseModel):
    """Request to update asset sort order."""

    asset_ids: List[str] = Field(..., min_length=1, description="Asset IDs in desired order")


class AddAssetsRequest(BaseModel):
    """Request to add assets to a gallery."""

    asset_ids: List[str] = Field(..., min_length=1)


class RemoveAssetsRequest(BaseModel):
    """Request to remove assets from a gallery."""

    asset_ids: List[str] = Field(..., min_length=1)


class UpdateAssetRequest(BaseModel):
    """Request to update gallery asset metadata."""

    title: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)
    is_private: Optional[bool] = Field(None, description="Lock/unlock the photo")
    caption: Optional[str] = Field(None, max_length=500, description="Photo caption visible to clients")
    caption_visible: Optional[bool] = Field(None, description="Toggle caption display")
# =============================================================================
# Download Limit Schemas (US2 - Daily Download Limits)
# =============================================================================


class DownloadLimitRequest(BaseModel):
    """Request to set daily download limit on a gallery."""

    daily_limit: Optional[int] = Field(
        None,
        ge=0,
        le=1000,
        description="Daily download limit per visitor. Set to 0 or null for unlimited.",
        examples=[5, 10, 25, 50, 100],
    )


class DownloadLimitResponse(BaseModel):
    """Response showing current download limit settings."""

    gallery_id: str = Field(..., description="Gallery ID")
    daily_limit: Optional[int] = Field(
        None,
        description="Current daily download limit (null = unlimited)",
    )
    limit_enabled: bool = Field(
        ...,
        description="Whether download limiting is active",
    )


class DownloadUsageResponse(BaseModel):
    """Response showing current download usage for a visitor."""

    gallery_id: str = Field(..., description="Gallery ID")
    daily_limit: Optional[int] = Field(
        None,
        description="Daily download limit (null = unlimited)",
    )
    current_usage: int = Field(
        default=0,
        ge=0,
        description="Number of downloads today",
    )
    remaining: Optional[int] = Field(
        None,
        ge=0,
        description="Remaining downloads today (null if unlimited)",
    )
    reset_at: Optional[datetime] = Field(
        None,
        description="When the daily limit resets (midnight UTC)",
    )


# =============================================================================
# Breadcrumb Schemas (US6 - Breadcrumb Navigation)
# =============================================================================


class BreadcrumbItem(BaseModel):
    """Single breadcrumb item in navigation path."""

    id: str = Field(..., description="Gallery or sub-gallery ID")
    name: str = Field(..., description="Display name")
    type: str = Field(
        ...,
        description="Type of item: 'gallery' or 'sub_gallery'",
        pattern="^(gallery|sub_gallery)$",
    )
    depth: int = Field(
        default=0,
        ge=0,
        le=3,
        description="Depth level (0 = gallery root, 1-3 = sub-gallery levels)",
    )


class BreadcrumbsResponse(BaseModel):
    """Breadcrumb navigation path from root to current location."""

    gallery_id: str = Field(..., description="Gallery ID")
    current_sub_gallery_id: Optional[str] = Field(
        None,
        description="Current sub-gallery ID (null if at gallery root)",
    )
    items: List[BreadcrumbItem] = Field(
        default_factory=list,
        description="Breadcrumb items from root gallery to current location",
    )