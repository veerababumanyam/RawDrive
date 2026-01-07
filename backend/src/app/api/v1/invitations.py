"""Team Member Invitations API endpoints.

Public endpoints for accepting and previewing workspace member invitations.
These are separate from workspace-scoped invitation management in workspaces.py.

All routes prefixed with /api/v1/invitations.
Implements Requirements: 28.1, 28.2, 28.3
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.api.dependencies.auth import CurrentUserDep
from app.services.invitation_service import (
    InvitationService,
    InvitationError,
    InvitationNotFoundError,
    InvitationExpiredError,
    InvitationAlreadyAcceptedError,
    InvitationRevokedError,
    MemberAlreadyExistsError,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/invitations", tags=["invitations"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class InvitationPreviewResponse(BaseModel):
    """Public invitation preview response (no auth required)."""

    invitation_id: UUID
    workspace_id: UUID
    workspace_name: str
    email: str
    status: str
    invited_by: str
    created_at: datetime
    expires_at: datetime
    is_expired: bool = Field(
        ...,
        description="True if invitation has expired (based on expires_at)"
    )
    is_valid: bool = Field(
        ...,
        description="True if invitation can still be accepted (pending and not expired)"
    )


class AcceptInvitationRequest(BaseModel):
    """Request to accept an invitation."""

    token: str = Field(..., description="Invitation token from the invitation link")


class AcceptInvitationResponse(BaseModel):
    """Response after accepting an invitation."""

    success: bool
    workspace_id: UUID
    workspace_name: str
    message: str


class InvitationStatusResponse(BaseModel):
    """Simple status check response."""

    valid: bool
    status: str
    message: str
    workspace_name: Optional[str] = None


# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------


def _get_invitation_service() -> InvitationService:
    return InvitationService()


InvitationServiceDep = Annotated[InvitationService, Depends(_get_invitation_service)]


# ---------------------------------------------------------------------------
# Public Endpoints (No Auth Required)
# ---------------------------------------------------------------------------


@router.get(
    "/{token}",
    response_model=InvitationPreviewResponse,
    summary="Preview invitation",
    description="Get invitation details by token. No authentication required. Used for invitation preview page.",
    responses={
        404: {"description": "Invitation not found or token is invalid"},
    },
)
async def preview_invitation(
    token: str,
    invitation_service: InvitationServiceDep,
) -> InvitationPreviewResponse:
    """Preview an invitation by token.

    This is a public endpoint that does not require authentication.
    It allows users to see invitation details before logging in or signing up.

    The response includes:
    - Workspace name they're being invited to
    - Who sent the invitation
    - Whether the invitation is still valid
    """
    try:
        invitation = await invitation_service.get_invitation_by_token(token)
    except InvitationNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "INVITATION_NOT_FOUND",
                "message": "Invitation not found or token is invalid",
            },
        )

    now = datetime.now(timezone.utc)
    is_expired = invitation.expires_at < now
    is_valid = invitation.status == "pending" and not is_expired

    return InvitationPreviewResponse(
        invitation_id=invitation.invitation_id,
        workspace_id=invitation.workspace_id,
        workspace_name=invitation.workspace_name,
        email=invitation.email,
        status=invitation.status,
        invited_by=invitation.invited_by_name,
        created_at=invitation.created_at,
        expires_at=invitation.expires_at,
        is_expired=is_expired,
        is_valid=is_valid,
    )


@router.get(
    "/{token}/status",
    response_model=InvitationStatusResponse,
    summary="Check invitation status",
    description="Quick status check for an invitation token. No authentication required.",
    responses={
        404: {"description": "Invitation not found"},
    },
)
async def check_invitation_status(
    token: str,
    invitation_service: InvitationServiceDep,
) -> InvitationStatusResponse:
    """Check if an invitation token is valid.

    A lightweight endpoint for quickly checking invitation validity
    without returning full invitation details.
    """
    try:
        invitation = await invitation_service.get_invitation_by_token(token)
    except InvitationNotFoundError:
        return InvitationStatusResponse(
            valid=False,
            status="not_found",
            message="Invitation not found or token is invalid",
        )

    now = datetime.now(timezone.utc)
    is_expired = invitation.expires_at < now

    if invitation.status == "accepted":
        return InvitationStatusResponse(
            valid=False,
            status="accepted",
            message="This invitation has already been accepted",
            workspace_name=invitation.workspace_name,
        )
    elif invitation.status == "revoked":
        return InvitationStatusResponse(
            valid=False,
            status="revoked",
            message="This invitation has been revoked",
            workspace_name=invitation.workspace_name,
        )
    elif is_expired:
        return InvitationStatusResponse(
            valid=False,
            status="expired",
            message="This invitation has expired",
            workspace_name=invitation.workspace_name,
        )
    else:
        return InvitationStatusResponse(
            valid=True,
            status="pending",
            message="Invitation is valid and can be accepted",
            workspace_name=invitation.workspace_name,
        )


# ---------------------------------------------------------------------------
# Authenticated Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/accept",
    response_model=AcceptInvitationResponse,
    summary="Accept invitation",
    description="Accept a workspace invitation. Requires authentication. The authenticated user's email must match the invitation email.",
    responses={
        401: {"description": "Authentication required"},
        403: {"description": "Email mismatch - invitation is for a different email"},
        404: {"description": "Invitation not found"},
        409: {"description": "Invitation already accepted or user already a member"},
        410: {"description": "Invitation expired or revoked"},
    },
)
async def accept_invitation(
    request: AcceptInvitationRequest,
    current_user: CurrentUserDep,
    invitation_service: InvitationServiceDep,
) -> AcceptInvitationResponse:
    """Accept a workspace invitation.

    The user must be authenticated, and their email must match the invitation email.
    Upon successful acceptance:
    - User is added to the workspace with the invited roles
    - Invitation status is updated to 'accepted'

    Property 15: Invitation Token Expiry is enforced - expired tokens are rejected.
    """
    try:
        # Get invitation details first for the response
        invitation = await invitation_service.get_invitation_by_token(request.token)
        workspace_name = invitation.workspace_name

        # Accept the invitation
        workspace_id = await invitation_service.accept_invitation(
            token=request.token,
            user_id=current_user.user_id,
        )

        logger.info(
            "Invitation accepted via API",
            extra={
                "user_id": str(current_user.user_id),
                "workspace_id": str(workspace_id),
                "invitation_id": str(invitation.invitation_id),
            },
        )

        return AcceptInvitationResponse(
            success=True,
            workspace_id=workspace_id,
            workspace_name=workspace_name,
            message=f"You have successfully joined {workspace_name}",
        )

    except InvitationNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "INVITATION_NOT_FOUND",
                "message": "Invitation not found or token is invalid",
            },
        )
    except InvitationExpiredError:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={
                "code": "INVITATION_EXPIRED",
                "message": "This invitation has expired. Please request a new invitation.",
            },
        )
    except InvitationAlreadyAcceptedError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "INVITATION_ALREADY_ACCEPTED",
                "message": "This invitation has already been accepted",
            },
        )
    except InvitationRevokedError:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={
                "code": "INVITATION_REVOKED",
                "message": "This invitation has been revoked",
            },
        )
    except MemberAlreadyExistsError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "MEMBER_ALREADY_EXISTS",
                "message": "You are already a member of this workspace",
            },
        )
    except InvitationError as e:
        if e.code == "EMAIL_MISMATCH":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "EMAIL_MISMATCH",
                    "message": "This invitation was sent to a different email address. Please log in with the correct account.",
                },
            )
        raise HTTPException(
            status_code=e.status,
            detail={
                "code": e.code,
                "message": str(e),
            },
        )
