"""
Error handling helpers for consistent API responses.

Provides standardized error response formatting to eliminate duplicate
error handling code across API endpoints (~100 lines saved).

All error responses follow the standard format:
{
    "error": "ERROR_CODE",
    "message": "Human-readable error message"
}
"""

from fastapi import HTTPException, status
from typing import Optional, Dict, Any, List
from pydantic import BaseModel


class ErrorDetail(BaseModel):
    """Individual validation error detail."""

    field: str
    message: str


class ErrorResponse(BaseModel):
    """Standard error response format."""

    error: str
    message: str
    details: Optional[List[ErrorDetail]] = None


def not_found(
    entity_type: str,
    entity_id: Optional[str] = None,
    message: Optional[str] = None,
) -> HTTPException:
    """
    Create a 404 Not Found error.

    Args:
        entity_type: Type of entity (client, contact, address, etc.)
        entity_id: ID of the entity (optional)
        message: Custom error message (optional)

    Returns:
        HTTPException: 404 error with standard format

    Example:
        raise not_found("client", client_id)
        # Returns: {"error": "CLIENT_NOT_FOUND", "message": "Client {id} not found"}
    """
    error_code = f"{entity_type.upper()}_NOT_FOUND"

    if message is None:
        if entity_id:
            message = f"{entity_type.capitalize()} {entity_id} not found"
        else:
            message = f"{entity_type.capitalize()} not found"

    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=ErrorResponse(
            error=error_code,
            message=message,
        ).model_dump(),
    )


def validation_error(
    message: str,
    details: Optional[List[Dict[str, str]]] = None,
) -> HTTPException:
    """
    Create a 400 Validation Error.

    Args:
        message: Error message
        details: List of field-level validation errors (optional)

    Returns:
        HTTPException: 400 error with validation details

    Example:
        raise validation_error(
            "Invalid client data",
            [{"field": "email", "message": "Invalid email format"}]
        )
    """
    error_details = None
    if details:
        error_details = [ErrorDetail(**d) for d in details]

    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=ErrorResponse(
            error="VALIDATION_ERROR",
            message=message,
            details=error_details,
        ).model_dump(),
    )


def conflict_error(
    entity_type: str,
    message: Optional[str] = None,
) -> HTTPException:
    """
    Create a 409 Conflict error.

    Args:
        entity_type: Type of entity (client, contact, etc.)
        message: Custom error message (optional)

    Returns:
        HTTPException: 409 error

    Example:
        raise conflict_error("client", "Client with this email already exists")
    """
    error_code = f"{entity_type.upper()}_CONFLICT"

    if message is None:
        message = f"{entity_type.capitalize()} already exists"

    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=ErrorResponse(
            error=error_code,
            message=message,
        ).model_dump(),
    )


def forbidden_error(
    message: str = "You do not have permission to perform this action",
) -> HTTPException:
    """
    Create a 403 Forbidden error.

    Args:
        message: Error message

    Returns:
        HTTPException: 403 error

    Example:
        raise forbidden_error("Cannot delete client with active galleries")
    """
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=ErrorResponse(
            error="FORBIDDEN",
            message=message,
        ).model_dump(),
    )


def unauthorized_error(
    message: str = "Authentication required",
) -> HTTPException:
    """
    Create a 401 Unauthorized error.

    Args:
        message: Error message

    Returns:
        HTTPException: 401 error with WWW-Authenticate header

    Example:
        raise unauthorized_error("Invalid or expired token")
    """
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=ErrorResponse(
            error="UNAUTHORIZED",
            message=message,
        ).model_dump(),
        headers={"WWW-Authenticate": "Bearer"},
    )


def internal_error(
    message: str = "An internal error occurred",
    error_code: str = "INTERNAL_ERROR",
) -> HTTPException:
    """
    Create a 500 Internal Server Error.

    Args:
        message: Error message
        error_code: Custom error code (optional)

    Returns:
        HTTPException: 500 error

    Example:
        raise internal_error("Database connection failed", "DATABASE_ERROR")
    """
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=ErrorResponse(
            error=error_code,
            message=message,
        ).model_dump(),
    )


def rate_limit_error(
    message: str = "Too many requests. Please try again later.",
    retry_after: Optional[int] = None,
) -> HTTPException:
    """
    Create a 429 Too Many Requests error.

    Args:
        message: Error message
        retry_after: Seconds until retry is allowed (optional)

    Returns:
        HTTPException: 429 error with Retry-After header

    Example:
        raise rate_limit_error(retry_after=60)
    """
    headers = {}
    if retry_after:
        headers["Retry-After"] = str(retry_after)

    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=ErrorResponse(
            error="RATE_LIMIT_EXCEEDED",
            message=message,
        ).model_dump(),
        headers=headers if headers else None,
    )


def service_unavailable(
    message: str = "Service temporarily unavailable",
) -> HTTPException:
    """
    Create a 503 Service Unavailable error.

    Args:
        message: Error message

    Returns:
        HTTPException: 503 error

    Example:
        raise service_unavailable("Database maintenance in progress")
    """
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=ErrorResponse(
            error="SERVICE_UNAVAILABLE",
            message=message,
        ).model_dump(),
    )
