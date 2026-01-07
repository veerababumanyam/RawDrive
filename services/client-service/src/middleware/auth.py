"""
JWT authentication middleware and dependencies.

Validates JWT tokens and extracts user/workspace context for authorization.
MUST use same JWT_SECRET as other services for interoperability.
"""

import jwt
from typing import Optional, Dict, Any
from fastapi import Header, HTTPException, status
from pydantic import BaseModel

from src.config import settings


class JWTPayload(BaseModel):
    """JWT token payload structure."""

    user_id: str
    workspace_id: str
    email: str
    role: Optional[str] = None
    exp: int  # Expiration timestamp
    iat: int  # Issued at timestamp


def decode_jwt(token: str) -> Dict[str, Any]:
    """
    Decode and validate JWT token.

    Args:
        token: JWT token string

    Returns:
        Dict[str, Any]: Decoded token payload

    Raises:
        HTTPException: If token is invalid or expired
    """
    try:
        # Remove "Bearer " prefix if present
        if token.startswith("Bearer "):
            token = token[7:]

        # Decode token with shared secret
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
        )

        return payload

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(
    authorization: str = Header(..., description="JWT Bearer token")
) -> JWTPayload:
    """
    FastAPI dependency to get current authenticated user from JWT.

    Usage:
        @router.get("/clients")
        async def list_clients(user: JWTPayload = Depends(get_current_user)):
            workspace_id = user.workspace_id
            ...

    Args:
        authorization: Authorization header with Bearer token

    Returns:
        JWTPayload: Decoded JWT payload with user info

    Raises:
        HTTPException: If token is missing or invalid
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_jwt(authorization)
        return JWTPayload(**payload)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_workspace_id(
    x_workspace_id: Optional[str] = Header(None, alias="X-Workspace-ID"),
    authorization: Optional[str] = Header(None),
) -> str:
    """
    FastAPI dependency to extract workspace ID from headers or JWT.

    Priority:
    1. X-Workspace-ID header (explicit workspace context)
    2. JWT token workspace_id claim (fallback)

    Usage:
        @router.get("/clients")
        async def list_clients(workspace_id: str = Depends(get_workspace_id)):
            # workspace_id guaranteed to be present
            ...

    Args:
        x_workspace_id: Optional X-Workspace-ID header
        authorization: Optional Authorization header with JWT

    Returns:
        str: Workspace ID

    Raises:
        HTTPException: If workspace ID cannot be determined
    """
    # Option 1: Explicit header
    if x_workspace_id:
        return x_workspace_id

    # Option 2: Extract from JWT
    if authorization:
        try:
            payload = decode_jwt(authorization)
            workspace_id = payload.get("workspace_id")
            if workspace_id:
                return workspace_id
        except HTTPException:
            pass  # JWT invalid, fall through to error

    # No workspace ID found
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Workspace ID required. Provide X-Workspace-ID header or valid JWT token.",
    )


async def verify_workspace_access(
    workspace_id: str = Header(..., alias="X-Workspace-ID"),
    user: JWTPayload = Header(...),
) -> tuple[str, JWTPayload]:
    """
    FastAPI dependency to verify user has access to workspace.

    Usage:
        @router.get("/clients")
        async def list_clients(
            auth: tuple[str, JWTPayload] = Depends(verify_workspace_access)
        ):
            workspace_id, user = auth
            # User is authorized for workspace
            ...

    Args:
        workspace_id: Workspace ID from header
        user: Current user from JWT

    Returns:
        tuple: (workspace_id, user)

    Raises:
        HTTPException: If user doesn't have access to workspace
    """
    # Verify workspace in JWT matches header
    if user.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User does not have access to this workspace",
        )

    return workspace_id, user


def create_jwt(payload: Dict[str, Any]) -> str:
    """
    Create JWT token (for testing or internal use).

    Args:
        payload: Token payload

    Returns:
        str: Encoded JWT token
    """
    return jwt.encode(
        payload,
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )
