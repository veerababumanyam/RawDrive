"""Library API endpoints.

All routes prefixed with /api/v1/workspaces/{workspace_id}/library.
"""

from __future__ import annotations

import logging
import os
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
from app.services.signed_url_service import get_signed_url_service

# Get API base URL for absolute signed URLs (needed for <img src="..."> tags)
# Default to localhost:8000 for development
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")

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
    folder_id: Annotated[UUID | None, Query(description="Filter by folder ID")] = None,
    face_group_id: Annotated[UUID | None, Query(description="Filter by face group (person) ID")] = None,
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
            folder_id=folder_id,
            face_group_id=face_group_id,
        )
        
        # Generate signed URLs for media access
        # Signed URLs work with <img src="..."> tags without requiring auth headers
        # Use absolute URL with API_BASE_URL so frontend can load images directly
        signed_url_service = get_signed_url_service()
        media_base_url = f"{API_BASE_URL}/api/v1/media"
        data = []
        for asset in result["data"]:
            asset_id_uuid = UUID(asset["asset_id"]) if isinstance(asset["asset_id"], str) else asset["asset_id"]

            # Generate signed URLs for each variant with absolute base URL
            if asset["type"] == "photo":
                thumbnail_signed = signed_url_service.generate_signed_url(
                    workspace_id=workspace_id,
                    asset_id=asset_id_uuid,
                    variant="thumbnail",
                    base_url=media_base_url,
                )
                preview_signed = signed_url_service.generate_signed_url(
                    workspace_id=workspace_id,
                    asset_id=asset_id_uuid,
                    variant="preview",
                    base_url=media_base_url,
                )
                original_signed = signed_url_service.generate_signed_url(
                    workspace_id=workspace_id,
                    asset_id=asset_id_uuid,
                    variant="original",
                    base_url=media_base_url,
                )
                asset["thumbnail_url"] = thumbnail_signed["url"]
                asset["preview_url"] = preview_signed["url"]
                asset["original_url"] = original_signed["url"]
            elif asset["type"] == "video":
                # For video, we might have a poster/thumbnail variants
                thumbnail_signed = signed_url_service.generate_signed_url(
                    workspace_id=workspace_id,
                    asset_id=asset_id_uuid,
                    variant="thumbnail",
                    base_url=media_base_url,
                )
                preview_signed = signed_url_service.generate_signed_url(
                    workspace_id=workspace_id,
                    asset_id=asset_id_uuid,
                    variant="preview",
                    base_url=media_base_url,
                )
                original_signed = signed_url_service.generate_signed_url(
                    workspace_id=workspace_id,
                    asset_id=asset_id_uuid,
                    variant="original",
                    base_url=media_base_url,
                )
                asset["thumbnail_url"] = thumbnail_signed["url"]
                asset["preview_url"] = preview_signed["url"]
                asset["original_url"] = original_signed["url"]
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


# ---------------------------------------------------------------------------
# Folder Schemas
# ---------------------------------------------------------------------------

class FolderCreateRequest(BaseModel):
    """Request to create a folder."""
    name: str = Field(..., min_length=1, max_length=255)
    parent_folder_id: Optional[UUID] = None
    description: Optional[str] = None
    color: Optional[str] = Field(None, max_length=7, pattern=r'^#[0-9A-Fa-f]{6}$')


