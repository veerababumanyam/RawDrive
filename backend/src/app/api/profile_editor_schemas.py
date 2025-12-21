"""Pydantic schemas for Profile Editor API.

Validation schemas for:
- Themes and theme customizations
- Visibility configurations
- Custom fonts and brand assets
- Version control
- Preview sharing
- Analytics
"""

from __future__ import annotations

import re
from datetime import datetime
from enum import Enum
from typing import Annotated, Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator


# =============================================================================
# Enums
# =============================================================================

class ThemeCategory(str, Enum):
    """Theme category options."""
    MINIMAL = "minimal"
    BOLD = "bold"
    ELEGANT = "elegant"
    MODERN = "modern"
    CREATIVE = "creative"


class FontSource(str, Enum):
    """Font source type."""
    WEB = "web"
    CUSTOM = "custom"


class FontFormat(str, Enum):
    """Allowed font file formats."""
    WOFF2 = "woff2"
    TTF = "ttf"
    WOFF = "woff"


class FontStyle(str, Enum):
    """Font style options."""
    NORMAL = "normal"
    ITALIC = "italic"


class Spacing(str, Enum):
    """Layout spacing options."""
    COMPACT = "compact"
    NORMAL = "normal"
    SPACIOUS = "spacious"


class HeroStyle(str, Enum):
    """Hero section style options."""
    CARD = "card"
    FULL_BLEED = "full-bleed"


class SectionLayout(str, Enum):
    """Section layout options."""
    SINGLE_COLUMN = "single-column"
    TWO_COLUMN = "two-column"


class AssetType(str, Enum):
    """Brand asset type."""
    LOGO = "logo"
    FAVICON = "favicon"
    COVER = "cover"


class AssetVariant(str, Enum):
    """Asset variant for different contexts."""
    FULL = "full"
    ICON = "icon"
    LIGHT = "light"
    DARK = "dark"


class ProfileType(str, Enum):
    """Profile type identifier."""
    COMPANY = "company"
    PHOTOGRAPHER = "photographer"


class AnalyticsEventType(str, Enum):
    """Analytics event types."""
    VIEW = "view"
    LINK_CLICK = "link_click"
    VCARD_DOWNLOAD = "vcard_download"
    QR_SCAN = "qr_scan"


class PreviewExpiration(str, Enum):
    """Preview link expiration options."""
    DAY_24H = "24h"
    DAY_7D = "7d"
    DAY_30D = "30d"


# =============================================================================
# Validators
# =============================================================================

HEX_COLOR_PATTERN = re.compile(r"^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$")
SLUG_PATTERN = re.compile(r"^[a-z0-9-]+$")


def validate_hex_color(value: str) -> str:
    """Validate hex color format."""
    if not HEX_COLOR_PATTERN.match(value):
        raise ValueError("Invalid hex color format (use #RGB or #RRGGBB)")
    return value.upper()


def validate_slug(value: str) -> str:
    """Validate URL-safe slug."""
    if not SLUG_PATTERN.match(value):
        raise ValueError("Slug must contain only lowercase letters, numbers, and hyphens")
    return value


def sanitize_string(value: str) -> str:
    """Sanitize string to prevent XSS attacks."""
    # Remove HTML tags
    sanitized = re.sub(r"<[^>]*>", "", value)
    # Remove javascript: protocol
    sanitized = re.sub(r"javascript:", "", sanitized, flags=re.IGNORECASE)
    # Remove event handlers
    sanitized = re.sub(r"on\w+=", "", sanitized, flags=re.IGNORECASE)
    return sanitized.strip()


def validate_safe_url(url: str) -> str:
    """Validate URL is safe (no javascript:, data:, vbscript:)."""
    lower_url = url.lower()
    dangerous_protocols = ["javascript:", "data:", "vbscript:"]
    for proto in dangerous_protocols:
        if lower_url.startswith(proto):
            raise ValueError(f"URL contains dangerous protocol: {proto}")
    return url


# =============================================================================
# Color and Typography Schemas
# =============================================================================

class GradientConfig(BaseModel):
    """Gradient configuration."""
    name: str = Field(..., max_length=50)
    type: str = Field(..., pattern=r"^(linear|radial)$")
    direction: Optional[str] = None
    stops: list[str] = Field(..., min_length=2, max_length=5)

    @field_validator("stops", mode="before")
    @classmethod
    def validate_stops(cls, v: list[str]) -> list[str]:
        return [validate_hex_color(s) for s in v]


