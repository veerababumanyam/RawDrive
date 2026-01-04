"""Pydantic schemas for Enhanced Smart Curate API.

Feature: 023-enhanced-smart-curate

This module defines request/response schemas for:
- Curation sessions (create, update, list, detail)
- Quality analysis (start, progress, results)
- Similarity grouping (start, results, best-shot override)
- Curation presets (list, create, update, delete)
- Selections (list, apply, modify)
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ---------------------------------------------------------------------------
# Enum Types
# ---------------------------------------------------------------------------


class CurationStatus(str, Enum):
    """Curation session status."""

    PENDING = "pending"
    ANALYZING = "analyzing"
    GROUPING = "grouping"
    CURATING = "curating"
    COMPLETED = "completed"
    FAILED = "failed"


class BlurSeverity(str, Enum):
    """Blur severity level."""

    NONE = "none"
    SLIGHT = "slight"
    MODERATE = "moderate"
    SEVERE = "severe"


class NoiseLevel(str, Enum):
    """Image noise level."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class SelectionType(str, Enum):
    """Selection type for curation results."""

    SELECTED = "selected"
    SAFETY_SET = "safety_set"
    REJECTED = "rejected"


# ---------------------------------------------------------------------------
# Curation Preset Schemas
# ---------------------------------------------------------------------------


class CurationPresetBase(BaseModel):
    """Base schema for curation presets."""

    name: str = Field(..., min_length=1, max_length=100, description="Preset name")
    description: Optional[str] = Field(None, max_length=500, description="Preset description")
    target_count_ratio: Optional[Decimal] = Field(
        None,
        ge=0,
        le=1,
        description="Target count as ratio of gallery size (0.0-1.0)",
    )
    target_count_fixed: Optional[int] = Field(
        None,
        gt=0,
        description="Fixed target count",
    )
    quality_threshold: Decimal = Field(
        default=Decimal("50.00"),
        ge=0,
        le=100,
        description="Minimum quality score (0-100)",
    )
    similarity_threshold: Decimal = Field(
        default=Decimal("0.85"),
        ge=0,
        le=1,
        description="Similarity threshold for grouping (0-1)",
    )
    prioritize_expressions: bool = Field(default=True, description="Prioritize facial expressions")
    prioritize_composition: bool = Field(default=True, description="Prioritize composition quality")
    enforce_story_coverage: bool = Field(default=True, description="Enforce scene/moment coverage")
    enforce_person_coverage: bool = Field(default=False, description="Balance per-person coverage")

    @field_validator("target_count_ratio", "target_count_fixed", mode="after")
    @classmethod
    def validate_target_exclusivity(cls, v: Any, info: Any) -> Any:
        """Ensure only one of ratio or fixed is set."""
        return v


class CurationPresetCreate(CurationPresetBase):
    """Request schema to create a curation preset."""

    pass


class CurationPresetUpdate(BaseModel):
    """Request schema to update a curation preset."""

    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    target_count_ratio: Optional[Decimal] = Field(None, ge=0, le=1)
    target_count_fixed: Optional[int] = Field(None, gt=0)
    quality_threshold: Optional[Decimal] = Field(None, ge=0, le=100)
    similarity_threshold: Optional[Decimal] = Field(None, ge=0, le=1)
    prioritize_expressions: Optional[bool] = None
    prioritize_composition: Optional[bool] = None
    enforce_story_coverage: Optional[bool] = None
    enforce_person_coverage: Optional[bool] = None


class CurationPresetResponse(CurationPresetBase):
    """Response schema for a curation preset."""

    model_config = ConfigDict(from_attributes=True)

    preset_id: UUID = Field(..., description="Preset ID")
    workspace_id: Optional[UUID] = Field(None, description="Workspace ID (null for system presets)")
    is_system: bool = Field(..., description="Whether this is a system preset")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")


class CurationPresetListResponse(BaseModel):
    """Response schema for listing presets."""

    presets: list[CurationPresetResponse] = Field(..., description="List of presets")
    total: int = Field(..., description="Total count")


# ---------------------------------------------------------------------------
# Curation Session Schemas
# ---------------------------------------------------------------------------


class CurationSessionCreate(BaseModel):
    """Request schema to create a curation session."""

    name: Optional[str] = Field(None, max_length=200, description="Session name")
    preset_id: Optional[UUID] = Field(None, description="Preset to use")
    target_count: Optional[int] = Field(None, gt=0, description="Target number of photos")
    quality_threshold: Decimal = Field(
        default=Decimal("0.00"),
        ge=0,
        le=100,
        description="Minimum quality score",
    )
    similarity_threshold: Decimal = Field(
        default=Decimal("0.85"),
        ge=0,
        le=1,
        description="Similarity threshold for grouping",
    )
    include_expression_analysis: bool = Field(default=True, description="Enable expression analysis")
    include_scene_detection: bool = Field(default=True, description="Enable scene detection")
    include_diversity: bool = Field(default=True, description="Enforce diversity in selection")
    auto_start: bool = Field(default=True, description="Start analysis immediately")


class CurationSessionUpdate(BaseModel):
    """Request schema to update a curation session."""

    name: Optional[str] = Field(None, max_length=200)
    target_count: Optional[int] = Field(None, gt=0)
    quality_threshold: Optional[Decimal] = Field(None, ge=0, le=100)
    similarity_threshold: Optional[Decimal] = Field(None, ge=0, le=1)


class CurationSessionProgress(BaseModel):
    """Progress information for a curation session."""

    percent: int = Field(..., ge=0, le=100, description="Progress percentage")
    stage: Optional[str] = Field(None, description="Current processing stage")
    total_photos: Optional[int] = Field(None, description="Total photos in gallery")
    analyzed_count: int = Field(default=0, description="Photos analyzed")
    groups_count: Optional[int] = Field(None, description="Similarity groups formed")
    selected_count: Optional[int] = Field(None, description="Photos selected")


class CurationSessionResponse(BaseModel):
    """Response schema for a curation session."""

    model_config = ConfigDict(from_attributes=True)

    session_id: UUID = Field(..., description="Session ID")
    workspace_id: UUID = Field(..., description="Workspace ID")
    gallery_id: UUID = Field(..., description="Gallery ID")
    user_id: UUID = Field(..., description="Creator user ID")
    preset_id: Optional[UUID] = Field(None, description="Preset used")
    name: Optional[str] = Field(None, description="Session name")
    status: CurationStatus = Field(..., description="Session status")
    target_count: Optional[int] = Field(None, description="Target photo count")
    quality_threshold: Decimal = Field(..., description="Quality threshold")
    similarity_threshold: Decimal = Field(..., description="Similarity threshold")
    include_expression_analysis: bool = Field(..., description="Expression analysis enabled")
    include_scene_detection: bool = Field(..., description="Scene detection enabled")
    include_diversity: bool = Field(..., description="Diversity enforcement enabled")
    progress: CurationSessionProgress = Field(..., description="Progress information")
    error_message: Optional[str] = Field(None, description="Error message if failed")
    started_at: Optional[datetime] = Field(None, description="Processing start time")
    completed_at: Optional[datetime] = Field(None, description="Processing completion time")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")


class CurationSessionListResponse(BaseModel):
    """Response schema for listing sessions."""

    sessions: list[CurationSessionResponse] = Field(..., description="List of sessions")
    total: int = Field(..., description="Total count")


class CurationSessionStartRequest(BaseModel):
    """Request to start or resume a curation session."""

    resume_from_step: Optional[str] = Field(None, description="Step to resume from")


# ---------------------------------------------------------------------------
# Quality Analysis Schemas
# ---------------------------------------------------------------------------


class QualityAnalysisStartRequest(BaseModel):
    """Request to start quality analysis."""

    session_id: Optional[UUID] = Field(None, description="Existing session to use")
    asset_ids: Optional[list[UUID]] = Field(None, description="Specific assets to analyze")


class CropSuggestion(BaseModel):
    """Suggested crop coordinates."""

    x: int = Field(..., description="X coordinate")
    y: int = Field(..., description="Y coordinate")
    width: int = Field(..., description="Crop width")
    height: int = Field(..., description="Crop height")
    reason: Optional[str] = Field(None, description="Reason for suggestion")


