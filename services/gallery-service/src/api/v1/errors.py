"""
Unified Error Response System for Gallery Service.

Provides standard error codes, messages, and response formatting across all API endpoints.
Ensures consistent error handling with proper HTTP status codes, request tracking, and
detailed error context for clients.

Error Response Format:
{
  "error": {
    "code": "GALLERY_NOT_FOUND",
    "message": "Gallery not found",
    "details": {},
    "request_id": "uuid",
    "timestamp": "iso8601"
  }
}
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional, Dict

from fastapi import HTTPException, Request, status
from pydantic import BaseModel, Field


# =============================================================================
# Error Response Schemas
# =============================================================================


class ErrorDetail(BaseModel):
    """Detailed error information wrapper."""

    code: str = Field(..., description="Unique error code for programmatic handling")
    message: str = Field(..., description="Human-readable error message")
    details: Optional[Dict[str, Any]] = Field(
        default_factory=dict,
        description="Additional error context (validation errors, resource IDs, etc.)"
    )
    request_id: str = Field(
        ...,
        description="Unique request identifier for tracing and support"
    )
    timestamp: str = Field(
        ...,
        description="ISO 8601 timestamp when the error occurred"
    )


class ErrorResponse(BaseModel):
    """Standard error response wrapper."""

    error: ErrorDetail

    class Config:
        json_schema_extra = {
            "example": {
                "error": {
                    "code": "GALLERY_NOT_FOUND",
                    "message": "Gallery with ID '123e4567-e89b-12d3-a456-426614174000' not found",
                    "details": {
                        "gallery_id": "123e4567-e89b-12d3-a456-426614174000",
                        "workspace_id": "987fcdeb-51a2-43f1-a456-426614174000"
                    },
                    "request_id": "550e8400-e29b-41d4-a716-446655440000",
                    "timestamp": "2026-02-08T12:34:56.789Z"
                }
            }
        }


# =============================================================================
# Error Code Constants
# =============================================================================


class ErrorCode:
    """Standard error codes for the gallery service."""

    # Gallery Errors (4xx)
    GALLERY_NOT_FOUND = "GALLERY_NOT_FOUND"
    GALLERY_EMPTY = "GALLERY_EMPTY"
    GALLERY_ALREADY_EXISTS = "GALLERY_ALREADY_EXISTS"
    GALLERY_INVALID_STATUS = "GALLERY_INVALID_STATUS"
    GALLERY_PUBLISH_FAILED = "GALLERY_PUBLISH_FAILED"

    # Sub-Gallery Errors
    SUB_GALLERY_NOT_FOUND = "SUB_GALLERY_NOT_FOUND"
    SUB_GALLERY_INVALID_PARENT = "SUB_GALLERY_INVALID_PARENT"
    SUB_GALLERY_MAX_DEPTH = "SUB_GALLERY_MAX_DEPTH"
    SUB_GALLERY_INVALID_SORT = "SUB_GALLERY_INVALID_SORT"

    # Asset Errors
    ASSET_NOT_FOUND = "ASSET_NOT_FOUND"
    ASSET_ALREADY_IN_GALLERY = "ASSET_ALREADY_IN_GALLERY"
    ASSET_NOT_IN_GALLERY = "ASSET_NOT_IN_GALLERY"
    ASSET_INVALID_METADATA = "ASSET_INVALID_METADATA"
    ASSET_BATCH_TOO_LARGE = "ASSET_BATCH_TOO_LARGE"

    # Magic Link Errors
    MAGIC_LINK_NOT_FOUND = "MAGIC_LINK_NOT_FOUND"
    MAGIC_LINK_EXPIRED = "MAGIC_LINK_EXPIRED"
    MAGIC_LINK_MAX_VIEWS = "MAGIC_LINK_MAX_VIEWS"
    MAGIC_LINK_INVALID_PIN = "MAGIC_LINK_INVALID_PIN"
    MAGIC_LINK_INVALID_PASSWORD = "MAGIC_LINK_INVALID_PASSWORD"

    # Sync Key Errors
    SYNC_KEY_NOT_FOUND = "SYNC_KEY_NOT_FOUND"
    SYNC_KEY_REVOKED = "SYNC_KEY_REVOKED"
    SYNC_KEY_EXPIRED = "SYNC_KEY_EXPIRED"
    SYNC_KEY_INVALID = "SYNC_KEY_INVALID"
    SYNC_KEY_PERMISSION_DENIED = "SYNC_KEY_PERMISSION_DENIED"
    SYNC_KEY_INVALID_SCOPE = "SYNC_KEY_INVALID_SCOPE"

    # Authentication & Authorization
    UNAUTHORIZED = "UNAUTHORIZED"
    FORBIDDEN = "FORBIDDEN"
    INVALID_TOKEN = "INVALID_TOKEN"
    TOKEN_EXPIRED = "TOKEN_EXPIRED"
    INSUFFICIENT_PERMISSIONS = "INSUFFICIENT_PERMISSIONS"

    # Validation Errors
    VALIDATION_ERROR = "VALIDATION_ERROR"
    INVALID_REQUEST = "INVALID_REQUEST"
    INVALID_JSON = "INVALID_JSON"
    INVALID_QUERY_PARAMETER = "INVALID_QUERY_PARAMETER"
    INVALID_PATH_PARAMETER = "INVALID_PATH_PARAMETER"
    MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD"
    INVALID_FORMAT = "INVALID_FORMAT"

    # Rate Limiting
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED"

    # Service Errors (5xx)
    INTERNAL_ERROR = "INTERNAL_ERROR"
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"
    DATABASE_ERROR = "DATABASE_ERROR"
    CACHE_ERROR = "CACHE_ERROR"
    STORAGE_ERROR = "STORAGE_ERROR"
    EXTERNAL_SERVICE_ERROR = "EXTERNAL_SERVICE_ERROR"

    # AI/ML Errors
    AI_SERVICE_UNAVAILABLE = "AI_SERVICE_UNAVAILABLE"
    AI_QUOTA_EXCEEDED = "AI_QUOTA_EXCEEDED"
    AI_PROCESSING_FAILED = "AI_PROCESSING_FAILED"
    INSUFFICIENT_DATA = "INSUFFICIENT_DATA"

    # Collaboration Errors
    WEBSOCKET_CONNECTION_FAILED = "WEBSOCKET_CONNECTION_FAILED"
    BROADCAST_FAILED = "BROADCAST_FAILED"

    # Download Errors
    DOWNLOAD_LIMIT_EXCEEDED = "DOWNLOAD_LIMIT_EXCEEDED"
    DOWNLOAD_POLICY_DENIED = "DOWNLOAD_POLICY_DENIED"

    # Design/Template Errors
    INVALID_DESIGN_CONFIG = "INVALID_DESIGN_CONFIG"
    TEMPLATE_NOT_FOUND = "TEMPLATE_NOT_FOUND"


# =============================================================================
# Error Message Templates
# =============================================================================


class ErrorMessage:
    """Human-readable error message templates."""

    # Gallery Messages
    GALLERY_NOT_FOUND = "Gallery '{gallery_id}' not found"
    GALLERY_EMPTY = "Gallery must have at least one photo to perform this action"
    GALLERY_ALREADY_EXISTS = "A gallery with this name already exists"
    GALLERY_INVALID_STATUS = "Gallery status '{status}' is invalid for this operation"
    GALLERY_PUBLISH_FAILED = "Failed to publish gallery: {reason}"

    # Sub-Gallery Messages
    SUB_GALLERY_NOT_FOUND = "Sub-gallery '{sub_gallery_id}' not found"
    SUB_GALLERY_INVALID_PARENT = "Parent sub-gallery '{parent_id}' does not exist or is invalid"
    SUB_GALLERY_MAX_DEPTH = "Maximum nesting depth (3 levels) exceeded"
    SUB_GALLERY_INVALID_SORT = "Invalid sort order values provided"

    # Asset Messages
    ASSET_NOT_FOUND = "Asset '{asset_id}' not found in gallery"
    ASSET_ALREADY_IN_GALLERY = "Asset '{asset_id}' is already in this gallery"
    ASSET_NOT_IN_GALLERY = "Asset '{asset_id}' is not in this gallery"
    ASSET_INVALID_METADATA = "Invalid metadata value: {field}"
    ASSET_BATCH_TOO_LARGE = "Batch requests can contain maximum {max} assets, received {count}"

    # Magic Link Messages
    MAGIC_LINK_NOT_FOUND = "Magic link has been revoked or does not exist"
    MAGIC_LINK_EXPIRED = "Magic link expired on {expires_at}"
    MAGIC_LINK_MAX_VIEWS = "Magic link has reached maximum view count"
    MAGIC_LINK_INVALID_PIN = "Invalid PIN code. {attempts_remaining} attempts remaining"
    MAGIC_LINK_INVALID_PASSWORD = "Invalid password"

    # Sync Key Messages
    SYNC_KEY_NOT_FOUND = "API key not found or has been revoked"
    SYNC_KEY_REVOKED = "API key has been revoked"
    SYNC_KEY_EXPIRED = "API key expired on {expires_at}"
    SYNC_KEY_INVALID = "Invalid API key"
    SYNC_KEY_PERMISSION_DENIED = "API key does not have permission: {permission}"
    SYNC_KEY_INVALID_SCOPE = "API key is not scoped to this gallery"

    # Authentication Messages
    UNAUTHORIZED = "Authentication required"
    FORBIDDEN = "You do not have permission to access this resource"
    INVALID_TOKEN = "Invalid authentication token"
    TOKEN_EXPIRED = "Authentication token has expired"
    INSUFFICIENT_PERMISSIONS = "Insufficient permissions for this operation"

    # Validation Messages
    VALIDATION_ERROR = "Request validation failed: {field}"
    INVALID_REQUEST = "Invalid request format"
    INVALID_JSON = "Invalid JSON format in request body"
    INVALID_QUERY_PARAMETER = "Invalid query parameter: {param}"
    INVALID_PATH_PARAMETER = "Invalid path parameter: {param}"
    MISSING_REQUIRED_FIELD = "Missing required field: {field}"
    INVALID_FORMAT = "Invalid format for {field}: {value}"

    # Rate Limiting Messages
    RATE_LIMIT_EXCEEDED = "Rate limit exceeded. Try again in {retry_after} seconds"

    # Service Messages
    INTERNAL_ERROR = "An internal error occurred. Please try again later"
    SERVICE_UNAVAILABLE = "Service temporarily unavailable. Please try again later"
    DATABASE_ERROR = "Database error occurred"
    CACHE_ERROR = "Cache service error occurred"
    STORAGE_ERROR = "Storage service error occurred"
    EXTERNAL_SERVICE_ERROR = "External service error: {service}"

    # AI/ML Messages
    AI_SERVICE_UNAVAILABLE = "AI service temporarily unavailable"
    AI_QUOTA_EXCEEDED = "AI processing quota exceeded"
    AI_PROCESSING_FAILED = "AI processing failed: {reason}"
    INSUFFICIENT_DATA = "Insufficient data for this operation"

    # Collaboration Messages
    WEBSOCKET_CONNECTION_FAILED = "WebSocket connection failed"
    BROADCAST_FAILED = "Failed to broadcast update"

    # Download Messages
    DOWNLOAD_LIMIT_EXCEEDED = "Daily download limit ({limit}) exceeded"
    DOWNLOAD_POLICY_DENIED = "Download not allowed by gallery policy"

    # Design Messages
    INVALID_DESIGN_CONFIG = "Invalid design configuration: {reason}"
    TEMPLATE_NOT_FOUND = "Design template '{template_id}' not found"


# =============================================================================
# HTTP Status Code Mapping
# =============================================================================


STATUS_CODE_MAP: dict[str, int] = {
    # 400 Bad Request
    ErrorCode.VALIDATION_ERROR: 400,
    ErrorCode.INVALID_REQUEST: 400,
    ErrorCode.INVALID_JSON: 400,
    ErrorCode.INVALID_QUERY_PARAMETER: 400,
    ErrorCode.INVALID_PATH_PARAMETER: 400,
    ErrorCode.MISSING_REQUIRED_FIELD: 400,
    ErrorCode.INVALID_FORMAT: 400,
    ErrorCode.GALLERY_EMPTY: 400,
    ErrorCode.GALLERY_INVALID_STATUS: 400,
    ErrorCode.SUB_GALLERY_INVALID_PARENT: 400,
    ErrorCode.SUB_GALLERY_MAX_DEPTH: 400,
    ErrorCode.SUB_GALLERY_INVALID_SORT: 400,
    ErrorCode.ASSET_ALREADY_IN_GALLERY: 400,
    ErrorCode.ASSET_NOT_IN_GALLERY: 400,
    ErrorCode.ASSET_INVALID_METADATA: 400,
    ErrorCode.ASSET_BATCH_TOO_LARGE: 400,
    ErrorCode.INVALID_DESIGN_CONFIG: 400,

    # 401 Unauthorized
    ErrorCode.UNAUTHORIZED: 401,
    ErrorCode.INVALID_TOKEN: 401,
    ErrorCode.TOKEN_EXPIRED: 401,
    ErrorCode.MAGIC_LINK_INVALID_PASSWORD: 401,
    ErrorCode.SYNC_KEY_INVALID: 401,
    ErrorCode.SYNC_KEY_EXPIRED: 401,

    # 403 Forbidden
    ErrorCode.FORBIDDEN: 403,
    ErrorCode.INSUFFICIENT_PERMISSIONS: 403,
    ErrorCode.MAGIC_LINK_INVALID_PIN: 403,
    ErrorCode.SYNC_KEY_PERMISSION_DENIED: 403,
    ErrorCode.SYNC_KEY_INVALID_SCOPE: 403,
    ErrorCode.DOWNLOAD_POLICY_DENIED: 403,

    # 404 Not Found
    ErrorCode.GALLERY_NOT_FOUND: 404,
    ErrorCode.SUB_GALLERY_NOT_FOUND: 404,
    ErrorCode.ASSET_NOT_FOUND: 404,
    ErrorCode.MAGIC_LINK_NOT_FOUND: 404,
    ErrorCode.SYNC_KEY_NOT_FOUND: 404,
    ErrorCode.TEMPLATE_NOT_FOUND: 404,

    # 429 Too Many Requests
    ErrorCode.RATE_LIMIT_EXCEEDED: 429,
    ErrorCode.MAGIC_LINK_MAX_VIEWS: 429,
    ErrorCode.AI_QUOTA_EXCEEDED: 429,
    ErrorCode.DOWNLOAD_LIMIT_EXCEEDED: 429,

    # 500 Internal Server Error
    ErrorCode.INTERNAL_ERROR: 500,
    ErrorCode.DATABASE_ERROR: 500,
    ErrorCode.CACHE_ERROR: 500,
    ErrorCode.STORAGE_ERROR: 500,

    # 503 Service Unavailable
    ErrorCode.SERVICE_UNAVAILABLE: 503,
    ErrorCode.AI_SERVICE_UNAVAILABLE: 503,
    ErrorCode.EXTERNAL_SERVICE_ERROR: 503,
    ErrorCode.GALLERY_PUBLISH_FAILED: 503,
    ErrorCode.AI_PROCESSING_FAILED: 503,
    ErrorCode.WEBSOCKET_CONNECTION_FAILED: 503,
    ErrorCode.BROADCAST_FAILED: 503,
}


# =============================================================================
# Exception Factory Functions
# =============================================================================


def create_error_response(
    code: str,
    message: str,
    details: Optional[Dict[str, Any]] = None,
    request_id: Optional[str] = None,
    timestamp: Optional[str] = None,
) -> ErrorResponse:
    """
    Create a standardized error response.

    Args:
        code: Error code from ErrorCode constants
        message: Human-readable error message
        details: Additional error context
        request_id: Request correlation ID (generated if not provided)
        timestamp: ISO 8601 timestamp (generated if not provided)

    Returns:
        ErrorResponse with standardized format
    """
    if request_id is None:
        request_id = str(uuid.uuid4())

    if timestamp is None:
        timestamp = datetime.now(timezone.utc).isoformat()

    if details is None:
        details = {}

    error_detail = ErrorDetail(
        code=code,
        message=message,
        details=details,
        request_id=request_id,
        timestamp=timestamp,
    )

    return ErrorResponse(error=error_detail)


def format_error(
    code: str,
    message_template: str,
    **kwargs
) -> tuple[str, str, int]:
    """
    Format error code, message, and status code.

    Args:
        code: Error code from ErrorCode
        message_template: Template string from ErrorMessage
        **kwargs: Values to format into message template

    Returns:
        Tuple of (code, formatted_message, status_code)
    """
    message = message_template.format(**kwargs)
    status_code = STATUS_CODE_MAP.get(code, 500)
    return code, message, status_code


def raise_http_exception(
    code: str,
    message_template: str,
    details: Optional[Dict[str, Any]] = None,
    request_id: Optional[str] = None,
    **kwargs
) -> None:
    """
    Raise an HTTPException with standardized error response.

    Args:
        code: Error code from ErrorCode
        message_template: Message template from ErrorMessage
        details: Additional error context
        request_id: Request correlation ID
        **kwargs: Values to format into message template

    Raises:
        HTTPException with formatted error response
    """
    code_str, message, status_code = format_error(code, message_template, **kwargs)

    error_response = create_error_response(
        code=code_str,
        message=message,
        details=details,
        request_id=request_id,
    )

    raise HTTPException(
        status_code=status_code,
        content=error_response.model_dump()
    )


def get_request_id(request: Request) -> str:
    """
    Extract or generate request ID from request.

    Checks for X-Correlation-ID header or request.state.correlation_id
    set by CorrelationMiddleware.

    Args:
        request: FastAPI Request object

    Returns:
        Request correlation ID
    """
    # Check request.state first (set by middleware)
    if hasattr(request.state, "correlation_id"):
        return request.state.correlation_id

    # Fall back to header
    correlation_id = request.headers.get("X-Correlation-ID")
    if correlation_id:
        return correlation_id

    # Generate new UUID
    return str(uuid.uuid4())


# =============================================================================
# Service Exception Converter
# =============================================================================


def exception_to_error_response(
    exception: Exception,
    request_id: Optional[str] = None
) -> ErrorResponse:
    """
    Convert known service exceptions to standardized error responses.

    Maps service-specific exceptions (GalleryError, MagicLinkError, etc.)
    to their corresponding error codes and messages.

    Args:
        exception: The caught exception
        request_id: Request correlation ID

    Returns:
        Standardized ErrorResponse
    """
    from src.services.gallery_service import (
        GalleryError,
        GalleryNotFoundError,
        GalleryEmptyError,
        SubGalleryNotFoundError,
    )
    from src.services.magic_link_service import (
        MagicLinkError,
        MagicLinkNotFoundError,
        MagicLinkExpiredError,
        MagicLinkMaxViewsError,
        PinVerificationError,
        PasswordVerificationError,
    )
    from src.services.sync_key_service import (
        SyncKeyError,
        SyncKeyNotFoundError,
        SyncKeyRevokedError,
        SyncKeyExpiredError,
        SyncKeyPermissionDeniedError,
        SyncKeyGalleryScopeError,
    )
    from src.services.proofing_service import ProofingError, AssetNotFoundError

    timestamp = datetime.now(timezone.utc).isoformat()

    # Gallery Service Exceptions
    if isinstance(exception, GalleryNotFoundError):
        return create_error_response(
            code=ErrorCode.GALLERY_NOT_FOUND,
            message=ErrorMessage.GALLERY_NOT_FOUND.format(
                gallery_id=str(exception.args[0]) if exception.args else "unknown"
            ),
            details={"gallery_id": str(exception.args[0]) if exception.args else None},
            request_id=request_id,
            timestamp=timestamp,
        )

    if isinstance(exception, GalleryEmptyError):
        return create_error_response(
            code=ErrorCode.GALLERY_EMPTY,
            message=ErrorMessage.GALLERY_EMPTY,
            request_id=request_id,
            timestamp=timestamp,
        )

    if isinstance(exception, SubGalleryNotFoundError):
        return create_error_response(
            code=ErrorCode.SUB_GALLERY_NOT_FOUND,
            message=ErrorMessage.SUB_GALLERY_NOT_FOUND.format(
                sub_gallery_id=str(exception.args[0]) if exception.args else "unknown"
            ),
            details={"sub_gallery_id": str(exception.args[0]) if exception.args else None},
            request_id=request_id,
            timestamp=timestamp,
        )

    if isinstance(exception, GalleryError):
        # Generic gallery error - use code and status from exception
        return create_error_response(
            code=exception.code,
            message=str(exception),
            request_id=request_id,
            timestamp=timestamp,
        )

    # Magic Link Exceptions
    if isinstance(exception, MagicLinkNotFoundError):
        return create_error_response(
            code=ErrorCode.MAGIC_LINK_NOT_FOUND,
            message=ErrorMessage.MAGIC_LINK_NOT_FOUND,
            request_id=request_id,
            timestamp=timestamp,
        )

    if isinstance(exception, MagicLinkExpiredError):
        return create_error_response(
            code=ErrorCode.MAGIC_LINK_EXPIRED,
            message=ErrorMessage.MAGIC_LINK_EXPIRED.format(
                expires_at=exception.expires_at.isoformat() if hasattr(exception, 'expires_at') else 'unknown'
            ),
            request_id=request_id,
            timestamp=timestamp,
        )

    if isinstance(exception, MagicLinkMaxViewsError):
        return create_error_response(
            code=ErrorCode.MAGIC_LINK_MAX_VIEWS,
            message=ErrorMessage.MAGIC_LINK_MAX_VIEWS,
            request_id=request_id,
            timestamp=timestamp,
        )

    if isinstance(exception, PinVerificationError):
        attempts_remaining = getattr(exception, 'attempts_remaining', 0)
        return create_error_response(
            code=ErrorCode.MAGIC_LINK_INVALID_PIN,
            message=ErrorMessage.MAGIC_LINK_INVALID_PIN.format(
                attempts_remaining=attempts_remaining
            ),
            details={"attempts_remaining": attempts_remaining},
            request_id=request_id,
            timestamp=timestamp,
        )

    if isinstance(exception, PasswordVerificationError):
        return create_error_response(
            code=ErrorCode.MAGIC_LINK_INVALID_PASSWORD,
            message=ErrorMessage.MAGIC_LINK_INVALID_PASSWORD,
            request_id=request_id,
            timestamp=timestamp,
        )

    if isinstance(exception, MagicLinkError):
        return create_error_response(
            code=exception.code,
            message=str(exception),
            request_id=request_id,
            timestamp=timestamp,
        )

    # Sync Key Exceptions
    if isinstance(exception, SyncKeyNotFoundError):
        return create_error_response(
            code=ErrorCode.SYNC_KEY_NOT_FOUND,
            message=ErrorMessage.SYNC_KEY_NOT_FOUND,
            request_id=request_id,
            timestamp=timestamp,
        )

    if isinstance(exception, SyncKeyRevokedError):
        return create_error_response(
            code=ErrorCode.SYNC_KEY_REVOKED,
            message=ErrorMessage.SYNC_KEY_REVOKED,
            request_id=request_id,
            timestamp=timestamp,
        )

    if isinstance(exception, SyncKeyExpiredError):
        return create_error_response(
            code=ErrorCode.SYNC_KEY_EXPIRED,
            message=ErrorMessage.SYNC_KEY_EXPIRED.format(
                expires_at=exception.expires_at.isoformat() if hasattr(exception, 'expires_at') else 'unknown'
            ),
            request_id=request_id,
            timestamp=timestamp,
        )

    if isinstance(exception, SyncKeyPermissionDeniedError):
        return create_error_response(
            code=ErrorCode.SYNC_KEY_PERMISSION_DENIED,
            message=ErrorMessage.SYNC_KEY_PERMISSION_DENIED.format(
                permission=exception.permission if hasattr(exception, 'permission') else 'unknown'
            ),
            request_id=request_id,
            timestamp=timestamp,
        )

    if isinstance(exception, SyncKeyGalleryScopeError):
        return create_error_response(
            code=ErrorCode.SYNC_KEY_INVALID_SCOPE,
            message=ErrorMessage.SYNC_KEY_INVALID_SCOPE,
            request_id=request_id,
            timestamp=timestamp,
        )

    if isinstance(exception, SyncKeyError):
        return create_error_response(
            code=exception.code,
            message=str(exception),
            request_id=request_id,
            timestamp=timestamp,
        )

    # Proofing/Asset Exceptions
    if isinstance(exception, AssetNotFoundError):
        return create_error_response(
            code=ErrorCode.ASSET_NOT_FOUND,
            message=ErrorMessage.ASSET_NOT_FOUND.format(
                asset_id=str(exception.args[0]) if exception.args else "unknown"
            ),
            details={"asset_id": str(exception.args[0]) if exception.args else None},
            request_id=request_id,
            timestamp=timestamp,
        )

    if isinstance(exception, ProofingError):
        return create_error_response(
            code=ErrorCode.VALIDATION_ERROR,
            message=str(exception),
            request_id=request_id,
            timestamp=timestamp,
        )

    # Generic fallback for unknown exceptions
    return create_error_response(
        code=ErrorCode.INTERNAL_ERROR,
        message=ErrorMessage.INTERNAL_ERROR,
        details={"exception_type": type(exception).__name__},
        request_id=request_id,
        timestamp=timestamp,
    )


# =============================================================================
# Exception Handler for FastAPI
# =============================================================================


async def gallery_service_exception_handler(
    request: Request,
    exc: Exception
) -> ErrorResponse:
    """
    Global exception handler for gallery service.

    Catches known service exceptions and converts them to standardized
    error responses. Logs errors for monitoring.

    Args:
        request: FastAPI Request object
        exc: The raised exception

    Returns:
        Standardized error response
    """
    from src.log_config import get_logger

    logger = get_logger(__name__)
    request_id = get_request_id(request)

    # Log the error
    logger.error(
        f"Request failed: {type(exc).__name__}: {str(exc)}",
        extra={
            "request_id": request_id,
            "path": request.url.path,
            "method": request.method,
            "exception_type": type(exc).__name__,
        }
    )

    # Convert to error response
    error_response = exception_to_error_response(exc, request_id)

    # Determine status code
    status_code = STATUS_CODE_MAP.get(
        error_response.error.code,
        getattr(exc, "status", 500)
    )

    # Store status code for response
    request.state.error_status_code = status_code

    return error_response
