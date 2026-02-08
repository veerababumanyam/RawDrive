"""API endpoints for churn prediction and prevention system.

Provides endpoints for:
- Churn prediction and risk assessment
- At-risk client dashboard
- Intervention campaign management
- A/B experiment management
- Performance analytics

Feature: Churn Prediction & Prevention System
"""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Path
from pydantic import BaseModel, Field
from typing import Any
from uuid import UUID

from app.api.dependencies import get_current_user, require_permissions
from app.services.churn_prediction_service import (
    ChurnPredictionService,
    get_churn_prediction_service,
    ClientNotFoundError,
)
from app.services.intervention_campaign_service import (
    InterventionCampaignService,
    get_intervention_campaign_service,
    CampaignType,
    CampaignStatus,
    OfferType,
    ActionOutcome,
)
from app.services.ab_testing_service import (
    ABTestingService,
    get_ab_testing_service,
    ExperimentStatus,
)


router = APIRouter()


# =========================================================================
# Request/Response Schemas
# =========================================================================


class RiskFactorResponse(BaseModel):
    """A churn risk factor."""

    factor: str
    description: str
    weight: float
    severity: str


class ChurnPredictionResponse(BaseModel):
    """Churn prediction for a client."""

    client_id: str
    client_name: str
    churn_score: float
    risk_tier: str
    risk_factors: list[RiskFactorResponse]
    prediction: dict[str, Any]
    recommendation: dict[str, Any]
    model: dict[str, Any]
    prediction_id: str
    predicted_at: str
    expires_at: str


class AtRiskClientResponse(BaseModel):
    """At-risk client in dashboard."""

    client_id: str
    client_name: str
    client_status: str
    churn_score: float
    risk_tier: str
    risk_factors: list[dict[str, Any]]
    predicted_churn_window_days: int | None
    recommended_intervention: str | None
    urgency: str | None
    usage_trend: str | None
    engagement_score: float | None
    days_since_last_activity: int | None
    predicted_at: str | None


class ChurnDashboardResponse(BaseModel):
    """Churn prevention dashboard data."""

    summary: dict[str, Any]
    risk_distribution: dict[str, int]
    intervention_performance: dict[str, Any]
    generated_at: str


class BatchPredictionResponse(BaseModel):
    """Batch prediction result."""

    workspace_id: str
    total_clients: int
    processed: int
    errors: int
    high_risk_clients: int


class CreateCampaignRequest(BaseModel):
    """Request to create an intervention campaign."""

    campaign_name: str = Field(..., min_length=1, max_length=100)
    campaign_type: str = Field(..., description="Campaign type")
    campaign_content: dict[str, Any] = Field(default_factory=dict)
    target_risk_tiers: list[str] | None = Field(default=None)
    target_min_churn_score: float = Field(default=60.0, ge=0, le=100)
    target_usage_trends: list[str] | None = Field(default=None)
    exclude_active_campaigns: bool = Field(default=True)
    exclude_recent_intervention_days: int = Field(default=14, ge=0)
    trigger_delay_hours: int = Field(default=0, ge=0)
    send_time_preference: str = Field(default="optimal")
    timezone_aware: bool = Field(default=True)
    offer_type: str | None = Field(default=None)
    offer_value: float | None = Field(default=None, ge=0)
    offer_expires_days: int = Field(default=7, ge=1)


class CampaignResponse(BaseModel):
    """Campaign response."""

    campaign_id: str
    workspace_id: str
    campaign_name: str
    campaign_type: str
    status: str
    target_risk_tiers: list[str]
    target_min_churn_score: float
    total_triggered: int
    total_delivered: int
    total_converted: int
    conversion_rate: float | None
    created_at: str
    activated_at: str | None


class UpdateCampaignStatusRequest(BaseModel):
    """Request to update campaign status."""

    status: str = Field(..., description="New status")


class TriggerInterventionRequest(BaseModel):
    """Request to trigger an intervention."""

    campaign_id: str = Field(..., description="Campaign ID")
    experiment_id: str | None = Field(default=None)
    force: bool = Field(default=False)


class InterventionResultResponse(BaseModel):
    """Intervention trigger result."""

    success: bool
    action_id: str | None
    client_id: str | None
    campaign_id: str | None
    action_type: str | None
    offer_code: str | None
    scheduled_for: str | None
    error_message: str | None
    skipped_reason: str | None


