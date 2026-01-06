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
