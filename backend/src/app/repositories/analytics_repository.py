"""AnalyticsRepository: Data access layer for analytics and event tracking.

Provides database operations for:
- Recording analytics events
- Querying events with filtering/pagination
- Event aggregation and counting
- Batch event operations
- Gallery analytics aggregation and storage
- Client analytics aggregation and storage
- Report configuration persistence (custom reports CRUD)
- Report export management (export files CRUD and cleanup)

All operations are workspace-scoped for multi-tenant data isolation.

Feature: Analytics & Reporting
Tasks: T011 - Create analytics repository with event tracking
       T012 - Add gallery analytics aggregation methods
       T013 - Add client analytics aggregation methods
       T014 - Add report configuration persistence
"""

from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool

logger = logging.getLogger(__name__)


class AnalyticsRepository:
    """Repository for analytics data access.

    Provides comprehensive event tracking and querying capabilities
    for the analytics system. All operations enforce workspace-level
    multi-tenant isolation.
    """

    # =========================================================================
    # Helper Methods
    # =========================================================================

    @staticmethod
    def _row_to_event_dict(row: Any) -> dict[str, Any]:
        """Convert a database row to an event dictionary.

        Handles type conversions for UUIDs, datetimes, decimals, and JSONB.

        Args:
            row: Database row from asyncpg

        Returns:
            Dictionary representation of the event
        """
        if row is None:
            return {}

        result = dict(row)

        # Convert UUIDs to strings
        uuid_fields = [
            "event_id",
            "workspace_id",
            "gallery_id",
            "asset_id",
            "client_id",
            "share_link_id",
            "invitation_id",
            "actor_id",
            "visitor_id",
        ]
        for field in uuid_fields:
            if field in result and result[field] is not None:
                result[field] = str(result[field])

        # Convert datetimes to ISO format strings
        datetime_fields = ["occurred_at", "created_at"]
        for field in datetime_fields:
            if field in result and result[field] is not None:
                result[field] = result[field].isoformat()

        # Convert Decimal to float
        if "numeric_value" in result and result["numeric_value"] is not None:
            result["numeric_value"] = float(result["numeric_value"])

        # Handle JSONB metadata (asyncpg returns it as dict already)
        if "metadata" in result and result["metadata"] is None:
            result["metadata"] = {}

        # Convert IP address to string
        if "ip_address" in result and result["ip_address"] is not None:
            result["ip_address"] = str(result["ip_address"])

        return result

    # =========================================================================
    # Event Recording
    # =========================================================================

    async def record_event(
        self,
        workspace_id: UUID,
        event_type: str,
        event_category: str,
        actor_type: str,
        *,
        gallery_id: Optional[UUID] = None,
        asset_id: Optional[UUID] = None,
        client_id: Optional[UUID] = None,
        share_link_id: Optional[UUID] = None,
        invitation_id: Optional[UUID] = None,
        actor_id: Optional[UUID] = None,
        visitor_id: Optional[UUID] = None,
        session_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        referrer: Optional[str] = None,
        country_code: Optional[str] = None,
        region: Optional[str] = None,
        city: Optional[str] = None,
        device_type: Optional[str] = None,
        browser: Optional[str] = None,
        os: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
        numeric_value: Optional[float] = None,
        duration_ms: Optional[int] = None,
        occurred_at: Optional[datetime] = None,
    ) -> dict[str, Any]:
        """Record a new analytics event.

        Args:
            workspace_id: Workspace for tenant isolation
            event_type: Type of event (e.g., 'gallery_view', 'asset_download')
            event_category: Category of event (e.g., 'gallery', 'asset')
            actor_type: Type of actor ('user', 'client', 'visitor', 'system')
            gallery_id: Related gallery (optional)
            asset_id: Related asset (optional)
            client_id: Related client (optional)
            share_link_id: Related share link (optional)
            invitation_id: Related invitation (optional)
            actor_id: ID of the actor (user_id, client_id, etc.)
            visitor_id: Visitor ID for anonymous access
            session_id: Session identifier
            ip_address: Client IP address
            user_agent: Browser user agent
            referrer: HTTP referrer
            country_code: ISO country code
            region: Region/state
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
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO analytics_events (
                    workspace_id, event_type, event_category, actor_type,
                    gallery_id, asset_id, client_id, share_link_id, invitation_id,
                    actor_id, visitor_id,
                    session_id, ip_address, user_agent, referrer,
                    country_code, region, city,
                    device_type, browser, os,
                    metadata, numeric_value, duration_ms, occurred_at
                ) VALUES (
                    $1, $2, $3, $4,
                    $5, $6, $7, $8, $9,
                    $10, $11,
                    $12, $13::inet, $14, $15,
                    $16, $17, $18,
                    $19, $20, $21,
                    $22, $23, $24, $25
                )
                RETURNING *
                """,
                workspace_id,
                event_type,
                event_category,
                actor_type,
                gallery_id,
                asset_id,
                client_id,
                share_link_id,
                invitation_id,
                actor_id,
                visitor_id,
                session_id,
                ip_address,
                user_agent,
                referrer,
                country_code,
                region,
                city,
                device_type,
                browser,
                os,
                json.dumps(metadata or {}),
                numeric_value,
                duration_ms,
                occurred_at or datetime.now(timezone.utc),
            )

            event = self._row_to_event_dict(row)

            logger.info(
                "Recorded analytics event",
                extra={
                    "event_id": event.get("event_id"),
                    "workspace_id": str(workspace_id),
                    "event_type": event_type,
                    "event_category": event_category,
                },
            )

            return event

    async def record_events_batch(
        self,
        workspace_id: UUID,
        events: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Record multiple analytics events in a single batch.

        More efficient than individual inserts for high-volume event tracking.

        Args:
            workspace_id: Workspace for tenant isolation
            events: List of event dictionaries with keys matching record_event params

        Returns:
            List of created event records
        """
        if not events:
            return []

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Prepare batch insert data
            now = datetime.now(timezone.utc)
            rows_data = []
            for event in events:
                rows_data.append((
                    workspace_id,
                    event.get("event_type"),
                    event.get("event_category"),
                    event.get("actor_type"),
                    event.get("gallery_id"),
                    event.get("asset_id"),
                    event.get("client_id"),
                    event.get("share_link_id"),
                    event.get("invitation_id"),
                    event.get("actor_id"),
                    event.get("visitor_id"),
                    event.get("session_id"),
                    event.get("ip_address"),
                    event.get("user_agent"),
                    event.get("referrer"),
                    event.get("country_code"),
                    event.get("region"),
                    event.get("city"),
                    event.get("device_type"),
                    event.get("browser"),
                    event.get("os"),
                    json.dumps(event.get("metadata") or {}),
                    event.get("numeric_value"),
                    event.get("duration_ms"),
                    event.get("occurred_at") or now,
                ))

            # Use executemany for batch insert
            await conn.executemany(
                """
                INSERT INTO analytics_events (
                    workspace_id, event_type, event_category, actor_type,
                    gallery_id, asset_id, client_id, share_link_id, invitation_id,
                    actor_id, visitor_id,
                    session_id, ip_address, user_agent, referrer,
                    country_code, region, city,
                    device_type, browser, os,
                    metadata, numeric_value, duration_ms, occurred_at
                ) VALUES (
                    $1, $2, $3, $4,
                    $5, $6, $7, $8, $9,
                    $10, $11,
                    $12, $13::inet, $14, $15,
                    $16, $17, $18,
                    $19, $20, $21,
                    $22, $23, $24, $25
                )
                """,
                rows_data,
            )

            logger.info(
                "Recorded batch analytics events",
                extra={
                    "workspace_id": str(workspace_id),
                    "event_count": len(events),
                },
            )

            # Return simplified results (batch insert doesn't return inserted rows)
            return [{"status": "created", "index": i} for i in range(len(events))]

    # =========================================================================
    # Event Retrieval
    # =========================================================================

    async def get_event_by_id(
        self,
        workspace_id: UUID,
        event_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get a single analytics event by ID.

        Args:
            workspace_id: Workspace for tenant isolation
            event_id: Event to retrieve

        Returns:
            Event record or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM analytics_events
                WHERE workspace_id = $1 AND event_id = $2
                """,
                workspace_id,
                event_id,
            )

            if row is None:
                return None

            return self._row_to_event_dict(row)

    async def get_events(
        self,
        workspace_id: UUID,
        *,
        event_types: Optional[list[str]] = None,
        event_categories: Optional[list[str]] = None,
        gallery_id: Optional[UUID] = None,
        client_id: Optional[UUID] = None,
        asset_id: Optional[UUID] = None,
        actor_type: Optional[str] = None,
        session_id: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> dict[str, Any]:
        """Get analytics events with filtering and pagination.

        Args:
            workspace_id: Workspace for tenant isolation
            event_types: Filter by event types
            event_categories: Filter by event categories
            gallery_id: Filter by gallery
            client_id: Filter by client
            asset_id: Filter by asset
            actor_type: Filter by actor type
            session_id: Filter by session
            start_date: Start of date range (inclusive)
            end_date: End of date range (inclusive)
            limit: Max results (default 50, max 1000)
            offset: Pagination offset

        Returns:
            Paginated list of events with metadata
        """
        # Clamp limit
        limit = min(max(1, limit), 1000)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Build dynamic query filters
            filters = ["workspace_id = $1"]
            params: list[Any] = [workspace_id]
            param_idx = 2

            if event_types:
                filters.append(f"event_type = ANY(${param_idx})")
                params.append(event_types)
                param_idx += 1

            if event_categories:
                filters.append(f"event_category = ANY(${param_idx})")
                params.append(event_categories)
                param_idx += 1

            if gallery_id:
                filters.append(f"gallery_id = ${param_idx}")
                params.append(gallery_id)
                param_idx += 1

            if client_id:
                filters.append(f"client_id = ${param_idx}")
                params.append(client_id)
                param_idx += 1

            if asset_id:
                filters.append(f"asset_id = ${param_idx}")
                params.append(asset_id)
                param_idx += 1

            if actor_type:
                filters.append(f"actor_type = ${param_idx}")
                params.append(actor_type)
                param_idx += 1

            if session_id:
                filters.append(f"session_id = ${param_idx}")
                params.append(session_id)
                param_idx += 1

            if start_date:
                filters.append(f"occurred_at >= ${param_idx}")
                params.append(start_date)
                param_idx += 1

            if end_date:
                filters.append(f"occurred_at <= ${param_idx}")
                params.append(end_date)
                param_idx += 1

            where_clause = " AND ".join(filters)

            # Get total count
            total = await conn.fetchval(
                f"SELECT COUNT(*) FROM analytics_events WHERE {where_clause}",
                *params,
            )

            # Get events with pagination
            params.extend([limit, offset])
            rows = await conn.fetch(
                f"""
                SELECT * FROM analytics_events
                WHERE {where_clause}
                ORDER BY occurred_at DESC
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
                """,
                *params,
            )

            events = [self._row_to_event_dict(row) for row in rows]

            return {
                "events": events,
                "meta": {
                    "total": total,
                    "limit": limit,
                    "offset": offset,
                    "has_more": offset + len(events) < total,
                },
            }

    async def get_recent_events(
        self,
        workspace_id: UUID,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """Get the most recent events for a workspace.

        Optimized for quick dashboard loading.

        Args:
            workspace_id: Workspace for tenant isolation
            limit: Max results (default 10)

        Returns:
            List of recent events
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM analytics_events
                WHERE workspace_id = $1
                ORDER BY occurred_at DESC
                LIMIT $2
                """,
                workspace_id,
                min(limit, 100),
            )

            return [self._row_to_event_dict(row) for row in rows]

    # =========================================================================
    # Event Counting and Aggregation
    # =========================================================================

    async def count_events(
        self,
        workspace_id: UUID,
        *,
        event_types: Optional[list[str]] = None,
        event_categories: Optional[list[str]] = None,
        gallery_id: Optional[UUID] = None,
        client_id: Optional[UUID] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> int:
        """Count events matching the given filters.

        Args:
            workspace_id: Workspace for tenant isolation
            event_types: Filter by event types
            event_categories: Filter by event categories
            gallery_id: Filter by gallery
            client_id: Filter by client
            start_date: Start of date range
            end_date: End of date range

        Returns:
            Count of matching events
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            filters = ["workspace_id = $1"]
            params: list[Any] = [workspace_id]
            param_idx = 2

            if event_types:
                filters.append(f"event_type = ANY(${param_idx})")
                params.append(event_types)
                param_idx += 1

            if event_categories:
                filters.append(f"event_category = ANY(${param_idx})")
                params.append(event_categories)
                param_idx += 1

            if gallery_id:
                filters.append(f"gallery_id = ${param_idx}")
                params.append(gallery_id)
                param_idx += 1

            if client_id:
                filters.append(f"client_id = ${param_idx}")
                params.append(client_id)
                param_idx += 1

            if start_date:
                filters.append(f"occurred_at >= ${param_idx}")
                params.append(start_date)
                param_idx += 1

            if end_date:
                filters.append(f"occurred_at <= ${param_idx}")
                params.append(end_date)
                param_idx += 1

            where_clause = " AND ".join(filters)

            count = await conn.fetchval(
                f"SELECT COUNT(*) FROM analytics_events WHERE {where_clause}",
                *params,
            )

            return count or 0

    async def get_event_counts_by_type(
        self,
        workspace_id: UUID,
        *,
        event_categories: Optional[list[str]] = None,
        gallery_id: Optional[UUID] = None,
        client_id: Optional[UUID] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> list[dict[str, Any]]:
        """Get event counts grouped by event type.

        Args:
            workspace_id: Workspace for tenant isolation
            event_categories: Filter by event categories
            gallery_id: Filter by gallery
            client_id: Filter by client
            start_date: Start of date range
            end_date: End of date range

        Returns:
            List of {event_type, event_category, count} records
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            filters = ["workspace_id = $1"]
            params: list[Any] = [workspace_id]
            param_idx = 2

            if event_categories:
                filters.append(f"event_category = ANY(${param_idx})")
                params.append(event_categories)
                param_idx += 1

            if gallery_id:
                filters.append(f"gallery_id = ${param_idx}")
                params.append(gallery_id)
                param_idx += 1

            if client_id:
                filters.append(f"client_id = ${param_idx}")
                params.append(client_id)
                param_idx += 1

            if start_date:
                filters.append(f"occurred_at >= ${param_idx}")
                params.append(start_date)
                param_idx += 1

            if end_date:
                filters.append(f"occurred_at <= ${param_idx}")
                params.append(end_date)
                param_idx += 1

            where_clause = " AND ".join(filters)

            rows = await conn.fetch(
                f"""
                SELECT
                    event_type,
                    event_category,
                    COUNT(*) as count
                FROM analytics_events
                WHERE {where_clause}
                GROUP BY event_type, event_category
                ORDER BY count DESC
                """,
                *params,
            )

            return [
                {
                    "event_type": row["event_type"],
                    "event_category": row["event_category"],
                    "count": row["count"],
                }
                for row in rows
            ]

    async def get_event_counts_by_category(
        self,
        workspace_id: UUID,
        *,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> list[dict[str, Any]]:
        """Get event counts grouped by event category.

        Args:
            workspace_id: Workspace for tenant isolation
            start_date: Start of date range
            end_date: End of date range

        Returns:
            List of {event_category, count} records
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            filters = ["workspace_id = $1"]
            params: list[Any] = [workspace_id]
            param_idx = 2

            if start_date:
                filters.append(f"occurred_at >= ${param_idx}")
                params.append(start_date)
                param_idx += 1

            if end_date:
                filters.append(f"occurred_at <= ${param_idx}")
                params.append(end_date)
                param_idx += 1

            where_clause = " AND ".join(filters)

            rows = await conn.fetch(
                f"""
                SELECT
                    event_category,
                    COUNT(*) as count
                FROM analytics_events
                WHERE {where_clause}
                GROUP BY event_category
                ORDER BY count DESC
                """,
                *params,
            )

            return [
                {
                    "event_category": row["event_category"],
                    "count": row["count"],
                }
                for row in rows
            ]

    async def get_unique_visitors_count(
        self,
        workspace_id: UUID,
        *,
        gallery_id: Optional[UUID] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> int:
        """Get count of unique visitors.

        Counts unique combinations of visitor_id and client_id.

        Args:
            workspace_id: Workspace for tenant isolation
            gallery_id: Filter by gallery
            start_date: Start of date range
            end_date: End of date range

        Returns:
            Count of unique visitors
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            filters = ["workspace_id = $1"]
            params: list[Any] = [workspace_id]
            param_idx = 2

            if gallery_id:
                filters.append(f"gallery_id = ${param_idx}")
                params.append(gallery_id)
                param_idx += 1

            if start_date:
                filters.append(f"occurred_at >= ${param_idx}")
                params.append(start_date)
                param_idx += 1

            if end_date:
                filters.append(f"occurred_at <= ${param_idx}")
                params.append(end_date)
                param_idx += 1

            where_clause = " AND ".join(filters)

            count = await conn.fetchval(
                f"""
                SELECT COUNT(DISTINCT COALESCE(client_id::text, visitor_id::text, ip_address::text))
                FROM analytics_events
                WHERE {where_clause}
                """,
                *params,
            )

            return count or 0

    async def get_unique_sessions_count(
        self,
        workspace_id: UUID,
        *,
        gallery_id: Optional[UUID] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> int:
        """Get count of unique sessions.

        Args:
            workspace_id: Workspace for tenant isolation
            gallery_id: Filter by gallery
            start_date: Start of date range
            end_date: End of date range

        Returns:
            Count of unique sessions
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            filters = ["workspace_id = $1", "session_id IS NOT NULL"]
            params: list[Any] = [workspace_id]
            param_idx = 2

            if gallery_id:
                filters.append(f"gallery_id = ${param_idx}")
                params.append(gallery_id)
                param_idx += 1

            if start_date:
                filters.append(f"occurred_at >= ${param_idx}")
                params.append(start_date)
                param_idx += 1

            if end_date:
                filters.append(f"occurred_at <= ${param_idx}")
                params.append(end_date)
                param_idx += 1

            where_clause = " AND ".join(filters)

            count = await conn.fetchval(
                f"""
                SELECT COUNT(DISTINCT session_id)
                FROM analytics_events
                WHERE {where_clause}
                """,
                *params,
            )

            return count or 0

    async def get_events_by_date(
        self,
        workspace_id: UUID,
        *,
        event_types: Optional[list[str]] = None,
        gallery_id: Optional[UUID] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> list[dict[str, Any]]:
        """Get event counts grouped by date.

        Useful for time-series charts and trend analysis.

        Args:
            workspace_id: Workspace for tenant isolation
            event_types: Filter by event types
            gallery_id: Filter by gallery
            start_date: Start of date range
            end_date: End of date range

        Returns:
            List of {date, count} records ordered by date
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            filters = ["workspace_id = $1"]
            params: list[Any] = [workspace_id]
            param_idx = 2

            if event_types:
                filters.append(f"event_type = ANY(${param_idx})")
                params.append(event_types)
                param_idx += 1

            if gallery_id:
                filters.append(f"gallery_id = ${param_idx}")
                params.append(gallery_id)
                param_idx += 1

            if start_date:
                filters.append(f"occurred_at >= ${param_idx}")
                params.append(start_date)
                param_idx += 1

            if end_date:
                filters.append(f"occurred_at <= ${param_idx}")
                params.append(end_date)
                param_idx += 1

            where_clause = " AND ".join(filters)

            rows = await conn.fetch(
                f"""
                SELECT
                    DATE(occurred_at) as event_date,
                    COUNT(*) as count
                FROM analytics_events
                WHERE {where_clause}
                GROUP BY DATE(occurred_at)
                ORDER BY event_date ASC
                """,
                *params,
            )

            return [
                {
                    "date": row["event_date"].isoformat(),
                    "count": row["count"],
                }
                for row in rows
            ]

    async def get_device_breakdown(
        self,
        workspace_id: UUID,
        *,
        gallery_id: Optional[UUID] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> list[dict[str, Any]]:
        """Get event counts grouped by device type.

        Args:
            workspace_id: Workspace for tenant isolation
            gallery_id: Filter by gallery
            start_date: Start of date range
            end_date: End of date range

        Returns:
            List of {device_type, count, percentage} records
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            filters = ["workspace_id = $1"]
            params: list[Any] = [workspace_id]
            param_idx = 2

            if gallery_id:
                filters.append(f"gallery_id = ${param_idx}")
                params.append(gallery_id)
                param_idx += 1

            if start_date:
                filters.append(f"occurred_at >= ${param_idx}")
                params.append(start_date)
                param_idx += 1

            if end_date:
                filters.append(f"occurred_at <= ${param_idx}")
                params.append(end_date)
                param_idx += 1

            where_clause = " AND ".join(filters)

            rows = await conn.fetch(
                f"""
                WITH device_counts AS (
                    SELECT
                        COALESCE(device_type, 'other') as device_type,
                        COUNT(*) as count
                    FROM analytics_events
                    WHERE {where_clause}
                    GROUP BY device_type
                ),
                total AS (
                    SELECT SUM(count) as total_count FROM device_counts
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
                *params,
            )

            return [
                {
                    "device_type": row["device_type"],
                    "count": row["count"],
                    "percentage": float(row["percentage"]) if row["percentage"] else 0.0,
                }
                for row in rows
            ]

    async def get_geographic_breakdown(
        self,
        workspace_id: UUID,
        *,
        gallery_id: Optional[UUID] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """Get event counts grouped by country.

        Args:
            workspace_id: Workspace for tenant isolation
            gallery_id: Filter by gallery
            start_date: Start of date range
            end_date: End of date range
            limit: Max countries to return

        Returns:
            List of {country_code, count, percentage} records
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            filters = ["workspace_id = $1", "country_code IS NOT NULL"]
            params: list[Any] = [workspace_id]
            param_idx = 2

            if gallery_id:
                filters.append(f"gallery_id = ${param_idx}")
                params.append(gallery_id)
                param_idx += 1

            if start_date:
                filters.append(f"occurred_at >= ${param_idx}")
                params.append(start_date)
                param_idx += 1

            if end_date:
                filters.append(f"occurred_at <= ${param_idx}")
                params.append(end_date)
                param_idx += 1

            where_clause = " AND ".join(filters)

            rows = await conn.fetch(
                f"""
                WITH country_counts AS (
                    SELECT
                        country_code,
                        COUNT(*) as count
                    FROM analytics_events
                    WHERE {where_clause}
                    GROUP BY country_code
                ),
                total AS (
                    SELECT SUM(count) as total_count FROM country_counts
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
                LIMIT ${param_idx}
                """,
                *params,
                limit,
            )

            return [
                {
                    "country_code": row["country_code"],
                    "count": row["count"],
                    "percentage": float(row["percentage"]) if row["percentage"] else 0.0,
                }
                for row in rows
            ]

    # =========================================================================
    # Event Cleanup
    # =========================================================================

    async def delete_old_events(
        self,
        workspace_id: UUID,
        before_date: datetime,
    ) -> int:
        """Delete events older than a specified date.

        Used for implementing retention policies.

        Args:
            workspace_id: Workspace for tenant isolation
            before_date: Delete events before this date

        Returns:
            Number of deleted events
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM analytics_events
                WHERE workspace_id = $1 AND occurred_at < $2
                """,
                workspace_id,
                before_date,
            )

            # Parse delete count from result string (e.g., "DELETE 100")
            deleted_count = int(result.split()[-1]) if result else 0

            logger.info(
                "Deleted old analytics events",
                extra={
                    "workspace_id": str(workspace_id),
                    "before_date": before_date.isoformat(),
                    "deleted_count": deleted_count,
                },
            )

            return deleted_count

    # =========================================================================
    # Gallery Analytics Aggregation (T012)
    # =========================================================================

    @staticmethod
    def _row_to_gallery_analytics_dict(row: Any) -> dict[str, Any]:
        """Convert a database row to a gallery analytics dictionary.

        Handles type conversions for UUIDs, dates, datetimes, decimals, and JSONB.

        Args:
            row: Database row from asyncpg

        Returns:
            Dictionary representation of the gallery analytics
        """
        if row is None:
            return {}

        result = dict(row)

        # Convert UUIDs to strings
        uuid_fields = ["gallery_analytics_id", "workspace_id", "gallery_id"]
        for field in uuid_fields:
            if field in result and result[field] is not None:
                result[field] = str(result[field])

        # Convert dates to ISO format strings
        date_fields = ["period_start", "period_end"]
        for field in date_fields:
            if field in result and result[field] is not None:
                result[field] = result[field].isoformat()

        # Convert datetimes to ISO format strings
        datetime_fields = ["calculated_at", "created_at", "updated_at"]
        for field in datetime_fields:
            if field in result and result[field] is not None:
                result[field] = result[field].isoformat()

        # Convert Decimals to float
        decimal_fields = ["bounce_rate", "engagement_score", "conversion_rate"]
        for field in decimal_fields:
            if field in result and result[field] is not None:
                result[field] = float(result[field])

        # Handle JSONB top_countries (asyncpg returns it as list already)
        if "top_countries" in result and result["top_countries"] is None:
            result["top_countries"] = []

        return result

    async def aggregate_gallery_analytics(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        period_type: str,
        period_start: date,
        period_end: date,
    ) -> dict[str, Any]:
        """Aggregate analytics for a gallery from raw events and store the result.

        Computes all metrics from the analytics_events table for the specified
        period and upserts the result into gallery_analytics.

        Args:
            workspace_id: Workspace for tenant isolation
            gallery_id: Gallery to aggregate analytics for
            period_type: Type of period ('daily', 'weekly', 'monthly', 'all_time')
            period_start: Start date of the aggregation period
            period_end: End date of the aggregation period

        Returns:
            Aggregated gallery analytics record
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Convert dates to datetime for event filtering
            start_datetime = datetime.combine(period_start, datetime.min.time(), timezone.utc)
            end_datetime = datetime.combine(period_end, datetime.max.time(), timezone.utc)

            # Aggregate view metrics
            view_metrics = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) FILTER (WHERE event_type = 'gallery_view') as total_views,
                    COUNT(DISTINCT COALESCE(client_id::text, visitor_id::text, ip_address::text))
                        FILTER (WHERE event_type = 'gallery_view') as unique_visitors,
                    COUNT(DISTINCT session_id) FILTER (WHERE event_type = 'gallery_view') as unique_sessions
                FROM analytics_events
                WHERE workspace_id = $1
                    AND gallery_id = $2
                    AND occurred_at >= $3
                    AND occurred_at <= $4
                """,
                workspace_id,
                gallery_id,
                start_datetime,
                end_datetime,
            )

            # Aggregate engagement metrics
            engagement_metrics = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) FILTER (WHERE event_type = 'asset_favorite') as total_favorites,
                    COUNT(*) FILTER (WHERE event_type = 'asset_comment') as total_comments,
                    COUNT(*) FILTER (WHERE event_type = 'asset_select') as total_selections,
                    COUNT(*) FILTER (WHERE event_type IN ('asset_download', 'gallery_download', 'bulk_download_completed'))
                        as total_downloads
                FROM analytics_events
                WHERE workspace_id = $1
                    AND gallery_id = $2
                    AND occurred_at >= $3
                    AND occurred_at <= $4
                """,
                workspace_id,
                gallery_id,
                start_datetime,
                end_datetime,
            )

            # Aggregate time metrics
            time_metrics = await conn.fetchrow(
                """
                SELECT
                    COALESCE(SUM(duration_ms), 0) as total_time_spent_ms,
                    COALESCE(AVG(duration_ms) FILTER (WHERE duration_ms IS NOT NULL), 0)::integer
                        as avg_session_duration_ms
                FROM analytics_events
                WHERE workspace_id = $1
                    AND gallery_id = $2
                    AND occurred_at >= $3
                    AND occurred_at <= $4
                    AND event_type = 'session_end'
                """,
                workspace_id,
                gallery_id,
                start_datetime,
                end_datetime,
            )

            # Calculate bounce rate (sessions with only one event)
            bounce_rate_data = await conn.fetchrow(
                """
                WITH session_events AS (
                    SELECT session_id, COUNT(*) as event_count
                    FROM analytics_events
                    WHERE workspace_id = $1
                        AND gallery_id = $2
                        AND occurred_at >= $3
                        AND occurred_at <= $4
                        AND session_id IS NOT NULL
                    GROUP BY session_id
                )
                SELECT
                    CASE
                        WHEN COUNT(*) > 0
                        THEN ROUND((COUNT(*) FILTER (WHERE event_count = 1)::numeric / COUNT(*)) * 100, 2)
                        ELSE NULL
                    END as bounce_rate
                FROM session_events
                """,
                workspace_id,
                gallery_id,
                start_datetime,
                end_datetime,
            )

            # Get top countries
            top_countries_rows = await conn.fetch(
                """
                WITH country_counts AS (
                    SELECT
                        country_code,
                        COUNT(*) as count
                    FROM analytics_events
                    WHERE workspace_id = $1
                        AND gallery_id = $2
                        AND occurred_at >= $3
                        AND occurred_at <= $4
                        AND country_code IS NOT NULL
                        AND event_type = 'gallery_view'
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
                start_datetime,
                end_datetime,
            )

            top_countries = [
                {
                    "country_code": row["country_code"],
                    "count": row["count"],
                    "percentage": float(row["percentage"]) if row["percentage"] else 0.0,
                }
                for row in top_countries_rows
            ]

            # Aggregate device breakdown
            device_metrics = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) FILTER (WHERE device_type = 'desktop' AND event_type = 'gallery_view')
                        as desktop_views,
                    COUNT(*) FILTER (WHERE device_type = 'tablet' AND event_type = 'gallery_view')
                        as tablet_views,
                    COUNT(*) FILTER (WHERE device_type = 'mobile' AND event_type = 'gallery_view')
                        as mobile_views
                FROM analytics_events
                WHERE workspace_id = $1
                    AND gallery_id = $2
                    AND occurred_at >= $3
                    AND occurred_at <= $4
                """,
                workspace_id,
                gallery_id,
                start_datetime,
                end_datetime,
            )

            # Aggregate source tracking
            source_metrics = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) FILTER (WHERE share_link_id IS NULL AND referrer IS NULL
                        AND event_type = 'gallery_view') as direct_views,
                    COUNT(*) FILTER (WHERE share_link_id IS NOT NULL AND event_type = 'gallery_view')
                        as share_link_views,
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
                start_datetime,
                end_datetime,
            )

            # Aggregate share link metrics
            share_link_metrics = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) FILTER (WHERE event_type = 'share_link_created') as share_links_created,
                    COUNT(*) FILTER (WHERE event_type = 'share_link_accessed') as share_link_accesses,
                    COUNT(*) FILTER (WHERE event_type = 'share_link_accessed'
                        AND metadata->>'gate_completed' = 'true') as share_link_conversions
                FROM analytics_events
                WHERE workspace_id = $1
                    AND gallery_id = $2
                    AND occurred_at >= $3
                    AND occurred_at <= $4
                """,
                workspace_id,
                gallery_id,
                start_datetime,
                end_datetime,
            )

            # Calculate engagement score (0-100)
            total_views = view_metrics["total_views"] or 0
            total_favorites = engagement_metrics["total_favorites"] or 0
            total_comments = engagement_metrics["total_comments"] or 0
            total_selections = engagement_metrics["total_selections"] or 0
            total_downloads = engagement_metrics["total_downloads"] or 0

            engagement_score = None
            if total_views > 0:
                # Weighted engagement score
                engagement_actions = (
                    total_favorites * 2 +  # Favorites weighted 2x
                    total_comments * 3 +   # Comments weighted 3x
                    total_selections * 1 +  # Selections weighted 1x
                    total_downloads * 2    # Downloads weighted 2x
                )
                # Normalize to 0-100 scale (cap at 100)
                engagement_score = min(100.0, (engagement_actions / total_views) * 20)

            # Calculate conversion rate (share link accesses -> conversions)
            share_link_accesses = share_link_metrics["share_link_accesses"] or 0
            share_link_conversions = share_link_metrics["share_link_conversions"] or 0
            conversion_rate = None
            if share_link_accesses > 0:
                conversion_rate = (share_link_conversions / share_link_accesses) * 100

            # Upsert the aggregated analytics
            now = datetime.now(timezone.utc)
            row = await conn.fetchrow(
                """
                INSERT INTO gallery_analytics (
                    workspace_id, gallery_id, period_type, period_start, period_end,
                    total_views, unique_visitors, unique_sessions,
                    total_favorites, total_comments, total_selections, total_downloads,
                    total_time_spent_ms, avg_session_duration_ms, bounce_rate,
                    top_countries,
                    desktop_views, tablet_views, mobile_views,
                    direct_views, share_link_views, referral_views,
                    share_links_created, share_link_accesses, share_link_conversions,
                    engagement_score, conversion_rate,
                    calculated_at, created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5,
                    $6, $7, $8,
                    $9, $10, $11, $12,
                    $13, $14, $15,
                    $16,
                    $17, $18, $19,
                    $20, $21, $22,
                    $23, $24, $25,
                    $26, $27,
                    $28, $28, $28
                )
                ON CONFLICT (gallery_id, period_type, period_start)
                DO UPDATE SET
                    total_views = EXCLUDED.total_views,
                    unique_visitors = EXCLUDED.unique_visitors,
                    unique_sessions = EXCLUDED.unique_sessions,
                    total_favorites = EXCLUDED.total_favorites,
                    total_comments = EXCLUDED.total_comments,
                    total_selections = EXCLUDED.total_selections,
                    total_downloads = EXCLUDED.total_downloads,
                    total_time_spent_ms = EXCLUDED.total_time_spent_ms,
                    avg_session_duration_ms = EXCLUDED.avg_session_duration_ms,
                    bounce_rate = EXCLUDED.bounce_rate,
                    top_countries = EXCLUDED.top_countries,
                    desktop_views = EXCLUDED.desktop_views,
                    tablet_views = EXCLUDED.tablet_views,
                    mobile_views = EXCLUDED.mobile_views,
                    direct_views = EXCLUDED.direct_views,
                    share_link_views = EXCLUDED.share_link_views,
                    referral_views = EXCLUDED.referral_views,
                    share_links_created = EXCLUDED.share_links_created,
                    share_link_accesses = EXCLUDED.share_link_accesses,
                    share_link_conversions = EXCLUDED.share_link_conversions,
                    engagement_score = EXCLUDED.engagement_score,
                    conversion_rate = EXCLUDED.conversion_rate,
                    calculated_at = EXCLUDED.calculated_at,
                    updated_at = EXCLUDED.updated_at
                RETURNING *
                """,
                workspace_id,
                gallery_id,
                period_type,
                period_start,
                period_end,
                view_metrics["total_views"] or 0,
                view_metrics["unique_visitors"] or 0,
                view_metrics["unique_sessions"] or 0,
                engagement_metrics["total_favorites"] or 0,
                engagement_metrics["total_comments"] or 0,
                engagement_metrics["total_selections"] or 0,
                engagement_metrics["total_downloads"] or 0,
                time_metrics["total_time_spent_ms"] or 0,
                time_metrics["avg_session_duration_ms"] or 0,
                bounce_rate_data["bounce_rate"] if bounce_rate_data else None,
                json.dumps(top_countries),
                device_metrics["desktop_views"] or 0,
                device_metrics["tablet_views"] or 0,
                device_metrics["mobile_views"] or 0,
                source_metrics["direct_views"] or 0,
                source_metrics["share_link_views"] or 0,
                source_metrics["referral_views"] or 0,
                share_link_metrics["share_links_created"] or 0,
                share_link_metrics["share_link_accesses"] or 0,
                share_link_metrics["share_link_conversions"] or 0,
                engagement_score,
                conversion_rate,
                now,
            )

            analytics = self._row_to_gallery_analytics_dict(row)

            logger.info(
                "Aggregated gallery analytics",
                extra={
                    "gallery_analytics_id": analytics.get("gallery_analytics_id"),
                    "workspace_id": str(workspace_id),
                    "gallery_id": str(gallery_id),
                    "period_type": period_type,
                    "period_start": period_start.isoformat(),
                    "period_end": period_end.isoformat(),
                },
            )

            return analytics

    async def get_gallery_analytics(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        period_type: str = "all_time",
    ) -> Optional[dict[str, Any]]:
        """Get the most recent gallery analytics for a specific period type.

        Args:
            workspace_id: Workspace for tenant isolation
            gallery_id: Gallery to get analytics for
            period_type: Type of period ('daily', 'weekly', 'monthly', 'all_time')

        Returns:
            Gallery analytics record or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM gallery_analytics
                WHERE workspace_id = $1
                    AND gallery_id = $2
                    AND period_type = $3
                ORDER BY period_start DESC
                LIMIT 1
                """,
                workspace_id,
                gallery_id,
                period_type,
            )

            if row is None:
                return None

            return self._row_to_gallery_analytics_dict(row)

    async def get_gallery_analytics_by_id(
        self,
        workspace_id: UUID,
        gallery_analytics_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get a gallery analytics record by ID.

        Args:
            workspace_id: Workspace for tenant isolation
            gallery_analytics_id: Analytics record ID

        Returns:
            Gallery analytics record or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM gallery_analytics
                WHERE workspace_id = $1 AND gallery_analytics_id = $2
                """,
                workspace_id,
                gallery_analytics_id,
            )

            if row is None:
                return None

            return self._row_to_gallery_analytics_dict(row)

    async def get_gallery_analytics_history(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        period_type: str = "daily",
        *,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        limit: int = 30,
    ) -> list[dict[str, Any]]:
        """Get historical gallery analytics for trend analysis.

        Args:
            workspace_id: Workspace for tenant isolation
            gallery_id: Gallery to get history for
            period_type: Type of period to retrieve
            start_date: Start of date range filter
            end_date: End of date range filter
            limit: Max records to return

        Returns:
            List of gallery analytics records ordered by period_start DESC
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            filters = ["workspace_id = $1", "gallery_id = $2", "period_type = $3"]
            params: list[Any] = [workspace_id, gallery_id, period_type]
            param_idx = 4

            if start_date:
                filters.append(f"period_start >= ${param_idx}")
                params.append(start_date)
                param_idx += 1

            if end_date:
                filters.append(f"period_end <= ${param_idx}")
                params.append(end_date)
                param_idx += 1

            where_clause = " AND ".join(filters)
            params.append(min(limit, 365))  # Cap at 365 records

            rows = await conn.fetch(
                f"""
                SELECT * FROM gallery_analytics
                WHERE {where_clause}
                ORDER BY period_start DESC
                LIMIT ${param_idx}
                """,
                *params,
            )

            return [self._row_to_gallery_analytics_dict(row) for row in rows]

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
            period_type: Type of period to consider
            sort_by: Metric to sort by ('total_views', 'unique_visitors',
                     'total_downloads', 'engagement_score')
            limit: Max galleries to return

        Returns:
            List of top gallery analytics records
        """
        # Validate sort_by to prevent SQL injection
        valid_sort_columns = {
            "total_views": "total_views",
            "unique_visitors": "unique_visitors",
            "total_downloads": "total_downloads",
            "engagement_score": "engagement_score",
            "total_favorites": "total_favorites",
            "total_comments": "total_comments",
        }

        sort_column = valid_sort_columns.get(sort_by, "total_views")

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                f"""
                SELECT ga.*, g.name as gallery_name
                FROM gallery_analytics ga
                LEFT JOIN galleries g ON ga.gallery_id = g.gallery_id
                WHERE ga.workspace_id = $1 AND ga.period_type = $2
                ORDER BY ga.{sort_column} DESC NULLS LAST
                LIMIT $3
                """,
                workspace_id,
                period_type,
                min(limit, 100),
            )

            result = []
            for row in rows:
                analytics = self._row_to_gallery_analytics_dict(row)
                analytics["gallery_name"] = row.get("gallery_name")
                result.append(analytics)

            return result

    async def get_workspace_gallery_stats(
        self,
        workspace_id: UUID,
        period_type: str = "all_time",
    ) -> dict[str, Any]:
        """Get aggregate statistics across all galleries in a workspace.

        Args:
            workspace_id: Workspace for tenant isolation
            period_type: Type of period to aggregate

        Returns:
            Aggregate statistics dictionary
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    COUNT(DISTINCT gallery_id) as total_galleries,
                    COALESCE(SUM(total_views), 0) as total_views,
                    COALESCE(SUM(unique_visitors), 0) as total_unique_visitors,
                    COALESCE(SUM(total_downloads), 0) as total_downloads,
                    COALESCE(SUM(total_favorites), 0) as total_favorites,
                    COALESCE(SUM(total_comments), 0) as total_comments,
                    COALESCE(AVG(engagement_score), 0)::numeric(5,2) as avg_engagement_score,
                    COALESCE(AVG(bounce_rate), 0)::numeric(5,2) as avg_bounce_rate,
                    COALESCE(SUM(desktop_views), 0) as total_desktop_views,
                    COALESCE(SUM(tablet_views), 0) as total_tablet_views,
                    COALESCE(SUM(mobile_views), 0) as total_mobile_views
                FROM gallery_analytics
                WHERE workspace_id = $1 AND period_type = $2
                """,
                workspace_id,
                period_type,
            )

            if row is None:
                return {
                    "total_galleries": 0,
                    "total_views": 0,
                    "total_unique_visitors": 0,
                    "total_downloads": 0,
                    "total_favorites": 0,
                    "total_comments": 0,
                    "avg_engagement_score": 0.0,
                    "avg_bounce_rate": 0.0,
                    "device_breakdown": {
                        "desktop": 0,
                        "tablet": 0,
                        "mobile": 0,
                    },
                }

            total_device_views = (
                (row["total_desktop_views"] or 0) +
                (row["total_tablet_views"] or 0) +
                (row["total_mobile_views"] or 0)
            )

            return {
                "total_galleries": row["total_galleries"] or 0,
                "total_views": row["total_views"] or 0,
                "total_unique_visitors": row["total_unique_visitors"] or 0,
                "total_downloads": row["total_downloads"] or 0,
                "total_favorites": row["total_favorites"] or 0,
                "total_comments": row["total_comments"] or 0,
                "avg_engagement_score": float(row["avg_engagement_score"]) if row["avg_engagement_score"] else 0.0,
                "avg_bounce_rate": float(row["avg_bounce_rate"]) if row["avg_bounce_rate"] else 0.0,
                "device_breakdown": {
                    "desktop": row["total_desktop_views"] or 0,
                    "desktop_percentage": (
                        round((row["total_desktop_views"] or 0) / total_device_views * 100, 2)
                        if total_device_views > 0 else 0.0
                    ),
                    "tablet": row["total_tablet_views"] or 0,
                    "tablet_percentage": (
                        round((row["total_tablet_views"] or 0) / total_device_views * 100, 2)
                        if total_device_views > 0 else 0.0
                    ),
                    "mobile": row["total_mobile_views"] or 0,
                    "mobile_percentage": (
                        round((row["total_mobile_views"] or 0) / total_device_views * 100, 2)
                        if total_device_views > 0 else 0.0
                    ),
                },
            }

    async def get_gallery_views_time_series(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        *,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
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
        """
        if end_date is None:
            end_date = date.today()
        if start_date is None:
            start_date = end_date - timedelta(days=30)

        # Map granularity to PostgreSQL date_trunc
        trunc_map = {
            "daily": "day",
            "weekly": "week",
            "monthly": "month",
        }
        trunc_value = trunc_map.get(granularity, "day")

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                f"""
                SELECT
                    DATE_TRUNC('{trunc_value}', occurred_at)::date as event_date,
                    COUNT(*) FILTER (WHERE event_type = 'gallery_view') as total_views,
                    COUNT(DISTINCT COALESCE(client_id::text, visitor_id::text, ip_address::text))
                        FILTER (WHERE event_type = 'gallery_view') as unique_visitors
                FROM analytics_events
                WHERE workspace_id = $1
                    AND gallery_id = $2
                    AND occurred_at >= $3
                    AND occurred_at <= $4
                GROUP BY DATE_TRUNC('{trunc_value}', occurred_at)
                ORDER BY event_date ASC
                """,
                workspace_id,
                gallery_id,
                datetime.combine(start_date, datetime.min.time(), timezone.utc),
                datetime.combine(end_date, datetime.max.time(), timezone.utc),
            )

            return [
                {
                    "date": row["event_date"].isoformat(),
                    "total_views": row["total_views"] or 0,
                    "unique_visitors": row["unique_visitors"] or 0,
                }
                for row in rows
            ]

    async def get_gallery_engagement_breakdown(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        *,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
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
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            filters = ["workspace_id = $1", "gallery_id = $2"]
            params: list[Any] = [workspace_id, gallery_id]
            param_idx = 3

            if start_date:
                filters.append(f"occurred_at >= ${param_idx}")
                params.append(datetime.combine(start_date, datetime.min.time(), timezone.utc))
                param_idx += 1

            if end_date:
                filters.append(f"occurred_at <= ${param_idx}")
                params.append(datetime.combine(end_date, datetime.max.time(), timezone.utc))
                param_idx += 1

            where_clause = " AND ".join(filters)

            row = await conn.fetchrow(
                f"""
                SELECT
                    COUNT(*) FILTER (WHERE event_type = 'gallery_view') as views,
                    COUNT(*) FILTER (WHERE event_type = 'asset_view') as asset_views,
                    COUNT(*) FILTER (WHERE event_type = 'asset_favorite') as favorites,
                    COUNT(*) FILTER (WHERE event_type = 'asset_comment') as comments,
                    COUNT(*) FILTER (WHERE event_type = 'asset_select') as selections,
                    COUNT(*) FILTER (WHERE event_type IN ('asset_download', 'gallery_download', 'bulk_download_completed'))
                        as downloads,
                    COUNT(*) FILTER (WHERE event_type = 'gallery_share') as shares,
                    COUNT(DISTINCT asset_id) FILTER (WHERE event_type = 'asset_view') as unique_assets_viewed,
                    COUNT(DISTINCT client_id) FILTER (WHERE client_id IS NOT NULL) as unique_clients
                FROM analytics_events
                WHERE {where_clause}
                """,
                *params,
            )

            views = row["views"] or 0
            total_engagement = (
                (row["favorites"] or 0) +
                (row["comments"] or 0) +
                (row["selections"] or 0) +
                (row["downloads"] or 0) +
                (row["shares"] or 0)
            )

            return {
                "views": views,
                "asset_views": row["asset_views"] or 0,
                "favorites": row["favorites"] or 0,
                "comments": row["comments"] or 0,
                "selections": row["selections"] or 0,
                "downloads": row["downloads"] or 0,
                "shares": row["shares"] or 0,
                "unique_assets_viewed": row["unique_assets_viewed"] or 0,
                "unique_clients": row["unique_clients"] or 0,
                "total_engagement_actions": total_engagement,
                "engagement_rate": round((total_engagement / views * 100), 2) if views > 0 else 0.0,
            }

    async def get_galleries_needing_aggregation(
        self,
        workspace_id: UUID,
        period_type: str,
        *,
        stale_threshold_hours: int = 24,
        limit: int = 100,
    ) -> list[UUID]:
        """Get galleries that need analytics aggregation.

        Identifies galleries with recent events but outdated or missing
        analytics records.

        Args:
            workspace_id: Workspace for tenant isolation
            period_type: Type of period to check
            stale_threshold_hours: Hours before analytics are considered stale
            limit: Max galleries to return

        Returns:
            List of gallery IDs needing aggregation
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            threshold = datetime.now(timezone.utc) - timedelta(hours=stale_threshold_hours)

            rows = await conn.fetch(
                """
                SELECT DISTINCT e.gallery_id
                FROM analytics_events e
                LEFT JOIN gallery_analytics ga ON
                    e.gallery_id = ga.gallery_id
                    AND ga.period_type = $2
                WHERE e.workspace_id = $1
                    AND e.gallery_id IS NOT NULL
                    AND e.occurred_at > $3
                    AND (ga.calculated_at IS NULL OR ga.calculated_at < $3)
                LIMIT $4
                """,
                workspace_id,
                period_type,
                threshold,
                limit,
            )

            return [row["gallery_id"] for row in rows]

    async def delete_gallery_analytics(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        *,
        period_type: Optional[str] = None,
    ) -> int:
        """Delete gallery analytics records.

        Args:
            workspace_id: Workspace for tenant isolation
            gallery_id: Gallery to delete analytics for
            period_type: Optional period type filter

        Returns:
            Number of deleted records
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            if period_type:
                result = await conn.execute(
                    """
                    DELETE FROM gallery_analytics
                    WHERE workspace_id = $1 AND gallery_id = $2 AND period_type = $3
                    """,
                    workspace_id,
                    gallery_id,
                    period_type,
                )
            else:
                result = await conn.execute(
                    """
                    DELETE FROM gallery_analytics
                    WHERE workspace_id = $1 AND gallery_id = $2
                    """,
                    workspace_id,
                    gallery_id,
                )

            deleted_count = int(result.split()[-1]) if result else 0

            logger.info(
                "Deleted gallery analytics",
                extra={
                    "workspace_id": str(workspace_id),
                    "gallery_id": str(gallery_id),
                    "period_type": period_type,
                    "deleted_count": deleted_count,
                },
            )

            return deleted_count

    # =========================================================================
    # Client Analytics Aggregation (T013)
    # =========================================================================

    @staticmethod
    def _row_to_client_analytics_dict(row: Any) -> dict[str, Any]:
        """Convert a database row to a client analytics dictionary.

        Handles type conversions for UUIDs, dates, datetimes, decimals, and integers.

        Args:
            row: Database row from asyncpg

        Returns:
            Dictionary representation of the client analytics
        """
        if row is None:
            return {}

        result = dict(row)

        # Convert UUIDs to strings
        uuid_fields = ["client_analytics_id", "workspace_id", "client_id"]
        for field in uuid_fields:
            if field in result and result[field] is not None:
                result[field] = str(result[field])

        # Convert dates to ISO format strings
        date_fields = ["period_start", "period_end"]
        for field in date_fields:
            if field in result and result[field] is not None:
                result[field] = result[field].isoformat()

        # Convert datetimes to ISO format strings
        datetime_fields = ["calculated_at", "created_at", "updated_at", "last_activity_at"]
        for field in datetime_fields:
            if field in result and result[field] is not None:
                result[field] = result[field].isoformat()

        # Convert Decimals to float
        decimal_fields = ["engagement_score", "engagement_trend"]
        for field in decimal_fields:
            if field in result and result[field] is not None:
                result[field] = float(result[field])

        return result

    async def aggregate_client_analytics(
        self,
        workspace_id: UUID,
        client_id: UUID,
        period_type: str,
        period_start: date,
        period_end: date,
    ) -> dict[str, Any]:
        """Aggregate analytics for a client from raw events and store the result.

        Computes all metrics from the analytics_events table for the specified
        period and upserts the result into client_analytics.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to aggregate analytics for
            period_type: Type of period ('daily', 'weekly', 'monthly', 'all_time')
            period_start: Start date of the aggregation period
            period_end: End date of the aggregation period

        Returns:
            Aggregated client analytics record
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Convert dates to datetime for event filtering
            start_datetime = datetime.combine(period_start, datetime.min.time(), timezone.utc)
            end_datetime = datetime.combine(period_end, datetime.max.time(), timezone.utc)
            now = datetime.now(timezone.utc)

            # Aggregate activity metrics
            activity_metrics = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) FILTER (WHERE event_type = 'gallery_view') as total_gallery_views,
                    COUNT(*) FILTER (WHERE event_type = 'asset_view') as total_asset_views,
                    COUNT(*) FILTER (WHERE event_type = 'asset_favorite') as total_favorites,
                    COUNT(*) FILTER (WHERE event_type = 'asset_comment') as total_comments,
                    COUNT(*) FILTER (WHERE event_type = 'asset_select') as total_selections,
                    COUNT(*) FILTER (WHERE event_type IN ('asset_download', 'gallery_download', 'bulk_download_completed'))
                        as total_downloads
                FROM analytics_events
                WHERE workspace_id = $1
                    AND client_id = $2
                    AND occurred_at >= $3
                    AND occurred_at <= $4
                """,
                workspace_id,
                client_id,
                start_datetime,
                end_datetime,
            )

            # Aggregate session metrics
            session_metrics = await conn.fetchrow(
                """
                SELECT
                    COUNT(DISTINCT session_id) as total_sessions,
                    COALESCE(SUM(duration_ms) FILTER (WHERE event_type = 'session_end'), 0) as total_time_spent_ms,
                    COALESCE(AVG(duration_ms) FILTER (WHERE event_type = 'session_end' AND duration_ms IS NOT NULL), 0)::integer
                        as avg_session_duration_ms
                FROM analytics_events
                WHERE workspace_id = $1
                    AND client_id = $2
                    AND occurred_at >= $3
                    AND occurred_at <= $4
                """,
                workspace_id,
                client_id,
                start_datetime,
                end_datetime,
            )

            # Aggregate gallery interaction metrics
            gallery_metrics = await conn.fetchrow(
                """
                SELECT
                    COUNT(DISTINCT gallery_id) FILTER (WHERE event_type = 'gallery_view') as galleries_viewed,
                    COUNT(DISTINCT gallery_id) FILTER (WHERE event_type IN (
                        'asset_favorite', 'asset_comment', 'asset_select',
                        'asset_download', 'gallery_download', 'bulk_download_completed'
                    )) as galleries_with_activity
                FROM analytics_events
                WHERE workspace_id = $1
                    AND client_id = $2
                    AND gallery_id IS NOT NULL
                    AND occurred_at >= $3
                    AND occurred_at <= $4
                """,
                workspace_id,
                client_id,
                start_datetime,
                end_datetime,
            )

            # Get last activity timestamp
            last_activity = await conn.fetchval(
                """
                SELECT MAX(occurred_at)
                FROM analytics_events
                WHERE workspace_id = $1
                    AND client_id = $2
                """,
                workspace_id,
                client_id,
            )

            # Calculate days since last activity
            days_since_last_activity = None
            if last_activity:
                days_since_last_activity = (now - last_activity).days

            # Calculate frequency metrics (visits in various time windows)
            visits_7_days = await conn.fetchval(
                """
                SELECT COUNT(DISTINCT DATE(occurred_at))
                FROM analytics_events
                WHERE workspace_id = $1
                    AND client_id = $2
                    AND occurred_at >= $3
                """,
                workspace_id,
                client_id,
                now - timedelta(days=7),
            )

            visits_30_days = await conn.fetchval(
                """
                SELECT COUNT(DISTINCT DATE(occurred_at))
                FROM analytics_events
                WHERE workspace_id = $1
                    AND client_id = $2
                    AND occurred_at >= $3
                """,
                workspace_id,
                client_id,
                now - timedelta(days=30),
            )

            visits_90_days = await conn.fetchval(
                """
                SELECT COUNT(DISTINCT DATE(occurred_at))
                FROM analytics_events
                WHERE workspace_id = $1
                    AND client_id = $2
                    AND occurred_at >= $3
                """,
                workspace_id,
                client_id,
                now - timedelta(days=90),
            )

            # Aggregate revenue from numeric_value in metadata (sum of revenue-related events)
            revenue_metrics = await conn.fetchrow(
                """
                SELECT
                    COALESCE(SUM(numeric_value) FILTER (WHERE event_type IN ('asset_download', 'gallery_download')
                        AND metadata->>'has_revenue' = 'true'), 0)::bigint as period_revenue_cents
                FROM analytics_events
                WHERE workspace_id = $1
                    AND client_id = $2
                    AND occurred_at >= $3
                    AND occurred_at <= $4
                """,
                workspace_id,
                client_id,
                start_datetime,
                end_datetime,
            )

            # Get existing lifetime value if this is not all_time period
            existing_ltv = 0
            if period_type != "all_time":
                existing_ltv_result = await conn.fetchval(
                    """
                    SELECT lifetime_value_cents
                    FROM client_analytics
                    WHERE workspace_id = $1 AND client_id = $2 AND period_type = 'all_time'
                    ORDER BY period_start DESC
                    LIMIT 1
                    """,
                    workspace_id,
                    client_id,
                )
                existing_ltv = existing_ltv_result or 0
            else:
                # For all_time, calculate total revenue ever
                existing_ltv_result = await conn.fetchval(
                    """
                    SELECT COALESCE(SUM(numeric_value), 0)::bigint
                    FROM analytics_events
                    WHERE workspace_id = $1
                        AND client_id = $2
                        AND event_type IN ('asset_download', 'gallery_download')
                        AND metadata->>'has_revenue' = 'true'
                    """,
                    workspace_id,
                    client_id,
                )
                existing_ltv = existing_ltv_result or 0

            # Calculate engagement score (0-100)
            total_gallery_views = activity_metrics["total_gallery_views"] or 0
            total_favorites = activity_metrics["total_favorites"] or 0
            total_comments = activity_metrics["total_comments"] or 0
            total_selections = activity_metrics["total_selections"] or 0
            total_downloads = activity_metrics["total_downloads"] or 0

            engagement_score = 0.0
            if total_gallery_views > 0:
                # Weighted engagement score based on actions
                engagement_actions = (
                    total_favorites * 2 +    # Favorites weighted 2x
                    total_comments * 3 +     # Comments weighted 3x
                    total_selections * 1 +   # Selections weighted 1x
                    total_downloads * 2      # Downloads weighted 2x
                )
                # Normalize to 0-100 scale (cap at 100)
                engagement_score = min(100.0, (engagement_actions / total_gallery_views) * 20)

            # Calculate engagement trend (compare with previous period)
            engagement_trend = None
            if period_type != "all_time":
                # Get previous period's engagement score
                prev_period_score = await conn.fetchval(
                    """
                    SELECT engagement_score
                    FROM client_analytics
                    WHERE workspace_id = $1
                        AND client_id = $2
                        AND period_type = $3
                        AND period_start < $4
                    ORDER BY period_start DESC
                    LIMIT 1
                    """,
                    workspace_id,
                    client_id,
                    period_type,
                    period_start,
                )
                if prev_period_score is not None and prev_period_score > 0:
                    engagement_trend = float(engagement_score) - float(prev_period_score)

            # Calculate churn risk score (0-100, higher = more at risk)
            churn_risk_score = None
            if days_since_last_activity is not None:
                # Base churn risk on days since last activity and engagement
                if days_since_last_activity <= 7:
                    churn_risk_score = 0
                elif days_since_last_activity <= 14:
                    churn_risk_score = 15
                elif days_since_last_activity <= 30:
                    churn_risk_score = 35
                elif days_since_last_activity <= 60:
                    churn_risk_score = 55
                elif days_since_last_activity <= 90:
                    churn_risk_score = 75
                else:
                    churn_risk_score = 90

                # Adjust based on engagement (lower engagement = higher risk)
                if engagement_score < 20:
                    churn_risk_score = min(100, churn_risk_score + 15)
                elif engagement_score < 40:
                    churn_risk_score = min(100, churn_risk_score + 5)
                elif engagement_score > 70:
                    churn_risk_score = max(0, churn_risk_score - 10)

                # Adjust based on recent activity
                if visits_7_days and visits_7_days > 0:
                    churn_risk_score = max(0, churn_risk_score - 20)
                elif visits_30_days and visits_30_days > 0:
                    churn_risk_score = max(0, churn_risk_score - 10)

            # Upsert the aggregated analytics
            row = await conn.fetchrow(
                """
                INSERT INTO client_analytics (
                    workspace_id, client_id, period_type, period_start, period_end,
                    total_gallery_views, total_asset_views, total_favorites, total_comments,
                    total_selections, total_downloads,
                    total_sessions, total_time_spent_ms, avg_session_duration_ms,
                    galleries_viewed, galleries_with_activity,
                    engagement_score, engagement_trend,
                    lifetime_value_cents, period_revenue_cents,
                    last_activity_at, days_since_last_activity,
                    visits_last_7_days, visits_last_30_days, visits_last_90_days,
                    churn_risk_score,
                    calculated_at, created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5,
                    $6, $7, $8, $9,
                    $10, $11,
                    $12, $13, $14,
                    $15, $16,
                    $17, $18,
                    $19, $20,
                    $21, $22,
                    $23, $24, $25,
                    $26,
                    $27, $27, $27
                )
                ON CONFLICT (client_id, period_type, period_start)
                DO UPDATE SET
                    total_gallery_views = EXCLUDED.total_gallery_views,
                    total_asset_views = EXCLUDED.total_asset_views,
                    total_favorites = EXCLUDED.total_favorites,
                    total_comments = EXCLUDED.total_comments,
                    total_selections = EXCLUDED.total_selections,
                    total_downloads = EXCLUDED.total_downloads,
                    total_sessions = EXCLUDED.total_sessions,
                    total_time_spent_ms = EXCLUDED.total_time_spent_ms,
                    avg_session_duration_ms = EXCLUDED.avg_session_duration_ms,
                    galleries_viewed = EXCLUDED.galleries_viewed,
                    galleries_with_activity = EXCLUDED.galleries_with_activity,
                    engagement_score = EXCLUDED.engagement_score,
                    engagement_trend = EXCLUDED.engagement_trend,
                    lifetime_value_cents = EXCLUDED.lifetime_value_cents,
                    period_revenue_cents = EXCLUDED.period_revenue_cents,
                    last_activity_at = EXCLUDED.last_activity_at,
                    days_since_last_activity = EXCLUDED.days_since_last_activity,
                    visits_last_7_days = EXCLUDED.visits_last_7_days,
                    visits_last_30_days = EXCLUDED.visits_last_30_days,
                    visits_last_90_days = EXCLUDED.visits_last_90_days,
                    churn_risk_score = EXCLUDED.churn_risk_score,
                    calculated_at = EXCLUDED.calculated_at,
                    updated_at = EXCLUDED.updated_at
                RETURNING *
                """,
                workspace_id,
                client_id,
                period_type,
                period_start,
                period_end,
                activity_metrics["total_gallery_views"] or 0,
                activity_metrics["total_asset_views"] or 0,
                activity_metrics["total_favorites"] or 0,
                activity_metrics["total_comments"] or 0,
                activity_metrics["total_selections"] or 0,
                activity_metrics["total_downloads"] or 0,
                session_metrics["total_sessions"] or 0,
                session_metrics["total_time_spent_ms"] or 0,
                session_metrics["avg_session_duration_ms"] or 0,
                gallery_metrics["galleries_viewed"] or 0,
                gallery_metrics["galleries_with_activity"] or 0,
                engagement_score,
                engagement_trend,
                existing_ltv,
                revenue_metrics["period_revenue_cents"] or 0,
                last_activity,
                days_since_last_activity,
                visits_7_days or 0,
                visits_30_days or 0,
                visits_90_days or 0,
                churn_risk_score,
                now,
            )

            analytics = self._row_to_client_analytics_dict(row)

            logger.info(
                "Aggregated client analytics",
                extra={
                    "client_analytics_id": analytics.get("client_analytics_id"),
                    "workspace_id": str(workspace_id),
                    "client_id": str(client_id),
                    "period_type": period_type,
                    "period_start": period_start.isoformat(),
                    "period_end": period_end.isoformat(),
                },
            )

            return analytics

    async def get_client_analytics(
        self,
        workspace_id: UUID,
        client_id: UUID,
        period_type: str = "all_time",
    ) -> Optional[dict[str, Any]]:
        """Get the most recent client analytics for a specific period type.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to get analytics for
            period_type: Type of period ('daily', 'weekly', 'monthly', 'all_time')

        Returns:
            Client analytics record or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM client_analytics
                WHERE workspace_id = $1
                    AND client_id = $2
                    AND period_type = $3
                ORDER BY period_start DESC
                LIMIT 1
                """,
                workspace_id,
                client_id,
                period_type,
            )

            if row is None:
                return None

            return self._row_to_client_analytics_dict(row)

    async def get_client_analytics_by_id(
        self,
        workspace_id: UUID,
        client_analytics_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get a client analytics record by ID.

        Args:
            workspace_id: Workspace for tenant isolation
            client_analytics_id: Analytics record ID

        Returns:
            Client analytics record or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM client_analytics
                WHERE workspace_id = $1 AND client_analytics_id = $2
                """,
                workspace_id,
                client_analytics_id,
            )

            if row is None:
                return None

            return self._row_to_client_analytics_dict(row)

    async def get_client_analytics_history(
        self,
        workspace_id: UUID,
        client_id: UUID,
        period_type: str = "daily",
        *,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        limit: int = 30,
    ) -> list[dict[str, Any]]:
        """Get historical client analytics for trend analysis.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to get history for
            period_type: Type of period to retrieve
            start_date: Start of date range filter
            end_date: End of date range filter
            limit: Max records to return

        Returns:
            List of client analytics records ordered by period_start DESC
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            filters = ["workspace_id = $1", "client_id = $2", "period_type = $3"]
            params: list[Any] = [workspace_id, client_id, period_type]
            param_idx = 4

            if start_date:
                filters.append(f"period_start >= ${param_idx}")
                params.append(start_date)
                param_idx += 1

            if end_date:
                filters.append(f"period_end <= ${param_idx}")
                params.append(end_date)
                param_idx += 1

            where_clause = " AND ".join(filters)
            params.append(min(limit, 365))  # Cap at 365 records

            rows = await conn.fetch(
                f"""
                SELECT * FROM client_analytics
                WHERE {where_clause}
                ORDER BY period_start DESC
                LIMIT ${param_idx}
                """,
                *params,
            )

            return [self._row_to_client_analytics_dict(row) for row in rows]

    async def get_top_clients(
        self,
        workspace_id: UUID,
        *,
        period_type: str = "all_time",
        sort_by: str = "engagement_score",
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """Get top performing clients for a workspace.

        Args:
            workspace_id: Workspace for tenant isolation
            period_type: Type of period to consider
            sort_by: Metric to sort by ('engagement_score', 'total_gallery_views',
                     'total_downloads', 'lifetime_value_cents')
            limit: Max clients to return

        Returns:
            List of top client analytics records
        """
        # Validate sort_by to prevent SQL injection
        valid_sort_columns = {
            "engagement_score": "engagement_score",
            "total_gallery_views": "total_gallery_views",
            "total_downloads": "total_downloads",
            "lifetime_value_cents": "lifetime_value_cents",
            "total_favorites": "total_favorites",
            "total_comments": "total_comments",
            "total_sessions": "total_sessions",
        }

        sort_column = valid_sort_columns.get(sort_by, "engagement_score")

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                f"""
                SELECT ca.*, c.name as client_name, c.email as client_email
                FROM client_analytics ca
                LEFT JOIN clients c ON ca.client_id = c.client_id
                WHERE ca.workspace_id = $1 AND ca.period_type = $2
                ORDER BY ca.{sort_column} DESC NULLS LAST
                LIMIT $3
                """,
                workspace_id,
                period_type,
                min(limit, 100),
            )

            result = []
            for row in rows:
                analytics = self._row_to_client_analytics_dict(row)
                analytics["client_name"] = row.get("client_name")
                analytics["client_email"] = row.get("client_email")
                result.append(analytics)

            return result

    async def get_clients_at_churn_risk(
        self,
        workspace_id: UUID,
        *,
        min_risk_score: int = 50,
        period_type: str = "all_time",
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        """Get clients at risk of churning.

        Args:
            workspace_id: Workspace for tenant isolation
            min_risk_score: Minimum churn risk score (0-100)
            period_type: Type of period to consider
            limit: Max clients to return

        Returns:
            List of at-risk client analytics records with risk factors
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT ca.*, c.name as client_name, c.email as client_email
                FROM client_analytics ca
                LEFT JOIN clients c ON ca.client_id = c.client_id
                WHERE ca.workspace_id = $1
                    AND ca.period_type = $2
                    AND ca.churn_risk_score >= $3
                ORDER BY ca.churn_risk_score DESC
                LIMIT $4
                """,
                workspace_id,
                period_type,
                min_risk_score,
                min(limit, 100),
            )

            result = []
            for row in rows:
                analytics = self._row_to_client_analytics_dict(row)
                analytics["client_name"] = row.get("client_name")
                analytics["client_email"] = row.get("client_email")

                # Determine risk factors
                risk_factors = []
                days_inactive = analytics.get("days_since_last_activity")
                engagement = analytics.get("engagement_score", 0)
                visits_7 = analytics.get("visits_last_7_days", 0)
                visits_30 = analytics.get("visits_last_30_days", 0)

                if days_inactive is not None:
                    if days_inactive > 90:
                        risk_factors.append("No activity in 90+ days")
                    elif days_inactive > 60:
                        risk_factors.append("No activity in 60+ days")
                    elif days_inactive > 30:
                        risk_factors.append("No activity in 30+ days")

                if engagement < 20:
                    risk_factors.append("Very low engagement score")
                elif engagement < 40:
                    risk_factors.append("Low engagement score")

                if visits_7 == 0 and visits_30 == 0:
                    risk_factors.append("No visits in last 30 days")
                elif visits_7 == 0:
                    risk_factors.append("No visits in last 7 days")

                analytics["risk_factors"] = risk_factors
                result.append(analytics)

            return result

    async def get_workspace_client_stats(
        self,
        workspace_id: UUID,
        period_type: str = "all_time",
    ) -> dict[str, Any]:
        """Get aggregate statistics across all clients in a workspace.

        Args:
            workspace_id: Workspace for tenant isolation
            period_type: Type of period to aggregate

        Returns:
            Aggregate statistics dictionary
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    COUNT(DISTINCT client_id) as total_clients,
                    COALESCE(SUM(total_gallery_views), 0) as total_gallery_views,
                    COALESCE(SUM(total_downloads), 0) as total_downloads,
                    COALESCE(SUM(total_favorites), 0) as total_favorites,
                    COALESCE(SUM(total_comments), 0) as total_comments,
                    COALESCE(SUM(total_sessions), 0) as total_sessions,
                    COALESCE(SUM(lifetime_value_cents), 0) as total_lifetime_value_cents,
                    COALESCE(AVG(engagement_score), 0)::numeric(5,2) as avg_engagement_score,
                    COALESCE(AVG(churn_risk_score), 0)::integer as avg_churn_risk_score,
                    COUNT(*) FILTER (WHERE churn_risk_score >= 70) as high_risk_clients,
                    COUNT(*) FILTER (WHERE churn_risk_score >= 50 AND churn_risk_score < 70) as medium_risk_clients,
                    COUNT(*) FILTER (WHERE churn_risk_score < 50 OR churn_risk_score IS NULL) as low_risk_clients,
                    COUNT(*) FILTER (WHERE engagement_score >= 70) as highly_engaged_clients,
                    COUNT(*) FILTER (WHERE engagement_score >= 40 AND engagement_score < 70) as moderately_engaged_clients,
                    COUNT(*) FILTER (WHERE engagement_score < 40) as low_engagement_clients
                FROM client_analytics
                WHERE workspace_id = $1 AND period_type = $2
                """,
                workspace_id,
                period_type,
            )

            if row is None:
                return {
                    "total_clients": 0,
                    "total_gallery_views": 0,
                    "total_downloads": 0,
                    "total_favorites": 0,
                    "total_comments": 0,
                    "total_sessions": 0,
                    "total_lifetime_value_cents": 0,
                    "avg_engagement_score": 0.0,
                    "avg_churn_risk_score": 0,
                    "churn_risk_breakdown": {
                        "high_risk": 0,
                        "medium_risk": 0,
                        "low_risk": 0,
                    },
                    "engagement_breakdown": {
                        "highly_engaged": 0,
                        "moderately_engaged": 0,
                        "low_engagement": 0,
                    },
                }

            total_clients = row["total_clients"] or 0

            return {
                "total_clients": total_clients,
                "total_gallery_views": row["total_gallery_views"] or 0,
                "total_downloads": row["total_downloads"] or 0,
                "total_favorites": row["total_favorites"] or 0,
                "total_comments": row["total_comments"] or 0,
                "total_sessions": row["total_sessions"] or 0,
                "total_lifetime_value_cents": row["total_lifetime_value_cents"] or 0,
                "avg_engagement_score": float(row["avg_engagement_score"]) if row["avg_engagement_score"] else 0.0,
                "avg_churn_risk_score": row["avg_churn_risk_score"] or 0,
                "churn_risk_breakdown": {
                    "high_risk": row["high_risk_clients"] or 0,
                    "high_risk_percentage": (
                        round((row["high_risk_clients"] or 0) / total_clients * 100, 2)
                        if total_clients > 0 else 0.0
                    ),
                    "medium_risk": row["medium_risk_clients"] or 0,
                    "medium_risk_percentage": (
                        round((row["medium_risk_clients"] or 0) / total_clients * 100, 2)
                        if total_clients > 0 else 0.0
                    ),
                    "low_risk": row["low_risk_clients"] or 0,
                    "low_risk_percentage": (
                        round((row["low_risk_clients"] or 0) / total_clients * 100, 2)
                        if total_clients > 0 else 0.0
                    ),
                },
                "engagement_breakdown": {
                    "highly_engaged": row["highly_engaged_clients"] or 0,
                    "highly_engaged_percentage": (
                        round((row["highly_engaged_clients"] or 0) / total_clients * 100, 2)
                        if total_clients > 0 else 0.0
                    ),
                    "moderately_engaged": row["moderately_engaged_clients"] or 0,
                    "moderately_engaged_percentage": (
                        round((row["moderately_engaged_clients"] or 0) / total_clients * 100, 2)
                        if total_clients > 0 else 0.0
                    ),
                    "low_engagement": row["low_engagement_clients"] or 0,
                    "low_engagement_percentage": (
                        round((row["low_engagement_clients"] or 0) / total_clients * 100, 2)
                        if total_clients > 0 else 0.0
                    ),
                },
            }

    async def get_client_activity_time_series(
        self,
        workspace_id: UUID,
        client_id: UUID,
        *,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        granularity: str = "daily",
    ) -> list[dict[str, Any]]:
        """Get client activity as a time series for charting.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to get time series for
            start_date: Start date (default: 30 days ago)
            end_date: End date (default: today)
            granularity: Time granularity ('daily', 'weekly', 'monthly')

        Returns:
            List of {date, gallery_views, asset_views, total_engagement_actions} records
        """
        if end_date is None:
            end_date = date.today()
        if start_date is None:
            start_date = end_date - timedelta(days=30)

        # Map granularity to PostgreSQL date_trunc
        trunc_map = {
            "daily": "day",
            "weekly": "week",
            "monthly": "month",
        }
        trunc_value = trunc_map.get(granularity, "day")

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                f"""
                SELECT
                    DATE_TRUNC('{trunc_value}', occurred_at)::date as event_date,
                    COUNT(*) FILTER (WHERE event_type = 'gallery_view') as gallery_views,
                    COUNT(*) FILTER (WHERE event_type = 'asset_view') as asset_views,
                    COUNT(*) FILTER (WHERE event_type IN (
                        'asset_favorite', 'asset_comment', 'asset_select',
                        'asset_download', 'gallery_download', 'bulk_download_completed'
                    )) as total_engagement_actions
                FROM analytics_events
                WHERE workspace_id = $1
                    AND client_id = $2
                    AND occurred_at >= $3
                    AND occurred_at <= $4
                GROUP BY DATE_TRUNC('{trunc_value}', occurred_at)
                ORDER BY event_date ASC
                """,
                workspace_id,
                client_id,
                datetime.combine(start_date, datetime.min.time(), timezone.utc),
                datetime.combine(end_date, datetime.max.time(), timezone.utc),
            )

            return [
                {
                    "date": row["event_date"].isoformat(),
                    "gallery_views": row["gallery_views"] or 0,
                    "asset_views": row["asset_views"] or 0,
                    "total_engagement_actions": row["total_engagement_actions"] or 0,
                }
                for row in rows
            ]

    async def get_client_engagement_breakdown(
        self,
        workspace_id: UUID,
        client_id: UUID,
        *,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> dict[str, Any]:
        """Get detailed engagement breakdown for a client.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to analyze
            start_date: Start date (optional)
            end_date: End date (optional)

        Returns:
            Engagement breakdown with metrics and percentages
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            filters = ["workspace_id = $1", "client_id = $2"]
            params: list[Any] = [workspace_id, client_id]
            param_idx = 3

            if start_date:
                filters.append(f"occurred_at >= ${param_idx}")
                params.append(datetime.combine(start_date, datetime.min.time(), timezone.utc))
                param_idx += 1

            if end_date:
                filters.append(f"occurred_at <= ${param_idx}")
                params.append(datetime.combine(end_date, datetime.max.time(), timezone.utc))
                param_idx += 1

            where_clause = " AND ".join(filters)

            row = await conn.fetchrow(
                f"""
                SELECT
                    COUNT(*) FILTER (WHERE event_type = 'gallery_view') as gallery_views,
                    COUNT(*) FILTER (WHERE event_type = 'asset_view') as asset_views,
                    COUNT(*) FILTER (WHERE event_type = 'asset_favorite') as favorites,
                    COUNT(*) FILTER (WHERE event_type = 'asset_comment') as comments,
                    COUNT(*) FILTER (WHERE event_type = 'asset_select') as selections,
                    COUNT(*) FILTER (WHERE event_type IN ('asset_download', 'gallery_download', 'bulk_download_completed'))
                        as downloads,
                    COUNT(*) FILTER (WHERE event_type = 'gallery_share') as shares,
                    COUNT(DISTINCT gallery_id) FILTER (WHERE event_type = 'gallery_view') as unique_galleries_viewed,
                    COUNT(DISTINCT asset_id) FILTER (WHERE event_type = 'asset_view') as unique_assets_viewed,
                    COUNT(DISTINCT session_id) as unique_sessions,
                    MIN(occurred_at) as first_activity,
                    MAX(occurred_at) as last_activity
                FROM analytics_events
                WHERE {where_clause}
                """,
                *params,
            )

            gallery_views = row["gallery_views"] or 0
            total_engagement = (
                (row["favorites"] or 0) +
                (row["comments"] or 0) +
                (row["selections"] or 0) +
                (row["downloads"] or 0) +
                (row["shares"] or 0)
            )

            first_activity = row["first_activity"]
            last_activity = row["last_activity"]

            return {
                "gallery_views": gallery_views,
                "asset_views": row["asset_views"] or 0,
                "favorites": row["favorites"] or 0,
                "comments": row["comments"] or 0,
                "selections": row["selections"] or 0,
                "downloads": row["downloads"] or 0,
                "shares": row["shares"] or 0,
                "unique_galleries_viewed": row["unique_galleries_viewed"] or 0,
                "unique_assets_viewed": row["unique_assets_viewed"] or 0,
                "unique_sessions": row["unique_sessions"] or 0,
                "total_engagement_actions": total_engagement,
                "engagement_rate": round((total_engagement / gallery_views * 100), 2) if gallery_views > 0 else 0.0,
                "first_activity": first_activity.isoformat() if first_activity else None,
                "last_activity": last_activity.isoformat() if last_activity else None,
            }

    async def get_client_gallery_interactions(
        self,
        workspace_id: UUID,
        client_id: UUID,
        *,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        """Get galleries a client has interacted with, ranked by engagement.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to analyze
            limit: Max galleries to return

        Returns:
            List of galleries with interaction metrics
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    e.gallery_id,
                    g.name as gallery_name,
                    COUNT(*) FILTER (WHERE e.event_type = 'gallery_view') as views,
                    COUNT(*) FILTER (WHERE e.event_type = 'asset_favorite') as favorites,
                    COUNT(*) FILTER (WHERE e.event_type = 'asset_comment') as comments,
                    COUNT(*) FILTER (WHERE e.event_type = 'asset_select') as selections,
                    COUNT(*) FILTER (WHERE e.event_type IN ('asset_download', 'gallery_download', 'bulk_download_completed'))
                        as downloads,
                    MIN(e.occurred_at) as first_visit,
                    MAX(e.occurred_at) as last_visit,
                    COUNT(DISTINCT DATE(e.occurred_at)) as visit_days
                FROM analytics_events e
                LEFT JOIN galleries g ON e.gallery_id = g.gallery_id
                WHERE e.workspace_id = $1
                    AND e.client_id = $2
                    AND e.gallery_id IS NOT NULL
                GROUP BY e.gallery_id, g.name
                ORDER BY (
                    COUNT(*) FILTER (WHERE e.event_type = 'gallery_view') +
                    COUNT(*) FILTER (WHERE e.event_type = 'asset_favorite') * 2 +
                    COUNT(*) FILTER (WHERE e.event_type = 'asset_comment') * 3 +
                    COUNT(*) FILTER (WHERE e.event_type IN ('asset_download', 'gallery_download')) * 2
                ) DESC
                LIMIT $3
                """,
                workspace_id,
                client_id,
                min(limit, 100),
            )

            return [
                {
                    "gallery_id": str(row["gallery_id"]) if row["gallery_id"] else None,
                    "gallery_name": row["gallery_name"],
                    "views": row["views"] or 0,
                    "favorites": row["favorites"] or 0,
                    "comments": row["comments"] or 0,
                    "selections": row["selections"] or 0,
                    "downloads": row["downloads"] or 0,
                    "first_visit": row["first_visit"].isoformat() if row["first_visit"] else None,
                    "last_visit": row["last_visit"].isoformat() if row["last_visit"] else None,
                    "visit_days": row["visit_days"] or 0,
                }
                for row in rows
            ]

    async def get_clients_needing_aggregation(
        self,
        workspace_id: UUID,
        period_type: str,
        *,
        stale_threshold_hours: int = 24,
        limit: int = 100,
    ) -> list[UUID]:
        """Get clients that need analytics aggregation.

        Identifies clients with recent events but outdated or missing
        analytics records.

        Args:
            workspace_id: Workspace for tenant isolation
            period_type: Type of period to check
            stale_threshold_hours: Hours before analytics are considered stale
            limit: Max clients to return

        Returns:
            List of client IDs needing aggregation
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            threshold = datetime.now(timezone.utc) - timedelta(hours=stale_threshold_hours)

            rows = await conn.fetch(
                """
                SELECT DISTINCT e.client_id
                FROM analytics_events e
                LEFT JOIN client_analytics ca ON
                    e.client_id = ca.client_id
                    AND ca.period_type = $2
                WHERE e.workspace_id = $1
                    AND e.client_id IS NOT NULL
                    AND e.occurred_at > $3
                    AND (ca.calculated_at IS NULL OR ca.calculated_at < $3)
                LIMIT $4
                """,
                workspace_id,
                period_type,
                threshold,
                limit,
            )

            return [row["client_id"] for row in rows]

    async def delete_client_analytics(
        self,
        workspace_id: UUID,
        client_id: UUID,
        *,
        period_type: Optional[str] = None,
    ) -> int:
        """Delete client analytics records.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to delete analytics for
            period_type: Optional period type filter

        Returns:
            Number of deleted records
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            if period_type:
                result = await conn.execute(
                    """
                    DELETE FROM client_analytics
                    WHERE workspace_id = $1 AND client_id = $2 AND period_type = $3
                    """,
                    workspace_id,
                    client_id,
                    period_type,
                )
            else:
                result = await conn.execute(
                    """
                    DELETE FROM client_analytics
                    WHERE workspace_id = $1 AND client_id = $2
                    """,
                    workspace_id,
                    client_id,
                )

            deleted_count = int(result.split()[-1]) if result else 0

            logger.info(
                "Deleted client analytics",
                extra={
                    "workspace_id": str(workspace_id),
                    "client_id": str(client_id),
                    "period_type": period_type,
                    "deleted_count": deleted_count,
                },
            )

            return deleted_count

    # =========================================================================
    # Report Configuration Persistence (T014)
    # =========================================================================

    @staticmethod
    def _row_to_custom_report_dict(row: Any) -> dict[str, Any]:
        """Convert a database row to a custom report dictionary.

        Handles type conversions for UUIDs, dates, datetimes, and JSONB.

        Args:
            row: Database row from asyncpg

        Returns:
            Dictionary representation of the custom report
        """
        if row is None:
            return {}

        result = dict(row)

        # Convert UUIDs to strings
        uuid_fields = [
            "report_id", "workspace_id", "created_by_user_id", "updated_by_user_id"
        ]
        for field in uuid_fields:
            if field in result and result[field] is not None:
                result[field] = str(result[field])

        # Convert dates to ISO format strings
        date_fields = ["custom_start_date", "custom_end_date"]
        for field in date_fields:
            if field in result and result[field] is not None:
                result[field] = result[field].isoformat()

        # Convert datetimes to ISO format strings
        datetime_fields = [
            "next_run_at", "last_run_at", "created_at", "updated_at"
        ]
        for field in datetime_fields:
            if field in result and result[field] is not None:
                result[field] = result[field].isoformat()

        # Handle JSONB fields (asyncpg returns them as dict/list already)
        if "config" in result and result["config"] is None:
            result["config"] = {}
        if "filters" in result and result["filters"] is None:
            result["filters"] = {}
        if "sorting" in result and result["sorting"] is None:
            result["sorting"] = {}
        if "export_config" in result and result["export_config"] is None:
            result["export_config"] = {}
        if "recipients" in result and result["recipients"] is None:
            result["recipients"] = []

        # Handle TEXT[] arrays (asyncpg returns them as lists)
        if "metrics" in result and result["metrics"] is None:
            result["metrics"] = []
        if "grouping" in result and result["grouping"] is None:
            result["grouping"] = []

        return result

    @staticmethod
    def _row_to_report_export_dict(row: Any) -> dict[str, Any]:
        """Convert a database row to a report export dictionary.

        Handles type conversions for UUIDs, dates, datetimes, and integers.

        Args:
            row: Database row from asyncpg

        Returns:
            Dictionary representation of the report export
        """
        if row is None:
            return {}

        result = dict(row)

        # Convert UUIDs to strings
        uuid_fields = ["export_id", "workspace_id", "report_id", "generated_by_user_id"]
        for field in uuid_fields:
            if field in result and result[field] is not None:
                result[field] = str(result[field])

        # Convert dates to ISO format strings
        date_fields = ["start_date", "end_date"]
        for field in date_fields:
            if field in result and result[field] is not None:
                result[field] = result[field].isoformat()

        # Convert datetimes to ISO format strings
        datetime_fields = ["expires_at", "last_downloaded_at", "created_at"]
        for field in datetime_fields:
            if field in result and result[field] is not None:
                result[field] = result[field].isoformat()

        return result

    # -------------------------------------------------------------------------
    # Custom Report CRUD Operations
    # -------------------------------------------------------------------------

    async def create_report(
        self,
        workspace_id: UUID,
        name: str,
        report_type: str,
        created_by_user_id: UUID,
        *,
        description: Optional[str] = None,
        config: Optional[dict[str, Any]] = None,
        metrics: Optional[list[str]] = None,
        filters: Optional[dict[str, Any]] = None,
        grouping: Optional[list[str]] = None,
        sorting: Optional[dict[str, Any]] = None,
        date_range_type: str = "last_30_days",
        custom_start_date: Optional[date] = None,
        custom_end_date: Optional[date] = None,
        export_format: str = "csv",
        export_config: Optional[dict[str, Any]] = None,
        is_scheduled: bool = False,
        schedule_cron: Optional[str] = None,
        schedule_timezone: str = "UTC",
        recipients: Optional[list[dict[str, Any]]] = None,
    ) -> dict[str, Any]:
        """Create a new custom report configuration.

        Args:
            workspace_id: Workspace for tenant isolation
            name: Display name for the report
            report_type: Type of report (dashboard_summary, gallery_performance, etc.)
            created_by_user_id: User creating the report
            description: Optional description
            config: General report configuration
            metrics: List of metric names to include
            filters: Filter criteria
            grouping: Fields to group by
            sorting: Sorting configuration
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
            Created report record as dictionary
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO custom_reports (
                    workspace_id, name, description, report_type,
                    config, metrics, filters, grouping, sorting,
                    date_range_type, custom_start_date, custom_end_date,
                    export_format, export_config,
                    is_scheduled, schedule_cron, schedule_timezone,
                    recipients, created_by_user_id
                ) VALUES (
                    $1, $2, $3, $4,
                    $5, $6, $7, $8, $9,
                    $10, $11, $12,
                    $13, $14,
                    $15, $16, $17,
                    $18, $19
                )
                RETURNING *
                """,
                workspace_id,
                name,
                description,
                report_type,
                json.dumps(config or {}),
                metrics or [],
                json.dumps(filters or {}),
                grouping or [],
                json.dumps(sorting or {}),
                date_range_type,
                custom_start_date,
                custom_end_date,
                export_format,
                json.dumps(export_config or {}),
                is_scheduled,
                schedule_cron,
                schedule_timezone,
                json.dumps(recipients or []),
                created_by_user_id,
            )

            report = self._row_to_custom_report_dict(row)

            logger.info(
                "Created custom report",
                extra={
                    "report_id": report.get("report_id"),
                    "workspace_id": str(workspace_id),
                    "report_type": report_type,
                    "name": name,
                },
            )

            return report

    async def get_report_by_id(
        self,
        workspace_id: UUID,
        report_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get a custom report by ID.

        Args:
            workspace_id: Workspace for tenant isolation
            report_id: Report to retrieve

        Returns:
            Report record or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM custom_reports
                WHERE workspace_id = $1 AND report_id = $2
                """,
                workspace_id,
                report_id,
            )

            if row is None:
                return None

            return self._row_to_custom_report_dict(row)

    async def get_reports(
        self,
        workspace_id: UUID,
        *,
        report_types: Optional[list[str]] = None,
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
            limit: Max results (default 50, max 500)
            offset: Pagination offset

        Returns:
            Paginated list of reports with metadata
        """
        limit = min(max(1, limit), 500)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            filters = ["workspace_id = $1"]
            params: list[Any] = [workspace_id]
            param_idx = 2

            if report_types:
                filters.append(f"report_type = ANY(${param_idx})")
                params.append(report_types)
                param_idx += 1

            if is_active is not None:
                filters.append(f"is_active = ${param_idx}")
                params.append(is_active)
                param_idx += 1

            if is_scheduled is not None:
                filters.append(f"is_scheduled = ${param_idx}")
                params.append(is_scheduled)
                param_idx += 1

            if created_by_user_id:
                filters.append(f"created_by_user_id = ${param_idx}")
                params.append(created_by_user_id)
                param_idx += 1

            where_clause = " AND ".join(filters)

            # Get total count
            total = await conn.fetchval(
                f"SELECT COUNT(*) FROM custom_reports WHERE {where_clause}",
                *params,
            )

            # Get reports with pagination
            params.extend([limit, offset])
            rows = await conn.fetch(
                f"""
                SELECT * FROM custom_reports
                WHERE {where_clause}
                ORDER BY created_at DESC
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
                """,
                *params,
            )

            reports = [self._row_to_custom_report_dict(row) for row in rows]

            return {
                "reports": reports,
                "meta": {
                    "total": total,
                    "limit": limit,
                    "offset": offset,
                    "has_more": offset + len(reports) < total,
                },
            }

    async def update_report(
        self,
        workspace_id: UUID,
        report_id: UUID,
        updated_by_user_id: UUID,
        *,
        name: Optional[str] = None,
        description: Optional[str] = None,
        report_type: Optional[str] = None,
        config: Optional[dict[str, Any]] = None,
        metrics: Optional[list[str]] = None,
        filters: Optional[dict[str, Any]] = None,
        grouping: Optional[list[str]] = None,
        sorting: Optional[dict[str, Any]] = None,
        date_range_type: Optional[str] = None,
        custom_start_date: Optional[date] = None,
        custom_end_date: Optional[date] = None,
        export_format: Optional[str] = None,
        export_config: Optional[dict[str, Any]] = None,
        is_scheduled: Optional[bool] = None,
        schedule_cron: Optional[str] = None,
        schedule_timezone: Optional[str] = None,
        next_run_at: Optional[datetime] = None,
        recipients: Optional[list[dict[str, Any]]] = None,
        is_active: Optional[bool] = None,
    ) -> Optional[dict[str, Any]]:
        """Update a custom report configuration.

        Args:
            workspace_id: Workspace for tenant isolation
            report_id: Report to update
            updated_by_user_id: User making the update
            **kwargs: Fields to update (None values are ignored)

        Returns:
            Updated report record or None if not found
        """
        # Build dynamic update query
        updates = ["updated_by_user_id = $3", "updated_at = NOW()"]
        params: list[Any] = [workspace_id, report_id, updated_by_user_id]
        param_idx = 4

        if name is not None:
            updates.append(f"name = ${param_idx}")
            params.append(name)
            param_idx += 1

        if description is not None:
            updates.append(f"description = ${param_idx}")
            params.append(description)
            param_idx += 1

        if report_type is not None:
            updates.append(f"report_type = ${param_idx}")
            params.append(report_type)
            param_idx += 1

        if config is not None:
            updates.append(f"config = ${param_idx}")
            params.append(json.dumps(config))
            param_idx += 1

        if metrics is not None:
            updates.append(f"metrics = ${param_idx}")
            params.append(metrics)
            param_idx += 1

        if filters is not None:
            updates.append(f"filters = ${param_idx}")
            params.append(json.dumps(filters))
            param_idx += 1

        if grouping is not None:
            updates.append(f"grouping = ${param_idx}")
            params.append(grouping)
            param_idx += 1

        if sorting is not None:
            updates.append(f"sorting = ${param_idx}")
            params.append(json.dumps(sorting))
            param_idx += 1

        if date_range_type is not None:
            updates.append(f"date_range_type = ${param_idx}")
            params.append(date_range_type)
            param_idx += 1

        if custom_start_date is not None:
            updates.append(f"custom_start_date = ${param_idx}")
            params.append(custom_start_date)
            param_idx += 1

        if custom_end_date is not None:
            updates.append(f"custom_end_date = ${param_idx}")
            params.append(custom_end_date)
            param_idx += 1

        if export_format is not None:
            updates.append(f"export_format = ${param_idx}")
            params.append(export_format)
            param_idx += 1

        if export_config is not None:
            updates.append(f"export_config = ${param_idx}")
            params.append(json.dumps(export_config))
            param_idx += 1

        if is_scheduled is not None:
            updates.append(f"is_scheduled = ${param_idx}")
            params.append(is_scheduled)
            param_idx += 1

        if schedule_cron is not None:
            updates.append(f"schedule_cron = ${param_idx}")
            params.append(schedule_cron)
            param_idx += 1

        if schedule_timezone is not None:
            updates.append(f"schedule_timezone = ${param_idx}")
            params.append(schedule_timezone)
            param_idx += 1

        if next_run_at is not None:
            updates.append(f"next_run_at = ${param_idx}")
            params.append(next_run_at)
            param_idx += 1

        if recipients is not None:
            updates.append(f"recipients = ${param_idx}")
            params.append(json.dumps(recipients))
            param_idx += 1

        if is_active is not None:
            updates.append(f"is_active = ${param_idx}")
            params.append(is_active)
            param_idx += 1

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                f"""
                UPDATE custom_reports
                SET {", ".join(updates)}
                WHERE workspace_id = $1 AND report_id = $2
                RETURNING *
                """,
                *params,
            )

            if row is None:
                return None

            report = self._row_to_custom_report_dict(row)

            logger.info(
                "Updated custom report",
                extra={
                    "report_id": str(report_id),
                    "workspace_id": str(workspace_id),
                },
            )

            return report

    async def update_report_run_status(
        self,
        workspace_id: UUID,
        report_id: UUID,
        status: str,
        *,
        error_message: Optional[str] = None,
        next_run_at: Optional[datetime] = None,
    ) -> Optional[dict[str, Any]]:
        """Update the run status of a report after execution.

        Args:
            workspace_id: Workspace for tenant isolation
            report_id: Report that was run
            status: Run status ('success', 'failed', 'running')
            error_message: Error message if failed
            next_run_at: Next scheduled run time

        Returns:
            Updated report record or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            now = datetime.now(timezone.utc)

            if status == "success":
                row = await conn.fetchrow(
                    """
                    UPDATE custom_reports
                    SET last_run_status = $3,
                        last_run_at = $4,
                        last_run_error = NULL,
                        run_count = run_count + 1,
                        next_run_at = $5,
                        updated_at = $4
                    WHERE workspace_id = $1 AND report_id = $2
                    RETURNING *
                    """,
                    workspace_id,
                    report_id,
                    status,
                    now,
                    next_run_at,
                )
            else:
                row = await conn.fetchrow(
                    """
                    UPDATE custom_reports
                    SET last_run_status = $3,
                        last_run_at = $4,
                        last_run_error = $5,
                        next_run_at = $6,
                        updated_at = $4
                    WHERE workspace_id = $1 AND report_id = $2
                    RETURNING *
                    """,
                    workspace_id,
                    report_id,
                    status,
                    now,
                    error_message,
                    next_run_at,
                )

            if row is None:
                return None

            return self._row_to_custom_report_dict(row)

    async def delete_report(
        self,
        workspace_id: UUID,
        report_id: UUID,
    ) -> bool:
        """Delete a custom report.

        Args:
            workspace_id: Workspace for tenant isolation
            report_id: Report to delete

        Returns:
            True if deleted, False if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM custom_reports
                WHERE workspace_id = $1 AND report_id = $2
                """,
                workspace_id,
                report_id,
            )

            deleted = result.endswith("1") if result else False

            if deleted:
                logger.info(
                    "Deleted custom report",
                    extra={
                        "report_id": str(report_id),
                        "workspace_id": str(workspace_id),
                    },
                )

            return deleted

    async def get_scheduled_reports_due(
        self,
        *,
        before: Optional[datetime] = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """Get scheduled reports that are due to run.

        Used by the scheduler to find reports that need execution.

        Args:
            before: Get reports due before this time (default: now)
            limit: Max reports to return

        Returns:
            List of reports due for execution
        """
        if before is None:
            before = datetime.now(timezone.utc)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM custom_reports
                WHERE is_scheduled = TRUE
                    AND is_active = TRUE
                    AND next_run_at IS NOT NULL
                    AND next_run_at <= $1
                ORDER BY next_run_at ASC
                LIMIT $2
                """,
                before,
                min(limit, 500),
            )

            return [self._row_to_custom_report_dict(row) for row in rows]

    async def get_reports_by_creator(
        self,
        workspace_id: UUID,
        created_by_user_id: UUID,
        *,
        is_active: Optional[bool] = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """Get reports created by a specific user.

        Args:
            workspace_id: Workspace for tenant isolation
            created_by_user_id: User who created the reports
            is_active: Optional filter by active status
            limit: Max reports to return

        Returns:
            List of reports created by the user
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            if is_active is not None:
                rows = await conn.fetch(
                    """
                    SELECT * FROM custom_reports
                    WHERE workspace_id = $1
                        AND created_by_user_id = $2
                        AND is_active = $3
                    ORDER BY created_at DESC
                    LIMIT $4
                    """,
                    workspace_id,
                    created_by_user_id,
                    is_active,
                    min(limit, 500),
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT * FROM custom_reports
                    WHERE workspace_id = $1 AND created_by_user_id = $2
                    ORDER BY created_at DESC
                    LIMIT $3
                    """,
                    workspace_id,
                    created_by_user_id,
                    min(limit, 500),
                )

            return [self._row_to_custom_report_dict(row) for row in rows]

    # -------------------------------------------------------------------------
    # Report Export CRUD Operations
    # -------------------------------------------------------------------------

    async def create_report_export(
        self,
        workspace_id: UUID,
        name: str,
        export_format: str,
        start_date: date,
        end_date: date,
        storage_key: str,
        expires_at: datetime,
        *,
        report_id: Optional[UUID] = None,
        file_size_bytes: int = 0,
        file_hash: Optional[str] = None,
        status: str = "generating",
        generated_by_user_id: Optional[UUID] = None,
    ) -> dict[str, Any]:
        """Create a new report export record.

        Args:
            workspace_id: Workspace for tenant isolation
            name: Display name for the export
            export_format: Export format (csv, pdf, xlsx)
            start_date: Start date of data in export
            end_date: End date of data in export
            storage_key: Storage key/path for the file
            expires_at: When the export expires
            report_id: Source report configuration (optional)
            file_size_bytes: Size of the file
            file_hash: SHA-256 hash of the file
            status: Export status (generating, completed, failed, expired)
            generated_by_user_id: User who generated the export

        Returns:
            Created export record as dictionary
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO report_exports (
                    workspace_id, report_id, name, format,
                    start_date, end_date,
                    storage_key, file_size_bytes, file_hash,
                    status, expires_at, generated_by_user_id
                ) VALUES (
                    $1, $2, $3, $4,
                    $5, $6,
                    $7, $8, $9,
                    $10, $11, $12
                )
                RETURNING *
                """,
                workspace_id,
                report_id,
                name,
                export_format,
                start_date,
                end_date,
                storage_key,
                file_size_bytes,
                file_hash,
                status,
                expires_at,
                generated_by_user_id,
            )

            export = self._row_to_report_export_dict(row)

            logger.info(
                "Created report export",
                extra={
                    "export_id": export.get("export_id"),
                    "workspace_id": str(workspace_id),
                    "format": export_format,
                    "name": name,
                },
            )

            return export

    async def get_report_export_by_id(
        self,
        workspace_id: UUID,
        export_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get a report export by ID.

        Args:
            workspace_id: Workspace for tenant isolation
            export_id: Export to retrieve

        Returns:
            Export record or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM report_exports
                WHERE workspace_id = $1 AND export_id = $2
                """,
                workspace_id,
                export_id,
            )

            if row is None:
                return None

            return self._row_to_report_export_dict(row)

    async def get_report_exports(
        self,
        workspace_id: UUID,
        *,
        report_id: Optional[UUID] = None,
        status: Optional[str] = None,
        export_format: Optional[str] = None,
        generated_by_user_id: Optional[UUID] = None,
        include_expired: bool = False,
        limit: int = 50,
        offset: int = 0,
    ) -> dict[str, Any]:
        """Get report exports with filtering and pagination.

        Args:
            workspace_id: Workspace for tenant isolation
            report_id: Filter by source report
            status: Filter by status
            export_format: Filter by format
            generated_by_user_id: Filter by generator
            include_expired: Include expired exports (default False)
            limit: Max results (default 50, max 500)
            offset: Pagination offset

        Returns:
            Paginated list of exports with metadata
        """
        limit = min(max(1, limit), 500)
        now = datetime.now(timezone.utc)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            filters = ["workspace_id = $1"]
            params: list[Any] = [workspace_id]
            param_idx = 2

            if report_id:
                filters.append(f"report_id = ${param_idx}")
                params.append(report_id)
                param_idx += 1

            if status:
                filters.append(f"status = ${param_idx}")
                params.append(status)
                param_idx += 1

            if export_format:
                filters.append(f"format = ${param_idx}")
                params.append(export_format)
                param_idx += 1

            if generated_by_user_id:
                filters.append(f"generated_by_user_id = ${param_idx}")
                params.append(generated_by_user_id)
                param_idx += 1

            if not include_expired:
                filters.append(f"(expires_at > ${param_idx} OR status != 'completed')")
                params.append(now)
                param_idx += 1

            where_clause = " AND ".join(filters)

            # Get total count
            total = await conn.fetchval(
                f"SELECT COUNT(*) FROM report_exports WHERE {where_clause}",
                *params,
            )

            # Get exports with pagination
            params.extend([limit, offset])
            rows = await conn.fetch(
                f"""
                SELECT * FROM report_exports
                WHERE {where_clause}
                ORDER BY created_at DESC
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
                """,
                *params,
            )

            exports = [self._row_to_report_export_dict(row) for row in rows]

            return {
                "exports": exports,
                "meta": {
                    "total": total,
                    "limit": limit,
                    "offset": offset,
                    "has_more": offset + len(exports) < total,
                },
            }

    async def update_report_export(
        self,
        workspace_id: UUID,
        export_id: UUID,
        *,
        status: Optional[str] = None,
        error_message: Optional[str] = None,
        file_size_bytes: Optional[int] = None,
        file_hash: Optional[str] = None,
        generation_time_ms: Optional[int] = None,
    ) -> Optional[dict[str, Any]]:
        """Update a report export record.

        Args:
            workspace_id: Workspace for tenant isolation
            export_id: Export to update
            status: New status
            error_message: Error message if failed
            file_size_bytes: Final file size
            file_hash: File hash
            generation_time_ms: Time taken to generate

        Returns:
            Updated export record or None if not found
        """
        updates = []
        params: list[Any] = [workspace_id, export_id]
        param_idx = 3

        if status is not None:
            updates.append(f"status = ${param_idx}")
            params.append(status)
            param_idx += 1

        if error_message is not None:
            updates.append(f"error_message = ${param_idx}")
            params.append(error_message)
            param_idx += 1

        if file_size_bytes is not None:
            updates.append(f"file_size_bytes = ${param_idx}")
            params.append(file_size_bytes)
            param_idx += 1

        if file_hash is not None:
            updates.append(f"file_hash = ${param_idx}")
            params.append(file_hash)
            param_idx += 1

        if generation_time_ms is not None:
            updates.append(f"generation_time_ms = ${param_idx}")
            params.append(generation_time_ms)
            param_idx += 1

        if not updates:
            # Nothing to update, just return current record
            return await self.get_report_export_by_id(workspace_id, export_id)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                f"""
                UPDATE report_exports
                SET {", ".join(updates)}
                WHERE workspace_id = $1 AND export_id = $2
                RETURNING *
                """,
                *params,
            )

            if row is None:
                return None

            export = self._row_to_report_export_dict(row)

            logger.info(
                "Updated report export",
                extra={
                    "export_id": str(export_id),
                    "workspace_id": str(workspace_id),
                    "status": status,
                },
            )

            return export

    async def increment_export_download_count(
        self,
        workspace_id: UUID,
        export_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Increment the download count for an export.

        Args:
            workspace_id: Workspace for tenant isolation
            export_id: Export that was downloaded

        Returns:
            Updated export record or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE report_exports
                SET download_count = download_count + 1,
                    last_downloaded_at = NOW()
                WHERE workspace_id = $1 AND export_id = $2
                RETURNING *
                """,
                workspace_id,
                export_id,
            )

            if row is None:
                return None

            return self._row_to_report_export_dict(row)

    async def delete_report_export(
        self,
        workspace_id: UUID,
        export_id: UUID,
    ) -> bool:
        """Delete a report export.

        Args:
            workspace_id: Workspace for tenant isolation
            export_id: Export to delete

        Returns:
            True if deleted, False if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM report_exports
                WHERE workspace_id = $1 AND export_id = $2
                """,
                workspace_id,
                export_id,
            )

            deleted = result.endswith("1") if result else False

            if deleted:
                logger.info(
                    "Deleted report export",
                    extra={
                        "export_id": str(export_id),
                        "workspace_id": str(workspace_id),
                    },
                )

            return deleted

    async def get_expired_exports(
        self,
        *,
        before: Optional[datetime] = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """Get expired exports for cleanup.

        Used by cleanup jobs to find and delete expired export files.

        Args:
            before: Get exports expired before this time (default: now)
            limit: Max exports to return

        Returns:
            List of expired exports
        """
        if before is None:
            before = datetime.now(timezone.utc)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM report_exports
                WHERE expires_at < $1 AND status = 'completed'
                ORDER BY expires_at ASC
                LIMIT $2
                """,
                before,
                min(limit, 1000),
            )

            return [self._row_to_report_export_dict(row) for row in rows]

    async def mark_exports_expired(
        self,
        *,
        before: Optional[datetime] = None,
    ) -> int:
        """Mark expired exports with 'expired' status.

        Updates the status of all exports that have passed their
        expiration date.

        Args:
            before: Expiration cutoff time (default: now)

        Returns:
            Number of exports marked as expired
        """
        if before is None:
            before = datetime.now(timezone.utc)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE report_exports
                SET status = 'expired'
                WHERE expires_at < $1 AND status = 'completed'
                """,
                before,
            )

            updated_count = int(result.split()[-1]) if result else 0

            if updated_count > 0:
                logger.info(
                    "Marked exports as expired",
                    extra={
                        "count": updated_count,
                        "before": before.isoformat(),
                    },
                )

            return updated_count

    async def get_exports_for_report(
        self,
        workspace_id: UUID,
        report_id: UUID,
        *,
        include_expired: bool = False,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        """Get all exports generated from a specific report.

        Args:
            workspace_id: Workspace for tenant isolation
            report_id: Report to get exports for
            include_expired: Include expired exports
            limit: Max exports to return

        Returns:
            List of exports for the report
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            if include_expired:
                rows = await conn.fetch(
                    """
                    SELECT * FROM report_exports
                    WHERE workspace_id = $1 AND report_id = $2
                    ORDER BY created_at DESC
                    LIMIT $3
                    """,
                    workspace_id,
                    report_id,
                    min(limit, 100),
                )
            else:
                now = datetime.now(timezone.utc)
                rows = await conn.fetch(
                    """
                    SELECT * FROM report_exports
                    WHERE workspace_id = $1
                        AND report_id = $2
                        AND (expires_at > $3 OR status != 'completed')
                    ORDER BY created_at DESC
                    LIMIT $4
                    """,
                    workspace_id,
                    report_id,
                    now,
                    min(limit, 100),
                )

            return [self._row_to_report_export_dict(row) for row in rows]

    async def cleanup_old_exports(
        self,
        workspace_id: UUID,
        *,
        keep_last_n: int = 10,
        report_id: Optional[UUID] = None,
    ) -> int:
        """Clean up old exports, keeping only the most recent ones.

        Args:
            workspace_id: Workspace for tenant isolation
            keep_last_n: Number of recent exports to keep
            report_id: Optional - only cleanup for specific report

        Returns:
            Number of deleted exports
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            if report_id:
                result = await conn.execute(
                    """
                    DELETE FROM report_exports
                    WHERE workspace_id = $1
                        AND report_id = $2
                        AND export_id NOT IN (
                            SELECT export_id FROM report_exports
                            WHERE workspace_id = $1 AND report_id = $2
                            ORDER BY created_at DESC
                            LIMIT $3
                        )
                    """,
                    workspace_id,
                    report_id,
                    keep_last_n,
                )
            else:
                # Global cleanup - more complex, per-report retention
                result = await conn.execute(
                    """
                    DELETE FROM report_exports re
                    WHERE workspace_id = $1
                        AND export_id NOT IN (
                            SELECT export_id FROM (
                                SELECT export_id,
                                    ROW_NUMBER() OVER (
                                        PARTITION BY COALESCE(report_id, export_id)
                                        ORDER BY created_at DESC
                                    ) as rn
                                FROM report_exports
                                WHERE workspace_id = $1
                            ) ranked
                            WHERE rn <= $2
                        )
                    """,
                    workspace_id,
                    keep_last_n,
                )

            deleted_count = int(result.split()[-1]) if result else 0

            if deleted_count > 0:
                logger.info(
                    "Cleaned up old exports",
                    extra={
                        "workspace_id": str(workspace_id),
                        "report_id": str(report_id) if report_id else None,
                        "deleted_count": deleted_count,
                    },
                )

            return deleted_count


# =============================================================================
# Singleton Factory
# =============================================================================

_analytics_repository: Optional[AnalyticsRepository] = None


def get_analytics_repository() -> AnalyticsRepository:
    """Get the singleton analytics repository instance.

    Returns:
        AnalyticsRepository instance
    """
    global _analytics_repository
    if _analytics_repository is None:
        _analytics_repository = AnalyticsRepository()
    return _analytics_repository
