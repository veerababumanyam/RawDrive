"""Pydantic models for analytics and reporting.

This module contains models for the analytics and reporting system:
- AnalyticsEvent: Represents individual analytics events for all user interactions
- GalleryAnalytics: Aggregated gallery-level metrics (views, engagement, etc.)
- ClientAnalytics: Client engagement scores, lifetime value, and churn risk
- CustomReport: User-defined report configurations with scheduling support
- ReportExport: Generated report files for download

The analytics event model captures:
- Event identification (type, category)
- Entity references (gallery, asset, client, etc.)
- Actor information (user, client, visitor, system)
- Session and context data
- Geographic and device information
- Event-specific metadata

The gallery analytics model provides:
- View metrics (total views, unique visitors, sessions)
- Engagement metrics (favorites, comments, selections, downloads)
- Time metrics (session duration, bounce rate)
- Geographic and device breakdown
- Source tracking (direct, share link, referral)
- Calculated scores (engagement, conversion)

The client analytics model provides:
- Activity metrics (gallery views, asset views, favorites, comments, etc.)
- Session metrics (total sessions, time spent, average duration)
- Gallery interaction metrics
- Engagement scoring with trends
- Lifetime value and revenue tracking
- Recency metrics (last activity, days since)
- Frequency metrics (visits in various time windows)
- Churn risk scoring

The custom reports model provides:
- Report configuration (metrics, filters, grouping, sorting)
- Date range configuration (presets and custom ranges)
- Export configuration (format, columns, options)
- Scheduling support (cron expressions, timezone, recipients)
- Run tracking (status, count, errors)

The report exports model provides:
- Export metadata (name, format, date range)
- File storage (storage key, size, hash)
- Status tracking (generating, completed, failed, expired)
- Download tracking (count, last downloaded)
- Expiration management

Feature: Analytics & Reporting
Tasks: T002 - Create analytics event model
       T003 - Create gallery analytics model
       T004 - Create client analytics model
       T005 - Create custom reports model
"""

from datetime import date, datetime
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


# =============================================================================
# ANALYTICS EVENT ENUMS
# =============================================================================


class EventType(str, Enum):
    """Types of analytics events that can be tracked."""

    # Gallery events
    GALLERY_VIEW = "gallery_view"
    GALLERY_DOWNLOAD = "gallery_download"
    GALLERY_SHARE = "gallery_share"

    # Asset events
    ASSET_VIEW = "asset_view"
    ASSET_DOWNLOAD = "asset_download"
    ASSET_FAVORITE = "asset_favorite"
    ASSET_UNFAVORITE = "asset_unfavorite"
    ASSET_COMMENT = "asset_comment"
    ASSET_SELECT = "asset_select"
    ASSET_DESELECT = "asset_deselect"

    # Share link events
    SHARE_LINK_CREATED = "share_link_created"
    SHARE_LINK_ACCESSED = "share_link_accessed"
    SHARE_LINK_EXPIRED = "share_link_expired"

    # Client portal events
    CLIENT_LOGIN = "client_login"
    CLIENT_LOGOUT = "client_logout"
    CLIENT_REGISTRATION = "client_registration"

    # Invitation events
    INVITATION_VIEWED = "invitation_viewed"
    INVITATION_RSVP = "invitation_rsvp"
    INVITATION_SHARED = "invitation_shared"

    # Download events
    BULK_DOWNLOAD_STARTED = "bulk_download_started"
    BULK_DOWNLOAD_COMPLETED = "bulk_download_completed"

    # Session events
    PAGE_VIEW = "page_view"
    SESSION_START = "session_start"
    SESSION_END = "session_end"


class EventCategory(str, Enum):
    """Categories for grouping analytics events."""

    GALLERY = "gallery"
    ASSET = "asset"
    CLIENT = "client"
    INVITATION = "invitation"
    DOWNLOAD = "download"
    SHARE = "share"
    SESSION = "session"
    PAGE = "page"


class ActorType(str, Enum):
    """Types of actors that can generate analytics events."""

    USER = "user"
    CLIENT = "client"
    VISITOR = "visitor"
    SYSTEM = "system"


class DeviceType(str, Enum):
    """Device types for analytics tracking."""

    DESKTOP = "desktop"
    TABLET = "tablet"
    MOBILE = "mobile"
    OTHER = "other"


# =============================================================================
# ANALYTICS EVENT MODEL
# =============================================================================


