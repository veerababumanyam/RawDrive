"""Dashboard API endpoints.

All routes prefixed with /api/v1/workspaces/{workspace_id}/dashboard.
"""

from __future__ import annotations

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Path, status
from pydantic import BaseModel

from app.api.dependencies.auth import CurrentUserDep, WorkspaceAccessDep
from app.api.schemas import ErrorResponse
from app.api.exceptions import AppError
from app.services.dashboard_service import get_dashboard_service

logger = logging.getLogger(__name__)

router = APIRouter()


class DashboardStatsResponse(BaseModel):
    """Dashboard statistics response."""
    galleries: int
    photos: int
    clients: int
    views: int


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
