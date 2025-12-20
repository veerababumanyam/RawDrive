"""Tag API endpoints.

All routes prefixed with /api/v1/workspaces/{workspace_id}/tags.
"""

from __future__ import annotations

import logging
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Path, Query, status
from pydantic import BaseModel, Field

from app.api.dependencies.auth import CurrentUserDep, WorkspaceAccessDep
from app.api.schemas import ErrorResponse, MessageResponse
from app.api.exceptions import AppError, NotFoundError, ValidationAppError, InternalError
from app.services.tag_service import (
    TagError,
    TagNotFoundError,
    DuplicateTagError,
    get_tag_service,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Request/Response Schemas
# ---------------------------------------------------------------------------


class CreateTagRequest(BaseModel):
    """Create tag request."""

    name: str = Field(..., min_length=1, max_length=100, description="Tag name")
    type: str = Field("keyword", description="Tag type (keyword, location, event, category, custom)")
    color: Optional[str] = Field(None, max_length=20, description="Tag color (hex or name)")


class UpdateTagRequest(BaseModel):
    """Update tag request."""

    name: Optional[str] = Field(None, min_length=1, max_length=100)
    type: Optional[str] = None
    color: Optional[str] = Field(None, max_length=20)


class TagResponse(BaseModel):
    """Tag response."""

    tag_id: str
    name: str
    type: str
    color: Optional[str] = None
    usage_count: int = 0
    created_at: str


class TagDetailResponse(BaseModel):
    """Tag detail response."""

    tag_id: str
    workspace_id: str
    name: str
    type: str
    color: Optional[str] = None
    usage_count: int = 0
    created_at: str
    updated_at: Optional[str] = None


class TagListMeta(BaseModel):
    page: int
    limit: int
    total: int
    totalPages: int


class TagListResponse(BaseModel):
    """Tag list response."""

    data: list[TagResponse]
    meta: TagListMeta


class AddTagToAssetRequest(BaseModel):
    """Add tag to asset request."""

    tag_id: UUID = Field(..., description="Tag ID to add")


class CreateAndAddTagRequest(BaseModel):
    """Create a new tag and add to asset."""

    name: str = Field(..., min_length=1, max_length=100, description="Tag name")
    type: str = Field("keyword", description="Tag type")
    color: Optional[str] = Field(None, max_length=20)


class SetAssetTagsRequest(BaseModel):
    """Set all tags on an asset."""

    tag_ids: list[UUID] = Field(..., description="List of tag IDs to set")


class AssetTagResponse(BaseModel):
    """Asset tag response."""

    tag_id: str
    name: str
    type: str
    color: Optional[str] = None


# ---------------------------------------------------------------------------
# Tag CRUD Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=TagListResponse,
    status_code=status.HTTP_200_OK,
    summary="List tags",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def list_tags(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 50,
    type: Annotated[Optional[str], Query(description="Filter by tag type")] = None,
    search: Annotated[Optional[str], Query(description="Search by name")] = None,
) -> TagListResponse:
    """List all tags in a workspace."""
    service = get_tag_service()
    try:
        result = await service.list_tags(
            workspace_id=workspace_id,
            tag_type=type,
            search=search,
            page=page,
            limit=limit,
        )
        return TagListResponse(**result)
    except Exception as e:
        logger.exception("Failed to list tags")
        raise InternalError("Failed to list tags")


@router.post(
    "",
    response_model=TagDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create tag",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        409: {"model": ErrorResponse, "description": "Tag already exists"},
    },
)
async def create_tag(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: CreateTagRequest,
) -> TagDetailResponse:
    """Create a new tag."""
    service = get_tag_service()
    try:
        result = await service.create_tag(
            workspace_id=workspace_id,
            user_id=current_user.user_id,
            name=request.name,
            tag_type=request.type,
            color=request.color,
        )
        return TagDetailResponse(**result)
    except DuplicateTagError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status)
    except Exception as e:
        logger.exception("Failed to create tag")
        raise InternalError("Failed to create tag")


@router.get(
    "/{tag_id}",
    response_model=TagDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Get tag",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Tag not found"},
    },
)
async def get_tag(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    tag_id: Annotated[UUID, Path(..., description="Tag ID")],
) -> TagDetailResponse:
    """Get tag details."""
    service = get_tag_service()
    try:
        result = await service.get_tag(workspace_id=workspace_id, tag_id=tag_id)
        return TagDetailResponse(**result)
    except TagNotFoundError:
        raise NotFoundError("Tag", str(tag_id))
    except Exception as e:
        logger.exception("Failed to get tag")
        raise InternalError("Failed to get tag")