class AnalyticsEvent(BaseModel):
    """Model for analytics events tracking user interactions.

    Represents the analytics_events table capturing all trackable events
    across the platform. Events are the foundation for all analytics
    aggregation and reporting.

    An event tracks:
    - Event identification (type, category)
    - Related entities (gallery, asset, client, share link, invitation)
    - Actor information (who triggered the event)
    - Session and context (session ID, IP, user agent, referrer)
    - Geographic data (country, region, city)
    - Device information (device type, browser, OS)
    - Event-specific metadata and numeric values
    """

    event_id: UUID

    # Core relationships
    workspace_id: UUID = Field(
        ..., description="Workspace this event belongs to (multi-tenant isolation)"
    )

    # Event identification
    event_type: EventType = Field(..., description="Type of event being tracked")
    event_category: EventCategory = Field(
        ..., description="Category for grouping related events"
    )

    # Related entities (polymorphic references - all optional)
    gallery_id: Optional[UUID] = Field(
        None, description="Associated gallery if event relates to a gallery"
    )
    asset_id: Optional[UUID] = Field(
        None, description="Associated asset if event relates to an asset"
    )
    client_id: Optional[UUID] = Field(
        None, description="Associated client if event relates to a client"
    )
    share_link_id: Optional[UUID] = Field(
        None, description="Associated share link if event relates to sharing"
    )
    invitation_id: Optional[UUID] = Field(
        None, description="Associated invitation if event relates to an invitation"
    )

    # Actor information
    actor_type: ActorType = Field(
        ..., description="Type of actor that triggered this event"
    )
    actor_id: Optional[UUID] = Field(
        None, description="ID of the actor (user_id, client_id, or None for visitors)"
    )
    visitor_id: Optional[UUID] = Field(
        None, description="Visitor ID for anonymous/unauthenticated access"
    )

    # Session and context
    session_id: Optional[str] = Field(
        None, max_length=100, description="Session identifier for grouping events"
    )
    ip_address: Optional[str] = Field(
        None, description="IP address of the event origin"
    )
    user_agent: Optional[str] = Field(None, description="User agent string of the client")
    referrer: Optional[str] = Field(None, description="HTTP referrer if available")

    # Geographic data
    country_code: Optional[str] = Field(
        None, max_length=3, description="ISO country code (e.g., 'USA', 'IND')"
    )
    region: Optional[str] = Field(
        None, max_length=100, description="Region/state/province"
    )
    city: Optional[str] = Field(None, max_length=100, description="City name")

    # Device information
    device_type: Optional[DeviceType] = Field(
        None, description="Type of device used"
    )
    browser: Optional[str] = Field(
        None, max_length=50, description="Browser name (e.g., 'Chrome', 'Safari')"
    )
    os: Optional[str] = Field(
        None, max_length=50, description="Operating system (e.g., 'Windows 11', 'iOS 17')"
    )

    # Event metadata (flexible JSON for event-specific data)
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Event-specific metadata (e.g., asset IDs for bulk downloads, download format)"
    )

    # Numeric values for aggregation
    numeric_value: Optional[float] = Field(
        None, description="Numeric value for aggregation (e.g., file size, price)"
    )
    duration_ms: Optional[int] = Field(
        None, description="Duration in milliseconds (e.g., session duration, viewing time)"
    )

    # Timestamps
    occurred_at: datetime = Field(
        ..., description="When the event occurred"
    )
    created_at: datetime = Field(
        ..., description="When the event record was created"
    )


# =============================================================================
# ANALYTICS EVENT CREATE MODEL
# =============================================================================


class AnalyticsEventCreate(BaseModel):
    """Model for creating a new analytics event.

    Used when recording new events. Most fields are optional to allow
    flexible event creation based on context.
    """

    workspace_id: UUID
    event_type: EventType
    event_category: EventCategory

    # Related entities
    gallery_id: Optional[UUID] = None
    asset_id: Optional[UUID] = None
    client_id: Optional[UUID] = None
    share_link_id: Optional[UUID] = None
    invitation_id: Optional[UUID] = None

    # Actor information
    actor_type: ActorType
    actor_id: Optional[UUID] = None
    visitor_id: Optional[UUID] = None

    # Session and context
    session_id: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    referrer: Optional[str] = None

    # Geographic data
    country_code: Optional[str] = None
    region: Optional[str] = None
    city: Optional[str] = None

    # Device information
    device_type: Optional[DeviceType] = None
    browser: Optional[str] = None
    os: Optional[str] = None

    # Metadata
    metadata: dict[str, Any] = Field(default_factory=dict)
    numeric_value: Optional[float] = None
    duration_ms: Optional[int] = None

    # Timestamp (defaults to now if not provided)
    occurred_at: Optional[datetime] = None


# =============================================================================
# HELPER MODELS FOR API RESPONSES
# =============================================================================


class AnalyticsEventSummary(BaseModel):
    """Lightweight event summary for API responses and lists."""

    event_id: UUID
    event_type: EventType
    event_category: EventCategory
    actor_type: ActorType
    gallery_id: Optional[UUID] = None
    client_id: Optional[UUID] = None
    occurred_at: datetime


class EventCount(BaseModel):
    """Model for event count aggregations."""

    event_type: EventType
    count: int
    period_start: Optional[datetime] = None
    period_end: Optional[datetime] = None


class EventTypeBreakdown(BaseModel):
    """Breakdown of events by type for analytics dashboards."""

    event_type: EventType
    event_category: EventCategory
    total_count: int
    unique_actors: int
    percentage: float = Field(
        ..., ge=0, le=100, description="Percentage of total events"
    )


class GeographicBreakdown(BaseModel):
    """Geographic breakdown of events for analytics."""

    country_code: str
    country_name: Optional[str] = None
    event_count: int
    unique_visitors: int
    percentage: float = Field(
        ..., ge=0, le=100, description="Percentage of total events"
    )


class DeviceBreakdown(BaseModel):
    """Device breakdown of events for analytics."""

    device_type: DeviceType
    event_count: int
    percentage: float = Field(
        ..., ge=0, le=100, description="Percentage of total events"
    )


# =============================================================================
# GALLERY ANALYTICS ENUMS
# =============================================================================


class AnalyticsPeriodType(str, Enum):
    """Period types for analytics aggregation."""

    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    ALL_TIME = "all_time"


# =============================================================================
# GALLERY ANALYTICS MODEL
# =============================================================================


