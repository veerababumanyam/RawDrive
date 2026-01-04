"""Curation Session API endpoints.

All routes prefixed with /api/v1/workspaces/{workspace_id}/galleries/{gallery_id}/curation-sessions.

Feature: 023-enhanced-smart-curate
"""

from __future__ import annotations

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Path, Query, status

from app.api.dependencies.auth import CurrentUserDep, WorkspaceAccessDep
from app.api.curation_schemas import (
    CurationSessionCreate,
    CurationSessionResponse,
    CurationSessionListResponse,
    CurationSessionUpdate,
    CurationSessionStartRequest,
)
from app.api.schemas import ErrorResponse, MessageResponse
from app.api.exceptions import NotFoundError, ConflictError, ValidationAppError
from app.services.curation_session_service import (
    CurationSessionService,
    get_curation_session_service,
    SessionNotFoundError,
    SessionAlreadyActiveError,
    SessionNotPausableError,
    InvalidSessionParametersError,
)

logger = logging.getLogger(__name__)

router = APIRouter()


def get_service() -> CurationSessionService:
    """Get curation session service instance."""
    return get_curation_session_service()


# =============================================================================
# Session CRUD Endpoints
# =============================================================================


@router.get(
    "",
    response_model=CurationSessionListResponse,
    status_code=status.HTTP_200_OK,
    summary="List curation sessions",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery not found"},
    },
)
async def list_sessions(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    status_filter: Annotated[str | None, Query(alias="status", description="Filter by status")] = None,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 20,
    offset: Annotated[int, Query(ge=0, description="Offset for pagination")] = 0,
) -> CurationSessionListResponse:
    """List curation sessions for a gallery.

    Returns all curation sessions with their progress status.
    Sessions are ordered by creation date (newest first).
    """
    service = get_service()

    sessions, total = await service.list_sessions(
        workspace_id,
        gallery_id,
        status=status_filter,
        limit=limit,
        offset=offset,
    )

    return CurationSessionListResponse(
        sessions=sessions,
        total=total,
    )


@router.post(
    "",
    response_model=CurationSessionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create curation session",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Gallery not found"},
        409: {"model": ErrorResponse, "description": "Active session exists"},
    },
)
async def create_session(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: CurationSessionCreate,
) -> CurationSessionResponse:
    """Create a new curation session for a gallery.

    Only one active session can exist per gallery at a time.
    If auto_start is True, analysis begins immediately.
    """
    service = get_service()

    try:
        session = await service.create_session(
            workspace_id=workspace_id,
            gallery_id=gallery_id,
            user_id=current_user.user_id,
            name=request.name,
            preset_id=request.preset_id,
            target_count=request.target_count,
            quality_threshold=request.quality_threshold or 0.0,
            similarity_threshold=request.similarity_threshold or 0.85,
            include_expression_analysis=request.include_expression_analysis,
            include_scene_detection=request.include_scene_detection,
            include_diversity=request.include_diversity,
            auto_start=request.auto_start,
        )

        return CurationSessionResponse(**session)

    except SessionAlreadyActiveError as e:
        raise ConflictError(str(e))
    except InvalidSessionParametersError as e:
        raise ValidationAppError(str(e))


