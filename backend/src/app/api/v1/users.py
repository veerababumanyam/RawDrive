"""User API endpoints.

All routes prefixed with /api/v1/users.
Implements Requirements: 23.2, 23.3
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends

from app.api.dependencies.auth import CurrentUserDep
from app.api.schemas import (
    ErrorResponse,
    MessageResponse,
    SessionListResponse,
    SessionResponse,
    UpdateUserRequest,
    UserProfileResponse,
)
from app.db.postgres import get_postgres_pool
from app.services.session_service import SessionService
from app.api.exceptions import NotFoundError, ForbiddenError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/users", tags=["users"])


def _get_session_service() -> SessionService:
    return SessionService()


SessionServiceDep = Annotated[SessionService, Depends(_get_session_service)]


# ---------------------------------------------------------------------------
# User profile endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/me",
    response_model=UserProfileResponse,
    summary="Get current user",
    description="Get the current authenticated user's profile.",
)
async def get_current_user_profile(
    current_user: CurrentUserDep,
) -> UserProfileResponse:
    """Get current user profile."""
    pool = await get_postgres_pool()

    row = await pool.fetchrow(
        """
        SELECT user_id, email, display_name, email_verified, 
               preferred_language, created_at
        FROM users WHERE user_id = $1
        """,
        current_user.user_id,
    )

    if not row:
        raise NotFoundError("User", str(current_user.user_id))

    return UserProfileResponse(
        user_id=row["user_id"],
        email=row["email"],
        display_name=row["display_name"],
        email_verified=row["email_verified"],
        preferred_language=row["preferred_language"] or "en-IN",
        created_at=row["created_at"],
        workspace_id=current_user.workspace_ids[0] if current_user.workspace_ids else None,
    )


@router.patch(
    "/me",
    response_model=UserProfileResponse,
    summary="Update current user",
    description="Update the current user's profile.",
)
async def update_current_user(
    request: UpdateUserRequest,
    current_user: CurrentUserDep,
) -> UserProfileResponse:
    """Update current user profile."""
    pool = await get_postgres_pool()
    now = datetime.now(timezone.utc)

    # Build dynamic update
    updates = ["updated_at = $2"]
    params: list = [current_user.user_id, now]
    param_idx = 3

    if request.display_name is not None:
        updates.append(f"display_name = ${param_idx}")
        params.append(request.display_name)
        param_idx += 1

    if request.preferred_language is not None:
        updates.append(f"preferred_language = ${param_idx}")
        params.append(request.preferred_language)
        param_idx += 1

    query = f"""
        UPDATE users SET {', '.join(updates)}
        WHERE user_id = $1
        RETURNING user_id, email, display_name, email_verified, 
                  preferred_language, created_at
    """

    row = await pool.fetchrow(query, *params)

    if not row:
        raise NotFoundError("User", str(current_user.user_id))

    logger.info(
        "User profile updated",
        extra={"user_id": str(current_user.user_id)},
    )

    return UserProfileResponse(
        user_id=row["user_id"],
        email=row["email"],
        display_name=row["display_name"],
        email_verified=row["email_verified"],
        preferred_language=row["preferred_language"] or "en-IN",
        created_at=row["created_at"],
        workspace_id=current_user.workspace_ids[0] if current_user.workspace_ids else None,
    )


# ---------------------------------------------------------------------------
# Session management endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/me/sessions",
    response_model=SessionListResponse,
    summary="List active sessions",
    description="List all active sessions for the current user.",
)
async def list_user_sessions(
    current_user: CurrentUserDep,
    session_service: SessionServiceDep,
) -> SessionListResponse:
    """List all active sessions for current user."""
    sessions = await session_service.list_user_sessions(current_user.user_id)

    # Get current session ID from token (if available)
    current_session_id = getattr(current_user, "session_id", None)

    return SessionListResponse(
        items=[
            SessionResponse(
                session_id=s.session_id,
                device_info=s.device_info,
                ip_address=s.ip_address,
                user_agent=s.user_agent,
                created_at=s.created_at,
                last_used_at=s.last_used_at,
                is_current=s.session_id == current_session_id if current_session_id else False,
            )
            for s in sessions
        ]
    )


@router.delete(
    "/me/sessions/{session_id}",
    response_model=MessageResponse,
    responses={404: {"model": ErrorResponse}},
    summary="Terminate session",
    description="Terminate a specific session (logout from that device).",
)
async def terminate_session(
    session_id: UUID,
    current_user: CurrentUserDep,
    session_service: SessionServiceDep,
) -> MessageResponse:
    """Terminate a specific session.

    Property 9: Session Termination Token Invalidation
    """
    # Verify session belongs to current user
    pool = await get_postgres_pool()
    session = await pool.fetchrow(
        "SELECT user_id FROM sessions WHERE session_id = $1",
        session_id,
    )

    if not session:
        raise NotFoundError("Session", str(session_id))

    if session["user_id"] != current_user.user_id:
        raise ForbiddenError("Cannot terminate another user's session")

    await session_service.terminate_session(session_id)

    logger.info(
        "Session terminated",
        extra={
            "session_id": str(session_id),
            "user_id": str(current_user.user_id),
        },
    )

    return MessageResponse(message="Session terminated successfully")


@router.delete(
    "/me/sessions",
    response_model=MessageResponse,
    summary="Terminate all other sessions",
    description="Logout from all devices except the current one.",
)
async def terminate_all_other_sessions(
    current_user: CurrentUserDep,
    session_service: SessionServiceDep,
) -> MessageResponse:
    """Terminate all sessions except current."""
    current_session_id = getattr(current_user, "session_id", None)

    count = await session_service.terminate_all_sessions(
        user_id=current_user.user_id,
        except_session_id=current_session_id,
    )

    logger.info(
        "All other sessions terminated",
        extra={
            "user_id": str(current_user.user_id),
            "count": count,
        },
    )

    return MessageResponse(message=f"Terminated {count} session(s)")