class GalleryAnalytics(BaseModel):
    """Model for aggregated gallery-level analytics.

    Represents the gallery_analytics table containing pre-computed
    metrics for galleries across different time periods. This enables
    fast dashboard rendering and reporting without real-time aggregation.

    Gallery analytics tracks:
    - View metrics (total views, unique visitors, sessions)
    - Engagement metrics (favorites, comments, selections, downloads)
    - Time metrics (session duration, bounce rate)
    - Geographic distribution
    - Device breakdown
    - Source tracking (direct, share link, referral)
    - Calculated scores (engagement, conversion)
    """

    gallery_analytics_id: UUID

    # Core relationships
    workspace_id: UUID = Field(
        ..., description="Workspace this analytics record belongs to"
    )
    gallery_id: UUID = Field(
        ..., description="Gallery these analytics are for"
    )

    # Aggregation period
    period_type: AnalyticsPeriodType = Field(
        ..., description="Aggregation period type (daily, weekly, monthly, all_time)"
    )
    period_start: date = Field(
        ..., description="Start date of the aggregation period"
    )
    period_end: date = Field(
        ..., description="End date of the aggregation period"
    )

    # View metrics
    total_views: int = Field(
        0, ge=0, description="Total number of gallery views"
    )
    unique_visitors: int = Field(
        0, ge=0, description="Number of unique visitors"
    )
    unique_sessions: int = Field(
        0, ge=0, description="Number of unique sessions"
    )

    # Engagement metrics
    total_favorites: int = Field(
        0, ge=0, description="Total asset favorites"
    )
    total_comments: int = Field(
        0, ge=0, description="Total comments on assets"
    )
    total_selections: int = Field(
        0, ge=0, description="Total asset selections"
    )
    total_downloads: int = Field(
        0, ge=0, description="Total downloads"
    )

    # Time metrics
    total_time_spent_ms: int = Field(
        0, ge=0, description="Total time spent viewing gallery in milliseconds"
    )
    avg_session_duration_ms: int = Field(
        0, ge=0, description="Average session duration in milliseconds"
    )
    bounce_rate: Optional[float] = Field(
        None, ge=0, le=100, description="Bounce rate percentage"
    )

    # Geographic breakdown (top countries as JSON array)
    top_countries: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Top countries by views [{country_code, country_name, count, percentage}]"
    )

    # Device breakdown
    desktop_views: int = Field(
        0, ge=0, description="Views from desktop devices"
    )
    tablet_views: int = Field(
        0, ge=0, description="Views from tablet devices"
    )
    mobile_views: int = Field(
        0, ge=0, description="Views from mobile devices"
    )

    # Source tracking
    direct_views: int = Field(
        0, ge=0, description="Views from direct access"
    )
    share_link_views: int = Field(
        0, ge=0, description="Views via share links"
    )
    referral_views: int = Field(
        0, ge=0, description="Views from referral sources"
    )

    # Share link metrics
    share_links_created: int = Field(
        0, ge=0, description="Number of share links created"
    )
    share_link_accesses: int = Field(
        0, ge=0, description="Total share link access count"
    )
    share_link_conversions: int = Field(
        0, ge=0, description="Share link conversions (e.g., gate completion)"
    )

    # Calculated metrics
    engagement_score: Optional[float] = Field(
        None, ge=0, le=100, description="Overall engagement score (0-100)"
    )
    conversion_rate: Optional[float] = Field(
        None, ge=0, le=100, description="Conversion rate percentage"
    )

    # Timestamps
    calculated_at: datetime = Field(
        ..., description="When these analytics were calculated"
    )
    created_at: datetime = Field(
        ..., description="When this record was created"
    )
    updated_at: datetime = Field(
        ..., description="When this record was last updated"
    )


# =============================================================================
# GALLERY ANALYTICS CREATE/UPDATE MODELS
# =============================================================================


class GalleryAnalyticsCreate(BaseModel):
    """Model for creating a new gallery analytics record.

    Used when computing new analytics aggregations for a gallery.
    """

    workspace_id: UUID
    gallery_id: UUID
    period_type: AnalyticsPeriodType
    period_start: date
    period_end: date

    # View metrics
    total_views: int = 0
    unique_visitors: int = 0
    unique_sessions: int = 0

    # Engagement metrics
    total_favorites: int = 0
    total_comments: int = 0
    total_selections: int = 0
    total_downloads: int = 0

    # Time metrics
    total_time_spent_ms: int = 0
    avg_session_duration_ms: int = 0
    bounce_rate: Optional[float] = None

    # Geographic breakdown
    top_countries: list[dict[str, Any]] = Field(default_factory=list)

    # Device breakdown
    desktop_views: int = 0
    tablet_views: int = 0
    mobile_views: int = 0

    # Source tracking
    direct_views: int = 0
    share_link_views: int = 0
    referral_views: int = 0

    # Share link metrics
    share_links_created: int = 0
    share_link_accesses: int = 0
    share_link_conversions: int = 0

    # Calculated metrics
    engagement_score: Optional[float] = None
    conversion_rate: Optional[float] = None


class GalleryAnalyticsUpdate(BaseModel):
    """Model for updating existing gallery analytics.

    All fields are optional to allow partial updates.
    """

    # View metrics
    total_views: Optional[int] = None
    unique_visitors: Optional[int] = None
    unique_sessions: Optional[int] = None

    # Engagement metrics
    total_favorites: Optional[int] = None
    total_comments: Optional[int] = None
    total_selections: Optional[int] = None
    total_downloads: Optional[int] = None

    # Time metrics
    total_time_spent_ms: Optional[int] = None
    avg_session_duration_ms: Optional[int] = None
    bounce_rate: Optional[float] = None

    # Geographic breakdown
    top_countries: Optional[list[dict[str, Any]]] = None

    # Device breakdown
    desktop_views: Optional[int] = None
    tablet_views: Optional[int] = None
    mobile_views: Optional[int] = None

    # Source tracking
    direct_views: Optional[int] = None
    share_link_views: Optional[int] = None
    referral_views: Optional[int] = None

    # Share link metrics
    share_links_created: Optional[int] = None
    share_link_accesses: Optional[int] = None
    share_link_conversions: Optional[int] = None

    # Calculated metrics
    engagement_score: Optional[float] = None
    conversion_rate: Optional[float] = None