@router.get(
    "/active",
    response_model=CurationSessionResponse | None,
    status_code=status.HTTP_200_OK,
    summary="Get active session",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def get_active_session(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> CurationSessionResponse | None:
    """Get the active curation session for a gallery, if any.

    Returns null if no active session exists.
    """
    service = get_service()

    session = await service.get_active_session(workspace_id, gallery_id)

    if session:
        return CurationSessionResponse(**session)
    return None


@router.get(
    "/{session_id}",
    response_model=CurationSessionResponse,
    status_code=status.HTTP_200_OK,
    summary="Get curation session",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Session not found"},
    },
)
async def get_session(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    session_id: Annotated[UUID, Path(..., description="Session ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> CurationSessionResponse:
    """Get a curation session by ID.

    Returns session details including progress status.
    """
    service = get_service()

    try:
        session = await service.get_session(workspace_id, session_id)
        return CurationSessionResponse(**session)
    except SessionNotFoundError as e:
        raise NotFoundError(str(e))


@router.patch(
    "/{session_id}",
    response_model=CurationSessionResponse,
    status_code=status.HTTP_200_OK,
    summary="Update curation session",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Session not found"},
    },
)
async def update_session(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    session_id: Annotated[UUID, Path(..., description="Session ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: CurationSessionUpdate,
) -> CurationSessionResponse:
    """Update curation session parameters.

    Only pending sessions can be updated. Once analysis starts,
    parameters are locked.
    """
    from app.repositories.curation_session_repository import get_curation_session_repository

    repo = get_curation_session_repository()

    # Build updates dict from non-None fields
    updates = {}
    if request.name is not None:
        updates["name"] = request.name
    if request.target_count is not None:
        updates["target_count"] = request.target_count
    if request.quality_threshold is not None:
        updates["quality_threshold"] = request.quality_threshold
    if request.similarity_threshold is not None:
        updates["similarity_threshold"] = request.similarity_threshold

    if not updates:
        # No updates, just return current session
        service = get_service()
        session = await service.get_session(workspace_id, session_id)
        return CurationSessionResponse(**session)

    session = await repo.update(workspace_id, session_id, **updates)

    if not session:
        raise NotFoundError(f"Session not found: {session_id}")

    # Format response
    service = get_service()
    formatted = service._format_session_response(session)
    return CurationSessionResponse(**formatted)


@router.delete(
    "/{session_id}",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Delete curation session",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Session not found"},
    },
)
async def delete_session(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    session_id: Annotated[UUID, Path(..., description="Session ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> MessageResponse:
    """Delete a curation session and all its data.

    This permanently deletes quality analyses, similarity groups,
    and curation selections associated with the session.
    """
    service = get_service()

    deleted = await service.delete_session(workspace_id, session_id)

    if not deleted:
        raise NotFoundError(f"Session not found: {session_id}")

    return MessageResponse(message="Session deleted successfully")


# =============================================================================
# Session Lifecycle Endpoints
# =============================================================================


@router.post(
    "/{session_id}/start",
    response_model=CurationSessionResponse,
    status_code=status.HTTP_200_OK,
    summary="Start curation session",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Session not found"},
    },
)
async def start_session(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    session_id: Annotated[UUID, Path(..., description="Session ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: CurationSessionStartRequest | None = None,
) -> CurationSessionResponse:
    """Start or resume a curation session.

    Triggers the analysis pipeline:
    1. Quality analysis (Gemini Vision)
    2. Embedding computation (CLIP)
    3. Similarity grouping
    4. Curation selection

    If resume_from_step is provided, continues from that step.
    """
    service = get_service()

    try:
        resume_from = request.resume_from_step if request else None
        session = await service.start_session(
            workspace_id, session_id, resume_from_step=resume_from
        )
        return CurationSessionResponse(**session)
    except SessionNotFoundError as e:
        raise NotFoundError(str(e))


@router.post(
    "/{session_id}/pause",
    response_model=CurationSessionResponse,
    status_code=status.HTTP_200_OK,
    summary="Pause curation session",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Session not found"},
        409: {"model": ErrorResponse, "description": "Session cannot be paused"},
    },
)
async def pause_session(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    gallery_id: Annotated[UUID, Path(..., description="Gallery ID")],
    session_id: Annotated[UUID, Path(..., description="Session ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
) -> CurationSessionResponse:
    """Pause an active curation session.

    The session can be resumed later from where it left off.
    Only sessions in 'analyzing', 'grouping', or 'curating' status can be paused.
    """
    service = get_service()

    try:
        session = await service.pause_session(workspace_id, session_id)
        return CurationSessionResponse(**session)
    except SessionNotFoundError as e:
        raise NotFoundError(str(e))
    except SessionNotPausableError as e:
        raise ConflictError(str(e))
