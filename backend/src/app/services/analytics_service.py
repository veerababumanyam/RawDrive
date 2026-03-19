"""AnalyticsService: Analytics event recording and reporting.

Implements comprehensive analytics functionality:
- Event recording (single and batch) with validation
- Event retrieval with filtering and pagination
- Client growth trends and totals
- Engagement metrics (gallery views, selections)
- Referral analytics
- Revenue per client calculations
- Dashboard metrics aggregation with period comparison
- Workspace overview metrics
- Activity feed with human-readable descriptions
- Gallery-level analytics calculation and aggregation
- Report generation and export

All operations are workspace-scoped for multi-tenant data isolation.

Feature: Analytics & Reporting
Tasks:
- T015: Create analytics service with event recording
- T016: Add dashboard metrics aggregation
- T017: Add gallery analytics calculation
- T018: Add client engagement scoring
- T019: Add report generation and export

Requirements covered:
- Requirement 27: Analytics and insights
- Requirement 27.1: Total clients, active clients, growth rate
- Requirement 27.2: Referral sources and rates
- Requirement 27.3: Gallery views, selection rates, response times
- Requirement 27.4: Lifetime value per client

Dashboard Analytics (T016):
- Overview metrics: total galleries, assets, storage, clients
- Quick stats: views, downloads, new clients for selected period
- Trend analysis: period-over-period comparison
- Top galleries: ranked by views and engagement
- Activity feed: recent events with context
- Device breakdown: desktop, mobile, tablet stats
- Geographic breakdown: top countries by views
- Daily views chart data

Gallery Analytics (T017):
- Detailed gallery analytics with all breakdowns
- Gallery views time series for charting
- Gallery engagement breakdown (favorites, comments, selections, downloads)
- Top galleries by various metrics
- Workspace gallery aggregate statistics
- Calculate and store gallery analytics records
- Bulk calculate stale gallery analytics
- Gallery analytics history for trend analysis
- Gallery comparison across multiple galleries

Client Engagement Scoring (T018):
- Calculate and store individual client analytics
- Bulk calculate stale client analytics
- Get comprehensive client analytics with engagement scoring
- Get clients at churn risk with risk factors
- Get top clients by engagement, LTV, or activity
- Client analytics history for trend analysis
- Client activity time series for charting
- Client engagement breakdown with percentages
- Client gallery interactions ranked by engagement
- Workspace-level client statistics and segmentation

Report Generation and Export (T019):
- Create, read, update, delete custom report configurations
- Run reports with configurable metrics, filters, grouping
- Generate exports in CSV, PDF, XLSX formats
- Track export status and download counts
- Calculate date ranges from preset types
- Aggregate data for different report types
"""

from __future__ import annotations

import csv
import hashlib
import io
import logging
import time
from calendar import monthrange
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.models.analytics import (
    ActorType,
    DateRangeType,
    EventCategory,
    EventType,
    ExportFormat,
    ReportExportStatus,
    ReportRunStatus,
    ReportType,
)
from app.repositories.analytics_repository import (
    AnalyticsRepository,
    get_analytics_repository,
)

logger = logging.getLogger(__name__)

# Rate limits (from shared-constants)
ANALYTICS_MAX_BATCH_SIZE = 100
ANALYTICS_MAX_EVENTS_PER_MINUTE = 1000

# Report configuration (from shared-constants)
REPORT_MAX_CSV_ROWS = 100000
REPORT_MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024  # 100MB
REPORT_EXPORT_RETENTION_DAYS = 30
REPORT_MAX_DATE_RANGE_DAYS = 365


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class AnalyticsError(Exception):
    """Base exception for analytics errors."""

    def __init__(self, message: str, code: str = "ANALYTICS_ERROR"):
        self.message = message
        self.code = code
        self.status_code = 400
        self.user_message = message
        super().__init__(message)


class InvalidDateRangeError(AnalyticsError):
    """Invalid date range for analytics."""

    def __init__(self, message: str):
        super().__init__(message, code="INVALID_DATE_RANGE")


class BatchSizeExceededError(AnalyticsError):
    """Batch size exceeds maximum allowed."""

    def __init__(self, size: int, max_size: int = ANALYTICS_MAX_BATCH_SIZE):
        super().__init__(
            f"Batch size {size} exceeds maximum of {max_size} events",
            code="BATCH_SIZE_EXCEEDED",
        )


class InvalidEventError(AnalyticsError):
    """Invalid event data provided."""

    def __init__(self, message: str):
        super().__init__(message, code="INVALID_EVENT")


class EventNotFoundError(AnalyticsError):
    """Analytics event not found."""

    def __init__(self, event_id: UUID):
        super().__init__(
            f"Analytics event not found: {event_id}",
            code="EVENT_NOT_FOUND",
        )
        self.status_code = 404


class ReportNotFoundError(AnalyticsError):
    """Custom report not found."""

    def __init__(self, report_id: UUID):
        super().__init__(
            f"Report not found: {report_id}",
            code="REPORT_NOT_FOUND",
        )
        self.status_code = 404


class ExportNotFoundError(AnalyticsError):
    """Report export not found."""

    def __init__(self, export_id: UUID):
        super().__init__(
            f"Export not found: {export_id}",
            code="EXPORT_NOT_FOUND",
        )
        self.status_code = 404


class ExportExpiredError(AnalyticsError):
    """Report export has expired."""

    def __init__(self, export_id: UUID):
        super().__init__(
            f"Export has expired: {export_id}",
            code="EXPORT_EXPIRED",
        )
        self.status_code = 410


class ReportGenerationError(AnalyticsError):
    """Report generation failed."""

    def __init__(self, message: str):
        super().__init__(message, code="REPORT_GENERATION_FAILED")
        self.status_code = 500


class ExportGenerationError(AnalyticsError):
    """Export generation failed."""

    def __init__(self, message: str):
        super().__init__(message, code="EXPORT_GENERATION_FAILED")
        self.status_code = 500


class InvalidReportTypeError(AnalyticsError):
    """Invalid report type specified."""

    def __init__(self, report_type: str):
        super().__init__(
            f"Invalid report type: {report_type}",
            code="INVALID_REPORT_TYPE",
        )


class InvalidExportFormatError(AnalyticsError):
    """Invalid export format specified."""

    def __init__(self, export_format: str):
        super().__init__(
            f"Invalid export format: {export_format}",
            code="INVALID_EXPORT_FORMAT",
        )


# ---------------------------------------------------------------------------
# AnalyticsService
# ---------------------------------------------------------------------------


