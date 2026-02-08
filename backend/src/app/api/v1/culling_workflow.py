"""Culling Workflow API endpoints.

All routes prefixed with /api/v1/workspaces/{workspace_id}/galleries/{gallery_id}/culling.

Provides bulk photo culling workflow with AI quality scoring integration.
"""

from __future__ import annotations

import logging
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Path, Query, status
from pydantic import BaseModel, Field

from app.api.dependencies.auth import CurrentUserDep, WorkspaceAccessDep
from app.api.schemas import ErrorResponse, MessageResponse
from app.services.culling_workflow_service import (
    get_culling_workflow_service,
    CullingFilters,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# =============================================================================
# Request/Response Schemas
# =============================================================================


class CullingFiltersRequest(BaseModel):
    """Request schema for culling filters."""

    min_overall_score: Optional[float] = Field(None, ge=0, le=100, description="Minimum overall quality score")
    min_sharpness: Optional[float] = Field(None, ge=0, le=100, description="Minimum sharpness score (0.8 = 80)")
    min_exposure: Optional[float] = Field(None, ge=0, le=100, description="Minimum exposure score")
    max_exposure: Optional[float] = Field(None, ge=0, le=100, description="Maximum exposure score")
    has_faces: Optional[bool] = Field(None, description="Filter by face presence")
    min_faces: Optional[int] = Field(None, ge=0, description="Minimum face count")
    hide_blur: bool = Field(False, description="Hide blurred photos")
    show_bokeh: bool = Field(True, description="Show artistic bokeh when hiding blur")
    exposure_optimal: bool = Field(False, description="Filter for optimal exposure range (60-90)")


class CullingPhotoResponse(BaseModel):
    """Response schema for a culling photo."""

    asset_id: str
    thumbnail_url: Optional[str] = None
    processed_url: Optional[str] = None
    original_filename: Optional[str] = None
    overall_score: float
    sharpness_score: float
    exposure_score: float
    composition_score: float
    blur_detected: bool
    blur_type: Optional[str] = None
    blur_severity: Optional[str] = None
    is_intentional_blur: bool
    face_count: int
    is_selected: bool
    is_rejected: bool
    rejection_reason: Optional[str] = None
    quality_tier: str


class CullingStatsResponse(BaseModel):
    """Response schema for culling stats."""

    total_photos: int
    analyzed_count: int
    selected_count: int
    rejected_count: int
    pending_count: int
    excellent_count: int
    good_count: int
    fair_count: int
    poor_count: int
    faces_detected_count: int
    blur_detected_count: int


class CullingPhotosResponse(BaseModel):
    """Response schema for culling photos list."""

    photos: list[CullingPhotoResponse]
    stats: CullingStatsResponse
    total: int
    page: int
    limit: int


class AutoRejectRequest(BaseModel):
    """Request schema for auto-reject operation."""

    threshold: float = Field(40.0, ge=0, le=100, description="Quality score threshold for rejection")
    reject_blur: bool = Field(True, description="Also reject blurred photos")
    reject_low_sharpness: bool = Field(True, description="Also reject low sharpness photos")
    sharpness_threshold: float = Field(40.0, ge=0, le=100, description="Sharpness threshold")


class AutoRejectResponse(BaseModel):
    """Response schema for auto-reject operation."""

    rejected_count: int
    asset_ids: list[str]


class BulkSelectRequest(BaseModel):
    """Request schema for bulk select operation."""

    asset_ids: list[str] = Field(..., min_length=1, description="Asset IDs to select")


class BulkRejectRequest(BaseModel):
    """Request schema for bulk reject operation."""

    asset_ids: list[str] = Field(..., min_length=1, description="Asset IDs to reject")
    reason: Optional[str] = Field(None, max_length=255, description="Rejection reason")


class BulkResetRequest(BaseModel):
    """Request schema for bulk reset operation."""

    asset_ids: list[str] = Field(..., min_length=1, description="Asset IDs to reset")


class BulkActionResponse(BaseModel):
    """Response schema for bulk actions."""

    count: int
    message: str


class ApplySelectionRequest(BaseModel):
    """Request schema for applying culling selection."""

    action: str = Field("create_sub_gallery", description="Action: create_sub_gallery, mark_favorites")
    name: Optional[str] = Field(None, max_length=100, description="Name for sub-gallery")


class ApplySelectionResponse(BaseModel):
    """Response schema for apply selection."""

    success: bool
    message: str
    sub_gallery_id: Optional[str] = None
    count: int


# =============================================================================
# API Endpoints
# =============================================================================


@router.get(
    "/photos",
    response_model=CullingPhotosResponse,
    status_code=status.HTTP_200_OK,
    summary="Get photos for culling workflow",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery not found"},
    },
)
async def get_culling_photos(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    # Filters
    min_overall_score: Annotated[Optional[float], Query(ge=0, le=100)] = None,
    min_sharpness: Annotated[Optional[float], Query(ge=0, le=100)] = None,
    min_exposure: Annotated[Optional[float], Query(ge=0, le=100)] = None,
    max_exposure: Annotated[Optional[float], Query(ge=0, le=100)] = None,
    has_faces: Annotated[Optional[bool], Query()] = None,
    min_faces: Annotated[Optional[int], Query(ge=0)] = None,
    hide_blur: Annotated[bool, Query()] = False,
    show_bokeh: Annotated[bool, Query()] = True,
    exposure_optimal: Annotated[bool, Query()] = False,
    # Pagination & Sorting
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    sort_by: Annotated[str, Query()] = "overall_score",
    sort_order: Annotated[str, Query()] = "desc",
) -> CullingPhotosResponse:
    """Get photos for culling grid with quality scores and filtering.

    Supports smart filtering:
    - Quality score thresholds
    - Sharpness filtering (>0.8 = >80)
    - Exposure optimal range
    - Face detection filtering
    - Blur hiding with bokeh exception
    """
    service = get_culling_workflow_service()

    filters = CullingFilters(
        min_overall_score=min_overall_score,
        min_sharpness=min_sharpness,
        min_exposure=min_exposure,
        max_exposure=max_exposure,
        has_faces=has_faces,
        min_faces=min_faces,
        hide_blur=hide_blur,
        show_bokeh=show_bokeh,
        exposure_optimal=exposure_optimal,
    )

    result = await service.get_culling_photos(
        workspace_id=workspace_id,
        gallery_id=gallery_id,
        filters=filters,
        page=page,
        limit=limit,
        sort_by=sort_by,
        sort_order=sort_order,
    )

    return CullingPhotosResponse(
        photos=[CullingPhotoResponse(**p.to_dict()) for p in result.photos],
        stats=CullingStatsResponse(**result.stats.to_dict()),
        total=result.total,
        page=result.page,
        limit=result.limit,
    )


