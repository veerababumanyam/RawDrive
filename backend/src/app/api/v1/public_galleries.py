"""Public Gallery API Endpoints."""
from __future__ import annotations

import logging
import os
import time
from typing import Annotated
from uuid import UUID

import httpx
from fastapi import APIRouter, Path, Query, status, Body

from app.api.schemas import (
    GalleryDetailResponse,
    ErrorResponse,
    VisitorRegisterRequest,
    FaceSearchRequest,
    FaceSearchResponse,
    FaceSearchMatch,
)
# Note: GalleryNotFoundError kept for potential future use
# Gallery service calls now use HTTP via httpx to gallery-service microservice
from app.services.visitor_service import get_visitor_service
from app.api.exceptions import AppError, NotFoundError, InternalError
from app.repositories.face_embedding_repository import get_face_embedding_repository

logger = logging.getLogger(__name__)

# Gallery service URL for proxying requests
GALLERY_SERVICE_URL = os.getenv("GALLERY_SERVICE_URL", "http://gallery-service:8004")

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
    # 1. Get gallery to verify existence and workspace via gallery-service
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{GALLERY_SERVICE_URL}/api/v1/public/galleries/{gallery_id}",
                timeout=10.0,
            )

            if response.status_code == 404:
                raise NotFoundError("Gallery", str(gallery_id))
            elif response.status_code >= 400:
                logger.error(f"Gallery service error: {response.status_code} - {response.text}")
                raise InternalError("Failed to verify gallery")

            gallery = response.json()
            workspace_id = UUID(gallery["workspace_id"])
    except httpx.RequestError as e:
        logger.exception(f"Failed to connect to gallery service: {e}")
        raise InternalError("Gallery service unavailable")

    # 2. Register visitor with UTM tracking
    visitor_service = get_visitor_service()
    try:
        # Build UTM data if any tracking parameters provided
        utm_data = {}
        if request.utm_source:
            utm_data["utm_source"] = request.utm_source
        if request.utm_medium:
            utm_data["utm_medium"] = request.utm_medium
        if request.utm_campaign:
            utm_data["utm_campaign"] = request.utm_campaign
        if request.utm_content:
            utm_data["utm_content"] = request.utm_content
        if request.utm_term:
            utm_data["utm_term"] = request.utm_term
        if request.referrer:
            utm_data["referrer"] = request.referrer

        # Merge UTM data into metadata
        metadata = request.metadata or {}
        if utm_data:
            metadata["utm"] = utm_data

        result = await visitor_service.register_visitor(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            email=request.email,
            first_name=request.first_name,
            last_name=request.last_name,
            phone=request.phone,
            address=request.address,
            metadata=metadata,
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
    """Verify PIN for protected gallery access.

    Proxies to gallery-service for verification.
    """
    pin = request.get("pin", "")
    if not pin:
        raise AppError(message="PIN is required", code="PIN_REQUIRED", status_code=400)

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{GALLERY_SERVICE_URL}/api/v1/public/galleries/{gallery_id}/verify-pin",
                json={"pin": pin},
                timeout=10.0,
            )

            if response.status_code == 404:
                raise NotFoundError("Gallery", str(gallery_id))
            elif response.status_code == 403:
                data = response.json()
                raise AppError(
                    message=data.get("detail", {}).get("message", "Gallery not published"),
                    code=data.get("detail", {}).get("error", "GALLERY_NOT_PUBLISHED"),
                    status_code=403,
                )
            elif response.status_code >= 400:
                logger.error(f"Gallery service error: {response.status_code} - {response.text}")
                raise InternalError("Failed to verify PIN")

            return response.json()
    except httpx.RequestError as e:
        logger.exception(f"Failed to connect to gallery service: {e}")
        raise InternalError("Gallery service unavailable")

