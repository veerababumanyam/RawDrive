"""API dependencies for dependency injection."""

from app.api.dependencies.auth import (
    AuthContext,
    AuthError,
    CurrentUser,
    CurrentUserDep,
    OptionalUserDep,
    PermissionError,
    WorkspaceAccessDep,
    get_current_user,
    get_current_user_optional,
    require_permissions,
    require_platform_permission,
    require_workspace_access,
)

__all__ = [
    "AuthContext",
    "AuthError",
    "CurrentUser",
    "CurrentUserDep",
    "OptionalUserDep",
    "PermissionError",
    "WorkspaceAccessDep",
    "get_current_user",
    "get_current_user_optional",
    "require_permissions",
    "require_platform_permission",
    "require_workspace_access",
]