class BatchInterventionResponse(BaseModel):
    """Batch intervention result."""

    total_eligible: int
    triggered: int
    skipped: int
    failed: int
    action_ids: list[str]
    errors: list[dict[str, Any]]


class RecordOutcomeRequest(BaseModel):
    """Request to record intervention outcome."""

    outcome: str = Field(..., description="Outcome type")
    revenue_impact: float | None = Field(default=None)
    attributed: bool = Field(default=False)
    attribution_confidence: float | None = Field(default=None, ge=0, le=1)


class CreateExperimentRequest(BaseModel):
    """Request to create an A/B experiment."""

    experiment_name: str = Field(..., min_length=1, max_length=100)
    hypothesis: str | None = Field(default=None)
    target_campaign_id: str | None = Field(default=None)
    target_risk_tiers: list[str] | None = Field(default=None)
    min_sample_size: int = Field(default=100, ge=10)
    traffic_percentage: float = Field(default=100.0, ge=0, le=100)
    start_date: datetime | None = Field(default=None)
    end_date: datetime | None = Field(default=None)
    auto_conclude_on_significance: bool = Field(default=True)
    significance_level: float = Field(default=0.05, gt=0, lt=1)
    minimum_detectable_effect: float = Field(default=0.10, gt=0, lt=1)
    primary_metric: str = Field(default="conversion_rate")
    secondary_metrics: list[str] | None = Field(default=None)
    variants: list[dict[str, Any]] | None = Field(default=None)


class ExperimentResponse(BaseModel):
    """Experiment response."""

    experiment_id: str
    workspace_id: str
    experiment_name: str
    hypothesis: str | None
    status: str
    start_date: str | None
    end_date: str | None
    statistical_significance_reached: bool
    winner_variant_id: str | None
    variants: list[dict[str, Any]]
    current_results: dict[str, Any]
    created_at: str


class AddVariantRequest(BaseModel):
    """Request to add an experiment variant."""

    variant_name: str = Field(..., min_length=1, max_length=50)
    variant_config: dict[str, Any] = Field(default_factory=dict)
    traffic_weight: int = Field(default=50, ge=1, le=100)
    is_control: bool = Field(default=False)
    description: str | None = Field(default=None)


class ExperimentAnalysisResponse(BaseModel):
    """Experiment analysis results."""

    experiment_id: str
    experiment_name: str
    status: str
    primary_metric: str
    sample_sizes: dict[str, int]
    variants: list[dict[str, Any]]
    significance_reached: bool
    winner: dict[str, Any] | None
    recommendation: str


class SampleSizeEstimateResponse(BaseModel):
    """Sample size estimation."""

    baseline_conversion_rate: float
    minimum_detectable_effect: float
    significance_level: float
    power: float
    sample_size_per_variant: int
    total_sample_for_2_variants: int
    total_sample_for_3_variants: int


class CampaignPerformanceResponse(BaseModel):
    """Campaign performance metrics."""

    campaign_id: str
    campaign_name: str
    campaign_type: str
    status: str
    total_triggered: int
    total_delivered: int
    total_opened: int
    total_clicked: int
    total_converted: int
    delivery_rate: float
    open_rate: float
    click_rate: float
    conversion_rate: float
    total_revenue_saved: float
    avg_revenue_per_conversion: float | None
    created_at: str
    activated_at: str | None


# =========================================================================
# Churn Prediction Endpoints
# =========================================================================


@router.get(
    "/predictions/{client_id}",
    response_model=ChurnPredictionResponse,
    summary="Get churn prediction for a client",
    description="Calculate and return churn prediction with risk factors and recommendations.",
)
async def get_churn_prediction(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    client_id: UUID = Path(..., description="Client ID"),
    current_user: dict = Depends(get_current_user),
    churn_service: ChurnPredictionService = Depends(get_churn_prediction_service),
):
    """Get or calculate churn prediction for a client."""
    try:
        result = await churn_service.predict_churn(
            workspace_id=workspace_id,
            client_id=client_id,
        )
        return result
    except ClientNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {e}")


@router.post(
    "/predictions/batch",
    response_model=BatchPredictionResponse,
    summary="Run batch churn predictions",
    description="Run churn predictions for all clients in the workspace.",
)
async def run_batch_predictions(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    min_days: int = Query(default=1, ge=0, description="Min days since last prediction"),
    current_user: dict = Depends(get_current_user),
    churn_service: ChurnPredictionService = Depends(get_churn_prediction_service),
):
    """Run churn predictions for all active clients."""
    await require_permissions(current_user, workspace_id, ["manage_clients"])

    result = await churn_service.predict_all_clients(
        workspace_id=workspace_id,
        min_days_since_last_prediction=min_days,
    )
    return result


