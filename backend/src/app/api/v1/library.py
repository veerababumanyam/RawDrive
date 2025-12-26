"""Library API endpoints.

All routes prefixed with /api/v1/workspaces/{workspace_id}/library.
"""

from __future__ import annotations

import logging
from typing import Annotated, Optional, Literal
from uuid import UUID
from datetime import datetime

from fastapi import APIRouter, Path, Query, status, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.api.dependencies.auth import CurrentUserDep, WorkspaceAccessDep
from app.api.exceptions import AppError, InternalError, NotFoundError
from app.api.schemas import ErrorResponse, PaginatedResponse, BatchAssetOperationRequest, BatchAssetOperationResponse
from app.services.library_service import get_library_service

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class LibraryAssetResponse(BaseModel):
    """Asset Details for Library View."""
    asset_id: UUID
    workspace_id: UUID
    type: Literal["photo", "video", "other"]
    status: str
    mime_type: str
    filename: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    duration_ms: Optional[int] = None
    date_taken: Optional[datetime] = None
    created_at: datetime
    exif: Optional[dict] = None
    is_assigned: bool
    thumbnail_url: Optional[str] = None
    preview_url: Optional[str] = None
    original_url: Optional[str] = None

class LibraryListResponse(PaginatedResponse):
    """List of library assets."""
    data: list[LibraryAssetResponse]
    
# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get(
    "/assets",
    response_model=LibraryListResponse,
    status_code=status.HTTP_200_OK,
    summary="List library assets",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Workspace not found"},
    },
)
async def list_library_assets(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 50,
    sort: Annotated[str, Query(description="Sort field: created_at, date_taken, filename")] = "created_at",
    type: Annotated[str | None, Query(description="Filter by media type")] = None,
    unassigned_only: Annotated[bool, Query(description="Show only unassigned assets")] = False,
    search: Annotated[str | None, Query(description="Search query")] = None,
    start_date: Annotated[datetime | None, Query(description="Filter by date taken start")] = None,
    end_date: Annotated[datetime | None, Query(description="Filter by date taken end")] = None,
) -> LibraryListResponse:
    """List all assets in the workspace library."""
    service = get_library_service()
    try:
        result = await service.list_workspace_assets(
            workspace_id=workspace_id,
            page=page,
            limit=limit,
            sort=sort,
            type=type,
            unassigned_only=unassigned_only,
            search_query=search,
            start_date=start_date,
            end_date=end_date,
        )
        
        # Inject URLs
        # Note: We rely on the frontend to prepend the API base if needed, or use relative paths
        # Actually for 'src' in img tags, absolute path from root is best.
        # /api/v1/workspaces/...
        data = []
        for asset in result["data"]:
            asset_id = asset["asset_id"]
            base_url = f"/api/v1/workspaces/{workspace_id}/library/assets/{asset_id}"
            
            # Add URLs based on asset type
            asset["original_url"] = f"{base_url}/original"
            if asset["type"] == "photo":
                asset["thumbnail_url"] = f"{base_url}/thumbnail"
                asset["preview_url"] = f"{base_url}/preview"
            elif asset["type"] == "video":
                # For video, we might have a poster/thumbnail variants
                asset["thumbnail_url"] = f"{base_url}/thumbnail"
                asset["preview_url"] = f"{base_url}/preview" # Video preview/poster
            data.append(asset)

        return LibraryListResponse(
            total=result["meta"]["total"],
            page=result["meta"]["page"],
            per_page=result["meta"]["limit"],
            total_pages=result["meta"]["totalPages"],
            data=data
        )
    except Exception as e:
        logger.exception("Failed to list library assets")
        raise InternalError("Failed to list library assets")


@router.get(
    "/assets/{asset_id}/{variant}",
    response_class=StreamingResponse,
    status_code=status.HTTP_200_OK,
    summary="Get asset content",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Asset or variant not found"},
    },
)
async def get_library_asset_content(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    asset_id: Annotated[UUID, Path(..., description="Asset ID")],
    variant: Annotated[Literal["original", "preview", "thumbnail"], Path(..., description="Asset variant")],
) -> StreamingResponse:
    """Get decrypted asset content (image/video)."""
    service = get_library_service()
    try:
        content, mime_type = await service.get_asset_content(
            workspace_id=workspace_id,
            asset_id=asset_id,
            variant=variant,
        )
        
        # Create generator for StreamingResponse
        def iter_content():
            yield content
            
        return StreamingResponse(
            iter_content(), 
            media_type=mime_type,
            headers={
                "Cache-Control": "private, max-age=3600", # Cache for 1 hour
            }
        )
    except Exception as e:
        logger.exception(f"Failed to get asset content: {asset_id} ({variant})")
        raise InternalError("Failed to retrieve asset content")


@router.delete(
    "/assets",
    response_model=BatchAssetOperationResponse,
    status_code=status.HTTP_200_OK,
    summary="Delete library assets",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def delete_library_assets(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: BatchAssetOperationRequest,
) -> BatchAssetOperationResponse:
    """Soft delete assets from the library."""
    service = get_library_service()
    try:
        count = await service.delete_assets(
            workspace_id=workspace_id,
            asset_ids=request.asset_ids,
            deleted_by_user_id=current_user.user_id,
        )
        return BatchAssetOperationResponse(success=True, count=count)
    except Exception as e:
        logger.exception("Failed to delete library assets")
        raise InternalError("Failed to delete library assets")
