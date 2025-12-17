"""Request ID middleware for distributed tracing."""

import uuid
from contextvars import ContextVar

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

# Context variable for request ID
request_id_ctx: ContextVar[str] = ContextVar("request_id", default="")


def get_request_id() -> str:
    """Get current request ID from context."""
    return request_id_ctx.get()


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Middleware that adds a unique request ID to each request.

    - Uses X-Request-ID header if provided (for distributed tracing)
    - Generates a new UUID if not provided
    - Adds request ID to response headers
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        # Get or generate request ID
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))

        # Store in context for access by other code
        token = request_id_ctx.set(request_id)

        # Add to request state for easy access
        request.state.request_id = request_id

        try:
            response: Response = await call_next(request)
            response.headers["X-Request-ID"] = request_id
            return response
        finally:
            request_id_ctx.reset(token)
