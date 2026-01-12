"""Album API endpoints.

Provides authenticated endpoints for album CRUD operations:
- Album management (create, list, get, update, delete)
- Spread management
- Element management
- Version management
- Send proof workflow
- Comment management

Feature: 026-album-proofing
"""
from __future__ import annotations

import logging
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Path, Query, status, Response

from app.api.dependencies.auth import CurrentUserDep, WorkspaceAccessDep
from app.api.exceptions import AppError, NotFoundError
from app.schemas.album import (
    AlbumCreate,
    AlbumUpdate,
    AlbumResponse,
    AlbumListResponse,
    AlbumDetailResponse,
    SendProofRequest,
    SendProofResponse,
    ApproveAlbumRequest,
    ApproveAlbumResponse,
    Pagination,
)
from app.schemas.album_spread import (
    AlbumSpreadCreate,
    AlbumSpreadUpdate,
    AlbumSpreadResponse,
    SpreadReorderRequest,
    AlbumElementCreate,
    AlbumElementUpdate,
    AlbumElementResponse,
)
from app.schemas.album_comment import (
    AlbumCommentCreate,
    AlbumCommentUpdate,
    AlbumCommentResponse,
    AlbumCommentListResponse,
    CommentSummary,
)
from app.schemas.album_version import (
    AlbumVersionCreate,
    AlbumVersionResponse,
    AlbumVersionSummary,
    AlbumVersionListResponse,
    VersionComparison,
    RollbackRequest,
    RollbackResponse,
)
from app.schemas.album_render import (
    AlbumRenderCreate,
    AlbumRenderResponse,
    AlbumRenderListResponse,
)
from app.services.album_service import AlbumService
from app.services.album_exceptions import (
    AlbumNotFoundError,
    SpreadNotFoundError,
    AlbumVersionNotFoundError,
    AlbumAlreadyApprovedError,
    UnresolvedCommentsError,
    CommentNotFoundError,
)
from app.repositories.album_comment_repository import AlbumCommentRepository

logger = logging.getLogger(__name__)

router = APIRouter()


def _get_album_service() -> AlbumService:
    """Get album service instance."""
    return AlbumService()


# =========================================================================
# ALBUM CRUD
# =========================================================================


@router.get(
    "",
    response_model=AlbumListResponse,
    status_code=status.HTTP_200_OK,
    summary="List albums",
    description="List all albums in the workspace with pagination.",
)
async def list_albums(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 20,
    status_filter: Annotated[Optional[str], Query(alias="status")] = None,
    gallery_id: Annotated[Optional[UUID], Query(description="Filter by gallery")] = None,
) -> AlbumListResponse:
    """List albums for workspace."""
    service = _get_album_service()

    try:
        albums, total = await service.list_albums(
            workspace_id=workspace_id,
            status=status_filter,
            gallery_id=gallery_id,
            page=page,
            limit=limit,
        )

        return AlbumListResponse(
            data=albums,
            pagination=Pagination(
                total=total,
                page=page,
                limit=limit,
                pages=(total + limit - 1) // limit,
            ),
        )
    except Exception as e:
        logger.exception("Failed to list albums")
        raise AppError(
            message="Failed to list albums",
            code="INTERNAL_ERROR",
            status_code=500,
        )


@router.post(
    "",
    response_model=AlbumResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create album",
    description="Create a new album in the workspace.",
)
async def create_album(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: AlbumCreate,
) -> AlbumResponse:
    """Create a new album."""
    service = _get_album_service()

    try:
        album = await service.create_album(
            workspace_id=workspace_id,
            title=request.title,
            created_by_user_id=current_user.user_id,
            description=request.description,
            gallery_id=request.gallery_id,
            page_size=request.page_size,
            lab_preset_id=request.lab_preset_id,
        )

        logger.info(
            "Album created",
            extra={
                "album_id": str(album["album_id"]),
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
            },
        )

        return AlbumResponse(**album)
    except Exception as e:
        logger.exception("Failed to create album")
        raise AppError(
            message="Failed to create album",
            code="INTERNAL_ERROR",
            status_code=500,
        )


