"""
Correlation ID middleware for request tracing.

Generates unique correlation IDs for each request to enable distributed tracing
across microservices and log aggregation.
"""

import uuid
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from contextvars import ContextVar

# Context variable to store correlation ID for current request
correlation_id_var: ContextVar[str] = ContextVar("correlation_id", default="")


class CorrelationMiddleware(BaseHTTPMiddleware):
    """
    Middleware to generate or extract correlation IDs for request tracing.

    - Checks for existing X-Correlation-ID header
    - Generates new UUID if not present
    - Stores in context variable for access in logging
    - Adds to response headers
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        """
        Process request and add correlation ID.

        Args:
            request: Incoming request
            call_next: Next middleware/endpoint handler

        Returns:
            Response with X-Correlation-ID header
        """
        # Extract or generate correlation ID
        correlation_id = request.headers.get("X-Correlation-ID") or str(uuid.uuid4())

        # Store in context variable for logging
        correlation_id_var.set(correlation_id)

        # Process request
        response = await call_next(request)

        # Add correlation ID to response headers
        response.headers["X-Correlation-ID"] = correlation_id

        return response


def get_correlation_id() -> str:
    """
    Get correlation ID for current request.

    Returns:
        str: Correlation ID or empty string if not set
    """
    return correlation_id_var.get()
