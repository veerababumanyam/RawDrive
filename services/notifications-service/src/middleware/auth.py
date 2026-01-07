"""
JWT authentication middleware and dependencies.

Validates JWT tokens and extracts user/workspace context for authorization.
MUST use same JWT_SECRET as other services for interoperability.

Provides:
- JWTPayload: Pydantic model for JWT token payload
- decode_jwt: Function to decode and validate JWT tokens
- get_current_user: FastAPI dependency for authenticated routes
- get_optional_user: FastAPI dependency for optionally authenticated routes
- get_workspace_id: FastAPI dependency to extract workspace ID
- verify_workspace_access: FastAPI dependency for workspace authorization
- require_role: Factory for role-based access control
- create_jwt: Utility for creating JWT tokens (testing/internal use)

Feature: Notifications & Communication Microservice
Task: T031 - Create JWT authentication middleware
"""

import logging
from typing import Optional, Dict, Any, List
from uuid import UUID

import jwt
from fastapi import Header, HTTPException, Path, Query, status
from pydantic import BaseModel, Field

from src.config import settings

logger = logging.getLogger(__name__)


# =============================================================================
# JWT Payload Model
# =============================================================================


class JWTPayload(BaseModel):
    """JWT token payload structure.

    Contains all claims extracted from a valid JWT token.
    Must be compatible with the backend service's token structure.
    """

    user_id: str = Field(..., description="Unique user identifier (UUID)")
    workspace_id: str = Field(..., description="Current workspace context (UUID)")
    email: str = Field(..., description="User's email address")
    role: Optional[str] = Field(None, description="User's role in the workspace")
    permissions: List[str] = Field(
        default_factory=list,
        description="List of permission strings (e.g., 'notifications:send')"
    )
    exp: int = Field(..., description="Token expiration timestamp (Unix epoch)")
    iat: int = Field(..., description="Token issued at timestamp (Unix epoch)")

    class Config:
        """Pydantic model configuration."""

        extra = "allow"  # Allow extra fields from JWT (sub, aud, etc.)


# =============================================================================
# JWT Decoding Functions
# =============================================================================


def decode_jwt(token: str) -> Dict[str, Any]:
    """
    Decode and validate JWT token.

    Strips "Bearer " prefix if present and validates the token against
    the shared secret. Token expiration is automatically checked.

    Args:
        token: JWT token string (with or without "Bearer " prefix)

    Returns:
        Dict[str, Any]: Decoded token payload

    Raises:
        HTTPException: 401 if token is invalid or expired
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
        logger.warning("JWT token expired")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid JWT token: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


def decode_jwt_optional(token: Optional[str]) -> Optional[Dict[str, Any]]:
    """
    Decode JWT token without raising exceptions.

    Used for optional authentication where a missing/invalid token
    should not block the request.

    Args:
        token: Optional JWT token string

    Returns:
        Optional[Dict[str, Any]]: Decoded payload or None if invalid
    """
    if not token:
        return None

    try:
        return decode_jwt(token)
    except HTTPException:
        return None


# =============================================================================
# FastAPI Dependencies - Authentication
# =============================================================================


async def get_current_user(
    authorization: str = Header(..., description="JWT Bearer token")
) -> JWTPayload:
    """
    FastAPI dependency to get current authenticated user from JWT.

    Validates the JWT token from the Authorization header and returns
    the decoded payload as a JWTPayload model.

    Usage:
        @router.get("/notifications")
        async def list_notifications(user: JWTPayload = Depends(get_current_user)):
            workspace_id = user.workspace_id
            user_id = user.user_id
            ...

    Args:
        authorization: Authorization header with Bearer token

    Returns:
        JWTPayload: Decoded JWT payload with user info

    Raises:
        HTTPException: 401 if token is missing or invalid
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_jwt(authorization)

        # Handle alternative claim names (sub vs user_id)
        if "user_id" not in payload and "sub" in payload:
            payload["user_id"] = payload["sub"]

        return JWTPayload(**payload)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to parse JWT payload: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token format",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_optional_user(
    authorization: Optional[str] = Header(None, description="Optional JWT Bearer token")
) -> Optional[JWTPayload]:
    """
    FastAPI dependency for optional authentication.

    Returns the user if a valid token is provided, None otherwise.
    Useful for endpoints that behave differently for authenticated users.

    Usage:
        @router.get("/public/notifications")
        async def view_public(user: Optional[JWTPayload] = Depends(get_optional_user)):
            if user:
                # Show user-specific content
                ...
            else:
                # Show public content
                ...

    Args:
        authorization: Optional Authorization header with Bearer token

    Returns:
        Optional[JWTPayload]: Decoded JWT payload or None
    """
    if not authorization:
        return None

    try:
        payload = decode_jwt(authorization)

        # Handle alternative claim names
        if "user_id" not in payload and "sub" in payload:
            payload["user_id"] = payload["sub"]

        return JWTPayload(**payload)
    except HTTPException:
        return None
    except Exception:
        return None


