"""Common schemas used across all endpoints.

Includes security response schemas per contracts/security-responses.yaml
"""

from typing import Optional, List
from pydantic import BaseModel, Field


class PaginationMeta(BaseModel):
    """Pagination metadata for list responses."""

    total: int = Field(..., description="Total number of items")
    page: int = Field(..., description="Current page number")
    limit: int = Field(..., description="Items per page")
    total_pages: int = Field(..., description="Total number of pages")


class ErrorDetail(BaseModel):
    """Detailed error information for a specific field."""

    field: str = Field(..., description="Field name that caused the error")
    message: str = Field(..., description="Error message for this field")


class ErrorResponse(BaseModel):
    """Standard error response format."""

    error: str = Field(..., description="Error code")
    message: str = Field(..., description="Human-readable error message")
    details: Optional[List[ErrorDetail]] = Field(None, description="Detailed field errors")


class SuccessResponse(BaseModel):
    """Standard success response for operations without data."""

    success: bool = Field(True, description="Operation success status")
    message: str = Field(..., description="Success message")


# =============================================================================
# Security Response Schemas (per contracts/security-responses.yaml)
# =============================================================================


class AuthenticationError(BaseModel):
    """Generic authentication error response.

    SECURITY: All JWT validation failures return this IDENTICAL response
    to prevent information disclosure about token structure or validation logic.

    DO NOT add additional error codes or details that could distinguish
    between different failure modes (expired, invalid signature, malformed, etc.)
    """

    error: str = Field(
        default="AUTHENTICATION_REQUIRED",
        description="Fixed error code for all auth failures",
    )
    message: str = Field(
        default="Invalid authentication token",
        description="Fixed generic message for all auth failures",
    )

    model_config = {"json_schema_extra": {"example": {
        "error": "AUTHENTICATION_REQUIRED",
        "message": "Invalid authentication token",
    }}}


class PermissionDeniedError(BaseModel):
    """Permission denied error when user lacks required permissions.

    Unlike auth errors, this CAN include the required permission to help
    users understand what access they need.
    """

    error: str = Field(
        default="INSUFFICIENT_PERMISSIONS",
        description="Error code for permission failures",
    )
    message: str = Field(
        default="Insufficient permissions to perform this action",
        description="Human-readable explanation",
    )
    required_permission: str = Field(
        ...,
        description="The permission that was required",
    )

    model_config = {"json_schema_extra": {"example": {
        "error": "INSUFFICIENT_PERMISSIONS",
        "message": "Insufficient permissions to perform this action",
        "required_permission": "clients:bulk_delete",
    }}}


class RateLimitError(BaseModel):
    """Rate limit exceeded response with retry information."""

    error: str = Field(
        default="RATE_LIMIT_EXCEEDED",
        description="Error code for rate limit exceeded",
    )
    message: str = Field(
        ...,
        description="Human-readable rate limit message",
    )
    retry_after: int = Field(
        ...,
        description="Seconds until rate limit resets",
    )

    model_config = {"json_schema_extra": {"example": {
        "error": "RATE_LIMIT_EXCEEDED",
        "message": "Rate limit exceeded. Max 100 requests per 60s.",
        "retry_after": 45,
    }}}


class ServiceUnavailableError(BaseModel):
    """Service unavailable error (rate limiting fail-closed).

    Returned when rate limiting cannot be enforced (e.g., Redis unavailable).
    This is a FAIL-CLOSED response to prevent security bypass.
    """

    error: str = Field(
        default="SERVICE_UNAVAILABLE",
        description="Error code for service unavailable",
    )
    message: str = Field(
        default="Service temporarily unavailable. Please try again shortly.",
        description="Fixed user-friendly message",
    )

    model_config = {"json_schema_extra": {"example": {
        "error": "SERVICE_UNAVAILABLE",
        "message": "Service temporarily unavailable. Please try again shortly.",
    }}}


class TimeoutError(BaseModel):
    """Request timeout error response."""

    error: str = Field(
        default="REQUEST_TIMEOUT",
        description="Error code for request timeout",
    )
    message: str = Field(
        default="Request timed out. Please try again with a smaller request or contact support if this persists.",
        description="Human-readable timeout message",
    )
    timeout_seconds: float = Field(
        ...,
        description="The timeout limit that was exceeded",
    )

    model_config = {"json_schema_extra": {"example": {
        "error": "REQUEST_TIMEOUT",
        "message": "Request timed out. Please try again with a smaller request or contact support if this persists.",
        "timeout_seconds": 30,
    }}}
