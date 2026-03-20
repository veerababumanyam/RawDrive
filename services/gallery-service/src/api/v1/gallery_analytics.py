"""
Gallery Analytics API Endpoints (Authenticated).

Provides analytics data for gallery owners to view performance metrics.
All queries scoped by workspace_id extracted from JWT.
"""

from fastapi import APIRouter, Depends, Query, Request
from typing import Dict, Any
from uuid import UUID

from src.middleware.auth import get_current_user, get_workspace_id
from src.schemas.analytics import GalleryAnalyticsResponse
from src.services.analytics_service import GalleryAnalyticsService
from src.api.v1.errors import (
    raise_http_exception,
    ErrorCode,
    ErrorMessage,
    get_request_id,
)
from src.database import fetchrow
import src.database as database
from src.cache.redis_client import redis_client
from src.log_config import get_logger

logger = get_logger(__name__)

router = APIRouter()


def _get_analytics_service() -> GalleryAnalyticsService:
    """Get analytics service instance."""
    return GalleryAnalyticsService(database, redis_client)


@router.get(
    "/{gallery_id}/analytics",
    response_model=GalleryAnalyticsResponse,
    summary="Get gallery analytics",
    description="Returns full analytics breakdown for a gallery owned by the authenticated user's workspace.",
)
async def get_gallery_analytics(
    request: Request,
    gallery_id: str,
    period: str = Query(
        default="30d",
        pattern="^(7d|30d|90d|all)$",
        description="Analytics period: 7d, 30d, 90d, or all",
    ),
    current_user: Dict[str, Any] = Depends(get_current_user),
    workspace_id: str = Depends(get_workspace_id),
):
    """
    Get analytics for a gallery.

    Requires authentication. Returns views, unique visitors, time spent,
    device/geo breakdown, and download summary.

    The gallery must belong to the authenticated user's workspace.
    """
    request_id = get_request_id(request)

    try:
        gallery_uuid = UUID(gallery_id)
        workspace_uuid = UUID(workspace_id)
    except ValueError:
        raise_http_exception(
            ErrorCode.INVALID_FORMAT,
            ErrorMessage.INVALID_FORMAT,
            details={"field": "gallery_id or workspace_id"},
            request_id=request_id,
        )

    # Verify gallery belongs to this workspace
    gallery = await fetchrow(
        """
        SELECT gallery_id, workspace_id
        FROM galleries
        WHERE gallery_id = $1 AND workspace_id = $2 AND deleted = FALSE
        """,
        gallery_uuid,
        workspace_uuid,
    )

    if not gallery:
        raise_http_exception(
            ErrorCode.GALLERY_NOT_FOUND,
            ErrorMessage.GALLERY_NOT_FOUND,
            details={"gallery_id": gallery_id},
            request_id=request_id,
        )

    service = _get_analytics_service()
    response = await service.get_analytics(
        gallery_id=gallery_uuid,
        workspace_id=workspace_uuid,
        period=period,
    )

    return response
