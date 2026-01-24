"""Face Rate Limits API endpoints.

API endpoints for managing face operation rate limits.

All routes prefixed with /api/v1/workspaces/{workspace_id}/face-rate-limits.
Implements Requirements: SEC-001 (Dedicated Face Rate Limits)

Feature: Face Detection Audit Remediation (002-face-audit-remediation)
"""

from __future__ import annotations

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.api.dependencies.auth import CurrentUserDep
from app.repositories.face_rate_limit_repository import (
    FaceRateLimitConfig,
    FaceRateLimitConfigUpdate,
    FaceRateLimitUsage,
    get_face_rate_limit_repository,
    FaceRateLimitRepository,
    DEFAULT_FACE_SEARCH_RPM,
    DEFAULT_FACE_DETECT_DAILY_QUOTA,
    DEFAULT_BULK_OPERATIONS_RPM,
)
from app.services.rbac_service import RBACService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/workspaces/{workspace_id}/face-rate-limits",
    tags=["face-rate-limits"],
)


# =============================================================================
# DEPENDENCIES
# =============================================================================


def _get_rate_limit_repo() -> FaceRateLimitRepository:
    return get_face_rate_limit_repository()


def _get_rbac_service() -> RBACService:
    return RBACService()


RateLimitRepoDep = Annotated[FaceRateLimitRepository, Depends(_get_rate_limit_repo)]
RBACServiceDep = Annotated[RBACService, Depends(_get_rbac_service)]


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================


class RateLimitConfigResponse(BaseModel):
    """Response model for rate limit configuration."""

    workspace_id: UUID
    face_search_rpm: int = Field(description="Face search requests per minute")
    face_detect_daily_quota: int = Field(description="Face detection daily quota")
    bulk_operations_rpm: int = Field(description="Bulk operations requests per minute")
    custom_limits_enabled: bool = Field(description="Whether custom limits are active")
    created_at: str | None = None
    updated_at: str | None = None


class RateLimitConfigUpdateRequest(BaseModel):
    """Request model for updating rate limit configuration."""

    face_search_rpm: int | None = Field(
        None,
        description="Face search requests per minute (10-100)",
        ge=10,
        le=100,
    )
    face_detect_daily_quota: int | None = Field(
        None,
        description="Face detection daily quota (100-10000)",
        ge=100,
        le=10000,
    )
    bulk_operations_rpm: int | None = Field(
        None,
        description="Bulk operations requests per minute (10-100)",
        ge=10,
        le=100,
    )


class RateLimitUsageResponse(BaseModel):
    """Response model for rate limit usage."""

    workspace_id: UUID
    face_search_count: int = Field(description="Face searches in current minute")
    face_detect_count: int = Field(description="Face detections today")
    bulk_operations_count: int = Field(description="Bulk operations in current minute")
    face_search_remaining: int = Field(description="Face searches remaining this minute")
    face_detect_remaining: int = Field(description="Face detections remaining today")
    bulk_operations_remaining: int = Field(description="Bulk ops remaining this minute")
    quota_reset_at: str = Field(description="When daily quota resets (UTC)")


class DetectionQuotaResponse(BaseModel):
    """Response model for detection quota status."""

    workspace_id: UUID
    daily_quota: int
    used_today: int
    remaining: int
    quota_reset_at: str
    is_quota_exceeded: bool
    percentage_used: float


class ErrorResponse(BaseModel):
    """Standard error response."""

    error: str
    message: str
    details: dict | None = None


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================


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
    permission = await rbac_service.check_permission(
        user_id=user_id,
        workspace_id=workspace_id,
        required_permissions="settings:write",
    )

    if not permission.allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Missing permissions: {', '.join(permission.missing_permissions)}"
                   if permission.missing_permissions
                   else "Admin or owner role required to manage rate limits",
        )


async def _check_workspace_member(
    user_id: UUID,
    workspace_id: UUID,
    rbac_service: RBACService,
) -> None:
    """Check if user is a member of the workspace.

    Args:
        user_id: Current user ID
        workspace_id: Target workspace ID
        rbac_service: RBAC service instance

    Raises:
        HTTPException: If user is not a workspace member
    """
    permission = await rbac_service.check_permission(
        user_id=user_id,
        workspace_id=workspace_id,
        required_permissions="settings:read",
    )

    if not permission.allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied to workspace",
        )


# =============================================================================
# API ENDPOINTS
# =============================================================================


