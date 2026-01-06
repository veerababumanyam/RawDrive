"""FastAPI dependencies for authentication and authorization."""

import logging
from typing import Optional

from fastapi import Depends, Header, HTTPException, status

from src.utils.jwt import decode_token, extract_workspace_id, extract_permissions

logger = logging.getLogger(__name__)


def get_jwt_token(authorization: Optional[str] = Header(None)) -> str:
    """Extract JWT token from Authorization header.

    Args:
        authorization: Authorization header value

    Returns:
        JWT token string

    Raises:
        HTTPException: If authorization header missing or malformed
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header"
        )

    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format"
        )

    return authorization.replace("Bearer ", "")


def get_workspace_id(
    x_workspace_id: Optional[str] = Header(None, alias="X-Workspace-Id"),
    token: str = Depends(get_jwt_token)
) -> str:
    """Extract workspace_id from Traefik gateway header or JWT token.

    Two-layer authentication pattern:
    1. Traefik gateway adds X-Workspace-Id header (preferred)
    2. Fallback to extracting from JWT token

    Args:
        x_workspace_id: Workspace ID from Traefik header
        token: JWT token from authorization header

    Returns:
        workspace_id string

    Raises:
        HTTPException: If workspace_id cannot be determined
    """
    # Layer 1: Traefik gateway header (preferred)
    if x_workspace_id:
        logger.debug(f"Using workspace_id from Traefik header: {x_workspace_id}")
        return x_workspace_id

    # Layer 2: Extract from JWT token (fallback)
    workspace_id = extract_workspace_id(token)
    logger.debug(f"Using workspace_id from JWT token: {workspace_id}")
    return workspace_id


def get_user_id(token: str = Depends(get_jwt_token)) -> str:
    """Extract user_id from JWT token.

    Args:
        token: JWT token

    Returns:
        user_id string
    """
    from src.utils.jwt import extract_user_id
    return extract_user_id(token)


def require_permissions(required_permissions: list[str]):
    """Dependency factory for requiring specific permissions.

    Usage:
        @router.get("/subscription", dependencies=[Depends(require_permissions(["billing:read"]))])
        async def get_subscription(...):
            ...

    Args:
        required_permissions: List of required permission strings

    Returns:
        FastAPI dependency function
    """
    def check_permissions(
        workspace_id: str = Depends(get_workspace_id),
        token: str = Depends(get_jwt_token)
    ) -> str:
        """Check if user has required permissions.

        Args:
            workspace_id: Workspace ID from dependency
            token: JWT token from dependency

        Returns:
            workspace_id if permissions valid

        Raises:
            HTTPException: If permissions missing
        """
        user_permissions = extract_permissions(token)

        # Check for wildcard permission (e.g., "billing:*")
        permission_prefix = required_permissions[0].split(":")[0] if required_permissions else None
        has_wildcard = f"{permission_prefix}:*" in user_permissions if permission_prefix else False

        # Check for specific permissions or wildcard
        missing = [p for p in required_permissions if p not in user_permissions and not has_wildcard]

        if missing:
            logger.warning(
                f"Permission denied for workspace {workspace_id}. "
                f"Missing: {missing}, Has: {user_permissions}"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing permissions: {missing}"
            )

        return workspace_id

    return check_permissions
