from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool

logger = logging.getLogger(__name__)


class InvitationAnalyticsRepository:
    """Repository for invitation analytics."""

    def _row_to_dict(self, row: Any) -> dict[str, Any]:
        return dict(row)

    async def track_view(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        visitor_hash: Optional[str] = None,
        session_id: Optional[str] = None,
        device_type: str = "unknown",
        browser: Optional[str] = None,
        os: Optional[str] = None,
        country_code: Optional[str] = None,
        region: Optional[str] = None,
        city: Optional[str] = None,
        referrer_domain: Optional[str] = None,
        referrer_type: str = "other",
        duration_seconds: Optional[int] = None,
        scrolled_to_rsvp: bool = False,
        interacted_with_media: bool = False,
    ) -> dict[str, Any]:
        """Log a view event for an invitation."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO invitation_view_analytics (
                    workspace_id, invitation_id, visitor_hash, session_id,
                    device_type, browser, os, country_code, region, city,
                    referrer_domain, referrer_type, duration_seconds,
                    scrolled_to_rsvp, interacted_with_media
                )
                VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15
                )
                RETURNING *
                """,
                workspace_id,
                invitation_id,
                visitor_hash,
                session_id,
                device_type,
                browser,
                os,
                country_code,
                region,
                city,
                referrer_domain,
                referrer_type,
                duration_seconds,
                scrolled_to_rsvp,
                interacted_with_media,
            )
            return self._row_to_dict(row)

    async def get_analytics_summary(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
    ) -> dict[str, Any]:
        """Get analytics summary for an invitation."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Aggregate stats
            summary = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) as total_views,
                    COUNT(DISTINCT visitor_hash) as unique_visitors,
                    AVG(duration_seconds)::numeric(10,2) as avg_duration,
                    COUNT(*) FILTER (WHERE scrolled_to_rsvp = TRUE) as rsvp_scroll_count,
                    COUNT(*) FILTER (WHERE interacted_with_media = TRUE) as media_interaction_count
                FROM invitation_view_analytics
                WHERE workspace_id = $1 AND invitation_id = $2
                """,
                workspace_id,
                invitation_id,
            )
            
            # Device breakdown
            devices = await conn.fetch(
                """
                SELECT device_type, COUNT(*) as count
                FROM invitation_view_analytics
                WHERE workspace_id = $1 AND invitation_id = $2
                GROUP BY device_type
                ORDER BY count DESC
                """,
                workspace_id,
                invitation_id,
            )

            # Referrer breakdown
            referrers = await conn.fetch(
                """
                SELECT referrer_type, COUNT(*) as count
                FROM invitation_view_analytics
                WHERE workspace_id = $1 AND invitation_id = $2
                GROUP BY referrer_type
                ORDER BY count DESC
                """,
                workspace_id,
                invitation_id,
            )

            return {
                "summary": self._row_to_dict(summary) if summary else {},
                "devices": [self._row_to_dict(r) for r in devices],
                "referrers": [self._row_to_dict(r) for r in referrers],
            }


_invitation_analytics_repository: InvitationAnalyticsRepository | None = None


def get_invitation_analytics_repository() -> InvitationAnalyticsRepository:
    """Get singleton instance."""
    global _invitation_analytics_repository
    if _invitation_analytics_repository is None:
        _invitation_analytics_repository = InvitationAnalyticsRepository()
    return _invitation_analytics_repository