@router.get(
    "/stats",
    response_model=CullingStatsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get culling workflow statistics",
)
async def get_culling_stats(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> CullingStatsResponse:
    """Get statistics for culling workflow."""
    service = get_culling_workflow_service()

    result = await service.get_culling_photos(
        workspace_id=workspace_id,
        gallery_id=gallery_id,
        page=1,
        limit=1,
    )

    return CullingStatsResponse(**result.stats.to_dict())


@router.post(
    "/auto-reject",
    response_model=AutoRejectResponse,
    status_code=status.HTTP_200_OK,
    summary="Auto-reject low quality photos",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def auto_reject_photos(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: AutoRejectRequest,
) -> AutoRejectResponse:
    """Auto-reject photos below quality threshold.

    This will mark photos as rejected based on:
    - Overall quality score below threshold
    - Optionally, blurred photos (non-artistic)
    - Optionally, low sharpness photos
    """
    service = get_culling_workflow_service()

    result = await service.auto_reject_low_quality(
        workspace_id=workspace_id,
        gallery_id=gallery_id,
        threshold=request.threshold,
        reject_blur=request.reject_blur,
        reject_low_sharpness=request.reject_low_sharpness,
        sharpness_threshold=request.sharpness_threshold,
    )

    return AutoRejectResponse(
        rejected_count=result["rejected_count"],
        asset_ids=result["asset_ids"],
    )


@router.post(
    "/bulk-select",
    response_model=BulkActionResponse,
    status_code=status.HTTP_200_OK,
    summary="Bulk select photos as best shots",
)
async def bulk_select_photos(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: BulkSelectRequest,
) -> BulkActionResponse:
    """Bulk select photos as best shots for final gallery."""
    service = get_culling_workflow_service()

    asset_ids = [UUID(aid) for aid in request.asset_ids]
    result = await service.bulk_select(
        workspace_id=workspace_id,
        gallery_id=gallery_id,
        asset_ids=asset_ids,
    )

    return BulkActionResponse(
        count=result["selected_count"],
        message=f"Selected {result['selected_count']} photos",
    )


@router.post(
    "/bulk-reject",
    response_model=BulkActionResponse,
    status_code=status.HTTP_200_OK,
    summary="Bulk reject photos",
)
async def bulk_reject_photos(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: BulkRejectRequest,
) -> BulkActionResponse:
    """Bulk reject photos from culling selection."""
    service = get_culling_workflow_service()

    asset_ids = [UUID(aid) for aid in request.asset_ids]
    result = await service.bulk_reject(
        workspace_id=workspace_id,
        gallery_id=gallery_id,
        asset_ids=asset_ids,
        reason=request.reason,
    )

    return BulkActionResponse(
        count=result["rejected_count"],
        message=f"Rejected {result['rejected_count']} photos",
    )


@router.post(
    "/bulk-reset",
    response_model=BulkActionResponse,
    status_code=status.HTTP_200_OK,
    summary="Reset selection status for photos",
)
async def bulk_reset_photos(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: BulkResetRequest,
) -> BulkActionResponse:
    """Reset selection/rejection status for photos."""
    service = get_culling_workflow_service()

    asset_ids = [UUID(aid) for aid in request.asset_ids]
    result = await service.bulk_reset(
        workspace_id=workspace_id,
        gallery_id=gallery_id,
        asset_ids=asset_ids,
    )

    return BulkActionResponse(
        count=result["reset_count"],
        message=f"Reset {result['reset_count']} photos",
    )


@router.get(
    "/selection",
    response_model=CullingPhotosResponse,
    status_code=status.HTTP_200_OK,
    summary="Get final selected photos for preview",
)
async def get_final_selection(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> CullingPhotosResponse:
    """Get final selected photos for gallery preview.

    Returns only photos marked as selected in the culling workflow.
    """
    service = get_culling_workflow_service()

    result = await service.get_final_selection(
        workspace_id=workspace_id,
        gallery_id=gallery_id,
        page=page,
        limit=limit,
    )

    return CullingPhotosResponse(
        photos=[CullingPhotoResponse(**p.to_dict()) for p in result.photos],
        stats=CullingStatsResponse(**result.stats.to_dict()),
        total=result.total,
        page=result.page,
        limit=result.limit,
    )


@router.post(
    "/apply",
    response_model=ApplySelectionResponse,
    status_code=status.HTTP_200_OK,
    summary="Apply culling selection to gallery",
)
async def apply_selection(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: ApplySelectionRequest,
) -> ApplySelectionResponse:
    """Apply culling selection to gallery.

    Actions:
    - create_sub_gallery: Create a sub-gallery with selected photos
    - mark_favorites: Mark selected photos as favorites
    """
    service = get_culling_workflow_service()

    result = await service.apply_to_gallery(
        workspace_id=workspace_id,
        gallery_id=gallery_id,
        action=request.action,
        name=request.name,
    )

    return ApplySelectionResponse(
        success=result["success"],
        message=result["message"],
        sub_gallery_id=result.get("sub_gallery_id"),
        count=result["count"],
    )