@router.get(
    "/at-risk",
    response_model=list[AtRiskClientResponse],
    summary="Get at-risk clients",
    description="Get clients at risk of churning, sorted by risk score.",
)
async def get_at_risk_clients(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    min_score: float = Query(default=40, ge=0, le=100, description="Minimum churn score"),
    limit: int = Query(default=50, ge=1, le=200, description="Maximum results"),
    current_user: dict = Depends(get_current_user),
    churn_service: ChurnPredictionService = Depends(get_churn_prediction_service),
):
    """Get clients at risk of churning."""
    result = await churn_service.get_at_risk_clients(
        workspace_id=workspace_id,
        min_score=min_score,
        limit=limit,
    )
    return result


@router.get(
    "/dashboard",
    response_model=ChurnDashboardResponse,
    summary="Get churn prevention dashboard",
    description="Get dashboard data with risk distribution and intervention performance.",
)
async def get_churn_dashboard(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    current_user: dict = Depends(get_current_user),
    churn_service: ChurnPredictionService = Depends(get_churn_prediction_service),
):
    """Get churn prevention dashboard data."""
    result = await churn_service.get_churn_dashboard(workspace_id=workspace_id)
    return result


# =========================================================================
# Campaign Management Endpoints
# =========================================================================


@router.post(
    "/campaigns",
    response_model=CampaignResponse,
    summary="Create intervention campaign",
    description="Create a new intervention campaign for churn prevention.",
)
async def create_campaign(
    request: CreateCampaignRequest,
    workspace_id: UUID = Path(..., description="Workspace ID"),
    current_user: dict = Depends(get_current_user),
    intervention_service: InterventionCampaignService = Depends(get_intervention_campaign_service),
):
    """Create a new intervention campaign."""
    await require_permissions(current_user, workspace_id, ["manage_campaigns"])

    try:
        campaign_type = CampaignType(request.campaign_type)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid campaign type. Valid types: {[t.value for t in CampaignType]}",
        )

    offer_type = None
    if request.offer_type:
        try:
            offer_type = OfferType(request.offer_type)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid offer type. Valid types: {[t.value for t in OfferType]}",
            )

    campaign = await intervention_service.create_campaign(
        workspace_id=workspace_id,
        campaign_name=request.campaign_name,
        campaign_type=campaign_type,
        campaign_content=request.campaign_content,
        target_risk_tiers=request.target_risk_tiers,
        target_min_churn_score=request.target_min_churn_score,
        target_usage_trends=request.target_usage_trends,
        exclude_active_campaigns=request.exclude_active_campaigns,
        exclude_recent_intervention_days=request.exclude_recent_intervention_days,
        trigger_delay_hours=request.trigger_delay_hours,
        send_time_preference=request.send_time_preference,
        timezone_aware=request.timezone_aware,
        offer_type=offer_type,
        offer_value=request.offer_value,
        offer_expires_days=request.offer_expires_days,
    )

    return {
        "campaign_id": str(campaign.campaign_id),
        "workspace_id": str(campaign.workspace_id),
        "campaign_name": campaign.campaign_name,
        "campaign_type": campaign.campaign_type.value,
        "status": campaign.status.value,
        "target_risk_tiers": campaign.target_risk_tiers,
        "target_min_churn_score": float(campaign.target_min_churn_score),
        "total_triggered": campaign.total_triggered,
        "total_delivered": campaign.total_delivered,
        "total_converted": campaign.total_converted,
        "conversion_rate": float(campaign.conversion_rate) if campaign.conversion_rate else None,
        "created_at": campaign.created_at.isoformat() if campaign.created_at else None,
        "activated_at": campaign.activated_at.isoformat() if campaign.activated_at else None,
    }


