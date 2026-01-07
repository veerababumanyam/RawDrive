"""
Correlation ID middleware for distributed request tracing.

Ensures every request has a unique correlation ID for:
- Distributed tracing across microservices
- Log aggregation and debugging (ELK, Loki)
- Performance monitoring and profiling
- Error correlation across service boundaries

The middleware:
1. Extracts X-Correlation-ID from incoming request headers (if present)
2. Generates a new UUID if no correlation ID is provided
3. Stores the ID in request state and logging context
4. Propagates the ID to response headers
5. Optionally generates a unique request ID for this specific request

Provides:
- CorrelationMiddleware: Starlette middleware for correlation ID handling
- get_correlation_id: Get current request's correlation ID
- set_correlation_id: Set correlation ID for current context
- get_request_id: Get unique ID for current request
- correlation_id_dependency: FastAPI dependency for route-level access
- propagate_correlation_headers: Helper for outbound HTTP requests

Feature: Notifications & Communication Microservice
Task: T033 - Create correlation ID middleware
"""

from __future__ import annotations

import logging
import uuid
from contextvars import ContextVar
from typing import Any, Callable, Dict, Optional

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from src.log_config import (
    set_correlation_id as set_log_correlation_id,
    set_request_id as set_log_request_id,
    correlation_id_ctx,
    request_id_ctx,
    clear_context,
)

logger = logging.getLogger(__name__)


# =============================================================================
# Constants
# =============================================================================

# Header names (standard and common alternatives)
CORRELATION_ID_HEADER = "X-Correlation-ID"
REQUEST_ID_HEADER = "X-Request-ID"
TRACE_ID_HEADER = "X-Trace-ID"  # Alternative header some services use

# Alternative header names to check (in priority order)
CORRELATION_HEADER_ALTERNATIVES = [
    "X-Correlation-ID",
    "X-Request-ID",
    "X-Trace-ID",
    "traceparent",  # W3C Trace Context
]


# =============================================================================
# Context Variables
# =============================================================================

# Local context variables (also stored in log_config for logging integration)
_correlation_id_var: ContextVar[Optional[str]] = ContextVar(
    "middleware_correlation_id", default=None
)
_request_id_var: ContextVar[Optional[str]] = ContextVar(
    "middleware_request_id", default=None
)


# =============================================================================
# Context Getters and Setters
# =============================================================================


def get_correlation_id() -> Optional[str]:
    """
    Get the correlation ID for the current request context.

    Returns:
        Optional[str]: The correlation ID or None if not set

    Example:
        correlation_id = get_correlation_id()
        if correlation_id:
            logger.info(f"Processing request {correlation_id}")
    """
    # Try local var first, then fall back to log_config var
    local_id = _correlation_id_var.get()
    if local_id:
        return local_id
    return correlation_id_ctx.get()


def set_correlation_id(correlation_id: str) -> None:
    """
    Set the correlation ID for the current request context.

    This sets the ID in both the middleware context and the logging context,
    ensuring it's available everywhere.

    Args:
        correlation_id: The correlation ID to set

    Example:
        set_correlation_id("abc-123-def-456")
    """
    _correlation_id_var.set(correlation_id)
    set_log_correlation_id(correlation_id)


def get_request_id() -> Optional[str]:
    """
    Get the unique request ID for the current request.

    The request ID is always unique per request, while the correlation ID
    may be shared across multiple requests in a distributed trace.

    Returns:
        Optional[str]: The request ID or None if not set
    """
    local_id = _request_id_var.get()
    if local_id:
        return local_id
    return request_id_ctx.get()


def set_request_id(request_id: str) -> None:
    """
    Set the unique request ID for the current request.

    Args:
        request_id: The request ID to set
    """
    _request_id_var.set(request_id)
    set_log_request_id(request_id)


def generate_id() -> str:
    """
    Generate a new unique ID for correlation/request tracking.

    Returns:
        str: A new UUID4 string
    """
    return str(uuid.uuid4())


# =============================================================================
# Correlation ID Middleware
# =============================================================================


