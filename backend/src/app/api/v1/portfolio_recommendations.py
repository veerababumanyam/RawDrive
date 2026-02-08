"""API endpoints for AI Portfolio Recommendation Engine.

Provides endpoints for:
- Portfolio recommendation generation
- Similar asset discovery
- Client preference management
- A/B testing for recommendation algorithms
- Feedback collection and learning
- Performance metrics and analytics

Feature: AI Portfolio Recommendation Engine
"""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Path
from pydantic import BaseModel, Field
from typing import Any
from uuid import UUID

from app.api.dependencies import get_current_user, require_permissions
from app.services.portfolio_recommendation_service import (
    PortfolioRecommendationService,
    get_portfolio_recommendation_service,
)
from app.schemas.portfolio_recommendation import (
    RecommendationType,
    RecommendationStatus,
    ClientType,
    SceneCategory,
    ABTestStatus,
    ABTestType,
    PrimaryMetric,
    FeedbackType,
    FeedbackSource,
)


router = APIRouter()


# =========================================================================
# Request/Response Schemas
# =========================================================================


class GenerateRecommendationsRequest(BaseModel):
    """Request to generate portfolio recommendations."""

    recommendation_type: str = Field(..., description="Type of recommendation")
    client_id: UUID | None = Field(default=None, description="Target client ID")
    gallery_id: UUID | None = Field(default=None, description="Target gallery ID")
    source_gallery_ids: list[UUID] | None = Field(default=None, description="Source galleries to analyze")
    reference_asset_id: UUID | None = Field(default=None, description="Reference asset for similarity")
    occasion_type: str | None = Field(default=None, description="Event occasion type")
    target_season: str | None = Field(default=None, description="Target season")
    target_theme: str | None = Field(default=None, description="Target theme")
    limit: int = Field(default=20, ge=1, le=100, description="Max recommendations")
    include_scores: bool = Field(default=True, description="Include score breakdowns")
    filter_criteria: dict[str, Any] | None = Field(default=None, description="Additional filters")
    scoring_weights: dict[str, float] | None = Field(default=None, description="Custom scoring weights")


class RecommendationItemResponse(BaseModel):
    """A single recommendation item."""

    item_id: str
    asset_id: str
    rank_position: int
    final_score: float
    similarity_score: float | None = None
    engagement_score: float | None = None
    quality_score: float | None = None
    relevance_score: float | None = None
    scene_category: str | None = None
    visual_tags: list[str] = Field(default_factory=list)
    match_reasons: list[dict[str, Any]] = Field(default_factory=list)
    score_breakdown: dict[str, float] | None = None
    asset_url: str | None = None
    thumbnail_url: str | None = None


class RecommendationResponse(BaseModel):
    """Recommendation response."""

    recommendation_id: str
    workspace_id: str
    recommendation_type: str
    status: str
    client_id: str | None = None
    gallery_id: str | None = None
    occasion_type: str | None = None
    target_season: str | None = None
    target_theme: str | None = None
    total_candidates: int
    total_recommended: int
    items: list[RecommendationItemResponse] = Field(default_factory=list)
    avg_similarity_score: float | None = None
    avg_engagement_score: float | None = None
    avg_quality_score: float | None = None
    algorithm_version: str | None = None
    ab_test_id: str | None = None
    ab_variant: str | None = None
    processing_time_ms: int | None = None
    requested_at: str
    completed_at: str | None = None
    expires_at: str | None = None


class RecommendationSummaryResponse(BaseModel):
    """Summary of a recommendation for listing."""

    recommendation_id: str
    recommendation_type: str
    status: str
    client_id: str | None = None
    gallery_id: str | None = None
    total_recommended: int
    avg_engagement_score: float | None = None
    user_rating: int | None = None
    items_selected: int
    requested_at: str


class SimilarAssetRequest(BaseModel):
    """Request for finding similar assets."""

    reference_asset_id: UUID = Field(..., description="Reference asset ID")
    limit: int = Field(default=20, ge=1, le=100, description="Max results")
    min_similarity: float = Field(default=0.7, ge=0, le=1, description="Minimum similarity threshold")
    exclude_same_gallery: bool = Field(default=False, description="Exclude assets from same gallery")
    scene_filter: str | None = Field(default=None, description="Filter by scene category")


class ClientPreferenceUpdateRequest(BaseModel):
    """Request to update client preferences."""

    client_type: str | None = Field(default=None, description="Client type")
    occasion_type: str | None = Field(default=None, description="Occasion type")
    preferred_styles: list[str] | None = Field(default=None)
    preferred_colors: list[str] | None = Field(default=None)
    preferred_compositions: list[str] | None = Field(default=None)
    preferred_scenes: list[str] | None = Field(default=None)


