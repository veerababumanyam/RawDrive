"""
Correlation ID middleware for distributed request tracing.

Feature: core-correlation-middleware

Generates and propagates correlation IDs across requests for distributed tracing.
Correlation IDs are distinct from request IDs - they track a logical operation
across multiple services, while request IDs are unique per HTTP request.

Supports multiple common header formats for compatibility with various tracing systems.
"""

import uuid
from contextvars import ContextVar
from typing import Callable, Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

# Context variable for correlation ID - provides thread-safe storage
correlation_id_ctx: ContextVar[str] = ContextVar("correlation_id", default="")

# Supported correlation ID headers (checked in order of priority)
# X-Correlation-ID is the preferred header, but we support others for compatibility
CORRELATION_ID_HEADERS = [
    "X-Correlation-ID",  # Primary - standard correlation ID header
    "X-Request-ID",      # Common alternative (e.g., AWS API Gateway)
    "X-Trace-ID",        # AWS X-Ray and similar systems
    "X-Amzn-Trace-Id",   # AWS-specific trace ID
]

# Response header name for correlation ID
RESPONSE_CORRELATION_HEADER = "X-Correlation-ID"


def generate_correlation_id() -> str:
    """
    Generate a new unique correlation ID.

    Returns:
        A UUID v4 string prefixed with 'corr-' for easy identification
    """
    return f"corr-{uuid.uuid4()}"


def get_correlation_id() -> str:
    """
    Get the current correlation ID from context.

    This function is safe to call from any async context and will return
    the correlation ID associated with the current request.

    Returns:
        The current correlation ID, or empty string if not set
    """
    return correlation_id_ctx.get()


def set_correlation_id(correlation_id: str) -> None:
    """
    Set the correlation ID in the current context.

    This is primarily used by the middleware, but can also be used
    when processing background tasks that should inherit a correlation ID.

    Args:
        correlation_id: The correlation ID to set
    """
    correlation_id_ctx.set(correlation_id)


class CorrelationMiddleware(BaseHTTPMiddleware):
    """
    Middleware that manages correlation IDs for distributed request tracing.

    For each incoming request:
    1. Extracts correlation ID from headers (checking multiple common formats)
    2. Generates a new correlation ID if none is provided
    3. Stores the correlation ID in a context variable for logging access
    4. Adds the correlation ID to the request state for handler access
    5. Adds the correlation ID to response headers for client tracking
    6. Cleans up the context after request completion

    The correlation ID will automatically be included in all log messages
    through the logging configuration's add_correlation_id processor.
    """

    def __init__(self, app: Callable, header_name: Optional[str] = None):
        """
        Initialize the correlation middleware.

        Args:
            app: The ASGI application to wrap
            header_name: Optional custom response header name (default: X-Correlation-ID)
        """
        super().__init__(app)
        self.response_header = header_name or RESPONSE_CORRELATION_HEADER

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """
        Process the request with correlation ID tracking.

        Args:
            request: The incoming HTTP request
            call_next: The next middleware/handler in the chain

        Returns:
            The HTTP response with correlation ID header added
        """
        # Extract correlation ID from headers or generate new one
        correlation_id = self._extract_correlation_id(request)

        # Store in context variable for logging and other services
        token = correlation_id_ctx.set(correlation_id)

        # Store in request state for easy access in route handlers
        request.state.correlation_id = correlation_id

        try:
            # Process the request
            response: Response = await call_next(request)

            # Add correlation ID to response headers
            response.headers[self.response_header] = correlation_id

            return response
        finally:
            # Reset context to prevent leakage between requests
            correlation_id_ctx.reset(token)

    def _extract_correlation_id(self, request: Request) -> str:
        """
        Extract correlation ID from request headers or generate new one.

        Checks multiple common header names for compatibility with
        different tracing systems and API gateways.

        Args:
            request: The incoming HTTP request

        Returns:
            Extracted or generated correlation ID
        """
        for header_name in CORRELATION_ID_HEADERS:
            correlation_id = request.headers.get(header_name)
            if correlation_id:
                # Validate and sanitize - ensure it's a reasonable length and format
                if len(correlation_id) <= 256 and correlation_id.isprintable():
                    return correlation_id

        # No valid correlation ID found, generate new one
        return generate_correlation_id()


def get_correlation_id_from_request(request: Request) -> str:
    """
    Get the correlation ID from a request's state.

    This is useful when you need the correlation ID in a route handler
    and want to ensure you get the same ID that was set by the middleware.

    Args:
        request: The FastAPI request object

    Returns:
        The correlation ID for this request, or a new one if not set
    """
    return getattr(request.state, "correlation_id", generate_correlation_id())
