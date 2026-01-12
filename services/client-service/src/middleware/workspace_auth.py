"""
Centralized workspace access verification for multi-tenant isolation.

This module provides a single implementation of workspace verification to replace
455+ lines of duplicated code across 13 API modules.

SECURITY: Workspace ID is extracted from the path parameter and verified against
the JWT token's workspace_id claim to prevent cross-tenant access.
"""

from fastapi import Path, Depends, HTTPException, status
from uuid import UUID
from typing import Union

from src.middleware.auth import get_current_user, JWTPayload
# Import directly to avoid circular import through middleware/__init__.py
from src.log_config.logging import get_logger

logger = get_logger(__name__)


async def verify_workspace_access(
    workspace_id: Union[UUID, str] = Path(..., description="Workspace ID from URL path"),
    current_user: JWTPayload = Depends(get_current_user),
) -> str:
    """
    Centralized workspace access verification (SINGLE implementation).

    This dependency replaces 13 duplicate implementations across API files:
    - activities.py
    - addresses.py
    - analytics.py
    - bulk_ops.py
    - clients.py
    - communications.py
    - contacts.py
    - duplicates.py
    - galleries.py
    - import_export.py
    - smart_lists.py
    - tags.py
    - visitors.py

    Usage in API routes:
        @router.get("/workspaces/{workspace_id}/clients")
        async def list_clients(
            workspace_id: str = Depends(verify_workspace_access),
        ):
            # workspace_id is guaranteed to match JWT token
            clients = await client_repo.list_by_workspace(workspace_id)
            return clients

    Args:
        workspace_id: Workspace ID from URL path parameter
        current_user: Current authenticated user from JWT token

    Returns:
        str: Validated workspace ID (guaranteed to match JWT)

    Raises:
        HTTPException 403: If user doesn't have access to workspace

    Security:
        - Workspace ID is ONLY accepted from path parameter
        - Verified against JWT token's workspace_id claim
        - Prevents cross-tenant access via URL manipulation
        - Logs all access denial attempts for security monitoring
    """
    # Convert UUID to string for comparison
    workspace_id_str = str(workspace_id)
    jwt_workspace_id = str(current_user.workspace_id)

    # Verify workspace in JWT matches path parameter
    if workspace_id_str != jwt_workspace_id:
        logger.warning(
            "Workspace access denied - JWT mismatch",
            extra={
                "requested_workspace_id": workspace_id_str,
                "jwt_workspace_id": jwt_workspace_id,
                "user_id": current_user.user_id,
                "user_email": current_user.email,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "WORKSPACE_ACCESS_DENIED",
                "message": "You do not have access to this workspace",
            },
        )

    return workspace_id_str


async def get_workspace_from_jwt(
    current_user: JWTPayload = Depends(get_current_user),
) -> str:
    """
    Extract workspace ID directly from JWT token.

    Use this when the URL doesn't include workspace_id in the path.

    Usage:
        @router.get("/clients/me")
        async def get_my_clients(
            workspace_id: str = Depends(get_workspace_from_jwt),
        ):
            # workspace_id extracted from JWT
            ...

    Args:
        current_user: Current authenticated user from JWT

    Returns:
        str: Workspace ID from JWT token
    """
    return str(current_user.workspace_id)
