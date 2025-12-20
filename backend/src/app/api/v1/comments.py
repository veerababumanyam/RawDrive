"""Comment API endpoints.

All routes prefixed with /api/v1/workspaces/{workspace_id}/comments.
"""

from __future__ import annotations

import logging
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Path, Query, status
from pydantic import BaseModel, Field

from app.api.dependencies.auth import CurrentUserDep, WorkspaceAccessDep
from app.api.schemas import ErrorResponse, MessageResponse
from app.api.exceptions import AppError, NotFoundError, ForbiddenError, InternalError
from app.services.comment_service import (
    CommentError,
    CommentNotFoundError,
    CommentForbiddenError,
    get_comment_service,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Request/Response Schemas
# ---------------------------------------------------------------------------


class CreateCommentRequest(BaseModel):
    """Create comment request."""

    gallery_id: UUID = Field(..., description="Gallery ID")
    body: str = Field(..., min_length=1, max_length=5000, description="Comment body")
    asset_id: Optional[UUID] = Field(None, description="Asset ID (optional, for photo-specific comments)")
    annotations: Optional[dict] = Field(None, description="Annotations for marking areas")
    is_internal: bool = Field(False, description="Internal note (not visible to clients)")


class UpdateCommentRequest(BaseModel):
    """Update comment request."""

    body: Optional[str] = Field(None, min_length=1, max_length=5000)
    annotations: Optional[dict] = None


class ResolveCommentRequest(BaseModel):
    """Resolve comment request."""

    resolved: bool = Field(True, description="True to resolve, False to reopen")


class CommentAuthorResponse(BaseModel):
    """Comment author info."""

    user_id: Optional[str] = None
    name: str
    email: Optional[str] = None


class CommentResponse(BaseModel):
    """Comment response."""

    comment_id: str
    workspace_id: str
    gallery_id: str
    asset_id: Optional[str] = None
    author: CommentAuthorResponse
    body: str
    annotations: Optional[dict] = None
    is_internal: bool
    status: str
    resolved_by_user_id: Optional[str] = None
    resolved_at: Optional[str] = None
    moderation_state: str
    created_at: str
    updated_at: Optional[str] = None


class CommentListMeta(BaseModel):
    page: int
    limit: int
    total: int
    totalPages: int


class CommentListResponse(BaseModel):
    """Comment list response."""

    data: list[CommentResponse]
    meta: CommentListMeta


# ---------------------------------------------------------------------------
# Comment Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=CommentListResponse,
    status_code=status.HTTP_200_OK,
    summary="List comments",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def list_comments(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    gallery_id: Annotated[Optional[UUID], Query(description="Filter by gallery")] = None,
    asset_id: Annotated[Optional[UUID], Query(description="Filter by asset")] = None,
    status_filter: Annotated[Optional[str], Query(alias="status", description="Filter by status")] = None,
    include_internal: Annotated[bool, Query(description="Include internal notes")] = True,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 50,
) -> CommentListResponse:
    """List comments in a workspace."""
    service = get_comment_service()
    try:
        result = await service.list_comments(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            asset_id=asset_id,
            include_internal=include_internal,
            status=status_filter,
            page=page,
            limit=limit,
        )
        return CommentListResponse(**result)
    except Exception as e:
        logger.exception("Failed to list comments")
        raise InternalError("Failed to list comments")


@router.post(
    "",
    response_model=CommentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create comment",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def create_comment(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: CreateCommentRequest,
) -> CommentResponse:
    """Create a new comment."""
    service = get_comment_service()
    try:
        result = await service.create_comment(
            workspace_id=workspace_id,
            gallery_id=request.gallery_id,
            body=request.body,
            author_user_id=current_user.user_id,
            asset_id=request.asset_id,
            annotations=request.annotations,
            is_internal=request.is_internal,
        )
        return CommentResponse(**result)
    except Exception as e:
        logger.exception("Failed to create comment")
        raise InternalError("Failed to create comment")


@router.get(
    "/{comment_id}",
    response_model=CommentResponse,
    status_code=status.HTTP_200_OK,
    summary="Get comment",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Comment not found"},
    },
)
async def get_comment(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    comment_id: Annotated[UUID, Path(..., description="Comment ID")],
) -> CommentResponse:
    """Get comment details."""
    service = get_comment_service()
    try:
        result = await service.get_comment(workspace_id=workspace_id, comment_id=comment_id)
        return CommentResponse(**result)
    except CommentNotFoundError:
        raise NotFoundError("Comment", str(comment_id))
    except Exception as e:
        logger.exception("Failed to get comment")
        raise InternalError("Failed to get comment")


