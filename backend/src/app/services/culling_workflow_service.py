"""Culling Workflow Service.

AI-powered bulk photo culling workflow that leverages quality scoring
to help photographers efficiently cull large photo sets.

Features:
- Bulk quality analysis with smart filtering
- Auto-rejection of low-quality images
- Face detection integration
- Preview final gallery selection
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.repositories.photo_quality_repository import get_photo_quality_repository
from app.services.ai_filter_service import get_ai_filter_service

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Quality thresholds for auto-rejection
DEFAULT_REJECT_THRESHOLD = 40  # Auto-reject below this score
DEFAULT_SHARPNESS_THRESHOLD = 80  # "Sharpness >0.8"
DEFAULT_EXPOSURE_OPTIMAL_MIN = 60  # Exposure optimal range min
DEFAULT_EXPOSURE_OPTIMAL_MAX = 90  # Exposure optimal range max


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------


@dataclass
class CullingFilters:
    """Filters for culling workflow."""

    min_overall_score: Optional[float] = None
    min_sharpness: Optional[float] = None
    min_exposure: Optional[float] = None
    max_exposure: Optional[float] = None
    has_faces: Optional[bool] = None
    min_faces: Optional[int] = None
    hide_blur: bool = False
    show_bokeh: bool = True
    exposure_optimal: bool = False  # Shortcut for optimal exposure range


@dataclass
class CullingPhoto:
    """Photo data for culling workflow."""

    asset_id: str
    thumbnail_url: Optional[str] = None
    processed_url: Optional[str] = None
    original_filename: Optional[str] = None
    overall_score: float = 0.0
    sharpness_score: float = 0.0
    exposure_score: float = 0.0
    composition_score: float = 0.0
    blur_detected: bool = False
    blur_type: Optional[str] = None
    blur_severity: Optional[str] = None
    is_intentional_blur: bool = False
    face_count: int = 0
    is_selected: bool = False
    is_rejected: bool = False
    rejection_reason: Optional[str] = None
    quality_tier: str = "fair"  # excellent, good, fair, poor

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "asset_id": self.asset_id,
            "thumbnail_url": self.thumbnail_url,
            "processed_url": self.processed_url,
            "original_filename": self.original_filename,
            "overall_score": self.overall_score,
            "sharpness_score": self.sharpness_score,
            "exposure_score": self.exposure_score,
            "composition_score": self.composition_score,
            "blur_detected": self.blur_detected,
            "blur_type": self.blur_type,
            "blur_severity": self.blur_severity,
            "is_intentional_blur": self.is_intentional_blur,
            "face_count": self.face_count,
            "is_selected": self.is_selected,
            "is_rejected": self.is_rejected,
            "rejection_reason": self.rejection_reason,
            "quality_tier": self.quality_tier,
        }


@dataclass
class CullingStats:
    """Statistics for culling workflow."""

    total_photos: int = 0
    analyzed_count: int = 0
    selected_count: int = 0
    rejected_count: int = 0
    pending_count: int = 0
    excellent_count: int = 0
    good_count: int = 0
    fair_count: int = 0
    poor_count: int = 0
    faces_detected_count: int = 0
    blur_detected_count: int = 0

    def to_dict(self) -> dict[str, int]:
        """Convert to dictionary."""
        return {
            "total_photos": self.total_photos,
            "analyzed_count": self.analyzed_count,
            "selected_count": self.selected_count,
            "rejected_count": self.rejected_count,
            "pending_count": self.pending_count,
            "excellent_count": self.excellent_count,
            "good_count": self.good_count,
            "fair_count": self.fair_count,
            "poor_count": self.poor_count,
            "faces_detected_count": self.faces_detected_count,
            "blur_detected_count": self.blur_detected_count,
        }


@dataclass
class CullingWorkflowResult:
    """Result of culling workflow operations."""

    photos: list[CullingPhoto] = field(default_factory=list)
    stats: CullingStats = field(default_factory=CullingStats)
    total: int = 0
    page: int = 1
    limit: int = 50

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "photos": [p.to_dict() for p in self.photos],
            "stats": self.stats.to_dict(),
            "total": self.total,
            "page": self.page,
            "limit": self.limit,
        }


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class CullingWorkflowService:
    """Service for bulk photo culling workflow.

    Provides:
    - Get photos with quality scores for culling grid
    - Apply smart filters (faces, sharpness, exposure)
    - Auto-reject low-quality images
    - Bulk select best shots
    - Preview final gallery selection
    """

    def __init__(self):
        self._quality_repo = None
        self._filter_service = None

    @property
    def quality_repo(self):
        """Lazy load quality repository."""
        if self._quality_repo is None:
            self._quality_repo = get_photo_quality_repository()
        return self._quality_repo

    @property
    def filter_service(self):
        """Lazy load filter service."""
        if self._filter_service is None:
            self._filter_service = get_ai_filter_service()
        return self._filter_service

    # -------------------------------------------------------------------------
    # Public API
    # -------------------------------------------------------------------------

    async def get_culling_photos(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        filters: Optional[CullingFilters] = None,
        page: int = 1,
        limit: int = 50,
        sort_by: str = "overall_score",
        sort_order: str = "desc",
    ) -> CullingWorkflowResult:
        """Get photos for culling grid with quality scores.

        Args:
            workspace_id: Workspace UUID for tenant isolation
            gallery_id: Gallery UUID
            filters: Optional culling filters
            page: Page number (1-based)
            limit: Results per page
            sort_by: Field to sort by
            sort_order: 'asc' or 'desc'

        Returns:
            CullingWorkflowResult with photos and stats
        """
        pool = await get_postgres_pool()
        filters = filters or CullingFilters()

        # Build base query with quality data
        query = """
            SELECT
                a.asset_id,
                a.thumbnail_object_key,
                a.processed_object_key,
                a.original_filename,
                COALESCE(pqa.overall_score, 0) as overall_score,
                COALESCE(pqa.sharpness_score, 0) as sharpness_score,
                COALESCE(pqa.exposure_score, 0) as exposure_score,
                COALESCE(pqa.composition_score, 0) as composition_score,
                COALESCE(pqa.blur_detected, false) as blur_detected,
                pqa.blur_type,
                pqa.blur_severity,
                COALESCE(pqa.is_intentional_blur, false) as is_intentional_blur,
                COALESCE(fdr.face_count, 0) as face_count,
                COALESCE(cs.is_selected, false) as is_selected,
                COALESCE(cs.is_rejected, false) as is_rejected,
                cs.rejection_reason
            FROM gallery_assets ga
            JOIN assets a ON ga.asset_id = a.asset_id AND a.workspace_id = $1
            LEFT JOIN photo_quality_analysis pqa ON a.asset_id = pqa.asset_id
            LEFT JOIN face_detection_results fdr ON a.asset_id = fdr.asset_id AND fdr.workspace_id = $1
            LEFT JOIN culling_selections cs ON a.asset_id = cs.asset_id AND cs.workspace_id = $1 AND cs.gallery_id = $2
            WHERE ga.gallery_id = $2 AND ga.workspace_id = $1 AND a.status = 'available'
        """
        params: list[Any] = [workspace_id, gallery_id]
        param_idx = 3

        # Apply filters
        if filters.min_overall_score is not None:
            query += f" AND COALESCE(pqa.overall_score, 0) >= ${param_idx}"
            params.append(filters.min_overall_score)
            param_idx += 1

        if filters.min_sharpness is not None:
            query += f" AND COALESCE(pqa.sharpness_score, 0) >= ${param_idx}"
            params.append(filters.min_sharpness)
            param_idx += 1

        if filters.min_exposure is not None:
            query += f" AND COALESCE(pqa.exposure_score, 0) >= ${param_idx}"
            params.append(filters.min_exposure)
            param_idx += 1

        if filters.max_exposure is not None:
            query += f" AND COALESCE(pqa.exposure_score, 0) <= ${param_idx}"
            params.append(filters.max_exposure)
            param_idx += 1

        if filters.exposure_optimal:
            query += f" AND COALESCE(pqa.exposure_score, 0) BETWEEN ${param_idx} AND ${param_idx + 1}"
            params.append(DEFAULT_EXPOSURE_OPTIMAL_MIN)
            params.append(DEFAULT_EXPOSURE_OPTIMAL_MAX)
            param_idx += 2

        if filters.hide_blur:
            if filters.show_bokeh:
                query += " AND (COALESCE(pqa.blur_detected, false) = false OR COALESCE(pqa.is_intentional_blur, false) = true)"
            else:
                query += " AND COALESCE(pqa.blur_detected, false) = false"

        if filters.has_faces is not None:
            if filters.has_faces:
                query += " AND COALESCE(fdr.face_count, 0) > 0"
            else:
                query += " AND COALESCE(fdr.face_count, 0) = 0"

        if filters.min_faces is not None:
            query += f" AND COALESCE(fdr.face_count, 0) >= ${param_idx}"
            params.append(filters.min_faces)
            param_idx += 1

        # Get total count before pagination
        count_query = f"SELECT COUNT(*) as total FROM ({query}) sub"
        count_row = await pool.fetchrow(count_query, *params)
        total = count_row["total"] if count_row else 0

        # Add sorting
        sort_column_map = {
            "overall_score": "overall_score",
            "sharpness_score": "sharpness_score",
            "exposure_score": "exposure_score",
            "composition_score": "composition_score",
            "face_count": "face_count",
            "filename": "original_filename",
        }
        sort_col = sort_column_map.get(sort_by, "overall_score")
        sort_dir = "DESC" if sort_order.lower() == "desc" else "ASC"
        query += f" ORDER BY {sort_col} {sort_dir}, a.asset_id"

        # Add pagination
        offset = (page - 1) * limit
        query += f" LIMIT ${param_idx} OFFSET ${param_idx + 1}"
        params.append(limit)
        params.append(offset)

        # Execute query
        rows = await pool.fetch(query, *params)

        # Convert to CullingPhoto objects
        photos = []
        for row in rows:
            quality_tier = self._get_quality_tier(row["overall_score"])
            photo = CullingPhoto(
                asset_id=str(row["asset_id"]),
                thumbnail_url=row["thumbnail_object_key"],
                processed_url=row["processed_object_key"],
                original_filename=row["original_filename"],
                overall_score=float(row["overall_score"]),
                sharpness_score=float(row["sharpness_score"]),
                exposure_score=float(row["exposure_score"]),
                composition_score=float(row["composition_score"]),
                blur_detected=bool(row["blur_detected"]),
                blur_type=row["blur_type"],
                blur_severity=row["blur_severity"],
                is_intentional_blur=bool(row["is_intentional_blur"]),
                face_count=int(row["face_count"]),
                is_selected=bool(row["is_selected"]),
                is_rejected=bool(row["is_rejected"]),
                rejection_reason=row["rejection_reason"],
                quality_tier=quality_tier,
            )
            photos.append(photo)

        # Get stats
        stats = await self._get_culling_stats(workspace_id, gallery_id)

        return CullingWorkflowResult(
            photos=photos,
            stats=stats,
            total=total,
            page=page,
            limit=limit,
        )

    async def auto_reject_low_quality(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        threshold: float = DEFAULT_REJECT_THRESHOLD,
        reject_blur: bool = True,
        reject_low_sharpness: bool = True,
        sharpness_threshold: float = 40.0,
    ) -> dict[str, Any]:
        """Auto-reject photos below quality threshold.

        Args:
            workspace_id: Workspace UUID
            gallery_id: Gallery UUID
            threshold: Overall score threshold
            reject_blur: Also reject blurred photos
            reject_low_sharpness: Also reject low sharpness
            sharpness_threshold: Sharpness threshold

        Returns:
            Dict with rejected count and asset IDs
        """
        pool = await get_postgres_pool()

        # Find photos to reject
        query = """
            SELECT a.asset_id
            FROM gallery_assets ga
            JOIN assets a ON ga.asset_id = a.asset_id AND a.workspace_id = $1
            LEFT JOIN photo_quality_analysis pqa ON a.asset_id = pqa.asset_id
            LEFT JOIN culling_selections cs ON a.asset_id = cs.asset_id
                AND cs.workspace_id = $1 AND cs.gallery_id = $2
            WHERE ga.gallery_id = $2
              AND ga.workspace_id = $1
              AND a.status = 'available'
              AND COALESCE(cs.is_selected, false) = false
              AND COALESCE(cs.is_rejected, false) = false
              AND (
                  COALESCE(pqa.overall_score, 0) < $3
        """
        params: list[Any] = [workspace_id, gallery_id, threshold]
        param_idx = 4

        if reject_blur:
            query += " OR (COALESCE(pqa.blur_detected, false) = true AND COALESCE(pqa.is_intentional_blur, false) = false)"

        if reject_low_sharpness:
            query += f" OR COALESCE(pqa.sharpness_score, 0) < ${param_idx}"
            params.append(sharpness_threshold)
            param_idx += 1

        query += ")"

        rows = await pool.fetch(query, *params)
        asset_ids = [row["asset_id"] for row in rows]

        if not asset_ids:
            return {"rejected_count": 0, "asset_ids": []}

        # Create or update culling selections
        await self._bulk_set_rejection(
            workspace_id,
            gallery_id,
            asset_ids,
            is_rejected=True,
            reason="Auto-rejected: low quality score",
        )

        logger.info(
            f"Auto-rejected {len(asset_ids)} photos",
            extra={
                "workspace_id": str(workspace_id),
                "gallery_id": str(gallery_id),
                "threshold": threshold,
            },
        )

        return {
            "rejected_count": len(asset_ids),
            "asset_ids": [str(aid) for aid in asset_ids],
        }

    async def bulk_select(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        asset_ids: list[UUID],
    ) -> dict[str, Any]:
        """Bulk select photos as best shots.

        Args:
            workspace_id: Workspace UUID
            gallery_id: Gallery UUID
            asset_ids: List of asset UUIDs to select

        Returns:
            Dict with selected count
        """
        if not asset_ids:
            return {"selected_count": 0}

        await self._bulk_set_selection(workspace_id, gallery_id, asset_ids, is_selected=True)

        return {"selected_count": len(asset_ids)}

    async def bulk_reject(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        asset_ids: list[UUID],
        reason: Optional[str] = None,
    ) -> dict[str, Any]:
        """Bulk reject photos.

        Args:
            workspace_id: Workspace UUID
            gallery_id: Gallery UUID
            asset_ids: List of asset UUIDs to reject
            reason: Optional rejection reason

        Returns:
            Dict with rejected count
        """
        if not asset_ids:
            return {"rejected_count": 0}

        await self._bulk_set_rejection(
            workspace_id,
            gallery_id,
            asset_ids,
            is_rejected=True,
            reason=reason or "Manual rejection",
        )

        return {"rejected_count": len(asset_ids)}

    async def bulk_reset(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        asset_ids: list[UUID],
    ) -> dict[str, Any]:
        """Reset selection/rejection status for photos.

        Args:
            workspace_id: Workspace UUID
            gallery_id: Gallery UUID
            asset_ids: List of asset UUIDs to reset

        Returns:
            Dict with reset count
        """
        if not asset_ids:
            return {"reset_count": 0}

        pool = await get_postgres_pool()

        await pool.execute(
            """
            DELETE FROM culling_selections
            WHERE workspace_id = $1 AND gallery_id = $2 AND asset_id = ANY($3)
            """,
            workspace_id,
            gallery_id,
            asset_ids,
        )

        return {"reset_count": len(asset_ids)}

    async def get_final_selection(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        page: int = 1,
        limit: int = 100,
    ) -> CullingWorkflowResult:
        """Get final selected photos for gallery preview.

        Args:
            workspace_id: Workspace UUID
            gallery_id: Gallery UUID
            page: Page number
            limit: Results per page

        Returns:
            CullingWorkflowResult with only selected photos
        """
        pool = await get_postgres_pool()

        # Get selected photos with quality data
        query = """
            SELECT
                a.asset_id,
                a.thumbnail_object_key,
                a.processed_object_key,
                a.original_filename,
                COALESCE(pqa.overall_score, 0) as overall_score,
                COALESCE(pqa.sharpness_score, 0) as sharpness_score,
                COALESCE(pqa.exposure_score, 0) as exposure_score,
                COALESCE(pqa.composition_score, 0) as composition_score,
                COALESCE(pqa.blur_detected, false) as blur_detected,
                pqa.blur_type,
                pqa.blur_severity,
                COALESCE(pqa.is_intentional_blur, false) as is_intentional_blur,
                COALESCE(fdr.face_count, 0) as face_count,
                true as is_selected,
                false as is_rejected,
                NULL as rejection_reason
            FROM culling_selections cs
            JOIN assets a ON cs.asset_id = a.asset_id AND a.workspace_id = $1
            LEFT JOIN photo_quality_analysis pqa ON a.asset_id = pqa.asset_id
            LEFT JOIN face_detection_results fdr ON a.asset_id = fdr.asset_id AND fdr.workspace_id = $1
            WHERE cs.workspace_id = $1
              AND cs.gallery_id = $2
              AND cs.is_selected = true
              AND a.status = 'available'
            ORDER BY pqa.overall_score DESC NULLS LAST, a.asset_id
        """

        # Get total count
        count_query = f"SELECT COUNT(*) as total FROM ({query}) sub"
        count_row = await pool.fetchrow(count_query, workspace_id, gallery_id)
        total = count_row["total"] if count_row else 0

        # Add pagination
        offset = (page - 1) * limit
        query += f" LIMIT $3 OFFSET $4"

        rows = await pool.fetch(query, workspace_id, gallery_id, limit, offset)

        # Convert to CullingPhoto objects
        photos = []
        for row in rows:
            quality_tier = self._get_quality_tier(row["overall_score"])
            photo = CullingPhoto(
                asset_id=str(row["asset_id"]),
                thumbnail_url=row["thumbnail_object_key"],
                processed_url=row["processed_object_key"],
                original_filename=row["original_filename"],
                overall_score=float(row["overall_score"]),
                sharpness_score=float(row["sharpness_score"]),
                exposure_score=float(row["exposure_score"]),
                composition_score=float(row["composition_score"]),
                blur_detected=bool(row["blur_detected"]),
                blur_type=row["blur_type"],
                blur_severity=row["blur_severity"],
                is_intentional_blur=bool(row["is_intentional_blur"]),
                face_count=int(row["face_count"]),
                is_selected=True,
                is_rejected=False,
                rejection_reason=None,
                quality_tier=quality_tier,
            )
            photos.append(photo)

        stats = await self._get_culling_stats(workspace_id, gallery_id)

        return CullingWorkflowResult(
            photos=photos,
            stats=stats,
            total=total,
            page=page,
            limit=limit,
        )

    async def apply_to_gallery(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        action: str = "create_sub_gallery",
        name: Optional[str] = None,
    ) -> dict[str, Any]:
        """Apply culling selections to gallery.

        Args:
            workspace_id: Workspace UUID
            gallery_id: Gallery UUID
            action: Action to perform ('create_sub_gallery', 'move_rejected', 'mark_favorites')
            name: Optional name for sub-gallery

        Returns:
            Dict with action result
        """
        pool = await get_postgres_pool()

        # Get selected asset IDs
        rows = await pool.fetch(
            """
            SELECT asset_id FROM culling_selections
            WHERE workspace_id = $1 AND gallery_id = $2 AND is_selected = true
            """,
            workspace_id,
            gallery_id,
        )
        selected_ids = [row["asset_id"] for row in rows]

        if not selected_ids:
            return {"success": False, "message": "No photos selected", "count": 0}

        if action == "create_sub_gallery":
            # Create a new sub-gallery with selected photos
            sub_gallery_name = name or "Culled Selection"

            # Create sub-gallery
            sub_gallery = await pool.fetchrow(
                """
                INSERT INTO sub_galleries (workspace_id, gallery_id, name, position)
                SELECT $1, $2, $3, COALESCE(MAX(position), 0) + 1
                FROM sub_galleries WHERE gallery_id = $2
                RETURNING sub_gallery_id
                """,
                workspace_id,
                gallery_id,
                sub_gallery_name,
            )

            if sub_gallery:
                # Move selected assets to sub-gallery
                await pool.execute(
                    """
                    UPDATE gallery_assets
                    SET sub_gallery_id = $1
                    WHERE workspace_id = $2 AND gallery_id = $3 AND asset_id = ANY($4)
                    """,
                    sub_gallery["sub_gallery_id"],
                    workspace_id,
                    gallery_id,
                    selected_ids,
                )

                return {
                    "success": True,
                    "message": f"Created sub-gallery '{sub_gallery_name}' with {len(selected_ids)} photos",
                    "sub_gallery_id": str(sub_gallery["sub_gallery_id"]),
                    "count": len(selected_ids),
                }

        elif action == "mark_favorites":
            # Mark selected photos as favorites
            await pool.execute(
                """
                INSERT INTO favorites (workspace_id, asset_id, created_at)
                SELECT $1, unnest($2::uuid[]), NOW()
                ON CONFLICT (workspace_id, asset_id) DO NOTHING
                """,
                workspace_id,
                selected_ids,
            )
            return {
                "success": True,
                "message": f"Marked {len(selected_ids)} photos as favorites",
                "count": len(selected_ids),
            }

        return {"success": False, "message": "Unknown action", "count": 0}

    # -------------------------------------------------------------------------
    # Private Methods
    # -------------------------------------------------------------------------

    async def _get_culling_stats(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
    ) -> CullingStats:
        """Get culling workflow statistics."""
        pool = await get_postgres_pool()

        stats_row = await pool.fetchrow(
            """
            WITH gallery_photos AS (
                SELECT
                    a.asset_id,
                    COALESCE(pqa.overall_score, 0) as overall_score,
                    COALESCE(pqa.blur_detected, false) as blur_detected,
                    COALESCE(fdr.face_count, 0) as face_count,
                    pqa.asset_id IS NOT NULL as is_analyzed,
                    COALESCE(cs.is_selected, false) as is_selected,
                    COALESCE(cs.is_rejected, false) as is_rejected
                FROM gallery_assets ga
                JOIN assets a ON ga.asset_id = a.asset_id AND a.workspace_id = $1
                LEFT JOIN photo_quality_analysis pqa ON a.asset_id = pqa.asset_id
                LEFT JOIN face_detection_results fdr ON a.asset_id = fdr.asset_id AND fdr.workspace_id = $1
                LEFT JOIN culling_selections cs ON a.asset_id = cs.asset_id
                    AND cs.workspace_id = $1 AND cs.gallery_id = $2
                WHERE ga.gallery_id = $2 AND ga.workspace_id = $1 AND a.status = 'available'
            )
            SELECT
                COUNT(*) as total_photos,
                COUNT(*) FILTER (WHERE is_analyzed) as analyzed_count,
                COUNT(*) FILTER (WHERE is_selected) as selected_count,
                COUNT(*) FILTER (WHERE is_rejected) as rejected_count,
                COUNT(*) FILTER (WHERE NOT is_selected AND NOT is_rejected) as pending_count,
                COUNT(*) FILTER (WHERE overall_score >= 90) as excellent_count,
                COUNT(*) FILTER (WHERE overall_score >= 70 AND overall_score < 90) as good_count,
                COUNT(*) FILTER (WHERE overall_score >= 50 AND overall_score < 70) as fair_count,
                COUNT(*) FILTER (WHERE overall_score < 50) as poor_count,
                COUNT(*) FILTER (WHERE face_count > 0) as faces_detected_count,
                COUNT(*) FILTER (WHERE blur_detected) as blur_detected_count
            FROM gallery_photos
            """,
            workspace_id,
            gallery_id,
        )

        return CullingStats(
            total_photos=stats_row["total_photos"] or 0,
            analyzed_count=stats_row["analyzed_count"] or 0,
            selected_count=stats_row["selected_count"] or 0,
            rejected_count=stats_row["rejected_count"] or 0,
            pending_count=stats_row["pending_count"] or 0,
            excellent_count=stats_row["excellent_count"] or 0,
            good_count=stats_row["good_count"] or 0,
            fair_count=stats_row["fair_count"] or 0,
            poor_count=stats_row["poor_count"] or 0,
            faces_detected_count=stats_row["faces_detected_count"] or 0,
            blur_detected_count=stats_row["blur_detected_count"] or 0,
        )

    async def _bulk_set_selection(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        asset_ids: list[UUID],
        is_selected: bool,
    ) -> None:
        """Bulk set selection status for assets."""
        pool = await get_postgres_pool()

        for asset_id in asset_ids:
            await pool.execute(
                """
                INSERT INTO culling_selections (workspace_id, gallery_id, asset_id, is_selected, is_rejected)
                VALUES ($1, $2, $3, $4, false)
                ON CONFLICT (workspace_id, gallery_id, asset_id)
                DO UPDATE SET is_selected = $4, is_rejected = false, updated_at = NOW()
                """,
                workspace_id,
                gallery_id,
                asset_id,
                is_selected,
            )

    async def _bulk_set_rejection(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        asset_ids: list[UUID],
        is_rejected: bool,
        reason: Optional[str] = None,
    ) -> None:
        """Bulk set rejection status for assets."""
        pool = await get_postgres_pool()

        for asset_id in asset_ids:
            await pool.execute(
                """
                INSERT INTO culling_selections (workspace_id, gallery_id, asset_id, is_selected, is_rejected, rejection_reason)
                VALUES ($1, $2, $3, false, $4, $5)
                ON CONFLICT (workspace_id, gallery_id, asset_id)
                DO UPDATE SET is_selected = false, is_rejected = $4, rejection_reason = $5, updated_at = NOW()
                """,
                workspace_id,
                gallery_id,
                asset_id,
                is_rejected,
                reason,
            )

    def _get_quality_tier(self, score: float) -> str:
        """Get quality tier from score."""
        if score >= 90:
            return "excellent"
        elif score >= 70:
            return "good"
        elif score >= 50:
            return "fair"
        else:
            return "poor"


# ---------------------------------------------------------------------------
# Service Factory
# ---------------------------------------------------------------------------

_culling_workflow_service: Optional[CullingWorkflowService] = None


def get_culling_workflow_service() -> CullingWorkflowService:
    """Get the culling workflow service singleton."""
    global _culling_workflow_service
    if _culling_workflow_service is None:
        _culling_workflow_service = CullingWorkflowService()
    return _culling_workflow_service
