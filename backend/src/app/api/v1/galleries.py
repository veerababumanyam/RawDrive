"""Gallery API endpoints.

All routes prefixed with /api/v1/workspaces/{workspace_id}/galleries.
"""

from __future__ import annotations

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Path, Query, status

from app.api.dependencies.auth import CurrentUserDep, WorkspaceAccessDep
from app.api.schemas import (
    CreateGalleryRequest,
    CreateSubGalleryRequest,
    ErrorResponse,
    GalleryDetailResponse,
    GalleryListResponse,
    MessageResponse,
    PublishGalleryRequest,
    UpdateGalleryRequest,
    UpdateSubGalleryRequest,
)
from app.services.gallery_service import (
    GalleryEmptyError,
    GalleryError,
    GalleryNotFoundError,
    SubGalleryNotFoundError,
    get_gallery_service,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "",
    response_model=GalleryListResponse,
    status_code=status.HTTP_200_OK,
    summary="List galleries",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Workspace not found"},
    },
)
async def list_galleries(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 20,
    sort: Annotated[str, Query(description="Sort field")] = "created_at",
    status_filter: Annotated[str | None, Query(alias="status", description="Filter by status")] = None,
) -> GalleryListResponse:
    """List all galleries in a workspace."""
    # workspace_access validates access, workspace_id comes from path
    service = get_gallery_service()
    try:
        result = await service.list_galleries(
            workspace_id=workspace_id,
            page=page,
            limit=limit,
            sort=sort,
            status=status_filter,
        )
        return GalleryListResponse(**result)
    except GalleryError as e:
        raise HTTPException(status_code=e.status, detail={"code": e.code, "message": str(e)})
    except Exception as e:
        logger.exception("Failed to list galleries")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "INTERNAL_ERROR", "message": "Failed to list galleries"},
        )


@router.post(
    "",
    response_model=GalleryDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create gallery",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def create_gallery(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: CreateGalleryRequest,
) -> GalleryDetailResponse:
    """Create a new gallery."""
    # workspace_access validates access, workspace_id comes from path
    service = get_gallery_service()
    try:
        result = await service.create_gallery(
            workspace_id=workspace_id,
            user_id=current_user.user_id,
            title=request.title,
            description=request.description,
            client_name=request.client_name,
        )
        return GalleryDetailResponse(**result)
    except GalleryError as e:
        raise HTTPException(status_code=e.status, detail={"code": e.code, "message": str(e)})
    except Exception as e:
        logger.exception("Failed to create gallery")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "INTERNAL_ERROR", "message": "Failed to create gallery"},
        )


@router.get(
    "/{gallery_id}",
    response_model=GalleryDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Get gallery",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery not found"},
    },
)
async def get_gallery(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
) -> GalleryDetailResponse:
    """Get gallery details."""
    service = get_gallery_service()
    try:
        result = await service.get_gallery(workspace_id=workspace_id, gallery_id=gallery_id)
        return GalleryDetailResponse(**result)
    except GalleryNotFoundError as e:
        raise HTTPException(status_code=e.status, detail={"code": e.code, "message": str(e)})
    except Exception as e:
        logger.exception("Failed to get gallery")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "INTERNAL_ERROR", "message": "Failed to get gallery"},
        )


@router.patch(
    "/{gallery_id}",
    response_model=GalleryDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Update gallery",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery not found"},
    },
)
async def update_gallery(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    request: UpdateGalleryRequest,
) -> GalleryDetailResponse:
    """Update gallery settings."""
    service = get_gallery_service()
    try:
        updates = request.model_dump(exclude_unset=True)
        # Handle password update
        if request.remove_password:
            updates.pop("password", None)
            updates["password_hash"] = None
        elif request.password:
            # TODO: Hash password using bcrypt
            updates.pop("password", None)
            updates["password_hash"] = request.password  # Placeholder - should hash

        result = await service.update_gallery(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            **updates,
        )
        return GalleryDetailResponse(**result)
    except GalleryNotFoundError as e:
        raise HTTPException(status_code=e.status, detail={"code": e.code, "message": str(e)})
    except Exception as e:
        logger.exception("Failed to update gallery")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "INTERNAL_ERROR", "message": "Failed to update gallery"},
        )


