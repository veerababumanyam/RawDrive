"""Client Activity Service.

Service for aggregating and querying client activity data
(favorites and picks) for photographer gallery views.

Feature: 015-client-selection-sync
"""

from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool

logger = logging.getLogger(__name__)


class ClientActivityService:
    """Service for client activity aggregation and queries."""

    async def get_gallery_activity_summary(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
    ) -> dict:
        """Get aggregated activity summary for a gallery.

        Returns summary statistics including total unique visitors,
        total favorites, and total picks across all assets.

        Args:
            workspace_id: Workspace ID for tenant isolation.
            gallery_id: Gallery to get summary for.

        Returns:
            Summary dict with totals and top assets.
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Get aggregated totals from materialized views
            summary = await conn.fetchrow(
                """
                SELECT
                    COALESCE(SUM(gfs.unique_favorite_count), 0) AS total_favorites,
                    COALESCE(SUM(gps.unique_pick_count), 0) AS total_picks,
                    COUNT(DISTINCT gfs.asset_id) FILTER (WHERE gfs.unique_favorite_count > 0) AS assets_with_favorites,
                    COUNT(DISTINCT gps.asset_id) FILTER (WHERE gps.unique_pick_count > 0) AS assets_with_picks
                FROM gallery_assets ga
                LEFT JOIN gallery_favorites_summary gfs
                    ON ga.gallery_id = gfs.gallery_id AND ga.asset_id = gfs.asset_id
                LEFT JOIN gallery_picks_summary gps
                    ON ga.gallery_id = gps.gallery_id AND ga.asset_id = gps.asset_id
                WHERE ga.workspace_id = $1
                  AND ga.gallery_id = $2
                  AND ga.visible = TRUE
                """,
                workspace_id,
                gallery_id,
            )

            # Get unique visitor count for this gallery
            visitors_count = await conn.fetchval(
                """
                SELECT COUNT(DISTINCT gv.visitor_id)
                FROM gallery_visitors gv
                WHERE gv.gallery_id = $1
                  AND gv.workspace_id = $2
                """,
                gallery_id,
                workspace_id,
            )

            return {
                "gallery_id": str(gallery_id),
                "total_unique_visitors": visitors_count or 0,
                "total_favorites": summary["total_favorites"] or 0,
                "total_picks": summary["total_picks"] or 0,
                "assets_with_favorites": summary["assets_with_favorites"] or 0,
                "assets_with_picks": summary["assets_with_picks"] or 0,
            }

    async def get_asset_activity_counts(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        asset_ids: list[UUID],
    ) -> dict[str, dict]:
        """Get activity counts for specific assets.

        Returns favorites and picks counts for each asset from
        materialized views for efficient batch lookup.

        Args:
            workspace_id: Workspace ID for tenant isolation.
            gallery_id: Gallery containing the assets.
            asset_ids: List of asset IDs to get counts for.

        Returns:
            Dict mapping asset_id -> {favorites_count, picks_count}
        """
        if not asset_ids:
            return {}

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    ga.asset_id,
                    COALESCE(gfs.unique_favorite_count, 0) AS client_favorites_count,
                    COALESCE(gps.unique_pick_count, 0) AS client_picks_count
                FROM gallery_assets ga
                LEFT JOIN gallery_favorites_summary gfs
                    ON ga.gallery_id = gfs.gallery_id AND ga.asset_id = gfs.asset_id
                LEFT JOIN gallery_picks_summary gps
                    ON ga.gallery_id = gps.gallery_id AND ga.asset_id = gps.asset_id
                WHERE ga.workspace_id = $1
                  AND ga.gallery_id = $2
                  AND ga.asset_id = ANY($3::uuid[])
                """,
                workspace_id,
                gallery_id,
                asset_ids,
            )

            return {
                str(row["asset_id"]): {
                    "client_favorites_count": row["client_favorites_count"],
                    "client_picks_count": row["client_picks_count"],
                }
                for row in rows
            }

    async def refresh_materialized_views(self) -> None:
        """Refresh the client activity materialized views.

        Refreshes both gallery_favorites_summary and gallery_picks_summary
        views concurrently (without locking reads).
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            await conn.execute("SELECT refresh_client_activity_views();")
            logger.info("Refreshed client activity materialized views")


# Singleton instance
_client_activity_service: Optional[ClientActivityService] = None


def get_client_activity_service() -> ClientActivityService:
    """Get singleton client activity service instance."""
    global _client_activity_service
    if _client_activity_service is None:
        _client_activity_service = ClientActivityService()
    return _client_activity_service
