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
    # Multi-merge schemas
    MultiMergeFaceGroupsRequest,
    SetRepresentativeFaceRequest,
    MergeResultResponse,
    FaceGroupSummary,
    MergeSuggestion,
    MergeSuggestionsResponse,
    SimilarGroupsResponse,
    FacesInGroupResponse,
    FaceResponse,
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
    FaceNotFoundError,
    InvalidMergeOperationError,
    InvalidSplitOperationError,
)
from app.services.signed_url_service import get_signed_url_service
from app.services.audit_service import AuditService, AuditEventType


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

    # Use the method that includes thumbnail info
    groups = await group_repo.find_by_workspace_with_thumbnails(
        workspace_id=workspace_id,
        limit=limit,
        offset=offset,
        order_by=order_by,
        order_desc=order_desc,
    )

    # Generate signed URLs for thumbnails
    signed_url_service = get_signed_url_service()
    response_groups = []
    for g in groups:
        # Generate signed thumbnail URL if we have representative face info
        representative_thumbnail_url = None
        if g.get("rep_face_id") and g.get("rep_thumbnail_urls"):
            thumbnail_urls = g.get("rep_thumbnail_urls")
            if isinstance(thumbnail_urls, dict) and thumbnail_urls.get("medium"):
                url_data = signed_url_service.generate_face_thumbnail_url(
                    workspace_id=workspace_id,
                    face_id=g["rep_face_id"],
                    size="medium",
                )
                representative_thumbnail_url = url_data["url"]

        # Build response, excluding internal fields
        response_groups.append(FaceGroupResponse(
            id=g["id"],
            workspace_id=g["workspace_id"],
            name=g.get("name"),
            representative_face_id=g.get("representative_face_id"),
            face_count=g.get("face_count", 0),
            created_at=g.get("created_at"),
            updated_at=g.get("updated_at"),
            representative_thumbnail_url=representative_thumbnail_url,
            person_id=g.get("person_id"),
            person_name=g.get("person_name"),
        ))

    total = await group_repo.count_by_workspace(workspace_id)
    total_pages = (total + limit - 1) // limit if total > 0 else 1

    return FaceGroupListResponse(
        data=response_groups,
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
    search: Annotated[Optional[str], Query(description="Search by person name")] = None,
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
        search=search,
    )

    # 2. Generate signed URLs for thumbnails
    signed_url_service = get_signed_url_service()
    response_groups = []
    for g in groups_data:
        representative_thumbnail_url = None
        if g.get("rep_face_id") and g.get("rep_thumbnail_urls"):
            thumbnail_urls = g.get("rep_thumbnail_urls")
            if isinstance(thumbnail_urls, dict) and thumbnail_urls.get("medium"):
                url_data = signed_url_service.generate_face_thumbnail_url(
                    workspace_id=workspace_id,
                    face_id=g["rep_face_id"],
                    size="medium",
                )
                representative_thumbnail_url = url_data["url"]

        response_groups.append(FaceGroupGalleryStats(
            id=g["id"],
            workspace_id=g["workspace_id"],
            name=g.get("name"),
            representative_face_id=g.get("representative_face_id"),
            face_count=g.get("face_count", 0),
            created_at=g.get("created_at"),
            updated_at=g.get("updated_at"),
            representative_thumbnail_url=representative_thumbnail_url,
            person_id=g.get("person_id"),
            person_name=g.get("person_name"),
            gallery_photo_count=g.get("gallery_photo_count", 0),
            gallery_face_count=g.get("gallery_face_count", 0),
        ))

    # 3. Get total count
    total = await group_repo.count_by_gallery_id(workspace_id, gallery_id)
    total_pages = (total + limit - 1) // limit if total > 0 else 1

    return FaceGroupGalleryStatsListResponse(
        data=response_groups,
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
    
    return FaceGroupResponse(**group)


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
    
    # Get representative thumbnail URL (signed)
    representative_thumbnail = None
    if group.get("representative_face_id"):
        rep_face = await face_repo.find_by_id(
            group["representative_face_id"], workspace_id
        )
        if rep_face and rep_face.get("thumbnail_urls"):
            thumbnail_urls = rep_face["thumbnail_urls"]
            if isinstance(thumbnail_urls, dict) and thumbnail_urls.get("medium"):
                # Generate signed URL for the face thumbnail
                signed_url_service = get_signed_url_service()
                url_data = signed_url_service.generate_face_thumbnail_url(
                    workspace_id=workspace_id,
                    face_id=rep_face["id"],
                    size="medium",
                )
                representative_thumbnail = url_data["url"]

    return FaceGroupDetailResponse(
        **group,
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
    
    return FaceGroupResponse(**updated_group)


class AssignPersonRequest(BaseModel):
    """Request to assign a person to a face group."""

    person_id: Optional[UUID] = Field(None, description="ID of existing person to link")
    person_name: Optional[str] = Field(None, min_length=1, max_length=255, description="Name for new person")


class FaceGroupPersonResponse(BaseModel):
    """Response after assigning person to face group."""

    id: UUID
    name: Optional[str] = None
    person_id: Optional[str] = None
    person_name: Optional[str] = None
    face_count: int = 0


@router.put(
    "/workspaces/{workspace_id}/face-groups/{group_id}/name",
    response_model=FaceGroupPersonResponse,
    summary="Name a face group",
    description="Assign a person (name) to a face group. Creates person if needed.",
)
async def name_face_group(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    group_id: Annotated[UUID, Path(..., description="Face group ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: AssignPersonRequest,
    cluster_service: ClusterServiceDep,
):
    """
    Assign a person to a face group.

    Either provide `person_id` to link to an existing person, or provide
    `person_name` to create a new person entity and link it.

    This enables searching photos by person name.
    """
    if not request.person_id and not request.person_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either person_id or person_name must be provided",
        )

    if request.person_id and request.person_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide either person_id or person_name, not both",
        )

    try:
        result = await cluster_service.assign_person(
            group_id=group_id,
            workspace_id=workspace_id,
            person_id=request.person_id,
            person_name=request.person_name,
        )
    except FaceGroupNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    return FaceGroupPersonResponse(
        id=result["id"],
        name=result.get("name"),
        person_id=result.get("person_id"),
        person_name=result.get("person_name"),
        face_count=result.get("face_count", 0),
    )


@router.delete(
    "/workspaces/{workspace_id}/face-groups/{group_id}/name",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove person from face group",
    description="Unassign the person from a face group.",
)
async def unname_face_group(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    group_id: Annotated[UUID, Path(..., description="Face group ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    cluster_service: ClusterServiceDep,
):
    """Remove person assignment from a face group."""
    try:
        await cluster_service.unassign_person(
            group_id=group_id,
            workspace_id=workspace_id,
        )
    except FaceGroupNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )

    return None


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
    
    return FaceGroupResponse(**merged_group)


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

    return FaceGroupResponse(**new_group)


# ---------------------------------------------------------------------------
# Multi-Group Merge & Representative Face
# ---------------------------------------------------------------------------


@router.post(
    "/workspaces/{workspace_id}/face-groups/multi-merge",
    response_model=MergeResultResponse,
    summary="Merge multiple face groups",
    description="""
    Merge 2+ face groups into a single target group.

    All faces from source groups are reassigned to the target group.
    Source groups are deleted after the merge. Optionally set a new
    representative (primary) face and name for the merged group.
    """,
)
async def multi_merge_face_groups(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: MultiMergeFaceGroupsRequest,
    cluster_service: ClusterServiceDep,
):
    """Merge multiple face groups into one target group."""
    try:
        result = await cluster_service.multi_merge_groups(
            source_group_ids=request.source_group_ids,
            target_group_id=request.target_group_id,
            workspace_id=workspace_id,
            representative_face_id=request.representative_face_id,
            name=request.name,
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

    # Generate signed thumbnail URL for merged group
    merged_group = result["merged_group"]
    representative_thumbnail_url = None
    if merged_group.get("representative_face_id"):
        signed_url_service = get_signed_url_service()
        url_data = signed_url_service.generate_face_thumbnail_url(
            workspace_id=workspace_id,
            face_id=merged_group["representative_face_id"],
            size="medium",
        )
        representative_thumbnail_url = url_data["url"]

    # SOC2 Audit Logging: Log the merge operation for compliance
    audit_service = AuditService()
    await audit_service.log_event(
        event_type=AuditEventType.FACE_GROUPS_MERGED,
        workspace_id=workspace_id,
        actor_user_id=current_user.id,
        target_entity_type="face_group",
        target_entity_id=request.target_group_id,
        details={
            "source_group_ids": [str(gid) for gid in result["source_group_ids"]],
            "target_group_id": str(request.target_group_id),
            "faces_merged": result["faces_merged"],
            "new_name": request.name,
            "representative_face_id": str(request.representative_face_id) if request.representative_face_id else None,
        },
    )

    logger.info(
        "Face groups merged",
        extra={
            "workspace_id": str(workspace_id),
            "user_id": str(current_user.id),
            "target_group_id": str(request.target_group_id),
            "source_group_count": len(result["source_group_ids"]),
            "faces_merged": result["faces_merged"],
        },
    )

    return MergeResultResponse(
        merged_group=FaceGroupResponse(
            id=merged_group["id"],
            workspace_id=merged_group["workspace_id"],
            name=merged_group.get("name"),
            representative_face_id=merged_group.get("representative_face_id"),
            face_count=merged_group.get("face_count", 0),
            created_at=merged_group.get("created_at"),
            updated_at=merged_group.get("updated_at"),
            representative_thumbnail_url=representative_thumbnail_url,
            person_id=merged_group.get("person_id"),
            person_name=merged_group.get("person_name"),
        ),
        source_group_ids=result["source_group_ids"],
        faces_merged=result["faces_merged"],
    )


@router.put(
    "/workspaces/{workspace_id}/face-groups/{group_id}/representative",
    response_model=FaceGroupResponse,
    summary="Set representative face",
    description="""
    Set the primary (representative) face for a face group.

    The representative face is used for display thumbnails in the People panel.
    Its embedding is weighted 2x in centroid calculations for better matching.
    """,
)
async def set_representative_face(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    group_id: Annotated[UUID, Path(..., description="Face group ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: SetRepresentativeFaceRequest,
    cluster_service: ClusterServiceDep,
):
    """Set the representative (primary) face for a group."""
    try:
        updated_group = await cluster_service.set_representative_face(
            group_id=group_id,
            workspace_id=workspace_id,
            face_id=request.face_id,
            recalculate_centroid=request.recalculate_centroid,
        )
    except FaceGroupNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except FaceNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except InvalidMergeOperationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    # Generate signed thumbnail URL
    representative_thumbnail_url = None
    if updated_group.get("representative_face_id"):
        signed_url_service = get_signed_url_service()
        url_data = signed_url_service.generate_face_thumbnail_url(
            workspace_id=workspace_id,
            face_id=updated_group["representative_face_id"],
            size="medium",
        )
        representative_thumbnail_url = url_data["url"]

    return FaceGroupResponse(
        id=updated_group["id"],
        workspace_id=updated_group["workspace_id"],
        name=updated_group.get("name"),
        representative_face_id=updated_group.get("representative_face_id"),
        face_count=updated_group.get("face_count", 0),
        created_at=updated_group.get("created_at"),
        updated_at=updated_group.get("updated_at"),
        representative_thumbnail_url=representative_thumbnail_url,
        person_id=updated_group.get("person_id"),
        person_name=updated_group.get("person_name"),
    )


# ---------------------------------------------------------------------------
# Merge Suggestions & Similar Groups
# ---------------------------------------------------------------------------


@router.get(
    "/workspaces/{workspace_id}/face-groups/suggestions",
    response_model=MergeSuggestionsResponse,
    summary="Get merge suggestions",
    description="""
    Returns pairs of face groups with high centroid similarity (>=0.75 by default)
    that may represent the same person.

    Use these suggestions to help users identify and merge duplicate face groups.
    """,
)
async def get_merge_suggestions(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    group_repo: GroupRepoDep,
    threshold: Annotated[float, Query(ge=0.5, le=0.99, description="Similarity threshold")] = 0.75,
    limit: Annotated[int, Query(ge=1, le=100, description="Max pairs to return")] = 50,
):
    """Get suggested face group pairs to merge."""
    pairs = await group_repo.find_similar_pairs(
        workspace_id=workspace_id,
        threshold=threshold,
        limit=limit,
    )

    # Build response with signed thumbnail URLs
    signed_url_service = get_signed_url_service()
    suggestions = []

    for pair in pairs:
        # Generate signed thumbnail URLs using face IDs
        group1_thumbnail_url = None
        if pair.get("group1_rep_face_id"):
            url_info = signed_url_service.generate_face_thumbnail_url(
                workspace_id=workspace_id,
                face_id=pair["group1_rep_face_id"],
                size="medium",
            )
            group1_thumbnail_url = url_info.get("url")

        group2_thumbnail_url = None
        if pair.get("group2_rep_face_id"):
            url_info = signed_url_service.generate_face_thumbnail_url(
                workspace_id=workspace_id,
                face_id=pair["group2_rep_face_id"],
                size="medium",
            )
            group2_thumbnail_url = url_info.get("url")

        suggestions.append(MergeSuggestion(
            group1=FaceGroupSummary(
                id=pair["group1_id"],
                name=pair.get("group1_name"),
                person_name=pair.get("group1_person_name"),
                face_count=pair.get("group1_face_count", 0),
                representative_thumbnail_url=group1_thumbnail_url,
            ),
            group2=FaceGroupSummary(
                id=pair["group2_id"],
                name=pair.get("group2_name"),
                person_name=pair.get("group2_person_name"),
                face_count=pair.get("group2_face_count", 0),
                representative_thumbnail_url=group2_thumbnail_url,
            ),
            similarity=pair["similarity"],
        ))

    return MergeSuggestionsResponse(
        suggestions=suggestions,
        total=len(suggestions),
    )


@router.get(
    "/workspaces/{workspace_id}/face-groups/{group_id}/similar",
    response_model=SimilarGroupsResponse,
    summary="Get similar face groups",
    description="""
    Find face groups similar to a specific group based on centroid similarity.

    Useful for showing "similar people" suggestions in the group detail view.
    """,
)
async def get_similar_groups(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    group_id: Annotated[UUID, Path(..., description="Face group ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    group_repo: GroupRepoDep,
    threshold: Annotated[float, Query(ge=0.5, le=0.99, description="Similarity threshold")] = 0.75,
    limit: Annotated[int, Query(ge=1, le=50, description="Max results")] = 10,
):
    """Get face groups similar to a specific group."""
    try:
        # Get the source group for the response
        source_group = await group_repo.get_by_id(group_id, workspace_id)

        # Find similar groups
        similar = await group_repo.find_similar_to_group(
            group_id=group_id,
            workspace_id=workspace_id,
            threshold=threshold,
            limit=limit,
        )
    except FaceGroupNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )

    # Build response with signed thumbnail URLs
    signed_url_service = get_signed_url_service()

    # Source group thumbnail
    source_thumbnail_url = None
    if source_group.get("representative_face_id"):
        url_data = signed_url_service.generate_face_thumbnail_url(
            workspace_id=workspace_id,
            face_id=source_group["representative_face_id"],
            size="medium",
        )
        source_thumbnail_url = url_data["url"]

    # Similar groups
    similar_groups = []
    for item in similar:
        group = item["group"]
        thumbnail_url = None
        if group.get("rep_thumbnail_urls"):
            urls = group["rep_thumbnail_urls"]
            if isinstance(urls, dict) and urls.get("medium"):
                thumbnail_url = urls.get("medium")

        similar_groups.append({
            "group": FaceGroupSummary(
                id=group["id"],
                name=group.get("name"),
                person_name=group.get("person_name"),
                face_count=group.get("face_count", 0),
                representative_thumbnail_url=thumbnail_url,
            ),
            "similarity": item["similarity"],
        })

    return SimilarGroupsResponse(
        group=FaceGroupResponse(
            id=source_group["id"],
            workspace_id=source_group["workspace_id"],
            name=source_group.get("name"),
            representative_face_id=source_group.get("representative_face_id"),
            face_count=source_group.get("face_count", 0),
            created_at=source_group.get("created_at"),
            updated_at=source_group.get("updated_at"),
            representative_thumbnail_url=source_thumbnail_url,
            person_id=source_group.get("person_id"),
            person_name=source_group.get("person_name"),
        ),
        similar_groups=similar_groups,
    )


# ---------------------------------------------------------------------------
# Face Group Faces (Enhanced for Primary Face Selection)
# ---------------------------------------------------------------------------


@router.get(
    "/workspaces/{workspace_id}/face-groups/{group_id}/faces",
    response_model=FacesInGroupResponse,
    summary="Get all faces in a group",
    description="""
    Get all faces belonging to a face group, including thumbnail URLs.

    Used for browsing faces before merge and for selecting primary face.
    """,
)
async def get_faces_in_group(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    group_id: Annotated[UUID, Path(..., description="Face group ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    face_repo: FaceRepoDep,
    group_repo: GroupRepoDep,
    limit: Annotated[int, Query(ge=1, le=500, description="Items per page")] = 100,
    offset: Annotated[int, Query(ge=0, description="Offset")] = 0,
):
    """Get all faces in a group with thumbnails."""
    # Verify group exists and get representative face ID
    group = await group_repo.find_by_id(group_id, workspace_id)
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Face group {group_id} not found",
        )

    representative_face_id = group.get("representative_face_id")

    # Get faces
    faces = await face_repo.find_by_group_id(
        group_id=group_id,
        workspace_id=workspace_id,
        limit=limit,
        offset=offset,
    )

    # Build response with signed URLs
    signed_url_service = get_signed_url_service()
    face_responses = []

    for face in faces:
        thumbnail_url = None
        if face.get("thumbnail_urls"):
            urls = face["thumbnail_urls"]
            if isinstance(urls, dict) and urls.get("medium"):
                url_data = signed_url_service.generate_face_thumbnail_url(
                    workspace_id=workspace_id,
                    face_id=face["id"],
                    size="medium",
                )
                thumbnail_url = url_data["url"]

        face_responses.append(FaceResponse(
            id=face["id"],
            photo_id=face.get("photo_id"),
            bounding_box=face.get("bounding_box"),
            confidence=face.get("confidence"),
            thumbnail_url=thumbnail_url,
            created_at=face.get("created_at"),
        ))

    total = group.get("face_count", len(faces))

    return FacesInGroupResponse(
        faces=face_responses,
        total=total,
        representative_face_id=representative_face_id,
    )


# ---------------------------------------------------------------------------
# Face Group Faces (Legacy - keeping for backward compatibility)
# ---------------------------------------------------------------------------


@router.get(
    "/face-groups/{group_id}/photos",
    summary="Get photos by face group",
    description="Returns photo IDs containing faces from this group.",
)
async def get_photos_by_face_group(
    group_id: Annotated[UUID, Path(..., description="Face group ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    group_repo: GroupRepoDep,
    face_repo: FaceRepoDep,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    limit: Annotated[int, Query(ge=1, le=500, description="Items per page")] = 100,
):
    """Get all photo IDs containing faces from a specific face group."""
    workspace_id = workspace_access["workspace_id"]
    offset = (page - 1) * limit

    # Verify group exists
    group = await group_repo.find_by_id(group_id, workspace_id)
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Face group {group_id} not found",
        )

    photo_ids = await face_repo.find_photo_ids_by_group_id(
        group_id=group_id,
        workspace_id=workspace_id,
        limit=limit,
        offset=offset,
    )

    total = await face_repo.count_distinct_photos_by_group_id(group_id, workspace_id)
    total_pages = (total + limit - 1) // limit if total > 0 else 1

    return {
        "photo_ids": [str(pid) for pid in photo_ids],
        "meta": {
            "page": page,
            "limit": limit,
            "total": total,
            "total_pages": total_pages,
        },
    }


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
