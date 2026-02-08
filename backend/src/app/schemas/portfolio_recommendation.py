"""Pydantic schemas for Portfolio Recommendation Engine.

Feature: AI Portfolio Recommendation Engine
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class RecommendationType(str, Enum):
    """Types of portfolio recommendations."""

    PORTFOLIO_SELECTION = "portfolio_selection"
    HERO_SHOTS = "hero_shots"
    SIMILAR_STYLE = "similar_style"
    SEASONAL_PICKS = "seasonal_picks"
    TRENDING_SHOTS = "trending_shots"
    PERSONALIZED = "personalized"
    QUICK_DELIVERY = "quick_delivery"
    PRINT_WORTHY = "print_worthy"
    SOCIAL_MEDIA = "social_media"
    ALBUM_COVER = "album_cover"


class RecommendationStatus(str, Enum):
    """Status of a recommendation request."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    EXPIRED = "expired"


class ClientType(str, Enum):
    """Client types for preference learning."""

    WEDDING_CLIENT = "wedding_client"
    PORTRAIT_CLIENT = "portrait_client"
    CORPORATE_CLIENT = "corporate_client"
    EVENT_CLIENT = "event_client"
    FAMILY_CLIENT = "family_client"
    COMMERCIAL_CLIENT = "commercial_client"
    GENERAL = "general"


class SceneCategory(str, Enum):
    """Scene categories from CLIP classification."""

    WEDDING = "wedding"
    PORTRAIT = "portrait"
    LANDSCAPE = "landscape"
    EVENT = "event"
    PRODUCT = "product"
    LIFESTYLE = "lifestyle"
    CORPORATE = "corporate"
    FAMILY = "family"
    NATURE = "nature"
    ARCHITECTURE = "architecture"
    FOOD = "food"
    FASHION = "fashion"
    SPORTS = "sports"
    OTHER = "other"


class EngagementTrend(str, Enum):
    """Trend indicators for asset engagement."""

    GROWING = "growing"
    STABLE = "stable"
    DECLINING = "declining"
    SPIKE = "spike"
    DORMANT = "dormant"


class ABTestStatus(str, Enum):
    """Status of A/B test."""

    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    CONCLUDED = "concluded"
    ARCHIVED = "archived"


class ABTestType(str, Enum):
    """Types of A/B tests for recommendations."""

    ALGORITHM = "algorithm"
    SCORING_WEIGHTS = "scoring_weights"
    UI_PRESENTATION = "ui_presentation"
    RECOMMENDATION_COUNT = "recommendation_count"
    DIVERSITY_FACTOR = "diversity_factor"
    PERSONALIZATION_LEVEL = "personalization_level"


class PrimaryMetric(str, Enum):
    """Primary metrics for A/B testing."""

    SELECTION_RATE = "selection_rate"
    DOWNLOAD_RATE = "download_rate"
    TIME_TO_SELECTION = "time_to_selection"
    USER_RATING = "user_rating"
    ITEMS_VIEWED = "items_viewed"
    ENGAGEMENT_RATE = "engagement_rate"


class FeedbackSource(str, Enum):
    """Source of feedback."""

    USER = "user"
    CLIENT = "client"
    SYSTEM = "system"
    IMPLICIT = "implicit"


class FeedbackType(str, Enum):
    """Types of feedback."""

    RATING = "rating"
    SELECTION = "selection"
    REJECTION = "rejection"
    REORDER = "reorder"
    COMMENT = "comment"
    HELPFUL = "helpful"
    NOT_HELPFUL = "not_helpful"
    TOO_FEW = "too_few"
    TOO_MANY = "too_many"
    WRONG_STYLE = "wrong_style"


# ---------------------------------------------------------------------------
# Asset Embedding Schemas
# ---------------------------------------------------------------------------


