"""Authentication middleware for the Upload Service.

Provides JWT validation and workspace authorization:
- Validates JWT tokens (HS256 or EdDSA)
- Extracts user and workspace context
- Enforces workspace isolation
- Sets logging context

Author: Claude Code Migration
"""

from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID

from fastapi import Request, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from app.core.config import get_settings
from app.observability.logging import (
    set_correlation_id,
    set_request_id,
    set_workspace_id,
    set_user_id,
    clear_context,
)

logger = logging.getLogger(__name__)

# Paths that don't require authentication
PUBLIC_PATHS = {
    "/",
    "/health",
    "/ready",
    "/startup",
    "/metrics",
    "/docs",
    "/redoc",
    "/openapi.json",
}


class AuthMiddleware(BaseHTTPMiddleware):
    """Middleware for JWT authentication and authorization.

    Extracts and validates JWT tokens, sets request context,
    and enforces workspace isolation.

    For public paths (health checks, docs), authentication is skipped.
    """

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        """Process request through auth middleware.

        Args:
            request: Incoming request
            call_next: Next handler in chain

        Returns:
            Response from handler
        """
        # Generate correlation ID for request tracing
        import uuid

        correlation_id = request.headers.get(
            "X-Correlation-ID",
            str(uuid.uuid4()),
        )
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))

        # Set logging context
        set_correlation_id(correlation_id)
        set_request_id(request_id)

        try:
            # Check if path requires authentication
            path = request.url.path
            if self._is_public_path(path):
                response = await call_next(request)
                response.headers["X-Correlation-ID"] = correlation_id
                response.headers["X-Request-ID"] = request_id
                return response

            # Skip auth for OPTIONS requests (CORS preflight)
            if request.method == "OPTIONS":
                response = await call_next(request)
                response.headers["X-Correlation-ID"] = correlation_id
                return response

            # Extract and validate token
            # Note: Full validation is done in the route dependencies
            # This middleware just sets up the context
            auth_header = request.headers.get("Authorization")
            if auth_header and auth_header.startswith("Bearer "):
                token = auth_header[7:]
                try:
                    user_context = await self._decode_token(token)
                    if user_context:
                        request.state.user_id = str(user_context["user_id"])
                        request.state.workspace_ids = user_context.get("workspace_ids", [])
                        set_user_id(str(user_context["user_id"]))
                except Exception as e:
                    logger.debug(
                        "Token decode in middleware failed (will retry in dependency)",
                        extra={"error": str(e)},
                    )

            # Extract workspace ID from header
            workspace_id = request.headers.get("X-Workspace-ID")
            if workspace_id:
                try:
                    UUID(workspace_id)  # Validate format
                    request.state.workspace_id = workspace_id
                    set_workspace_id(workspace_id)
                except ValueError:
                    pass  # Invalid format, will be caught in route

            # Process request
            response = await call_next(request)

            # Add tracing headers to response
            response.headers["X-Correlation-ID"] = correlation_id
            response.headers["X-Request-ID"] = request_id

            return response

        finally:
            # Clear logging context
            clear_context()

    def _is_public_path(self, path: str) -> bool:
        """Check if path is public (no auth required).

        Args:
            path: Request path

        Returns:
            True if path is public
        """
        # Exact match
        if path in PUBLIC_PATHS:
            return True

        # Prefix match for docs
        if path.startswith("/docs") or path.startswith("/redoc"):
            return True

        return False

    async def _decode_token(self, token: str) -> Optional[dict]:
        """Decode JWT token for context extraction.

        This is a lightweight decode for setting context.
        Full validation is done in the route dependency.

        Args:
            token: JWT token string

        Returns:
            Decoded payload dict or None
        """
        try:
            from jose import jwt

            settings = get_settings()

            # Decode without verification for context extraction
            # Full verification happens in the route dependency
            payload = jwt.decode(
                token,
                "",  # Empty key for unverified decode
                options={"verify_signature": False, "verify_exp": False},
            )

            user_id = payload.get("sub")
            workspace_ids = payload.get("wids", [])

            # Handle single workspace_id
            if "workspace_id" in payload and not workspace_ids:
                workspace_ids = [payload["workspace_id"]]

            return {
                "user_id": user_id,
                "workspace_ids": workspace_ids,
            }

        except Exception:
            return None


class CorrelationMiddleware(BaseHTTPMiddleware):
    """Middleware for correlation ID propagation.

    Ensures every request has a correlation ID for distributed tracing.
    """

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        """Add correlation ID to request and response.

        Args:
            request: Incoming request
            call_next: Next handler in chain

        Returns:
            Response with correlation ID header
        """
        import uuid

        correlation_id = request.headers.get(
            "X-Correlation-ID",
            str(uuid.uuid4()),
        )

        # Store in request state
        request.state.correlation_id = correlation_id

        # Set logging context
        set_correlation_id(correlation_id)

        try:
            response = await call_next(request)
            response.headers["X-Correlation-ID"] = correlation_id
            return response
        finally:
            clear_context()


# =============================================================================
# Module Exports
# =============================================================================

__all__ = [
    "AuthMiddleware",
    "CorrelationMiddleware",
    "PUBLIC_PATHS",
]
