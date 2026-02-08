"""Role API endpoints.

All routes prefixed with /api/v1/workspaces/{workspace_id}/roles.
Implements Requirements: 7.1, 7.5
"""

from __future__ import annotations

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Response, status

from app.api.dependencies.auth import CurrentUserDep, PermissionCheckerDep
from app.api.schemas import (
    CreateRoleRequest,
    RoleListResponse,
    RoleResponse,
    UpdateRoleRequest,
)
from app.services.rbac_service import (
    RBACService,
    RoleExistsError,
    RoleNotFoundError,
    SystemRoleError,
    InvalidPermissionError,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/workspaces/{workspace_id}/roles",
    tags=["roles"],
)


def _get_rbac_service() -> RBACService:
    return RBACService()


RBACServiceDep = Annotated[RBACService, Depends(_get_rbac_service)]


# ---------------------------------------------------------------------------
# Role endpoints
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=RoleListResponse,
    summary="List workspace roles",
    description="List all roles in a workspace.",
)
async def list_roles(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    current_user: CurrentUserDep = None,
    rbac_service: RBACServiceDep = None,
    _: None = Depends(PermissionCheckerDep(["roles:read"])),
) -> RoleListResponse:
    """List all roles in workspace."""
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
    "",
    response_model=RoleResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create custom role",
    description="Create a new custom role in the workspace.",
)
async def create_role(
    request: CreateRoleRequest,
    workspace_id: UUID = Path(..., description="Workspace ID"),
    current_user: CurrentUserDep = None,
    rbac_service: RBACServiceDep = None,
    _: None = Depends(PermissionCheckerDep(["roles:write"])),
) -> RoleResponse:
    """Create a custom role in workspace."""
    try:
        role = await rbac_service.create_role(
            workspace_id=workspace_id,
            name=request.name,
            permissions=request.permissions,
            created_by_user_id=current_user.user_id,
        )
    except RoleExistsError as e:
        raise HTTPException(status_code=e.status, detail={"code": e.code, "message": str(e)})
    except InvalidPermissionError as e:
        raise HTTPException(status_code=e.status, detail={"code": e.code, "message": str(e)})

    logger.info(
        "Role created via API",
        extra={
            "role_id": str(role.role_id),
            "workspace_id": str(workspace_id),
            "created_by": str(current_user.user_id),
        },
    )

    return RoleResponse(
        role_id=role.role_id,
        workspace_id=role.workspace_id,
        name=role.name,
        permissions=role.permissions,
        is_system=role.is_system,
        created_at=role.created_at,
    )


@router.get(
    "/{role_id}",
    response_model=RoleResponse,
    summary="Get role details",
    description="Get details of a specific role.",
)
async def get_role(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    role_id: UUID = Path(..., description="Role ID"),
    current_user: CurrentUserDep = None,
    rbac_service: RBACServiceDep = None,
    _: None = Depends(PermissionCheckerDep(["roles:read"])),
) -> RoleResponse:
    """Get role details."""
    roles = await rbac_service.list_workspace_roles(workspace_id)
    role = next((r for r in roles if r.role_id == role_id), None)

    if role is None:
        raise HTTPException(status_code=404, detail={"code": "ROLE_NOT_FOUND", "message": "Role not found"})

    return RoleResponse(
        role_id=role.role_id,
        workspace_id=role.workspace_id,
        name=role.name,
        permissions=role.permissions,
        is_system=role.is_system,
        created_at=role.created_at,
    )


@router.patch(
    "/{role_id}",
    response_model=RoleResponse,
    summary="Update role",
    description="Update a custom role's name or permissions.",
)
async def update_role(
    request: UpdateRoleRequest,
    workspace_id: UUID = Path(..., description="Workspace ID"),
    role_id: UUID = Path(..., description="Role ID"),
    current_user: CurrentUserDep = None,
    rbac_service: RBACServiceDep = None,
    _: None = Depends(PermissionCheckerDep(["roles:write"])),
) -> RoleResponse:
    """Update a custom role."""
    try:
        role = await rbac_service.update_role(
            role_id=role_id,
            workspace_id=workspace_id,
            name=request.name,
            permissions=request.permissions,
            updated_by_user_id=current_user.user_id,
        )
    except RoleNotFoundError as e:
        raise HTTPException(status_code=e.status, detail={"code": e.code, "message": str(e)})
    except SystemRoleError as e:
        raise HTTPException(status_code=e.status, detail={"code": e.code, "message": str(e)})
    except RoleExistsError as e:
        raise HTTPException(status_code=e.status, detail={"code": e.code, "message": str(e)})
    except InvalidPermissionError as e:
        raise HTTPException(status_code=e.status, detail={"code": e.code, "message": str(e)})

    logger.info(
        "Role updated via API",
        extra={
            "role_id": str(role_id),
            "workspace_id": str(workspace_id),
            "updated_by": str(current_user.user_id),
        },
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
    "/{role_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete role",
    description="Delete a custom role from the workspace.",
)
async def delete_role(
    workspace_id: UUID = Path(..., description="Workspace ID"),
    role_id: UUID = Path(..., description="Role ID"),
    current_user: CurrentUserDep = None,
    rbac_service: RBACServiceDep = None,
    _: None = Depends(PermissionCheckerDep(["roles:write"])),
):
    """Delete a custom role."""
    try:
        await rbac_service.delete_role(role_id=role_id, workspace_id=workspace_id)
    except RoleNotFoundError as e:
        raise HTTPException(status_code=e.status, detail={"code": e.code, "message": str(e)})
    except SystemRoleError as e:
        raise HTTPException(status_code=e.status, detail={"code": e.code, "message": str(e)})

    logger.info(
        "Role deleted via API",
        extra={
            "role_id": str(role_id),
            "workspace_id": str(workspace_id),
            "deleted_by": str(current_user.user_id),
        },
    )