# =============================================================================
# GALLERY ANALYTICS HELPER MODELS
# =============================================================================


class GalleryAnalyticsSummary(BaseModel):
    """Lightweight gallery analytics summary for API responses and lists."""

    gallery_analytics_id: UUID
    gallery_id: UUID
    period_type: AnalyticsPeriodType
    period_start: date
    period_end: date
    total_views: int
    unique_visitors: int
    total_downloads: int
    engagement_score: Optional[float] = None
    calculated_at: datetime


class GalleryViewsTimeSeries(BaseModel):
    """Time series data point for gallery views."""

    date: date
    total_views: int
    unique_visitors: int


class GalleryEngagementMetrics(BaseModel):
    """Engagement metrics for a gallery."""

    gallery_id: UUID
    total_favorites: int
    total_comments: int
    total_selections: int
    total_downloads: int
    avg_session_duration_ms: int
    bounce_rate: Optional[float] = None
    engagement_score: Optional[float] = None


class GalleryDeviceStats(BaseModel):
    """Device breakdown statistics for a gallery."""

    gallery_id: UUID
    desktop_views: int
    desktop_percentage: float
    tablet_views: int
    tablet_percentage: float
    mobile_views: int
    mobile_percentage: float


class GallerySourceStats(BaseModel):
    """Traffic source statistics for a gallery."""

    gallery_id: UUID
    direct_views: int
    direct_percentage: float
    share_link_views: int
    share_link_percentage: float
    referral_views: int
    referral_percentage: float


class GalleryShareLinkStats(BaseModel):
    """Share link statistics for a gallery."""

    gallery_id: UUID
    share_links_created: int
    share_link_accesses: int
    share_link_conversions: int
    conversion_rate: Optional[float] = None


class TopGallery(BaseModel):
    """Top performing gallery summary for dashboard display."""

    gallery_id: UUID
    gallery_name: Optional[str] = None
    total_views: int
    unique_visitors: int
    total_downloads: int
    engagement_score: Optional[float] = None
    trend_percentage: Optional[float] = Field(
        None, description="Percentage change from previous period"
    )


# =============================================================================
# CLIENT ANALYTICS MODEL
# =============================================================================


class ClientAnalytics(BaseModel):
    """Model for aggregated client-level analytics.

    Represents the client_analytics table containing pre-computed
    metrics for clients across different time periods. This enables
    identification of high-value clients, engagement tracking, and
    churn risk assessment.

    Client analytics tracks:
    - Activity metrics (gallery views, asset views, favorites, comments, etc.)
    - Session metrics (total sessions, time spent, average duration)
    - Gallery interaction metrics
    - Engagement scoring with trends
    - Lifetime value and revenue
    - Recency metrics (last activity, days since)
    - Frequency metrics (visits in various time windows)
    - Churn risk scoring
    """

    client_analytics_id: UUID

    # Core relationships
    workspace_id: UUID = Field(
        ..., description="Workspace this analytics record belongs to"
    )
    client_id: UUID = Field(
        ..., description="Client these analytics are for"
    )

    # Aggregation period
    period_type: AnalyticsPeriodType = Field(
        ..., description="Aggregation period type (daily, weekly, monthly, all_time)"
    )
    period_start: date = Field(
        ..., description="Start date of the aggregation period"
    )
    period_end: date = Field(
        ..., description="End date of the aggregation period"
    )

    # Activity metrics
    total_gallery_views: int = Field(
        0, ge=0, description="Total number of gallery views"
    )
    total_asset_views: int = Field(
        0, ge=0, description="Total number of asset views"
    )
    total_favorites: int = Field(
        0, ge=0, description="Total assets favorited"
    )
    total_comments: int = Field(
        0, ge=0, description="Total comments made"
    )
    total_selections: int = Field(
        0, ge=0, description="Total assets selected"
    )
    total_downloads: int = Field(
        0, ge=0, description="Total downloads"
    )

    # Session metrics
    total_sessions: int = Field(
        0, ge=0, description="Total number of sessions"
    )
    total_time_spent_ms: int = Field(
        0, ge=0, description="Total time spent in milliseconds"
    )
    avg_session_duration_ms: int = Field(
        0, ge=0, description="Average session duration in milliseconds"
    )

    # Gallery interaction metrics
    galleries_viewed: int = Field(
        0, ge=0, description="Number of unique galleries viewed"
    )
    galleries_with_activity: int = Field(
        0, ge=0, description="Number of galleries with engagement (favorites, comments, etc.)"
    )

    # Engagement scoring
    engagement_score: float = Field(
        0, ge=0, le=100, description="Overall engagement score (0-100)"
    )
    engagement_trend: Optional[float] = Field(
        None, description="Engagement trend compared to previous period (positive = improving)"
    )

    # Lifetime value (in cents)
    lifetime_value_cents: int = Field(
        0, ge=0, description="Client lifetime value in cents"
    )
    period_revenue_cents: int = Field(
        0, ge=0, description="Revenue generated in this period in cents"
    )

    # Recency metrics
    last_activity_at: Optional[datetime] = Field(
        None, description="Timestamp of last activity"
    )
    days_since_last_activity: Optional[int] = Field(
        None, ge=0, description="Days since last activity"
    )

    # Frequency metrics
    visits_last_7_days: int = Field(
        0, ge=0, description="Number of visits in the last 7 days"
    )
    visits_last_30_days: int = Field(
        0, ge=0, description="Number of visits in the last 30 days"
    )
    visits_last_90_days: int = Field(
        0, ge=0, description="Number of visits in the last 90 days"
    )

    # Churn risk indicator
    churn_risk_score: Optional[int] = Field(
        None, ge=0, le=100, description="Churn risk score (0-100, higher = more at risk)"
    )

    # Timestamps
    calculated_at: datetime = Field(
        ..., description="When these analytics were calculated"
    )
    created_at: datetime = Field(
        ..., description="When this record was created"
    )
    updated_at: datetime = Field(
        ..., description="When this record was last updated"
    )