class ClientPreferenceResponse(BaseModel):
    """Client preference response."""

    preference_id: str
    workspace_id: str
    client_id: str
    client_type: str
    occasion_type: str | None = None
    preferred_styles: list[str] = Field(default_factory=list)
    preferred_colors: list[str] = Field(default_factory=list)
    preferred_compositions: list[str] = Field(default_factory=list)
    preferred_scenes: list[str] = Field(default_factory=list)
    embedding_confidence: float | None = None
    embedding_sample_size: int
    total_galleries_viewed: int
    total_selections_made: int
    preference_confidence: float
    last_interaction_at: str | None = None
    created_at: str
    updated_at: str


class LearnPreferencesRequest(BaseModel):
    """Request to learn client preferences from interactions."""

    favorited_asset_ids: list[UUID] | None = Field(default=None)
    selected_asset_ids: list[UUID] | None = Field(default=None)


class CreateABTestRequest(BaseModel):
    """Request to create an A/B test."""

    test_name: str = Field(..., min_length=1, max_length=100)
    test_description: str | None = Field(default=None)
    hypothesis: str | None = Field(default=None)
    test_type: str = Field(..., description="Test type")
    control_config: dict[str, Any] = Field(...)
    variants: list[dict[str, Any]] = Field(...)
    target_recommendation_types: list[str] | None = Field(default=None)
    target_client_types: list[str] | None = Field(default=None)
    traffic_percentage: float = Field(default=100, ge=0, le=100)
    start_date: datetime
    end_date: datetime | None = Field(default=None)
    min_sample_size: int = Field(default=100, ge=10)
    significance_level: float = Field(default=0.05, ge=0.01, le=0.1)
    minimum_detectable_effect: float = Field(default=0.1, ge=0.01)
    primary_metric: str = Field(default="selection_rate")
    secondary_metrics: list[str] | None = Field(default=None)


class ABTestResponse(BaseModel):
    """A/B test response."""

    test_id: str
    workspace_id: str
    test_name: str
    test_description: str | None = None
    hypothesis: str | None = None
    test_type: str
    status: str
    target_recommendation_types: list[str] = Field(default_factory=list)
    traffic_percentage: float
    start_date: str
    end_date: str | None = None
    primary_metric: str
    current_results: dict[str, Any] = Field(default_factory=dict)
    winner_variant: str | None = None
    statistical_significance_reached: bool
    created_at: str


class ABTestResultsResponse(BaseModel):
    """A/B test results response."""

    test_id: str
    test_name: str
    status: str
    primary_metric: str
    variant_results: dict[str, Any]
    significance_results: dict[str, Any]
    total_samples: int
    min_sample_size: int


class FeedbackRequest(BaseModel):
    """Request to submit feedback."""

    feedback_type: str = Field(..., description="Type of feedback")
    rating: int | None = Field(default=None, ge=1, le=5, description="Rating 1-5")
    comment: str | None = Field(default=None, max_length=1000)
    selected_count: int | None = Field(default=None, ge=0)
    rejected_count: int | None = Field(default=None, ge=0)


class FeedbackResponse(BaseModel):
    """Feedback response."""

    feedback_id: str
    recommendation_id: str
    feedback_source: str
    feedback_type: str
    rating: int | None = None
    comment: str | None = None
    created_at: str


class ItemInteractionRequest(BaseModel):
    """Request to record item interaction."""

    interaction_type: str = Field(..., description="view, select, download, reject")
    view_duration_ms: int | None = Field(default=None, ge=0)


class TopAssetResponse(BaseModel):
    """Top performing asset response."""

    asset_id: str
    gallery_id: str | None = None
    engagement_score: float
    total_views: int
    total_favorites: int
    total_selections: int
    total_downloads: int
    conversion_rate: float
    scene_category: str | None = None
    aesthetic_score: float | None = None
    quality_score: float | None = None
    rank_in_workspace: int
    rank_in_category: int | None = None
    percentile: float
    asset_url: str | None = None
    thumbnail_url: str | None = None


class BatchEmbeddingRequest(BaseModel):
    """Request for batch embedding generation."""

    gallery_ids: list[UUID] | None = Field(default=None)
    asset_ids: list[UUID] | None = Field(default=None)
    force_regenerate: bool = Field(default=False)
    batch_size: int = Field(default=50, ge=1, le=200)


class BatchEmbeddingResponse(BaseModel):
    """Batch embedding response."""

    total_requested: int
    total_processed: int
    total_failed: int
    failed_asset_ids: list[str]
    processing_time_ms: int


class RefreshEngagementResponse(BaseModel):
    """Engagement refresh response."""

    total_assets_updated: int
    processing_time_ms: int


# =========================================================================
# Recommendation Generation Endpoints
# =========================================================================


