"""
API dependencies for authentication and authorization.

Security: All authentication errors return generic messages to prevent
information leakage. Internal details are logged with correlation ID.
"""

from typing import Optional
from uuid import UUID
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt

from src.config import settings
from src.logging import get_logger

logger = get_logger(__name__)

# Generic error message for all auth failures (OWASP best practice)
AUTH_ERROR_MESSAGE = "Authentication failed"

# HTTP Bearer token security
security = HTTPBearer(auto_error=False)


@dataclass
class CurrentUser:
    """Authenticated user information."""
    user_id: UUID
    workspace_id: UUID
    email: str
    role: str


def _get_correlation_id(request: Request) -> Optional[str]:
    """Extract correlation ID from request state if available."""
    return getattr(request.state, "correlation_id", None)


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> CurrentUser:
    """
    Extract and validate the current user from the JWT token.

    The token can be provided either:
    - In the Authorization header as Bearer token
    - In the X-User-ID header (for internal service calls)

    For internal service-to-service communication, we trust headers
    set by the API gateway.

    Security: All error responses use a generic message. Internal details
    are logged with correlation_id for debugging without exposing to clients.
    """
    correlation_id = _get_correlation_id(request)

    # Check for internal service call (trusted headers from API gateway)
    user_id = request.headers.get("X-User-ID")
    workspace_id = request.headers.get("X-Workspace-ID")
    email = request.headers.get("X-User-Email", "")
    role = request.headers.get("X-User-Role", "member")

    if user_id and workspace_id:
        try:
            return CurrentUser(
                user_id=UUID(user_id),
                workspace_id=UUID(workspace_id),
                email=email,
                role=role,
            )
        except ValueError:
            # Log internal details with correlation ID
            logger.warning(
                "auth_header_invalid_uuid",
                correlation_id=correlation_id,
                error_type="invalid_uuid_format",
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=AUTH_ERROR_MESSAGE,
            )

    # Check for JWT token
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        # Decode and validate JWT
        payload = jwt.decode(
            credentials.credentials,
            settings.JWT_SECRET,
            algorithms=["HS256"],
        )

        return CurrentUser(
            user_id=UUID(payload["sub"]),
            workspace_id=UUID(payload["workspace_id"]),
            email=payload.get("email", ""),
            role=payload.get("role", "member"),
        )

    except jwt.ExpiredSignatureError:
        # Log internal details with correlation ID, return generic message
        logger.info(
            "auth_token_expired",
            correlation_id=correlation_id,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=AUTH_ERROR_MESSAGE,
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError as e:
        # Log internal details with correlation ID, return generic message
        logger.warning(
            "auth_token_invalid",
            correlation_id=correlation_id,
            error_type=type(e).__name__,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=AUTH_ERROR_MESSAGE,
            headers={"WWW-Authenticate": "Bearer"},
        )
    except (KeyError, ValueError) as e:
        # Log internal details with correlation ID, return generic message
        logger.warning(
            "auth_token_payload_invalid",
            correlation_id=correlation_id,
            error_type=type(e).__name__,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=AUTH_ERROR_MESSAGE,
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_optional_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[CurrentUser]:
    """
    Optionally extract current user, returning None if not authenticated.

    Useful for endpoints that work differently for authenticated vs public access.
    """
    try:
        return await get_current_user(request, credentials)
    except HTTPException:
        return None
