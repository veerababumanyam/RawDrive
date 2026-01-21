"""Role-Based Access Control (RBAC) Middleware.

Implements fixed permission matrix enforcement for client-service operations.
Uses JWT claims to extract role/permissions and validates against matrix.

SECURITY:
- Permissions are extracted from validated JWT tokens only
- Fixed permission matrix prevents privilege escalation
- All permission denials are logged for security monitoring

Usage:
    from src.middleware.rbac import require_permission
    from src.constants.permissions import Permission

    @router.delete("/clients/{client_id}")
    async def delete_client(
        client_id: UUID,
        user: JWTPayload = Depends(get_current_user),
        _: None = Depends(require_permission(Permission.CLIENTS_DELETE)),
    ):
        # Permission already verified
        ...
"""

from typing import Callable
from fastapi import Depends, HTTPException, status

from src.middleware.auth import get_current_user, JWTPayload
from src.constants.permissions import (
    Permission,
    check_permission_from_jwt,
)
from src.log_config import get_logger

logger = get_logger(__name__)


def require_permission(required_permission: str | Permission) -> Callable:
    """
    Create a FastAPI dependency that enforces a specific permission.

    This is a dependency factory that returns a dependency function.
    The returned dependency checks if the current user has the required permission.

    Args:
        required_permission: The permission string (e.g., "clients:write") or Permission enum

    Returns:
        Callable: A FastAPI dependency that verifies the permission

    Raises:
        HTTPException: 403 if user lacks the required permission

    Usage:
        @router.post("/clients")
        async def create_client(
            _: None = Depends(require_permission(Permission.CLIENTS_WRITE)),
            user: JWTPayload = Depends(get_current_user),
        ):
            # User has clients:write permission
            ...

        @router.delete("/clients/bulk")
        async def bulk_delete(
            _: None = Depends(require_permission("clients:bulk_delete")),
            user: JWTPayload = Depends(get_current_user),
        ):
            # User has clients:bulk_delete permission (admin only)
            ...
    """
    permission_str = str(required_permission)

    async def permission_dependency(
        user: JWTPayload = Depends(get_current_user),
    ) -> None:
        """
        Verify user has required permission.

        Args:
            user: Current user from JWT (injected by FastAPI)

        Raises:
            HTTPException: 403 if permission denied
        """
        # Check permission using JWT claims
        has_permission = check_permission_from_jwt(
            role=user.role,
            permissions=user.permissions,
            required_permission=permission_str,
        )

        if not has_permission:
            # Log the permission denial for security monitoring
            logger.warning(
                "Permission denied",
                extra={
                    "user_id": user.user_id,
                    "workspace_id": user.workspace_id,
                    "role": user.role,
                    "required_permission": permission_str,
                    "user_permissions": user.permissions,
                },
            )

            # Return 403 with permission details
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "INSUFFICIENT_PERMISSIONS",
                    "message": "Insufficient permissions to perform this action",
                    "required_permission": permission_str,
                },
            )

        # Permission granted - log for audit trail
        logger.debug(
            "Permission granted",
            extra={
                "user_id": user.user_id,
                "workspace_id": user.workspace_id,
                "required_permission": permission_str,
            },
        )

    return permission_dependency


def require_admin() -> Callable:
    """
    Convenience dependency that requires admin role.

    Equivalent to require_permission(Permission.CLIENTS_BULK_DELETE) but
    more semantic for operations that are generally admin-only.

    Usage:
        @router.post("/clients/import")
        async def import_clients(
            _: None = Depends(require_admin()),
            user: JWTPayload = Depends(get_current_user),
        ):
            # User is admin or owner
            ...
    """
    async def admin_dependency(
        user: JWTPayload = Depends(get_current_user),
    ) -> None:
        """Verify user is admin or owner."""
        if user.role not in ("admin", "owner"):
            logger.warning(
                "Admin access denied",
                extra={
                    "user_id": user.user_id,
                    "workspace_id": user.workspace_id,
                    "role": user.role,
                },
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "INSUFFICIENT_PERMISSIONS",
                    "message": "This operation requires admin privileges",
                    "required_permission": "admin",
                },
            )

    return admin_dependency


def require_write() -> Callable:
    """
    Convenience dependency that requires write permission.

    For operations that modify data (create, update, delete individual records).

    Usage:
        @router.post("/clients")
        async def create_client(
            _: None = Depends(require_write()),
            user: JWTPayload = Depends(get_current_user),
        ):
            # User has write permission
            ...
    """
    return require_permission(Permission.CLIENTS_WRITE)


def require_read() -> Callable:
    """
    Convenience dependency that requires read permission.

    For operations that only read data (list, get, search).
    All authenticated users should have read access.

    Usage:
        @router.get("/clients")
        async def list_clients(
            _: None = Depends(require_read()),
            user: JWTPayload = Depends(get_current_user),
        ):
            # User has read permission
            ...
    """
    return require_permission(Permission.CLIENTS_READ)