@router.get(
    "/{album_id}",
    response_model=AlbumDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Get album",
    description="Get album details with spreads and elements.",
)
async def get_album(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    album_id: Annotated[UUID, Path(..., description="Album ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> AlbumDetailResponse:
    """Get album with full details."""
    service = _get_album_service()

    try:
        album = await service.get_album_detail(album_id, workspace_id)
        return AlbumDetailResponse(**album)
    except AlbumNotFoundError:
        raise NotFoundError(f"Album {album_id} not found")
    except Exception as e:
        logger.exception("Failed to get album")
        raise AppError(
            message="Failed to get album",
            code="INTERNAL_ERROR",
            status_code=500,
        )


@router.patch(
    "/{album_id}",
    response_model=AlbumResponse,
    status_code=status.HTTP_200_OK,
    summary="Update album",
    description="Update album properties.",
)
async def update_album(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    album_id: Annotated[UUID, Path(..., description="Album ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: AlbumUpdate,
) -> AlbumResponse:
    """Update album fields."""
    service = _get_album_service()

    try:
        updates = request.model_dump(exclude_unset=True)
        album = await service.update_album(album_id, workspace_id, **updates)
        return AlbumResponse(**album)
    except AlbumNotFoundError:
        raise NotFoundError(f"Album {album_id} not found")
    except Exception as e:
        logger.exception("Failed to update album")
        raise AppError(
            message="Failed to update album",
            code="INTERNAL_ERROR",
            status_code=500,
        )


@router.delete(
    "/{album_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete album",
    description="Delete album and all related data.",
    response_class=Response,
    response_model=None,
)
async def delete_album(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    album_id: Annotated[UUID, Path(..., description="Album ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> None:
    """Delete album."""
    service = _get_album_service()

    try:
        await service.delete_album(album_id, workspace_id)

        logger.info(
            "Album deleted",
            extra={
                "album_id": str(album_id),
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
            },
        )
    except AlbumNotFoundError:
        raise NotFoundError(f"Album {album_id} not found")


# =========================================================================
# SEND PROOF
# =========================================================================


@router.post(
    "/{album_id}/send-proof",
    response_model=SendProofResponse,
    status_code=status.HTTP_200_OK,
    summary="Send album proof",
    description="Send album proof to client via share link.",
)
async def send_album_proof(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    album_id: Annotated[UUID, Path(..., description="Album ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: SendProofRequest,
) -> SendProofResponse:
    """Send album proof to client."""
    service = _get_album_service()

    try:
        result = await service.send_proof(
            album_id=album_id,
            workspace_id=workspace_id,
            client_email=request.client_email,
            sent_by_user_id=current_user.user_id,
            client_name=request.client_name,
            message=request.message,
            expires_in_days=request.expires_in_days,
            allow_download=request.allow_download,
        )

        return SendProofResponse(**result)
    except AlbumNotFoundError:
        raise NotFoundError(f"Album {album_id} not found")
    except Exception as e:
        logger.exception("Failed to send album proof")
        raise AppError(
            message="Failed to send album proof",
            code="INTERNAL_ERROR",
            status_code=500,
        )


# =========================================================================
# COMMENTS
# =========================================================================


@router.get(
    "/{album_id}/comments",
    response_model=AlbumCommentListResponse,
    status_code=status.HTTP_200_OK,
    summary="List album comments",
    description="List all comments on an album.",
)
async def list_album_comments(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    album_id: Annotated[UUID, Path(..., description="Album ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    spread_id: Annotated[Optional[UUID], Query(description="Filter by spread")] = None,
    status_filter: Annotated[Optional[str], Query(alias="status")] = None,
    include_resolved: Annotated[bool, Query()] = True,
) -> AlbumCommentListResponse:
    """List comments for an album."""
    comment_repo = AlbumCommentRepository()

    try:
        comments = await comment_repo.list_comments_by_album(
            album_id=album_id,
            workspace_id=workspace_id,
            spread_id=spread_id,
            status=status_filter,
            include_resolved=include_resolved,
        )

        summary = await comment_repo.get_comment_summary(album_id, workspace_id)

        return AlbumCommentListResponse(
            data=comments,
            summary=CommentSummary(**summary),
        )
    except Exception as e:
        logger.exception("Failed to list album comments")
        raise AppError(
            message="Failed to list comments",
            code="INTERNAL_ERROR",
            status_code=500,
        )


@router.patch(
    "/{album_id}/comments/{comment_id}",
    response_model=AlbumCommentResponse,
    status_code=status.HTTP_200_OK,
    summary="Update comment",
    description="Update comment status or body.",
)
async def update_album_comment(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    album_id: Annotated[UUID, Path(..., description="Album ID")],
    comment_id: Annotated[UUID, Path(..., description="Comment ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: AlbumCommentUpdate,
) -> AlbumCommentResponse:
    """Update a comment."""
    comment_repo = AlbumCommentRepository()

    try:
        comment = await comment_repo.update_comment(
            comment_id=comment_id,
            workspace_id=workspace_id,
            body=request.body,
            status=request.status.value if request.status else None,
        )

        if not comment:
            raise NotFoundError(f"Comment {comment_id} not found")

        return AlbumCommentResponse(**comment)
    except NotFoundError:
        raise
    except Exception as e:
        logger.exception("Failed to update comment")
        raise AppError(
            message="Failed to update comment",
            code="INTERNAL_ERROR",
            status_code=500,
        )


@router.post(
    "/{album_id}/comments/{comment_id}/resolve",
    response_model=AlbumCommentResponse,
    status_code=status.HTTP_200_OK,
    summary="Resolve comment",
    description="Mark comment as resolved.",
)
async def resolve_album_comment(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    album_id: Annotated[UUID, Path(..., description="Album ID")],
    comment_id: Annotated[UUID, Path(..., description="Comment ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> AlbumCommentResponse:
    """Resolve a comment."""
    comment_repo = AlbumCommentRepository()

    try:
        comment = await comment_repo.resolve_comment(
            comment_id=comment_id,
            workspace_id=workspace_id,
            resolved_by_user_id=current_user.user_id,
        )

        if not comment:
            raise NotFoundError(f"Comment {comment_id} not found")

        return AlbumCommentResponse(**comment)
    except NotFoundError:
        raise
    except Exception as e:
        logger.exception("Failed to resolve comment")
        raise AppError(
            message="Failed to resolve comment",
            code="INTERNAL_ERROR",
            status_code=500,
        )


@router.delete(
    "/{album_id}/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete comment",
    description="Soft delete a comment.",
    response_class=Response,
    response_model=None,
)
async def delete_album_comment(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    album_id: Annotated[UUID, Path(..., description="Album ID")],
    comment_id: Annotated[UUID, Path(..., description="Comment ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> None:
    """Delete a comment (soft delete)."""
    comment_repo = AlbumCommentRepository()

    try:
        deleted = await comment_repo.soft_delete_comment(comment_id, workspace_id)
        if not deleted:
            raise NotFoundError(f"Comment {comment_id} not found")
    except NotFoundError:
        raise


# =========================================================================
# VERSIONS
# =========================================================================


@router.get(
    "/{album_id}/versions",
    response_model=AlbumVersionListResponse,
    status_code=status.HTTP_200_OK,
    summary="List album versions",
    description="List all version snapshots for an album.",
)
async def list_album_versions(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    album_id: Annotated[UUID, Path(..., description="Album ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> AlbumVersionListResponse:
    """List versions for an album."""
    service = _get_album_service()

    try:
        versions = await service.list_versions(album_id, workspace_id)
        return AlbumVersionListResponse(data=versions)
    except Exception as e:
        logger.exception("Failed to list album versions")
        raise AppError(
            message="Failed to list versions",
            code="INTERNAL_ERROR",
            status_code=500,
        )


@router.post(
    "/{album_id}/versions",
    response_model=AlbumVersionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create version snapshot",
    description="Create a new version snapshot of the current album state.",
)
async def create_album_version(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    album_id: Annotated[UUID, Path(..., description="Album ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: AlbumVersionCreate,
) -> AlbumVersionResponse:
    """Create a version snapshot."""
    service = _get_album_service()

    try:
        version = await service.create_version(
            album_id=album_id,
            workspace_id=workspace_id,
            created_by_user_id=current_user.user_id,
            label=request.label,
        )

        return AlbumVersionResponse(**version)
    except AlbumNotFoundError:
        raise NotFoundError(f"Album {album_id} not found")
    except Exception as e:
        logger.exception("Failed to create album version")
        raise AppError(
            message="Failed to create version",
            code="INTERNAL_ERROR",
            status_code=500,
        )


@router.get(
    "/{album_id}/versions/{version_id}",
    response_model=AlbumVersionResponse,
    status_code=status.HTTP_200_OK,
    summary="Get version details",
    description="Get version details including full snapshot data.",
)
async def get_album_version(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    album_id: Annotated[UUID, Path(..., description="Album ID")],
    version_id: Annotated[UUID, Path(..., description="Version ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> AlbumVersionResponse:
    """Get version details."""
    service = _get_album_service()

    try:
        version = await service.get_version(version_id, workspace_id)
        return AlbumVersionResponse(**version)
    except AlbumVersionNotFoundError:
        raise NotFoundError(f"Version {version_id} not found")
    except Exception as e:
        logger.exception("Failed to get album version")
        raise AppError(
            message="Failed to get version",
            code="INTERNAL_ERROR",
            status_code=500,
        )


@router.post(
    "/{album_id}/versions/{version_id}/rollback",
    response_model=AlbumDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Rollback to version",
    description="Rollback album to a previous version snapshot.",
)
async def rollback_album_version(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    album_id: Annotated[UUID, Path(..., description="Album ID")],
    version_id: Annotated[UUID, Path(..., description="Version ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: RollbackRequest,
) -> AlbumDetailResponse:
    """Rollback to a version."""
    service = _get_album_service()

    try:
        album = await service.rollback_to_version(
            album_id=album_id,
            workspace_id=workspace_id,
            version_id=version_id,
            created_by_user_id=current_user.user_id,
            create_backup=request.create_backup,
        )

        logger.info(
            "Album rolled back",
            extra={
                "album_id": str(album_id),
                "version_id": str(version_id),
                "user_id": str(current_user.user_id),
            },
        )

        return AlbumDetailResponse(**album)
    except AlbumVersionNotFoundError:
        raise NotFoundError(f"Version {version_id} not found")
    except AlbumNotFoundError:
        raise NotFoundError(f"Album {album_id} not found")
    except Exception as e:
        logger.exception("Failed to rollback album")
        raise AppError(
            message="Failed to rollback version",
            code="INTERNAL_ERROR",
            status_code=500,
        )


@router.get(
    "/{album_id}/versions/compare",
    response_model=VersionComparison,
    status_code=status.HTTP_200_OK,
    summary="Compare versions",
    description="Compare two versions to see differences.",
)
async def compare_album_versions(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    album_id: Annotated[UUID, Path(..., description="Album ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    version_a: Annotated[UUID, Query(description="First version ID")],
    version_b: Annotated[UUID, Query(description="Second version ID")],
) -> VersionComparison:
    """Compare two versions."""
    # TODO: Implement version comparison logic
    raise AppError(
        message="Version comparison not yet implemented",
        code="NOT_IMPLEMENTED",
        status_code=501,
    )


# =========================================================================
# RENDERS
# =========================================================================


@router.get(
    "/{album_id}/renders",
    response_model=AlbumRenderListResponse,
    status_code=status.HTTP_200_OK,
    summary="List album renders",
    description="List all PDF renders for an album.",
)
async def list_album_renders(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    album_id: Annotated[UUID, Path(..., description="Album ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    render_type: Annotated[Optional[str], Query(description="Filter by type")] = None,
) -> AlbumRenderListResponse:
    """List renders for an album."""
    from app.repositories.album_render_repository import AlbumRenderRepository
    render_repo = AlbumRenderRepository()

    try:
        renders = await render_repo.list_renders_by_album(
            album_id=album_id,
            workspace_id=workspace_id,
            render_type=render_type,
        )

        return AlbumRenderListResponse(data=renders)
    except Exception as e:
        logger.exception("Failed to list album renders")
        raise AppError(
            message="Failed to list renders",
            code="INTERNAL_ERROR",
            status_code=500,
        )


@router.post(
    "/{album_id}/renders",
    response_model=AlbumRenderResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Request album render",
    description="Request a new PDF render for an album.",
)
async def create_album_render(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    album_id: Annotated[UUID, Path(..., description="Album ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: AlbumRenderCreate,
) -> AlbumRenderResponse:
    """Request a new render."""
    from app.repositories.album_render_repository import AlbumRenderRepository
    render_repo = AlbumRenderRepository()

    try:
        # Check for existing pending render
        pending = await render_repo.get_pending_render(
            album_id, workspace_id, request.render_type.value
        )

        if pending:
            raise AppError(
                message=f"A {request.render_type.value} render is already in progress",
                code="RENDER_IN_PROGRESS",
                status_code=409,
            )

        render = await render_repo.create_render(
            album_id=album_id,
            workspace_id=workspace_id,
            render_type=request.render_type.value,
            requested_by_user_id=current_user.user_id,
            resolution_dpi=request.options.resolution_dpi if request.options else 150,
            watermarked=request.options.watermark if request.options else True,
        )

        # TODO: Queue render job in Celery

        return AlbumRenderResponse(**render)
    except AppError:
        raise
    except Exception as e:
        logger.exception("Failed to create album render")
        raise AppError(
            message="Failed to create render",
            code="INTERNAL_ERROR",
            status_code=500,
        )


@router.get(
    "/{album_id}/renders/{render_id}",
    response_model=AlbumRenderResponse,
    status_code=status.HTTP_200_OK,
    summary="Get render status",
    description="Get render status and download URL if ready.",
)
async def get_album_render(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    album_id: Annotated[UUID, Path(..., description="Album ID")],
    render_id: Annotated[UUID, Path(..., description="Render ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> AlbumRenderResponse:
    """Get render status."""
    from app.repositories.album_render_repository import AlbumRenderRepository
    render_repo = AlbumRenderRepository()

    try:
        render = await render_repo.get_render_by_id(render_id, workspace_id)

        if not render:
            raise NotFoundError(f"Render {render_id} not found")

        return AlbumRenderResponse(**render)
    except NotFoundError:
        raise
    except Exception as e:
        logger.exception("Failed to get album render")
        raise AppError(
            message="Failed to get render",
            code="INTERNAL_ERROR",
            status_code=500,
        )
