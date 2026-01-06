"""API endpoints for engagement scoring system.

Provides endpoints for:
- Recording engagement events
- Viewing engagement scores and predictions
- Managing follow-up recommendations
- Engagement analytics dashboard

Feature: Automated Engagement Scoring System
"""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Any, List, Optional
from uuid import UUID

from app.api.dependencies import get_current_user, require_permissions
from app.repositories.engagement_repository import (
    EngagementRepository,
    get_engagement_repository,
)
from app.services.engagement_scoring_service import (
    EngagementScoringService,
    ClientNotFoundError,
    get_engagement_scoring_service,
)


router = APIRouter()


# =========================================================================
# Request/Response Schemas
# =========================================================================


class RecordEventRequest(BaseModel):
    """Request to record an engagement event."""

    client_id: UUID = Field(..., description="Client who performed the action")
    event_type: str = Field(
        ...,
        description="Type of engagement event",
        pattern="^(gallery_view|gallery_view_duration|photo_view|favorite_added|favorite_removed|selection_made|selection_removed|download_initiated|download_completed|rsvp_submitted|rsvp_updated|comment_added|share_created|share_accessed|email_opened|email_clicked|email_bounced|payment_received|invoice_viewed|magic_link_accessed|qr_code_scanned)$",
    )
    gallery_id: Optional[UUID] = Field(None, description="Related gallery")
    asset_id: Optional[UUID] = Field(None, description="Related asset")
    invitation_id: Optional[UUID] = Field(None, description="Related invitation")
    metadata: Optional[dict] = Field(default_factory=dict, description="Additional event data")
    source: str = Field(default="web", description="Event source")
    device_type: Optional[str] = Field(None, description="Device type")


class EventResponse(BaseModel):
    """Response for recorded event."""

    event_id: str
    event_type: str
    event_timestamp: str
    created_at: str
    score_updated: bool = False
    new_score: Optional[float] = None
    score_tier: Optional[str] = None


class ScoreComponentsResponse(BaseModel):
    """Score component breakdown."""

    activity: float
    engagement_depth: float
    conversion: float
    responsiveness: float
    loyalty: float


class ScoreTrendResponse(BaseModel):
    """Score trend information."""

    direction: str
    velocity: float


class ScoreMetricsResponse(BaseModel):
    """Score metrics."""

    days_since_last_activity: Optional[int]
    interactions_30d: int
    interactions_90d: int


class EngagementScoreResponse(BaseModel):
    """Full engagement score response."""

    client_id: str
    client_name: str
    total_score: float
    score_tier: str
    components: ScoreComponentsResponse
    trend: ScoreTrendResponse
    metrics: ScoreMetricsResponse
    score_id: str
    last_calculated_at: str


class HighIntentResponse(BaseModel):
    """High-intent prediction."""

    score: float
    signals: List[dict]


class ChurnRiskResponse(BaseModel):
    """Churn risk prediction."""

    score: float
    factors: List[dict]


class PredictionsResponse(BaseModel):
    """Predictions summary."""

    conversion_probability: float
    ltv_tier: str


class UrgencyResponse(BaseModel):
    """Urgency indicators."""

    requires_immediate_action: bool
    action_deadline: Optional[str]


class PredictiveScoreResponse(BaseModel):
    """Full predictive score response."""

    client_id: str
    high_intent: HighIntentResponse
    churn_risk: ChurnRiskResponse
    predictions: PredictionsResponse
    urgency: UrgencyResponse
    prediction_id: str
    predicted_at: str


class RecommendationResponse(BaseModel):
    """Follow-up recommendation."""

    recommendation_id: str
    recommendation_type: str
    priority: str
    optimal_contact_time: Optional[str]
    optimal_day_of_week: Optional[str]
    optimal_time_of_day: Optional[str]
    subject_suggestion: Optional[str]
    message_template: Optional[str]
    trigger_reason: str
    supporting_data: dict
    highlighted_asset_ids: List[str]
    offer_details: Optional[dict]
    status: str
    scheduled_for: Optional[str]
    created_at: str
    expires_at: Optional[str]


class PendingRecommendationResponse(BaseModel):
    """Pending recommendation with client info."""

    recommendation_id: str
    client_id: str
    client_name: str
    recommendation_type: str
    priority: str
    optimal_contact_time: Optional[str]
    subject_suggestion: Optional[str]
    trigger_reason: str
    engagement_score: Optional[float]
    score_tier: Optional[str]
    high_intent_score: Optional[float]
    churn_risk_score: Optional[float]
    created_at: str
    expires_at: Optional[str]


