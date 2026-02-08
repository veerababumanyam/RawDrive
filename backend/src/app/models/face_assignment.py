"""Face Assignment Model.

Stores face-to-group assignment data linking detected faces to face groups (person clusters).
Includes assignment confidence scores, source tracking (automatic vs manual),
confirmation status, and historical metadata.

Feature: Face Detection and Identification
Task: T004 - Create FaceAssignment model linking faces to face_groups
"""

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


# =============================================================================
# ENUMS
# =============================================================================


class AssignmentSource(str, Enum):
    """How the face assignment was made.

    - AUTOMATIC: Assigned by face clustering algorithm
    - MANUAL: Explicitly assigned by user
    - MERGED: Result of merging multiple face groups
    - SPLIT: Result of splitting a face group
    """

    AUTOMATIC = "automatic"
    MANUAL = "manual"
    MERGED = "merged"
    SPLIT = "split"


# =============================================================================
# FACE ASSIGNMENT MODEL (T004)
# =============================================================================


class FaceAssignment(BaseModel):
    """Face Assignment Domain Model.

    Represents the linkage between a detected face and a face group (person cluster).
    Key features:

    - Assignment confidence from clustering algorithm (0.0-1.0)
    - Source tracking (automatic, manual, merged, split)
    - Confirmation status for review workflow
    - User attribution for manual/confirmed assignments
    - Metadata storage for algorithm details

    Workspace Isolation:
        All face assignment data is strictly isolated by workspace_id.
        Cross-workspace queries are not permitted.

    Relationship with faces.face_group_id:
        The faces table has a face_group_id column for the "current" assignment.
        This table provides the full assignment history and metadata.
    """

    model_config = ConfigDict(from_attributes=True)

    # Primary identifiers
    id: UUID = Field(..., description="Unique face assignment identifier")
    workspace_id: UUID = Field(
        ...,
        description="Workspace ID for multi-tenant isolation",
    )

    # Relationships
    face_id: UUID = Field(
        ...,
        description="Reference to the face being assigned",
    )
    face_group_id: UUID = Field(
        ...,
        description="Reference to the target face group (person cluster)",
    )

    # Assignment confidence from clustering algorithm
    confidence: Optional[Decimal] = Field(
        None,
        ge=Decimal("0"),
        le=Decimal("1"),
        description="Clustering confidence score (0.0-1.0). NULL for manual assignments.",
    )

    # Assignment source tracking
    source: AssignmentSource = Field(
        AssignmentSource.AUTOMATIC,
        description="How the assignment was made (automatic, manual, merged, split)",
    )

    # Confirmation status
    is_confirmed: bool = Field(
        False,
        description="Whether assignment has been confirmed by a user",
    )

    # User attribution
    assigned_by_user_id: Optional[UUID] = Field(
        None,
        description="User who made or confirmed this assignment. NULL for unconfirmed automatic assignments.",
    )

    # Assignment timestamps
    assigned_at: datetime = Field(
        ...,
        description="When the assignment was made",
    )
    confirmed_at: Optional[datetime] = Field(
        None,
        description="When the assignment was confirmed by a user. NULL if not yet confirmed.",
    )

    # Additional metadata
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Additional metadata (clustering algorithm version, similarity score to centroid, etc.)",
    )

    # Timestamps
    created_at: datetime = Field(
        ...,
        description="When the record was created",
    )
    updated_at: datetime = Field(
        ...,
        description="Last update timestamp",
    )

    # =========================================================================
    # COMPUTED PROPERTIES
    # =========================================================================

    @property
    def is_automatic(self) -> bool:
        """Check if assignment was made automatically by clustering algorithm."""
        return self.source == AssignmentSource.AUTOMATIC

    @property
    def is_manual(self) -> bool:
        """Check if assignment was made manually by a user."""
        return self.source == AssignmentSource.MANUAL

    @property
    def is_high_confidence(self) -> bool:
        """Check if assignment has high confidence (>= 0.8)."""
        return self.confidence is not None and self.confidence >= Decimal("0.8")

    @property
    def is_low_confidence(self) -> bool:
        """Check if assignment has low confidence (< 0.5)."""
        return self.confidence is not None and self.confidence < Decimal("0.5")

    @property
    def needs_review(self) -> bool:
        """Check if assignment needs user review (automatic + unconfirmed)."""
        return self.is_automatic and not self.is_confirmed