class FolderUpdateRequest(BaseModel):
    """Request to update a folder."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    color: Optional[str] = Field(None, max_length=7, pattern=r'^#[0-9A-Fa-f]{6}$')
    cover_asset_id: Optional[UUID] = None


class FolderResponse(BaseModel):
    """Folder details."""
    folder_id: UUID
    workspace_id: UUID
    name: str
    parent_folder_id: Optional[UUID] = None
    description: Optional[str] = None
    color: Optional[str] = None
    sort_order: int
    cover_asset_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime
    asset_count: int = 0
    subfolder_count: int = 0


class FolderDetailResponse(FolderResponse):
    """Folder details with breadcrumb."""
    breadcrumb: list[dict] = []


class FolderListResponse(BaseModel):
    """List of folders."""
    data: list[FolderResponse]


class MoveAssetsRequest(BaseModel):
    """Request to move assets to a folder."""
    asset_ids: list[UUID]
    folder_id: Optional[UUID] = None  # None means move to root


class MoveAssetsResponse(BaseModel):
    """Response from moving assets."""
    moved: bool
    count: int


class DeleteFolderRequest(BaseModel):
    """Request to delete a folder."""
    move_assets_to_root: bool = True


class DeleteFolderResponse(BaseModel):
    """Response from deleting a folder."""
    deleted: bool
    folders_deleted: int


# ---------------------------------------------------------------------------
# Folder Endpoints
# ---------------------------------------------------------------------------

@router.get(
    "/folders",
    response_model=FolderListResponse,
    status_code=status.HTTP_200_OK,
    summary="List library folders",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def list_folders(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    parent_folder_id: Annotated[UUID | None, Query(description="Filter by parent folder")] = None,
) -> FolderListResponse:
    """List folders in the library."""
    service = get_library_service()
    try:
        folders = await service.list_folders(
            workspace_id=workspace_id,
            parent_folder_id=parent_folder_id,
        )
        return FolderListResponse(data=folders)
    except Exception as e:
        logger.exception("Failed to list folders")
        raise InternalError("Failed to list folders")


@router.post(
    "/folders",
    response_model=FolderResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create folder",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Parent folder not found"},
    },
)
async def create_folder(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: FolderCreateRequest,
) -> FolderResponse:
    """Create a new library folder."""
    service = get_library_service()
    folder = await service.create_folder(
        workspace_id=workspace_id,
        name=request.name,
        created_by_user_id=current_user.user_id,
        parent_folder_id=request.parent_folder_id,
        description=request.description,
        color=request.color,
    )
    return FolderResponse(**folder)


@router.get(
    "/folders/{folder_id}",
    response_model=FolderDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Get folder details",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Folder not found"},
    },
)
async def get_folder(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    folder_id: Annotated[UUID, Path(..., description="Folder ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> FolderDetailResponse:
    """Get folder details with breadcrumb."""
    service = get_library_service()
    folder = await service.get_folder(
        workspace_id=workspace_id,
        folder_id=folder_id,
    )
    return FolderDetailResponse(**folder)


@router.patch(
    "/folders/{folder_id}",
    response_model=FolderResponse,
    status_code=status.HTTP_200_OK,
    summary="Update folder",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Folder not found"},
    },
)
async def update_folder(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    folder_id: Annotated[UUID, Path(..., description="Folder ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: FolderUpdateRequest,
) -> FolderResponse:
    """Update a library folder."""
    service = get_library_service()
    folder = await service.update_folder(
        workspace_id=workspace_id,
        folder_id=folder_id,
        name=request.name,
        description=request.description,
        color=request.color,
        cover_asset_id=request.cover_asset_id,
    )
    return FolderResponse(**folder)


@router.delete(
    "/folders/{folder_id}",
    response_model=DeleteFolderResponse,
    status_code=status.HTTP_200_OK,
    summary="Delete folder",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Folder not found"},
    },
)
async def delete_folder(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    folder_id: Annotated[UUID, Path(..., description="Folder ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    move_assets_to_root: Annotated[bool, Query(description="Move assets to root instead of deleting")] = True,
) -> DeleteFolderResponse:
    """Delete a library folder."""
    service = get_library_service()
    result = await service.delete_folder(
        workspace_id=workspace_id,
        folder_id=folder_id,
        move_assets_to_root=move_assets_to_root,
    )
    return DeleteFolderResponse(**result)


@router.post(
    "/assets/move",
    response_model=MoveAssetsResponse,
    status_code=status.HTTP_200_OK,
    summary="Move assets to folder",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Folder not found"},
    },
)
async def move_assets_to_folder(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: MoveAssetsRequest,
) -> MoveAssetsResponse:
    """Move assets to a folder (or root)."""
    service = get_library_service()
    result = await service.move_assets_to_folder(
        workspace_id=workspace_id,
        asset_ids=request.asset_ids,
        folder_id=request.folder_id,
    )
    return MoveAssetsResponse(**result)