@router.post(
    "/generate",
    response_model=RecommendationResponse,
    summary="Generate portfolio recommendations",
    description="Generate AI-powered portfolio recommendations based on specified criteria.",
)
async def generate_recommendations(
    request: GenerateRecommendationsRequest,
    workspace_id: UUID = Path(..., description="Workspace ID"),
    current_user: dict = Depends(get_current_user),
    service: PortfolioRecommendationService = Depends(get_portfolio_recommendation_service),
):
    """Generate portfolio recommendations."""
    try:
        recommendation_type = RecommendationType(request.recommendation_type)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid recommendation type. Valid types: {[t.value for t in RecommendationType]}",
        )

    try:
        result = await service.generate_recommendations(
            workspace_id=workspace_id,
            recommendation_type=recommendation_type,
            client_id=request.client_id,
            gallery_id=request.gallery_id,
            source_gallery_ids=request.source_gallery_ids,
            reference_asset_id=request.reference_asset_id,
            occasion_type=request.occasion_type,
            target_season=request.target_season,
            target_theme=request.target_theme,
            limit=request.limit,
            filter_criteria=request.filter_criteria,
            scoring_weights=request.scoring_weights,
        )

        return _format_recommendation_response(result)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Recommendation generation failed: {e}")


@router.post(
    "/similar",
    response_model=RecommendationResponse,
    summary="Find similar assets",
    description="Find assets visually similar to a reference asset.",
)
async def find_similar_assets(
    request: SimilarAssetRequest,
    workspace_id: UUID = Path(..., description="Workspace ID"),
    current_user: dict = Depends(get_current_user),
    service: PortfolioRecommendationService = Depends(get_portfolio_recommendation_service),
):
    """Find similar assets using CLIP embeddings."""
    try:
        result = await service.generate_recommendations(
            workspace_id=workspace_id,
            recommendation_type=RecommendationType.SIMILAR_STYLE,
            reference_asset_id=request.reference_asset_id,
            limit=request.limit,
            filter_criteria={
                "min_similarity": request.min_similarity,
                "exclude_same_gallery": request.exclude_same_gallery,
                "scene_filter": request.scene_filter,
            },
        )

        return _format_recommendation_response(result)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Similarity search failed: {e}")


@router.post(
    "/personalized/{client_id}",
    response_model=RecommendationResponse,
    summary="Get personalized recommendations",
    description="Get recommendations personalized for a specific client.",
)
async def get_personalized_recommendations(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    client_id: UUID = Path(..., description="Client ID"),
    gallery_ids: list[UUID] | None = Query(default=None, description="Source galleries"),
    limit: int = Query(default=20, ge=1, le=100),
    include_trending: bool = Query(default=True),
    current_user: dict = Depends(get_current_user),
    service: PortfolioRecommendationService = Depends(get_portfolio_recommendation_service),
):
    """Get personalized recommendations for a client."""
    try:
        result = await service.generate_recommendations(
            workspace_id=workspace_id,
            recommendation_type=RecommendationType.PERSONALIZED,
            client_id=client_id,
            source_gallery_ids=gallery_ids,
            limit=limit,
        )

        return _format_recommendation_response(result)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Personalization failed: {e}")


@router.post(
    "/hero-shots",
    response_model=RecommendationResponse,
    summary="Get hero shot recommendations",
    description="Get best overall quality shots for portfolio highlighting.",
)
async def get_hero_shots(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    gallery_ids: list[UUID] | None = Query(default=None),
    limit: int = Query(default=10, ge=1, le=50),
    min_quality_score: float = Query(default=70, ge=0, le=100),
    diversity_factor: float = Query(default=0.3, ge=0, le=1),
    current_user: dict = Depends(get_current_user),
    service: PortfolioRecommendationService = Depends(get_portfolio_recommendation_service),
):
    """Get hero shot recommendations."""
    try:
        result = await service.generate_recommendations(
            workspace_id=workspace_id,
            recommendation_type=RecommendationType.HERO_SHOTS,
            source_gallery_ids=gallery_ids,
            limit=limit,
            filter_criteria={
                "min_quality_score": min_quality_score,
                "diversity_factor": diversity_factor,
            },
        )

        return _format_recommendation_response(result)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Hero shots generation failed: {e}")