# =============================================================================
# CREATE MODEL
# =============================================================================


class FaceAssignmentCreate(BaseModel):
    """Schema for creating a new face assignment.

    Used when assigning a face to a face group, either automatically
    from clustering or manually by a user.
    """

    # Required fields
    workspace_id: UUID = Field(
        ...,
        description="Workspace ID for multi-tenant isolation",
    )
    face_id: UUID = Field(
        ...,
        description="Reference to the face being assigned",
    )
    face_group_id: UUID = Field(
        ...,
        description="Reference to the target face group",
    )

    # Optional fields with defaults
    confidence: Optional[Decimal] = Field(
        None,
        ge=Decimal("0"),
        le=Decimal("1"),
        description="Clustering confidence score (0.0-1.0). NULL for manual assignments.",
    )
    source: AssignmentSource = Field(
        AssignmentSource.AUTOMATIC,
        description="How the assignment was made",
    )
    is_confirmed: bool = Field(
        False,
        description="Whether assignment is already confirmed",
    )
    assigned_by_user_id: Optional[UUID] = Field(
        None,
        description="User making the assignment (for manual/confirmed)",
    )
    assigned_at: Optional[datetime] = Field(
        None,
        description="When assignment was made (defaults to now)",
    )
    confirmed_at: Optional[datetime] = Field(
        None,
        description="When assignment was confirmed (if pre-confirmed)",
    )
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Additional metadata",
    )

    @model_validator(mode="after")
    def validate_confirmed_consistency(self) -> "FaceAssignmentCreate":
        """Validate that confirmed_at is set when is_confirmed is true."""
        if self.is_confirmed and self.confirmed_at is None:
            # Auto-set confirmed_at to assigned_at or now
            from datetime import datetime, timezone

            self.confirmed_at = self.assigned_at or datetime.now(timezone.utc)
        return self

    @model_validator(mode="after")
    def validate_manual_assignment(self) -> "FaceAssignmentCreate":
        """Validate manual assignments are automatically confirmed."""
        if self.source == AssignmentSource.MANUAL:
            self.is_confirmed = True
            if self.confirmed_at is None:
                from datetime import datetime, timezone

                self.confirmed_at = self.assigned_at or datetime.now(timezone.utc)
        return self


# =============================================================================
# UPDATE MODEL
# =============================================================================


class FaceAssignmentUpdate(BaseModel):
    """Schema for updating an existing face assignment.

    All fields are optional. Common update scenarios:
    - Confirming an automatic assignment
    - Changing the target face group
    - Updating confidence score after re-clustering
    """

    # Relationship updates
    face_group_id: Optional[UUID] = Field(
        None,
        description="Update target face group (reassignment)",
    )

    # Confidence update
    confidence: Optional[Decimal] = Field(
        None,
        ge=Decimal("0"),
        le=Decimal("1"),
        description="Update confidence score",
    )

    # Source update (e.g., when converting automatic to manual)
    source: Optional[AssignmentSource] = Field(
        None,
        description="Update assignment source",
    )

    # Confirmation updates
    is_confirmed: Optional[bool] = Field(
        None,
        description="Mark assignment as confirmed",
    )
    assigned_by_user_id: Optional[UUID] = Field(
        None,
        description="Update user attribution",
    )
    confirmed_at: Optional[datetime] = Field(
        None,
        description="Update confirmation timestamp",
    )

    # Metadata update
    metadata: Optional[dict[str, Any]] = Field(
        None,
        description="Update additional metadata",
    )


# =============================================================================
# CONFIRMATION MODEL
# =============================================================================


class FaceAssignmentConfirm(BaseModel):
    """Schema for confirming a face assignment.

    Used when a user reviews and confirms an automatic assignment.
    """

    confirmed_by_user_id: UUID = Field(
        ...,
        description="User confirming the assignment",
    )
    confirmed_at: Optional[datetime] = Field(
        None,
        description="Confirmation timestamp (defaults to now)",
    )


# =============================================================================
# SUMMARY MODEL
# =============================================================================


