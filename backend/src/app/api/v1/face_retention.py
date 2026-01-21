"""Face Retention API endpoints.

API endpoints for managing face embedding retention jobs.

All routes prefixed with /api/v1/workspaces/{workspace_id}/face-retention.
Implements Requirements: COM-002 (Face Data Retention Policy)

Feature: Face Detection Audit Remediation (002-face-audit-remediation)
"""

from __future__ import annotations

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.api.dependencies.auth import CurrentUserDep
from app.models.face_embedding_retention_job import (
    FaceEmbeddingRetentionJob,
    FaceEmbeddingRetentionJobSummary,
    RetentionJobProgress,
    RetentionJobStatus,
    RetentionJobType,
    RetentionStats,
)
from app.services.face_retention_service import (
    FaceRetentionService,
    get_face_retention_service,
)
from app.services.rbac_service import RBACService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/workspaces/{workspace_id}/face-retention",
    tags=["face-retention"],
)


# =============================================================================
# DEPENDENCIES
# =============================================================================


def _get_retention_service() -> FaceRetentionService:
    return get_face_retention_service()


def _get_rbac_service() -> RBACService:
    return RBACService()


RetentionServiceDep = Annotated[FaceRetentionService, Depends(_get_retention_service)]
RBACServiceDep = Annotated[RBACService, Depends(_get_rbac_service)]


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================


class ManualCleanupRequest(BaseModel):
    """Request model for manual cleanup job."""

    reason: str | None = Field(
        None,
        description="Reason for manual cleanup",
        max_length=500,
    )
    retention_days: int | None = Field(
        None,
        description="Override retention days (default uses workspace setting)",
        ge=1,
        le=365,
    )


class GDPRDeletionRequest(BaseModel):
    """Request model for GDPR deletion job."""

    reason: str = Field(
        ...,
        description="GDPR deletion reason (required for compliance)",
        min_length=10,
        max_length=1000,
    )


class JobResponse(BaseModel):
    """Response model for a retention job."""

    id: UUID
    workspace_id: UUID | None
    job_type: RetentionJobType
    status: RetentionJobStatus
    retention_days: int | None
    total_embeddings: int
    deleted_embeddings: int
    progress_percent: float
    created_at: str
    started_at: str | None
    completed_at: str | None


class JobProgressResponse(BaseModel):
    """Response model for job progress."""

    job_id: UUID
    status: RetentionJobStatus
    total_embeddings: int
    processed_embeddings: int
    deleted_embeddings: int
    skipped_embeddings: int
    progress_percent: float
    estimated_remaining_seconds: int | None


class RetentionStatsResponse(BaseModel):
    """Response model for retention statistics."""

    workspace_id: UUID
    total_embeddings: int
    active_embeddings: int
    expired_embeddings: int
    pending_deletion: int
    deleted_last_30_days: int
    oldest_embedding_age_days: int | None
    retention_policy_days: int


class JobListResponse(BaseModel):
    """Response model for job list."""

    jobs: list[FaceEmbeddingRetentionJobSummary]
    total: int


class ErrorResponse(BaseModel):
    """Standard error response."""

    error: str
    message: str
    details: dict | None = None


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================


def _job_to_response(job: FaceEmbeddingRetentionJob) -> JobResponse:
    """Convert domain model to response model."""
    return JobResponse(
        id=job.id,
        workspace_id=job.workspace_id,
        job_type=job.job_type,
        status=job.status,
        retention_days=job.retention_days,
        total_embeddings=job.total_embeddings,
        deleted_embeddings=job.deleted_embeddings,
        progress_percent=job.progress_percent,
        created_at=job.created_at.isoformat(),
        started_at=job.started_at.isoformat() if job.started_at else None,
        completed_at=job.completed_at.isoformat() if job.completed_at else None,
    )


async def _check_workspace_admin(
    user_id: UUID,
    workspace_id: UUID,
    rbac_service: RBACService,
) -> None:
    """Check if user has admin access to workspace.

    Args:
        user_id: Current user ID
        workspace_id: Target workspace ID
        rbac_service: RBAC service instance

    Raises:
        HTTPException: If user lacks admin access
    """
    has_access = await rbac_service.check_workspace_membership(user_id, workspace_id)
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to workspace",
        )

    is_admin = await rbac_service.user_has_role(
        user_id, workspace_id, ["owner", "admin"]
    )
    if not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin or owner role required to manage face retention",
        )


# =============================================================================
# API ENDPOINTS
# =============================================================================


