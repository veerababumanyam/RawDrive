"""
Gallery Analytics Service.

Orchestrates view tracking with rate limiting and analytics aggregation.
Uses Redis for deduplication (same visitor within 30 minutes).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from src.repositories.analytics_repository import GalleryAnalyticsRepository
from src.schemas.analytics import (
    GalleryViewCreate,
    GalleryAnalyticsResponse,
)
from src.log_config import get_logger

logger = get_logger(__name__)

# Rate limiting: deduplicate views from same visitor within this window
RATE_LIMIT_WINDOW_SECONDS = 1800  # 30 minutes

# Period string to timedelta mapping
PERIOD_MAP = {
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
    "90d": timedelta(days=90),
    "all": timedelta(days=3650),  # ~10 years
}


class GalleryAnalyticsService:
    """Service for gallery view tracking and analytics aggregation."""

    def __init__(self, db, redis_client):
        """Initialize with database module and Redis client.

        Args:
            db: Database module with execute/fetch/fetchrow/fetchval
            redis_client: Redis client for rate limiting
        """
        self._db = db
        self._redis = redis_client
        self._repository = GalleryAnalyticsRepository(db)

    async def track_view(
        self,
        gallery_id: UUID,
        workspace_id: UUID,
        view_data: GalleryViewCreate,
    ) -> Optional[UUID]:
        """Track a gallery view with rate limiting.

        Uses Redis SETNX to deduplicate views from the same visitor_token
        within a 30-minute window. If Redis is down, allows the view through
        (availability over accuracy).

        Args:
            gallery_id: Gallery UUID
            workspace_id: Workspace UUID for multi-tenant isolation
            view_data: View tracking data

        Returns:
            view_id if recorded, None if rate-limited
        """
        # Rate limiting key: gallery:{gallery_id}:view:{visitor_token}
        rate_key = f"gallery:{gallery_id}:view:{view_data.visitor_token}"

        # Check if this visitor has viewed recently
        existing = await self._redis.get(rate_key)
        if existing:
            logger.debug(
                "View rate-limited",
                extra={
                    "gallery_id": str(gallery_id),
                    "visitor_token": view_data.visitor_token[:8],
                },
            )
            return None

        # Record view
        view_id = await self._repository.insert_view(gallery_id, workspace_id, view_data)

        # Set rate limit key with TTL (fire-and-forget, non-blocking)
        await self._redis.set(rate_key, "1", ttl=RATE_LIMIT_WINDOW_SECONDS)

        logger.info(
            "Gallery view tracked",
            extra={
                "gallery_id": str(gallery_id),
                "view_id": str(view_id),
                "device_type": view_data.device_type,
            },
        )

        return view_id

    async def get_analytics(
        self,
        gallery_id: UUID,
        workspace_id: UUID,
        period: str = "30d",
    ) -> GalleryAnalyticsResponse:
        """Get full analytics breakdown for a gallery.

        Assembles summary, daily stats, device/geo breakdowns, and download
        summary into a single response.

        Args:
            gallery_id: Gallery UUID
            workspace_id: Workspace UUID for multi-tenant isolation
            period: Time period - "7d", "30d", "90d", or "all"

        Returns:
            GalleryAnalyticsResponse with all analytics data
        """
        now = datetime.now(timezone.utc)
        delta = PERIOD_MAP.get(period, PERIOD_MAP["30d"])
        start_date = now - delta

        # Fetch all analytics data
        summary = await self._repository.get_summary(
            gallery_id, workspace_id, start_date, now
        )
        daily_stats = await self._repository.get_daily_stats(
            gallery_id, workspace_id, start_date, now
        )
        device_breakdown = await self._repository.get_device_breakdown(
            gallery_id, workspace_id
        )
        geo_breakdown = await self._repository.get_geo_breakdown(
            gallery_id, workspace_id, limit=10
        )
        download_summary = await self._repository.get_download_summary(
            gallery_id, workspace_id
        )

        return GalleryAnalyticsResponse(
            gallery_id=gallery_id,
            summary=summary,
            daily_stats=daily_stats,
            device_breakdown=device_breakdown,
            geo_breakdown=geo_breakdown,
            download_summary=download_summary,
            period_start=start_date,
            period_end=now,
        )

    async def update_time_spent(
        self,
        view_id: UUID,
        time_spent_seconds: int,
    ) -> None:
        """Update time_spent_seconds on an existing view record.

        Called via beacon API when user leaves the gallery page.

        Args:
            view_id: View record UUID
            time_spent_seconds: Time spent in seconds
        """
        await self._db.execute(
            """
            UPDATE gallery_views
            SET time_spent_seconds = $1
            WHERE id = $2
            """,
            time_spent_seconds,
            view_id,
        )

        logger.debug(
            "Updated time spent",
            extra={"view_id": str(view_id), "seconds": time_spent_seconds},
        )
