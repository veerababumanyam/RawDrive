"""Face Detection Model.

Stores detected face data including bounding box coordinates, detection confidence,
face embedding vectors for similarity matching, and provider-specific metadata.

Feature: Face Detection and Identification
Task: T002 - Create Face SQLAlchemy model with workspace isolation and embedding vector field
"""

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# =============================================================================
# ENUMS
# =============================================================================


class FaceProvider(str, Enum):
    """AI provider that performed face detection.

    Each provider has different capabilities and performance characteristics:
    - CLOUD_VISION: Google Cloud Vision API (primary, high accuracy)
    - GEMINI: Google Gemini Flash (fallback, faster processing)
    """

    CLOUD_VISION = "cloud_vision"
    GEMINI = "gemini"


# =============================================================================
# HELPER MODELS
# =============================================================================


class BoundingBox(BaseModel):
    """Bounding box coordinates as percentages of image dimensions.

    All values are percentages (0-100) relative to the image dimensions,
    making them resolution-independent.

    Example:
        {"x": 10.5, "y": 20.3, "width": 15.2, "height": 18.7}
        This represents a face starting at 10.5% from the left edge,
        20.3% from the top, spanning 15.2% of the width and 18.7% of the height.
    """

    x: float = Field(
        ...,
        ge=0,
        le=100,
        description="Left edge X coordinate as percentage (0-100)",
    )
    y: float = Field(
        ...,
        ge=0,
        le=100,
        description="Top edge Y coordinate as percentage (0-100)",
    )
    width: float = Field(
        ...,
        ge=0,
        le=100,
        description="Width as percentage of image width (0-100)",
    )
    height: float = Field(
        ...,
        ge=0,
        le=100,
        description="Height as percentage of image height (0-100)",
    )

    @property
    def center_x(self) -> float:
        """Calculate center X coordinate."""
        return self.x + (self.width / 2)

    @property
    def center_y(self) -> float:
        """Calculate center Y coordinate."""
        return self.y + (self.height / 2)

    @property
    def area(self) -> float:
        """Calculate area as percentage of image area."""
        return self.width * self.height


class ThumbnailUrls(BaseModel):
    """Cropped face thumbnail URLs at multiple sizes.

    Thumbnails are generated after face detection for efficient
    display in the UI without loading full images.
    """

    small: Optional[str] = Field(
        None,
        description="Small thumbnail URL (e.g., 64x64 for lists)",
    )
    medium: Optional[str] = Field(
        None,
        description="Medium thumbnail URL (e.g., 128x128 for cards)",
    )
    large: Optional[str] = Field(
        None,
        description="Large thumbnail URL (e.g., 256x256 for detail views)",
    )


# =============================================================================
# FACE MODEL (T002)
# =============================================================================


class Face(BaseModel):
    """Face Detection Domain Model.

    Represents a detected face in a photo with:
    - Bounding box coordinates (resolution-independent percentages)
    - Detection confidence score from AI provider
    - 512-dimensional embedding vector for similarity matching
    - Optional face group assignment for clustering
    - Provider-specific metadata (landmarks, emotions, angles, etc.)

    Workspace Isolation:
        All face data is strictly isolated by workspace_id.
        Cross-workspace queries are not permitted.
    """

    model_config = ConfigDict(from_attributes=True)

    # Primary identifiers
    id: UUID = Field(..., description="Unique face identifier")
    workspace_id: UUID = Field(
        ...,
        description="Workspace ID for multi-tenant isolation",
    )

    # Relationships
    photo_id: UUID = Field(
        ...,
        description="Reference to source photo (assets.asset_id)",
    )
    face_group_id: Optional[UUID] = Field(
        None,
        description="Optional face group/cluster assignment (NULL = ungrouped)",
    )

    # Face detection data
    bounding_box: BoundingBox = Field(
        ...,
        description="Face location as percentages of image dimensions",
    )
    confidence: Decimal = Field(
        ...,
        ge=Decimal("0"),
        le=Decimal("1"),
        description="Detection confidence score from AI provider (0.0-1.0)",
    )

    # Embedding vector for similarity matching
    embedding: Optional[list[float]] = Field(
        None,
        description="512-dimensional face embedding vector for similarity search",
    )

    # Provider information
    provider: FaceProvider = Field(
        ...,
        description="AI provider that detected this face",
    )
    detection_metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Provider-specific metadata (landmarks, emotions, angles, etc.)",
    )

    # Thumbnail URLs for UI display
    thumbnail_urls: ThumbnailUrls = Field(
        default_factory=ThumbnailUrls,
        description="Cropped face thumbnail URLs at multiple sizes",
    )

    # Timestamps
    created_at: datetime = Field(
        ...,
        description="When the face was detected",
    )
    updated_at: datetime = Field(
        ...,
        description="Last update timestamp",
    )

    @property
    def has_embedding(self) -> bool:
        """Check if face has a valid embedding vector."""
        return self.embedding is not None and len(self.embedding) == 512

    @property
    def is_grouped(self) -> bool:
        """Check if face has been assigned to a group."""
        return self.face_group_id is not None

    @property
    def is_high_confidence(self) -> bool:
        """Check if face detection is high confidence (>0.8)."""
        return self.confidence >= Decimal("0.8")


# =============================================================================
# CREATE MODEL
# =============================================================================


class FaceCreate(BaseModel):
    """Schema for creating a new face detection record.

    Used when storing face detection results from AI providers.
    The embedding may be NULL initially if detection and embedding
    generation are separate pipeline steps.
    """

    # Required fields
    workspace_id: UUID = Field(
        ...,
        description="Workspace ID for multi-tenant isolation",
    )
    photo_id: UUID = Field(
        ...,
        description="Reference to source photo (assets.asset_id)",
    )
    bounding_box: BoundingBox = Field(
        ...,
        description="Face location as percentages of image dimensions",
    )
    confidence: Decimal = Field(
        ...,
        ge=Decimal("0"),
        le=Decimal("1"),
        description="Detection confidence score (0.0-1.0)",
    )
    provider: FaceProvider = Field(
        ...,
        description="AI provider that detected this face",
    )

    # Optional fields
    face_group_id: Optional[UUID] = Field(
        None,
        description="Optional face group assignment",
    )
    embedding: Optional[list[float]] = Field(
        None,
        description="512-dimensional face embedding vector",
    )
    detection_metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Provider-specific metadata",
    )
    thumbnail_urls: ThumbnailUrls = Field(
        default_factory=ThumbnailUrls,
        description="Thumbnail URLs (may be generated asynchronously)",
    )


# =============================================================================
# UPDATE MODEL
# =============================================================================


class FaceUpdate(BaseModel):
    """Schema for updating an existing face detection record.

    All fields are optional. Common update scenarios:
    - Assigning/reassigning to a face group
    - Adding embedding after initial detection
    - Updating thumbnail URLs after processing
    - Adding detection metadata
    """

    # Relationship updates
    face_group_id: Optional[UUID] = Field(
        None,
        description="Update face group assignment (use explicit NULL to ungroup)",
    )

    # Embedding update (e.g., after initial detection)
    embedding: Optional[list[float]] = Field(
        None,
        description="Update 512-dimensional embedding vector",
    )

    # Metadata updates
    detection_metadata: Optional[dict[str, Any]] = Field(
        None,
        description="Update provider-specific metadata",
    )
    thumbnail_urls: Optional[ThumbnailUrls] = Field(
        None,
        description="Update thumbnail URLs",
    )


# =============================================================================
# SUMMARY MODEL
# =============================================================================


class FaceSummary(BaseModel):
    """Lightweight face summary for list responses.

    Excludes large fields like embedding and detection_metadata
    for efficient API responses when listing faces.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    workspace_id: UUID
    photo_id: UUID
    face_group_id: Optional[UUID] = None

    bounding_box: BoundingBox
    confidence: Decimal
    provider: FaceProvider
    thumbnail_urls: ThumbnailUrls = Field(default_factory=ThumbnailUrls)

    # Computed flags for quick filtering
    has_embedding: bool = Field(
        default=False,
        description="Whether face has embedding vector",
    )

    created_at: datetime
    updated_at: datetime


# =============================================================================
# ADDITIONAL HELPER MODELS
# =============================================================================


class FaceWithPhoto(BaseModel):
    """Face with associated photo information for detailed views."""

    model_config = ConfigDict(from_attributes=True)

    face: Face
    photo_url: Optional[str] = None
    photo_filename: Optional[str] = None


class FaceBatchCreate(BaseModel):
    """Schema for creating multiple faces in a single request.

    Used when face detection returns multiple faces from a single photo.
    """

    workspace_id: UUID = Field(
        ...,
        description="Workspace ID (same for all faces)",
    )
    photo_id: UUID = Field(
        ...,
        description="Source photo (same for all faces)",
    )
    provider: FaceProvider = Field(
        ...,
        description="AI provider (same for all faces)",
    )
    faces: list[FaceCreate] = Field(
        ...,
        min_length=1,
        description="List of face detections to create",
    )


class FaceSimilarityResult(BaseModel):
    """Result from a face similarity search using embedding vectors."""

    face: FaceSummary
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
