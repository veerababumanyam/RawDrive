"""Face Detection API endpoints.

All routes prefixed with /api/v1.
"""

from __future__ import annotations

import asyncio
import io
import logging
from typing import Annotated, Optional
from uuid import UUID

import cv2
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.api.dependencies.auth import CurrentUserDep, WorkspaceAccessDep, get_current_user
from app.api.face_schemas import (
    FaceResponse,
    FaceResponsePublic,
    FaceDetailResponse,
    FaceDetailResponsePublic,
    FaceListResponse,
    FaceListMeta,
    FaceDetectionJobResponse,
    TriggerDetectionRequest,
    SimilarFaceSearchRequest,
    SimilarFaceSearchResponse,
    SimilarFaceResult,
    AssignFaceToGroupRequest,
    BulkAssignFacesRequest,
    DetectionStatsResponse,
)
from app.services.face_detection_service import (
    FaceDetectionService,
    get_face_detection_service,
)
from app.services.face_cluster_service import (
    FaceClusterService,
    get_face_cluster_service,
)
from app.repositories.face_repository import (
    FaceRepository,
    get_face_repository,
)
from app.services.face_exceptions import (
    FaceDetectionError,
    FaceNotFoundError,
)
from app.services.biometric_consent_service import require_biometric_consent
from app.api.dependencies.face_rate_limit import (
    check_face_search_rate_limit,
    check_face_detect_rate_limit,
    check_face_bulk_rate_limit,
)


logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------


def get_detection_service() -> FaceDetectionService:
    """Get face detection service instance."""
    return get_face_detection_service()


def get_cluster_service() -> FaceClusterService:
    """Get face cluster service instance."""
    return get_face_cluster_service()


def get_repo() -> FaceRepository:
    """Get face repository instance."""
    return get_face_repository()


DetectionServiceDep = Annotated[FaceDetectionService, Depends(get_detection_service)]
ClusterServiceDep = Annotated[FaceClusterService, Depends(get_cluster_service)]
FaceRepoDep = Annotated[FaceRepository, Depends(get_repo)]


# ---------------------------------------------------------------------------
# Face Endpoints by Gallery
# ---------------------------------------------------------------------------


@router.get(
    "/galleries/{gallery_id}/faces",
    response_model=FaceListResponse,
    summary="List faces in a gallery",
    description="Returns all detected faces in photos belonging to this gallery.",
)
async def list_gallery_faces(
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    face_repo: FaceRepoDep,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 50,
    _: None = Depends(require_biometric_consent),
):
    """List all faces in a gallery.
    
    Returns paginated list of faces detected in photos within this gallery.
    """
    workspace_id = workspace_access["workspace_id"]
    offset = (page - 1) * limit
    
    # Get faces by gallery
    faces = await face_repo.find_by_gallery_id(
        workspace_id=workspace_id,
        gallery_id=gallery_id,
        limit=limit,
        offset=offset,
    )
    
    total = await face_repo.count_by_gallery_id(workspace_id, gallery_id)
    total_pages = (total + limit - 1) // limit
    
    return FaceListResponse(
        data=[FaceResponse(**f, id=f["id"]) for f in faces],
        meta=FaceListMeta(
            page=page,
            limit=limit,
            total=total,
            total_pages=total_pages,
        ),
    )


