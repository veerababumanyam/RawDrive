"""Repository for profile view analytics data operations.

This module provides the ProfileAnalyticsRepository class that handles all CRUD
operations for profile view tracking and analytics aggregation.

All operations are workspace-scoped for multi-tenant data isolation.

Feature: Personal Profile Analytics
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID, uuid4

from app.db.postgres import get_postgres_pool


logger = logging.getLogger(__name__)


class ProfileAnalyticsRepository:
    """Data access layer for profile view analytics.

    Handles tracking individual profile views and aggregating
    analytics data for reporting.
    """

    # =========================================================================
    # VIEW TRACKING
    # =========================================================================

    async def record_view(
        self,
        profile_id: UUID,
        workspace_id: UUID,
        visitor_hash: Optional[str] = None,
        session_id: Optional[str] = None,
        device_type: Optional[str] = None,
        browser: Optional[str] = None,
        os: Optional[str] = None,
        country_code: Optional[str] = None,
        region: Optional[str] = None,
        referrer_domain: Optional[str] = None,
        referrer_type: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        """Record a profile view.

        Args:
            profile_id: Profile being viewed
            workspace_id: Workspace the profile belongs to
            visitor_hash: Hashed visitor identifier (no PII)
            session_id: Session identifier for unique visitor counting
            device_type: Type of device (phone, tablet, desktop)
            browser: Browser name
            os: Operating system
            country_code: 2-letter country code
            region: Region/state name
            referrer_domain: Domain that referred the visitor
            referrer_type: Type of referrer (direct, social, search, email, other)

        Returns:
            Created view record or None on failure
        """
        pool = await get_postgres_pool()
        view_id = uuid4()

        async with pool.acquire() as conn:
            try:
                row = await conn.fetchrow(
                    """
                    INSERT INTO profile_views (
                        view_id, profile_id, workspace_id,
                        visitor_hash, session_id,
                        device_type, browser, os,
                        country_code, region,
                        referrer_domain, referrer_type,
                        viewed_at
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW()
                    )
                    RETURNING *
                    """,
                    view_id,
                    profile_id,
                    workspace_id,
                    visitor_hash,
                    session_id,
                    device_type,
                    browser,
                    os,
                    country_code,
                    region,
                    referrer_domain,
                    referrer_type,
                )

                # Update profile view count and last_viewed_at
                await conn.execute(
                    """
                    UPDATE personal_profiles
                    SET view_count = view_count + 1,
                        last_viewed_at = NOW()
                    WHERE profile_id = $1
                    """,
                    profile_id,
                )

                logger.debug(
                    "Profile view recorded",
                    extra={
                        "view_id": str(view_id),
                        "profile_id": str(profile_id),
                        "workspace_id": str(workspace_id),
                    },
                )

                return self._row_to_dict(row) if row else None

            except Exception as e:
                logger.error(
                    f"Failed to record profile view: {e}",
                    extra={
                        "profile_id": str(profile_id),
                        "workspace_id": str(workspace_id),
                    },
                )
                return None

    async def check_recent_view(
        self,
        profile_id: UUID,
        visitor_hash: str,
        window_seconds: int = 3600,
    ) -> bool:
        """Check if this visitor recently viewed the profile.

        Used for rate limiting to prevent inflating view counts.

        Args:
            profile_id: Profile ID
            visitor_hash: Hashed visitor identifier
            window_seconds: Time window to check (default 1 hour)

        Returns:
            True if a recent view exists
        """
        pool = await get_postgres_pool()
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=window_seconds)

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT 1 FROM profile_views
                WHERE profile_id = $1
                  AND visitor_hash = $2
                  AND viewed_at > $3
                LIMIT 1
                """,
                profile_id,
                visitor_hash,
                cutoff,
            )
            return row is not None

    # =========================================================================
    # ANALYTICS QUERIES
    # =========================================================================

    async def get_view_count(
        self,
        profile_id: UUID,
        workspace_id: UUID,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> int:
        """Get total view count for a profile.

        Args:
            profile_id: Profile ID
            workspace_id: Workspace ID
            start_date: Optional start date filter
            end_date: Optional end date filter

        Returns:
            Total view count
        """
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            if start_date and end_date:
                row = await conn.fetchrow(
                    """
                    SELECT COUNT(*) as count FROM profile_views
                    WHERE profile_id = $1 AND workspace_id = $2
                      AND viewed_at >= $3 AND viewed_at < $4
                    """,
                    profile_id,
                    workspace_id,
                    datetime.combine(start_date, datetime.min.time()),
                    datetime.combine(end_date + timedelta(days=1), datetime.min.time()),
                )
            else:
                row = await conn.fetchrow(
                    """
                    SELECT COUNT(*) as count FROM profile_views
                    WHERE profile_id = $1 AND workspace_id = $2
                    """,
                    profile_id,
                    workspace_id,
                )
            return row["count"] if row else 0

    async def get_unique_visitor_count(
        self,
        profile_id: UUID,
        workspace_id: UUID,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> int:
        """Get unique visitor count for a profile.

        Args:
            profile_id: Profile ID
            workspace_id: Workspace ID
            start_date: Optional start date filter
            end_date: Optional end date filter

        Returns:
            Unique visitor count (by visitor_hash)
        """
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            if start_date and end_date:
                row = await conn.fetchrow(
                    """
                    SELECT COUNT(DISTINCT visitor_hash) as count FROM profile_views
                    WHERE profile_id = $1 AND workspace_id = $2
                      AND viewed_at >= $3 AND viewed_at < $4
                      AND visitor_hash IS NOT NULL
                    """,
                    profile_id,
                    workspace_id,
                    datetime.combine(start_date, datetime.min.time()),
                    datetime.combine(end_date + timedelta(days=1), datetime.min.time()),
                )
            else:
                row = await conn.fetchrow(
                    """
                    SELECT COUNT(DISTINCT visitor_hash) as count FROM profile_views
                    WHERE profile_id = $1 AND workspace_id = $2
                      AND visitor_hash IS NOT NULL
                    """,
                    profile_id,
                    workspace_id,
                )
            return row["count"] if row else 0

    async def get_daily_stats(
        self,
        profile_id: UUID,
        workspace_id: UUID,
        start_date: date,
        end_date: date,
    ) -> list[dict[str, Any]]:
        """Get daily view statistics for a profile.

        Args:
            profile_id: Profile ID
            workspace_id: Workspace ID
            start_date: Start date
            end_date: End date

        Returns:
            List of daily stats records
        """
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    DATE(viewed_at) as stat_date,
                    COUNT(*) as view_count,
                    COUNT(DISTINCT visitor_hash) as unique_visitors,
                    COUNT(*) FILTER (WHERE device_type = 'desktop') as desktop_views,
                    COUNT(*) FILTER (WHERE device_type = 'phone') as mobile_views,
                    COUNT(*) FILTER (WHERE device_type = 'tablet') as tablet_views
                FROM profile_views
                WHERE profile_id = $1 AND workspace_id = $2
                  AND viewed_at >= $3 AND viewed_at < $4
                GROUP BY DATE(viewed_at)
                ORDER BY stat_date
                """,
                profile_id,
                workspace_id,
                datetime.combine(start_date, datetime.min.time()),
                datetime.combine(end_date + timedelta(days=1), datetime.min.time()),
            )
            return [dict(row) for row in rows]

    async def get_device_breakdown(
        self,
        profile_id: UUID,
        workspace_id: UUID,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> dict[str, int]:
        """Get device type breakdown for a profile.

        Args:
            profile_id: Profile ID
            workspace_id: Workspace ID
            start_date: Optional start date filter
            end_date: Optional end date filter

        Returns:
            Dict with device type counts
        """
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            if start_date and end_date:
                rows = await conn.fetch(
                    """
                    SELECT device_type, COUNT(*) as count
                    FROM profile_views
                    WHERE profile_id = $1 AND workspace_id = $2
                      AND viewed_at >= $3 AND viewed_at < $4
                    GROUP BY device_type
                    """,
                    profile_id,
                    workspace_id,
                    datetime.combine(start_date, datetime.min.time()),
                    datetime.combine(end_date + timedelta(days=1), datetime.min.time()),
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT device_type, COUNT(*) as count
                    FROM profile_views
                    WHERE profile_id = $1 AND workspace_id = $2
                    GROUP BY device_type
                    """,
                    profile_id,
                    workspace_id,
                )

            result = {"desktop": 0, "phone": 0, "tablet": 0, "unknown": 0}
            for row in rows:
                device = row["device_type"] or "unknown"
                result[device] = row["count"]
            return result

    async def get_country_breakdown(
        self,
        profile_id: UUID,
        workspace_id: UUID,
        limit: int = 10,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> list[dict[str, Any]]:
        """Get top countries for a profile.

        Args:
            profile_id: Profile ID
            workspace_id: Workspace ID
            limit: Max countries to return
            start_date: Optional start date filter
            end_date: Optional end date filter

        Returns:
            List of dicts with country_code and count
        """
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            if start_date and end_date:
                rows = await conn.fetch(
                    """
                    SELECT country_code, COUNT(*) as count
                    FROM profile_views
                    WHERE profile_id = $1 AND workspace_id = $2
                      AND country_code IS NOT NULL
                      AND viewed_at >= $3 AND viewed_at < $4
                    GROUP BY country_code
                    ORDER BY count DESC
                    LIMIT $5
                    """,
                    profile_id,
                    workspace_id,
                    datetime.combine(start_date, datetime.min.time()),
                    datetime.combine(end_date + timedelta(days=1), datetime.min.time()),
                    limit,
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT country_code, COUNT(*) as count
                    FROM profile_views
                    WHERE profile_id = $1 AND workspace_id = $2
                      AND country_code IS NOT NULL
                    GROUP BY country_code
                    ORDER BY count DESC
                    LIMIT $3
                    """,
                    profile_id,
                    workspace_id,
                    limit,
                )

            return [{"country_code": row["country_code"], "count": row["count"]} for row in rows]

    async def get_referrer_breakdown(
        self,
        profile_id: UUID,
        workspace_id: UUID,
        limit: int = 10,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> list[dict[str, Any]]:
        """Get top referrer sources for a profile.

        Args:
            profile_id: Profile ID
            workspace_id: Workspace ID
            limit: Max referrers to return
            start_date: Optional start date filter
            end_date: Optional end date filter

        Returns:
            List of dicts with referrer_domain and count
        """
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            if start_date and end_date:
                rows = await conn.fetch(
                    """
                    SELECT
                        COALESCE(referrer_domain, 'direct') as referrer,
                        COUNT(*) as count
                    FROM profile_views
                    WHERE profile_id = $1 AND workspace_id = $2
                      AND viewed_at >= $3 AND viewed_at < $4
                    GROUP BY COALESCE(referrer_domain, 'direct')
                    ORDER BY count DESC
                    LIMIT $5
                    """,
                    profile_id,
                    workspace_id,
                    datetime.combine(start_date, datetime.min.time()),
                    datetime.combine(end_date + timedelta(days=1), datetime.min.time()),
                    limit,
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT
                        COALESCE(referrer_domain, 'direct') as referrer,
                        COUNT(*) as count
                    FROM profile_views
                    WHERE profile_id = $1 AND workspace_id = $2
                    GROUP BY COALESCE(referrer_domain, 'direct')
                    ORDER BY count DESC
                    LIMIT $3
                    """,
                    profile_id,
                    workspace_id,
                    limit,
                )

            return [{"referrer": row["referrer"], "count": row["count"]} for row in rows]

    async def get_analytics_summary(
        self,
        profile_id: UUID,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Get comprehensive analytics summary for a profile.

        Args:
            profile_id: Profile ID
            workspace_id: Workspace ID

        Returns:
            Analytics summary dict
        """
        pool = await get_postgres_pool()
        today = date.today()
        week_ago = today - timedelta(days=7)
        month_ago = today - timedelta(days=30)

        async with pool.acquire() as conn:
            # Get total stats from the profile table (cached values)
            profile_row = await conn.fetchrow(
                """
                SELECT view_count, last_viewed_at
                FROM personal_profiles
                WHERE profile_id = $1 AND workspace_id = $2
                """,
                profile_id,
                workspace_id,
            )

            # Get time-based stats
            stats_row = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) as total_views,
                    COUNT(DISTINCT visitor_hash) as unique_visitors,
                    COUNT(*) FILTER (WHERE DATE(viewed_at) = $3) as views_today,
                    COUNT(*) FILTER (WHERE viewed_at >= $4) as views_this_week,
                    COUNT(*) FILTER (WHERE viewed_at >= $5) as views_this_month
                FROM profile_views
                WHERE profile_id = $1 AND workspace_id = $2
                """,
                profile_id,
                workspace_id,
                today,
                datetime.combine(week_ago, datetime.min.time()),
                datetime.combine(month_ago, datetime.min.time()),
            )

            # Get device breakdown
            device_breakdown = await self.get_device_breakdown(profile_id, workspace_id)
            total_device = sum(device_breakdown.values()) or 1  # Avoid division by zero

            return {
                "profile_id": str(profile_id),
                "total_views": profile_row["view_count"] if profile_row else 0,
                "unique_visitors": stats_row["unique_visitors"] if stats_row else 0,
                "views_today": stats_row["views_today"] if stats_row else 0,
                "views_this_week": stats_row["views_this_week"] if stats_row else 0,
                "views_this_month": stats_row["views_this_month"] if stats_row else 0,
                "last_viewed_at": profile_row["last_viewed_at"].isoformat() if profile_row and profile_row["last_viewed_at"] else None,
                "desktop_percentage": round(device_breakdown.get("desktop", 0) / total_device * 100, 1),
                "mobile_percentage": round(device_breakdown.get("phone", 0) / total_device * 100, 1),
                "tablet_percentage": round(device_breakdown.get("tablet", 0) / total_device * 100, 1),
            }

    # =========================================================================
    # DAILY STATS AGGREGATION
    # =========================================================================

    async def aggregate_daily_stats(
        self,
        profile_id: UUID,
        workspace_id: UUID,
        stat_date: date,
    ) -> Optional[dict[str, Any]]:
        """Aggregate and store daily statistics for a profile.

        This is typically called by a background job to pre-compute
        daily statistics for faster retrieval.

        Args:
            profile_id: Profile ID
            workspace_id: Workspace ID
            stat_date: Date to aggregate

        Returns:
            Created/updated stats record
        """
        pool = await get_postgres_pool()
        start_dt = datetime.combine(stat_date, datetime.min.time())
        end_dt = datetime.combine(stat_date + timedelta(days=1), datetime.min.time())

        async with pool.acquire() as conn:
            # Get aggregated data
            agg_row = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) as view_count,
                    COUNT(DISTINCT visitor_hash) as unique_visitors,
                    COUNT(*) FILTER (WHERE device_type = 'desktop') as desktop_views,
                    COUNT(*) FILTER (WHERE device_type = 'phone') as mobile_views,
                    COUNT(*) FILTER (WHERE device_type = 'tablet') as tablet_views
                FROM profile_views
                WHERE profile_id = $1 AND workspace_id = $2
                  AND viewed_at >= $3 AND viewed_at < $4
                """,
                profile_id,
                workspace_id,
                start_dt,
                end_dt,
            )

            # Get country breakdown
            country_rows = await conn.fetch(
                """
                SELECT country_code, COUNT(*) as count
                FROM profile_views
                WHERE profile_id = $1 AND workspace_id = $2
                  AND viewed_at >= $3 AND viewed_at < $4
                  AND country_code IS NOT NULL
                GROUP BY country_code
                ORDER BY count DESC
                LIMIT 20
                """,
                profile_id,
                workspace_id,
                start_dt,
                end_dt,
            )
            country_breakdown = {row["country_code"]: row["count"] for row in country_rows}

            # Get referrer breakdown
            referrer_rows = await conn.fetch(
                """
                SELECT COALESCE(referrer_domain, 'direct') as referrer, COUNT(*) as count
                FROM profile_views
                WHERE profile_id = $1 AND workspace_id = $2
                  AND viewed_at >= $3 AND viewed_at < $4
                GROUP BY COALESCE(referrer_domain, 'direct')
                ORDER BY count DESC
                LIMIT 20
                """,
                profile_id,
                workspace_id,
                start_dt,
                end_dt,
            )
            referrer_breakdown = {row["referrer"]: row["count"] for row in referrer_rows}

            # Upsert daily stats
            stat_id = uuid4()
            row = await conn.fetchrow(
                """
                INSERT INTO profile_view_daily_stats (
                    stat_id, profile_id, workspace_id, stat_date,
                    view_count, unique_visitors,
                    desktop_views, mobile_views, tablet_views,
                    country_breakdown, referrer_breakdown,
                    updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW()
                )
                ON CONFLICT (profile_id, stat_date)
                DO UPDATE SET
                    view_count = $5,
                    unique_visitors = $6,
                    desktop_views = $7,
                    mobile_views = $8,
                    tablet_views = $9,
                    country_breakdown = $10,
                    referrer_breakdown = $11,
                    updated_at = NOW()
                RETURNING *
                """,
                stat_id,
                profile_id,
                workspace_id,
                stat_date,
                agg_row["view_count"],
                agg_row["unique_visitors"],
                agg_row["desktop_views"],
                agg_row["mobile_views"],
                agg_row["tablet_views"],
                json.dumps(country_breakdown),
                json.dumps(referrer_breakdown),
            )

            return self._stats_row_to_dict(row) if row else None

    async def get_stored_daily_stats(
        self,
        profile_id: UUID,
        workspace_id: UUID,
        start_date: date,
        end_date: date,
    ) -> list[dict[str, Any]]:
        """Get pre-computed daily stats from the aggregation table.

        Args:
            profile_id: Profile ID
            workspace_id: Workspace ID
            start_date: Start date
            end_date: End date

        Returns:
            List of daily stats records
        """
        pool = await get_postgres_pool()

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM profile_view_daily_stats
                WHERE profile_id = $1 AND workspace_id = $2
                  AND stat_date >= $3 AND stat_date <= $4
                ORDER BY stat_date
                """,
                profile_id,
                workspace_id,
                start_date,
                end_date,
            )
            return [self._stats_row_to_dict(row) for row in rows]

    # =========================================================================
    # HELPER METHODS
    # =========================================================================

    def _row_to_dict(self, row) -> dict[str, Any]:
        """Convert a view record to a dictionary."""
        if row is None:
            return {}

        result = dict(row)

        # Convert UUIDs to strings
        for field in ["view_id", "profile_id", "workspace_id"]:
            if field in result and result[field] is not None:
                result[field] = str(result[field])

        # Convert datetimes to ISO format
        for field in ["viewed_at", "created_at"]:
            if field in result and result[field] is not None:
                result[field] = result[field].isoformat()

        return result

    def _stats_row_to_dict(self, row) -> dict[str, Any]:
        """Convert a daily stats record to a dictionary."""
        if row is None:
            return {}

        result = dict(row)

        # Convert UUIDs to strings
        for field in ["stat_id", "profile_id", "workspace_id"]:
            if field in result and result[field] is not None:
                result[field] = str(result[field])

        # Convert date to ISO format
        if "stat_date" in result and result["stat_date"] is not None:
            result["stat_date"] = result["stat_date"].isoformat()

        # Convert datetimes to ISO format
        for field in ["created_at", "updated_at"]:
            if field in result and result[field] is not None:
                result[field] = result[field].isoformat()

        # Parse JSONB fields
        for field in ["country_breakdown", "referrer_breakdown"]:
            if field in result and isinstance(result[field], str):
                try:
                    result[field] = json.loads(result[field])
                except (json.JSONDecodeError, TypeError):
                    result[field] = {}

        return result


# =============================================================================
# SINGLETON FACTORY
# =============================================================================

_profile_analytics_repository: Optional[ProfileAnalyticsRepository] = None


def get_profile_analytics_repository() -> ProfileAnalyticsRepository:
    """Get the singleton ProfileAnalyticsRepository instance.

    Returns:
        ProfileAnalyticsRepository singleton instance
    """
    global _profile_analytics_repository
    if _profile_analytics_repository is None:
        _profile_analytics_repository = ProfileAnalyticsRepository()
    return _profile_analytics_repository
