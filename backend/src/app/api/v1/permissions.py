"""Granular Permission API endpoints.

All routes prefixed with /api/v1/workspaces/{workspace_id}/permissions.
Implements Requirements: 7.6, 7.7, 7.8 (Granular RBAC)
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, status
from pydantic import BaseModel, Field

from app.api.dependencies.auth import CurrentUserDep, PermissionCheckerDep
from app.services.granular_permission_service import (
    ConditionExistsError,
    ConditionNotFoundError,
    DelegationRuleNotFoundError,
    GranularPermissionError,
    GranularPermissionNotFoundError,
    GranularPermissionService,
    InsufficientDelegationError,
    InvalidExpirationError,
    PermissionConditionType,
    RoleAuditActionType,
    RoleAuditTargetType,
    TimeBasedAssignmentNotFoundError,
    get_granular_permission_service,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/workspaces/{workspace_id}/permissions",
    tags=["permissions"],
)


# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------


def _get_service() -> GranularPermissionService:
    return get_granular_permission_service()


GranularPermissionServiceDep = Annotated[GranularPermissionService, Depends(_get_service)]


# ---------------------------------------------------------------------------
# Request/Response Schemas
# ---------------------------------------------------------------------------


class CreateConditionRequest(BaseModel):
    """Request to create a permission condition."""

    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)
    condition_type: str = Field(..., description="Type of condition")
    condition_config: dict[str, Any] = Field(..., description="Condition configuration")


class UpdateConditionRequest(BaseModel):
    """Request to update a permission condition."""

    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = None
    condition_config: dict[str, Any] | None = None


class ConditionResponse(BaseModel):
    """Permission condition response."""

    condition_id: UUID
    workspace_id: UUID
    name: str
    description: str | None
    condition_type: str
    condition_config: dict[str, Any]
    created_at: datetime
    updated_at: datetime
    created_by_user_id: UUID | None


class ConditionListResponse(BaseModel):
    """List of permission conditions."""

    items: list[ConditionResponse]
    total: int


class GrantGranularPermissionRequest(BaseModel):
    """Request to grant a granular permission."""

    member_role_id: UUID
    permission: str = Field(..., min_length=1, max_length=100)
    condition_id: UUID | None = None
    expires_at: datetime | None = None
    notes: str | None = Field(None, max_length=500)


class UpdateGranularPermissionRequest(BaseModel):
    """Request to update a granular permission."""

    expires_at: datetime | None = None
    is_active: bool | None = None
    notes: str | None = None


class GranularPermissionResponse(BaseModel):
    """Granular permission response."""

    granular_permission_id: UUID
    workspace_id: UUID
    member_role_id: UUID
    permission: str
    condition_id: UUID | None
    condition: ConditionResponse | None
    granted_at: datetime
    granted_by_user_id: UUID | None
    expires_at: datetime | None
    is_active: bool
    notes: str | None


class GranularPermissionListResponse(BaseModel):
    """List of granular permissions."""

    items: list[GranularPermissionResponse]
    total: int


class GrantTimeBasedAccessRequest(BaseModel):
    """Request to grant time-based role access."""

    membership_id: UUID
    role_id: UUID
    starts_at: datetime | None = None
    expires_at: datetime
    reason: str | None = Field(None, max_length=500)


class RevokeTimeBasedAccessRequest(BaseModel):
    """Request to revoke time-based access."""

    reason: str | None = Field(None, max_length=500)


class TimeBasedAssignmentResponse(BaseModel):
    """Time-based role assignment response."""

    assignment_id: UUID
    workspace_id: UUID
    membership_id: UUID
    role_id: UUID
    starts_at: datetime
    expires_at: datetime
    reason: str | None
    granted_by_user_id: UUID | None
    created_at: datetime
    revoked_at: datetime | None
    revoked_by_user_id: UUID | None
    revocation_reason: str | None
    is_active: bool
    days_remaining: int
    role_name: str | None
    role_permissions: list[str] | None
    user_display_name: str | None
    user_email: str | None


class TimeBasedAssignmentListResponse(BaseModel):
    """List of time-based assignments."""

    items: list[TimeBasedAssignmentResponse]
    total: int
    active_count: int
    expired_count: int


class CreateDelegationRuleRequest(BaseModel):
    """Request to create a delegation rule."""

    delegator_role_id: UUID
    delegatable_permissions: list[str] = Field(..., min_length=1)
    max_delegation_depth: int = Field(1, ge=1, le=5)
    can_set_expiration: bool = True
    max_expiration_days: int | None = Field(None, ge=1, le=365)


class UpdateDelegationRuleRequest(BaseModel):
    """Request to update a delegation rule."""

    delegatable_permissions: list[str] | None = None
    max_delegation_depth: int | None = Field(None, ge=1, le=5)
    can_set_expiration: bool | None = None
    max_expiration_days: int | None = None


class DelegationRuleResponse(BaseModel):
    """Delegation rule response."""

    rule_id: UUID
    workspace_id: UUID
    delegator_role_id: UUID
    delegator_role_name: str | None
    delegatable_permissions: list[str]
    max_delegation_depth: int
    can_set_expiration: bool
    max_expiration_days: int | None
    created_at: datetime
    updated_at: datetime


class DelegationRuleListResponse(BaseModel):
    """List of delegation rules."""

    items: list[DelegationRuleResponse]
    total: int


class RoleAuditLogEntryResponse(BaseModel):
    """Role audit log entry response."""

    audit_id: UUID
    workspace_id: UUID
    actor_user_id: UUID | None
    actor_display_name: str | None
    actor_email: str | None
    action_type: str
    target_type: str
    target_id: UUID
    target_user_id: UUID | None
    target_user_display_name: str | None
    target_user_email: str | None
    previous_state: dict[str, Any] | None
    new_state: dict[str, Any] | None
    change_summary: str | None
    ip_address: str | None
    user_agent: str | None
    created_at: datetime


class RoleAuditLogListResponse(BaseModel):
    """List of role audit log entries."""

    items: list[RoleAuditLogEntryResponse]
    total: int
    limit: int
    offset: int


class CheckGranularPermissionRequest(BaseModel):
    """Request to check a granular permission."""

    permission: str
    resource_id: UUID | None = None
    resource_type: str | None = None
    context: dict[str, Any] | None = None


class GranularPermissionCheckResponse(BaseModel):
    """Result of granular permission check."""

    allowed: bool
    permission: str
    matching_condition: ConditionResponse | None
    allowed_resources: list[str] | None
    denial_reason: str | None


class EffectivePermissionsResponse(BaseModel):
    """User's effective permissions response."""

    base_permissions: list[str]
    conditional_permissions: list[dict[str, Any]]
    time_based_roles: list[dict[str, Any]]


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def _condition_to_response(condition) -> ConditionResponse:
    """Convert condition dataclass to response."""
    return ConditionResponse(
        condition_id=condition.condition_id,
        workspace_id=condition.workspace_id,
        name=condition.name,
        description=condition.description,
        condition_type=condition.condition_type.value,
        condition_config=condition.condition_config,
        created_at=condition.created_at,
        updated_at=condition.updated_at,
        created_by_user_id=condition.created_by_user_id,
    )