# =============================================================================
# CLIENT ANALYTICS CREATE/UPDATE MODELS
# =============================================================================


class ClientAnalyticsCreate(BaseModel):
    """Model for creating a new client analytics record.

    Used when computing new analytics aggregations for a client.
    """

    workspace_id: UUID
    client_id: UUID
    period_type: AnalyticsPeriodType
    period_start: date
    period_end: date

    # Activity metrics
    total_gallery_views: int = 0
    total_asset_views: int = 0
    total_favorites: int = 0
    total_comments: int = 0
    total_selections: int = 0
    total_downloads: int = 0

    # Session metrics
    total_sessions: int = 0
    total_time_spent_ms: int = 0
    avg_session_duration_ms: int = 0

    # Gallery interaction metrics
    galleries_viewed: int = 0
    galleries_with_activity: int = 0

    # Engagement scoring
    engagement_score: float = 0
    engagement_trend: Optional[float] = None

    # Lifetime value (in cents)
    lifetime_value_cents: int = 0
    period_revenue_cents: int = 0

    # Recency metrics
    last_activity_at: Optional[datetime] = None
    days_since_last_activity: Optional[int] = None

    # Frequency metrics
    visits_last_7_days: int = 0
    visits_last_30_days: int = 0
    visits_last_90_days: int = 0

    # Churn risk
    churn_risk_score: Optional[int] = None


class ClientAnalyticsUpdate(BaseModel):
    """Model for updating existing client analytics.

    All fields are optional to allow partial updates.
    """

    # Activity metrics
    total_gallery_views: Optional[int] = None
    total_asset_views: Optional[int] = None
    total_favorites: Optional[int] = None
    total_comments: Optional[int] = None
    total_selections: Optional[int] = None
    total_downloads: Optional[int] = None

    # Session metrics
    total_sessions: Optional[int] = None
    total_time_spent_ms: Optional[int] = None
    avg_session_duration_ms: Optional[int] = None

    # Gallery interaction metrics
    galleries_viewed: Optional[int] = None
    galleries_with_activity: Optional[int] = None

    # Engagement scoring
    engagement_score: Optional[float] = None
    engagement_trend: Optional[float] = None

    # Lifetime value (in cents)
    lifetime_value_cents: Optional[int] = None
    period_revenue_cents: Optional[int] = None

    # Recency metrics
    last_activity_at: Optional[datetime] = None
    days_since_last_activity: Optional[int] = None

    # Frequency metrics
    visits_last_7_days: Optional[int] = None
    visits_last_30_days: Optional[int] = None
    visits_last_90_days: Optional[int] = None

    # Churn risk
    churn_risk_score: Optional[int] = None


# =============================================================================
# CLIENT ANALYTICS HELPER MODELS
# =============================================================================


class ClientAnalyticsSummary(BaseModel):
    """Lightweight client analytics summary for API responses and lists."""

    client_analytics_id: UUID
    client_id: UUID
    period_type: AnalyticsPeriodType
    period_start: date
    period_end: date
    total_gallery_views: int
    total_downloads: int
    engagement_score: float
    lifetime_value_cents: int
    churn_risk_score: Optional[int] = None
    calculated_at: datetime


class ClientActivityTimeSeries(BaseModel):
    """Time series data point for client activity."""

    date: date
    gallery_views: int
    asset_views: int
    total_engagement_actions: int = Field(
        0, description="Sum of favorites, comments, selections, downloads"
    )


class ClientEngagementMetrics(BaseModel):
    """Engagement metrics for a client."""

    client_id: UUID
    total_favorites: int
    total_comments: int
    total_selections: int
    total_downloads: int
    avg_session_duration_ms: int
    engagement_score: float
    engagement_trend: Optional[float] = None


class ClientValueMetrics(BaseModel):
    """Value metrics for a client (LTV, revenue)."""

    client_id: UUID
    lifetime_value_cents: int
    period_revenue_cents: int
    galleries_viewed: int
    galleries_with_activity: int
    total_sessions: int
    total_time_spent_ms: int


class ClientRecencyFrequencyMetrics(BaseModel):
    """Recency and frequency metrics for a client (RFM analysis)."""

    client_id: UUID
    last_activity_at: Optional[datetime] = None
    days_since_last_activity: Optional[int] = None
    visits_last_7_days: int
    visits_last_30_days: int
    visits_last_90_days: int
    churn_risk_score: Optional[int] = None


class ClientChurnRisk(BaseModel):
    """Churn risk assessment for a client."""

    client_id: UUID
    client_name: Optional[str] = None
    client_email: Optional[str] = None
    churn_risk_score: int = Field(
        ..., ge=0, le=100, description="Churn risk score (0-100)"
    )
    days_since_last_activity: Optional[int] = None
    last_activity_at: Optional[datetime] = None
    engagement_score: float
    engagement_trend: Optional[float] = None
    risk_factors: list[str] = Field(
        default_factory=list,
        description="List of factors contributing to churn risk"
    )