class UpdateRecommendationRequest(BaseModel):
    """Request to update recommendation status."""

    status: str = Field(
        ...,
        pattern="^(pending|scheduled|sent|completed|dismissed|expired)$",
    )
    outcome: Optional[str] = Field(
        None,
        pattern="^(converted|responded|viewed|ignored|bounced|unsubscribed)$",
    )
    dismissed_reason: Optional[str] = None


class TierDistributionResponse(BaseModel):
    """Tier distribution summary."""

    champion: int = 0
    hot: int = 0
    warm: int = 0
    cool: int = 0
    cold: int = 0
    at_risk: int = 0
    churned: int = 0


class DashboardSummaryResponse(BaseModel):
    """Dashboard summary statistics."""

    total_scored_clients: int
    engaged_clients: int
    at_risk_clients: int
    engagement_rate: float


class HighIntentClientResponse(BaseModel):
    """High-intent client summary."""

    client_id: str
    client_name: str
    high_intent_score: float
    high_intent_signals: List[dict]
    predicted_conversion_probability: Optional[float]
    requires_immediate_action: bool
    engagement_score: Optional[float]
    score_tier: Optional[str]


class ChurnRiskClientResponse(BaseModel):
    """Churn risk client summary."""

    client_id: str
    client_name: str
    churn_risk_score: float
    churn_risk_factors: List[dict]
    requires_immediate_action: bool
    recommended_action_deadline: Optional[str]
    engagement_score: Optional[float]
    score_tier: Optional[str]
    days_since_last_activity: Optional[int]


class EngagementDashboardResponse(BaseModel):
    """Full engagement dashboard response."""

    summary: DashboardSummaryResponse
    tier_distribution: TierDistributionResponse
    high_intent_clients: List[HighIntentClientResponse]
    churn_risk_clients: List[ChurnRiskClientResponse]
    pending_recommendations: List[PendingRecommendationResponse]
    generated_at: str


class ScoreListItemResponse(BaseModel):
    """Score list item."""

    score_id: str
    client_id: str
    client_name: str
    client_status: str
    total_score: float
    score_tier: str
    activity_score: float
    engagement_depth_score: float
    conversion_score: float
    responsiveness_score: float
    loyalty_score: float
    score_trend: str
    days_since_last_activity: Optional[int]
    total_interactions_30d: int
    last_calculated_at: Optional[str]


class PaginationMeta(BaseModel):
    """Pagination metadata."""

    total: int
    limit: int
    offset: int


class ScoreListResponse(BaseModel):
    """Paginated score list response."""

    scores: List[ScoreListItemResponse]
    meta: PaginationMeta


class EventListItemResponse(BaseModel):
    """Event list item."""

    event_id: str
    event_type: str
    gallery_id: Optional[str]
    asset_id: Optional[str]
    invitation_id: Optional[str]
    metadata: dict
    source: Optional[str]
    device_type: Optional[str]
    engagement_value: float
    event_timestamp: str
    created_at: str


class EventListResponse(BaseModel):
    """Paginated event list response."""

    events: List[EventListItemResponse]
    meta: PaginationMeta


class RecalculateResponse(BaseModel):
    """Recalculation result."""

    workspace_id: str
    total_clients: int
    processed: int
    errors: int


class ScoreHistoryItemResponse(BaseModel):
    """Score history item."""

    history_id: str
    total_score: float
    score_tier: str
    activity_score: Optional[float]
    engagement_depth_score: Optional[float]
    conversion_score: Optional[float]
    responsiveness_score: Optional[float]
    loyalty_score: Optional[float]
    high_intent_score: Optional[float]
    churn_risk_score: Optional[float]
    period_start: str
    period_end: str
    recorded_at: str


# =========================================================================
# Events Endpoints
# =========================================================================


@router.post("/events", response_model=EventResponse)
async def record_engagement_event(
    workspace_id: UUID,
    request: RecordEventRequest,
    current_user: dict = Depends(get_current_user),
    _: None = Depends(require_permissions("clients:write")),
    service: EngagementScoringService = Depends(get_engagement_scoring_service),
) -> EventResponse:
    """Record an engagement event.

    Records a client interaction event and triggers score recalculation.
    Events are weighted based on type and contribute to engagement scores.
    """
    if str(current_user.get("workspace_id")) != str(workspace_id):
        raise HTTPException(status_code=403, detail="Access denied to this workspace")

    try:
        result = await service.record_event(
            workspace_id=workspace_id,
            client_id=request.client_id,
            event_type=request.event_type,
            gallery_id=request.gallery_id,
            asset_id=request.asset_id,
            invitation_id=request.invitation_id,
            metadata=request.metadata,
            source=request.source,
            device_type=request.device_type,
        )
        return EventResponse(**result)
    except ClientNotFoundError:
        raise HTTPException(status_code=404, detail="Client not found")