@router.post(
    "/seasonal",
    response_model=RecommendationResponse,
    summary="Get seasonal recommendations",
    description="Get recommendations optimized for a target season.",
)
async def get_seasonal_recommendations(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    target_season: str = Query(..., description="spring, summer, fall, winter"),
    gallery_ids: list[UUID] | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    occasion_type: str | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
    service: PortfolioRecommendationService = Depends(get_portfolio_recommendation_service),
):
    """Get seasonal recommendations."""
    if target_season not in ["spring", "summer", "fall", "winter"]:
        raise HTTPException(
            status_code=400,
            detail="Invalid season. Valid values: spring, summer, fall, winter",
        )

    try:
        result = await service.generate_recommendations(
            workspace_id=workspace_id,
            recommendation_type=RecommendationType.SEASONAL_PICKS,
            source_gallery_ids=gallery_ids,
            target_season=target_season,
            occasion_type=occasion_type,
            limit=limit,
        )

        return _format_recommendation_response(result)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Seasonal recommendations failed: {e}")


@router.get(
    "/{recommendation_id}",
    response_model=RecommendationResponse,
    summary="Get recommendation details",
    description="Get details of a specific recommendation.",
)
async def get_recommendation(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    recommendation_id: UUID = Path(..., description="Recommendation ID"),
    include_items: bool = Query(default=True),
    include_asset_details: bool = Query(default=False),
    current_user: dict = Depends(get_current_user),
    service: PortfolioRecommendationService = Depends(get_portfolio_recommendation_service),
):
    """Get recommendation details."""
    result = await service.get_recommendation(
        workspace_id=workspace_id,
        recommendation_id=recommendation_id,
        include_items=include_items,
        include_asset_details=include_asset_details,
    )

    if not result:
        raise HTTPException(status_code=404, detail="Recommendation not found")

    return _format_recommendation_response(result)


@router.get(
    "",
    response_model=list[RecommendationSummaryResponse],
    summary="List recommendations",
    description="List recommendations with filtering.",
)
async def list_recommendations(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    recommendation_type: str | None = Query(default=None),
    status: str | None = Query(default=None),
    client_id: UUID | None = Query(default=None),
    gallery_id: UUID | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: dict = Depends(get_current_user),
    service: PortfolioRecommendationService = Depends(get_portfolio_recommendation_service),
):
    """List recommendations."""
    filters = {
        "limit": limit,
        "offset": offset,
    }

    if recommendation_type:
        try:
            RecommendationType(recommendation_type)
            filters["recommendation_type"] = recommendation_type
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid recommendation type. Valid types: {[t.value for t in RecommendationType]}",
            )

    if status:
        try:
            RecommendationStatus(status)
            filters["status"] = status
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status. Valid values: {[s.value for s in RecommendationStatus]}",
            )

    if client_id:
        filters["client_id"] = client_id
    if gallery_id:
        filters["gallery_id"] = gallery_id

    results = await service.list_recommendations(workspace_id, **filters)

    return [
        {
            "recommendation_id": str(r["recommendation_id"]),
            "recommendation_type": r["recommendation_type"],
            "status": r["status"],
            "client_id": str(r["client_id"]) if r.get("client_id") else None,
            "gallery_id": str(r["gallery_id"]) if r.get("gallery_id") else None,
            "total_recommended": r.get("total_recommended", 0),
            "avg_engagement_score": r.get("avg_engagement_score"),
            "user_rating": r.get("user_rating"),
            "items_selected": r.get("items_selected", 0),
            "requested_at": r["requested_at"].isoformat() if r.get("requested_at") else None,
        }
        for r in results
    ]


# =========================================================================
# Client Preference Endpoints
# =========================================================================


@router.get(
    "/clients/{client_id}/preferences",
    response_model=ClientPreferenceResponse | None,
    summary="Get client preferences",
    description="Get learned preferences for a client.",
)
async def get_client_preferences(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    client_id: UUID = Path(..., description="Client ID"),
    current_user: dict = Depends(get_current_user),
    service: PortfolioRecommendationService = Depends(get_portfolio_recommendation_service),
):
    """Get client preferences."""
    prefs = await service._repository.get_client_preference(workspace_id, client_id)
    if not prefs:
        return None

    return {
        "preference_id": str(prefs["preference_id"]),
        "workspace_id": str(prefs["workspace_id"]),
        "client_id": str(prefs["client_id"]),
        "client_type": prefs.get("client_type", "general"),
        "occasion_type": prefs.get("occasion_type"),
        "preferred_styles": prefs.get("preferred_styles", []),
        "preferred_colors": prefs.get("preferred_colors", []),
        "preferred_compositions": prefs.get("preferred_compositions", []),
        "preferred_scenes": prefs.get("preferred_scenes", []),
        "embedding_confidence": prefs.get("embedding_confidence"),
        "embedding_sample_size": prefs.get("embedding_sample_size", 0),
        "total_galleries_viewed": prefs.get("total_galleries_viewed", 0),
        "total_selections_made": prefs.get("total_selections_made", 0),
        "preference_confidence": prefs.get("preference_confidence", 0),
        "last_interaction_at": prefs["last_interaction_at"].isoformat() if prefs.get("last_interaction_at") else None,
        "created_at": prefs["created_at"].isoformat() if prefs.get("created_at") else None,
        "updated_at": prefs["updated_at"].isoformat() if prefs.get("updated_at") else None,
    }


