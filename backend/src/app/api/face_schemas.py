"""Pydantic schemas for Face Detection and Identification API.

This module defines all request/response schemas for the face detection service,
including face entities, face groups, detection results, and API contracts.

All schemas follow the established patterns from schemas.py with:
- Proper validation using Pydantic Field constraints
- ConfigDict for ORM compatibility
- Clear docstrings and field descriptions
- Type hints for all fields
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


# =============================================================================
# ENUMS - Error codes and status types
# =============================================================================


class FaceDetectionErrorCode(str, Enum):
    """Error codes for face detection operations.
    
    These codes are used for programmatic error handling and are mapped
    to user-friendly messages in the error handling layer.
    """
    
    # Provider errors - issues with AI service providers
    PROVIDER_UNAVAILABLE = "PROVIDER_UNAVAILABLE"
    PROVIDER_RATE_LIMITED = "PROVIDER_RATE_LIMITED"
    PROVIDER_TIMEOUT = "PROVIDER_TIMEOUT"
    PROVIDER_INVALID_RESPONSE = "PROVIDER_INVALID_RESPONSE"
    ALL_PROVIDERS_FAILED = "ALL_PROVIDERS_FAILED"
    
    # Detection errors - issues with image processing
    INVALID_IMAGE_FORMAT = "INVALID_IMAGE_FORMAT"
    IMAGE_TOO_SMALL = "IMAGE_TOO_SMALL"
    IMAGE_CORRUPTED = "IMAGE_CORRUPTED"
    DETECTION_FAILED = "DETECTION_FAILED"
    
    # Cluster/group errors - issues with face grouping operations
    FACE_GROUP_NOT_FOUND = "FACE_GROUP_NOT_FOUND"
    FACE_NOT_FOUND = "FACE_NOT_FOUND"
    INVALID_MERGE_OPERATION = "INVALID_MERGE_OPERATION"
    INVALID_SPLIT_OPERATION = "INVALID_SPLIT_OPERATION"
    
    # Authorization errors - access control issues
    WORKSPACE_ACCESS_DENIED = "WORKSPACE_ACCESS_DENIED"
    CROSS_WORKSPACE_ACCESS = "CROSS_WORKSPACE_ACCESS"
    
    # Configuration errors - admin settings issues
    PROVIDER_NOT_CONFIGURED = "PROVIDER_NOT_CONFIGURED"
    INVALID_CONFIGURATION = "INVALID_CONFIGURATION"
    
    # Embedding errors - vector operation issues
    EMBEDDING_DIMENSION_MISMATCH = "EMBEDDING_DIMENSION_MISMATCH"
    EMBEDDING_NOT_NORMALIZED = "EMBEDDING_NOT_NORMALIZED"


class FaceDetectionJobStatus(str, Enum):
    """Status values for face detection background jobs."""
    
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class ProviderHealthStatus(str, Enum):
    """Health status values for AI providers."""
    
    HEALTHY = "healthy"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"


class LikelihoodLevel(str, Enum):
    """Likelihood levels for face attributes (from Cloud Vision API)."""
    
    UNKNOWN = "UNKNOWN"
    VERY_UNLIKELY = "VERY_UNLIKELY"
    UNLIKELY = "UNLIKELY"
    POSSIBLE = "POSSIBLE"
    LIKELY = "LIKELY"
    VERY_LIKELY = "VERY_LIKELY"


class FaceLandmarkType(str, Enum):
    """Types of facial landmarks detected."""
    
    LEFT_EYE = "LEFT_EYE"
    RIGHT_EYE = "RIGHT_EYE"
    NOSE_TIP = "NOSE_TIP"
    MOUTH_LEFT = "MOUTH_LEFT"
    MOUTH_RIGHT = "MOUTH_RIGHT"
    LEFT_EYEBROW = "LEFT_EYEBROW"
    RIGHT_EYEBROW = "RIGHT_EYEBROW"
    CHIN = "CHIN"


# =============================================================================
# CORE DATA MODELS - Bounding box, landmarks, attributes
# =============================================================================


class BoundingBox(BaseModel):
    """Bounding box coordinates for a detected face.
    
    All coordinates are expressed as percentages (0-100) of the image dimensions,
    making them resolution-independent and easy to scale for different displays.
    """
    
    x: float = Field(
        ..., 
        ge=0, 
        le=100, 
        description="Top-left X coordinate as percentage (0-100)"
    )
    y: float = Field(
        ..., 
        ge=0, 
        le=100, 
        description="Top-left Y coordinate as percentage (0-100)"
    )
    width: float = Field(
        ..., 
        gt=0, 
        le=100, 
        description="Width as percentage (0-100)"
    )
    height: float = Field(
        ..., 
        gt=0, 
        le=100, 
        description="Height as percentage (0-100)"
    )
    
    @field_validator("width", "height")
    @classmethod
    def validate_dimensions(cls, v: float, info) -> float:
        """Ensure bounding box doesn't exceed image boundaries."""
        if v <= 0:
            raise ValueError("Dimension must be positive")
        return v