@router.get("/clients/{client_id}/events", response_model=EventListResponse)
async def get_client_events(
    workspace_id: UUID,
    client_id: UUID,
    event_types: Optional[str] = Query(None, description="Comma-separated event types"),
    start_date: Optional[datetime] = Query(None, description="Start date filter"),
    end_date: Optional[datetime] = Query(None, description="End date filter"),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: dict = Depends(get_current_user),
    _: None = Depends(require_permissions("clients:read")),
    repository: EngagementRepository = Depends(get_engagement_repository),
) -> EventListResponse:
    """Get engagement events for a client."""
    if str(current_user.get("workspace_id")) != str(workspace_id):
        raise HTTPException(status_code=403, detail="Access denied to this workspace")

    types_list = event_types.split(",") if event_types else None

    result = await repository.get_client_events(
        workspace_id=workspace_id,
        client_id=client_id,
        event_types=types_list,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
        offset=offset,
    )
    return EventListResponse(**result)


# =========================================================================
# Scores Endpoints
# =========================================================================


@router.get("/scores", response_model=ScoreListResponse)
async def get_engagement_scores(
    workspace_id: UUID,
    tier: Optional[str] = Query(
        None,
        description="Filter by tier",
        pattern="^(champion|hot|warm|cool|cold|at_risk|churned)$",
    ),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: dict = Depends(get_current_user),
    _: None = Depends(require_permissions("clients:read")),
    repository: EngagementRepository = Depends(get_engagement_repository),
) -> ScoreListResponse:
    """Get engagement scores for all clients.

    Returns paginated list of engagement scores, optionally filtered by tier.
    """
    if str(current_user.get("workspace_id")) != str(workspace_id):
        raise HTTPException(status_code=403, detail="Access denied to this workspace")

    result = await repository.get_scores_by_tier(
        workspace_id=workspace_id,
        tier=tier,
        limit=limit,
        offset=offset,
    )
    return ScoreListResponse(**result)


@router.get("/clients/{client_id}/score", response_model=EngagementScoreResponse)
async def get_client_score(
    workspace_id: UUID,
    client_id: UUID,
    current_user: dict = Depends(get_current_user),
    _: None = Depends(require_permissions("clients:read")),
    service: EngagementScoringService = Depends(get_engagement_scoring_service),
) -> EngagementScoreResponse:
    """Get engagement score for a specific client.

    Returns full score breakdown with components, trend, and metrics.
    """
    if str(current_user.get("workspace_id")) != str(workspace_id):
        raise HTTPException(status_code=403, detail="Access denied to this workspace")

    try:
        result = await service.calculate_score(workspace_id, client_id)
        return EngagementScoreResponse(**result)
    except ClientNotFoundError:
        raise HTTPException(status_code=404, detail="Client not found")


@router.post("/clients/{client_id}/score/recalculate", response_model=EngagementScoreResponse)
async def recalculate_client_score(
    workspace_id: UUID,
    client_id: UUID,
    current_user: dict = Depends(get_current_user),
    _: None = Depends(require_permissions("clients:write")),
    service: EngagementScoringService = Depends(get_engagement_scoring_service),
) -> EngagementScoreResponse:
    """Force recalculation of engagement score for a client."""
    if str(current_user.get("workspace_id")) != str(workspace_id):
        raise HTTPException(status_code=403, detail="Access denied to this workspace")

    try:
        result = await service.calculate_score(workspace_id, client_id)
        return EngagementScoreResponse(**result)
    except ClientNotFoundError:
        raise HTTPException(status_code=404, detail="Client not found")


@router.get("/clients/{client_id}/score/history", response_model=List[ScoreHistoryItemResponse])
async def get_client_score_history(
    workspace_id: UUID,
    client_id: UUID,
    snapshot_type: str = Query(default="daily", pattern="^(daily|weekly|monthly)$"),
    limit: int = Query(default=30, ge=1, le=90),
    current_user: dict = Depends(get_current_user),
    _: None = Depends(require_permissions("clients:read")),
    repository: EngagementRepository = Depends(get_engagement_repository),
) -> List[ScoreHistoryItemResponse]:
    """Get historical engagement scores for a client."""
    if str(current_user.get("workspace_id")) != str(workspace_id):
        raise HTTPException(status_code=403, detail="Access denied to this workspace")

    result = await repository.get_score_history(
        workspace_id=workspace_id,
        client_id=client_id,
        snapshot_type=snapshot_type,
        limit=limit,
    )
    return [ScoreHistoryItemResponse(**item) for item in result]


