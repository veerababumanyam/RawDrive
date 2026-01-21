"""
JWT authentication middleware and dependencies.

Validates JWT tokens (EdDSA) and extracts user/workspace context for authorization.
Uses Ed25519 public key for token verification (same as backend).

SECURITY:
- All JWT validation errors return IDENTICAL generic messages
- Detailed errors are logged internally at DEBUG level
- No information disclosure about token structure or validation logic
"""

import jwt
from typing import Optional, Dict, Any
from functools import lru_cache
from pathlib import Path
from fastapi import Header, HTTPException, status
from pydantic import BaseModel
from cryptography.hazmat.primitives.serialization import load_pem_public_key

from src.config import settings
from src.log_config import get_logger

logger = get_logger(__name__)

# SECURITY: Generic error message for ALL authentication failures
# This MUST be used for every JWT validation error to prevent information disclosure
GENERIC_AUTH_ERROR = "Invalid authentication token"


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

    SECURITY: All validation errors return IDENTICAL generic messages.
    Detailed errors are logged internally at DEBUG level for troubleshooting.

    Args:
        token: JWT token string

    Returns:
        Dict[str, Any]: Decoded token payload

    Raises:
        HTTPException: If token is invalid or expired (generic message)
    """
    # Extract token prefix for logging (first 10 chars for debugging)
    token_prefix = token[:10] if token else "<empty>"

    try:
        # Remove "Bearer " prefix if present
        if token.startswith("Bearer "):
            token = token[7:]
            token_prefix = token[:10] if token else "<empty>"

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
        # SECURITY: Log details internally, return generic message
        logger.debug(
            "JWT validation failed: token expired",
            extra={"token_prefix": token_prefix, "error_type": "expired"},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=GENERIC_AUTH_ERROR,
            headers={"WWW-Authenticate": "Bearer"},
        )

    except jwt.InvalidSignatureError:
        # SECURITY: Log details internally, return generic message
        logger.debug(
            "JWT validation failed: invalid signature",
            extra={"token_prefix": token_prefix, "error_type": "invalid_signature"},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=GENERIC_AUTH_ERROR,
            headers={"WWW-Authenticate": "Bearer"},
        )

    except jwt.DecodeError as e:
        # SECURITY: Log details internally, return generic message
        logger.debug(
            "JWT validation failed: decode error",
            extra={"token_prefix": token_prefix, "error_type": "decode", "error": str(e)},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=GENERIC_AUTH_ERROR,
            headers={"WWW-Authenticate": "Bearer"},
        )

    except jwt.InvalidTokenError as e:
        # SECURITY: Catch-all for any other JWT errors - return generic message
        logger.debug(
            "JWT validation failed: invalid token",
            extra={"token_prefix": token_prefix, "error_type": "invalid", "error": str(e)},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=GENERIC_AUTH_ERROR,
            headers={"WWW-Authenticate": "Bearer"},
        )

    except FileNotFoundError as e:
        # Server configuration error - log as error, return 500
        logger.error(
            "JWT public key not found",
            extra={"error": str(e)},
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication service unavailable",
        )


async def get_current_user(
    authorization: str = Header(..., description="JWT Bearer token")
) -> JWTPayload:
    """
    FastAPI dependency to get current authenticated user from JWT.

    SECURITY: All errors return IDENTICAL generic messages.

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
        HTTPException: If token is missing or invalid (generic message)
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=GENERIC_AUTH_ERROR,
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_jwt(authorization)
        return JWTPayload.model_validate(payload)
    except HTTPException:
        # Re-raise HTTPExceptions as-is (already have generic message from decode_jwt)
        raise
    except Exception as e:
        # SECURITY: Catch any unexpected errors, return generic message
        logger.debug(
            "Unexpected error in get_current_user",
            extra={"error": str(e), "error_type": type(e).__name__},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=GENERIC_AUTH_ERROR,
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_workspace_id(
    authorization: str = Header(..., description="JWT Bearer token"),
) -> str:
    """
    FastAPI dependency to extract workspace ID from JWT.

    SECURITY:
    - Workspace ID is ONLY extracted from JWT (never headers)
    - All errors return IDENTICAL generic messages

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
        HTTPException: If JWT is invalid or missing workspace_id claim (generic message)
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=GENERIC_AUTH_ERROR,
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_jwt(authorization)
        workspace_id = payload.get("workspace_id")
        if not workspace_id:
            # SECURITY: Don't reveal which claim is missing
            logger.debug(
                "JWT missing workspace_id claim",
                extra={"payload_keys": list(payload.keys())},
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=GENERIC_AUTH_ERROR,
                headers={"WWW-Authenticate": "Bearer"},
            )
        return workspace_id
    except HTTPException:
        # Re-raise HTTPExceptions as-is
        raise
    except Exception as e:
        # SECURITY: Catch any unexpected errors, return generic message
        logger.debug(
            "Unexpected error in get_workspace_id",
            extra={"error": str(e), "error_type": type(e).__name__},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=GENERIC_AUTH_ERROR,
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
