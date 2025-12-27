"""Public Gallery API Endpoints."""
from __future__ import annotations

import logging
import time
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Path, Query, status, Body

from app.api.schemas import (
    GalleryDetailResponse,
    ErrorResponse,
    VisitorRegisterRequest,
    FaceSearchRequest,
    FaceSearchResponse,
    FaceSearchMatch,
)
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


@router.post(
    "/{gallery_id}/verify-pin",
    status_code=status.HTTP_200_OK,
    summary="Verify gallery PIN",
)
async def verify_gallery_pin(
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    request: dict = Body(...),
):
    """Verify PIN for protected gallery access."""
    pin = request.get("pin", "")
    if not pin:
        raise AppError(message="PIN is required", code="PIN_REQUIRED", status_code=400)
    
    gallery_service = get_gallery_service()
    try:
        is_valid = await gallery_service.verify_gallery_pin(gallery_id, pin)
        return {"valid": is_valid}
    except GalleryNotFoundError:
        raise NotFoundError("Gallery", str(gallery_id))
    except Exception as e:
        logger.exception("Failed to verify PIN")
        raise InternalError("Failed to verify PIN")

@router.post(
    "/{gallery_id}/verify-password",
    status_code=status.HTTP_200_OK,
    summary="Verify gallery password",
)
async def verify_gallery_password(
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    request: dict = Body(...),
):
    """Verify password for protected gallery access."""
    password = request.get("password", "")
    if not password:
        raise AppError(message="Password is required", code="PASSWORD_REQUIRED", status_code=400)
    
    gallery_service = get_gallery_service()
    try:
        is_valid = await gallery_service.verify_gallery_password(gallery_id, password)
        return {"valid": is_valid}
    except GalleryNotFoundError:
        raise NotFoundError("Gallery", str(gallery_id))
    except Exception as e:
        logger.exception("Failed to verify password")
        raise InternalError("Failed to verify password")


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


@router.post(
    "/{gallery_id}/face-search",
    response_model=FaceSearchResponse,
    status_code=status.HTTP_200_OK,
    summary="Search gallery by face embedding",
    description="""
    Search for photos containing a specific face using vector similarity.

    Privacy-first design:
    - Face detection runs in the client's browser
    - Only the face embedding (not the image) is sent to the server
    - Embeddings are hashed for logging, never stored with user identity

    The embedding should be generated client-side using face-api.js or similar.
    Standard embedding dimensions are 128 (face-api.js) or 512 (ArcFace).
    """,
    responses={
        404: {"model": ErrorResponse, "description": "Gallery not found"},
        503: {"model": ErrorResponse, "description": "Face search not available for this gallery"},
    },
)
async def search_gallery_by_face(
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    request: FaceSearchRequest = Body(...),
) -> FaceSearchResponse:
    """Search for photos in gallery matching the provided face embedding.

    Uses pgvector's cosine similarity for fast approximate nearest neighbor search.
    Results are sorted by similarity score (highest first).
    """
    start_time = time.time()

    # Verify gallery exists and is public
    gallery_service = get_gallery_service()
    try:
        gallery = await gallery_service.get_public_gallery(gallery_id)
    except GalleryNotFoundError:
        raise NotFoundError("Gallery", str(gallery_id))

    # Check if face search is enabled for this gallery
    if not gallery.get("face_search_enabled", True):
        raise AppError(
            message="Face search is not available for this gallery",
            code="FACE_SEARCH_DISABLED",
            status_code=503,
        )

    try:
        # Perform vector similarity search
        matches = await gallery_service.search_faces_in_gallery(
            gallery_id=gallery_id,
            embedding=request.embedding,
            threshold=request.threshold,
            limit=request.limit,
        )

        query_time_ms = (time.time() - start_time) * 1000

        # Convert to response format with thumbnail URLs
        match_results = [
            FaceSearchMatch(
                photo_id=str(match["asset_id"]),
                similarity=match["similarity"],
                thumbnail_url=f"/api/v1/public/galleries/{gallery_id}/assets/{match['asset_id']}/thumbnail",
            )
            for match in matches
        ]

        return FaceSearchResponse(
            matches=match_results,
            total_searched=gallery.get("stats", {}).get("total_faces", 0),
            query_time_ms=round(query_time_ms, 2),
        )
    except Exception as e:
        logger.exception("Face search failed")
        raise InternalError("Face search temporarily unavailable")


