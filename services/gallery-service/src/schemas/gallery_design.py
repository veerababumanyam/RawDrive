"""Gallery Design Studio configuration schemas.

Defines Pydantic models for validating design configuration including cover styles,
typography, themes, and grid layout settings.
"""

from enum import Enum
from typing import Literal, Optional
from pydantic import BaseModel, Field


# =============================================================================
# Enums for Cover Styles, Font Pairings, Themes
# =============================================================================


class CoverStyleEnum(str, Enum):
    """Enumeration of all available cover style templates."""

    # Basic Layouts (3)
    CENTER = "center"
    LEFT = "left"
    NONE = "none"

    # Text Placement Variations (8)
    VINTAGE = "vintage"
    NOVEL = "novel"
    FRAME = "frame"
    STRIPE = "stripe"
    DIVIDER = "divider"
    JOURNAL = "journal"
    STAMP = "stamp"
    OUTLINE = "outline"

    # Advanced Styles (5)
    CLASSIC = "classic"
    SPLIT = "split"
    LABEL = "label"
    BORDER = "border"
    ALBUM = "album"

    # Premium Styles (12)
    CLIFF = "cliff"
    CEDAR = "cedar"
    BREEZE = "breeze"
    AERO = "aero"
    SURF = "surf"
    COSMOS = "cosmos"
    REEF = "reef"
    BONDI = "bondi"
    WEST = "west"
    OAKWOOD = "oakwood"
    EDGE = "edge"
    ANCHOR = "anchor"
    JOY = "joy"


class FontPairingEnum(str, Enum):
    """Enumeration of available font pairings."""

    SANS = "sans"
    SERIF = "serif"
    MODERN = "modern"
    TIMELESS = "timeless"
    BOLD = "bold"
    SUBTLE = "subtle"


class ThemeIdEnum(str, Enum):
    """Enumeration of available gallery themes."""

    BRAND = "brand"
    GOLD = "gold"
    NEUTRAL = "neutral"
    CYAN = "cyan"
    MIDNIGHT = "midnight"
    ROSE = "rose"
    TERRACOTTA = "terracotta"
    OLIVE = "olive"
    SEA = "sea"


class ThemeModeEnum(str, Enum):
    """Theme appearance mode."""

    LIGHT = "light"
    DARK = "dark"
    SYSTEM = "system"


class GridStyleEnum(str, Enum):
    """Grid layout styles."""

    VERTICAL = "vertical"
    HORIZONTAL = "horizontal"


class GridSizeEnum(str, Enum):
    """Thumbnail size options."""

    SMALL = "sm"
    MEDIUM = "md"
    LARGE = "lg"


class GridSpacingEnum(str, Enum):
    """Grid spacing options."""

    SMALL = "sm"
    MEDIUM = "md"
    LARGE = "lg"


# =============================================================================
# Core Data Models
# =============================================================================


class FocalPoint(BaseModel):
    """Focal point coordinates for cover photo positioning."""

    x: float = Field(
        default=50,
        ge=0,
        le=100,
        description="X coordinate as percentage (0-100%)",
    )
    y: float = Field(
        default=50,
        ge=0,
        le=100,
        description="Y coordinate as percentage (0-100%)",
    )


class CoverConfig(BaseModel):
    """Cover photo configuration."""

    style: CoverStyleEnum = Field(
        default=CoverStyleEnum.CLASSIC,
        description="Selected cover style template",
    )
    focalPoint: FocalPoint = Field(
        default_factory=FocalPoint,
        description="Focal point for cover image positioning",
    )
    titleVisible: bool = Field(
        default=True,
        description="Whether cover title is visible",
    )
    overlayOpacity: float = Field(
        default=0.3,
        ge=0,
        le=1.0,
        description="Overlay opacity for text readability (0-1.0)",
    )


class TypographyConfig(BaseModel):
    """Typography configuration."""

    pairingId: FontPairingEnum = Field(
        default=FontPairingEnum.MODERN,
        description="Selected font pairing",
    )
    customHeadingsFont: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Optional custom heading font family override",
    )