class AssetEmbeddingBase(BaseModel):
    """Base schema for asset embedding."""

    model_config = ConfigDict(protected_namespaces=())

    scene_category: SceneCategory | None = None
    scene_confidence: float | None = None
    scene_tags: list[str] = Field(default_factory=list)
    dominant_colors: list[dict[str, Any]] = Field(default_factory=list)
    color_palette: str | None = None
    brightness_level: str | None = None
    composition_type: str | None = None
    aesthetic_score: float | None = None
    sharpness_score: float | None = None
    exposure_score: float | None = None
    noise_score: float | None = None
    overall_quality_score: float | None = None
    detected_objects: list[dict[str, Any]] = Field(default_factory=list)
    detected_faces_count: int = 0
    has_people: bool = False


class AssetEmbeddingCreate(AssetEmbeddingBase):
    """Schema for creating an asset embedding."""

    asset_id: UUID
    gallery_id: UUID | None = None
    clip_embedding: list[float]
    text_embedding: list[float] | None = None


class AssetEmbeddingResponse(AssetEmbeddingBase):
    """Response schema for asset embedding."""

    model_config = ConfigDict(from_attributes=True, protected_namespaces=())


# ---------------------------------------------------------------------------
# Engagement Score Schemas
# ---------------------------------------------------------------------------


class EngagementScoreBase(BaseModel):
    """Base schema for engagement score."""

    total_views: int = 0
    unique_viewers: int = 0
    total_favorites: int = 0
    total_selections: int = 0
    total_downloads: int = 0
    total_shares: int = 0
    views_last_7d: int = 0
    views_last_30d: int = 0
    engagement_score: float = 0
    conversion_rate: float = 0
    engagement_trend: EngagementTrend = EngagementTrend.STABLE


class EngagementScoreResponse(EngagementScoreBase):
    """Response schema for engagement score."""

    score_id: UUID
    workspace_id: UUID
    asset_id: UUID
    gallery_id: UUID | None
    score_percentile: float | None
    view_score: float
    action_score: float
    recency_score: float
    conversion_score: float
    last_calculated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Client Preference Schemas
# ---------------------------------------------------------------------------


class ClientPreferenceBase(BaseModel):
    """Base schema for client preference."""

    client_type: ClientType = ClientType.GENERAL
    occasion_type: str | None = None
    preferred_styles: list[str] = Field(default_factory=list)
    preferred_colors: list[str] = Field(default_factory=list)
    preferred_compositions: list[str] = Field(default_factory=list)
    preferred_scenes: list[str] = Field(default_factory=list)


class ClientPreferenceUpdate(ClientPreferenceBase):
    """Schema for updating client preferences."""

    pass


class ClientPreferenceResponse(ClientPreferenceBase):
    """Response schema for client preference."""

    preference_id: UUID
    workspace_id: UUID
    client_id: UUID
    embedding_confidence: float | None
    embedding_sample_size: int
    total_galleries_viewed: int
    total_selections_made: int
    preference_confidence: float
    last_interaction_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Recommendation Request Schemas
# ---------------------------------------------------------------------------


class RecommendationRequest(BaseModel):
    """Request schema for generating recommendations."""

    recommendation_type: RecommendationType
    client_id: UUID | None = None
    gallery_id: UUID | None = None
    source_gallery_ids: list[UUID] | None = None
    reference_asset_id: UUID | None = None
    occasion_type: str | None = None
    target_season: str | None = None
    target_theme: str | None = None
    limit: int = Field(default=20, ge=1, le=100)
    include_scores: bool = True
    filter_criteria: dict[str, Any] | None = None
    scoring_weights: dict[str, float] | None = None


class SimilarAssetRequest(BaseModel):
    """Request for finding similar assets."""

    reference_asset_id: UUID
    limit: int = Field(default=20, ge=1, le=100)
    min_similarity: float = Field(default=0.7, ge=0, le=1)
    exclude_same_gallery: bool = False
    scene_filter: SceneCategory | None = None


class PersonalizedRequest(BaseModel):
    """Request for personalized recommendations."""

    client_id: UUID
    gallery_ids: list[UUID] | None = None
    limit: int = Field(default=20, ge=1, le=100)
    occasion_type: str | None = None
    include_trending: bool = True