class AnalyticsService:
    """Service for analytics event recording and reporting.

    Provides comprehensive analytics capabilities:
    - Event recording (single and batch) with validation
    - Event retrieval with filtering and pagination
    - Client growth trends and engagement metrics
    - Referral analytics
    - Revenue tracking

    All operations are workspace-scoped for multi-tenant isolation.
    """

    def __init__(self, repository: Optional[AnalyticsRepository] = None):
        """Initialize the analytics service.

        Args:
            repository: Optional repository instance for dependency injection.
                       Defaults to singleton instance if not provided.
        """
        self._repository = repository or get_analytics_repository()

    # =========================================================================
    # Event Recording (Task T015)
    # =========================================================================

    async def record_event(
        self,
        workspace_id: UUID,
        event_type: EventType | str,
        event_category: EventCategory | str,
        actor_type: ActorType | str,
        *,
        # Entity references
        gallery_id: Optional[UUID] = None,
        asset_id: Optional[UUID] = None,
        client_id: Optional[UUID] = None,
        share_link_id: Optional[UUID] = None,
        invitation_id: Optional[UUID] = None,
        # Actor information
        actor_id: Optional[UUID] = None,
        visitor_id: Optional[UUID] = None,
        # Session and context
        session_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        referrer: Optional[str] = None,
        # Geographic data
        country_code: Optional[str] = None,
        region: Optional[str] = None,
        city: Optional[str] = None,
        # Device information
        device_type: Optional[str] = None,
        browser: Optional[str] = None,
        os: Optional[str] = None,
        # Event metadata
        metadata: Optional[dict[str, Any]] = None,
        numeric_value: Optional[float] = None,
        duration_ms: Optional[int] = None,
        occurred_at: Optional[datetime] = None,
    ) -> dict[str, Any]:
        """Record a single analytics event.

        Records a new analytics event to track user interactions across
        the platform. Events are the foundation for all analytics
        aggregation and reporting.

        Args:
            workspace_id: Workspace for tenant isolation
            event_type: Type of event (EventType enum or string value)
            event_category: Category for grouping (EventCategory enum or string)
            actor_type: Type of actor (ActorType enum or string)
            gallery_id: Related gallery (optional)
            asset_id: Related asset (optional)
            client_id: Related client (optional)
            share_link_id: Related share link (optional)
            invitation_id: Related invitation (optional)
            actor_id: ID of the actor (user_id, client_id, etc.)
            visitor_id: Visitor ID for anonymous access
            session_id: Session identifier for grouping events
            ip_address: Client IP address
            user_agent: Browser user agent string
            referrer: HTTP referrer
            country_code: ISO country code (e.g., 'USA', 'IND')
            region: Region/state/province
            city: City name
            device_type: Device type ('desktop', 'tablet', 'mobile', 'other')
            browser: Browser name
            os: Operating system
            metadata: Additional event-specific data
            numeric_value: Numeric value for aggregation
            duration_ms: Duration in milliseconds
            occurred_at: When the event occurred (default: now)

        Returns:
            Created event record as dictionary

        Raises:
            InvalidEventError: If event type or category is invalid
            AnalyticsError: If event recording fails
        """
        # Convert enums to string values
        event_type_str = event_type.value if isinstance(event_type, EventType) else event_type
        event_category_str = event_category.value if isinstance(event_category, EventCategory) else event_category
        actor_type_str = actor_type.value if isinstance(actor_type, ActorType) else actor_type

        # Validate event type
        valid_event_types = {e.value for e in EventType}
        if event_type_str not in valid_event_types:
            raise InvalidEventError(f"Invalid event type: {event_type_str}")

        # Validate event category
        valid_categories = {c.value for c in EventCategory}
        if event_category_str not in valid_categories:
            raise InvalidEventError(f"Invalid event category: {event_category_str}")

        # Validate actor type
        valid_actor_types = {a.value for a in ActorType}
        if actor_type_str not in valid_actor_types:
            raise InvalidEventError(f"Invalid actor type: {actor_type_str}")

        try:
            event = await self._repository.record_event(
                workspace_id=workspace_id,
                event_type=event_type_str,
                event_category=event_category_str,
                actor_type=actor_type_str,
                gallery_id=gallery_id,
                asset_id=asset_id,
                client_id=client_id,
                share_link_id=share_link_id,
                invitation_id=invitation_id,
                actor_id=actor_id,
                visitor_id=visitor_id,
                session_id=session_id,
                ip_address=ip_address,
                user_agent=user_agent,
                referrer=referrer,
                country_code=country_code,
                region=region,
                city=city,
                device_type=device_type,
                browser=browser,
                os=os,
                metadata=metadata,
                numeric_value=numeric_value,
                duration_ms=duration_ms,
                occurred_at=occurred_at,
            )

            logger.debug(
                "Recorded analytics event",
                extra={
                    "workspace_id": str(workspace_id),
                    "event_type": event_type_str,
                    "event_category": event_category_str,
                    "actor_type": actor_type_str,
                    "event_id": event.get("event_id"),
                },
            )

            return event

        except Exception as e:
            logger.error(
                "Failed to record analytics event",
                extra={
                    "workspace_id": str(workspace_id),
                    "event_type": event_type_str,
                    "error": str(e),
                },
            )
            raise AnalyticsError(f"Failed to record event: {e}")

    async def record_events_batch(
        self,
        workspace_id: UUID,
        events: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Record multiple analytics events in a single batch.

        More efficient than individual inserts for high-volume event tracking.
        Validates batch size and event data before recording.

        Args:
            workspace_id: Workspace for tenant isolation
            events: List of event dictionaries. Each should contain:
                - event_type: Type of event (required)
                - event_category: Category for grouping (required)
                - actor_type: Type of actor (required)
                - Plus optional fields matching record_event params

        Returns:
            List of result dictionaries indicating success for each event

        Raises:
            BatchSizeExceededError: If batch exceeds maximum size
            InvalidEventError: If any event has invalid data
            AnalyticsError: If batch recording fails
        """
        # Validate batch size
        if len(events) > ANALYTICS_MAX_BATCH_SIZE:
            raise BatchSizeExceededError(len(events))

        if not events:
            return []

        # Validate each event
        valid_event_types = {e.value for e in EventType}
        valid_categories = {c.value for c in EventCategory}
        valid_actor_types = {a.value for a in ActorType}

        validated_events = []
        for i, event in enumerate(events):
            # Check required fields
            if "event_type" not in event:
                raise InvalidEventError(f"Event {i}: missing required field 'event_type'")
            if "event_category" not in event:
                raise InvalidEventError(f"Event {i}: missing required field 'event_category'")
            if "actor_type" not in event:
                raise InvalidEventError(f"Event {i}: missing required field 'actor_type'")

            # Convert enums to strings
            event_type = event["event_type"]
            event_type_str = event_type.value if isinstance(event_type, EventType) else event_type
            event_category = event["event_category"]
            event_category_str = event_category.value if isinstance(event_category, EventCategory) else event_category
            actor_type = event["actor_type"]
            actor_type_str = actor_type.value if isinstance(actor_type, ActorType) else actor_type

            # Validate values
            if event_type_str not in valid_event_types:
                raise InvalidEventError(f"Event {i}: invalid event_type '{event_type_str}'")
            if event_category_str not in valid_categories:
                raise InvalidEventError(f"Event {i}: invalid event_category '{event_category_str}'")
            if actor_type_str not in valid_actor_types:
                raise InvalidEventError(f"Event {i}: invalid actor_type '{actor_type_str}'")

            # Build validated event
            validated_event = {
                **event,
                "event_type": event_type_str,
                "event_category": event_category_str,
                "actor_type": actor_type_str,
            }
            validated_events.append(validated_event)

        try:
            result = await self._repository.record_events_batch(
                workspace_id=workspace_id,
                events=validated_events,
            )

            logger.info(
                "Recorded batch of analytics events",
                extra={
                    "workspace_id": str(workspace_id),
                    "event_count": len(events),
                },
            )

            return result

        except Exception as e:
            logger.error(
                "Failed to record batch analytics events",
                extra={
                    "workspace_id": str(workspace_id),
                    "event_count": len(events),
                    "error": str(e),
                },
            )
            raise AnalyticsError(f"Failed to record batch events: {e}")

    # =========================================================================
    # Event Retrieval (Task T015)
    # =========================================================================

    async def get_event(
        self,
        workspace_id: UUID,
        event_id: UUID,
    ) -> dict[str, Any]:
        """Get a single analytics event by ID.

        Args:
            workspace_id: Workspace for tenant isolation
            event_id: Event to retrieve

        Returns:
            Event record as dictionary

        Raises:
            EventNotFoundError: If event doesn't exist
        """
        event = await self._repository.get_event_by_id(
            workspace_id=workspace_id,
            event_id=event_id,
        )

        if event is None:
            raise EventNotFoundError(event_id)

        return event

    async def get_events(
        self,
        workspace_id: UUID,
        *,
        event_types: Optional[list[EventType | str]] = None,
        event_categories: Optional[list[EventCategory | str]] = None,
        gallery_id: Optional[UUID] = None,
        client_id: Optional[UUID] = None,
        asset_id: Optional[UUID] = None,
        actor_type: Optional[ActorType | str] = None,
        session_id: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> dict[str, Any]:
        """Get analytics events with filtering and pagination.

        Args:
            workspace_id: Workspace for tenant isolation
            event_types: Filter by event types (optional)
            event_categories: Filter by event categories (optional)
            gallery_id: Filter by gallery (optional)
            client_id: Filter by client (optional)
            asset_id: Filter by asset (optional)
            actor_type: Filter by actor type (optional)
            session_id: Filter by session (optional)
            start_date: Start of date range (inclusive, optional)
            end_date: End of date range (inclusive, optional)
            limit: Maximum results (default 50, max 1000)
            offset: Pagination offset

        Returns:
            Paginated result with events and metadata

        Raises:
            InvalidDateRangeError: If start_date > end_date
        """
        # Validate date range
        if start_date and end_date and start_date > end_date:
            raise InvalidDateRangeError("Start date must be before end date")

        # Convert enums to string lists
        event_type_strs = None
        if event_types:
            event_type_strs = [
                et.value if isinstance(et, EventType) else et
                for et in event_types
            ]

        event_category_strs = None
        if event_categories:
            event_category_strs = [
                ec.value if isinstance(ec, EventCategory) else ec
                for ec in event_categories
            ]

        actor_type_str = None
        if actor_type:
            actor_type_str = actor_type.value if isinstance(actor_type, ActorType) else actor_type

        return await self._repository.get_events(
            workspace_id=workspace_id,
            event_types=event_type_strs,
            event_categories=event_category_strs,
            gallery_id=gallery_id,
            client_id=client_id,
            asset_id=asset_id,
            actor_type=actor_type_str,
            session_id=session_id,
            start_date=start_date,
            end_date=end_date,
            limit=limit,
            offset=offset,
        )

    async def get_recent_events(
        self,
        workspace_id: UUID,
        *,
        event_type: Optional[EventType | str] = None,
        gallery_id: Optional[UUID] = None,
        client_id: Optional[UUID] = None,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        """Get recent analytics events for quick dashboard display.

        Convenience method for retrieving the most recent events
        with minimal filtering options.

        Args:
            workspace_id: Workspace for tenant isolation
            event_type: Filter by event type (optional)
            gallery_id: Filter by gallery (optional)
            client_id: Filter by client (optional)
            limit: Maximum results (default 20, max 100)

        Returns:
            List of recent events
        """
        limit = min(max(1, limit), 100)

        event_type_str = None
        if event_type:
            event_type_str = event_type.value if isinstance(event_type, EventType) else event_type

        return await self._repository.get_recent_events(
            workspace_id=workspace_id,
            event_type=event_type_str,
            gallery_id=gallery_id,
            client_id=client_id,
            limit=limit,
        )

    async def count_events(
        self,
        workspace_id: UUID,
        *,
        event_type: Optional[EventType | str] = None,
        event_category: Optional[EventCategory | str] = None,
        gallery_id: Optional[UUID] = None,
        client_id: Optional[UUID] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> int:
        """Count events matching criteria.

        Args:
            workspace_id: Workspace for tenant isolation
            event_type: Filter by event type (optional)
            event_category: Filter by event category (optional)
            gallery_id: Filter by gallery (optional)
            client_id: Filter by client (optional)
            start_date: Start of date range (optional)
            end_date: End of date range (optional)

        Returns:
            Count of matching events

        Raises:
            InvalidDateRangeError: If start_date > end_date
        """
        if start_date and end_date and start_date > end_date:
            raise InvalidDateRangeError("Start date must be before end date")

        event_type_str = None
        if event_type:
            event_type_str = event_type.value if isinstance(event_type, EventType) else event_type

        event_category_str = None
        if event_category:
            event_category_str = event_category.value if isinstance(event_category, EventCategory) else event_category

        return await self._repository.count_events(
            workspace_id=workspace_id,
            event_type=event_type_str,
            event_category=event_category_str,
            gallery_id=gallery_id,
            client_id=client_id,
            start_date=start_date,
            end_date=end_date,
        )

    # =========================================================================
    # Convenience Methods for Common Events (Task T015)
    # =========================================================================

    async def record_gallery_view(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        *,
        actor_type: ActorType | str = ActorType.VISITOR,
        actor_id: Optional[UUID] = None,
        visitor_id: Optional[UUID] = None,
        client_id: Optional[UUID] = None,
        session_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        referrer: Optional[str] = None,
        country_code: Optional[str] = None,
        device_type: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Record a gallery view event.

        Convenience method for the common gallery view event.

        Args:
            workspace_id: Workspace for tenant isolation
            gallery_id: Gallery being viewed
            actor_type: Type of viewer (default: VISITOR)
            actor_id: ID of authenticated actor (optional)
            visitor_id: Visitor ID for anonymous users
            client_id: Client ID if viewing as a client
            session_id: Session identifier
            ip_address: Client IP address
            user_agent: Browser user agent
            referrer: HTTP referrer
            country_code: ISO country code
            device_type: Device type
            metadata: Additional event data

        Returns:
            Created event record
        """
        return await self.record_event(
            workspace_id=workspace_id,
            event_type=EventType.GALLERY_VIEW,
            event_category=EventCategory.GALLERY,
            actor_type=actor_type,
            gallery_id=gallery_id,
            actor_id=actor_id,
            visitor_id=visitor_id,
            client_id=client_id,
            session_id=session_id,
            ip_address=ip_address,
            user_agent=user_agent,
            referrer=referrer,
            country_code=country_code,
            device_type=device_type,
            metadata=metadata,
        )

    async def record_asset_download(
        self,
        workspace_id: UUID,
        asset_id: UUID,
        *,
        gallery_id: Optional[UUID] = None,
        actor_type: ActorType | str = ActorType.VISITOR,
        actor_id: Optional[UUID] = None,
        client_id: Optional[UUID] = None,
        visitor_id: Optional[UUID] = None,
        session_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        file_size: Optional[float] = None,
        download_format: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Record an asset download event.

        Convenience method for the common asset download event.

        Args:
            workspace_id: Workspace for tenant isolation
            asset_id: Asset being downloaded
            gallery_id: Gallery containing the asset (optional)
            actor_type: Type of downloader (default: VISITOR)
            actor_id: ID of authenticated actor (optional)
            client_id: Client ID if downloading as a client
            visitor_id: Visitor ID for anonymous users
            session_id: Session identifier
            ip_address: Client IP address
            file_size: Size of downloaded file in bytes
            download_format: Format of downloaded file (e.g., 'original', 'web')
            metadata: Additional event data

        Returns:
            Created event record
        """
        event_metadata = metadata or {}
        if download_format:
            event_metadata["download_format"] = download_format

        return await self.record_event(
            workspace_id=workspace_id,
            event_type=EventType.ASSET_DOWNLOAD,
            event_category=EventCategory.ASSET,
            actor_type=actor_type,
            asset_id=asset_id,
            gallery_id=gallery_id,
            actor_id=actor_id,
            client_id=client_id,
            visitor_id=visitor_id,
            session_id=session_id,
            ip_address=ip_address,
            numeric_value=file_size,
            metadata=event_metadata,
        )

    async def record_share_link_access(
        self,
        workspace_id: UUID,
        share_link_id: UUID,
        *,
        gallery_id: Optional[UUID] = None,
        visitor_id: Optional[UUID] = None,
        session_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        referrer: Optional[str] = None,
        country_code: Optional[str] = None,
        device_type: Optional[str] = None,
        gate_passed: Optional[bool] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Record a share link access event.

        Convenience method for tracking share link usage.

        Args:
            workspace_id: Workspace for tenant isolation
            share_link_id: Share link being accessed
            gallery_id: Gallery accessed via the link (optional)
            visitor_id: Visitor ID
            session_id: Session identifier
            ip_address: Client IP address
            user_agent: Browser user agent
            referrer: HTTP referrer
            country_code: ISO country code
            device_type: Device type
            gate_passed: Whether the access gate was passed
            metadata: Additional event data

        Returns:
            Created event record
        """
        event_metadata = metadata or {}
        if gate_passed is not None:
            event_metadata["gate_passed"] = gate_passed

        return await self.record_event(
            workspace_id=workspace_id,
            event_type=EventType.SHARE_LINK_ACCESSED,
            event_category=EventCategory.SHARE,
            actor_type=ActorType.VISITOR,
            share_link_id=share_link_id,
            gallery_id=gallery_id,
            visitor_id=visitor_id,
            session_id=session_id,
            ip_address=ip_address,
            user_agent=user_agent,
            referrer=referrer,
            country_code=country_code,
            device_type=device_type,
            metadata=event_metadata,
        )

    async def record_client_login(
        self,
        workspace_id: UUID,
        client_id: UUID,
        *,
        session_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        device_type: Optional[str] = None,
        login_method: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Record a client login event.

        Convenience method for tracking client portal logins.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client logging in
            session_id: Session identifier
            ip_address: Client IP address
            user_agent: Browser user agent
            device_type: Device type
            login_method: Login method used (e.g., 'magic_link', 'password')
            metadata: Additional event data

        Returns:
            Created event record
        """
        event_metadata = metadata or {}
        if login_method:
            event_metadata["login_method"] = login_method

        return await self.record_event(
            workspace_id=workspace_id,
            event_type=EventType.CLIENT_LOGIN,
            event_category=EventCategory.CLIENT,
            actor_type=ActorType.CLIENT,
            actor_id=client_id,
            client_id=client_id,
            session_id=session_id,
            ip_address=ip_address,
            user_agent=user_agent,
            device_type=device_type,
            metadata=event_metadata,
        )

    async def record_invitation_view(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        *,
        visitor_id: Optional[UUID] = None,
        session_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        referrer: Optional[str] = None,
        country_code: Optional[str] = None,
        device_type: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Record an invitation view event.

        Convenience method for tracking invitation page views.

        Args:
            workspace_id: Workspace for tenant isolation
            invitation_id: Invitation being viewed
            visitor_id: Visitor ID
            session_id: Session identifier
            ip_address: Client IP address
            user_agent: Browser user agent
            referrer: HTTP referrer
            country_code: ISO country code
            device_type: Device type
            metadata: Additional event data

        Returns:
            Created event record
        """
        return await self.record_event(
            workspace_id=workspace_id,
            event_type=EventType.INVITATION_VIEWED,
            event_category=EventCategory.INVITATION,
            actor_type=ActorType.VISITOR,
            invitation_id=invitation_id,
            visitor_id=visitor_id,
            session_id=session_id,
            ip_address=ip_address,
            user_agent=user_agent,
            referrer=referrer,
            country_code=country_code,
            device_type=device_type,
            metadata=metadata,
        )

    # =========================================================================
    # Client Analytics (Requirement 27.1)
    # =========================================================================

    async def get_client_analytics(
        self,
        workspace_id: UUID,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> dict:
        """Get client overview analytics.

        Args:
            workspace_id: Workspace for tenant isolation
            start_date: Start of date range (default: 30 days ago)
            end_date: End of date range (default: now)

        Returns:
            Analytics including totals, growth, and trends

        Raises:
            InvalidDateRangeError: If date range is invalid
        """
        # Set default date range
        now = datetime.now(timezone.utc)
        if not end_date:
            end_date = now
        if not start_date:
            start_date = end_date - timedelta(days=30)

        if start_date > end_date:
            raise InvalidDateRangeError("Start date must be before end date")

        # Calculate previous period for comparison
        period_days = (end_date - start_date).days
        prev_start = start_date - timedelta(days=period_days)
        prev_end = start_date

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Total clients
            total_clients = await conn.fetchval(
                "SELECT COUNT(*) FROM clients WHERE workspace_id = $1",
                workspace_id,
            )

            # Active clients (status = 'active')
            active_clients = await conn.fetchval(
                "SELECT COUNT(*) FROM clients WHERE workspace_id = $1 AND status = 'active'",
                workspace_id,
            )

            # New clients in period
            new_clients = await conn.fetchval(
                """
                SELECT COUNT(*) FROM clients
                WHERE workspace_id = $1 AND created_at >= $2 AND created_at <= $3
                """,
                workspace_id,
                start_date,
                end_date,
            )

            # New clients in previous period
            prev_new_clients = await conn.fetchval(
                """
                SELECT COUNT(*) FROM clients
                WHERE workspace_id = $1 AND created_at >= $2 AND created_at < $3
                """,
                workspace_id,
                prev_start,
                prev_end,
            )

            # Calculate growth rate
            growth_rate = 0.0
            if prev_new_clients and prev_new_clients > 0:
                growth_rate = ((new_clients - prev_new_clients) / prev_new_clients) * 100

            # Clients by status
            status_counts = await conn.fetch(
                """
                SELECT status, COUNT(*) as count
                FROM clients
                WHERE workspace_id = $1
                GROUP BY status
                """,
                workspace_id,
            )
            clients_by_status = {row["status"] or "unknown": row["count"] for row in status_counts}

            # Clients with galleries
            clients_with_galleries = await conn.fetchval(
                """
                SELECT COUNT(DISTINCT cgl.client_id)
                FROM client_gallery_links cgl
                JOIN galleries g ON cgl.gallery_id = g.gallery_id
                WHERE cgl.workspace_id = $1 AND g.deleted = FALSE
                """,
                workspace_id,
            )

            # Clients with recent activity (last 30 days)
            recently_active = await conn.fetchval(
                """
                SELECT COUNT(DISTINCT client_id)
                FROM client_activities
                WHERE workspace_id = $1 AND created_at >= $2
                """,
                workspace_id,
                now - timedelta(days=30),
            )

            # Monthly trend (last 6 months)
            monthly_trend = await conn.fetch(
                """
                SELECT
                    DATE_TRUNC('month', created_at) as month,
                    COUNT(*) as count
                FROM clients
                WHERE workspace_id = $1
                AND created_at >= $2
                GROUP BY DATE_TRUNC('month', created_at)
                ORDER BY month ASC
                """,
                workspace_id,
                now - timedelta(days=180),
            )
            trend_data = [
                {
                    "month": row["month"].strftime("%Y-%m"),
                    "count": row["count"],
                }
                for row in monthly_trend
            ]

            return {
                "summary": {
                    "total_clients": total_clients or 0,
                    "active_clients": active_clients or 0,
                    "inactive_clients": (total_clients or 0) - (active_clients or 0),
                    "new_clients_period": new_clients or 0,
                    "growth_rate_percent": round(growth_rate, 2),
                    "clients_with_galleries": clients_with_galleries or 0,
                    "recently_active": recently_active or 0,
                },
                "clients_by_status": clients_by_status,
                "monthly_trend": trend_data,
                "period": {
                    "start": start_date.isoformat(),
                    "end": end_date.isoformat(),
                    "days": period_days,
                },
            }

    # =========================================================================
    # Engagement Metrics (Requirement 27.3)
    # =========================================================================

    async def get_engagement_metrics(
        self,
        workspace_id: UUID,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> dict:
        """Get client engagement metrics.

        Args:
            workspace_id: Workspace for tenant isolation
            start_date: Start of date range (default: 30 days ago)
            end_date: End of date range (default: now)

        Returns:
            Engagement metrics including activity counts and averages
        """
        now = datetime.now(timezone.utc)
        if not end_date:
            end_date = now
        if not start_date:
            start_date = end_date - timedelta(days=30)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Activity counts by type
            activity_counts = await conn.fetch(
                """
                SELECT activity_type, COUNT(*) as count
                FROM client_activities
                WHERE workspace_id = $1
                AND created_at >= $2 AND created_at <= $3
                GROUP BY activity_type
                ORDER BY count DESC
                """,
                workspace_id,
                start_date,
                end_date,
            )
            activities_by_type = {row["activity_type"] or "unknown": row["count"] for row in activity_counts}

            # Communication counts by type
            comm_counts = await conn.fetch(
                """
                SELECT communication_type, direction, COUNT(*) as count
                FROM client_communications
                WHERE workspace_id = $1
                AND created_at >= $2 AND created_at <= $3
                GROUP BY communication_type, direction
                """,
                workspace_id,
                start_date,
                end_date,
            )
            communications_by_type = {}
            for row in comm_counts:
                key = f"{row['communication_type'] or 'unknown'}_{row['direction'] or 'unknown'}"
                communications_by_type[key] = row["count"]

            # Total communications
            total_communications = sum(communications_by_type.values())

            # Average communications per client
            clients_with_comms = await conn.fetchval(
                """
                SELECT COUNT(DISTINCT client_id)
                FROM client_communications
                WHERE workspace_id = $1
                AND created_at >= $2 AND created_at <= $3
                """,
                workspace_id,
                start_date,
                end_date,
            )
            avg_comms_per_client = 0.0
            if clients_with_comms and clients_with_comms > 0:
                avg_comms_per_client = total_communications / clients_with_comms

            # Gallery engagement
            gallery_links_created = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM client_gallery_links
                WHERE workspace_id = $1
                AND created_at >= $2 AND created_at <= $3
                """,
                workspace_id,
                start_date,
                end_date,
            )

            # Follow-up completion rate
            follow_ups_created = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM client_communications
                WHERE workspace_id = $1
                AND follow_up_required = TRUE
                AND created_at >= $2 AND created_at <= $3
                """,
                workspace_id,
                start_date,
                end_date,
            )

            follow_ups_completed = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM client_communications
                WHERE workspace_id = $1
                AND follow_up_required = TRUE
                AND follow_up_completed = TRUE
                AND created_at >= $2 AND created_at <= $3
                """,
                workspace_id,
                start_date,
                end_date,
            ) or 0

            follow_up_rate = 0.0
            if follow_ups_created and follow_ups_created > 0:
                follow_up_rate = (follow_ups_completed / follow_ups_created) * 100

            # Average response time (time between inbound and outbound comms)
            response_times = await conn.fetch(
                """
                WITH comm_pairs AS (
                    SELECT
                        c1.client_id,
                        c1.created_at as inbound_time,
                        (
                            SELECT MIN(c2.created_at)
                            FROM client_communications c2
                            WHERE c2.client_id = c1.client_id
                            AND c2.workspace_id = c1.workspace_id
                            AND c2.direction = 'outbound'
                            AND c2.created_at > c1.created_at
                        ) as outbound_time
                    FROM client_communications c1
                    WHERE c1.workspace_id = $1
                    AND c1.direction = 'inbound'
                    AND c1.created_at >= $2 AND c1.created_at <= $3
                )
                SELECT AVG(EXTRACT(EPOCH FROM (outbound_time - inbound_time))) as avg_seconds
                FROM comm_pairs
                WHERE outbound_time IS NOT NULL
                """,
                workspace_id,
                start_date,
                end_date,
            )
            avg_response_seconds = response_times[0]["avg_seconds"] if response_times else None
            avg_response_hours = round(avg_response_seconds / 3600, 1) if avg_response_seconds else None

            return {
                "summary": {
                    "total_activities": sum(activities_by_type.values()),
                    "total_communications": total_communications,
                    "avg_communications_per_client": round(avg_comms_per_client, 2),
                    "gallery_links_created": gallery_links_created or 0,
                    "follow_up_completion_rate": round(follow_up_rate, 2),
                    "avg_response_time_hours": avg_response_hours,
                },
                "activities_by_type": activities_by_type,
                "communications_by_type": communications_by_type,
                "period": {
                    "start": start_date.isoformat(),
                    "end": end_date.isoformat(),
                },
            }

    # =========================================================================
    # Referral Analytics (Requirement 27.2)
    # =========================================================================

    async def get_referral_analytics(
        self,
        workspace_id: UUID,
    ) -> dict:
        """Get referral source analytics.

        Args:
            workspace_id: Workspace for tenant isolation

        Returns:
            Referral metrics including top referrers and conversion rates
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Total clients with referrals
            total_referred = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM clients
                WHERE workspace_id = $1 AND referred_by_client_id IS NOT NULL
                """,
                workspace_id,
            )

            # Total clients
            total_clients = await conn.fetchval(
                "SELECT COUNT(*) FROM clients WHERE workspace_id = $1",
                workspace_id,
            )

            # Referral rate
            referral_rate = 0.0
            if total_clients and total_clients > 0:
                referral_rate = (total_referred / total_clients) * 100

            # Top referrers
            top_referrers = await conn.fetch(
                """
                SELECT
                    c.client_id,
                    c.full_name,
                    c.first_name,
                    c.last_name,
                    COUNT(r.client_id) as referral_count
                FROM clients c
                LEFT JOIN clients r ON r.referred_by_client_id = c.client_id AND r.workspace_id = c.workspace_id
                WHERE c.workspace_id = $1
                AND r.client_id IS NOT NULL
                GROUP BY c.client_id, c.full_name, c.first_name, c.last_name
                HAVING COUNT(r.client_id) > 0
                ORDER BY referral_count DESC
                LIMIT 10
                """,
                workspace_id,
            )

            # Clients who have made referrals
            clients_who_refer = await conn.fetchval(
                """
                SELECT COUNT(DISTINCT referred_by_client_id)
                FROM clients
                WHERE workspace_id = $1 AND referred_by_client_id IS NOT NULL
                """,
                workspace_id,
            )

            # Average referrals per referrer
            avg_referrals = 0.0
            if clients_who_refer and clients_who_refer > 0:
                avg_referrals = total_referred / clients_who_refer

            # Referral trend (last 6 months)
            referral_trend = await conn.fetch(
                """
                SELECT
                    DATE_TRUNC('month', created_at) as month,
                    COUNT(*) as count
                FROM clients
                WHERE workspace_id = $1
                AND referred_by_client_id IS NOT NULL
                AND created_at >= NOW() - INTERVAL '180 days'
                GROUP BY DATE_TRUNC('month', created_at)
                ORDER BY month ASC
                """,
                workspace_id,
            )
            trend_data = [
                {
                    "month": row["month"].strftime("%Y-%m"),
                    "count": row["count"],
                }
                for row in referral_trend
            ]

            return {
                "summary": {
                    "total_referred_clients": total_referred or 0,
                    "referral_rate_percent": round(referral_rate, 2),
                    "clients_who_refer": clients_who_refer or 0,
                    "avg_referrals_per_referrer": round(avg_referrals, 2),
                },
                "top_referrers": [
                    {
                        "client_id": str(r["client_id"]),
                        "full_name": r["full_name"],
                        "referral_count": r["referral_count"],
                    }
                    for r in top_referrers
                ],
                "monthly_trend": trend_data,
            }

    # =========================================================================
    # Revenue Per Client (Requirement 27.4)
    # =========================================================================

    async def get_revenue_per_client(
        self,
        workspace_id: UUID,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> dict:
        """Get revenue metrics per client.

        Note: This requires integration with payment/invoice system.
        Currently returns placeholder data structure.

        Args:
            workspace_id: Workspace for tenant isolation
            start_date: Start of date range
            end_date: End of date range

        Returns:
            Revenue metrics (structure for future implementation)
        """
        now = datetime.now(timezone.utc)
        if not end_date:
            end_date = now
        if not start_date:
            start_date = end_date - timedelta(days=365)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Get client counts for value estimation
            total_clients = await conn.fetchval(
                "SELECT COUNT(*) FROM clients WHERE workspace_id = $1",
                workspace_id,
            )

            # Clients with multiple galleries (higher value)
            high_value_clients = await conn.fetchval(
                """
                SELECT COUNT(DISTINCT cgl.client_id)
                FROM client_gallery_links cgl
                JOIN galleries g ON cgl.gallery_id = g.gallery_id
                WHERE cgl.workspace_id = $1
                AND g.deleted = FALSE
                GROUP BY cgl.client_id
                HAVING COUNT(*) >= 2
                """,
                workspace_id,
            ) or 0

            # Returning clients (linked to multiple galleries over time)
            returning_clients = await conn.fetchval(
                """
                SELECT COUNT(DISTINCT client_id)
                FROM (
                    SELECT
                        cgl.client_id,
                        COUNT(DISTINCT DATE_TRUNC('year', g.created_at)) as years
                    FROM client_gallery_links cgl
                    JOIN galleries g ON cgl.gallery_id = g.gallery_id
                    WHERE cgl.workspace_id = $1
                    AND g.deleted = FALSE
                    GROUP BY cgl.client_id
                    HAVING COUNT(DISTINCT DATE_TRUNC('year', g.created_at)) >= 2
                ) subq
                """,
                workspace_id,
            )

            # Top clients by gallery count
            top_clients = await conn.fetch(
                """
                SELECT
                    c.client_id,
                    c.full_name,
                    COUNT(DISTINCT cgl.gallery_id) as gallery_count,
                    MIN(cgl.created_at) as first_gallery_date
                FROM clients c
                JOIN client_gallery_links cgl ON c.client_id = cgl.client_id AND c.workspace_id = cgl.workspace_id
                JOIN galleries g ON cgl.gallery_id = g.gallery_id
                WHERE c.workspace_id = $1
                AND g.deleted = FALSE
                GROUP BY c.client_id, c.full_name
                ORDER BY gallery_count DESC
                LIMIT 10
                """,
                workspace_id,
            )

            return {
                "summary": {
                    "total_clients": total_clients or 0,
                    "high_value_clients": high_value_clients,
                    "returning_clients": returning_clients or 0,
                    "note": "Revenue data requires integration with payment system",
                },
                "top_clients_by_galleries": [
                    {
                        "client_id": str(c["client_id"]),
                        "full_name": c["full_name"],
                        "gallery_count": c["gallery_count"],
                        "first_gallery_date": c["first_gallery_date"].isoformat() if c["first_gallery_date"] else None,
                    }
                    for c in top_clients
                ],
                "period": {
                    "start": start_date.isoformat(),
                    "end": end_date.isoformat(),
                },
            }

    # =========================================================================
    # Combined Dashboard Analytics
    # =========================================================================

    async def get_dashboard_analytics(
        self,
        workspace_id: UUID,
    ) -> dict:
        """Get combined dashboard analytics for the CRM.

        Args:
            workspace_id: Workspace for tenant isolation

        Returns:
            Combined analytics for dashboard display
        """
        now = datetime.now(timezone.utc)
        thirty_days_ago = now - timedelta(days=30)

        # Get all analytics in parallel (using sequential calls for safety)
        client_analytics = await self.get_client_analytics(
            workspace_id=workspace_id,
            start_date=thirty_days_ago,
            end_date=now,
        )

        engagement = await self.get_engagement_metrics(
            workspace_id=workspace_id,
            start_date=thirty_days_ago,
            end_date=now,
        )

        referrals = await self.get_referral_analytics(workspace_id=workspace_id)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Upcoming follow-ups
            upcoming_followups = await conn.fetch(
                """
                SELECT
                    cc.communication_id,
                    cc.client_id,
                    c.full_name,
                    cc.subject,
                    cc.follow_up_date
                FROM client_communications cc
                JOIN clients c ON cc.client_id = c.client_id AND cc.workspace_id = c.workspace_id
                WHERE cc.workspace_id = $1
                AND cc.follow_up_required = TRUE
                AND (cc.follow_up_completed IS NULL OR cc.follow_up_completed = FALSE)
                AND cc.follow_up_date >= NOW()
                AND cc.follow_up_date <= NOW() + INTERVAL '7 days'
                ORDER BY cc.follow_up_date ASC
                LIMIT 5
                """,
                workspace_id,
            )

            # Recent clients
            recent_clients = await conn.fetch(
                """
                SELECT client_id, full_name, created_at
                FROM clients
                WHERE workspace_id = $1
                ORDER BY created_at DESC
                LIMIT 5
                """,
                workspace_id,
            )

            # Recent activity
            recent_activity = await conn.fetch(
                """
                SELECT
                    ca.activity_id,
                    ca.client_id,
                    c.full_name as client_name,
                    ca.activity_type,
                    ca.description,
                    ca.created_at
                FROM client_activities ca
                JOIN clients c ON ca.client_id = c.client_id AND ca.workspace_id = c.workspace_id
                WHERE ca.workspace_id = $1
                ORDER BY ca.created_at DESC
                LIMIT 10
                """,
                workspace_id,
            )

        return {
            "overview": client_analytics["summary"],
            "engagement": engagement["summary"],
            "referrals": referrals["summary"],
            "upcoming_followups": [
                {
                    "communication_id": str(f["communication_id"]),
                    "client_id": str(f["client_id"]),
                    "client_name": f["full_name"],
                    "subject": f["subject"],
                    "follow_up_date": f["follow_up_date"].isoformat() if f["follow_up_date"] else None,
                }
                for f in upcoming_followups
            ],
            "recent_clients": [
                {
                    "client_id": str(c["client_id"]),
                    "full_name": c["full_name"],
                    "created_at": c["created_at"].isoformat() if c["created_at"] else None,
                }
                for c in recent_clients
            ],
            "recent_activity": [
                {
                    "activity_id": str(a["activity_id"]),
                    "client_id": str(a["client_id"]),
                    "client_name": a["client_name"],
                    "activity_type": a["activity_type"],
                    "description": a["description"],
                    "created_at": a["created_at"].isoformat() if a["created_at"] else None,
                }
                for a in recent_activity
            ],
            "monthly_trend": client_analytics["monthly_trend"],
            "generated_at": now.isoformat(),
        }

    # =========================================================================
    # Dashboard Metrics Aggregation (Task T016)
    # =========================================================================

    async def get_dashboard_metrics(
        self,
        workspace_id: UUID,
        *,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> dict[str, Any]:
        """Get aggregated dashboard metrics for the analytics dashboard.

        Provides comprehensive overview metrics for the workspace including:
        - Total galleries, total assets, storage used
        - Active clients count
        - Views, downloads, new clients for the selected period
        - Period-over-period comparison for trends

        This is the primary entry point for the analytics dashboard page.

        Args:
            workspace_id: Workspace for tenant isolation
            start_date: Start of date range (default: 30 days ago)
            end_date: End of date range (default: now)

        Returns:
            Comprehensive dashboard metrics including:
            - overview: Total counts (galleries, assets, storage, clients)
            - quick_stats: Period metrics (views, downloads, new_clients)
            - trends: Period-over-period changes
            - top_galleries: Top performing galleries
            - recent_events: Recent activity events
            - device_breakdown: Views by device type
            - geographic_breakdown: Views by country

        Raises:
            InvalidDateRangeError: If start_date > end_date
        """
        now = datetime.now(timezone.utc)
        if not end_date:
            end_date = now
        if not start_date:
            start_date = end_date - timedelta(days=30)

        if start_date > end_date:
            raise InvalidDateRangeError("Start date must be before end date")

        # Calculate previous period for comparison
        period_days = (end_date - start_date).days
        prev_start = start_date - timedelta(days=period_days)
        prev_end = start_date

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # =========================================================
            # Overview Metrics (totals across workspace)
            # =========================================================

            # Total galleries (active only)
            total_galleries = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM galleries
                WHERE workspace_id = $1 AND deleted = FALSE
                """,
                workspace_id,
            )

            # Total assets (available assets in active galleries)
            total_assets = await conn.fetchval(
                """
                SELECT COUNT(DISTINCT a.asset_id)
                FROM gallery_assets ga
                JOIN assets a ON ga.asset_id = a.asset_id
                JOIN galleries g ON ga.gallery_id = g.gallery_id
                WHERE ga.workspace_id = $1
                AND ga.visible = TRUE
                AND a.deleted = FALSE
                AND a.status = 'available'
                AND g.deleted = FALSE
                """,
                workspace_id,
            )

            # Storage used (sum of asset file sizes in bytes)
            storage_bytes = await conn.fetchval(
                """
                SELECT COALESCE(SUM(a.original_bytes), 0)
                FROM assets a
                WHERE a.workspace_id = $1
                AND a.deleted = FALSE
                AND a.status = 'available'
                """,
                workspace_id,
            )

            # Active clients (status = 'active')
            active_clients = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM clients
                WHERE workspace_id = $1 AND status = 'active'
                """,
                workspace_id,
            )

            # Total clients
            total_clients = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM clients
                WHERE workspace_id = $1
                """,
                workspace_id,
            )

            # =========================================================
            # Quick Stats for Selected Period
            # =========================================================

            # Total views in period (gallery_view events)
            period_views = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM analytics_events
                WHERE workspace_id = $1
                AND event_type = 'gallery_view'
                AND occurred_at >= $2
                AND occurred_at <= $3
                """,
                workspace_id,
                start_date,
                end_date,
            )

            # Total downloads in period
            period_downloads = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM analytics_events
                WHERE workspace_id = $1
                AND event_type IN ('asset_download', 'gallery_download', 'bulk_download_completed')
                AND occurred_at >= $2
                AND occurred_at <= $3
                """,
                workspace_id,
                start_date,
                end_date,
            )

            # New clients in period
            new_clients = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM clients
                WHERE workspace_id = $1
                AND created_at >= $2
                AND created_at <= $3
                """,
                workspace_id,
                start_date,
                end_date,
            )

            # Unique visitors in period
            unique_visitors = await conn.fetchval(
                """
                SELECT COUNT(DISTINCT COALESCE(client_id::text, visitor_id::text, ip_address::text))
                FROM analytics_events
                WHERE workspace_id = $1
                AND event_type = 'gallery_view'
                AND occurred_at >= $2
                AND occurred_at <= $3
                """,
                workspace_id,
                start_date,
                end_date,
            )

            # =========================================================
            # Previous Period Stats (for trend comparison)
            # =========================================================

            prev_views = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM analytics_events
                WHERE workspace_id = $1
                AND event_type = 'gallery_view'
                AND occurred_at >= $2
                AND occurred_at < $3
                """,
                workspace_id,
                prev_start,
                prev_end,
            )

            prev_downloads = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM analytics_events
                WHERE workspace_id = $1
                AND event_type IN ('asset_download', 'gallery_download', 'bulk_download_completed')
                AND occurred_at >= $2
                AND occurred_at < $3
                """,
                workspace_id,
                prev_start,
                prev_end,
            )

            prev_new_clients = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM clients
                WHERE workspace_id = $1
                AND created_at >= $2
                AND created_at < $3
                """,
                workspace_id,
                prev_start,
                prev_end,
            )

            prev_unique_visitors = await conn.fetchval(
                """
                SELECT COUNT(DISTINCT COALESCE(client_id::text, visitor_id::text, ip_address::text))
                FROM analytics_events
                WHERE workspace_id = $1
                AND event_type = 'gallery_view'
                AND occurred_at >= $2
                AND occurred_at < $3
                """,
                workspace_id,
                prev_start,
                prev_end,
            )

            # =========================================================
            # Top Performing Galleries
            # =========================================================

            top_galleries = await conn.fetch(
                """
                SELECT
                    g.gallery_id,
                    g.name as gallery_name,
                    g.client_name,
                    COUNT(*) FILTER (WHERE ae.event_type = 'gallery_view') as views,
                    COUNT(DISTINCT COALESCE(ae.client_id::text, ae.visitor_id::text, ae.ip_address::text))
                        FILTER (WHERE ae.event_type = 'gallery_view') as unique_visitors,
                    COUNT(*) FILTER (WHERE ae.event_type IN ('asset_download', 'gallery_download', 'bulk_download_completed'))
                        as downloads,
                    COUNT(*) FILTER (WHERE ae.event_type = 'asset_favorite') as favorites
                FROM galleries g
                LEFT JOIN analytics_events ae ON g.gallery_id = ae.gallery_id
                    AND ae.workspace_id = g.workspace_id
                    AND ae.occurred_at >= $2
                    AND ae.occurred_at <= $3
                WHERE g.workspace_id = $1
                AND g.deleted = FALSE
                GROUP BY g.gallery_id, g.name, g.client_name
                ORDER BY views DESC NULLS LAST
                LIMIT 10
                """,
                workspace_id,
                start_date,
                end_date,
            )

            # =========================================================
            # Recent Events
            # =========================================================

            recent_events = await conn.fetch(
                """
                SELECT
                    ae.event_id,
                    ae.event_type,
                    ae.event_category,
                    ae.gallery_id,
                    g.name as gallery_name,
                    ae.client_id,
                    c.full_name as client_name,
                    ae.occurred_at
                FROM analytics_events ae
                LEFT JOIN galleries g ON ae.gallery_id = g.gallery_id AND ae.workspace_id = g.workspace_id
                LEFT JOIN clients c ON ae.client_id = c.client_id AND ae.workspace_id = c.workspace_id
                WHERE ae.workspace_id = $1
                ORDER BY ae.occurred_at DESC
                LIMIT 20
                """,
                workspace_id,
            )

            # =========================================================
            # Device Breakdown
            # =========================================================

            device_breakdown = await conn.fetch(
                """
                WITH device_counts AS (
                    SELECT
                        COALESCE(device_type, 'other') as device_type,
                        COUNT(*) as count
                    FROM analytics_events
                    WHERE workspace_id = $1
                    AND event_type = 'gallery_view'
                    AND occurred_at >= $2
                    AND occurred_at <= $3
                    GROUP BY device_type
                ),
                total AS (
                    SELECT COALESCE(SUM(count), 0) as total_count FROM device_counts
                )
                SELECT
                    dc.device_type,
                    dc.count,
                    CASE
                        WHEN t.total_count > 0
                        THEN ROUND((dc.count::numeric / t.total_count) * 100, 2)
                        ELSE 0
                    END as percentage
                FROM device_counts dc, total t
                ORDER BY dc.count DESC
                """,
                workspace_id,
                start_date,
                end_date,
            )

            # =========================================================
            # Geographic Breakdown (Top 10 Countries)
            # =========================================================

            geographic_breakdown = await conn.fetch(
                """
                WITH country_counts AS (
                    SELECT
                        country_code,
                        COUNT(*) as count
                    FROM analytics_events
                    WHERE workspace_id = $1
                    AND event_type = 'gallery_view'
                    AND occurred_at >= $2
                    AND occurred_at <= $3
                    AND country_code IS NOT NULL
                    GROUP BY country_code
                ),
                total AS (
                    SELECT COALESCE(SUM(count), 0) as total_count FROM country_counts
                )
                SELECT
                    cc.country_code,
                    cc.count,
                    CASE
                        WHEN t.total_count > 0
                        THEN ROUND((cc.count::numeric / t.total_count) * 100, 2)
                        ELSE 0
                    END as percentage
                FROM country_counts cc, total t
                ORDER BY cc.count DESC
                LIMIT 10
                """,
                workspace_id,
                start_date,
                end_date,
            )

            # =========================================================
            # Daily Views Trend (for chart)
            # =========================================================

            daily_views = await conn.fetch(
                """
                SELECT
                    DATE(occurred_at) as date,
                    COUNT(*) as views,
                    COUNT(DISTINCT COALESCE(client_id::text, visitor_id::text, ip_address::text))
                        as unique_visitors
                FROM analytics_events
                WHERE workspace_id = $1
                AND event_type = 'gallery_view'
                AND occurred_at >= $2
                AND occurred_at <= $3
                GROUP BY DATE(occurred_at)
                ORDER BY date ASC
                """,
                workspace_id,
                start_date,
                end_date,
            )

        # Calculate trend percentages
        def calc_trend(current: int, previous: int) -> Optional[float]:
            """Calculate percentage change between periods."""
            if previous == 0:
                return 100.0 if current > 0 else 0.0
            return round(((current - previous) / previous) * 100, 2)

        period_views = period_views or 0
        period_downloads = period_downloads or 0
        new_clients = new_clients or 0
        unique_visitors = unique_visitors or 0
        prev_views = prev_views or 0
        prev_downloads = prev_downloads or 0
        prev_new_clients = prev_new_clients or 0
        prev_unique_visitors = prev_unique_visitors or 0

        return {
            "overview": {
                "total_galleries": total_galleries or 0,
                "total_assets": total_assets or 0,
                "storage_used_bytes": storage_bytes or 0,
                "storage_used_formatted": self._format_bytes(storage_bytes or 0),
                "total_clients": total_clients or 0,
                "active_clients": active_clients or 0,
            },
            "quick_stats": {
                "views": period_views,
                "downloads": period_downloads,
                "new_clients": new_clients,
                "unique_visitors": unique_visitors,
            },
            "trends": {
                "views_trend": calc_trend(period_views, prev_views),
                "downloads_trend": calc_trend(period_downloads, prev_downloads),
                "new_clients_trend": calc_trend(new_clients, prev_new_clients),
                "unique_visitors_trend": calc_trend(unique_visitors, prev_unique_visitors),
                "previous_period": {
                    "views": prev_views,
                    "downloads": prev_downloads,
                    "new_clients": prev_new_clients,
                    "unique_visitors": prev_unique_visitors,
                },
            },
            "top_galleries": [
                {
                    "gallery_id": str(g["gallery_id"]),
                    "gallery_name": g["gallery_name"],
                    "client_name": g["client_name"],
                    "views": g["views"] or 0,
                    "unique_visitors": g["unique_visitors"] or 0,
                    "downloads": g["downloads"] or 0,
                    "favorites": g["favorites"] or 0,
                }
                for g in top_galleries
            ],
            "recent_events": [
                {
                    "event_id": str(e["event_id"]),
                    "event_type": e["event_type"],
                    "event_category": e["event_category"],
                    "gallery_id": str(e["gallery_id"]) if e["gallery_id"] else None,
                    "gallery_name": e["gallery_name"],
                    "client_id": str(e["client_id"]) if e["client_id"] else None,
                    "client_name": e["client_name"],
                    "occurred_at": e["occurred_at"].isoformat() if e["occurred_at"] else None,
                }
                for e in recent_events
            ],
            "device_breakdown": [
                {
                    "device_type": d["device_type"],
                    "count": d["count"],
                    "percentage": float(d["percentage"]) if d["percentage"] else 0.0,
                }
                for d in device_breakdown
            ],
            "geographic_breakdown": [
                {
                    "country_code": g["country_code"],
                    "count": g["count"],
                    "percentage": float(g["percentage"]) if g["percentage"] else 0.0,
                }
                for g in geographic_breakdown
            ],
            "daily_views": [
                {
                    "date": d["date"].isoformat(),
                    "views": d["views"],
                    "unique_visitors": d["unique_visitors"],
                }
                for d in daily_views
            ],
            "period": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
                "days": period_days,
            },
            "generated_at": now.isoformat(),
        }

    @staticmethod
    def _format_bytes(size_bytes: int) -> str:
        """Format bytes into human-readable string.

        Args:
            size_bytes: Size in bytes

        Returns:
            Formatted string (e.g., "1.5 GB", "256 MB")
        """
        if size_bytes == 0:
            return "0 B"

        units = ["B", "KB", "MB", "GB", "TB", "PB"]
        unit_index = 0
        size = float(size_bytes)

        while size >= 1024 and unit_index < len(units) - 1:
            size /= 1024
            unit_index += 1

        return f"{size:.1f} {units[unit_index]}"

    async def get_quick_stats(
        self,
        workspace_id: UUID,
        *,
        period: str = "30d",
    ) -> dict[str, Any]:
        """Get quick stats for a predefined period.

        Convenience method for common period queries.

        Args:
            workspace_id: Workspace for tenant isolation
            period: Period shorthand:
                - "7d": Last 7 days
                - "30d": Last 30 days (default)
                - "90d": Last 90 days
                - "1y": Last year
                - "all": All time

        Returns:
            Quick stats for the selected period

        Raises:
            InvalidDateRangeError: If period is invalid
        """
        now = datetime.now(timezone.utc)

        period_map = {
            "7d": timedelta(days=7),
            "30d": timedelta(days=30),
            "90d": timedelta(days=90),
            "1y": timedelta(days=365),
        }

        if period == "all":
            # Get earliest event or client for all-time
            pool = await get_postgres_pool()
            async with pool.acquire() as conn:
                earliest = await conn.fetchval(
                    """
                    SELECT MIN(occurred_at)
                    FROM analytics_events
                    WHERE workspace_id = $1
                    """,
                    workspace_id,
                )
            start_date = earliest or (now - timedelta(days=365))
        elif period in period_map:
            start_date = now - period_map[period]
        else:
            raise InvalidDateRangeError(f"Invalid period: {period}. Use 7d, 30d, 90d, 1y, or all.")

        metrics = await self.get_dashboard_metrics(
            workspace_id=workspace_id,
            start_date=start_date,
            end_date=now,
        )

        return {
            "period": period,
            "period_label": self._get_period_label(period),
            "quick_stats": metrics["quick_stats"],
            "trends": metrics["trends"],
            "generated_at": now.isoformat(),
        }

    @staticmethod
    def _get_period_label(period: str) -> str:
        """Get human-readable label for period shorthand.

        Args:
            period: Period shorthand (7d, 30d, etc.)

        Returns:
            Human-readable label
        """
        labels = {
            "7d": "Last 7 days",
            "30d": "Last 30 days",
            "90d": "Last 90 days",
            "1y": "Last year",
            "all": "All time",
        }
        return labels.get(period, period)

    async def get_workspace_overview(
        self,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Get workspace overview metrics without date filtering.

        Provides total counts that don't change based on date range.
        Useful for persistent dashboard headers.

        Args:
            workspace_id: Workspace for tenant isolation

        Returns:
            Workspace overview metrics
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Total galleries (active only)
            total_galleries = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM galleries
                WHERE workspace_id = $1 AND deleted = FALSE
                """,
                workspace_id,
            )

            # Total assets
            total_assets = await conn.fetchval(
                """
                SELECT COUNT(DISTINCT a.asset_id)
                FROM gallery_assets ga
                JOIN assets a ON ga.asset_id = a.asset_id
                JOIN galleries g ON ga.gallery_id = g.gallery_id
                WHERE ga.workspace_id = $1
                AND ga.visible = TRUE
                AND a.deleted = FALSE
                AND a.status = 'available'
                AND g.deleted = FALSE
                """,
                workspace_id,
            )

            # Storage used
            storage_bytes = await conn.fetchval(
                """
                SELECT COALESCE(SUM(a.original_bytes), 0)
                FROM assets a
                WHERE a.workspace_id = $1
                AND a.deleted = FALSE
                AND a.status = 'available'
                """,
                workspace_id,
            )

            # Total clients
            total_clients = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM clients
                WHERE workspace_id = $1
                """,
                workspace_id,
            )

            # Active clients
            active_clients = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM clients
                WHERE workspace_id = $1 AND status = 'active'
                """,
                workspace_id,
            )

            # Total all-time views
            total_views = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM analytics_events
                WHERE workspace_id = $1
                AND event_type = 'gallery_view'
                """,
                workspace_id,
            )

            # Total all-time downloads
            total_downloads = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM analytics_events
                WHERE workspace_id = $1
                AND event_type IN ('asset_download', 'gallery_download', 'bulk_download_completed')
                """,
                workspace_id,
            )

        return {
            "total_galleries": total_galleries or 0,
            "total_assets": total_assets or 0,
            "storage_used_bytes": storage_bytes or 0,
            "storage_used_formatted": self._format_bytes(storage_bytes or 0),
            "total_clients": total_clients or 0,
            "active_clients": active_clients or 0,
            "total_views": total_views or 0,
            "total_downloads": total_downloads or 0,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    async def get_activity_feed(
        self,
        workspace_id: UUID,
        *,
        limit: int = 20,
        offset: int = 0,
        event_types: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        """Get recent activity feed for dashboard display.

        Returns a paginated list of recent events with gallery and client names.

        Args:
            workspace_id: Workspace for tenant isolation
            limit: Max events to return (default 20, max 100)
            offset: Pagination offset
            event_types: Filter by event types (optional)

        Returns:
            Paginated activity feed
        """
        limit = min(max(1, limit), 100)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Build query filters
            filters = ["ae.workspace_id = $1"]
            params: list[Any] = [workspace_id]
            param_idx = 2

            if event_types:
                filters.append(f"ae.event_type = ANY(${param_idx})")
                params.append(event_types)
                param_idx += 1

            where_clause = " AND ".join(filters)

            # Get total count
            total = await conn.fetchval(
                f"""
                SELECT COUNT(*)
                FROM analytics_events ae
                WHERE {where_clause}
                """,
                *params,
            )

            # Get events with related entities
            params.extend([limit, offset])
            events = await conn.fetch(
                f"""
                SELECT
                    ae.event_id,
                    ae.event_type,
                    ae.event_category,
                    ae.gallery_id,
                    g.name as gallery_name,
                    ae.asset_id,
                    a.original_filename as asset_name,
                    ae.client_id,
                    c.full_name as client_name,
                    ae.actor_type,
                    ae.device_type,
                    ae.country_code,
                    ae.occurred_at,
                    ae.metadata
                FROM analytics_events ae
                LEFT JOIN galleries g ON ae.gallery_id = g.gallery_id AND ae.workspace_id = g.workspace_id
                LEFT JOIN assets a ON ae.asset_id = a.asset_id AND ae.workspace_id = a.workspace_id
                LEFT JOIN clients c ON ae.client_id = c.client_id AND ae.workspace_id = c.workspace_id
                WHERE {where_clause}
                ORDER BY ae.occurred_at DESC
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
                """,
                *params,
            )

        return {
            "events": [
                {
                    "event_id": str(e["event_id"]),
                    "event_type": e["event_type"],
                    "event_category": e["event_category"],
                    "gallery_id": str(e["gallery_id"]) if e["gallery_id"] else None,
                    "gallery_name": e["gallery_name"],
                    "asset_id": str(e["asset_id"]) if e["asset_id"] else None,
                    "asset_name": e["asset_name"],
                    "client_id": str(e["client_id"]) if e["client_id"] else None,
                    "client_name": e["client_name"],
                    "actor_type": e["actor_type"],
                    "device_type": e["device_type"],
                    "country_code": e["country_code"],
                    "occurred_at": e["occurred_at"].isoformat() if e["occurred_at"] else None,
                    "description": self._get_event_description(e),
                }
                for e in events
            ],
            "meta": {
                "total": total or 0,
                "limit": limit,
                "offset": offset,
                "has_more": offset + len(events) < (total or 0),
            },
        }

    @staticmethod
    def _get_event_description(event: dict[str, Any]) -> str:
        """Generate human-readable description for an event.

        Args:
            event: Event record with type, gallery_name, client_name, etc.

        Returns:
            Human-readable event description
        """
        event_type = event.get("event_type", "")
        gallery_name = event.get("gallery_name") or "a gallery"
        client_name = event.get("client_name") or "Someone"
        asset_name = event.get("asset_name") or "an asset"
        actor_type = event.get("actor_type", "visitor")

        # Determine actor label
        if actor_type == "client" and event.get("client_name"):
            actor = client_name
        elif actor_type == "user":
            actor = "A team member"
        else:
            actor = "A visitor"

        descriptions = {
            "gallery_view": f"{actor} viewed {gallery_name}",
            "gallery_download": f"{actor} downloaded {gallery_name}",
            "gallery_share": f"{actor} shared {gallery_name}",
            "asset_view": f"{actor} viewed {asset_name} in {gallery_name}",
            "asset_download": f"{actor} downloaded {asset_name} from {gallery_name}",
            "asset_favorite": f"{actor} favorited {asset_name} in {gallery_name}",
            "asset_unfavorite": f"{actor} unfavorited {asset_name} in {gallery_name}",
            "asset_comment": f"{actor} commented on {asset_name} in {gallery_name}",
            "asset_select": f"{actor} selected {asset_name} in {gallery_name}",
            "asset_deselect": f"{actor} deselected {asset_name} in {gallery_name}",
            "share_link_created": f"A share link was created for {gallery_name}",
            "share_link_accessed": f"A share link for {gallery_name} was accessed",
            "client_login": f"{client_name} logged in",
            "client_logout": f"{client_name} logged out",
            "client_registration": f"{client_name} registered",
            "bulk_download_started": f"{actor} started a bulk download from {gallery_name}",
            "bulk_download_completed": f"{actor} completed a bulk download from {gallery_name}",
        }

        return descriptions.get(event_type, f"{actor} performed {event_type}")

    # =========================================================================
    # Gallery Analytics Calculation (Task T017)
    # =========================================================================

    async def get_gallery_analytics(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        *,
        period_type: str = "all_time",
    ) -> Optional[dict[str, Any]]:
        """Get analytics for a specific gallery.

        Retrieves the most recent analytics record for the gallery for the
        specified period type. Returns None if no analytics have been
        calculated yet.

        Args:
            workspace_id: Workspace for tenant isolation
            gallery_id: Gallery to get analytics for
            period_type: Type of period ('daily', 'weekly', 'monthly', 'all_time')

        Returns:
            Gallery analytics record or None if not found
        """
        return await self._repository.get_gallery_analytics(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            period_type=period_type,
        )

    async def get_gallery_analytics_details(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        *,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> dict[str, Any]:
        """Get comprehensive gallery analytics with detailed breakdowns.

        Provides detailed analytics for a gallery including:
        - Summary metrics (views, visitors, downloads)
        - Engagement breakdown (favorites, comments, selections)
        - Device breakdown (desktop, tablet, mobile)
        - Geographic breakdown (top countries)
        - Source breakdown (direct, share link, referral)
        - Share link metrics
        - Daily views time series

        This is the primary method for the gallery analytics page.

        Args:
            workspace_id: Workspace for tenant isolation
            gallery_id: Gallery to analyze
            start_date: Start of date range (default: 30 days ago)
            end_date: End of date range (default: now)

        Returns:
            Comprehensive gallery analytics dictionary

        Raises:
            InvalidDateRangeError: If start_date > end_date
        """
        now = datetime.now(timezone.utc)
        if not end_date:
            end_date = now
        if not start_date:
            start_date = end_date - timedelta(days=30)

        if start_date > end_date:
            raise InvalidDateRangeError("Start date must be before end date")

        # Calculate previous period for comparison
        period_days = (end_date - start_date).days
        prev_start = start_date - timedelta(days=period_days)
        prev_end = start_date

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Get gallery info
            gallery_info = await conn.fetchrow(
                """
                SELECT
                    g.gallery_id,
                    g.name,
                    g.client_name,
                    g.event_date,
                    g.status,
                    g.created_at,
                    (SELECT COUNT(*) FROM gallery_assets ga
                     WHERE ga.gallery_id = g.gallery_id AND ga.visible = TRUE) as asset_count
                FROM galleries g
                WHERE g.workspace_id = $1 AND g.gallery_id = $2 AND g.deleted = FALSE
                """,
                workspace_id,
                gallery_id,
            )

            if not gallery_info:
                return {
                    "error": "Gallery not found",
                    "gallery_id": str(gallery_id),
                }

            # Current period metrics
            current_metrics = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) FILTER (WHERE event_type = 'gallery_view') as views,
                    COUNT(DISTINCT COALESCE(client_id::text, visitor_id::text, ip_address::text))
                        FILTER (WHERE event_type = 'gallery_view') as unique_visitors,
                    COUNT(DISTINCT session_id) FILTER (WHERE event_type = 'gallery_view') as sessions,
                    COUNT(*) FILTER (WHERE event_type = 'asset_favorite') as favorites,
                    COUNT(*) FILTER (WHERE event_type = 'asset_comment') as comments,
                    COUNT(*) FILTER (WHERE event_type = 'asset_select') as selections,
                    COUNT(*) FILTER (WHERE event_type IN ('asset_download', 'gallery_download', 'bulk_download_completed'))
                        as downloads,
                    COUNT(*) FILTER (WHERE event_type = 'gallery_share') as shares,
                    COUNT(DISTINCT asset_id) FILTER (WHERE event_type = 'asset_view') as unique_assets_viewed,
                    COUNT(*) FILTER (WHERE event_type = 'asset_view') as asset_views,
                    COALESCE(AVG(duration_ms) FILTER (WHERE event_type = 'gallery_view' AND duration_ms IS NOT NULL), 0)::int
                        as avg_session_duration_ms,
                    COUNT(DISTINCT client_id) FILTER (WHERE client_id IS NOT NULL) as unique_clients
                FROM analytics_events
                WHERE workspace_id = $1
                    AND gallery_id = $2
                    AND occurred_at >= $3
                    AND occurred_at <= $4
                """,
                workspace_id,
                gallery_id,
                start_date,
                end_date,
            )

            # Previous period metrics for comparison
            prev_metrics = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) FILTER (WHERE event_type = 'gallery_view') as views,
                    COUNT(DISTINCT COALESCE(client_id::text, visitor_id::text, ip_address::text))
                        FILTER (WHERE event_type = 'gallery_view') as unique_visitors,
                    COUNT(*) FILTER (WHERE event_type IN ('asset_download', 'gallery_download', 'bulk_download_completed'))
                        as downloads
                FROM analytics_events
                WHERE workspace_id = $1
                    AND gallery_id = $2
                    AND occurred_at >= $3
                    AND occurred_at < $4
                """,
                workspace_id,
                gallery_id,
                prev_start,
                prev_end,
            )

            # Device breakdown
            device_breakdown = await conn.fetch(
                """
                WITH device_counts AS (
                    SELECT
                        COALESCE(device_type, 'other') as device_type,
                        COUNT(*) as count
                    FROM analytics_events
                    WHERE workspace_id = $1
                        AND gallery_id = $2
                        AND event_type = 'gallery_view'
                        AND occurred_at >= $3
                        AND occurred_at <= $4
                    GROUP BY device_type
                ),
                total AS (
                    SELECT COALESCE(SUM(count), 0) as total_count FROM device_counts
                )
                SELECT
                    dc.device_type,
                    dc.count,
                    CASE
                        WHEN t.total_count > 0
                        THEN ROUND((dc.count::numeric / t.total_count) * 100, 2)
                        ELSE 0
                    END as percentage
                FROM device_counts dc, total t
                ORDER BY dc.count DESC
                """,
                workspace_id,
                gallery_id,
                start_date,
                end_date,
            )

            # Geographic breakdown (top 10 countries)
            geographic_breakdown = await conn.fetch(
                """
                WITH country_counts AS (
                    SELECT
                        country_code,
                        COUNT(*) as count
                    FROM analytics_events
                    WHERE workspace_id = $1
                        AND gallery_id = $2
                        AND event_type = 'gallery_view'
                        AND occurred_at >= $3
                        AND occurred_at <= $4
                        AND country_code IS NOT NULL
                    GROUP BY country_code
                ),
                total AS (
                    SELECT COALESCE(SUM(count), 0) as total_count FROM country_counts
                )
                SELECT
                    cc.country_code,
                    cc.count,
                    CASE
                        WHEN t.total_count > 0
                        THEN ROUND((cc.count::numeric / t.total_count) * 100, 2)
                        ELSE 0
                    END as percentage
                FROM country_counts cc, total t
                ORDER BY cc.count DESC
                LIMIT 10
                """,
                workspace_id,
                gallery_id,
                start_date,
                end_date,
            )

            # Source breakdown (direct, share link, referral)
            source_breakdown = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) FILTER (WHERE share_link_id IS NULL AND referrer IS NULL
                        AND event_type = 'gallery_view') as direct_views,
                    COUNT(*) FILTER (WHERE share_link_id IS NOT NULL
                        AND event_type = 'gallery_view') as share_link_views,
                    COUNT(*) FILTER (WHERE referrer IS NOT NULL AND share_link_id IS NULL
                        AND event_type = 'gallery_view') as referral_views
                FROM analytics_events
                WHERE workspace_id = $1
                    AND gallery_id = $2
                    AND occurred_at >= $3
                    AND occurred_at <= $4
                """,
                workspace_id,
                gallery_id,
                start_date,
                end_date,
            )

            # Share link metrics
            share_link_metrics = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) FILTER (WHERE event_type = 'share_link_created') as share_links_created,
                    COUNT(*) FILTER (WHERE event_type = 'share_link_accessed') as share_link_accesses,
                    COUNT(*) FILTER (WHERE event_type = 'share_link_accessed'
                        AND metadata->>'gate_passed' = 'true') as share_link_conversions
                FROM analytics_events
                WHERE workspace_id = $1
                    AND gallery_id = $2
                    AND occurred_at >= $3
                    AND occurred_at <= $4
                """,
                workspace_id,
                gallery_id,
                start_date,
                end_date,
            )

            # Daily views time series
            daily_views = await conn.fetch(
                """
                SELECT
                    DATE(occurred_at) as date,
                    COUNT(*) FILTER (WHERE event_type = 'gallery_view') as views,
                    COUNT(DISTINCT COALESCE(client_id::text, visitor_id::text, ip_address::text))
                        FILTER (WHERE event_type = 'gallery_view') as unique_visitors,
                    COUNT(*) FILTER (WHERE event_type IN ('asset_download', 'gallery_download'))
                        as downloads
                FROM analytics_events
                WHERE workspace_id = $1
                    AND gallery_id = $2
                    AND occurred_at >= $3
                    AND occurred_at <= $4
                GROUP BY DATE(occurred_at)
                ORDER BY date ASC
                """,
                workspace_id,
                gallery_id,
                start_date,
                end_date,
            )

            # Top referrers
            top_referrers = await conn.fetch(
                """
                SELECT
                    referrer,
                    COUNT(*) as count
                FROM analytics_events
                WHERE workspace_id = $1
                    AND gallery_id = $2
                    AND event_type = 'gallery_view'
                    AND referrer IS NOT NULL
                    AND occurred_at >= $3
                    AND occurred_at <= $4
                GROUP BY referrer
                ORDER BY count DESC
                LIMIT 10
                """,
                workspace_id,
                gallery_id,
                start_date,
                end_date,
            )

        # Calculate derived metrics
        views = current_metrics["views"] or 0
        unique_visitors = current_metrics["unique_visitors"] or 0
        downloads = current_metrics["downloads"] or 0
        favorites = current_metrics["favorites"] or 0
        comments = current_metrics["comments"] or 0
        selections = current_metrics["selections"] or 0
        shares = current_metrics["shares"] or 0

        prev_views = prev_metrics["views"] or 0
        prev_downloads = prev_metrics["downloads"] or 0
        prev_unique_visitors = prev_metrics["unique_visitors"] or 0

        # Engagement score (0-100)
        total_engagement = favorites + comments + selections + downloads + shares
        engagement_score = 0.0
        if views > 0:
            # Calculate engagement as ratio of engagement actions to views (max 100)
            engagement_score = min(100.0, (total_engagement / views) * 20)

        # Bounce rate (single page sessions)
        # For now, estimate based on asset views vs gallery views
        asset_views = current_metrics["asset_views"] or 0
        bounce_rate = 0.0
        if views > 0:
            # If someone views the gallery but no assets, consider it a bounce
            engaged_views = min(asset_views, views)  # Cap at views count
            bounce_rate = max(0.0, ((views - engaged_views) / views) * 100)

        # Source totals for percentage calculation
        direct = source_breakdown["direct_views"] or 0
        share_link = source_breakdown["share_link_views"] or 0
        referral = source_breakdown["referral_views"] or 0
        total_source_views = direct + share_link + referral

        # Share link conversion rate
        share_link_accesses = share_link_metrics["share_link_accesses"] or 0
        share_link_conversions = share_link_metrics["share_link_conversions"] or 0
        conversion_rate = 0.0
        if share_link_accesses > 0:
            conversion_rate = (share_link_conversions / share_link_accesses) * 100

        # Calculate trend percentages
        def calc_trend(current: int, previous: int) -> Optional[float]:
            """Calculate percentage change between periods."""
            if previous == 0:
                return 100.0 if current > 0 else 0.0
            return round(((current - previous) / previous) * 100, 2)

        return {
            "gallery": {
                "gallery_id": str(gallery_info["gallery_id"]),
                "name": gallery_info["name"],
                "client_name": gallery_info["client_name"],
                "event_date": gallery_info["event_date"].isoformat() if gallery_info["event_date"] else None,
                "status": gallery_info["status"],
                "created_at": gallery_info["created_at"].isoformat() if gallery_info["created_at"] else None,
                "asset_count": gallery_info["asset_count"] or 0,
            },
            "summary": {
                "views": views,
                "unique_visitors": unique_visitors,
                "sessions": current_metrics["sessions"] or 0,
                "downloads": downloads,
                "unique_clients": current_metrics["unique_clients"] or 0,
                "avg_session_duration_ms": current_metrics["avg_session_duration_ms"] or 0,
                "avg_session_duration_formatted": self._format_duration(
                    current_metrics["avg_session_duration_ms"] or 0
                ),
            },
            "trends": {
                "views_trend": calc_trend(views, prev_views),
                "unique_visitors_trend": calc_trend(unique_visitors, prev_unique_visitors),
                "downloads_trend": calc_trend(downloads, prev_downloads),
                "previous_period": {
                    "views": prev_views,
                    "unique_visitors": prev_unique_visitors,
                    "downloads": prev_downloads,
                },
            },
            "engagement": {
                "favorites": favorites,
                "comments": comments,
                "selections": selections,
                "downloads": downloads,
                "shares": shares,
                "unique_assets_viewed": current_metrics["unique_assets_viewed"] or 0,
                "asset_views": asset_views,
                "total_engagement_actions": total_engagement,
                "engagement_score": round(engagement_score, 2),
                "bounce_rate": round(bounce_rate, 2),
            },
            "device_breakdown": [
                {
                    "device_type": d["device_type"],
                    "count": d["count"],
                    "percentage": float(d["percentage"]) if d["percentage"] else 0.0,
                }
                for d in device_breakdown
            ],
            "geographic_breakdown": [
                {
                    "country_code": g["country_code"],
                    "count": g["count"],
                    "percentage": float(g["percentage"]) if g["percentage"] else 0.0,
                }
                for g in geographic_breakdown
            ],
            "source_breakdown": {
                "direct": {
                    "count": direct,
                    "percentage": round((direct / total_source_views * 100), 2) if total_source_views > 0 else 0.0,
                },
                "share_link": {
                    "count": share_link,
                    "percentage": round((share_link / total_source_views * 100), 2) if total_source_views > 0 else 0.0,
                },
                "referral": {
                    "count": referral,
                    "percentage": round((referral / total_source_views * 100), 2) if total_source_views > 0 else 0.0,
                },
            },
            "share_link_stats": {
                "share_links_created": share_link_metrics["share_links_created"] or 0,
                "share_link_accesses": share_link_accesses,
                "share_link_conversions": share_link_conversions,
                "conversion_rate": round(conversion_rate, 2),
            },
            "top_referrers": [
                {
                    "referrer": r["referrer"],
                    "count": r["count"],
                }
                for r in top_referrers
            ],
            "daily_views": [
                {
                    "date": d["date"].isoformat(),
                    "views": d["views"],
                    "unique_visitors": d["unique_visitors"],
                    "downloads": d["downloads"],
                }
                for d in daily_views
            ],
            "period": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
                "days": period_days,
            },
            "generated_at": now.isoformat(),
        }

    @staticmethod
    def _format_duration(duration_ms: int) -> str:
        """Format duration in milliseconds to human-readable string.

        Args:
            duration_ms: Duration in milliseconds

        Returns:
            Formatted string (e.g., "5m 30s", "1h 15m", "45s")
        """
        if duration_ms <= 0:
            return "0s"

        seconds = duration_ms // 1000
        if seconds < 60:
            return f"{seconds}s"

        minutes = seconds // 60
        remaining_seconds = seconds % 60

        if minutes < 60:
            if remaining_seconds > 0:
                return f"{minutes}m {remaining_seconds}s"
            return f"{minutes}m"

        hours = minutes // 60
        remaining_minutes = minutes % 60

        if remaining_minutes > 0:
            return f"{hours}h {remaining_minutes}m"
        return f"{hours}h"

    async def get_gallery_views_time_series(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        *,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        granularity: str = "daily",
    ) -> list[dict[str, Any]]:
        """Get gallery views as a time series for charting.

        Args:
            workspace_id: Workspace for tenant isolation
            gallery_id: Gallery to get time series for
            start_date: Start date (default: 30 days ago)
            end_date: End date (default: today)
            granularity: Time granularity ('daily', 'weekly', 'monthly')

        Returns:
            List of {date, total_views, unique_visitors} records

        Raises:
            InvalidDateRangeError: If granularity is invalid
        """
        if granularity not in ("daily", "weekly", "monthly"):
            raise InvalidDateRangeError(
                f"Invalid granularity: {granularity}. Use 'daily', 'weekly', or 'monthly'."
            )

        from datetime import date as date_type

        now_date = date_type.today()
        end = end_date.date() if end_date else now_date
        start = start_date.date() if start_date else (end - timedelta(days=30))

        return await self._repository.get_gallery_views_time_series(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            start_date=start,
            end_date=end,
            granularity=granularity,
        )

    async def get_gallery_engagement_breakdown(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        *,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> dict[str, Any]:
        """Get detailed engagement breakdown for a gallery.

        Args:
            workspace_id: Workspace for tenant isolation
            gallery_id: Gallery to analyze
            start_date: Start date (optional)
            end_date: End date (optional)

        Returns:
            Engagement breakdown with metrics and percentages
        """
        from datetime import date as date_type

        start = start_date.date() if start_date else None
        end = end_date.date() if end_date else None

        return await self._repository.get_gallery_engagement_breakdown(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            start_date=start,
            end_date=end,
        )

    async def get_top_galleries(
        self,
        workspace_id: UUID,
        *,
        period_type: str = "all_time",
        sort_by: str = "total_views",
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """Get top performing galleries for a workspace.

        Args:
            workspace_id: Workspace for tenant isolation
            period_type: Type of period to consider ('daily', 'weekly', 'monthly', 'all_time')
            sort_by: Metric to sort by:
                - 'total_views': Most viewed galleries
                - 'unique_visitors': Most unique visitors
                - 'total_downloads': Most downloads
                - 'engagement_score': Highest engagement
            limit: Max galleries to return (max 100)

        Returns:
            List of top gallery analytics records with gallery names
        """
        return await self._repository.get_top_galleries(
            workspace_id=workspace_id,
            period_type=period_type,
            sort_by=sort_by,
            limit=min(limit, 100),
        )

    async def get_workspace_gallery_stats(
        self,
        workspace_id: UUID,
        *,
        period_type: str = "all_time",
    ) -> dict[str, Any]:
        """Get aggregate statistics across all galleries in a workspace.

        Provides summary metrics including total views, downloads, engagement
        scores, and device breakdown across all galleries.

        Args:
            workspace_id: Workspace for tenant isolation
            period_type: Type of period to aggregate

        Returns:
            Aggregate statistics dictionary
        """
        return await self._repository.get_workspace_gallery_stats(
            workspace_id=workspace_id,
            period_type=period_type,
        )

    async def calculate_gallery_analytics(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        *,
        period_type: str = "all_time",
        force_recalculate: bool = False,
    ) -> dict[str, Any]:
        """Calculate and store gallery analytics.

        Aggregates raw events into a gallery analytics record and stores it
        for fast retrieval. This is typically called by a background job
        but can be triggered manually.

        Args:
            workspace_id: Workspace for tenant isolation
            gallery_id: Gallery to calculate analytics for
            period_type: Type of period ('daily', 'weekly', 'monthly', 'all_time')
            force_recalculate: If True, recalculate even if recent data exists

        Returns:
            Calculated gallery analytics record
        """
        from datetime import date as date_type

        now = datetime.now(timezone.utc)
        today = date_type.today()

        # Determine period dates based on period_type
        if period_type == "daily":
            period_start = today
            period_end = today
        elif period_type == "weekly":
            # Start of current week (Monday)
            period_start = today - timedelta(days=today.weekday())
            period_end = period_start + timedelta(days=6)
        elif period_type == "monthly":
            # Start of current month
            period_start = today.replace(day=1)
            # End of current month
            next_month = period_start.replace(day=28) + timedelta(days=4)
            period_end = next_month - timedelta(days=next_month.day)
        else:  # all_time
            # Use a very early start date and today as end
            period_start = date_type(2020, 1, 1)
            period_end = today

        # Check if recent analytics exist (unless force_recalculate)
        if not force_recalculate:
            existing = await self._repository.get_gallery_analytics(
                workspace_id=workspace_id,
                gallery_id=gallery_id,
                period_type=period_type,
            )

            if existing:
                # If calculated within the last hour, return existing
                calculated_at = existing.get("calculated_at")
                if calculated_at:
                    # Parse if string
                    if isinstance(calculated_at, str):
                        calculated_at = datetime.fromisoformat(calculated_at.replace("Z", "+00:00"))
                    age = (now - calculated_at).total_seconds()
                    if age < 3600:  # Less than 1 hour old
                        logger.debug(
                            "Returning existing gallery analytics (age: %d seconds)",
                            age,
                            extra={
                                "workspace_id": str(workspace_id),
                                "gallery_id": str(gallery_id),
                                "period_type": period_type,
                            },
                        )
                        return existing

        # Calculate new analytics
        logger.info(
            "Calculating gallery analytics",
            extra={
                "workspace_id": str(workspace_id),
                "gallery_id": str(gallery_id),
                "period_type": period_type,
                "period_start": period_start.isoformat(),
                "period_end": period_end.isoformat(),
            },
        )

        result = await self._repository.aggregate_gallery_analytics(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            period_type=period_type,
            period_start=period_start,
            period_end=period_end,
        )

        return result

    async def bulk_calculate_gallery_analytics(
        self,
        workspace_id: UUID,
        *,
        period_type: str = "all_time",
        stale_threshold_hours: int = 24,
        limit: int = 100,
    ) -> dict[str, Any]:
        """Calculate analytics for galleries that need updating.

        Identifies galleries with recent events but stale or missing analytics
        and recalculates them. Useful for batch processing.

        Args:
            workspace_id: Workspace for tenant isolation
            period_type: Type of period to calculate
            stale_threshold_hours: Hours before analytics are considered stale
            limit: Max galleries to process

        Returns:
            Summary of processed galleries
        """
        # Get galleries needing aggregation
        galleries = await self._repository.get_galleries_needing_aggregation(
            workspace_id=workspace_id,
            period_type=period_type,
            stale_threshold_hours=stale_threshold_hours,
            limit=limit,
        )

        if not galleries:
            return {
                "processed": 0,
                "galleries": [],
                "message": "No galleries need analytics update",
            }

        logger.info(
            "Bulk calculating gallery analytics",
            extra={
                "workspace_id": str(workspace_id),
                "period_type": period_type,
                "gallery_count": len(galleries),
            },
        )

        results = []
        errors = []

        for gallery_id in galleries:
            try:
                await self.calculate_gallery_analytics(
                    workspace_id=workspace_id,
                    gallery_id=gallery_id,
                    period_type=period_type,
                    force_recalculate=True,
                )
                results.append(str(gallery_id))
            except Exception as e:
                logger.error(
                    "Failed to calculate gallery analytics",
                    extra={
                        "workspace_id": str(workspace_id),
                        "gallery_id": str(gallery_id),
                        "error": str(e),
                    },
                )
                errors.append({
                    "gallery_id": str(gallery_id),
                    "error": str(e),
                })

        return {
            "processed": len(results),
            "galleries": results,
            "errors": errors if errors else None,
            "message": f"Processed {len(results)} galleries, {len(errors)} errors",
        }

    async def get_gallery_analytics_history(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        *,
        period_type: str = "daily",
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 30,
    ) -> list[dict[str, Any]]:
        """Get historical gallery analytics for trend analysis.

        Returns multiple analytics records over time for the specified
        period type. Useful for showing trends and comparisons.

        Args:
            workspace_id: Workspace for tenant isolation
            gallery_id: Gallery to get history for
            period_type: Type of period to retrieve ('daily', 'weekly', 'monthly')
            start_date: Start of date range filter (optional)
            end_date: End of date range filter (optional)
            limit: Max records to return (max 365)

        Returns:
            List of gallery analytics records ordered by period_start DESC
        """
        from datetime import date as date_type

        start = start_date.date() if start_date else None
        end = end_date.date() if end_date else None

        return await self._repository.get_gallery_analytics_history(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            period_type=period_type,
            start_date=start,
            end_date=end,
            limit=min(limit, 365),
        )

    async def compare_galleries(
        self,
        workspace_id: UUID,
        gallery_ids: list[UUID],
        *,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> dict[str, Any]:
        """Compare analytics across multiple galleries.

        Provides side-by-side comparison of key metrics for the specified
        galleries over the same time period.

        Args:
            workspace_id: Workspace for tenant isolation
            gallery_ids: List of gallery IDs to compare (max 10)
            start_date: Start of date range (default: 30 days ago)
            end_date: End of date range (default: now)

        Returns:
            Comparison data for all galleries

        Raises:
            InvalidDateRangeError: If too many galleries requested
        """
        if len(gallery_ids) > 10:
            raise InvalidDateRangeError("Cannot compare more than 10 galleries at once")

        if len(gallery_ids) < 2:
            raise InvalidDateRangeError("Need at least 2 galleries to compare")

        now = datetime.now(timezone.utc)
        if not end_date:
            end_date = now
        if not start_date:
            start_date = end_date - timedelta(days=30)

        if start_date > end_date:
            raise InvalidDateRangeError("Start date must be before end date")

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            galleries_data = []

            for gallery_id in gallery_ids:
                # Get gallery info
                gallery_info = await conn.fetchrow(
                    """
                    SELECT gallery_id, name, client_name
                    FROM galleries
                    WHERE workspace_id = $1 AND gallery_id = $2 AND deleted = FALSE
                    """,
                    workspace_id,
                    gallery_id,
                )

                if not gallery_info:
                    continue

                # Get metrics for this gallery
                metrics = await conn.fetchrow(
                    """
                    SELECT
                        COUNT(*) FILTER (WHERE event_type = 'gallery_view') as views,
                        COUNT(DISTINCT COALESCE(client_id::text, visitor_id::text, ip_address::text))
                            FILTER (WHERE event_type = 'gallery_view') as unique_visitors,
                        COUNT(*) FILTER (WHERE event_type IN ('asset_download', 'gallery_download', 'bulk_download_completed'))
                            as downloads,
                        COUNT(*) FILTER (WHERE event_type = 'asset_favorite') as favorites,
                        COUNT(*) FILTER (WHERE event_type = 'asset_comment') as comments,
                        COUNT(*) FILTER (WHERE event_type = 'asset_select') as selections
                    FROM analytics_events
                    WHERE workspace_id = $1
                        AND gallery_id = $2
                        AND occurred_at >= $3
                        AND occurred_at <= $4
                    """,
                    workspace_id,
                    gallery_id,
                    start_date,
                    end_date,
                )

                views = metrics["views"] or 0
                total_engagement = (
                    (metrics["favorites"] or 0) +
                    (metrics["comments"] or 0) +
                    (metrics["selections"] or 0) +
                    (metrics["downloads"] or 0)
                )
                engagement_score = min(100.0, (total_engagement / views) * 20) if views > 0 else 0.0

                galleries_data.append({
                    "gallery_id": str(gallery_info["gallery_id"]),
                    "name": gallery_info["name"],
                    "client_name": gallery_info["client_name"],
                    "metrics": {
                        "views": views,
                        "unique_visitors": metrics["unique_visitors"] or 0,
                        "downloads": metrics["downloads"] or 0,
                        "favorites": metrics["favorites"] or 0,
                        "comments": metrics["comments"] or 0,
                        "selections": metrics["selections"] or 0,
                        "total_engagement": total_engagement,
                        "engagement_score": round(engagement_score, 2),
                    },
                })

        # Calculate rankings
        if galleries_data:
            # Sort by views for ranking
            sorted_by_views = sorted(galleries_data, key=lambda x: x["metrics"]["views"], reverse=True)
            for i, g in enumerate(sorted_by_views):
                g["rank_by_views"] = i + 1

            # Sort by engagement score for ranking
            sorted_by_engagement = sorted(
                galleries_data, key=lambda x: x["metrics"]["engagement_score"], reverse=True
            )
            for i, g in enumerate(sorted_by_engagement):
                g["rank_by_engagement"] = i + 1

        return {
            "galleries": galleries_data,
            "gallery_count": len(galleries_data),
            "period": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
            },
            "generated_at": now.isoformat(),
        }

    # =========================================================================
    # Client Engagement Scoring (Task T018)
    # =========================================================================

    async def calculate_client_analytics(
        self,
        workspace_id: UUID,
        client_id: UUID,
        *,
        period_type: str = "all_time",
        period_start: Optional[date] = None,
        period_end: Optional[date] = None,
    ) -> dict[str, Any]:
        """Calculate and store analytics for a specific client.

        Aggregates all client activity from raw events and stores the result
        in client_analytics table. Calculates engagement score, churn risk,
        and lifetime value.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to calculate analytics for
            period_type: Type of period ('daily', 'weekly', 'monthly', 'all_time')
            period_start: Start date (default: beginning of period based on type)
            period_end: End date (default: now)

        Returns:
            Calculated client analytics record with all metrics

        Raises:
            AnalyticsError: If calculation fails
        """
        now = datetime.now(timezone.utc)
        today = now.date()

        # Set default period dates based on period_type
        if not period_end:
            period_end = today

        if not period_start:
            if period_type == "daily":
                period_start = period_end
            elif period_type == "weekly":
                # Start of current week (Monday)
                period_start = period_end - timedelta(days=period_end.weekday())
            elif period_type == "monthly":
                # Start of current month
                period_start = period_end.replace(day=1)
            else:  # all_time
                # Use a very early date for all-time
                period_start = date(2020, 1, 1)

        try:
            analytics = await self._repository.aggregate_client_analytics(
                workspace_id=workspace_id,
                client_id=client_id,
                period_type=period_type,
                period_start=period_start,
                period_end=period_end,
            )

            logger.info(
                "Calculated client analytics",
                extra={
                    "workspace_id": str(workspace_id),
                    "client_id": str(client_id),
                    "period_type": period_type,
                    "engagement_score": analytics.get("engagement_score"),
                    "churn_risk_score": analytics.get("churn_risk_score"),
                },
            )

            return analytics

        except Exception as e:
            logger.error(
                "Failed to calculate client analytics",
                extra={
                    "workspace_id": str(workspace_id),
                    "client_id": str(client_id),
                    "error": str(e),
                },
            )
            raise AnalyticsError(f"Failed to calculate client analytics: {e}")

    async def bulk_calculate_client_analytics(
        self,
        workspace_id: UUID,
        *,
        period_type: str = "all_time",
        stale_threshold_hours: int = 24,
        limit: int = 100,
    ) -> dict[str, Any]:
        """Bulk calculate analytics for clients with stale data.

        Identifies clients with recent activity but outdated analytics
        and recalculates their metrics. Useful for background processing.

        Args:
            workspace_id: Workspace for tenant isolation
            period_type: Type of period to calculate
            stale_threshold_hours: Hours before analytics are considered stale
            limit: Maximum clients to process in one batch

        Returns:
            Summary of calculation results with success/failure counts

        Raises:
            AnalyticsError: If bulk calculation fails
        """
        try:
            # Get clients needing aggregation
            client_ids = await self._repository.get_clients_needing_aggregation(
                workspace_id=workspace_id,
                period_type=period_type,
                stale_threshold_hours=stale_threshold_hours,
                limit=limit,
            )

            if not client_ids:
                return {
                    "processed": 0,
                    "success": 0,
                    "failed": 0,
                    "skipped": 0,
                    "message": "No clients need analytics recalculation",
                }

            # Calculate analytics for each client
            now = datetime.now(timezone.utc)
            today = now.date()

            # Set period dates based on type
            if period_type == "daily":
                period_start = today
                period_end = today
            elif period_type == "weekly":
                period_start = today - timedelta(days=today.weekday())
                period_end = today
            elif period_type == "monthly":
                period_start = today.replace(day=1)
                period_end = today
            else:  # all_time
                period_start = date(2020, 1, 1)
                period_end = today

            success_count = 0
            failed_count = 0
            failed_clients = []

            for client_id in client_ids:
                try:
                    await self._repository.aggregate_client_analytics(
                        workspace_id=workspace_id,
                        client_id=client_id,
                        period_type=period_type,
                        period_start=period_start,
                        period_end=period_end,
                    )
                    success_count += 1
                except Exception as e:
                    logger.warning(
                        "Failed to calculate analytics for client",
                        extra={
                            "workspace_id": str(workspace_id),
                            "client_id": str(client_id),
                            "error": str(e),
                        },
                    )
                    failed_count += 1
                    failed_clients.append(str(client_id))

            logger.info(
                "Completed bulk client analytics calculation",
                extra={
                    "workspace_id": str(workspace_id),
                    "period_type": period_type,
                    "processed": len(client_ids),
                    "success": success_count,
                    "failed": failed_count,
                },
            )

            result = {
                "processed": len(client_ids),
                "success": success_count,
                "failed": failed_count,
                "skipped": 0,
                "period_type": period_type,
                "stale_threshold_hours": stale_threshold_hours,
            }

            if failed_clients:
                result["failed_clients"] = failed_clients[:10]  # Limit to first 10

            return result

        except Exception as e:
            logger.error(
                "Bulk client analytics calculation failed",
                extra={
                    "workspace_id": str(workspace_id),
                    "error": str(e),
                },
            )
            raise AnalyticsError(f"Bulk client analytics calculation failed: {e}")

    async def get_client_analytics_details(
        self,
        workspace_id: UUID,
        client_id: UUID,
        *,
        period_type: str = "all_time",
        include_history: bool = False,
        include_galleries: bool = False,
        history_limit: int = 30,
    ) -> dict[str, Any]:
        """Get comprehensive analytics for a specific client.

        Retrieves the client's analytics record with optional historical
        data and gallery interaction breakdown.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to get analytics for
            period_type: Type of period to retrieve
            include_history: Include historical analytics records
            include_galleries: Include per-gallery interaction breakdown
            history_limit: Max history records to include

        Returns:
            Comprehensive client analytics with engagement scoring

        Raises:
            AnalyticsError: If retrieval fails
        """
        try:
            # Get current analytics record
            analytics = await self._repository.get_client_analytics(
                workspace_id=workspace_id,
                client_id=client_id,
                period_type=period_type,
            )

            if not analytics:
                # No analytics record exists - calculate one
                now = datetime.now(timezone.utc)
                today = now.date()

                analytics = await self.calculate_client_analytics(
                    workspace_id=workspace_id,
                    client_id=client_id,
                    period_type=period_type,
                    period_end=today,
                )

            result = {
                "analytics": analytics,
                "client_id": str(client_id),
                "period_type": period_type,
            }

            # Get client info if available
            pool = await get_postgres_pool()
            async with pool.acquire() as conn:
                client_info = await conn.fetchrow(
                    """
                    SELECT name, email, status, created_at
                    FROM clients
                    WHERE workspace_id = $1 AND client_id = $2
                    """,
                    workspace_id,
                    client_id,
                )

                if client_info:
                    result["client"] = {
                        "name": client_info["name"],
                        "email": client_info["email"],
                        "status": client_info["status"],
                        "created_at": client_info["created_at"].isoformat()
                        if client_info["created_at"] else None,
                    }

            # Get engagement breakdown
            engagement_breakdown = await self._repository.get_client_engagement_breakdown(
                workspace_id=workspace_id,
                client_id=client_id,
            )
            result["engagement_breakdown"] = engagement_breakdown

            # Include historical data if requested
            if include_history:
                history = await self._repository.get_client_analytics_history(
                    workspace_id=workspace_id,
                    client_id=client_id,
                    period_type=period_type,
                    limit=history_limit,
                )
                result["history"] = history

            # Include gallery interactions if requested
            if include_galleries:
                galleries = await self._repository.get_client_gallery_interactions(
                    workspace_id=workspace_id,
                    client_id=client_id,
                    limit=20,
                )
                result["gallery_interactions"] = galleries

            # Determine engagement tier based on score
            engagement_score = analytics.get("engagement_score", 0)
            if engagement_score >= 70:
                engagement_tier = "highly_engaged"
            elif engagement_score >= 40:
                engagement_tier = "moderately_engaged"
            elif engagement_score >= 20:
                engagement_tier = "low_engagement"
            else:
                engagement_tier = "minimal_engagement"

            result["engagement_tier"] = engagement_tier

            # Determine churn risk level
            churn_risk_score = analytics.get("churn_risk_score")
            if churn_risk_score is not None:
                if churn_risk_score >= 70:
                    churn_risk_level = "high"
                elif churn_risk_score >= 50:
                    churn_risk_level = "medium"
                elif churn_risk_score >= 25:
                    churn_risk_level = "low"
                else:
                    churn_risk_level = "minimal"
                result["churn_risk_level"] = churn_risk_level

            result["generated_at"] = datetime.now(timezone.utc).isoformat()

            return result

        except Exception as e:
            if isinstance(e, AnalyticsError):
                raise
            logger.error(
                "Failed to get client analytics details",
                extra={
                    "workspace_id": str(workspace_id),
                    "client_id": str(client_id),
                    "error": str(e),
                },
            )
            raise AnalyticsError(f"Failed to get client analytics details: {e}")

    async def get_clients_at_churn_risk(
        self,
        workspace_id: UUID,
        *,
        min_risk_score: int = 50,
        period_type: str = "all_time",
        limit: int = 20,
    ) -> dict[str, Any]:
        """Get clients at risk of churning.

        Identifies clients with high churn risk scores and provides
        risk factors for each.

        Args:
            workspace_id: Workspace for tenant isolation
            min_risk_score: Minimum churn risk score (0-100) to include
            period_type: Type of period to consider
            limit: Maximum clients to return

        Returns:
            List of at-risk clients with risk factors and recommendations

        Raises:
            AnalyticsError: If retrieval fails
        """
        try:
            at_risk = await self._repository.get_clients_at_churn_risk(
                workspace_id=workspace_id,
                min_risk_score=min_risk_score,
                period_type=period_type,
                limit=limit,
            )

            # Add recommendations based on risk factors
            for client in at_risk:
                recommendations = []
                risk_factors = client.get("risk_factors", [])

                if any("90+ days" in f for f in risk_factors):
                    recommendations.append("Send re-engagement email with new galleries")
                    recommendations.append("Offer exclusive discount on next session")
                elif any("60+ days" in f for f in risk_factors):
                    recommendations.append("Send personalized check-in message")
                    recommendations.append("Share recent work or behind-the-scenes content")
                elif any("30+ days" in f for f in risk_factors):
                    recommendations.append("Send reminder about unviewed galleries")

                if any("engagement" in f.lower() for f in risk_factors):
                    recommendations.append("Request feedback on gallery experience")
                    recommendations.append("Highlight favorite/selection features")

                client["recommendations"] = recommendations[:3]  # Max 3 recommendations

            # Group by risk level
            high_risk = [c for c in at_risk if c.get("churn_risk_score", 0) >= 70]
            medium_risk = [c for c in at_risk if 50 <= c.get("churn_risk_score", 0) < 70]

            return {
                "clients": at_risk,
                "total_at_risk": len(at_risk),
                "high_risk_count": len(high_risk),
                "medium_risk_count": len(medium_risk),
                "min_risk_score": min_risk_score,
                "period_type": period_type,
                "generated_at": datetime.now(timezone.utc).isoformat(),
            }

        except Exception as e:
            logger.error(
                "Failed to get clients at churn risk",
                extra={
                    "workspace_id": str(workspace_id),
                    "error": str(e),
                },
            )
            raise AnalyticsError(f"Failed to get clients at churn risk: {e}")

    async def get_top_clients(
        self,
        workspace_id: UUID,
        *,
        period_type: str = "all_time",
        sort_by: str = "engagement_score",
        limit: int = 10,
    ) -> dict[str, Any]:
        """Get top performing clients.

        Retrieves clients ranked by the specified metric.

        Args:
            workspace_id: Workspace for tenant isolation
            period_type: Type of period to consider
            sort_by: Metric to sort by ('engagement_score', 'total_gallery_views',
                     'total_downloads', 'lifetime_value_cents')
            limit: Maximum clients to return

        Returns:
            List of top clients with their analytics

        Raises:
            InvalidDateRangeError: If sort_by value is invalid
            AnalyticsError: If retrieval fails
        """
        valid_sort_options = {
            "engagement_score",
            "total_gallery_views",
            "total_downloads",
            "lifetime_value_cents",
            "total_favorites",
            "total_comments",
            "total_sessions",
        }

        if sort_by not in valid_sort_options:
            raise InvalidDateRangeError(
                f"Invalid sort_by value: {sort_by}. "
                f"Valid options are: {', '.join(sorted(valid_sort_options))}"
            )

        try:
            top_clients = await self._repository.get_top_clients(
                workspace_id=workspace_id,
                period_type=period_type,
                sort_by=sort_by,
                limit=limit,
            )

            # Add rank to each client
            for i, client in enumerate(top_clients, 1):
                client["rank"] = i

            return {
                "clients": top_clients,
                "total": len(top_clients),
                "sort_by": sort_by,
                "period_type": period_type,
                "generated_at": datetime.now(timezone.utc).isoformat(),
            }

        except Exception as e:
            if isinstance(e, InvalidDateRangeError):
                raise
            logger.error(
                "Failed to get top clients",
                extra={
                    "workspace_id": str(workspace_id),
                    "error": str(e),
                },
            )
            raise AnalyticsError(f"Failed to get top clients: {e}")

    async def get_client_analytics_history(
        self,
        workspace_id: UUID,
        client_id: UUID,
        *,
        period_type: str = "daily",
        limit: int = 30,
    ) -> dict[str, Any]:
        """Get historical analytics records for a client.

        Retrieves past analytics records for trend analysis.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to get history for
            period_type: Type of period records to retrieve
            limit: Maximum records to return

        Returns:
            Historical analytics records sorted by date descending

        Raises:
            AnalyticsError: If retrieval fails
        """
        try:
            history = await self._repository.get_client_analytics_history(
                workspace_id=workspace_id,
                client_id=client_id,
                period_type=period_type,
                limit=min(limit, 365),
            )

            # Calculate trends if we have enough data
            trends = {}
            if len(history) >= 2:
                latest = history[0]
                previous = history[1]

                for metric in ["engagement_score", "total_gallery_views", "total_downloads"]:
                    latest_val = latest.get(metric, 0) or 0
                    prev_val = previous.get(metric, 0) or 0

                    if prev_val > 0:
                        change_pct = ((latest_val - prev_val) / prev_val) * 100
                        trends[metric] = {
                            "change": latest_val - prev_val,
                            "change_percentage": round(change_pct, 2),
                            "direction": "up" if change_pct > 0 else ("down" if change_pct < 0 else "stable"),
                        }
                    elif latest_val > 0:
                        trends[metric] = {
                            "change": latest_val,
                            "change_percentage": 100.0,
                            "direction": "up",
                        }

            return {
                "client_id": str(client_id),
                "history": history,
                "record_count": len(history),
                "period_type": period_type,
                "trends": trends,
                "generated_at": datetime.now(timezone.utc).isoformat(),
            }

        except Exception as e:
            logger.error(
                "Failed to get client analytics history",
                extra={
                    "workspace_id": str(workspace_id),
                    "client_id": str(client_id),
                    "error": str(e),
                },
            )
            raise AnalyticsError(f"Failed to get client analytics history: {e}")

    async def get_client_activity_time_series(
        self,
        workspace_id: UUID,
        client_id: UUID,
        *,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        granularity: str = "daily",
    ) -> dict[str, Any]:
        """Get client activity as a time series for charting.

        Provides daily/weekly/monthly activity breakdown for visualization.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to get time series for
            start_date: Start date (default: 30 days ago)
            end_date: End date (default: today)
            granularity: Time granularity ('daily', 'weekly', 'monthly')

        Returns:
            Time series data for charting

        Raises:
            InvalidDateRangeError: If granularity is invalid
            AnalyticsError: If retrieval fails
        """
        valid_granularities = {"daily", "weekly", "monthly"}
        if granularity not in valid_granularities:
            raise InvalidDateRangeError(
                f"Invalid granularity: {granularity}. "
                f"Valid options are: {', '.join(sorted(valid_granularities))}"
            )

        if not end_date:
            end_date = date.today()
        if not start_date:
            start_date = end_date - timedelta(days=30)

        if start_date > end_date:
            raise InvalidDateRangeError("Start date must be before end date")

        try:
            time_series = await self._repository.get_client_activity_time_series(
                workspace_id=workspace_id,
                client_id=client_id,
                start_date=start_date,
                end_date=end_date,
                granularity=granularity,
            )

            # Calculate summary statistics
            total_views = sum(d.get("gallery_views", 0) for d in time_series)
            total_asset_views = sum(d.get("asset_views", 0) for d in time_series)
            total_engagement = sum(d.get("total_engagement_actions", 0) for d in time_series)
            active_days = len([d for d in time_series if d.get("gallery_views", 0) > 0])

            return {
                "client_id": str(client_id),
                "time_series": time_series,
                "data_points": len(time_series),
                "granularity": granularity,
                "period": {
                    "start": start_date.isoformat(),
                    "end": end_date.isoformat(),
                },
                "summary": {
                    "total_gallery_views": total_views,
                    "total_asset_views": total_asset_views,
                    "total_engagement_actions": total_engagement,
                    "active_periods": active_days,
                    "avg_views_per_period": round(total_views / len(time_series), 2)
                    if time_series else 0,
                },
                "generated_at": datetime.now(timezone.utc).isoformat(),
            }

        except Exception as e:
            if isinstance(e, InvalidDateRangeError):
                raise
            logger.error(
                "Failed to get client activity time series",
                extra={
                    "workspace_id": str(workspace_id),
                    "client_id": str(client_id),
                    "error": str(e),
                },
            )
            raise AnalyticsError(f"Failed to get client activity time series: {e}")

    async def get_client_engagement_breakdown(
        self,
        workspace_id: UUID,
        client_id: UUID,
        *,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> dict[str, Any]:
        """Get detailed engagement breakdown for a client.

        Provides a breakdown of all engagement actions with percentages.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to analyze
            start_date: Start date (optional)
            end_date: End date (optional)

        Returns:
            Engagement breakdown with metrics and percentages

        Raises:
            AnalyticsError: If retrieval fails
        """
        try:
            breakdown = await self._repository.get_client_engagement_breakdown(
                workspace_id=workspace_id,
                client_id=client_id,
                start_date=start_date,
                end_date=end_date,
            )

            # Calculate weighted engagement score
            gallery_views = breakdown.get("gallery_views", 0)
            favorites = breakdown.get("favorites", 0)
            comments = breakdown.get("comments", 0)
            selections = breakdown.get("selections", 0)
            downloads = breakdown.get("downloads", 0)

            weighted_actions = (
                favorites * 2 +    # Favorites weighted 2x
                comments * 3 +     # Comments weighted 3x
                selections * 1 +   # Selections weighted 1x
                downloads * 2      # Downloads weighted 2x
            )

            engagement_score = 0.0
            if gallery_views > 0:
                engagement_score = min(100.0, (weighted_actions / gallery_views) * 20)

            breakdown["calculated_engagement_score"] = round(engagement_score, 2)

            # Determine engagement tier
            if engagement_score >= 70:
                breakdown["engagement_tier"] = "highly_engaged"
            elif engagement_score >= 40:
                breakdown["engagement_tier"] = "moderately_engaged"
            elif engagement_score >= 20:
                breakdown["engagement_tier"] = "low_engagement"
            else:
                breakdown["engagement_tier"] = "minimal_engagement"

            result = {
                "client_id": str(client_id),
                "breakdown": breakdown,
                "generated_at": datetime.now(timezone.utc).isoformat(),
            }

            if start_date or end_date:
                result["period"] = {
                    "start": start_date.isoformat() if start_date else None,
                    "end": end_date.isoformat() if end_date else None,
                }

            return result

        except Exception as e:
            logger.error(
                "Failed to get client engagement breakdown",
                extra={
                    "workspace_id": str(workspace_id),
                    "client_id": str(client_id),
                    "error": str(e),
                },
            )
            raise AnalyticsError(f"Failed to get client engagement breakdown: {e}")

    async def get_client_gallery_interactions(
        self,
        workspace_id: UUID,
        client_id: UUID,
        *,
        limit: int = 20,
    ) -> dict[str, Any]:
        """Get galleries a client has interacted with.

        Returns galleries ranked by engagement, with detailed metrics
        for each interaction.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to analyze
            limit: Maximum galleries to return

        Returns:
            List of galleries with interaction metrics

        Raises:
            AnalyticsError: If retrieval fails
        """
        try:
            interactions = await self._repository.get_client_gallery_interactions(
                workspace_id=workspace_id,
                client_id=client_id,
                limit=limit,
            )

            # Add rank and calculate engagement score for each gallery
            for i, interaction in enumerate(interactions, 1):
                interaction["rank"] = i

                views = interaction.get("views", 0)
                favorites = interaction.get("favorites", 0)
                comments = interaction.get("comments", 0)
                downloads = interaction.get("downloads", 0)

                if views > 0:
                    weighted = favorites * 2 + comments * 3 + downloads * 2
                    interaction["engagement_score"] = round(
                        min(100.0, (weighted / views) * 20), 2
                    )
                else:
                    interaction["engagement_score"] = 0.0

            # Calculate summary
            total_views = sum(i.get("views", 0) for i in interactions)
            total_favorites = sum(i.get("favorites", 0) for i in interactions)
            total_downloads = sum(i.get("downloads", 0) for i in interactions)

            return {
                "client_id": str(client_id),
                "galleries": interactions,
                "total_galleries": len(interactions),
                "summary": {
                    "total_views": total_views,
                    "total_favorites": total_favorites,
                    "total_downloads": total_downloads,
                },
                "generated_at": datetime.now(timezone.utc).isoformat(),
            }

        except Exception as e:
            logger.error(
                "Failed to get client gallery interactions",
                extra={
                    "workspace_id": str(workspace_id),
                    "client_id": str(client_id),
                    "error": str(e),
                },
            )
            raise AnalyticsError(f"Failed to get client gallery interactions: {e}")

    async def get_workspace_client_stats(
        self,
        workspace_id: UUID,
        *,
        period_type: str = "all_time",
    ) -> dict[str, Any]:
        """Get aggregate client statistics for a workspace.

        Provides workspace-level client analytics including engagement
        distribution, churn risk breakdown, and segment analysis.

        Args:
            workspace_id: Workspace for tenant isolation
            period_type: Type of period to aggregate

        Returns:
            Aggregate client statistics with breakdowns

        Raises:
            AnalyticsError: If retrieval fails
        """
        try:
            stats = await self._repository.get_workspace_client_stats(
                workspace_id=workspace_id,
                period_type=period_type,
            )

            # Add segment definitions
            stats["segments"] = {
                "champions": {
                    "description": "Highly engaged, high value clients",
                    "criteria": "engagement_score >= 70 AND lifetime_value_cents > avg",
                },
                "loyal_customers": {
                    "description": "Consistent engagement over time",
                    "criteria": "visits_last_90_days > 5 AND engagement_score >= 40",
                },
                "at_risk": {
                    "description": "Previously active, now declining",
                    "criteria": "churn_risk_score >= 50",
                },
                "needs_attention": {
                    "description": "Low engagement but recent activity",
                    "criteria": "engagement_score < 40 AND days_since_last_activity < 30",
                },
            }

            # Calculate health score for the workspace
            total_clients = stats.get("total_clients", 0)
            if total_clients > 0:
                highly_engaged = stats.get("engagement_breakdown", {}).get("highly_engaged", 0)
                high_risk = stats.get("churn_risk_breakdown", {}).get("high_risk", 0)

                # Health score: weighted average of good vs bad indicators
                health_score = (
                    (highly_engaged / total_clients) * 50 +  # Engagement contribution
                    (1 - high_risk / total_clients) * 50     # Low churn contribution
                )
                stats["workspace_health_score"] = round(health_score, 2)
            else:
                stats["workspace_health_score"] = 0.0

            stats["period_type"] = period_type
            stats["generated_at"] = datetime.now(timezone.utc).isoformat()

            return stats

        except Exception as e:
            logger.error(
                "Failed to get workspace client stats",
                extra={
                    "workspace_id": str(workspace_id),
                    "error": str(e),
                },
            )
            raise AnalyticsError(f"Failed to get workspace client stats: {e}")

    async def compare_clients(
        self,
        workspace_id: UUID,
        client_ids: list[UUID],
        *,
        period_type: str = "all_time",
    ) -> dict[str, Any]:
        """Compare analytics across multiple clients.

        Provides side-by-side comparison of key metrics for the specified
        clients.

        Args:
            workspace_id: Workspace for tenant isolation
            client_ids: List of client IDs to compare (max 10)
            period_type: Type of period to compare

        Returns:
            Comparison data for all clients

        Raises:
            InvalidDateRangeError: If too many or too few clients requested
            AnalyticsError: If comparison fails
        """
        if len(client_ids) > 10:
            raise InvalidDateRangeError("Cannot compare more than 10 clients at once")

        if len(client_ids) < 2:
            raise InvalidDateRangeError("Need at least 2 clients to compare")

        try:
            now = datetime.now(timezone.utc)
            pool = await get_postgres_pool()
            clients_data = []

            async with pool.acquire() as conn:
                for client_id in client_ids:
                    # Get client info
                    client_info = await conn.fetchrow(
                        """
                        SELECT client_id, name, email, status, created_at
                        FROM clients
                        WHERE workspace_id = $1 AND client_id = $2
                        """,
                        workspace_id,
                        client_id,
                    )

                    if not client_info:
                        continue

                    # Get analytics record
                    analytics = await self._repository.get_client_analytics(
                        workspace_id=workspace_id,
                        client_id=client_id,
                        period_type=period_type,
                    )

                    if not analytics:
                        # Calculate if not exists
                        analytics = await self.calculate_client_analytics(
                            workspace_id=workspace_id,
                            client_id=client_id,
                            period_type=period_type,
                        )

                    clients_data.append({
                        "client_id": str(client_info["client_id"]),
                        "name": client_info["name"],
                        "email": client_info["email"],
                        "status": client_info["status"],
                        "metrics": {
                            "engagement_score": analytics.get("engagement_score", 0),
                            "total_gallery_views": analytics.get("total_gallery_views", 0),
                            "total_downloads": analytics.get("total_downloads", 0),
                            "total_favorites": analytics.get("total_favorites", 0),
                            "total_comments": analytics.get("total_comments", 0),
                            "lifetime_value_cents": analytics.get("lifetime_value_cents", 0),
                            "churn_risk_score": analytics.get("churn_risk_score"),
                            "total_sessions": analytics.get("total_sessions", 0),
                            "galleries_viewed": analytics.get("galleries_viewed", 0),
                        },
                    })

            # Calculate rankings
            if clients_data:
                # Rank by engagement score
                sorted_by_engagement = sorted(
                    clients_data,
                    key=lambda x: x["metrics"]["engagement_score"],
                    reverse=True,
                )
                for i, c in enumerate(sorted_by_engagement):
                    c["rank_by_engagement"] = i + 1

                # Rank by lifetime value
                sorted_by_ltv = sorted(
                    clients_data,
                    key=lambda x: x["metrics"]["lifetime_value_cents"],
                    reverse=True,
                )
                for i, c in enumerate(sorted_by_ltv):
                    c["rank_by_ltv"] = i + 1

                # Rank by activity (gallery views)
                sorted_by_activity = sorted(
                    clients_data,
                    key=lambda x: x["metrics"]["total_gallery_views"],
                    reverse=True,
                )
                for i, c in enumerate(sorted_by_activity):
                    c["rank_by_activity"] = i + 1

            return {
                "clients": clients_data,
                "client_count": len(clients_data),
                "period_type": period_type,
                "generated_at": now.isoformat(),
            }

        except Exception as e:
            if isinstance(e, InvalidDateRangeError):
                raise
            logger.error(
                "Failed to compare clients",
                extra={
                    "workspace_id": str(workspace_id),
                    "client_ids": [str(c) for c in client_ids],
                    "error": str(e),
                },
            )
            raise AnalyticsError(f"Failed to compare clients: {e}")

    # =========================================================================
    # Report Generation and Export (Task T019)
    # =========================================================================

    def _calculate_date_range(
        self,
        date_range_type: DateRangeType | str,
        custom_start_date: Optional[date] = None,
        custom_end_date: Optional[date] = None,
    ) -> tuple[date, date]:
        """Calculate start and end dates from a date range type.

        Converts predefined date range types (today, yesterday, last_7_days, etc.)
        into concrete start and end date values.

        Args:
            date_range_type: Predefined date range or 'custom'
            custom_start_date: Custom start date (required if date_range_type is 'custom')
            custom_end_date: Custom end date (required if date_range_type is 'custom')

        Returns:
            Tuple of (start_date, end_date)

        Raises:
            InvalidDateRangeError: If custom range is invalid or missing
        """
        # Convert enum to string if needed
        range_type = date_range_type.value if isinstance(date_range_type, DateRangeType) else date_range_type
        today = date.today()

        if range_type == "today":
            return today, today

        elif range_type == "yesterday":
            yesterday = today - timedelta(days=1)
            return yesterday, yesterday

        elif range_type == "last_7_days":
            return today - timedelta(days=6), today

        elif range_type == "last_30_days":
            return today - timedelta(days=29), today

        elif range_type == "last_90_days":
            return today - timedelta(days=89), today

        elif range_type == "this_month":
            start_of_month = today.replace(day=1)
            return start_of_month, today

        elif range_type == "last_month":
            first_of_current = today.replace(day=1)
            last_of_prev = first_of_current - timedelta(days=1)
            first_of_prev = last_of_prev.replace(day=1)
            return first_of_prev, last_of_prev

        elif range_type == "this_year":
            start_of_year = today.replace(month=1, day=1)
            return start_of_year, today

        elif range_type == "last_year":
            start_of_last_year = today.replace(year=today.year - 1, month=1, day=1)
            end_of_last_year = today.replace(year=today.year - 1, month=12, day=31)
            return start_of_last_year, end_of_last_year

        elif range_type == "custom":
            if not custom_start_date or not custom_end_date:
                raise InvalidDateRangeError(
                    "Custom date range requires both start_date and end_date"
                )
            if custom_start_date > custom_end_date:
                raise InvalidDateRangeError("Start date must be before end date")

            # Check max range
            days_span = (custom_end_date - custom_start_date).days
            if days_span > REPORT_MAX_DATE_RANGE_DAYS:
                raise InvalidDateRangeError(
                    f"Date range exceeds maximum of {REPORT_MAX_DATE_RANGE_DAYS} days"
                )

            return custom_start_date, custom_end_date

        else:
            # Default to last 30 days
            return today - timedelta(days=29), today

    # -------------------------------------------------------------------------
    # Report CRUD Operations
    # -------------------------------------------------------------------------

    async def create_report(
        self,
        workspace_id: UUID,
        name: str,
        report_type: ReportType | str,
        created_by_user_id: UUID,
        *,
        description: Optional[str] = None,
        config: Optional[dict[str, Any]] = None,
        metrics: Optional[list[str]] = None,
        filters: Optional[dict[str, Any]] = None,
        grouping: Optional[list[str]] = None,
        sorting: Optional[dict[str, Any]] = None,
        date_range_type: DateRangeType | str = DateRangeType.LAST_30_DAYS,
        custom_start_date: Optional[date] = None,
        custom_end_date: Optional[date] = None,
        export_format: ExportFormat | str = ExportFormat.CSV,
        export_config: Optional[dict[str, Any]] = None,
        is_scheduled: bool = False,
        schedule_cron: Optional[str] = None,
        schedule_timezone: str = "UTC",
        recipients: Optional[list[dict[str, Any]]] = None,
    ) -> dict[str, Any]:
        """Create a new custom report configuration.

        Creates a saved report configuration that can be run on-demand
        or scheduled for automatic generation.

        Args:
            workspace_id: Workspace for tenant isolation
            name: Display name for the report
            report_type: Type of report (dashboard_summary, gallery_performance, etc.)
            created_by_user_id: User creating the report
            description: Optional description of the report
            config: General report configuration options
            metrics: List of metric names to include
            filters: Filter criteria (e.g., gallery_ids, client_ids)
            grouping: Fields to group results by
            sorting: Sorting configuration (field, direction)
            date_range_type: Predefined date range or 'custom'
            custom_start_date: Custom start date (if date_range_type is 'custom')
            custom_end_date: Custom end date (if date_range_type is 'custom')
            export_format: Default export format (csv, pdf, xlsx)
            export_config: Export-specific configuration
            is_scheduled: Whether report runs on a schedule
            schedule_cron: Cron expression for scheduling
            schedule_timezone: Timezone for schedule
            recipients: Recipients for scheduled reports

        Returns:
            Created report configuration as dictionary

        Raises:
            InvalidReportTypeError: If report type is invalid
            InvalidDateRangeError: If date range is invalid
            AnalyticsError: If creation fails
        """
        # Convert enums to strings
        report_type_str = report_type.value if isinstance(report_type, ReportType) else report_type
        date_range_type_str = date_range_type.value if isinstance(date_range_type, DateRangeType) else date_range_type
        export_format_str = export_format.value if isinstance(export_format, ExportFormat) else export_format

        # Validate report type
        valid_report_types = {rt.value for rt in ReportType}
        if report_type_str not in valid_report_types:
            raise InvalidReportTypeError(report_type_str)

        # Validate export format
        valid_formats = {ef.value for ef in ExportFormat}
        if export_format_str not in valid_formats:
            raise InvalidExportFormatError(export_format_str)

        # Validate custom date range if applicable
        if date_range_type_str == "custom":
            self._calculate_date_range(
                date_range_type_str, custom_start_date, custom_end_date
            )

        try:
            report = await self._repository.create_report(
                workspace_id=workspace_id,
                name=name,
                report_type=report_type_str,
                created_by_user_id=created_by_user_id,
                description=description,
                config=config,
                metrics=metrics,
                filters=filters,
                grouping=grouping,
                sorting=sorting,
                date_range_type=date_range_type_str,
                custom_start_date=custom_start_date,
                custom_end_date=custom_end_date,
                export_format=export_format_str,
                export_config=export_config,
                is_scheduled=is_scheduled,
                schedule_cron=schedule_cron,
                schedule_timezone=schedule_timezone,
                recipients=recipients,
            )

            logger.info(
                "Created custom report",
                extra={
                    "workspace_id": str(workspace_id),
                    "report_id": report.get("report_id"),
                    "report_type": report_type_str,
                    "name": name,
                },
            )

            return report

        except Exception as e:
            if isinstance(e, (InvalidReportTypeError, InvalidDateRangeError)):
                raise
            logger.error(
                "Failed to create report",
                extra={
                    "workspace_id": str(workspace_id),
                    "name": name,
                    "error": str(e),
                },
            )
            raise AnalyticsError(f"Failed to create report: {e}")

    async def get_report(
        self,
        workspace_id: UUID,
        report_id: UUID,
    ) -> dict[str, Any]:
        """Get a custom report by ID.

        Args:
            workspace_id: Workspace for tenant isolation
            report_id: Report to retrieve

        Returns:
            Report configuration as dictionary

        Raises:
            ReportNotFoundError: If report doesn't exist
        """
        report = await self._repository.get_report_by_id(
            workspace_id=workspace_id,
            report_id=report_id,
        )

        if report is None:
            raise ReportNotFoundError(report_id)

        return report

    async def get_reports(
        self,
        workspace_id: UUID,
        *,
        report_types: Optional[list[ReportType | str]] = None,
        is_active: Optional[bool] = None,
        is_scheduled: Optional[bool] = None,
        created_by_user_id: Optional[UUID] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> dict[str, Any]:
        """Get custom reports with filtering and pagination.

        Args:
            workspace_id: Workspace for tenant isolation
            report_types: Filter by report types
            is_active: Filter by active status
            is_scheduled: Filter by scheduled status
            created_by_user_id: Filter by creator
            limit: Maximum results (default 50, max 500)
            offset: Pagination offset

        Returns:
            Paginated list of reports with metadata
        """
        # Convert enums to strings
        report_type_strs = None
        if report_types:
            report_type_strs = [
                rt.value if isinstance(rt, ReportType) else rt
                for rt in report_types
            ]

        return await self._repository.get_reports(
            workspace_id=workspace_id,
            report_types=report_type_strs,
            is_active=is_active,
            is_scheduled=is_scheduled,
            created_by_user_id=created_by_user_id,
            limit=limit,
            offset=offset,
        )

    async def update_report(
        self,
        workspace_id: UUID,
        report_id: UUID,
        updated_by_user_id: UUID,
        *,
        name: Optional[str] = None,
        description: Optional[str] = None,
        config: Optional[dict[str, Any]] = None,
        metrics: Optional[list[str]] = None,
        filters: Optional[dict[str, Any]] = None,
        grouping: Optional[list[str]] = None,
        sorting: Optional[dict[str, Any]] = None,
        date_range_type: Optional[DateRangeType | str] = None,
        custom_start_date: Optional[date] = None,
        custom_end_date: Optional[date] = None,
        export_format: Optional[ExportFormat | str] = None,
        export_config: Optional[dict[str, Any]] = None,
        is_scheduled: Optional[bool] = None,
        schedule_cron: Optional[str] = None,
        schedule_timezone: Optional[str] = None,
        recipients: Optional[list[dict[str, Any]]] = None,
        is_active: Optional[bool] = None,
    ) -> dict[str, Any]:
        """Update an existing custom report configuration.

        Args:
            workspace_id: Workspace for tenant isolation
            report_id: Report to update
            updated_by_user_id: User making the update
            name: New display name
            description: New description
            config: New configuration
            metrics: New metric list
            filters: New filters
            grouping: New grouping fields
            sorting: New sorting configuration
            date_range_type: New date range type
            custom_start_date: New custom start date
            custom_end_date: New custom end date
            export_format: New export format
            export_config: New export configuration
            is_scheduled: New scheduled status
            schedule_cron: New cron expression
            schedule_timezone: New timezone
            recipients: New recipients list
            is_active: New active status

        Returns:
            Updated report configuration as dictionary

        Raises:
            ReportNotFoundError: If report doesn't exist
            InvalidDateRangeError: If date range is invalid
            AnalyticsError: If update fails
        """
        # Check report exists
        existing = await self._repository.get_report_by_id(
            workspace_id=workspace_id,
            report_id=report_id,
        )
        if existing is None:
            raise ReportNotFoundError(report_id)

        # Convert enums to strings
        date_range_type_str = None
        if date_range_type is not None:
            date_range_type_str = (
                date_range_type.value
                if isinstance(date_range_type, DateRangeType)
                else date_range_type
            )

        export_format_str = None
        if export_format is not None:
            export_format_str = (
                export_format.value
                if isinstance(export_format, ExportFormat)
                else export_format
            )

        # Validate custom date range if applicable
        if date_range_type_str == "custom":
            self._calculate_date_range(
                date_range_type_str, custom_start_date, custom_end_date
            )

        try:
            report = await self._repository.update_report(
                workspace_id=workspace_id,
                report_id=report_id,
                name=name,
                description=description,
                config=config,
                metrics=metrics,
                filters=filters,
                grouping=grouping,
                sorting=sorting,
                date_range_type=date_range_type_str,
                custom_start_date=custom_start_date,
                custom_end_date=custom_end_date,
                export_format=export_format_str,
                export_config=export_config,
                is_scheduled=is_scheduled,
                schedule_cron=schedule_cron,
                schedule_timezone=schedule_timezone,
                recipients=recipients,
                is_active=is_active,
                updated_by_user_id=updated_by_user_id,
            )

            if report is None:
                raise ReportNotFoundError(report_id)

            logger.info(
                "Updated custom report",
                extra={
                    "workspace_id": str(workspace_id),
                    "report_id": str(report_id),
                },
            )

            return report

        except Exception as e:
            if isinstance(e, (ReportNotFoundError, InvalidDateRangeError)):
                raise
            logger.error(
                "Failed to update report",
                extra={
                    "workspace_id": str(workspace_id),
                    "report_id": str(report_id),
                    "error": str(e),
                },
            )
            raise AnalyticsError(f"Failed to update report: {e}")

    async def delete_report(
        self,
        workspace_id: UUID,
        report_id: UUID,
    ) -> bool:
        """Delete a custom report configuration.

        Also deletes associated exports.

        Args:
            workspace_id: Workspace for tenant isolation
            report_id: Report to delete

        Returns:
            True if deleted successfully

        Raises:
            ReportNotFoundError: If report doesn't exist
        """
        # Check report exists
        existing = await self._repository.get_report_by_id(
            workspace_id=workspace_id,
            report_id=report_id,
        )
        if existing is None:
            raise ReportNotFoundError(report_id)

        deleted = await self._repository.delete_report(
            workspace_id=workspace_id,
            report_id=report_id,
        )

        if deleted:
            logger.info(
                "Deleted custom report",
                extra={
                    "workspace_id": str(workspace_id),
                    "report_id": str(report_id),
                },
            )

        return deleted

    # -------------------------------------------------------------------------
    # Report Execution
    # -------------------------------------------------------------------------

    async def run_report(
        self,
        workspace_id: UUID,
        report_id: UUID,
        *,
        override_date_range_type: Optional[DateRangeType | str] = None,
        override_start_date: Optional[date] = None,
        override_end_date: Optional[date] = None,
    ) -> dict[str, Any]:
        """Run a saved report and return the data.

        Executes the report configuration and returns the aggregated data
        without generating an export file.

        Args:
            workspace_id: Workspace for tenant isolation
            report_id: Report to run
            override_date_range_type: Override the report's date range type
            override_start_date: Override start date (for custom range)
            override_end_date: Override end date (for custom range)

        Returns:
            Report data with metrics and metadata

        Raises:
            ReportNotFoundError: If report doesn't exist
            ReportGenerationError: If report execution fails
        """
        # Get report configuration
        report = await self._repository.get_report_by_id(
            workspace_id=workspace_id,
            report_id=report_id,
        )
        if report is None:
            raise ReportNotFoundError(report_id)

        # Determine date range
        date_range_type = override_date_range_type or report.get("date_range_type", "last_30_days")
        if override_date_range_type and override_date_range_type == "custom":
            start_date, end_date = self._calculate_date_range(
                date_range_type, override_start_date, override_end_date
            )
        elif report.get("date_range_type") == "custom":
            start_date, end_date = self._calculate_date_range(
                "custom",
                report.get("custom_start_date"),
                report.get("custom_end_date"),
            )
        else:
            start_date, end_date = self._calculate_date_range(date_range_type)

        try:
            # Generate report data based on type
            report_type = report.get("report_type", "custom")
            data = await self._generate_report_data(
                workspace_id=workspace_id,
                report_type=report_type,
                start_date=start_date,
                end_date=end_date,
                metrics=report.get("metrics", []),
                filters=report.get("filters", {}),
                grouping=report.get("grouping", []),
                sorting=report.get("sorting", {}),
            )

            # Update report run status
            await self._repository.update_report_run_status(
                workspace_id=workspace_id,
                report_id=report_id,
                status="success",
            )

            return {
                "report_id": str(report_id),
                "report_name": report.get("name"),
                "report_type": report_type,
                "date_range": {
                    "type": date_range_type if isinstance(date_range_type, str) else date_range_type.value,
                    "start_date": start_date.isoformat(),
                    "end_date": end_date.isoformat(),
                },
                "data": data,
                "generated_at": datetime.now(timezone.utc).isoformat(),
            }

        except Exception as e:
            # Update report run status with error
            await self._repository.update_report_run_status(
                workspace_id=workspace_id,
                report_id=report_id,
                status="failed",
                error_message=str(e),
            )
            logger.error(
                "Failed to run report",
                extra={
                    "workspace_id": str(workspace_id),
                    "report_id": str(report_id),
                    "error": str(e),
                },
            )
            raise ReportGenerationError(f"Failed to run report: {e}")

    async def _generate_report_data(
        self,
        workspace_id: UUID,
        report_type: str,
        start_date: date,
        end_date: date,
        metrics: list[str],
        filters: dict[str, Any],
        grouping: list[str],
        sorting: dict[str, Any],
    ) -> dict[str, Any]:
        """Generate report data based on report type.

        Internal method that dispatches to the appropriate data generation
        method based on the report type.

        Args:
            workspace_id: Workspace for tenant isolation
            report_type: Type of report to generate
            start_date: Start date for data
            end_date: End date for data
            metrics: Metrics to include
            filters: Filter criteria
            grouping: Grouping fields
            sorting: Sorting configuration

        Returns:
            Report data dictionary
        """
        start_datetime = datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc)
        end_datetime = datetime.combine(end_date, datetime.max.time(), tzinfo=timezone.utc)

        if report_type == "dashboard_summary":
            return await self._generate_dashboard_report(
                workspace_id, start_datetime, end_datetime, metrics, filters
            )
        elif report_type == "gallery_performance":
            return await self._generate_gallery_performance_report(
                workspace_id, start_datetime, end_datetime, metrics, filters, grouping, sorting
            )
        elif report_type == "client_engagement":
            return await self._generate_client_engagement_report(
                workspace_id, start_datetime, end_datetime, metrics, filters, grouping, sorting
            )
        elif report_type == "revenue_report":
            return await self._generate_revenue_report(
                workspace_id, start_datetime, end_datetime, metrics, filters
            )
        elif report_type == "download_report":
            return await self._generate_download_report(
                workspace_id, start_datetime, end_datetime, metrics, filters, grouping
            )
        else:
            # Custom report - combine multiple data sources
            return await self._generate_custom_report(
                workspace_id, start_datetime, end_datetime, metrics, filters, grouping, sorting
            )

    async def _generate_dashboard_report(
        self,
        workspace_id: UUID,
        start_date: datetime,
        end_date: datetime,
        metrics: list[str],
        filters: dict[str, Any],
    ) -> dict[str, Any]:
        """Generate dashboard summary report data."""
        # Use existing dashboard metrics method
        dashboard_data = await self.get_dashboard_metrics(
            workspace_id=workspace_id,
            start_date=start_date,
            end_date=end_date,
        )

        return {
            "summary": dashboard_data.get("overview", {}),
            "quick_stats": dashboard_data.get("quick_stats", {}),
            "trends": dashboard_data.get("trends", {}),
            "top_galleries": dashboard_data.get("top_galleries", []),
            "device_breakdown": dashboard_data.get("device_breakdown", {}),
            "geographic_breakdown": dashboard_data.get("geographic_breakdown", []),
        }

    async def _generate_gallery_performance_report(
        self,
        workspace_id: UUID,
        start_date: datetime,
        end_date: datetime,
        metrics: list[str],
        filters: dict[str, Any],
        grouping: list[str],
        sorting: dict[str, Any],
    ) -> dict[str, Any]:
        """Generate gallery performance report data."""
        # Get gallery IDs from filters if specified
        gallery_ids = filters.get("gallery_ids", [])

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Base query for galleries
            query = """
                SELECT
                    g.gallery_id,
                    g.name AS gallery_name,
                    g.created_at AS gallery_created_at,
                    COUNT(DISTINCT e.event_id) FILTER (WHERE e.event_type = 'gallery_view') AS total_views,
                    COUNT(DISTINCT e.visitor_id) FILTER (WHERE e.event_type = 'gallery_view') AS unique_visitors,
                    COUNT(DISTINCT e.event_id) FILTER (WHERE e.event_type = 'asset_download') AS total_downloads,
                    COUNT(DISTINCT e.event_id) FILTER (WHERE e.event_type = 'asset_favorite') AS total_favorites,
                    COUNT(DISTINCT e.event_id) FILTER (WHERE e.event_type = 'asset_comment') AS total_comments,
                    COUNT(DISTINCT e.event_id) FILTER (WHERE e.event_type = 'asset_select') AS total_selections
                FROM galleries g
                LEFT JOIN analytics_events e ON g.gallery_id = e.gallery_id
                    AND e.occurred_at >= $2 AND e.occurred_at <= $3
                WHERE g.workspace_id = $1 AND g.deleted = FALSE
            """
            params: list[Any] = [workspace_id, start_date, end_date]

            if gallery_ids:
                query += f" AND g.gallery_id = ANY(${len(params) + 1})"
                params.append(gallery_ids)

            query += """
                GROUP BY g.gallery_id, g.name, g.created_at
                ORDER BY total_views DESC
                LIMIT 100
            """

            rows = await conn.fetch(query, *params)

            galleries = []
            for row in rows:
                views = row["total_views"] or 0
                downloads = row["total_downloads"] or 0
                favorites = row["total_favorites"] or 0
                comments = row["total_comments"] or 0
                selections = row["total_selections"] or 0

                # Calculate engagement score
                engagement_score = 0.0
                if views > 0:
                    weighted = favorites * 2 + comments * 3 + selections * 1.5 + downloads * 2
                    engagement_score = min(100.0, (weighted / views) * 20)

                galleries.append({
                    "gallery_id": str(row["gallery_id"]),
                    "gallery_name": row["gallery_name"],
                    "created_at": row["gallery_created_at"].isoformat() if row["gallery_created_at"] else None,
                    "total_views": views,
                    "unique_visitors": row["unique_visitors"] or 0,
                    "total_downloads": downloads,
                    "total_favorites": favorites,
                    "total_comments": comments,
                    "total_selections": selections,
                    "engagement_score": round(engagement_score, 2),
                })

            # Calculate totals
            total_views = sum(g["total_views"] for g in galleries)
            total_downloads = sum(g["total_downloads"] for g in galleries)

            return {
                "galleries": galleries,
                "total_galleries": len(galleries),
                "summary": {
                    "total_views": total_views,
                    "total_downloads": total_downloads,
                    "avg_views_per_gallery": round(total_views / len(galleries), 2) if galleries else 0,
                    "avg_engagement_score": round(
                        sum(g["engagement_score"] for g in galleries) / len(galleries), 2
                    ) if galleries else 0,
                },
            }

    async def _generate_client_engagement_report(
        self,
        workspace_id: UUID,
        start_date: datetime,
        end_date: datetime,
        metrics: list[str],
        filters: dict[str, Any],
        grouping: list[str],
        sorting: dict[str, Any],
    ) -> dict[str, Any]:
        """Generate client engagement report data."""
        client_ids = filters.get("client_ids", [])

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            query = """
                SELECT
                    c.client_id,
                    c.name AS client_name,
                    c.email AS client_email,
                    c.status,
                    COUNT(DISTINCT e.event_id) FILTER (WHERE e.event_type = 'gallery_view') AS gallery_views,
                    COUNT(DISTINCT e.event_id) FILTER (WHERE e.event_type = 'asset_view') AS asset_views,
                    COUNT(DISTINCT e.event_id) FILTER (WHERE e.event_type = 'asset_download') AS downloads,
                    COUNT(DISTINCT e.event_id) FILTER (WHERE e.event_type = 'asset_favorite') AS favorites,
                    COUNT(DISTINCT e.event_id) FILTER (WHERE e.event_type = 'asset_comment') AS comments,
                    COUNT(DISTINCT e.session_id) AS total_sessions,
                    COUNT(DISTINCT e.gallery_id) AS galleries_viewed
                FROM clients c
                LEFT JOIN analytics_events e ON c.client_id = e.client_id
                    AND e.occurred_at >= $2 AND e.occurred_at <= $3
                WHERE c.workspace_id = $1
            """
            params: list[Any] = [workspace_id, start_date, end_date]

            if client_ids:
                query += f" AND c.client_id = ANY(${len(params) + 1})"
                params.append(client_ids)

            query += """
                GROUP BY c.client_id, c.name, c.email, c.status
                ORDER BY gallery_views DESC
                LIMIT 100
            """

            rows = await conn.fetch(query, *params)

            clients = []
            for row in rows:
                views = (row["gallery_views"] or 0) + (row["asset_views"] or 0)
                downloads = row["downloads"] or 0
                favorites = row["favorites"] or 0
                comments = row["comments"] or 0

                # Calculate engagement score
                engagement_score = min(100.0, (
                    (row["gallery_views"] or 0) * 0.1 +
                    (row["asset_views"] or 0) * 0.05 +
                    favorites * 2 +
                    comments * 3 +
                    downloads * 2
                ))

                clients.append({
                    "client_id": str(row["client_id"]),
                    "client_name": row["client_name"],
                    "client_email": row["client_email"],
                    "status": row["status"],
                    "gallery_views": row["gallery_views"] or 0,
                    "asset_views": row["asset_views"] or 0,
                    "downloads": downloads,
                    "favorites": favorites,
                    "comments": comments,
                    "total_sessions": row["total_sessions"] or 0,
                    "galleries_viewed": row["galleries_viewed"] or 0,
                    "engagement_score": round(engagement_score, 2),
                })

            return {
                "clients": clients,
                "total_clients": len(clients),
                "summary": {
                    "total_gallery_views": sum(c["gallery_views"] for c in clients),
                    "total_downloads": sum(c["downloads"] for c in clients),
                    "avg_engagement_score": round(
                        sum(c["engagement_score"] for c in clients) / len(clients), 2
                    ) if clients else 0,
                },
            }

    async def _generate_revenue_report(
        self,
        workspace_id: UUID,
        start_date: datetime,
        end_date: datetime,
        metrics: list[str],
        filters: dict[str, Any],
    ) -> dict[str, Any]:
        """Generate revenue report data."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Get revenue from client analytics if available
            revenue_data = await conn.fetch(
                """
                SELECT
                    c.client_id,
                    c.name AS client_name,
                    COALESCE(ca.lifetime_value_cents, 0) AS lifetime_value_cents,
                    COALESCE(ca.period_revenue_cents, 0) AS period_revenue_cents
                FROM clients c
                LEFT JOIN client_analytics ca ON c.client_id = ca.client_id
                    AND ca.period_type = 'all_time'
                WHERE c.workspace_id = $1
                ORDER BY ca.lifetime_value_cents DESC NULLS LAST
                LIMIT 50
                """,
                workspace_id,
            )

            clients = []
            total_ltv = 0
            for row in revenue_data:
                ltv = row["lifetime_value_cents"] or 0
                total_ltv += ltv
                clients.append({
                    "client_id": str(row["client_id"]),
                    "client_name": row["client_name"],
                    "lifetime_value_cents": ltv,
                    "lifetime_value_formatted": f"${ltv / 100:.2f}",
                    "period_revenue_cents": row["period_revenue_cents"] or 0,
                })

            return {
                "clients": clients,
                "summary": {
                    "total_lifetime_value_cents": total_ltv,
                    "total_lifetime_value_formatted": f"${total_ltv / 100:.2f}",
                    "avg_client_value_cents": round(total_ltv / len(clients)) if clients else 0,
                    "client_count": len(clients),
                },
            }

    async def _generate_download_report(
        self,
        workspace_id: UUID,
        start_date: datetime,
        end_date: datetime,
        metrics: list[str],
        filters: dict[str, Any],
        grouping: list[str],
    ) -> dict[str, Any]:
        """Generate download report data."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Get download events
            downloads = await conn.fetch(
                """
                SELECT
                    e.event_id,
                    e.gallery_id,
                    e.asset_id,
                    e.client_id,
                    e.occurred_at,
                    e.numeric_value AS file_size,
                    e.metadata,
                    g.name AS gallery_name,
                    c.name AS client_name,
                    c.email AS client_email
                FROM analytics_events e
                LEFT JOIN galleries g ON e.gallery_id = g.gallery_id
                LEFT JOIN clients c ON e.client_id = c.client_id
                WHERE e.workspace_id = $1
                    AND e.event_type = 'asset_download'
                    AND e.occurred_at >= $2 AND e.occurred_at <= $3
                ORDER BY e.occurred_at DESC
                LIMIT 1000
                """,
                workspace_id,
                start_date,
                end_date,
            )

            download_list = []
            total_size = 0
            for row in downloads:
                size = row["file_size"] or 0
                total_size += size
                download_list.append({
                    "event_id": str(row["event_id"]),
                    "gallery_id": str(row["gallery_id"]) if row["gallery_id"] else None,
                    "gallery_name": row["gallery_name"],
                    "asset_id": str(row["asset_id"]) if row["asset_id"] else None,
                    "client_id": str(row["client_id"]) if row["client_id"] else None,
                    "client_name": row["client_name"],
                    "client_email": row["client_email"],
                    "occurred_at": row["occurred_at"].isoformat(),
                    "file_size_bytes": size,
                })

            # Group by gallery if requested
            by_gallery = {}
            for dl in download_list:
                gid = dl.get("gallery_id") or "unknown"
                if gid not in by_gallery:
                    by_gallery[gid] = {
                        "gallery_id": gid,
                        "gallery_name": dl.get("gallery_name") or "Unknown",
                        "download_count": 0,
                        "total_size_bytes": 0,
                    }
                by_gallery[gid]["download_count"] += 1
                by_gallery[gid]["total_size_bytes"] += dl.get("file_size_bytes", 0)

            return {
                "downloads": download_list[:100],  # Limit for response
                "total_downloads": len(download_list),
                "by_gallery": list(by_gallery.values()),
                "summary": {
                    "total_download_count": len(download_list),
                    "total_size_bytes": total_size,
                    "total_size_formatted": f"{total_size / (1024 * 1024):.2f} MB",
                    "unique_galleries": len(by_gallery),
                },
            }

    async def _generate_custom_report(
        self,
        workspace_id: UUID,
        start_date: datetime,
        end_date: datetime,
        metrics: list[str],
        filters: dict[str, Any],
        grouping: list[str],
        sorting: dict[str, Any],
    ) -> dict[str, Any]:
        """Generate custom report with selected metrics."""
        data: dict[str, Any] = {
            "metrics": {},
            "details": [],
        }

        # Map requested metrics to data sources
        if not metrics:
            # Default metrics
            metrics = ["gallery_views", "gallery_downloads", "client_engagement_score"]

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Gallery metrics
            if any(m.startswith("gallery_") for m in metrics):
                gallery_stats = await conn.fetchrow(
                    """
                    SELECT
                        COUNT(DISTINCT event_id) FILTER (WHERE event_type = 'gallery_view') AS total_views,
                        COUNT(DISTINCT visitor_id) FILTER (WHERE event_type = 'gallery_view') AS unique_visitors,
                        COUNT(DISTINCT event_id) FILTER (WHERE event_type = 'asset_download') AS total_downloads,
                        COUNT(DISTINCT event_id) FILTER (WHERE event_type = 'asset_favorite') AS total_favorites,
                        COUNT(DISTINCT event_id) FILTER (WHERE event_type = 'asset_comment') AS total_comments
                    FROM analytics_events
                    WHERE workspace_id = $1 AND occurred_at >= $2 AND occurred_at <= $3
                    """,
                    workspace_id,
                    start_date,
                    end_date,
                )

                if gallery_stats:
                    data["metrics"]["gallery_views"] = gallery_stats["total_views"] or 0
                    data["metrics"]["gallery_unique_visitors"] = gallery_stats["unique_visitors"] or 0
                    data["metrics"]["gallery_downloads"] = gallery_stats["total_downloads"] or 0
                    data["metrics"]["gallery_favorites"] = gallery_stats["total_favorites"] or 0
                    data["metrics"]["gallery_comments"] = gallery_stats["total_comments"] or 0

            # Client metrics
            if any(m.startswith("client_") for m in metrics):
                client_stats = await conn.fetchrow(
                    """
                    SELECT
                        COUNT(DISTINCT client_id) AS total_clients,
                        AVG(engagement_score) AS avg_engagement_score,
                        SUM(lifetime_value_cents) AS total_ltv
                    FROM client_analytics
                    WHERE workspace_id = $1 AND period_type = 'all_time'
                    """,
                    workspace_id,
                )

                if client_stats:
                    data["metrics"]["client_total"] = client_stats["total_clients"] or 0
                    data["metrics"]["client_avg_engagement"] = round(client_stats["avg_engagement_score"] or 0, 2)
                    data["metrics"]["client_total_ltv"] = client_stats["total_ltv"] or 0

            # Session metrics
            if any(m in metrics for m in ["session_count", "session_duration_avg", "bounce_rate"]):
                session_stats = await conn.fetchrow(
                    """
                    SELECT
                        COUNT(DISTINCT session_id) AS session_count,
                        AVG(duration_ms) AS avg_duration_ms
                    FROM analytics_events
                    WHERE workspace_id = $1
                        AND occurred_at >= $2 AND occurred_at <= $3
                        AND session_id IS NOT NULL
                    """,
                    workspace_id,
                    start_date,
                    end_date,
                )

                if session_stats:
                    data["metrics"]["session_count"] = session_stats["session_count"] or 0
                    data["metrics"]["session_duration_avg_ms"] = round(session_stats["avg_duration_ms"] or 0)

        return data

    # -------------------------------------------------------------------------
    # Export Generation
    # -------------------------------------------------------------------------

    async def generate_export(
        self,
        workspace_id: UUID,
        report_type: ReportType | str,
        export_format: ExportFormat | str,
        generated_by_user_id: Optional[UUID] = None,
        *,
        report_id: Optional[UUID] = None,
        name: Optional[str] = None,
        date_range_type: DateRangeType | str = DateRangeType.LAST_30_DAYS,
        custom_start_date: Optional[date] = None,
        custom_end_date: Optional[date] = None,
        metrics: Optional[list[str]] = None,
        filters: Optional[dict[str, Any]] = None,
        grouping: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        """Generate an export file for analytics data.

        Creates an export file in the specified format (CSV, PDF, XLSX)
        containing the requested analytics data.

        Args:
            workspace_id: Workspace for tenant isolation
            report_type: Type of report to generate
            export_format: Export format (csv, pdf, xlsx)
            generated_by_user_id: User generating the export
            report_id: Source report configuration (optional)
            name: Custom name for the export
            date_range_type: Date range preset or 'custom'
            custom_start_date: Custom start date
            custom_end_date: Custom end date
            metrics: Metrics to include
            filters: Filter criteria
            grouping: Grouping fields

        Returns:
            Export record with status and storage information

        Raises:
            InvalidReportTypeError: If report type is invalid
            InvalidExportFormatError: If export format is invalid
            ExportGenerationError: If export generation fails
        """
        start_time = time.time()

        # Convert enums to strings
        report_type_str = report_type.value if isinstance(report_type, ReportType) else report_type
        export_format_str = export_format.value if isinstance(export_format, ExportFormat) else export_format
        date_range_type_str = date_range_type.value if isinstance(date_range_type, DateRangeType) else date_range_type

        # Validate
        valid_report_types = {rt.value for rt in ReportType}
        if report_type_str not in valid_report_types:
            raise InvalidReportTypeError(report_type_str)

        valid_formats = {ef.value for ef in ExportFormat}
        if export_format_str not in valid_formats:
            raise InvalidExportFormatError(export_format_str)

        # Calculate date range
        start_date, end_date = self._calculate_date_range(
            date_range_type_str, custom_start_date, custom_end_date
        )

        # Generate export name
        if not name:
            name = f"{report_type_str}_{start_date.isoformat()}_{end_date.isoformat()}"

        # Calculate expiration
        expires_at = datetime.now(timezone.utc) + timedelta(days=REPORT_EXPORT_RETENTION_DAYS)

        # Generate storage key
        storage_key = f"exports/{workspace_id}/{report_type_str}/{name}.{export_format_str}"

        try:
            # Create export record in generating status
            export_record = await self._repository.create_report_export(
                workspace_id=workspace_id,
                name=name,
                export_format=export_format_str,
                start_date=start_date,
                end_date=end_date,
                storage_key=storage_key,
                expires_at=expires_at,
                report_id=report_id,
                status="generating",
                generated_by_user_id=generated_by_user_id,
            )

            export_id = UUID(export_record["export_id"])

            # Generate report data
            data = await self._generate_report_data(
                workspace_id=workspace_id,
                report_type=report_type_str,
                start_date=start_date,
                end_date=end_date,
                metrics=metrics or [],
                filters=filters or {},
                grouping=grouping or [],
                sorting={},
            )

            # Generate file content based on format
            if export_format_str == "csv":
                content, file_size = self._generate_csv_content(data, report_type_str)
            elif export_format_str == "xlsx":
                # For XLSX, we'd need openpyxl - for now, fall back to CSV
                content, file_size = self._generate_csv_content(data, report_type_str)
            elif export_format_str == "pdf":
                # For PDF, we'd need a PDF library - for now, generate text summary
                content, file_size = self._generate_text_summary(data, report_type_str, start_date, end_date)
            else:
                content, file_size = self._generate_csv_content(data, report_type_str)

            # Calculate file hash
            file_hash = hashlib.sha256(content.encode() if isinstance(content, str) else content).hexdigest()

            # Calculate generation time
            generation_time_ms = int((time.time() - start_time) * 1000)

            # Update export record with success
            updated_export = await self._repository.update_report_export(
                workspace_id=workspace_id,
                export_id=export_id,
                status="completed",
                file_size_bytes=file_size,
                file_hash=file_hash,
                generation_time_ms=generation_time_ms,
            )

            logger.info(
                "Generated export successfully",
                extra={
                    "workspace_id": str(workspace_id),
                    "export_id": str(export_id),
                    "format": export_format_str,
                    "file_size": file_size,
                    "generation_time_ms": generation_time_ms,
                },
            )

            # Add the content to the response for immediate download
            if updated_export:
                updated_export["content"] = content
                updated_export["content_type"] = self._get_content_type(export_format_str)

            return updated_export or export_record

        except Exception as e:
            if isinstance(e, (InvalidReportTypeError, InvalidExportFormatError, InvalidDateRangeError)):
                raise

            # Update export record with failure
            if "export_id" in locals():
                await self._repository.update_report_export(
                    workspace_id=workspace_id,
                    export_id=export_id,
                    status="failed",
                    error_message=str(e),
                )

            logger.error(
                "Failed to generate export",
                extra={
                    "workspace_id": str(workspace_id),
                    "report_type": report_type_str,
                    "format": export_format_str,
                    "error": str(e),
                },
            )
            raise ExportGenerationError(f"Failed to generate export: {e}")

    def _generate_csv_content(
        self,
        data: dict[str, Any],
        report_type: str,
    ) -> tuple[str, int]:
        """Generate CSV content from report data.

        Args:
            data: Report data dictionary
            report_type: Type of report

        Returns:
            Tuple of (csv_content, file_size_bytes)
        """
        output = io.StringIO()
        writer = csv.writer(output)

        # Determine data to export based on report type
        if report_type == "gallery_performance":
            galleries = data.get("galleries", [])
            if galleries:
                # Write header
                writer.writerow([
                    "Gallery ID", "Gallery Name", "Created At",
                    "Total Views", "Unique Visitors", "Downloads",
                    "Favorites", "Comments", "Selections", "Engagement Score"
                ])
                # Write data rows
                for g in galleries:
                    writer.writerow([
                        g.get("gallery_id"),
                        g.get("gallery_name"),
                        g.get("created_at"),
                        g.get("total_views", 0),
                        g.get("unique_visitors", 0),
                        g.get("total_downloads", 0),
                        g.get("total_favorites", 0),
                        g.get("total_comments", 0),
                        g.get("total_selections", 0),
                        g.get("engagement_score", 0),
                    ])

        elif report_type == "client_engagement":
            clients = data.get("clients", [])
            if clients:
                writer.writerow([
                    "Client ID", "Name", "Email", "Status",
                    "Gallery Views", "Asset Views", "Downloads",
                    "Favorites", "Comments", "Sessions", "Engagement Score"
                ])
                for c in clients:
                    writer.writerow([
                        c.get("client_id"),
                        c.get("client_name"),
                        c.get("client_email"),
                        c.get("status"),
                        c.get("gallery_views", 0),
                        c.get("asset_views", 0),
                        c.get("downloads", 0),
                        c.get("favorites", 0),
                        c.get("comments", 0),
                        c.get("total_sessions", 0),
                        c.get("engagement_score", 0),
                    ])

        elif report_type == "download_report":
            downloads = data.get("downloads", [])
            if downloads:
                writer.writerow([
                    "Event ID", "Gallery ID", "Gallery Name", "Asset ID",
                    "Client ID", "Client Name", "Client Email",
                    "Downloaded At", "File Size (bytes)"
                ])
                for d in downloads:
                    writer.writerow([
                        d.get("event_id"),
                        d.get("gallery_id"),
                        d.get("gallery_name"),
                        d.get("asset_id"),
                        d.get("client_id"),
                        d.get("client_name"),
                        d.get("client_email"),
                        d.get("occurred_at"),
                        d.get("file_size_bytes", 0),
                    ])

        elif report_type == "revenue_report":
            clients = data.get("clients", [])
            if clients:
                writer.writerow([
                    "Client ID", "Client Name",
                    "Lifetime Value (cents)", "Lifetime Value ($)",
                    "Period Revenue (cents)"
                ])
                for c in clients:
                    writer.writerow([
                        c.get("client_id"),
                        c.get("client_name"),
                        c.get("lifetime_value_cents", 0),
                        c.get("lifetime_value_formatted", "$0.00"),
                        c.get("period_revenue_cents", 0),
                    ])

        else:
            # Dashboard summary or custom report - export metrics
            summary = data.get("summary", data.get("metrics", {}))
            writer.writerow(["Metric", "Value"])
            for key, value in summary.items():
                writer.writerow([key, value])

            # Add any nested lists
            for key in ["top_galleries", "galleries", "clients", "downloads"]:
                if key in data and isinstance(data[key], list):
                    writer.writerow([])
                    writer.writerow([f"--- {key.replace('_', ' ').title()} ---"])
                    if data[key]:
                        # Write headers from first item's keys
                        headers = list(data[key][0].keys())
                        writer.writerow(headers)
                        for item in data[key]:
                            writer.writerow([item.get(h) for h in headers])

        content = output.getvalue()
        return content, len(content.encode("utf-8"))

    def _generate_text_summary(
        self,
        data: dict[str, Any],
        report_type: str,
        start_date: date,
        end_date: date,
    ) -> tuple[str, int]:
        """Generate text summary for PDF-like output.

        Args:
            data: Report data dictionary
            report_type: Type of report
            start_date: Report start date
            end_date: Report end date

        Returns:
            Tuple of (text_content, file_size_bytes)
        """
        lines = [
            "=" * 60,
            f"Analytics Report: {report_type.replace('_', ' ').title()}",
            f"Period: {start_date.isoformat()} to {end_date.isoformat()}",
            f"Generated: {datetime.now(timezone.utc).isoformat()}",
            "=" * 60,
            "",
        ]

        # Add summary
        summary = data.get("summary", data.get("metrics", {}))
        if summary:
            lines.append("SUMMARY")
            lines.append("-" * 40)
            for key, value in summary.items():
                formatted_key = key.replace("_", " ").title()
                lines.append(f"  {formatted_key}: {value}")
            lines.append("")

        # Add top items if available
        for key in ["top_galleries", "galleries", "clients"]:
            if key in data and isinstance(data[key], list) and data[key]:
                lines.append(f"{key.replace('_', ' ').upper()}")
                lines.append("-" * 40)
                for i, item in enumerate(data[key][:10], 1):
                    name = item.get("gallery_name") or item.get("client_name") or f"Item {i}"
                    lines.append(f"  {i}. {name}")
                lines.append("")

        content = "\n".join(lines)
        return content, len(content.encode("utf-8"))

    def _get_content_type(self, export_format: str) -> str:
        """Get MIME content type for export format."""
        content_types = {
            "csv": "text/csv",
            "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "pdf": "application/pdf",
        }
        return content_types.get(export_format, "application/octet-stream")

    # -------------------------------------------------------------------------
    # Export Management
    # -------------------------------------------------------------------------

    async def get_export(
        self,
        workspace_id: UUID,
        export_id: UUID,
    ) -> dict[str, Any]:
        """Get an export record by ID.

        Args:
            workspace_id: Workspace for tenant isolation
            export_id: Export to retrieve

        Returns:
            Export record as dictionary

        Raises:
            ExportNotFoundError: If export doesn't exist
        """
        export = await self._repository.get_report_export_by_id(
            workspace_id=workspace_id,
            export_id=export_id,
        )

        if export is None:
            raise ExportNotFoundError(export_id)

        return export

    async def get_exports(
        self,
        workspace_id: UUID,
        *,
        report_id: Optional[UUID] = None,
        status: Optional[ReportExportStatus | str] = None,
        export_format: Optional[ExportFormat | str] = None,
        generated_by_user_id: Optional[UUID] = None,
        include_expired: bool = False,
        limit: int = 50,
        offset: int = 0,
    ) -> dict[str, Any]:
        """Get exports with filtering and pagination.

        Args:
            workspace_id: Workspace for tenant isolation
            report_id: Filter by source report
            status: Filter by status
            export_format: Filter by format
            generated_by_user_id: Filter by generator
            include_expired: Include expired exports
            limit: Maximum results (default 50, max 500)
            offset: Pagination offset

        Returns:
            Paginated list of exports with metadata
        """
        # Convert enums to strings
        status_str = None
        if status is not None:
            status_str = status.value if isinstance(status, ReportExportStatus) else status

        format_str = None
        if export_format is not None:
            format_str = export_format.value if isinstance(export_format, ExportFormat) else export_format

        return await self._repository.get_report_exports(
            workspace_id=workspace_id,
            report_id=report_id,
            status=status_str,
            export_format=format_str,
            generated_by_user_id=generated_by_user_id,
            include_expired=include_expired,
            limit=limit,
            offset=offset,
        )

    async def download_export(
        self,
        workspace_id: UUID,
        export_id: UUID,
    ) -> dict[str, Any]:
        """Get export download information and increment download count.

        Validates the export exists, is completed, and not expired.
        Increments the download count and returns download information.

        Args:
            workspace_id: Workspace for tenant isolation
            export_id: Export to download

        Returns:
            Download information including storage key

        Raises:
            ExportNotFoundError: If export doesn't exist
            ExportExpiredError: If export has expired
            AnalyticsError: If export is not in completed status
        """
        export = await self._repository.get_report_export_by_id(
            workspace_id=workspace_id,
            export_id=export_id,
        )

        if export is None:
            raise ExportNotFoundError(export_id)

        # Check status
        if export.get("status") != "completed":
            raise AnalyticsError(
                f"Export is not ready for download. Current status: {export.get('status')}"
            )

        # Check expiration
        expires_at = export.get("expires_at")
        if expires_at:
            if isinstance(expires_at, str):
                expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            if expires_at < datetime.now(timezone.utc):
                # Update status to expired
                await self._repository.update_report_export(
                    workspace_id=workspace_id,
                    export_id=export_id,
                    status="expired",
                )
                raise ExportExpiredError(export_id)

        # Increment download count
        updated = await self._repository.increment_export_download_count(
            workspace_id=workspace_id,
            export_id=export_id,
        )

        return {
            "export_id": str(export_id),
            "name": export.get("name"),
            "format": export.get("format"),
            "storage_key": export.get("storage_key"),
            "file_size_bytes": export.get("file_size_bytes"),
            "file_hash": export.get("file_hash"),
            "content_type": self._get_content_type(export.get("format", "csv")),
            "download_count": updated.get("download_count") if updated else export.get("download_count", 0) + 1,
        }

    async def delete_export(
        self,
        workspace_id: UUID,
        export_id: UUID,
    ) -> bool:
        """Delete an export.

        Args:
            workspace_id: Workspace for tenant isolation
            export_id: Export to delete

        Returns:
            True if deleted successfully

        Raises:
            ExportNotFoundError: If export doesn't exist
        """
        export = await self._repository.get_report_export_by_id(
            workspace_id=workspace_id,
            export_id=export_id,
        )

        if export is None:
            raise ExportNotFoundError(export_id)

        deleted = await self._repository.delete_report_export(
            workspace_id=workspace_id,
            export_id=export_id,
        )

        if deleted:
            logger.info(
                "Deleted export",
                extra={
                    "workspace_id": str(workspace_id),
                    "export_id": str(export_id),
                },
            )

        return deleted

    async def get_exports_for_report(
        self,
        workspace_id: UUID,
        report_id: UUID,
        *,
        include_expired: bool = False,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        """Get exports generated from a specific report.

        Args:
            workspace_id: Workspace for tenant isolation
            report_id: Report to get exports for
            include_expired: Include expired exports
            limit: Maximum results

        Returns:
            List of exports for the report
        """
        result = await self._repository.get_exports_for_report(
            workspace_id=workspace_id,
            report_id=report_id,
            include_expired=include_expired,
            limit=limit,
        )

        return result if isinstance(result, list) else result.get("exports", [])

    async def cleanup_expired_exports(
        self,
        workspace_id: UUID,
    ) -> int:
        """Clean up expired exports for a workspace.

        Marks expired exports and optionally deletes old ones.

        Args:
            workspace_id: Workspace to clean up

        Returns:
            Number of exports cleaned up
        """
        now = datetime.now(timezone.utc)
        cleaned = 0

        # Get expired exports
        result = await self._repository.get_report_exports(
            workspace_id=workspace_id,
            status="completed",
            include_expired=True,
            limit=500,
        )

        exports = result.get("exports", [])
        for export in exports:
            expires_at = export.get("expires_at")
            if expires_at:
                if isinstance(expires_at, str):
                    expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
                if expires_at < now:
                    await self._repository.update_report_export(
                        workspace_id=workspace_id,
                        export_id=UUID(export["export_id"]),
                        status="expired",
                    )
                    cleaned += 1

        if cleaned > 0:
            logger.info(
                "Cleaned up expired exports",
                extra={
                    "workspace_id": str(workspace_id),
                    "cleaned_count": cleaned,
                },
            )

        return cleaned


# ---------------------------------------------------------------------------
# Singleton Instance
# ---------------------------------------------------------------------------

_analytics_service: Optional[AnalyticsService] = None


def get_analytics_service() -> AnalyticsService:
    """Get singleton analytics service instance."""
    global _analytics_service
    if _analytics_service is None:
        _analytics_service = AnalyticsService()
    return _analytics_service
