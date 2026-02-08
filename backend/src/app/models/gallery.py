"""Gallery Domain Model.

This module contains the Gallery-related domain models for the RawDrive platform.
The Gallery model represents a photo gallery with comprehensive settings including:
- Multi-tenant workspace isolation
- Client information and interaction settings
- Cover style and design configuration
- Branding and watermark configuration
- Download policies and permissions
- Proofing and collaboration features
- Face recognition and AI features
- Full-text search capability

Feature: Gallery Management & Design Studio
Related Tasks: T006 - Add show_people_filter, T019 - Gallery Design Studio
"""

from datetime import datetime
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.shared.types import (
    ColorStop,
    DownloadPolicy,
    GalleryStatus,
    GradientConfiguration,
    GradientType,
)


# =============================================================================
# ENUMS
# =============================================================================


class CoverStyle(str, Enum):
    """Gallery cover style options.

    Available cover styles for gallery presentation:
    - CLASSIC: Traditional centered cover with overlay
    - COSMOS: Dark, space-themed with bold typography
    - REEF: Vibrant ocean-inspired gradients
    - BONDI: Beach aesthetic with warm tones
    - WEST: Western sunset colors
    - CLIFF: Dramatic cliff-side aesthetic
    - CEDAR: Natural wood-inspired tones
    """

    CLASSIC = "classic"
    COSMOS = "cosmos"
    REEF = "reef"
    BONDI = "bondi"
    WEST = "west"
    CLIFF = "cliff"
    CEDAR = "cedar"


class LayoutStyle(str, Enum):
    """Gallery layout style.

    Determines how photos are arranged in the gallery view:
    - TABS: Organized into tabbed sections (default)
    - CONTINUOUS: Infinite scroll layout
    - GRID: Grid-based layout
    - MASONRY: Masonry grid with varying sizes
    """

    TABS = "tabs"
    CONTINUOUS = "continuous"
    GRID = "grid"
    MASONRY = "masonry"


class ThemeMode(str, Enum):
    """Gallery theme mode.

    Controls the visual theme:
    - LIGHT: Always light theme
    - DARK: Always dark theme
    - SYSTEM: Follow system preference (default)
    """

    LIGHT = "light"
    DARK = "dark"
    SYSTEM = "system"


# =============================================================================
# CONFIGURATION MODELS
# =============================================================================


class WatermarkConfig(BaseModel):
    """Watermark configuration for gallery images.

    Defines how watermarks are applied to downloadable images.
    """

    enabled: bool = Field(
        default=False,
        description="Whether watermarking is enabled"
    )
    position: str = Field(
        default="bottom-right",
        description="Watermark position (e.g., 'bottom-right', 'center')"
    )
    opacity: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Watermark opacity (0.0 to 1.0)"
    )
    scale: float = Field(
        default=0.2,
        ge=0.0,
        le=1.0,
        description="Watermark scale relative to image (0.0 to 1.0)"
    )
    custom_watermark_asset_id: Optional[UUID] = Field(
        None,
        description="Custom watermark image asset ID"
    )


class FindMeConfig(BaseModel):
    """Face recognition "Find Me" configuration.

    Settings for the face search feature allowing clients to find
    photos of specific people.
    """

    enabled: bool = Field(
        default=False,
        description="Enable face search feature"
    )
    confidence_threshold: float = Field(
        default=0.7,
        ge=0.0,
        le=1.0,
        description="Minimum confidence for face matches"
    )
    max_results: int = Field(
        default=100,
        ge=1,
        le=500,
        description="Maximum number of results to return"
    )
    allow_guest_search: bool = Field(
        default=True,
        description="Allow guest visitors to use face search"
    )


class SlideshowConfig(BaseModel):
    """Gallery slideshow configuration.

    Settings for the built-in slideshow feature.
    """

    enabled: bool = Field(
        default=False,
        description="Enable slideshow feature"
    )
    interval_seconds: int = Field(
        default=3,
        ge=1,
        le=30,
        description="Seconds between slides"
    )
    transition: str = Field(
        default="fade",
        description="Transition effect (fade, slide, etc.)"
    )
    show_captions: bool = Field(
        default=False,
        description="Show image captions in slideshow"
    )
    loop: bool = Field(
        default=True,
        description="Loop slideshow continuously"
    )
    autoplay: bool = Field(
        default=True,
        description="Autoplay slideshow on load"
    )