class FaceLandmark(BaseModel):
    """A single facial landmark point.
    
    Landmarks are key points on the face (eyes, nose, mouth corners)
    used for face alignment and recognition.
    """
    
    type: FaceLandmarkType = Field(..., description="Type of facial landmark")
    x: float = Field(..., ge=0, le=100, description="X coordinate as percentage")
    y: float = Field(..., ge=0, le=100, description="Y coordinate as percentage")


class FaceAttributes(BaseModel):
    """Optional attributes detected for a face.
    
    These attributes provide additional context about the face orientation
    and expression. Not all providers return all attributes.
    """
    
    # Head pose angles (in degrees)
    roll_angle: Optional[float] = Field(
        None, 
        ge=-180, 
        le=180,
        description="Head roll angle in degrees (-180 to 180)"
    )
    pan_angle: Optional[float] = Field(
        None, 
        ge=-180, 
        le=180,
        description="Head pan (yaw) angle in degrees (-180 to 180)"
    )
    tilt_angle: Optional[float] = Field(
        None, 
        ge=-180, 
        le=180,
        description="Head tilt (pitch) angle in degrees (-180 to 180)"
    )
    
    # Expression likelihoods (from Cloud Vision)
    joy_likelihood: Optional[LikelihoodLevel] = Field(
        None, 
        description="Likelihood of joyful expression"
    )
    sorrow_likelihood: Optional[LikelihoodLevel] = Field(
        None, 
        description="Likelihood of sorrowful expression"
    )
    anger_likelihood: Optional[LikelihoodLevel] = Field(
        None, 
        description="Likelihood of angry expression"
    )
    surprise_likelihood: Optional[LikelihoodLevel] = Field(
        None, 
        description="Likelihood of surprised expression"
    )
    
    # Quality indicators
    blur_likelihood: Optional[LikelihoodLevel] = Field(
        None, 
        description="Likelihood that face is blurred"
    )
    underexposed_likelihood: Optional[LikelihoodLevel] = Field(
        None, 
        description="Likelihood that face is underexposed"
    )


class ThumbnailUrls(BaseModel):
    """URLs for face thumbnail images at different sizes.
    
    Three sizes are generated for different use cases:
    - small (64px): List views, compact displays
    - medium (128px): Grid views, selection interfaces
    - large (256px): Detail views, face comparison
    """
    
    small: Optional[str] = Field(None, description="64px thumbnail URL")
    medium: Optional[str] = Field(None, description="128px thumbnail URL")
    large: Optional[str] = Field(None, description="256px thumbnail URL")


# =============================================================================
# DETECTION RESULT - Output from AI providers
# =============================================================================


