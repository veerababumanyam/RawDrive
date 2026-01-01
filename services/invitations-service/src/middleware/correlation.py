"""
Correlation ID middleware for request tracing.

Generates a unique correlation ID for each request and propagates it
through logs, responses, and background tasks.
"""

import uuid
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from src.logging import bind_correlation_id, clear_context, get_logger


logger = get_logger(__name__)

# Header name for correlation ID (supports multiple common formats)
CORRELATION_ID_HEADERS = [
    "X-Correlation-ID",
    "X-Request-ID",
    "X-Trace-ID",
]

# Response header name
RESPONSE_CORRELATION_HEADER = "X-Correlation-ID"


def generate_correlation_id() -> str:
    """Generate a new unique correlation ID."""
    return str(uuid.uuid4())


def extract_correlation_id(request: Request) -> str:
    """
    Extract correlation ID from request headers or generate a new one.

    Checks multiple common header names for compatibility with
    different tracing systems.

    Args:
        request: The incoming FastAPI request

    Returns:
        Correlation ID string
    """
    for header_name in CORRELATION_ID_HEADERS:
        correlation_id = request.headers.get(header_name)
        if correlation_id:
            return correlation_id

    return generate_correlation_id()


class CorrelationMiddleware(BaseHTTPMiddleware):
    """
    Middleware that manages correlation IDs for request tracing.

    For each request:
    1. Extracts or generates a correlation ID
    2. Binds it to the logging context
    3. Adds it to the response headers
    4. Cleans up the context after the request
    """

    async def dispatch(
        self,
        request: Request,
        call_next: Callable,
    ) -> Response:
        """Process the request with correlation ID tracking."""
        # Extract or generate correlation ID
        correlation_id = extract_correlation_id(request)

        # Store in request state for easy access
        request.state.correlation_id = correlation_id

        # Bind to logging context
        bind_correlation_id(correlation_id)

        try:
            # Log request start
            logger.info(
                "Request started",
                method=request.method,
                path=request.url.path,
                client_ip=request.client.host if request.client else None,
            )

            # Process request
            response = await call_next(request)

            # Add correlation ID to response headers
            response.headers[RESPONSE_CORRELATION_HEADER] = correlation_id

            # Log request completion
            logger.info(
                "Request completed",
                method=request.method,
                path=request.url.path,
                status_code=response.status_code,
            )

            return response

        except Exception as e:
            # Log error with correlation context
            logger.error(
                "Request failed",
                method=request.method,
                path=request.url.path,
                error=str(e),
                exc_info=True,
            )
            raise

        finally:
            # Clear context to prevent leakage between requests
            clear_context()


def get_correlation_id_from_request(request: Request) -> str:
    """
    Get the correlation ID from a request's state.

    Args:
        request: The FastAPI request object

    Returns:
        The correlation ID for this request
    """
    return getattr(request.state, "correlation_id", generate_correlation_id())
