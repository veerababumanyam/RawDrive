"""Client Avatar API endpoints.

These routes handle client avatar operations and are kept separate from the
main clients router (which was moved to client-service) since avatar processing
requires backend services like asset processing.

All routes prefixed with /api/v1/workspaces/{workspace_id}/clients.
"""

from __future__ import annotations

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, File, Path, Query, Response, UploadFile, status

from app.api.dependencies.auth import CurrentUserDep, WorkspaceAccessDep
from app.api.client_schemas import (
    AvatarInfoResponse,
    AvatarSelectResponse,
    AvatarUploadResponse,
    SelectGalleryPhotoRequest,
)
from app.api.schemas import ErrorResponse, MessageResponse
from app.api.exceptions import (
    AppError,
    InternalError,
    NotFoundError,
    ValidationAppError,
)
from app.services.avatar_service import get_avatar_service
from app.services.client_exceptions import (
    AvatarAssetNotInGalleryError,
    AvatarFileTooLargeError,
    AvatarInvalidFormatError,
    AvatarUploadError,
    ClientError,
    ClientNotFoundError,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Avatar endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/{client_id}/avatar",
    response_model=AvatarUploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload avatar",
    responses={
        400: {"model": ErrorResponse, "description": "Invalid file"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Client not found"},
        413: {"model": ErrorResponse, "description": "File too large"},
        422: {"model": ErrorResponse, "description": "Invalid format"},
    },
)
async def upload_avatar(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    client_id: Annotated[UUID, Path(..., description="Client ID")],
    file: UploadFile = File(..., description="Avatar image file"),
    crop_x: Annotated[float | None, Query(ge=0, le=100, description="Crop X offset %")] = None,
    crop_y: Annotated[float | None, Query(ge=0, le=100, description="Crop Y offset %")] = None,
    crop_scale: Annotated[float | None, Query(ge=0.1, le=10.0, description="Crop scale")] = None,
) -> AvatarUploadResponse:
    """Upload and process a new avatar image."""
    service = get_avatar_service()
    try:
        # Read file data
        file_data = await file.read()

        # Build crop data if provided
        crop_data = None
        if crop_x is not None or crop_y is not None or crop_scale is not None:
            crop_data = {
                "x": crop_x if crop_x is not None else 50.0,
                "y": crop_y if crop_y is not None else 50.0,
                "scale": crop_scale if crop_scale is not None else 1.0,
            }

        result = await service.upload_avatar(
            workspace_id=workspace_id,
            client_id=client_id,
            file_data=file_data,
            content_type=file.content_type,
            crop_data=crop_data,
            user_id=current_user.user_id,
        )
        return AvatarUploadResponse(
            avatar_asset_id=UUID(result["avatar_asset_id"]),
            avatar_url=result["avatar_url"],
            thumbnails=result["thumbnails"],
        )
    except ClientNotFoundError as e:
        raise NotFoundError("Client", str(client_id))
    except AvatarFileTooLargeError as e:
        raise AppError(
            message=e.user_message,
            code=e.code,
            status_code=e.status_code,
        )
    except AvatarInvalidFormatError as e:
        raise AppError(
            message=e.user_message,
            code=e.code,
            status_code=e.status_code,
        )
    except AvatarUploadError as e:
        raise ValidationAppError(e.user_message)
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to upload avatar")
        raise InternalError("Failed to upload avatar")


@router.post(
    "/{client_id}/avatar/from-gallery",
    response_model=AvatarSelectResponse,
    status_code=status.HTTP_200_OK,
    summary="Select gallery photo as avatar",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Client not found"},
        422: {"model": ErrorResponse, "description": "Asset not in linked gallery"},
    },
)
async def select_gallery_photo_as_avatar(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    client_id: Annotated[UUID, Path(..., description="Client ID")],
    request: SelectGalleryPhotoRequest,
) -> AvatarSelectResponse:
    """Select a photo from a linked gallery as the client's avatar."""
    service = get_avatar_service()
    try:
        # Build crop data if provided
        crop_data = None
        if request.crop_x is not None or request.crop_y is not None or request.crop_scale is not None:
            crop_data = {
                "x": request.crop_x if request.crop_x is not None else 50.0,
                "y": request.crop_y if request.crop_y is not None else 50.0,
                "scale": request.crop_scale if request.crop_scale is not None else 1.0,
            }

        result = await service.select_gallery_photo(
            workspace_id=workspace_id,
            client_id=client_id,
            asset_id=request.asset_id,
            crop_data=crop_data,
            user_id=current_user.user_id,
        )
        return AvatarSelectResponse(
            avatar_asset_id=UUID(result["avatar_asset_id"]),
            avatar_url=result["avatar_url"],
        )
    except ClientNotFoundError as e:
        raise NotFoundError("Client", str(client_id))
    except AvatarAssetNotInGalleryError as e:
        raise AppError(
            message=e.user_message,
            code=e.code,
            status_code=e.status_code,
        )
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to select gallery photo as avatar")
        raise InternalError("Failed to select gallery photo as avatar")


@router.delete(
    "/{client_id}/avatar",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Remove avatar",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Client not found"},
    },
)
async def remove_avatar(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    client_id: Annotated[UUID, Path(..., description="Client ID")],
) -> MessageResponse:
    """Remove the client's avatar."""
    service = get_avatar_service()
    try:
        result = await service.remove_avatar(
            workspace_id=workspace_id,
            client_id=client_id,
            user_id=current_user.user_id,
        )
        return MessageResponse(message=result["message"])
    except ClientNotFoundError as e:
        raise NotFoundError("Client", str(client_id))
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to remove avatar")
        raise InternalError("Failed to remove avatar")


@router.get(
    "/{client_id}/avatar",
    response_model=AvatarInfoResponse,
    status_code=status.HTTP_200_OK,
    summary="Get avatar info",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Client not found"},
    },
)
async def get_avatar_info(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    client_id: Annotated[UUID, Path(..., description="Client ID")],
    size: Annotated[int, Query(description="Thumbnail size")] = 256,
) -> AvatarInfoResponse:
    """Get avatar URL or initials for display."""
    service = get_avatar_service()
    try:
        result = await service.get_avatar_url(
            workspace_id=workspace_id,
            client_id=client_id,
            size=size,
        )
        if result is None:
            raise NotFoundError("Client", str(client_id))
        return AvatarInfoResponse(**result)
    except ClientNotFoundError as e:
        raise NotFoundError("Client", str(client_id))
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to get avatar info")
        raise InternalError("Failed to get avatar info")


@router.get(
    "/{client_id}/avatar/{size}",
    status_code=status.HTTP_200_OK,
    summary="Get avatar image",
    responses={
        200: {"content": {"image/webp": {}}},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Avatar not found"},
    },
)
async def get_avatar_image(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    client_id: Annotated[UUID, Path(..., description="Client ID")],
    size: Annotated[int, Path(..., description="Thumbnail size (64, 128, or 256)")],
) -> Response:
    """Get avatar image bytes for display."""
    service = get_avatar_service()
    try:
        image_data = await service.get_avatar_image(
            workspace_id=workspace_id,
            client_id=client_id,
            size=size,
        )
        if image_data is None:
            raise NotFoundError("Avatar", str(client_id))

        return Response(
            content=image_data,
            media_type="image/webp",
            headers={
                "Cache-Control": "public, max-age=3600",  # Cache for 1 hour
            },
        )
    except ClientNotFoundError as e:
        raise NotFoundError("Client", str(client_id))
    except ClientError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status_code)
    except Exception as e:
        logger.exception("Failed to get avatar image")
        raise InternalError("Failed to get avatar image")
