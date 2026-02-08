"""Face Group Model.

Stores face cluster data representing groups of faces identified as belonging
to the same person. Includes centroid vectors for efficient similarity matching,
face counts, and optional person associations.

Feature: Face Detection and Identification
Task: T003 - Create FaceGroup SQLAlchemy model with centroid vector and face count
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


# =============================================================================
# FACE GROUP MODEL (T003)
# =============================================================================


class FaceGroup(BaseModel):
    """Face Group Domain Model.

    Represents a cluster of detected faces identified as belonging to the
    same person. Key features:

    - User-assignable names for easy identification ("John", "Wedding Party")
    - Representative face selection for thumbnail display
    - Centroid (mean) embedding vector for efficient similarity matching
    - Face count tracking for statistics and display

    Workspace Isolation:
        All face group data is strictly isolated by workspace_id.
        Cross-workspace queries are not permitted.

    Centroid Vector:
        The centroid is the mean of all face embeddings in this group.
        It's used for efficient similarity matching when assigning new faces.
        Should be recalculated when faces are added/removed from the group.
    """

    model_config = ConfigDict(from_attributes=True)

    # Primary identifiers
    id: UUID = Field(..., description="Unique face group identifier")
    workspace_id: UUID = Field(
        ...,
        description="Workspace ID for multi-tenant isolation",
    )

    # Naming and identification
    name: Optional[str] = Field(
        None,
        max_length=255,
        description="User-assigned name for this person/group (NULL for unnamed clusters)",
    )
    person_id: Optional[UUID] = Field(
        None,
        description="Links face cluster to named person for search and display",
    )

    # Representative face for thumbnail display
    representative_face_id: Optional[UUID] = Field(
        None,
        description="Face to use as the representative thumbnail (high-quality, clear face)",
    )

    # Centroid vector for similarity matching
    centroid: Optional[list[float]] = Field(
        None,
        description="512-dimensional centroid (mean) embedding vector for similarity search",
    )

    # Face count (denormalized for performance)
    face_count: int = Field(
        default=0,
        ge=0,
        description="Number of faces in this group (denormalized for performance)",
    )

    # Timestamps
    created_at: datetime = Field(
        ...,
        description="When the face group was created",
    )
    updated_at: datetime = Field(
        ...,
        description="Last update timestamp",
    )

    # =========================================================================
    # COMPUTED PROPERTIES
    # =========================================================================

    @property
    def has_centroid(self) -> bool:
        """Check if face group has a valid centroid vector."""
        return self.centroid is not None and len(self.centroid) == 512

    @property
    def is_named(self) -> bool:
        """Check if face group has a user-assigned name."""
        return self.name is not None and len(self.name.strip()) > 0

    @property
    def has_representative(self) -> bool:
        """Check if face group has a representative face selected."""
        return self.representative_face_id is not None

    @property
    def is_empty(self) -> bool:
        """Check if face group has no faces."""
        return self.face_count == 0

    @property
    def is_linked_to_person(self) -> bool:
        """Check if face group is linked to a person record."""
        return self.person_id is not None


# =============================================================================
# CREATE MODEL
# =============================================================================


class FaceGroupCreate(BaseModel):
    """Schema for creating a new face group.

    Used when creating a new face cluster, either automatically from
    face detection or manually by the user.
    """

    # Required fields
    workspace_id: UUID = Field(
        ...,
        description="Workspace ID for multi-tenant isolation",
    )

    # Optional fields
    name: Optional[str] = Field(
        None,
        max_length=255,
        description="User-assigned name for this person/group",
    )
    person_id: Optional[UUID] = Field(
        None,
        description="Optional link to person record",
    )
    representative_face_id: Optional[UUID] = Field(
        None,
        description="Optional representative face ID",
    )
    centroid: Optional[list[float]] = Field(
        None,
        description="Optional 512-dimensional centroid vector",
    )
    face_count: int = Field(
        default=0,
        ge=0,
        description="Initial face count (usually 0 or 1)",
    )

    @field_validator("centroid")
    @classmethod
    def validate_centroid_dimension(cls, v: Optional[list[float]]) -> Optional[list[float]]:
        """Validate centroid vector has correct dimension."""
        if v is not None and len(v) != 512:
            raise ValueError("Centroid must be a 512-dimensional vector")
        return v


# =============================================================================
# UPDATE MODEL
# =============================================================================


class FaceGroupUpdate(BaseModel):
    """Schema for updating an existing face group.

    All fields are optional. Common update scenarios:
    - Assigning/changing the group name
    - Selecting a different representative face
    - Updating the centroid after face changes
    - Linking to a person record
    """

    # Naming updates
    name: Optional[str] = Field(
        None,
        max_length=255,
        description="Update group name",
    )
    person_id: Optional[UUID] = Field(
        None,
        description="Link to or update person record",
    )

    # Representative face update
    representative_face_id: Optional[UUID] = Field(
        None,
        description="Update representative face",
    )

    # Centroid update (after face changes)
    centroid: Optional[list[float]] = Field(
        None,
        description="Update centroid vector",
    )

    # Face count update
    face_count: Optional[int] = Field(
        None,
        ge=0,
        description="Update face count",
    )

    @field_validator("centroid")
    @classmethod
    def validate_centroid_dimension(cls, v: Optional[list[float]]) -> Optional[list[float]]:
        """Validate centroid vector has correct dimension."""
        if v is not None and len(v) != 512:
            raise ValueError("Centroid must be a 512-dimensional vector")
        return v


# =============================================================================
# SUMMARY MODEL
# =============================================================================


class FaceGroupSummary(BaseModel):
    """Lightweight face group summary for list responses.

    Excludes the centroid vector for efficient API responses
    when listing face groups.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    workspace_id: UUID
    name: Optional[str] = None
    person_id: Optional[UUID] = None
    representative_face_id: Optional[UUID] = None
    face_count: int = 0

    # Computed flags for quick filtering
    has_centroid: bool = Field(
        default=False,
        description="Whether group has centroid vector",
    )

    created_at: datetime
    updated_at: datetime