@router.put(
    "/clients/{client_id}/preferences",
    response_model=ClientPreferenceResponse,
    summary="Update client preferences",
    description="Manually update client preferences.",
)
async def update_client_preferences(
    request: ClientPreferenceUpdateRequest,
    workspace_id: UUID = Path(..., description="Workspace ID"),
    client_id: UUID = Path(..., description="Client ID"),
    current_user: dict = Depends(get_current_user),
    service: PortfolioRecommendationService = Depends(get_portfolio_recommendation_service),
):
    """Update client preferences."""
    await require_permissions(current_user, workspace_id, ["manage_clients"])

    client_type = None
    if request.client_type:
        try:
            client_type = ClientType(request.client_type)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid client type. Valid types: {[t.value for t in ClientType]}",
            )

    result = await service.update_client_type(
        workspace_id=workspace_id,
        client_id=client_id,
        client_type=client_type or ClientType.GENERAL,
        occasion_type=request.occasion_type,
    )

    return {
        "preference_id": str(result["preference_id"]),
        "workspace_id": str(result["workspace_id"]),
        "client_id": str(result["client_id"]),
        "client_type": result.get("client_type", "general"),
        "occasion_type": result.get("occasion_type"),
        "preferred_styles": result.get("preferred_styles", []),
        "preferred_colors": result.get("preferred_colors", []),
        "preferred_compositions": result.get("preferred_compositions", []),
        "preferred_scenes": result.get("preferred_scenes", []),
        "embedding_confidence": result.get("embedding_confidence"),
        "embedding_sample_size": result.get("embedding_sample_size", 0),
        "total_galleries_viewed": result.get("total_galleries_viewed", 0),
        "total_selections_made": result.get("total_selections_made", 0),
        "preference_confidence": result.get("preference_confidence", 0),
        "last_interaction_at": result["last_interaction_at"].isoformat() if result.get("last_interaction_at") else None,
        "created_at": result["created_at"].isoformat() if result.get("created_at") else None,
        "updated_at": result["updated_at"].isoformat() if result.get("updated_at") else None,
    }


@router.post(
    "/clients/{client_id}/learn",
    response_model=ClientPreferenceResponse,
    summary="Learn client preferences",
    description="Learn client preferences from their interactions.",
)
async def learn_client_preferences(
    request: LearnPreferencesRequest,
    workspace_id: UUID = Path(..., description="Workspace ID"),
    client_id: UUID = Path(..., description="Client ID"),
    current_user: dict = Depends(get_current_user),
    service: PortfolioRecommendationService = Depends(get_portfolio_recommendation_service),
):
    """Learn client preferences from interactions."""
    result = await service.learn_client_preferences(
        workspace_id=workspace_id,
        client_id=client_id,
        favorited_asset_ids=request.favorited_asset_ids,
        selected_asset_ids=request.selected_asset_ids,
    )

    if not result:
        raise HTTPException(
            status_code=400,
            detail="No assets provided or no embeddings found for learning",
        )

    return {
        "preference_id": str(result["preference_id"]),
        "workspace_id": str(result["workspace_id"]),
        "client_id": str(result["client_id"]),
        "client_type": result.get("client_type", "general"),
        "occasion_type": result.get("occasion_type"),
        "preferred_styles": result.get("preferred_styles", []),
        "preferred_colors": result.get("preferred_colors", []),
        "preferred_compositions": result.get("preferred_compositions", []),
        "preferred_scenes": result.get("preferred_scenes", []),
        "embedding_confidence": result.get("embedding_confidence"),
        "embedding_sample_size": result.get("embedding_sample_size", 0),
        "total_galleries_viewed": result.get("total_galleries_viewed", 0),
        "total_selections_made": result.get("total_selections_made", 0),
        "preference_confidence": result.get("preference_confidence", 0),
        "last_interaction_at": result["last_interaction_at"].isoformat() if result.get("last_interaction_at") else None,
        "created_at": result["created_at"].isoformat() if result.get("created_at") else None,
        "updated_at": result["updated_at"].isoformat() if result.get("updated_at") else None,
    }


# =========================================================================
# A/B Testing Endpoints
# =========================================================================