class CorrelationMiddleware(BaseHTTPMiddleware):
    """
    Middleware for correlation ID handling and distributed tracing.

    This middleware ensures every request has a correlation ID for
    distributed tracing across services. It:

    1. Extracts correlation ID from incoming headers (multiple header names supported)
    2. Generates a new UUID if no correlation ID is provided
    3. Creates a unique request ID for this specific request
    4. Stores IDs in request state and logging context
    5. Adds IDs to response headers for client visibility

    Usage:
        from fastapi import FastAPI
        from src.middleware.correlation import CorrelationMiddleware

        app = FastAPI()
        app.add_middleware(CorrelationMiddleware)

    Configuration:
        generate_request_id: Whether to generate a separate request ID (default: True)
        propagate_to_response: Whether to add IDs to response headers (default: True)

    Attributes:
        generate_request_id: If True, generates unique request ID per request
        propagate_to_response: If True, adds correlation/request IDs to response headers
    """

    def __init__(
        self,
        app: ASGIApp,
        generate_request_id: bool = True,
        propagate_to_response: bool = True,
    ) -> None:
        """
        Initialize the correlation middleware.

        Args:
            app: The ASGI application
            generate_request_id: Generate unique request ID per request
            propagate_to_response: Add IDs to response headers
        """
        super().__init__(app)
        self.generate_request_id = generate_request_id
        self.propagate_to_response = propagate_to_response

    async def dispatch(
        self, request: Request, call_next: Callable
    ) -> Response:
        """
        Process request with correlation ID handling.

        Args:
            request: The incoming HTTP request
            call_next: The next middleware/handler in the chain

        Returns:
            Response: The HTTP response with correlation headers
        """
        # Extract or generate correlation ID
        correlation_id = self._extract_correlation_id(request)
        if not correlation_id:
            correlation_id = generate_id()

        # Set correlation ID in context
        set_correlation_id(correlation_id)

        # Generate and set request ID if enabled
        request_id = None
        if self.generate_request_id:
            request_id = generate_id()
            set_request_id(request_id)

        # Store in request state for easy access in routes
        request.state.correlation_id = correlation_id
        if request_id:
            request.state.request_id = request_id

        # Log request start (at debug level to avoid noise)
        logger.debug(
            "Request started",
            extra={
                "correlation_id": correlation_id,
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
            },
        )

        try:
            # Process the request
            response = await call_next(request)

            # Add correlation headers to response
            if self.propagate_to_response:
                response.headers[CORRELATION_ID_HEADER] = correlation_id
                if request_id:
                    response.headers[REQUEST_ID_HEADER] = request_id

            return response

        except Exception as e:
            # Log error with correlation context
            logger.error(
                f"Request failed: {e}",
                extra={
                    "correlation_id": correlation_id,
                    "request_id": request_id,
                    "error_type": type(e).__name__,
                },
                exc_info=True,
            )
            raise

        finally:
            # Clear context after request completes
            # Note: This may not work perfectly with background tasks
            # that continue after response is sent
            pass  # Don't clear - let log_config handle cleanup if needed

    def _extract_correlation_id(self, request: Request) -> Optional[str]:
        """
        Extract correlation ID from request headers.

        Checks multiple header names in priority order to support
        different tracing systems and conventions.

        Args:
            request: The incoming HTTP request

        Returns:
            Optional[str]: The correlation ID if found, None otherwise
        """
        for header_name in CORRELATION_HEADER_ALTERNATIVES:
            value = request.headers.get(header_name)
            if value:
                # Handle W3C traceparent format: version-trace_id-parent_id-flags
                if header_name == "traceparent" and "-" in value:
                    parts = value.split("-")
                    if len(parts) >= 2:
                        return parts[1]  # Extract trace_id
                return value

        return None


# =============================================================================
# FastAPI Dependencies
# =============================================================================


async def correlation_id_dependency(request: Request) -> str:
    """
    FastAPI dependency to get the correlation ID.

    Use this dependency in routes that need access to the correlation ID.
    The middleware must be installed for this to work properly.

    Usage:
        @router.get("/notifications")
        async def list_notifications(
            correlation_id: str = Depends(correlation_id_dependency)
        ):
            logger.info(f"Request {correlation_id}: listing notifications")
            ...

    Args:
        request: The FastAPI request object

    Returns:
        str: The correlation ID for this request
    """
    # Try to get from request state first (set by middleware)
    if hasattr(request.state, "correlation_id"):
        return request.state.correlation_id

    # Fall back to context variable
    correlation_id = get_correlation_id()
    if correlation_id:
        return correlation_id

    # Generate new ID if nothing is set (middleware not installed)
    new_id = generate_id()
    logger.warning(
        "Correlation ID not found in request state - generating new ID. "
        "Ensure CorrelationMiddleware is installed.",
        extra={"generated_id": new_id},
    )
    return new_id