@router.get(
    "/campaigns",
    response_model=list[CampaignResponse],
    summary="List intervention campaigns",
    description="List all intervention campaigns in the workspace.",
)
async def list_campaigns(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    status: str | None = Query(default=None, description="Filter by status"),
    campaign_type: str | None = Query(default=None, description="Filter by type"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: dict = Depends(get_current_user),
    intervention_service: InterventionCampaignService = Depends(get_intervention_campaign_service),
):
    """List intervention campaigns."""
    status_enum = None
    if status:
        try:
            status_enum = CampaignStatus(status)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status. Valid values: {[s.value for s in CampaignStatus]}",
            )

    type_enum = None
    if campaign_type:
        try:
            type_enum = CampaignType(campaign_type)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid campaign type. Valid types: {[t.value for t in CampaignType]}",
            )

    campaigns = await intervention_service.list_campaigns(
        workspace_id=workspace_id,
        status=status_enum,
        campaign_type=type_enum,
        limit=limit,
        offset=offset,
    )

    return [
        {
            "campaign_id": str(c.campaign_id),
            "workspace_id": str(c.workspace_id),
            "campaign_name": c.campaign_name,
            "campaign_type": c.campaign_type.value,
            "status": c.status.value,
            "target_risk_tiers": c.target_risk_tiers,
            "target_min_churn_score": float(c.target_min_churn_score),
            "total_triggered": c.total_triggered,
            "total_delivered": c.total_delivered,
            "total_converted": c.total_converted,
            "conversion_rate": float(c.conversion_rate) if c.conversion_rate else None,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "activated_at": c.activated_at.isoformat() if c.activated_at else None,
        }
        for c in campaigns
    ]


@router.get(
    "/campaigns/{campaign_id}",
    response_model=dict[str, Any],
    summary="Get campaign details",
    description="Get detailed information about an intervention campaign.",
)
async def get_campaign(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    campaign_id: UUID = Path(..., description="Campaign ID"),
    current_user: dict = Depends(get_current_user),
    intervention_service: InterventionCampaignService = Depends(get_intervention_campaign_service),
):
    """Get campaign details."""
    campaign = await intervention_service.get_campaign(workspace_id, campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    return campaign.to_dict()


@router.patch(
    "/campaigns/{campaign_id}/status",
    response_model=CampaignResponse,
    summary="Update campaign status",
    description="Activate, pause, or complete a campaign.",
)
async def update_campaign_status(
    request: UpdateCampaignStatusRequest,
    workspace_id: UUID = Path(..., description="Workspace ID"),
    campaign_id: UUID = Path(..., description="Campaign ID"),
    current_user: dict = Depends(get_current_user),
    intervention_service: InterventionCampaignService = Depends(get_intervention_campaign_service),
):
    """Update campaign status."""
    await require_permissions(current_user, workspace_id, ["manage_campaigns"])

    try:
        status = CampaignStatus(request.status)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Valid values: {[s.value for s in CampaignStatus]}",
        )

    campaign = await intervention_service.update_campaign_status(
        workspace_id=workspace_id,
        campaign_id=campaign_id,
        status=status,
    )

    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    return {
        "campaign_id": str(campaign.campaign_id),
        "workspace_id": str(campaign.workspace_id),
        "campaign_name": campaign.campaign_name,
        "campaign_type": campaign.campaign_type.value,
        "status": campaign.status.value,
        "target_risk_tiers": campaign.target_risk_tiers,
        "target_min_churn_score": float(campaign.target_min_churn_score),
        "total_triggered": campaign.total_triggered,
        "total_delivered": campaign.total_delivered,
        "total_converted": campaign.total_converted,
        "conversion_rate": float(campaign.conversion_rate) if campaign.conversion_rate else None,
        "created_at": campaign.created_at.isoformat() if campaign.created_at else None,
        "activated_at": campaign.activated_at.isoformat() if campaign.activated_at else None,
    }


@router.get(
    "/campaigns/{campaign_id}/performance",
    response_model=CampaignPerformanceResponse,
    summary="Get campaign performance",
    description="Get detailed performance metrics for a campaign.",
)
async def get_campaign_performance(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    campaign_id: UUID = Path(..., description="Campaign ID"),
    current_user: dict = Depends(get_current_user),
    intervention_service: InterventionCampaignService = Depends(get_intervention_campaign_service),
):
    """Get campaign performance metrics."""
    performance = await intervention_service.get_campaign_performance(
        workspace_id=workspace_id,
        campaign_id=campaign_id,
    )

    if not performance:
        raise HTTPException(status_code=404, detail="Campaign not found")

    return {
        "campaign_id": str(performance.campaign_id),
        "campaign_name": performance.campaign_name,
        "campaign_type": performance.campaign_type,
        "status": performance.status,
        "total_triggered": performance.total_triggered,
        "total_delivered": performance.total_delivered,
        "total_opened": performance.total_opened,
        "total_clicked": performance.total_clicked,
        "total_converted": performance.total_converted,
        "delivery_rate": performance.delivery_rate,
        "open_rate": performance.open_rate,
        "click_rate": performance.click_rate,
        "conversion_rate": performance.conversion_rate,
        "total_revenue_saved": float(performance.total_revenue_saved),
        "avg_revenue_per_conversion": float(performance.avg_revenue_per_conversion) if performance.avg_revenue_per_conversion else None,
        "created_at": performance.created_at.isoformat() if performance.created_at else None,
        "activated_at": performance.activated_at.isoformat() if performance.activated_at else None,
    }


