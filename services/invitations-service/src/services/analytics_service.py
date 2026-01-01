"""
Analytics Service for Invitation Statistics.

Provides aggregated analytics including:
- View statistics (total views, unique visitors, views by period)
- RSVP statistics (response breakdown, attendance counts)
- Device and browser breakdowns
- Time-series data for charts

All queries are workspace-scoped for data isolation.
Results are cached in Redis for 10 minutes to reduce database load.
"""

import json
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from src.config import settings
from src.logging import get_logger

logger = get_logger(__name__)

# Try to import redis client, but handle gracefully if not available
try:
    from src.cache import redis_client
except ImportError:
    redis_client = None


# =============================================================================
# Cache Configuration
# =============================================================================

CACHE_TTL_SECONDS = 600  # 10 minutes
CACHE_PREFIX = "analytics"


def _cache_key(workspace_id: str, invitation_id: str, stat_type: str) -> str:
    """Generate cache key for analytics data."""
    return f"{CACHE_PREFIX}:{workspace_id}:{invitation_id}:{stat_type}"


# =============================================================================
# Analytics Service
# =============================================================================


class AnalyticsService:
    """
    Service for computing and caching invitation analytics.

    All methods are workspace-scoped and return cached data when available.
    """

    def __init__(self):
        """Initialize analytics service."""
        self._pool = None

    async def _get_pool(self):
        """Get database connection pool."""
        if self._pool is None:
            from src.db import get_pool
            self._pool = await get_pool()
        return self._pool

    async def _get_cached(self, key: str) -> Optional[Dict]:
        """Get cached data if available."""
        if redis_client is None:
            return None
        try:
            data = await redis_client.get(key)
            if data:
                return json.loads(data)
        except Exception as e:
            logger.warning("cache_get_failed", key=key, error=str(e))
        return None

    async def _set_cached(self, key: str, data: Dict, ttl: int = CACHE_TTL_SECONDS) -> None:
        """Cache data with TTL."""
        if redis_client is None:
            return
        try:
            await redis_client.setex(key, ttl, json.dumps(data))
        except Exception as e:
            logger.warning("cache_set_failed", key=key, error=str(e))

    # =========================================================================
    # Overview Statistics
    # =========================================================================

    async def get_overview(
        self,
        workspace_id: str,
        invitation_id: str,
    ) -> Dict[str, Any]:
        """
        Get combined analytics overview for an invitation.

        Returns all stats in a single response for dashboard display.

        Args:
            workspace_id: Workspace UUID
            invitation_id: Invitation UUID

        Returns:
            Combined analytics including views, RSVPs, and device breakdown
        """
        cache_key = _cache_key(workspace_id, invitation_id, "overview")
        cached = await self._get_cached(cache_key)
        if cached:
            logger.debug("analytics_cache_hit", invitation_id=invitation_id, stat="overview")
            return cached

        result = await self._fetch_overview(workspace_id, invitation_id)
        await self._set_cached(cache_key, result)
        return result

    async def _fetch_overview(
        self,
        workspace_id: str,
        invitation_id: str,
    ) -> Dict[str, Any]:
        """Fetch overview data from database."""
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            # Get view stats
            view_stats = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) as total_views,
                    COUNT(DISTINCT visitor_hash) as unique_visitors
                FROM invitation_views v
                JOIN invitations i ON v.invitation_id = i.id
                WHERE v.invitation_id = $1
                  AND i.workspace_id = $2
                """,
                invitation_id,
                workspace_id,
            )

            # Get RSVP stats
            rsvp_stats = await conn.fetch(
                """
                SELECT
                    status,
                    COUNT(*) as count,
                    COALESCE(SUM(plus_ones), 0) as plus_ones
                FROM invitation_guests g
                JOIN invitations i ON g.invitation_id = i.id
                WHERE g.invitation_id = $1
                  AND i.workspace_id = $2
                  AND g.status IS NOT NULL
                GROUP BY status
                """,
                invitation_id,
                workspace_id,
            )

            # Get device breakdown
            device_stats = await conn.fetch(
                """
                SELECT
                    device_type,
                    COUNT(*) as count
                FROM invitation_views v
                JOIN invitations i ON v.invitation_id = i.id
                WHERE v.invitation_id = $1
                  AND i.workspace_id = $2
                GROUP BY device_type
                ORDER BY count DESC
                """,
                invitation_id,
                workspace_id,
            )

        # Format response
        rsvp_breakdown = {"yes": 0, "no": 0, "maybe": 0}
        plus_ones_total = 0
        for row in rsvp_stats:
            status = row["status"]
            if status in rsvp_breakdown:
                rsvp_breakdown[status] = row["count"]
            if status == "yes":
                plus_ones_total = row["plus_ones"]

        device_breakdown = {}
        for row in device_stats:
            device_breakdown[row["device_type"]] = row["count"]

        return {
            "total_views": view_stats["total_views"] if view_stats else 0,
            "unique_visitors": view_stats["unique_visitors"] if view_stats else 0,
            "rsvp_stats": rsvp_breakdown,
            "plus_ones_total": plus_ones_total,
            "expected_attendees": rsvp_breakdown["yes"] + plus_ones_total,
            "device_breakdown": device_breakdown,
        }

    # =========================================================================
    # View Statistics
    # =========================================================================

    async def get_view_stats(
        self,
        workspace_id: str,
        invitation_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """
        Get detailed view statistics for an invitation.

        Args:
            workspace_id: Workspace UUID
            invitation_id: Invitation UUID
            start_date: Start of date range (default: 30 days ago)
            end_date: End of date range (default: now)

        Returns:
            View statistics including time-series data
        """
        # Use default 30-day range if not specified
        if end_date is None:
            end_date = datetime.now(timezone.utc)
        if start_date is None:
            start_date = end_date - timedelta(days=30)

        cache_key = _cache_key(workspace_id, invitation_id, f"views:{start_date.date()}:{end_date.date()}")
        cached = await self._get_cached(cache_key)
        if cached:
            return cached

        pool = await self._get_pool()
        async with pool.acquire() as conn:
            # Total stats
            totals = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) as total_views,
                    COUNT(DISTINCT visitor_hash) as unique_visitors
                FROM invitation_views v
                JOIN invitations i ON v.invitation_id = i.id
                WHERE v.invitation_id = $1
                  AND i.workspace_id = $2
                  AND v.viewed_at >= $3
                  AND v.viewed_at <= $4
                """,
                invitation_id,
                workspace_id,
                start_date,
                end_date,
            )

            # Daily breakdown
            daily = await conn.fetch(
                """
                SELECT
                    DATE(viewed_at) as date,
                    COUNT(*) as views,
                    COUNT(DISTINCT visitor_hash) as unique_visitors
                FROM invitation_views v
                JOIN invitations i ON v.invitation_id = i.id
                WHERE v.invitation_id = $1
                  AND i.workspace_id = $2
                  AND v.viewed_at >= $3
                  AND v.viewed_at <= $4
                GROUP BY DATE(viewed_at)
                ORDER BY date
                """,
                invitation_id,
                workspace_id,
                start_date,
                end_date,
            )

        result = {
            "total_views": totals["total_views"] if totals else 0,
            "unique_visitors": totals["unique_visitors"] if totals else 0,
            "views_by_day": [
                {
                    "date": row["date"].isoformat(),
                    "views": row["views"],
                    "unique": row["unique_visitors"],
                }
                for row in daily
            ],
            "period": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
            },
        }

        await self._set_cached(cache_key, result)
        return result

    # =========================================================================
    # RSVP Statistics
    # =========================================================================

    async def get_rsvp_stats(
        self,
        workspace_id: str,
        invitation_id: str,
    ) -> Dict[str, Any]:
        """
        Get RSVP response statistics for an invitation.

        Args:
            workspace_id: Workspace UUID
            invitation_id: Invitation UUID

        Returns:
            RSVP statistics including response rates and breakdown
        """
        cache_key = _cache_key(workspace_id, invitation_id, "rsvp")
        cached = await self._get_cached(cache_key)
        if cached:
            return cached

        pool = await self._get_pool()
        async with pool.acquire() as conn:
            # Total invited
            total = await conn.fetchrow(
                """
                SELECT COUNT(*) as count
                FROM invitation_guests g
                JOIN invitations i ON g.invitation_id = i.id
                WHERE g.invitation_id = $1
                  AND i.workspace_id = $2
                """,
                invitation_id,
                workspace_id,
            )

            # Response breakdown
            breakdown = await conn.fetch(
                """
                SELECT
                    status,
                    COUNT(*) as count,
                    COALESCE(SUM(plus_ones), 0) as plus_ones
                FROM invitation_guests g
                JOIN invitations i ON g.invitation_id = i.id
                WHERE g.invitation_id = $1
                  AND i.workspace_id = $2
                  AND g.status IS NOT NULL
                GROUP BY status
                """,
                invitation_id,
                workspace_id,
            )

            # Response timeline (when RSVPs came in)
            timeline = await conn.fetch(
                """
                SELECT
                    DATE(updated_at) as date,
                    COUNT(*) as count
                FROM invitation_guests g
                JOIN invitations i ON g.invitation_id = i.id
                WHERE g.invitation_id = $1
                  AND i.workspace_id = $2
                  AND g.status IS NOT NULL
                GROUP BY DATE(updated_at)
                ORDER BY date
                """,
                invitation_id,
                workspace_id,
            )

        # Calculate metrics
        total_invited = total["count"] if total else 0
        responded = sum(row["count"] for row in breakdown)
        response_rate = responded / total_invited if total_invited > 0 else 0

        rsvp_breakdown = {"yes": 0, "no": 0, "maybe": 0}
        plus_ones_total = 0
        for row in breakdown:
            status = row["status"]
            if status in rsvp_breakdown:
                rsvp_breakdown[status] = row["count"]
            if status == "yes":
                plus_ones_total = row["plus_ones"]

        result = {
            "total_invited": total_invited,
            "responded": responded,
            "pending": total_invited - responded,
            "response_rate": round(response_rate, 2),
            "breakdown": rsvp_breakdown,
            "plus_ones_total": plus_ones_total,
            "expected_attendees": rsvp_breakdown["yes"] + plus_ones_total,
            "response_timeline": [
                {"date": row["date"].isoformat(), "count": row["count"]}
                for row in timeline
            ],
        }

        await self._set_cached(cache_key, result)
        return result

    # =========================================================================
    # Device Statistics
    # =========================================================================

    async def get_device_stats(
        self,
        workspace_id: str,
        invitation_id: str,
    ) -> Dict[str, Any]:
        """
        Get device and browser statistics for an invitation.

        Args:
            workspace_id: Workspace UUID
            invitation_id: Invitation UUID

        Returns:
            Device and browser breakdown statistics
        """
        cache_key = _cache_key(workspace_id, invitation_id, "devices")
        cached = await self._get_cached(cache_key)
        if cached:
            return cached

        pool = await self._get_pool()
        async with pool.acquire() as conn:
            # Device breakdown
            devices = await conn.fetch(
                """
                SELECT
                    device_type,
                    COUNT(*) as count,
                    COUNT(DISTINCT visitor_hash) as unique_visitors
                FROM invitation_views v
                JOIN invitations i ON v.invitation_id = i.id
                WHERE v.invitation_id = $1
                  AND i.workspace_id = $2
                GROUP BY device_type
                ORDER BY count DESC
                """,
                invitation_id,
                workspace_id,
            )

            # Browser breakdown
            browsers = await conn.fetch(
                """
                SELECT
                    browser,
                    COUNT(*) as count
                FROM invitation_views v
                JOIN invitations i ON v.invitation_id = i.id
                WHERE v.invitation_id = $1
                  AND i.workspace_id = $2
                GROUP BY browser
                ORDER BY count DESC
                """,
                invitation_id,
                workspace_id,
            )

        total_views = sum(row["count"] for row in devices)

        result = {
            "device_breakdown": {
                row["device_type"]: {
                    "views": row["count"],
                    "unique_visitors": row["unique_visitors"],
                    "percentage": round(row["count"] / total_views * 100, 1) if total_views > 0 else 0,
                }
                for row in devices
            },
            "browser_breakdown": {
                row["browser"]: row["count"]
                for row in browsers
            },
            "total_views": total_views,
        }

        await self._set_cached(cache_key, result)
        return result

    # =========================================================================
    # Cache Management
    # =========================================================================

    async def invalidate_cache(
        self,
        workspace_id: str,
        invitation_id: str,
    ) -> None:
        """
        Invalidate all cached analytics for an invitation.

        Call this when data changes (new view, RSVP update, etc.)

        Args:
            workspace_id: Workspace UUID
            invitation_id: Invitation UUID
        """
        if redis_client is None:
            return

        try:
            pattern = f"{CACHE_PREFIX}:{workspace_id}:{invitation_id}:*"
            keys = await redis_client.keys(pattern)
            if keys:
                await redis_client.delete(*keys)
                logger.info(
                    "analytics_cache_invalidated",
                    invitation_id=invitation_id,
                    keys_cleared=len(keys),
                )
        except Exception as e:
            logger.warning(
                "cache_invalidation_failed",
                invitation_id=invitation_id,
                error=str(e),
            )