class ColorPalette(BaseModel):
    """Color palette for brand customization."""
    primary: str = Field(...)
    secondary: str = Field(...)
    accent: str = Field(...)
    neutral: list[str] = Field(..., min_length=1, max_length=10)
    gradients: Optional[list[GradientConfig]] = None

    @field_validator("primary", "secondary", "accent", mode="before")
    @classmethod
    def validate_colors(cls, v: str) -> str:
        return validate_hex_color(v)

    @field_validator("neutral", mode="before")
    @classmethod
    def validate_neutral(cls, v: list[str]) -> list[str]:
        return [validate_hex_color(c) for c in v]


class FontConfig(BaseModel):
    """Font configuration."""
    family: str = Field(..., min_length=1, max_length=100)
    source: FontSource = FontSource.WEB
    custom_font_id: Optional[UUID] = None
    fallback: list[str] = Field(..., min_length=1)
    weights: list[int] = Field(..., min_length=1)

    @field_validator("weights", mode="before")
    @classmethod
    def validate_weights(cls, v: list[int]) -> list[int]:
        for w in v:
            if not (100 <= w <= 900 and w % 100 == 0):
                raise ValueError("Font weight must be 100-900 in increments of 100")
        return v


class TypographyConfig(BaseModel):
    """Typography configuration with role assignments."""
    heading_font: FontConfig
    body_font: FontConfig
    accent_font: Optional[FontConfig] = None


class LayoutPreferences(BaseModel):
    """Layout preferences for profile display."""
    spacing: Spacing = Spacing.NORMAL
    hero_style: HeroStyle = HeroStyle.CARD
    section_layout: SectionLayout = SectionLayout.SINGLE_COLUMN


# =============================================================================
# Theme Schemas
# =============================================================================

class ThemeVariant(BaseModel):
    """Theme variant (light/dark)."""
    variant_id: str
    name: str
    colors: dict[str, str]


class ThemeResponse(BaseModel):
    """Theme response schema."""
    model_config = ConfigDict(from_attributes=True)

    theme_id: UUID
    name: str
    category: ThemeCategory
    description: Optional[str] = None
    preview_image_url: Optional[str] = None

    base_colors: dict = Field(default_factory=dict)
    default_typography: dict = Field(default_factory=dict)
    layout_config: dict = Field(default_factory=dict)

    is_premium: bool = False
    is_popular: bool = False
    usage_count: int = 0

    supports_dark_mode: bool = False
    variants: Optional[list[ThemeVariant]] = None

    created_at: datetime
    updated_at: datetime


class ThemeFilters(BaseModel):
    """Theme filter parameters."""
    category: Optional[ThemeCategory] = None
    is_premium: Optional[bool] = None
    is_popular: Optional[bool] = None
    supports_dark_mode: Optional[bool] = None
    search: Optional[str] = Field(None, max_length=100)


# =============================================================================
# Theme Customization Schemas
# =============================================================================

class ThemeCustomizationResponse(BaseModel):
    """Theme customization response."""
    model_config = ConfigDict(from_attributes=True)

    customization_id: UUID
    workspace_id: UUID
    theme_id: UUID
    name: Optional[str] = None

    custom_colors: Optional[dict] = None
    custom_typography: Optional[dict] = None
    custom_layout: Optional[dict] = None

    is_preset: bool = False

    created_at: datetime
    updated_at: datetime


