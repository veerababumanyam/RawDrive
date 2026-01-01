"""
Analytics API routes for the Invitations Microservice.

Provides invitation analytics endpoints for organizers:
- Overview statistics (views, RSVPs, devices)
- Detailed view statistics with time-series data
- RSVP response breakdown and timeline

All endpoints require authentication and workspace authorization.
Responses are cached for 10 minutes to optimize performance.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from src.api.v1.dependencies import get_current_user, CurrentUser
from src.logging import get_logger
from src.services.analytics_service import AnalyticsService

logger = get_logger(__name__)
router = APIRouter(tags=["Analytics"])


# =============================================================================
# Response Schemas
# =============================================================================


class ViewStats(BaseModel):
    """View statistics for an invitation."""

    total_views: int = Field(..., description="Total page views")
    unique_visitors: int = Field(..., description="Unique visitor count")
    views_today: int = Field(0, description="Views in last 24 hours")
    views_this_week: int = Field(0, description="Views in last 7 days")
    views_this_month: int = Field(0, description="Views in last 30 days")
    peak_hour: Optional[int] = Field(None, description="Hour with most views (0-23)")
    peak_day: Optional[str] = Field(None, description="Day with most views")


class DeviceStats(BaseModel):
    """Device breakdown for invitation views."""

    desktop: int = Field(0, description="Views from desktop browsers")
    mobile: int = Field(0, description="Views from mobile browsers")
    tablet: int = Field(0, description="Views from tablets")
    unknown: int = Field(0, description="Views from unidentified devices")
    browsers: dict = Field(default_factory=dict, description="Views by browser type")
    operating_systems: dict = Field(default_factory=dict, description="Views by OS")


class RSVPStats(BaseModel):
    """RSVP statistics for an invitation."""

    total_guests: int = Field(0, description="Total guests invited")
    responded: int = Field(0, description="Guests who responded")
    attending: int = Field(0, description="Guests attending (yes)")
    not_attending: int = Field(0, description="Guests not attending (no)")
    maybe: int = Field(0, description="Guests who might attend")
    pending: int = Field(0, description="Guests who haven't responded")
    response_rate: float = Field(0.0, description="Response rate (0-1)")
    total_plus_ones: int = Field(0, description="Total plus-ones")
    expected_attendance: int = Field(0, description="Attending + plus-ones")


class AnalyticsSummary(BaseModel):
    """Complete analytics summary."""

    invitation_id: str = Field(..., description="Invitation UUID")
    views: ViewStats = Field(..., description="View statistics")
    devices: DeviceStats = Field(..., description="Device breakdown")
    rsvp: RSVPStats = Field(..., description="RSVP statistics")
    generated_at: datetime = Field(..., description="When stats were generated")


class ViewDataPoint(BaseModel):
    """Single data point in views time series."""

    date: str = Field(..., description="Date in ISO format")
    views: int = Field(..., description="Total views on this date")
    unique: int = Field(..., description="Unique visitors on this date")


class DetailedViewStats(BaseModel):
    """Detailed view statistics with time series."""

    total_views: int = Field(..., description="Total views in period")
    unique_visitors: int = Field(..., description="Unique visitors in period")
    views_by_day: list[ViewDataPoint] = Field(default_factory=list, description="Daily breakdown")
    period_start: str = Field(..., description="Period start in ISO format")
    period_end: str = Field(..., description="Period end in ISO format")


class RSVPTimelinePoint(BaseModel):
    """Single data point in RSVP timeline."""

    date: str = Field(..., description="Date in ISO format")
    count: int = Field(..., description="RSVPs received on this date")


class DetailedRSVPStats(BaseModel):
    """Detailed RSVP statistics with timeline."""

    total_invited: int = Field(..., description="Total guests invited")
    responded: int = Field(..., description="Guests who responded")
    pending: int = Field(..., description="Guests who haven't responded")
    response_rate: float = Field(..., description="Response rate (0-1)")
    attending: int = Field(0, description="Guests attending (yes)")
    not_attending: int = Field(0, description="Guests not attending (no)")
    maybe: int = Field(0, description="Guests who might attend")
    plus_ones_total: int = Field(0, description="Total plus-ones")
    expected_attendees: int = Field(0, description="Expected total attendees")
    response_timeline: list[RSVPTimelinePoint] = Field(
        default_factory=list,
        description="RSVP responses over time",
    )


# =============================================================================
# Endpoints
# =============================================================================


@router.get(
    "/workspaces/{workspace_id}/invitations/{invitation_id}/analytics",
    response_model=AnalyticsSummary,
    summary="Get analytics summary",
)
async def get_analytics_summary(
    workspace_id: UUID,
    invitation_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Get comprehensive analytics for an invitation.

    Cached for 10 minutes. Analytics include:
    - View statistics (total, unique, trends)
    - Device breakdown (desktop/mobile, browsers)
    - RSVP statistics (response rate, attendance)
    """
    if str(current_user.workspace_id) != str(workspace_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to this workspace",
        )

    service = AnalyticsService()

    try:
        overview = await service.get_overview(str(workspace_id), str(invitation_id))
        device_stats = await service.get_device_stats(str(workspace_id), str(invitation_id))

        logger.info(
            "analytics_summary_fetched",
            workspace_id=str(workspace_id),
            invitation_id=str(invitation_id),
            user_id=str(current_user.user_id),
        )

        # Map device breakdown
        device_breakdown = overview.get("device_breakdown", {})
        device_detailed = device_stats.get("device_breakdown", {})

        return AnalyticsSummary(
            invitation_id=str(invitation_id),
            views=ViewStats(
                total_views=overview.get("total_views", 0),
                unique_visitors=overview.get("unique_visitors", 0),
                views_today=0,  # Would require additional query
                views_this_week=0,
                views_this_month=0,
            ),
            devices=DeviceStats(
                desktop=device_breakdown.get("desktop", 0),
                mobile=device_breakdown.get("mobile", 0),
                tablet=device_breakdown.get("tablet", 0),
                unknown=device_breakdown.get("unknown", 0),
                browsers=device_stats.get("browser_breakdown", {}),
                operating_systems={},
            ),
            rsvp=RSVPStats(
                total_guests=overview.get("rsvp_stats", {}).get("yes", 0)
                + overview.get("rsvp_stats", {}).get("no", 0)
                + overview.get("rsvp_stats", {}).get("maybe", 0),
                responded=overview.get("rsvp_stats", {}).get("yes", 0)
                + overview.get("rsvp_stats", {}).get("no", 0)
                + overview.get("rsvp_stats", {}).get("maybe", 0),
                attending=overview.get("rsvp_stats", {}).get("yes", 0),
                not_attending=overview.get("rsvp_stats", {}).get("no", 0),
                maybe=overview.get("rsvp_stats", {}).get("maybe", 0),
                pending=0,
                response_rate=0.0,
                total_plus_ones=overview.get("plus_ones_total", 0),
                expected_attendance=overview.get("expected_attendees", 0),
            ),
            generated_at=datetime.now(timezone.utc),
        )

    except Exception as e:
        logger.error(
            "analytics_summary_failed",
            workspace_id=str(workspace_id),
            invitation_id=str(invitation_id),
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch analytics",
        )


