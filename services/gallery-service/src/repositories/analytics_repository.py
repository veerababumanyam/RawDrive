"""
Gallery Analytics Repository.

Handles raw asyncpg queries for gallery_views table and download summary.
All queries enforce multi-tenant workspace_id isolation.
"""

from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional
from uuid import UUID, uuid4

from src.schemas.analytics import (
    GalleryViewCreate,
    GalleryAnalyticsSummary,
    DeviceBreakdown,
    GeoEntry,
    GalleryAnalyticsTimeSeries,
)
from src.log_config import get_logger

logger = get_logger(__name__)

# Country code to name mapping (common countries)
COUNTRY_NAMES = {
    "US": "United States", "GB": "United Kingdom", "CA": "Canada",
    "AU": "Australia", "DE": "Germany", "FR": "France", "IN": "India",
    "JP": "Japan", "BR": "Brazil", "MX": "Mexico", "IT": "Italy",
    "ES": "Spain", "NL": "Netherlands", "SE": "Sweden", "NO": "Norway",
    "DK": "Denmark", "FI": "Finland", "CH": "Switzerland", "AT": "Austria",
    "BE": "Belgium", "PT": "Portugal", "PL": "Poland", "IE": "Ireland",
    "NZ": "New Zealand", "SG": "Singapore", "KR": "South Korea",
    "ZA": "South Africa", "AE": "UAE", "SA": "Saudi Arabia",
    "CN": "China", "RU": "Russia", "AR": "Argentina", "CL": "Chile",
    "CO": "Colombia", "TH": "Thailand", "PH": "Philippines",
    "MY": "Malaysia", "ID": "Indonesia", "VN": "Vietnam",
    "TW": "Taiwan", "HK": "Hong Kong", "IL": "Israel", "TR": "Turkey",
}


