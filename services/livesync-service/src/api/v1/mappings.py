"""
API endpoints for sync mappings.

Provides CRUD endpoints for folder-to-gallery sync mappings.
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from src.schemas.common import SyncMappingStatus, PaginatedResponse
from src.schemas.mappings import (
    SyncMappingCreate,
    SyncMappingUpdate,
    SyncMappingResponse,
    SyncMappingStats,
    CreateSyncMappingResponse,
)
from src.services import SyncMappingService
from src.services.mapping_service import (
    DuplicateMappingError,
    MappingNotFoundError,
    MappingLimitExceededError,
    GalleryAccessDeniedError,
)
from src.api.v1.dependencies import get_workspace_context, WorkspaceContext
from src.logging import get_logger

router = APIRouter()
logger = get_logger(__name__)


def get_mapping_service() -> SyncMappingService:
    """Dependency to get sync mapping service."""
    return SyncMappingService()


@router.post(
    "",
    response_model=CreateSyncMappingResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create sync mapping",
    description="Create a new folder-to-gallery sync mapping.",
)
async def create_mapping(
    data: SyncMappingCreate,
    context: WorkspaceContext = Depends(get_workspace_context),
    service: SyncMappingService = Depends(get_mapping_service),
) -> CreateSyncMappingResponse:
    """Create a new sync mapping."""
    try:
        mapping = await service.create_mapping(
            workspace_id=context.workspace_id,
            user_id=context.user_id,
            data=data,
        )
        return CreateSyncMappingResponse(mapping=mapping)

    except DuplicateMappingError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": "duplicate_mapping", "message": e.message},
        )
    except MappingLimitExceededError as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "limit_exceeded", "message": e.message},
        )
    except GalleryAccessDeniedError as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "access_denied", "message": e.message},
        )


@router.get(
    "",
    response_model=PaginatedResponse[SyncMappingResponse],
    summary="List sync mappings",
    description="List all sync mappings for the current workspace.",
)
async def list_mappings(
    status_filter: Optional[SyncMappingStatus] = Query(
        None, alias="status", description="Filter by status"
    ),
    gallery_id: Optional[UUID] = Query(None, description="Filter by gallery ID"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    context: WorkspaceContext = Depends(get_workspace_context),
    service: SyncMappingService = Depends(get_mapping_service),
) -> PaginatedResponse[SyncMappingResponse]:
    """List sync mappings for the workspace."""
    mappings, total = await service.list_mappings(
        workspace_id=context.workspace_id,
        status=status_filter,
        gallery_id=gallery_id,
        page=page,
        limit=limit,
    )

    return PaginatedResponse.create(
        data=mappings,
        total=total,
        page=page,
        limit=limit,
    )


@router.get(
    "/{mapping_id}",
    response_model=SyncMappingResponse,
    summary="Get sync mapping",
    description="Get a sync mapping by ID.",
)
async def get_mapping(
    mapping_id: UUID,
    context: WorkspaceContext = Depends(get_workspace_context),
    service: SyncMappingService = Depends(get_mapping_service),
) -> SyncMappingResponse:
    """Get a sync mapping by ID."""
    try:
        return await service.get_mapping(mapping_id, context.workspace_id)
    except MappingNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "not_found", "message": "Sync mapping not found"},
        )


@router.patch(
    "/{mapping_id}",
    response_model=SyncMappingResponse,
    summary="Update sync mapping",
    description="Update an existing sync mapping.",
)
async def update_mapping(
    mapping_id: UUID,
    data: SyncMappingUpdate,
    context: WorkspaceContext = Depends(get_workspace_context),
    service: SyncMappingService = Depends(get_mapping_service),
) -> SyncMappingResponse:
    """Update a sync mapping."""
    try:
        return await service.update_mapping(mapping_id, context.workspace_id, data)
    except MappingNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "not_found", "message": "Sync mapping not found"},
        )


@router.delete(
    "/{mapping_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete sync mapping",
    description="Delete a sync mapping.",
)
async def delete_mapping(
    mapping_id: UUID,
    context: WorkspaceContext = Depends(get_workspace_context),
    service: SyncMappingService = Depends(get_mapping_service),
) -> None:
    """Delete a sync mapping."""
    try:
        await service.delete_mapping(mapping_id, context.workspace_id)
    except MappingNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "not_found", "message": "Sync mapping not found"},
        )


@router.post(
    "/{mapping_id}/pause",
    response_model=SyncMappingResponse,
    summary="Pause sync mapping",
    description="Pause a sync mapping.",
)
async def pause_mapping(
    mapping_id: UUID,
    context: WorkspaceContext = Depends(get_workspace_context),
    service: SyncMappingService = Depends(get_mapping_service),
) -> SyncMappingResponse:
    """Pause a sync mapping."""
    try:
        return await service.pause_mapping(mapping_id, context.workspace_id)
    except MappingNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "not_found", "message": "Sync mapping not found"},
        )


@router.post(
    "/{mapping_id}/resume",
    response_model=SyncMappingResponse,
    summary="Resume sync mapping",
    description="Resume a paused sync mapping.",
)
async def resume_mapping(
    mapping_id: UUID,
    context: WorkspaceContext = Depends(get_workspace_context),
    service: SyncMappingService = Depends(get_mapping_service),
) -> SyncMappingResponse:
    """Resume a paused sync mapping."""
    try:
        return await service.resume_mapping(mapping_id, context.workspace_id)
    except MappingNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "not_found", "message": "Sync mapping not found"},
        )


@router.get(
    "/{mapping_id}/stats",
    response_model=SyncMappingStats,
    summary="Get sync mapping stats",
    description="Get statistics for a sync mapping.",
)
async def get_mapping_stats(
    mapping_id: UUID,
    context: WorkspaceContext = Depends(get_workspace_context),
    service: SyncMappingService = Depends(get_mapping_service),
) -> SyncMappingStats:
    """Get statistics for a sync mapping."""
    try:
        return await service.get_mapping_stats(mapping_id, context.workspace_id)
    except MappingNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "not_found", "message": "Sync mapping not found"},
        )