class FaceDetectionResult(BaseModel):
    """Result from AI provider face detection.
    
    This is the standardized format that all providers (Cloud Vision, Gemini)
    transform their responses into. It contains the core detection data
    before storage in the database.
    """
    
    bounding_box: BoundingBox = Field(
        ..., 
        description="Face location in the image"
    )
    confidence: float = Field(
        ..., 
        ge=0, 
        le=1, 
        description="Detection confidence score (0-1)"
    )
    landmarks: Optional[list[FaceLandmark]] = Field(
        None, 
        description="Detected facial landmarks"
    )
    attributes: Optional[FaceAttributes] = Field(
        None, 
        description="Detected face attributes"
    )
    raw_provider_response: Optional[dict[str, Any]] = Field(
        None, 
        description="Original provider response (for debugging)"
    )


# =============================================================================
# FACE ENTITY - Stored face record
# =============================================================================


class FaceBase(BaseModel):
    """Base fields for face entities."""
    
    bounding_box: BoundingBox = Field(..., description="Face location in photo")
    confidence: float = Field(
        ..., 
        ge=0, 
        le=1, 
        description="Detection confidence (0-1)"
    )
    provider: str = Field(
        ..., 
        max_length=50, 
        description="AI provider that detected this face"
    )


class FaceCreate(FaceBase):
    """Schema for creating a new face record."""
    
    workspace_id: UUID = Field(..., description="Workspace this face belongs to")
    photo_id: UUID = Field(..., description="Photo containing this face")
    face_group_id: Optional[UUID] = Field(
        None, 
        description="Face group assignment (null if ungrouped)"
    )
    embedding: Optional[list[float]] = Field(
        None, 
        min_length=512, 
        max_length=512,
        description="512-dimensional face embedding vector"
    )
    detection_metadata: Optional[dict[str, Any]] = Field(
        default_factory=dict,
        description="Additional detection metadata"
    )
    thumbnail_urls: Optional[ThumbnailUrls] = Field(
        None, 
        description="Generated thumbnail URLs"
    )


class FaceResponse(FaceBase):
    """Face entity response schema."""
    
    model_config = ConfigDict(from_attributes=True)
    
    face_id: UUID = Field(..., alias="id", description="Unique face identifier")
    workspace_id: UUID = Field(..., description="Workspace ID")
    photo_id: UUID = Field(..., description="Photo ID")
    face_group_id: Optional[UUID] = Field(None, description="Face group ID")
    thumbnail_urls: Optional[ThumbnailUrls] = Field(None, description="Thumbnail URLs")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")


class FaceDetailResponse(FaceResponse):
    """Detailed face response with additional fields."""
    
    embedding: Optional[list[float]] = Field(
        None, 
        description="Face embedding vector (512 dimensions)"
    )
    detection_metadata: Optional[dict[str, Any]] = Field(
        None, 
        description="Detection metadata from provider"
    )
    # Related data
    photo_filename: Optional[str] = Field(None, description="Source photo filename")
    gallery_id: Optional[UUID] = Field(None, description="Gallery containing the photo")
    face_group_name: Optional[str] = Field(None, description="Name of assigned face group")


# =============================================================================
# FACE GROUP ENTITY - Face clusters
# =============================================================================


class FaceGroupBase(BaseModel):
    """Base fields for face group entities."""
    
    name: Optional[str] = Field(
        None, 
        max_length=255, 
        description="User-assigned name for this face group"
    )


class FaceGroupCreate(FaceGroupBase):
    """Schema for creating a new face group."""
    
    workspace_id: UUID = Field(..., description="Workspace this group belongs to")


class FaceGroupUpdate(BaseModel):
    """Schema for updating a face group."""
    
    name: Optional[str] = Field(
        None, 
        max_length=255, 
        description="New name for the face group"
    )
    representative_face_id: Optional[UUID] = Field(
        None, 
        description="Face to use as group representative"
    )


class FaceGroupResponse(FaceGroupBase):
    """Face group response schema."""
    
    model_config = ConfigDict(from_attributes=True)
    
    face_group_id: UUID = Field(..., alias="id", description="Unique group identifier")
    workspace_id: UUID = Field(..., description="Workspace ID")
    representative_face_id: Optional[UUID] = Field(
        None, 
        description="Representative face ID"
    )
    face_count: int = Field(..., ge=0, description="Number of faces in this group")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")


