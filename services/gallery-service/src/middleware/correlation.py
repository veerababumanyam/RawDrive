"""
Correlation ID middleware for request tracing.

Ensures every request has a unique correlation ID for:
- Distributed tracing across services
- Log aggregation and debugging
- Performance monitoring
"""

from __future__ import annotations

import uuid
import contextvars
from typing import Optional

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

# Context variable to store correlation ID for the current request
correlation_id_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "correlation_id", default=None
)


def get_correlation_id() -> Optional[str]:
    """Get the current request's correlation ID."""
    return correlation_id_var.get()


def set_correlation_id(correlation_id: str) -> None:
    """Set the correlation ID for the current request."""
    correlation_id_var.set(correlation_id)


class CorrelationMiddleware(BaseHTTPMiddleware):
    """Middleware to track correlation IDs across requests."""

    async def dispatch(self, request: Request, call_next):
        # Get or generate correlation ID
        correlation_id = request.headers.get("X-Correlation-ID")
        if not correlation_id:
            correlation_id = str(uuid.uuid4())

        # Store in context
        set_correlation_id(correlation_id)

        # Store in request state for access in routes
        request.state.correlation_id = correlation_id

        # Process request
        response = await call_next(request)

        # Add correlation ID to response headers
        response.headers["X-Correlation-ID"] = correlation_id

        return response
