"""Asset Cleanup API endpoints.

All routes prefixed with /api/v1/workspaces/{workspace_id}/cleanup.

Provides endpoints for:
- Viewing cleanup recommendations
- Approving/rejecting recommendations
- Managing cleanup jobs
- Configuring cleanup settings
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Annotated, Any, Optional
from uuid import UUID

from fastapi import APIRouter, Path, Query, status, BackgroundTasks
from pydantic import BaseModel, Field

from app.api.dependencies.auth import CurrentUserDep, WorkspaceAccessDep
from app.api.exceptions import AppError, NotFoundError
from app.services.cleanup_service import get_cleanup_service


logger = logging.getLogger(__name__)

router = APIRouter()


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================


class CleanupRecommendationResponse(BaseModel):
    """Cleanup recommendation response."""

    id: UUID
    workspace_id: UUID
    asset_id: UUID
    recommendation_type: str
    confidence: float
    status: str
    potential_savings_bytes: int
    related_asset_id: Optional[UUID] = None
    details: dict[str, Any] = Field(default_factory=dict)
    reviewed_by_user_id: Optional[UUID] = None
    reviewed_at: Optional[str] = None
    created_at: str
    updated_at: str
    # Asset details from join
    original_object_key: Optional[str] = None
    mime_type: Optional[str] = None
    original_bytes: Optional[int] = None


class CleanupRecommendationsListResponse(BaseModel):
    """List of cleanup recommendations."""

    data: list[CleanupRecommendationResponse]
    total: int
    page: int
    limit: int


class CleanupSummaryResponse(BaseModel):
    """Cleanup summary with storage info."""

    total_recommendations: int
    pending_recommendations: int
    potential_savings_bytes: int
    duplicates_count: int
    similar_faces_count: int
    unused_count: int
    cleanup_recommended: bool
    storage: dict[str, Any]


class CleanupJobResponse(BaseModel):
    """Cleanup job response."""

    id: UUID
    workspace_id: UUID
    status: str
    job_type: str
    total_assets: int
    processed_assets: int
    recommendations_created: int
    potential_savings_bytes: int
    scheduled_at: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    error_message: Optional[str] = None
    initiated_by_user_id: Optional[UUID] = None
    created_at: str
    updated_at: str


class CleanupJobsListResponse(BaseModel):
    """List of cleanup jobs."""

    data: list[CleanupJobResponse]


class CleanupSettingsResponse(BaseModel):
    """Cleanup settings response."""

    workspace_id: UUID
    auto_analysis_enabled: bool
    auto_analysis_interval_days: int
    auto_approve_threshold: Optional[float] = None
    duplicate_confidence_threshold: float
    face_similarity_threshold: float
    unused_days_threshold: int
    include_gallery_assets: bool
    storage_alert_threshold_percent: int
    email_notifications_enabled: bool
    notify_on_high_confidence: bool
    notify_on_storage_critical: bool
    created_at: str
    updated_at: str


class UpdateCleanupSettingsRequest(BaseModel):
    """Request to update cleanup settings."""

    auto_analysis_enabled: Optional[bool] = None
    auto_analysis_interval_days: Optional[int] = Field(None, ge=1, le=365)
    auto_approve_threshold: Optional[float] = Field(None, ge=0.5, le=1.0)
    duplicate_confidence_threshold: Optional[float] = Field(None, ge=0.5, le=1.0)
    face_similarity_threshold: Optional[float] = Field(None, ge=0.5, le=1.0)
    unused_days_threshold: Optional[int] = Field(None, ge=7, le=730)
    include_gallery_assets: Optional[bool] = None
    storage_alert_threshold_percent: Optional[int] = Field(None, ge=50, le=100)
    email_notifications_enabled: Optional[bool] = None
    notify_on_high_confidence: Optional[bool] = None
    notify_on_storage_critical: Optional[bool] = None


class BulkRecommendationActionRequest(BaseModel):
    """Request for bulk recommendation actions."""

    recommendation_ids: list[UUID] = Field(..., min_length=1, max_length=100)


class BulkActionResponse(BaseModel):
    """Response for bulk actions."""

    updated_count: int


class CreateCleanupJobRequest(BaseModel):
    """Request to create a cleanup job."""

    job_type: str = Field(
        "full_scan",
        pattern="^(full_scan|incremental|duplicates_only|faces_only)$",
        description="Type of cleanup analysis to run",
    )


class MessageResponse(BaseModel):
    """Simple message response."""

    message: str


# =============================================================================
# SUMMARY & RECOMMENDATIONS ENDPOINTS
# =============================================================================


@router.get(
    "/summary",
    response_model=CleanupSummaryResponse,
    status_code=status.HTTP_200_OK,
    summary="Get cleanup summary",
)
async def get_cleanup_summary(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> CleanupSummaryResponse:
    """Get cleanup summary including storage usage and pending recommendations."""
    service = get_cleanup_service()
    try:
        result = await service.get_summary(workspace_id)
        return CleanupSummaryResponse(**result)
    except Exception as e:
        logger.exception("Failed to get cleanup summary")
        raise AppError(
            message="Failed to get cleanup summary",
            code="INTERNAL_ERROR",
            status_code=500,
        )


@router.get(
    "/recommendations",
    response_model=CleanupRecommendationsListResponse,
    status_code=status.HTTP_200_OK,
    summary="List cleanup recommendations",
)
async def list_recommendations(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    status_filter: Annotated[
        Optional[str],
        Query(
            alias="status",
            pattern="^(pending|approved|rejected|deleted|auto_approved)$",
            description="Filter by status",
        ),
    ] = None,
    type_filter: Annotated[
        Optional[str],
        Query(
            alias="type",
            pattern="^(duplicate|similar_face|unused|low_quality|old_unused)$",
            description="Filter by recommendation type",
        ),
    ] = None,
    min_confidence: Annotated[
        Optional[float],
        Query(ge=0.0, le=1.0, description="Minimum confidence threshold"),
    ] = None,
    sort_by: Annotated[
        str,
        Query(
            pattern="^(confidence|potential_savings_bytes|created_at)$",
            description="Sort field",
        ),
    ] = "confidence",
    sort_order: Annotated[
        str,
        Query(pattern="^(asc|desc)$", description="Sort order"),
    ] = "desc",
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 50,
) -> CleanupRecommendationsListResponse:
    """List cleanup recommendations for the workspace."""
    service = get_cleanup_service()
    try:
        offset = (page - 1) * limit
        recommendations = await service.get_recommendations(
            workspace_id=workspace_id,
            status=status_filter,
            recommendation_type=type_filter,
            min_confidence=Decimal(str(min_confidence)) if min_confidence else None,
            sort_by=sort_by,
            sort_order=sort_order,
            limit=limit,
            offset=offset,
        )

        # Convert to response models
        data = []
        for rec in recommendations:
            data.append(
                CleanupRecommendationResponse(
                    id=rec["id"],
                    workspace_id=rec["workspace_id"],
                    asset_id=rec["asset_id"],
                    recommendation_type=rec["recommendation_type"],
                    confidence=float(rec["confidence"]),
                    status=rec["status"],
                    potential_savings_bytes=rec["potential_savings_bytes"],
                    related_asset_id=rec.get("related_asset_id"),
                    details=rec.get("details", {}),
                    reviewed_by_user_id=rec.get("reviewed_by_user_id"),
                    reviewed_at=str(rec["reviewed_at"]) if rec.get("reviewed_at") else None,
                    created_at=str(rec["created_at"]),
                    updated_at=str(rec["updated_at"]),
                    original_object_key=rec.get("original_object_key"),
                    mime_type=rec.get("mime_type"),
                    original_bytes=rec.get("original_bytes"),
                )
            )

        return CleanupRecommendationsListResponse(
            data=data,
            total=len(data),  # In production, get actual count from DB
            page=page,
            limit=limit,
        )
    except Exception as e:
        logger.exception("Failed to list cleanup recommendations")
        raise AppError(
            message="Failed to list cleanup recommendations",
            code="INTERNAL_ERROR",
            status_code=500,
        )


@router.post(
    "/recommendations/{recommendation_id}/approve",
    response_model=CleanupRecommendationResponse,
    status_code=status.HTTP_200_OK,
    summary="Approve a cleanup recommendation",
)
async def approve_recommendation(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    recommendation_id: Annotated[UUID, Path(..., description="Recommendation ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> CleanupRecommendationResponse:
    """Approve a cleanup recommendation for deletion."""
    service = get_cleanup_service()
    try:
        result = await service.approve_recommendation(
            workspace_id=workspace_id,
            recommendation_id=recommendation_id,
            user_id=current_user.user_id,
        )
        if not result:
            raise NotFoundError("Cleanup recommendation not found")

        return CleanupRecommendationResponse(
            id=result["id"],
            workspace_id=result["workspace_id"],
            asset_id=result["asset_id"],
            recommendation_type=result["recommendation_type"],
            confidence=float(result["confidence"]),
            status=result["status"],
            potential_savings_bytes=result["potential_savings_bytes"],
            related_asset_id=result.get("related_asset_id"),
            details=result.get("details", {}),
            reviewed_by_user_id=result.get("reviewed_by_user_id"),
            reviewed_at=str(result["reviewed_at"]) if result.get("reviewed_at") else None,
            created_at=str(result["created_at"]),
            updated_at=str(result["updated_at"]),
        )
    except NotFoundError:
        raise
    except Exception as e:
        logger.exception("Failed to approve recommendation")
        raise AppError(
            message="Failed to approve recommendation",
            code="INTERNAL_ERROR",
            status_code=500,
        )


@router.post(
    "/recommendations/{recommendation_id}/reject",
    response_model=CleanupRecommendationResponse,
    status_code=status.HTTP_200_OK,
    summary="Reject a cleanup recommendation",
)
async def reject_recommendation(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    recommendation_id: Annotated[UUID, Path(..., description="Recommendation ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> CleanupRecommendationResponse:
    """Reject a cleanup recommendation (will not be deleted)."""
    service = get_cleanup_service()
    try:
        result = await service.reject_recommendation(
            workspace_id=workspace_id,
            recommendation_id=recommendation_id,
            user_id=current_user.user_id,
        )
        if not result:
            raise NotFoundError("Cleanup recommendation not found")

        return CleanupRecommendationResponse(
            id=result["id"],
            workspace_id=result["workspace_id"],
            asset_id=result["asset_id"],
            recommendation_type=result["recommendation_type"],
            confidence=float(result["confidence"]),
            status=result["status"],
            potential_savings_bytes=result["potential_savings_bytes"],
            related_asset_id=result.get("related_asset_id"),
            details=result.get("details", {}),
            reviewed_by_user_id=result.get("reviewed_by_user_id"),
            reviewed_at=str(result["reviewed_at"]) if result.get("reviewed_at") else None,
            created_at=str(result["created_at"]),
            updated_at=str(result["updated_at"]),
        )
    except NotFoundError:
        raise
    except Exception as e:
        logger.exception("Failed to reject recommendation")
        raise AppError(
            message="Failed to reject recommendation",
            code="INTERNAL_ERROR",
            status_code=500,
        )


@router.post(
    "/recommendations/bulk-approve",
    response_model=BulkActionResponse,
    status_code=status.HTTP_200_OK,
    summary="Bulk approve recommendations",
)
async def bulk_approve_recommendations(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: BulkRecommendationActionRequest,
) -> BulkActionResponse:
    """Bulk approve multiple cleanup recommendations."""
    service = get_cleanup_service()
    try:
        count = await service.bulk_approve(
            workspace_id=workspace_id,
            recommendation_ids=request.recommendation_ids,
            user_id=current_user.user_id,
        )
        return BulkActionResponse(updated_count=count)
    except Exception as e:
        logger.exception("Failed to bulk approve recommendations")
        raise AppError(
            message="Failed to bulk approve recommendations",
            code="INTERNAL_ERROR",
            status_code=500,
        )


@router.post(
    "/recommendations/bulk-reject",
    response_model=BulkActionResponse,
    status_code=status.HTTP_200_OK,
    summary="Bulk reject recommendations",
)
async def bulk_reject_recommendations(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: BulkRecommendationActionRequest,
) -> BulkActionResponse:
    """Bulk reject multiple cleanup recommendations."""
    service = get_cleanup_service()
    try:
        count = await service.bulk_reject(
            workspace_id=workspace_id,
            recommendation_ids=request.recommendation_ids,
            user_id=current_user.user_id,
        )
        return BulkActionResponse(updated_count=count)
    except Exception as e:
        logger.exception("Failed to bulk reject recommendations")
        raise AppError(
            message="Failed to bulk reject recommendations",
            code="INTERNAL_ERROR",
            status_code=500,
        )


# =============================================================================
# JOB ENDPOINTS
# =============================================================================


@router.post(
    "/jobs",
    response_model=CleanupJobResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Start cleanup analysis job",
)
async def create_cleanup_job(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: CreateCleanupJobRequest,
    background_tasks: BackgroundTasks,
) -> CleanupJobResponse:
    """Start a new cleanup analysis job.

    This creates a background job that will scan the workspace for:
    - Duplicate files (exact sha256 match)
    - Similar photos (face embedding comparison)
    - Unused assets (no views/downloads)

    Returns immediately with job status. Use GET /jobs/{job_id} to poll status.
    """
    service = get_cleanup_service()
    try:
        job = await service.create_job(
            workspace_id=workspace_id,
            job_type=request.job_type,
            user_id=current_user.user_id,
        )

        # If job was just created (pending), queue background task
        if job["status"] == "pending":
            background_tasks.add_task(
                run_cleanup_analysis_background,
                workspace_id=workspace_id,
                job_id=job["id"],
                job_type=request.job_type,
            )

        return CleanupJobResponse(
            id=job["id"],
            workspace_id=job["workspace_id"],
            status=job["status"],
            job_type=job["job_type"],
            total_assets=job["total_assets"],
            processed_assets=job["processed_assets"],
            recommendations_created=job["recommendations_created"],
            potential_savings_bytes=job["potential_savings_bytes"],
            scheduled_at=str(job["scheduled_at"]) if job.get("scheduled_at") else None,
            started_at=str(job["started_at"]) if job.get("started_at") else None,
            completed_at=str(job["completed_at"]) if job.get("completed_at") else None,
            error_message=job.get("error_message"),
            initiated_by_user_id=job.get("initiated_by_user_id"),
            created_at=str(job["created_at"]),
            updated_at=str(job["updated_at"]),
        )
    except Exception as e:
        logger.exception("Failed to create cleanup job")
        raise AppError(
            message="Failed to create cleanup job",
            code="INTERNAL_ERROR",
            status_code=500,
        )


@router.get(
    "/jobs",
    response_model=CleanupJobsListResponse,
    status_code=status.HTTP_200_OK,
    summary="List cleanup jobs",
)
async def list_cleanup_jobs(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    status_filter: Annotated[
        Optional[str],
        Query(
            alias="status",
            pattern="^(pending|running|completed|failed|cancelled)$",
            description="Filter by status",
        ),
    ] = None,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 20,
    offset: Annotated[int, Query(ge=0, description="Offset")] = 0,
) -> CleanupJobsListResponse:
    """List cleanup jobs for the workspace."""
    service = get_cleanup_service()
    try:
        jobs = await service.get_jobs(
            workspace_id=workspace_id,
            status=status_filter,
            limit=limit,
            offset=offset,
        )

        data = []
        for job in jobs:
            data.append(
                CleanupJobResponse(
                    id=job["id"],
                    workspace_id=job["workspace_id"],
                    status=job["status"],
                    job_type=job["job_type"],
                    total_assets=job["total_assets"],
                    processed_assets=job["processed_assets"],
                    recommendations_created=job["recommendations_created"],
                    potential_savings_bytes=job["potential_savings_bytes"],
                    scheduled_at=str(job["scheduled_at"]) if job.get("scheduled_at") else None,
                    started_at=str(job["started_at"]) if job.get("started_at") else None,
                    completed_at=str(job["completed_at"]) if job.get("completed_at") else None,
                    error_message=job.get("error_message"),
                    initiated_by_user_id=job.get("initiated_by_user_id"),
                    created_at=str(job["created_at"]),
                    updated_at=str(job["updated_at"]),
                )
            )

        return CleanupJobsListResponse(data=data)
    except Exception as e:
        logger.exception("Failed to list cleanup jobs")
        raise AppError(
            message="Failed to list cleanup jobs",
            code="INTERNAL_ERROR",
            status_code=500,
        )


@router.get(
    "/jobs/{job_id}",
    response_model=CleanupJobResponse,
    status_code=status.HTTP_200_OK,
    summary="Get cleanup job status",
)
async def get_cleanup_job(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    job_id: Annotated[UUID, Path(..., description="Job ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> CleanupJobResponse:
    """Get status of a cleanup analysis job."""
    service = get_cleanup_service()
    try:
        job = await service.get_job(workspace_id, job_id)
        if not job:
            raise NotFoundError("Cleanup job not found")

        return CleanupJobResponse(
            id=job["id"],
            workspace_id=job["workspace_id"],
            status=job["status"],
            job_type=job["job_type"],
            total_assets=job["total_assets"],
            processed_assets=job["processed_assets"],
            recommendations_created=job["recommendations_created"],
            potential_savings_bytes=job["potential_savings_bytes"],
            scheduled_at=str(job["scheduled_at"]) if job.get("scheduled_at") else None,
            started_at=str(job["started_at"]) if job.get("started_at") else None,
            completed_at=str(job["completed_at"]) if job.get("completed_at") else None,
            error_message=job.get("error_message"),
            initiated_by_user_id=job.get("initiated_by_user_id"),
            created_at=str(job["created_at"]),
            updated_at=str(job["updated_at"]),
        )
    except NotFoundError:
        raise
    except Exception as e:
        logger.exception("Failed to get cleanup job")
        raise AppError(
            message="Failed to get cleanup job",
            code="INTERNAL_ERROR",
            status_code=500,
        )


@router.post(
    "/jobs/{job_id}/cancel",
    response_model=CleanupJobResponse,
    status_code=status.HTTP_200_OK,
    summary="Cancel cleanup job",
)
async def cancel_cleanup_job(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    job_id: Annotated[UUID, Path(..., description="Job ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> CleanupJobResponse:
    """Cancel a running or pending cleanup job."""
    service = get_cleanup_service()
    try:
        job = await service.cancel_job(workspace_id, job_id)
        if not job:
            raise NotFoundError("Cleanup job not found")

        return CleanupJobResponse(
            id=job["id"],
            workspace_id=job["workspace_id"],
            status=job["status"],
            job_type=job["job_type"],
            total_assets=job["total_assets"],
            processed_assets=job["processed_assets"],
            recommendations_created=job["recommendations_created"],
            potential_savings_bytes=job["potential_savings_bytes"],
            scheduled_at=str(job["scheduled_at"]) if job.get("scheduled_at") else None,
            started_at=str(job["started_at"]) if job.get("started_at") else None,
            completed_at=str(job["completed_at"]) if job.get("completed_at") else None,
            error_message=job.get("error_message"),
            initiated_by_user_id=job.get("initiated_by_user_id"),
            created_at=str(job["created_at"]),
            updated_at=str(job["updated_at"]),
        )
    except NotFoundError:
        raise
    except Exception as e:
        logger.exception("Failed to cancel cleanup job")
        raise AppError(
            message="Failed to cancel cleanup job",
            code="INTERNAL_ERROR",
            status_code=500,
        )


# =============================================================================
# SETTINGS ENDPOINTS
# =============================================================================


@router.get(
    "/settings",
    response_model=CleanupSettingsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get cleanup settings",
)
async def get_cleanup_settings(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> CleanupSettingsResponse:
    """Get cleanup settings for the workspace."""
    service = get_cleanup_service()
    try:
        settings = await service.get_settings(workspace_id)
        return CleanupSettingsResponse(
            workspace_id=settings["workspace_id"],
            auto_analysis_enabled=settings["auto_analysis_enabled"],
            auto_analysis_interval_days=settings["auto_analysis_interval_days"],
            auto_approve_threshold=float(settings["auto_approve_threshold"]) if settings.get("auto_approve_threshold") else None,
            duplicate_confidence_threshold=float(settings["duplicate_confidence_threshold"]),
            face_similarity_threshold=float(settings["face_similarity_threshold"]),
            unused_days_threshold=settings["unused_days_threshold"],
            include_gallery_assets=settings["include_gallery_assets"],
            storage_alert_threshold_percent=settings["storage_alert_threshold_percent"],
            email_notifications_enabled=settings["email_notifications_enabled"],
            notify_on_high_confidence=settings["notify_on_high_confidence"],
            notify_on_storage_critical=settings["notify_on_storage_critical"],
            created_at=str(settings["created_at"]),
            updated_at=str(settings["updated_at"]),
        )
    except Exception as e:
        logger.exception("Failed to get cleanup settings")
        raise AppError(
            message="Failed to get cleanup settings",
            code="INTERNAL_ERROR",
            status_code=500,
        )


@router.patch(
    "/settings",
    response_model=CleanupSettingsResponse,
    status_code=status.HTTP_200_OK,
    summary="Update cleanup settings",
)
async def update_cleanup_settings(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: UpdateCleanupSettingsRequest,
) -> CleanupSettingsResponse:
    """Update cleanup settings for the workspace."""
    service = get_cleanup_service()
    try:
        # Filter out None values
        updates = {k: v for k, v in request.model_dump().items() if v is not None}

        settings = await service.update_settings(workspace_id, **updates)
        return CleanupSettingsResponse(
            workspace_id=settings["workspace_id"],
            auto_analysis_enabled=settings["auto_analysis_enabled"],
            auto_analysis_interval_days=settings["auto_analysis_interval_days"],
            auto_approve_threshold=float(settings["auto_approve_threshold"]) if settings.get("auto_approve_threshold") else None,
            duplicate_confidence_threshold=float(settings["duplicate_confidence_threshold"]),
            face_similarity_threshold=float(settings["face_similarity_threshold"]),
            unused_days_threshold=settings["unused_days_threshold"],
            include_gallery_assets=settings["include_gallery_assets"],
            storage_alert_threshold_percent=settings["storage_alert_threshold_percent"],
            email_notifications_enabled=settings["email_notifications_enabled"],
            notify_on_high_confidence=settings["notify_on_high_confidence"],
            notify_on_storage_critical=settings["notify_on_storage_critical"],
            created_at=str(settings["created_at"]),
            updated_at=str(settings["updated_at"]),
        )
    except Exception as e:
        logger.exception("Failed to update cleanup settings")
        raise AppError(
            message="Failed to update cleanup settings",
            code="INTERNAL_ERROR",
            status_code=500,
        )


# =============================================================================
# BACKGROUND TASK HELPER
# =============================================================================


async def run_cleanup_analysis_background(
    workspace_id: UUID,
    job_id: UUID,
    job_type: str,
) -> None:
    """Run cleanup analysis as a background task.

    This is a simple in-process background task.
    For production, use Celery for proper distributed task execution.
    """
    try:
        service = get_cleanup_service()
        await service.run_cleanup_analysis(
            workspace_id=workspace_id,
            job_id=job_id,
            job_type=job_type,
        )
    except Exception as e:
        logger.exception(
            "Background cleanup analysis failed",
            extra={
                "workspace_id": str(workspace_id),
                "job_id": str(job_id),
                "error": str(e),
            },
        )
