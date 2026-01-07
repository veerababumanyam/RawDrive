"""
Pydantic schemas for duplicate detection and merging.

Supports:
- Fuzzy matching (email + name similarity)
- Confidence scoring
- Merge strategies
- Audit trails
"""

from typing import List, Optional, Dict, Any, Literal
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, Field


class DuplicateCandidate(BaseModel):
    """Potential duplicate client."""

    client_id: UUID = Field(..., description="Client ID")
    full_name: str = Field(..., description="Client full name")
    email: Optional[str] = Field(None, description="Primary email")
    phone: Optional[str] = Field(None, description="Primary phone")
    status: str = Field(..., description="Client status")
    created_at: datetime = Field(..., description="Creation timestamp")
    similarity_score: float = Field(
        ..., ge=0.0, le=1.0, description="Similarity score (0-1)"
    )
    match_reasons: List[str] = Field(
        default_factory=list, description="Reasons for match (e.g., 'email_exact', 'name_fuzzy')"
    )


class DuplicateGroup(BaseModel):
    """Group of duplicate clients."""

    primary_client_id: UUID = Field(..., description="Suggested primary client")
    duplicates: List[DuplicateCandidate] = Field(
        ..., description="Duplicate candidates"
    )
    confidence: Literal["high", "medium", "low"] = Field(
        ..., description="Confidence level"
    )


class DuplicateDetectionRequest(BaseModel):
    """Request to detect duplicates."""

    client_id: Optional[UUID] = Field(
        None, description="Specific client to check (or all if omitted)"
    )
    threshold: float = Field(
        0.7, ge=0.0, le=1.0, description="Similarity threshold (0-1)"
    )
    include_merged: bool = Field(
        False, description="Include already merged clients"
    )


class DuplicateDetectionResponse(BaseModel):
    """Response with duplicate groups."""

    duplicate_groups: List[DuplicateGroup] = Field(
        default_factory=list, description="Groups of duplicates"
    )
    total_duplicates: int = Field(..., description="Total duplicate candidates found")
    high_confidence_count: int = Field(
        ..., description="High confidence duplicates"
    )
    medium_confidence_count: int = Field(
        ..., description="Medium confidence duplicates"
    )
    low_confidence_count: int = Field(..., description="Low confidence duplicates")


class MergeStrategy(BaseModel):
    """Strategy for merging clients."""

    keep_client_id: UUID = Field(..., description="Client to keep (primary)")
    merge_client_ids: List[UUID] = Field(
        ..., description="Clients to merge into primary"
    )
    field_preferences: Optional[Dict[str, str]] = Field(
        None,
        description="Field preferences: {field_name: 'keep_primary' | 'merge' | 'override'}",
    )
    delete_after_merge: bool = Field(
        True, description="Delete merged clients after merge"
    )


class MergeResult(BaseModel):
    """Result of merge operation."""

    primary_client_id: UUID = Field(..., description="Primary client ID (kept)")
    merged_client_ids: List[UUID] = Field(
        ..., description="Merged client IDs"
    )
    contacts_merged: int = Field(..., description="Contacts merged count")
    addresses_merged: int = Field(..., description="Addresses merged count")
    tags_merged: int = Field(..., description="Tags merged count")
    gallery_links_merged: int = Field(..., description="Gallery links merged count")
    activities_merged: int = Field(..., description="Activities merged count")
    communications_merged: int = Field(
        ..., description="Communications merged count"
    )
    audit_trail_id: Optional[UUID] = Field(
        None, description="Audit trail record ID"
    )


class MergeAuditTrail(BaseModel):
    """Audit record for merge operation."""

    audit_id: UUID = Field(..., description="Audit record ID")
    workspace_id: UUID = Field(..., description="Workspace ID")
    primary_client_id: UUID = Field(..., description="Primary client kept")
    merged_client_ids: List[UUID] = Field(..., description="Merged clients")
    performed_by: UUID = Field(..., description="User who performed merge")
    performed_at: datetime = Field(..., description="Merge timestamp")
    merge_details: Dict[str, Any] = Field(
        ..., description="Detailed merge information"
    )
    can_undo: bool = Field(
        False, description="Whether merge can be undone"
    )


class SimilarityMatch(BaseModel):
    """Individual similarity match."""

    match_type: Literal["email_exact", "email_similar", "name_exact", "name_fuzzy", "phone_exact"] = Field(
        ..., description="Type of match"
    )
    score: float = Field(..., ge=0.0, le=1.0, description="Match score")
    field: str = Field(..., description="Field that matched")
    value1: str = Field(..., description="Value from first client")
    value2: str = Field(..., description="Value from second client")
