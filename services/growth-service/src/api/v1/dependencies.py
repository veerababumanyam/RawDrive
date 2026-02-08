"""FastAPI dependencies for authentication and authorization.

Provides dependency injection for:
- JWT token extraction and validation
- Workspace ID extraction (from Traefik header or JWT)
- User ID extraction
- Permission checking
"""

from typing import Optional
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status

from src.logging import get_logger
from src.utils.jwt import decode_token, extract_workspace_id, extract_user_id, extract_permissions

logger = get_logger(__name__)


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
) -> UUID:
    """Extract workspace_id from Traefik gateway header or JWT token.

    Two-layer authentication pattern:
    1. Traefik gateway adds X-Workspace-Id header (preferred)
    2. Fallback to extracting from JWT token

    Args:
        x_workspace_id: Workspace ID from Traefik header
        token: JWT token from authorization header

    Returns:
        workspace_id as UUID

    Raises:
        HTTPException: If workspace_id cannot be determined
    """
    workspace_id_str: str

    # Layer 1: Traefik gateway header (preferred)
    if x_workspace_id:
        logger.debug(f"Using workspace_id from Traefik header: {x_workspace_id}")
        workspace_id_str = x_workspace_id
    else:
        # Layer 2: Extract from JWT token (fallback)
        workspace_id_str = extract_workspace_id(token)
        logger.debug(f"Using workspace_id from JWT token: {workspace_id_str}")

    try:
        return UUID(workspace_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid workspace_id format"
        )


def get_user_id(token: str = Depends(get_jwt_token)) -> UUID:
    """Extract user_id from JWT token.

    Args:
        token: JWT token

    Returns:
        user_id as UUID
    """
    user_id_str = extract_user_id(token)
    try:
        return UUID(user_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user_id format"
        )


class AuthContext:
    """Authentication context containing user and workspace info."""

    def __init__(self, user_id: UUID, workspace_id: UUID, permissions: list[str]):
        self.user_id = user_id
        self.workspace_id = workspace_id
        self.permissions = permissions

    def has_permission(self, permission: str) -> bool:
        """Check if user has a specific permission."""
        # Check exact match
        if permission in self.permissions:
            return True
        # Check wildcard (e.g., "growth:*" covers "growth:read")
        prefix = permission.split(":")[0]
        return f"{prefix}:*" in self.permissions


def get_auth_context(
    user_id: UUID = Depends(get_user_id),
    workspace_id: UUID = Depends(get_workspace_id),
    token: str = Depends(get_jwt_token)
) -> AuthContext:
    """Get full authentication context.

    Args:
        user_id: User ID from JWT
        workspace_id: Workspace ID from header/JWT
        token: JWT token

    Returns:
        AuthContext with user_id, workspace_id, and permissions
    """
    permissions = extract_permissions(token)
    return AuthContext(
        user_id=user_id,
        workspace_id=workspace_id,
        permissions=permissions
    )


def require_permissions(*required_permissions: str):
    """Dependency factory for requiring specific permissions.

    Usage:
        @router.get("/data", dependencies=[Depends(require_permissions("growth:read"))])
        async def get_data(...):
            ...

    Args:
        required_permissions: Permission strings required

    Returns:
        FastAPI dependency function
    """
    def check_permissions(auth: AuthContext = Depends(get_auth_context)) -> AuthContext:
        """Check if user has required permissions.

        Args:
            auth: Authentication context

        Returns:
            AuthContext if permissions valid

        Raises:
            HTTPException: If permissions missing
        """
        missing = [p for p in required_permissions if not auth.has_permission(p)]

        if missing:
            logger.warning(
                f"Permission denied for user {auth.user_id} in workspace {auth.workspace_id}. "
                f"Missing: {missing}, Has: {auth.permissions}"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing permissions: {missing}"
            )

        return auth

    return check_permissions


def require_partner_status():
    """Dependency to verify user is an approved partner.

    Used for partner-only endpoints like payout requests.

    Returns:
        FastAPI dependency function
    """
    async def check_partner(
        auth: AuthContext = Depends(get_auth_context)
    ) -> AuthContext:
        """Check if user is an approved partner.

        This is a lightweight check - full verification happens in the service layer.
        """
        # For now, just return auth context
        # Full partner status check happens in partner_service
        return auth

    return check_partner