@router.get(
    "/workspaces/{workspace_id}/invitations/{invitation_id}/analytics/views",
    response_model=DetailedViewStats,
    summary="Get view statistics",
)
async def get_view_stats(
    workspace_id: UUID,
    invitation_id: UUID,
    period: str = Query("week", pattern="^(day|week|month|all)$"),
    start_date: Optional[str] = Query(
        None,
        description="Start date (ISO format). Overrides period if provided.",
    ),
    end_date: Optional[str] = Query(
        None,
        description="End date (ISO format). Default: now",
    ),
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Get view statistics for a specific time period.

    Cached for 10 minutes.
    """
    if str(current_user.workspace_id) != str(workspace_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to this workspace",
        )

    # Determine date range
    parsed_end = datetime.now(timezone.utc)
    parsed_start = None

    if start_date:
        try:
            parsed_start = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid start_date format. Use ISO 8601.",
            )
    else:
        # Use period-based calculation
        period_days = {"day": 1, "week": 7, "month": 30, "all": 365}
        parsed_start = parsed_end - timedelta(days=period_days.get(period, 7))

    if end_date:
        try:
            parsed_end = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid end_date format. Use ISO 8601.",
            )

    service = AnalyticsService()

    try:
        result = await service.get_view_stats(
            str(workspace_id),
            str(invitation_id),
            start_date=parsed_start,
            end_date=parsed_end,
        )

        logger.info(
            "view_stats_fetched",
            workspace_id=str(workspace_id),
            invitation_id=str(invitation_id),
            period=period,
        )

        return DetailedViewStats(
            total_views=result.get("total_views", 0),
            unique_visitors=result.get("unique_visitors", 0),
            views_by_day=[
                ViewDataPoint(**point)
                for point in result.get("views_by_day", [])
            ],
            period_start=result.get("period", {}).get("start", parsed_start.isoformat()),
            period_end=result.get("period", {}).get("end", parsed_end.isoformat()),
        )

    except Exception as e:
        logger.error(
            "view_stats_failed",
            workspace_id=str(workspace_id),
            invitation_id=str(invitation_id),
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch view statistics",
        )


@router.get(
    "/workspaces/{workspace_id}/invitations/{invitation_id}/analytics/devices",
    response_model=DeviceStats,
    summary="Get device breakdown",
)
async def get_device_stats(
    workspace_id: UUID,
    invitation_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Get device and browser breakdown for invitation views.

    Cached for 10 minutes.
    """
    if str(current_user.workspace_id) != str(workspace_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to this workspace",
        )

    service = AnalyticsService()

    try:
        result = await service.get_device_stats(str(workspace_id), str(invitation_id))

        logger.info(
            "device_stats_fetched",
            workspace_id=str(workspace_id),
            invitation_id=str(invitation_id),
        )

        # Extract device counts from detailed breakdown
        device_breakdown = result.get("device_breakdown", {})

        return DeviceStats(
            desktop=device_breakdown.get("desktop", {}).get("views", 0)
            if isinstance(device_breakdown.get("desktop"), dict)
            else device_breakdown.get("desktop", 0),
            mobile=device_breakdown.get("mobile", {}).get("views", 0)
            if isinstance(device_breakdown.get("mobile"), dict)
            else device_breakdown.get("mobile", 0),
            tablet=device_breakdown.get("tablet", {}).get("views", 0)
            if isinstance(device_breakdown.get("tablet"), dict)
            else device_breakdown.get("tablet", 0),
            unknown=device_breakdown.get("unknown", {}).get("views", 0)
            if isinstance(device_breakdown.get("unknown"), dict)
            else device_breakdown.get("unknown", 0),
            browsers=result.get("browser_breakdown", {}),
            operating_systems={},
        )

    except Exception as e:
        logger.error(
            "device_stats_failed",
            workspace_id=str(workspace_id),
            invitation_id=str(invitation_id),
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch device statistics",
        )


@router.get(
    "/workspaces/{workspace_id}/invitations/{invitation_id}/analytics/rsvp",
    response_model=DetailedRSVPStats,
    summary="Get RSVP statistics",
)
async def get_rsvp_stats(
    workspace_id: UUID,
    invitation_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Get RSVP response statistics.

    Cached for 10 minutes.
    """
    if str(current_user.workspace_id) != str(workspace_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to this workspace",
        )

    service = AnalyticsService()

    try:
        result = await service.get_rsvp_stats(str(workspace_id), str(invitation_id))

        logger.info(
            "rsvp_stats_fetched",
            workspace_id=str(workspace_id),
            invitation_id=str(invitation_id),
        )

        breakdown = result.get("breakdown", {})

        return DetailedRSVPStats(
            total_invited=result.get("total_invited", 0),
            responded=result.get("responded", 0),
            pending=result.get("pending", 0),
            response_rate=result.get("response_rate", 0.0),
            attending=breakdown.get("yes", 0),
            not_attending=breakdown.get("no", 0),
            maybe=breakdown.get("maybe", 0),
            plus_ones_total=result.get("plus_ones_total", 0),
            expected_attendees=result.get("expected_attendees", 0),
            response_timeline=[
                RSVPTimelinePoint(**point)
                for point in result.get("response_timeline", [])
            ],
        )

    except Exception as e:
        logger.error(
            "rsvp_stats_failed",
            workspace_id=str(workspace_id),
            invitation_id=str(invitation_id),
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch RSVP statistics",
        )