class TopClient(BaseModel):
    """Top performing client summary for dashboard display."""

    client_id: UUID
    client_name: Optional[str] = None
    client_email: Optional[str] = None
    total_gallery_views: int
    total_downloads: int
    engagement_score: float
    lifetime_value_cents: int
    trend_percentage: Optional[float] = Field(
        None, description="Percentage change from previous period"
    )


class ClientSegment(BaseModel):
    """Client segment for grouping clients by behavior."""

    segment_name: str = Field(
        ..., description="Name of the segment (e.g., 'High Value', 'At Risk', 'New')"
    )
    client_count: int
    avg_engagement_score: float
    avg_lifetime_value_cents: int
    percentage_of_total: float = Field(
        ..., ge=0, le=100, description="Percentage of total clients"
    )


# =============================================================================
# CUSTOM REPORT ENUMS
# =============================================================================


class ReportType(str, Enum):
    """Types of custom reports that can be created."""

    DASHBOARD_SUMMARY = "dashboard_summary"
    GALLERY_PERFORMANCE = "gallery_performance"
    CLIENT_ENGAGEMENT = "client_engagement"
    REVENUE_REPORT = "revenue_report"
    DOWNLOAD_REPORT = "download_report"
    CUSTOM = "custom"


class DateRangeType(str, Enum):
    """Predefined date range options for reports."""

    TODAY = "today"
    YESTERDAY = "yesterday"
    LAST_7_DAYS = "last_7_days"
    LAST_30_DAYS = "last_30_days"
    LAST_90_DAYS = "last_90_days"
    THIS_MONTH = "this_month"
    LAST_MONTH = "last_month"
    THIS_YEAR = "this_year"
    LAST_YEAR = "last_year"
    CUSTOM = "custom"


class ExportFormat(str, Enum):
    """Supported export formats for reports."""

    CSV = "csv"
    PDF = "pdf"
    XLSX = "xlsx"


class ReportRunStatus(str, Enum):
    """Status of a report run."""

    SUCCESS = "success"
    FAILED = "failed"
    RUNNING = "running"


class ReportExportStatus(str, Enum):
    """Status of a report export file."""

    GENERATING = "generating"
    COMPLETED = "completed"
    FAILED = "failed"
    EXPIRED = "expired"


# =============================================================================
# CUSTOM REPORT MODEL
# =============================================================================


class CustomReport(BaseModel):
    """Model for user-defined custom report configurations.

    Represents the custom_reports table containing report definitions
    with configuration, scheduling, and recipient management. Reports
    can be run on-demand or scheduled for automatic generation.

    Custom reports support:
    - Report identification (name, description, type)
    - Configuration (metrics, filters, grouping, sorting)
    - Date range (presets or custom dates)
    - Export settings (format, configuration)
    - Scheduling (cron, timezone, next run)
    - Recipients (for scheduled report delivery)
    - Status tracking (active, run count, errors)
    """

    report_id: UUID

    # Core relationships
    workspace_id: UUID = Field(
        ..., description="Workspace this report belongs to"
    )

    # Report identification
    name: str = Field(
        ..., max_length=255, description="Display name for the report"
    )
    description: Optional[str] = Field(
        None, description="Optional description of the report"
    )

    # Report type
    report_type: ReportType = Field(
        ..., description="Type of report (dashboard_summary, gallery_performance, etc.)"
    )

    # Configuration
    config: dict[str, Any] = Field(
        default_factory=dict,
        description="General report configuration options"
    )
    metrics: list[str] = Field(
        default_factory=list,
        description="List of metric names to include in the report"
    )
    filters: dict[str, Any] = Field(
        default_factory=dict,
        description="Filter criteria (e.g., gallery_ids, client_ids, event_types)"
    )
    grouping: list[str] = Field(
        default_factory=list,
        description="Fields to group results by (e.g., 'gallery', 'client', 'date')"
    )
    sorting: dict[str, Any] = Field(
        default_factory=dict,
        description="Sorting configuration (field, direction)"
    )

    # Date range configuration
    date_range_type: DateRangeType = Field(
        DateRangeType.LAST_30_DAYS,
        description="Predefined date range or 'custom' for custom dates"
    )
    custom_start_date: Optional[date] = Field(
        None, description="Custom start date (required if date_range_type is 'custom')"
    )
    custom_end_date: Optional[date] = Field(
        None, description="Custom end date (required if date_range_type is 'custom')"
    )

    # Export configuration
    export_format: ExportFormat = Field(
        ExportFormat.CSV, description="Default export format"
    )
    export_config: dict[str, Any] = Field(
        default_factory=dict,
        description="Export-specific configuration (columns, formatting, etc.)"
    )

    # Scheduling
    is_scheduled: bool = Field(
        False, description="Whether this report runs on a schedule"
    )
    schedule_cron: Optional[str] = Field(
        None, max_length=50, description="Cron expression for scheduling (e.g., '0 9 * * 1')"
    )
    schedule_timezone: str = Field(
        "UTC", max_length=50, description="Timezone for schedule (e.g., 'America/New_York')"
    )
    next_run_at: Optional[datetime] = Field(
        None, description="Next scheduled run time"
    )
    last_run_at: Optional[datetime] = Field(
        None, description="Last successful run time"
    )

    # Recipients for scheduled reports
    recipients: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Recipients for scheduled reports [{email, name, type}]"
    )

    # Status and metadata
    is_active: bool = Field(
        True, description="Whether the report is active"
    )
    is_system: bool = Field(
        False, description="Whether this is a system-defined report"
    )
    run_count: int = Field(
        0, ge=0, description="Number of times the report has been run"
    )
    last_run_status: Optional[ReportRunStatus] = Field(
        None, description="Status of the last run"
    )
    last_run_error: Optional[str] = Field(
        None, description="Error message from the last failed run"
    )

    # Ownership
    created_by_user_id: UUID = Field(
        ..., description="User who created this report"
    )
    updated_by_user_id: Optional[UUID] = Field(
        None, description="User who last updated this report"
    )

    # Timestamps
    created_at: datetime = Field(
        ..., description="When this report was created"
    )
    updated_at: datetime = Field(
        ..., description="When this report was last updated"
    )