class ActivityTrackingConfig(BaseModel):
    """Activity tracking configuration.

    Controls what client activities are tracked.
    """

    track_views: bool = Field(
        default=True,
        description="Track photo views"
    )
    track_downloads: bool = Field(
        default=True,
        description="Track photo downloads"
    )
    track_shares: bool = Field(
        default=True,
        description="Track share link activity"
    )
    anonymous_mode: bool = Field(
        default=False,
        description="Anonymize tracking data"
    )


class ProofingSettings(BaseModel):
    """Album proofing settings.

    Configuration for client album proofing workflow.
    """

    enabled: bool = Field(
        default=False,
        description="Enable proofing workflow"
    )
    require_approval: bool = Field(
        default=True,
        description="Require client approval for album selections"
    )
    allow_revisions: bool = Field(
        default=True,
        description="Allow clients to request revisions"
    )
    max_revision_rounds: Optional[int] = Field(
        default=3,
        ge=1,
        le=10,
        description="Maximum revision rounds allowed"
    )


class CustomTheme(BaseModel):
    """Custom gallery theme configuration.

    Allows for custom theme overrides beyond the preset themes.
    """

    accent_color: Optional[str] = Field(
        None,
        max_length=7,
        description="Custom accent color hex code"
    )
    background_color: Optional[str] = Field(
        None,
        max_length=7,
        description="Custom background color"
    )
    font_family: Optional[str] = Field(
        None,
        max_length=100,
        description="Custom font family"
    )
    border_radius: Optional[int] = Field(
        None,
        ge=0,
        le=50,
        description="Custom border radius in pixels"
    )


class DesignConfig(BaseModel):
    """Gallery Design Studio configuration.

    Complete design configuration for Gallery Design Studio including
    cover styles, typography, themes, and grid layout.
    """

    cover: dict[str, Any] = Field(
        default_factory=lambda: {
            "style": "classic",
            "focalPoint": {"x": 50, "y": 50},
            "titleVisible": True,
            "overlayOpacity": 0.3
        },
        description="Cover configuration"
    )
    typography: dict[str, Any] = Field(
        default_factory=lambda: {
            "pairingId": "modern",
            "customHeadingsFont": None
        },
        description="Typography settings"
    )
    theme: dict[str, Any] = Field(
        default_factory=lambda: {
            "id": "brand",
            "mode": "system",
            "accentColorOverride": None
        },
        description="Theme configuration"
    )
    grid: dict[str, Any] = Field(
        default_factory=lambda: {
            "style": "vertical",
            "size": "md",
            "spacing": "md"
        },
        description="Grid layout settings"
    )


# =============================================================================
# GALLERY MODEL
# =============================================================================


