"""Public Gallery API Endpoints."""

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Path, status, Body

from app.api.schemas import GalleryDetailResponse, ErrorResponse, VisitorRegisterRequest
from app.services.gallery_service import get_gallery_service, GalleryNotFoundError
from app.services.visitor_service import get_visitor_service
from app.api.exceptions import AppError, NotFoundError, InternalError

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post(
    "/{gallery_id}/register",
    status_code=status.HTTP_201_CREATED,
    summary="Register visitor",
)
async def register_visitor(
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    request: VisitorRegisterRequest = Body(...),
):
    """Register visitor to access gallery."""
    # 1. Get gallery to verify existence and workspace
    gallery_service = get_gallery_service()
    try:
        gallery = await gallery_service.get_public_gallery(gallery_id)
        workspace_id = UUID(gallery["workspace_id"])
    except GalleryNotFoundError:
         raise NotFoundError("Gallery", str(gallery_id))

    # 2. Register visitor
    visitor_service = get_visitor_service()
    try:
        result = await visitor_service.register_visitor(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            email=request.email,
            first_name=request.first_name,
            last_name=request.last_name,
            phone=request.phone,
            address=request.address,
            metadata=request.metadata,
        )
        return result
    except Exception as e:
        logger.exception("Failed to register visitor")
        raise InternalError("Failed to register visitor")

@router.get(
    "/{gallery_id}",
    response_model=GalleryDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Get public gallery",
    responses={
        404: {"model": ErrorResponse, "description": "Gallery not found or not visible"},
    },
)
async def get_public_gallery(
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
) -> GalleryDetailResponse:
    """Get public gallery details."""
    service = get_gallery_service()
    try:
        result = await service.get_public_gallery(gallery_id)
        return GalleryDetailResponse(**result)
    except GalleryNotFoundError as e:
        raise NotFoundError("Gallery", str(gallery_id))
    except Exception as e:
        logger.exception("Failed to get public gallery")
        raise InternalError("Failed to retrieve gallery")


@router.get(
    "/{gallery_id}/assets",
    status_code=status.HTTP_200_OK,
    summary="List public gallery assets",
    responses={
        404: {"model": ErrorResponse, "description": "Gallery not found or not visible"},
    },
)
async def list_public_gallery_assets(
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
) -> dict:
    """List visible assets for a public gallery."""
    service = get_gallery_service()
    try:
        assets = await service.get_public_gallery_assets(gallery_id)
        return {"data": assets}
    except GalleryNotFoundError as e:
        raise NotFoundError("Gallery", str(gallery_id))
    except Exception as e:
        logger.exception("Failed to list public gallery assets")
        raise InternalError("Failed to list assets")


@router.get(
    "/{gallery_id}/assets/{asset_id}/{variant}",
    status_code=status.HTTP_200_OK,
    summary="Get public gallery asset content",
    responses={
        404: {"model": ErrorResponse, "description": "Asset not found"},
    },
)
async def get_public_gallery_asset(
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    asset_id: Annotated[UUID, Path(..., description="Asset ID")],
    variant: Annotated[str, Path(..., description="Variant (thumbnail, preview, original)")],
):
    """Get public gallery asset content (decrypted)."""
    from fastapi.responses import Response

    service = get_gallery_service()
    try:
        content, content_type = await service.get_public_asset_content(gallery_id, asset_id, variant)
        return Response(content=content, media_type=content_type)
    except GalleryNotFoundError as e:
        raise NotFoundError("Gallery", str(gallery_id))
    except Exception as e:
        # Check if it's an ASSET_NOT_FOUND error from service
        if hasattr(e, "code") and e.code == "ASSET_NOT_FOUND":
            raise NotFoundError("Asset", str(asset_id))
        logger.exception("Failed to get public gallery asset content")
        raise InternalError("Failed to retrieve asset")
