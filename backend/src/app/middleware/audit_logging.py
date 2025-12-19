"""Audit logging middleware for security event tracking.

Property 1: Audit Trail Completeness
ALL auth events (login, logout, token refresh, password changes)
must be logged to audit_logs table.
"""

import logging
import time
from typing import Callable, Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.middleware.request_id import get_request_id

logger = logging.getLogger(__name__)


# Routes that should be audit logged
AUDIT_ROUTES = {
    "/api/v1/auth/signup": "auth.signup",
    "/api/v1/auth/login": "auth.login",
    "/api/v1/auth/logout": "auth.logout",
    "/api/v1/auth/refresh": "auth.token_refresh",
    "/api/v1/auth/oauth/google/callback": "auth.oauth_callback",
    "/api/v1/auth/forgot-password": "auth.forgot_password",
    "/api/v1/auth/reset-password": "auth.reset_password",
    "/api/v1/auth/verify-email": "auth.verify_email",
}

# Additional patterns for security-sensitive routes
SECURITY_PATTERNS = [
    ("/api/v1/workspaces/", "workspace"),
    ("/api/v1/members/", "members"),
    ("/api/v1/roles/", "roles"),
    ("/api/v1/invitations/", "invitations"),
    ("/api/v1/admin/", "admin"),
]


def get_client_info(request: Request) -> dict:
    """Extract client information for audit logging."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
    elif request.client:
        client_ip = request.client.host
    else:
        client_ip = "unknown"

    return {
        "ip_address": client_ip,
        "user_agent": request.headers.get("User-Agent", "unknown"),
        "origin": request.headers.get("Origin"),
        "referer": request.headers.get("Referer"),
    }


class AuditLoggingMiddleware(BaseHTTPMiddleware):
    """Middleware that logs security-relevant API calls."""

    def __init__(self, app: Callable, audit_all: bool = False):
        super().__init__(app)
        self.audit_all = audit_all

    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        method = request.method

        # Check if this route should be audited
        event_type = self._get_event_type(path, method)

        if event_type is None and not self.audit_all:
            return await call_next(request)

        # Start timing
        start_time = time.time()
        request_id = get_request_id()
        client_info = get_client_info(request)

        # Log request start
        logger.info(
            "API request started",
            extra={
                "request_id": request_id,
                "event_type": event_type or "api.request",
                "method": method,
                "path": path,
                "client_ip": client_info["ip_address"],
                "user_agent": client_info["user_agent"],
            },
        )

        response: Response
        try:
            response = await call_next(request)
        except Exception as e:
            # Log failed request
            duration_ms = (time.time() - start_time) * 1000
            logger.error(
                "API request failed",
                extra={
                    "request_id": request_id,
                    "event_type": event_type or "api.error",
                    "method": method,
                    "path": path,
                    "error": str(e),
                    "duration_ms": duration_ms,
                    **client_info,
                },
            )
            raise

        # Log completed request
        duration_ms = (time.time() - start_time) * 1000
        status_code = response.status_code

        # Determine log level based on status
        if status_code >= 500:
            log_level = logging.ERROR
        elif status_code >= 400:
            log_level = logging.WARNING
        else:
            log_level = logging.INFO

        logger.log(
            log_level,
            "API request completed",
            extra={
                "request_id": request_id,
                "event_type": event_type or "api.response",
                "method": method,
                "path": path,
                "status_code": status_code,
                "duration_ms": duration_ms,
                **client_info,
            },
        )

        return response

    def _get_event_type(self, path: str, method: str) -> Optional[str]:
        """Determine audit event type for path."""
        # Check exact matches first
        if path in AUDIT_ROUTES:
            return AUDIT_ROUTES[path]

        # Check patterns for security-sensitive routes
        for prefix, category in SECURITY_PATTERNS:
            if path.startswith(prefix):
                action = self._method_to_action(method)
                return f"{category}.{action}"

        return None

    def _method_to_action(self, method: str) -> str:
        """Convert HTTP method to audit action."""
        return {
            "GET": "read",
            "POST": "create",
            "PUT": "update",
            "PATCH": "update",
            "DELETE": "delete",
        }.get(method, method.lower())