class Gallery(BaseModel):
    """Gallery Domain Model.

    Represents a photo gallery in the RawDrive platform with comprehensive
    configuration for client presentation, branding, and interaction.

    Workspace Isolation:
        All gallery data is strictly isolated by workspace_id.
        Cross-workspace queries are not permitted.

    Database Table: galleries
    Primary Key: gallery_id (UUID)
    """

    model_config = ConfigDict(from_attributes=True)

    # =========================================================================
    # IDENTITY FIELDS
    # =========================================================================

    gallery_id: UUID = Field(..., description="Unique gallery identifier")
    workspace_id: UUID = Field(
        ...,
        description="Workspace ID for multi-tenant isolation"
    )
    title: str = Field(..., max_length=255, description="Gallery title")
    description: Optional[str] = Field(
        None,
        max_length=1000,
        description="Gallery description"
    )
    slug: Optional[str] = Field(
        None,
        max_length=255,
        description="URL-friendly slug for sharing"
    )
    status: GalleryStatus = Field(
        default=GalleryStatus.draft,
        description="Gallery publication status"
    )

    # =========================================================================
    # CLIENT FIELDS
    # =========================================================================

    client_name: Optional[str] = Field(
        None,
        max_length=255,
        description="Client name for the gallery"
    )
    client_email: Optional[str] = Field(
        None,
        max_length=255,
        description="Client email address"
    )
    client_phone: Optional[str] = Field(
        None,
        max_length=50,
        description="Client phone number"
    )
    client_id: Optional[UUID] = Field(
        None,
        description="Foreign key to clients table"
    )

    # =========================================================================
    # ASSET FIELDS
    # =========================================================================

    cover_asset_id: Optional[UUID] = Field(
        None,
        description="Asset ID for gallery cover image"
    )
    cover_style: Optional[CoverStyle] = Field(
        None,
        description="Gallery cover style preset"
    )
    cover_config: Optional[dict[str, Any]] = Field(
        default_factory=dict,
        description="Cover-specific configuration (focal point, overlay, etc.)"
    )

    # =========================================================================
    # DATE FIELDS
    # =========================================================================

    shoot_date: Optional[datetime] = Field(
        None,
        description="Date of the photo shoot"
    )
    shoot_location: Optional[str] = Field(
        None,
        max_length=500,
        description="Location of the photo shoot"
    )
    created_at: datetime = Field(
        ...,
        description="Gallery creation timestamp"
    )
    updated_at: datetime = Field(
        ...,
        description="Last update timestamp"
    )
    published_at: Optional[datetime] = Field(
        None,
        description="Gallery publication timestamp"
    )
    expires_at: Optional[datetime] = Field(
        None,
        description="Gallery expiration date"
    )
    last_accessed_at: Optional[datetime] = Field(
        None,
        description="Last access timestamp for sorting"
    )

    # =========================================================================
    # DISPLAY FIELDS
    # =========================================================================

    show_people_filter: bool = Field(
        default=False,
        description="Show people filter for face recognition"
    )
    show_exif: bool = Field(
        default=False,
        description="Show EXIF metadata to clients"
    )
    show_map: bool = Field(
        default=False,
        description="Show map view of photo locations"
    )

    # =========================================================================
    # BRANDING FIELDS
    # =========================================================================

    branding_enabled: bool = Field(
        default=False,
        description="Enable custom branding for this gallery"
    )
    branding_profile_id: Optional[UUID] = Field(
        None,
        description="Reference to branding profile"
    )
    watermark_config: Optional[WatermarkConfig] = Field(
        None,
        description="Watermark configuration"
    )
    custom_links: list[dict[str, str]] = Field(
        default_factory=list,
        description="Custom navigation links [{label, url}]"
    )

    # =========================================================================
    # DESIGN FIELDS
    # =========================================================================

    gradient_config: Optional[GradientConfiguration] = Field(
        None,
        description="Gradient configuration for gallery branding"
    )
    custom_theme: Optional[CustomTheme] = Field(
        None,
        description="Custom theme overrides"
    )
    design_config: Optional[DesignConfig] = Field(
        None,
        description="Complete Design Studio configuration"
    )

    # =========================================================================
    # DOWNLOAD FIELDS
    # =========================================================================

    download_policy: DownloadPolicy = Field(
        default=DownloadPolicy.view_only,
        description="Download permission policy"
    )
    original_quality_enabled: bool = Field(
        default=False,
        description="Allow original quality downloads"
    )
    daily_download_limit: Optional[int] = Field(
        None,
        ge=1,
        description="Daily download limit per client"
    )

    # =========================================================================
    # PROOFING FIELDS
    # =========================================================================

    proofing_enabled: bool = Field(
        default=False,
        description="Enable album proofing workflow"
    )
    proofing_settings: Optional[ProofingSettings] = Field(
        None,
        description="Proofing workflow configuration"
    )

    # =========================================================================
    # AI FIELDS
    # =========================================================================

    auto_categorize_enabled: bool = Field(
        default=False,
        description="Enable AI auto-categorization"
    )
    ai_processed_at: Optional[datetime] = Field(
        None,
        description="Last AI processing timestamp"
    )

    # =========================================================================
    # CLIENT INTERACTION FIELDS
    # =========================================================================

    comments_enabled: bool = Field(
        default=True,
        description="Allow client comments"
    )
    favorites_enabled: bool = Field(
        default=True,
        description="Allow client favorites"
    )
    selections_enabled: bool = Field(
        default=True,
        description="Allow client photo selections"
    )
    selection_limit: Optional[int] = Field(
        None,
        ge=1,
        description="Maximum number of photos clients can select"
    )
    ratings_enabled: bool = Field(
        default=False,
        description="Allow client photo ratings"
    )

    # =========================================================================
    # NOTIFICATION FIELDS
    # =========================================================================

    notify_on_comment: bool = Field(
        default=True,
        description="Notify on client comments"
    )
    notify_on_favorite: bool = Field(
        default=False,
        description="Notify on client favorites"
    )
    notify_on_selection: bool = Field(
        default=True,
        description="Notify on selection updates"
    )
    notify_on_download: bool = Field(
        default=False,
        description="Notify on downloads"
    )

    # =========================================================================
    # ACCESS FIELDS
    # =========================================================================

    password_hash: Optional[str] = Field(
        None,
        max_length=255,
        description="Hashed password for gallery access"
    )
    pin_hash: Optional[str] = Field(
        None,
        max_length=255,
        description="Hashed PIN for gallery access"
    )
    email_registration_required: bool = Field(
        default=False,
        description="Require email registration to view"
    )

    # =========================================================================
    # SHARING FIELDS
    # =========================================================================

    sharing_enabled: bool = Field(
        default=True,
        description="Enable gallery sharing"
    )
    custom_domain: Optional[str] = Field(
        None,
        max_length=255,
        description="Custom domain for gallery"
    )

    # =========================================================================
    # SLIDESHOW FIELDS
    # =========================================================================

    slideshow_config: Optional[SlideshowConfig] = Field(
        None,
        description="Slideshow configuration"
    )
    slideshow_audio_url: Optional[str] = Field(
        None,
        max_length=512,
        description="Background music URL for slideshow"
    )

    # =========================================================================
    # FACE RECOGNITION FIELDS
    # =========================================================================

    findme_config: Optional[FindMeConfig] = Field(
        None,
        description="Face search configuration"
    )

    # =========================================================================
    # ACTIVITY TRACKING FIELDS
    # =========================================================================

    activity_tracking: Optional[ActivityTrackingConfig] = Field(
        None,
        description="Activity tracking configuration"
    )

    # =========================================================================
    # LAYOUT FIELDS
    # =========================================================================

    layout_style: LayoutStyle = Field(
        default=LayoutStyle.TABS,
        description="Gallery layout style"
    )
    theme: ThemeMode = Field(
        default=ThemeMode.SYSTEM,
        description="Gallery theme mode"
    )
    portal_language: Optional[str] = Field(
        None,
        max_length=10,
        description="Portal language code"
    )

    # =========================================================================
    # METADATA FIELDS
    # =========================================================================

    is_pinned: bool = Field(
        default=False,
        description="Gallery is pinned in dashboard"
    )
    is_featured: bool = Field(
        default=False,
        description="Gallery is featured"
    )
    deleted: bool = Field(
        default=False,
        description="Soft delete flag"
    )
    deleted_at: Optional[datetime] = Field(
        None,
        description="Soft delete timestamp"
    )

    # =========================================================================
    # AUDIT FIELDS
    # =========================================================================

    created_by_user_id: UUID = Field(
        ...,
        description="User who created the gallery"
    )

    # =========================================================================
    # SEARCH VECTOR (Full-text search)
    # =========================================================================

    search_vector: Optional[str] = Field(
        None,
        description="PostgreSQL tsvector for full-text search"
    )

    # =========================================================================
    # VALIDATORS
    # =========================================================================

    @field_validator("custom_links", mode="before")
    @classmethod
    def ensure_custom_links_list(cls, v: Any) -> list[dict[str, str]]:
        """Ensure custom_links is always a list."""
        if v is None:
            return []
        if isinstance(v, str):
            return []
        return list(v)

    @field_validator("cover_config", mode="before")
    @classmethod
    def ensure_cover_config_dict(cls, v: Any) -> dict[str, Any]:
        """Ensure cover_config is always a dict."""
        if v is None:
            return {}
        return dict(v)

    # =========================================================================
    # COMPUTED PROPERTIES
    # =========================================================================

    @property
    def is_published(self) -> bool:
        """Check if gallery is published."""
        return self.status == GalleryStatus.published

    @property
    def is_archived(self) -> bool:
        """Check if gallery is archived."""
        return self.status == GalleryStatus.archived

    @property
    def is_draft(self) -> bool:
        """Check if gallery is in draft status."""
        return self.status == GalleryStatus.draft

    @property
    def is_expired(self) -> bool:
        """Check if gallery has expired."""
        if self.expires_at is None:
            return False
        return datetime.now() > self.expires_at

    @property
    def is_accessible(self) -> bool:
        """Check if gallery is currently accessible."""
        return (
            not self.deleted
            and self.is_published
            and not self.is_expired
        )

    @property
    def has_password_protection(self) -> bool:
        """Check if gallery has password protection."""
        return self.password_hash is not None

    @property
    def has_pin_protection(self) -> bool:
        """Check if gallery has PIN protection."""
        return self.pin_hash is not None

    @property
    def requires_authentication(self) -> bool:
        """Check if gallery requires authentication to view."""
        return (
            self.has_password_protection
            or self.has_pin_protection
            or self.email_registration_required
        )

    @property
    def allows_original_downloads(self) -> bool:
        """Check if original quality downloads are allowed."""
        return (
            self.download_policy == DownloadPolicy.original_allowed
            and self.original_quality_enabled
        )

    @property
    def allows_any_downloads(self) -> bool:
        """Check if any downloads are allowed."""
        return self.download_policy != DownloadPolicy.view_only

    @property
    def has_watermark(self) -> bool:
        """Check if gallery has watermark enabled."""
        return (
            self.watermark_config is not None
            and self.watermark_config.enabled
        )

    @property
    def has_face_recognition(self) -> bool:
        """Check if gallery has face recognition enabled."""
        return (
            self.findme_config is not None
            and self.findme_config.enabled
        )

    @property
    def has_proofing(self) -> bool:
        """Check if gallery has proofing enabled."""
        return (
            self.proofing_enabled
            and self.proofing_settings is not None
        )

    @property
    def has_slideshow(self) -> bool:
        """Check if gallery has slideshow enabled."""
        return (
            self.slideshow_config is not None
            and self.slideshow_config.enabled
        )

    @property
    def has_custom_branding(self) -> bool:
        """Check if gallery has custom branding."""
        return (
            self.branding_enabled
            or self.gradient_config is not None
            or self.custom_theme is not None
        )