@router.post(
    "/ab-tests",
    response_model=ABTestResponse,
    summary="Create A/B test",
    description="Create a new A/B test for recommendation algorithms.",
)
async def create_ab_test(
    request: CreateABTestRequest,
    workspace_id: UUID = Path(..., description="Workspace ID"),
    current_user: dict = Depends(get_current_user),
    service: PortfolioRecommendationService = Depends(get_portfolio_recommendation_service),
):
    """Create a new A/B test."""
    await require_permissions(current_user, workspace_id, ["manage_recommendations"])

    try:
        test_type = ABTestType(request.test_type)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid test type. Valid types: {[t.value for t in ABTestType]}",
        )

    try:
        primary_metric = PrimaryMetric(request.primary_metric)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid primary metric. Valid metrics: {[m.value for m in PrimaryMetric]}",
        )

    # Validate recommendation types
    if request.target_recommendation_types:
        for rt in request.target_recommendation_types:
            try:
                RecommendationType(rt)
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid recommendation type: {rt}",
                )

    # Validate client types
    if request.target_client_types:
        for ct in request.target_client_types:
            try:
                ClientType(ct)
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid client type: {ct}",
                )

    test = await service.create_ab_test(
        workspace_id=workspace_id,
        test_name=request.test_name,
        test_type=test_type.value,
        control_config=request.control_config,
        variants=request.variants,
        start_date=request.start_date,
        test_description=request.test_description,
        hypothesis=request.hypothesis,
        target_recommendation_types=request.target_recommendation_types,
        target_client_types=request.target_client_types,
        traffic_percentage=request.traffic_percentage,
        end_date=request.end_date,
        min_sample_size=request.min_sample_size,
        significance_level=request.significance_level,
        minimum_detectable_effect=request.minimum_detectable_effect,
        primary_metric=primary_metric.value,
        secondary_metrics=request.secondary_metrics,
    )

    return _format_ab_test_response(test)


@router.get(
    "/ab-tests",
    response_model=list[ABTestResponse],
    summary="List A/B tests",
    description="List A/B tests for recommendations.",
)
async def list_ab_tests(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    status: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: dict = Depends(get_current_user),
    service: PortfolioRecommendationService = Depends(get_portfolio_recommendation_service),
):
    """List A/B tests."""
    if status:
        try:
            ABTestStatus(status)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status. Valid values: {[s.value for s in ABTestStatus]}",
            )

    tests = await service._repository.list_ab_tests(
        workspace_id, status=status, limit=limit, offset=offset
    )

    return [_format_ab_test_response(t) for t in tests]


@router.get(
    "/ab-tests/{test_id}",
    response_model=ABTestResponse,
    summary="Get A/B test details",
    description="Get details of an A/B test.",
)
async def get_ab_test(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    test_id: UUID = Path(..., description="Test ID"),
    current_user: dict = Depends(get_current_user),
    service: PortfolioRecommendationService = Depends(get_portfolio_recommendation_service),
):
    """Get A/B test details."""
    test = await service._repository.get_ab_test(workspace_id, test_id)
    if not test:
        raise HTTPException(status_code=404, detail="A/B test not found")

    return _format_ab_test_response(test)


@router.post(
    "/ab-tests/{test_id}/start",
    response_model=ABTestResponse,
    summary="Start A/B test",
    description="Activate a draft A/B test.",
)
async def start_ab_test(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    test_id: UUID = Path(..., description="Test ID"),
    current_user: dict = Depends(get_current_user),
    service: PortfolioRecommendationService = Depends(get_portfolio_recommendation_service),
):
    """Start an A/B test."""
    await require_permissions(current_user, workspace_id, ["manage_recommendations"])

    await service.start_ab_test(workspace_id, test_id)

    test = await service._repository.get_ab_test(workspace_id, test_id)
    if not test:
        raise HTTPException(status_code=404, detail="A/B test not found")

    return _format_ab_test_response(test)


@router.post(
    "/ab-tests/{test_id}/conclude",
    response_model=ABTestResponse,
    summary="Conclude A/B test",
    description="Conclude an A/B test with optional winner selection.",
)
async def conclude_ab_test(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    test_id: UUID = Path(..., description="Test ID"),
    winner_variant: str | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
    service: PortfolioRecommendationService = Depends(get_portfolio_recommendation_service),
):
    """Conclude an A/B test."""
    await require_permissions(current_user, workspace_id, ["manage_recommendations"])

    await service.conclude_ab_test(workspace_id, test_id, winner_variant)

    test = await service._repository.get_ab_test(workspace_id, test_id)
    if not test:
        raise HTTPException(status_code=404, detail="A/B test not found")

    return _format_ab_test_response(test)


@router.get(
    "/ab-tests/{test_id}/results",
    response_model=ABTestResultsResponse,
    summary="Get A/B test results",
    description="Get statistical analysis of A/B test results.",
)
async def get_ab_test_results(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    test_id: UUID = Path(..., description="Test ID"),
    current_user: dict = Depends(get_current_user),
    service: PortfolioRecommendationService = Depends(get_portfolio_recommendation_service),
):
    """Get A/B test results with statistical analysis."""
    try:
        results = await service.get_ab_test_results(workspace_id, test_id)
        return results
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# =========================================================================
# Feedback Endpoints
# =========================================================================


