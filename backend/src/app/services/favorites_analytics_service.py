"""Service for photographer favorites analytics.

This module provides the FavoritesAnalyticsService class that handles
analytics and reporting for favorites across galleries.

Feature: 012-client-favorites (US5)
"""

from __future__ import annotations

import csv
import io
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.services.gallery_service import GalleryNotFoundError

logger = logging.getLogger(__name__)

# Pagination constants
DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 100
MIN_PAGE_SIZE = 1
DEFAULT_MIN_FAVORITES = 1

# Analytics time windows
FAVORITES_TREND_DAYS = 30


class FavoritesAnalyticsService:
    """Service for favorites analytics and reporting.

    This service provides analytics data for photographers to understand
    which photos are most popular with their clients.
    """

    async def _verify_gallery_access(
        self, conn, workspace_id: UUID, gallery_id: UUID
    ) -> dict:
        """Verify gallery belongs to workspace.

        Args:
            conn: Database connection
            workspace_id: Workspace UUID
            gallery_id: Gallery UUID

        Returns:
            Gallery record

        Raises:
            GalleryNotFoundError: If gallery not found or doesn't belong to workspace
        """
        gallery = await conn.fetchrow(
            """
            SELECT gallery_id, title, created_at
            FROM galleries
            WHERE gallery_id = $1 AND workspace_id = $2
            """,
            gallery_id,
            workspace_id,
        )
        if not gallery:
            raise GalleryNotFoundError(gallery_id)
        return dict(gallery)

    # =========================================================================
    # T081: Get favorites analytics with pagination and sorting
    # =========================================================================

    async def get_favorites_analytics(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        sort_by: str = "favorite_count",
        order: str = "desc",
        page: int = 1,
        limit: int = 50,
    ) -> dict[str, Any]:
        """Get analytics for favorited photos in a gallery.

        Args:
            workspace_id: The workspace UUID
            gallery_id: The gallery UUID
            sort_by: Sort field (favorite_count, first_favorited_at, last_favorited_at, filename)
            order: Sort order (asc, desc)
            page: Page number (1-indexed)
            limit: Items per page (max 100)

        Returns:
            Dictionary containing:
            - data: List of photo analytics
            - meta: Pagination metadata
        """
        # SQL-safe sort configuration - whitelist approach prevents injection
        # Keys are user input, values are hardcoded SQL column expressions
        SORT_COLUMNS: dict[str, str] = {
            "favorite_count": "favorite_count",
            "first_favorited_at": "first_favorited_at",
            "last_favorited_at": "last_favorited_at",
            "filename": "a.filename",
        }
        SORT_ORDERS: dict[str, str] = {"asc": "ASC", "desc": "DESC"}

        sort_column = SORT_COLUMNS.get(sort_by, "favorite_count")
        sort_order = SORT_ORDERS.get(order.lower(), "DESC")

        # Validate pagination
        limit = min(max(MIN_PAGE_SIZE, limit), MAX_PAGE_SIZE)
        offset = (max(1, page) - 1) * limit

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify gallery belongs to workspace
            await self._verify_gallery_access(conn, workspace_id, gallery_id)

            # Get total count of favorited photos
            count_result = await conn.fetchval(
                """
                SELECT COUNT(DISTINCT ga.asset_id)
                FROM gallery_assets ga
                INNER JOIN client_favorites cf ON cf.asset_id = ga.asset_id
                WHERE ga.gallery_id = $1 AND cf.is_favorited = true
                """,
                gallery_id,
            )
            total = count_result or 0

            # Get analytics data with aggregations
            rows = await conn.fetch(
                f"""
                SELECT
                    a.asset_id,
                    a.filename,
                    a.thumbnail_url,
                    a.width,
                    a.height,
                    COUNT(cf.favorite_id) as favorite_count,
                    COUNT(DISTINCT cf.client_token) as unique_clients,
                    MIN(cf.created_at) as first_favorited_at,
                    MAX(cf.created_at) as last_favorited_at
                FROM gallery_assets ga
                INNER JOIN assets a ON a.asset_id = ga.asset_id
                LEFT JOIN client_favorites cf ON cf.asset_id = ga.asset_id AND cf.is_favorited = true
                WHERE ga.gallery_id = $1
                GROUP BY a.asset_id, a.filename, a.thumbnail_url, a.width, a.height
                HAVING COUNT(cf.favorite_id) > 0
                ORDER BY {sort_column} {sort_order}
                LIMIT $2 OFFSET $3
                """,
                gallery_id,
                limit,
                offset,
            )

            data = [
                {
                    "asset_id": str(row["asset_id"]),
                    "filename": row["filename"],
                    "thumbnail_url": row["thumbnail_url"],
                    "width": row["width"],
                    "height": row["height"],
                    "favorite_count": row["favorite_count"],
                    "unique_clients": row["unique_clients"],
                    "first_favorited_at": row["first_favorited_at"].isoformat()
                    if row["first_favorited_at"]
                    else None,
                    "last_favorited_at": row["last_favorited_at"].isoformat()
                    if row["last_favorited_at"]
                    else None,
                }
                for row in rows
            ]

            total_pages = (total + limit - 1) // limit if total > 0 else 0

            return {
                "data": data,
                "meta": {
                    "page": page,
                    "limit": limit,
                    "total": total,
                    "total_pages": total_pages,
                },
            }

    # =========================================================================
    # T082: Get favorites summary (materialized view)
    # =========================================================================

    async def get_favorites_summary(
        self, workspace_id: UUID, gallery_id: UUID
    ) -> dict[str, Any]:
        """Get summary statistics for favorites in a gallery.

        This provides high-level metrics for the photographer dashboard.

        Args:
            workspace_id: The workspace UUID
            gallery_id: The gallery UUID

        Returns:
            Dictionary containing summary statistics
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify gallery belongs to workspace
            gallery = await self._verify_gallery_access(conn, workspace_id, gallery_id)

            # Get overall stats
            stats = await conn.fetchrow(
                """
                SELECT
                    COUNT(DISTINCT cf.favorite_id) as total_favorites,
                    COUNT(DISTINCT cf.client_token) as unique_clients,
                    COUNT(DISTINCT cf.asset_id) as favorited_photos,
                    COUNT(DISTINCT fl.list_id) as total_lists
                FROM client_favorites cf
                LEFT JOIN favorite_lists fl ON fl.client_token = cf.client_token AND fl.gallery_id = $1
                WHERE cf.gallery_id = $1 AND cf.is_favorited = true
                """,
                gallery_id,
            )

            # Get total photos in gallery
            total_photos = await conn.fetchval(
                """
                SELECT COUNT(*) FROM gallery_assets WHERE gallery_id = $1
                """,
                gallery_id,
            )

            # Get most favorited photo
            most_favorited = await conn.fetchrow(
                """
                SELECT
                    a.asset_id,
                    a.filename,
                    a.thumbnail_url,
                    COUNT(cf.favorite_id) as favorite_count
                FROM client_favorites cf
                INNER JOIN assets a ON a.asset_id = cf.asset_id
                WHERE cf.gallery_id = $1 AND cf.is_favorited = true
                GROUP BY a.asset_id, a.filename, a.thumbnail_url
                ORDER BY favorite_count DESC
                LIMIT 1
                """,
                gallery_id,
            )

            # Get favorites by day for trend analysis
            favorites_by_day = await conn.fetch(
                f"""
                SELECT
                    DATE(cf.created_at) as date,
                    COUNT(*) as count
                FROM client_favorites cf
                WHERE cf.gallery_id = $1
                    AND cf.is_favorited = true
                    AND cf.created_at >= NOW() - INTERVAL '{FAVORITES_TREND_DAYS} days'
                GROUP BY DATE(cf.created_at)
                ORDER BY date ASC
                """,
                gallery_id,
            )

            return {
                "gallery_id": str(gallery_id),
                "gallery_title": gallery["title"],
                "total_favorites": stats["total_favorites"] or 0,
                "unique_clients": stats["unique_clients"] or 0,
                "favorited_photos": stats["favorited_photos"] or 0,
                "total_photos": total_photos or 0,
                "total_lists": stats["total_lists"] or 0,
                "engagement_rate": round(
                    (stats["favorited_photos"] or 0) / total_photos * 100, 1
                )
                if total_photos > 0
                else 0,
                "most_favorited_photo": {
                    "asset_id": str(most_favorited["asset_id"]),
                    "filename": most_favorited["filename"],
                    "thumbnail_url": most_favorited["thumbnail_url"],
                    "favorite_count": most_favorited["favorite_count"],
                }
                if most_favorited
                else None,
                "favorites_by_day": [
                    {"date": row["date"].isoformat(), "count": row["count"]}
                    for row in favorites_by_day
                ],
            }

    # =========================================================================
    # T083: Refresh analytics (trigger materialized view refresh)
    # =========================================================================

    async def refresh_analytics(self, workspace_id: UUID, gallery_id: UUID) -> bool:
        """Refresh analytics data for a gallery.

        This can be used to force-refresh any cached or materialized analytics.

        Args:
            workspace_id: The workspace UUID
            gallery_id: The gallery UUID

        Returns:
            True if refresh succeeded
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify gallery belongs to workspace
            await self._verify_gallery_access(conn, workspace_id, gallery_id)

            # Currently we use direct queries, but in the future we could
            # refresh a materialized view here
            logger.info(
                f"Analytics refreshed for gallery {gallery_id}",
                extra={"workspace_id": str(workspace_id), "gallery_id": str(gallery_id)},
            )

            return True

    # =========================================================================
    # T084: Export favorites as CSV
    # =========================================================================

    async def export_favorites_csv(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        min_favorites: int = 1,
    ) -> str:
        """Export favorited photos as CSV data.

        Args:
            workspace_id: The workspace UUID
            gallery_id: The gallery UUID
            min_favorites: Minimum favorite count to include (default 1)

        Returns:
            CSV string content
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify gallery belongs to workspace
            await self._verify_gallery_access(conn, workspace_id, gallery_id)

            # Get all favorited photos with their counts
            rows = await conn.fetch(
                """
                SELECT
                    a.filename,
                    a.asset_id,
                    COUNT(cf.favorite_id) as favorite_count,
                    COUNT(DISTINCT cf.client_token) as unique_clients,
                    MIN(cf.created_at) as first_favorited_at,
                    MAX(cf.created_at) as last_favorited_at
                FROM gallery_assets ga
                INNER JOIN assets a ON a.asset_id = ga.asset_id
                INNER JOIN client_favorites cf ON cf.asset_id = ga.asset_id AND cf.is_favorited = true
                WHERE ga.gallery_id = $1
                GROUP BY a.asset_id, a.filename
                HAVING COUNT(cf.favorite_id) >= $2
                ORDER BY favorite_count DESC
                """,
                gallery_id,
                min_favorites,
            )

            # Create CSV in memory
            output = io.StringIO()
            writer = csv.writer(output)

            # Write header
            writer.writerow(
                [
                    "Filename",
                    "Asset ID",
                    "Favorite Count",
                    "Unique Clients",
                    "First Favorited",
                    "Last Favorited",
                ]
            )

            # Write data rows
            for row in rows:
                writer.writerow(
                    [
                        row["filename"],
                        str(row["asset_id"]),
                        row["favorite_count"],
                        row["unique_clients"],
                        row["first_favorited_at"].isoformat()
                        if row["first_favorited_at"]
                        else "",
                        row["last_favorited_at"].isoformat()
                        if row["last_favorited_at"]
                        else "",
                    ]
                )

            return output.getvalue()


# Module-level singleton
_favorites_analytics_service: Optional[FavoritesAnalyticsService] = None


def get_favorites_analytics_service() -> FavoritesAnalyticsService:
    """Get the favorites analytics service singleton."""
    global _favorites_analytics_service
    if _favorites_analytics_service is None:
        _favorites_analytics_service = FavoritesAnalyticsService()
    return _favorites_analytics_service
