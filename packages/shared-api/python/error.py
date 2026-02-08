"""
Standardized Error Response Types

Provides consistent error handling across all RawDrive microservices.
Based on RFC 7807 Problem Details for HTTP APIs with RawDrive extensions.
"""

from typing import List, Optional
from pydantic import BaseModel, Field


class ErrorDetail(BaseModel):
    """Detailed error information for a specific field (validation errors)."""

    field: Optional[str] = Field(
        None,
        description="Field path that caused the error (e.g., 'body.email', 'query.page')",
    )
    message: str = Field(..., description="Human-readable error message for this field")
    code: Optional[str] = Field(
        None, description="Optional error code for programmatic handling"
    )


class ErrorResponse(BaseModel):
    """
    Standard error response envelope.

    All microservices MUST return errors in this format for consistency.

    Example:
        {
            "status": 400,
            "code": "VALIDATION_ERROR",
            "message": "Request validation failed",
            "details": [
                {"field": "body.email", "message": "Invalid email format"}
            ],
            "request_id": "req_abc123"
        }
    """

    status: int = Field(..., description="HTTP status code (400, 401, 403, 404, 422, 500, etc.)")
    code: str = Field(..., description="Machine-readable error code for programmatic handling")
    message: str = Field(..., description="Human-readable error message")
    details: Optional[List[ErrorDetail]] = Field(
        None, description="Optional array of field-level error details"
    )
    request_id: Optional[str] = Field(
        None, description="Request correlation ID for tracing"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "status": 400,
                "code": "VALIDATION_ERROR",
                "message": "Request validation failed",
                "details": [{"field": "body.email", "message": "Invalid email format"}],
                "request_id": "req_abc123",
            }
        }


class ErrorCodes:
    """Standard error codes used across all microservices."""

    # Authentication errors (401)
    AUTHENTICATION_REQUIRED = "AUTHENTICATION_REQUIRED"
    INVALID_TOKEN = "INVALID_TOKEN"
    TOKEN_EXPIRED = "TOKEN_EXPIRED"

    # Authorization errors (403)
    INSUFFICIENT_PERMISSIONS = "INSUFFICIENT_PERMISSIONS"
    FORBIDDEN = "FORBIDDEN"
    WORKSPACE_ACCESS_DENIED = "WORKSPACE_ACCESS_DENIED"

    # Client errors (400)
    VALIDATION_ERROR = "VALIDATION_ERROR"
    BAD_REQUEST = "BAD_REQUEST"
    INVALID_INPUT = "INVALID_INPUT"

    # Not found errors (404)
    NOT_FOUND = "NOT_FOUND"
    RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND"

    # Conflict errors (409)
    CONFLICT = "CONFLICT"
    DUPLICATE_RESOURCE = "DUPLICATE_RESOURCE"

    # Rate limiting (429)
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED"

    # Server errors (500+)
    INTERNAL_ERROR = "INTERNAL_ERROR"
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"
    GATEWAY_TIMEOUT = "GATEWAY_TIMEOUT"


def create_error_response(
    status: int,
    code: str,
    message: str,
    details: Optional[List[ErrorDetail]] = None,
    request_id: Optional[str] = None,
) -> ErrorResponse:
    """
    Create a standardized error response.

    Args:
        status: HTTP status code
        code: Machine-readable error code
        message: Human-readable error message
        details: Optional list of field-level errors
        request_id: Optional request correlation ID

    Returns:
        Formatted ErrorResponse instance
    """
    return ErrorResponse(
        status=status,
        code=code,
        message=message,
        details=details,
        request_id=request_id,
    )
