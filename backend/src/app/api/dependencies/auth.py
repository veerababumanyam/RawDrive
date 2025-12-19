"""Authentication dependencies for FastAPI.

Provides dependency injection for:
- Current authenticated user
- RBAC permission checks
- Optional authentication
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import Annotated, Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.db.postgres import get_postgres_pool
from app.services.rbac_service import RBACService
from app.services.session_service import SessionService
from app.utils.security import decode_token

logger = logging.getLogger(__name__)

# Bearer token extractor
bearer_scheme = HTTPBearer(auto_error=False)


@dataclass
class CurrentUser:
    """Authenticated user context."""

    user_id: uuid.UUID
    email: str
    session_id: uuid.UUID | None  # None for access tokens, UUID for refresh tokens
    workspace_ids: list[uuid.UUID]
    permissions: list[str]  # For current workspace context


@dataclass
class AuthContext:
    """Full authentication context including workspace."""

    user: CurrentUser
    workspace_id: uuid.UUID | None
    permissions: list[str]


class AuthError(HTTPException):
    """Authentication error."""

    def __init__(self, detail: str = "Authentication required"):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            headers={"WWW-Authenticate": "Bearer"},
        )


class PermissionError(HTTPException):
    """Authorization/permission error."""

    def __init__(self, detail: str = "Insufficient permissions"):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detail,
        )


async def get_current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> CurrentUser:
    """Extract and validate current user from JWT token.

    Raises:
        AuthError: If token is missing, invalid, or session invalidated
    """
    if credentials is None:
        raise AuthError("Missing authentication token")

    token = credentials.credentials

    # Decode and validate token
    try:
        payload = decode_token(token)
    except ValueError as e:
        logger.warning("Token validation failed", extra={"error": str(e)})
        raise AuthError("Invalid or expired token")

    # Extract claims
    try:
        user_id = uuid.UUID(payload["sub"])
        # session_id might be in "sid" or "session_id" field (only in refresh tokens)
        session_id_str = payload.get("sid") or payload.get("session_id")
        session_id = uuid.UUID(session_id_str) if session_id_str else None
        email = payload.get("email", "")
        # workspace_ids might be in "wids" (list) or "workspace_id" (single)
        if "wids" in payload:
            workspace_ids = [uuid.UUID(w) for w in payload["wids"]]
        elif "workspace_id" in payload:
            workspace_ids = [uuid.UUID(payload["workspace_id"])]
        else:
            workspace_ids = []
        # permissions might be "perms" or "permissions"
        permissions = payload.get("perms") or payload.get("permissions", [])
    except (KeyError, ValueError) as e:
        logger.warning("Invalid token claims", extra={"error": str(e), "payload_keys": list(payload.keys())})
        raise AuthError("Invalid token claims")

    # Verify session is still valid (only if session_id is present)
    # Access tokens don't have session_id, refresh tokens do
    if session_id:
        session_service = SessionService()
        session = await session_service.get_session(session_id)
        if session is None or session.user_id != user_id:
            raise AuthError("Session expired or invalidated")
    else:
        # For access tokens without session_id, we rely on token expiry
        # Session validation happens during refresh token usage
        pass

    # Store user_id in request state for rate limiting
    request.state.user_id = str(user_id)

    return CurrentUser(
        user_id=user_id,
        email=email,
        session_id=session_id,
        workspace_ids=workspace_ids,
        permissions=permissions,
    )


async def get_current_user_optional(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    request: Request,
) -> CurrentUser | None:
    """Get current user if authenticated, None otherwise.

    Use for endpoints that work with or without authentication.
    """
    if credentials is None:
        return None

    try:
        return await get_current_user(request, credentials)
    except AuthError:
        return None


def require_permissions(*required_perms: str, require_all: bool = True):
    """Factory for permission-checking dependencies.

    Args:
        required_perms: Permission strings required
        require_all: If True, all permissions required; if False, any one

    Returns:
        FastAPI dependency that checks permissions

    Example:
        @router.post("/galleries")
        async def create_gallery(
            user: Annotated[CurrentUser, Depends(require_permissions("galleries:write"))]
        ):
            ...
    """

    async def check_permissions(
        user: Annotated[CurrentUser, Depends(get_current_user)],
        request: Request,
    ) -> CurrentUser:
        # Get workspace_id from path or header
        workspace_id = _extract_workspace_id(request)

        if workspace_id is None:
            # For non-workspace routes, check if user has any of the perms in their token
            token_perms = set(user.permissions)
            if require_all:
                if not all(p in token_perms for p in required_perms):
                    raise PermissionError(f"Missing required permissions: {required_perms}")
            else:
                if not any(p in token_perms for p in required_perms):
                    raise PermissionError(f"Requires one of: {required_perms}")
            return user

        # Check workspace-scoped permissions
        rbac = RBACService()
        result = await rbac.check_permission(
            user_id=user.user_id,
            workspace_id=workspace_id,
            required_permissions=list(required_perms),
            require_all=require_all,
        )

        if not result.allowed:
            logger.warning(
                "Permission denied",
                extra={
                    "user_id": str(user.user_id),
                    "workspace_id": str(workspace_id),
                    "required": required_perms,
                    "missing": result.missing_permissions,
                },
            )
            raise PermissionError(f"Missing permissions: {result.missing_permissions}")

        return user

    return check_permissions


def require_platform_permission(required_perm: str):
    """Factory for platform-level permission checks.

    Use for admin/platform endpoints.
    """

    async def check_platform_permission(
        user: Annotated[CurrentUser, Depends(get_current_user)],
    ) -> CurrentUser:
        rbac = RBACService()
        allowed = await rbac.check_platform_permission(user.user_id, required_perm)

        if not allowed:
            logger.warning(
                "Platform permission denied",
                extra={
                    "user_id": str(user.user_id),
                    "required": required_perm,
                },
            )
            raise PermissionError(f"Platform permission required: {required_perm}")

        return user

    return check_platform_permission


def _extract_workspace_id(request: Request) -> uuid.UUID | None:
    """Extract workspace_id from request path or header."""
    # Try path parameter
    path_params = request.path_params
    if "workspace_id" in path_params:
        try:
            return uuid.UUID(path_params["workspace_id"])
        except ValueError:
            pass

    # Try header
    header = request.headers.get("X-Workspace-ID")
    if header:
        try:
            return uuid.UUID(header)
        except ValueError:
            pass

    return None


def PermissionCheckerDep(required_permissions: list[str], require_all: bool = True):
    """Factory for permission checker dependency.
    
    Example:
        @router.get("/roles")
        async def list_roles(
            _: None = Depends(PermissionCheckerDep(["roles:read"])),
        ):
            ...
    """
    
    async def check_permissions(
        request: Request,
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    ) -> None:
        """Check if user has required permissions."""
        # Get current user
        user = await get_current_user(request, credentials)
        
        workspace_id = _extract_workspace_id(request)
        
        if workspace_id is None:
            # For non-workspace routes, check token permissions
            token_perms = set(user.permissions)
            if require_all:
                if not all(p in token_perms for p in required_permissions):
                    raise PermissionError(f"Missing required permissions: {required_permissions}")
            else:
                if not any(p in token_perms for p in required_permissions):
                    raise PermissionError(f"Requires one of: {required_permissions}")
            return
        
        # Check workspace-scoped permissions
        rbac = RBACService()
        result = await rbac.check_permission(
            user_id=user.user_id,
            workspace_id=workspace_id,
            required_permissions=required_permissions,
            require_all=require_all,
        )
        
        if not result.allowed:
            logger.warning(
                "Permission denied",
                extra={
                    "user_id": str(user.user_id),
                    "workspace_id": str(workspace_id),
                    "required": required_permissions,
                    "missing": result.missing_permissions,
                },
            )
            raise PermissionError(f"Missing permissions: {result.missing_permissions}")
    
    return check_permissions


# Common dependencies (defined after class uses them in type hints with Depends)
CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]
OptionalUserDep = Annotated[Optional[CurrentUser], Depends(get_current_user_optional)]


async def require_workspace_access(
    user: CurrentUserDep,
    request: Request,
) -> tuple[CurrentUser, uuid.UUID]:
    """Require that user has access to a workspace (any role).

    Returns tuple of (user, workspace_id).
    """
    workspace_id = _extract_workspace_id(request)

    if workspace_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Workspace ID required",
        )

    # Check if user is a member of the workspace
    pool = await get_postgres_pool()
    row = await pool.fetchrow(
        """
        SELECT membership_id FROM workspace_memberships
        WHERE user_id = $1 AND workspace_id = $2 AND status = 'active'
        """,
        user.user_id,
        workspace_id,
    )

    if row is None:
        raise PermissionError("Not a member of this workspace")

    return user, workspace_id


async def get_workspace_id_from_access(
    workspace_access: Annotated[tuple[CurrentUser, uuid.UUID], Depends(require_workspace_access)],
) -> uuid.UUID:
    """Extract workspace_id from workspace access tuple."""
    _, workspace_id = workspace_access
    return workspace_id


WorkspaceAccessDep = Annotated[tuple[CurrentUser, uuid.UUID], Depends(require_workspace_access)]
WorkspaceIdDep = Annotated[uuid.UUID, Depends(get_workspace_id_from_access)]
