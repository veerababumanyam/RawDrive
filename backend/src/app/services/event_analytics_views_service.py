"""Event Analytics Views Service

Provides comprehensive analytics for invitation/event views including:
- View counts and unique visitors
- Device breakdown (mobile/tablet/desktop)
- Geographic distribution
- RSVP response rates

All data is cached for 10 minutes to improve performance.

Feature: api-analytics-views
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.services.cache_service import CacheService, CacheLayer

logger = logging.getLogger(__name__)

# Cache TTL: 10 minutes (600 seconds)
ANALYTICS_CACHE_TTL = 600


class EventAnalyticsViewsService:
    """Service for retrieving event/invitation analytics views data with caching."""

    def __init__(self):
        """Initialize the service with cache layer."""
        # Use SEARCH layer which has 10-minute default TTL, but we'll override to be explicit
        self.cache = CacheService(CacheLayer.SEARCH)

    async def get_views_analytics(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        days: int = 30,
    ) -> dict[str, Any]:
        """Get comprehensive analytics for invitation views.

        Returns view counts, unique visitors, device breakdown, geographic
        distribution, and RSVP response rates. Results are cached for 10 minutes.

        Args:
            workspace_id: The workspace ID for multi-tenant filtering
            invitation_id: The invitation ID to get analytics for
            days: Number of days to include in analytics (default: 30)

        Returns:
            Dictionary containing all analytics data
        """
        # Try cache first
        cache_key = f"views_analytics:{days}"
        cached = await self.cache.get(cache_key, workspace_id, invitation_id)
        if cached is not None:
            logger.debug(f"Cache hit for views analytics: {invitation_id}")
            return cached

        logger.debug(f"Cache miss for views analytics: {invitation_id}")

        # Calculate analytics from database
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            cutoff_date = datetime.utcnow() - timedelta(days=days)

            # Get view counts and unique visitors
            view_counts = await self._get_view_counts(
                conn, workspace_id, invitation_id, cutoff_date
            )

            # Get device breakdown
            device_breakdown = await self._get_device_breakdown(
                conn, workspace_id, invitation_id, cutoff_date
            )

            # Get geographic distribution
            geographic_distribution = await self._get_geographic_distribution(
                conn, workspace_id, invitation_id, cutoff_date
            )

            # Get RSVP response rates
            rsvp_response_rates = await self._get_rsvp_response_rates(
                conn, workspace_id, invitation_id
            )

            result = {
                "total_views": view_counts["total_views"],
                "unique_visitors": view_counts["unique_visitors"],
                "device_breakdown": device_breakdown,
                "geographic_distribution": geographic_distribution,
                "rsvp_response_rates": rsvp_response_rates,
                "period_days": days,
                "cached_at": datetime.utcnow().isoformat(),
            }

            # Cache for 10 minutes
            await self.cache.set(
                cache_key,
                workspace_id,
                invitation_id,
                value=result,
                ttl=ANALYTICS_CACHE_TTL,
            )

            return result

    async def _get_view_counts(
        self,
        conn,
        workspace_id: UUID,
        invitation_id: UUID,
        cutoff_date: datetime,
    ) -> dict[str, int]:
        """Get total views and unique visitors from both analytics tables."""
        # First try invitation_view_analytics (more detailed)
        row = await conn.fetchrow(
            """
            SELECT
                COUNT(*) as total_views,
                COUNT(DISTINCT COALESCE(visitor_hash, session_id)) as unique_visitors
            FROM invitation_view_analytics
            WHERE invitation_id = $1
              AND workspace_id = $2
              AND viewed_at >= $3
            """,
            invitation_id,
            workspace_id,
            cutoff_date,
        )

        total_views = row["total_views"] or 0
        unique_visitors = row["unique_visitors"] or 0

        # If no data in analytics table, fall back to invitation_views table
        if total_views == 0:
            row = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) as total_views,
                    COUNT(DISTINCT visitor_hash) as unique_visitors
                FROM invitation_views
                WHERE invitation_id = $1
                  AND workspace_id = $2
                  AND viewed_at >= $3
                """,
                invitation_id,
                workspace_id,
                cutoff_date,
            )
            total_views = row["total_views"] or 0
            unique_visitors = row["unique_visitors"] or 0

        return {
            "total_views": total_views,
            "unique_visitors": unique_visitors,
        }

    async def _get_device_breakdown(
        self,
        conn,
        workspace_id: UUID,
        invitation_id: UUID,
        cutoff_date: datetime,
    ) -> list[dict[str, Any]]:
        """Get view counts by device type (mobile, tablet, desktop)."""
        # Try invitation_view_analytics first (uses phone/tablet/desktop/unknown)
        rows = await conn.fetch(
            """
            SELECT
                CASE
                    WHEN device_type = 'phone' THEN 'mobile'
                    ELSE COALESCE(device_type, 'unknown')
                END as device_type,
                COUNT(*) as count
            FROM invitation_view_analytics
            WHERE invitation_id = $1
              AND workspace_id = $2
              AND viewed_at >= $3
            GROUP BY
                CASE
                    WHEN device_type = 'phone' THEN 'mobile'
                    ELSE COALESCE(device_type, 'unknown')
                END
            ORDER BY count DESC
            """,
            invitation_id,
            workspace_id,
            cutoff_date,
        )

        if not rows:
            # Fall back to invitation_views table
            rows = await conn.fetch(
                """
                SELECT
                    COALESCE(device_type, 'unknown') as device_type,
                    COUNT(*) as count
                FROM invitation_views
                WHERE invitation_id = $1
                  AND workspace_id = $2
                  AND viewed_at >= $3
                GROUP BY COALESCE(device_type, 'unknown')
                ORDER BY count DESC
                """,
                invitation_id,
                workspace_id,
                cutoff_date,
            )

        return [
            {"device_type": row["device_type"], "count": row["count"]}
            for row in rows
        ]

    async def _get_geographic_distribution(
        self,
        conn,
        workspace_id: UUID,
        invitation_id: UUID,
        cutoff_date: datetime,
    ) -> list[dict[str, Any]]:
        """Get view counts by country/region (geographic distribution)."""
        rows = await conn.fetch(
            """
            SELECT
                COALESCE(country_code, 'unknown') as country_code,
                city,
                COUNT(*) as count
            FROM invitation_view_analytics
            WHERE invitation_id = $1
              AND workspace_id = $2
              AND viewed_at >= $3
            GROUP BY country_code, city
            ORDER BY count DESC
            LIMIT 20
            """,
            invitation_id,
            workspace_id,
            cutoff_date,
        )

        return [
            {
                "country_code": row["country_code"],
                "city": row["city"],
                "count": row["count"],
            }
            for row in rows
        ]

    async def _get_rsvp_response_rates(
        self,
        conn,
        workspace_id: UUID,
        invitation_id: UUID,
    ) -> dict[str, Any]:
        """Get RSVP response statistics including rates."""
        row = await conn.fetchrow(
            """
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN attending = TRUE THEN 1 ELSE 0 END) as confirmed,
                SUM(CASE WHEN attending = FALSE THEN 1 ELSE 0 END) as declined,
                SUM(CASE WHEN status = 'maybe' THEN 1 ELSE 0 END) as maybe,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
            FROM invitation_rsvps
            WHERE invitation_id = $1 AND workspace_id = $2
            """,
            invitation_id,
            workspace_id,
        )

        total = row["total"] or 0
        confirmed = row["confirmed"] or 0
        declined = row["declined"] or 0
        maybe = row["maybe"] or 0
        pending = row["pending"] or 0

        # Calculate rates
        confirmation_rate = 0.0
        decline_rate = 0.0
        response_rate = 0.0

        if total > 0:
            confirmation_rate = round((confirmed / total) * 100, 2)
            decline_rate = round((declined / total) * 100, 2)
            # Response rate = confirmed + declined (not pending/maybe)
            responded = confirmed + declined
            response_rate = round((responded / total) * 100, 2)

        return {
            "total": total,
            "confirmed": confirmed,
            "declined": declined,
            "maybe": maybe,
            "pending": pending,
            "confirmation_rate": confirmation_rate,
            "decline_rate": decline_rate,
            "response_rate": response_rate,
        }

    async def invalidate_cache(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
    ) -> int:
        """Invalidate all cached analytics for an invitation.

        Should be called when new views are tracked or RSVPs are submitted.

        Args:
            workspace_id: The workspace ID
            invitation_id: The invitation ID

        Returns:
            Number of cache keys invalidated
        """
        return await self.cache.invalidate_pattern(
            "views_analytics", workspace_id, invitation_id
        )


# Singleton instance
_event_analytics_views_service: EventAnalyticsViewsService | None = None


def get_event_analytics_views_service() -> EventAnalyticsViewsService:
    """Get singleton instance of the service."""
    global _event_analytics_views_service
    if _event_analytics_views_service is None:
        _event_analytics_views_service = EventAnalyticsViewsService()
    return _event_analytics_views_service