# =============================================================================
# CUSTOM REPORT CREATE/UPDATE MODELS
# =============================================================================


class CustomReportCreate(BaseModel):
    """Model for creating a new custom report.

    Used when users create new report configurations.
    """

    workspace_id: UUID
    name: str = Field(..., max_length=255)
    description: Optional[str] = None
    report_type: ReportType

    # Configuration
    config: dict[str, Any] = Field(default_factory=dict)
    metrics: list[str] = Field(default_factory=list)
    filters: dict[str, Any] = Field(default_factory=dict)
    grouping: list[str] = Field(default_factory=list)
    sorting: dict[str, Any] = Field(default_factory=dict)

    # Date range
    date_range_type: DateRangeType = DateRangeType.LAST_30_DAYS
    custom_start_date: Optional[date] = None
    custom_end_date: Optional[date] = None

    # Export
    export_format: ExportFormat = ExportFormat.CSV
    export_config: dict[str, Any] = Field(default_factory=dict)

    # Scheduling (optional)
    is_scheduled: bool = False
    schedule_cron: Optional[str] = None
    schedule_timezone: str = "UTC"
    recipients: list[dict[str, Any]] = Field(default_factory=list)

    # Ownership
    created_by_user_id: UUID


class CustomReportUpdate(BaseModel):
    """Model for updating an existing custom report.

    All fields are optional to allow partial updates.
    """

    name: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    report_type: Optional[ReportType] = None

    # Configuration
    config: Optional[dict[str, Any]] = None
    metrics: Optional[list[str]] = None
    filters: Optional[dict[str, Any]] = None
    grouping: Optional[list[str]] = None
    sorting: Optional[dict[str, Any]] = None

    # Date range
    date_range_type: Optional[DateRangeType] = None
    custom_start_date: Optional[date] = None
    custom_end_date: Optional[date] = None

    # Export
    export_format: Optional[ExportFormat] = None
    export_config: Optional[dict[str, Any]] = None

    # Scheduling
    is_scheduled: Optional[bool] = None
    schedule_cron: Optional[str] = None
    schedule_timezone: Optional[str] = None
    next_run_at: Optional[datetime] = None
    recipients: Optional[list[dict[str, Any]]] = None

    # Status
    is_active: Optional[bool] = None
    last_run_at: Optional[datetime] = None
    last_run_status: Optional[ReportRunStatus] = None
    last_run_error: Optional[str] = None

    # Ownership
    updated_by_user_id: Optional[UUID] = None


# =============================================================================
# CUSTOM REPORT HELPER MODELS
# =============================================================================


class CustomReportSummary(BaseModel):
    """Lightweight custom report summary for API responses and lists."""

    report_id: UUID
    workspace_id: UUID
    name: str
    report_type: ReportType
    date_range_type: DateRangeType
    is_scheduled: bool
    is_active: bool
    run_count: int
    last_run_at: Optional[datetime] = None
    last_run_status: Optional[ReportRunStatus] = None
    created_at: datetime


class ReportRecipient(BaseModel):
    """Recipient configuration for scheduled reports."""

    email: str = Field(..., description="Email address of the recipient")
    name: Optional[str] = Field(None, description="Display name of the recipient")
    recipient_type: str = Field(
        "email", description="Type of recipient (email, user, client)"
    )
    user_id: Optional[UUID] = Field(
        None, description="User ID if recipient is a workspace user"
    )
    client_id: Optional[UUID] = Field(
        None, description="Client ID if recipient is a client"
    )


class ReportSchedule(BaseModel):
    """Schedule information for a report."""

    report_id: UUID
    is_scheduled: bool
    schedule_cron: Optional[str] = None
    schedule_timezone: str = "UTC"
    next_run_at: Optional[datetime] = None
    last_run_at: Optional[datetime] = None
    recipients: list[ReportRecipient] = Field(default_factory=list)


class ReportMetricConfig(BaseModel):
    """Configuration for a single metric in a report."""

    metric_name: str = Field(..., description="Internal metric name")
    display_name: str = Field(..., description="Display name for the metric")
    aggregation: str = Field(
        "sum", description="Aggregation method (sum, avg, count, min, max)"
    )
    format: str = Field(
        "number", description="Display format (number, percentage, currency, duration)"
    )
    is_visible: bool = Field(True, description="Whether to show in output")


class ReportFilterConfig(BaseModel):
    """Configuration for a single filter in a report."""

    field: str = Field(..., description="Field to filter on")
    operator: str = Field(..., description="Filter operator (eq, ne, gt, lt, in, contains)")
    value: Any = Field(..., description="Filter value")


# =============================================================================
# REPORT EXPORT MODEL
# =============================================================================