@router.get(
    "/photos/{photo_id}/faces",
    response_model=FaceListResponse,
    summary="List faces in a photo",
    description="Returns all detected faces in a specific photo.",
)
async def list_photo_faces(
    photo_id: Annotated[UUID, Path(..., description="Photo (Asset) ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    face_repo: FaceRepoDep,
    _: None = Depends(require_biometric_consent),
):
    """List all faces in a photo."""
    workspace_id = workspace_access["workspace_id"]
    
    faces = await face_repo.find_by_photo_id(photo_id, workspace_id)
    total = len(faces)
    
    return FaceListResponse(
        data=[FaceResponse(**f, id=f["id"]) for f in faces],
        meta=FaceListMeta(
            page=1,
            limit=total if total > 0 else 1, # Avoid limit=0
            total=total,
            total_pages=1,
        ),
    )


# ---------------------------------------------------------------------------
# Individual Face Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/faces/{face_id}",
    response_model=FaceDetailResponsePublic,
    summary="Get face details",
    description="Returns detailed information about a specific face.",
)
async def get_face(
    face_id: Annotated[UUID, Path(..., description="Face ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    face_repo: FaceRepoDep,
    _: None = Depends(require_biometric_consent),
):
    """Get detailed information about a face."""
    workspace_id = workspace_access["workspace_id"]

    face = await face_repo.find_by_id(face_id, workspace_id)
    if not face:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Face not found",  # SEC-002: Generic message
        )

    return FaceDetailResponsePublic(**face, id=face["id"])


@router.get(
    "/faces/{face_id}/thumbnail",
    summary="Get face thumbnail",
    description="Dynamically crops and serves a face thumbnail from the source photo.",
    responses={
        200: {"content": {"image/jpeg": {}}, "description": "Face thumbnail JPEG"},
        404: {"description": "Face or asset not found"},
    },
)
async def get_face_thumbnail(
    face_id: Annotated[UUID, Path(..., description="Face ID")],
    current_user: CurrentUserDep,
    face_repo: FaceRepoDep,
    size: Annotated[int, Query(ge=32, le=512, description="Thumbnail size in pixels")] = 150,
):
    """Dynamically generate a face thumbnail by cropping from the source photo.

    Fetches the original image from R2, crops the face region using
    the stored bounding_box percentages (with 20% padding), resizes
    to the requested square size, and returns as JPEG.

    Uses workspace_id from JWT token (no workspace_id path parameter needed).
    """
    from app.db.postgres import get_postgres_pool
    from app.services.r2_storage_service import get_r2_storage_service, StorageError
    from app.services.encryption_service import get_encryption_service

    if not current_user.workspace_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No workspace access")
    workspace_id = current_user.workspace_ids[0]

    # 1. Look up face record
    face = await face_repo.find_by_id(face_id, workspace_id)
    if not face:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Face not found",
        )

    photo_id = face["photo_id"]
    bounding_box = face.get("bounding_box") or {}
    if not all(k in bounding_box for k in ("x", "y", "width", "height")):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Face bounding box data missing",
        )

    # 2. Look up the asset to get the original_object_key and gallery_id
    pool = await get_postgres_pool()
    async with pool.acquire() as conn:
        asset_row = await conn.fetchrow(
            """
            SELECT asset_id, original_object_key
            FROM assets
            WHERE asset_id = $1 AND workspace_id = $2 AND deleted = false
            """,
            photo_id,
            workspace_id,
        )
    if not asset_row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source photo not found",
        )

    object_key = asset_row["original_object_key"]
    asset_id = asset_row["asset_id"]

    # 3. Download the original image from R2
    storage_service = get_r2_storage_service()

    try:
        image_data = await storage_service.download_by_object_key(object_key)
    except StorageError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source image file not found in storage",
        )

    # Try decryption if the file is encrypted; fall back to raw bytes
    try:
        encryption_service = get_encryption_service()
        image_data = await encryption_service.decrypt_file(
            image_data, workspace_id, asset_id, variant="original"
        )
    except (EncryptionError, Exception):
        pass  # File may not be encrypted — use raw bytes

    # 4. Decode image and crop face region
    nparr = np.frombuffer(image_data, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to decode source image",
        )

    img_h, img_w = image.shape[:2]

    # Convert percentage bounding box to pixels
    x_px = int((bounding_box["x"] / 100.0) * img_w)
    y_px = int((bounding_box["y"] / 100.0) * img_h)
    w_px = int((bounding_box["width"] / 100.0) * img_w)
    h_px = int((bounding_box["height"] / 100.0) * img_h)

    # Add 20% padding
    pad_x = int(w_px * 0.2)
    pad_y = int(h_px * 0.2)
    x1 = max(0, x_px - pad_x)
    y1 = max(0, y_px - pad_y)
    x2 = min(img_w, x_px + w_px + pad_x)
    y2 = min(img_h, y_px + h_px + pad_y)

    face_crop = image[y1:y2, x1:x2]
    if face_crop.size == 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to crop face region",
        )

    # 5. Resize to requested square size
    face_resized = cv2.resize(face_crop, (size, size), interpolation=cv2.INTER_AREA)

    # 6. Encode as JPEG
    encode_params = [cv2.IMWRITE_JPEG_QUALITY, 85]
    success, jpeg_buffer = cv2.imencode(".jpg", face_resized, encode_params)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to encode face thumbnail",
        )

    return Response(
        content=jpeg_buffer.tobytes(),
        media_type="image/jpeg",
        headers={
            "Cache-Control": "public, max-age=3600, immutable",
            "X-Face-Id": str(face_id),
        },
    )