# =============================================================================
# CREATE MODEL
# =============================================================================


class GalleryCreate(BaseModel):
    """Schema for creating a new gallery.

    All fields are optional except for required fields.
    Uses default values where appropriate.
    """

    # Required fields
    title: str = Field(..., min_length=1, max_length=255)
    workspace_id: UUID = Field(...)
    created_by_user_id: UUID = Field(...)

    # Optional basic fields
    description: Optional[str] = Field(None, max_length=1000)
    slug: Optional[str] = Field(None, max_length=255)
    status: GalleryStatus = Field(default=GalleryStatus.draft)

    # Client fields
    client_name: Optional[str] = Field(None, max_length=255)
    client_email: Optional[str] = Field(None, max_length=255)
    client_phone: Optional[str] = Field(None, max_length=50)
    client_id: Optional[UUID] = Field(None)

    # Asset fields
    cover_asset_id: Optional[UUID] = Field(None)
    cover_style: Optional[CoverStyle] = Field(None)
    cover_config: Optional[dict[str, Any]] = Field(None)

    # Date fields
    shoot_date: Optional[datetime] = Field(None)
    shoot_location: Optional[str] = Field(None, max_length=500)
    expires_at: Optional[datetime] = Field(None)

    # Display fields
    show_people_filter: bool = False
    show_exif: bool = False
    show_map: bool = False

    # Branding fields
    branding_enabled: bool = False
    branding_profile_id: Optional[UUID] = Field(None)
    watermark_config: Optional[WatermarkConfig] = Field(None)
    custom_links: list[dict[str, str]] = Field(default_factory=list)

    # Design fields
    gradient_config: Optional[GradientConfiguration] = Field(None)
    custom_theme: Optional[CustomTheme] = Field(None)
    design_config: Optional[DesignConfig] = Field(None)

    # Download fields
    download_policy: DownloadPolicy = Field(default=DownloadPolicy.view_only)
    original_quality_enabled: bool = False
    daily_download_limit: Optional[int] = Field(None, ge=1)

    # Proofing fields
    proofing_enabled: bool = False
    proofing_settings: Optional[ProofingSettings] = Field(None)

    # AI fields
    auto_categorize_enabled: bool = False

    # Client interaction fields
    comments_enabled: bool = True
    favorites_enabled: bool = True
    selections_enabled: bool = True
    selection_limit: Optional[int] = Field(None, ge=1)
    ratings_enabled: bool = False

    # Notification fields
    notify_on_comment: bool = True
    notify_on_favorite: bool = False
    notify_on_selection: bool = True
    notify_on_download: bool = False

    # Access fields
    password_hash: Optional[str] = Field(None, max_length=255)
    pin_hash: Optional[str] = Field(None, max_length=255)
    email_registration_required: bool = False

    # Sharing fields
    sharing_enabled: bool = True
    custom_domain: Optional[str] = Field(None, max_length=255)

    # Slideshow fields
    slideshow_config: Optional[SlideshowConfig] = Field(None)
    slideshow_audio_url: Optional[str] = Field(None, max_length=512)

    # Face recognition fields
    findme_config: Optional[FindMeConfig] = Field(None)

    # Activity tracking fields
    activity_tracking: Optional[ActivityTrackingConfig] = Field(None)

    # Layout fields
    layout_style: LayoutStyle = Field(default=LayoutStyle.TABS)
    theme: ThemeMode = Field(default=ThemeMode.SYSTEM)
    portal_language: Optional[str] = Field(None, max_length=10)

    # Metadata fields
    is_pinned: bool = False
    is_featured: bool = False