# =========================================================================
# Predictive Scores Endpoints
# =========================================================================


@router.get("/clients/{client_id}/predictions", response_model=PredictiveScoreResponse)
async def get_client_predictions(
    workspace_id: UUID,
    client_id: UUID,
    current_user: dict = Depends(get_current_user),
    _: None = Depends(require_permissions("clients:read")),
    service: EngagementScoringService = Depends(get_engagement_scoring_service),
) -> PredictiveScoreResponse:
    """Get predictive scores for a client.

    Returns high-intent score, churn risk, and conversion predictions.
    """
    if str(current_user.get("workspace_id")) != str(workspace_id):
        raise HTTPException(status_code=403, detail="Access denied to this workspace")

    try:
        result = await service.calculate_predictive_scores(workspace_id, client_id)
        return PredictiveScoreResponse(**result)
    except ClientNotFoundError:
        raise HTTPException(status_code=404, detail="Client not found")


@router.get("/high-intent", response_model=List[HighIntentClientResponse])
async def get_high_intent_clients(
    workspace_id: UUID,
    min_score: float = Query(default=70, ge=0, le=100),
    limit: int = Query(default=20, ge=1, le=50),
    current_user: dict = Depends(get_current_user),
    _: None = Depends(require_permissions("clients:read")),
    repository: EngagementRepository = Depends(get_engagement_repository),
) -> List[HighIntentClientResponse]:
    """Get clients with high intent scores.

    Returns clients most likely to convert based on engagement patterns.
    """
    if str(current_user.get("workspace_id")) != str(workspace_id):
        raise HTTPException(status_code=403, detail="Access denied to this workspace")

    result = await repository.get_high_intent_clients(
        workspace_id=workspace_id,
        min_score=min_score,
        limit=limit,
    )
    return [HighIntentClientResponse(**item) for item in result]


@router.get("/churn-risk", response_model=List[ChurnRiskClientResponse])
async def get_churn_risk_clients(
    workspace_id: UUID,
    min_score: float = Query(default=60, ge=0, le=100),
    limit: int = Query(default=20, ge=1, le=50),
    current_user: dict = Depends(get_current_user),
    _: None = Depends(require_permissions("clients:read")),
    repository: EngagementRepository = Depends(get_engagement_repository),
) -> List[ChurnRiskClientResponse]:
    """Get clients with high churn risk.

    Returns clients at risk of disengaging based on activity patterns.
    """
    if str(current_user.get("workspace_id")) != str(workspace_id):
        raise HTTPException(status_code=403, detail="Access denied to this workspace")

    result = await repository.get_churn_risk_clients(
        workspace_id=workspace_id,
        min_score=min_score,
        limit=limit,
    )
    return [ChurnRiskClientResponse(**item) for item in result]


# =========================================================================
# Recommendations Endpoints
# =========================================================================


@router.get("/clients/{client_id}/recommendations", response_model=List[RecommendationResponse])
async def get_client_recommendations(
    workspace_id: UUID,
    client_id: UUID,
    status: Optional[str] = Query(
        None,
        pattern="^(pending|scheduled|sent|completed|dismissed|expired)$",
    ),
    limit: int = Query(default=10, ge=1, le=50),
    current_user: dict = Depends(get_current_user),
    _: None = Depends(require_permissions("clients:read")),
    repository: EngagementRepository = Depends(get_engagement_repository),
) -> List[RecommendationResponse]:
    """Get follow-up recommendations for a client."""
    if str(current_user.get("workspace_id")) != str(workspace_id):
        raise HTTPException(status_code=403, detail="Access denied to this workspace")

    result = await repository.get_client_recommendations(
        workspace_id=workspace_id,
        client_id=client_id,
        status=status,
        limit=limit,
    )
    return [RecommendationResponse(**item) for item in result]


@router.post("/clients/{client_id}/recommendations/generate", response_model=List[RecommendationResponse])
async def generate_client_recommendations(
    workspace_id: UUID,
    client_id: UUID,
    current_user: dict = Depends(get_current_user),
    _: None = Depends(require_permissions("clients:write")),
    service: EngagementScoringService = Depends(get_engagement_scoring_service),
) -> List[RecommendationResponse]:
    """Generate new follow-up recommendations for a client.

    Analyzes engagement patterns and creates personalized recommendations
    for email timing, photo highlights, special offers, and check-ins.
    """
    if str(current_user.get("workspace_id")) != str(workspace_id):
        raise HTTPException(status_code=403, detail="Access denied to this workspace")

    try:
        result = await service.generate_recommendations(workspace_id, client_id)
        return [RecommendationResponse(**item) for item in result]
    except ClientNotFoundError:
        raise HTTPException(status_code=404, detail="Client not found")


