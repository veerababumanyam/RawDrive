"""Smart Tagging API endpoints for AI Service.

All routes prefixed with /api/v1/workspaces/{workspace_id}/smart-tagging.

Provides endpoints for:
- Asset analysis status and AI-generated metadata
- Content detection job management
- Tagging health statistics
- Gallery and workspace-level tagging analytics
"""

from __future__ import annotations

import logging
import os
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query, HTTPException, status
from pydantic import BaseModel, Field

from src.middleware.auth import get_current_user, get_workspace_id
from src.middleware.rate_limit import limiter, RATE_LIMIT_HEALTH, RATE_LIMIT_AI_FILTER
from rawdrive_mcp.db import get_db_pool
from rawdrive_mcp.cache import (
    cache_response,
    CACHE_TTL_GALLERY_HEALTH,
    CACHE_TTL_AI_FILTER,
    CACHE_TTL_QUALITY_ANALYSIS,
)
from fastapi import Request

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Request/Response Schemas
# ---------------------------------------------------------------------------


class HealthBadgeResponse(BaseModel):
    """Health badge data for UI display."""

    status: str = Field(..., description="Health status: excellent, good, fair, poor")
    score: float = Field(..., description="Health score 0-100")
    tag_pct: float = Field(..., description="Percentage of assets with at least one tag")


class GalleryHealthResponse(BaseModel):
    """Gallery tagging health statistics."""

    gallery_id: str
    total_assets: int
    vision_completed: int
    vision_failed: int
    vision_pending: int
    face_completed: int
    face_failed: int
    face_pending: int
    tagged_assets: int
    total_tags: int
    ai_tags: int
    manual_tags: int
    badge: HealthBadgeResponse


class FilteredAsset(BaseModel):
    """Single filtered asset with quality scores."""

    asset_id: str
    overall_score: float
    sharpness_score: Optional[float] = None
    exposure_score: Optional[float] = None
    composition_score: Optional[float] = None
    blur_detected: Optional[bool] = None
    blur_type: Optional[str] = None
    blur_severity: Optional[str] = None


class AIFilterResponse(BaseModel):
    """Response for AI filter endpoint."""

    assets: list[FilteredAsset]
    meta: dict
    filter_stats: dict
    applied_filters: dict


class AIFilterCountResponse(BaseModel):
    """Response for AI filter count endpoint."""

    count: int
    similarityGroupsCount: int = 0


class QualityAnalysisItem(BaseModel):
    """Single quality analysis result."""

    asset_id: str
    overall_score: float
    sharpness_score: Optional[float] = None
    exposure_score: Optional[float] = None
    composition_score: Optional[float] = None
    blur_detected: bool = False
    session_id: Optional[str] = None
    analyzed_at: Optional[str] = None


class QualityAnalysisSummary(BaseModel):
    """Summary statistics for quality analysis."""

    total_analyzed: int
    average_score: float
    blur_count: int
    excellent_count: int = 0
    good_count: int = 0
    fair_count: int = 0