# =============================================================================
# UPDATE MODEL
# =============================================================================


class GalleryUpdate(BaseModel):
    """Schema for updating an existing gallery.

    All fields are optional. Only provided fields will be updated.
    """

    # Basic fields
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    slug: Optional[str] = Field(None, max_length=255)
    status: Optional[GalleryStatus] = Field(None)

    # Client fields
    client_name: Optional[str] = Field(None, max_length=255)
    client_email: Optional[str] = Field(None, max_length=255)
    client_phone: Optional[str] = Field(None, max_length=50)
    client_id: Optional[UUID] = Field(None)

    # Asset fields
    cover_asset_id: Optional[UUID] = Field(None)
    cover_style: Optional[CoverStyle] = Field(None)
    cover_config: Optional[dict[str, Any]] = Field(None)

    # Date fields
    shoot_date: Optional[datetime] = Field(None)
    shoot_location: Optional[str] = Field(None, max_length=500)
    expires_at: Optional[datetime] = Field(None)

    # Display fields
    show_people_filter: Optional[bool] = Field(None)
    show_exif: Optional[bool] = Field(None)
    show_map: Optional[bool] = Field(None)

    # Branding fields
    branding_enabled: Optional[bool] = Field(None)
    branding_profile_id: Optional[UUID] = Field(None)
    watermark_config: Optional[WatermarkConfig] = Field(None)
    custom_links: Optional[list[dict[str, str]]] = Field(None)

    # Design fields
    gradient_config: Optional[GradientConfiguration] = Field(None)
    custom_theme: Optional[CustomTheme] = Field(None)
    design_config: Optional[DesignConfig] = Field(None)

    # Download fields
    download_policy: Optional[DownloadPolicy] = Field(None)
    original_quality_enabled: Optional[bool] = Field(None)
    daily_download_limit: Optional[int] = Field(None, ge=1)

    # Proofing fields
    proofing_enabled: Optional[bool] = Field(None)
    proofing_settings: Optional[ProofingSettings] = Field(None)

    # AI fields
    auto_categorize_enabled: Optional[bool] = Field(None)
    ai_processed_at: Optional[datetime] = Field(None)

    # Client interaction fields
    comments_enabled: Optional[bool] = Field(None)
    favorites_enabled: Optional[bool] = Field(None)
    selections_enabled: Optional[bool] = Field(None)
    selection_limit: Optional[int] = Field(None, ge=1)
    ratings_enabled: Optional[bool] = Field(None)

    # Notification fields
    notify_on_comment: Optional[bool] = Field(None)
    notify_on_favorite: Optional[bool] = Field(None)
    notify_on_selection: Optional[bool] = Field(None)
    notify_on_download: Optional[bool] = Field(None)

    # Access fields
    password_hash: Optional[str] = Field(None, max_length=255)
    pin_hash: Optional[str] = Field(None, max_length=255)
    email_registration_required: Optional[bool] = Field(None)

    # Sharing fields
    sharing_enabled: Optional[bool] = Field(None)
    custom_domain: Optional[str] = Field(None, max_length=255)

    # Slideshow fields
    slideshow_config: Optional[SlideshowConfig] = Field(None)
    slideshow_audio_url: Optional[str] = Field(None, max_length=512)

    # Face recognition fields
    findme_config: Optional[FindMeConfig] = Field(None)

    # Activity tracking fields
    activity_tracking: Optional[ActivityTrackingConfig] = Field(None)

    # Layout fields
    layout_style: Optional[LayoutStyle] = Field(None)
    theme: Optional[ThemeMode] = Field(None)
    portal_language: Optional[str] = Field(None, max_length=10)

    # Metadata fields
    is_pinned: Optional[bool] = Field(None)
    is_featured: Optional[bool] = Field(None)
    last_accessed_at: Optional[datetime] = Field(None)

    # Soft delete
    deleted: Optional[bool] = Field(None)
    deleted_at: Optional[datetime] = Field(None)


