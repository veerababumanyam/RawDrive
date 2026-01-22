"""Pydantic schemas for cover photo uploads."""

from __future__ import annotations

from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field


class CoverPhotoVariant(BaseModel):
    """Cover photo variant metadata."""

    size: str = Field(..., description="Variant size identifier (original, 1920, 1280, 640)")
    width: int = Field(..., ge=1, description="Variant width in pixels")
    height: int = Field(..., ge=1, description="Variant height in pixels")
    bytes_size: int = Field(..., ge=1, description="Compressed variant size in bytes")
    url: str = Field(..., description="Signed URL for accessing variant")


class CoverPhotoResponse(BaseModel):
    """Response for successful cover photo upload."""

    asset_id: str = Field(..., description="Asset UUID for the cover photo")
    gallery_id: str = Field(..., description="Gallery UUID")
    workspace_id: str = Field(..., description="Workspace UUID")
    original_width: int = Field(..., ge=1920, description="Original image width in pixels")
    original_height: int = Field(..., ge=1080, description="Original image height in pixels")
    mime_type: str = Field(..., description="Original file MIME type (image/jpeg, image/png, etc.)")
    variants: List[CoverPhotoVariant] = Field(
        ...,
        description="Generated WebP variants with signed URLs (original, 1920, 1280, 640px)"
    )
    uploaded_at: Optional[datetime] = Field(
        None,
        description="Timestamp when cover was uploaded"
    )

    class Config:
        """Pydantic config."""

        json_schema_extra = {
            "example": {
                "asset_id": "550e8400-e29b-41d4-a716-446655440000",
                "gallery_id": "460e8400-e29b-41d4-a716-446655440001",
                "workspace_id": "370e8400-e29b-41d4-a716-446655440002",
                "original_width": 3840,
                "original_height": 2160,
                "mime_type": "image/jpeg",
                "variants": [
                    {
                        "size": "original",
                        "width": 4000,
                        "height": 2250,
                        "bytes_size": 1524288,
                        "url": "https://r2.example.com/workspaces/.../cover/550e8400.../original.webp.enc?..."
                    },
                    {
                        "size": "1920",
                        "width": 1920,
                        "height": 1080,
                        "bytes_size": 512000,
                        "url": "https://r2.example.com/workspaces/.../cover/550e8400.../1920.webp.enc?..."
                    },
                    {
                        "size": "1280",
                        "width": 1280,
                        "height": 720,
                        "bytes_size": 256000,
                        "url": "https://r2.example.com/workspaces/.../cover/550e8400.../1280.webp.enc?..."
                    },
                    {
                        "size": "640",
                        "width": 640,
                        "height": 360,
                        "bytes_size": 64000,
                        "url": "https://r2.example.com/workspaces/.../cover/550e8400.../640.webp.enc?..."
                    }
                ],
                "uploaded_at": "2026-01-22T15:30:45.123456Z"
            }
        }


class CoverPhotoErrorResponse(BaseModel):
    """Error response for cover photo operations."""

    error: str = Field(..., description="Error code")
    message: str = Field(..., description="Human-readable error message")


class CoverPhotoValidationErrorResponse(BaseModel):
    """Validation error response."""

    error: str = Field(
        "COVER_PHOTO_VALIDATION_ERROR",
        description="Error code"
    )
    message: str = Field(..., description="Specific validation error message")
    details: Optional[dict] = Field(
        None,
        description="Additional validation details"
    )
