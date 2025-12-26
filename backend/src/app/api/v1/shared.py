"""Shared Dashboard API endpoints.

Provides workspace-wide aggregation of magic links for the Security & Sharing
Dashboard (/workspace/shared).

Features:
- List all magic links across all galleries
- Aggregate statistics
- Bulk revocation (Kill Switch)
- Export for compliance

All routes are workspace-scoped for multi-tenant isolation.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Path, Query, status
from fastapi.responses import Response

from app.api.dependencies.auth import CurrentUserDep, WorkspaceAccessDep
from app.api.schemas import (
    SharedLinksResponse,
    SharedLinkDetailResponse,
    SharedStatsResponse,
    BulkRevokeRequest,
    BulkRevokeResponse,
    MessageResponse,
    ErrorResponse,
)
from app.api.exceptions import AppError, NotFoundError
from app.services.shared_service import (
    SharedService,
    SharedServiceError,
    LinkNotFoundError,
    BulkOperationError,
    get_shared_service,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/links",
    response_model=SharedLinksResponse,
    status_code=status.HTTP_200_OK,
    summary="List all shared links",
    description="List all magic links across all galleries in the workspace.",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def list_shared_links(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 50,
    offset: Annotated[int, Query(ge=0, description="Pagination offset")] = 0,
    status_filter: Annotated[
        Optional[str],
        Query(alias="status", description="Filter by status (active, expired, revoked, all)"),
    ] = "active",
    gallery_id: Annotated[
        Optional[UUID], Query(description="Filter by gallery ID")
    ] = None,
    search: Annotated[
        Optional[str], Query(max_length=100, description="Search label or gallery title")
    ] = None,
    sort_by: Annotated[
        str, Query(description="Sort column (created_at, access_count, expires_at)")
    ] = "created_at",
    sort_order: Annotated[
        str, Query(description="Sort direction (asc, desc)")
    ] = "desc",
) -> SharedLinksResponse:
    """List all magic links across the workspace.

    Provides aggregated view of all sharing activity for the Security &
    Sharing Dashboard. Supports filtering, searching, and sorting.
    """
    service = get_shared_service()
    try:
        result = await service.list_links(
            workspace_id=workspace_id,
            limit=limit,
            offset=offset,
            status=status_filter,
            gallery_id=gallery_id,
            search=search,
            sort_by=sort_by,
            sort_order=sort_order,
        )
        return SharedLinksResponse(**result)
    except SharedServiceError as e:
        raise AppError(message=e.message, code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to list shared links")
        raise AppError(
            message="Failed to list shared links",
            code="INTERNAL_ERROR",
            status_code=500,
        )


@router.get(
    "/stats",
    response_model=SharedStatsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get sharing statistics",
    description="Get aggregate sharing statistics for the workspace.",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def get_shared_stats(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    days: Annotated[int, Query(ge=1, le=90, description="Days to include")] = 30,
) -> SharedStatsResponse:
    """Get aggregate sharing statistics.

    Returns total counts, access trends, device breakdown, top galleries,
    and geographic distribution of visitors.
    """
    service = get_shared_service()
    try:
        result = await service.get_stats(workspace_id=workspace_id, days=days)
        return SharedStatsResponse(**result)
    except SharedServiceError as e:
        raise AppError(message=e.message, code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to get shared stats")
        raise AppError(
            message="Failed to get statistics",
            code="INTERNAL_ERROR",
            status_code=500,
        )


@router.get(
    "/links/{link_id}",
    response_model=SharedLinkDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Get link details",
    description="Get detailed information for a specific shared link.",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Link not found"},
    },
)
async def get_shared_link_detail(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    link_id: Annotated[UUID, Path(..., description="Link ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> SharedLinkDetailResponse:
    """Get detailed information for a shared link.

    Returns link metadata, gallery context, access policy, and recent
    access log entries.
    """
    service = get_shared_service()
    try:
        result = await service.get_link_detail(
            workspace_id=workspace_id,
            link_id=link_id,
        )
        return SharedLinkDetailResponse(**result)
    except LinkNotFoundError:
        raise NotFoundError("Shared link", str(link_id))
    except SharedServiceError as e:
        raise AppError(message=e.message, code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to get link detail")
        raise AppError(
            message="Failed to get link details",
            code="INTERNAL_ERROR",
            status_code=500,
        )


@router.delete(
    "/links/{link_id}",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Revoke a link",
    description="Revoke a single shared link, making it immediately invalid.",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Link not found"},
    },
)
async def revoke_shared_link(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    link_id: Annotated[UUID, Path(..., description="Link ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> MessageResponse:
    """Revoke a shared link.

    The link will be marked as revoked and will stop working immediately.
    This action cannot be undone.
    """
    service = get_shared_service()
    try:
        await service.revoke_link(
            workspace_id=workspace_id,
            link_id=link_id,
            user_id=current_user.user_id,
        )
        return MessageResponse(message="Link revoked successfully")
    except LinkNotFoundError:
        raise NotFoundError("Shared link", str(link_id))
    except SharedServiceError as e:
        raise AppError(message=e.message, code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to revoke link")
        raise AppError(
            message="Failed to revoke link",
            code="INTERNAL_ERROR",
            status_code=500,
        )


@router.post(
    "/bulk-revoke",
    response_model=BulkRevokeResponse,
    status_code=status.HTTP_200_OK,
    summary="Bulk revoke links (Kill Switch)",
    description="Revoke multiple shared links at once. Max 100 links per request.",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def bulk_revoke_links(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: BulkRevokeRequest,
) -> BulkRevokeResponse:
    """Bulk revoke multiple shared links (Kill Switch).

    Use this endpoint to quickly revoke multiple links when needed for
    security purposes. Links will stop working immediately.

    Returns count of successfully revoked links and any failures.
    """
    service = get_shared_service()
    try:
        result = await service.bulk_revoke(
            workspace_id=workspace_id,
            link_ids=request.link_ids,
            user_id=current_user.user_id,
            reason=request.reason,
        )
        return BulkRevokeResponse(**result)
    except BulkOperationError as e:
        raise AppError(message=e.message, code=e.code, status_code=e.status_code)
    except SharedServiceError as e:
        raise AppError(message=e.message, code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to bulk revoke links")
        raise AppError(
            message="Failed to revoke links",
            code="INTERNAL_ERROR",
            status_code=500,
        )


@router.get(
    "/export",
    status_code=status.HTTP_200_OK,
    summary="Export sharing data",
    description="Export all sharing data for compliance/audit purposes.",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def export_shared_data(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    format: Annotated[str, Query(description="Export format (csv, json)")] = "csv",
    date_from: Annotated[Optional[datetime], Query(description="Start date filter")] = None,
    date_to: Annotated[Optional[datetime], Query(description="End date filter")] = None,
) -> Response:
    """Export sharing data for compliance/audit.

    Downloads all magic link data including creation dates, access counts,
    and access policies. Sensitive data like tokens is never included.
    """
    service = get_shared_service()
    try:
        # Validate format
        if format not in {"csv", "json"}:
            format = "csv"

        data, content_type, filename = await service.export_links(
            workspace_id=workspace_id,
            format=format,
            date_from=date_from,
            date_to=date_to,
        )

        return Response(
            content=data,
            media_type=content_type,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )
    except SharedServiceError as e:
        raise AppError(message=e.message, code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to export sharing data")
        raise AppError(
            message="Failed to export data",
            code="INTERNAL_ERROR",
            status_code=500,
        )