@router.delete(
    "/{gallery_id}",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Delete gallery",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery not found"},
    },
)
async def delete_gallery(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
) -> MessageResponse:
    """Delete (archive) a gallery."""
    service = get_gallery_service()
    try:
        await service.delete_gallery(workspace_id=workspace_id, gallery_id=gallery_id)
        return MessageResponse(message="Gallery deleted successfully")
    except GalleryNotFoundError as e:
        raise HTTPException(status_code=e.status, detail={"code": e.code, "message": str(e)})
    except Exception as e:
        logger.exception("Failed to delete gallery")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "INTERNAL_ERROR", "message": "Failed to delete gallery"},
        )


@router.post(
    "/{gallery_id}/publish",
    response_model=GalleryDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Publish/unpublish gallery",
    responses={
        400: {"model": ErrorResponse, "description": "Gallery is empty"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery not found"},
    },
)
async def publish_gallery(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    request: PublishGalleryRequest,
) -> GalleryDetailResponse:
    """Publish or unpublish a gallery."""
    service = get_gallery_service()
    try:
        result = await service.publish_gallery(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            publish=request.publish,
        )
        return GalleryDetailResponse(**result)
    except GalleryEmptyError as e:
        raise HTTPException(status_code=e.status, detail={"code": e.code, "message": str(e)})
    except GalleryNotFoundError as e:
        raise HTTPException(status_code=e.status, detail={"code": e.code, "message": str(e)})
    except Exception as e:
        logger.exception("Failed to publish gallery")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "INTERNAL_ERROR", "message": "Failed to publish gallery"},
        )


# Sub-gallery endpoints
@router.post(
    "/{gallery_id}/sub-galleries",
    response_model=dict,
    status_code=status.HTTP_201_CREATED,
    summary="Create sub-gallery",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery not found"},
    },
)
async def create_sub_gallery(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    request: CreateSubGalleryRequest,
) -> dict[str, object]:
    """Create a sub-gallery."""
    service = get_gallery_service()
    try:
        result = await service.create_sub_gallery(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            name=request.name,
            sort_order=request.sort_order,
        )
        return result
    except GalleryNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "GALLERY_NOT_FOUND", "message": str(e)},
        )
    except GalleryError as e:
        raise HTTPException(status_code=e.status, detail={"code": e.code, "message": str(e)})
    except Exception as e:
        logger.exception("Failed to create sub-gallery")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "INTERNAL_ERROR", "message": "Failed to create sub-gallery"},
        )


@router.patch(
    "/{gallery_id}/sub-galleries/{sub_gallery_id}",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Update sub-gallery",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Sub-gallery not found"},
    },
)
async def update_sub_gallery(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    sub_gallery_id: Annotated[UUID, Path(..., description="Sub-gallery ID")],
    request: UpdateSubGalleryRequest,
) -> dict[str, object]:
    """Update a sub-gallery."""
    service = get_gallery_service()
    try:
        result = await service.update_sub_gallery(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            sub_gallery_id=sub_gallery_id,
            name=request.name,
            sort_order=request.sort_order,
            visible=request.visible,
        )
        return result
    except SubGalleryNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "SUB_GALLERY_NOT_FOUND", "message": str(e)},
        )
    except GalleryError as e:
        raise HTTPException(status_code=e.status, detail={"code": e.code, "message": str(e)})
    except Exception as e:
        logger.exception("Failed to update sub-gallery")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "INTERNAL_ERROR", "message": "Failed to update sub-gallery"},
        )


@router.delete(
    "/{gallery_id}/sub-galleries/{sub_gallery_id}",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Delete sub-gallery",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Sub-gallery not found"},
    },
)
async def delete_sub_gallery(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    sub_gallery_id: Annotated[UUID, Path(..., description="Sub-gallery ID")],
) -> MessageResponse:
    """Delete a sub-gallery."""
    service = get_gallery_service()
    try:
        await service.delete_sub_gallery(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            sub_gallery_id=sub_gallery_id,
        )
        return MessageResponse(message="Sub-gallery deleted successfully")
    except SubGalleryNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "SUB_GALLERY_NOT_FOUND", "message": str(e)},
        )
    except GalleryError as e:
        raise HTTPException(status_code=e.status, detail={"code": e.code, "message": str(e)})
    except Exception as e:
        logger.exception("Failed to delete sub-gallery")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "INTERNAL_ERROR", "message": "Failed to delete sub-gallery"},
        )