@router.get(
    "",
    response_model=RateLimitConfigResponse,
    summary="Get rate limit configuration",
    description="Get face operation rate limit configuration for the workspace.",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def get_rate_limit_config(
    workspace_id: UUID,
    current_user: CurrentUserDep,
    rate_limit_repo: RateLimitRepoDep,
    rbac_service: RBACServiceDep,
) -> RateLimitConfigResponse:
    """Get rate limit configuration for a workspace.

    Returns the current rate limit settings including defaults if not customized.
    """
    await _check_workspace_admin(current_user.user_id, workspace_id, rbac_service)

    config = await rate_limit_repo.get_by_workspace(workspace_id)
    limits = await rate_limit_repo.get_effective_limits(workspace_id)

    return RateLimitConfigResponse(
        workspace_id=workspace_id,
        face_search_rpm=limits.face_search_rpm,
        face_detect_daily_quota=limits.face_detect_daily_quota,
        bulk_operations_rpm=limits.bulk_operations_rpm,
        custom_limits_enabled=config is not None,
        created_at=config.created_at.isoformat() if config and config.created_at else None,
        updated_at=config.updated_at.isoformat() if config and config.updated_at else None,
    )


@router.patch(
    "",
    response_model=RateLimitConfigResponse,
    summary="Update rate limit configuration",
    description="Update face operation rate limit configuration for the workspace.",
    responses={
        400: {"model": ErrorResponse, "description": "Invalid request"},
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def update_rate_limit_config(
    workspace_id: UUID,
    request_body: RateLimitConfigUpdateRequest,
    current_user: CurrentUserDep,
    rate_limit_repo: RateLimitRepoDep,
    rbac_service: RBACServiceDep,
) -> RateLimitConfigResponse:
    """Update rate limit configuration for a workspace.

    Updates only the fields provided in the request body.
    """
    await _check_workspace_admin(current_user.user_id, workspace_id, rbac_service)

    # Build update model
    update_data = FaceRateLimitConfigUpdate(
        face_search_rpm=request_body.face_search_rpm,
        face_detect_daily_quota=request_body.face_detect_daily_quota,
        bulk_operations_rpm=request_body.bulk_operations_rpm,
    )

    try:
        config = await rate_limit_repo.update(workspace_id, update_data)

        logger.info(
            "Rate limit config updated",
            extra={
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
                "updates": request_body.model_dump(exclude_none=True),
            },
        )

        return RateLimitConfigResponse(
            workspace_id=workspace_id,
            face_search_rpm=config.face_search_rpm,
            face_detect_daily_quota=config.face_detect_daily_quota,
            bulk_operations_rpm=config.bulk_operations_rpm,
            custom_limits_enabled=True,
            created_at=config.created_at.isoformat() if config.created_at else None,
            updated_at=config.updated_at.isoformat() if config.updated_at else None,
        )

    except Exception as e:
        logger.error(
            "Failed to update rate limit config",
            extra={
                "workspace_id": str(workspace_id),
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update rate limit configuration",
        )


@router.get(
    "/usage",
    response_model=RateLimitUsageResponse,
    summary="Get rate limit usage",
    description="Get current rate limit usage for the workspace.",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def get_rate_limit_usage(
    workspace_id: UUID,
    current_user: CurrentUserDep,
    rate_limit_repo: RateLimitRepoDep,
    rbac_service: RBACServiceDep,
) -> RateLimitUsageResponse:
    """Get current rate limit usage for a workspace.

    Returns current usage counts and remaining allowances.
    """
    await _check_workspace_member(current_user.user_id, workspace_id, rbac_service)

    usage = await rate_limit_repo.get_usage(workspace_id)
    limits = await rate_limit_repo.get_effective_limits(workspace_id)

    return RateLimitUsageResponse(
        workspace_id=workspace_id,
        face_search_count=usage.face_search_count,
        face_detect_count=usage.face_detect_count,
        bulk_operations_count=usage.bulk_operations_count,
        face_search_remaining=max(0, limits.face_search_rpm - usage.face_search_count),
        face_detect_remaining=max(0, limits.face_detect_daily_quota - usage.face_detect_count),
        bulk_operations_remaining=max(0, limits.bulk_operations_rpm - usage.bulk_operations_count),
        quota_reset_at=usage.quota_reset_at.isoformat() if usage.quota_reset_at else "",
    )


@router.get(
    "/detection-quota",
    response_model=DetectionQuotaResponse,
    summary="Get detection quota",
    description="Get face detection daily quota status for the workspace.",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def get_detection_quota(
    workspace_id: UUID,
    current_user: CurrentUserDep,
    rate_limit_repo: RateLimitRepoDep,
    rbac_service: RBACServiceDep,
) -> DetectionQuotaResponse:
    """Get face detection quota status for a workspace.

    Returns daily quota, current usage, and remaining allowance.
    """
    await _check_workspace_member(current_user.user_id, workspace_id, rbac_service)

    usage = await rate_limit_repo.get_usage(workspace_id)
    limits = await rate_limit_repo.get_effective_limits(workspace_id)

    remaining = max(0, limits.face_detect_daily_quota - usage.face_detect_count)
    percentage_used = (
        (usage.face_detect_count / limits.face_detect_daily_quota * 100)
        if limits.face_detect_daily_quota > 0
        else 0.0
    )

    return DetectionQuotaResponse(
        workspace_id=workspace_id,
        daily_quota=limits.face_detect_daily_quota,
        used_today=usage.face_detect_count,
        remaining=remaining,
        quota_reset_at=usage.quota_reset_at.isoformat() if usage.quota_reset_at else "",
        is_quota_exceeded=remaining == 0,
        percentage_used=round(percentage_used, 2),
    )


@router.delete(
    "",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Reset to default limits",
    description="Reset rate limits to platform defaults.",
    response_model=None,
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def reset_rate_limits(
    workspace_id: UUID,
    current_user: CurrentUserDep,
    rate_limit_repo: RateLimitRepoDep,
    rbac_service: RBACServiceDep,
):
    """Reset rate limits to platform defaults.

    Removes custom rate limit configuration, reverting to defaults.
    """
    await _check_workspace_admin(current_user.user_id, workspace_id, rbac_service)

    await rate_limit_repo.delete(workspace_id)

    logger.info(
        "Rate limits reset to defaults",
        extra={
            "workspace_id": str(workspace_id),
            "user_id": str(current_user.user_id),
        },
    )
