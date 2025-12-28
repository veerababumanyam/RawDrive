"""Gallery API endpoints.

All routes prefixed with /api/v1/workspaces/{workspace_id}/galleries.
"""

from __future__ import annotations

import logging
from typing import Annotated
from uuid import UUID
from datetime import date

from fastapi import APIRouter, Path, Query, status

from fastapi import Request

from app.api.dependencies.auth import CurrentUserDep, WorkspaceAccessDep
from app.api.schemas import (
    CreateGalleryRequest,
    CreateSubGalleryRequest,
    ErrorResponse,
    GalleryCredentialsResponse,
    GalleryDetailResponse,
    GalleryListResponse,
    MessageResponse,
    PublishGalleryRequest,
    UpdateGalleryRequest,
    UpdateGalleryRequest,
    UpdateSubGalleryRequest,
    BatchAssetOperationRequest,
    BatchAssetOperationResponse,
)
from app.api.exceptions import AppError, ForbiddenError, NotFoundError, ValidationAppError, InternalError
from app.services.gallery_service import (
    GalleryEmptyError,
    GalleryError,
    GalleryNotFoundError,
    SubGalleryNotFoundError,
    get_gallery_service,
)
from app.utils.security import hash_password
from app.services.deletion_service import (
    DeletionError,
    get_deletion_service,
)
from app.services.encryption_service import get_encryption_service

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
    search: Annotated[str | None, Query(description="Search query")] = None,
    start_date: Annotated[date | None, Query(description="Filter by shoot date start")] = None,
    end_date: Annotated[date | None, Query(description="Filter by shoot date end")] = None,
    pinned_only: Annotated[bool, Query(description="Show only pinned/favorite galleries")] = False,
    recent_only: Annotated[bool, Query(description="Show only recently accessed galleries")] = False,
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
            search=search,
            start_date=start_date,
            end_date=end_date,
            pinned_only=pinned_only,
            recent_only=recent_only,
        )
        return GalleryListResponse(**result)
    except GalleryError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status)
    except Exception as e:
        logger.exception("Failed to list galleries")
        raise AppError(
            message="Failed to list galleries",
            code="INTERNAL_ERROR",
            status_code=500,
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
            client_id=request.client_id,
            shoot_date=request.shoot_date,
        )
        return GalleryDetailResponse(**result)
    except GalleryError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status)
    except Exception as e:
        logger.exception("Failed to create gallery")
        raise AppError(
            message="Failed to create gallery",
            code="INTERNAL_ERROR",
            status_code=500,
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
        raise NotFoundError("gallery", gallery_id, code=e.code)
    except Exception as e:
        logger.exception("Failed to get gallery")
        raise AppError(
            message="Failed to get gallery",
            code="INTERNAL_ERROR",
            status_code=500,
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
        encryption_service = get_encryption_service()

        # Handle password update
        if request.remove_password:
            updates.pop("password", None)
            updates["password_hash"] = None
            updates["password_encrypted"] = None
            updates["password_iv"] = None
            # Log password removal
            logger.info(
                "Gallery password removed",
                extra={
                    "workspace_id": str(workspace_id),
                    "gallery_id": str(gallery_id),
                    "user_id": str(current_user.user_id),
                },
            )
        elif request.password:
            # Store hash for verification and encrypted version for reveal
            updates.pop("password", None)
            updates["password_hash"] = hash_password(request.password)
            # Encrypt for reveal feature
            encrypted, iv = encryption_service.encrypt_gallery_credential(
                request.password, workspace_id
            )
            updates["password_encrypted"] = encrypted
            updates["password_iv"] = iv
            # Log password update
            logger.info(
                "Gallery password updated",
                extra={
                    "workspace_id": str(workspace_id),
                    "gallery_id": str(gallery_id),
                    "user_id": str(current_user.user_id),
                },
            )

        # Handle PIN update
        if request.remove_pin:
            updates.pop("pin", None)
            updates["pin_hash"] = None
            updates["pin_encrypted"] = None
            updates["pin_iv"] = None
            # Log PIN removal
            logger.info(
                "Gallery PIN removed",
                extra={
                    "workspace_id": str(workspace_id),
                    "gallery_id": str(gallery_id),
                    "user_id": str(current_user.user_id),
                },
            )
        elif request.pin:
            # Store hash for verification and encrypted version for reveal
            updates.pop("pin", None)
            updates["pin_hash"] = hash_password(request.pin)
            # Encrypt for reveal feature
            encrypted, iv = encryption_service.encrypt_gallery_credential(
                request.pin, workspace_id
            )
            updates["pin_encrypted"] = encrypted
            updates["pin_iv"] = iv
            # Log PIN update
            logger.info(
                "Gallery PIN updated",
                extra={
                    "workspace_id": str(workspace_id),
                    "gallery_id": str(gallery_id),
                    "user_id": str(current_user.user_id),
                },
            )

        # Handle gradient_config - ensure it's properly serialized for JSONB
        # model_dump already converts nested Pydantic models to dicts
        # If gradient_config is explicitly set to None, it will be NULL in DB

        result = await service.update_gallery(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            **updates,
        )
        return GalleryDetailResponse(**result)
    except GalleryNotFoundError as e:
        raise NotFoundError("Gallery", str(gallery_id))
    except Exception as e:
        logger.exception("Failed to update gallery")
        raise InternalError("Failed to update gallery")


@router.delete(
    "/{gallery_id}",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Delete gallery",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery not found"},
        409: {"model": ErrorResponse, "description": "Gallery already deleted"},
    },
)
async def delete_gallery(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    request: Request,
) -> MessageResponse:
    """Soft delete a gallery (moves to recycle bin).

    The gallery and its contents are moved to the recycle bin and can be
    restored within the retention period. Use the recycle bin endpoints
    for permanent deletion.
    """
    service = get_deletion_service()
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    try:
        result = await service.soft_delete_gallery(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            user_id=current_user.user_id,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        return MessageResponse(
            message=f"Gallery moved to recycle bin. {result.cascaded_photos} photos also moved."
        )
    except DeletionError as e:
        if e.status == 404:
            raise NotFoundError("Gallery", str(gallery_id))
        elif e.status == 403:
            raise ForbiddenError(str(e))
        else:
            raise ValidationAppError(str(e))
    except Exception as e:
        logger.exception("Failed to delete gallery")
        raise InternalError("Failed to delete gallery")


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
        raise ValidationAppError(str(e), field="gallery_id")
    except GalleryNotFoundError as e:
        raise NotFoundError("Gallery", str(gallery_id))
    except Exception as e:
        logger.exception("Failed to publish gallery")
        raise InternalError("Failed to publish gallery")


@router.get(
    "/{gallery_id}/credentials",
    response_model=GalleryCredentialsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get gallery credentials",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery not found"},
    },
)
async def get_gallery_credentials(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
) -> GalleryCredentialsResponse:
    """Get gallery credentials (password and PIN) for owner reveal feature.

    Returns decrypted credentials for authorized workspace members.
    Legacy galleries (password/PIN set before this feature) will have
    password/pin = null with password_recoverable/pin_recoverable = false.

    This endpoint is intended for gallery owners to view/share credentials
    with clients, not for public access verification.
    """
    service = get_gallery_service()
    try:
        result = await service.get_gallery_credentials(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
        )
        # Log credential access for audit
        logger.info(
            "Gallery credentials accessed",
            extra={
                "workspace_id": str(workspace_id),
                "gallery_id": str(gallery_id),
                "user_id": str(current_user.user_id),
            },
        )
        return GalleryCredentialsResponse(**result)
    except GalleryNotFoundError:
        raise NotFoundError("Gallery", str(gallery_id))
    except Exception as e:
        logger.exception("Failed to get gallery credentials")
        raise InternalError("Failed to get gallery credentials")


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
        raise NotFoundError("Gallery", str(gallery_id))
    except GalleryError as e:
        if e.status == 400:
            raise ValidationAppError(str(e))
        elif e.status == 403:
            raise ForbiddenError(str(e))
        else:
            raise InternalError(str(e))
    except Exception as e:
        logger.exception("Failed to create sub-gallery")
        raise InternalError("Failed to create sub-gallery")


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
            cover_asset_id=request.cover_asset_id,
        )
        return result
    except SubGalleryNotFoundError as e:
        raise NotFoundError("Sub-gallery", str(sub_gallery_id))
    except GalleryError as e:
        if e.status == 400:
            raise ValidationAppError(str(e))
        elif e.status == 403:
            raise ForbiddenError(str(e))
        else:
            raise InternalError(str(e))
    except Exception as e:
        logger.exception("Failed to update sub-gallery")
        raise InternalError("Failed to update sub-gallery")


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
        raise NotFoundError("Sub-gallery", str(sub_gallery_id))
    except GalleryError as e:
        if e.status == 400:
            raise ValidationAppError(str(e))
        elif e.status == 403:
            raise ForbiddenError(str(e))
        else:
            raise InternalError(str(e))
    except Exception as e:
        logger.exception("Failed to delete sub-gallery")
        raise InternalError("Failed to delete sub-gallery")


