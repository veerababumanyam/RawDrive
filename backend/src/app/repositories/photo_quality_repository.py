"""Repository for photo quality analysis operations.

This module provides the PhotoQualityRepository class that handles all CRUD
operations for photo quality analysis results, with proper workspace isolation
for multi-tenant security.

Feature: 023-enhanced-smart-curate
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool

logger = logging.getLogger(__name__)


class PhotoQualityRepository:
    """Data access layer for photo quality analysis records.

    This repository handles all CRUD operations for quality analysis,
    including bulk upsert for efficient batch processing.
    """

    # =========================================================================
    # CREATE / UPSERT OPERATIONS
    # =========================================================================

    async def upsert(
        self,
        workspace_id: UUID,
        asset_id: UUID,
        session_id: UUID,
        *,
        overall_score: float,
        sharpness_score: float,
        exposure_score: float,
        composition_score: float,
        blur_detected: bool = False,
        blur_severity: Optional[str] = None,
        blur_type: Optional[str] = None,
        highlights_clipped: bool = False,
        shadows_blocked: bool = False,
        noise_level: str = "low",
        horizon_tilt_degrees: Optional[float] = None,
        crop_suggestion: Optional[dict] = None,
    ) -> dict[str, Any]:
        """Create or update a photo quality analysis record.

        Args:
            workspace_id: Workspace ID for tenant isolation
            asset_id: Asset being analyzed
            session_id: Curation session this analysis belongs to
            overall_score: Combined quality score (0-100)
            sharpness_score: Sharpness metric (0-100)
            exposure_score: Exposure metric (0-100)
            composition_score: Composition metric (0-100)
            blur_detected: Whether blur was detected
            blur_severity: Severity level if blur detected
            blur_type: Type of blur (motion, focus, etc.)
            highlights_clipped: Whether highlights are clipped
            shadows_blocked: Whether shadows are blocked
            noise_level: Noise level (low, medium, high)
            horizon_tilt_degrees: Horizon tilt in degrees
            crop_suggestion: Suggested crop as JSON

        Returns:
            Created/updated record as dict
        """
        import json

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO photo_quality_analysis (
                    workspace_id, asset_id, session_id,
                    overall_score, sharpness_score, exposure_score, composition_score,
                    blur_detected, blur_severity, blur_type,
                    highlights_clipped, shadows_blocked, noise_level,
                    horizon_tilt_degrees, crop_suggestion, analyzed_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                ON CONFLICT (asset_id, session_id)
                DO UPDATE SET
                    overall_score = EXCLUDED.overall_score,
                    sharpness_score = EXCLUDED.sharpness_score,
                    exposure_score = EXCLUDED.exposure_score,
                    composition_score = EXCLUDED.composition_score,
                    blur_detected = EXCLUDED.blur_detected,
                    blur_severity = EXCLUDED.blur_severity,
                    blur_type = EXCLUDED.blur_type,
                    highlights_clipped = EXCLUDED.highlights_clipped,
                    shadows_blocked = EXCLUDED.shadows_blocked,
                    noise_level = EXCLUDED.noise_level,
                    horizon_tilt_degrees = EXCLUDED.horizon_tilt_degrees,
                    crop_suggestion = EXCLUDED.crop_suggestion,
                    analyzed_at = EXCLUDED.analyzed_at
                RETURNING *
                """,
                workspace_id,
                asset_id,
                session_id,
                overall_score,
                sharpness_score,
                exposure_score,
                composition_score,
                blur_detected,
                blur_severity,
                blur_type,
                highlights_clipped,
                shadows_blocked,
                noise_level,
                horizon_tilt_degrees,
                json.dumps(crop_suggestion) if crop_suggestion else None,
                datetime.now(timezone.utc),
            )

            return self._row_to_dict(row)

    async def bulk_upsert(
        self,
        workspace_id: UUID,
        session_id: UUID,
        analyses: list[dict[str, Any]],
    ) -> int:
        """Bulk upsert multiple photo quality analysis records.

        This is optimized for batch processing during curation analysis.

        Args:
            workspace_id: Workspace ID for tenant isolation
            session_id: Curation session ID
            analyses: List of analysis dicts with asset_id and scores

        Returns:
            Number of records upserted
        """
        import json

        if not analyses:
            return 0

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            now = datetime.now(timezone.utc)

            # Prepare values for bulk insert
            values = []
            for a in analyses:
                values.append((
                    workspace_id,
                    a["asset_id"],
                    session_id,
                    a.get("overall_score", 0.0),
                    a.get("sharpness_score", 0.0),
                    a.get("exposure_score", 0.0),
                    a.get("composition_score", 0.0),
                    a.get("blur_detected", False),
                    a.get("blur_severity"),
                    a.get("blur_type"),
                    a.get("highlights_clipped", False),
                    a.get("shadows_blocked", False),
                    a.get("noise_level", "low"),
                    a.get("horizon_tilt_degrees"),
                    json.dumps(a["crop_suggestion"]) if a.get("crop_suggestion") else None,
                    now,
                ))

            # Use executemany for efficient bulk insert
            await conn.executemany(
                """
                INSERT INTO photo_quality_analysis (
                    workspace_id, asset_id, session_id,
                    overall_score, sharpness_score, exposure_score, composition_score,
                    blur_detected, blur_severity, blur_type,
                    highlights_clipped, shadows_blocked, noise_level,
                    horizon_tilt_degrees, crop_suggestion, analyzed_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                ON CONFLICT (asset_id, session_id)
                DO UPDATE SET
                    overall_score = EXCLUDED.overall_score,
                    sharpness_score = EXCLUDED.sharpness_score,
                    exposure_score = EXCLUDED.exposure_score,
                    composition_score = EXCLUDED.composition_score,
                    blur_detected = EXCLUDED.blur_detected,
                    blur_severity = EXCLUDED.blur_severity,
                    blur_type = EXCLUDED.blur_type,
                    highlights_clipped = EXCLUDED.highlights_clipped,
                    shadows_blocked = EXCLUDED.shadows_blocked,
                    noise_level = EXCLUDED.noise_level,
                    horizon_tilt_degrees = EXCLUDED.horizon_tilt_degrees,
                    crop_suggestion = EXCLUDED.crop_suggestion,
                    analyzed_at = EXCLUDED.analyzed_at
                """,
                values,
            )

            logger.info(
                "Bulk upserted photo quality analyses",
                extra={
                    "session_id": str(session_id),
                    "count": len(analyses),
                },
            )

            return len(analyses)

    # =========================================================================
    # READ OPERATIONS
    # =========================================================================

    async def get_by_asset(
        self,
        workspace_id: UUID,
        asset_id: UUID,
        session_id: Optional[UUID] = None,
    ) -> Optional[dict[str, Any]]:
        """Get quality analysis for an asset.

        Args:
            workspace_id: Workspace ID for tenant isolation
            asset_id: Asset ID to retrieve
            session_id: Optional session filter (returns latest if not specified)

        Returns:
            Analysis record as dict, or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            if session_id:
                row = await conn.fetchrow(
                    """
                    SELECT * FROM photo_quality_analysis
                    WHERE workspace_id = $1 AND asset_id = $2 AND session_id = $3
                    """,
                    workspace_id,
                    asset_id,
                    session_id,
                )
            else:
                row = await conn.fetchrow(
                    """
                    SELECT * FROM photo_quality_analysis
                    WHERE workspace_id = $1 AND asset_id = $2
                    ORDER BY analyzed_at DESC
                    LIMIT 1
                    """,
                    workspace_id,
                    asset_id,
                )

            return self._row_to_dict(row) if row else None

    async def list_by_session(
        self,
        workspace_id: UUID,
        session_id: UUID,
        *,
        min_score: Optional[float] = None,
        blur_only: bool = False,
        limit: int = 1000,
        offset: int = 0,
    ) -> tuple[list[dict[str, Any]], int]:
        """List quality analyses for a session.

        Args:
            workspace_id: Workspace ID for tenant isolation
            session_id: Session ID to filter by
            min_score: Optional minimum overall score filter
            blur_only: If True, only return blurred photos
            limit: Max results to return
            offset: Pagination offset

        Returns:
            Tuple of (analyses list, total count)
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Build query with optional filters
            where_clause = "WHERE workspace_id = $1 AND session_id = $2"
            params: list[Any] = [workspace_id, session_id]

            if min_score is not None:
                where_clause += f" AND overall_score >= ${len(params) + 1}"
                params.append(min_score)

            if blur_only:
                where_clause += " AND blur_detected = TRUE"

            # Get total count
            count_row = await conn.fetchrow(
                f"SELECT COUNT(*) as total FROM photo_quality_analysis {where_clause}",
                *params,
            )
            total = count_row["total"] if count_row else 0

            # Get paginated results
            params.append(limit)
            params.append(offset)

            rows = await conn.fetch(
                f"""
                SELECT pqa.*, aa.ai_metadata
                FROM photo_quality_analysis pqa
                LEFT JOIN asset_analysis aa ON pqa.asset_id = aa.asset_id AND pqa.workspace_id = aa.workspace_id
                {where_clause.replace("WHERE", "WHERE pqa.")}
                ORDER BY pqa.overall_score DESC
                LIMIT ${len(params) - 1} OFFSET ${len(params)}
                """,
                *params,
            )

            return [self._row_to_dict(row) for row in rows], total

    async def list_by_gallery(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        *,
        min_score: Optional[float] = None,
        blur_only: bool = False,
        limit: int = 1000,
        offset: int = 0,
    ) -> tuple[list[dict[str, Any]], int]:
        """List quality analyses for a gallery (from most recent session).

        This method finds the most recent curation session for the gallery
        and returns its quality analysis results.

        Args:
            workspace_id: Workspace ID for tenant isolation
            gallery_id: Gallery ID to get results for
            min_score: Optional minimum overall score filter
            blur_only: If True, only return blurred photos
            limit: Max results to return
            offset: Pagination offset

        Returns:
            Tuple of (analyses list, total count)
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # First, find the most recent session for this gallery
            session_row = await conn.fetchrow(
                """
                SELECT session_id FROM curation_sessions
                WHERE workspace_id = $1 AND gallery_id = $2
                ORDER BY created_at DESC
                LIMIT 1
                """,
                workspace_id,
                gallery_id,
            )

            if not session_row:
                return [], 0

            session_id = session_row["session_id"]

            # Now get quality analyses for that session
            return await self.list_by_session(
                workspace_id,
                session_id,
                min_score=min_score,
                blur_only=blur_only,
                limit=limit,
                offset=offset,
            )

    async def get_summary_by_gallery(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
    ) -> dict[str, Any]:
        """Get summary statistics for a gallery's most recent quality analysis.

        Args:
            workspace_id: Workspace ID for tenant isolation
            gallery_id: Gallery ID

        Returns:
            Summary dict with counts and averages, or empty summary if no session
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Find the most recent session for this gallery
            session_row = await conn.fetchrow(
                """
                SELECT session_id FROM curation_sessions
                WHERE workspace_id = $1 AND gallery_id = $2
                ORDER BY created_at DESC
                LIMIT 1
                """,
                workspace_id,
                gallery_id,
            )

            if not session_row:
                return {
                    "total_analyzed": 0,
                    "average_score": 0.0,
                    "blur_count": 0,
                    "excellent_count": 0,
                    "good_count": 0,
                    "fair_count": 0,
                    "poor_count": 0,
                }

            return await self.get_summary(workspace_id, session_row["session_id"])

    async def get_summary(
        self,
        workspace_id: UUID,
        session_id: UUID,
    ) -> dict[str, Any]:
        """Get summary statistics for a session's quality analysis.

        Args:
            workspace_id: Workspace ID for tenant isolation
            session_id: Session ID

        Returns:
            Summary dict with counts and averages
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) as total_analyzed,
                    AVG(overall_score) as average_score,
                    COUNT(*) FILTER (WHERE blur_detected = TRUE) as blur_count,
                    COUNT(*) FILTER (WHERE overall_score >= 80) as excellent_count,
                    COUNT(*) FILTER (WHERE overall_score >= 60 AND overall_score < 80) as good_count,
                    COUNT(*) FILTER (WHERE overall_score >= 40 AND overall_score < 60) as fair_count,
                    COUNT(*) FILTER (WHERE overall_score < 40) as poor_count
                FROM photo_quality_analysis
                WHERE workspace_id = $1 AND session_id = $2
                """,
                workspace_id,
                session_id,
            )

            if not row:
                return {
                    "total_analyzed": 0,
                    "average_score": 0.0,
                    "blur_count": 0,
                    "excellent_count": 0,
                    "good_count": 0,
                    "fair_count": 0,
                    "poor_count": 0,
                }

            return {
                "total_analyzed": row["total_analyzed"],
                "average_score": float(row["average_score"]) if row["average_score"] else 0.0,
                "blur_count": row["blur_count"],
                "excellent_count": row["excellent_count"],
                "good_count": row["good_count"],
                "fair_count": row["fair_count"],
                "poor_count": row["poor_count"],
            }

    async def get_score_distribution(
        self,
        workspace_id: UUID,
        session_id: UUID,
        bucket_size: int = 10,
    ) -> list[dict[str, Any]]:
        """Get score distribution histogram for a session.

        Args:
            workspace_id: Workspace ID for tenant isolation
            session_id: Session ID
            bucket_size: Size of each histogram bucket (default 10)

        Returns:
            List of {bucket_start, bucket_end, count} dicts
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    (FLOOR(overall_score / $3) * $3)::int as bucket_start,
                    (FLOOR(overall_score / $3) * $3 + $3)::int as bucket_end,
                    COUNT(*) as count
                FROM photo_quality_analysis
                WHERE workspace_id = $1 AND session_id = $2
                GROUP BY bucket_start, bucket_end
                ORDER BY bucket_start
                """,
                workspace_id,
                session_id,
                bucket_size,
            )

            return [
                {
                    "bucket_start": row["bucket_start"],
                    "bucket_end": min(row["bucket_end"], 100),
                    "count": row["count"],
                }
                for row in rows
            ]

    # =========================================================================
    # DELETE OPERATIONS
    # =========================================================================

    async def delete_by_session(
        self,
        workspace_id: UUID,
        session_id: UUID,
    ) -> int:
        """Delete all quality analyses for a session.

        Args:
            workspace_id: Workspace ID for tenant isolation
            session_id: Session ID

        Returns:
            Number of records deleted
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM photo_quality_analysis
                WHERE workspace_id = $1 AND session_id = $2
                """,
                workspace_id,
                session_id,
            )

            count = int(result.split()[-1])

            if count > 0:
                logger.info(
                    "Deleted photo quality analyses",
                    extra={
                        "session_id": str(session_id),
                        "count": count,
                    },
                )

            return count

    # =========================================================================
    # HELPER METHODS
    # =========================================================================

    def _row_to_dict(self, row: Any) -> dict[str, Any]:
        """Convert a database row to a dictionary."""
        import json

        if row is None:
            return {}

        crop_suggestion = None
        if row["crop_suggestion"]:
            try:
                crop_suggestion = json.loads(row["crop_suggestion"])
            except (json.JSONDecodeError, TypeError):
                crop_suggestion = row["crop_suggestion"]

        # Parse AI metadata if present
        metadata = None
        if "ai_metadata" in row and row["ai_metadata"]:
            try:
                if isinstance(row["ai_metadata"], str):
                    metadata = json.loads(row["ai_metadata"])
                else:
                    metadata = row["ai_metadata"]
            except (json.JSONDecodeError, TypeError):
                metadata = {}

        return {
            "asset_id": row["asset_id"],
            "workspace_id": row["workspace_id"],
            "session_id": row["session_id"],
            "overall_score": float(row["overall_score"]),
            "sharpness_score": float(row["sharpness_score"]),
            "exposure_score": float(row["exposure_score"]),
            "composition_score": float(row["composition_score"]),
            "blur_detected": row["blur_detected"],
            "blur_severity": row["blur_severity"],
            "blur_type": row["blur_type"],
            "highlights_clipped": row["highlights_clipped"],
            "shadows_blocked": row["shadows_blocked"],
            "noise_level": row["noise_level"],
            "horizon_tilt_degrees": float(row["horizon_tilt_degrees"]) if row["horizon_tilt_degrees"] else None,
            "crop_suggestion": crop_suggestion,
            "analyzed_at": row["analyzed_at"],
            # AI Metadata fields
            "event_type": metadata.get("event_type") if metadata else None,
            "key_elements": (metadata.get("key_elements") or []) if metadata else [],
            "activity": metadata.get("activity") if metadata else None,
            "semantic_description": metadata.get("semantic_description") if metadata else None,
            "lighting": metadata.get("lighting") if metadata else None,
            "mood": metadata.get("mood") if metadata else None,
        }


# Module-level singleton
_repository: Optional[PhotoQualityRepository] = None


def get_photo_quality_repository() -> PhotoQualityRepository:
    """Get or create the photo quality repository singleton."""
    global _repository
    if _repository is None:
        _repository = PhotoQualityRepository()
    return _repository
