"""Error boundary middleware for Face Detection API routes.

This module provides error handling middleware specifically for face detection
endpoints. It catches all errors, logs them appropriately, and returns
user-friendly responses.

Key features:
- Catches FaceDetectionError and returns structured responses
- Handles unexpected errors with generic user messages
- Generates correlation IDs for request tracing
- Logs errors with appropriate severity levels
- Provides async handler wrapper for route handlers

Usage:
    # In your FastAPI app setup
    from app.middleware.face_error_handler import face_detection_exception_handler
    
    app.add_exception_handler(FaceDetectionError, face_detection_exception_handler)
    
    # Or use the async_handler decorator on routes
    @router.get("/faces/{face_id}")
    @async_handler
    async def get_face(face_id: UUID, ...):
        ...
"""

from __future__ import annotations

import logging
import uuid
from functools import wraps
from typing import Any, Awaitable, Callable, TypeVar

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.face_schemas import FaceDetectionErrorCode
from app.services.face_exceptions import FaceDetectionError


# Configure logger for face detection errors
logger = logging.getLogger("face_detection")


# Type variable for generic async handler
T = TypeVar("T")


# =============================================================================
# CORRELATION ID UTILITIES
# =============================================================================


def generate_correlation_id() -> str:
    """Generate a unique correlation ID for request tracing.
    
    Returns:
        A UUID string for correlating logs across services
    """
    return str(uuid.uuid4())


def get_correlation_id(request: Request) -> str:
    """Extract or generate correlation ID from request.
    
    Checks for existing correlation ID in headers, generates new one if missing.
    
    Args:
        request: The incoming FastAPI request
        
    Returns:
        Correlation ID string
    """
    # Check common correlation ID headers
    correlation_id = (
        request.headers.get("x-correlation-id")
        or request.headers.get("x-request-id")
        or request.headers.get("request-id")
    )
    
    if not correlation_id:
        correlation_id = generate_correlation_id()
        
    return correlation_id


# =============================================================================
# EXCEPTION HANDLER FOR FASTAPI
# =============================================================================


async def face_detection_exception_handler(
    request: Request, 
    exc: FaceDetectionError
) -> JSONResponse:
    """FastAPI exception handler for FaceDetectionError.
    
    This handler is registered with FastAPI to catch all FaceDetectionError
    exceptions and return appropriate JSON responses.
    
    Args:
        request: The incoming request that caused the error
        exc: The FaceDetectionError that was raised
        
    Returns:
        JSONResponse with error details
    """
    # Get or generate correlation ID
    correlation_id = exc.correlation_id or get_correlation_id(request)
    
    # Extract user context for logging (if available)
    user_id = getattr(request.state, "user_id", None)
    workspace_id = getattr(request.state, "workspace_id", None)
    
    # Determine log level based on HTTP status
    log_level = logging.ERROR if exc.http_status >= 500 else logging.WARNING
    
    # Log the error with context
    logger.log(
        log_level,
        "Face detection error: %s",
        exc.message,
        extra={
            "error_code": exc.code.value,
            "http_status": exc.http_status,
            "correlation_id": correlation_id,
            "user_id": str(user_id) if user_id else None,
            "workspace_id": str(workspace_id) if workspace_id else None,
            "path": request.url.path,
            "method": request.method,
            "details": exc.details,
        },
        exc_info=exc.http_status >= 500,  # Include stack trace for 5xx errors
    )
    
    # Build response body
    response_body: dict[str, Any] = {
        "success": False,
        "error": {
            "code": exc.code.value,
            "message": exc.user_message,
            "correlation_id": correlation_id,
        },
    }
    
    return JSONResponse(
        status_code=exc.http_status,
        content=response_body,
    )


async def generic_exception_handler(
    request: Request, 
    exc: Exception
) -> JSONResponse:
    """Handler for unexpected exceptions in face detection routes.
    
    Catches any exception that isn't a FaceDetectionError and returns
    a generic error response while logging full details.
    
    Args:
        request: The incoming request
        exc: The unexpected exception
        
    Returns:
        JSONResponse with generic error message
    """
    correlation_id = get_correlation_id(request)
    
    # Extract user context for logging
    user_id = getattr(request.state, "user_id", None)
    workspace_id = getattr(request.state, "workspace_id", None)
    
    # Log full error details (never exposed to user)
    logger.error(
        "Unexpected error in face detection: %s",
        str(exc),
        extra={
            "error_type": type(exc).__name__,
            "correlation_id": correlation_id,
            "user_id": str(user_id) if user_id else None,
            "workspace_id": str(workspace_id) if workspace_id else None,
            "path": request.url.path,
            "method": request.method,
        },
        exc_info=True,  # Always include stack trace for unexpected errors
    )
    
    # Return generic error message (never expose internal details)
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "An unexpected error occurred. Please try again or contact support.",
                "correlation_id": correlation_id,
            },
        },
    )


# =============================================================================
# ASYNC HANDLER DECORATOR
# =============================================================================