@router.get(
    "/campaigns/{campaign_id}/eligible-clients",
    response_model=list[dict[str, Any]],
    summary="Get eligible clients for campaign",
    description="Get clients that match campaign targeting criteria.",
)
async def get_eligible_clients(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    campaign_id: UUID = Path(..., description="Campaign ID"),
    limit: int = Query(default=100, ge=1, le=500),
    current_user: dict = Depends(get_current_user),
    intervention_service: InterventionCampaignService = Depends(get_intervention_campaign_service),
):
    """Get clients eligible for a campaign."""
    clients = await intervention_service.get_eligible_clients(
        workspace_id=workspace_id,
        campaign_id=campaign_id,
        limit=limit,
    )

    return [
        {
            "client_id": str(c.client_id),
            "client_name": c.client_name,
            "churn_score": float(c.churn_score),
            "risk_tier": c.risk_tier,
            "days_since_activity": c.days_since_activity,
            "engagement_score": float(c.engagement_score) if c.engagement_score else None,
            "recent_interventions_count": c.recent_interventions_count,
            "last_intervention_at": c.last_intervention_at.isoformat() if c.last_intervention_at else None,
        }
        for c in clients
    ]


# =========================================================================
# Intervention Triggering Endpoints
# =========================================================================


@router.post(
    "/interventions/trigger/{client_id}",
    response_model=InterventionResultResponse,
    summary="Trigger intervention for client",
    description="Trigger an intervention for a specific client.",
)
async def trigger_intervention(
    request: TriggerInterventionRequest,
    workspace_id: UUID = Path(..., description="Workspace ID"),
    client_id: UUID = Path(..., description="Client ID"),
    current_user: dict = Depends(get_current_user),
    intervention_service: InterventionCampaignService = Depends(get_intervention_campaign_service),
):
    """Trigger an intervention for a client."""
    await require_permissions(current_user, workspace_id, ["manage_clients"])

    result = await intervention_service.trigger_intervention(
        workspace_id=workspace_id,
        client_id=client_id,
        campaign_id=UUID(request.campaign_id),
        experiment_id=UUID(request.experiment_id) if request.experiment_id else None,
        force=request.force,
    )

    return {
        "success": result.success,
        "action_id": str(result.action_id) if result.action_id else None,
        "client_id": str(result.client_id) if result.client_id else None,
        "campaign_id": str(result.campaign_id) if result.campaign_id else None,
        "action_type": result.action_type.value if result.action_type else None,
        "offer_code": result.offer_code,
        "scheduled_for": result.scheduled_for.isoformat() if result.scheduled_for else None,
        "error_message": result.error_message,
        "skipped_reason": result.skipped_reason,
    }


@router.post(
    "/interventions/trigger-batch/{campaign_id}",
    response_model=BatchInterventionResponse,
    summary="Trigger batch interventions",
    description="Trigger interventions for all eligible clients in a campaign.",
)
async def trigger_batch_interventions(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    campaign_id: UUID = Path(..., description="Campaign ID"),
    max_interventions: int = Query(default=100, ge=1, le=500),
    experiment_id: str | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
    intervention_service: InterventionCampaignService = Depends(get_intervention_campaign_service),
):
    """Trigger batch interventions for a campaign."""
    await require_permissions(current_user, workspace_id, ["manage_campaigns"])

    result = await intervention_service.trigger_batch_interventions(
        workspace_id=workspace_id,
        campaign_id=campaign_id,
        max_interventions=max_interventions,
        experiment_id=UUID(experiment_id) if experiment_id else None,
    )

    return result


