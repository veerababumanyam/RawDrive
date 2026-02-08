"""Profile View Analytics Models.

Pydantic models for profile view tracking and analytics.
These models are used for API request/response serialization.

Feature: Personal Profile Analytics
"""
from datetime import date, datetime
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class DeviceType(str, Enum):
    """Device type categories for view tracking."""

    PHONE = "phone"
    TABLET = "tablet"
    DESKTOP = "desktop"
    UNKNOWN = "unknown"


class ReferrerType(str, Enum):
    """Referrer source categories."""

    DIRECT = "direct"
    SOCIAL = "social"
    SEARCH = "search"
    EMAIL = "email"
    OTHER = "other"


class ProfileView(BaseModel):
    """Individual profile view record."""

    view_id: UUID
    profile_id: UUID
    workspace_id: UUID
    visitor_hash: Optional[str] = None
    session_id: Optional[str] = None
    device_type: Optional[DeviceType] = None
    browser: Optional[str] = None
    os: Optional[str] = None
    country_code: Optional[str] = None
    region: Optional[str] = None
    referrer_domain: Optional[str] = None
    referrer_type: Optional[ReferrerType] = None
    viewed_at: datetime
    created_at: datetime


class ProfileViewCreate(BaseModel):
    """Request model for tracking a profile view."""

    visitor_hash: Optional[str] = Field(
        None, description="Hashed identifier for the visitor (no PII)"
    )
    session_id: Optional[str] = Field(
        None, description="Session identifier for tracking unique visits"
    )
    device_type: Optional[DeviceType] = None
    browser: Optional[str] = Field(None, max_length=50)
    os: Optional[str] = Field(None, max_length=50)
    country_code: Optional[str] = Field(None, max_length=2)
    region: Optional[str] = Field(None, max_length=100)
    referrer_domain: Optional[str] = Field(None, max_length=255)
    referrer_type: Optional[ReferrerType] = None


class ProfileViewDailyStats(BaseModel):
    """Daily aggregated statistics for a profile."""

    stat_id: UUID
    profile_id: UUID
    workspace_id: UUID
    stat_date: date
    view_count: int = 0
    unique_visitors: int = 0
    desktop_views: int = 0
    mobile_views: int = 0
    tablet_views: int = 0
    country_breakdown: dict[str, int] = Field(default_factory=dict)
    referrer_breakdown: dict[str, int] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class ProfileAnalyticsSummary(BaseModel):
    """Summary analytics for a profile."""

    profile_id: UUID
    total_views: int = 0
    unique_visitors: int = 0
    views_today: int = 0
    views_this_week: int = 0
    views_this_month: int = 0
    last_viewed_at: Optional[datetime] = None
    # Device breakdown percentages
    desktop_percentage: float = 0.0
    mobile_percentage: float = 0.0
    tablet_percentage: float = 0.0
    # Top countries (list of tuples: country_code, count)
    top_countries: list[dict[str, int]] = Field(default_factory=list)
    # Top referrers (list of tuples: domain, count)
    top_referrers: list[dict[str, int]] = Field(default_factory=list)


class ProfileAnalyticsTimeSeries(BaseModel):
    """Time series data point for charting."""

    date: date
    views: int = 0
    unique_visitors: int = 0


class ProfileAnalyticsResponse(BaseModel):
    """Complete analytics response for a profile."""

    profile_id: UUID
    profile_slug: str
    summary: ProfileAnalyticsSummary
    daily_stats: list[ProfileAnalyticsTimeSeries] = Field(default_factory=list)
    period_start: date
    period_end: date


class TrackViewResponse(BaseModel):
    """Response for successful view tracking."""

    success: bool = True
    view_id: Optional[UUID] = None
    message: str = "View tracked successfully"