@router.post(
    "/{gallery_id}/assets",
    response_model=BatchAssetOperationResponse,
    status_code=status.HTTP_200_OK,
    summary="Add assets to gallery",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery not found"},
    },
)
async def add_assets_to_gallery(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    request: BatchAssetOperationRequest,
) -> BatchAssetOperationResponse:
    """Add existing library assets to a gallery."""
    service = get_gallery_service()
    try:
        result = await service.add_assets(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            asset_ids=request.asset_ids,
        )
        return BatchAssetOperationResponse(count=result["added_count"])
    except GalleryNotFoundError as e:
        raise NotFoundError("Gallery", str(gallery_id))
    except Exception as e:
        logger.exception("Failed to add assets to gallery")
        raise InternalError("Failed to add assets to gallery")


@router.delete(
    "/{gallery_id}/assets",
    response_model=BatchAssetOperationResponse,
    status_code=status.HTTP_200_OK,
    summary="Remove assets from gallery",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery not found"},
    },
)
async def remove_assets_from_gallery(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    request: BatchAssetOperationRequest,
) -> BatchAssetOperationResponse:
    """Remove assets from a gallery (unlink)."""
    service = get_gallery_service()
    try:
        result = await service.remove_assets(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            asset_ids=request.asset_ids,
        )
        return BatchAssetOperationResponse(count=result["removed_count"])
    except GalleryNotFoundError as e:
        raise NotFoundError("Gallery", str(gallery_id))
    except Exception as e:
        logger.exception(
            "Failed to remove assets from gallery",
            extra={
                "workspace_id": str(workspace_id),
                "gallery_id": str(gallery_id),
                "asset_ids": [str(a) for a in request.asset_ids],
                "error": str(e),
            }
        )
        raise InternalError("Failed to remove assets from gallery")


@router.post(
    "/{gallery_id}/pin",
    status_code=status.HTTP_200_OK,
    summary="Pin gallery",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery not found"},
    },
)
async def pin_gallery(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
) -> dict:
    """Pin a gallery to favorites."""
    service = get_gallery_service()
    try:
        await service.pin_gallery(workspace_id, gallery_id)
        return {"success": True}
    except GalleryError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status)
    except Exception as e:
        logger.exception("Failed to pin gallery")
        raise AppError(
            message="Failed to pin gallery",
            code="INTERNAL_ERROR",
            status_code=500,
        )


@router.post(
    "/{gallery_id}/unpin",
    status_code=status.HTTP_200_OK,
    summary="Unpin gallery",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery not found"},
    },
)
async def unpin_gallery(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
) -> dict:
    """Unpin a gallery from favorites."""
    service = get_gallery_service()
    try:
        await service.unpin_gallery(workspace_id, gallery_id)
        return {"success": True}
    except GalleryError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status)
    except Exception as e:
        logger.exception("Failed to unpin gallery")
        raise AppError(
            message="Failed to unpin gallery",
            code="INTERNAL_ERROR",
            status_code=500,
        )