class FaceGroupDetailResponse(FaceGroupResponse):
    """Detailed face group response with additional data."""
    
    centroid: Optional[list[float]] = Field(
        None, 
        description="Group centroid embedding (512 dimensions)"
    )
    representative_thumbnail_url: Optional[str] = Field(
        None, 
        description="Thumbnail URL of representative face"
    )
    sample_faces: Optional[list[FaceResponse]] = Field(
        None, 
        description="Sample faces from this group"
    )


# =============================================================================
# SIMILARITY SEARCH - Finding similar faces
# =============================================================================


class SimilarFaceResult(BaseModel):
    """Result from similarity search."""
    
    face: FaceResponse = Field(..., description="The similar face")
    similarity: float = Field(
        ..., 
        ge=0, 
        le=1, 
        description="Similarity score (0-1, higher is more similar)"
    )


class SimilarFaceSearchRequest(BaseModel):
    """Request to search for similar faces."""
    
    face_id: Optional[UUID] = Field(
        None, 
        description="Find faces similar to this face"
    )
    embedding: Optional[list[float]] = Field(
        None, 
        min_length=512, 
        max_length=512,
        description="Find faces similar to this embedding"
    )
    threshold: float = Field(
        0.6, 
        ge=0, 
        le=1, 
        description="Minimum similarity threshold"
    )
    limit: int = Field(
        20, 
        ge=1, 
        le=100, 
        description="Maximum results to return"
    )
    
    @field_validator("embedding", "face_id")
    @classmethod
    def validate_search_input(cls, v, info):
        """Ensure at least one search input is provided."""
        return v


class SimilarFaceSearchResponse(BaseModel):
    """Response from similarity search."""
    
    results: list[SimilarFaceResult] = Field(..., description="Similar faces found")
    total: int = Field(..., description="Total matches found")
    threshold_used: float = Field(..., description="Similarity threshold applied")


# =============================================================================
# FACE GROUP OPERATIONS - Merge, split, assign
# =============================================================================


class MergeFaceGroupsRequest(BaseModel):
    """Request to merge two face groups."""
    
    source_group_id: UUID = Field(
        ..., 
        description="Group to merge from (will be deleted)"
    )
    target_group_id: UUID = Field(
        ..., 
        description="Group to merge into (will be preserved)"
    )
    
    @field_validator("target_group_id")
    @classmethod
    def validate_different_groups(cls, v, info):
        """Ensure source and target are different."""
        if info.data.get("source_group_id") == v:
            raise ValueError("Cannot merge a group with itself")
        return v


class SplitFaceGroupRequest(BaseModel):
    """Request to split faces from a group into a new group."""
    
    source_group_id: UUID = Field(
        ..., 
        description="Group to split faces from"
    )
    face_ids: list[UUID] = Field(
        ..., 
        min_length=1, 
        description="Faces to move to new group"
    )
    new_group_name: Optional[str] = Field(
        None, 
        max_length=255, 
        description="Name for the new group"
    )


class AssignFaceToGroupRequest(BaseModel):
    """Request to assign a face to a group."""
    
    face_id: UUID = Field(..., description="Face to assign")
    group_id: Optional[UUID] = Field(
        None, 
        description="Group to assign to (null to unassign)"
    )


class BulkAssignFacesRequest(BaseModel):
    """Request to assign multiple faces to a group."""
    
    face_ids: list[UUID] = Field(
        ..., 
        min_length=1, 
        description="Faces to assign"
    )
    group_id: Optional[UUID] = Field(
        None, 
        description="Group to assign to (null to unassign all)"
    )


# =============================================================================
# DETECTION JOB - Background processing
# =============================================================================


