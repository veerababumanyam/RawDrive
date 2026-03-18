"""A2A Authentication Middleware for Service-to-Service Communication.

Provides authentication and authorization for:
- Service-to-service calls (JWT tokens)
- External agent API keys
- Workspace isolation enforcement
- Permission validation

Phase 4: Google A2A ADKS Integration
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt

from app.db.postgres import get_postgres_pool
from app.utils.security import decode_token

logger = logging.getLogger(__name__)

# Bearer token extractor
bearer_scheme = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


@dataclass
class A2AContext:
    """Authentication context for A2A calls."""

    # Caller identity
    service_name: str  # "backend", "gallery-service", "ai-service", etc.
    service_id: str  # Unique service instance ID

    # User context (from JWT)
    user_id: uuid.UUID | None
    workspace_id: uuid.UUID | None
    permissions: list[str]

    # API key context (for external agents)
    api_key_id: uuid.UUID | None = None
    api_key_scopes: list[str] | None = None

    # Rate limiting
    rate_limit_rpm: int = 100  # Requests per minute (matches DB column default)

    # Request metadata
    request_id: str | None = None
    source_ip: str | None = None

    @property
    def is_service_call(self) -> bool:
        """Check if this is a service-to-service call (vs. external agent)."""
        return self.api_key_id is None

    @property
    def is_agent_call(self) -> bool:
        """Check if this is an external agent call (API key)."""
        return self.api_key_id is not None

    @property
    def effective_permissions(self) -> list[str]:
        """Get effective permissions (JWT or API key scopes)."""
        if self.is_agent_call and self.api_key_scopes:
            return self.api_key_scopes
        return self.permissions


class A2AAuthError(HTTPException):
    """A2A authentication error."""

    def __init__(self, detail: str = "A2A authentication required"):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            headers={"WWW-Authenticate": "Bearer"},
        )


class A2APermissionError(HTTPException):
    """A2A authorization/permission error."""

    def __init__(self, detail: str = "Insufficient A2A permissions"):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detail,
        )


# ---------------------------------------------------------------------------
# JWT Token Validation (Service-to-Service)
# ---------------------------------------------------------------------------


async def validate_service_jwt(token: str) -> A2AContext:
    """Validate JWT token from another service.

    Expected JWT claims:
    - sub: user_id (UUID)
    - user_id: user_id (UUID)
    - workspace_id: workspace_id (UUID)
    - permissions: list of permission strings
    - iss: "rawdrive-backend" or service name
    - service_name: calling service name (e.g., "gallery-service")
    - service_id: unique service instance ID

    Raises:
        A2AAuthError: If token is invalid or missing required claims
    """
    try:
        payload = decode_token(token)
    except (ValueError, jwt.exceptions.ExpiredSignatureError, jwt.exceptions.InvalidTokenError) as e:
        logger.warning("A2A JWT validation failed", extra={"error": str(e)})
        raise A2AAuthError("Invalid or expired A2A token")

    # Extract required claims
    try:
        user_id_str = payload.get("sub") or payload.get("user_id")
        workspace_id_str = payload.get("workspace_id")
        permissions = payload.get("permissions") or payload.get("perms", [])
        service_name = payload.get("service_name") or payload.get("iss", "unknown")
        service_id = payload.get("service_id", "unknown")

        # Convert to UUIDs
        user_id = uuid.UUID(user_id_str) if user_id_str else None
        workspace_id = uuid.UUID(workspace_id_str) if workspace_id_str else None

    except (KeyError, ValueError, TypeError) as e:
        logger.warning(
            "Invalid A2A JWT claims",
            extra={"error": str(e), "payload_keys": list(payload.keys())},
        )
        raise A2AAuthError("Invalid A2A token claims")

    return A2AContext(
        service_name=service_name,
        service_id=service_id,
        user_id=user_id,
        workspace_id=workspace_id,
        permissions=permissions,
    )


# ---------------------------------------------------------------------------
# API Key Validation (External Agents)
# ---------------------------------------------------------------------------


async def validate_api_key(api_key: str) -> A2AContext:
    """Validate API key from external agent.

    API key format: rawdrive_sk_<workspace_id>_<random_32_chars>

    Looks up key in database and returns context with:
    - workspace_id from key
    - scopes from key configuration
    - rate limiting info

    Raises:
        A2AAuthError: If API key is invalid, expired, or revoked
    """
    # Parse API key format
    if not api_key.startswith("rawdrive_sk_"):
        raise A2AAuthError("Invalid API key format")

    parts = api_key.split("_")
    if len(parts) != 4:
        raise A2AAuthError("Invalid API key format")

    try:
        workspace_id = uuid.UUID(parts[2])
    except ValueError:
        raise A2AAuthError("Invalid workspace ID in API key")

    # Compute SHA-256 hash of incoming key (matches hash stored on creation)
    incoming_hash = hashlib.sha256(api_key.encode()).hexdigest()

    # Query database for active keys in this workspace
    pool = await get_postgres_pool()
    rows = await pool.fetch(
        """
        SELECT
            key_id,
            key_hash,
            workspace_id,
            scopes,
            rate_limit_rpm,
            expires_at,
            last_used_at,
            is_active
        FROM agent_api_keys
        WHERE workspace_id = $1 AND is_active = TRUE
        """,
        workspace_id,
    )

    # Find matching key using timing-safe comparison
    row = None
    for candidate in rows:
        if hmac.compare_digest(incoming_hash, candidate["key_hash"]):
            row = candidate
            break

    if row is None:
        logger.warning("API key not found", extra={"workspace_id": str(workspace_id)})
        raise A2AAuthError("Invalid API key")

    # Check expiration
    if row["expires_at"] and row["expires_at"] < datetime.now(timezone.utc):
        logger.warning("API key expired", extra={"key_id": str(row["key_id"])})
        raise A2AAuthError("API key expired")

    # Update last_used_at (fire and forget)
    await pool.execute(
        """
        UPDATE agent_api_keys
        SET last_used_at = $1
        WHERE key_id = $2
        """,
        datetime.now(timezone.utc),
        row["key_id"],
    )

    return A2AContext(
        service_name="external-agent",
        service_id=str(row["key_id"]),
        user_id=None,  # Agents don't have user context
        workspace_id=workspace_id,
        permissions=[],  # Agents use scopes, not permissions
        api_key_id=row["key_id"],
        api_key_scopes=row["scopes"],
        rate_limit_rpm=row["rate_limit_rpm"],
    )


# ---------------------------------------------------------------------------
# Main Authentication Dependency
# ---------------------------------------------------------------------------


async def get_a2a_context(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> A2AContext:
    """Extract and validate A2A authentication context.

    Supports two authentication methods:
    1. JWT token (service-to-service calls)
    2. API key (external agents)

    Raises:
        A2AAuthError: If authentication fails
    """
    if credentials is None:
        raise A2AAuthError("Missing A2A authentication token")

    token = credentials.credentials

    # Try API key first (starts with "rawdrive_sk_")
    if token.startswith("rawdrive_sk_"):
        context = await validate_api_key(token)
    else:
        # Assume JWT token
        context = await validate_service_jwt(token)

    # Add request metadata
    context.request_id = request.headers.get("X-Request-ID")
    context.source_ip = request.client.host if request.client else None

    # Store context in request state for logging
    request.state.a2a_context = context

    logger.info(
        "A2A authentication successful",
        extra={
            "service_name": context.service_name,
            "workspace_id": str(context.workspace_id) if context.workspace_id else None,
            "is_agent_call": context.is_agent_call,
            "request_id": context.request_id,
        },
    )

    return context


async def get_a2a_context_optional(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> A2AContext | None:
    """Get A2A context if authenticated, None otherwise.

    Use for endpoints that work with or without A2A authentication.
    """
    if credentials is None:
        return None

    try:
        return await get_a2a_context(request, credentials)
    except A2AAuthError:
        return None


# ---------------------------------------------------------------------------
# Permission Enforcement
# ---------------------------------------------------------------------------


def require_a2a_permissions(*required_perms: str, require_all: bool = True):
    """Factory for A2A permission-checking dependencies.

    Checks permissions for service-to-service calls or scopes for API keys.

    Args:
        required_perms: Permission strings or scopes required
        require_all: If True, all permissions required; if False, any one

    Returns:
        FastAPI dependency that checks permissions

    Example:
        @router.post("/galleries")
        async def create_gallery(
            context: Annotated[A2AContext, Depends(require_a2a_permissions("galleries:write"))]
        ):
            ...
    """

    async def check_permissions(
        context: Annotated[A2AContext, Depends(get_a2a_context)],
    ) -> A2AContext:
        effective_perms = set(context.effective_permissions)

        if require_all:
            missing = [p for p in required_perms if p not in effective_perms]
            if missing:
                logger.warning(
                    "A2A permission denied",
                    extra={
                        "service_name": context.service_name,
                        "workspace_id": str(context.workspace_id) if context.workspace_id else None,
                        "required": required_perms,
                        "missing": missing,
                        "is_agent_call": context.is_agent_call,
                    },
                )
                raise A2APermissionError(f"Missing required permissions: {missing}")
        else:
            if not any(p in effective_perms for p in required_perms):
                logger.warning(
                    "A2A permission denied",
                    extra={
                        "service_name": context.service_name,
                        "workspace_id": str(context.workspace_id) if context.workspace_id else None,
                        "required": required_perms,
                        "is_agent_call": context.is_agent_call,
                    },
                )
                raise A2APermissionError(f"Requires one of: {required_perms}")

        return context

    return check_permissions


async def require_a2a_workspace_access(
    context: Annotated[A2AContext, Depends(get_a2a_context)],
    request: Request,
) -> tuple[A2AContext, uuid.UUID]:
    """Require that A2A caller has access to a workspace.

    Validates:
    - workspace_id is provided in JWT/API key
    - workspace_id matches path parameter (if present)
    - For API keys, workspace_id must match the key's workspace

    Returns tuple of (context, workspace_id).
    """
    if context.workspace_id is None:
        raise A2AAuthError("Workspace ID required in A2A token")

    # Extract workspace_id from path parameter
    path_workspace_id = request.path_params.get("workspace_id")
    if path_workspace_id:
        try:
            path_workspace_uuid = uuid.UUID(path_workspace_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid workspace ID in path",
            )

        # Ensure workspace_id matches
        if context.workspace_id != path_workspace_uuid:
            logger.warning(
                "Workspace ID mismatch in A2A call",
                extra={
                    "token_workspace_id": str(context.workspace_id),
                    "path_workspace_id": str(path_workspace_uuid),
                    "service_name": context.service_name,
                },
            )
            raise A2APermissionError("Workspace ID mismatch")

    return context, context.workspace_id


# ---------------------------------------------------------------------------
# Common Dependencies
# ---------------------------------------------------------------------------

A2AContextDep = Annotated[A2AContext, Depends(get_a2a_context)]
OptionalA2AContextDep = Annotated[Optional[A2AContext], Depends(get_a2a_context_optional)]
A2AWorkspaceAccessDep = Annotated[tuple[A2AContext, uuid.UUID], Depends(require_a2a_workspace_access)]


# ---------------------------------------------------------------------------
# Rate Limiting Helper
# ---------------------------------------------------------------------------


async def check_a2a_rate_limit(context: A2AContext, endpoint: str) -> None:
    """Check rate limit for A2A calls.

    For API keys, enforces rate_limit_rpm from database via Redis sliding window.
    For service-to-service calls, bypasses rate limiting entirely (trusted).

    Raises:
        HTTPException: 429 with Retry-After header if rate limit exceeded
            and mode is "enforcing"
    """
    if not context.is_agent_call:
        # Service-to-service calls: no rate limiting (trusted)
        return

    from app.services.rate_limit_service import (
        RateLimitConfig,
        RateLimitService,
        RateLimitType,
    )
    from app.config.settings import get_settings

    config = RateLimitConfig(
        requests=context.rate_limit_rpm,
        window_seconds=60,
    )
    service = RateLimitService()
    result = await service.check_rate_limit(
        identifier=f"a2a:{context.api_key_id}",
        limit_type=RateLimitType.A2A,
        custom_config=config,
    )

    if not result.allowed:
        settings = get_settings()
        if settings.a2a_rate_limit_mode == "log_only":
            logger.warning(
                "A2A rate limit would block request",
                extra={
                    "api_key_id": str(context.api_key_id),
                    "workspace_id": str(context.workspace_id),
                    "endpoint": endpoint,
                    "rate_limit_rpm": context.rate_limit_rpm,
                    "retry_after": result.retry_after,
                    "would_block": True,
                },
            )
            return
        raise HTTPException(
            status_code=429,
            detail={
                "error": "rate_limit_exceeded",
                "retry_after": result.retry_after,
            },
            headers={"Retry-After": str(result.retry_after)},
        )
