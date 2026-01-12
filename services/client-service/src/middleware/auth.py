"""
JWT authentication middleware and dependencies.

Validates JWT tokens (EdDSA) and extracts user/workspace context for authorization.
Uses Ed25519 public key for token verification (same as backend).
"""

import jwt
from typing import Optional, Dict, Any
from functools import lru_cache
from pathlib import Path
from fastapi import Header, HTTPException, status
from pydantic import BaseModel
from cryptography.hazmat.primitives.serialization import load_pem_public_key

from src.config import settings


@lru_cache(maxsize=None)
def _load_public_key():
    """Load and cache the Ed25519 public key for JWT verification."""
    key_path = Path(settings.JWT_PUBLIC_KEY_PATH).expanduser()
    if not key_path.exists():
        raise FileNotFoundError(f"JWT public key not found at {key_path}")
    key_bytes = key_path.read_bytes()
    return load_pem_public_key(key_bytes)


class JWTPayload(BaseModel):
    """JWT token payload structure.
    
    Matches the backend's JWT token structure.
    Note: Backend uses 'sub' for user_id, we also support direct user_id field.
    """

    user_id: str  # Populated from 'sub' or 'user_id' field
    workspace_id: str
    email: Optional[str] = None  # Email may not be in access tokens
    role: Optional[str] = None
    permissions: Optional[list[str]] = None  # Permission list from backend
    exp: int  # Expiration timestamp
    iat: int  # Issued at timestamp
    
    model_config = {"extra": "allow"}  # Allow extra fields like sub, jti, iss, etc.
    
    @classmethod
    def model_validate(cls, obj, **kwargs):
        """Pre-process to extract user_id from 'sub' if not directly present."""
        if isinstance(obj, dict):
            # Backend tokens use 'sub' as user_id
            if "user_id" not in obj and "sub" in obj:
                obj = {**obj, "user_id": obj["sub"]}
        return super().model_validate(obj, **kwargs)


def decode_jwt(token: str) -> Dict[str, Any]:
    """
    Decode and validate JWT token using EdDSA public key.

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

        # Load public key for verification
        public_key = _load_public_key()

        # Decode token with EdDSA public key
        payload = jwt.decode(
            token,
            public_key,
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
    except FileNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"JWT configuration error: {str(e)}",
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
    authorization: str = Header(..., description="JWT Bearer token"),
) -> str:
    """
    FastAPI dependency to extract workspace ID from JWT.

    SECURITY: Workspace ID is ONLY extracted from JWT to prevent
    cross-tenant access via X-Workspace-ID header manipulation.

    Usage:
        @router.get("/clients")
        async def list_clients(workspace_id: str = Depends(get_workspace_id)):
            # workspace_id guaranteed to be from validated JWT
            ...

    Args:
        authorization: Required Authorization header with JWT

    Returns:
        str: Workspace ID from JWT token

    Raises:
        HTTPException: If JWT is invalid or missing workspace_id claim
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_jwt(authorization)
        workspace_id = payload.get("workspace_id")
        if not workspace_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="JWT token missing workspace_id claim",
            )
        return workspace_id
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
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


# NOTE: JWT token creation is ONLY done by the backend service.
# Client-service only verifies tokens using the public key.
# Do NOT add create_jwt() function here - it violates security architecture.