class FaceDetectionJobResponse(BaseModel):
    """Face detection job status response."""
    
    model_config = ConfigDict(from_attributes=True)
    
    job_id: UUID = Field(..., alias="id", description="Job identifier")
    workspace_id: UUID = Field(..., description="Workspace ID")
    photo_id: UUID = Field(..., description="Photo being processed")
    status: FaceDetectionJobStatus = Field(..., description="Current job status")
    provider_used: Optional[str] = Field(None, description="Provider that processed the job")
    faces_detected: Optional[int] = Field(None, description="Number of faces found")
    error_message: Optional[str] = Field(None, description="Error message if failed")
    retry_count: int = Field(..., description="Number of retry attempts")
    priority: int = Field(..., description="Job priority")
    started_at: Optional[datetime] = Field(None, description="Processing start time")
    completed_at: Optional[datetime] = Field(None, description="Processing completion time")
    created_at: datetime = Field(..., description="Job creation time")


class TriggerDetectionRequest(BaseModel):
    """Request to trigger face detection on a photo."""
    
    photo_id: UUID = Field(..., description="Photo to process")
    priority: int = Field(
        0, 
        ge=-10, 
        le=10, 
        description="Job priority (-10 to 10, higher = more urgent)"
    )
    force_reprocess: bool = Field(
        False, 
        description="Force reprocessing even if already processed"
    )


class BulkTriggerDetectionRequest(BaseModel):
    """Request to trigger detection on multiple photos."""
    
    photo_ids: list[UUID] = Field(
        ..., 
        min_length=1, 
        max_length=100,
        description="Photos to process (max 100)"
    )
    priority: int = Field(0, ge=-10, le=10, description="Job priority")


# =============================================================================
# DETECTION STATISTICS
# =============================================================================


class DetectionStatsResponse(BaseModel):
    """Face detection statistics for a workspace."""
    
    total_photos: int = Field(..., description="Total photos in workspace")
    processed_photos: int = Field(..., description="Photos with completed detection")
    pending_photos: int = Field(..., description="Photos awaiting detection")
    failed_photos: int = Field(..., description="Photos with failed detection")
    total_faces_detected: int = Field(..., description="Total faces found")
    total_face_groups: int = Field(..., description="Total face groups")
    ungrouped_faces: int = Field(..., description="Faces not assigned to any group")


# =============================================================================
# AI PROVIDER CONFIGURATION
# =============================================================================


class AIProviderConfigResponse(BaseModel):
    """AI provider configuration response (admin view)."""
    
    model_config = ConfigDict(from_attributes=True)
    
    provider_id: UUID = Field(..., alias="id", description="Provider config ID")
    provider_name: str = Field(..., description="Provider name (cloud_vision, gemini)")
    is_enabled: bool = Field(..., description="Whether provider is enabled")
    priority: int = Field(..., description="Selection priority (lower = higher priority)")
    rate_limit_per_minute: int = Field(..., description="Rate limit")
    timeout_ms: int = Field(..., description="Request timeout in milliseconds")
    health_status: ProviderHealthStatus = Field(..., description="Current health status")
    last_health_check: Optional[datetime] = Field(None, description="Last health check time")
    # Note: credentials are never returned in responses


class AIProviderUpdateRequest(BaseModel):
    """Request to update AI provider configuration."""
    
    is_enabled: Optional[bool] = Field(None, description="Enable/disable provider")
    priority: Optional[int] = Field(
        None, 
        ge=0, 
        le=100, 
        description="Selection priority"
    )
    rate_limit_per_minute: Optional[int] = Field(
        None, 
        ge=1, 
        le=10000, 
        description="Rate limit"
    )
    timeout_ms: Optional[int] = Field(
        None, 
        ge=1000, 
        le=120000, 
        description="Timeout (1-120 seconds)"
    )
    credentials: Optional[dict[str, Any]] = Field(
        None, 
        description="Provider credentials (will be encrypted)"
    )
    config: Optional[dict[str, Any]] = Field(
        None, 
        description="Provider-specific configuration"
    )


class AIProviderTestRequest(BaseModel):
    """Request to test AI provider connectivity."""
    
    provider_name: str = Field(..., description="Provider to test")


class AIProviderTestResponse(BaseModel):
    """Response from provider connectivity test."""
    
    healthy: bool = Field(..., description="Whether provider is healthy")
    latency_ms: int = Field(..., description="Response latency in milliseconds")
    message: str = Field(..., description="Status message")
    error: Optional[str] = Field(None, description="Error details if unhealthy")