@router.post(
    "/interventions/{action_id}/outcome",
    summary="Record intervention outcome",
    description="Record the outcome of an intervention action.",
)
async def record_intervention_outcome(
    request: RecordOutcomeRequest,
    workspace_id: UUID = Path(..., description="Workspace ID"),
    action_id: UUID = Path(..., description="Action ID"),
    current_user: dict = Depends(get_current_user),
    intervention_service: InterventionCampaignService = Depends(get_intervention_campaign_service),
):
    """Record intervention outcome."""
    try:
        outcome = ActionOutcome(request.outcome)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid outcome. Valid values: {[o.value for o in ActionOutcome]}",
        )

    success = await intervention_service.record_action_outcome(
        action_id=action_id,
        workspace_id=workspace_id,
        outcome=outcome,
        revenue_impact=request.revenue_impact,
        attributed=request.attributed,
        attribution_confidence=request.attribution_confidence,
    )

    if not success:
        raise HTTPException(status_code=404, detail="Action not found")

    return {"status": "recorded", "action_id": str(action_id)}


@router.post(
    "/interventions/redeem-offer",
    summary="Redeem offer code",
    description="Record redemption of an offer code.",
)
async def redeem_offer(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    offer_code: str = Query(..., description="Offer code to redeem"),
    revenue_impact: float | None = Query(default=None, description="Revenue impact"),
    current_user: dict = Depends(get_current_user),
    intervention_service: InterventionCampaignService = Depends(get_intervention_campaign_service),
):
    """Redeem an offer code."""
    action = await intervention_service.record_offer_redeemed(
        offer_code=offer_code,
        workspace_id=workspace_id,
        revenue_impact=revenue_impact,
    )

    if not action:
        raise HTTPException(
            status_code=404,
            detail="Offer code not found or expired",
        )

    return {
        "status": "redeemed",
        "action_id": str(action.action_id),
        "client_id": str(action.client_id),
        "redeemed_at": action.offer_redeemed_at.isoformat() if action.offer_redeemed_at else None,
    }