class PhotoQualityResult(BaseModel):
    """Quality analysis result for a single photo."""

    model_config = ConfigDict(from_attributes=True)

    asset_id: UUID = Field(..., description="Asset ID")
    overall_score: Decimal = Field(..., ge=0, le=100, description="Overall quality score")
    sharpness_score: Decimal = Field(..., ge=0, le=100, description="Sharpness score")
    exposure_score: Decimal = Field(..., ge=0, le=100, description="Exposure score")
    composition_score: Decimal = Field(..., ge=0, le=100, description="Composition score")
    blur_detected: bool = Field(..., description="Blur detected")
    blur_severity: Optional[BlurSeverity] = Field(None, description="Blur severity")
    blur_type: Optional[str] = Field(None, description="Type of blur")
    highlights_clipped: bool = Field(..., description="Highlights clipped")
    shadows_blocked: bool = Field(..., description="Shadows blocked")
    noise_level: NoiseLevel = Field(..., description="Noise level")
    horizon_tilt_degrees: Optional[Decimal] = Field(None, description="Horizon tilt in degrees")
    crop_suggestion: Optional[CropSuggestion] = Field(None, description="Suggested crop")
    analyzed_at: datetime = Field(..., description="Analysis timestamp")


class QualityAnalysisResponse(BaseModel):
    """Response for quality analysis results."""

    gallery_id: UUID = Field(..., description="Gallery ID")
    results: list[PhotoQualityResult] = Field(..., description="Analysis results")
    summary: "QualityAnalysisSummary" = Field(..., description="Summary statistics")


class QualityAnalysisSummary(BaseModel):
    """Summary of quality analysis."""

    total_analyzed: int = Field(..., description="Total photos analyzed")
    average_score: Decimal = Field(..., description="Average overall score")
    blur_count: int = Field(..., description="Photos with blur detected")
    excellent_count: int = Field(..., description="Photos scoring 80+")
    good_count: int = Field(..., description="Photos scoring 60-79")
    fair_count: int = Field(..., description="Photos scoring 40-59")
    poor_count: int = Field(..., description="Photos scoring below 40")


class QualityAnalysisProgressResponse(BaseModel):
    """Progress response for quality analysis."""

    session_id: UUID = Field(..., description="Session ID")
    status: CurationStatus = Field(..., description="Analysis status")
    progress_percent: int = Field(..., ge=0, le=100, description="Progress percentage")
    photos_analyzed: int = Field(..., description="Photos analyzed so far")
    photos_total: int = Field(..., description="Total photos to analyze")
    estimated_remaining_seconds: Optional[int] = Field(None, description="Estimated time remaining")


# ---------------------------------------------------------------------------
# Similarity Grouping Schemas
# ---------------------------------------------------------------------------


class SimilarityGroupMember(BaseModel):
    """Member of a similarity group."""

    model_config = ConfigDict(from_attributes=True)

    asset_id: UUID = Field(..., description="Asset ID")
    similarity_score: Decimal = Field(..., ge=0, le=1, description="Similarity to group centroid")
    is_best: bool = Field(..., description="AI-recommended best shot")
    is_user_selected: bool = Field(..., description="User selected as keeper")
    quality_rank: Optional[int] = Field(None, description="Rank by quality within group")
    thumbnail_url: Optional[str] = Field(None, description="Thumbnail URL for UI")


class SimilarityGroupResponse(BaseModel):
    """Response for a similarity group."""

    model_config = ConfigDict(from_attributes=True)

    group_id: UUID = Field(..., description="Group ID")
    session_id: UUID = Field(..., description="Session ID")
    best_asset_id: Optional[UUID] = Field(None, description="AI-recommended best asset")
    user_override_asset_id: Optional[UUID] = Field(None, description="User-selected best asset")
    member_count: int = Field(..., description="Number of photos in group")
    avg_similarity: Decimal = Field(..., ge=0, le=1, description="Average similarity")
    best_reason: Optional[str] = Field(None, description="Reason for best selection")
    members: list[SimilarityGroupMember] = Field(..., description="Group members")
    created_at: datetime = Field(..., description="Creation timestamp")


class SimilarityGroupListResponse(BaseModel):
    """Response for listing similarity groups."""

    groups: list[SimilarityGroupResponse] = Field(..., description="List of groups")
    total: int = Field(..., description="Total count")
    singleton_count: int = Field(..., description="Photos not in any group")