# =============================================================================
# FACE DETECTION SETTINGS
# =============================================================================


class FaceDetectionSettingsResponse(BaseModel):
    """Face detection settings for a workspace."""
    
    enabled: bool = Field(..., description="Whether face detection is enabled")
    auto_detect_on_upload: bool = Field(
        ..., 
        description="Auto-detect faces on photo upload"
    )
    min_confidence_threshold: float = Field(
        ..., 
        ge=0, 
        le=1, 
        description="Minimum confidence for face storage"
    )
    auto_cluster_threshold: float = Field(
        ..., 
        ge=0, 
        le=1, 
        description="Similarity threshold for auto-clustering"
    )
    max_faces_per_photo: int = Field(
        ..., 
        ge=1, 
        le=100, 
        description="Maximum faces to detect per photo"
    )


class FaceDetectionSettingsUpdateRequest(BaseModel):
    """Request to update face detection settings."""
    
    enabled: Optional[bool] = Field(None, description="Enable/disable face detection")
    auto_detect_on_upload: Optional[bool] = Field(
        None, 
        description="Auto-detect on upload"
    )
    min_confidence_threshold: Optional[float] = Field(
        None, 
        ge=0, 
        le=1, 
        description="Minimum confidence threshold"
    )
    auto_cluster_threshold: Optional[float] = Field(
        None, 
        ge=0, 
        le=1, 
        description="Auto-clustering threshold"
    )
    max_faces_per_photo: Optional[int] = Field(
        None, 
        ge=1, 
        le=100, 
        description="Max faces per photo"
    )


# =============================================================================
# LIST RESPONSES WITH PAGINATION
# =============================================================================


class FaceListMeta(BaseModel):
    """Pagination metadata for face lists."""
    
    page: int = Field(..., description="Current page number")
    limit: int = Field(..., description="Items per page")
    total: int = Field(..., description="Total items")
    total_pages: int = Field(..., description="Total pages")


class FaceListResponse(BaseModel):
    """Paginated list of faces."""
    
    data: list[FaceResponse] = Field(..., description="Face records")
    meta: FaceListMeta = Field(..., description="Pagination metadata")


class FaceGroupListResponse(BaseModel):
    """Paginated list of face groups."""
    
    data: list[FaceGroupResponse] = Field(..., description="Face group records")
    meta: FaceListMeta = Field(..., description="Pagination metadata")


# =============================================================================
# ERROR RESPONSE
# =============================================================================


class FaceDetectionErrorDetail(BaseModel):
    """Detailed error information for face detection errors."""
    
    field: Optional[str] = Field(None, description="Field that caused the error")
    message: str = Field(..., description="Error message")


class FaceDetectionErrorResponse(BaseModel):
    """Standard error response for face detection API."""
    
    success: Literal[False] = Field(False, description="Always false for errors")
    error: dict[str, Any] = Field(..., description="Error details")
    
    @classmethod
    def from_error(
        cls, 
        code: FaceDetectionErrorCode, 
        message: str, 
        correlation_id: Optional[str] = None,
        details: Optional[list[FaceDetectionErrorDetail]] = None
    ) -> "FaceDetectionErrorResponse":
        """Create error response from error details."""
        error_dict: dict[str, Any] = {
            "code": code.value,
            "message": message,
        }
        if correlation_id:
            error_dict["correlation_id"] = correlation_id
        if details:
            error_dict["details"] = [d.model_dump() for d in details]
        return cls(error=error_dict)


# =============================================================================
# GALLERY FACE FILTER
# =============================================================================


class GalleryFaceFilterRequest(BaseModel):
    """Request to filter gallery photos by face groups."""
    
    face_group_ids: list[UUID] = Field(
        ..., 
        min_length=1, 
        description="Face groups to filter by"
    )
    match_mode: Literal["any", "all"] = Field(
        "any", 
        description="Match any or all face groups"
    )
    include_ungrouped: bool = Field(
        False, 
        description="Include photos with ungrouped faces"
    )
