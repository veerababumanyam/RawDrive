"""
API dependencies for Sync Service.

Provides dependency injection for authentication, authorization,
and workspace context extraction.
"""

from typing import Optional
from uuid import UUID

from fastapi import Depends, HTTPException, Header, status
from pydantic import BaseModel
import jwt

from src.config import settings
from src.logging import get_logger

logger = get_logger(__name__)


class WorkspaceContext(BaseModel):
    """Context extracted from JWT token."""

    workspace_id: UUID
    user_id: UUID
    role: str = "member"
    email: Optional[str] = None


async def get_workspace_context(
    authorization: str = Header(..., description="Bearer token"),
    x_workspace_id: Optional[str] = Header(
        None,
        alias="X-Workspace-ID",
        description="Workspace ID (optional, can be extracted from token)",
    ),
) -> WorkspaceContext:
    """
    Extract workspace context from JWT token.

    The JWT token must contain:
    - sub: User ID (UUID)
    - workspace_id: Workspace ID (UUID) OR passed via X-Workspace-ID header
    - role: User's role in the workspace (optional, defaults to 'member')

    Args:
        authorization: Bearer token from Authorization header
        x_workspace_id: Optional workspace ID from header

    Returns:
        WorkspaceContext with user and workspace information

    Raises:
        HTTPException: If token is invalid or missing required claims
    """
    # Extract token from Authorization header
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_token", "message": "Invalid authorization header format"},
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization[7:]  # Remove "Bearer " prefix

    try:
        # Decode JWT token
        payload = jwt.decode(
            token,
            settings.JWT_SECRET.get_secret_value(),
            algorithms=[settings.JWT_ALGORITHM],
            options={"verify_exp": True},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "token_expired", "message": "Token has expired"},
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid JWT token: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_token", "message": "Invalid token"},
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Extract user ID
    user_id_str = payload.get("sub")
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_token", "message": "Token missing user ID"},
        )

    try:
        user_id = UUID(user_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "invalid_token", "message": "Invalid user ID in token"},
        )

    # Extract workspace ID from token or header
    workspace_id_str = payload.get("workspace_id") or x_workspace_id
    if not workspace_id_str:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "missing_workspace",
                "message": "Workspace ID required (in token or X-Workspace-ID header)",
            },
        )

    try:
        workspace_id = UUID(workspace_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_workspace", "message": "Invalid workspace ID"},
        )

    # Extract optional fields
    role = payload.get("role", "member")
    email = payload.get("email")

    return WorkspaceContext(
        workspace_id=workspace_id,
        user_id=user_id,
        role=role,
        email=email,
    )


async def require_admin(
    context: WorkspaceContext = Depends(get_workspace_context),
) -> WorkspaceContext:
    """
    Require admin role for the endpoint.

    Args:
        context: Workspace context from JWT

    Returns:
        WorkspaceContext if user is admin

    Raises:
        HTTPException: If user is not an admin
    """
    if context.role not in ("admin", "owner"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "access_denied",
                "message": "Admin access required",
            },
        )
    return context