@router.get(
    "/stats",
    response_model=RetentionStatsResponse,
    summary="Get retention statistics",
    description="Get face embedding retention statistics for the workspace.",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def get_retention_stats(
    workspace_id: UUID,
    current_user: CurrentUserDep,
    retention_service: RetentionServiceDep,
    rbac_service: RBACServiceDep,
) -> RetentionStatsResponse:
    """Get retention statistics for a workspace.

    Returns counts of embeddings by status and retention policy info.
    """
    await _check_workspace_admin(current_user.user_id, workspace_id, rbac_service)

    stats = await retention_service.get_retention_stats(workspace_id)

    return RetentionStatsResponse(
        workspace_id=stats.workspace_id,
        total_embeddings=stats.total_embeddings,
        active_embeddings=stats.active_embeddings,
        expired_embeddings=stats.expired_embeddings,
        pending_deletion=stats.pending_deletion,
        deleted_last_30_days=stats.deleted_last_30_days,
        oldest_embedding_age_days=stats.oldest_embedding_age_days,
        retention_policy_days=stats.retention_policy_days,
    )


@router.get(
    "/jobs",
    response_model=JobListResponse,
    summary="List retention jobs",
    description="List face retention jobs for the workspace.",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def list_retention_jobs(
    workspace_id: UUID,
    current_user: CurrentUserDep,
    retention_service: RetentionServiceDep,
    rbac_service: RBACServiceDep,
    limit: int = 20,
) -> JobListResponse:
    """List retention jobs for a workspace.

    Returns paginated list of jobs ordered by creation date (newest first).
    """
    await _check_workspace_admin(current_user.user_id, workspace_id, rbac_service)

    jobs = await retention_service.get_workspace_jobs(workspace_id, limit)

    return JobListResponse(
        jobs=jobs,
        total=len(jobs),
    )


@router.get(
    "/jobs/{job_id}",
    response_model=JobProgressResponse,
    summary="Get job progress",
    description="Get detailed progress for a retention job.",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Job not found"},
    },
)
async def get_job_progress(
    workspace_id: UUID,
    job_id: UUID,
    current_user: CurrentUserDep,
    retention_service: RetentionServiceDep,
    rbac_service: RBACServiceDep,
) -> JobProgressResponse:
    """Get progress of a retention job.

    Returns detailed progress including estimated remaining time.
    """
    await _check_workspace_admin(current_user.user_id, workspace_id, rbac_service)

    progress = await retention_service.get_job_progress(job_id)
    if not progress:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )

    return JobProgressResponse(
        job_id=progress.job_id,
        status=progress.status,
        total_embeddings=progress.total_embeddings,
        processed_embeddings=progress.processed_embeddings,
        deleted_embeddings=progress.deleted_embeddings,
        skipped_embeddings=progress.skipped_embeddings,
        progress_percent=progress.progress_percent,
        estimated_remaining_seconds=progress.estimated_remaining_seconds,
    )


@router.post(
    "/jobs/manual-cleanup",
    response_model=JobResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create manual cleanup job",
    description="Create a manual cleanup job to delete expired embeddings.",
    responses={
        400: {"model": ErrorResponse, "description": "Invalid request"},
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def create_manual_cleanup_job(
    workspace_id: UUID,
    request_body: ManualCleanupRequest,
    current_user: CurrentUserDep,
    retention_service: RetentionServiceDep,
    rbac_service: RBACServiceDep,
) -> JobResponse:
    """Create a manual cleanup job.

    Deletes embeddings older than the retention period.
    Job runs asynchronously in the background.
    """
    await _check_workspace_admin(current_user.user_id, workspace_id, rbac_service)

    try:
        job = await retention_service.create_manual_cleanup_job(
            workspace_id=workspace_id,
            triggered_by=current_user.user_id,
            reason=request_body.reason,
            retention_days=request_body.retention_days,
        )

        logger.info(
            "Manual cleanup job created",
            extra={
                "job_id": str(job.id),
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
            },
        )

        return _job_to_response(job)

    except Exception as e:
        logger.error(
            "Failed to create manual cleanup job",
            extra={
                "workspace_id": str(workspace_id),
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create cleanup job. Please try again.",
        )


@router.post(
    "/jobs/gdpr-deletion",
    response_model=JobResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create GDPR deletion job",
    description="Create a GDPR right-to-erasure deletion job.",
    responses={
        400: {"model": ErrorResponse, "description": "Invalid request"},
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def create_gdpr_deletion_job(
    workspace_id: UUID,
    request_body: GDPRDeletionRequest,
    current_user: CurrentUserDep,
    retention_service: RetentionServiceDep,
    rbac_service: RBACServiceDep,
) -> JobResponse:
    """Create a GDPR deletion job.

    Deletes ALL face embeddings for the workspace.
    This implements GDPR Article 17 (Right to Erasure).
    Job runs asynchronously in the background.
    """
    await _check_workspace_admin(current_user.user_id, workspace_id, rbac_service)

    try:
        job = await retention_service.create_gdpr_deletion_job(
            workspace_id=workspace_id,
            triggered_by=current_user.user_id,
            reason=request_body.reason,
        )

        logger.info(
            "GDPR deletion job created",
            extra={
                "job_id": str(job.id),
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
                "reason": request_body.reason,
            },
        )

        return _job_to_response(job)

    except Exception as e:
        logger.error(
            "Failed to create GDPR deletion job",
            extra={
                "workspace_id": str(workspace_id),
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create deletion job. Please try again.",
        )


@router.post(
    "/jobs/{job_id}/cancel",
    response_model=JobResponse,
    summary="Cancel retention job",
    description="Cancel a pending or running retention job.",
    responses={
        400: {"model": ErrorResponse, "description": "Job cannot be cancelled"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Job not found"},
    },
)
async def cancel_retention_job(
    workspace_id: UUID,
    job_id: UUID,
    current_user: CurrentUserDep,
    retention_service: RetentionServiceDep,
    rbac_service: RBACServiceDep,
) -> JobResponse:
    """Cancel a retention job.

    Can only cancel jobs in PENDING or RUNNING state.
    Already completed or failed jobs cannot be cancelled.
    """
    await _check_workspace_admin(current_user.user_id, workspace_id, rbac_service)

    job = await retention_service.cancel_job(job_id, current_user.user_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )

    if job.status not in (RetentionJobStatus.CANCELLED, RetentionJobStatus.PENDING, RetentionJobStatus.RUNNING):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Job cannot be cancelled in its current state",
        )

    logger.info(
        "Retention job cancelled",
        extra={
            "job_id": str(job_id),
            "workspace_id": str(workspace_id),
            "user_id": str(current_user.user_id),
        },
    )

    return _job_to_response(job)