@router.post(
    "/{gallery_id}/assets/{asset_id}/favorite",
    status_code=status.HTTP_200_OK,
    summary="Toggle asset favorite status",
    description="Allow visitors to favorite/unfavorite photos in a public gallery.",
    responses={
        404: {"model": ErrorResponse, "description": "Gallery or asset not found"},
    },
)
async def toggle_public_favorite(
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    asset_id: Annotated[UUID, Path(..., description="Asset ID")],
    request: dict = Body(...),
):
    """Toggle favorite status for an asset in a public gallery.

    Request body:
    - favorited: boolean - True to favorite, False to unfavorite
    - visitor_id: optional string - Visitor ID for tracking
    """
    favorited = request.get("favorited", True)
    visitor_id = request.get("visitor_id")
    if visitor_id:
        try:
            visitor_id = UUID(visitor_id)
        except ValueError:
            visitor_id = None

    service = get_gallery_service()
    try:
        result = await service.toggle_public_favorite(
            gallery_id=gallery_id,
            asset_id=asset_id,
            visitor_id=visitor_id,
            favorited=favorited,
        )
        return result
    except GalleryNotFoundError:
        raise NotFoundError("Gallery", str(gallery_id))
    except Exception as e:
        if hasattr(e, "code") and e.code == "ASSET_NOT_FOUND":
            raise NotFoundError("Asset", str(asset_id))
        logger.exception("Failed to toggle favorite")
        raise InternalError("Failed to update favorite status")


@router.post(
    "/{gallery_id}/assets/{asset_id}/selection",
    status_code=status.HTTP_200_OK,
    summary="Toggle asset selection (pick) status",
    description="Allow visitors to select/pick photos for their delivery selection.",
    responses={
        404: {"model": ErrorResponse, "description": "Gallery or asset not found"},
    },
)
async def toggle_public_selection(
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    asset_id: Annotated[UUID, Path(..., description="Asset ID")],
    request: dict = Body(...),
):
    """Toggle selection (pick) status for an asset in a public gallery.

    Request body:
    - selected: boolean - True to select, False to deselect
    - visitor_id: optional string - Visitor ID for tracking
    """
    selected = request.get("selected", True)
    visitor_id = request.get("visitor_id")
    if visitor_id:
        try:
            visitor_id = UUID(visitor_id)
        except ValueError:
            visitor_id = None

    service = get_gallery_service()
    try:
        result = await service.toggle_public_selection(
            gallery_id=gallery_id,
            asset_id=asset_id,
            visitor_id=visitor_id,
            selected=selected,
        )
        return result
    except GalleryNotFoundError:
        raise NotFoundError("Gallery", str(gallery_id))
    except Exception as e:
        if hasattr(e, "code") and e.code == "ASSET_NOT_FOUND":
            raise NotFoundError("Asset", str(asset_id))
        logger.exception("Failed to toggle selection")
        raise InternalError("Failed to update selection status")


@router.get(
    "/{gallery_id}/assets/filtered",
    status_code=status.HTTP_200_OK,
    summary="List public gallery assets with filters",
    description="Get public gallery assets with optional filtering by favorites or selections.",
    responses={
        404: {"model": ErrorResponse, "description": "Gallery not found"},
    },
)
async def list_public_gallery_assets_filtered(
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    filter_type: Annotated[str | None, Query(description="Filter: 'favorites', 'selections', or None for all")] = None,
    sub_gallery_id: Annotated[UUID | None, Query(description="Optional sub-gallery filter")] = None,
) -> dict:
    """List visible assets for a public gallery with optional filtering.

    This endpoint supports the workflow tabs UI:
    - All photos (no filter)
    - Favorites (filter_type='favorites')
    - Selections/Picks (filter_type='selections')
    """
    service = get_gallery_service()
    try:
        assets = await service.get_public_gallery_assets_with_filters(
            gallery_id=gallery_id,
            filter_type=filter_type,
            sub_gallery_id=sub_gallery_id,
        )
        return {"data": assets}
    except GalleryNotFoundError:
        raise NotFoundError("Gallery", str(gallery_id))
    except Exception as e:
        logger.exception("Failed to list filtered public gallery assets")
        raise InternalError("Failed to list assets")