# =============================================================================
# SUMMARY MODEL
# =============================================================================


class GallerySummary(BaseModel):
    """Lightweight gallery summary for list responses.

    Excludes large configuration fields for efficient API responses.
    """

    model_config = ConfigDict(from_attributes=True)

    gallery_id: UUID
    workspace_id: UUID
    title: str
    status: GalleryStatus
    client_name: Optional[str] = None

    # Cover info
    cover_asset_id: Optional[UUID] = None
    cover_style: Optional[CoverStyle] = None

    # Timestamps
    created_at: datetime
    updated_at: datetime
    published_at: Optional[datetime] = None
    last_accessed_at: Optional[datetime] = None

    # Key flags
    is_pinned: bool = False
    is_featured: bool = False
    deleted: bool = False

    # Access info
    has_password_protection: bool = False
    requires_authentication: bool = False


# =============================================================================
# PUBLIC MODEL (For client-facing APIs)
# =============================================================================


class GalleryPublic(BaseModel):
    """Public gallery model for client-facing APIs.

    Excludes sensitive information like password hashes, PINs,
    and configuration details that should not be exposed to clients.
    """

    model_config = ConfigDict(from_attributes=True)

    gallery_id: UUID
    title: str
    description: Optional[str] = None

    # Cover info
    cover_asset_id: Optional[UUID] = None
    cover_style: Optional[CoverStyle] = None
    cover_config: Optional[dict[str, Any]] = None

    # Display settings
    layout_style: LayoutStyle = LayoutStyle.TABS
    theme: ThemeMode = ThemeMode.SYSTEM
    gradient_config: Optional[GradientConfiguration] = None
    custom_theme: Optional[CustomTheme] = None
    design_config: Optional[DesignConfig] = None

    # Features
    show_people_filter: bool = False
    show_exif: bool = False
    show_map: bool = False

    # Client interaction
    comments_enabled: bool = True
    favorites_enabled: bool = True
    selections_enabled: bool = True
    selection_limit: Optional[int] = None
    ratings_enabled: bool = False

    # Slideshow
    slideshow_config: Optional[SlideshowConfig] = None
    slideshow_audio_url: Optional[str] = None

    # Face recognition
    findme_config: Optional[FindMeConfig] = None

    # Branding (public-safe)
    custom_links: list[dict[str, str]] = Field(default_factory=list)

    # Timestamps
    created_at: datetime
    updated_at: datetime
    published_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
