"""Gallery Asset Model.

Represents the junction between a gallery and an asset, including
sub-gallery organization, sort order, and visibility settings.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class GalleryAsset(BaseModel):
    """Junction model for assets within a gallery."""

    model_config = ConfigDict(from_attributes=True)

    # Primary key
    gallery_asset_id: UUID = Field(
        default_factory=UUID,
        description="Unique identifier for the gallery-asset relationship",
    )

    # Foreign keys
    workspace_id: UUID = Field(..., description="Workspace ID")
    gallery_id: UUID = Field(..., description="Gallery ID")
    asset_id: UUID = Field(..., description="Asset ID")
    sub_gallery_id: Optional[UUID] = Field(None, description="Sub-gallery ID")

    # Attributes
    sort_order: int = Field(default=0, description="Sort order within the gallery")
    visible: bool = Field(default=True, description="Whether the asset is visible in the gallery")
    is_private: bool = Field(default=False, description="Whether the asset is private/locked")
    access_code_hash: Optional[str] = Field(None, description="Hash of the access code if private")

    # Timestamps
    created_at: datetime = Field(default_factory=datetime.now, description="Creation timestamp")
