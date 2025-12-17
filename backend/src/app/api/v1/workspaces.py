"""Workspace API endpoints.

All routes prefixed with /api/v1/workspaces.
Implements Requirements: 6.1, 6.2, 6.4, 7.1, 7.5, 28.1
"""

from __future__ import annotations

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.dependencies.auth import (
    CurrentUserDep,
    require_permissions,
    WorkspaceAccessDep,
)
from app.api.schemas import (
    CreateRoleRequest,
    CreateWorkspaceRequest,
    ErrorResponse,
    InviteMemberRequest,
    InvitationResponse,
    MemberListResponse,
    MessageResponse,
    RoleListResponse,
    RoleResponse,
    SubscriptionResponse,
    UpdateRoleRequest,
    UpdateWorkspaceRequest,
    WorkspaceMemberResponse,
    WorkspaceResponse,
    WorkspaceWithSubscriptionResponse,
    PlanResponse,
)
from app.services.rbac_service import RBACService
from app.services.subscription_service import SubscriptionService
from app.services.workspace_service import (
    WorkspaceService,
    WorkspaceAccessDeniedError,
    WorkspaceDisabledError,
    WorkspaceNotFoundError,
    WorkspaceSlugTakenError,
    WorkspaceError,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/workspaces", tags=["workspaces"])


def _get_workspace_service() -> WorkspaceService:
    return WorkspaceService()


def _get_subscription_service() -> SubscriptionService:
    return SubscriptionService()


def _get_rbac_service() -> RBACService:
    return RBACService()


WorkspaceServiceDep = Annotated[WorkspaceService, Depends(_get_workspace_service)]
SubscriptionServiceDep = Annotated[SubscriptionService, Depends(_get_subscription_service)]
RBACServiceDep = Annotated[RBACService, Depends(_get_rbac_service)]


# ---------------------------------------------------------------------------
# Workspace CRUD endpoints
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=list[WorkspaceWithSubscriptionResponse],
    summary="List user workspaces",
    description="List all workspaces the current user has access to.",
)
async def list_workspaces(
    current_user: CurrentUserDep,
    workspace_service: WorkspaceServiceDep,
) -> list[WorkspaceWithSubscriptionResponse]:
    """List all workspaces for current user."""
    workspaces = await workspace_service.list_user_workspaces(current_user.user_id)

    return [
        WorkspaceWithSubscriptionResponse(
            workspace=WorkspaceResponse(
                workspace_id=ws.workspace.workspace_id,
                name=ws.workspace.name,
                slug=ws.workspace.slug,
                status=ws.workspace.status,
                default_language=ws.workspace.default_language,
                created_at=ws.workspace.created_at,
                updated_at=ws.workspace.updated_at,
            ),
            subscription_status=ws.subscription_status,
            plan_code=ws.plan_code,
            plan_name=ws.plan_name,
            trial_expires_at=ws.trial_expires_at,
            current_period_end=ws.current_period_end,
        )
        for ws in workspaces
    ]


@router.post(
    "",
    response_model=WorkspaceWithSubscriptionResponse,
    status_code=status.HTTP_201_CREATED,
    responses={409: {"model": ErrorResponse}},
    summary="Create workspace",
    description="Create a new workspace with trial subscription.",
)
async def create_workspace(
    request: CreateWorkspaceRequest,
    current_user: CurrentUserDep,
    workspace_service: WorkspaceServiceDep,
) -> WorkspaceWithSubscriptionResponse:
    """Create a new workspace.

    Property 10: Workspace Creation Trial Assignment enforced.
    """
    try:
        ws = await workspace_service.create_workspace(
            owner_user_id=current_user.user_id,
            name=request.name,
            slug=request.slug,
            default_language=request.default_language,
        )
    except WorkspaceSlugTakenError as e:
        raise HTTPException(
            status_code=e.status,
            detail={"code": e.code, "message": str(e)},
        )

    return WorkspaceWithSubscriptionResponse(
        workspace=WorkspaceResponse(
            workspace_id=ws.workspace.workspace_id,
            name=ws.workspace.name,
            slug=ws.workspace.slug,
            status=ws.workspace.status,
            default_language=ws.workspace.default_language,
            created_at=ws.workspace.created_at,
            updated_at=ws.workspace.updated_at,
        ),
        subscription_status=ws.subscription_status,
        plan_code=ws.plan_code,
        plan_name=ws.plan_name,
        trial_expires_at=ws.trial_expires_at,
        current_period_end=ws.current_period_end,
    )