def _granular_perm_to_response(perm) -> GranularPermissionResponse:
    """Convert granular permission dataclass to response."""
    return GranularPermissionResponse(
        granular_permission_id=perm.granular_permission_id,
        workspace_id=perm.workspace_id,
        member_role_id=perm.member_role_id,
        permission=perm.permission,
        condition_id=perm.condition_id,
        condition=_condition_to_response(perm.condition) if perm.condition else None,
        granted_at=perm.granted_at,
        granted_by_user_id=perm.granted_by_user_id,
        expires_at=perm.expires_at,
        is_active=perm.is_active,
        notes=perm.notes,
    )


def _time_based_to_response(assignment) -> TimeBasedAssignmentResponse:
    """Convert time-based assignment dataclass to response."""
    return TimeBasedAssignmentResponse(
        assignment_id=assignment.assignment_id,
        workspace_id=assignment.workspace_id,
        membership_id=assignment.membership_id,
        role_id=assignment.role_id,
        starts_at=assignment.starts_at,
        expires_at=assignment.expires_at,
        reason=assignment.reason,
        granted_by_user_id=assignment.granted_by_user_id,
        created_at=assignment.created_at,
        revoked_at=assignment.revoked_at,
        revoked_by_user_id=assignment.revoked_by_user_id,
        revocation_reason=assignment.revocation_reason,
        is_active=assignment.is_active,
        days_remaining=assignment.days_remaining,
        role_name=assignment.role_name,
        role_permissions=assignment.role_permissions,
        user_display_name=assignment.user_display_name,
        user_email=assignment.user_email,
    )


