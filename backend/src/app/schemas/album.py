"""
Album Pydantic Schemas
Feature: 026-album-proofing

Schemas for album CRUD operations and responses.
"""
from datetime import datetime
from enum import Enum
from typing import Optional, List, Any
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class AlbumStatus(str, Enum):
    """Album lifecycle status."""
    DRAFT = "draft"
    PROOF_SENT = "proof_sent"
    CHANGES_REQUESTED = "changes_requested"
    APPROVED = "approved"
    EXPORTED = "exported"


class AlbumBase(BaseModel):
    """Base album fields."""
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    page_size: Optional[str] = Field(None, max_length=50, description="e.g., '12x36', 'A4'")
    gallery_id: Optional[UUID] = None
    lab_preset_id: Optional[UUID] = None


class AlbumCreate(AlbumBase):
    """Request schema for creating an album."""
    pass


class AlbumUpdate(BaseModel):
    """Request schema for updating an album."""
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    page_size: Optional[str] = Field(None, max_length=50)
    cover_spread_id: Optional[UUID] = None


class AlbumResponse(BaseModel):
    """Response schema for album."""
    album_id: UUID
    workspace_id: UUID
    gallery_id: Optional[UUID] = None
    title: str
    description: Optional[str] = None
    status: AlbumStatus
    page_size: Optional[str] = None
    width_mm: Optional[float] = None
    height_mm: Optional[float] = None
    bleed_mm: float = 3.0
    safe_margin_mm: float = 10.0
    lab_preset_id: Optional[UUID] = None
    cover_spread_id: Optional[UUID] = None
    cover_thumbnail_url: Optional[str] = None
    spread_count: int = 0
    created_by_user_id: UUID
    approved_by_email: Optional[str] = None
    approved_at: Optional[datetime] = None
    proof_sent_at: Optional[datetime] = None
    version_number: int = 1
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AlbumSummary(BaseModel):
    """Summary schema for album list views."""
    album_id: UUID
    title: str
    status: AlbumStatus
    spread_count: int
    cover_thumbnail_url: Optional[str] = None
    unresolved_comments: int = 0
    updated_at: datetime

    model_config = {"from_attributes": True}


class CommentSummary(BaseModel):
    """Comment statistics summary."""
    total: int = 0
    open: int = 0
    in_progress: int = 0
    resolved: int = 0


class AlbumDetailResponse(AlbumResponse):
    """Detailed album response with spreads and comments."""
    spreads: List[Any] = Field(default_factory=list)  # Will be AlbumSpreadResponse
    comment_summary: CommentSummary = Field(default_factory=CommentSummary)


class Branding(BaseModel):
    """Photographer branding for public views."""
    photographer_name: str
    logo_url: Optional[str] = None
    primary_color: str = "#0ea5e9"
    theme: str = "light"


class AlbumProofPermissions(BaseModel):
    """Permissions for public album proof viewer."""
    can_comment: bool = True
    can_approve: bool = True
    can_download: bool = True


class AlbumProofResponse(BaseModel):
    """Public album proof response for client viewing."""
    album_id: UUID
    title: str
    status: AlbumStatus
    spreads: List[Any] = Field(default_factory=list)  # AlbumSpreadPublic
    branding: Branding
    permissions: AlbumProofPermissions


class SendProofRequest(BaseModel):
    """Request schema for sending album proof to client."""
    client_email: str = Field(..., max_length=255)
    client_name: Optional[str] = Field(None, max_length=255)
    message: Optional[str] = Field(None, max_length=2000)
    expires_in_days: int = Field(default=30, ge=1, le=90)
    allow_download: bool = True

    @field_validator("client_email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        if "@" not in v:
            raise ValueError("Invalid email address")
        return v.lower().strip()


class SendProofResponse(BaseModel):
    """Response schema for send proof action."""
    share_link: str
    expires_at: datetime
    notification_sent: bool


class ApproveAlbumRequest(BaseModel):
    """Request schema for client approval."""
    client_name: str = Field(..., min_length=1, max_length=255)
    client_email: str = Field(..., max_length=255)
    acknowledge_unresolved: bool = False

    @field_validator("client_email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        if "@" not in v:
            raise ValueError("Invalid email address")
        return v.lower().strip()


class ApproveAlbumResponse(BaseModel):
    """Response schema for album approval."""
    approved: bool
    approved_at: datetime
    warning: Optional[str] = None  # Warning if unresolved comments exist


class Pagination(BaseModel):
    """Pagination metadata."""
    total: int
    page: int
    limit: int
    pages: int


class AlbumListResponse(BaseModel):
    """Paginated album list response."""
    data: List[AlbumSummary]
    pagination: Pagination