@router.post(
    "/{recommendation_id}/feedback",
    response_model=FeedbackResponse,
    summary="Submit recommendation feedback",
    description="Submit feedback on a recommendation.",
)
async def submit_feedback(
    request: FeedbackRequest,
    workspace_id: UUID = Path(..., description="Workspace ID"),
    recommendation_id: UUID = Path(..., description="Recommendation ID"),
    current_user: dict = Depends(get_current_user),
    service: PortfolioRecommendationService = Depends(get_portfolio_recommendation_service),
):
    """Submit feedback on a recommendation."""
    try:
        feedback_type = FeedbackType(request.feedback_type)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid feedback type. Valid types: {[t.value for t in FeedbackType]}",
        )

    feedback = await service.record_feedback(
        workspace_id=workspace_id,
        recommendation_id=recommendation_id,
        feedback_type=feedback_type,
        feedback_source=FeedbackSource.USER,
        user_id=UUID(current_user["user_id"]) if current_user.get("user_id") else None,
        rating=request.rating,
        comment=request.comment,
        selected_count=request.selected_count,
        rejected_count=request.rejected_count,
    )

    return {
        "feedback_id": str(feedback["feedback_id"]),
        "recommendation_id": str(feedback["recommendation_id"]),
        "feedback_source": feedback["feedback_source"],
        "feedback_type": feedback["feedback_type"],
        "rating": feedback.get("rating"),
        "comment": feedback.get("comment"),
        "created_at": feedback["created_at"].isoformat() if feedback.get("created_at") else None,
    }


@router.post(
    "/items/{item_id}/interaction",
    summary="Record item interaction",
    description="Record an interaction with a recommendation item.",
)
async def record_item_interaction(
    request: ItemInteractionRequest,
    workspace_id: UUID = Path(..., description="Workspace ID"),
    item_id: UUID = Path(..., description="Item ID"),
    current_user: dict = Depends(get_current_user),
    service: PortfolioRecommendationService = Depends(get_portfolio_recommendation_service),
):
    """Record interaction with a recommendation item."""
    valid_types = ["view", "select", "download", "reject"]
    if request.interaction_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid interaction type. Valid types: {valid_types}",
        )

    await service.record_item_interaction(
        workspace_id=workspace_id,
        item_id=item_id,
        interaction_type=request.interaction_type,
        view_duration_ms=request.view_duration_ms,
    )

    return {"status": "recorded", "item_id": str(item_id)}


# =========================================================================
# Top Assets & Analytics Endpoints
# =========================================================================


@router.get(
    "/top-assets",
    response_model=list[TopAssetResponse],
    summary="Get top performing assets",
    description="Get top performing assets by engagement score.",
)
async def get_top_assets(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    limit: int = Query(default=50, ge=1, le=200),
    scene_category: str | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
    service: PortfolioRecommendationService = Depends(get_portfolio_recommendation_service),
):
    """Get top performing assets."""
    if scene_category:
        try:
            SceneCategory(scene_category)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid scene category. Valid categories: {[c.value for c in SceneCategory]}",
            )

    assets = await service.get_top_assets(
        workspace_id, limit=limit, scene_category=scene_category
    )

    return [
        {
            "asset_id": str(a["asset_id"]),
            "gallery_id": str(a["gallery_id"]) if a.get("gallery_id") else None,
            "engagement_score": a.get("engagement_score", 0),
            "total_views": a.get("total_views", 0),
            "total_favorites": a.get("total_favorites", 0),
            "total_selections": a.get("total_selections", 0),
            "total_downloads": a.get("total_downloads", 0),
            "conversion_rate": a.get("conversion_rate", 0),
            "scene_category": a.get("scene_category"),
            "aesthetic_score": a.get("aesthetic_score"),
            "quality_score": a.get("overall_quality_score"),
            "rank_in_workspace": a.get("rank_in_workspace", 0),
            "rank_in_category": a.get("rank_in_category"),
            "percentile": a.get("score_percentile", 0),
            "asset_url": a.get("asset_url"),
            "thumbnail_url": a.get("thumbnail_url"),
        }
        for a in assets
    ]


# =========================================================================
# Embedding Management Endpoints
# =========================================================================