class GalleryAnalyticsRepository:
    """Repository for gallery_views CRUD and aggregation queries."""

    def __init__(self, db):
        """Initialize with database module (src.database)."""
        self._db = db

    async def insert_view(
        self,
        gallery_id: UUID,
        workspace_id: UUID,
        view_data: GalleryViewCreate,
    ) -> UUID:
        """Insert a gallery view record.

        Args:
            gallery_id: Gallery UUID
            workspace_id: Workspace UUID for multi-tenant isolation
            view_data: View tracking data

        Returns:
            UUID of the created view record
        """
        view_id = uuid4()
        await self._db.fetchval(
            """
            INSERT INTO gallery_views (
                id, gallery_id, workspace_id, visitor_token, session_id,
                device_type, browser, os, country_code, region,
                referrer_domain, viewed_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
            RETURNING id
            """,
            view_id,
            gallery_id,
            workspace_id,
            view_data.visitor_token,
            view_data.session_id,
            view_data.device_type,
            view_data.browser,
            view_data.os,
            view_data.country_code,
            view_data.region,
            view_data.referrer_domain,
        )
        return view_id

    async def get_summary(
        self,
        gallery_id: UUID,
        workspace_id: UUID,
        start_date: datetime,
        end_date: datetime,
    ) -> GalleryAnalyticsSummary:
        """Get aggregated analytics summary for a gallery.

        All counts are filtered by workspace_id for multi-tenant isolation.
        """
        row = await self._db.fetchrow(
            """
            SELECT
                COUNT(*) AS total_views,
                COUNT(DISTINCT visitor_token) AS unique_visitors,
                COALESCE(AVG(time_spent_seconds), 0) AS avg_time_spent,
                COUNT(*) FILTER (WHERE viewed_at >= CURRENT_DATE) AS views_today,
                COUNT(*) FILTER (WHERE viewed_at >= CURRENT_DATE - INTERVAL '7 days') AS views_this_week,
                COUNT(*) FILTER (WHERE viewed_at >= CURRENT_DATE - INTERVAL '30 days') AS views_this_month
            FROM gallery_views
            WHERE gallery_id = $1
              AND workspace_id = $2
              AND viewed_at >= $3
              AND viewed_at <= $4
            """,
            gallery_id,
            workspace_id,
            start_date,
            end_date,
        )

        if not row:
            return GalleryAnalyticsSummary()

        return GalleryAnalyticsSummary(
            total_views=row["total_views"] or 0,
            unique_visitors=row["unique_visitors"] or 0,
            avg_time_spent_seconds=float(row["avg_time_spent"] or 0),
            views_today=row["views_today"] or 0,
            views_this_week=row["views_this_week"] or 0,
            views_this_month=row["views_this_month"] or 0,
        )

    async def get_daily_stats(
        self,
        gallery_id: UUID,
        workspace_id: UUID,
        start_date: datetime,
        end_date: datetime,
    ) -> List[GalleryAnalyticsTimeSeries]:
        """Get per-day view breakdown filtered by workspace_id."""
        rows = await self._db.fetch(
            """
            SELECT
                DATE(viewed_at) AS date,
                COUNT(*) AS views,
                COUNT(DISTINCT visitor_token) AS unique_visitors
            FROM gallery_views
            WHERE gallery_id = $1
              AND workspace_id = $2
              AND viewed_at >= $3
              AND viewed_at <= $4
            GROUP BY DATE(viewed_at)
            ORDER BY DATE(viewed_at) ASC
            """,
            gallery_id,
            workspace_id,
            start_date,
            end_date,
        )

        return [
            GalleryAnalyticsTimeSeries(
                date=row["date"],
                views=row["views"],
                unique_visitors=row["unique_visitors"],
            )
            for row in rows
        ]

    async def get_device_breakdown(
        self,
        gallery_id: UUID,
        workspace_id: UUID,
    ) -> DeviceBreakdown:
        """Get device type breakdown filtered by workspace_id."""
        rows = await self._db.fetch(
            """
            SELECT
                COALESCE(device_type, 'unknown') AS device_type,
                COUNT(*) AS count
            FROM gallery_views
            WHERE gallery_id = $1
              AND workspace_id = $2
            GROUP BY device_type
            """,
            gallery_id,
            workspace_id,
        )

        counts = {"desktop": 0, "mobile": 0, "tablet": 0}
        for row in rows:
            dt = (row["device_type"] or "unknown").lower()
            if dt in counts:
                counts[dt] = row["count"]

        total = sum(counts.values()) or 1  # Avoid division by zero
        return DeviceBreakdown(
            desktop_count=counts["desktop"],
            mobile_count=counts["mobile"],
            tablet_count=counts["tablet"],
            desktop_pct=round(counts["desktop"] / total * 100, 1),
            mobile_pct=round(counts["mobile"] / total * 100, 1),
            tablet_pct=round(counts["tablet"] / total * 100, 1),
        )

    async def get_geo_breakdown(
        self,
        gallery_id: UUID,
        workspace_id: UUID,
        limit: int = 10,
    ) -> List[GeoEntry]:
        """Get top countries by view count, filtered by workspace_id."""
        rows = await self._db.fetch(
            """
            SELECT
                COALESCE(country_code, 'XX') AS country_code,
                COUNT(*) AS count
            FROM gallery_views
            WHERE gallery_id = $1
              AND workspace_id = $2
            GROUP BY country_code
            ORDER BY count DESC
            LIMIT $3
            """,
            gallery_id,
            workspace_id,
            limit,
        )

        return [
            GeoEntry(
                country_code=row["country_code"],
                country_name=COUNTRY_NAMES.get(row["country_code"], "Unknown"),
                count=row["count"],
            )
            for row in rows
        ]

    async def get_download_summary(
        self,
        gallery_id: UUID,
        workspace_id: UUID,
    ) -> Dict[str, int]:
        """Get download summary from gallery_downloads table.

        Filtered by workspace_id for multi-tenant isolation.
        """
        row = await self._db.fetchrow(
            """
            SELECT
                COUNT(*) AS total_downloads,
                COALESCE(SUM(file_size_bytes), 0) AS total_bytes
            FROM gallery_downloads
            WHERE gallery_id = $1
              AND workspace_id = $2
            """,
            gallery_id,
            workspace_id,
        )

        if not row:
            return {"total_downloads": 0, "total_bytes": 0}

        return {
            "total_downloads": row["total_downloads"] or 0,
            "total_bytes": row["total_bytes"] or 0,
        }
