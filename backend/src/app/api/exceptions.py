"""Global exception handlers for FastAPI application.

Implements standardized error response format per api_standards.json tech-spec.
Requirements: 27.1, 27.2, 27.3, 27.4, 27.5
Property 20: Error Response Consistency
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Callable

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Base exceptions for domain errors
# ---------------------------------------------------------------------------


class AppError(Exception):
    """Base application error with standard structure."""

    def __init__(
        self,
        message: str,
        code: str,
        status_code: int = 400,
        details: list[dict[str, Any]] | None = None,
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details


class NotFoundError(AppError):
    """Resource not found."""

    def __init__(self, resource: str, resource_id: Any = None):
        detail = f" with ID {resource_id}" if resource_id else ""
        super().__init__(
            message=f"{resource} not found{detail}",
            code=f"{resource.upper()}_NOT_FOUND",
            status_code=404,
        )


class ConflictError(AppError):
    """Resource conflict (duplicate, etc.)."""

    def __init__(self, message: str, code: str):
        super().__init__(message=message, code=code, status_code=409)


class ForbiddenError(AppError):
    """Permission denied."""

    def __init__(self, message: str = "Permission denied", code: str = "FORBIDDEN"):
        super().__init__(message=message, code=code, status_code=403)


class UnauthorizedError(AppError):
    """Authentication required or failed."""

    def __init__(self, message: str = "Authentication required", code: str = "AUTH_REQUIRED"):
        super().__init__(message=message, code=code, status_code=401)


class RateLimitError(AppError):
    """Rate limit exceeded."""

    def __init__(self, retry_after: int):
        super().__init__(
            message="Rate limit exceeded. Please retry later.",
            code="RATE_LIMIT_EXCEEDED",
            status_code=429,
        )
        self.retry_after = retry_after


class ValidationAppError(AppError):
    """Application validation error (not request validation)."""

    def __init__(self, message: str, field: str | None = None):
        details = [{"field": field, "message": message}] if field else None
        super().__init__(
            message=message,
            code="VALIDATION_ERROR",
            status_code=422,
            details=details,
        )


# ---------------------------------------------------------------------------
# Error response builder
# ---------------------------------------------------------------------------


def build_error_response(
    status_code: int,
    code: str,
    message: str,
    request: Request,
    details: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Build standardized error response.

    Per api_standards.json spec:
    {
      "error": {
        "code": "ERROR_CODE",
        "message": "Human readable message",
        "details": [...],  // optional
        "requestId": "req_xxx",
        "timestamp": "2024-12-17T10:30:00Z"
      }
    }
    """
    # Get request ID from middleware or generate
    request_id = getattr(request.state, "request_id", None)
    if not request_id:
        import uuid
        request_id = f"req_{uuid.uuid4().hex[:12]}"

    response = {
        "error": {
            "code": code,
            "message": message,
            "requestId": request_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    }

    if details:
        response["error"]["details"] = details

    return response


# ---------------------------------------------------------------------------
# Exception handlers
# ---------------------------------------------------------------------------


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    """Handle AppError and its subclasses."""
    response = build_error_response(
        status_code=exc.status_code,
        code=exc.code,
        message=exc.message,
        request=request,
        details=exc.details,
    )

    headers = {}
    if isinstance(exc, RateLimitError):
        headers["Retry-After"] = str(exc.retry_after)

    logger.warning(
        "Application error",
        extra={
            "code": exc.code,
            "status": exc.status_code,
            "message": exc.message,
            "request_id": response["error"]["requestId"],
        },
    )

    return JSONResponse(
        status_code=exc.status_code,
        content=response,
        headers=headers if headers else None,
    )


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Handle FastAPI/Starlette HTTPException."""
    # Extract code from detail if structured
    code = "HTTP_ERROR"
    message = str(exc.detail)

    if isinstance(exc.detail, dict):
        code = exc.detail.get("code", code)
        message = exc.detail.get("message", message)

    response = build_error_response(
        status_code=exc.status_code,
        code=code,
        message=message,
        request=request,
    )

    return JSONResponse(status_code=exc.status_code, content=response)


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Handle Pydantic validation errors from request body/params."""
    details = []
    for error in exc.errors():
        field = ".".join(str(loc) for loc in error["loc"][1:])  # Skip 'body'
        details.append({
            "field": field or None,
            "message": error["msg"],
        })

    response = build_error_response(
        status_code=422,
        code="VALIDATION_ERROR",
        message="Request validation failed",
        request=request,
        details=details,
    )

    return JSONResponse(status_code=422, content=response)


async def pydantic_validation_handler(request: Request, exc: ValidationError) -> JSONResponse:
    """Handle Pydantic ValidationError (internal validation)."""
    details = []
    for error in exc.errors():
        field = ".".join(str(loc) for loc in error["loc"])
        details.append({
            "field": field or None,
            "message": error["msg"],
        })

    response = build_error_response(
        status_code=422,
        code="VALIDATION_ERROR",
        message="Data validation failed",
        request=request,
        details=details,
    )

    return JSONResponse(status_code=422, content=response)


async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle unexpected exceptions."""
    request_id = getattr(request.state, "request_id", "unknown")

    logger.exception(
        "Unhandled exception",
        extra={"request_id": request_id, "exception_type": type(exc).__name__},
    )

    response = build_error_response(
        status_code=500,
        code="INTERNAL_ERROR",
        message="An unexpected error occurred",
        request=request,
    )

    return JSONResponse(status_code=500, content=response)


# ---------------------------------------------------------------------------
# Registration helper
# ---------------------------------------------------------------------------


def register_exception_handlers(app: FastAPI) -> None:
    """Register all exception handlers on the FastAPI app."""
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(ValidationError, pydantic_validation_handler)
    app.add_exception_handler(Exception, generic_exception_handler)
