"""
Gallery link schemas for request/response validation.

Handles client-gallery associations with role tracking and proofing statistics.
"""

from typing import Optional
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, Field, field_validator


# =============================================================================
# Role Enum (matches database constraint)
# =============================================================================

GALLERY_ROLES = ["primary_subject", "guest", "family", "other"]


# =============================================================================
# Request Schemas
# =============================================================================


class GalleryLinkCreate(BaseModel):
    """Schema for linking a gallery to a client."""

    gallery_id: UUID = Field(..., description="Gallery ID to link")
    role: str = Field("primary_subject", description="Client's role in the gallery")
    notes: Optional[str] = Field(None, max_length=500, description="Notes about this link")

    @field_validator("role")
    def validate_role(cls, v: str) -> str:
        """Validate role is one of allowed values."""
        if v not in GALLERY_ROLES:
            raise ValueError(f"Role must be one of: {', '.join(GALLERY_ROLES)}")
        return v


class GalleryLinkUpdate(BaseModel):
    """Schema for updating a gallery link."""

    role: Optional[str] = Field(None, description="Client's role in the gallery")
    notes: Optional[str] = Field(None, max_length=500, description="Notes about this link")

    @field_validator("role")
    def validate_role(cls, v: Optional[str]) -> Optional[str]:
        """Validate role if provided."""
        if v is not None and v not in GALLERY_ROLES:
            raise ValueError(f"Role must be one of: {', '.join(GALLERY_ROLES)}")
        return v


# =============================================================================
# Response Schemas
# =============================================================================


class GalleryLinkResponse(BaseModel):
    """Schema for gallery link response."""

    link_id: UUID = Field(..., description="Link ID")
    client_id: UUID = Field(..., description="Client ID")
    gallery_id: UUID = Field(..., description="Gallery ID")
    workspace_id: UUID = Field(..., description="Workspace ID")
    role: str = Field(..., description="Client's role in the gallery")
    notes: Optional[str] = Field(None, description="Notes about this link")

    # Proofing statistics (populated from analytics_events)
    favorites_count: int = Field(0, description="Number of favorites by this client")
    selections_count: int = Field(0, description="Number of selections by this client")
    comments_count: int = Field(0, description="Number of comments by this client")
    last_viewed_at: Optional[datetime] = Field(None, description="Last time client viewed this gallery")

    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")

    model_config = {
        "from_attributes": True,
        "json_schema_extra": {
            "example": {
                "link_id": "550e8400-e29b-41d4-a716-446655440005",
                "client_id": "550e8400-e29b-41d4-a716-446655440001",
                "gallery_id": "550e8400-e29b-41d4-a716-446655440006",
                "workspace_id": "550e8400-e29b-41d4-a716-446655440002",
                "role": "primary_subject",
                "notes": "Wedding photos",
                "favorites_count": 25,
                "selections_count": 12,
                "comments_count": 3,
                "last_viewed_at": "2024-01-15T10:30:00Z",
                "created_at": "2024-01-01T12:00:00Z",
                "updated_at": "2024-01-01T12:00:00Z",
            }
        },
    }


class GalleryLinkListResponse(BaseModel):
    """Schema for gallery link list response."""

    links: list[GalleryLinkResponse] = Field(..., description="List of gallery links")

    model_config = {
        "json_schema_extra": {
            "example": {
                "links": [
                    {
                        "link_id": "550e8400-e29b-41d4-a716-446655440005",
                        "client_id": "550e8400-e29b-41d4-a716-446655440001",
                        "gallery_id": "550e8400-e29b-41d4-a716-446655440006",
                        "workspace_id": "550e8400-e29b-41d4-a716-446655440002",
                        "role": "primary_subject",
                        "notes": "Wedding photos",
                        "favorites_count": 25,
                        "selections_count": 12,
                        "comments_count": 3,
                        "last_viewed_at": "2024-01-15T10:30:00Z",
                        "created_at": "2024-01-01T12:00:00Z",
                        "updated_at": "2024-01-01T12:00:00Z",
                    }
                ]
            }
        },
    }


class ProofingSummaryResponse(BaseModel):
    """Schema for proofing statistics summary."""

    client_id: UUID = Field(..., description="Client ID")
    gallery_id: UUID = Field(..., description="Gallery ID")
    favorites_count: int = Field(..., description="Number of favorites")
    selections_count: int = Field(..., description="Number of selections")
    comments_count: int = Field(..., description="Number of comments")
    last_viewed_at: Optional[datetime] = Field(None, description="Last view timestamp")
    total_engagement: int = Field(..., description="Total engagement (favorites + selections + comments)")

    model_config = {
        "json_schema_extra": {
            "example": {
                "client_id": "550e8400-e29b-41d4-a716-446655440001",
                "gallery_id": "550e8400-e29b-41d4-a716-446655440006",
                "favorites_count": 25,
                "selections_count": 12,
                "comments_count": 3,
                "last_viewed_at": "2024-01-15T10:30:00Z",
                "total_engagement": 40,
            }
        },
    }
