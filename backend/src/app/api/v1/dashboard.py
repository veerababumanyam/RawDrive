"""Dashboard API endpoints.

All routes prefixed with /api/v1/workspaces/{workspace_id}/dashboard.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Path, Query, status
from pydantic import BaseModel, Field

from app.api.dependencies.auth import CurrentUserDep, WorkspaceAccessDep
from app.api.schemas import ErrorResponse
from app.api.exceptions import AppError
from app.services.dashboard_service import get_dashboard_service
from app.services.workspace_activity_service import get_workspace_activity_service

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Response Models
# ---------------------------------------------------------------------------


class DashboardStatsResponse(BaseModel):
    """Dashboard statistics response."""
    galleries: int
    photos: int
    clients: int
    views: int


class ActivityActorResponse(BaseModel):
    """Actor information in an activity."""
    type: str
    user_id: Optional[str] = None
    visitor_id: Optional[str] = None
    name: str
    email: Optional[str] = None
    avatar_url: Optional[str] = None


class ActivityTargetResponse(BaseModel):
    """Target entity information in an activity."""
    type: str
    id: str
    name: Optional[str] = None
    thumbnail_url: Optional[str] = None


class ActivityGalleryResponse(BaseModel):
    """Gallery context in an activity."""
    id: str
    name: Optional[str] = None


class ActivityResponse(BaseModel):
    """Single activity response."""
    activity_id: str
    workspace_id: str
    activity_type: str
    actor: ActivityActorResponse
    target: ActivityTargetResponse
    gallery: Optional[ActivityGalleryResponse] = None
    description: Optional[str] = None
    metadata: dict = Field(default_factory=dict)
    count: int = 1
    created_at: str


class ActivityListResponse(BaseModel):
    """List of activities response."""
    data: list[ActivityResponse]
    meta: dict


class ActivitySummaryResponse(BaseModel):
    """Activity summary statistics response."""
    total_activities: int
    by_type: dict[str, int]
    by_actor_type: dict[str, int]
    top_galleries: list[dict]
    period_days: int


@router.get(
    "/stats",
    response_model=DashboardStatsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get dashboard stats",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Workspace not found"},
    },
)
async def get_dashboard_stats(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> DashboardStatsResponse:
    """Get dashboard statistics for a workspace."""
    service = get_dashboard_service()
    try:
        stats = await service.get_stats(workspace_id)
        return DashboardStatsResponse(**stats)
    except Exception as e:
        logger.exception("Failed to get dashboard stats")
        raise AppError(
            message="Failed to get dashboard stats",
            code="INTERNAL_ERROR",
            status_code=500,
        )


# ---------------------------------------------------------------------------
# Activity Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/activities",
    response_model=ActivityListResponse,
    status_code=status.HTTP_200_OK,
    summary="Get recent activities",
    description="""
    Get recent workspace activities for the dashboard activity feed.

    Activities include:
    - Gallery views by visitors
    - Photo downloads
    - Comments added
    - Favorites and selections
    - Upload completions
    - Visitor registrations

    Results are sorted by created_at descending (newest first).
    """,
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Workspace not found"},
    },
)
async def get_dashboard_activities(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    limit: Annotated[int, Query(ge=1, le=100, description="Max activities to return")] = 10,
    activity_type: Annotated[Optional[str], Query(description="Filter by activity type")] = None,
    actor_type: Annotated[Optional[str], Query(description="Filter by actor type (user, visitor, guest)")] = None,
    gallery_id: Annotated[Optional[UUID], Query(description="Filter by gallery")] = None,
) -> ActivityListResponse:
    """Get recent activities for the dashboard."""
    service = get_workspace_activity_service()
    try:
        activities = await service.get_recent_activities(
            workspace_id=workspace_id,
            limit=limit,
            activity_type=activity_type,
            actor_type=actor_type,
            gallery_id=gallery_id,
        )

        return ActivityListResponse(
            data=[ActivityResponse(**a) for a in activities],
            meta={
                "limit": limit,
                "count": len(activities),
                "filters": {
                    "activity_type": activity_type,
                    "actor_type": actor_type,
                    "gallery_id": str(gallery_id) if gallery_id else None,
                },
            },
        )
    except Exception as e:
        logger.exception("Failed to get dashboard activities")
        raise AppError(
            message="Failed to get dashboard activities",
            code="INTERNAL_ERROR",
            status_code=500,
        )


@router.get(
    "/activities/summary",
    response_model=ActivitySummaryResponse,
    status_code=status.HTTP_200_OK,
    summary="Get activity summary",
    description="Get activity statistics summary for the workspace.",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Workspace not found"},
    },
)
async def get_activity_summary(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    days: Annotated[int, Query(ge=1, le=365, description="Number of days to look back")] = 30,
) -> ActivitySummaryResponse:
    """Get activity summary statistics."""
    service = get_workspace_activity_service()
    try:
        summary = await service.get_activity_summary(
            workspace_id=workspace_id,
            days=days,
        )
        return ActivitySummaryResponse(**summary)
    except Exception as e:
        logger.exception("Failed to get activity summary")
        raise AppError(
            message="Failed to get activity summary",
            code="INTERNAL_ERROR",
            status_code=500,
        )