class SetBestShotRequest(BaseModel):
    """Request to set the best shot for a group."""

    asset_id: UUID = Field(..., description="Asset to set as best shot")
    reason: Optional[str] = Field(None, max_length=500, description="Reason for selection")


# ---------------------------------------------------------------------------
# Curation Selection Schemas
# ---------------------------------------------------------------------------


class CurationSelectionItem(BaseModel):
    """A single selection item."""

    model_config = ConfigDict(from_attributes=True)

    asset_id: UUID = Field(..., description="Asset ID")
    selection_type: SelectionType = Field(..., description="Selection type")
    selection_reason: Optional[str] = Field(None, description="Reason for selection")
    quality_rank: Optional[int] = Field(None, description="Rank by quality")
    diversity_contribution: Optional[Decimal] = Field(
        None,
        ge=0,
        le=1,
        description="Diversity contribution score",
    )
    is_user_override: bool = Field(..., description="User manually selected/rejected")


class CurationSelectionsResponse(BaseModel):
    """Response for curation selections."""

    session_id: UUID = Field(..., description="Session ID")
    selected: list[CurationSelectionItem] = Field(..., description="Selected photos")
    safety_set: list[CurationSelectionItem] = Field(..., description="Safety set photos")
    rejected_count: int = Field(..., description="Count of rejected photos")
    total_count: int = Field(..., description="Total photos in gallery")


class ModifySelectionRequest(BaseModel):
    """Request to modify a selection."""

    asset_id: UUID = Field(..., description="Asset to modify")
    selection_type: SelectionType = Field(..., description="New selection type")
    reason: Optional[str] = Field(None, max_length=500, description="Reason for change")


class BulkModifySelectionsRequest(BaseModel):
    """Request to modify multiple selections."""

    modifications: list[ModifySelectionRequest] = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="List of modifications",
    )


class ApplySelectionsRequest(BaseModel):
    """Request to apply selections (create sub-gallery or export)."""

    action: Literal["create_sub_gallery", "export", "add_to_favorites"] = Field(
        ...,
        description="Action to perform with selections",
    )
    name: Optional[str] = Field(None, max_length=200, description="Name for sub-gallery")
    include_safety_set: bool = Field(default=False, description="Include safety set photos")


class ApplySelectionsResponse(BaseModel):
    """Response for applying selections."""

    success: bool = Field(..., description="Whether operation succeeded")
    message: str = Field(..., description="Result message")
    sub_gallery_id: Optional[UUID] = Field(None, description="Created sub-gallery ID")
    export_url: Optional[str] = Field(None, description="Export download URL")
    photos_count: int = Field(..., description="Number of photos affected")


# ---------------------------------------------------------------------------
# User Preferences Schemas
# ---------------------------------------------------------------------------


class UserCurationPreferences(BaseModel):
    """User's learned curation preferences."""

    model_config = ConfigDict(from_attributes=True)

    quality_weight: Decimal = Field(default=Decimal("0.4"), ge=0, le=1)
    composition_weight: Decimal = Field(default=Decimal("0.3"), ge=0, le=1)
    expression_weight: Decimal = Field(default=Decimal("0.2"), ge=0, le=1)
    diversity_weight: Decimal = Field(default=Decimal("0.1"), ge=0, le=1)
    preferred_focal_lengths: list[str] = Field(default_factory=list)
    preferred_orientations: list[str] = Field(default_factory=list)
    avoid_patterns: list[str] = Field(default_factory=list)


class UserCurationPreferencesResponse(BaseModel):
    """Response for user curation preferences."""

    model_config = ConfigDict(from_attributes=True)

    user_id: UUID = Field(..., description="User ID")
    preference_data: UserCurationPreferences = Field(..., description="Preference weights")
    sessions_analyzed: int = Field(..., description="Sessions used for learning")
    last_learned_at: Optional[datetime] = Field(None, description="Last learning update")
    is_active: bool = Field(..., description="Preference learning enabled")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")


class UpdateUserPreferencesRequest(BaseModel):
    """Request to update user preferences."""

    is_active: Optional[bool] = Field(None, description="Enable/disable learning")
    reset_preferences: bool = Field(default=False, description="Reset to defaults")