@router.get("/recommendations", response_model=List[PendingRecommendationResponse])
async def get_pending_recommendations(
    workspace_id: UUID,
    recommendation_types: Optional[str] = Query(
        None,
        description="Comma-separated recommendation types",
    ),
    priority: Optional[str] = Query(
        None,
        pattern="^(urgent|high|medium|low)$",
    ),
    limit: int = Query(default=50, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    _: None = Depends(require_permissions("clients:read")),
    repository: EngagementRepository = Depends(get_engagement_repository),
) -> List[PendingRecommendationResponse]:
    """Get all pending follow-up recommendations.

    Returns recommendations across all clients, sorted by priority.
    """
    if str(current_user.get("workspace_id")) != str(workspace_id):
        raise HTTPException(status_code=403, detail="Access denied to this workspace")

    types_list = recommendation_types.split(",") if recommendation_types else None

    result = await repository.get_pending_recommendations(
        workspace_id=workspace_id,
        recommendation_types=types_list,
        priority=priority,
        limit=limit,
    )
    return [PendingRecommendationResponse(**item) for item in result]


@router.patch("/recommendations/{recommendation_id}")
async def update_recommendation_status(
    workspace_id: UUID,
    recommendation_id: UUID,
    request: UpdateRecommendationRequest,
    current_user: dict = Depends(get_current_user),
    _: None = Depends(require_permissions("clients:write")),
    repository: EngagementRepository = Depends(get_engagement_repository),
) -> dict:
    """Update recommendation status.

    Use to mark recommendations as completed, dismissed, etc.
    """
    if str(current_user.get("workspace_id")) != str(workspace_id):
        raise HTTPException(status_code=403, detail="Access denied to this workspace")

    success = await repository.update_recommendation_status(
        workspace_id=workspace_id,
        recommendation_id=recommendation_id,
        status=request.status,
        outcome=request.outcome,
        dismissed_reason=request.dismissed_reason,
    )

    if not success:
        raise HTTPException(status_code=404, detail="Recommendation not found")

    return {"success": True, "message": f"Recommendation status updated to {request.status}"}


# =========================================================================
# Dashboard Endpoint
# =========================================================================


@router.get("/dashboard", response_model=EngagementDashboardResponse)
async def get_engagement_dashboard(
    workspace_id: UUID,
    current_user: dict = Depends(get_current_user),
    _: None = Depends(require_permissions("clients:read")),
    service: EngagementScoringService = Depends(get_engagement_scoring_service),
) -> EngagementDashboardResponse:
    """Get engagement dashboard summary.

    Returns comprehensive overview including:
    - Summary statistics
    - Tier distribution
    - High-intent clients
    - Churn risk clients
    - Pending recommendations
    """
    if str(current_user.get("workspace_id")) != str(workspace_id):
        raise HTTPException(status_code=403, detail="Access denied to this workspace")

    result = await service.get_engagement_dashboard(workspace_id)
    return EngagementDashboardResponse(**result)


# =========================================================================
# Bulk Operations
# =========================================================================


@router.post("/scores/recalculate-all", response_model=RecalculateResponse)
async def recalculate_all_scores(
    workspace_id: UUID,
    current_user: dict = Depends(get_current_user),
    _: None = Depends(require_permissions("admin:write")),
    service: EngagementScoringService = Depends(get_engagement_scoring_service),
) -> RecalculateResponse:
    """Recalculate engagement scores for all clients.

    Admin-only operation to refresh all scores.
    """
    if str(current_user.get("workspace_id")) != str(workspace_id):
        raise HTTPException(status_code=403, detail="Access denied to this workspace")

    result = await service.recalculate_all_scores(workspace_id)
    return RecalculateResponse(**result)


@router.get("/tier-distribution", response_model=TierDistributionResponse)
async def get_tier_distribution(
    workspace_id: UUID,
    current_user: dict = Depends(get_current_user),
    _: None = Depends(require_permissions("clients:read")),
    repository: EngagementRepository = Depends(get_engagement_repository),
) -> TierDistributionResponse:
    """Get distribution of clients across engagement tiers."""
    if str(current_user.get("workspace_id")) != str(workspace_id):
        raise HTTPException(status_code=403, detail="Access denied to this workspace")

    result = await repository.get_tier_distribution(workspace_id)
    return TierDistributionResponse(**result)
