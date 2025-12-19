"""Platform admin API endpoints.

All routes prefixed with /api/v1/admin.
Implements Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Query

from app.api.dependencies.auth import CurrentUserDep
from app.api.schemas import (
    MessageResponse,
    PaginatedResponse,
)
from app.db.postgres import get_postgres_pool
from app.services.rbac_service import RBACService
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


# ---------------------------------------------------------------------------
# Admin-specific schemas
# ---------------------------------------------------------------------------


class PlatformAdminResponse(BaseModel):
    """Platform admin user response."""

    user_id: UUID
    email: str
    display_name: str
    platform_roles: list[str]
    created_at: datetime
    last_login_at: datetime | None


class PlatformAdminListResponse(PaginatedResponse):
    """List of platform admins."""

    items: list[PlatformAdminResponse]


class WorkspaceAdminResponse(BaseModel):
    """Workspace info for admin view."""

    workspace_id: UUID
    name: str
    slug: str
    status: str
    owner_email: str
    plan_code: str
    created_at: datetime
    member_count: int
    gallery_count: int
    storage_used_bytes: int


class WorkspaceAdminListResponse(PaginatedResponse):
    """List of workspaces for admin."""

    items: list[WorkspaceAdminResponse]


class GrantRoleRequest(BaseModel):
    """Grant platform role request."""

    role: str = Field(..., description="Platform role name to grant")


class SupportSessionResponse(BaseModel):
    """Support access session."""

    session_id: UUID
    workspace_id: UUID
    workspace_name: str
    started_by_user_id: UUID
    started_by_email: str
    justification: str
    started_at: datetime
    expires_at: datetime


class StartSupportSessionRequest(BaseModel):
    """Start support session request."""

    justification: str = Field(..., min_length=10, max_length=500)


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def _get_rbac_service() -> RBACService:
    return RBACService()


RBACServiceDep = Annotated[RBACService, Depends(_get_rbac_service)]


async def require_platform_permission(
    current_user: CurrentUserDep,
    rbac_service: RBACServiceDep,
    permission: str,
) -> None:
    """Check if user has platform permission."""
    has_permission = await rbac_service.check_platform_permission(
        current_user.user_id,
        permission,
    )
    if not has_permission:
        raise HTTPException(
            status_code=403,
            detail={"code": "PLATFORM_PERMISSION_DENIED", "message": f"Missing permission: {permission}"},
        )


# ---------------------------------------------------------------------------
# Platform admin management endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/admins",
    response_model=PlatformAdminListResponse,
    summary="List platform admins",
    description="List all users with platform admin roles.",
)
async def list_platform_admins(
    current_user: CurrentUserDep,
    rbac_service: RBACServiceDep,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
) -> PlatformAdminListResponse:
    """List all platform admins."""
    await require_platform_permission(current_user, rbac_service, "platform:admins:read")

    pool = await get_postgres_pool()
    offset = (page - 1) * per_page

    # Count total
    total_row = await pool.fetchrow(
        "SELECT COUNT(DISTINCT user_id) as count FROM user_platform_roles WHERE revoked_at IS NULL"
    )
    total = total_row["count"] if total_row else 0

    # Get admins with their roles
    rows = await pool.fetch(
        """
        SELECT DISTINCT u.user_id, u.email, u.display_name, u.created_at,
               (SELECT MAX(s.last_used_at) FROM sessions s WHERE s.user_id = u.user_id) as last_login_at,
               ARRAY_AGG(pr.name) as roles
        FROM users u
        JOIN user_platform_roles upr ON upr.user_id = u.user_id
        JOIN platform_roles pr ON pr.role_id = upr.role_id
        WHERE upr.revoked_at IS NULL
        GROUP BY u.user_id, u.email, u.display_name, u.created_at
        ORDER BY u.created_at DESC
        LIMIT $1 OFFSET $2
        """,
        per_page,
        offset,
    )

    items = [
        PlatformAdminResponse(
            user_id=row["user_id"],
            email=row["email"],
            display_name=row["display_name"],
            platform_roles=row["roles"] or [],
            created_at=row["created_at"],
            last_login_at=row["last_login_at"],
        )
        for row in rows
    ]

    return PlatformAdminListResponse(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        total_pages=(total + per_page - 1) // per_page if total > 0 else 0,
    )


@router.post(
    "/admins/{user_id}/roles",
    response_model=MessageResponse,
    summary="Grant platform role",
    description="Grant a platform role to a user.",
)
async def grant_platform_role(
    request: GrantRoleRequest,
    user_id: UUID = Path(..., description="User ID"),
    current_user: CurrentUserDep = None,
    rbac_service: RBACServiceDep = None,
) -> MessageResponse:
    """Grant platform role to user."""
    await require_platform_permission(current_user, rbac_service, "platform:admins:write")

    pool = await get_postgres_pool()

    # Verify user exists
    user_row = await pool.fetchrow("SELECT email FROM users WHERE user_id = $1", user_id)
    if not user_row:
        raise HTTPException(status_code=404, detail={"code": "USER_NOT_FOUND", "message": "User not found"})

    # Get role
    role_row = await pool.fetchrow(
        "SELECT role_id FROM platform_roles WHERE name = $1",
        request.role,
    )
    if not role_row:
        raise HTTPException(status_code=404, detail={"code": "ROLE_NOT_FOUND", "message": f"Platform role '{request.role}' not found"})

    # Check if already assigned
    existing = await pool.fetchrow(
        "SELECT 1 FROM user_platform_roles WHERE user_id = $1 AND role_id = $2 AND revoked_at IS NULL",
        user_id,
        role_row["role_id"],
    )
    if existing:
        raise HTTPException(status_code=409, detail={"code": "ROLE_ALREADY_ASSIGNED", "message": "User already has this role"})

    # Grant role
    await pool.execute(
        """
        INSERT INTO user_platform_roles (user_id, role_id, granted_by, granted_at)
        VALUES ($1, $2, $3, $4)
        """,
        user_id,
        role_row["role_id"],
        current_user.user_id,
        datetime.now(timezone.utc),
    )

    logger.info(
        "Platform role granted",
        extra={
            "user_id": str(user_id),
            "role": request.role,
            "granted_by": str(current_user.user_id),
        },
    )

    return MessageResponse(message=f"Role '{request.role}' granted to user")


@router.delete(
    "/admins/{user_id}/roles/{role}",
    response_model=MessageResponse,
    summary="Revoke platform role",
    description="Revoke a platform role from a user.",
)
async def revoke_platform_role(
    user_id: UUID = Path(..., description="User ID"),
    role: str = Path(..., description="Role name to revoke"),
    current_user: CurrentUserDep = None,
    rbac_service: RBACServiceDep = None,
) -> MessageResponse:
    """Revoke platform role from user."""
    await require_platform_permission(current_user, rbac_service, "platform:admins:write")

    pool = await get_postgres_pool()

    # Get role
    role_row = await pool.fetchrow(
        "SELECT role_id FROM platform_roles WHERE name = $1",
        role,
    )
    if not role_row:
        raise HTTPException(status_code=404, detail={"code": "ROLE_NOT_FOUND", "message": f"Platform role '{role}' not found"})

    # Revoke
    result = await pool.execute(
        """
        UPDATE user_platform_roles 
        SET revoked_at = $1, revoked_by = $2
        WHERE user_id = $3 AND role_id = $4 AND revoked_at IS NULL
        """,
        datetime.now(timezone.utc),
        current_user.user_id,
        user_id,
        role_row["role_id"],
    )

    if result.split()[-1] == "0":
        raise HTTPException(status_code=404, detail={"code": "ROLE_NOT_ASSIGNED", "message": "User does not have this role"})

    logger.info(
        "Platform role revoked",
        extra={
            "user_id": str(user_id),
            "role": role,
            "revoked_by": str(current_user.user_id),
        },
    )

    return MessageResponse(message=f"Role '{role}' revoked from user")


# ---------------------------------------------------------------------------
# Workspace management endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/workspaces",
    response_model=WorkspaceAdminListResponse,
    summary="List all workspaces",
    description="List all workspaces (admin view).",
)
async def list_all_workspaces(
    current_user: CurrentUserDep,
    rbac_service: RBACServiceDep,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status_filter: str | None = Query(None, alias="status"),
    search: str | None = Query(None),
) -> WorkspaceAdminListResponse:
    """List all workspaces with admin details."""
    await require_platform_permission(current_user, rbac_service, "platform:workspaces:read")

    pool = await get_postgres_pool()
    offset = (page - 1) * per_page

    # Build query
    conditions = []
    params: list = []
    param_idx = 1

    if status_filter:
        conditions.append(f"w.status = ${param_idx}")
        params.append(status_filter)
        param_idx += 1

    if search:
        conditions.append(f"(w.name ILIKE ${param_idx} OR w.slug ILIKE ${param_idx})")
        params.append(f"%{search}%")
        param_idx += 1

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    # Count total
    count_query = f"SELECT COUNT(*) as count FROM workspaces w {where_clause}"
    total_row = await pool.fetchrow(count_query, *params)
    total = total_row["count"] if total_row else 0

    # Get workspaces
    query = f"""
        SELECT w.workspace_id, w.name, w.slug, w.status, w.created_at,
               u.email as owner_email,
               COALESCE(p.code, 'unknown') as plan_code,
               (SELECT COUNT(*) FROM workspace_memberships wm WHERE wm.workspace_id = w.workspace_id AND wm.status = 'active') as member_count,
               0 as gallery_count,
               0 as storage_used_bytes
        FROM workspaces w
        LEFT JOIN workspace_memberships wm_owner ON wm_owner.workspace_id = w.workspace_id
        LEFT JOIN member_roles mr ON mr.membership_id = wm_owner.membership_id
        LEFT JOIN roles r ON r.role_id = mr.role_id AND r.name = 'owner'
        LEFT JOIN users u ON u.user_id = wm_owner.user_id
        LEFT JOIN workspace_subscriptions ws ON ws.workspace_id = w.workspace_id
        LEFT JOIN plans p ON p.plan_id = ws.plan_id
        {where_clause}
        GROUP BY w.workspace_id, w.name, w.slug, w.status, w.created_at, u.email, p.code
        ORDER BY w.created_at DESC
        LIMIT ${param_idx} OFFSET ${param_idx + 1}
    """
    params.extend([per_page, offset])

    rows = await pool.fetch(query, *params)

    items = [
        WorkspaceAdminResponse(
            workspace_id=row["workspace_id"],
            name=row["name"],
            slug=row["slug"],
            status=row["status"],
            owner_email=row["owner_email"] or "unknown",
            plan_code=row["plan_code"],
            created_at=row["created_at"],
            member_count=row["member_count"],
            gallery_count=row["gallery_count"],
            storage_used_bytes=row["storage_used_bytes"],
        )
        for row in rows
    ]

    return WorkspaceAdminListResponse(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        total_pages=(total + per_page - 1) // per_page if total > 0 else 0,
    )


# ---------------------------------------------------------------------------
# Support access endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/workspaces/{workspace_id}/support-access",
    response_model=SupportSessionResponse,
    summary="Start support session",
    description="Start a time-limited support access session for a workspace.",
)
async def start_support_session(
    request: StartSupportSessionRequest,
    workspace_id: UUID = Path(..., description="Workspace ID"),
    current_user: CurrentUserDep = None,
    rbac_service: RBACServiceDep = None,
) -> SupportSessionResponse:
    """Start support access session."""
    await require_platform_permission(current_user, rbac_service, "platform:support_access:start")

    pool = await get_postgres_pool()
    import uuid

    # Verify workspace exists
    ws_row = await pool.fetchrow(
        "SELECT name FROM workspaces WHERE workspace_id = $1",
        workspace_id,
    )
    if not ws_row:
        raise HTTPException(status_code=404, detail={"code": "WORKSPACE_NOT_FOUND", "message": "Workspace not found"})

    # Check for existing active session
    existing = await pool.fetchrow(
        """
        SELECT session_id FROM support_access_sessions 
        WHERE workspace_id = $1 AND ended_at IS NULL AND expires_at > NOW()
        """,
        workspace_id,
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail={"code": "SESSION_ALREADY_ACTIVE", "message": "Support session already active for this workspace"},
        )

    # Create session (4 hour duration)
    session_id = uuid.uuid4()
    now = datetime.now(timezone.utc)
    from datetime import timedelta
    expires_at = now + timedelta(hours=4)

    await pool.execute(
        """
        INSERT INTO support_access_sessions 
        (session_id, workspace_id, started_by, justification, started_at, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        """,
        session_id,
        workspace_id,
        current_user.user_id,
        request.justification,
        now,
        expires_at,
    )

    logger.warning(
        "Support access session started",
        extra={
            "session_id": str(session_id),
            "workspace_id": str(workspace_id),
            "started_by": str(current_user.user_id),
            "justification": request.justification,
        },
    )

    return SupportSessionResponse(
        session_id=session_id,
        workspace_id=workspace_id,
        workspace_name=ws_row["name"],
        started_by_user_id=current_user.user_id,
        started_by_email=current_user.email,
        justification=request.justification,
        started_at=now,
        expires_at=expires_at,
    )


@router.delete(
    "/support-access/{session_id}",
    response_model=MessageResponse,
    summary="End support session",
    description="End a support access session.",
)
async def end_support_session(
    session_id: UUID = Path(..., description="Support session ID"),
    current_user: CurrentUserDep = None,
    rbac_service: RBACServiceDep = None,
) -> MessageResponse:
    """End support access session."""
    await require_platform_permission(current_user, rbac_service, "platform:support_access:stop")

    pool = await get_postgres_pool()

    result = await pool.execute(
        """
        UPDATE support_access_sessions 
        SET ended_at = NOW(), ended_by = $1
        WHERE session_id = $2 AND ended_at IS NULL
        """,
        current_user.user_id,
        session_id,
    )

    if result.split()[-1] == "0":
        raise HTTPException(
            status_code=404,
            detail={"code": "SESSION_NOT_FOUND", "message": "Support session not found or already ended"},
        )

    logger.info(
        "Support access session ended",
        extra={"session_id": str(session_id), "ended_by": str(current_user.user_id)},
    )

    return MessageResponse(message="Support session ended")


@router.get(
    "/support-access",
    response_model=list[SupportSessionResponse],
    summary="List active support sessions",
    description="List all active support access sessions.",
)
async def list_support_sessions(
    current_user: CurrentUserDep,
    rbac_service: RBACServiceDep,
    include_expired: bool = Query(False),
) -> list[SupportSessionResponse]:
    """List support sessions."""
    await require_platform_permission(current_user, rbac_service, "platform:support_access:start")

    pool = await get_postgres_pool()

    if include_expired:
        condition = "ended_at IS NULL"
    else:
        condition = "ended_at IS NULL AND expires_at > NOW()"

    rows = await pool.fetch(
        f"""
        SELECT s.session_id, s.workspace_id, w.name as workspace_name,
               s.started_by, u.email as started_by_email, s.justification,
               s.started_at, s.expires_at
        FROM support_access_sessions s
        JOIN workspaces w ON w.workspace_id = s.workspace_id
        JOIN users u ON u.user_id = s.started_by
        WHERE {condition}
        ORDER BY s.started_at DESC
        """,
    )

    return [
        SupportSessionResponse(
            session_id=row["session_id"],
            workspace_id=row["workspace_id"],
            workspace_name=row["workspace_name"],
            started_by_user_id=row["started_by"],
            started_by_email=row["started_by_email"],
            justification=row["justification"],
            started_at=row["started_at"],
            expires_at=row["expires_at"],
        )
        for row in rows
    ]