class FaceAssignmentSummary(BaseModel):
    """Lightweight face assignment summary for list responses.

    Excludes metadata for efficient API responses when listing assignments.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    workspace_id: UUID
    face_id: UUID
    face_group_id: UUID

    confidence: Optional[Decimal] = None
    source: AssignmentSource
    is_confirmed: bool = False
    assigned_by_user_id: Optional[UUID] = None

    assigned_at: datetime
    confirmed_at: Optional[datetime] = None

    created_at: datetime
    updated_at: datetime


# =============================================================================
# ADDITIONAL HELPER MODELS
# =============================================================================


class FaceAssignmentWithDetails(BaseModel):
    """Face assignment with related face and group information.

    Used for detailed views that need to display face thumbnails
    and group names alongside assignment data.
    """

    model_config = ConfigDict(from_attributes=True)

    assignment: FaceAssignmentSummary

    # Face details
    face_thumbnail_url: Optional[str] = Field(
        None,
        description="URL to face thumbnail",
    )
    face_confidence: Optional[Decimal] = Field(
        None,
        ge=Decimal("0"),
        le=Decimal("1"),
        description="Face detection confidence",
    )
    photo_id: Optional[UUID] = Field(
        None,
        description="Photo containing the face",
    )

    # Group details
    group_name: Optional[str] = Field(
        None,
        description="Face group name (if assigned)",
    )
    group_face_count: int = Field(
        default=0,
        description="Number of faces in the group",
    )


class FaceAssignmentBatchCreate(BaseModel):
    """Schema for creating multiple face assignments in a single request.

    Used when assigning multiple faces to a group at once,
    or when clustering creates many assignments.
    """

    workspace_id: UUID = Field(
        ...,
        description="Workspace ID (same for all assignments)",
    )
    face_group_id: UUID = Field(
        ...,
        description="Target face group (same for all assignments)",
    )
    source: AssignmentSource = Field(
        AssignmentSource.AUTOMATIC,
        description="Assignment source (same for all assignments)",
    )
    assigned_by_user_id: Optional[UUID] = Field(
        None,
        description="User making the assignments (for manual)",
    )
    assignments: list["FaceAssignmentBatchItem"] = Field(
        ...,
        min_length=1,
        description="List of face assignments to create",
    )


class FaceAssignmentBatchItem(BaseModel):
    """Individual item in a batch assignment request."""

    face_id: UUID = Field(
        ...,
        description="Face to assign",
    )
    confidence: Optional[Decimal] = Field(
        None,
        ge=Decimal("0"),
        le=Decimal("1"),
        description="Assignment confidence score",
    )
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Assignment-specific metadata",
    )


class FaceAssignmentBatchConfirm(BaseModel):
    """Schema for confirming multiple face assignments at once.

    Used when a user reviews and confirms multiple assignments.
    """

    assignment_ids: list[UUID] = Field(
        ...,
        min_length=1,
        description="IDs of assignments to confirm",
    )
    confirmed_by_user_id: UUID = Field(
        ...,
        description="User confirming the assignments",
    )


class FaceAssignmentStats(BaseModel):
    """Statistics about face assignments in a workspace.

    Used for dashboard displays and analytics.
    """

    model_config = ConfigDict(from_attributes=True)

    workspace_id: UUID
    total_assignments: int = Field(
        default=0,
        description="Total number of face assignments",
    )
    confirmed_assignments: int = Field(
        default=0,
        description="Number of confirmed assignments",
    )
    unconfirmed_assignments: int = Field(
        default=0,
        description="Number of unconfirmed assignments",
    )
    automatic_assignments: int = Field(
        default=0,
        description="Number of automatic (clustering) assignments",
    )
    manual_assignments: int = Field(
        default=0,
        description="Number of manual (user) assignments",
    )
    average_confidence: Optional[float] = Field(
        None,
        ge=0.0,
        le=1.0,
        description="Average confidence score (automatic assignments only)",
    )
    high_confidence_count: int = Field(
        default=0,
        description="Number of high confidence (>= 0.8) assignments",
    )
    low_confidence_count: int = Field(
        default=0,
        description="Number of low confidence (< 0.5) assignments",
    )


class UnconfirmedAssignmentReview(BaseModel):
    """Model for assignments pending review.

    Used to display assignments that need user confirmation,
    sorted by confidence to prioritize low-confidence items.
    """

    model_config = ConfigDict(from_attributes=True)

    assignment: FaceAssignmentWithDetails
    suggested_group_name: Optional[str] = Field(
        None,
        description="AI-suggested name for the group",
    )
    similar_groups: list[UUID] = Field(
        default_factory=list,
        description="IDs of other groups this face might belong to",
    )
