"""Permission Matrix for Role-Based Access Control (RBAC).

Defines the fixed permission matrix for client-service operations.
Permissions are extracted from JWT tokens and validated against this matrix.

Permission Format: {resource}:{action}
"""

from enum import StrEnum
from typing import FrozenSet


class Permission(StrEnum):
    """Client-service permissions."""

    # Read operations (viewer, editor, admin)
    CLIENTS_READ = "clients:read"

    # Write operations (editor, admin)
    CLIENTS_WRITE = "clients:write"
    CLIENTS_DELETE = "clients:delete"

    # Admin-only operations
    CLIENTS_BULK_DELETE = "clients:bulk_delete"
    CLIENTS_EXPORT = "clients:export"
    CLIENTS_IMPORT = "clients:import"


# Fixed permission matrix - consistent across all workspaces
# Maps role name to set of permissions
PERMISSION_MATRIX: dict[str, FrozenSet[str]] = {
    "viewer": frozenset({
        Permission.CLIENTS_READ,
    }),
    "editor": frozenset({
        Permission.CLIENTS_READ,
        Permission.CLIENTS_WRITE,
        Permission.CLIENTS_DELETE,
    }),
    "admin": frozenset({
        Permission.CLIENTS_READ,
        Permission.CLIENTS_WRITE,
        Permission.CLIENTS_DELETE,
        Permission.CLIENTS_BULK_DELETE,
        Permission.CLIENTS_EXPORT,
        Permission.CLIENTS_IMPORT,
    }),
    # Owner has same permissions as admin in client-service
    "owner": frozenset({
        Permission.CLIENTS_READ,
        Permission.CLIENTS_WRITE,
        Permission.CLIENTS_DELETE,
        Permission.CLIENTS_BULK_DELETE,
        Permission.CLIENTS_EXPORT,
        Permission.CLIENTS_IMPORT,
    }),
}


def get_role_permissions(role: str) -> FrozenSet[str]:
    """
    Get permissions for a role.

    Args:
        role: Role name (viewer, editor, admin, owner)

    Returns:
        FrozenSet of permission strings for the role.
        Returns empty set for unknown roles.
    """
    return PERMISSION_MATRIX.get(role.lower(), frozenset())


def has_permission(role: str, permission: str | Permission) -> bool:
    """
    Check if a role has a specific permission.

    Args:
        role: Role name from JWT token
        permission: Permission to check

    Returns:
        True if the role has the permission
    """
    role_permissions = get_role_permissions(role)
    return str(permission) in role_permissions


def check_permission_from_jwt(
    role: str | None,
    permissions: list[str] | None,
    required_permission: str | Permission,
) -> bool:
    """
    Check permission from JWT claims.

    JWT tokens may contain either:
    1. Explicit permissions list (takes precedence)
    2. Role name (uses PERMISSION_MATRIX lookup)

    Args:
        role: Role from JWT claims (may be None)
        permissions: Explicit permissions list from JWT (may be None)
        required_permission: Permission to check

    Returns:
        True if the user has the required permission
    """
    permission_str = str(required_permission)

    # Explicit permissions list takes precedence
    if permissions:
        return permission_str in permissions

    # Fall back to role-based lookup
    if role:
        return has_permission(role, required_permission)

    return False
