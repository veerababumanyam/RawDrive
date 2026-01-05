"""Event Analytics Views API Routes

Provides endpoint for retrieving comprehensive analytics data including:
- View counts and unique visitors
- Device breakdown (mobile/tablet/desktop)
- Geographic distribution
- RSVP response rates

All data is cached for 10 minutes.

Feature: api-analytics-views
"""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, HTTPException, status
from pydantic import BaseModel, Field

from app.api.dependencies import get_current_user
from app.services.event_analytics_views_service import (
    get_event_analytics_views_service,
    EventAnalyticsViewsService,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Response Models
# ---------------------------------------------------------------------------


class DeviceBreakdownItem(BaseModel):
    """Device type with view count."""

    device_type: str = Field(
        ...,
        description="Device type: mobile, tablet, desktop, or unknown",
        examples=["mobile", "tablet", "desktop"],
    )
    count: int = Field(..., description="Number of views from this device type", ge=0)


class GeographicDistributionItem(BaseModel):
    """Geographic location with view count."""

    country_code: str = Field(
        ...,
        description="ISO 3166-1 alpha-2 country code or 'unknown'",
        examples=["US", "IN", "GB"],
    )
    city: Optional[str] = Field(
        None,
        description="City name if available",
        examples=["New York", "Mumbai", "London"],
    )
    count: int = Field(..., description="Number of views from this location", ge=0)


class RSVPResponseRates(BaseModel):
    """RSVP response statistics and rates."""

    total: int = Field(..., description="Total number of RSVP submissions", ge=0)
    confirmed: int = Field(..., description="Number of confirmed attendees", ge=0)
    declined: int = Field(..., description="Number of declined RSVPs", ge=0)
    maybe: int = Field(..., description="Number of 'maybe' responses", ge=0)
    pending: int = Field(..., description="Number of pending responses", ge=0)
    confirmation_rate: float = Field(
        ...,
        description="Percentage of confirmed RSVPs (0-100)",
        ge=0.0,
        le=100.0,
    )
    decline_rate: float = Field(
        ...,
        description="Percentage of declined RSVPs (0-100)",
        ge=0.0,
        le=100.0,
    )
    response_rate: float = Field(
        ...,
        description="Percentage of definitive responses (confirmed + declined) (0-100)",
        ge=0.0,
        le=100.0,
    )


class ViewsAnalyticsResponse(BaseModel):
    """Complete analytics response with all metrics."""

    total_views: int = Field(..., description="Total number of page views", ge=0)
    unique_visitors: int = Field(
        ..., description="Number of unique visitors (by hash/session)", ge=0
    )
    device_breakdown: List[DeviceBreakdownItem] = Field(
        ...,
        description="View counts by device type (mobile/tablet/desktop)",
    )
    geographic_distribution: List[GeographicDistributionItem] = Field(
        ...,
        description="View counts by geographic location (country/city)",
    )
    rsvp_response_rates: RSVPResponseRates = Field(
        ...,
        description="RSVP response statistics and rates",
    )
    period_days: int = Field(
        ...,
        description="Number of days included in analytics",
        ge=1,
    )
    cached_at: Optional[str] = Field(
        None,
        description="ISO timestamp when data was cached",
    )


# ---------------------------------------------------------------------------
# Dependency
# ---------------------------------------------------------------------------


def get_service() -> EventAnalyticsViewsService:
    """Get the analytics views service dependency."""
    return get_event_analytics_views_service()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/views",
    response_model=ViewsAnalyticsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get event views analytics",
    responses={
        200: {
            "description": "Analytics data retrieved successfully",
            "model": ViewsAnalyticsResponse,
        },
        401: {"description": "Authentication required"},
        403: {"description": "Insufficient permissions"},
        404: {"description": "Invitation not found"},
    },
)
async def get_views_analytics(
    workspace_id: UUID,
    invitation_id: UUID,
    days: int = Query(
        30,
        ge=1,
        le=365,
        description="Number of days to include in analytics (1-365)",
    ),
    current_user: dict = Depends(get_current_user),
    service: EventAnalyticsViewsService = Depends(get_service),
) -> ViewsAnalyticsResponse:
    """Get comprehensive analytics for event/invitation views.

    Returns view counts, unique visitors, device breakdown (mobile/tablet/desktop),
    geographic distribution, and RSVP response rates.

    **Results are cached for 10 minutes** to improve performance.

    ### Metrics Included:
    - **Total Views**: Total number of page views within the period
    - **Unique Visitors**: Distinct visitors identified by hash/session
    - **Device Breakdown**: Views by mobile, tablet, and desktop devices
    - **Geographic Distribution**: Top 20 locations by country and city
    - **RSVP Response Rates**: Confirmation, decline, and overall response rates
    """
    try:
        result = await service.get_views_analytics(
            workspace_id=workspace_id,
            invitation_id=invitation_id,
            days=days,
        )

        return ViewsAnalyticsResponse(
            total_views=result["total_views"],
            unique_visitors=result["unique_visitors"],
            device_breakdown=[
                DeviceBreakdownItem(**d) for d in result["device_breakdown"]
            ],
            geographic_distribution=[
                GeographicDistributionItem(**g)
                for g in result["geographic_distribution"]
            ],
            rsvp_response_rates=RSVPResponseRates(**result["rsvp_response_rates"]),
            period_days=result["period_days"],
            cached_at=result.get("cached_at"),
        )
    except Exception as e:
        # Log the error but return a user-friendly message
        import logging

        logger = logging.getLogger(__name__)
        logger.error(f"Failed to get views analytics: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve analytics data",
        )
