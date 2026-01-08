"""Gallery schemas for request/response validation."""

from datetime import datetime
from typing import Optional, List, Any
from uuid import UUID
from pydantic import BaseModel, Field

from src.schemas.common import PaginationMeta, GradientConfiguration, CustomLink


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
    """Sub-gallery response."""

    sub_gallery_id: str
    name: str
    sort_order: int
    visible: bool
    photo_count: int = Field(default=0)
    cover_asset_id: Optional[str] = None


class SubGalleryCreateRequest(BaseModel):
    """Request to create a sub-gallery."""

    name: str = Field(..., min_length=1, max_length=200)
    sort_order: int = Field(default=0, ge=0)


class SubGalleryUpdateRequest(BaseModel):
    """Request to update a sub-gallery."""

    name: Optional[str] = Field(None, min_length=1, max_length=200)
    sort_order: Optional[int] = Field(None, ge=0)
    visible: Optional[bool] = None
    cover_asset_id: Optional[str] = None


class CompanyProfileResponse(BaseModel):
    """Company profile for gallery branding."""

    company_name: Optional[str] = None
    logo_url: Optional[str] = None
    website_url: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None


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
    layout_style: Optional[str] = None
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
    layout_style: Optional[str] = None
    theme: Optional[str] = None
    download_policy: Optional[str] = None
    exif_visible: Optional[bool] = None
    email_registration_required: Optional[bool] = None
    expires_at: Optional[str] = None
    branding_profile_id: Optional[str] = None
    cover_asset_id: Optional[str] = None
    primary_color: Optional[str] = None
    gradient_config: Optional[GradientConfiguration] = None
    font_family: Optional[str] = None
    custom_domain: Optional[str] = None
    custom_links: Optional[List[CustomLink]] = None


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