@router.post(
    "/{gallery_id}/verify-password",
    status_code=status.HTTP_200_OK,
    summary="Verify gallery password",
)
async def verify_gallery_password(
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    request: dict = Body(...),
):
    """Verify password for protected gallery access.

    Proxies to gallery-service for verification.
    """
    password = request.get("password", "")
    if not password:
        raise AppError(message="Password is required", code="PASSWORD_REQUIRED", status_code=400)

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{GALLERY_SERVICE_URL}/api/v1/public/galleries/{gallery_id}/verify-password",
                json={"password": password},
                timeout=10.0,
            )

            if response.status_code == 404:
                raise NotFoundError("Gallery", str(gallery_id))
            elif response.status_code == 403:
                data = response.json()
                raise AppError(
                    message=data.get("detail", {}).get("message", "Gallery not published"),
                    code=data.get("detail", {}).get("error", "GALLERY_NOT_PUBLISHED"),
                    status_code=403,
                )
            elif response.status_code >= 400:
                logger.error(f"Gallery service error: {response.status_code} - {response.text}")
                raise InternalError("Failed to verify password")

            return response.json()
    except httpx.RequestError as e:
        logger.exception(f"Failed to connect to gallery service: {e}")
        raise InternalError("Gallery service unavailable")


# =============================================================================
# Password Reset Endpoints (US9)
# =============================================================================


@router.post(
    "/{gallery_id}/password/forgot",
    status_code=status.HTTP_200_OK,
    summary="Request gallery password reset",
)
async def request_password_reset(
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    request: dict = Body(...),
):
    """Request a password reset for a protected gallery.

    Sends a reset email to the gallery owner with a token valid for 15 minutes.
    Rate limited to 3 requests per hour per email address.
    """
    email = request.get("email", "").strip().lower()
    if not email:
        raise AppError(message="Email is required", code="EMAIL_REQUIRED", status_code=400)

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{GALLERY_SERVICE_URL}/api/v1/public/galleries/{gallery_id}/password/forgot",
                json={"email": email},
                timeout=10.0,
            )

            if response.status_code == 404:
                # Don't reveal whether gallery exists
                return {"message": "If this email is associated with the gallery, a reset link has been sent."}
            elif response.status_code == 429:
                raise AppError(
                    message="Too many reset requests. Please try again later.",
                    code="RATE_LIMIT_EXCEEDED",
                    status_code=429,
                )
            elif response.status_code >= 400:
                logger.error(f"Gallery service error: {response.status_code} - {response.text}")
                # Return success message to prevent email enumeration
                return {"message": "If this email is associated with the gallery, a reset link has been sent."}

            return response.json()
    except httpx.RequestError as e:
        logger.exception(f"Failed to connect to gallery service: {e}")
        # Return success message even on error to prevent enumeration
        return {"message": "If this email is associated with the gallery, a reset link has been sent."}


