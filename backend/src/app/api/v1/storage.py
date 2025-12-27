"""Storage API endpoints.

All routes prefixed with /api/v1/workspaces/{workspace_id}/storage.
Implements Requirements: 9.1, 9.5
"""

from __future__ import annotations

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.api.dependencies import WorkspaceAccessDep
from app.api.schemas import (
    StorageUsageResponse,
    StorageBreakdownResponse,
    StorageBreakdownItem,
)
from app.services.storage_service import (
    StorageService,
    get_storage_service,
    format_bytes,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/workspaces/{workspace_id}/storage",
    tags=["storage"],
)


def _get_storage_service() -> StorageService:
    return get_storage_service()


StorageServiceDep = Annotated[StorageService, Depends(_get_storage_service)]


@router.get(
    "/usage",
    response_model=StorageUsageResponse,
    summary="Get storage usage",
    description="Get current storage usage and limits for the workspace.",
)
async def get_storage_usage(
    workspace_access: WorkspaceAccessDep,
    refresh: bool = Query(False, description="Force refresh from database"),
    storage_service: StorageServiceDep = None,
) -> StorageUsageResponse:
    """Get workspace storage usage.

    Returns current storage used, limit based on plan, and usage percentage.
    Results are cached for 5 minutes for performance.
    """
    _, workspace_id = workspace_access
    usage = await storage_service.get_storage_usage(
        workspace_id=workspace_id,
        force_refresh=refresh,
    )

    return StorageUsageResponse(
        workspace_id=usage.workspace_id,
        storage_used_bytes=usage.storage_used_bytes,
        storage_limit_bytes=usage.storage_limit_bytes,
        storage_used_formatted=format_bytes(usage.storage_used_bytes),
        storage_limit_formatted=format_bytes(usage.storage_limit_bytes),
        usage_percent=round(usage.usage_percent, 2),
        asset_count=usage.asset_count,
        plan_code=usage.plan_code,
        is_near_limit=usage.is_near_limit,
        is_at_limit=usage.is_at_limit,
        last_updated_at=usage.last_updated_at,
    )


@router.get(
    "/breakdown",
    response_model=StorageBreakdownResponse,
    summary="Get storage breakdown",
    description="Get detailed storage breakdown by file type and month.",
)
async def get_storage_breakdown(
    workspace_access: WorkspaceAccessDep,
    storage_service: StorageServiceDep = None,
) -> StorageBreakdownResponse:
    """Get detailed storage breakdown.

    Returns storage usage broken down by:
    - File type (photo, video)
    - Month (last 12 months)
    """
    _, workspace_id = workspace_access
    breakdown = await storage_service.get_storage_breakdown(workspace_id)

    return StorageBreakdownResponse(
        workspace_id=breakdown["workspace_id"],
        total_bytes=breakdown["total_bytes"],
        by_type=[
            StorageBreakdownItem(
                name=item["name"],
                storage_bytes=item["storage_bytes"],
                asset_count=item["asset_count"],
                percentage=round(item["percentage"], 2),
            )
            for item in breakdown["by_type"]
        ],
        by_month=[
            StorageBreakdownItem(
                name=item["name"],
                storage_bytes=item["storage_bytes"],
                asset_count=item["asset_count"],
                percentage=round(item["percentage"], 2),
            )
            for item in breakdown["by_month"]
        ],
    )


@router.post(
    "/refresh",
    response_model=StorageUsageResponse,
    summary="Refresh storage cache",
    description="Force refresh the storage cache from database.",
)
async def refresh_storage_cache(
    workspace_access: WorkspaceAccessDep,
    storage_service: StorageServiceDep = None,
) -> StorageUsageResponse:
    """Force refresh storage cache.

    Invalidates the cache and recalculates storage from the database.
    Use sparingly - the cache provides significant performance benefits.
    """
    _, workspace_id = workspace_access
    usage = await storage_service.refresh_cache(workspace_id)

    logger.info(
        "Storage cache refreshed",
        extra={
            "workspace_id": str(workspace_id),
            "storage_used": usage.storage_used_bytes,
        },
    )

    return StorageUsageResponse(
        workspace_id=usage.workspace_id,
        storage_used_bytes=usage.storage_used_bytes,
        storage_limit_bytes=usage.storage_limit_bytes,
        storage_used_formatted=format_bytes(usage.storage_used_bytes),
        storage_limit_formatted=format_bytes(usage.storage_limit_bytes),
        usage_percent=round(usage.usage_percent, 2),
        asset_count=usage.asset_count,
        plan_code=usage.plan_code,
        is_near_limit=usage.is_near_limit,
        is_at_limit=usage.is_at_limit,
        last_updated_at=usage.last_updated_at,
    )


@router.get(
    "/check-upload",
    summary="Check if upload is allowed",
    description="Check if a file of given size can be uploaded within storage limits.",
)
async def check_upload_allowed(
    workspace_access: WorkspaceAccessDep,
    size_bytes: int = Query(..., ge=1, description="File size in bytes"),
    storage_service: StorageServiceDep = None,
) -> dict:
    """Check if upload is allowed.

    Use this before starting an upload to verify storage limits.
    Returns whether upload is allowed and current usage info.
    """
    _, workspace_id = workspace_access
    allowed, error_message = await storage_service.check_upload_allowed(
        workspace_id=workspace_id,
        file_size_bytes=size_bytes,
    )

    usage = await storage_service.get_storage_usage(workspace_id)

    return {
        "allowed": allowed,
        "error_message": error_message,
        "current_usage_bytes": usage.storage_used_bytes,
        "limit_bytes": usage.storage_limit_bytes,
        "remaining_bytes": usage.storage_remaining_bytes,
        "file_size_bytes": size_bytes,
        "would_exceed_by": max(0, usage.storage_used_bytes + size_bytes - usage.storage_limit_bytes),
    }