class HeroShotsRequest(BaseModel):
    """Request for hero shots recommendations."""

    gallery_ids: list[UUID] | None = None
    limit: int = Field(default=10, ge=1, le=50)
    min_quality_score: float = Field(default=70, ge=0, le=100)
    diversity_factor: float = Field(default=0.3, ge=0, le=1)


class SeasonalRequest(BaseModel):
    """Request for seasonal recommendations."""

    target_season: str
    gallery_ids: list[UUID] | None = None
    limit: int = Field(default=20, ge=1, le=100)
    occasion_type: str | None = None


# ---------------------------------------------------------------------------
# Recommendation Response Schemas
# ---------------------------------------------------------------------------


class MatchReason(BaseModel):
    """A reason why an asset was recommended."""

    reason: str
    detail: str
    weight: float | None = None


class ScoreBreakdown(BaseModel):
    """Breakdown of recommendation score components."""

    similarity_score: float | None = None
    engagement_score: float | None = None
    quality_score: float | None = None
    relevance_score: float | None = None
    recency_score: float | None = None
    diversity_score: float | None = None


class RecommendationItemResponse(BaseModel):
    """Response schema for a single recommendation item."""

    item_id: UUID
    asset_id: UUID
    rank_position: int
    final_score: float
    score_breakdown: ScoreBreakdown | None = None
    match_reasons: list[MatchReason] = Field(default_factory=list)
    scene_category: str | None = None
    visual_tags: list[str] = Field(default_factory=list)

    # Asset metadata (optionally included)
    asset_url: str | None = None
    thumbnail_url: str | None = None
    filename: str | None = None
    gallery_name: str | None = None

    model_config = ConfigDict(from_attributes=True)


class RecommendationResponse(BaseModel):
    """Response schema for a recommendation set."""

    recommendation_id: UUID
    workspace_id: UUID
    recommendation_type: RecommendationType
    status: RecommendationStatus
    client_id: UUID | None
    gallery_id: UUID | None
    occasion_type: str | None
    target_season: str | None
    target_theme: str | None

    # Results
    total_candidates: int
    total_recommended: int
    items: list[RecommendationItemResponse] = Field(default_factory=list)

    # Aggregate scores
    avg_similarity_score: float | None
    avg_engagement_score: float | None
    avg_quality_score: float | None

    # Algorithm info
    algorithm_version: str
    ab_test_id: UUID | None
    ab_variant: str | None

    # Timing
    processing_time_ms: int | None
    requested_at: datetime
    completed_at: datetime | None
    expires_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RecommendationSummary(BaseModel):
    """Summary of a recommendation for listing."""

    recommendation_id: UUID
    recommendation_type: RecommendationType
    status: RecommendationStatus
    client_id: UUID | None
    gallery_id: UUID | None
    total_recommended: int
    avg_engagement_score: float | None
    user_rating: int | None
    items_selected: int
    requested_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Feedback Schemas
# ---------------------------------------------------------------------------


class FeedbackCreate(BaseModel):
    """Schema for creating feedback."""

    recommendation_id: UUID
    feedback_type: FeedbackType
    rating: int | None = Field(default=None, ge=1, le=5)
    comment: str | None = None
    selected_count: int | None = None
    rejected_count: int | None = None


class FeedbackResponse(BaseModel):
    """Response schema for feedback."""

    feedback_id: UUID
    recommendation_id: UUID
    feedback_source: FeedbackSource
    feedback_type: FeedbackType
    rating: int | None
    comment: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# A/B Test Schemas
# ---------------------------------------------------------------------------


class ABTestVariantConfig(BaseModel):
    """Configuration for an A/B test variant."""

    name: str
    config: dict[str, Any]
    weight: int = 50


