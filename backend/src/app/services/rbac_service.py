"""RBAC Service for permission management.

Handles role-based access control:
- Computing effective permissions from multiple roles
- Checking if user has required permission
- Managing custom roles
- Cache integration for performance

Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
Property 7: Permission Union Computation
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Sequence

from app.db.postgres import get_postgres_pool
from app.services.permission_cache import get_permission_cache

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class RBACError(Exception):
    """Base RBAC error."""

    def __init__(self, message: str, code: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


class RoleNotFoundError(RBACError):
    """Role not found."""

    def __init__(self, role_id: uuid.UUID) -> None:
        super().__init__(
            f"Role {role_id} not found",
            "ROLE_NOT_FOUND",
            404,
        )


class RoleExistsError(RBACError):
    """Role name already exists in workspace."""

    def __init__(self, name: str) -> None:
        super().__init__(
            f"Role '{name}' already exists",
            "ROLE_EXISTS",
            409,
        )


class SystemRoleError(RBACError):
    """Cannot modify system role."""

    def __init__(self) -> None:
        super().__init__(
            "Cannot modify or delete system roles",
            "SYSTEM_ROLE_IMMUTABLE",
            403,
        )


class InvalidPermissionError(RBACError):
    """Invalid permission specified."""

    def __init__(self, permissions: list[str]) -> None:
        super().__init__(
            f"Invalid permissions: {', '.join(permissions)}",
            "INVALID_PERMISSIONS",
            400,
        )


# ---------------------------------------------------------------------------
# Permission constants
# ---------------------------------------------------------------------------

# Workspace-level permissions
WORKSPACE_PERMISSIONS = [
    "workspace:read",
    "workspace:write",
    "workspace:delete",
    "members:read",
    "members:write",
    "members:invite",
    "roles:read",
    "roles:write",
    "galleries:read",
    "galleries:write",
    "galleries:delete",
    "assets:read",
    "assets:write",
    "assets:delete",
    "billing:read",
    "billing:write",
    "settings:read",
    "settings:write",
    "audit:read",
]

# Platform-level permissions
PLATFORM_PERMISSIONS = [
    "platform:admins:read",
    "platform:admins:write",
    "platform:workspaces:read",
    "platform:config:write",
    "platform:audit:read",
    "platform:billing:read",
    "platform:billing:write",
    "platform:moderation:read",
    "platform:moderation:write",
    "platform:observability:read",
    "platform:feature_flags:read",
    "platform:feature_flags:write",
    "platform:support_access:start",
    "platform:support_access:stop",
]

# Wildcard permissions
WILDCARD_SUFFIX = ":*"


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class Role:
    """Role with permissions."""

    role_id: uuid.UUID
    workspace_id: uuid.UUID | None  # None for platform roles
    name: str
    permissions: list[str]
    is_system: bool
    created_at: datetime


@dataclass
class PermissionCheckResult:
    """Result of a permission check."""

    allowed: bool
    missing_permissions: list[str]
    user_permissions: list[str]


# ---------------------------------------------------------------------------
# RBAC Service
# ---------------------------------------------------------------------------


class RBACService:
    """Role-based access control service."""

    async def get_user_permissions(
        self,
        user_id: uuid.UUID,
        workspace_id: uuid.UUID,
        use_cache: bool = True,
    ) -> list[str]:
        """Compute effective permissions for user in workspace.

        Property 7: Permission Union Computation
        The effective permissions MUST be the union of all permissions
        from all assigned roles.
        """
        cache = get_permission_cache()

        # Check cache first
        if use_cache:
            cached = await cache.get_user_permissions(user_id, workspace_id)
            if cached is not None:
                return cached

        pool = await get_postgres_pool()

        # Get all permissions from all roles assigned to user in workspace
        rows = await pool.fetch(
            """
            SELECT DISTINCT unnest(r.permissions) AS permission
            FROM member_roles mr
            JOIN roles r ON r.role_id = mr.role_id
            JOIN workspace_memberships wm ON wm.membership_id = mr.membership_id
            WHERE wm.user_id = $1 AND wm.workspace_id = $2 AND wm.status = 'active'
            """,
            user_id,
            workspace_id,
        )

        permissions = list(dict.fromkeys(row["permission"] for row in rows))

        # Expand wildcards
        permissions = self._expand_wildcards(permissions)

        # Cache result
        await cache.set_user_permissions(user_id, workspace_id, permissions)

        return permissions

    async def get_user_platform_permissions(
        self,
        user_id: uuid.UUID,
    ) -> list[str]:
        """Get platform-level permissions for user."""
        pool = await get_postgres_pool()

        rows = await pool.fetch(
            """
            SELECT DISTINCT unnest(pr.permissions) AS permission
            FROM user_platform_roles upr
            JOIN platform_roles pr ON pr.role_id = upr.role_id
            WHERE upr.user_id = $1 AND upr.revoked_at IS NULL
            """,
            user_id,
        )

        permissions = list(dict.fromkeys(row["permission"] for row in rows))
        return self._expand_wildcards(permissions)

    def _expand_wildcards(self, permissions: list[str]) -> list[str]:
        """Expand wildcard permissions to include all sub-permissions."""
        expanded = set(permissions)

        for perm in permissions:
            if perm.endswith(WILDCARD_SUFFIX):
                prefix = perm[:-len(WILDCARD_SUFFIX)]
                # Add all permissions that start with this prefix
                for p in WORKSPACE_PERMISSIONS + PLATFORM_PERMISSIONS:
                    if p.startswith(prefix):
                        expanded.add(p)

        return list(expanded)

    async def check_permission(
        self,
        user_id: uuid.UUID,
        workspace_id: uuid.UUID,
        required_permissions: str | Sequence[str],
        require_all: bool = True,
    ) -> PermissionCheckResult:
        """Check if user has required permission(s) in workspace.

        Args:
            user_id: User to check
            workspace_id: Workspace context
            required_permissions: Single permission or list
            require_all: If True, user must have ALL permissions; if False, ANY

        Returns:
            PermissionCheckResult with allowed status and details
        """
        if isinstance(required_permissions, str):
            required_permissions = [required_permissions]

        user_permissions = await self.get_user_permissions(user_id, workspace_id)
        user_perm_set = set(user_permissions)

        missing = [p for p in required_permissions if p not in user_perm_set]

        if require_all:
            allowed = len(missing) == 0
        else:
            allowed = len(missing) < len(required_permissions)

        return PermissionCheckResult(
            allowed=allowed,
            missing_permissions=missing,
            user_permissions=user_permissions,
        )

    async def check_platform_permission(
        self,
        user_id: uuid.UUID,
        required_permission: str,
    ) -> bool:
        """Check if user has platform-level permission."""
        permissions = await self.get_user_platform_permissions(user_id)
        return required_permission in permissions

    async def list_workspace_roles(self, workspace_id: uuid.UUID) -> list[Role]:
        """List all roles in a workspace.
        
        Alias for get_workspace_roles for API consistency.
        """
        return await self.get_workspace_roles(workspace_id)

    async def get_workspace_roles(self, workspace_id: uuid.UUID) -> list[Role]:
        """List all roles in a workspace."""
        pool = await get_postgres_pool()

        rows = await pool.fetch(
            """
            SELECT role_id, workspace_id, name, permissions, is_system, created_at
            FROM roles
            WHERE workspace_id = $1
            ORDER BY is_system DESC, name ASC
            """,
            workspace_id,
        )

        return [
            Role(
                role_id=row["role_id"],
                workspace_id=row["workspace_id"],
                name=row["name"],
                permissions=row["permissions"],
                is_system=row["is_system"],
                created_at=row["created_at"],
            )
            for row in rows
        ]

    async def create_role(
        self,
        workspace_id: uuid.UUID,
        name: str,
        permissions: list[str],
        created_by_user_id: uuid.UUID,
    ) -> Role:
        """Create a custom role in workspace."""
        pool = await get_postgres_pool()

        # Validate permissions
        invalid = [p for p in permissions if p not in WORKSPACE_PERMISSIONS and not p.endswith(WILDCARD_SUFFIX)]
        if invalid:
            raise InvalidPermissionError(invalid)

        # Check for duplicate name
        existing = await pool.fetchrow(
            "SELECT role_id FROM roles WHERE workspace_id = $1 AND name = $2",
            workspace_id, name,
        )
        if existing:
            raise RoleExistsError(name)

        role_id = uuid.uuid4()
        now = datetime.now(timezone.utc)

        await pool.execute(
            """
            INSERT INTO roles (role_id, workspace_id, name, permissions, is_system, created_at)
            VALUES ($1, $2, $3, $4, FALSE, $5)
            """,
            role_id,
            workspace_id,
            name,
            permissions,
            now,
        )

        logger.info(
            "Role created",
            extra={
                "role_id": str(role_id),
                "workspace_id": str(workspace_id),
                "name": name,
                "created_by": str(created_by_user_id),
            },
        )

        return Role(
            role_id=role_id,
            workspace_id=workspace_id,
            name=name,
            permissions=permissions,
            is_system=False,
            created_at=now,
        )

    async def update_role(
        self,
        role_id: uuid.UUID,
        workspace_id: uuid.UUID,
        permissions: list[str] | None = None,
        name: str | None = None,
        updated_by_user_id: uuid.UUID | None = None,
    ) -> Role:
        """Update role permissions or name.

        Property 8: Cache Invalidation on Role Update
        Invalidates cached permissions for all members with this role.
        """
        pool = await get_postgres_pool()
        cache = get_permission_cache()

        # Get current role
        row = await pool.fetchrow(
            "SELECT role_id, workspace_id, name, permissions, is_system, created_at FROM roles WHERE role_id = $1 AND workspace_id = $2",
            role_id,
            workspace_id,
        )

        if row is None:
            raise RoleNotFoundError(role_id)

        if row["is_system"]:
            raise SystemRoleError()

        # Validate new permissions
        if permissions:
            invalid = [p for p in permissions if p not in WORKSPACE_PERMISSIONS and not p.endswith(WILDCARD_SUFFIX)]
            if invalid:
                raise InvalidPermissionError(invalid)

        # Check for duplicate name
        if name and name != row["name"]:
            existing = await pool.fetchrow(
                "SELECT role_id FROM roles WHERE workspace_id = $1 AND name = $2 AND role_id != $3",
                workspace_id, name, role_id,
            )
            if existing:
                raise RoleExistsError(name)

        # Update role
        new_name = name or row["name"]
        new_permissions = permissions or row["permissions"]

        await pool.execute(
            "UPDATE roles SET name = $1, permissions = $2 WHERE role_id = $3",
            new_name,
            new_permissions,
            role_id,
        )

        # Invalidate cache for all affected users
        await cache.invalidate_role_members(role_id, workspace_id)
        await cache.invalidate_role_permissions(role_id)

        logger.info(
            "Role updated",
            extra={"role_id": str(role_id), "workspace_id": str(workspace_id)},
        )

        return Role(
            role_id=role_id,
            workspace_id=workspace_id,
            name=new_name,
            permissions=new_permissions,
            is_system=row["is_system"],
            created_at=row["created_at"],
        )

    async def delete_role(
        self,
        role_id: uuid.UUID,
        workspace_id: uuid.UUID,
    ) -> bool:
        """Delete a custom role from workspace."""
        pool = await get_postgres_pool()
        cache = get_permission_cache()

        # Check if role exists and is system role
        row = await pool.fetchrow(
            "SELECT is_system FROM roles WHERE role_id = $1 AND workspace_id = $2",
            role_id,
            workspace_id,
        )

        if row is None:
            raise RoleNotFoundError(role_id)

        if row["is_system"]:
            raise SystemRoleError()

        # Invalidate cache before deletion
        await cache.invalidate_role_members(role_id, workspace_id)

        # Delete role (cascades to member_roles)
        result = await pool.execute(
            "DELETE FROM roles WHERE role_id = $1 AND workspace_id = $2 AND is_system = FALSE",
            role_id,
            workspace_id,
        )

        deleted = result.split()[-1] != "0"

        if deleted:
            logger.info(
                "Role deleted",
                extra={"role_id": str(role_id), "workspace_id": str(workspace_id)},
            )

        return deleted

    async def assign_role_to_member(
        self,
        membership_id: uuid.UUID,
        role_id: uuid.UUID,
        granted_by_user_id: uuid.UUID,
    ) -> bool:
        """Assign a role to a workspace member."""
        pool = await get_postgres_pool()
        cache = get_permission_cache()

        # Get user_id and workspace_id from membership
        membership = await pool.fetchrow(
            "SELECT user_id, workspace_id FROM workspace_memberships WHERE membership_id = $1",
            membership_id,
        )

        if membership is None:
            return False

        # Verify role belongs to same workspace
        role = await pool.fetchrow(
            "SELECT workspace_id FROM roles WHERE role_id = $1",
            role_id,
        )

        if role is None or role["workspace_id"] != membership["workspace_id"]:
            return False

        # Assign role
        await pool.execute(
            """
            INSERT INTO member_roles (member_role_id, membership_id, role_id, granted_at, granted_by_user_id)
            VALUES (gen_random_uuid(), $1, $2, NOW(), $3)
            ON CONFLICT (membership_id, role_id) DO NOTHING
            """,
            membership_id,
            role_id,
            granted_by_user_id,
        )

        # Invalidate cache
        await cache.invalidate_user_permissions(membership["user_id"], membership["workspace_id"])

        logger.info(
            "Role assigned to member",
            extra={
                "membership_id": str(membership_id),
                "role_id": str(role_id),
                "granted_by": str(granted_by_user_id),
            },
        )

        return True

    async def remove_role_from_member(
        self,
        membership_id: uuid.UUID,
        role_id: uuid.UUID,
    ) -> bool:
        """Remove a role from a workspace member."""
        pool = await get_postgres_pool()
        cache = get_permission_cache()

        # Get user_id and workspace_id
        membership = await pool.fetchrow(
            "SELECT user_id, workspace_id FROM workspace_memberships WHERE membership_id = $1",
            membership_id,
        )

        if membership is None:
            return False

        result = await pool.execute(
            "DELETE FROM member_roles WHERE membership_id = $1 AND role_id = $2",
            membership_id,
            role_id,
        )

        deleted = result.split()[-1] != "0"

        if deleted:
            await cache.invalidate_user_permissions(membership["user_id"], membership["workspace_id"])
            logger.info(
                "Role removed from member",
                extra={"membership_id": str(membership_id), "role_id": str(role_id)},
            )

        return deleted


# Default workspace roles created on workspace creation
DEFAULT_WORKSPACE_ROLES = [
    ("owner", ["workspace:*", "members:*", "roles:*", "galleries:*", "assets:*", "billing:*", "settings:*", "audit:read"], True),
    ("admin", ["workspace:write", "members:write", "roles:write", "galleries:*", "assets:*", "billing:read", "settings:*", "audit:read"], True),
    ("editor", ["galleries:write", "galleries:read", "assets:write", "assets:read"], True),
    ("viewer", ["galleries:read", "assets:read", "settings:read"], True),
]


async def create_default_workspace_roles(workspace_id: uuid.UUID) -> list[Role]:
    """Create default roles for a new workspace.

    Called during workspace creation.
    """
    pool = await get_postgres_pool()
    roles = []
    now = datetime.now(timezone.utc)

    for name, permissions, is_system in DEFAULT_WORKSPACE_ROLES:
        role_id = uuid.uuid4()
        await pool.execute(
            """
            INSERT INTO roles (role_id, workspace_id, name, permissions, is_system, created_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (workspace_id, name) DO NOTHING
            """,
            role_id,
            workspace_id,
            name,
            permissions,
            is_system,
            now,
        )
        roles.append(Role(
            role_id=role_id,
            workspace_id=workspace_id,
            name=name,
            permissions=permissions,
            is_system=is_system,
            created_at=now,
        ))

    return roles
