"""
Album Spread Pydantic Schemas
Feature: 026-album-proofing

Schemas for album spreads and elements.
"""
from datetime import datetime
from enum import Enum
from typing import Optional, List, Dict, Any
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class ElementType(str, Enum):
    """Album element types."""
    PHOTO = "photo"
    TEXT = "text"
    SHAPE = "shape"


class BorderStyle(str, Enum):
    """Border style options."""
    SOLID = "solid"
    DASHED = "dashed"
    DOTTED = "dotted"
    NONE = "none"


class TextAlign(str, Enum):
    """Text alignment options."""
    LEFT = "left"
    CENTER = "center"
    RIGHT = "right"
    JUSTIFY = "justify"


class ElementBorder(BaseModel):
    """Element border styling."""
    width: float = Field(ge=0, le=50)
    color: str = Field(max_length=7)  # Hex color
    style: BorderStyle = BorderStyle.SOLID


class ElementShadow(BaseModel):
    """Element shadow styling."""
    offset_x: float = Field(ge=-100, le=100)
    offset_y: float = Field(ge=-100, le=100)
    blur: float = Field(ge=0, le=100)
    color: str = Field(max_length=50)  # RGBA supported


class TextFont(BaseModel):
    """Text font styling."""
    family: str = Field(max_length=100)
    size: int = Field(ge=1, le=1000)
    weight: str = "normal"
    color: str = Field(max_length=50)
    align: TextAlign = TextAlign.LEFT


class ElementStyling(BaseModel):
    """Complete element styling."""
    border: Optional[ElementBorder] = None
    shadow: Optional[ElementShadow] = None
    font: Optional[TextFont] = None
    fill: Optional[str] = None
    radius: Optional[float] = Field(None, ge=0, le=1000)


class CropRect(BaseModel):
    """Normalized crop rectangle (0-1 values)."""
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    width: float = Field(ge=0, le=1)
    height: float = Field(ge=0, le=1)


class AlbumElementBase(BaseModel):
    """Base element fields."""
    type: ElementType
    asset_id: Optional[UUID] = None
    text_content: Optional[str] = Field(None, max_length=10000)
    position_x: float = Field(ge=0)
    position_y: float = Field(ge=0)
    width: float = Field(gt=0)
    height: float = Field(gt=0)
    rotation: float = Field(default=0, ge=0, le=360)
    opacity: float = Field(default=1.0, ge=0, le=1)
    z_index: int = Field(ge=0)
    crop: Optional[CropRect] = None
    styling: Optional[ElementStyling] = None
    locked: bool = False

    @field_validator("asset_id")
    @classmethod
    def validate_photo_asset(cls, v: Optional[UUID], info) -> Optional[UUID]:
        """Ensure photo elements have asset_id."""
        values = info.data
        if values.get("type") == ElementType.PHOTO and v is None:
            raise ValueError("Photo elements require asset_id")
        return v


class AlbumElementCreate(AlbumElementBase):
    """Request schema for creating an element."""
    pass


class AlbumElementUpdate(BaseModel):
    """Request schema for updating an element."""
    position_x: Optional[float] = Field(None, ge=0)
    position_y: Optional[float] = Field(None, ge=0)
    width: Optional[float] = Field(None, gt=0)
    height: Optional[float] = Field(None, gt=0)
    rotation: Optional[float] = Field(None, ge=0, le=360)
    opacity: Optional[float] = Field(None, ge=0, le=1)
    z_index: Optional[int] = Field(None, ge=0)
    text_content: Optional[str] = Field(None, max_length=10000)
    crop: Optional[CropRect] = None
    styling: Optional[ElementStyling] = None
    locked: Optional[bool] = None


class AlbumElementResponse(BaseModel):
    """Response schema for album element."""
    element_id: UUID
    spread_id: UUID
    workspace_id: UUID
    type: ElementType
    asset_id: Optional[UUID] = None
    text_content: Optional[str] = None
    position_x: float
    position_y: float
    width: float
    height: float
    rotation: float = 0
    opacity: float = 1.0
    z_index: int
    crop: Optional[CropRect] = None
    styling: Optional[ElementStyling] = None
    locked: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AlbumSpreadBase(BaseModel):
    """Base spread fields."""
    page_number: int = Field(ge=1)
    template_id: Optional[str] = Field(None, max_length=100)
    background_color: Optional[str] = Field(None, max_length=7)  # Hex color
    background_image_asset_id: Optional[UUID] = None
    left_page_config: Optional[Dict[str, Any]] = None
    right_page_config: Optional[Dict[str, Any]] = None

    @field_validator("background_color")
    @classmethod
    def validate_hex_color(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not v.startswith("#"):
            raise ValueError("Background color must be hex format (#RRGGBB)")
        return v


class AlbumSpreadCreate(AlbumSpreadBase):
    """Request schema for creating a spread."""
    elements: List[AlbumElementCreate] = Field(default_factory=list)


class AlbumSpreadUpdate(BaseModel):
    """Request schema for updating a spread."""
    template_id: Optional[str] = Field(None, max_length=100)
    background_color: Optional[str] = Field(None, max_length=7)
    background_image_asset_id: Optional[UUID] = None
    left_page_config: Optional[Dict[str, Any]] = None
    right_page_config: Optional[Dict[str, Any]] = None


class AlbumSpreadResponse(BaseModel):
    """Response schema for album spread."""
    spread_id: UUID
    album_id: UUID
    workspace_id: UUID
    page_number: int
    template_id: Optional[str] = None
    background_color: Optional[str] = None
    background_image_asset_id: Optional[UUID] = None
    left_page_config: Optional[Dict[str, Any]] = None
    right_page_config: Optional[Dict[str, Any]] = None
    elements: List[AlbumElementResponse] = Field(default_factory=list)
    thumbnail_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AlbumSpreadPublic(BaseModel):
    """Public spread response for client proofing."""
    spread_id: UUID
    page_number: int
    image_url: str  # Signed URL for spread preview
    thumbnail_url: str
    comments: List[Any] = Field(default_factory=list)  # AlbumCommentPublic


class SpreadReorderRequest(BaseModel):
    """Request schema for reordering spreads."""
    spread_ids: List[UUID] = Field(..., min_length=1)
