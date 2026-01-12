"""
Album Comment Pydantic Schemas
Feature: 026-album-proofing

Schemas for positioned comments on album spreads.
"""
from datetime import datetime
from enum import Enum
from typing import Optional, List
from uuid import UUID

from pydantic import BaseModel, Field, field_validator
import bleach


class CommentStatus(str, Enum):
    """Comment resolution status."""
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"


class AlbumCommentBase(BaseModel):
    """Base comment fields."""
    spread_id: UUID
    body: str = Field(..., min_length=1, max_length=5000)
    position_x: float = Field(..., ge=0, le=100, description="X position as percentage (0-100)")
    position_y: float = Field(..., ge=0, le=100, description="Y position as percentage (0-100)")
    author_name: str = Field(..., min_length=1, max_length=255)
    author_email: Optional[str] = Field(None, max_length=255)
    parent_comment_id: Optional[UUID] = None

    @field_validator("body")
    @classmethod
    def sanitize_body(cls, v: str) -> str:
        """Sanitize comment body to prevent XSS."""
        return bleach.clean(v.strip(), tags=[], strip=True)

    @field_validator("author_name")
    @classmethod
    def sanitize_author_name(cls, v: str) -> str:
        """Sanitize author name to prevent XSS."""
        return bleach.clean(v.strip(), tags=[], strip=True)

    @field_validator("author_email")
    @classmethod
    def validate_email(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            if "@" not in v:
                raise ValueError("Invalid email address")
            return v.lower().strip()
        return v


class AlbumCommentCreate(AlbumCommentBase):
    """Request schema for creating a comment."""
    pass


class AlbumCommentUpdate(BaseModel):
    """Request schema for updating a comment."""
    body: Optional[str] = Field(None, min_length=1, max_length=5000)
    status: Optional[CommentStatus] = None

    @field_validator("body")
    @classmethod
    def sanitize_body(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            return bleach.clean(v.strip(), tags=[], strip=True)
        return v


class AlbumCommentResponse(BaseModel):
    """Response schema for album comment."""
    comment_id: UUID
    album_id: UUID
    spread_id: UUID
    workspace_id: UUID
    author_user_id: Optional[UUID] = None
    author_name: str
    author_email: Optional[str] = None
    body: str
    position_x: float
    position_y: float
    status: CommentStatus
    parent_comment_id: Optional[UUID] = None
    replies: List["AlbumCommentResponse"] = Field(default_factory=list)
    resolved_by_user_id: Optional[UUID] = None
    resolved_at: Optional[datetime] = None
    is_internal: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# Enable forward reference for recursive type
AlbumCommentResponse.model_rebuild()


class AlbumCommentPublic(BaseModel):
    """Public comment response (excludes internal notes)."""
    comment_id: UUID
    author_name: str
    body: str
    position_x: float
    position_y: float
    status: CommentStatus
    replies: List["AlbumCommentPublic"] = Field(default_factory=list)
    created_at: datetime

    model_config = {"from_attributes": True}


AlbumCommentPublic.model_rebuild()


class CommentSummary(BaseModel):
    """Comment statistics summary."""
    total: int = 0
    open: int = 0
    in_progress: int = 0
    resolved: int = 0


class AlbumCommentListResponse(BaseModel):
    """Response schema for comment list."""
    data: List[AlbumCommentResponse]
    summary: CommentSummary


class ResolveCommentRequest(BaseModel):
    """Request schema for resolving a comment."""
    resolution_note: Optional[str] = Field(None, max_length=1000)