# =============================================================================
# FastAPI Dependencies - Workspace Context
# =============================================================================


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
        @router.get("/notifications")
        async def list_notifications(workspace_id: str = Depends(get_workspace_id)):
            # workspace_id guaranteed to be present
            ...

    Args:
        x_workspace_id: Optional X-Workspace-ID header
        authorization: Optional Authorization header with JWT

    Returns:
        str: Workspace ID

    Raises:
        HTTPException: 400 if workspace ID cannot be determined
    """
    # Option 1: Explicit header
    if x_workspace_id:
        try:
            # Validate UUID format
            UUID(x_workspace_id)
            return x_workspace_id
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid workspace ID format (must be UUID)",
            )

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
    workspace_id: UUID = Path(..., description="Workspace ID"),
    current_user: JWTPayload = None,  # Will be injected by Depends
) -> UUID:
    """
    Verify user has access to the requested workspace.

    Compares the workspace_id from the URL path against the user's JWT claim.
    Use with Depends() on routes that have workspace_id in the path.

    Usage:
        @router.get("/workspaces/{workspace_id}/notifications")
        async def list_notifications(
            workspace_id: UUID = Depends(verify_workspace_access),
            current_user: JWTPayload = Depends(get_current_user),
        ):
            # workspace_id is validated
            ...

    Args:
        workspace_id: Workspace ID from path
        current_user: JWT payload from authentication

    Returns:
        UUID: Validated workspace ID

    Raises:
        HTTPException: 403 if user doesn't have access
    """
    # This function is typically used with composition:
    # verify_workspace_access will be called with get_current_user as a sub-dependency
    # But for direct use, we accept the current_user as parameter

    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if str(current_user.workspace_id) != str(workspace_id):
        logger.warning(
            "Workspace access denied",
            extra={
                "user_id": current_user.user_id,
                "requested_workspace": str(workspace_id),
                "user_workspace": current_user.workspace_id,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this workspace",
        )

    return workspace_id


def create_workspace_verifier(
    authorization: str = Header(..., description="JWT Bearer token"),
):
    """
    Factory to create workspace access verification dependency.

    This creates a dependency that validates both the JWT token and
    workspace access in a single call.

    Usage:
        WorkspaceAuth = Depends(create_workspace_verifier)

        @router.get("/workspaces/{workspace_id}/notifications")
        async def list_notifications(
            workspace_id: UUID,
            auth: JWTPayload = WorkspaceAuth,
        ):
            ...
    """
    async def verify(
        workspace_id: UUID = Path(..., description="Workspace ID"),
    ) -> JWTPayload:
        user = await get_current_user(authorization)
        await verify_workspace_access(workspace_id, user)
        return user

    return verify


# =============================================================================
# Role-Based Access Control
# =============================================================================


def require_role(required_roles: List[str]):
    """
    Factory for role-based access control dependencies.

    Creates a dependency that checks if the user has one of the required roles.

    Usage:
        AdminOnly = Depends(require_role(["admin", "owner"]))

        @router.delete("/templates/{template_id}")
        async def delete_template(
            template_id: UUID,
            user: JWTPayload = AdminOnly,
        ):
            # Only admins and owners can delete templates
            ...

    Args:
        required_roles: List of roles that are allowed access

    Returns:
        Dependency function that validates role
    """
    async def dependency(
        current_user: JWTPayload = None,  # Injected by Depends(get_current_user)
    ) -> JWTPayload:
        if current_user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user_role = current_user.role or ""

        if user_role not in required_roles:
            logger.warning(
                "Role access denied",
                extra={
                    "user_id": current_user.user_id,
                    "user_role": user_role,
                    "required_roles": required_roles,
                },
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required role: {', '.join(required_roles)}",
            )

        return current_user

    return dependency


def require_permission(required_permissions: List[str]):
    """
    Factory for permission-based access control dependencies.

    Creates a dependency that checks if the user has all required permissions.

    Usage:
        CanSendNotifications = Depends(require_permission(["notifications:send"]))

        @router.post("/notifications")
        async def send_notification(
            request: NotificationRequest,
            user: JWTPayload = CanSendNotifications,
        ):
            # Only users with notifications:send can send
            ...

    Args:
        required_permissions: List of permissions required (all must be present)

    Returns:
        Dependency function that validates permissions
    """
    async def dependency(
        current_user: JWTPayload = None,  # Injected by Depends(get_current_user)
    ) -> JWTPayload:
        if current_user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user_permissions = set(current_user.permissions)
        missing = set(required_permissions) - user_permissions

        if missing:
            logger.warning(
                "Permission access denied",
                extra={
                    "user_id": current_user.user_id,
                    "missing_permissions": list(missing),
                },
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing required permissions: {', '.join(missing)}",
            )

        return current_user

    return dependency


# =============================================================================
# JWT Token Creation (Testing/Internal Use)
# =============================================================================


def create_jwt(payload: Dict[str, Any]) -> str:
    """
    Create JWT token (for testing or internal service-to-service use).

    Args:
        payload: Token payload containing user_id, workspace_id, etc.

    Returns:
        str: Encoded JWT token

    Example:
        token = create_jwt({
            "user_id": "123e4567-e89b-12d3-a456-426614174000",
            "workspace_id": "123e4567-e89b-12d3-a456-426614174001",
            "email": "user@example.com",
            "role": "member",
            "iat": int(time.time()),
            "exp": int(time.time()) + 3600,  # 1 hour
        })
    """
    return jwt.encode(
        payload,
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )


# =============================================================================
# Utility Functions
# =============================================================================


def extract_user_id(token: str) -> str:
    """
    Extract user_id from JWT token.

    Args:
        token: JWT token string

    Returns:
        str: User ID from token payload

    Raises:
        HTTPException: If user_id not in token
    """
    payload = decode_jwt(token)
    user_id = payload.get("user_id") or payload.get("sub")

    if not user_id:
        logger.error("Token missing user_id")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing user_id",
        )

    return user_id


def extract_workspace_id(token: str) -> str:
    """
    Extract workspace_id from JWT token.

    Args:
        token: JWT token string

    Returns:
        str: Workspace ID from token payload

    Raises:
        HTTPException: If workspace_id not in token
    """
    payload = decode_jwt(token)
    workspace_id = payload.get("workspace_id")

    if not workspace_id:
        logger.error("Token missing workspace_id")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing workspace_id",
        )

    return workspace_id


# =============================================================================
# Module Exports
# =============================================================================

__all__ = [
    # Models
    "JWTPayload",
    # Core functions
    "decode_jwt",
    "decode_jwt_optional",
    # FastAPI dependencies
    "get_current_user",
    "get_optional_user",
    "get_workspace_id",
    "verify_workspace_access",
    "create_workspace_verifier",
    # Access control
    "require_role",
    "require_permission",
    # Utilities
    "create_jwt",
    "extract_user_id",
    "extract_workspace_id",
]
