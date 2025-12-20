"""Public Gallery API Endpoints."""

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Path, status

from app.api.schemas import GalleryDetailResponse, ErrorResponse
from app.services.gallery_service import get_gallery_service, GalleryNotFoundError
from app.api.exceptions import AppError, NotFoundError, InternalError

logger = logging.getLogger(__name__)

router = APIRouter()

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