class ReportExport(BaseModel):
    """Model for generated report export files.

    Represents the report_exports table containing metadata
    about generated report files available for download.

    Report exports track:
    - Export identification (name, format, date range)
    - File storage (storage key, size, hash)
    - Generation status (generating, completed, failed, expired)
    - Download tracking (count, last downloaded)
    - Expiration management
    """

    export_id: UUID

    # Core relationships
    workspace_id: UUID = Field(
        ..., description="Workspace this export belongs to"
    )
    report_id: Optional[UUID] = Field(
        None, description="Source report configuration (if from a saved report)"
    )

    # Export details
    name: str = Field(
        ..., max_length=255, description="Display name for the export"
    )
    format: ExportFormat = Field(
        ..., description="Export file format"
    )

    # Date range used for export
    start_date: date = Field(
        ..., description="Start date of the data in this export"
    )
    end_date: date = Field(
        ..., description="End date of the data in this export"
    )

    # File storage
    storage_key: str = Field(
        ..., max_length=500, description="Storage key/path for the export file"
    )
    file_size_bytes: int = Field(
        ..., ge=0, description="Size of the export file in bytes"
    )
    file_hash: Optional[str] = Field(
        None, max_length=64, description="SHA-256 hash of the file for integrity"
    )

    # Status
    status: ReportExportStatus = Field(
        ReportExportStatus.GENERATING, description="Current status of the export"
    )
    error_message: Optional[str] = Field(
        None, description="Error message if export failed"
    )

    # Download tracking
    download_count: int = Field(
        0, ge=0, description="Number of times this export has been downloaded"
    )
    last_downloaded_at: Optional[datetime] = Field(
        None, description="When this export was last downloaded"
    )

    # Expiration
    expires_at: datetime = Field(
        ..., description="When this export expires and should be deleted"
    )

    # Generation metadata
    generated_by_user_id: Optional[UUID] = Field(
        None, description="User who generated this export"
    )
    generation_time_ms: Optional[int] = Field(
        None, ge=0, description="Time taken to generate the export in milliseconds"
    )

    # Timestamps
    created_at: datetime = Field(
        ..., description="When this export was created"
    )


# =============================================================================
# REPORT EXPORT CREATE/UPDATE MODELS
# =============================================================================


class ReportExportCreate(BaseModel):
    """Model for creating a new report export.

    Used when generating new export files.
    """

    workspace_id: UUID
    report_id: Optional[UUID] = None
    name: str = Field(..., max_length=255)
    format: ExportFormat
    start_date: date
    end_date: date
    storage_key: str = Field(..., max_length=500)
    file_size_bytes: int = Field(0, ge=0)
    file_hash: Optional[str] = None
    status: ReportExportStatus = ReportExportStatus.GENERATING
    expires_at: datetime
    generated_by_user_id: Optional[UUID] = None


class ReportExportUpdate(BaseModel):
    """Model for updating an existing report export.

    All fields are optional to allow partial updates.
    """

    status: Optional[ReportExportStatus] = None
    error_message: Optional[str] = None
    file_size_bytes: Optional[int] = None
    file_hash: Optional[str] = None
    download_count: Optional[int] = None
    last_downloaded_at: Optional[datetime] = None
    generation_time_ms: Optional[int] = None


# =============================================================================
# REPORT EXPORT HELPER MODELS
# =============================================================================


class ReportExportSummary(BaseModel):
    """Lightweight report export summary for API responses and lists."""

    export_id: UUID
    workspace_id: UUID
    report_id: Optional[UUID] = None
    name: str
    format: ExportFormat
    start_date: date
    end_date: date
    status: ReportExportStatus
    file_size_bytes: int
    download_count: int
    expires_at: datetime
    created_at: datetime


class ReportExportDownloadInfo(BaseModel):
    """Download information for a report export."""

    export_id: UUID
    name: str
    format: ExportFormat
    storage_key: str
    file_size_bytes: int
    file_hash: Optional[str] = None
    expires_at: datetime
    download_url: Optional[str] = Field(
        None, description="Pre-signed download URL (generated on demand)"
    )


class ReportGenerationRequest(BaseModel):
    """Request model for generating a new report export."""

    report_id: Optional[UUID] = Field(
        None, description="Source report configuration (optional)"
    )
    report_type: ReportType = Field(
        ..., description="Type of report to generate"
    )
    name: Optional[str] = Field(
        None, max_length=255, description="Custom name for the export"
    )
    format: ExportFormat = Field(
        ExportFormat.CSV, description="Export format"
    )
    date_range_type: DateRangeType = Field(
        DateRangeType.LAST_30_DAYS, description="Date range preset"
    )
    custom_start_date: Optional[date] = Field(
        None, description="Custom start date (required if date_range_type is 'custom')"
    )
    custom_end_date: Optional[date] = Field(
        None, description="Custom end date (required if date_range_type is 'custom')"
    )
    metrics: list[str] = Field(
        default_factory=list, description="Metrics to include"
    )
    filters: dict[str, Any] = Field(
        default_factory=dict, description="Filter criteria"
    )
    grouping: list[str] = Field(
        default_factory=list, description="Grouping fields"
    )


class ReportGenerationStatus(BaseModel):
    """Status response for a report generation request."""

    export_id: UUID
    status: ReportExportStatus
    progress_percentage: Optional[int] = Field(
        None, ge=0, le=100, description="Generation progress (0-100)"
    )
    error_message: Optional[str] = None
    estimated_completion_time: Optional[datetime] = None
    download_url: Optional[str] = Field(
        None, description="Download URL (available when status is 'completed')"
    )