@router.post(
    "/{gallery_id}/password/reset",
    status_code=status.HTTP_200_OK,
    summary="Reset gallery password with token",
)
async def reset_gallery_password(
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    request: dict = Body(...),
):
    """Reset the gallery password using a reset token.

    The token is single-use and expires after 15 minutes.
    """
    token = request.get("token", "")
    new_password = request.get("new_password", "")

    if not token:
        raise AppError(message="Reset token is required", code="TOKEN_REQUIRED", status_code=400)
    if not new_password or len(new_password) < 6:
        raise AppError(
            message="Password must be at least 6 characters",
            code="PASSWORD_TOO_SHORT",
            status_code=400
        )

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{GALLERY_SERVICE_URL}/api/v1/public/galleries/{gallery_id}/password/reset",
                json={"token": token, "new_password": new_password},
                timeout=10.0,
            )

            if response.status_code == 404:
                raise NotFoundError("Gallery", str(gallery_id))
            elif response.status_code == 400:
                data = response.json()
                raise AppError(
                    message=data.get("detail", {}).get("message", "Invalid or expired token"),
                    code=data.get("detail", {}).get("error", "INVALID_TOKEN"),
                    status_code=400,
                )
            elif response.status_code >= 400:
                logger.error(f"Gallery service error: {response.status_code} - {response.text}")
                raise InternalError("Failed to reset password")

            return response.json()
    except httpx.RequestError as e:
        logger.exception(f"Failed to connect to gallery service: {e}")
        raise InternalError("Gallery service unavailable")


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

    # Verify gallery exists and is public via gallery-service
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{GALLERY_SERVICE_URL}/api/v1/public/galleries/{gallery_id}",
                timeout=10.0,
            )

            if response.status_code == 404:
                raise NotFoundError("Gallery", str(gallery_id))
            elif response.status_code == 403:
                raise AppError(
                    message="Gallery is not publicly accessible",
                    code="GALLERY_NOT_PUBLIC",
                    status_code=403,
                )
            elif response.status_code >= 400:
                logger.error(f"Gallery service error: {response.status_code} - {response.text}")
                raise InternalError("Failed to verify gallery")

            gallery = response.json()
    except httpx.RequestError as e:
        logger.exception(f"Failed to connect to gallery service: {e}")
        raise InternalError("Gallery service unavailable")

    # Check if face search is enabled for this gallery
    if not gallery.get("face_search_enabled", True):
        raise AppError(
            message="Face search is not available for this gallery",
            code="FACE_SEARCH_DISABLED",
            status_code=503,
        )

    # Get workspace_id from gallery for face search
    workspace_id = UUID(gallery["workspace_id"])

    try:
        # Perform vector similarity search using face embedding repository
        face_embedding_repo = get_face_embedding_repository()
        matches = await face_embedding_repo.find_similar_in_gallery(
            embedding=request.embedding,
            gallery_id=gallery_id,
            workspace_id=workspace_id,
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
    description="Get public gallery assets with optional filtering by favorites, selections, or emotion.",
    responses={
        404: {"model": ErrorResponse, "description": "Gallery not found"},
    },
)
async def list_public_gallery_assets_filtered(
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    filter_type: Annotated[str | None, Query(description="Filter: 'favorites', 'selections', or None for all")] = None,
    sub_gallery_id: Annotated[UUID | None, Query(description="Optional sub-gallery filter")] = None,
    emotion: Annotated[str | None, Query(description="Filter by emotion: joy, sadness, anger, surprise, fear, disgust, contentment")] = None,
    min_emotion_confidence: Annotated[float, Query(ge=0.0, le=1.0, description="Minimum emotion confidence threshold")] = 0.7,
) -> dict:
    """List visible assets for a public gallery with optional filtering.

    This endpoint supports the workflow tabs UI:
    - All photos (no filter)
    - Favorites (filter_type='favorites')
    - Selections/Picks (filter_type='selections')

    Additionally supports emotion-based filtering:
    - emotion: joy, sadness, anger, surprise, fear, disgust, contentment
    - min_emotion_confidence: Minimum confidence threshold (0.0 to 1.0, default 0.7)
    """
    # Validate emotion parameter if provided
    if emotion:
        valid_emotions = {"joy", "sadness", "anger", "surprise", "fear", "disgust", "contentment"}
        if emotion.lower() not in valid_emotions:
            raise AppError(
                message=f"Invalid emotion: {emotion}. Must be one of: {', '.join(valid_emotions)}",
                code="INVALID_EMOTION",
                status_code=400,
            )

    service = get_gallery_service()
    try:
        assets = await service.get_public_gallery_assets_with_filters(
            gallery_id=gallery_id,
            filter_type=filter_type,
            sub_gallery_id=sub_gallery_id,
            emotion=emotion.lower() if emotion else None,
            min_emotion_confidence=min_emotion_confidence if emotion else None,
        )
        return {"data": assets}
    except GalleryNotFoundError:
        raise NotFoundError("Gallery", str(gallery_id))
    except Exception as e:
        logger.exception("Failed to list filtered public gallery assets")
        raise InternalError("Failed to list assets")