def async_handler(
    func: Callable[..., Awaitable[T]]
) -> Callable[..., Awaitable[T]]:
    """Decorator that wraps async route handlers with error handling.
    
    This decorator catches exceptions from route handlers and ensures
    they are properly converted to FaceDetectionError or handled as
    unexpected errors.
    
    Usage:
        @router.get("/faces/{face_id}")
        @async_handler
        async def get_face(face_id: UUID, request: Request):
            # Your handler code here
            ...
    
    Args:
        func: The async route handler function
        
    Returns:
        Wrapped function with error handling
    """
    @wraps(func)
    async def wrapper(*args: Any, **kwargs: Any) -> T:
        try:
            return await func(*args, **kwargs)
        except FaceDetectionError:
            # Re-raise FaceDetectionError to be handled by exception handler
            raise
        except Exception as exc:
            # Log unexpected error and re-raise
            # The generic_exception_handler will catch this
            logger.error(
                "Unhandled exception in %s: %s",
                func.__name__,
                str(exc),
                exc_info=True,
            )
            raise
    
    return wrapper


# =============================================================================
# MIDDLEWARE CLASS (ALTERNATIVE APPROACH)
# =============================================================================


class FaceDetectionErrorMiddleware(BaseHTTPMiddleware):
    """Middleware for handling face detection errors.
    
    This middleware can be used as an alternative to exception handlers
    for catching errors in face detection routes.
    
    Usage:
        app.add_middleware(FaceDetectionErrorMiddleware, path_prefix="/api/v1/faces")
    """
    
    def __init__(self, app: Any, path_prefix: str = "/api/v1/faces") -> None:
        """Initialize the middleware.
        
        Args:
            app: The FastAPI application
            path_prefix: URL prefix for face detection routes
        """
        super().__init__(app)
        self.path_prefix = path_prefix
    
    async def dispatch(
        self, 
        request: Request, 
        call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        """Process the request and handle face detection errors.
        
        Args:
            request: The incoming request
            call_next: The next middleware/handler in the chain
            
        Returns:
            Response from handler or error response
        """
        # Only handle requests to face detection routes
        if not request.url.path.startswith(self.path_prefix):
            return await call_next(request)
        
        # Add correlation ID to request state
        correlation_id = get_correlation_id(request)
        request.state.correlation_id = correlation_id
        
        try:
            response = await call_next(request)
            return response
            
        except FaceDetectionError as exc:
            # Set correlation ID if not already set
            if not exc.correlation_id:
                exc.correlation_id = correlation_id
            return await face_detection_exception_handler(request, exc)
            
        except Exception as exc:
            return await generic_exception_handler(request, exc)


# =============================================================================
# ERROR RESPONSE HELPERS
# =============================================================================


def create_error_response(
    code: FaceDetectionErrorCode,
    message: str,
    http_status: int,
    correlation_id: Optional[str] = None,
    details: Optional[list[dict[str, str]]] = None,
) -> JSONResponse:
    """Create a standardized error response.
    
    Helper function for creating error responses outside of exception handlers.
    
    Args:
        code: Error code enum value
        message: User-friendly error message
        http_status: HTTP status code
        correlation_id: Optional correlation ID
        details: Optional list of field-level error details
        
    Returns:
        JSONResponse with error body
    """
    body: dict[str, Any] = {
        "success": False,
        "error": {
            "code": code.value,
            "message": message,
        },
    }
    
    if correlation_id:
        body["error"]["correlation_id"] = correlation_id
        
    if details:
        body["error"]["details"] = details
    
    return JSONResponse(status_code=http_status, content=body)


def create_validation_error_response(
    field_errors: list[tuple[str, str]],
    correlation_id: Optional[str] = None,
) -> JSONResponse:
    """Create a validation error response.
    
    Helper for creating responses when request validation fails.
    
    Args:
        field_errors: List of (field_name, error_message) tuples
        correlation_id: Optional correlation ID
        
    Returns:
        JSONResponse with validation error details
    """
    details = [{"field": field, "message": msg} for field, msg in field_errors]
    
    return create_error_response(
        code=FaceDetectionErrorCode.INVALID_IMAGE_FORMAT,  # Generic validation code
        message="Request validation failed. Please check the input and try again.",
        http_status=422,
        correlation_id=correlation_id,
        details=details,
    )


# =============================================================================
# SETUP HELPER
# =============================================================================


def setup_face_detection_error_handlers(app: Any) -> None:
    """Register face detection error handlers with FastAPI app.
    
    Call this function during app initialization to set up all
    face detection error handlers.
    
    Args:
        app: The FastAPI application instance
        
    Example:
        from fastapi import FastAPI
        from app.middleware.face_error_handler import setup_face_detection_error_handlers
        
        app = FastAPI()
        setup_face_detection_error_handlers(app)
    """
    from app.services.face_exceptions import FaceDetectionError
    
    # Register exception handler for FaceDetectionError
    app.add_exception_handler(FaceDetectionError, face_detection_exception_handler)
    
    logger.info("Face detection error handlers registered")
