"""Gradient configuration types for RawDrive.

These types mirror the TypeScript gradient types from @rawdrive/shared-types.
"""

from typing import Literal, Optional
from pydantic import BaseModel, Field


class ColorStop(BaseModel):
    """Color stop for gradient configuration."""

    color: str = Field(..., description="Hex color value (e.g., #FF5733)")
    position: float = Field(..., ge=0, le=100, description="Position percentage (0-100)")

    model_config = {"frozen": True}


class GradientConfiguration(BaseModel):
    """Gradient configuration for gallery branding."""

    type: Literal["linear", "radial"] = Field(
        default="linear", description="Gradient type"
    )
    angle: Optional[int] = Field(
        default=None, ge=0, le=360, description="Gradient angle in degrees (0-360)"
    )
    colors: list[ColorStop] = Field(
        ..., min_length=2, max_length=10, description="Gradient color stops (2-10)"
    )

    model_config = {"frozen": True}
