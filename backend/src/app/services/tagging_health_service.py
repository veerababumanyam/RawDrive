"""Tagging Health Service for monitoring AI tagging coverage and status.

This module provides the TaggingHealthService class that handles:
- Gallery-level tagging health metrics (US6)
- Workspace-level tagging overview
- Materialized view refresh coordination
- Health badge data for UI

Requirements: Smart Tagging Layer - T011
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool


logger = logging.getLogger(__name__)


class TaggingHealthService:
    """Service for monitoring AI tagging health and coverage.

    Uses the gallery_tagging_stats materialized view for fast queries
    on gallery-level metrics. The view is refreshed periodically by
    a background job.
    """

    # =========================================================================
    # GALLERY HEALTH
    # =========================================================================

    async def get_gallery_health(
        self,
        gallery_id: UUID,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Get tagging health metrics for a gallery.

        Returns completion percentages for vision tagging and face detection,
        plus counts and last analyzed timestamps.

        Args:
            gallery_id: ID of the gallery
            workspace_id: Workspace ID for tenant isolation

        Returns:
            Dict with health metrics:
            - total_assets: Total number of assets in gallery
            - vision_analyzed: Number with vision tagging complete
            - face_analyzed: Number with face detection complete
            - vision_percent: Percentage of vision completion
            - face_percent: Percentage of face completion
            - overall_health: Overall health score (0-100)
            - last_analyzed_at: Most recent analysis timestamp
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Try materialized view first (fast path)
            stats = await conn.fetchrow(
                """
                SELECT *
                FROM gallery_tagging_stats
                WHERE gallery_id = $1 AND workspace_id = $2
                """,
                gallery_id,
                workspace_id,
            )

            if stats:
                return self._format_gallery_health(stats)

            # Fallback: compute directly (slower but works before view refresh)
            return await self._compute_gallery_health(
                conn, gallery_id, workspace_id
            )

    async def _compute_gallery_health(
        self,
        conn,
        gallery_id: UUID,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Compute gallery health directly from source tables.

        Used as fallback when materialized view is not yet populated.
        Returns data matching GalleryHealthResponse schema.
        """
        stats = await conn.fetchrow(
            """
            SELECT
                COUNT(DISTINCT ga.asset_id) as total_assets,
                COUNT(DISTINCT CASE WHEN aa.vision_status = 'completed' THEN ga.asset_id END) as vision_completed,
                COUNT(DISTINCT CASE WHEN aa.vision_status = 'failed' THEN ga.asset_id END) as vision_failed,
                COUNT(DISTINCT CASE WHEN aa.vision_status = 'pending' OR aa.vision_status IS NULL THEN ga.asset_id END) as vision_pending,
                COUNT(DISTINCT CASE WHEN aa.face_status = 'completed' THEN ga.asset_id END) as face_completed,
                COUNT(DISTINCT CASE WHEN aa.face_status = 'failed' THEN ga.asset_id END) as face_failed,
                COUNT(DISTINCT CASE WHEN aa.face_status = 'pending' OR aa.face_status IS NULL THEN ga.asset_id END) as face_pending
            FROM gallery_assets ga
            LEFT JOIN asset_analysis aa ON ga.asset_id = aa.asset_id AND ga.workspace_id = aa.workspace_id
            WHERE ga.gallery_id = $1 AND ga.workspace_id = $2
            """,
            gallery_id,
            workspace_id,
        )

        # Get tag counts
        tag_stats = await conn.fetchrow(
            """
            SELECT
                COUNT(DISTINCT CASE WHEN at.tag_id IS NOT NULL THEN ga.asset_id END) as tagged_assets,
                COUNT(at.tag_id) as total_tags,
                COUNT(CASE WHEN t.type = 'ai' THEN 1 END) as ai_tags,
                COUNT(CASE WHEN t.type = 'manual' OR t.type IS NULL THEN 1 END) as manual_tags
            FROM gallery_assets ga
            LEFT JOIN asset_tags at ON ga.asset_id = at.asset_id
            LEFT JOIN tags t ON at.tag_id = t.tag_id
            WHERE ga.gallery_id = $1 AND ga.workspace_id = $2
            """,
            gallery_id,
            workspace_id,
        )

        total = stats["total_assets"] or 0
        vision_completed = stats["vision_completed"] or 0
        face_completed = stats["face_completed"] or 0
        tagged_assets = tag_stats["tagged_assets"] or 0

        # Compute badge
        vision_pct = round((vision_completed / total * 100) if total > 0 else 0, 1)
        face_pct = round((face_completed / total * 100) if total > 0 else 0, 1)
        tag_pct = round((tagged_assets / total * 100) if total > 0 else 0, 1)
        overall_pct = (vision_pct + face_pct + tag_pct) / 3

        if overall_pct >= 90:
            badge_status = "excellent"
        elif overall_pct >= 70:
            badge_status = "good"
        elif overall_pct >= 40:
            badge_status = "needs_attention"
        else:
            badge_status = "poor"

        return {
            "gallery_id": str(gallery_id),
            "total_assets": total,
            "vision_completed": vision_completed,
            "vision_failed": stats["vision_failed"] or 0,
            "vision_pending": stats["vision_pending"] or 0,
            "face_completed": face_completed,
            "face_failed": stats["face_failed"] or 0,
            "face_pending": stats["face_pending"] or 0,
            "tagged_assets": tagged_assets,
            "total_tags": tag_stats["total_tags"] or 0,
            "ai_tags": tag_stats["ai_tags"] or 0,
            "manual_tags": tag_stats["manual_tags"] or 0,
            "badge": {
                "badge": badge_status,
                "vision_pct": vision_pct,
                "face_pct": face_pct,
                "tag_pct": tag_pct,
            },
        }

    def _format_gallery_health(self, stats) -> dict[str, Any]:
        """Format materialized view row to health response.
        
        Returns data matching GalleryHealthResponse schema.
        """
        total = stats["total_assets"] or 0
        vision_completed = stats.get("vision_analyzed") or stats.get("vision_completed") or 0
        face_completed = stats.get("face_analyzed") or stats.get("face_completed") or 0
        tagged_assets = stats.get("tagged_assets") or 0
        
        # Compute percentages
        vision_pct = round((vision_completed / total * 100) if total > 0 else 0, 1)
        face_pct = round((face_completed / total * 100) if total > 0 else 0, 1)
        tag_pct = round((tagged_assets / total * 100) if total > 0 else 0, 1)
        overall_pct = (vision_pct + face_pct + tag_pct) / 3
        
        # Determine badge
        if overall_pct >= 90:
            badge_status = "excellent"
        elif overall_pct >= 70:
            badge_status = "good"
        elif overall_pct >= 40:
            badge_status = "needs_attention"
        else:
            badge_status = "poor"

        return {
            "gallery_id": str(stats["gallery_id"]),
            "total_assets": total,
            "vision_completed": vision_completed,
            "vision_failed": stats.get("vision_failed") or 0,
            "vision_pending": max(0, total - vision_completed - (stats.get("vision_failed") or 0)),
            "face_completed": face_completed,
            "face_failed": stats.get("face_failed") or 0,
            "face_pending": max(0, total - face_completed - (stats.get("face_failed") or 0)),
            "tagged_assets": tagged_assets,
            "total_tags": stats.get("total_tags") or 0,
            "ai_tags": stats.get("ai_tags") or 0,
            "manual_tags": stats.get("manual_tags") or 0,
            "badge": {
                "badge": badge_status,
                "vision_pct": vision_pct,
                "face_pct": face_pct,
                "tag_pct": tag_pct,
            },
        }

    def _compute_overall_health(
        self,
        total: int,
        vision: int,
        face: int,
    ) -> int:
        """Compute overall health score (0-100).

        Weights:
        - Vision tagging: 60%
        - Face detection: 40%
        """
        if total == 0:
            return 100  # Empty gallery is "healthy"

        vision_score = (vision / total) * 60
        face_score = (face / total) * 40

        return round(vision_score + face_score)

    # =========================================================================
    # WORKSPACE HEALTH
    # =========================================================================

    async def get_workspace_health(
        self,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Get workspace-wide tagging health overview.

        Returns aggregated metrics across all galleries plus
        per-gallery breakdown.

        Args:
            workspace_id: Workspace ID

        Returns:
            Dict with workspace health overview
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Overall workspace stats
            overall = await conn.fetchrow(
                """
                SELECT
                    COUNT(DISTINCT a.asset_id) as total_assets,
                    COUNT(DISTINCT CASE WHEN aa.vision_status = 'completed' THEN a.asset_id END) as vision_analyzed,
                    COUNT(DISTINCT CASE WHEN aa.face_status = 'completed' THEN a.asset_id END) as face_analyzed,
                    COUNT(DISTINCT CASE WHEN aa.vision_status = 'pending' THEN a.asset_id END) as vision_pending,
                    COUNT(DISTINCT CASE WHEN aa.face_status = 'pending' THEN a.asset_id END) as face_pending,
                    COUNT(DISTINCT CASE WHEN aa.vision_status = 'failed' THEN a.asset_id END) as vision_failed,
                    COUNT(DISTINCT CASE WHEN aa.face_status = 'failed' THEN a.asset_id END) as face_failed
                FROM assets a
                LEFT JOIN asset_analysis aa ON a.asset_id = aa.asset_id AND a.workspace_id = aa.workspace_id
                WHERE a.workspace_id = $1 AND a.status = 'available'
                """,
                workspace_id,
            )

            # Gallery breakdown from materialized view
            galleries = await conn.fetch(
                """
                SELECT
                    gallery_id,
                    total_assets,
                    vision_analyzed,
                    face_analyzed,
                    last_analyzed_at
                FROM gallery_tagging_stats
                WHERE workspace_id = $1
                ORDER BY total_assets DESC
                LIMIT 20
                """,
                workspace_id,
            )

            total = overall["total_assets"] or 0
            vision = overall["vision_analyzed"] or 0
            face = overall["face_analyzed"] or 0

            return {
                "workspace_id": str(workspace_id),
                "summary": {
                    "total_assets": total,
                    "vision_analyzed": vision,
                    "face_analyzed": face,
                    "vision_pending": overall["vision_pending"] or 0,
                    "face_pending": overall["face_pending"] or 0,
                    "vision_failed": overall["vision_failed"] or 0,
                    "face_failed": overall["face_failed"] or 0,
                    "vision_percent": round((vision / total * 100) if total > 0 else 0, 1),
                    "face_percent": round((face / total * 100) if total > 0 else 0, 1),
                    "overall_health": self._compute_overall_health(total, vision, face),
                },
                "galleries": [
                    {
                        "gallery_id": str(g["gallery_id"]),
                        "total_assets": g["total_assets"],
                        "vision_analyzed": g["vision_analyzed"],
                        "face_analyzed": g["face_analyzed"],
                        "health": self._compute_overall_health(
                            g["total_assets"],
                            g["vision_analyzed"],
                            g["face_analyzed"],
                        ),
                        "last_analyzed_at": (
                            g["last_analyzed_at"].isoformat()
                            if g["last_analyzed_at"]
                            else None
                        ),
                    }
                    for g in galleries
                ],
            }

    # =========================================================================
    # HEALTH BADGES
    # =========================================================================

    async def get_gallery_health_badge(
        self,
        gallery_id: UUID,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        """Get minimal health data for UI badge display.

        Optimized for quick rendering in gallery lists.

        Args:
            gallery_id: ID of the gallery
            workspace_id: Workspace ID

        Returns:
            Dict with badge data: status, percent, color
        """
        health = await self.get_gallery_health(gallery_id, workspace_id)

        overall = health["overall_health"]

        # Determine badge status and color
        if overall >= 90:
            status = "complete"
            color = "green"
        elif overall >= 50:
            status = "partial"
            color = "yellow"
        elif overall > 0:
            status = "processing"
            color = "blue"
        else:
            status = "pending"
            color = "gray"

        return {
            "gallery_id": str(gallery_id),
            "status": status,
            "percent": overall,
            "color": color,
            "vision_percent": health["vision_percent"],
            "face_percent": health["face_percent"],
        }

    # =========================================================================
    # MATERIALIZED VIEW REFRESH
    # =========================================================================

    async def refresh_stats(
        self,
        concurrent: bool = True,
    ) -> dict[str, Any]:
        """Refresh the gallery_tagging_stats materialized view.

        This should be called periodically (e.g., every 5 minutes)
        by a background job.

        Args:
            concurrent: If True, use CONCURRENTLY (non-blocking but slower)

        Returns:
            Dict with refresh result: success, duration_ms
        """
        import time

        start = time.monotonic()

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            try:
                if concurrent:
                    await conn.execute(
                        "REFRESH MATERIALIZED VIEW CONCURRENTLY gallery_tagging_stats"
                    )
                else:
                    await conn.execute(
                        "REFRESH MATERIALIZED VIEW gallery_tagging_stats"
                    )

                duration_ms = int((time.monotonic() - start) * 1000)

                logger.info(
                    "Gallery tagging stats refreshed",
                    extra={
                        "concurrent": concurrent,
                        "duration_ms": duration_ms,
                    },
                )

                return {
                    "success": True,
                    "duration_ms": duration_ms,
                    "concurrent": concurrent,
                }

            except Exception as e:
                logger.error(
                    "Failed to refresh gallery tagging stats",
                    extra={"error": str(e)},
                )
                return {
                    "success": False,
                    "error": str(e),
                }

    async def refresh_gallery_stats(
        self,
        gallery_id: UUID,
        workspace_id: UUID,
    ) -> None:
        """Trigger stats refresh for a specific gallery.

        Since materialized views refresh entirely, this just triggers
        a full refresh. Consider using targeted queries for single
        gallery updates if performance is a concern.
        """
        # For now, do a full refresh
        # TODO: Consider incremental updates if this becomes a bottleneck
        await self.refresh_stats(concurrent=True)


# =============================================================================
# SINGLETON PATTERN
# =============================================================================

_tagging_health_service: Optional[TaggingHealthService] = None


def get_tagging_health_service() -> TaggingHealthService:
    """Get singleton tagging health service instance."""
    global _tagging_health_service
    if _tagging_health_service is None:
        _tagging_health_service = TaggingHealthService()
    return _tagging_health_service
