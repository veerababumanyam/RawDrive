"""Face Detection API endpoints.

All routes prefixed with /api/v1.
"""

from __future__ import annotations

import logging
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from pydantic import BaseModel, Field

from app.api.dependencies.auth import CurrentUserDep, WorkspaceAccessDep
from app.api.face_schemas import (
    FaceResponse,
    FaceDetailResponse,
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
    response_model=FaceDetailResponse,
    summary="Get face details",
    description="Returns detailed information about a specific face.",
)
async def get_face(
    face_id: Annotated[UUID, Path(..., description="Face ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    face_repo: FaceRepoDep,
):
    """Get detailed information about a face."""
    workspace_id = workspace_access["workspace_id"]
    
    face = await face_repo.find_by_id(face_id, workspace_id)
    if not face:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Face {face_id} not found",
        )
    
    return FaceDetailResponse(**face, id=face["id"])


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
):
    """Manually assign a face to a face group."""
    workspace_id = workspace_access["workspace_id"]
    
    # Verify face exists
    face = await face_repo.find_by_id(face_id, workspace_id)
    if not face:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Face {face_id} not found",
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