@router.patch(
    "/{tag_id}",
    response_model=TagDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Update tag",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Tag not found"},
        409: {"model": ErrorResponse, "description": "Tag name already exists"},
    },
)
async def update_tag(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    tag_id: Annotated[UUID, Path(..., description="Tag ID")],
    request: UpdateTagRequest,
) -> TagDetailResponse:
    """Update a tag."""
    service = get_tag_service()
    try:
        result = await service.update_tag(
            workspace_id=workspace_id,
            tag_id=tag_id,
            name=request.name,
            tag_type=request.type,
            color=request.color,
        )
        return TagDetailResponse(**result)
    except TagNotFoundError:
        raise NotFoundError("Tag", str(tag_id))
    except DuplicateTagError as e:
        raise AppError(message=str(e), code=e.code, status_code=e.status)
    except Exception as e:
        logger.exception("Failed to update tag")
        raise InternalError("Failed to update tag")


@router.delete(
    "/{tag_id}",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Delete tag",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Tag not found"},
    },
)
async def delete_tag(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    tag_id: Annotated[UUID, Path(..., description="Tag ID")],
) -> MessageResponse:
    """Delete a tag and all its assignments."""
    service = get_tag_service()
    try:
        await service.delete_tag(workspace_id=workspace_id, tag_id=tag_id)
        return MessageResponse(message="Tag deleted successfully")
    except TagNotFoundError:
        raise NotFoundError("Tag", str(tag_id))
    except Exception as e:
        logger.exception("Failed to delete tag")
        raise InternalError("Failed to delete tag")


# ---------------------------------------------------------------------------
# Asset Tag Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/assets/{asset_id}",
    response_model=list[AssetTagResponse],
    status_code=status.HTTP_200_OK,
    summary="Get asset tags",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def get_asset_tags(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    asset_id: Annotated[UUID, Path(..., description="Asset ID")],
) -> list[AssetTagResponse]:
    """Get all tags for an asset."""
    service = get_tag_service()
    try:
        result = await service.get_asset_tags(workspace_id=workspace_id, asset_id=asset_id)
        return [AssetTagResponse(**t) for t in result]
    except Exception as e:
        logger.exception("Failed to get asset tags")
        raise InternalError("Failed to get asset tags")


@router.post(
    "/assets/{asset_id}",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Add tag to asset",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Tag not found"},
    },
)
async def add_tag_to_asset(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    asset_id: Annotated[UUID, Path(..., description="Asset ID")],
    request: AddTagToAssetRequest,
) -> MessageResponse:
    """Add an existing tag to an asset."""
    service = get_tag_service()
    try:
        await service.add_tag_to_asset(
            workspace_id=workspace_id,
            asset_id=asset_id,
            tag_id=request.tag_id,
            user_id=current_user.user_id,
        )
        return MessageResponse(message="Tag added to asset")
    except TagNotFoundError:
        raise NotFoundError("Tag", str(request.tag_id))
    except Exception as e:
        logger.exception("Failed to add tag to asset")
        raise InternalError("Failed to add tag to asset")


@router.post(
    "/assets/{asset_id}/create",
    response_model=AssetTagResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create and add tag to asset",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def create_and_add_tag_to_asset(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    asset_id: Annotated[UUID, Path(..., description="Asset ID")],
    request: CreateAndAddTagRequest,
) -> AssetTagResponse:
    """Create a new tag and immediately add it to an asset."""
    service = get_tag_service()
    try:
        result = await service.create_and_add_tag(
            workspace_id=workspace_id,
            asset_id=asset_id,
            user_id=current_user.user_id,
            name=request.name,
            tag_type=request.type,
            color=request.color,
        )
        return AssetTagResponse(**result)
    except Exception as e:
        logger.exception("Failed to create and add tag")
        raise InternalError("Failed to create and add tag")


@router.put(
    "/assets/{asset_id}",
    response_model=list[AssetTagResponse],
    status_code=status.HTTP_200_OK,
    summary="Set asset tags",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def set_asset_tags(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    asset_id: Annotated[UUID, Path(..., description="Asset ID")],
    request: SetAssetTagsRequest,
) -> list[AssetTagResponse]:
    """Replace all tags on an asset with a new set."""
    service = get_tag_service()
    try:
        result = await service.set_asset_tags(
            workspace_id=workspace_id,
            asset_id=asset_id,
            tag_ids=request.tag_ids,
            user_id=current_user.user_id,
        )
        return [AssetTagResponse(**t) for t in result]
    except Exception as e:
        logger.exception("Failed to set asset tags")
        raise InternalError("Failed to set asset tags")


@router.delete(
    "/assets/{asset_id}/{tag_id}",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Remove tag from asset",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def remove_tag_from_asset(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    asset_id: Annotated[UUID, Path(..., description="Asset ID")],
    tag_id: Annotated[UUID, Path(..., description="Tag ID")],
) -> MessageResponse:
    """Remove a tag from an asset."""
    service = get_tag_service()
    try:
        await service.remove_tag_from_asset(
            workspace_id=workspace_id,
            asset_id=asset_id,
            tag_id=tag_id,
        )
        return MessageResponse(message="Tag removed from asset")
    except Exception as e:
        logger.exception("Failed to remove tag from asset")
        raise InternalError("Failed to remove tag from asset")