class ThemeConfig(BaseModel):
    """Theme and color configuration."""

    id: ThemeIdEnum = Field(
        default=ThemeIdEnum.BRAND,
        description="Selected theme",
    )
    mode: ThemeModeEnum = Field(
        default=ThemeModeEnum.SYSTEM,
        description="Theme appearance mode (light/dark/auto-detect system)",
    )
    accentColorOverride: Optional[str] = Field(
        default=None,
        pattern=r"^#[0-9A-Fa-f]{6}$",
        description="Optional accent color override from theme's predefined palette (hex format)",
    )


class GridConfig(BaseModel):
    """Gallery grid layout configuration."""

    style: GridStyleEnum = Field(
        default=GridStyleEnum.VERTICAL,
        description="Grid layout style",
    )
    size: GridSizeEnum = Field(
        default=GridSizeEnum.MEDIUM,
        description="Thumbnail size",
    )
    spacing: GridSpacingEnum = Field(
        default=GridSizeEnum.MEDIUM,
        description="Grid spacing",
    )


class GalleryDesignConfig(BaseModel):
    """Complete Gallery Design Studio configuration.

    Encompasses all design decisions for a gallery's appearance and layout:
    cover styles, typography, themes, and grid settings.
    """

    cover: CoverConfig = Field(
        default_factory=CoverConfig,
        description="Cover photo configuration",
    )
    typography: TypographyConfig = Field(
        default_factory=TypographyConfig,
        description="Typography configuration",
    )
    theme: ThemeConfig = Field(
        default_factory=ThemeConfig,
        description="Theme and color configuration",
    )
    grid: GridConfig = Field(
        default_factory=GridConfig,
        description="Gallery grid layout configuration",
    )

    class Config:
        """Pydantic configuration."""

        use_enum_values = True  # Store enum values as strings in JSON
        json_schema_extra = {
            "example": {
                "cover": {
                    "style": "classic",
                    "focalPoint": {"x": 50, "y": 50},
                    "titleVisible": True,
                    "overlayOpacity": 0.3,
                },
                "typography": {"pairingId": "modern", "customHeadingsFont": None},
                "theme": {"id": "brand", "mode": "system", "accentColorOverride": None},
                "grid": {"style": "vertical", "size": "md", "spacing": "md"},
            }
        }


class GalleryDesignUpdateRequest(BaseModel):
    """Request body for updating gallery design configuration."""

    design_config: GalleryDesignConfig = Field(
        ...,
        description="Complete design configuration to apply",
    )


class GalleryDesignResponse(BaseModel):
    """Response containing gallery design configuration and metadata."""

    gallery_id: str = Field(
        ...,
        description="Gallery ID",
    )
    design_config: GalleryDesignConfig = Field(
        ...,
        description="Current design configuration",
    )
    last_published_at: Optional[str] = Field(
        default=None,
        description="ISO timestamp of last publish operation",
    )


# =============================================================================
# Default Configuration
# =============================================================================


DEFAULT_GALLERY_DESIGN_CONFIG = GalleryDesignConfig(
    cover=CoverConfig(
        style=CoverStyleEnum.CLASSIC,
        focalPoint=FocalPoint(x=50, y=50),
        titleVisible=True,
        overlayOpacity=0.3,
    ),
    typography=TypographyConfig(pairingId=FontPairingEnum.MODERN),
    theme=ThemeConfig(
        id=ThemeIdEnum.BRAND,
        mode=ThemeModeEnum.SYSTEM,
    ),
    grid=GridConfig(
        style=GridStyleEnum.VERTICAL,
        size=GridSizeEnum.MEDIUM,
        spacing=GridSizeEnum.MEDIUM,
    ),
)
"""Default design configuration for new galleries.

Provides brand-forward defaults that showcase RawDrive's design capabilities:
- Classic cover style with centered focal point
- Modern premium typography (Google Fonts)
- RawDrive brand theme (Deep Blue + Cyan)
- Familiar vertical grid layout with medium sizing
"""