class GalleryQualityResultsResponse(BaseModel):
    """Response for quality analysis results."""

    gallery_id: str
    results: list[QualityAnalysisItem]
    summary: Optional[QualityAnalysisSummary] = None
    total: int
    limit: int
    offset: int


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/galleries/{gallery_id}/health",
    response_model=GalleryHealthResponse,
    status_code=status.HTTP_200_OK,
    summary="Get gallery tagging health",
)
@limiter.limit(RATE_LIMIT_HEALTH)
async def get_gallery_health(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> GalleryHealthResponse:
    """
    Get tagging health statistics for a specific gallery.

    Returns completion rates for vision analysis and face detection,
    along with tag counts and an overall health badge.
    """
    # Verify workspace access
    workspace_id_from_path = get_workspace_id(request)
    if str(workspace_id) != workspace_id_from_path:
        raise HTTPException(status_code=403, detail="Workspace access denied")

    pool = await get_db_pool()
    async with pool.acquire() as conn:
        # Get gallery stats - start from gallery_assets (junction table)
        stats = await conn.fetchrow(
            """
            SELECT 
                COUNT(DISTINCT ga.asset_id) as total_assets,
                COUNT(DISTINCT CASE WHEN aa.vision_status = 'completed' THEN ga.asset_id END) as vision_completed,
                COUNT(DISTINCT CASE WHEN aa.vision_status = 'failed' THEN ga.asset_id END) as vision_failed,
                COUNT(DISTINCT CASE WHEN aa.vision_status IS NULL OR aa.vision_status = 'pending' THEN ga.asset_id END) as vision_pending,
                COUNT(DISTINCT CASE WHEN aa.face_status = 'completed' THEN ga.asset_id END) as face_completed,
                COUNT(DISTINCT CASE WHEN aa.face_status = 'failed' THEN ga.asset_id END) as face_failed,
                COUNT(DISTINCT CASE WHEN aa.face_status IS NULL OR aa.face_status = 'pending' THEN ga.asset_id END) as face_pending,
                COUNT(DISTINCT CASE WHEN EXISTS (
                    SELECT 1 FROM asset_tags at WHERE at.asset_id = ga.asset_id
                ) THEN ga.asset_id END) as tagged_assets,
                COUNT(DISTINCT at.tag_id) as total_tags,
                COUNT(DISTINCT CASE WHEN at.source = 'ai' THEN at.tag_id END) as ai_tags,
                COUNT(DISTINCT CASE WHEN at.source = 'manual' THEN at.tag_id END) as manual_tags
            FROM gallery_assets ga
            INNER JOIN assets a ON a.asset_id = ga.asset_id AND a.workspace_id = ga.workspace_id
            LEFT JOIN asset_analysis aa ON aa.asset_id = ga.asset_id AND aa.workspace_id = ga.workspace_id
            LEFT JOIN asset_tags at ON at.asset_id = ga.asset_id
            WHERE ga.gallery_id = $1 AND ga.workspace_id = $2 AND a.deleted = FALSE
            """,
            gallery_id,
            workspace_id,
        )

        if not stats or stats["total_assets"] == 0:
            raise HTTPException(status_code=404, detail="Gallery not found or has no assets")

        # Calculate badge
        tag_pct = (stats["tagged_assets"] / stats["total_assets"] * 100) if stats["total_assets"] > 0 else 0.0
        vision_pct = (stats["vision_completed"] / stats["total_assets"] * 100) if stats["total_assets"] > 0 else 0.0
        
        # Simple health score calculation
        health_score = (tag_pct + vision_pct) / 2
        
        if health_score >= 80:
            badge_status = "excellent"
        elif health_score >= 60:
            badge_status = "good"
        elif health_score >= 40:
            badge_status = "fair"
        else:
            badge_status = "poor"

        return GalleryHealthResponse(
            gallery_id=str(gallery_id),
            total_assets=stats["total_assets"],
            vision_completed=stats["vision_completed"],
            vision_failed=stats["vision_failed"],
            vision_pending=stats["vision_pending"],
            face_completed=stats["face_completed"],
            face_failed=stats["face_failed"],
            face_pending=stats["face_pending"],
            tagged_assets=stats["tagged_assets"],
            total_tags=stats["total_tags"] or 0,
            ai_tags=stats["ai_tags"] or 0,
            manual_tags=stats["manual_tags"] or 0,
            badge=HealthBadgeResponse(
                status=badge_status,
                score=health_score,
                tag_pct=tag_pct,
            ),
        )


@router.get(
    "/galleries/{gallery_id}/ai-filter/count",
    response_model=AIFilterCountResponse,
    summary="Get count of assets matching AI filters (quality/blur/technical)",
)
@limiter.limit(RATE_LIMIT_AI_FILTER)
async def count_gallery_ai_filters(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    request: Request,
    current_user: dict = Depends(get_current_user),
    quality_tier: Annotated[str, Query(alias="quality_tier", pattern="^(all|excellent|good|fair)$", description="Quality tier filter")] = "all",
    quality_min: Annotated[Optional[int], Query(ge=0, le=100, description="Minimum overall quality score")] = None,
    blur_hide: Annotated[bool, Query(description="Hide photos with blur")] = False,
    blur_show_bokeh: Annotated[bool, Query(description="Show bokeh even when hiding blur")] = True,
    min_sharpness: Annotated[Optional[int], Query(ge=0, le=100, description="Minimum sharpness score")] = None,
    min_exposure: Annotated[Optional[int], Query(ge=0, le=100, description="Minimum exposure score")] = None,
    min_composition: Annotated[Optional[int], Query(ge=0, le=100, description="Minimum composition score")] = None,
) -> AIFilterCountResponse:
    """Return count only, for real-time match indicator."""
    # Verify workspace access
    workspace_id_from_path = get_workspace_id(request)
    if str(workspace_id) != workspace_id_from_path:
        raise HTTPException(status_code=403, detail="Workspace access denied")

    # Quality tier mapping
    tier_min_map = {"all": 0, "excellent": 80, "good": 60, "fair": 40}
    tier_min = tier_min_map.get(quality_tier, 0)
    effective_min = quality_min if quality_min is not None else tier_min

    pool = await get_db_pool()
    async with pool.acquire() as conn:
        # Query photo quality data - start from gallery_assets (junction table)
        query = """
            SELECT 
                pq.asset_id,
                pq.overall_score,
                pq.sharpness_score,
                pq.exposure_score,
                pq.composition_score,
                pq.blur_detected
            FROM photo_quality_analysis pq
            INNER JOIN gallery_assets ga ON ga.asset_id = pq.asset_id AND ga.workspace_id = pq.workspace_id
            INNER JOIN assets a ON a.asset_id = ga.asset_id AND a.workspace_id = ga.workspace_id
            WHERE ga.gallery_id = $1 AND ga.workspace_id = $2 AND a.deleted = FALSE
            AND pq.overall_score >= $3
            LIMIT 500
        """
        
        rows = await conn.fetch(query, gallery_id, workspace_id, effective_min)
        
        # Apply filters
        count = 0
        for row in rows:
            # Blur filter
            if blur_hide and row["blur_detected"]:
                if not blur_show_bokeh:  # Skip if bokeh not allowed
                    continue
            
            # Score filters
            # Note: 0 means "no filter", so only apply if > 0
            if min_sharpness is not None and min_sharpness > 0 and (row["sharpness_score"] or 0) < min_sharpness:
                continue
            if min_exposure is not None and min_exposure > 0 and (row["exposure_score"] or 0) < min_exposure:
                continue
            if min_composition is not None and min_composition > 0 and (row["composition_score"] or 0) < min_composition:
                continue
            
            count += 1

        return AIFilterCountResponse(count=count, similarityGroupsCount=0)


@router.get(
    "/galleries/{gallery_id}/ai-filter",
    response_model=AIFilterResponse,
    summary="Filter gallery assets by AI quality/blur/technical scores",
)
@limiter.limit(RATE_LIMIT_AI_FILTER)
async def filter_gallery_ai(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    request: Request,
    current_user: dict = Depends(get_current_user),
    quality_tier: Annotated[str, Query(alias="quality_tier", pattern="^(all|excellent|good|fair)$", description="Quality tier filter")] = "all",
    quality_min: Annotated[Optional[int], Query(ge=0, le=100, description="Minimum overall quality score")] = None,
    blur_hide: Annotated[bool, Query(description="Hide photos with blur")] = False,
    blur_show_bokeh: Annotated[bool, Query(description="Show bokeh even when hiding blur")] = True,
    min_sharpness: Annotated[Optional[int], Query(ge=0, le=100, description="Minimum sharpness score")] = None,
    min_exposure: Annotated[Optional[int], Query(ge=0, le=100, description="Minimum exposure score")] = None,
    min_composition: Annotated[Optional[int], Query(ge=0, le=100, description="Minimum composition score")] = None,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    limit: Annotated[int, Query(ge=1, le=500, description="Page size")] = 100,
) -> AIFilterResponse:
    """Filter gallery assets by AI quality scores."""
    # Verify workspace access
    workspace_id_from_path = get_workspace_id(request)
    if str(workspace_id) != workspace_id_from_path:
        raise HTTPException(status_code=403, detail="Workspace access denied")

    # Quality tier mapping
    tier_min_map = {"all": 0, "excellent": 80, "good": 60, "fair": 40}
    tier_min = tier_min_map.get(quality_tier, 0)
    effective_min = quality_min if quality_min is not None else tier_min

    pool = await get_db_pool()
    async with pool.acquire() as conn:
        # Query photo quality data - start from gallery_assets (junction table)
        query = """
            SELECT 
                pq.asset_id,
                pq.overall_score,
                pq.sharpness_score,
                pq.exposure_score,
                pq.composition_score,
                pq.blur_detected,
                pq.blur_type,
                pq.blur_severity
            FROM photo_quality_analysis pq
            INNER JOIN gallery_assets ga ON ga.asset_id = pq.asset_id AND ga.workspace_id = pq.workspace_id
            INNER JOIN assets a ON a.asset_id = ga.asset_id AND a.workspace_id = ga.workspace_id
            WHERE ga.gallery_id = $1 AND ga.workspace_id = $2 AND a.deleted = FALSE
            AND pq.overall_score >= $3
            LIMIT 500
        """
        
        rows = await conn.fetch(query, gallery_id, workspace_id, effective_min)
        
        # Apply filters
        filtered = []
        for row in rows:
            # Blur filter
            if blur_hide and row["blur_detected"]:
                if not blur_show_bokeh or row.get("blur_type") != "bokeh":
                    continue
            
            # Score filters
            # Note: 0 means "no filter", so only apply if > 0
            if min_sharpness is not None and min_sharpness > 0 and (row["sharpness_score"] or 0) < min_sharpness:
                continue
            if min_exposure is not None and min_exposure > 0 and (row["exposure_score"] or 0) < min_exposure:
                continue
            if min_composition is not None and min_composition > 0 and (row["composition_score"] or 0) < min_composition:
                continue
            
            filtered.append(row)

        # Pagination
        start = (page - 1) * limit
        end = start + limit
        paged = filtered[start:end]

        assets = [
            FilteredAsset(
                asset_id=str(row["asset_id"]),
                overall_score=float(row["overall_score"]),
                sharpness_score=float(row["sharpness_score"]) if row["sharpness_score"] else None,
                exposure_score=float(row["exposure_score"]) if row["exposure_score"] else None,
                composition_score=float(row["composition_score"]) if row["composition_score"] else None,
                blur_detected=bool(row["blur_detected"]) if row["blur_detected"] is not None else None,
                blur_type=str(row["blur_type"]) if row["blur_type"] else None,
                blur_severity=str(row["blur_severity"]) if row["blur_severity"] else None,
            )
            for row in paged
        ]

        applied_filters = {
            "quality_tier": quality_tier,
            "quality_min": quality_min,
            "blur_hide": blur_hide,
            "blur_show_bokeh": blur_show_bokeh,
            "min_sharpness": min_sharpness,
            "min_exposure": min_exposure,
            "min_composition": min_composition,
            "page": page,
            "limit": limit,
        }

        filter_stats = {
            "excellentCount": sum(1 for r in filtered if (r.get("overall_score", 0) or 0) >= 90),
            "goodCount": sum(1 for r in filtered if 70 <= (r.get("overall_score", 0) or 0) < 90),
            "fairCount": sum(1 for r in filtered if 50 <= (r.get("overall_score", 0) or 0) < 70),
        }

        meta = {
            "page": page,
            "limit": limit,
            "total": len(filtered),
            "hasMore": end < len(filtered),
        }

        return AIFilterResponse(
            assets=assets,
            meta=meta,
            filter_stats=filter_stats,
            applied_filters=applied_filters,
        )


@router.get(
    "/galleries/{gallery_id}/quality-analysis",
    response_model=GalleryQualityResultsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get quality analysis results for a gallery",
)
@limiter.limit(RATE_LIMIT_AI_FILTER)
async def get_quality_analysis_results(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    request: Request,
    current_user: dict = Depends(get_current_user),
    session_id: Annotated[Optional[UUID], Query(description="Filter by session")] = None,
    min_score: Annotated[Optional[float], Query(ge=0, le=100, description="Minimum overall score")] = None,
    blur_detected: Annotated[Optional[bool], Query(description="Filter by blur detection")] = None,
    limit: Annotated[int, Query(ge=1, le=500, description="Results per page")] = 100,
    offset: Annotated[int, Query(ge=0, description="Pagination offset")] = 0,
) -> GalleryQualityResultsResponse:
    """
    Get quality analysis results for photos in a gallery.

    Returns quality scores for each analyzed photo with filtering
    options by score threshold, blur detection, and session.
    """
    # Verify workspace access
    workspace_id_from_path = get_workspace_id(request)
    if str(workspace_id) != workspace_id_from_path:
        raise HTTPException(status_code=403, detail="Workspace access denied")

    pool = await get_db_pool()
    async with pool.acquire() as conn:
        # Build query - start from gallery_assets (junction table)
        base_query = """
            SELECT 
                pq.asset_id,
                pq.overall_score,
                pq.sharpness_score,
                pq.exposure_score,
                pq.composition_score,
                pq.blur_detected,
                pq.session_id,
                pq.analyzed_at
            FROM photo_quality_analysis pq
            INNER JOIN gallery_assets ga ON ga.asset_id = pq.asset_id AND ga.workspace_id = pq.workspace_id
            INNER JOIN assets a ON a.asset_id = ga.asset_id AND a.workspace_id = ga.workspace_id
            WHERE ga.gallery_id = $1 AND ga.workspace_id = $2 AND a.deleted = FALSE
        """
        
        params = [gallery_id, workspace_id]
        param_idx = 3
        
        if session_id:
            base_query += f" AND pq.session_id = ${param_idx}"
            params.append(session_id)
            param_idx += 1
        
        # Get total count
        count_query = f"SELECT COUNT(*) as total FROM ({base_query}) subq"
        total_row = await conn.fetchrow(count_query, *params)
        total = total_row["total"] if total_row else 0
        
        # Apply filters and pagination
        if min_score is not None:
            base_query += f" AND pq.overall_score >= ${param_idx}"
            params.append(min_score)
            param_idx += 1
        
        if blur_detected is not None:
            base_query += f" AND pq.blur_detected = ${param_idx}"
            params.append(blur_detected)
            param_idx += 1
        
        base_query += f" ORDER BY pq.overall_score DESC LIMIT ${param_idx} OFFSET ${param_idx + 1}"
        params.extend([limit, offset])
        
        rows = await conn.fetch(base_query, *params)
        
        # Format results
        results = []
        for row in rows:
            results.append(QualityAnalysisItem(
                asset_id=str(row["asset_id"]),
                overall_score=float(row["overall_score"]),
                sharpness_score=float(row["sharpness_score"]) if row["sharpness_score"] else None,
                exposure_score=float(row["exposure_score"]) if row["exposure_score"] else None,
                composition_score=float(row["composition_score"]) if row["composition_score"] else None,
                blur_detected=bool(row["blur_detected"]),
                session_id=str(row["session_id"]) if row["session_id"] else None,
                analyzed_at=row["analyzed_at"].isoformat() if row["analyzed_at"] else None,
            ))
        
        # Calculate summary
        if results:
            avg_score = sum(r.overall_score for r in results) / len(results)
            blur_count = sum(1 for r in results if r.blur_detected)
            excellent_count = sum(1 for r in results if r.overall_score >= 80)
            good_count = sum(1 for r in results if 60 <= r.overall_score < 80)
            fair_count = sum(1 for r in results if 40 <= r.overall_score < 60)
            
            summary = QualityAnalysisSummary(
                total_analyzed=len(results),
                average_score=avg_score,
                blur_count=blur_count,
                excellent_count=excellent_count,
                good_count=good_count,
                fair_count=fair_count,
            )
        else:
            summary = None

        return GalleryQualityResultsResponse(
            gallery_id=str(gallery_id),
            results=results,
            summary=summary,
            total=total,
            limit=limit,
            offset=offset,
        )
