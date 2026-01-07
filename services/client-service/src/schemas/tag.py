"""
Tag schemas for request/response validation.

Handles workspace-scoped tags for client categorization and organization.
"""

from typing import Optional, List
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, Field, field_validator


# =============================================================================
# Request Schemas
# =============================================================================


class TagCreate(BaseModel):
    """Schema for creating a new tag."""

    name: str = Field(..., min_length=1, max_length=50, description="Tag name")
    color: Optional[str] = Field(None, max_length=7, description="Tag color (hex format #RRGGBB)")
    description: Optional[str] = Field(None, max_length=255, description="Tag description")

    @field_validator("name")
    def validate_name(cls, v: str) -> str:
        """Validate and normalize tag name."""
        # Strip whitespace and convert to lowercase for consistency
        v = v.strip()
        if not v:
            raise ValueError("Tag name cannot be empty")
        return v

    @field_validator("color")
    def validate_color(cls, v: Optional[str]) -> Optional[str]:
        """Validate hex color format."""
        if v is None:
            return v

        v = v.strip().upper()

        # Ensure it starts with #
        if not v.startswith("#"):
            v = f"#{v}"

        # Validate hex format (#RRGGBB)
        if len(v) != 7:
            raise ValueError("Color must be in hex format #RRGGBB")

        # Validate hex characters
        try:
            int(v[1:], 16)
        except ValueError:
            raise ValueError("Color must contain valid hex characters (0-9, A-F)")

        return v


class TagUpdate(BaseModel):
    """Schema for updating a tag."""

    name: Optional[str] = Field(None, min_length=1, max_length=50, description="Tag name")
    color: Optional[str] = Field(None, max_length=7, description="Tag color (hex format)")
    description: Optional[str] = Field(None, max_length=255, description="Tag description")

    @field_validator("name")
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        """Validate tag name if provided."""
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError("Tag name cannot be empty")
        return v

    @field_validator("color")
    def validate_color(cls, v: Optional[str]) -> Optional[str]:
        """Validate hex color if provided."""
        if v is None:
            return v

        v = v.strip().upper()

        if not v.startswith("#"):
            v = f"#{v}"

        if len(v) != 7:
            raise ValueError("Color must be in hex format #RRGGBB")

        try:
            int(v[1:], 16)
        except ValueError:
            raise ValueError("Color must contain valid hex characters")

        return v


# =============================================================================
# Response Schemas
# =============================================================================


class TagResponse(BaseModel):
    """Schema for tag response."""

    tag_id: UUID = Field(..., description="Tag ID")
    workspace_id: UUID = Field(..., description="Workspace ID")
    name: str = Field(..., description="Tag name")
    color: Optional[str] = Field(None, description="Tag color (hex format)")
    description: Optional[str] = Field(None, description="Tag description")
    client_count: int = Field(0, description="Number of clients with this tag")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")

    model_config = {
        "from_attributes": True,
        "json_schema_extra": {
            "example": {
                "tag_id": "550e8400-e29b-41d4-a716-446655440004",
                "workspace_id": "550e8400-e29b-41d4-a716-446655440002",
                "name": "VIP",
                "color": "#FF5733",
                "description": "High-priority clients",
                "client_count": 15,
                "created_at": "2024-01-01T12:00:00Z",
                "updated_at": "2024-01-01T12:00:00Z",
            }
        },
    }


class TagListResponse(BaseModel):
    """Schema for tag list response."""

    tags: List[TagResponse] = Field(..., description="List of tags")

    model_config = {
        "json_schema_extra": {
            "example": {
                "tags": [
                    {
                        "tag_id": "550e8400-e29b-41d4-a716-446655440004",
                        "workspace_id": "550e8400-e29b-41d4-a716-446655440002",
                        "name": "VIP",
                        "color": "#FF5733",
                        "description": "High-priority clients",
                        "client_count": 15,
                        "created_at": "2024-01-01T12:00:00Z",
                        "updated_at": "2024-01-01T12:00:00Z",
                    }
                ]
            }
        },
    }


# =============================================================================
# Tag Assignment Schemas
# =============================================================================


class TagAssignRequest(BaseModel):
    """Schema for assigning tags to a client."""

    tag_ids: List[UUID] = Field(..., min_length=1, description="List of tag IDs to assign")

    @field_validator("tag_ids")
    def validate_unique_tag_ids(cls, v: List[UUID]) -> List[UUID]:
        """Ensure tag IDs are unique."""
        if len(v) != len(set(v)):
            raise ValueError("Tag IDs must be unique")
        return v


class TagUnassignRequest(BaseModel):
    """Schema for unassigning tags from a client."""

    tag_ids: List[UUID] = Field(..., min_length=1, description="List of tag IDs to remove")

    @field_validator("tag_ids")
    def validate_unique_tag_ids(cls, v: List[UUID]) -> List[UUID]:
        """Ensure tag IDs are unique."""
        if len(v) != len(set(v)):
            raise ValueError("Tag IDs must be unique")
        return v