@router.patch(
    "/{comment_id}",
    response_model=CommentResponse,
    status_code=status.HTTP_200_OK,
    summary="Update comment",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Comment not found"},
    },
)
async def update_comment(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    comment_id: Annotated[UUID, Path(..., description="Comment ID")],
    request: UpdateCommentRequest,
) -> CommentResponse:
    """Update a comment. User must be the author."""
    service = get_comment_service()
    try:
        result = await service.update_comment(
            workspace_id=workspace_id,
            comment_id=comment_id,
            user_id=current_user.user_id,
            body=request.body,
            annotations=request.annotations,
        )
        return CommentResponse(**result)
    except CommentNotFoundError:
        raise NotFoundError("Comment", str(comment_id))
    except CommentForbiddenError as e:
        raise ForbiddenError(str(e))
    except Exception as e:
        logger.exception("Failed to update comment")
        raise InternalError("Failed to update comment")


@router.delete(
    "/{comment_id}",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Delete comment",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Comment not found"},
    },
)
async def delete_comment(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    comment_id: Annotated[UUID, Path(..., description="Comment ID")],
) -> MessageResponse:
    """Delete a comment. User must be author or admin."""
    service = get_comment_service()
    try:
        # TODO: Check if user is admin for is_admin parameter
        await service.delete_comment(
            workspace_id=workspace_id,
            comment_id=comment_id,
            user_id=current_user.user_id,
            is_admin=False,  # TODO: Check RBAC
        )
        return MessageResponse(message="Comment deleted successfully")
    except CommentNotFoundError:
        raise NotFoundError("Comment", str(comment_id))
    except CommentForbiddenError as e:
        raise ForbiddenError(str(e))
    except Exception as e:
        logger.exception("Failed to delete comment")
        raise InternalError("Failed to delete comment")


@router.post(
    "/{comment_id}/resolve",
    response_model=CommentResponse,
    status_code=status.HTTP_200_OK,
    summary="Resolve comment",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Comment not found"},
    },
)
async def resolve_comment(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    comment_id: Annotated[UUID, Path(..., description="Comment ID")],
    request: ResolveCommentRequest,
) -> CommentResponse:
    """Mark a comment as resolved or reopen it."""
    service = get_comment_service()
    try:
        result = await service.resolve_comment(
            workspace_id=workspace_id,
            comment_id=comment_id,
            user_id=current_user.user_id,
            resolved=request.resolved,
        )
        return CommentResponse(**result)
    except CommentNotFoundError:
        raise NotFoundError("Comment", str(comment_id))
    except Exception as e:
        logger.exception("Failed to resolve comment")
        raise InternalError("Failed to resolve comment")


# ---------------------------------------------------------------------------
# Gallery/Asset Comment Convenience Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/galleries/{gallery_id}",
    response_model=CommentListResponse,
    status_code=status.HTTP_200_OK,
    summary="List gallery comments",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def list_gallery_comments(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    include_internal: Annotated[bool, Query(description="Include internal notes")] = True,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 50,
) -> CommentListResponse:
    """List all comments for a specific gallery."""
    service = get_comment_service()
    try:
        result = await service.list_comments(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            include_internal=include_internal,
            page=page,
            limit=limit,
        )
        return CommentListResponse(**result)
    except Exception as e:
        logger.exception("Failed to list gallery comments")
        raise InternalError("Failed to list gallery comments")


@router.get(
    "/assets/{asset_id}",
    response_model=CommentListResponse,
    status_code=status.HTTP_200_OK,
    summary="List asset comments",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def list_asset_comments(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    asset_id: Annotated[UUID, Path(..., description="Asset ID")],
    include_internal: Annotated[bool, Query(description="Include internal notes")] = True,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 50,
) -> CommentListResponse:
    """List all comments for a specific asset."""
    service = get_comment_service()
    try:
        result = await service.list_comments(
            workspace_id=workspace_id,
            asset_id=asset_id,
            include_internal=include_internal,
            page=page,
            limit=limit,
        )
        return CommentListResponse(**result)
    except Exception as e:
        logger.exception("Failed to list asset comments")
        raise InternalError("Failed to list asset comments")