@router.get(
    "/interventions/history/{client_id}",
    response_model=list[dict[str, Any]],
    summary="Get client intervention history",
    description="Get intervention history for a client.",
)
async def get_intervention_history(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    client_id: UUID = Path(..., description="Client ID"),
    limit: int = Query(default=20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    intervention_service: InterventionCampaignService = Depends(get_intervention_campaign_service),
):
    """Get intervention history for a client."""
    actions = await intervention_service.get_intervention_history(
        workspace_id=workspace_id,
        client_id=client_id,
        limit=limit,
    )

    return [a.to_dict() for a in actions]


# =========================================================================
# A/B Experiment Endpoints
# =========================================================================


@router.post(
    "/experiments",
    response_model=ExperimentResponse,
    summary="Create A/B experiment",
    description="Create a new A/B experiment for testing intervention strategies.",
)
async def create_experiment(
    request: CreateExperimentRequest,
    workspace_id: UUID = Path(..., description="Workspace ID"),
    current_user: dict = Depends(get_current_user),
    ab_service: ABTestingService = Depends(get_ab_testing_service),
):
    """Create a new A/B experiment."""
    await require_permissions(current_user, workspace_id, ["manage_campaigns"])

    experiment = await ab_service.create_experiment(
        workspace_id=workspace_id,
        experiment_name=request.experiment_name,
        hypothesis=request.hypothesis,
        target_campaign_id=UUID(request.target_campaign_id) if request.target_campaign_id else None,
        target_risk_tiers=request.target_risk_tiers,
        min_sample_size=request.min_sample_size,
        traffic_percentage=request.traffic_percentage,
        start_date=request.start_date,
        end_date=request.end_date,
        auto_conclude_on_significance=request.auto_conclude_on_significance,
        significance_level=request.significance_level,
        minimum_detectable_effect=request.minimum_detectable_effect,
        primary_metric=request.primary_metric,
        secondary_metrics=request.secondary_metrics,
        variants=request.variants,
    )

    return {
        "experiment_id": str(experiment.experiment_id),
        "workspace_id": str(experiment.workspace_id),
        "experiment_name": experiment.experiment_name,
        "hypothesis": experiment.hypothesis,
        "status": experiment.status.value,
        "start_date": experiment.start_date.isoformat() if experiment.start_date else None,
        "end_date": experiment.end_date.isoformat() if experiment.end_date else None,
        "statistical_significance_reached": experiment.statistical_significance_reached,
        "winner_variant_id": str(experiment.winner_variant_id) if experiment.winner_variant_id else None,
        "variants": [v.to_dict() for v in experiment.variants],
        "current_results": experiment.current_results,
        "created_at": experiment.created_at.isoformat() if experiment.created_at else None,
    }


@router.get(
    "/experiments",
    response_model=list[ExperimentResponse],
    summary="List experiments",
    description="List A/B experiments in the workspace.",
)
async def list_experiments(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    status: str | None = Query(default=None, description="Filter by status"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: dict = Depends(get_current_user),
    ab_service: ABTestingService = Depends(get_ab_testing_service),
):
    """List A/B experiments."""
    status_enum = None
    if status:
        try:
            status_enum = ExperimentStatus(status)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status. Valid values: {[s.value for s in ExperimentStatus]}",
            )

    experiments = await ab_service.list_experiments(
        workspace_id=workspace_id,
        status=status_enum,
        limit=limit,
        offset=offset,
    )

    return [
        {
            "experiment_id": str(e.experiment_id),
            "workspace_id": str(e.workspace_id),
            "experiment_name": e.experiment_name,
            "hypothesis": e.hypothesis,
            "status": e.status.value,
            "start_date": e.start_date.isoformat() if e.start_date else None,
            "end_date": e.end_date.isoformat() if e.end_date else None,
            "statistical_significance_reached": e.statistical_significance_reached,
            "winner_variant_id": str(e.winner_variant_id) if e.winner_variant_id else None,
            "variants": [v.to_dict() for v in e.variants],
            "current_results": e.current_results,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in experiments
    ]


@router.get(
    "/experiments/{experiment_id}",
    response_model=dict[str, Any],
    summary="Get experiment details",
    description="Get detailed information about an experiment.",
)
async def get_experiment(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    experiment_id: UUID = Path(..., description="Experiment ID"),
    current_user: dict = Depends(get_current_user),
    ab_service: ABTestingService = Depends(get_ab_testing_service),
):
    """Get experiment details."""
    experiment = await ab_service.get_experiment(workspace_id, experiment_id)
    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")

    return experiment.to_dict()


@router.post(
    "/experiments/{experiment_id}/start",
    response_model=ExperimentResponse,
    summary="Start experiment",
    description="Activate a draft experiment.",
)
async def start_experiment(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    experiment_id: UUID = Path(..., description="Experiment ID"),
    current_user: dict = Depends(get_current_user),
    ab_service: ABTestingService = Depends(get_ab_testing_service),
):
    """Start an experiment."""
    await require_permissions(current_user, workspace_id, ["manage_campaigns"])

    experiment = await ab_service.start_experiment(workspace_id, experiment_id)
    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found or already started")

    return {
        "experiment_id": str(experiment.experiment_id),
        "workspace_id": str(experiment.workspace_id),
        "experiment_name": experiment.experiment_name,
        "hypothesis": experiment.hypothesis,
        "status": experiment.status.value,
        "start_date": experiment.start_date.isoformat() if experiment.start_date else None,
        "end_date": experiment.end_date.isoformat() if experiment.end_date else None,
        "statistical_significance_reached": experiment.statistical_significance_reached,
        "winner_variant_id": str(experiment.winner_variant_id) if experiment.winner_variant_id else None,
        "variants": [v.to_dict() for v in experiment.variants],
        "current_results": experiment.current_results,
        "created_at": experiment.created_at.isoformat() if experiment.created_at else None,
    }


@router.post(
    "/experiments/{experiment_id}/pause",
    response_model=ExperimentResponse,
    summary="Pause experiment",
    description="Pause an active experiment.",
)
async def pause_experiment(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    experiment_id: UUID = Path(..., description="Experiment ID"),
    current_user: dict = Depends(get_current_user),
    ab_service: ABTestingService = Depends(get_ab_testing_service),
):
    """Pause an experiment."""
    await require_permissions(current_user, workspace_id, ["manage_campaigns"])

    experiment = await ab_service.pause_experiment(workspace_id, experiment_id)
    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")

    return {
        "experiment_id": str(experiment.experiment_id),
        "workspace_id": str(experiment.workspace_id),
        "experiment_name": experiment.experiment_name,
        "hypothesis": experiment.hypothesis,
        "status": experiment.status.value,
        "start_date": experiment.start_date.isoformat() if experiment.start_date else None,
        "end_date": experiment.end_date.isoformat() if experiment.end_date else None,
        "statistical_significance_reached": experiment.statistical_significance_reached,
        "winner_variant_id": str(experiment.winner_variant_id) if experiment.winner_variant_id else None,
        "variants": [v.to_dict() for v in experiment.variants],
        "current_results": experiment.current_results,
        "created_at": experiment.created_at.isoformat() if experiment.created_at else None,
    }


@router.post(
    "/experiments/{experiment_id}/conclude",
    response_model=ExperimentResponse,
    summary="Conclude experiment",
    description="Conclude an experiment with optional winner selection.",
)
async def conclude_experiment(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    experiment_id: UUID = Path(..., description="Experiment ID"),
    winner_variant_id: str | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
    ab_service: ABTestingService = Depends(get_ab_testing_service),
):
    """Conclude an experiment."""
    await require_permissions(current_user, workspace_id, ["manage_campaigns"])

    experiment = await ab_service.conclude_experiment(
        workspace_id=workspace_id,
        experiment_id=experiment_id,
        winner_variant_id=UUID(winner_variant_id) if winner_variant_id else None,
    )

    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")

    return {
        "experiment_id": str(experiment.experiment_id),
        "workspace_id": str(experiment.workspace_id),
        "experiment_name": experiment.experiment_name,
        "hypothesis": experiment.hypothesis,
        "status": experiment.status.value,
        "start_date": experiment.start_date.isoformat() if experiment.start_date else None,
        "end_date": experiment.end_date.isoformat() if experiment.end_date else None,
        "statistical_significance_reached": experiment.statistical_significance_reached,
        "winner_variant_id": str(experiment.winner_variant_id) if experiment.winner_variant_id else None,
        "variants": [v.to_dict() for v in experiment.variants],
        "current_results": experiment.current_results,
        "created_at": experiment.created_at.isoformat() if experiment.created_at else None,
    }


@router.post(
    "/experiments/{experiment_id}/variants",
    response_model=dict[str, Any],
    summary="Add variant to experiment",
    description="Add a new variant to a draft experiment.",
)
async def add_experiment_variant(
    request: AddVariantRequest,
    workspace_id: UUID = Path(..., description="Workspace ID"),
    experiment_id: UUID = Path(..., description="Experiment ID"),
    current_user: dict = Depends(get_current_user),
    ab_service: ABTestingService = Depends(get_ab_testing_service),
):
    """Add a variant to an experiment."""
    await require_permissions(current_user, workspace_id, ["manage_campaigns"])

    variant = await ab_service.add_variant(
        workspace_id=workspace_id,
        experiment_id=experiment_id,
        variant_name=request.variant_name,
        variant_config=request.variant_config,
        traffic_weight=request.traffic_weight,
        is_control=request.is_control,
        description=request.description,
    )

    if not variant:
        raise HTTPException(
            status_code=400,
            detail="Cannot add variant to active or concluded experiment",
        )

    return variant.to_dict()


@router.get(
    "/experiments/{experiment_id}/analyze",
    response_model=ExperimentAnalysisResponse,
    summary="Analyze experiment results",
    description="Get statistical analysis of experiment results.",
)
async def analyze_experiment(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    experiment_id: UUID = Path(..., description="Experiment ID"),
    current_user: dict = Depends(get_current_user),
    ab_service: ABTestingService = Depends(get_ab_testing_service),
):
    """Analyze experiment results."""
    result = await ab_service.analyze_experiment(workspace_id, experiment_id)

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return result


@router.get(
    "/experiments/sample-size-estimate",
    response_model=SampleSizeEstimateResponse,
    summary="Estimate sample size",
    description="Calculate required sample size for an experiment.",
)
async def estimate_sample_size(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    baseline_conversion_rate: float | None = Query(default=None, ge=0, lt=1),
    minimum_detectable_effect: float = Query(default=0.10, gt=0, lt=1),
    significance_level: float = Query(default=0.05, gt=0, lt=1),
    power: float = Query(default=0.80, gt=0, lt=1),
    current_user: dict = Depends(get_current_user),
    ab_service: ABTestingService = Depends(get_ab_testing_service),
):
    """Estimate required sample size."""
    result = await ab_service.estimate_sample_size(
        workspace_id=workspace_id,
        baseline_conversion_rate=baseline_conversion_rate,
        minimum_detectable_effect=minimum_detectable_effect,
        significance_level=significance_level,
        power=power,
    )

    return result
