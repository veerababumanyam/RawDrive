"""
Analytics request/response schemas for Gallery Service.

Defines models for gallery view tracking and analytics aggregation.
Follows the ProfileView pattern from Phase 11.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


# =============================================================================
# View Tracking Schemas
# =============================================================================


class GalleryViewCreate(BaseModel):
    """Data for creating a gallery view record."""

    visitor_token: str = Field(..., max_length=64, description="Unique visitor identifier")
    session_id: Optional[str] = Field(None, max_length=64, description="Session identifier")
    device_type: Optional[str] = Field(None, max_length=20, description="desktop, mobile, tablet")
    browser: Optional[str] = Field(None, max_length=50, description="Browser name")
    os: Optional[str] = Field(None, max_length=50, description="Operating system")
    country_code: Optional[str] = Field(None, max_length=2, description="ISO 3166-1 alpha-2")
    region: Optional[str] = Field(None, max_length=100, description="Region/state name")
    referrer_domain: Optional[str] = Field(None, max_length=255, description="Referring domain")


class TrackViewRequest(BaseModel):
    """Public API request to track a gallery view."""

    visitor_token: str = Field(..., max_length=64, description="Unique visitor identifier")
    device_type: Optional[str] = Field(None, max_length=20)
    browser: Optional[str] = Field(None, max_length=50)
    os: Optional[str] = Field(None, max_length=50)
    country_code: Optional[str] = Field(None, max_length=2)
    referrer_domain: Optional[str] = Field(None, max_length=255)
    time_spent_seconds: Optional[int] = Field(None, ge=0, description="Time spent, sent on unload")


class UpdateTimeSpentRequest(BaseModel):
    """Request to update time spent on a gallery view (beacon API)."""

    view_id: UUID = Field(..., description="View record ID")
    time_spent_seconds: int = Field(..., ge=0, description="Time spent in seconds")


# =============================================================================
# Analytics Response Schemas
# =============================================================================


class GalleryAnalyticsSummary(BaseModel):
    """Aggregated analytics summary for a gallery."""

    total_views: int = Field(default=0)
    unique_visitors: int = Field(default=0)
    avg_time_spent_seconds: float = Field(default=0.0)
    views_today: int = Field(default=0)
    views_this_week: int = Field(default=0)
    views_this_month: int = Field(default=0)


class DeviceBreakdown(BaseModel):
    """Device type breakdown for gallery views."""

    desktop_count: int = Field(default=0)
    mobile_count: int = Field(default=0)
    tablet_count: int = Field(default=0)
    desktop_pct: float = Field(default=0.0)
    mobile_pct: float = Field(default=0.0)
    tablet_pct: float = Field(default=0.0)


class GeoEntry(BaseModel):
    """Geographic breakdown entry."""

    country_code: str = Field(..., max_length=2)
    country_name: str = Field(default="Unknown")
    count: int = Field(default=0)


class GalleryAnalyticsTimeSeries(BaseModel):
    """Daily time series data point."""

    date: date
    views: int = Field(default=0)
    unique_visitors: int = Field(default=0)


class GalleryAnalyticsResponse(BaseModel):
    """Full analytics response for a gallery."""

    gallery_id: UUID
    summary: GalleryAnalyticsSummary
    daily_stats: List[GalleryAnalyticsTimeSeries] = Field(default_factory=list)
    device_breakdown: DeviceBreakdown
    geo_breakdown: List[GeoEntry] = Field(default_factory=list)
    download_summary: Dict[str, int] = Field(
        default_factory=lambda: {"total_downloads": 0, "total_bytes": 0}
    )
    period_start: datetime
    period_end: datetime