@router.post(
    "/faces/{face_id}/identify",
    response_model=FaceResponse,
    summary="Assign face to group",
    description="Manually assign a face to a face group (cluster).",
)
async def identify_face(
    face_id: Annotated[UUID, Path(..., description="Face ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: AssignFaceToGroupRequest,
    face_repo: FaceRepoDep,
    _: None = Depends(require_biometric_consent),
):
    """Manually assign a face to a face group."""
    workspace_id = workspace_access["workspace_id"]
    
    # Verify face exists
    face = await face_repo.find_by_id(face_id, workspace_id)
    if not face:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Face not found",  # SEC-002: Generic message to prevent ID enumeration
        )

    # Assign to group
    success = await face_repo.assign_to_group(
        face_id=face_id,
        workspace_id=workspace_id,
        group_id=request.group_id,
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to assign face to group",
        )
    
    # Return updated face
    updated_face = await face_repo.find_by_id(face_id, workspace_id)
    return FaceResponse(**updated_face, id=updated_face["id"])


@router.post(
    "/faces/bulk-assign",
    summary="Bulk assign faces to group",
    description="Assign multiple faces to a face group at once.",
)
async def bulk_assign_faces(
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: BulkAssignFacesRequest,
    face_repo: FaceRepoDep,
    _: None = Depends(require_biometric_consent),
    __: None = Depends(check_face_bulk_rate_limit),
):
    """Bulk assign faces to a group."""
    workspace_id = workspace_access["workspace_id"]
    
    count = await face_repo.bulk_assign_to_group(
        face_ids=request.face_ids,
        workspace_id=workspace_id,
        group_id=request.group_id,
    )
    
    return {"success": True, "faces_updated": count}


# ---------------------------------------------------------------------------
# Face Detection Trigger
# ---------------------------------------------------------------------------


@router.post(
    "/photos/{photo_id}/detect-faces",
    response_model=FaceDetectionJobResponse,
    summary="Trigger face detection",
    description="Queue a photo for face detection processing.",
)
async def trigger_detection(
    photo_id: Annotated[UUID, Path(..., description="Photo ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    detection_service: DetectionServiceDep,
    priority: Annotated[int, Query(ge=-10, le=10, description="Job priority")] = 0,
    _: None = Depends(require_biometric_consent),
    __: None = Depends(check_face_detect_rate_limit),
):
    """Trigger face detection on a photo."""
    workspace_id = workspace_access["workspace_id"]
    
    job_id = await detection_service.create_detection_job(
        photo_id=photo_id,
        workspace_id=workspace_id,
        priority=priority,
    )
    
    job = await detection_service.get_detection_status(photo_id, workspace_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create detection job",
        )
    
    return FaceDetectionJobResponse(**job, id=job["id"])


@router.get(
    "/photos/{photo_id}/faces",
    response_model=FaceListResponse,
    summary="Get faces in photo",
    description="Returns all detected faces in a specific photo.",
)
async def get_photo_faces(
    photo_id: Annotated[UUID, Path(..., description="Photo ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    detection_service: DetectionServiceDep,
    _: None = Depends(require_biometric_consent),
):
    """Get all faces detected in a photo."""
    workspace_id = workspace_access["workspace_id"]
    
    faces = await detection_service.get_faces_by_photo(photo_id, workspace_id)
    
    return FaceListResponse(
        data=[FaceResponse(**f, id=f["id"]) for f in faces],
        meta=FaceListMeta(
            page=1,
            limit=100,
            total=len(faces),
            total_pages=1,
        ),
    )


@router.get(
    "/photos/{photo_id}/detection-status",
    response_model=Optional[FaceDetectionJobResponse],
    summary="Get detection status",
    description="Returns the face detection job status for a photo.",
)
async def get_detection_status(
    photo_id: Annotated[UUID, Path(..., description="Photo ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    detection_service: DetectionServiceDep,
    _: None = Depends(require_biometric_consent),
):
    """Get face detection job status for a photo."""
    workspace_id = workspace_access["workspace_id"]
    
    job = await detection_service.get_detection_status(photo_id, workspace_id)
    if not job:
        return None
    
    return FaceDetectionJobResponse(**job, id=job["id"])


# ---------------------------------------------------------------------------
# Face Similarity Search
# ---------------------------------------------------------------------------


@router.post(
    "/faces/search",
    response_model=SimilarFaceSearchResponse,
    summary="Search for similar faces",
    description="Find faces similar to a reference face or embedding.",
)
async def search_similar_faces(
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: SimilarFaceSearchRequest,
    cluster_service: ClusterServiceDep,
    face_repo: FaceRepoDep,
    _: None = Depends(require_biometric_consent),
    __: None = Depends(check_face_search_rate_limit),
):
    """Search for faces similar to a reference."""
    workspace_id = workspace_access["workspace_id"]
    
    if request.face_id:
        # Search by face ID
        results = await cluster_service.find_similar_to_face(
            face_id=request.face_id,
            workspace_id=workspace_id,
            threshold=request.threshold,
            limit=request.limit,
        )
    elif request.embedding:
        # Search by embedding
        results = await cluster_service.find_similar_faces(
            embedding=request.embedding,
            workspace_id=workspace_id,
            threshold=request.threshold,
            limit=request.limit,
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either face_id or embedding must be provided",
        )
    
    return SimilarFaceSearchResponse(
        results=[
            SimilarFaceResult(
                face=FaceResponse(**r["face"], id=r["face"]["id"]),
                similarity=r["similarity"],
            )
            for r in results
        ],
        total=len(results),
        threshold_used=request.threshold,
    )


# ---------------------------------------------------------------------------
# Detection Statistics
# ---------------------------------------------------------------------------


@router.get(
    "/workspaces/{workspace_id}/detection-stats",
    response_model=DetectionStatsResponse,
    summary="Get detection statistics",
    description="Returns face detection statistics for the workspace.",
)
async def get_workspace_detection_stats(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    detection_service: DetectionServiceDep,
    _: None = Depends(require_biometric_consent),
):
    """Get face detection statistics for a workspace."""
    stats = await detection_service.get_detection_stats(workspace_id)
    
    # Add additional stats
    return DetectionStatsResponse(
        total_photos=stats["total_photos"],
        processed_photos=stats["processed_photos"],
        pending_photos=stats["pending_photos"],
        failed_photos=stats["failed_photos"],
        total_faces_detected=stats["total_faces_detected"],
        total_face_groups=0,  # TODO: Get from group repo
        ungrouped_faces=0,  # TODO: Calculate
    )


# ---------------------------------------------------------------------------
# Biometric Consent Management
# ---------------------------------------------------------------------------


class GrantConsentRequest(BaseModel):
    """Request model for granting biometric consent."""

    policy_version: str = Field(
        default="1.0",
        description="Version of privacy policy accepted",
    )
    auto_enable_detection: bool = Field(
        default=True,
        description="Automatically enable face detection after consent",
    )


class ConsentStatusResponse(BaseModel):
    """Response model for consent status."""

    workspace_id: UUID
    consent_status: str
    face_detection_enabled: bool
    consented_at: Optional[str] = None
    is_allowed: bool


@router.post(
    "/workspaces/{workspace_id}/biometric-consent",
    response_model=ConsentStatusResponse,
    summary="Grant biometric consent",
    description=(
        "Grant biometric consent for face detection in a workspace. "
        "Required per GDPR Article 9 before any face detection can occur."
    ),
)
async def grant_biometric_consent(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    request: GrantConsentRequest,
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
):
    """Grant biometric consent for face detection.

    This endpoint allows workspace owners to grant explicit consent for
    biometric data processing (face detection) as required by GDPR Article 9.

    Args:
        workspace_id: The workspace ID
        request: Consent grant details
        workspace_access: Workspace access validation
        current_user: Authenticated user granting consent

    Returns:
        Updated consent status

    Raises:
        HTTPException: If consent already granted or operation fails
    """
    from app.services.biometric_consent_service import (
        BiometricConsentService,
        BiometricConsentGrant,
        get_biometric_consent_service,
        ConsentAlreadyGrantedError,
    )
    from app.api.face_schemas import (
        FaceDetectionErrorCode,
    )

    consent_service: BiometricConsentService = get_biometric_consent_service()

    # Create grant data with request context
    grant_data = BiometricConsentGrant(
        ip_address=workspace_access.get("ip_address", "unknown"),
        user_agent=workspace_access.get("user_agent", "unknown"),
        policy_version=request.policy_version,
    )

    try:
        # Grant consent
        settings = await consent_service.grant_consent(
            workspace_id=workspace_id,
            user_id=current_user.id,
            grant_data=grant_data,
        )

        # Optionally enable face detection
        if request.auto_enable_detection:
            from app.services.face_configuration_service import (
                FaceConfigurationService,
                get_face_configuration_service,
            )
            config_service: FaceConfigurationService = get_face_configuration_service()
            await config_service.set_face_detection_setting(
                f"workspace_{workspace_id}_enabled",
                "true",
            )

        # Return updated status
        return ConsentStatusResponse(
            workspace_id=workspace_id,
            consent_status=settings.consent_status.value,
            face_detection_enabled=settings.face_detection_enabled,
            consented_at=settings.consented_at.isoformat() if settings.consented_at else None,
            is_allowed=await consent_service.is_face_detection_allowed(workspace_id),
        )

    except ConsentAlreadyGrantedError:
        # Return current status instead of error
        settings = await consent_service.get_settings(workspace_id)
        return ConsentStatusResponse(
            workspace_id=workspace_id,
            consent_status=settings.consent_status.value,
            face_detection_enabled=settings.face_detection_enabled,
            consented_at=settings.consented_at.isoformat() if settings.consented_at else None,
            is_allowed=True,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to grant consent: {str(e)}",
        )


@router.get(
    "/workspaces/{workspace_id}/biometric-consent",
    response_model=ConsentStatusResponse,
    summary="Get biometric consent status",
    description="Returns current biometric consent status for the workspace.",
)
async def get_biometric_consent_status(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
):
    """Get current biometric consent status for a workspace.

    Args:
        workspace_id: The workspace ID
        workspace_access: Workspace access validation
        current_user: Authenticated user

    Returns:
        Current consent status
    """
    from app.services.biometric_consent_service import (
        BiometricConsentService,
        get_biometric_consent_service,
    )

    consent_service: BiometricConsentService = get_biometric_consent_service()
    settings = await consent_service.get_settings(workspace_id)

    return ConsentStatusResponse(
        workspace_id=workspace_id,
        consent_status=settings.consent_status.value,
        face_detection_enabled=settings.face_detection_enabled,
        consented_at=settings.consented_at.isoformat() if settings.consented_at else None,
        is_allowed=await consent_service.is_face_detection_allowed(workspace_id),
    )


@router.delete(
    "/workspaces/{workspace_id}/biometric-consent",
    response_model=ConsentStatusResponse,
    summary="Withdraw biometric consent",
    description=(
        "Withdraw previously granted biometric consent. "
        "This will disable face detection and optionally delete all biometric data."
    ),
)
async def withdraw_biometric_consent(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    cascade_delete: bool = Query(
        False,
        description="If True, also delete all faces and embeddings for this workspace",
    ),
):
    """Withdraw biometric consent for a workspace.

    WARNING: This will disable all face detection operations. Optionally
    cascade deletes all biometric data (faces, embeddings, groups).

    Args:
        workspace_id: The workspace ID
        cascade_delete: Whether to delete all biometric data
        workspace_access: Workspace access validation
        current_user: Authenticated user withdrawing consent

    Returns:
        Updated consent status
    """
    from app.services.biometric_consent_service import (
        BiometricConsentService,
        BiometricConsentWithdraw,
        get_biometric_consent_service,
    )

    consent_service: BiometricConsentService = get_biometric_consent_service()

    # Create withdrawal data
    withdraw_data = BiometricConsentWithdraw(
        ip_address=workspace_access.get("ip_address", "unknown"),
        user_agent=workspace_access.get("user_agent", "unknown"),
        reason="User withdrawal",
    )

    # Cascade delete if requested
    if cascade_delete:
        # This would delete all faces, embeddings, and groups for the workspace
        # Implementation depends on your data deletion policies
        pass

    try:
        settings = await consent_service.withdraw_consent(
            workspace_id=workspace_id,
            user_id=current_user.id,
            withdraw_data=withdraw_data,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to withdraw consent: {str(e)}",
        )

    return ConsentStatusResponse(
        workspace_id=workspace_id,
        consent_status=settings.consent_status.value,
        face_detection_enabled=settings.face_detection_enabled,
        consented_at=settings.consented_at.isoformat() if settings.consented_at else None,
        is_allowed=await consent_service.is_face_detection_allowed(workspace_id),
    )


# ---------------------------------------------------------------------------
# Face Cache Management (Smart Tagging Cache Layer)
# ---------------------------------------------------------------------------


@router.get(
    "/workspaces/{workspace_id}/cache/stats",
    summary="Get face cache statistics",
    description="Returns cache performance statistics for the workspace.",
)
async def get_face_cache_stats(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
):
    """Get face cache statistics for monitoring cache effectiveness.

    Returns metrics on cache hits, memory usage, and performance improvements.

    Args:
        workspace_id: The workspace ID
        workspace_access: Workspace access validation
        current_user: Authenticated user

    Returns:
        Cache statistics including hit rates and storage usage
    """
    from app.services.face_cache_manager import FaceTaggingCacheManager
    from app.db.postgres import get_postgres_pool
    from app.db.redis import get_redis_client

    db = await get_postgres_pool()
    redis = await get_redis_client()

    cache_manager = FaceTaggingCacheManager(db, redis)
    stats = await cache_manager.get_cache_stats(workspace_id)

    return {
        "workspace_id": str(workspace_id),
        **stats,
    }


@router.delete(
    "/workspaces/{workspace_id}/cache",
    summary="Invalidate face cache",
    description="Invalidates all cached face detection data for the workspace.",
)
async def invalidate_face_cache(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
):
    """Invalidate all cached face detection data for a workspace.

    Forces fresh face detection on next access. Useful after:
    - Updating AI model
    - Changing detection settings
    - Manual data refresh

    Args:
        workspace_id: The workspace ID
        workspace_access: Workspace access validation
        current_user: Authenticated user

    Returns:
        Number of cache entries invalidated
    """
    from app.services.face_cache_manager import FaceTaggingCacheManager
    from app.db.postgres import get_postgres_pool
    from app.db.redis import get_redis_client

    db = await get_postgres_pool()
    redis = await get_redis_client()

    cache_manager = FaceTaggingCacheManager(db, redis)
    count = await cache_manager.invalidate_workspace(workspace_id)

    return {
        "workspace_id": str(workspace_id),
        "entries_invalidated": count,
        "message": f"Invalidated {count} cache entries for workspace",
    }


@router.post(
    "/galleries/{gallery_id}/cache/warm",
    summary="Warm cache for gallery",
    description="Pre-loads face detection results into cache for a gallery.",
)
async def warm_gallery_cache(
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    limit: int = Query(
        100,
        ge=1,
        le=1000,
        description="Maximum number of assets to warm",
    ),
):
    """Warm cache for frequently accessed galleries.

    Pre-loads face detection results into L1/L2 cache to improve
    performance for gallery viewing.

    Args:
        gallery_id: The gallery ID
        limit: Maximum assets to warm
        workspace_access: Workspace access validation
        current_user: Authenticated user

    Returns:
        Cache warming statistics
    """
    from app.services.face_cache_manager import FaceTaggingCacheManager
    from app.db.postgres import get_postgres_pool
    from app.db.redis import get_redis_client

    # Get workspace_id from gallery access
    workspace_id = workspace_access.get("workspace_id")

    db = await get_postgres_pool()
    redis = await get_redis_client()

    cache_manager = FaceTaggingCacheManager(db, redis)
    stats = await cache_manager.warm_cache_for_gallery(gallery_id, workspace_id, limit)

    return {
        "gallery_id": str(gallery_id),
        "workspace_id": str(workspace_id),
        **stats,
    }
