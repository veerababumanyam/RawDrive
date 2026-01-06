"""
Correlation ID middleware for Sync Service.

Adds correlation ID to all requests for distributed tracing.
"""

import uuid
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from src.logging import get_logger

logger = get_logger(__name__)

CORRELATION_ID_HEADER = "X-Correlation-ID"
REQUEST_ID_HEADER = "X-Request-ID"


class CorrelationMiddleware(BaseHTTPMiddleware):
    """
    Middleware to add correlation and request IDs to all requests.

    If a correlation ID is provided in the request header, it is used.
    Otherwise, a new UUID is generated.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        """Process request with correlation ID."""
        # Get or generate correlation ID
        correlation_id = request.headers.get(CORRELATION_ID_HEADER)
        if not correlation_id:
            correlation_id = str(uuid.uuid4())

        # Generate request ID
        request_id = str(uuid.uuid4())

        # Store in request state for access in handlers
        request.state.correlation_id = correlation_id
        request.state.request_id = request_id

        # Process request
        response = await call_next(request)

        # Add headers to response
        response.headers[CORRELATION_ID_HEADER] = correlation_id
        response.headers[REQUEST_ID_HEADER] = request_id

        return response
