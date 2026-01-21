"""API dependencies for dependency injection."""

from app.api.dependencies.auth import (
    AuthContext,
    AuthError,
    CurrentUser,
    CurrentUserDep,
    OptionalUserDep,
    PermissionError,
    WorkspaceAccessDep,
    WorkspaceIdDep,
    get_current_user,
    get_current_user_optional,
    require_permissions,
    require_platform_permission,
    require_workspace_access,
)

from app.api.dependencies.face_rate_limit import (
    FaceRateLimitError,
    check_face_search_rate_limit,
    check_face_detect_rate_limit,
    check_face_bulk_rate_limit,
    check_face_group_merge_rate_limit,
    increment_face_detection_count,
    get_face_search_rate_limiter,
    get_face_detect_rate_limiter,
    get_face_bulk_rate_limiter,
)

__all__ = [
    # Auth dependencies
    "AuthContext",
    "AuthError",
    "CurrentUser",
    "CurrentUserDep",
    "OptionalUserDep",
    "PermissionError",
    "WorkspaceAccessDep",
    "WorkspaceIdDep",
    "get_current_user",
    "get_current_user_optional",
    "require_permissions",
    "require_platform_permission",
    "require_workspace_access",
    # Face rate limit dependencies (SEC-001)
    "FaceRateLimitError",
    "check_face_search_rate_limit",
    "check_face_detect_rate_limit",
    "check_face_bulk_rate_limit",
    "check_face_group_merge_rate_limit",
    "increment_face_detection_count",
    "get_face_search_rate_limiter",
    "get_face_detect_rate_limiter",
    "get_face_bulk_rate_limiter",
]
