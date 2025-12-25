"""Face Group API endpoints.

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
    FaceGroupResponse,
    FaceGroupDetailResponse,
    FaceGroupListResponse,
    FaceGroupGalleryStats,
    FaceGroupGalleryStatsListResponse,
    FaceGroupUpdate,
    FaceListMeta,
    MergeFaceGroupsRequest,
    SplitFaceGroupRequest,
    FaceGroupCreate,
)
from app.services.face_cluster_service import (
    FaceClusterService,
    get_face_cluster_service,
)
from app.repositories.face_group_repository import (
    FaceGroupRepository,
    get_face_group_repository,
)
from app.repositories.face_repository import (
    FaceRepository,
    get_face_repository,
)
from app.services.face_exceptions import (
    FaceGroupNotFoundError,
    InvalidMergeOperationError,
    InvalidSplitOperationError,
)


logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------


def get_cluster_service() -> FaceClusterService:
    """Get face cluster service instance."""
    return get_face_cluster_service()


def get_group_repo() -> FaceGroupRepository:
    """Get face group repository instance."""
    return get_face_group_repository()


def get_face_repo() -> FaceRepository:
    """Get face repository instance."""
    return get_face_repository()


ClusterServiceDep = Annotated[FaceClusterService, Depends(get_cluster_service)]
GroupRepoDep = Annotated[FaceGroupRepository, Depends(get_group_repo)]
FaceRepoDep = Annotated[FaceRepository, Depends(get_face_repo)]


# ---------------------------------------------------------------------------
# Face Group CRUD
# ---------------------------------------------------------------------------


@router.get(
    "/workspaces/{workspace_id}/face-groups",
    response_model=FaceGroupListResponse,
    summary="List face groups",
    description="Returns all face groups (clusters) in the workspace.",
)
async def list_face_groups(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    group_repo: GroupRepoDep,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 50,
    order_by: Annotated[str, Query(description="Sort field")] = "face_count",
    order_desc: Annotated[bool, Query(description="Sort descending")] = True,
):
    """List all face groups in a workspace."""
    offset = (page - 1) * limit
    
    groups = await group_repo.find_by_workspace(
        workspace_id=workspace_id,
        limit=limit,
        offset=offset,
        order_by=order_by,
        order_desc=order_desc,
    )
    
    total = await group_repo.count_by_workspace(workspace_id)
    total_pages = (total + limit - 1) // limit if total > 0 else 1
    
    return FaceGroupListResponse(
        data=[FaceGroupResponse(**g, id=g["id"]) for g in groups],
        meta=FaceListMeta(
            page=page,
            limit=limit,
            total=total,
            total_pages=total_pages,
        ),
    )


@router.get(
    "/galleries/{gallery_id}/face-groups",
    response_model=FaceGroupGalleryStatsListResponse,
    summary="List face groups in a gallery",
    description="Returns face groups that appear in a specific gallery, with gallery-specific statistics.",
)
async def list_gallery_face_groups(
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    group_repo: GroupRepoDep,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 50,
):
    """List face groups for a gallery."""
    workspace_id = workspace_access["workspace_id"]
    offset = (page - 1) * limit
    
    # 1. Get groups with stats
    groups_data = await group_repo.find_by_gallery_id_with_stats(
        workspace_id=workspace_id,
        gallery_id=gallery_id,
        limit=limit,
        offset=offset,
    )
    
    # 2. Get total count
    total = await group_repo.count_by_gallery_id(workspace_id, gallery_id)
    total_pages = (total + limit - 1) // limit if total > 0 else 1
    
    return FaceGroupGalleryStatsListResponse(
        data=[FaceGroupGalleryStats(**g, id=g["id"]) for g in groups_data],
        meta=FaceListMeta(
            page=page,
            limit=limit,
            total=total,
            total_pages=total_pages,
        ),
    )


@router.post(
    "/workspaces/{workspace_id}/face-groups",
    response_model=FaceGroupResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create face group",
    description="Create a new empty face group.",
)
async def create_face_group(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: FaceGroupCreate,
    group_repo: GroupRepoDep,
):
    """Create a new face group."""
    group = await group_repo.create(
        workspace_id=workspace_id,
        name=request.name,
    )
    
    logger.info(
        "Face group created",
        extra={
            "group_id": str(group["id"]),
            "workspace_id": str(workspace_id),
            "name": request.name,
        },
    )
    
    return FaceGroupResponse(**group, id=group["id"])


@router.get(
    "/face-groups/{group_id}",
    response_model=FaceGroupDetailResponse,
    summary="Get face group",
    description="Returns detailed information about a face group.",
)
async def get_face_group(
    group_id: Annotated[UUID, Path(..., description="Face group ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    group_repo: GroupRepoDep,
    face_repo: FaceRepoDep,
):
    """Get face group details with sample faces."""
    workspace_id = workspace_access["workspace_id"]
    
    group = await group_repo.find_by_id(group_id, workspace_id)
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Face group {group_id} not found",
        )
    
    # Get sample faces from this group
    sample_faces = await face_repo.find_by_group_id(
        group_id=group_id,
        workspace_id=workspace_id,
        limit=5,
    )
    
    # Get representative thumbnail URL
    representative_thumbnail = None
    if group.get("representative_face_id"):
        rep_face = await face_repo.find_by_id(
            group["representative_face_id"], workspace_id
        )
        if rep_face and rep_face.get("thumbnail_urls"):
            thumbnail_urls = rep_face["thumbnail_urls"]
            if isinstance(thumbnail_urls, dict):
                representative_thumbnail = thumbnail_urls.get("medium")
    
    return FaceGroupDetailResponse(
        **group,
        id=group["id"],
        representative_thumbnail_url=representative_thumbnail,
        sample_faces=sample_faces,
    )


@router.put(
    "/face-groups/{group_id}",
    response_model=FaceGroupResponse,
    summary="Update face group",
    description="Update face group metadata (name, representative face).",
)
async def update_face_group(
    group_id: Annotated[UUID, Path(..., description="Face group ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: FaceGroupUpdate,
    group_repo: GroupRepoDep,
):
    """Update a face group."""
    workspace_id = workspace_access["workspace_id"]
    
    # Build update dict
    updates = {}
    if request.name is not None:
        updates["name"] = request.name
    if request.representative_face_id is not None:
        updates["representative_face_id"] = request.representative_face_id
    
    updated_group = await group_repo.update(
        group_id=group_id,
        workspace_id=workspace_id,
        **updates,
    )
    
    if not updated_group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Face group {group_id} not found",
        )
    
    return FaceGroupResponse(**updated_group, id=updated_group["id"])


@router.delete(
    "/face-groups/{group_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete face group",
    description="Delete a face group. Faces in the group become ungrouped.",
)
async def delete_face_group(
    group_id: Annotated[UUID, Path(..., description="Face group ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    group_repo: GroupRepoDep,
):
    """Delete a face group (faces become ungrouped)."""
    workspace_id = workspace_access["workspace_id"]
    
    deleted = await group_repo.delete(group_id, workspace_id)
    
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Face group {group_id} not found",
        )
    
    logger.info(
        "Face group deleted",
        extra={"group_id": str(group_id)},
    )
    
    return None


# ---------------------------------------------------------------------------
# Face Group Operations (Merge/Split)
# ---------------------------------------------------------------------------


@router.post(
    "/face-groups/merge",
    response_model=FaceGroupResponse,
    summary="Merge face groups",
    description="Merge source group into target group. Source is deleted.",
)
async def merge_face_groups(
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: MergeFaceGroupsRequest,
    cluster_service: ClusterServiceDep,
):
    """Merge two face groups."""
    workspace_id = workspace_access["workspace_id"]
    
    try:
        merged_group = await cluster_service.merge_groups(
            source_group_id=request.source_group_id,
            target_group_id=request.target_group_id,
            workspace_id=workspace_id,
        )
    except FaceGroupNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except InvalidMergeOperationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    
    return FaceGroupResponse(**merged_group, id=merged_group["id"])


@router.post(
    "/face-groups/{group_id}/split",
    response_model=FaceGroupResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Split face group",
    description="Split specified faces from a group into a new group.",
)
async def split_face_group(
    group_id: Annotated[UUID, Path(..., description="Source group ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: SplitFaceGroupRequest,
    cluster_service: ClusterServiceDep,
):
    """Split faces from a group into a new group."""
    workspace_id = workspace_access["workspace_id"]
    
    try:
        new_group = await cluster_service.split_group(
            group_id=group_id,
            face_ids=request.face_ids,
            workspace_id=workspace_id,
            new_group_name=request.new_group_name,
        )
    except FaceGroupNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except InvalidSplitOperationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    
    return FaceGroupResponse(**new_group, id=new_group["id"])


# ---------------------------------------------------------------------------
# Face Group Faces
# ---------------------------------------------------------------------------


@router.get(
    "/face-groups/{group_id}/faces",
    summary="List faces in group",
    description="Returns all faces belonging to this group.",
)
async def list_group_faces(
    group_id: Annotated[UUID, Path(..., description="Face group ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    face_repo: FaceRepoDep,
    group_repo: GroupRepoDep,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 50,
):
    """List all faces in a group."""
    workspace_id = workspace_access["workspace_id"]
    offset = (page - 1) * limit
    
    # Verify group exists
    group = await group_repo.find_by_id(group_id, workspace_id)
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Face group {group_id} not found",
        )
    
    faces = await face_repo.find_by_group_id(
        group_id=group_id,
        workspace_id=workspace_id,
        limit=limit,
        offset=offset,
    )
    
    total = group.get("face_count", len(faces))
    total_pages = (total + limit - 1) // limit if total > 0 else 1
    
    return {
        "data": faces,
        "meta": {
            "page": page,
            "limit": limit,
            "total": total,
            "total_pages": total_pages,
        },
    }


# ---------------------------------------------------------------------------
# Face Group History (Undo) Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/workspaces/{workspace_id}/face-groups/history",
    summary="Get face group history",
    description="Returns recent face group actions for undo functionality.",
)
async def get_face_group_history(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    limit: Annotated[int, Query(ge=1, le=100, description="Max entries")] = 50,
):
    """Get recent face group history for undo."""
    from app.services.face_group_history_service import get_face_group_history_service
    
    history_service = get_face_group_history_service()
    history = await history_service.get_recent_history(workspace_id, limit)
    
    return {
        "data": history,
        "meta": {"total": len(history)},
    }


@router.post(
    "/workspaces/{workspace_id}/face-groups/history/{history_id}/undo",
    summary="Undo a face group action",
    description="Attempts to undo a specific face group action. Not all actions can be undone.",
)
async def undo_face_group_action(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    history_id: Annotated[UUID, Path(..., description="History entry ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
):
    """Undo a face group action."""
    from app.services.face_group_history_service import get_face_group_history_service
    
    history_service = get_face_group_history_service()
    success = await history_service.undo_action(workspace_id, history_id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot undo this action. It may have expired or be a complex operation.",
        )
    
    return {"message": "Action undone successfully"}