@router.post(
    "/embeddings/batch",
    response_model=BatchEmbeddingResponse,
    summary="Generate batch embeddings",
    description="Generate CLIP embeddings for multiple assets.",
)
async def generate_batch_embeddings(
    request: BatchEmbeddingRequest,
    workspace_id: UUID = Path(..., description="Workspace ID"),
    current_user: dict = Depends(get_current_user),
    service: PortfolioRecommendationService = Depends(get_portfolio_recommendation_service),
):
    """Generate embeddings for multiple assets."""
    await require_permissions(current_user, workspace_id, ["manage_recommendations"])

    result = await service.batch_generate_embeddings(
        workspace_id=workspace_id,
        gallery_ids=request.gallery_ids,
        asset_ids=request.asset_ids,
        batch_size=request.batch_size,
        force_regenerate=request.force_regenerate,
    )

    return {
        "total_requested": result["total_requested"],
        "total_processed": result["total_processed"],
        "total_failed": result["total_failed"],
        "failed_asset_ids": [str(id) for id in result["failed_asset_ids"]],
        "processing_time_ms": result["processing_time_ms"],
    }


@router.post(
    "/engagement/refresh",
    response_model=RefreshEngagementResponse,
    summary="Refresh engagement scores",
    description="Refresh engagement scores for all assets in workspace.",
)
async def refresh_engagement_scores(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    current_user: dict = Depends(get_current_user),
    service: PortfolioRecommendationService = Depends(get_portfolio_recommendation_service),
):
    """Refresh engagement scores."""
    await require_permissions(current_user, workspace_id, ["manage_recommendations"])

    import time
    start = time.time()

    updated = await service.refresh_engagement_scores(workspace_id)

    return {
        "total_assets_updated": updated,
        "processing_time_ms": int((time.time() - start) * 1000),
    }


# =========================================================================
# Helper Functions
# =========================================================================


def _format_recommendation_response(result: dict) -> dict:
    """Format recommendation result for response."""
    items = []
    for item in result.get("items", []):
        items.append({
            "item_id": str(item.get("item_id", item.get("asset_id", ""))),
            "asset_id": str(item["asset_id"]),
            "rank_position": item.get("rank_position", 0),
            "final_score": item.get("final_score", 0),
            "similarity_score": item.get("similarity_score"),
            "engagement_score": item.get("engagement_score"),
            "quality_score": item.get("quality_score"),
            "relevance_score": item.get("relevance_score"),
            "scene_category": item.get("scene_category"),
            "visual_tags": item.get("visual_tags", []),
            "match_reasons": item.get("match_reasons", []),
            "score_breakdown": item.get("score_breakdown"),
            "asset_url": item.get("asset_url"),
            "thumbnail_url": item.get("thumbnail_url"),
        })

    return {
        "recommendation_id": str(result["recommendation_id"]),
        "workspace_id": str(result["workspace_id"]),
        "recommendation_type": result["recommendation_type"],
        "status": result["status"],
        "client_id": str(result["client_id"]) if result.get("client_id") else None,
        "gallery_id": str(result["gallery_id"]) if result.get("gallery_id") else None,
        "occasion_type": result.get("occasion_type"),
        "target_season": result.get("target_season"),
        "target_theme": result.get("target_theme"),
        "total_candidates": result.get("total_candidates", 0),
        "total_recommended": result.get("total_recommended", len(items)),
        "items": items,
        "avg_similarity_score": result.get("avg_similarity_score"),
        "avg_engagement_score": result.get("avg_engagement_score"),
        "avg_quality_score": result.get("avg_quality_score"),
        "algorithm_version": result.get("algorithm_version", "1.0"),
        "ab_test_id": str(result["ab_test_id"]) if result.get("ab_test_id") else None,
        "ab_variant": result.get("ab_variant"),
        "processing_time_ms": result.get("processing_time_ms"),
        "requested_at": result["requested_at"].isoformat() if result.get("requested_at") else None,
        "completed_at": result["completed_at"].isoformat() if result.get("completed_at") else None,
        "expires_at": result["expires_at"].isoformat() if result.get("expires_at") else None,
    }


def _format_ab_test_response(test: dict) -> dict:
    """Format A/B test for response."""
    return {
        "test_id": str(test["test_id"]),
        "workspace_id": str(test["workspace_id"]),
        "test_name": test["test_name"],
        "test_description": test.get("test_description"),
        "hypothesis": test.get("hypothesis"),
        "test_type": test["test_type"],
        "status": test["status"],
        "target_recommendation_types": test.get("target_recommendation_types", []),
        "traffic_percentage": test.get("traffic_percentage", 100),
        "start_date": test["start_date"].isoformat() if test.get("start_date") else None,
        "end_date": test["end_date"].isoformat() if test.get("end_date") else None,
        "primary_metric": test.get("primary_metric", "selection_rate"),
        "current_results": test.get("current_results", {}),
        "winner_variant": test.get("winner_variant"),
        "statistical_significance_reached": test.get("statistical_significance_reached", False),
        "created_at": test["created_at"].isoformat() if test.get("created_at") else None,
    }