@router.get(
    "/{workspace_id}",
    response_model=WorkspaceWithSubscriptionResponse,
    responses={403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
    summary="Get workspace",
    description="Get workspace details by ID.",
)
async def get_workspace(
    workspace_id: UUID,
    current_user: CurrentUserDep,
    workspace_service: WorkspaceServiceDep,
) -> WorkspaceWithSubscriptionResponse:
    """Get workspace by ID."""
    try:
        ws = await workspace_service.get_workspace(workspace_id, current_user.user_id)
    except (WorkspaceNotFoundError, WorkspaceAccessDeniedError, WorkspaceDisabledError) as e:
        raise HTTPException(
            status_code=e.status,
            detail={"code": e.code, "message": str(e)},
        )

    return WorkspaceWithSubscriptionResponse(
        workspace=WorkspaceResponse(
            workspace_id=ws.workspace.workspace_id,
            name=ws.workspace.name,
            slug=ws.workspace.slug,
            status=ws.workspace.status,
            default_language=ws.workspace.default_language,
            created_at=ws.workspace.created_at,
            updated_at=ws.workspace.updated_at,
        ),
        subscription_status=ws.subscription_status,
        plan_code=ws.plan_code,
        plan_name=ws.plan_name,
        trial_expires_at=ws.trial_expires_at,
        current_period_end=ws.current_period_end,
    )


@router.patch(
    "/{workspace_id}",
    response_model=WorkspaceResponse,
    responses={403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
    summary="Update workspace",
    description="Update workspace settings. Requires settings:write permission.",
)
async def update_workspace(
    workspace_id: UUID,
    request: UpdateWorkspaceRequest,
    current_user: CurrentUserDep,
    workspace_service: WorkspaceServiceDep,
    rbac_service: RBACServiceDep,
) -> WorkspaceResponse:
    """Update workspace settings."""
    # Check permission
    permission = await rbac_service.check_permission(
        user_id=current_user.user_id,
        workspace_id=workspace_id,
        required_permission="settings:write",
    )
    if not permission.allowed:
        raise HTTPException(
            status_code=403,
            detail={"code": "PERMISSION_DENIED", "message": permission.reason or "Permission denied"},
        )

    try:
        workspace = await workspace_service.update_workspace(
            workspace_id=workspace_id,
            user_id=current_user.user_id,
            name=request.name,
            slug=request.slug,
            default_language=request.default_language,
        )
    except WorkspaceSlugTakenError as e:
        raise HTTPException(
            status_code=e.status,
            detail={"code": e.code, "message": str(e)},
        )
    except WorkspaceNotFoundError as e:
        raise HTTPException(
            status_code=e.status,
            detail={"code": e.code, "message": str(e)},
        )

    return WorkspaceResponse(
        workspace_id=workspace.workspace_id,
        name=workspace.name,
        slug=workspace.slug,
        status=workspace.status,
        default_language=workspace.default_language,
        created_at=workspace.created_at,
        updated_at=workspace.updated_at,
    )


@router.delete(
    "/{workspace_id}",
    response_model=MessageResponse,
    responses={403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
    summary="Disable workspace",
    description="Disable workspace (soft delete). Requires workspace:* permission (owner only).",
)
async def disable_workspace(
    workspace_id: UUID,
    current_user: CurrentUserDep,
    workspace_service: WorkspaceServiceDep,
    rbac_service: RBACServiceDep,
) -> MessageResponse:
    """Disable workspace (soft delete)."""
    # Check owner permission
    permission = await rbac_service.check_permission(
        user_id=current_user.user_id,
        workspace_id=workspace_id,
        required_permission="workspace:*",
    )
    if not permission.allowed:
        raise HTTPException(
            status_code=403,
            detail={"code": "PERMISSION_DENIED", "message": "Only workspace owner can disable workspace"},
        )

    try:
        await workspace_service.disable_workspace(
            workspace_id=workspace_id,
            user_id=current_user.user_id,
        )
    except WorkspaceNotFoundError as e:
        raise HTTPException(
            status_code=e.status,
            detail={"code": e.code, "message": str(e)},
        )

    return MessageResponse(message="Workspace disabled successfully")


# ---------------------------------------------------------------------------
# Workspace member endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/{workspace_id}/members",
    response_model=MemberListResponse,
    responses={403: {"model": ErrorResponse}},
    summary="List workspace members",
    description="List all members of a workspace. Requires member:read permission.",
)
async def list_members(
    workspace_id: UUID,
    current_user: CurrentUserDep,
    workspace_service: WorkspaceServiceDep,
    rbac_service: RBACServiceDep,
) -> MemberListResponse:
    """List workspace members."""
    # Check permission
    permission = await rbac_service.check_permission(
        user_id=current_user.user_id,
        workspace_id=workspace_id,
        required_permission="member:read",
    )
    if not permission.allowed:
        raise HTTPException(
            status_code=403,
            detail={"code": "PERMISSION_DENIED", "message": permission.reason or "Permission denied"},
        )

    members = await workspace_service.list_members(workspace_id)

    return MemberListResponse(
        items=[
            WorkspaceMemberResponse(
                membership_id=m.membership_id,
                user_id=m.user_id,
                user_email=m.user_email,
                user_display_name=m.user_display_name,
                status=m.status,
                roles=m.roles,
                invited_at=m.invited_at,
                accepted_at=m.accepted_at,
            )
            for m in members
        ],
        total=len(members),
        page=1,
        per_page=len(members),
        total_pages=1,
    )


@router.delete(
    "/{workspace_id}/members/{user_id}",
    response_model=MessageResponse,
    responses={403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
    summary="Remove member",
    description="Remove a member from the workspace. Requires member:write permission.",
)
async def remove_member(
    workspace_id: UUID,
    user_id: UUID,
    current_user: CurrentUserDep,
    workspace_service: WorkspaceServiceDep,
    rbac_service: RBACServiceDep,
) -> MessageResponse:
    """Remove member from workspace."""
    # Check permission
    permission = await rbac_service.check_permission(
        user_id=current_user.user_id,
        workspace_id=workspace_id,
        required_permission="member:write",
    )
    if not permission.allowed:
        raise HTTPException(
            status_code=403,
            detail={"code": "PERMISSION_DENIED", "message": permission.reason or "Permission denied"},
        )

    try:
        await workspace_service.remove_member(
            workspace_id=workspace_id,
            user_id=user_id,
            removed_by_user_id=current_user.user_id,
        )
    except WorkspaceError as e:
        raise HTTPException(
            status_code=e.status,
            detail={"code": e.code, "message": str(e)},
        )

    return MessageResponse(message="Member removed successfully")


# ---------------------------------------------------------------------------
# Subscription endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/{workspace_id}/subscription",
    response_model=SubscriptionResponse,
    responses={403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
    summary="Get subscription status",
    description="Get workspace subscription status and usage. Requires billing:read permission.",
)
async def get_subscription(
    workspace_id: UUID,
    current_user: CurrentUserDep,
    subscription_service: SubscriptionServiceDep,
    rbac_service: RBACServiceDep,
) -> SubscriptionResponse:
    """Get subscription status."""
    # Check access (any workspace member can view subscription)
    permission = await rbac_service.check_permission(
        user_id=current_user.user_id,
        workspace_id=workspace_id,
        required_permission="billing:read",
    )
    if not permission.allowed:
        raise HTTPException(
            status_code=403,
            detail={"code": "PERMISSION_DENIED", "message": permission.reason or "Permission denied"},
        )

    from app.services.subscription_service import SubscriptionNotFoundError

    try:
        status = await subscription_service.get_subscription_status(workspace_id)
    except SubscriptionNotFoundError as e:
        raise HTTPException(
            status_code=e.status,
            detail={"code": e.code, "message": str(e)},
        )

    return SubscriptionResponse(
        workspace_id=status.workspace_id,
        plan=PlanResponse(
            plan_id=status.plan.plan_id,
            code=status.plan.code,
            name=status.plan.name,
            price_monthly=status.plan.price_monthly,
            price_annual=status.plan.price_annual,
            currency=status.plan.currency,
            storage_bytes=status.plan.storage_bytes,
            max_galleries=status.plan.max_galleries,
            max_clients=status.plan.max_clients,
            max_team_members=status.plan.max_team_members,
            ai_credits_monthly=status.plan.ai_credits_monthly,
            features=status.plan.features,
        ),
        status=status.status.value,
        is_trial=status.is_trial,
        trial_days_remaining=status.trial_days_remaining,
        current_period_start=status.current_period_start,
        current_period_end=status.current_period_end,
        cancel_at_period_end=status.cancel_at_period_end,
        storage_used_bytes=status.storage_used_bytes,
        galleries_count=status.galleries_count,
        clients_count=status.clients_count,
        team_members_count=status.team_members_count,
        ai_credits_used=status.ai_credits_used,
    )


# ---------------------------------------------------------------------------
# Role endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/{workspace_id}/roles",
    response_model=RoleListResponse,
    responses={403: {"model": ErrorResponse}},
    summary="List workspace roles",
    description="List all roles in the workspace.",
)
async def list_roles(
    workspace_id: UUID,
    current_user: CurrentUserDep,
    rbac_service: RBACServiceDep,
) -> RoleListResponse:
    """List workspace roles."""
    # Check access
    permission = await rbac_service.check_permission(
        user_id=current_user.user_id,
        workspace_id=workspace_id,
        required_permission="role:read",
    )
    if not permission.allowed:
        raise HTTPException(
            status_code=403,
            detail={"code": "PERMISSION_DENIED", "message": permission.reason or "Permission denied"},
        )

    roles = await rbac_service.list_workspace_roles(workspace_id)

    return RoleListResponse(
        items=[
            RoleResponse(
                role_id=r.role_id,
                workspace_id=r.workspace_id,
                name=r.name,
                permissions=r.permissions,
                is_system=r.is_system,
                created_at=r.created_at,
            )
            for r in roles
        ]
    )


@router.post(
    "/{workspace_id}/roles",
    response_model=RoleResponse,
    status_code=status.HTTP_201_CREATED,
    responses={403: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
    summary="Create custom role",
    description="Create a new custom role. Requires role:write permission.",
)
async def create_role(
    workspace_id: UUID,
    request: CreateRoleRequest,
    current_user: CurrentUserDep,
    rbac_service: RBACServiceDep,
) -> RoleResponse:
    """Create a custom role."""
    # Check permission
    permission = await rbac_service.check_permission(
        user_id=current_user.user_id,
        workspace_id=workspace_id,
        required_permission="role:write",
    )
    if not permission.allowed:
        raise HTTPException(
            status_code=403,
            detail={"code": "PERMISSION_DENIED", "message": permission.reason or "Permission denied"},
        )

    from app.services.rbac_service import RBACError

    try:
        role = await rbac_service.create_role(
            workspace_id=workspace_id,
            name=request.name,
            permissions=request.permissions,
            created_by_user_id=current_user.user_id,
        )
    except RBACError as e:
        raise HTTPException(
            status_code=e.status,
            detail={"code": e.code, "message": str(e)},
        )

    return RoleResponse(
        role_id=role.role_id,
        workspace_id=role.workspace_id,
        name=role.name,
        permissions=role.permissions,
        is_system=role.is_system,
        created_at=role.created_at,
    )


@router.patch(
    "/{workspace_id}/roles/{role_id}",
    response_model=RoleResponse,
    responses={403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
    summary="Update role",
    description="Update a custom role. System roles cannot be modified. Requires role:write permission.",
)
async def update_role(
    workspace_id: UUID,
    role_id: UUID,
    request: UpdateRoleRequest,
    current_user: CurrentUserDep,
    rbac_service: RBACServiceDep,
) -> RoleResponse:
    """Update a custom role."""
    # Check permission
    permission = await rbac_service.check_permission(
        user_id=current_user.user_id,
        workspace_id=workspace_id,
        required_permission="role:write",
    )
    if not permission.allowed:
        raise HTTPException(
            status_code=403,
            detail={"code": "PERMISSION_DENIED", "message": permission.reason or "Permission denied"},
        )

    from app.services.rbac_service import RBACError

    try:
        role = await rbac_service.update_role(
            role_id=role_id,
            workspace_id=workspace_id,
            name=request.name,
            permissions=request.permissions,
            updated_by_user_id=current_user.user_id,
        )
    except RBACError as e:
        raise HTTPException(
            status_code=e.status,
            detail={"code": e.code, "message": str(e)},
        )

    return RoleResponse(
        role_id=role.role_id,
        workspace_id=role.workspace_id,
        name=role.name,
        permissions=role.permissions,
        is_system=role.is_system,
        created_at=role.created_at,
    )


@router.delete(
    "/{workspace_id}/roles/{role_id}",
    response_model=MessageResponse,
    responses={403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
    summary="Delete role",
    description="Delete a custom role. System roles cannot be deleted. Requires role:write permission.",
)
async def delete_role(
    workspace_id: UUID,
    role_id: UUID,
    current_user: CurrentUserDep,
    rbac_service: RBACServiceDep,
) -> MessageResponse:
    """Delete a custom role."""
    # Check permission
    permission = await rbac_service.check_permission(
        user_id=current_user.user_id,
        workspace_id=workspace_id,
        required_permission="role:write",
    )
    if not permission.allowed:
        raise HTTPException(
            status_code=403,
            detail={"code": "PERMISSION_DENIED", "message": permission.reason or "Permission denied"},
        )

    from app.services.rbac_service import RBACError

    try:
        await rbac_service.delete_role(
            role_id=role_id,
            workspace_id=workspace_id,
        )
    except RBACError as e:
        raise HTTPException(
            status_code=e.status,
            detail={"code": e.code, "message": str(e)},
        )

    return MessageResponse(message="Role deleted successfully")


# ---------------------------------------------------------------------------
# Invitation endpoints
# ---------------------------------------------------------------------------


from app.services.invitation_service import (
    InvitationService,
    InvitationError,
    InvitationNotFoundError,
    InvitationExpiredError,
    MemberAlreadyExistsError,
)


def _get_invitation_service() -> InvitationService:
    return InvitationService()


InvitationServiceDep = Annotated[InvitationService, Depends(_get_invitation_service)]


@router.post(
    "/{workspace_id}/members/invite",
    response_model=InvitationResponse,
    status_code=status.HTTP_201_CREATED,
    responses={403: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
    summary="Invite member",
    description="Send an invitation to join the workspace. Requires member:invite permission.",
)
async def invite_member(
    workspace_id: UUID,
    request: InviteMemberRequest,
    current_user: CurrentUserDep,
    rbac_service: RBACServiceDep,
    invitation_service: InvitationServiceDep,
) -> InvitationResponse:
    """Invite a new member to the workspace."""
    # Check permission
    permission = await rbac_service.check_permission(
        user_id=current_user.user_id,
        workspace_id=workspace_id,
        required_permission="member:invite",
    )
    if not permission.allowed:
        raise HTTPException(
            status_code=403,
            detail={"code": "PERMISSION_DENIED", "message": permission.reason or "Permission denied"},
        )

    try:
        invitation, token = await invitation_service.create_invitation(
            workspace_id=workspace_id,
            email=request.email,
            role_ids=request.role_ids,
            invited_by_user_id=current_user.user_id,
        )
    except (InvitationError, MemberAlreadyExistsError) as e:
        raise HTTPException(
            status_code=e.status,
            detail={"code": e.code, "message": str(e)},
        )

    # TODO: Send invitation email with token

    # Get role names for response
    roles = await rbac_service.list_workspace_roles(workspace_id)
    role_names = [r.name for r in roles if r.role_id in invitation.role_ids]

    return InvitationResponse(
        invitation_id=invitation.invitation_id,
        workspace_id=invitation.workspace_id,
        email=invitation.email,
        status=invitation.status,
        roles=role_names,
        invited_by=invitation.invited_by_name,
        created_at=invitation.created_at,
        expires_at=invitation.expires_at,
    )


@router.get(
    "/{workspace_id}/invitations",
    response_model=list[InvitationResponse],
    responses={403: {"model": ErrorResponse}},
    summary="List invitations",
    description="List pending invitations for the workspace. Requires member:read permission.",
)
async def list_invitations(
    workspace_id: UUID,
    status_filter: str | None = Query(None, alias="status"),
    current_user: CurrentUserDep = None,
    rbac_service: RBACServiceDep = None,
    invitation_service: InvitationServiceDep = None,
) -> list[InvitationResponse]:
    """List workspace invitations."""
    # Check permission
    permission = await rbac_service.check_permission(
        user_id=current_user.user_id,
        workspace_id=workspace_id,
        required_permission="member:read",
    )
    if not permission.allowed:
        raise HTTPException(
            status_code=403,
            detail={"code": "PERMISSION_DENIED", "message": permission.reason or "Permission denied"},
        )

    invitations = await invitation_service.list_workspace_invitations(
        workspace_id=workspace_id,
        status_filter=status_filter,
    )

    # Get role names
    roles = await rbac_service.list_workspace_roles(workspace_id)
    role_map = {r.role_id: r.name for r in roles}

    return [
        InvitationResponse(
            invitation_id=inv.invitation_id,
            workspace_id=inv.workspace_id,
            email=inv.email,
            status=inv.status,
            roles=[role_map.get(rid, "Unknown") for rid in inv.role_ids],
            invited_by=inv.invited_by_name,
            created_at=inv.created_at,
            expires_at=inv.expires_at,
        )
        for inv in invitations
    ]


@router.delete(
    "/{workspace_id}/invitations/{invitation_id}",
    response_model=MessageResponse,
    responses={403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
    summary="Revoke invitation",
    description="Revoke a pending invitation. Requires member:invite permission.",
)
async def revoke_invitation(
    workspace_id: UUID,
    invitation_id: UUID,
    current_user: CurrentUserDep,
    rbac_service: RBACServiceDep,
    invitation_service: InvitationServiceDep,
) -> MessageResponse:
    """Revoke a pending invitation."""
    # Check permission
    permission = await rbac_service.check_permission(
        user_id=current_user.user_id,
        workspace_id=workspace_id,
        required_permission="member:invite",
    )
    if not permission.allowed:
        raise HTTPException(
            status_code=403,
            detail={"code": "PERMISSION_DENIED", "message": permission.reason or "Permission denied"},
        )

    try:
        await invitation_service.revoke_invitation(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
            revoked_by_user_id=current_user.user_id,
        )
    except InvitationNotFoundError as e:
        raise HTTPException(
            status_code=e.status,
            detail={"code": e.code, "message": str(e)},
        )

    return MessageResponse(message="Invitation revoked successfully")

