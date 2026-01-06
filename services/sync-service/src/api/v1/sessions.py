"""
API endpoints for sync sessions.

Provides endpoints for sync session lifecycle management.
"""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from src.schemas.sessions import (
    SyncSessionCreate,
    SyncSessionResponse,
    StartSyncSessionResponse,
)
from src.services import SyncSessionService
from src.services.session_service import (
    SessionLimitExceededError,
    SessionNotFoundError,
    MappingNotActiveError,
)
from src.api.v1.dependencies import get_workspace_context, WorkspaceContext
from src.logging import get_logger

router = APIRouter()
logger = get_logger(__name__)


def get_session_service() -> SyncSessionService:
    """Dependency to get sync session service."""
    return SyncSessionService()


@router.post(
    "",
    response_model=StartSyncSessionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Start sync session",
    description="Start a new sync session for a mapping.",
)
async def start_session(
    data: SyncSessionCreate,
    context: WorkspaceContext = Depends(get_workspace_context),
    service: SyncSessionService = Depends(get_session_service),
) -> StartSyncSessionResponse:
    """Start a new sync session."""
    try:
        return await service.start_session(
            workspace_id=context.workspace_id,
            user_id=context.user_id,
            data=data,
        )
    except SessionLimitExceededError as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "limit_exceeded", "message": e.message},
        )
    except MappingNotActiveError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "mapping_not_active", "message": e.message},
        )


@router.get(
    "",
    response_model=List[SyncSessionResponse],
    summary="List active sessions",
    description="List all active sync sessions for the workspace.",
)
async def list_active_sessions(
    context: WorkspaceContext = Depends(get_workspace_context),
    service: SyncSessionService = Depends(get_session_service),
) -> List[SyncSessionResponse]:
    """List active sync sessions."""
    return await service.list_active_sessions(context.workspace_id)


@router.get(
    "/{session_id}",
    response_model=SyncSessionResponse,
    summary="Get sync session",
    description="Get a sync session by ID.",
)
async def get_session(
    session_id: UUID,
    context: WorkspaceContext = Depends(get_workspace_context),
    service: SyncSessionService = Depends(get_session_service),
) -> SyncSessionResponse:
    """Get a sync session by ID."""
    try:
        return await service.get_session(session_id, context.workspace_id)
    except SessionNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "not_found", "message": "Sync session not found"},
        )


@router.post(
    "/{session_id}/pause",
    response_model=SyncSessionResponse,
    summary="Pause sync session",
    description="Pause an active sync session.",
)
async def pause_session(
    session_id: UUID,
    context: WorkspaceContext = Depends(get_workspace_context),
    service: SyncSessionService = Depends(get_session_service),
) -> SyncSessionResponse:
    """Pause a sync session."""
    try:
        return await service.pause_session(session_id, context.workspace_id)
    except SessionNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "not_found", "message": "Sync session not found"},
        )


@router.post(
    "/{session_id}/resume",
    response_model=SyncSessionResponse,
    summary="Resume sync session",
    description="Resume a paused sync session.",
)
async def resume_session(
    session_id: UUID,
    context: WorkspaceContext = Depends(get_workspace_context),
    service: SyncSessionService = Depends(get_session_service),
) -> SyncSessionResponse:
    """Resume a paused sync session."""
    try:
        return await service.resume_session(session_id, context.workspace_id)
    except SessionNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "not_found", "message": "Sync session not found"},
        )


@router.post(
    "/{session_id}/end",
    response_model=SyncSessionResponse,
    summary="End sync session",
    description="End a sync session.",
)
async def end_session(
    session_id: UUID,
    context: WorkspaceContext = Depends(get_workspace_context),
    service: SyncSessionService = Depends(get_session_service),
) -> SyncSessionResponse:
    """End a sync session."""
    try:
        return await service.end_session(session_id, context.workspace_id)
    except SessionNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": "not_found", "message": "Sync session not found"},
        )