def _delegation_rule_to_response(rule) -> DelegationRuleResponse:
    """Convert delegation rule dataclass to response."""
    return DelegationRuleResponse(
        rule_id=rule.rule_id,
        workspace_id=rule.workspace_id,
        delegator_role_id=rule.delegator_role_id,
        delegator_role_name=rule.delegator_role_name,
        delegatable_permissions=rule.delegatable_permissions,
        max_delegation_depth=rule.max_delegation_depth,
        can_set_expiration=rule.can_set_expiration,
        max_expiration_days=rule.max_expiration_days,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
    )


def _audit_entry_to_response(entry) -> RoleAuditLogEntryResponse:
    """Convert audit log entry dataclass to response."""
    return RoleAuditLogEntryResponse(
        audit_id=entry.audit_id,
        workspace_id=entry.workspace_id,
        actor_user_id=entry.actor_user_id,
        actor_display_name=entry.actor_display_name,
        actor_email=entry.actor_email,
        action_type=entry.action_type.value,
        target_type=entry.target_type.value,
        target_id=entry.target_id,
        target_user_id=entry.target_user_id,
        target_user_display_name=entry.target_user_display_name,
        target_user_email=entry.target_user_email,
        previous_state=entry.previous_state,
        new_state=entry.new_state,
        change_summary=entry.change_summary,
        ip_address=entry.ip_address,
        user_agent=entry.user_agent,
        created_at=entry.created_at,
    )


# ---------------------------------------------------------------------------
# Permission Condition Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/conditions",
    response_model=ConditionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create permission condition",
    description="Create a new permission condition for granular access control.",
)
async def create_condition(
    request: Request,
    body: CreateConditionRequest,
    workspace_id: UUID = Path(..., description="Workspace ID"),
    current_user: CurrentUserDep = None,
    service: GranularPermissionServiceDep = None,
    _: None = Depends(PermissionCheckerDep(["roles:write"])),
) -> ConditionResponse:
    """Create a permission condition."""
    try:
        condition_type = PermissionConditionType(body.condition_type)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "INVALID_CONDITION_TYPE",
                "message": f"Invalid condition type: {body.condition_type}",
            },
        )

    try:
        condition = await service.create_condition(
            workspace_id=workspace_id,
            name=body.name,
            condition_type=condition_type,
            condition_config=body.condition_config,
            description=body.description,
            created_by_user_id=current_user.user_id,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    except ConditionExistsError as e:
        raise HTTPException(status_code=e.status, detail={"code": e.code, "message": str(e)})

    return _condition_to_response(condition)


@router.get(
    "/conditions",
    response_model=ConditionListResponse,
    summary="List permission conditions",
    description="List all permission conditions in the workspace.",
)
async def list_conditions(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    condition_type: str | None = Query(None, description="Filter by condition type"),
    current_user: CurrentUserDep = None,
    service: GranularPermissionServiceDep = None,
    _: None = Depends(PermissionCheckerDep(["roles:read"])),
) -> ConditionListResponse:
    """List permission conditions."""
    type_filter = None
    if condition_type:
        try:
            type_filter = PermissionConditionType(condition_type)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail={"code": "INVALID_CONDITION_TYPE", "message": f"Invalid condition type: {condition_type}"},
            )

    conditions = await service.list_conditions(workspace_id, type_filter)

    return ConditionListResponse(
        items=[_condition_to_response(c) for c in conditions],
        total=len(conditions),
    )


@router.get(
    "/conditions/{condition_id}",
    response_model=ConditionResponse,
    summary="Get permission condition",
    description="Get a specific permission condition by ID.",
)
async def get_condition(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    condition_id: UUID = Path(..., description="Condition ID"),
    current_user: CurrentUserDep = None,
    service: GranularPermissionServiceDep = None,
    _: None = Depends(PermissionCheckerDep(["roles:read"])),
) -> ConditionResponse:
    """Get a permission condition."""
    try:
        condition = await service.get_condition(condition_id, workspace_id)
    except ConditionNotFoundError as e:
        raise HTTPException(status_code=e.status, detail={"code": e.code, "message": str(e)})

    return _condition_to_response(condition)