async def request_id_dependency(request: Request) -> Optional[str]:
    """
    FastAPI dependency to get the request ID.

    Usage:
        @router.get("/status")
        async def get_status(
            request_id: Optional[str] = Depends(request_id_dependency)
        ):
            ...

    Args:
        request: The FastAPI request object

    Returns:
        Optional[str]: The request ID if available
    """
    if hasattr(request.state, "request_id"):
        return request.state.request_id
    return get_request_id()


# =============================================================================
# Helper Functions for Outbound Requests
# =============================================================================


def propagate_correlation_headers(
    headers: Optional[Dict[str, str]] = None,
    include_request_id: bool = False,
) -> Dict[str, str]:
    """
    Get headers for propagating correlation ID to outbound HTTP requests.

    Use this when making requests to other services to maintain
    distributed tracing context.

    Usage:
        import httpx

        async def call_external_service():
            headers = propagate_correlation_headers()
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    "https://other-service/api/data",
                    headers=headers,
                )
            return response

    Args:
        headers: Existing headers dict to merge with (optional)
        include_request_id: Whether to include X-Request-ID header

    Returns:
        Dict[str, str]: Headers dict with correlation ID
    """
    result = dict(headers) if headers else {}

    correlation_id = get_correlation_id()
    if correlation_id:
        result[CORRELATION_ID_HEADER] = correlation_id

    if include_request_id:
        request_id = get_request_id()
        if request_id:
            result[REQUEST_ID_HEADER] = request_id

    return result


def with_correlation(func: Callable) -> Callable:
    """
    Decorator to ensure correlation context is available in async functions.

    Useful for background tasks or functions that may run outside
    the request context.

    Usage:
        @with_correlation
        async def process_notification(notification_id: str):
            correlation_id = get_correlation_id()
            logger.info(f"Processing {notification_id} in request {correlation_id}")
            ...

    Args:
        func: The async function to wrap

    Returns:
        Wrapped function that preserves correlation context
    """
    import functools

    @functools.wraps(func)
    async def wrapper(*args: Any, **kwargs: Any) -> Any:
        # Capture current correlation ID before the call
        correlation_id = get_correlation_id()
        request_id = get_request_id()

        # Ensure context is set (may have been lost in task switching)
        if correlation_id:
            set_correlation_id(correlation_id)
        if request_id:
            set_request_id(request_id)

        return await func(*args, **kwargs)

    return wrapper


# =============================================================================
# Context Manager for Manual Correlation
# =============================================================================


class CorrelationContext:
    """
    Context manager for manually setting correlation context.

    Useful for background tasks, workers, or tests that need
    explicit correlation context.

    Usage:
        async def background_task():
            with CorrelationContext(correlation_id="task-123"):
                # All logs within this block will include correlation_id
                logger.info("Processing background task")
                await do_work()

    Args:
        correlation_id: The correlation ID to set (generated if not provided)
        request_id: Optional request ID to set
    """

    def __init__(
        self,
        correlation_id: Optional[str] = None,
        request_id: Optional[str] = None,
    ) -> None:
        self.correlation_id = correlation_id or generate_id()
        self.request_id = request_id
        self._prev_correlation_id: Optional[str] = None
        self._prev_request_id: Optional[str] = None

    def __enter__(self) -> "CorrelationContext":
        # Save previous values
        self._prev_correlation_id = get_correlation_id()
        self._prev_request_id = get_request_id()

        # Set new values
        set_correlation_id(self.correlation_id)
        if self.request_id:
            set_request_id(self.request_id)

        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        # Restore previous values
        if self._prev_correlation_id:
            set_correlation_id(self._prev_correlation_id)
        if self._prev_request_id:
            set_request_id(self._prev_request_id)

    async def __aenter__(self) -> "CorrelationContext":
        return self.__enter__()

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        self.__exit__(exc_type, exc_val, exc_tb)


# =============================================================================
# Module Exports
# =============================================================================

__all__ = [
    # Constants
    "CORRELATION_ID_HEADER",
    "REQUEST_ID_HEADER",
    "TRACE_ID_HEADER",
    # Middleware
    "CorrelationMiddleware",
    # Context functions
    "get_correlation_id",
    "set_correlation_id",
    "get_request_id",
    "set_request_id",
    "generate_id",
    # FastAPI dependencies
    "correlation_id_dependency",
    "request_id_dependency",
    # Helper functions
    "propagate_correlation_headers",
    "with_correlation",
    # Context manager
    "CorrelationContext",
]