class UpdateColorsRequest(BaseModel):
    """Update theme colors request."""
    primary: Optional[str] = None
    secondary: Optional[str] = None
    accent: Optional[str] = None
    neutral: Optional[list[str]] = None
    gradients: Optional[list[GradientConfig]] = None

    @field_validator("primary", "secondary", "accent", mode="before")
    @classmethod
    def validate_colors(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            return validate_hex_color(v)
        return v

    @field_validator("neutral", mode="before")
    @classmethod
    def validate_neutral(cls, v: Optional[list[str]]) -> Optional[list[str]]:
        if v is not None:
            return [validate_hex_color(c) for c in v]
        return v


class UpdateTypographyRequest(BaseModel):
    """Update typography request."""
    heading_font: Optional[FontConfig] = None
    body_font: Optional[FontConfig] = None
    accent_font: Optional[FontConfig] = None


class UpdateLayoutRequest(BaseModel):
    """Update layout request."""
    spacing: Optional[Spacing] = None
    hero_style: Optional[HeroStyle] = None
    section_layout: Optional[SectionLayout] = None


class SavePresetRequest(BaseModel):
    """Save customization as preset."""
    name: str = Field(..., min_length=1, max_length=100)


# =============================================================================
# Visibility Schemas
# =============================================================================

class ProfileVisibilityConfigResponse(BaseModel):
    """Visibility configuration response."""
    model_config = ConfigDict(from_attributes=True)

    visibility_config_id: UUID
    workspace_id: UUID
    profile_type: ProfileType
    profile_id: UUID

    field_visibility: dict[str, bool] = Field(default_factory=dict)
    social_visibility: dict[str, bool] = Field(default_factory=dict)

    preset_name: Optional[str] = None
    is_default: bool = False

    created_at: datetime
    updated_at: datetime


class UpdateVisibilityRequest(BaseModel):
    """Update visibility configuration."""
    field_visibility: Optional[dict[str, bool]] = None
    social_visibility: Optional[dict[str, bool]] = None


class SaveVisibilityPresetRequest(BaseModel):
    """Save visibility preset."""
    name: str = Field(..., min_length=1, max_length=100)


# =============================================================================
# Custom Font Schemas
# =============================================================================

class FontFileInfo(BaseModel):
    """Font file metadata."""
    file_id: UUID
    object_key: str
    weight: int = Field(..., ge=100, le=900)
    style: FontStyle = FontStyle.NORMAL
    format: FontFormat


class CustomFontResponse(BaseModel):
    """Custom font response."""
    model_config = ConfigDict(from_attributes=True)

    custom_font_id: UUID
    workspace_id: UUID
    font_family: str

    font_files: list[FontFileInfo] = Field(default_factory=list)

    file_size_bytes: int = 0
    format: FontFormat

    is_validated: bool = False
    validation_date: Optional[datetime] = None

    created_at: datetime
    updated_at: datetime


class UploadFontRequest(BaseModel):
    """Font upload metadata."""
    font_family: str = Field(..., min_length=1, max_length=100)
    weight: int = Field(400, ge=100, le=900)
    style: FontStyle = FontStyle.NORMAL


# =============================================================================
# Brand Asset Schemas
# =============================================================================

class OptimizedFormats(BaseModel):
    """Optimized format URLs."""
    webp: Optional[str] = None
    avif: Optional[str] = None
    png: Optional[str] = None


class BrandAssetResponse(BaseModel):
    """Brand asset response."""
    model_config = ConfigDict(from_attributes=True)

    asset_id: UUID
    workspace_id: UUID
    asset_type: AssetType
    variant: AssetVariant

    object_key: str
    optimized_formats: OptimizedFormats = Field(default_factory=OptimizedFormats)

    width: int = 0
    height: int = 0
    file_size_bytes: int = 0

    recommended_for: list[str] = Field(default_factory=list)

    version: int = 1
    is_current: bool = True

    created_at: datetime
    updated_at: datetime


class UploadAssetRequest(BaseModel):
    """Asset upload metadata."""
    asset_type: AssetType
    variant: AssetVariant


class AssetContext(BaseModel):
    """Context for automatic asset selection."""
    background_color: Optional[str] = None
    theme_variant: Optional[str] = Field(None, pattern=r"^(light|dark)$")
    size_requirement: Optional[str] = Field(None, pattern=r"^(full|icon)$")

    @field_validator("background_color", mode="before")
    @classmethod
    def validate_bg_color(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            return validate_hex_color(v)
        return v


# =============================================================================
# Version Control Schemas
# =============================================================================

class ProfileVersionResponse(BaseModel):
    """Profile version response."""
    model_config = ConfigDict(from_attributes=True)

    version_id: UUID
    workspace_id: UUID
    profile_type: ProfileType
    profile_id: UUID

    profile_snapshot: dict = Field(default_factory=dict)
    visibility_snapshot: dict = Field(default_factory=dict)
    theme_snapshot: dict = Field(default_factory=dict)

    version_number: int = 1
    label: Optional[str] = None
    is_auto_snapshot: bool = False

    created_at: datetime
    created_by: Optional[UUID] = None


class CreateSnapshotRequest(BaseModel):
    """Create manual snapshot."""
    label: Optional[str] = Field(None, max_length=200)


class VersionDiff(BaseModel):
    """Difference between versions."""
    field: str
    old_value: Any
    new_value: Any
    change_type: str = Field(..., pattern=r"^(added|removed|modified)$")


class VersionComparisonResponse(BaseModel):
    """Version comparison response."""
    version_a: ProfileVersionResponse
    version_b: ProfileVersionResponse
    diffs: list[VersionDiff]


class ProfileExport(BaseModel):
    """Profile export format."""
    version: str = "1.0"
    exported_at: datetime
    profile_data: dict
    visibility_config: dict
    theme_customization: Optional[dict] = None


# =============================================================================
# Preview Sharing Schemas
# =============================================================================

class PreviewLinkResponse(BaseModel):
    """Preview link response."""
    model_config = ConfigDict(from_attributes=True)

    link_id: UUID
    workspace_id: UUID
    profile_id: UUID

    token: str
    url: str

    expires_at: datetime
    has_password: bool = False

    view_count: int = 0
    last_viewed_at: Optional[datetime] = None

    is_revoked: bool = False
    revoked_at: Optional[datetime] = None

    created_at: datetime
    created_by: Optional[UUID] = None


class CreatePreviewLinkRequest(BaseModel):
    """Create preview link request."""
    expiration: PreviewExpiration = PreviewExpiration.DAY_7D
    password: Optional[str] = Field(None, min_length=8, max_length=100)


class AccessPreviewRequest(BaseModel):
    """Access password-protected preview."""
    password: str = Field(..., min_length=1, max_length=100)


class PreviewCommentResponse(BaseModel):
    """Preview comment response."""
    model_config = ConfigDict(from_attributes=True)

    comment_id: UUID
    link_id: UUID
    workspace_id: UUID

    content: str
    element_selector: Optional[str] = None

    commenter_name: Optional[str] = None
    commenter_email: Optional[str] = None

    is_resolved: bool = False
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[UUID] = None

    created_at: datetime


class CreateCommentRequest(BaseModel):
    """Create preview comment."""
    content: str = Field(..., min_length=1, max_length=2000)
    element_selector: Optional[str] = Field(None, max_length=255)
    commenter_name: Optional[str] = Field(None, max_length=100)
    commenter_email: Optional[EmailStr] = None

    @field_validator("content", mode="before")
    @classmethod
    def sanitize_content(cls, v: str) -> str:
        return sanitize_string(v)


class ResolveCommentRequest(BaseModel):
    """Resolve a comment."""
    resolved: bool = True


# =============================================================================
# Analytics Schemas
# =============================================================================

class AnalyticsQueryParams(BaseModel):
    """Analytics query parameters."""
    period: str = Field("week", pattern=r"^(day|week|month|year)$")
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None


class ViewsByPeriod(BaseModel):
    """Views aggregated by period."""
    date: str
    count: int


class ViewsByCountry(BaseModel):
    """Views by country."""
    country: str
    count: int


class TopReferrer(BaseModel):
    """Top referrer source."""
    source: str
    count: int


class PopularLink(BaseModel):
    """Popular clicked link."""
    label: str
    url: str
    clicks: int


class ProfileAnalyticsResponse(BaseModel):
    """Profile analytics response."""
    total_views: int = 0
    unique_visitors: int = 0
    link_clicks: int = 0
    vcard_downloads: int = 0
    qr_scans: int = 0

    views_by_day: list[ViewsByPeriod] = Field(default_factory=list)
    views_by_country: list[ViewsByCountry] = Field(default_factory=list)
    top_referrers: list[TopReferrer] = Field(default_factory=list)
    popular_links: list[PopularLink] = Field(default_factory=list)

    average_session_duration: float = 0.0

    period_start: datetime
    period_end: datetime


class TrackEventRequest(BaseModel):
    """Track analytics event."""
    event_type: AnalyticsEventType
    link_url: Optional[str] = None
    link_label: Optional[str] = Field(None, max_length=100)
    referrer_url: Optional[str] = None


# =============================================================================
# Color Tools Schemas
# =============================================================================

class ExtractColorsRequest(BaseModel):
    """Extract colors from logo."""
    logo_url: str

    @field_validator("logo_url", mode="before")
    @classmethod
    def validate_url(cls, v: str) -> str:
        return validate_safe_url(v)


class ColorHarmonyRequest(BaseModel):
    """Generate color harmony."""
    base_color: str
    scheme: str = Field(..., pattern=r"^(complementary|analogous|triadic)$")

    @field_validator("base_color", mode="before")
    @classmethod
    def validate_color(cls, v: str) -> str:
        return validate_hex_color(v)


class ContrastCheckRequest(BaseModel):
    """Check contrast between colors."""
    foreground: str
    background: str

    @field_validator("foreground", "background", mode="before")
    @classmethod
    def validate_colors(cls, v: str) -> str:
        return validate_hex_color(v)


class ContrastResult(BaseModel):
    """Contrast check result."""
    ratio: float
    passes_aa: bool
    passes_aaa: bool
    passes_aa_large: bool
    suggestion: Optional[str] = None


# =============================================================================
# Profile Publishing Schemas
# =============================================================================

class PublishProfileRequest(BaseModel):
    """Publish profile request."""
    create_snapshot: bool = True
    snapshot_label: Optional[str] = Field(None, max_length=200)


class PublishResult(BaseModel):
    """Publish operation result."""
    success: bool
    published_at: datetime
    public_url: str
    version_id: Optional[UUID] = None
