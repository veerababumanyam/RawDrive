"""
Pydantic schemas for webhook statistics.
"""

from datetime import datetime
from typing import Optional, List, Dict, Any
from uuid import UUID

from pydantic import BaseModel, Field


class WebhookSubscriptionStats(BaseModel):
    """Statistics for a webhook subscription."""

    subscription_id: UUID
    period: str  # "1h", "24h", "7d", "30d"
    total_events: int
    total_deliveries: int
    successful_deliveries: int
    failed_deliveries: int
    retried_deliveries: int
    exhausted_deliveries: int
    success_rate: float
    avg_response_time_ms: float
    p95_response_time_ms: float
    last_delivery_at: Optional[datetime]
    last_success_at: Optional[datetime]
    last_failure_at: Optional[datetime]


class DeliveryByStatusCount(BaseModel):
    """Delivery count by status."""

    status: str
    count: int


class DeliveryByEventTypeCount(BaseModel):
    """Delivery count by event type."""

    event_type: str
    count: int


class AdminWebhookStats(BaseModel):
    """Platform-wide webhook statistics."""

    period: str
    total_subscriptions: int
    active_subscriptions: int
    total_events: int
    total_deliveries: int
    successful_deliveries: int
    failed_deliveries: int
    exhausted_deliveries: int
    success_rate: float
    avg_response_time_ms: float
    p95_response_time_ms: float
    dlq_size: int
    deliveries_by_status: List[DeliveryByStatusCount]
    deliveries_by_event_type: List[DeliveryByEventTypeCount]
    circuit_breakers_open: int


class TimeSeriesDataPoint(BaseModel):
    """Data point for time series."""

    timestamp: datetime
    value: float


class DeliveryTimeSeries(BaseModel):
    """Time series of delivery metrics."""

    metric: str  # "success_rate", "deliveries", "latency"
    period: str
    data_points: List[TimeSeriesDataPoint]


class DeliveryTimeSeriesPoint(BaseModel):
    """Aggregated time series data point for deliveries."""

    timestamp: datetime
    total: int
    successful: int
    failed: int
    retrying: int = 0
    avg_response_time_ms: Optional[float]
    p95_response_time_ms: Optional[float]


class StatusBreakdownItem(BaseModel):
    """Delivery status breakdown item."""

    status: str
    count: int
    percentage: float


class EventTypeBreakdownItem(BaseModel):
    """Event type breakdown item with success metrics."""

    event_type: str
    count: int
    successful: int
    failed: int
    success_rate: float


class DeliveryDashboardResponse(BaseModel):
    """Complete delivery dashboard data response."""

    period: str
    granularity: str
    metrics: "DashboardMetrics"
    time_series: List[DeliveryTimeSeriesPoint]
    status_breakdown: List[StatusBreakdownItem]
    event_type_breakdown: List[EventTypeBreakdownItem]


class DashboardMetrics(BaseModel):
    """Summary metrics for the dashboard."""

    total_deliveries: int
    successful_deliveries: int
    failed_deliveries: int
    retried_deliveries: int = 0
    exhausted_deliveries: int = 0
    success_rate: float
    avg_response_time_ms: float
    p95_response_time_ms: float