# =============================================================================
# ADDITIONAL HELPER MODELS
# =============================================================================


class FaceGroupWithRepresentative(BaseModel):
    """Face group with representative face thumbnail information.

    Used for displaying face groups in the UI with preview images.
    """

    model_config = ConfigDict(from_attributes=True)

    group: FaceGroupSummary
    representative_thumbnail_url: Optional[str] = Field(
        None,
        description="URL to representative face thumbnail",
    )
    representative_confidence: Optional[float] = Field(
        None,
        ge=0.0,
        le=1.0,
        description="Detection confidence of representative face",
    )


class FaceGroupMerge(BaseModel):
    """Schema for merging multiple face groups into one.

    Used when the user identifies that multiple auto-created clusters
    actually belong to the same person.
    """

    source_group_ids: list[UUID] = Field(
        ...,
        min_length=2,
        description="IDs of face groups to merge (minimum 2)",
    )
    target_name: Optional[str] = Field(
        None,
        max_length=255,
        description="Optional name for the merged group",
    )
    target_person_id: Optional[UUID] = Field(
        None,
        description="Optional person to link merged group to",
    )


class FaceGroupSplit(BaseModel):
    """Schema for splitting faces out of a group into a new group.

    Used when the user identifies that some faces in a cluster
    don't belong to the same person.
    """

    source_group_id: UUID = Field(
        ...,
        description="ID of face group to split from",
    )
    face_ids: list[UUID] = Field(
        ...,
        min_length=1,
        description="IDs of faces to move to new group",
    )
    new_group_name: Optional[str] = Field(
        None,
        max_length=255,
        description="Optional name for the new group",
    )


class FaceGroupSimilarityResult(BaseModel):
    """Result from a face group similarity search using centroid vectors."""

    group: FaceGroupSummary
    similarity_score: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Cosine similarity score (0.0-1.0, higher = more similar)",
    )
    distance: float = Field(
        ...,
        ge=0.0,
        description="Cosine distance (0.0 = identical, 2.0 = opposite)",
    )


class FaceGroupStats(BaseModel):
    """Statistics about face groups in a workspace.

    Used for dashboard displays and analytics.
    """

    model_config = ConfigDict(from_attributes=True)

    workspace_id: UUID
    total_groups: int = Field(
        default=0,
        description="Total number of face groups",
    )
    named_groups: int = Field(
        default=0,
        description="Number of groups with user-assigned names",
    )
    unnamed_groups: int = Field(
        default=0,
        description="Number of unnamed (auto-created) groups",
    )
    total_faces_grouped: int = Field(
        default=0,
        description="Total faces assigned to groups",
    )
    groups_with_person_link: int = Field(
        default=0,
        description="Number of groups linked to person records",
    )
    average_faces_per_group: float = Field(
        default=0.0,
        description="Average number of faces per group",
    )
    largest_group_face_count: int = Field(
        default=0,
        description="Face count in the largest group",
    )


class FaceGroupBatchAssign(BaseModel):
    """Schema for assigning multiple faces to a face group.

    Used for batch operations when manually organizing faces.
    """

    face_group_id: UUID = Field(
        ...,
        description="Target face group ID",
    )
    face_ids: list[UUID] = Field(
        ...,
        min_length=1,
        description="IDs of faces to assign to the group",
    )
    recalculate_centroid: bool = Field(
        default=True,
        description="Whether to recalculate group centroid after assignment",
    )