class ABTestCreate(BaseModel):
    """Schema for creating an A/B test."""

    test_name: str = Field(..., min_length=1, max_length=100)
    test_description: str | None = None
    hypothesis: str | None = None
    test_type: ABTestType
    control_config: dict[str, Any]
    variants: list[ABTestVariantConfig]
    target_recommendation_types: list[RecommendationType] | None = None
    target_client_types: list[ClientType] | None = None
    traffic_percentage: float = Field(default=100, ge=0, le=100)
    start_date: datetime
    end_date: datetime | None = None
    min_sample_size: int = Field(default=100, ge=10)
    significance_level: float = Field(default=0.05, ge=0.01, le=0.1)
    minimum_detectable_effect: float = Field(default=0.1, ge=0.01)
    primary_metric: PrimaryMetric = PrimaryMetric.SELECTION_RATE
    secondary_metrics: list[PrimaryMetric] | None = None


class ABTestVariantResult(BaseModel):
    """Result for a single A/B test variant."""

    name: str
    is_control: bool
    sample_size: int
    conversions: int
    conversion_rate: float
    lift_vs_control: float | None
    p_value: float | None
    confidence_interval: tuple[float, float] | None


class ABTestResult(BaseModel):
    """Results of an A/B test."""

    test_id: UUID
    test_name: str
    status: ABTestStatus
    primary_metric: PrimaryMetric
    variants: list[ABTestVariantResult]
    winner_variant: str | None
    statistical_significance_reached: bool
    recommendation: str


class ABTestResponse(BaseModel):
    """Response schema for an A/B test."""

    test_id: UUID
    workspace_id: UUID
    test_name: str
    test_description: str | None
    hypothesis: str | None
    test_type: ABTestType
    status: ABTestStatus
    target_recommendation_types: list[str]
    traffic_percentage: float
    start_date: datetime
    end_date: datetime | None
    primary_metric: PrimaryMetric
    current_results: dict[str, Any]
    winner_variant: str | None
    statistical_significance_reached: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Metrics Schemas
# ---------------------------------------------------------------------------


class RecommendationMetricsResponse(BaseModel):
    """Response schema for recommendation metrics."""

    workspace_id: UUID
    period_start: str
    period_end: str
    period_type: str

    # Volume metrics
    total_recommendations: int
    total_items_recommended: int
    total_items_selected: int
    total_items_downloaded: int

    # Performance metrics
    avg_selection_rate: float | None
    avg_download_rate: float | None
    avg_user_rating: float | None

    # Quality metrics
    avg_similarity_score: float | None
    avg_engagement_score: float | None
    avg_quality_score: float | None

    # A/B test metrics
    active_tests: int
    tests_concluded: int

    # Lift
    selection_rate_vs_baseline: float | None

    model_config = ConfigDict(from_attributes=True)


class TopAssetResponse(BaseModel):
    """Response schema for top performing assets."""

    asset_id: UUID
    gallery_id: UUID | None
    engagement_score: float
    total_views: int
    total_favorites: int
    total_selections: int
    total_downloads: int
    conversion_rate: float
    scene_category: str | None
    aesthetic_score: float | None
    quality_score: float | None
    rank_in_workspace: int
    rank_in_category: int | None
    percentile: float

    # Asset metadata
    asset_url: str | None = None
    thumbnail_url: str | None = None

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Batch Operation Schemas
# ---------------------------------------------------------------------------


class BatchEmbeddingRequest(BaseModel):
    """Request for batch embedding generation."""

    gallery_ids: list[UUID] | None = None
    asset_ids: list[UUID] | None = None
    force_regenerate: bool = False
    batch_size: int = Field(default=50, ge=1, le=200)


class BatchEmbeddingResponse(BaseModel):
    """Response for batch embedding generation."""

    total_requested: int
    total_processed: int
    total_failed: int
    failed_asset_ids: list[UUID]
    processing_time_ms: int


class RefreshEngagementRequest(BaseModel):
    """Request for refreshing engagement scores."""

    gallery_ids: list[UUID] | None = None
    force_full_refresh: bool = False


class RefreshEngagementResponse(BaseModel):
    """Response for engagement score refresh."""

    total_assets_updated: int
    processing_time_ms: int
