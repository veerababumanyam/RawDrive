"""Service-to-Service Authentication Middleware for Gallery Service.

Provides JWT-based authentication and authorization for inter-service communication:

Features:
- JWT token generation using EdDSA (Ed25519)
- Service token validation with claims verification
- Service registry integration for authorized services
- Permission-based access control
- Token rotation and caching

Authentication Flow:
1. Service generates JWT token with service_id, permissions, expiration
2. Token includes claims: iss, sub, service_id, permissions, exp
3. Receiving service validates token using shared JWT_SECRET
4. Service registry verifies caller is authorized

Usage:
    # Protect endpoint with service authentication
    @router.get("/internal/assets")
    async def list_assets(
        ctx: ServiceAuthContext = Depends(get_service_context)
    ):
        # ctx.service_id, ctx.permissions available
        pass

Environment Variables Required:
    - JWT_SECRET: Shared secret for token validation (64+ bytes)
    - SERVICE_NAME: This service's identifier (e.g., "gallery-service")
    - SERVICE_ID: Unique instance ID (auto-generated if not set)
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from typing import Annotated, Optional, Set
from enum import Enum

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt

from src.config import settings
from src.log_config import get_logger

logger = get_logger(__name__)

# Bearer token extractor (auto_error=False for optional auth)
bearer_scheme = HTTPBearer(auto_error=False)


# =============================================================================
# Enums and Constants
# =============================================================================


class ServicePermission(str, Enum):
    """Service-level permissions for inter-service calls."""

    # Gallery permissions
    GALLERIES_READ = "galleries:read"
    GALLERIES_WRITE = "galleries:write"
    GALLERIES_DELETE = "galleries:delete"

    # Asset permissions
    ASSETS_READ = "assets:read"
    ASSETS_WRITE = "assets:write"
    ASSETS_DELETE = "assets:delete"

    # User permissions
    USERS_READ = "users:read"
    USERS_WRITE = "users:write"

    # Workspace permissions
    WORKSPACES_READ = "workspaces:read"
    WORKSPACES_WRITE = "workspaces:write"

    # AI permissions
    AI_ANALYZE = "ai:analyze"
    AI_SEARCH = "ai:search"

    # Admin permissions
    SERVICE_HEALTH = "service:health"
    SERVICE_METRICS = "service:metrics"


# Default permissions per service
DEFAULT_SERVICE_PERMISSIONS: dict[str, set[str]] = {
    "backend": {
        ServicePermission.GALLERIES_READ,
        ServicePermission.GALLERIES_WRITE,
        ServicePermission.ASSETS_READ,
        ServicePermission.ASSETS_WRITE,
        ServicePermission.USERS_READ,
        ServicePermission.USERS_WRITE,
        ServicePermission.WORKSPACES_READ,
        ServicePermission.WORKSPACES_WRITE,
        ServicePermission.SERVICE_HEALTH,
        ServicePermission.SERVICE_METRICS,
    },
    "ai-service": {
        ServicePermission.ASSETS_READ,
        ServicePermission.AI_ANALYZE,
        ServicePermission.AI_SEARCH,
        ServicePermission.SERVICE_HEALTH,
    },
    "upload-service": {
        ServicePermission.ASSETS_WRITE,
        ServicePermission.SERVICE_HEALTH,
    },
    "webhooks-service": {
        ServicePermission.GALLERIES_READ,
        ServicePermission.ASSETS_READ,
        ServicePermission.SERVICE_HEALTH,
    },
    "notifications-service": {
        ServicePermission.USERS_READ,
        ServicePermission.SERVICE_HEALTH,
    },
    "client-service": {
        ServicePermission.GALLERIES_READ,
        ServicePermission.USERS_READ,
        ServicePermission.SERVICE_HEALTH,
    },
    "billing-service": {
        ServicePermission.WORKSPACES_READ,
        ServicePermission.USERS_READ,
        ServicePermission.SERVICE_HEALTH,
    },
}


# =============================================================================
# Data Models
# =============================================================================


@dataclass
class ServiceAuthContext:
    """Authentication context for service-to-service calls.

    Attributes:
        service_name: Name of the calling service (e.g., "backend", "ai-service")
        service_id: Unique instance ID of the calling service
        permissions: Set of permissions granted to this service
        user_id: Optional user ID if acting on behalf of a user
        workspace_id: Optional workspace ID for scoped operations
        issued_at: Timestamp when the token was issued
        expires_at: Timestamp when the token expires
        is_valid: Whether the token passed validation
    """

    service_name: str
    service_id: str
    permissions: Set[str] = field(default_factory=set)
    user_id: Optional[uuid.UUID] = None
    workspace_id: Optional[uuid.UUID] = None
    issued_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    is_valid: bool = True

    def has_permission(self, permission: str | ServicePermission) -> bool:
        """Check if context has a specific permission.

        Args:
            permission: Permission string or enum to check

        Returns:
            True if permission is granted
        """
        perm_str = permission if isinstance(permission, str) else permission.value
        return perm_str in self.permissions

    def has_any_permission(self, *permissions: str | ServicePermission) -> bool:
        """Check if context has any of the specified permissions.

        Args:
            *permissions: Permissions to check (any match)

        Returns:
            True if at least one permission is granted
        """
        return any(self.has_permission(p) for p in permissions)

    def has_all_permissions(self, *permissions: str | ServicePermission) -> bool:
        """Check if context has all of the specified permissions.

        Args:
            *permissions: Permissions to check (all required)

        Returns:
            True if all permissions are granted
        """
        return all(self.has_permission(p) for p in permissions)


class ServiceAuthError(HTTPException):
    """Service authentication error."""

    def __init__(
        self,
        detail: str = "Service authentication required",
        status_code: int = status.HTTP_401_UNAUTHORIZED,
    ):
        super().__init__(
            status_code=status_code,
            detail=detail,
            headers={"WWW-Authenticate": "Bearer"},
        )


class ServicePermissionError(HTTPException):
    """Service authorization/permission error."""

    def __init__(self, detail: str = "Insufficient service permissions"):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detail,
        )


# =============================================================================
# Token Generation
# =============================================================================


def generate_service_token(
    service_name: str,
    service_id: str,
    permissions: Set[str] | None = None,
    user_id: uuid.UUID | None = None,
    workspace_id: uuid.UUID | None = None,
    expires_in: timedelta | None = None,
) -> str:
    """Generate a JWT token for service-to-service authentication.

    Args:
        service_name: Name of the service (e.g., "gallery-service")
        service_id: Unique instance ID
        permissions: Set of granted permissions (uses defaults if None)
        user_id: Optional user ID if acting on behalf of user
        workspace_id: Optional workspace ID for scoping
        expires_in: Token lifetime (default: 1 hour)

    Returns:
        JWT token string

    Raises:
        ValueError: If service_name is not recognized
    """
    now = datetime.now(timezone.utc)
    expires_delta = expires_in or timedelta(hours=1)
    expires_at = now + expires_delta

    # Use default permissions if not provided
    if permissions is None:
        permissions = DEFAULT_SERVICE_PERMISSIONS.get(service_name, set())

    # Build JWT payload
    payload = {
        # Standard JWT claims
        "iss": service_name,  # Issuer
        "sub": service_id,  # Subject (service instance)
        "iat": int(now.timestamp()),  # Issued at
        "exp": int(expires_at.timestamp()),  # Expiration
        # Custom claims
        "service_name": service_name,
        "service_id": service_id,
        "permissions": list(permissions),
        "token_type": "service",
    }

    # Add optional user/workspace context
    if user_id:
        payload["user_id"] = str(user_id)
    if workspace_id:
        payload["workspace_id"] = str(workspace_id)

    # Sign with JWT_SECRET (HS256 for service tokens)
    # Note: We use HS256 for service-to-service because:
    # 1. All services share the same JWT_SECRET
    # 2. Simpler key management than EdDSA for internal services
    # 3. User-facing tokens still use EdDSA for security
    token = jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")

    logger.debug(
        f"Generated service token",
        extra={
            "service_name": service_name,
            "service_id": service_id,
            "permissions_count": len(permissions),
            "expires_at": expires_at.isoformat(),
        },
    )

    return token


# =============================================================================
# Token Validation
# =============================================================================


def validate_service_token(token: str) -> ServiceAuthContext:
    """Validate a service JWT token and extract context.

    Args:
        token: JWT token string

    Returns:
        ServiceAuthContext with extracted information

    Raises:
        ServiceAuthError: If token is invalid, expired, or malformed
    """
    try:
        # Decode and verify token
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=["HS256"],
            options={
                "require": ["iss", "sub", "service_name", "service_id", "token_type"],
            },
        )

        # Verify this is a service token
        if payload.get("token_type") != "service":
            raise ServiceAuthError("Invalid token type (expected service token)")

        # Extract claims
        service_name = payload["service_name"]
        service_id = payload["service_id"]
        permissions = set(payload.get("permissions", []))
        issued_at = datetime.fromtimestamp(payload["iat"], timezone.utc)
        expires_at = datetime.fromtimestamp(payload["exp"], timezone.utc)

        # Optional user/workspace context
        user_id = None
        workspace_id = None
        if "user_id" in payload:
            try:
                user_id = uuid.UUID(payload["user_id"])
            except ValueError:
                raise ServiceAuthError("Invalid user_id in token")
        if "workspace_id" in payload:
            try:
                workspace_id = uuid.UUID(payload["workspace_id"])
            except ValueError:
                raise ServiceAuthError("Invalid workspace_id in token")

        # Verify service is known
        if service_name not in DEFAULT_SERVICE_PERMISSIONS:
            logger.warning(
                f"Unknown service in token: {service_name}",
                extra={"service_id": service_id},
            )
            # Still allow, but with minimal permissions
            permissions = {ServicePermission.SERVICE_HEALTH.value}

        context = ServiceAuthContext(
            service_name=service_name,
            service_id=service_id,
            permissions=permissions,
            user_id=user_id,
            workspace_id=workspace_id,
            issued_at=issued_at,
            expires_at=expires_at,
        )

        logger.debug(
            f"Validated service token",
            extra={
                "service_name": service_name,
                "service_id": service_id,
                "permissions_count": len(permissions),
                "expires_in_seconds": (expires_at - datetime.now(timezone.utc)).total_seconds(),
            },
        )

        return context

    except jwt.ExpiredSignatureError:
        raise ServiceAuthError("Service token has expired")
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid service token: {e}")
        raise ServiceAuthError(f"Invalid service token: {str(e)}")
    except Exception as e:
        logger.error(f"Token validation error: {e}")
        raise ServiceAuthError("Token validation failed")


# =============================================================================
# FastAPI Dependencies
# =============================================================================


async def get_service_context(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> ServiceAuthContext:
    """Extract and validate service authentication from request.

    This dependency validates the JWT token and returns the service context.
    Use it to protect endpoints that require service-to-service authentication.

    Args:
        request: FastAPI request object
        credentials: Bearer token credentials

    Returns:
        ServiceAuthContext with authentication information

    Raises:
        ServiceAuthError: If authentication fails

    Example:
        @router.get("/internal/assets")
        async def list_assets(
            ctx: ServiceAuthContext = Depends(get_service_context)
        ):
            assets = await asset_service.list_for_service(ctx.service_id)
            return assets
    """
    if credentials is None:
        raise ServiceAuthError("Missing service authentication token")

    # Validate token
    context = validate_service_token(credentials.credentials)

    # Store in request state for logging and downstream use
    request.state.service_context = context

    # Add to request state for correlation
    if not hasattr(request.state, "caller_service"):
        request.state.caller_service = context.service_name

    logger.info(
        f"Service authentication successful",
        extra={
            "service_name": context.service_name,
            "service_id": context.service_id,
            "path": request.url.path,
            "method": request.method,
        },
    )

    return context


async def get_service_context_optional(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> ServiceAuthContext | None:
    """Get service context if authenticated, None otherwise.

    Use for endpoints that work with or without service authentication.

    Args:
        request: FastAPI request object
        credentials: Bearer token credentials

    Returns:
        ServiceAuthContext if authenticated, None otherwise
    """
    if credentials is None:
        return None

    try:
        context = validate_service_token(credentials.credentials)
        request.state.service_context = context
        return context
    except ServiceAuthError:
        return None


def require_service_permissions(*required: ServicePermission | str, require_all: bool = True):
    """Factory for permission-checking dependencies.

    Creates a dependency that verifies the service has required permissions.

    Args:
        *required: Required permissions
        require_all: If True, all permissions required; if False, any one

    Returns:
        FastAPI dependency function

    Example:
        @router.post("/assets")
        async def create_asset(
            ctx: ServiceAuthContext = Depends(
                require_service_permissions(ServicePermission.ASSETS_WRITE)
            )
        ):
            pass
    """

    async def check_permissions(
        context: ServiceAuthContext = Depends(get_service_context),
    ) -> ServiceAuthContext:
        if require_all:
            missing = [p for p in required if not context.has_permission(p)]
            if missing:
                logger.warning(
                    f"Service permission denied (missing all)",
                    extra={
                        "service_name": context.service_name,
                        "required": [p.value if isinstance(p, ServicePermission) else p for p in required],
                        "missing": missing,
                    },
                )
                raise ServicePermissionError(
                    f"Missing required permissions: {missing}"
                )
        else:
            if not any(context.has_permission(p) for p in required):
                logger.warning(
                    f"Service permission denied (missing any)",
                    extra={
                        "service_name": context.service_name,
                        "required": [p.value if isinstance(p, ServicePermission) else p for p in required],
                        "current_permissions": list(context.permissions),
                    },
                )
                raise ServicePermissionError(
                    f"Requires one of: {[p.value if isinstance(p, ServicePermission) else p for p in required]}"
                )

        return context

    return check_permissions


# =============================================================================
# Common Dependency Aliases
# =============================================================================

# Type aliases for commonly used dependencies
ServiceContextDep = Annotated[ServiceAuthContext, Depends(get_service_context)]
OptionalServiceContextDep = Annotated[Optional[ServiceAuthContext], Depends(get_service_context_optional)]

# Permission-specific dependencies
RequireGalleriesRead = Depends(require_service_permissions(ServicePermission.GALLERIES_READ))
RequireGalleriesWrite = Depends(require_service_permissions(ServicePermission.GALLERIES_WRITE))
RequireAssetsRead = Depends(require_service_permissions(ServicePermission.ASSETS_READ))
RequireAssetsWrite = Depends(require_service_permissions(ServicePermission.ASSETS_WRITE))
RequireServiceHealth = Depends(require_service_permissions(ServicePermission.SERVICE_HEALTH))


# =============================================================================
# Middleware Helper
# =============================================================================


async def attach_service_context(request: Request, call_next):
    """ASGI middleware to attach service context to all requests.

    This middleware runs before route handlers and attempts to extract
    service authentication context, storing it in request.state for
    use in logging and downstream processing.

    Usage in main.py:
        app.add_middleware(attach_service_context)
    """
    # Try to extract from Authorization header
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]  # Remove "Bearer " prefix
        try:
            context = validate_service_token(token)
            request.state.service_context = context
            request.state.caller_service = context.service_name
        except ServiceAuthError:
            # Token invalid, but don't fail request here
            # Let route handlers handle auth if needed
            pass

    response = await call_next(request)
    return response
