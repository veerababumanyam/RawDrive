"""Pydantic schemas for AI duplicate detection endpoints.

All schemas for photo and client duplicate detection using AI.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class DetectPhotoDuplicatesRequest(BaseModel):
    """Request to detect duplicate photos using perceptual hashing."""

    gallery_id: Optional[UUID] = Field(None, description="Gallery ID to scan (optional, scans all if not provided)")
    similarity_threshold: float = Field(
        0.85,
        ge=0.0,
        le=1.0,
        description="Similarity threshold (0.85 = 85% similar, higher = stricter)"
    )
    min_group_size: int = Field(2, ge=2, description="Minimum number of photos in a duplicate group")


class DetectClientDuplicatesAIRequest(BaseModel):
    """Request to detect duplicate clients using AI semantic embeddings."""

    mode: Literal["ai", "traditional", "hybrid"] = Field(
        "hybrid",
        description="Detection mode: ai (Gemini embeddings), traditional (Levenshtein), hybrid (both)"
    )
    similarity_threshold: float = Field(
        0.75,
        ge=0.0,
        le=1.0,
        description="Similarity threshold (0.75 = 75% similar, higher = stricter)"
    )
    min_group_size: int = Field(2, ge=2, description="Minimum number of clients in a duplicate group")


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class DuplicatePhotoMember(BaseModel):
    """Individual photo in a duplicate group."""

    asset_id: UUID
    file_name: str
    file_size: int
    perceptual_hash: Optional[str] = None
    similarity_to_primary: Optional[float] = Field(
        None,
        description="Similarity score to primary photo (0-1)"
    )
    is_primary: bool = Field(False, description="True if this is the primary/master photo")
    thumbnail_url: Optional[str] = None


class DuplicatePhotoGroup(BaseModel):
    """Group of duplicate photos."""

    group_id: Optional[UUID] = Field(None, description="Group ID (null if not yet saved)")
    members: list[DuplicatePhotoMember] = Field(..., min_length=2)
    similarity_score: float = Field(..., description="Average similarity score for group (0-1)")
    detection_method: Literal["perceptual_hash"] = "perceptual_hash"
    status: Optional[Literal["pending", "confirmed", "dismissed"]] = "pending"
    created_at: Optional[datetime] = None


class DetectPhotoDuplicatesResponse(BaseModel):
    """Response from photo duplicate detection."""

    duplicate_groups: list[DuplicatePhotoGroup]
    total_groups: int
    total_photos_scanned: int
    photos_with_duplicates: int
    credits_used: int = Field(..., description="AI credits consumed")
    credits_remaining: int = Field(..., description="AI credits remaining in plan")


class DuplicateClientMember(BaseModel):
    """Individual client in a duplicate group."""

    client_id: UUID
    full_name: str
    primary_email: Optional[str] = None
    primary_phone: Optional[str] = None
    similarity_to_primary: Optional[float] = Field(
        None,
        description="Similarity score to primary client (0-1)"
    )
    is_primary: bool = Field(False, description="True if this is the primary/master client")
    match_reason: Optional[str] = Field(
        None,
        description="Reason for match (e.g., 'Similar name and email')"
    )


class DuplicateClientGroup(BaseModel):
    """Group of duplicate clients."""

    group_id: Optional[UUID] = Field(None, description="Group ID (null if not yet saved)")
    members: list[DuplicateClientMember] = Field(..., min_length=2)
    similarity_score: float = Field(..., description="Average similarity score for group (0-1)")
    detection_method: Literal["gemini_embedding", "levenshtein", "hybrid"]
    status: Optional[Literal["pending", "confirmed", "dismissed"]] = "pending"
    created_at: Optional[datetime] = None


class DetectClientDuplicatesAIResponse(BaseModel):
    """Response from client duplicate detection."""

    duplicate_groups: list[DuplicateClientGroup]
    total_groups: int
    total_clients_scanned: int
    clients_with_duplicates: int
    credits_used: int = Field(..., description="AI credits consumed")
    credits_remaining: int = Field(..., description="AI credits remaining in plan")


class DuplicateGroupListItem(BaseModel):
    """Duplicate group list item (for GET /duplicate-groups)."""

    group_id: UUID
    workspace_id: UUID
    entity_type: Literal["photo", "client"]
    detection_method: str
    similarity_score: Optional[float] = None
    status: Literal["pending", "confirmed", "dismissed"]
    member_count: int = Field(..., description="Number of items in group")
    reviewed_by_user_id: Optional[UUID] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class DuplicateGroupDetail(BaseModel):
    """Detailed duplicate group with all members."""

    group_id: UUID
    workspace_id: UUID
    entity_type: Literal["photo", "client"]
    detection_method: str
    similarity_score: Optional[float] = None
    status: Literal["pending", "confirmed", "dismissed"]
    members: list[DuplicatePhotoMember | DuplicateClientMember]
    reviewed_by_user_id: Optional[UUID] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class DuplicateGroupListResponse(BaseModel):
    """Response for GET /duplicate-groups."""

    groups: list[DuplicateGroupListItem]
    total: int
    page: int
    limit: int


class DuplicateGroupActionResponse(BaseModel):
    """Response for confirm/dismiss actions."""

    group_id: UUID
    status: Literal["confirmed", "dismissed"]
    reviewed_at: datetime
    message: str
