"""Analytics API endpoints.

All routes prefixed with /api/v1/workspaces/{workspace_id}/analytics.

Provides endpoints for:
- Dashboard metrics and overview
- Quick stats and activity feeds
- Top performing galleries and clients
- Period-over-period comparisons
- Gallery-specific analytics (T021)
- Client-specific analytics (T022)
- Reports CRUD operations (T023)
- Export generation and management (T024)

Feature: Analytics & Reporting
Task: T020 - Create analytics API router with dashboard endpoints
Task: T021 - Add gallery analytics endpoints
Task: T022 - Add client analytics endpoints
Task: T023 - Add reports CRUD endpoints
Task: T024 - Add export endpoints
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Annotated, Any, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Path, Query, status, Response
from pydantic import BaseModel, Field

from app.api.dependencies.auth import CurrentUserDep, WorkspaceAccessDep
from app.api.schemas import ErrorResponse
from app.api.exceptions import AppError
from app.services.analytics_service import (
    get_analytics_service,
    AnalyticsError,
    InvalidDateRangeError,
    ReportNotFoundError,
    InvalidReportTypeError,
    ReportGenerationError,
    ExportNotFoundError,
    ExportExpiredError,
    ExportGenerationError,
    InvalidExportFormatError,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Response Models - Dashboard Overview
# ---------------------------------------------------------------------------


class OverviewMetrics(BaseModel):
    """Workspace overview metrics (totals)."""

    total_galleries: int = Field(..., description="Total active galleries")
    total_assets: int = Field(..., description="Total available assets")
    storage_used_bytes: int = Field(..., description="Storage used in bytes")
    storage_used_formatted: str = Field(..., description="Human-readable storage")
    total_clients: int = Field(..., description="Total clients")
    active_clients: int = Field(..., description="Active clients")
    total_views: int = Field(..., description="All-time gallery views")
    total_downloads: int = Field(..., description="All-time downloads")


class QuickStats(BaseModel):
    """Quick stats for a time period."""

    views: int = Field(0, description="Gallery views in period")
    unique_visitors: int = Field(0, description="Unique visitors in period")
    downloads: int = Field(0, description="Downloads in period")
    new_clients: int = Field(0, description="New clients in period")
    new_galleries: int = Field(0, description="New galleries in period")


class TrendMetrics(BaseModel):
    """Period-over-period trend metrics."""

    views_change: float = Field(0, description="Views change percentage")
    visitors_change: float = Field(0, description="Visitors change percentage")
    downloads_change: float = Field(0, description="Downloads change percentage")
    clients_change: float = Field(0, description="New clients change percentage")


class DeviceBreakdown(BaseModel):
    """Device type breakdown."""

    desktop: int = Field(0, description="Desktop views")
    desktop_percentage: float = Field(0, description="Desktop percentage")
    mobile: int = Field(0, description="Mobile views")
    mobile_percentage: float = Field(0, description="Mobile percentage")
    tablet: int = Field(0, description="Tablet views")
    tablet_percentage: float = Field(0, description="Tablet percentage")


class GeographicEntry(BaseModel):
    """Geographic breakdown entry."""

    country_code: str = Field(..., description="ISO country code")
    country_name: Optional[str] = Field(None, description="Country name")
    count: int = Field(..., description="View count")
    percentage: float = Field(..., description="Percentage of total")


class TopGalleryEntry(BaseModel):
    """Top gallery entry."""

    gallery_id: str = Field(..., description="Gallery ID")
    gallery_name: Optional[str] = Field(None, description="Gallery name")
    total_views: int = Field(0, description="Total views")
    unique_visitors: int = Field(0, description="Unique visitors")
    total_downloads: int = Field(0, description="Total downloads")
    engagement_score: Optional[float] = Field(None, description="Engagement score 0-100")
    trend_percentage: Optional[float] = Field(None, description="Change from previous period")


class DailyViewsEntry(BaseModel):
    """Daily views chart data point."""

    date: str = Field(..., description="Date in YYYY-MM-DD format")
    views: int = Field(0, description="Views on this date")
    unique_visitors: int = Field(0, description="Unique visitors on this date")


class DashboardMetricsResponse(BaseModel):
    """Full dashboard metrics response."""

    overview: OverviewMetrics
    quick_stats: QuickStats
    trends: TrendMetrics
    device_breakdown: DeviceBreakdown
    geographic_breakdown: list[GeographicEntry] = Field(default_factory=list)
    top_galleries: list[TopGalleryEntry] = Field(default_factory=list)
    daily_views: list[DailyViewsEntry] = Field(default_factory=list)
    period: dict = Field(default_factory=dict)
    generated_at: str = Field(..., description="ISO timestamp when metrics were generated")


class QuickStatsResponse(BaseModel):
    """Quick stats response."""

    period: str = Field(..., description="Period shorthand (7d, 30d, etc.)")
    period_label: str = Field(..., description="Human-readable period label")
    quick_stats: QuickStats
    trends: TrendMetrics
    generated_at: str


class WorkspaceOverviewResponse(BaseModel):
    """Workspace overview response (totals without date filtering)."""

    total_galleries: int
    total_assets: int
    storage_used_bytes: int
    storage_used_formatted: str
    total_clients: int
    active_clients: int
    total_views: int
    total_downloads: int
    generated_at: str


# ---------------------------------------------------------------------------
# Response Models - Activity Feed
# ---------------------------------------------------------------------------


class ActivityEvent(BaseModel):
    """Single activity event."""

    event_id: str
    event_type: str
    event_category: str
    gallery_id: Optional[str] = None
    gallery_name: Optional[str] = None
    asset_id: Optional[str] = None
    asset_name: Optional[str] = None
    client_id: Optional[str] = None
    client_name: Optional[str] = None
    actor_type: str
    device_type: Optional[str] = None
    country_code: Optional[str] = None
    occurred_at: Optional[str] = None
    description: Optional[str] = None


class ActivityFeedMeta(BaseModel):
    """Activity feed pagination metadata."""

    total: int
    limit: int
    offset: int
    has_more: bool


class ActivityFeedResponse(BaseModel):
    """Activity feed response."""

    events: list[ActivityEvent]
    meta: ActivityFeedMeta


# ---------------------------------------------------------------------------
# Response Models - Top Galleries
# ---------------------------------------------------------------------------


class TopGalleriesResponse(BaseModel):
    """Top galleries response."""

    galleries: list[TopGalleryEntry]
    period: str
    period_label: str
    generated_at: str


# ---------------------------------------------------------------------------
# Dashboard Endpoints (Task T020)
# ---------------------------------------------------------------------------


@router.get(
    "/metrics",
    response_model=DashboardMetricsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get dashboard metrics",
    description="""
    Get comprehensive dashboard metrics for the analytics dashboard.

    Includes:
    - Overview metrics (totals across workspace)
    - Quick stats for the selected period
    - Period-over-period trends
    - Device breakdown
    - Geographic breakdown
    - Top performing galleries
    - Daily views chart data
    """,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid date range"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Workspace not found"},
    },
)
async def get_dashboard_metrics(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    start_date: Annotated[
        Optional[datetime],
        Query(description="Start date (ISO format, default: 30 days ago)"),
    ] = None,
    end_date: Annotated[
        Optional[datetime],
        Query(description="End date (ISO format, default: now)"),
    ] = None,
) -> DashboardMetricsResponse:
    """Get comprehensive dashboard metrics for the workspace."""
    service = get_analytics_service()
    try:
        metrics = await service.get_dashboard_metrics(
            workspace_id=workspace_id,
            start_date=start_date,
            end_date=end_date,
        )

        # Transform to response model
        return DashboardMetricsResponse(
            overview=OverviewMetrics(
                total_galleries=metrics.get("overview", {}).get("total_galleries", 0),
                total_assets=metrics.get("overview", {}).get("total_assets", 0),
                storage_used_bytes=metrics.get("overview", {}).get("storage_used_bytes", 0),
                storage_used_formatted=metrics.get("overview", {}).get("storage_used_formatted", "0 B"),
                total_clients=metrics.get("overview", {}).get("total_clients", 0),
                active_clients=metrics.get("overview", {}).get("active_clients", 0),
                total_views=metrics.get("overview", {}).get("total_views", 0),
                total_downloads=metrics.get("overview", {}).get("total_downloads", 0),
            ),
            quick_stats=QuickStats(
                views=metrics.get("quick_stats", {}).get("views", 0),
                unique_visitors=metrics.get("quick_stats", {}).get("unique_visitors", 0),
                downloads=metrics.get("quick_stats", {}).get("downloads", 0),
                new_clients=metrics.get("quick_stats", {}).get("new_clients", 0),
                new_galleries=metrics.get("quick_stats", {}).get("new_galleries", 0),
            ),
            trends=TrendMetrics(
                views_change=metrics.get("trends", {}).get("views_change", 0),
                visitors_change=metrics.get("trends", {}).get("visitors_change", 0),
                downloads_change=metrics.get("trends", {}).get("downloads_change", 0),
                clients_change=metrics.get("trends", {}).get("clients_change", 0),
            ),
            device_breakdown=DeviceBreakdown(
                desktop=metrics.get("device_breakdown", {}).get("desktop", 0),
                desktop_percentage=metrics.get("device_breakdown", {}).get("desktop_percentage", 0),
                mobile=metrics.get("device_breakdown", {}).get("mobile", 0),
                mobile_percentage=metrics.get("device_breakdown", {}).get("mobile_percentage", 0),
                tablet=metrics.get("device_breakdown", {}).get("tablet", 0),
                tablet_percentage=metrics.get("device_breakdown", {}).get("tablet_percentage", 0),
            ),
            geographic_breakdown=[
                GeographicEntry(
                    country_code=g.get("country_code", ""),
                    country_name=g.get("country_name"),
                    count=g.get("count", 0),
                    percentage=g.get("percentage", 0),
                )
                for g in metrics.get("geographic_breakdown", [])
            ],
            top_galleries=[
                TopGalleryEntry(
                    gallery_id=str(g.get("gallery_id", "")),
                    gallery_name=g.get("gallery_name"),
                    total_views=g.get("total_views", 0),
                    unique_visitors=g.get("unique_visitors", 0),
                    total_downloads=g.get("total_downloads", 0),
                    engagement_score=g.get("engagement_score"),
                    trend_percentage=g.get("trend_percentage"),
                )
                for g in metrics.get("top_galleries", [])
            ],
            daily_views=[
                DailyViewsEntry(
                    date=d.get("date", ""),
                    views=d.get("views", 0),
                    unique_visitors=d.get("unique_visitors", 0),
                )
                for d in metrics.get("daily_views", [])
            ],
            period=metrics.get("period", {}),
            generated_at=metrics.get("generated_at", datetime.utcnow().isoformat()),
        )
    except InvalidDateRangeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except AnalyticsError as e:
        logger.exception("Analytics error getting dashboard metrics")
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status_code,
        )
    except Exception as e:
        logger.exception("Failed to get dashboard metrics")
        raise AppError(
            message="Failed to get dashboard metrics",
            code="ANALYTICS_ERROR",
            status_code=500,
        )


@router.get(
    "/overview",
    response_model=WorkspaceOverviewResponse,
    status_code=status.HTTP_200_OK,
    summary="Get workspace overview",
    description="""
    Get workspace overview metrics without date filtering.

    Returns total counts that don't change based on date range.
    Useful for persistent dashboard headers.
    """,
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Workspace not found"},
    },
)
async def get_workspace_overview(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> WorkspaceOverviewResponse:
    """Get workspace overview metrics (totals without date filtering)."""
    service = get_analytics_service()
    try:
        overview = await service.get_workspace_overview(workspace_id=workspace_id)
        return WorkspaceOverviewResponse(**overview)
    except AnalyticsError as e:
        logger.exception("Analytics error getting workspace overview")
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status_code,
        )
    except Exception as e:
        logger.exception("Failed to get workspace overview")
        raise AppError(
            message="Failed to get workspace overview",
            code="ANALYTICS_ERROR",
            status_code=500,
        )


@router.get(
    "/quick-stats",
    response_model=QuickStatsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get quick stats",
    description="""
    Get quick stats for a predefined time period.

    Supported periods:
    - `7d`: Last 7 days
    - `30d`: Last 30 days (default)
    - `90d`: Last 90 days
    - `1y`: Last year
    - `all`: All time
    """,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid period"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Workspace not found"},
    },
)
async def get_quick_stats(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    period: Annotated[
        str,
        Query(
            description="Period shorthand: 7d, 30d, 90d, 1y, or all",
            pattern="^(7d|30d|90d|1y|all)$",
        ),
    ] = "30d",
) -> QuickStatsResponse:
    """Get quick stats for a predefined period."""
    service = get_analytics_service()
    try:
        stats = await service.get_quick_stats(
            workspace_id=workspace_id,
            period=period,
        )
        return QuickStatsResponse(
            period=stats.get("period", period),
            period_label=stats.get("period_label", period),
            quick_stats=QuickStats(**stats.get("quick_stats", {})),
            trends=TrendMetrics(**stats.get("trends", {})),
            generated_at=stats.get("generated_at", datetime.utcnow().isoformat()),
        )
    except InvalidDateRangeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except AnalyticsError as e:
        logger.exception("Analytics error getting quick stats")
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status_code,
        )
    except Exception as e:
        logger.exception("Failed to get quick stats")
        raise AppError(
            message="Failed to get quick stats",
            code="ANALYTICS_ERROR",
            status_code=500,
        )


@router.get(
    "/activity-feed",
    response_model=ActivityFeedResponse,
    status_code=status.HTTP_200_OK,
    summary="Get activity feed",
    description="""
    Get recent activity feed for dashboard display.

    Returns a paginated list of recent events with gallery and client names.
    Events include gallery views, downloads, favorites, comments, etc.
    """,
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Workspace not found"},
    },
)
async def get_activity_feed(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    limit: Annotated[
        int,
        Query(ge=1, le=100, description="Max events to return"),
    ] = 20,
    offset: Annotated[
        int,
        Query(ge=0, description="Pagination offset"),
    ] = 0,
    event_types: Annotated[
        Optional[str],
        Query(description="Comma-separated event types to filter"),
    ] = None,
) -> ActivityFeedResponse:
    """Get recent activity feed for the workspace."""
    service = get_analytics_service()
    try:
        # Parse event types if provided
        event_types_list = None
        if event_types:
            event_types_list = [t.strip() for t in event_types.split(",") if t.strip()]

        feed = await service.get_activity_feed(
            workspace_id=workspace_id,
            limit=limit,
            offset=offset,
            event_types=event_types_list,
        )

        return ActivityFeedResponse(
            events=[
                ActivityEvent(
                    event_id=e.get("event_id", ""),
                    event_type=e.get("event_type", ""),
                    event_category=e.get("event_category", ""),
                    gallery_id=e.get("gallery_id"),
                    gallery_name=e.get("gallery_name"),
                    asset_id=e.get("asset_id"),
                    asset_name=e.get("asset_name"),
                    client_id=e.get("client_id"),
                    client_name=e.get("client_name"),
                    actor_type=e.get("actor_type", ""),
                    device_type=e.get("device_type"),
                    country_code=e.get("country_code"),
                    occurred_at=e.get("occurred_at"),
                    description=e.get("description"),
                )
                for e in feed.get("events", [])
            ],
            meta=ActivityFeedMeta(
                total=feed.get("meta", {}).get("total", 0),
                limit=feed.get("meta", {}).get("limit", limit),
                offset=feed.get("meta", {}).get("offset", offset),
                has_more=feed.get("meta", {}).get("has_more", False),
            ),
        )
    except AnalyticsError as e:
        logger.exception("Analytics error getting activity feed")
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status_code,
        )
    except Exception as e:
        logger.exception("Failed to get activity feed")
        raise AppError(
            message="Failed to get activity feed",
            code="ANALYTICS_ERROR",
            status_code=500,
        )


@router.get(
    "/top-galleries",
    response_model=TopGalleriesResponse,
    status_code=status.HTTP_200_OK,
    summary="Get top galleries",
    description="""
    Get top performing galleries for the workspace.

    Galleries are ranked by total views, engagement score, or downloads
    based on the sort_by parameter.
    """,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid parameters"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Workspace not found"},
    },
)
async def get_top_galleries(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    period: Annotated[
        str,
        Query(
            description="Period shorthand: 7d, 30d, 90d, 1y, or all",
            pattern="^(7d|30d|90d|1y|all)$",
        ),
    ] = "30d",
    limit: Annotated[
        int,
        Query(ge=1, le=50, description="Max galleries to return"),
    ] = 10,
    sort_by: Annotated[
        str,
        Query(
            description="Sort by: views, engagement, or downloads",
            pattern="^(views|engagement|downloads)$",
        ),
    ] = "views",
) -> TopGalleriesResponse:
    """Get top performing galleries."""
    service = get_analytics_service()
    try:
        result = await service.get_top_galleries(
            workspace_id=workspace_id,
            period=period,
            limit=limit,
            sort_by=sort_by,
        )

        return TopGalleriesResponse(
            galleries=[
                TopGalleryEntry(
                    gallery_id=str(g.get("gallery_id", "")),
                    gallery_name=g.get("gallery_name"),
                    total_views=g.get("total_views", 0),
                    unique_visitors=g.get("unique_visitors", 0),
                    total_downloads=g.get("total_downloads", 0),
                    engagement_score=g.get("engagement_score"),
                    trend_percentage=g.get("trend_percentage"),
                )
                for g in result.get("galleries", [])
            ],
            period=result.get("period", period),
            period_label=result.get("period_label", period),
            generated_at=result.get("generated_at", datetime.utcnow().isoformat()),
        )
    except InvalidDateRangeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except AnalyticsError as e:
        logger.exception("Analytics error getting top galleries")
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status_code,
        )
    except Exception as e:
        logger.exception("Failed to get top galleries")
        raise AppError(
            message="Failed to get top galleries",
            code="ANALYTICS_ERROR",
            status_code=500,
        )


@router.get(
    "/dashboard",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    summary="Get full dashboard analytics",
    description="""
    Get combined dashboard analytics for the CRM.

    This is a comprehensive endpoint that returns:
    - Client overview metrics
    - Engagement metrics
    - Referral analytics
    - Upcoming follow-ups
    - Recent clients
    - Recent activity
    - Monthly trends
    """,
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Workspace not found"},
    },
)
async def get_dashboard_analytics(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> dict[str, Any]:
    """Get combined dashboard analytics."""
    service = get_analytics_service()
    try:
        return await service.get_dashboard_analytics(workspace_id=workspace_id)
    except AnalyticsError as e:
        logger.exception("Analytics error getting dashboard analytics")
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status_code,
        )
    except Exception as e:
        logger.exception("Failed to get dashboard analytics")
        raise AppError(
            message="Failed to get dashboard analytics",
            code="ANALYTICS_ERROR",
            status_code=500,
        )


# ---------------------------------------------------------------------------
# Response Models - Gallery Analytics (T021)
# ---------------------------------------------------------------------------


class GalleryInfo(BaseModel):
    """Basic gallery information."""

    gallery_id: str = Field(..., description="Gallery ID")
    name: Optional[str] = Field(None, description="Gallery name")
    client_name: Optional[str] = Field(None, description="Client name")
    event_date: Optional[str] = Field(None, description="Event date")
    status: Optional[str] = Field(None, description="Gallery status")
    created_at: Optional[str] = Field(None, description="Creation timestamp")
    asset_count: int = Field(0, description="Number of visible assets")


class GallerySummaryMetrics(BaseModel):
    """Summary metrics for a gallery."""

    total_views: int = Field(0, description="Total gallery views")
    unique_visitors: int = Field(0, description="Unique visitors")
    total_sessions: int = Field(0, description="Total sessions")
    total_downloads: int = Field(0, description="Total downloads")
    total_favorites: int = Field(0, description="Total favorites")
    total_comments: int = Field(0, description="Total comments")
    total_selections: int = Field(0, description="Total selections")
    total_shares: int = Field(0, description="Total shares")
    avg_session_duration_ms: int = Field(0, description="Average session duration in ms")
    unique_clients: int = Field(0, description="Unique clients")
    unique_assets_viewed: int = Field(0, description="Unique assets viewed")
    asset_views: int = Field(0, description="Total asset views")


class GalleryTrendMetrics(BaseModel):
    """Trend metrics comparing to previous period."""

    views_change: Optional[float] = Field(None, description="Views change percentage")
    visitors_change: Optional[float] = Field(None, description="Visitors change percentage")
    downloads_change: Optional[float] = Field(None, description="Downloads change percentage")


class EngagementMetric(BaseModel):
    """Individual engagement metric."""

    count: int = Field(0, description="Count")
    percentage: float = Field(0, description="Percentage of total")


class GalleryEngagementBreakdown(BaseModel):
    """Engagement breakdown for a gallery."""

    favorites: EngagementMetric = Field(default_factory=EngagementMetric)
    comments: EngagementMetric = Field(default_factory=EngagementMetric)
    selections: EngagementMetric = Field(default_factory=EngagementMetric)
    downloads: EngagementMetric = Field(default_factory=EngagementMetric)
    shares: EngagementMetric = Field(default_factory=EngagementMetric)
    total_engagement: int = Field(0, description="Total engagement actions")
    engagement_rate: float = Field(0, description="Engagement rate per view")


class SourceBreakdown(BaseModel):
    """Traffic source breakdown."""

    direct: EngagementMetric = Field(default_factory=EngagementMetric)
    share_link: EngagementMetric = Field(default_factory=EngagementMetric)
    referral: EngagementMetric = Field(default_factory=EngagementMetric)


class ShareLinkStats(BaseModel):
    """Share link statistics."""

    share_links_created: int = Field(0, description="Number of share links created")
    share_link_accesses: int = Field(0, description="Total share link accesses")
    share_link_conversions: int = Field(0, description="Share link conversions (gate passed)")
    conversion_rate: float = Field(0, description="Gate conversion rate percentage")


class ReferrerEntry(BaseModel):
    """Top referrer entry."""

    referrer: str = Field(..., description="Referrer URL")
    count: int = Field(0, description="Access count")


class GalleryAnalyticsDetailsResponse(BaseModel):
    """Comprehensive gallery analytics response."""

    gallery: GalleryInfo
    summary: GallerySummaryMetrics
    trends: GalleryTrendMetrics
    engagement: GalleryEngagementBreakdown
    device_breakdown: DeviceBreakdown
    geographic_breakdown: list[GeographicEntry] = Field(default_factory=list)
    source_breakdown: SourceBreakdown
    share_link_stats: ShareLinkStats
    top_referrers: list[ReferrerEntry] = Field(default_factory=list)
    daily_views: list[DailyViewsEntry] = Field(default_factory=list)
    period: dict = Field(default_factory=dict)
    generated_at: str = Field(..., description="ISO timestamp when analytics were generated")


class GalleryAnalyticsSummaryResponse(BaseModel):
    """Simple gallery analytics summary response."""

    gallery_id: str
    period_type: str
    total_views: int = Field(0)
    unique_visitors: int = Field(0)
    total_downloads: int = Field(0)
    engagement_score: Optional[float] = Field(None)
    calculated_at: Optional[str] = Field(None)


class TimeSeriesDataPoint(BaseModel):
    """Time series data point for charts."""

    date: str = Field(..., description="Date in YYYY-MM-DD format")
    total_views: int = Field(0, description="Total views")
    unique_visitors: int = Field(0, description="Unique visitors")


class GalleryViewsTimeSeriesResponse(BaseModel):
    """Gallery views time series response."""

    gallery_id: str
    granularity: str = Field(..., description="Time granularity (daily, weekly, monthly)")
    data: list[TimeSeriesDataPoint] = Field(default_factory=list)
    period: dict = Field(default_factory=dict)
    generated_at: str


class GalleryHistoryEntry(BaseModel):
    """Gallery analytics history entry."""

    period_start: str = Field(..., description="Period start date")
    period_end: str = Field(..., description="Period end date")
    period_type: str
    total_views: int = Field(0)
    unique_visitors: int = Field(0)
    total_downloads: int = Field(0)
    engagement_score: Optional[float] = Field(None)
    calculated_at: Optional[str] = Field(None)


class GalleryAnalyticsHistoryResponse(BaseModel):
    """Gallery analytics history response."""

    gallery_id: str
    period_type: str
    history: list[GalleryHistoryEntry] = Field(default_factory=list)
    generated_at: str


class GalleryComparisonEntry(BaseModel):
    """Gallery comparison entry."""

    gallery_id: str
    gallery_name: Optional[str] = None
    total_views: int = Field(0)
    unique_visitors: int = Field(0)
    total_downloads: int = Field(0)
    engagement_score: Optional[float] = Field(None)
    avg_session_duration_ms: int = Field(0)


class GalleriesComparisonResponse(BaseModel):
    """Galleries comparison response."""

    galleries: list[GalleryComparisonEntry] = Field(default_factory=list)
    period: dict = Field(default_factory=dict)
    generated_at: str


# ---------------------------------------------------------------------------
# Gallery Analytics Endpoints (T021)
# ---------------------------------------------------------------------------


@router.get(
    "/galleries/{gallery_id}",
    response_model=GalleryAnalyticsDetailsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get gallery analytics details",
    description="""
    Get comprehensive analytics for a specific gallery.

    Includes:
    - Summary metrics (views, visitors, downloads, engagement)
    - Period-over-period trends
    - Engagement breakdown (favorites, comments, selections)
    - Device breakdown (desktop, mobile, tablet)
    - Geographic breakdown (top countries)
    - Traffic source breakdown (direct, share link, referral)
    - Share link statistics and conversion rates
    - Daily views time series
    """,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid date range"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery not found"},
    },
)
async def get_gallery_analytics_details(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    start_date: Annotated[
        Optional[datetime],
        Query(description="Start date (ISO format, default: 30 days ago)"),
    ] = None,
    end_date: Annotated[
        Optional[datetime],
        Query(description="End date (ISO format, default: now)"),
    ] = None,
) -> GalleryAnalyticsDetailsResponse:
    """Get comprehensive analytics for a specific gallery."""
    service = get_analytics_service()
    try:
        result = await service.get_gallery_analytics_details(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            start_date=start_date,
            end_date=end_date,
        )

        # Check for error response (gallery not found)
        if result.get("error"):
            raise HTTPException(
                status_code=404,
                detail=result.get("error", "Gallery not found"),
            )

        # Transform to response model
        gallery_data = result.get("gallery", {})
        summary_data = result.get("summary", {})
        trends_data = result.get("trends", {})
        engagement_data = result.get("engagement", {})
        device_data = result.get("device_breakdown", {})
        geographic_data = result.get("geographic_breakdown", [])
        source_data = result.get("source_breakdown", {})
        share_link_data = result.get("share_link_stats", {})
        referrers_data = result.get("top_referrers", [])
        daily_views_data = result.get("daily_views", [])

        return GalleryAnalyticsDetailsResponse(
            gallery=GalleryInfo(
                gallery_id=str(gallery_data.get("gallery_id", gallery_id)),
                name=gallery_data.get("name"),
                client_name=gallery_data.get("client_name"),
                event_date=str(gallery_data.get("event_date")) if gallery_data.get("event_date") else None,
                status=gallery_data.get("status"),
                created_at=str(gallery_data.get("created_at")) if gallery_data.get("created_at") else None,
                asset_count=gallery_data.get("asset_count", 0),
            ),
            summary=GallerySummaryMetrics(
                total_views=summary_data.get("views", 0),
                unique_visitors=summary_data.get("unique_visitors", 0),
                total_sessions=summary_data.get("sessions", 0),
                total_downloads=summary_data.get("downloads", 0),
                total_favorites=summary_data.get("favorites", 0),
                total_comments=summary_data.get("comments", 0),
                total_selections=summary_data.get("selections", 0),
                total_shares=summary_data.get("shares", 0),
                avg_session_duration_ms=summary_data.get("avg_session_duration_ms", 0),
                unique_clients=summary_data.get("unique_clients", 0),
                unique_assets_viewed=summary_data.get("unique_assets_viewed", 0),
                asset_views=summary_data.get("asset_views", 0),
            ),
            trends=GalleryTrendMetrics(
                views_change=trends_data.get("views_change"),
                visitors_change=trends_data.get("visitors_change"),
                downloads_change=trends_data.get("downloads_change"),
            ),
            engagement=GalleryEngagementBreakdown(
                favorites=EngagementMetric(
                    count=engagement_data.get("favorites", {}).get("count", 0),
                    percentage=engagement_data.get("favorites", {}).get("percentage", 0),
                ),
                comments=EngagementMetric(
                    count=engagement_data.get("comments", {}).get("count", 0),
                    percentage=engagement_data.get("comments", {}).get("percentage", 0),
                ),
                selections=EngagementMetric(
                    count=engagement_data.get("selections", {}).get("count", 0),
                    percentage=engagement_data.get("selections", {}).get("percentage", 0),
                ),
                downloads=EngagementMetric(
                    count=engagement_data.get("downloads", {}).get("count", 0),
                    percentage=engagement_data.get("downloads", {}).get("percentage", 0),
                ),
                shares=EngagementMetric(
                    count=engagement_data.get("shares", {}).get("count", 0),
                    percentage=engagement_data.get("shares", {}).get("percentage", 0),
                ),
                total_engagement=engagement_data.get("total_engagement", 0),
                engagement_rate=engagement_data.get("engagement_rate", 0),
            ),
            device_breakdown=DeviceBreakdown(
                desktop=device_data.get("desktop", 0),
                desktop_percentage=device_data.get("desktop_percentage", 0),
                mobile=device_data.get("mobile", 0),
                mobile_percentage=device_data.get("mobile_percentage", 0),
                tablet=device_data.get("tablet", 0),
                tablet_percentage=device_data.get("tablet_percentage", 0),
            ),
            geographic_breakdown=[
                GeographicEntry(
                    country_code=g.get("country_code", ""),
                    country_name=g.get("country_name"),
                    count=g.get("count", 0),
                    percentage=g.get("percentage", 0),
                )
                for g in geographic_data
            ],
            source_breakdown=SourceBreakdown(
                direct=EngagementMetric(
                    count=source_data.get("direct", {}).get("count", 0),
                    percentage=source_data.get("direct", {}).get("percentage", 0),
                ),
                share_link=EngagementMetric(
                    count=source_data.get("share_link", {}).get("count", 0),
                    percentage=source_data.get("share_link", {}).get("percentage", 0),
                ),
                referral=EngagementMetric(
                    count=source_data.get("referral", {}).get("count", 0),
                    percentage=source_data.get("referral", {}).get("percentage", 0),
                ),
            ),
            share_link_stats=ShareLinkStats(
                share_links_created=share_link_data.get("share_links_created", 0),
                share_link_accesses=share_link_data.get("share_link_accesses", 0),
                share_link_conversions=share_link_data.get("share_link_conversions", 0),
                conversion_rate=share_link_data.get("conversion_rate", 0),
            ),
            top_referrers=[
                ReferrerEntry(
                    referrer=r.get("referrer", ""),
                    count=r.get("count", 0),
                )
                for r in referrers_data
            ],
            daily_views=[
                DailyViewsEntry(
                    date=d.get("date", ""),
                    views=d.get("views", 0),
                    unique_visitors=d.get("unique_visitors", 0),
                )
                for d in daily_views_data
            ],
            period=result.get("period", {}),
            generated_at=result.get("generated_at", datetime.utcnow().isoformat()),
        )
    except HTTPException:
        raise
    except InvalidDateRangeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except AnalyticsError as e:
        logger.exception("Analytics error getting gallery analytics details")
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status_code,
        )
    except Exception as e:
        logger.exception("Failed to get gallery analytics details")
        raise AppError(
            message="Failed to get gallery analytics details",
            code="ANALYTICS_ERROR",
            status_code=500,
        )


@router.get(
    "/galleries/{gallery_id}/summary",
    response_model=GalleryAnalyticsSummaryResponse,
    status_code=status.HTTP_200_OK,
    summary="Get gallery analytics summary",
    description="""
    Get a simple analytics summary for a gallery.

    Returns the most recent pre-calculated analytics for the specified period type.
    Faster than the detailed endpoint as it uses cached aggregations.
    """,
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery not found or no analytics"},
    },
)
async def get_gallery_analytics_summary(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    period_type: Annotated[
        str,
        Query(
            description="Period type: daily, weekly, monthly, or all_time",
            pattern="^(daily|weekly|monthly|all_time)$",
        ),
    ] = "all_time",
) -> GalleryAnalyticsSummaryResponse:
    """Get simple analytics summary for a gallery."""
    service = get_analytics_service()
    try:
        result = await service.get_gallery_analytics(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            period_type=period_type,
        )

        if not result:
            raise HTTPException(
                status_code=404,
                detail="No analytics found for this gallery",
            )

        return GalleryAnalyticsSummaryResponse(
            gallery_id=str(result.get("gallery_id", gallery_id)),
            period_type=result.get("period_type", period_type),
            total_views=result.get("total_views", 0),
            unique_visitors=result.get("unique_visitors", 0),
            total_downloads=result.get("total_downloads", 0),
            engagement_score=result.get("engagement_score"),
            calculated_at=str(result.get("calculated_at")) if result.get("calculated_at") else None,
        )
    except HTTPException:
        raise
    except AnalyticsError as e:
        logger.exception("Analytics error getting gallery analytics summary")
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status_code,
        )
    except Exception as e:
        logger.exception("Failed to get gallery analytics summary")
        raise AppError(
            message="Failed to get gallery analytics summary",
            code="ANALYTICS_ERROR",
            status_code=500,
        )


@router.get(
    "/galleries/{gallery_id}/views-time-series",
    response_model=GalleryViewsTimeSeriesResponse,
    status_code=status.HTTP_200_OK,
    summary="Get gallery views time series",
    description="""
    Get gallery views as a time series for charting.

    Returns data points with total views and unique visitors for each time period.
    Supports daily, weekly, or monthly granularity.
    """,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid parameters"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery not found"},
    },
)
async def get_gallery_views_time_series(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    start_date: Annotated[
        Optional[datetime],
        Query(description="Start date (ISO format, default: 30 days ago)"),
    ] = None,
    end_date: Annotated[
        Optional[datetime],
        Query(description="End date (ISO format, default: now)"),
    ] = None,
    granularity: Annotated[
        str,
        Query(
            description="Time granularity: daily, weekly, or monthly",
            pattern="^(daily|weekly|monthly)$",
        ),
    ] = "daily",
) -> GalleryViewsTimeSeriesResponse:
    """Get gallery views time series for charting."""
    service = get_analytics_service()
    try:
        result = await service.get_gallery_views_time_series(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            start_date=start_date,
            end_date=end_date,
            granularity=granularity,
        )

        # Build period info
        now = datetime.utcnow()
        actual_end = end_date or now
        actual_start = start_date or (actual_end - timedelta(days=30))

        return GalleryViewsTimeSeriesResponse(
            gallery_id=str(gallery_id),
            granularity=granularity,
            data=[
                TimeSeriesDataPoint(
                    date=str(d.get("date", "")),
                    total_views=d.get("total_views", 0),
                    unique_visitors=d.get("unique_visitors", 0),
                )
                for d in result
            ],
            period={
                "start_date": actual_start.isoformat() if isinstance(actual_start, datetime) else str(actual_start),
                "end_date": actual_end.isoformat() if isinstance(actual_end, datetime) else str(actual_end),
                "granularity": granularity,
            },
            generated_at=now.isoformat(),
        )
    except InvalidDateRangeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except AnalyticsError as e:
        logger.exception("Analytics error getting gallery views time series")
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status_code,
        )
    except Exception as e:
        logger.exception("Failed to get gallery views time series")
        raise AppError(
            message="Failed to get gallery views time series",
            code="ANALYTICS_ERROR",
            status_code=500,
        )


@router.get(
    "/galleries/{gallery_id}/engagement",
    response_model=GalleryEngagementBreakdown,
    status_code=status.HTTP_200_OK,
    summary="Get gallery engagement breakdown",
    description="""
    Get detailed engagement breakdown for a gallery.

    Returns engagement metrics including favorites, comments, selections,
    downloads, and shares with percentages and overall engagement rate.
    """,
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery not found"},
    },
)
async def get_gallery_engagement_breakdown(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    start_date: Annotated[
        Optional[datetime],
        Query(description="Start date (ISO format)"),
    ] = None,
    end_date: Annotated[
        Optional[datetime],
        Query(description="End date (ISO format)"),
    ] = None,
) -> GalleryEngagementBreakdown:
    """Get detailed engagement breakdown for a gallery."""
    service = get_analytics_service()
    try:
        result = await service.get_gallery_engagement_breakdown(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            start_date=start_date,
            end_date=end_date,
        )

        return GalleryEngagementBreakdown(
            favorites=EngagementMetric(
                count=result.get("favorites", {}).get("count", 0),
                percentage=result.get("favorites", {}).get("percentage", 0),
            ),
            comments=EngagementMetric(
                count=result.get("comments", {}).get("count", 0),
                percentage=result.get("comments", {}).get("percentage", 0),
            ),
            selections=EngagementMetric(
                count=result.get("selections", {}).get("count", 0),
                percentage=result.get("selections", {}).get("percentage", 0),
            ),
            downloads=EngagementMetric(
                count=result.get("downloads", {}).get("count", 0),
                percentage=result.get("downloads", {}).get("percentage", 0),
            ),
            shares=EngagementMetric(
                count=result.get("shares", {}).get("count", 0),
                percentage=result.get("shares", {}).get("percentage", 0),
            ),
            total_engagement=result.get("total_engagement", 0),
            engagement_rate=result.get("engagement_rate", 0),
        )
    except AnalyticsError as e:
        logger.exception("Analytics error getting gallery engagement breakdown")
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status_code,
        )
    except Exception as e:
        logger.exception("Failed to get gallery engagement breakdown")
        raise AppError(
            message="Failed to get gallery engagement breakdown",
            code="ANALYTICS_ERROR",
            status_code=500,
        )


@router.get(
    "/galleries/{gallery_id}/history",
    response_model=GalleryAnalyticsHistoryResponse,
    status_code=status.HTTP_200_OK,
    summary="Get gallery analytics history",
    description="""
    Get historical gallery analytics for trend analysis.

    Returns multiple analytics records over time for the specified period type.
    Useful for showing trends and comparisons over time.
    """,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid parameters"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery not found"},
    },
)
async def get_gallery_analytics_history(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    period_type: Annotated[
        str,
        Query(
            description="Period type: daily, weekly, or monthly",
            pattern="^(daily|weekly|monthly)$",
        ),
    ] = "daily",
    start_date: Annotated[
        Optional[datetime],
        Query(description="Start date filter (ISO format)"),
    ] = None,
    end_date: Annotated[
        Optional[datetime],
        Query(description="End date filter (ISO format)"),
    ] = None,
    limit: Annotated[
        int,
        Query(ge=1, le=365, description="Max records to return"),
    ] = 30,
) -> GalleryAnalyticsHistoryResponse:
    """Get historical gallery analytics for trend analysis."""
    service = get_analytics_service()
    try:
        result = await service.get_gallery_analytics_history(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            period_type=period_type,
            start_date=start_date,
            end_date=end_date,
            limit=limit,
        )

        return GalleryAnalyticsHistoryResponse(
            gallery_id=str(gallery_id),
            period_type=period_type,
            history=[
                GalleryHistoryEntry(
                    period_start=str(h.get("period_start", "")),
                    period_end=str(h.get("period_end", "")),
                    period_type=h.get("period_type", period_type),
                    total_views=h.get("total_views", 0),
                    unique_visitors=h.get("unique_visitors", 0),
                    total_downloads=h.get("total_downloads", 0),
                    engagement_score=h.get("engagement_score"),
                    calculated_at=str(h.get("calculated_at")) if h.get("calculated_at") else None,
                )
                for h in result
            ],
            generated_at=datetime.utcnow().isoformat(),
        )
    except InvalidDateRangeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except AnalyticsError as e:
        logger.exception("Analytics error getting gallery analytics history")
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status_code,
        )
    except Exception as e:
        logger.exception("Failed to get gallery analytics history")
        raise AppError(
            message="Failed to get gallery analytics history",
            code="ANALYTICS_ERROR",
            status_code=500,
        )


@router.post(
    "/galleries/{gallery_id}/calculate",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    summary="Calculate gallery analytics",
    description="""
    Trigger analytics calculation for a gallery.

    Aggregates raw events into a gallery analytics record and stores it for
    fast retrieval. This is typically called by background jobs but can be
    triggered manually.
    """,
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery not found"},
    },
)
async def calculate_gallery_analytics(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    period_type: Annotated[
        str,
        Query(
            description="Period type: daily, weekly, monthly, or all_time",
            pattern="^(daily|weekly|monthly|all_time)$",
        ),
    ] = "all_time",
    force: Annotated[
        bool,
        Query(description="Force recalculation even if recent data exists"),
    ] = False,
) -> dict[str, Any]:
    """Trigger analytics calculation for a gallery."""
    service = get_analytics_service()
    try:
        result = await service.calculate_gallery_analytics(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            period_type=period_type,
            force_recalculate=force,
        )

        return {
            "status": "success",
            "gallery_id": str(gallery_id),
            "period_type": period_type,
            "analytics": result,
            "calculated_at": datetime.utcnow().isoformat(),
        }
    except AnalyticsError as e:
        logger.exception("Analytics error calculating gallery analytics")
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status_code,
        )
    except Exception as e:
        logger.exception("Failed to calculate gallery analytics")
        raise AppError(
            message="Failed to calculate gallery analytics",
            code="ANALYTICS_ERROR",
            status_code=500,
        )


@router.post(
    "/galleries/compare",
    response_model=GalleriesComparisonResponse,
    status_code=status.HTTP_200_OK,
    summary="Compare galleries",
    description="""
    Compare analytics across multiple galleries.

    Provides side-by-side comparison of key metrics for the specified galleries
    over the same time period. Requires 2-10 gallery IDs.
    """,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid parameters"},
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def compare_galleries(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    gallery_ids: Annotated[
        str,
        Query(description="Comma-separated gallery IDs to compare (2-10)"),
    ],
    start_date: Annotated[
        Optional[datetime],
        Query(description="Start date (ISO format, default: 30 days ago)"),
    ] = None,
    end_date: Annotated[
        Optional[datetime],
        Query(description="End date (ISO format, default: now)"),
    ] = None,
) -> GalleriesComparisonResponse:
    """Compare analytics across multiple galleries."""
    service = get_analytics_service()
    try:
        # Parse gallery IDs
        gallery_id_list = []
        for gid in gallery_ids.split(","):
            gid = gid.strip()
            if gid:
                try:
                    gallery_id_list.append(UUID(gid))
                except ValueError:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid gallery ID format: {gid}",
                    )

        if len(gallery_id_list) < 2:
            raise HTTPException(
                status_code=400,
                detail="Need at least 2 galleries to compare",
            )

        if len(gallery_id_list) > 10:
            raise HTTPException(
                status_code=400,
                detail="Cannot compare more than 10 galleries at once",
            )

        result = await service.compare_galleries(
            workspace_id=workspace_id,
            gallery_ids=gallery_id_list,
            start_date=start_date,
            end_date=end_date,
        )

        return GalleriesComparisonResponse(
            galleries=[
                GalleryComparisonEntry(
                    gallery_id=str(g.get("gallery_id", "")),
                    gallery_name=g.get("gallery_name"),
                    total_views=g.get("total_views", 0),
                    unique_visitors=g.get("unique_visitors", 0),
                    total_downloads=g.get("total_downloads", 0),
                    engagement_score=g.get("engagement_score"),
                    avg_session_duration_ms=g.get("avg_session_duration_ms", 0),
                )
                for g in result.get("galleries", [])
            ],
            period=result.get("period", {}),
            generated_at=result.get("generated_at", datetime.utcnow().isoformat()),
        )
    except HTTPException:
        raise
    except InvalidDateRangeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except AnalyticsError as e:
        logger.exception("Analytics error comparing galleries")
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status_code,
        )
    except Exception as e:
        logger.exception("Failed to compare galleries")
        raise AppError(
            message="Failed to compare galleries",
            code="ANALYTICS_ERROR",
            status_code=500,
        )


# ---------------------------------------------------------------------------
# Response Models - Client Analytics (T022)
# ---------------------------------------------------------------------------


class ClientInfo(BaseModel):
    """Basic client information."""

    client_id: str = Field(..., description="Client ID")
    name: Optional[str] = Field(None, description="Client name")
    email: Optional[str] = Field(None, description="Client email")
    status: Optional[str] = Field(None, description="Client status")
    created_at: Optional[str] = Field(None, description="Creation timestamp")


class ClientAnalyticsMetrics(BaseModel):
    """Analytics metrics for a client."""

    total_gallery_views: int = Field(0, description="Total gallery views by client")
    unique_galleries_viewed: int = Field(0, description="Unique galleries viewed")
    total_asset_views: int = Field(0, description="Total asset views")
    total_favorites: int = Field(0, description="Total favorites made")
    total_comments: int = Field(0, description="Total comments made")
    total_selections: int = Field(0, description="Total selections made")
    total_downloads: int = Field(0, description="Total downloads made")
    total_sessions: int = Field(0, description="Total sessions")
    avg_session_duration_ms: int = Field(0, description="Average session duration in ms")
    engagement_score: Optional[float] = Field(None, description="Engagement score 0-100")
    churn_risk_score: Optional[float] = Field(None, description="Churn risk score 0-100")
    lifetime_value_cents: int = Field(0, description="Lifetime value in cents")
    days_since_last_activity: Optional[int] = Field(None, description="Days since last activity")


class ClientEngagementBreakdown(BaseModel):
    """Engagement breakdown for a client."""

    gallery_views: int = Field(0, description="Total gallery views")
    asset_views: int = Field(0, description="Total asset views")
    favorites: int = Field(0, description="Total favorites")
    comments: int = Field(0, description="Total comments")
    selections: int = Field(0, description="Total selections")
    downloads: int = Field(0, description="Total downloads")
    shares: int = Field(0, description="Total shares")
    total_engagement_actions: int = Field(0, description="Total engagement actions")
    calculated_engagement_score: Optional[float] = Field(None, description="Calculated score")
    engagement_tier: Optional[str] = Field(None, description="Engagement tier")


class ClientAnalyticsDetailsResponse(BaseModel):
    """Comprehensive client analytics response."""

    client_id: str
    client: Optional[ClientInfo] = None
    analytics: ClientAnalyticsMetrics
    engagement_breakdown: ClientEngagementBreakdown
    engagement_tier: str = Field("minimal_engagement", description="Engagement tier")
    churn_risk_level: Optional[str] = Field(None, description="Churn risk level")
    period_type: str
    history: Optional[list[dict]] = Field(None, description="Historical analytics")
    gallery_interactions: Optional[list[dict]] = Field(None, description="Gallery interactions")
    generated_at: str


class ClientAnalyticsSummaryResponse(BaseModel):
    """Simple client analytics summary response."""

    client_id: str
    period_type: str
    engagement_score: Optional[float] = Field(None)
    churn_risk_score: Optional[float] = Field(None)
    total_gallery_views: int = Field(0)
    total_downloads: int = Field(0)
    total_favorites: int = Field(0)
    lifetime_value_cents: int = Field(0)
    engagement_tier: str = Field("minimal_engagement")
    calculated_at: Optional[str] = Field(None)


class TopClientEntry(BaseModel):
    """Top client entry."""

    rank: int = Field(..., description="Rank position")
    client_id: str = Field(..., description="Client ID")
    client_name: Optional[str] = Field(None, description="Client name")
    email: Optional[str] = Field(None, description="Client email")
    engagement_score: Optional[float] = Field(None, description="Engagement score 0-100")
    total_gallery_views: int = Field(0, description="Total gallery views")
    total_downloads: int = Field(0, description="Total downloads")
    total_favorites: int = Field(0, description="Total favorites")
    lifetime_value_cents: int = Field(0, description="Lifetime value in cents")
    status: Optional[str] = Field(None, description="Client status")


class TopClientsResponse(BaseModel):
    """Top clients response."""

    clients: list[TopClientEntry] = Field(default_factory=list)
    total: int = Field(0, description="Total clients returned")
    sort_by: str = Field("engagement_score", description="Sort metric used")
    period_type: str
    generated_at: str


class ChurnRiskClientEntry(BaseModel):
    """Client at churn risk entry."""

    client_id: str = Field(..., description="Client ID")
    client_name: Optional[str] = Field(None, description="Client name")
    email: Optional[str] = Field(None, description="Client email")
    churn_risk_score: float = Field(..., description="Churn risk score 0-100")
    engagement_score: Optional[float] = Field(None, description="Engagement score")
    days_since_last_activity: Optional[int] = Field(None, description="Days since last activity")
    risk_factors: list[str] = Field(default_factory=list, description="Risk factors identified")
    recommendations: list[str] = Field(default_factory=list, description="Recommendations")


class ChurnRiskResponse(BaseModel):
    """Clients at churn risk response."""

    clients: list[ChurnRiskClientEntry] = Field(default_factory=list)
    total_at_risk: int = Field(0, description="Total clients at risk")
    high_risk_count: int = Field(0, description="High risk count")
    medium_risk_count: int = Field(0, description="Medium risk count")
    min_risk_score: int = Field(50, description="Minimum risk score threshold")
    period_type: str
    generated_at: str


class ClientActivityTimeSeriesPoint(BaseModel):
    """Client activity time series data point."""

    date: str = Field(..., description="Date in YYYY-MM-DD format")
    gallery_views: int = Field(0, description="Gallery views")
    asset_views: int = Field(0, description="Asset views")
    downloads: int = Field(0, description="Downloads")
    favorites: int = Field(0, description="Favorites")
    comments: int = Field(0, description="Comments")
    total_engagement_actions: int = Field(0, description="Total engagement actions")


class ClientActivityTimeSeriesResponse(BaseModel):
    """Client activity time series response."""

    client_id: str
    granularity: str = Field(..., description="Time granularity (daily, weekly, monthly)")
    time_series: list[ClientActivityTimeSeriesPoint] = Field(default_factory=list)
    data_points: int = Field(0, description="Number of data points")
    period: dict = Field(default_factory=dict)
    summary: dict = Field(default_factory=dict)
    generated_at: str


class ClientAnalyticsHistoryEntry(BaseModel):
    """Client analytics history entry."""

    period_start: str = Field(..., description="Period start date")
    period_end: str = Field(..., description="Period end date")
    period_type: str
    engagement_score: Optional[float] = Field(None)
    total_gallery_views: int = Field(0)
    total_downloads: int = Field(0)
    churn_risk_score: Optional[float] = Field(None)
    calculated_at: Optional[str] = Field(None)


class ClientAnalyticsHistoryResponse(BaseModel):
    """Client analytics history response."""

    client_id: str
    period_type: str
    history: list[ClientAnalyticsHistoryEntry] = Field(default_factory=list)
    record_count: int = Field(0, description="Number of records")
    trends: dict = Field(default_factory=dict, description="Trend analysis")
    generated_at: str


class ClientGalleryInteraction(BaseModel):
    """Client gallery interaction entry."""

    rank: int = Field(..., description="Rank by engagement")
    gallery_id: str = Field(..., description="Gallery ID")
    gallery_name: Optional[str] = Field(None, description="Gallery name")
    views: int = Field(0, description="Views")
    favorites: int = Field(0, description="Favorites")
    comments: int = Field(0, description="Comments")
    downloads: int = Field(0, description="Downloads")
    selections: int = Field(0, description="Selections")
    last_activity: Optional[str] = Field(None, description="Last activity timestamp")
    engagement_score: float = Field(0, description="Calculated engagement score")


class ClientGalleryInteractionsResponse(BaseModel):
    """Client gallery interactions response."""

    client_id: str
    galleries: list[ClientGalleryInteraction] = Field(default_factory=list)
    total_galleries: int = Field(0, description="Total galleries interacted with")
    summary: dict = Field(default_factory=dict, description="Summary statistics")
    generated_at: str


class WorkspaceClientStatsResponse(BaseModel):
    """Workspace client statistics response."""

    total_clients: int = Field(0, description="Total clients")
    active_clients: int = Field(0, description="Active clients")
    new_clients_last_30_days: int = Field(0, description="New clients in last 30 days")
    engagement_breakdown: dict = Field(default_factory=dict, description="Engagement tier breakdown")
    churn_risk_breakdown: dict = Field(default_factory=dict, description="Churn risk breakdown")
    avg_engagement_score: Optional[float] = Field(None, description="Average engagement score")
    avg_lifetime_value_cents: int = Field(0, description="Average lifetime value")
    workspace_health_score: float = Field(0, description="Overall health score 0-100")
    segments: dict = Field(default_factory=dict, description="Client segment definitions")
    period_type: str
    generated_at: str


class ClientComparisonEntry(BaseModel):
    """Client comparison entry."""

    client_id: str
    client_name: Optional[str] = None
    email: Optional[str] = None
    engagement_score: Optional[float] = Field(None)
    churn_risk_score: Optional[float] = Field(None)
    total_gallery_views: int = Field(0)
    total_downloads: int = Field(0)
    total_favorites: int = Field(0)
    lifetime_value_cents: int = Field(0)
    total_sessions: int = Field(0)


class ClientsComparisonResponse(BaseModel):
    """Clients comparison response."""

    clients: list[ClientComparisonEntry] = Field(default_factory=list)
    period_type: str
    generated_at: str


# ---------------------------------------------------------------------------
# Client Analytics Endpoints (T022)
# ---------------------------------------------------------------------------


@router.get(
    "/clients/{client_id}",
    response_model=ClientAnalyticsDetailsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get client analytics details",
    description="""
    Get comprehensive analytics for a specific client.

    Includes:
    - Analytics metrics (views, downloads, engagement score, churn risk)
    - Engagement breakdown (favorites, comments, selections)
    - Engagement tier classification
    - Churn risk level assessment
    - Optional historical data
    - Optional gallery interaction breakdown
    """,
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Client not found"},
    },
)
async def get_client_analytics_details(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    client_id: Annotated[UUID, Path(..., description="Client ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    period_type: Annotated[
        str,
        Query(
            description="Period type: daily, weekly, monthly, or all_time",
            pattern="^(daily|weekly|monthly|all_time)$",
        ),
    ] = "all_time",
    include_history: Annotated[
        bool,
        Query(description="Include historical analytics records"),
    ] = False,
    include_galleries: Annotated[
        bool,
        Query(description="Include per-gallery interaction breakdown"),
    ] = False,
    history_limit: Annotated[
        int,
        Query(ge=1, le=365, description="Max history records to include"),
    ] = 30,
) -> ClientAnalyticsDetailsResponse:
    """Get comprehensive analytics for a specific client."""
    service = get_analytics_service()
    try:
        result = await service.get_client_analytics_details(
            workspace_id=workspace_id,
            client_id=client_id,
            period_type=period_type,
            include_history=include_history,
            include_galleries=include_galleries,
            history_limit=history_limit,
        )

        # Get analytics data
        analytics_data = result.get("analytics", {})
        client_data = result.get("client")
        engagement_data = result.get("engagement_breakdown", {})

        # Build client info if available
        client_info = None
        if client_data:
            client_info = ClientInfo(
                client_id=str(client_id),
                name=client_data.get("name"),
                email=client_data.get("email"),
                status=client_data.get("status"),
                created_at=client_data.get("created_at"),
            )

        return ClientAnalyticsDetailsResponse(
            client_id=str(client_id),
            client=client_info,
            analytics=ClientAnalyticsMetrics(
                total_gallery_views=analytics_data.get("total_gallery_views", 0),
                unique_galleries_viewed=analytics_data.get("unique_galleries_viewed", 0),
                total_asset_views=analytics_data.get("total_asset_views", 0),
                total_favorites=analytics_data.get("total_favorites", 0),
                total_comments=analytics_data.get("total_comments", 0),
                total_selections=analytics_data.get("total_selections", 0),
                total_downloads=analytics_data.get("total_downloads", 0),
                total_sessions=analytics_data.get("total_sessions", 0),
                avg_session_duration_ms=analytics_data.get("avg_session_duration_ms", 0),
                engagement_score=analytics_data.get("engagement_score"),
                churn_risk_score=analytics_data.get("churn_risk_score"),
                lifetime_value_cents=analytics_data.get("lifetime_value_cents", 0),
                days_since_last_activity=analytics_data.get("days_since_last_activity"),
            ),
            engagement_breakdown=ClientEngagementBreakdown(
                gallery_views=engagement_data.get("gallery_views", 0),
                asset_views=engagement_data.get("asset_views", 0),
                favorites=engagement_data.get("favorites", 0),
                comments=engagement_data.get("comments", 0),
                selections=engagement_data.get("selections", 0),
                downloads=engagement_data.get("downloads", 0),
                shares=engagement_data.get("shares", 0),
                total_engagement_actions=engagement_data.get("total_engagement_actions", 0),
                calculated_engagement_score=engagement_data.get("calculated_engagement_score"),
                engagement_tier=engagement_data.get("engagement_tier"),
            ),
            engagement_tier=result.get("engagement_tier", "minimal_engagement"),
            churn_risk_level=result.get("churn_risk_level"),
            period_type=result.get("period_type", period_type),
            history=result.get("history") if include_history else None,
            gallery_interactions=result.get("gallery_interactions") if include_galleries else None,
            generated_at=result.get("generated_at", datetime.utcnow().isoformat()),
        )
    except AnalyticsError as e:
        logger.exception("Analytics error getting client analytics details")
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status_code,
        )
    except Exception as e:
        logger.exception("Failed to get client analytics details")
        raise AppError(
            message="Failed to get client analytics details",
            code="ANALYTICS_ERROR",
            status_code=500,
        )


@router.get(
    "/clients/{client_id}/summary",
    response_model=ClientAnalyticsSummaryResponse,
    status_code=status.HTTP_200_OK,
    summary="Get client analytics summary",
    description="""
    Get a simple analytics summary for a client.

    Returns the most recent pre-calculated analytics for the specified period type.
    Faster than the detailed endpoint as it uses cached aggregations.
    """,
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Client not found or no analytics"},
    },
)
async def get_client_analytics_summary(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    client_id: Annotated[UUID, Path(..., description="Client ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    period_type: Annotated[
        str,
        Query(
            description="Period type: daily, weekly, monthly, or all_time",
            pattern="^(daily|weekly|monthly|all_time)$",
        ),
    ] = "all_time",
) -> ClientAnalyticsSummaryResponse:
    """Get simple analytics summary for a client."""
    service = get_analytics_service()
    try:
        result = await service.get_client_analytics_details(
            workspace_id=workspace_id,
            client_id=client_id,
            period_type=period_type,
            include_history=False,
            include_galleries=False,
        )

        analytics = result.get("analytics", {})

        # Determine engagement tier
        engagement_score = analytics.get("engagement_score", 0) or 0
        if engagement_score >= 70:
            engagement_tier = "highly_engaged"
        elif engagement_score >= 40:
            engagement_tier = "moderately_engaged"
        elif engagement_score >= 20:
            engagement_tier = "low_engagement"
        else:
            engagement_tier = "minimal_engagement"

        return ClientAnalyticsSummaryResponse(
            client_id=str(client_id),
            period_type=result.get("period_type", period_type),
            engagement_score=analytics.get("engagement_score"),
            churn_risk_score=analytics.get("churn_risk_score"),
            total_gallery_views=analytics.get("total_gallery_views", 0),
            total_downloads=analytics.get("total_downloads", 0),
            total_favorites=analytics.get("total_favorites", 0),
            lifetime_value_cents=analytics.get("lifetime_value_cents", 0),
            engagement_tier=engagement_tier,
            calculated_at=str(analytics.get("calculated_at")) if analytics.get("calculated_at") else None,
        )
    except AnalyticsError as e:
        logger.exception("Analytics error getting client analytics summary")
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status_code,
        )
    except Exception as e:
        logger.exception("Failed to get client analytics summary")
        raise AppError(
            message="Failed to get client analytics summary",
            code="ANALYTICS_ERROR",
            status_code=500,
        )


@router.get(
    "/clients/{client_id}/activity-time-series",
    response_model=ClientActivityTimeSeriesResponse,
    status_code=status.HTTP_200_OK,
    summary="Get client activity time series",
    description="""
    Get client activity as a time series for charting.

    Returns data points with views, downloads, favorites, and engagement actions
    for each time period. Supports daily, weekly, or monthly granularity.
    """,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid parameters"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Client not found"},
    },
)
async def get_client_activity_time_series(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    client_id: Annotated[UUID, Path(..., description="Client ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    start_date: Annotated[
        Optional[datetime],
        Query(description="Start date (ISO format, default: 30 days ago)"),
    ] = None,
    end_date: Annotated[
        Optional[datetime],
        Query(description="End date (ISO format, default: now)"),
    ] = None,
    granularity: Annotated[
        str,
        Query(
            description="Time granularity: daily, weekly, or monthly",
            pattern="^(daily|weekly|monthly)$",
        ),
    ] = "daily",
) -> ClientActivityTimeSeriesResponse:
    """Get client activity time series for charting."""
    service = get_analytics_service()
    try:
        # Convert datetime to date if provided
        start_dt = start_date.date() if start_date else None
        end_dt = end_date.date() if end_date else None

        result = await service.get_client_activity_time_series(
            workspace_id=workspace_id,
            client_id=client_id,
            start_date=start_dt,
            end_date=end_dt,
            granularity=granularity,
        )

        return ClientActivityTimeSeriesResponse(
            client_id=str(client_id),
            granularity=granularity,
            time_series=[
                ClientActivityTimeSeriesPoint(
                    date=str(d.get("date", "")),
                    gallery_views=d.get("gallery_views", 0),
                    asset_views=d.get("asset_views", 0),
                    downloads=d.get("downloads", 0),
                    favorites=d.get("favorites", 0),
                    comments=d.get("comments", 0),
                    total_engagement_actions=d.get("total_engagement_actions", 0),
                )
                for d in result.get("time_series", [])
            ],
            data_points=result.get("data_points", 0),
            period=result.get("period", {}),
            summary=result.get("summary", {}),
            generated_at=result.get("generated_at", datetime.utcnow().isoformat()),
        )
    except InvalidDateRangeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except AnalyticsError as e:
        logger.exception("Analytics error getting client activity time series")
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status_code,
        )
    except Exception as e:
        logger.exception("Failed to get client activity time series")
        raise AppError(
            message="Failed to get client activity time series",
            code="ANALYTICS_ERROR",
            status_code=500,
        )


@router.get(
    "/clients/{client_id}/engagement",
    response_model=ClientEngagementBreakdown,
    status_code=status.HTTP_200_OK,
    summary="Get client engagement breakdown",
    description="""
    Get detailed engagement breakdown for a client.

    Returns engagement metrics including gallery views, asset views, favorites,
    comments, selections, downloads, and shares with calculated engagement score.
    """,
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Client not found"},
    },
)
async def get_client_engagement_breakdown(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    client_id: Annotated[UUID, Path(..., description="Client ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    start_date: Annotated[
        Optional[datetime],
        Query(description="Start date (ISO format)"),
    ] = None,
    end_date: Annotated[
        Optional[datetime],
        Query(description="End date (ISO format)"),
    ] = None,
) -> ClientEngagementBreakdown:
    """Get detailed engagement breakdown for a client."""
    service = get_analytics_service()
    try:
        # Convert datetime to date if provided
        start_dt = start_date.date() if start_date else None
        end_dt = end_date.date() if end_date else None

        result = await service.get_client_engagement_breakdown(
            workspace_id=workspace_id,
            client_id=client_id,
            start_date=start_dt,
            end_date=end_dt,
        )

        breakdown = result.get("breakdown", {})

        return ClientEngagementBreakdown(
            gallery_views=breakdown.get("gallery_views", 0),
            asset_views=breakdown.get("asset_views", 0),
            favorites=breakdown.get("favorites", 0),
            comments=breakdown.get("comments", 0),
            selections=breakdown.get("selections", 0),
            downloads=breakdown.get("downloads", 0),
            shares=breakdown.get("shares", 0),
            total_engagement_actions=breakdown.get("total_engagement_actions", 0),
            calculated_engagement_score=breakdown.get("calculated_engagement_score"),
            engagement_tier=breakdown.get("engagement_tier"),
        )
    except AnalyticsError as e:
        logger.exception("Analytics error getting client engagement breakdown")
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status_code,
        )
    except Exception as e:
        logger.exception("Failed to get client engagement breakdown")
        raise AppError(
            message="Failed to get client engagement breakdown",
            code="ANALYTICS_ERROR",
            status_code=500,
        )


@router.get(
    "/clients/{client_id}/history",
    response_model=ClientAnalyticsHistoryResponse,
    status_code=status.HTTP_200_OK,
    summary="Get client analytics history",
    description="""
    Get historical analytics records for a client.

    Returns multiple analytics records over time for trend analysis.
    Includes calculated trends comparing recent periods.
    """,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid parameters"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Client not found"},
    },
)
async def get_client_analytics_history(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    client_id: Annotated[UUID, Path(..., description="Client ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    period_type: Annotated[
        str,
        Query(
            description="Period type: daily, weekly, or monthly",
            pattern="^(daily|weekly|monthly)$",
        ),
    ] = "daily",
    limit: Annotated[
        int,
        Query(ge=1, le=365, description="Max records to return"),
    ] = 30,
) -> ClientAnalyticsHistoryResponse:
    """Get historical client analytics for trend analysis."""
    service = get_analytics_service()
    try:
        result = await service.get_client_analytics_history(
            workspace_id=workspace_id,
            client_id=client_id,
            period_type=period_type,
            limit=limit,
        )

        return ClientAnalyticsHistoryResponse(
            client_id=str(client_id),
            period_type=period_type,
            history=[
                ClientAnalyticsHistoryEntry(
                    period_start=str(h.get("period_start", "")),
                    period_end=str(h.get("period_end", "")),
                    period_type=h.get("period_type", period_type),
                    engagement_score=h.get("engagement_score"),
                    total_gallery_views=h.get("total_gallery_views", 0),
                    total_downloads=h.get("total_downloads", 0),
                    churn_risk_score=h.get("churn_risk_score"),
                    calculated_at=str(h.get("calculated_at")) if h.get("calculated_at") else None,
                )
                for h in result.get("history", [])
            ],
            record_count=result.get("record_count", 0),
            trends=result.get("trends", {}),
            generated_at=result.get("generated_at", datetime.utcnow().isoformat()),
        )
    except AnalyticsError as e:
        logger.exception("Analytics error getting client analytics history")
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status_code,
        )
    except Exception as e:
        logger.exception("Failed to get client analytics history")
        raise AppError(
            message="Failed to get client analytics history",
            code="ANALYTICS_ERROR",
            status_code=500,
        )


@router.get(
    "/clients/{client_id}/galleries",
    response_model=ClientGalleryInteractionsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get client gallery interactions",
    description="""
    Get galleries a client has interacted with.

    Returns galleries ranked by engagement level, with detailed metrics
    for each interaction including views, favorites, comments, and downloads.
    """,
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Client not found"},
    },
)
async def get_client_gallery_interactions(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    client_id: Annotated[UUID, Path(..., description="Client ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    limit: Annotated[
        int,
        Query(ge=1, le=100, description="Max galleries to return"),
    ] = 20,
) -> ClientGalleryInteractionsResponse:
    """Get galleries a client has interacted with."""
    service = get_analytics_service()
    try:
        result = await service.get_client_gallery_interactions(
            workspace_id=workspace_id,
            client_id=client_id,
            limit=limit,
        )

        return ClientGalleryInteractionsResponse(
            client_id=str(client_id),
            galleries=[
                ClientGalleryInteraction(
                    rank=g.get("rank", 0),
                    gallery_id=str(g.get("gallery_id", "")),
                    gallery_name=g.get("gallery_name"),
                    views=g.get("views", 0),
                    favorites=g.get("favorites", 0),
                    comments=g.get("comments", 0),
                    downloads=g.get("downloads", 0),
                    selections=g.get("selections", 0),
                    last_activity=str(g.get("last_activity")) if g.get("last_activity") else None,
                    engagement_score=g.get("engagement_score", 0),
                )
                for g in result.get("galleries", [])
            ],
            total_galleries=result.get("total_galleries", 0),
            summary=result.get("summary", {}),
            generated_at=result.get("generated_at", datetime.utcnow().isoformat()),
        )
    except AnalyticsError as e:
        logger.exception("Analytics error getting client gallery interactions")
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status_code,
        )
    except Exception as e:
        logger.exception("Failed to get client gallery interactions")
        raise AppError(
            message="Failed to get client gallery interactions",
            code="ANALYTICS_ERROR",
            status_code=500,
        )


@router.post(
    "/clients/{client_id}/calculate",
    response_model=dict,
    status_code=status.HTTP_200_OK,
    summary="Calculate client analytics",
    description="""
    Trigger analytics calculation for a client.

    Aggregates raw events into a client analytics record and stores it for
    fast retrieval. Calculates engagement score, churn risk, and lifetime value.
    This is typically called by background jobs but can be triggered manually.
    """,
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Client not found"},
    },
)
async def calculate_client_analytics(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    client_id: Annotated[UUID, Path(..., description="Client ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    period_type: Annotated[
        str,
        Query(
            description="Period type: daily, weekly, monthly, or all_time",
            pattern="^(daily|weekly|monthly|all_time)$",
        ),
    ] = "all_time",
) -> dict[str, Any]:
    """Trigger analytics calculation for a client."""
    service = get_analytics_service()
    try:
        result = await service.calculate_client_analytics(
            workspace_id=workspace_id,
            client_id=client_id,
            period_type=period_type,
        )

        return {
            "status": "success",
            "client_id": str(client_id),
            "period_type": period_type,
            "analytics": result,
            "calculated_at": datetime.utcnow().isoformat(),
        }
    except AnalyticsError as e:
        logger.exception("Analytics error calculating client analytics")
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status_code,
        )
    except Exception as e:
        logger.exception("Failed to calculate client analytics")
        raise AppError(
            message="Failed to calculate client analytics",
            code="ANALYTICS_ERROR",
            status_code=500,
        )


@router.get(
    "/top-clients",
    response_model=TopClientsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get top clients",
    description="""
    Get top performing clients for the workspace.

    Clients can be ranked by engagement score, gallery views, downloads,
    favorites, sessions, or lifetime value.
    """,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid parameters"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Workspace not found"},
    },
)
async def get_top_clients(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    period_type: Annotated[
        str,
        Query(
            description="Period type: daily, weekly, monthly, or all_time",
            pattern="^(daily|weekly|monthly|all_time)$",
        ),
    ] = "all_time",
    limit: Annotated[
        int,
        Query(ge=1, le=50, description="Max clients to return"),
    ] = 10,
    sort_by: Annotated[
        str,
        Query(
            description="Sort by: engagement_score, total_gallery_views, total_downloads, "
                       "total_favorites, total_comments, total_sessions, or lifetime_value_cents",
            pattern="^(engagement_score|total_gallery_views|total_downloads|total_favorites|"
                   "total_comments|total_sessions|lifetime_value_cents)$",
        ),
    ] = "engagement_score",
) -> TopClientsResponse:
    """Get top performing clients."""
    service = get_analytics_service()
    try:
        result = await service.get_top_clients(
            workspace_id=workspace_id,
            period_type=period_type,
            sort_by=sort_by,
            limit=limit,
        )

        return TopClientsResponse(
            clients=[
                TopClientEntry(
                    rank=c.get("rank", 0),
                    client_id=str(c.get("client_id", "")),
                    client_name=c.get("name") or c.get("client_name"),
                    email=c.get("email"),
                    engagement_score=c.get("engagement_score"),
                    total_gallery_views=c.get("total_gallery_views", 0),
                    total_downloads=c.get("total_downloads", 0),
                    total_favorites=c.get("total_favorites", 0),
                    lifetime_value_cents=c.get("lifetime_value_cents", 0),
                    status=c.get("status"),
                )
                for c in result.get("clients", [])
            ],
            total=result.get("total", 0),
            sort_by=result.get("sort_by", sort_by),
            period_type=result.get("period_type", period_type),
            generated_at=result.get("generated_at", datetime.utcnow().isoformat()),
        )
    except InvalidDateRangeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except AnalyticsError as e:
        logger.exception("Analytics error getting top clients")
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status_code,
        )
    except Exception as e:
        logger.exception("Failed to get top clients")
        raise AppError(
            message="Failed to get top clients",
            code="ANALYTICS_ERROR",
            status_code=500,
        )


@router.get(
    "/clients-at-risk",
    response_model=ChurnRiskResponse,
    status_code=status.HTTP_200_OK,
    summary="Get clients at churn risk",
    description="""
    Get clients at risk of churning.

    Identifies clients with high churn risk scores based on inactivity,
    declining engagement, and other risk factors. Provides recommendations
    for re-engagement.
    """,
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Workspace not found"},
    },
)
async def get_clients_at_churn_risk(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    min_risk_score: Annotated[
        int,
        Query(ge=0, le=100, description="Minimum churn risk score to include"),
    ] = 50,
    period_type: Annotated[
        str,
        Query(
            description="Period type: daily, weekly, monthly, or all_time",
            pattern="^(daily|weekly|monthly|all_time)$",
        ),
    ] = "all_time",
    limit: Annotated[
        int,
        Query(ge=1, le=100, description="Max clients to return"),
    ] = 20,
) -> ChurnRiskResponse:
    """Get clients at risk of churning."""
    service = get_analytics_service()
    try:
        result = await service.get_clients_at_churn_risk(
            workspace_id=workspace_id,
            min_risk_score=min_risk_score,
            period_type=period_type,
            limit=limit,
        )

        return ChurnRiskResponse(
            clients=[
                ChurnRiskClientEntry(
                    client_id=str(c.get("client_id", "")),
                    client_name=c.get("name") or c.get("client_name"),
                    email=c.get("email"),
                    churn_risk_score=c.get("churn_risk_score", 0),
                    engagement_score=c.get("engagement_score"),
                    days_since_last_activity=c.get("days_since_last_activity"),
                    risk_factors=c.get("risk_factors", []),
                    recommendations=c.get("recommendations", []),
                )
                for c in result.get("clients", [])
            ],
            total_at_risk=result.get("total_at_risk", 0),
            high_risk_count=result.get("high_risk_count", 0),
            medium_risk_count=result.get("medium_risk_count", 0),
            min_risk_score=result.get("min_risk_score", min_risk_score),
            period_type=result.get("period_type", period_type),
            generated_at=result.get("generated_at", datetime.utcnow().isoformat()),
        )
    except AnalyticsError as e:
        logger.exception("Analytics error getting clients at churn risk")
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status_code,
        )
    except Exception as e:
        logger.exception("Failed to get clients at churn risk")
        raise AppError(
            message="Failed to get clients at churn risk",
            code="ANALYTICS_ERROR",
            status_code=500,
        )


@router.get(
    "/client-stats",
    response_model=WorkspaceClientStatsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get workspace client statistics",
    description="""
    Get aggregate client statistics for the workspace.

    Provides workspace-level client analytics including engagement distribution,
    churn risk breakdown, segment analysis, and overall workspace health score.
    """,
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Workspace not found"},
    },
)
async def get_workspace_client_stats(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    period_type: Annotated[
        str,
        Query(
            description="Period type: daily, weekly, monthly, or all_time",
            pattern="^(daily|weekly|monthly|all_time)$",
        ),
    ] = "all_time",
) -> WorkspaceClientStatsResponse:
    """Get aggregate client statistics for the workspace."""
    service = get_analytics_service()
    try:
        result = await service.get_workspace_client_stats(
            workspace_id=workspace_id,
            period_type=period_type,
        )

        return WorkspaceClientStatsResponse(
            total_clients=result.get("total_clients", 0),
            active_clients=result.get("active_clients", 0),
            new_clients_last_30_days=result.get("new_clients_last_30_days", 0),
            engagement_breakdown=result.get("engagement_breakdown", {}),
            churn_risk_breakdown=result.get("churn_risk_breakdown", {}),
            avg_engagement_score=result.get("avg_engagement_score"),
            avg_lifetime_value_cents=result.get("avg_lifetime_value_cents", 0),
            workspace_health_score=result.get("workspace_health_score", 0),
            segments=result.get("segments", {}),
            period_type=result.get("period_type", period_type),
            generated_at=result.get("generated_at", datetime.utcnow().isoformat()),
        )
    except AnalyticsError as e:
        logger.exception("Analytics error getting workspace client stats")
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status_code,
        )
    except Exception as e:
        logger.exception("Failed to get workspace client stats")
        raise AppError(
            message="Failed to get workspace client stats",
            code="ANALYTICS_ERROR",
            status_code=500,
        )


@router.post(
    "/clients/compare",
    response_model=ClientsComparisonResponse,
    status_code=status.HTTP_200_OK,
    summary="Compare clients",
    description="""
    Compare analytics across multiple clients.

    Provides side-by-side comparison of key metrics for the specified clients.
    Requires 2-10 client IDs.
    """,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid parameters"},
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def compare_clients(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    client_ids: Annotated[
        str,
        Query(description="Comma-separated client IDs to compare (2-10)"),
    ],
    period_type: Annotated[
        str,
        Query(
            description="Period type: daily, weekly, monthly, or all_time",
            pattern="^(daily|weekly|monthly|all_time)$",
        ),
    ] = "all_time",
) -> ClientsComparisonResponse:
    """Compare analytics across multiple clients."""
    service = get_analytics_service()
    try:
        # Parse client IDs
        client_id_list = []
        for cid in client_ids.split(","):
            cid = cid.strip()
            if cid:
                try:
                    client_id_list.append(UUID(cid))
                except ValueError:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid client ID format: {cid}",
                    )

        if len(client_id_list) < 2:
            raise HTTPException(
                status_code=400,
                detail="Need at least 2 clients to compare",
            )

        if len(client_id_list) > 10:
            raise HTTPException(
                status_code=400,
                detail="Cannot compare more than 10 clients at once",
            )

        result = await service.compare_clients(
            workspace_id=workspace_id,
            client_ids=client_id_list,
            period_type=period_type,
        )

        return ClientsComparisonResponse(
            clients=[
                ClientComparisonEntry(
                    client_id=str(c.get("client_id", "")),
                    client_name=c.get("name") or c.get("client_name"),
                    email=c.get("email"),
                    engagement_score=c.get("engagement_score"),
                    churn_risk_score=c.get("churn_risk_score"),
                    total_gallery_views=c.get("total_gallery_views", 0),
                    total_downloads=c.get("total_downloads", 0),
                    total_favorites=c.get("total_favorites", 0),
                    lifetime_value_cents=c.get("lifetime_value_cents", 0),
                    total_sessions=c.get("total_sessions", 0),
                )
                for c in result.get("clients", [])
            ],
            period_type=result.get("period_type", period_type),
            generated_at=result.get("generated_at", datetime.utcnow().isoformat()),
        )
    except HTTPException:
        raise
    except InvalidDateRangeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except AnalyticsError as e:
        logger.exception("Analytics error comparing clients")
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status_code,
        )
    except Exception as e:
        logger.exception("Failed to compare clients")
        raise AppError(
            message="Failed to compare clients",
            code="ANALYTICS_ERROR",
            status_code=500,
        )


# ---------------------------------------------------------------------------
# Response Models - Reports (T023)
# ---------------------------------------------------------------------------


class ReportConfigMetrics(BaseModel):
    """Configuration for report metrics."""

    metrics: list[str] = Field(default_factory=list, description="List of metric names")
    grouping: list[str] = Field(default_factory=list, description="Grouping fields")
    sorting: dict[str, Any] = Field(default_factory=dict, description="Sorting config")


class ReportDateRange(BaseModel):
    """Date range configuration for a report."""

    type: str = Field(..., description="Date range type (last_7_days, last_30_days, custom, etc.)")
    custom_start_date: Optional[str] = Field(None, description="Custom start date (YYYY-MM-DD)")
    custom_end_date: Optional[str] = Field(None, description="Custom end date (YYYY-MM-DD)")


class ReportScheduleConfig(BaseModel):
    """Schedule configuration for a report."""

    is_scheduled: bool = Field(False, description="Whether report is scheduled")
    schedule_cron: Optional[str] = Field(None, description="Cron expression")
    schedule_timezone: str = Field("UTC", description="Timezone for schedule")
    recipients: list[dict[str, Any]] = Field(default_factory=list, description="Email recipients")


class ReportSummary(BaseModel):
    """Summary of a report configuration."""

    report_id: str = Field(..., description="Report ID")
    name: str = Field(..., description="Report name")
    description: Optional[str] = Field(None, description="Report description")
    report_type: str = Field(..., description="Report type")
    date_range_type: str = Field(..., description="Date range type")
    export_format: str = Field(..., description="Default export format")
    is_scheduled: bool = Field(False, description="Whether report is scheduled")
    is_active: bool = Field(True, description="Whether report is active")
    run_count: int = Field(0, description="Number of times report has been run")
    last_run_at: Optional[str] = Field(None, description="Last run timestamp")
    last_run_status: Optional[str] = Field(None, description="Last run status")
    created_by_user_id: str = Field(..., description="Creator user ID")
    created_at: str = Field(..., description="Creation timestamp")
    updated_at: str = Field(..., description="Last update timestamp")


class ReportDetails(BaseModel):
    """Full report configuration details."""

    report_id: str = Field(..., description="Report ID")
    workspace_id: str = Field(..., description="Workspace ID")
    name: str = Field(..., description="Report name")
    description: Optional[str] = Field(None, description="Report description")
    report_type: str = Field(..., description="Report type")

    # Configuration
    config: dict[str, Any] = Field(default_factory=dict, description="General config")
    metrics: list[str] = Field(default_factory=list, description="Metrics to include")
    filters: dict[str, Any] = Field(default_factory=dict, description="Filter criteria")
    grouping: list[str] = Field(default_factory=list, description="Grouping fields")
    sorting: dict[str, Any] = Field(default_factory=dict, description="Sorting config")

    # Date range
    date_range_type: str = Field(..., description="Date range type")
    custom_start_date: Optional[str] = Field(None, description="Custom start date")
    custom_end_date: Optional[str] = Field(None, description="Custom end date")

    # Export config
    export_format: str = Field(..., description="Default export format")
    export_config: dict[str, Any] = Field(default_factory=dict, description="Export options")

    # Scheduling
    is_scheduled: bool = Field(False, description="Whether report is scheduled")
    schedule_cron: Optional[str] = Field(None, description="Cron expression")
    schedule_timezone: str = Field("UTC", description="Timezone")
    next_run_at: Optional[str] = Field(None, description="Next scheduled run")
    last_run_at: Optional[str] = Field(None, description="Last run timestamp")
    recipients: list[dict[str, Any]] = Field(default_factory=list, description="Recipients")

    # Status
    is_active: bool = Field(True, description="Whether report is active")
    is_system: bool = Field(False, description="Whether this is a system report")
    run_count: int = Field(0, description="Run count")
    last_run_status: Optional[str] = Field(None, description="Last run status")
    last_run_error: Optional[str] = Field(None, description="Last run error message")

    # Ownership
    created_by_user_id: str = Field(..., description="Creator user ID")
    updated_by_user_id: Optional[str] = Field(None, description="Last updater user ID")
    created_at: str = Field(..., description="Creation timestamp")
    updated_at: str = Field(..., description="Update timestamp")


class ReportCreateRequest(BaseModel):
    """Request body for creating a report."""

    name: str = Field(..., min_length=1, max_length=255, description="Report name")
    description: Optional[str] = Field(None, max_length=1000, description="Report description")
    report_type: str = Field(
        ...,
        description="Report type: dashboard_summary, gallery_performance, client_engagement, "
                   "revenue_report, download_report, or custom"
    )

    # Configuration
    config: dict[str, Any] = Field(default_factory=dict, description="General config")
    metrics: list[str] = Field(default_factory=list, description="Metrics to include")
    filters: dict[str, Any] = Field(default_factory=dict, description="Filter criteria")
    grouping: list[str] = Field(default_factory=list, description="Grouping fields")
    sorting: dict[str, Any] = Field(default_factory=dict, description="Sorting config")

    # Date range
    date_range_type: str = Field(
        "last_30_days",
        description="Date range type: today, yesterday, last_7_days, last_30_days, "
                   "last_90_days, this_month, last_month, this_year, last_year, or custom"
    )
    custom_start_date: Optional[str] = Field(
        None, description="Custom start date (YYYY-MM-DD), required if date_range_type is custom"
    )
    custom_end_date: Optional[str] = Field(
        None, description="Custom end date (YYYY-MM-DD), required if date_range_type is custom"
    )

    # Export config
    export_format: str = Field("csv", description="Default export format: csv, pdf, or xlsx")
    export_config: dict[str, Any] = Field(default_factory=dict, description="Export options")

    # Scheduling (optional)
    is_scheduled: bool = Field(False, description="Whether to schedule this report")
    schedule_cron: Optional[str] = Field(
        None, description="Cron expression (e.g., '0 9 * * 1' for Mondays at 9am)"
    )
    schedule_timezone: str = Field("UTC", description="Timezone for schedule")
    recipients: list[dict[str, Any]] = Field(
        default_factory=list, description="Recipients for scheduled reports"
    )


class ReportUpdateRequest(BaseModel):
    """Request body for updating a report."""

    name: Optional[str] = Field(None, min_length=1, max_length=255, description="Report name")
    description: Optional[str] = Field(None, max_length=1000, description="Report description")

    # Configuration
    config: Optional[dict[str, Any]] = Field(None, description="General config")
    metrics: Optional[list[str]] = Field(None, description="Metrics to include")
    filters: Optional[dict[str, Any]] = Field(None, description="Filter criteria")
    grouping: Optional[list[str]] = Field(None, description="Grouping fields")
    sorting: Optional[dict[str, Any]] = Field(None, description="Sorting config")

    # Date range
    date_range_type: Optional[str] = Field(None, description="Date range type")
    custom_start_date: Optional[str] = Field(None, description="Custom start date (YYYY-MM-DD)")
    custom_end_date: Optional[str] = Field(None, description="Custom end date (YYYY-MM-DD)")

    # Export config
    export_format: Optional[str] = Field(None, description="Default export format")
    export_config: Optional[dict[str, Any]] = Field(None, description="Export options")

    # Scheduling
    is_scheduled: Optional[bool] = Field(None, description="Whether to schedule this report")
    schedule_cron: Optional[str] = Field(None, description="Cron expression")
    schedule_timezone: Optional[str] = Field(None, description="Timezone for schedule")
    recipients: Optional[list[dict[str, Any]]] = Field(None, description="Recipients")

    # Status
    is_active: Optional[bool] = Field(None, description="Whether report is active")


class ReportsListResponse(BaseModel):
    """Response for listing reports."""

    reports: list[ReportSummary] = Field(default_factory=list)
    total: int = Field(0, description="Total matching reports")
    limit: int = Field(50, description="Page size")
    offset: int = Field(0, description="Pagination offset")
    has_more: bool = Field(False, description="Whether there are more results")


class ReportRunRequest(BaseModel):
    """Request body for running a report."""

    override_date_range_type: Optional[str] = Field(
        None, description="Override the report's date range type"
    )
    override_start_date: Optional[str] = Field(
        None, description="Override start date (YYYY-MM-DD, for custom range)"
    )
    override_end_date: Optional[str] = Field(
        None, description="Override end date (YYYY-MM-DD, for custom range)"
    )


class ReportRunResponse(BaseModel):
    """Response from running a report."""

    report_id: str = Field(..., description="Report ID")
    report_name: str = Field(..., description="Report name")
    report_type: str = Field(..., description="Report type")
    date_range: dict[str, Any] = Field(..., description="Date range used")
    data: dict[str, Any] = Field(..., description="Report data")
    generated_at: str = Field(..., description="Generation timestamp")


# ---------------------------------------------------------------------------
# Reports CRUD Endpoints (T023)
# ---------------------------------------------------------------------------


@router.post(
    "/reports",
    response_model=ReportDetails,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new report",
    description="""
    Create a new custom report configuration.

    Reports can be configured with:
    - Report type (dashboard_summary, gallery_performance, client_engagement, etc.)
    - Metrics to include
    - Filter criteria
    - Date range (predefined or custom)
    - Export format (CSV, PDF, XLSX)
    - Optional scheduling with cron expression and recipients

    The report configuration is saved and can be run on-demand or scheduled.
    """,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid report configuration"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Workspace not found"},
    },
)
async def create_report(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: ReportCreateRequest,
) -> ReportDetails:
    """Create a new custom report configuration."""
    service = get_analytics_service()
    try:
        # Parse custom dates if provided
        custom_start = None
        custom_end = None
        if request.custom_start_date:
            try:
                custom_start = datetime.strptime(request.custom_start_date, "%Y-%m-%d").date()
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid custom_start_date format. Use YYYY-MM-DD.",
                )
        if request.custom_end_date:
            try:
                custom_end = datetime.strptime(request.custom_end_date, "%Y-%m-%d").date()
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid custom_end_date format. Use YYYY-MM-DD.",
                )

        result = await service.create_report(
            workspace_id=workspace_id,
            name=request.name,
            report_type=request.report_type,
            created_by_user_id=current_user.user_id,
            description=request.description,
            config=request.config,
            metrics=request.metrics,
            filters=request.filters,
            grouping=request.grouping,
            sorting=request.sorting,
            date_range_type=request.date_range_type,
            custom_start_date=custom_start,
            custom_end_date=custom_end,
            export_format=request.export_format,
            export_config=request.export_config,
            is_scheduled=request.is_scheduled,
            schedule_cron=request.schedule_cron,
            schedule_timezone=request.schedule_timezone,
            recipients=request.recipients,
        )

        return _build_report_details(result)

    except InvalidReportTypeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except InvalidDateRangeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except AnalyticsError as e:
        logger.exception("Analytics error creating report")
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status_code,
        )
    except Exception as e:
        logger.exception("Failed to create report")
        raise AppError(
            message="Failed to create report",
            code="ANALYTICS_ERROR",
            status_code=500,
        )


@router.get(
    "/reports",
    response_model=ReportsListResponse,
    status_code=status.HTTP_200_OK,
    summary="List reports",
    description="""
    Get a paginated list of custom report configurations.

    Supports filtering by:
    - Report types (comma-separated)
    - Active status
    - Scheduled status
    - Creator user ID

    Returns report summaries with pagination metadata.
    """,
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Workspace not found"},
    },
)
async def list_reports(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    report_types: Annotated[
        Optional[str],
        Query(description="Comma-separated report types to filter"),
    ] = None,
    is_active: Annotated[
        Optional[bool],
        Query(description="Filter by active status"),
    ] = None,
    is_scheduled: Annotated[
        Optional[bool],
        Query(description="Filter by scheduled status"),
    ] = None,
    created_by_user_id: Annotated[
        Optional[UUID],
        Query(description="Filter by creator user ID"),
    ] = None,
    limit: Annotated[
        int,
        Query(ge=1, le=500, description="Max reports to return"),
    ] = 50,
    offset: Annotated[
        int,
        Query(ge=0, description="Pagination offset"),
    ] = 0,
) -> ReportsListResponse:
    """Get a paginated list of custom reports."""
    service = get_analytics_service()
    try:
        # Parse report types if provided
        report_type_list = None
        if report_types:
            report_type_list = [rt.strip() for rt in report_types.split(",") if rt.strip()]

        result = await service.get_reports(
            workspace_id=workspace_id,
            report_types=report_type_list,
            is_active=is_active,
            is_scheduled=is_scheduled,
            created_by_user_id=created_by_user_id,
            limit=limit,
            offset=offset,
        )

        reports = result.get("reports", [])
        total = result.get("total", len(reports))

        return ReportsListResponse(
            reports=[
                ReportSummary(
                    report_id=str(r.get("report_id", "")),
                    name=r.get("name", ""),
                    description=r.get("description"),
                    report_type=r.get("report_type", ""),
                    date_range_type=r.get("date_range_type", ""),
                    export_format=r.get("export_format", "csv"),
                    is_scheduled=r.get("is_scheduled", False),
                    is_active=r.get("is_active", True),
                    run_count=r.get("run_count", 0),
                    last_run_at=_format_datetime(r.get("last_run_at")),
                    last_run_status=r.get("last_run_status"),
                    created_by_user_id=str(r.get("created_by_user_id", "")),
                    created_at=_format_datetime(r.get("created_at")) or "",
                    updated_at=_format_datetime(r.get("updated_at")) or "",
                )
                for r in reports
            ],
            total=total,
            limit=limit,
            offset=offset,
            has_more=(offset + len(reports)) < total,
        )

    except AnalyticsError as e:
        logger.exception("Analytics error listing reports")
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status_code,
        )
    except Exception as e:
        logger.exception("Failed to list reports")
        raise AppError(
            message="Failed to list reports",
            code="ANALYTICS_ERROR",
            status_code=500,
        )


@router.get(
    "/reports/{report_id}",
    response_model=ReportDetails,
    status_code=status.HTTP_200_OK,
    summary="Get report details",
    description="""
    Get full details of a custom report configuration.

    Returns all configuration options including metrics, filters, date range,
    export settings, scheduling, and status information.
    """,
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Report not found"},
    },
)
async def get_report(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    report_id: Annotated[UUID, Path(..., description="Report ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> ReportDetails:
    """Get full details of a custom report configuration."""
    service = get_analytics_service()
    try:
        result = await service.get_report(
            workspace_id=workspace_id,
            report_id=report_id,
        )

        return _build_report_details(result)

    except ReportNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"Report not found: {report_id}",
        )
    except AnalyticsError as e:
        logger.exception("Analytics error getting report")
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status_code,
        )
    except Exception as e:
        logger.exception("Failed to get report")
        raise AppError(
            message="Failed to get report",
            code="ANALYTICS_ERROR",
            status_code=500,
        )


@router.put(
    "/reports/{report_id}",
    response_model=ReportDetails,
    status_code=status.HTTP_200_OK,
    summary="Update a report",
    description="""
    Update an existing custom report configuration.

    All fields are optional - only provided fields will be updated.
    The report must exist and belong to the workspace.
    """,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid update data"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Report not found"},
    },
)
async def update_report(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    report_id: Annotated[UUID, Path(..., description="Report ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: ReportUpdateRequest,
) -> ReportDetails:
    """Update an existing custom report configuration."""
    service = get_analytics_service()
    try:
        # Parse custom dates if provided
        custom_start = None
        custom_end = None
        if request.custom_start_date:
            try:
                custom_start = datetime.strptime(request.custom_start_date, "%Y-%m-%d").date()
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid custom_start_date format. Use YYYY-MM-DD.",
                )
        if request.custom_end_date:
            try:
                custom_end = datetime.strptime(request.custom_end_date, "%Y-%m-%d").date()
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid custom_end_date format. Use YYYY-MM-DD.",
                )

        result = await service.update_report(
            workspace_id=workspace_id,
            report_id=report_id,
            updated_by_user_id=current_user.user_id,
            name=request.name,
            description=request.description,
            config=request.config,
            metrics=request.metrics,
            filters=request.filters,
            grouping=request.grouping,
            sorting=request.sorting,
            date_range_type=request.date_range_type,
            custom_start_date=custom_start,
            custom_end_date=custom_end,
            export_format=request.export_format,
            export_config=request.export_config,
            is_scheduled=request.is_scheduled,
            schedule_cron=request.schedule_cron,
            schedule_timezone=request.schedule_timezone,
            recipients=request.recipients,
            is_active=request.is_active,
        )

        return _build_report_details(result)

    except ReportNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"Report not found: {report_id}",
        )
    except InvalidDateRangeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except AnalyticsError as e:
        logger.exception("Analytics error updating report")
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status_code,
        )
    except Exception as e:
        logger.exception("Failed to update report")
        raise AppError(
            message="Failed to update report",
            code="ANALYTICS_ERROR",
            status_code=500,
        )


@router.delete(
    "/reports/{report_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a report",
    description="""
    Delete a custom report configuration.

    This permanently removes the report configuration and all associated exports.
    This action cannot be undone.
    """,
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Report not found"},
    },
)
async def delete_report(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    report_id: Annotated[UUID, Path(..., description="Report ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
):
    """Delete a custom report configuration."""
    service = get_analytics_service()
    try:
        await service.delete_report(
            workspace_id=workspace_id,
            report_id=report_id,
        )
        # Return None for 204 No Content

    except ReportNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"Report not found: {report_id}",
        )
    except AnalyticsError as e:
        logger.exception("Analytics error deleting report")
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status_code,
        )
    except Exception as e:
        logger.exception("Failed to delete report")
        raise AppError(
            message="Failed to delete report",
            code="ANALYTICS_ERROR",
            status_code=500,
        )


@router.post(
    "/reports/{report_id}/run",
    response_model=ReportRunResponse,
    status_code=status.HTTP_200_OK,
    summary="Run a report",
    description="""
    Execute a saved report and return the generated data.

    The report is run using its saved configuration. You can optionally override
    the date range for this specific run.

    This returns the report data directly - for exporting to a file, use the
    export endpoints.
    """,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid run parameters"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Report not found"},
        500: {"model": ErrorResponse, "description": "Report generation failed"},
    },
)
async def run_report(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    report_id: Annotated[UUID, Path(..., description="Report ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: Optional[ReportRunRequest] = None,
) -> ReportRunResponse:
    """Execute a saved report and return the generated data."""
    service = get_analytics_service()
    try:
        # Parse override dates if provided
        override_start = None
        override_end = None
        override_date_range_type = None

        if request:
            override_date_range_type = request.override_date_range_type
            if request.override_start_date:
                try:
                    override_start = datetime.strptime(request.override_start_date, "%Y-%m-%d").date()
                except ValueError:
                    raise HTTPException(
                        status_code=400,
                        detail="Invalid override_start_date format. Use YYYY-MM-DD.",
                    )
            if request.override_end_date:
                try:
                    override_end = datetime.strptime(request.override_end_date, "%Y-%m-%d").date()
                except ValueError:
                    raise HTTPException(
                        status_code=400,
                        detail="Invalid override_end_date format. Use YYYY-MM-DD.",
                    )

        result = await service.run_report(
            workspace_id=workspace_id,
            report_id=report_id,
            override_date_range_type=override_date_range_type,
            override_start_date=override_start,
            override_end_date=override_end,
        )

        return ReportRunResponse(
            report_id=result.get("report_id", str(report_id)),
            report_name=result.get("report_name", ""),
            report_type=result.get("report_type", ""),
            date_range=result.get("date_range", {}),
            data=result.get("data", {}),
            generated_at=result.get("generated_at", datetime.utcnow().isoformat()),
        )

    except ReportNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"Report not found: {report_id}",
        )
    except InvalidDateRangeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ReportGenerationError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except HTTPException:
        raise
    except AnalyticsError as e:
        logger.exception("Analytics error running report")
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status_code,
        )
    except Exception as e:
        logger.exception("Failed to run report")
        raise AppError(
            message="Failed to run report",
            code="ANALYTICS_ERROR",
            status_code=500,
        )


# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------


def _format_datetime(dt: Any) -> Optional[str]:
    """Format a datetime value as ISO string."""
    if dt is None:
        return None
    if isinstance(dt, datetime):
        return dt.isoformat()
    if isinstance(dt, str):
        return dt
    return str(dt)


def _format_date(d: Any) -> Optional[str]:
    """Format a date value as YYYY-MM-DD string."""
    if d is None:
        return None
    if hasattr(d, "isoformat"):
        return d.isoformat()
    if isinstance(d, str):
        return d
    return str(d)


def _build_report_details(data: dict[str, Any]) -> ReportDetails:
    """Build a ReportDetails response from a dictionary."""
    return ReportDetails(
        report_id=str(data.get("report_id", "")),
        workspace_id=str(data.get("workspace_id", "")),
        name=data.get("name", ""),
        description=data.get("description"),
        report_type=data.get("report_type", ""),
        config=data.get("config") or {},
        metrics=data.get("metrics") or [],
        filters=data.get("filters") or {},
        grouping=data.get("grouping") or [],
        sorting=data.get("sorting") or {},
        date_range_type=data.get("date_range_type", ""),
        custom_start_date=_format_date(data.get("custom_start_date")),
        custom_end_date=_format_date(data.get("custom_end_date")),
        export_format=data.get("export_format", "csv"),
        export_config=data.get("export_config") or {},
        is_scheduled=data.get("is_scheduled", False),
        schedule_cron=data.get("schedule_cron"),
        schedule_timezone=data.get("schedule_timezone", "UTC"),
        next_run_at=_format_datetime(data.get("next_run_at")),
        last_run_at=_format_datetime(data.get("last_run_at")),
        recipients=data.get("recipients") or [],
        is_active=data.get("is_active", True),
        is_system=data.get("is_system", False),
        run_count=data.get("run_count", 0),
        last_run_status=data.get("last_run_status"),
        last_run_error=data.get("last_run_error"),
        created_by_user_id=str(data.get("created_by_user_id", "")),
        updated_by_user_id=str(data.get("updated_by_user_id")) if data.get("updated_by_user_id") else None,
        created_at=_format_datetime(data.get("created_at")) or "",
        updated_at=_format_datetime(data.get("updated_at")) or "",
    )


# ---------------------------------------------------------------------------
# Response Models - Exports (T024)
# ---------------------------------------------------------------------------


class ExportSummary(BaseModel):
    """Summary information for an export."""

    export_id: str = Field(..., description="Export ID")
    name: str = Field(..., description="Export name")
    format: str = Field(..., description="Export format (csv, xlsx, pdf)")
    status: str = Field(..., description="Export status (pending, generating, completed, failed, expired)")
    file_size_bytes: Optional[int] = Field(None, description="File size in bytes")
    report_id: Optional[str] = Field(None, description="Source report ID if any")
    report_name: Optional[str] = Field(None, description="Source report name if any")
    generated_by_user_id: Optional[str] = Field(None, description="User who generated the export")
    download_count: int = Field(0, description="Number of times downloaded")
    created_at: str = Field(..., description="Creation timestamp")
    expires_at: Optional[str] = Field(None, description="Expiration timestamp")


class ExportDetails(BaseModel):
    """Detailed export information."""

    export_id: str = Field(..., description="Export ID")
    workspace_id: str = Field(..., description="Workspace ID")
    name: str = Field(..., description="Export name")
    format: str = Field(..., description="Export format (csv, xlsx, pdf)")
    status: str = Field(..., description="Export status")
    storage_key: Optional[str] = Field(None, description="Storage location key")
    file_size_bytes: Optional[int] = Field(None, description="File size in bytes")
    file_hash: Optional[str] = Field(None, description="File hash for verification")
    content_type: Optional[str] = Field(None, description="MIME content type")
    report_id: Optional[str] = Field(None, description="Source report ID")
    report_name: Optional[str] = Field(None, description="Source report name")
    start_date: Optional[str] = Field(None, description="Data start date")
    end_date: Optional[str] = Field(None, description="Data end date")
    generated_by_user_id: Optional[str] = Field(None, description="User who generated")
    download_count: int = Field(0, description="Download count")
    error_message: Optional[str] = Field(None, description="Error message if failed")
    created_at: str = Field(..., description="Creation timestamp")
    completed_at: Optional[str] = Field(None, description="Completion timestamp")
    expires_at: Optional[str] = Field(None, description="Expiration timestamp")


class ExportsListResponse(BaseModel):
    """Response for listing exports."""

    exports: list[ExportSummary] = Field(default_factory=list)
    total: int = Field(0, description="Total matching exports")
    limit: int = Field(50, description="Page size")
    offset: int = Field(0, description="Pagination offset")
    has_more: bool = Field(False, description="Whether there are more results")


class ExportCreateRequest(BaseModel):
    """Request body for creating an export."""

    report_type: str = Field(
        ...,
        description="Report type (dashboard_summary, gallery_performance, client_engagement, etc.)"
    )
    export_format: str = Field(
        "csv",
        description="Export format: csv, xlsx, or pdf",
        pattern="^(csv|xlsx|pdf)$"
    )
    name: Optional[str] = Field(None, description="Custom name for the export")
    date_range_type: str = Field(
        "last_30_days",
        description="Date range type (last_7_days, last_30_days, last_90_days, this_month, last_month, this_year, custom, all_time)"
    )
    custom_start_date: Optional[str] = Field(
        None, description="Custom start date (YYYY-MM-DD, required if date_range_type is custom)"
    )
    custom_end_date: Optional[str] = Field(
        None, description="Custom end date (YYYY-MM-DD, required if date_range_type is custom)"
    )
    report_id: Optional[str] = Field(
        None, description="Source report ID to use configuration from"
    )
    metrics: Optional[list[str]] = Field(None, description="Specific metrics to include")
    filters: Optional[dict[str, Any]] = Field(None, description="Filter criteria")
    grouping: Optional[list[str]] = Field(None, description="Grouping fields")


class ExportDownloadResponse(BaseModel):
    """Response for export download request."""

    export_id: str = Field(..., description="Export ID")
    name: str = Field(..., description="Export name")
    format: str = Field(..., description="Export format")
    storage_key: Optional[str] = Field(None, description="Storage key for download")
    file_size_bytes: Optional[int] = Field(None, description="File size")
    file_hash: Optional[str] = Field(None, description="File hash")
    content_type: str = Field(..., description="MIME content type")
    download_count: int = Field(0, description="Updated download count")


class ExportCleanupResponse(BaseModel):
    """Response for export cleanup request."""

    cleaned_count: int = Field(..., description="Number of exports cleaned up")
    workspace_id: str = Field(..., description="Workspace ID")


# ---------------------------------------------------------------------------
# Export Endpoints (T024)
# ---------------------------------------------------------------------------


@router.post(
    "/exports",
    response_model=ExportDetails,
    status_code=status.HTTP_201_CREATED,
    summary="Generate a new export",
    description="""
    Generate a new analytics export file.

    Creates an export in the specified format (CSV, XLSX, or PDF) containing
    analytics data based on the report type and date range.

    The export is generated asynchronously. Poll the GET endpoint to check
    for completion status.

    Export files are retained for 7 days after generation before expiring.
    """,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid export parameters"},
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def create_export(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: ExportCreateRequest,
) -> ExportDetails:
    """Generate a new analytics export."""
    service = get_analytics_service()
    try:
        # Parse custom dates if provided
        custom_start = None
        custom_end = None
        if request.custom_start_date:
            try:
                custom_start = datetime.strptime(request.custom_start_date, "%Y-%m-%d").date()
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid custom_start_date format. Use YYYY-MM-DD.",
                )
        if request.custom_end_date:
            try:
                custom_end = datetime.strptime(request.custom_end_date, "%Y-%m-%d").date()
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid custom_end_date format. Use YYYY-MM-DD.",
                )

        # Parse optional report_id
        report_uuid = None
        if request.report_id:
            try:
                report_uuid = UUID(request.report_id)
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid report_id format: {request.report_id}",
                )

        result = await service.generate_export(
            workspace_id=workspace_id,
            report_type=request.report_type,
            export_format=request.export_format,
            generated_by_user_id=current_user.user_id,
            report_id=report_uuid,
            name=request.name,
            date_range_type=request.date_range_type,
            custom_start_date=custom_start,
            custom_end_date=custom_end,
            metrics=request.metrics,
            filters=request.filters,
            grouping=request.grouping,
        )

        return _build_export_details(result)

    except InvalidReportTypeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except InvalidExportFormatError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except InvalidDateRangeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ExportGenerationError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except HTTPException:
        raise
    except AnalyticsError as e:
        logger.exception("Analytics error generating export")
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status_code,
        )
    except Exception as e:
        logger.exception("Failed to generate export")
        raise AppError(
            message="Failed to generate export",
            code="ANALYTICS_ERROR",
            status_code=500,
        )


@router.get(
    "/exports",
    response_model=ExportsListResponse,
    status_code=status.HTTP_200_OK,
    summary="List exports",
    description="""
    Get a paginated list of exports for the workspace.

    Supports filtering by:
    - Report ID (source report)
    - Export status (pending, generating, completed, failed, expired)
    - Export format (csv, xlsx, pdf)
    - Include/exclude expired exports

    Results are sorted by creation date (newest first).
    """,
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def list_exports(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    report_id: Annotated[
        Optional[str],
        Query(description="Filter by source report ID"),
    ] = None,
    status_filter: Annotated[
        Optional[str],
        Query(
            alias="status",
            description="Filter by status (pending, generating, completed, failed, expired)",
            pattern="^(pending|generating|completed|failed|expired)$",
        ),
    ] = None,
    format_filter: Annotated[
        Optional[str],
        Query(
            alias="format",
            description="Filter by format (csv, xlsx, pdf)",
            pattern="^(csv|xlsx|pdf)$",
        ),
    ] = None,
    include_expired: Annotated[
        bool,
        Query(description="Include expired exports"),
    ] = False,
    limit: Annotated[
        int,
        Query(ge=1, le=500, description="Maximum results per page"),
    ] = 50,
    offset: Annotated[
        int,
        Query(ge=0, description="Pagination offset"),
    ] = 0,
) -> ExportsListResponse:
    """List exports for the workspace."""
    service = get_analytics_service()
    try:
        # Parse report_id if provided
        report_uuid = None
        if report_id:
            try:
                report_uuid = UUID(report_id)
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid report_id format: {report_id}",
                )

        result = await service.get_exports(
            workspace_id=workspace_id,
            report_id=report_uuid,
            status=status_filter,
            export_format=format_filter,
            include_expired=include_expired,
            limit=limit,
            offset=offset,
        )

        exports_data = result.get("exports", [])
        return ExportsListResponse(
            exports=[
                ExportSummary(
                    export_id=str(e.get("export_id", "")),
                    name=e.get("name", ""),
                    format=e.get("format", "csv"),
                    status=e.get("status", "pending"),
                    file_size_bytes=e.get("file_size_bytes"),
                    report_id=str(e.get("report_id")) if e.get("report_id") else None,
                    report_name=e.get("report_name"),
                    generated_by_user_id=str(e.get("generated_by_user_id")) if e.get("generated_by_user_id") else None,
                    download_count=e.get("download_count", 0),
                    created_at=_format_datetime(e.get("created_at")) or "",
                    expires_at=_format_datetime(e.get("expires_at")),
                )
                for e in exports_data
            ],
            total=result.get("total", len(exports_data)),
            limit=limit,
            offset=offset,
            has_more=result.get("has_more", False),
        )

    except HTTPException:
        raise
    except AnalyticsError as e:
        logger.exception("Analytics error listing exports")
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status_code,
        )
    except Exception as e:
        logger.exception("Failed to list exports")
        raise AppError(
            message="Failed to list exports",
            code="ANALYTICS_ERROR",
            status_code=500,
        )


@router.get(
    "/exports/{export_id}",
    response_model=ExportDetails,
    status_code=status.HTTP_200_OK,
    summary="Get export details",
    description="""
    Get detailed information about a specific export.

    Returns the full export record including status, file information,
    and generation metadata.
    """,
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Export not found"},
    },
)
async def get_export(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    export_id: Annotated[UUID, Path(..., description="Export ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> ExportDetails:
    """Get detailed information about an export."""
    service = get_analytics_service()
    try:
        result = await service.get_export(
            workspace_id=workspace_id,
            export_id=export_id,
        )

        return _build_export_details(result)

    except ExportNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"Export not found: {export_id}",
        )
    except AnalyticsError as e:
        logger.exception("Analytics error getting export")
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status_code,
        )
    except Exception as e:
        logger.exception("Failed to get export")
        raise AppError(
            message="Failed to get export",
            code="ANALYTICS_ERROR",
            status_code=500,
        )


@router.get(
    "/exports/{export_id}/download",
    response_model=ExportDownloadResponse,
    status_code=status.HTTP_200_OK,
    summary="Get export download information",
    description="""
    Get download information for a completed export.

    Returns the storage key and file metadata needed to download the export.
    Increments the download count each time this endpoint is called.

    The export must be in 'completed' status and not expired.
    """,
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Export not found"},
        410: {"model": ErrorResponse, "description": "Export has expired"},
    },
)
async def download_export(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    export_id: Annotated[UUID, Path(..., description="Export ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> ExportDownloadResponse:
    """Get download information for an export."""
    service = get_analytics_service()
    try:
        result = await service.download_export(
            workspace_id=workspace_id,
            export_id=export_id,
        )

        return ExportDownloadResponse(
            export_id=result.get("export_id", str(export_id)),
            name=result.get("name", ""),
            format=result.get("format", "csv"),
            storage_key=result.get("storage_key"),
            file_size_bytes=result.get("file_size_bytes"),
            file_hash=result.get("file_hash"),
            content_type=result.get("content_type", "application/octet-stream"),
            download_count=result.get("download_count", 1),
        )

    except ExportNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"Export not found: {export_id}",
        )
    except ExportExpiredError:
        raise HTTPException(
            status_code=410,
            detail=f"Export has expired: {export_id}",
        )
    except AnalyticsError as e:
        logger.exception("Analytics error downloading export")
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status_code,
        )
    except Exception as e:
        logger.exception("Failed to get export download")
        raise AppError(
            message="Failed to get export download",
            code="ANALYTICS_ERROR",
            status_code=500,
        )


@router.delete(
    "/exports/{export_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an export",
    description="""
    Delete an export and its associated file.

    This permanently removes the export record and any stored file.
    """,
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Export not found"},
    },
)
async def delete_export(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    export_id: Annotated[UUID, Path(..., description="Export ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
):
    """Delete an export."""
    service = get_analytics_service()
    try:
        await service.delete_export(
            workspace_id=workspace_id,
            export_id=export_id,
        )
        logger.info(
            "Export deleted",
            extra={
                "workspace_id": str(workspace_id),
                "export_id": str(export_id),
                "deleted_by_user_id": str(current_user.user_id),
            },
        )

    except ExportNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"Export not found: {export_id}",
        )
    except AnalyticsError as e:
        logger.exception("Analytics error deleting export")
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status_code,
        )
    except Exception as e:
        logger.exception("Failed to delete export")
        raise AppError(
            message="Failed to delete export",
            code="ANALYTICS_ERROR",
            status_code=500,
        )


@router.get(
    "/reports/{report_id}/exports",
    response_model=ExportsListResponse,
    status_code=status.HTTP_200_OK,
    summary="Get exports for a report",
    description="""
    Get all exports generated from a specific report.

    Returns exports associated with the specified report configuration,
    sorted by creation date (newest first).
    """,
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Report not found"},
    },
)
async def get_report_exports(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    report_id: Annotated[UUID, Path(..., description="Report ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    include_expired: Annotated[
        bool,
        Query(description="Include expired exports"),
    ] = False,
    limit: Annotated[
        int,
        Query(ge=1, le=100, description="Maximum results"),
    ] = 20,
) -> ExportsListResponse:
    """Get exports for a specific report."""
    service = get_analytics_service()
    try:
        exports_data = await service.get_exports_for_report(
            workspace_id=workspace_id,
            report_id=report_id,
            include_expired=include_expired,
            limit=limit,
        )

        exports_list = exports_data if isinstance(exports_data, list) else exports_data.get("exports", [])

        return ExportsListResponse(
            exports=[
                ExportSummary(
                    export_id=str(e.get("export_id", "")),
                    name=e.get("name", ""),
                    format=e.get("format", "csv"),
                    status=e.get("status", "pending"),
                    file_size_bytes=e.get("file_size_bytes"),
                    report_id=str(report_id),
                    report_name=e.get("report_name"),
                    generated_by_user_id=str(e.get("generated_by_user_id")) if e.get("generated_by_user_id") else None,
                    download_count=e.get("download_count", 0),
                    created_at=_format_datetime(e.get("created_at")) or "",
                    expires_at=_format_datetime(e.get("expires_at")),
                )
                for e in exports_list
            ],
            total=len(exports_list),
            limit=limit,
            offset=0,
            has_more=False,
        )

    except ReportNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"Report not found: {report_id}",
        )
    except AnalyticsError as e:
        logger.exception("Analytics error getting report exports")
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status_code,
        )
    except Exception as e:
        logger.exception("Failed to get report exports")
        raise AppError(
            message="Failed to get report exports",
            code="ANALYTICS_ERROR",
            status_code=500,
        )


@router.post(
    "/exports/cleanup",
    response_model=ExportCleanupResponse,
    status_code=status.HTTP_200_OK,
    summary="Clean up expired exports",
    description="""
    Mark expired exports and clean up old export files.

    This endpoint scans for exports past their expiration date and
    updates their status to 'expired'. Useful for maintenance tasks.

    Normally this runs automatically but can be triggered manually.
    """,
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def cleanup_exports(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> ExportCleanupResponse:
    """Clean up expired exports."""
    service = get_analytics_service()
    try:
        cleaned_count = await service.cleanup_expired_exports(
            workspace_id=workspace_id,
        )

        return ExportCleanupResponse(
            cleaned_count=cleaned_count,
            workspace_id=str(workspace_id),
        )

    except AnalyticsError as e:
        logger.exception("Analytics error cleaning up exports")
        raise AppError(
            message=str(e),
            code=e.code,
            status_code=e.status_code,
        )
    except Exception as e:
        logger.exception("Failed to clean up exports")
        raise AppError(
            message="Failed to clean up exports",
            code="ANALYTICS_ERROR",
            status_code=500,
        )


# ---------------------------------------------------------------------------
# Helper Functions - Exports (T024)
# ---------------------------------------------------------------------------


def _build_export_details(data: dict[str, Any]) -> ExportDetails:
    """Build an ExportDetails response from a dictionary."""
    return ExportDetails(
        export_id=str(data.get("export_id", "")),
        workspace_id=str(data.get("workspace_id", "")),
        name=data.get("name", ""),
        format=data.get("format", "csv"),
        status=data.get("status", "pending"),
        storage_key=data.get("storage_key"),
        file_size_bytes=data.get("file_size_bytes"),
        file_hash=data.get("file_hash"),
        content_type=data.get("content_type"),
        report_id=str(data.get("report_id")) if data.get("report_id") else None,
        report_name=data.get("report_name"),
        start_date=_format_date(data.get("start_date")),
        end_date=_format_date(data.get("end_date")),
        generated_by_user_id=str(data.get("generated_by_user_id")) if data.get("generated_by_user_id") else None,
        download_count=data.get("download_count", 0),
        error_message=data.get("error_message"),
        created_at=_format_datetime(data.get("created_at")) or "",
        completed_at=_format_datetime(data.get("completed_at")),
        expires_at=_format_datetime(data.get("expires_at")),
    )
