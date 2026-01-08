"""
Pydantic schemas for client analytics and reporting.

Supports:
- Engagement metrics
- Time-series data
- Client health scores
- Segmentation analytics
"""

from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime, date
from pydantic import BaseModel, Field


class AnalyticsTimeRange(BaseModel):
    """Time range for analytics queries."""

    start_date: date = Field(..., description="Start date (inclusive)")
    end_date: date = Field(..., description="End date (inclusive)")


class ClientEngagementMetrics(BaseModel):
    """Client engagement metrics."""

    client_id: UUID = Field(..., description="Client ID")
    full_name: str = Field(..., description="Client name")
    total_galleries_accessed: int = Field(
        ..., description="Total galleries accessed"
    )
    total_favorites: int = Field(..., description="Total favorites added")
    total_selections: int = Field(..., description="Total selections made")
    total_comments: int = Field(..., description="Total comments added")
    total_gallery_views: int = Field(..., description="Total gallery views")
    last_activity_at: Optional[datetime] = Field(
        None, description="Last activity timestamp"
    )
    engagement_score: float = Field(
        ..., ge=0.0, le=100.0, description="Engagement score (0-100)"
    )
    health_status: str = Field(
        ..., description="Client health: active, at_risk, inactive"
    )


class WorkspaceAnalyticsSummary(BaseModel):
    """Workspace-level analytics summary."""

    workspace_id: UUID = Field(..., description="Workspace ID")
    time_range: AnalyticsTimeRange = Field(..., description="Time range")

    # Client metrics
    total_clients: int = Field(..., description="Total clients")
    active_clients: int = Field(..., description="Active clients")
    new_clients: int = Field(..., description="New clients in period")
    converted_visitors: int = Field(..., description="Converted visitors")

    # Engagement metrics
    total_gallery_links: int = Field(..., description="Total gallery links")
    total_activities: int = Field(..., description="Total activities")
    total_communications: int = Field(..., description="Total communications")
    overdue_follow_ups: int = Field(..., description="Overdue follow-ups")

    # Health distribution
    active_count: int = Field(..., description="Active clients")
    at_risk_count: int = Field(..., description="At-risk clients")
    inactive_count: int = Field(..., description="Inactive clients")

    # Top segments
    top_tags: List[Dict[str, Any]] = Field(
        default_factory=list, description="Top tags by client count"
    )
    top_engaged_clients: List[ClientEngagementMetrics] = Field(
        default_factory=list, description="Top engaged clients"
    )


class TimeSeriesDataPoint(BaseModel):
    """Single data point in time series."""

    timestamp_date: date = Field(..., description="Date", alias="date")
    value: float = Field(..., description="Value")
    metadata: Optional[Dict[str, Any]] = Field(
        None, description="Additional metadata"
    )

    model_config = {"populate_by_name": True}


class TimeSeriesMetric(BaseModel):
    """Time series metric data."""

    metric_name: str = Field(..., description="Metric name")
    metric_label: str = Field(..., description="Human-readable label")
    data_points: List[TimeSeriesDataPoint] = Field(
        ..., description="Time series data"
    )
    aggregation: str = Field(
        ..., description="Aggregation method: sum, count, avg, min, max"
    )


class ClientActivityTrend(BaseModel):
    """Client activity trend over time."""

    client_id: UUID = Field(..., description="Client ID")
    full_name: str = Field(..., description="Client name")
    time_range: AnalyticsTimeRange = Field(..., description="Time range")
    metrics: List[TimeSeriesMetric] = Field(
        ..., description="Time series metrics"
    )


class TagAnalytics(BaseModel):
    """Analytics for client tags."""

    tag_id: UUID = Field(..., description="Tag ID")
    tag_name: str = Field(..., description="Tag name")
    tag_color: str = Field(..., description="Tag color")
    client_count: int = Field(..., description="Number of clients with tag")
    avg_engagement_score: float = Field(
        ..., description="Average engagement score"
    )
    new_clients_this_period: int = Field(
        ..., description="New clients added in period"
    )


class CommunicationAnalytics(BaseModel):
    """Communication pattern analytics."""

    total_communications: int = Field(..., description="Total communications")
    by_type: Dict[str, int] = Field(
        ..., description="Communications by type (email, call, sms, etc.)"
    )
    by_direction: Dict[str, int] = Field(
        ..., description="Communications by direction (inbound, outbound)"
    )
    avg_response_time_hours: Optional[float] = Field(
        None, description="Average response time in hours"
    )
    pending_follow_ups: int = Field(..., description="Pending follow-ups")
    overdue_follow_ups: int = Field(..., description="Overdue follow-ups")


class GalleryEngagementAnalytics(BaseModel):
    """Gallery engagement analytics."""

    gallery_id: UUID = Field(..., description="Gallery ID")
    gallery_title: str = Field(..., description="Gallery title")
    unique_clients: int = Field(..., description="Unique clients with access")
    total_views: int = Field(..., description="Total gallery views")
    total_favorites: int = Field(..., description="Total favorites")
    total_selections: int = Field(..., description="Total selections")
    total_comments: int = Field(..., description="Total comments")
    avg_engagement_per_client: float = Field(
        ..., description="Average engagement per client"
    )


class AnalyticsRequest(BaseModel):
    """Request for analytics data."""

    start_date: Optional[date] = Field(None, description="Start date")
    end_date: Optional[date] = Field(None, description="End date")
    include_time_series: bool = Field(
        False, description="Include time series data"
    )
    include_top_clients: bool = Field(
        True, description="Include top engaged clients"
    )
    include_tag_analytics: bool = Field(
        True, description="Include tag analytics"
    )
    include_communication_analytics: bool = Field(
        True, description="Include communication analytics"
    )
    top_limit: int = Field(
        10, ge=1, le=100, description="Limit for top lists"
    )