@router.patch(
    "/conditions/{condition_id}",
    response_model=ConditionResponse,
    summary="Update permission condition",
    description="Update a permission condition's name, description, or config.",
)
async def update_condition(
    request: Request,
    body: UpdateConditionRequest,
    workspace_id: UUID = Path(..., description="Workspace ID"),
    condition_id: UUID = Path(..., description="Condition ID"),
    current_user: CurrentUserDep = None,
    service: GranularPermissionServiceDep = None,
    _: None = Depends(PermissionCheckerDep(["roles:write"])),
) -> ConditionResponse:
    """Update a permission condition."""
    try:
        condition = await service.update_condition(
            condition_id=condition_id,
            workspace_id=workspace_id,
            name=body.name,
            description=body.description,
            condition_config=body.condition_config,
            updated_by_user_id=current_user.user_id,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    except ConditionNotFoundError as e:
        raise HTTPException(status_code=e.status, detail={"code": e.code, "message": str(e)})
    except ConditionExistsError as e:
        raise HTTPException(status_code=e.status, detail={"code": e.code, "message": str(e)})

    return _condition_to_response(condition)


@router.delete(
    "/conditions/{condition_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Delete permission condition",
    description="Delete a permission condition.",
)
async def delete_condition(
    request: Request,
    workspace_id: UUID = Path(..., description="Workspace ID"),
    condition_id: UUID = Path(..., description="Condition ID"),
    current_user: CurrentUserDep = None,
    service: GranularPermissionServiceDep = None,
    _: None = Depends(PermissionCheckerDep(["roles:write"])),
):
    """Delete a permission condition."""
    try:
        await service.delete_condition(
            condition_id=condition_id,
            workspace_id=workspace_id,
            deleted_by_user_id=current_user.user_id,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    except ConditionNotFoundError as e:
        raise HTTPException(status_code=e.status, detail={"code": e.code, "message": str(e)})


# ---------------------------------------------------------------------------
# Granular Permission Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/granular",
    response_model=GranularPermissionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Grant granular permission",
    description="Grant a granular permission with optional conditions.",
)
async def grant_granular_permission(
    request: Request,
    body: GrantGranularPermissionRequest,
    workspace_id: UUID = Path(..., description="Workspace ID"),
    current_user: CurrentUserDep = None,
    service: GranularPermissionServiceDep = None,
    _: None = Depends(PermissionCheckerDep(["roles:write"])),
) -> GranularPermissionResponse:
    """Grant a granular permission."""
    try:
        perm = await service.grant_granular_permission(
            workspace_id=workspace_id,
            member_role_id=body.member_role_id,
            permission=body.permission,
            condition_id=body.condition_id,
            expires_at=body.expires_at,
            notes=body.notes,
            granted_by_user_id=current_user.user_id,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    except (ConditionNotFoundError, InvalidExpirationError) as e:
        raise HTTPException(status_code=e.status, detail={"code": e.code, "message": str(e)})

    return _granular_perm_to_response(perm)


@router.get(
    "/granular",
    response_model=GranularPermissionListResponse,
    summary="List granular permissions",
    description="List granular permissions in the workspace.",
)
async def list_granular_permissions(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    member_role_id: UUID | None = Query(None, description="Filter by member role"),
    permission: str | None = Query(None, description="Filter by permission"),
    include_inactive: bool = Query(False, description="Include inactive permissions"),
    current_user: CurrentUserDep = None,
    service: GranularPermissionServiceDep = None,
    _: None = Depends(PermissionCheckerDep(["roles:read"])),
) -> GranularPermissionListResponse:
    """List granular permissions."""
    perms = await service.list_granular_permissions(
        workspace_id=workspace_id,
        member_role_id=member_role_id,
        permission=permission,
        include_inactive=include_inactive,
    )

    return GranularPermissionListResponse(
        items=[_granular_perm_to_response(p) for p in perms],
        total=len(perms),
    )


@router.delete(
    "/granular/{permission_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Revoke granular permission",
    description="Revoke a granular permission.",
)
async def revoke_granular_permission(
    request: Request,
    workspace_id: UUID = Path(..., description="Workspace ID"),
    permission_id: UUID = Path(..., description="Granular permission ID"),
    current_user: CurrentUserDep = None,
    service: GranularPermissionServiceDep = None,
    _: None = Depends(PermissionCheckerDep(["roles:write"])),
):
    """Revoke a granular permission."""
    try:
        await service.revoke_granular_permission(
            permission_id=permission_id,
            workspace_id=workspace_id,
            revoked_by_user_id=current_user.user_id,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    except GranularPermissionNotFoundError as e:
        raise HTTPException(status_code=e.status, detail={"code": e.code, "message": str(e)})


# ---------------------------------------------------------------------------
# Time-Based Access Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/time-based",
    response_model=TimeBasedAssignmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Grant time-based access",
    description="Grant temporary role access to a member.",
)
async def grant_time_based_access(
    request: Request,
    body: GrantTimeBasedAccessRequest,
    workspace_id: UUID = Path(..., description="Workspace ID"),
    current_user: CurrentUserDep = None,
    service: GranularPermissionServiceDep = None,
    _: None = Depends(PermissionCheckerDep(["roles:write"])),
) -> TimeBasedAssignmentResponse:
    """Grant time-based role access."""
    try:
        assignment = await service.grant_time_based_access(
            workspace_id=workspace_id,
            membership_id=body.membership_id,
            role_id=body.role_id,
            starts_at=body.starts_at,
            expires_at=body.expires_at,
            reason=body.reason,
            granted_by_user_id=current_user.user_id,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    except InvalidExpirationError as e:
        raise HTTPException(status_code=e.status, detail={"code": e.code, "message": str(e)})

    return _time_based_to_response(assignment)


@router.get(
    "/time-based",
    response_model=TimeBasedAssignmentListResponse,
    summary="List time-based assignments",
    description="List time-based role assignments in the workspace.",
)
async def list_time_based_assignments(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    membership_id: UUID | None = Query(None, description="Filter by membership"),
    include_expired: bool = Query(False, description="Include expired assignments"),
    include_revoked: bool = Query(False, description="Include revoked assignments"),
    current_user: CurrentUserDep = None,
    service: GranularPermissionServiceDep = None,
    _: None = Depends(PermissionCheckerDep(["roles:read"])),
) -> TimeBasedAssignmentListResponse:
    """List time-based assignments."""
    assignments = await service.list_time_based_assignments(
        workspace_id=workspace_id,
        membership_id=membership_id,
        include_expired=include_expired,
        include_revoked=include_revoked,
    )

    active_count = sum(1 for a in assignments if a.is_active)
    expired_count = sum(1 for a in assignments if not a.is_active and a.revoked_at is None)

    return TimeBasedAssignmentListResponse(
        items=[_time_based_to_response(a) for a in assignments],
        total=len(assignments),
        active_count=active_count,
        expired_count=expired_count,
    )


@router.post(
    "/time-based/{assignment_id}/revoke",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Revoke time-based access",
    description="Revoke a time-based role assignment early.",
)
async def revoke_time_based_access(
    request: Request,
    body: RevokeTimeBasedAccessRequest,
    workspace_id: UUID = Path(..., description="Workspace ID"),
    assignment_id: UUID = Path(..., description="Assignment ID"),
    current_user: CurrentUserDep = None,
    service: GranularPermissionServiceDep = None,
    _: None = Depends(PermissionCheckerDep(["roles:write"])),
):
    """Revoke a time-based assignment."""
    try:
        await service.revoke_time_based_access(
            assignment_id=assignment_id,
            workspace_id=workspace_id,
            revoked_by_user_id=current_user.user_id,
            revocation_reason=body.reason,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    except TimeBasedAssignmentNotFoundError as e:
        raise HTTPException(status_code=e.status, detail={"code": e.code, "message": str(e)})


# ---------------------------------------------------------------------------
# Delegation Rule Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/delegation-rules",
    response_model=DelegationRuleResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create delegation rule",
    description="Create a permission delegation rule for a role.",
)
async def create_delegation_rule(
    request: Request,
    body: CreateDelegationRuleRequest,
    workspace_id: UUID = Path(..., description="Workspace ID"),
    current_user: CurrentUserDep = None,
    service: GranularPermissionServiceDep = None,
    _: None = Depends(PermissionCheckerDep(["roles:write"])),
) -> DelegationRuleResponse:
    """Create a delegation rule."""
    rule = await service.create_delegation_rule(
        workspace_id=workspace_id,
        delegator_role_id=body.delegator_role_id,
        delegatable_permissions=body.delegatable_permissions,
        max_delegation_depth=body.max_delegation_depth,
        can_set_expiration=body.can_set_expiration,
        max_expiration_days=body.max_expiration_days,
        created_by_user_id=current_user.user_id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    return _delegation_rule_to_response(rule)


@router.get(
    "/delegation-rules",
    response_model=DelegationRuleListResponse,
    summary="List delegation rules",
    description="List permission delegation rules in the workspace.",
)
async def list_delegation_rules(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    current_user: CurrentUserDep = None,
    service: GranularPermissionServiceDep = None,
    _: None = Depends(PermissionCheckerDep(["roles:read"])),
) -> DelegationRuleListResponse:
    """List delegation rules."""
    rules = await service.list_delegation_rules(workspace_id)

    return DelegationRuleListResponse(
        items=[_delegation_rule_to_response(r) for r in rules],
        total=len(rules),
    )


# ---------------------------------------------------------------------------
# Role Audit Log Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/audit-log",
    response_model=RoleAuditLogListResponse,
    summary="List role audit logs",
    description="List role-related audit log entries.",
)
async def list_role_audit_logs(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    action_type: str | None = Query(None, description="Filter by action type"),
    target_type: str | None = Query(None, description="Filter by target type"),
    target_id: UUID | None = Query(None, description="Filter by target ID"),
    actor_user_id: UUID | None = Query(None, description="Filter by actor user"),
    target_user_id: UUID | None = Query(None, description="Filter by target user"),
    start_date: datetime | None = Query(None, description="Filter from date"),
    end_date: datetime | None = Query(None, description="Filter to date"),
    limit: int = Query(50, ge=1, le=100, description="Page size"),
    offset: int = Query(0, ge=0, description="Offset"),
    current_user: CurrentUserDep = None,
    service: GranularPermissionServiceDep = None,
    _: None = Depends(PermissionCheckerDep(["audit:read"])),
) -> RoleAuditLogListResponse:
    """List role audit log entries."""
    action_filter = None
    if action_type:
        try:
            action_filter = RoleAuditActionType(action_type)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail={"code": "INVALID_ACTION_TYPE", "message": f"Invalid action type: {action_type}"},
            )

    target_filter = None
    if target_type:
        try:
            target_filter = RoleAuditTargetType(target_type)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail={"code": "INVALID_TARGET_TYPE", "message": f"Invalid target type: {target_type}"},
            )

    entries, total = await service.list_role_audit_logs(
        workspace_id=workspace_id,
        action_type=action_filter,
        target_type=target_filter,
        target_id=target_id,
        actor_user_id=actor_user_id,
        target_user_id=target_user_id,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
        offset=offset,
    )

    return RoleAuditLogListResponse(
        items=[_audit_entry_to_response(e) for e in entries],
        total=total,
        limit=limit,
        offset=offset,
    )


# ---------------------------------------------------------------------------
# Permission Check Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/check",
    response_model=GranularPermissionCheckResponse,
    summary="Check granular permission",
    description="Check if the current user has a granular permission.",
)
async def check_granular_permission(
    body: CheckGranularPermissionRequest,
    workspace_id: UUID = Path(..., description="Workspace ID"),
    current_user: CurrentUserDep = None,
    service: GranularPermissionServiceDep = None,
) -> GranularPermissionCheckResponse:
    """Check a granular permission for the current user."""
    result = await service.check_granular_permission(
        user_id=current_user.user_id,
        workspace_id=workspace_id,
        permission=body.permission,
        resource_id=body.resource_id,
        resource_type=body.resource_type,
        context=body.context,
    )

    return GranularPermissionCheckResponse(
        allowed=result.allowed,
        permission=result.permission,
        matching_condition=_condition_to_response(result.matching_condition) if result.matching_condition else None,
        allowed_resources=result.allowed_resources,
        denial_reason=result.denial_reason,
    )


@router.get(
    "/effective",
    response_model=EffectivePermissionsResponse,
    summary="Get effective permissions",
    description="Get the current user's effective permissions including granular and time-based.",
)
async def get_effective_permissions(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    current_user: CurrentUserDep = None,
    service: GranularPermissionServiceDep = None,
) -> EffectivePermissionsResponse:
    """Get effective permissions for the current user."""
    result = await service.get_user_effective_permissions(
        user_id=current_user.user_id,
        workspace_id=workspace_id,
    )

    return EffectivePermissionsResponse(
        base_permissions=result["base_permissions"],
        conditional_permissions=result["conditional_permissions"],
        time_based_roles=result["time_based_roles"],
    )
