"""
Invitation Analytics API Routes

Provides endpoints for tracking and retrieving invitation analytics.

Feature: 016-save-the-date Phase 12
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Request, Query
from pydantic import BaseModel

from app.api.dependencies import get_current_user
from app.services.invitation_analytics_service import (
    get_invitation_analytics_service,
    InvitationAnalyticsService,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Response Models
# ---------------------------------------------------------------------------


class DeviceBreakdown(BaseModel):
    device_type: str
    count: int


class BrowserBreakdown(BaseModel):
    browser: str
    count: int


class ViewsOverTime(BaseModel):
    date: str
    count: int


class ReferrerData(BaseModel):
    referrer: str
    count: int


class AnalyticsSummaryResponse(BaseModel):
    total_views: int
    unique_visitors: int
    device_breakdown: list[DeviceBreakdown]
    browser_breakdown: list[BrowserBreakdown]
    views_over_time: list[ViewsOverTime]
    top_referrers: list[ReferrerData]
    period_days: int


class RealtimeStatsResponse(BaseModel):
    active_viewers: int
    recent_views: int
    period_minutes: int


class ConversionStatsResponse(BaseModel):
    total_views: int
    total_rsvps: int
    conversion_rate: float


class TrackViewResponse(BaseModel):
    success: bool
    view_id: str


# ---------------------------------------------------------------------------
# Dependency
# ---------------------------------------------------------------------------


def get_service() -> InvitationAnalyticsService:
    return get_invitation_analytics_service()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/track", response_model=TrackViewResponse)
async def track_view(
    workspace_id: UUID,
    invitation_id: UUID,
    request: Request,
    visitor_id: Optional[str] = Query(None),
    service: InvitationAnalyticsService = Depends(get_service),
):
    """
    Track a view of an invitation.
    
    This endpoint should be called when a public invitation is accessed.
    It captures device type, browser, referrer, etc.
    """
    # Get request headers
    user_agent = request.headers.get("user-agent")
    referrer = request.headers.get("referer")
    
    # Get client IP (may be behind proxy)
    forwarded = request.headers.get("x-forwarded-for")
    ip_address = forwarded.split(",")[0].strip() if forwarded else request.client.host if request.client else None
    
    result = await service.track_view(
        workspace_id=workspace_id,
        invitation_id=invitation_id,
        user_agent=user_agent,
        ip_address=ip_address,
        referrer=referrer,
        visitor_id=visitor_id,
    )
    
    return TrackViewResponse(success=True, view_id=str(result["view_id"]))


@router.get("/summary", response_model=AnalyticsSummaryResponse)
async def get_analytics_summary(
    workspace_id: UUID,
    invitation_id: UUID,
    days: int = Query(30, ge=1, le=365),
    current_user: dict = Depends(get_current_user),
    service: InvitationAnalyticsService = Depends(get_service),
):
    """Get analytics summary for an invitation."""
    result = await service.get_analytics_summary(
        workspace_id=workspace_id,
        invitation_id=invitation_id,
        days=days,
    )
    
    return AnalyticsSummaryResponse(
        total_views=result["total_views"],
        unique_visitors=result["unique_visitors"],
        device_breakdown=[DeviceBreakdown(**d) for d in result["device_breakdown"]],
        browser_breakdown=[BrowserBreakdown(**b) for b in result["browser_breakdown"]],
        views_over_time=[ViewsOverTime(**v) for v in result["views_over_time"]],
        top_referrers=[ReferrerData(**r) for r in result["top_referrers"]],
        period_days=result["period_days"],
    )


@router.get("/realtime", response_model=RealtimeStatsResponse)
async def get_realtime_stats(
    workspace_id: UUID,
    invitation_id: UUID,
    minutes: int = Query(30, ge=1, le=60),
    current_user: dict = Depends(get_current_user),
    service: InvitationAnalyticsService = Depends(get_service),
):
    """Get real-time stats for an invitation."""
    result = await service.get_realtime_stats(
        workspace_id=workspace_id,
        invitation_id=invitation_id,
        minutes=minutes,
    )
    
    return RealtimeStatsResponse(**result)


@router.get("/conversion", response_model=ConversionStatsResponse)
async def get_conversion_stats(
    workspace_id: UUID,
    invitation_id: UUID,
    current_user: dict = Depends(get_current_user),
    service: InvitationAnalyticsService = Depends(get_service),
):
    """Get RSVP conversion statistics."""
    result = await service.get_conversion_stats(
        workspace_id=workspace_id,
        invitation_id=invitation_id,
    )
    
    return ConversionStatsResponse(**result)
