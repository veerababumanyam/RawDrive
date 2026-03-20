"""Public Gallery API Endpoints."""
from __future__ import annotations

import logging
import os
import time
from typing import Annotated
from uuid import UUID

import httpx
from fastapi import APIRouter, File, Path, Query, UploadFile, status, Body

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
from app.services.biometric_consent_service import get_biometric_consent_service
from app.api.dependencies.face_rate_limit import _check_face_rate_limit
from app.services.rate_limit_service import RateLimitType
from app.repositories.face_rate_limit_repository import get_face_rate_limit_repository

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
    summary="Search gallery by face embedding (legacy/authenticated)",
    description="""
    Search for photos containing a specific face using a pre-computed embedding.

    **Important:** This endpoint requires a 512-dimensional embedding generated
    by the same ArcFace model used during photo ingestion. Using embeddings from
    a different model (e.g., 128-dim face-api.js) will produce incorrect results
    due to incompatible embedding spaces.

    For public/browser-based search, prefer the `/face-search-by-image` endpoint
    which accepts an image upload and generates the embedding server-side,
    guaranteeing embedding-space consistency.

    This endpoint is retained as a fallback for authenticated API consumers
    that generate embeddings using the correct model.
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

    # COM-001: Enforce biometric consent check (Public Search)
    consent_service = get_biometric_consent_service()
    await consent_service.check_public_search_consent(workspace_id)

    # SEC-001: Apply rate limiting
    rate_limit_repo = get_face_rate_limit_repository()
    await _check_face_rate_limit(
        workspace_id=workspace_id,
        limit_type=RateLimitType.FACE_SEARCH,
        operation_name="search",
        rate_limit_repo=rate_limit_repo,
    )

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


# Maximum upload size for face search images (5 MB)
_MAX_FACE_IMAGE_BYTES = 5 * 1024 * 1024

# Allowed MIME types for face search images
_ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}


@router.post(
    "/{gallery_id}/face-search-by-image",
    response_model=FaceSearchResponse,
    status_code=status.HTTP_200_OK,
    summary="Search gallery by face image upload",
    description="""
    Search for photos containing a specific face by uploading a reference image.

    The server detects the face in the uploaded image, generates a 512-dimensional
    embedding using the same AI model used during photo ingestion, and performs
    similarity search against gallery faces. This guarantees embedding-space
    consistency (no dimension mismatch).

    Accepts multipart/form-data with a single image file (JPEG, PNG, or WebP, max 5 MB).
    Optional query parameters control similarity threshold and result limit.
    """,
    responses={
        400: {"model": ErrorResponse, "description": "No face detected or invalid image"},
        404: {"model": ErrorResponse, "description": "Gallery not found"},
        413: {"model": ErrorResponse, "description": "Image too large"},
        503: {"model": ErrorResponse, "description": "Face search not available"},
    },
)
async def search_gallery_by_face_image(
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    file: UploadFile = File(..., description="Reference face image (JPEG/PNG/WebP, max 5 MB)"),
    threshold: Annotated[float, Query(ge=0.3, le=0.95, description="Similarity threshold")] = 0.6,
    limit: Annotated[int, Query(ge=1, le=100, description="Max results")] = 50,
) -> FaceSearchResponse:
    """Search for photos matching a face in the uploaded image.

    Pipeline:
    1. Validate image (type, size)
    2. Verify gallery exists and is public
    3. Check biometric consent & rate limits
    4. Detect face in uploaded image using local ArcFace model
    5. Generate 512-dim embedding (same model used during ingestion)
    6. Run pgvector cosine similarity search
    7. Return matching photos
    """
    start_time = time.time()

    # --- 1. Validate uploaded file ---
    content_type = file.content_type or ""
    if content_type not in _ALLOWED_IMAGE_TYPES:
        raise AppError(
            message=f"Unsupported image type: {content_type}. Use JPEG, PNG, or WebP.",
            code="INVALID_IMAGE_TYPE",
            status_code=400,
        )

    image_bytes = await file.read()
    if len(image_bytes) > _MAX_FACE_IMAGE_BYTES:
        raise AppError(
            message="Image too large. Maximum size is 5 MB.",
            code="IMAGE_TOO_LARGE",
            status_code=413,
        )

    if len(image_bytes) == 0:
        raise AppError(
            message="Empty image file.",
            code="EMPTY_IMAGE",
            status_code=400,
        )

    # --- 2. Verify gallery exists and is public ---
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

    if not gallery.get("face_search_enabled", True):
        raise AppError(
            message="Face search is not available for this gallery",
            code="FACE_SEARCH_DISABLED",
            status_code=503,
        )

    workspace_id = UUID(gallery["workspace_id"])

    # --- 3. Biometric consent & rate limiting ---
    consent_service = get_biometric_consent_service()
    await consent_service.check_public_search_consent(workspace_id)

    rate_limit_repo = get_face_rate_limit_repository()
    await _check_face_rate_limit(
        workspace_id=workspace_id,
        limit_type=RateLimitType.FACE_SEARCH,
        operation_name="search_by_image",
        rate_limit_repo=rate_limit_repo,
    )

    # --- 4 & 5. Detect face and generate embedding ---
    try:
        import cv2
        import numpy as np
        from app.services.ai.face_embedder import get_face_embedder

        # Decode image
        nparr = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if image is None:
            raise AppError(
                message="Could not decode image. Please upload a valid JPEG, PNG, or WebP.",
                code="IMAGE_DECODE_FAILED",
                status_code=400,
            )

        # Use OpenCV's DNN face detector to find faces
        # We'll use a simple approach: if the image looks like a cropped face
        # (sent from the frontend face crop), pass it directly to the embedder.
        # Otherwise, detect faces first.
        h, w = image.shape[:2]

        embedder = get_face_embedder()
        if not await embedder.ensure_initialized():
            raise AppError(
                message="Face recognition model is not available. Please try again later.",
                code="MODEL_UNAVAILABLE",
                status_code=503,
            )

        # Try to detect faces using OpenCV Haar cascade as a lightweight detector
        face_cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        face_cascade = cv2.CascadeClassifier(face_cascade_path)
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        detected_faces = face_cascade.detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30)
        )

        if len(detected_faces) > 0:
            # Use the largest detected face
            areas = [fw * fh for (_, _, fw, fh) in detected_faces]
            largest_idx = areas.index(max(areas))
            fx, fy, fw, fh = detected_faces[largest_idx]

            # Add padding (20%) for better embedding quality
            pad_w = int(fw * 0.2)
            pad_h = int(fh * 0.2)
            fx = max(0, fx - pad_w)
            fy = max(0, fy - pad_h)
            fw = min(w - fx, fw + 2 * pad_w)
            fh = min(h - fy, fh + 2 * pad_h)

            face_crop = image[fy : fy + fh, fx : fx + fw]
        else:
            # No face detected by Haar — assume the image IS a face crop
            # (e.g., the frontend already cropped to the face bounding box)
            face_crop = image

        # Generate 512-dim embedding using the same ArcFace model
        embedding = await embedder.generate_embedding(face_crop)

        if embedding is None:
            raise AppError(
                message="No face detected in the uploaded image. Please try a clearer photo.",
                code="NO_FACE_DETECTED",
                status_code=400,
            )

    except AppError:
        raise
    except Exception as e:
        logger.exception("Face detection/embedding generation failed")
        raise InternalError("Face detection failed. Please try again.")

    # --- 6. Similarity search ---
    try:
        face_embedding_repo = get_face_embedding_repository()
        matches = await face_embedding_repo.find_similar_in_gallery(
            embedding=embedding,
            gallery_id=gallery_id,
            workspace_id=workspace_id,
            threshold=threshold,
            limit=limit,
        )

        query_time_ms = (time.time() - start_time) * 1000

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
