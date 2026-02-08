"""Face Detection specific exceptions.

This module provides domain-specific error types for the Face Detection service,
following the established exception patterns in client_exceptions.py.

Key features:
- Typed error codes for programmatic handling
- User-friendly messages safe for UI display
- HTTP status code mapping
- Correlation ID support for distributed tracing
- Detailed error information for debugging

All errors extend the base FaceDetectionError class which provides:
- Automatic user message generation from error codes
- HTTP status code mapping
- Safe API response serialization
"""

from __future__ import annotations

from typing import Any, Optional
from uuid import UUID

from app.api.face_schemas import FaceDetectionErrorCode


# =============================================================================
# USER-FRIENDLY MESSAGE MAPPING
# =============================================================================


def get_default_user_message(code: FaceDetectionErrorCode) -> str:
    """Maps error codes to user-friendly messages.
    
    These messages are safe to display in the UI and help users understand
    what went wrong and what they can do about it.
    
    Args:
        code: The error code to get a message for
        
    Returns:
        A user-friendly error message
    """
    messages: dict[FaceDetectionErrorCode, str] = {
        # Provider errors - explain the issue and suggest retry
        FaceDetectionErrorCode.PROVIDER_UNAVAILABLE: 
            "Face detection service is temporarily unavailable. Please try again in a few minutes.",
        FaceDetectionErrorCode.PROVIDER_RATE_LIMITED: 
            "Too many requests. Please wait a moment before trying again.",
        FaceDetectionErrorCode.PROVIDER_TIMEOUT: 
            "Face detection is taking longer than expected. Please try again.",
        FaceDetectionErrorCode.PROVIDER_INVALID_RESPONSE: 
            "Unable to process the image. Please try with a different photo.",
        FaceDetectionErrorCode.ALL_PROVIDERS_FAILED: 
            "Face detection is currently unavailable. Our team has been notified.",

        # Detection errors - help user understand image requirements
        FaceDetectionErrorCode.INVALID_IMAGE_FORMAT: 
            "This image format is not supported. Please use JPEG, PNG, WebP, or HEIC.",
        FaceDetectionErrorCode.IMAGE_TOO_SMALL: 
            "This image is too small for face detection. Please use a larger image (minimum 100x100 pixels).",
        FaceDetectionErrorCode.IMAGE_CORRUPTED: 
            "This image appears to be corrupted. Please try uploading it again or use a different image.",
        FaceDetectionErrorCode.DETECTION_FAILED: 
            "Unable to detect faces in this image. Please try with a clearer photo.",

        # Cluster errors - guide user on face group operations
        FaceDetectionErrorCode.FACE_GROUP_NOT_FOUND: 
            "This face group no longer exists. It may have been deleted.",
        FaceDetectionErrorCode.FACE_NOT_FOUND: 
            "This face could not be found. It may have been removed.",
        FaceDetectionErrorCode.INVALID_MERGE_OPERATION: 
            "Cannot merge these face groups. Please select two different groups.",
        FaceDetectionErrorCode.INVALID_SPLIT_OPERATION: 
            "Cannot split these faces. Please select faces that belong to the same group.",

        # Authorization errors - clear access denial messages
        FaceDetectionErrorCode.WORKSPACE_ACCESS_DENIED: 
            "You do not have permission to access face data in this workspace.",
        FaceDetectionErrorCode.CROSS_WORKSPACE_ACCESS: 
            "You cannot access face data from another workspace.",

        # Configuration errors - admin-focused messages
        FaceDetectionErrorCode.PROVIDER_NOT_CONFIGURED: 
            "Face detection has not been configured. Please contact your administrator.",
        FaceDetectionErrorCode.INVALID_CONFIGURATION: 
            "Face detection configuration is invalid. Please contact your administrator.",
            
        # Embedding errors
        FaceDetectionErrorCode.EMBEDDING_DIMENSION_MISMATCH:
            "Face embedding has incorrect dimensions. Please reprocess the photo.",
        FaceDetectionErrorCode.EMBEDDING_NOT_NORMALIZED:
            "Face embedding is not properly normalized. Please reprocess the photo.",
            
        # Feature toggle errors
        FaceDetectionErrorCode.DETECTION_DISABLED:
            "Face detection is disabled for this workspace. Please contact your administrator.",
            
        # Resource not found errors
        FaceDetectionErrorCode.PHOTO_NOT_FOUND:
            "The photo could not be found. It may have been deleted.",
    }

    return messages.get(code, "An unexpected error occurred. Please try again.")


def get_default_http_status(code: FaceDetectionErrorCode) -> int:
    """Maps error codes to appropriate HTTP status codes.
    
    Args:
        code: The error code to get a status for
        
    Returns:
        HTTP status code (4xx or 5xx)
    """
    status_map: dict[FaceDetectionErrorCode, int] = {
        # 429 - Rate limited
        FaceDetectionErrorCode.PROVIDER_RATE_LIMITED: 429,
        
        # 503 - Service unavailable
        FaceDetectionErrorCode.PROVIDER_UNAVAILABLE: 503,
        FaceDetectionErrorCode.ALL_PROVIDERS_FAILED: 503,
        FaceDetectionErrorCode.PROVIDER_NOT_CONFIGURED: 503,
        
        # 504 - Gateway timeout
        FaceDetectionErrorCode.PROVIDER_TIMEOUT: 504,
        
        # 400 - Bad request (client errors)
        FaceDetectionErrorCode.INVALID_IMAGE_FORMAT: 400,
        FaceDetectionErrorCode.IMAGE_TOO_SMALL: 400,
        FaceDetectionErrorCode.IMAGE_CORRUPTED: 400,
        FaceDetectionErrorCode.INVALID_MERGE_OPERATION: 400,
        FaceDetectionErrorCode.INVALID_SPLIT_OPERATION: 400,
        FaceDetectionErrorCode.EMBEDDING_DIMENSION_MISMATCH: 400,
        FaceDetectionErrorCode.EMBEDDING_NOT_NORMALIZED: 400,
        
        # 404 - Not found
        FaceDetectionErrorCode.FACE_GROUP_NOT_FOUND: 404,
        FaceDetectionErrorCode.FACE_NOT_FOUND: 404,
        
        # 403 - Forbidden
        FaceDetectionErrorCode.WORKSPACE_ACCESS_DENIED: 403,
        FaceDetectionErrorCode.CROSS_WORKSPACE_ACCESS: 403,
        
        # 500 - Internal server error
        FaceDetectionErrorCode.PROVIDER_INVALID_RESPONSE: 500,
        FaceDetectionErrorCode.DETECTION_FAILED: 500,
        FaceDetectionErrorCode.INVALID_CONFIGURATION: 500,
        
        # 403 - Detection disabled
        FaceDetectionErrorCode.DETECTION_DISABLED: 403,
        
        # 404 - Photo not found
        FaceDetectionErrorCode.PHOTO_NOT_FOUND: 404,
    }

    return status_map.get(code, 500)


# =============================================================================
# BASE EXCEPTION CLASS
# =============================================================================


class FaceDetectionError(Exception):
    """Base exception for all face detection operations.
    
    This class provides structured error information with:
    - Typed error codes for programmatic handling
    - User-friendly messages safe for UI display
    - HTTP status code mapping for API responses
    - Correlation ID support for distributed tracing
    - Detailed error information for debugging
    
    Example:
        raise FaceDetectionError(
            code=FaceDetectionErrorCode.FACE_NOT_FOUND,
            message="Face abc123 not found in workspace xyz",
            details={"face_id": "abc123", "workspace_id": "xyz"}
        )
    """

    def __init__(
        self,
        code: FaceDetectionErrorCode,
        message: str,
        *,
        user_message: Optional[str] = None,
        http_status: Optional[int] = None,
        details: Optional[dict[str, Any]] = None,
        correlation_id: Optional[str] = None,
        cause: Optional[Exception] = None,
    ) -> None:
        """Initialize a FaceDetectionError.
        
        Args:
            code: Error code for programmatic handling
            message: Technical message for logging (not shown to users)
            user_message: User-friendly message (auto-generated if not provided)
            http_status: HTTP status code (auto-mapped if not provided)
            details: Additional error details for debugging
            correlation_id: Request correlation ID for tracing
            cause: Original exception that caused this error
        """
        super().__init__(message)
        
        self.code = code
        self.message = message
        self.user_message = user_message or get_default_user_message(code)
        self.http_status = http_status or get_default_http_status(code)
        self.details = details
        self.correlation_id = correlation_id
        
        # Preserve original exception for debugging
        if cause:
            self.__cause__ = cause

    def to_api_response(self) -> dict[str, Any]:
        """Creates a safe response object for API endpoints.
        
        Excludes sensitive technical details from user-facing responses.
        Only includes information safe to display to end users.
        
        Returns:
            Dictionary suitable for JSON serialization in API response
        """
        response: dict[str, Any] = {
            "success": False,
            "error": {
                "code": self.code.value,
                "message": self.user_message,
            },
        }
        
        if self.correlation_id:
            response["error"]["correlation_id"] = self.correlation_id
            
        return response

    def __str__(self) -> str:
        """String representation for logging."""
        parts = [f"[{self.code.value}] {self.message}"]
        if self.correlation_id:
            parts.append(f"(correlation_id={self.correlation_id})")
        return " ".join(parts)

    def __repr__(self) -> str:
        """Detailed representation for debugging."""
        return (
            f"FaceDetectionError("
            f"code={self.code.value!r}, "
            f"message={self.message!r}, "
            f"http_status={self.http_status}, "
            f"correlation_id={self.correlation_id!r})"
        )


# =============================================================================
# PROVIDER ERRORS
# =============================================================================


class ProviderUnavailableError(FaceDetectionError):
    """AI provider is temporarily unavailable."""

    def __init__(
        self, 
        provider_name: str, 
        reason: Optional[str] = None,
        correlation_id: Optional[str] = None,
    ) -> None:
        message = f"Provider '{provider_name}' is unavailable"
        if reason:
            message += f": {reason}"
            
        super().__init__(
            code=FaceDetectionErrorCode.PROVIDER_UNAVAILABLE,
            message=message,
            details={"provider": provider_name, "reason": reason},
            correlation_id=correlation_id,
        )


class ProviderRateLimitedError(FaceDetectionError):
    """AI provider rate limit exceeded."""

    def __init__(
        self, 
        provider_name: str, 
        retry_after_seconds: Optional[int] = None,
        correlation_id: Optional[str] = None,
    ) -> None:
        message = f"Rate limit exceeded for provider '{provider_name}'"
        if retry_after_seconds:
            message += f", retry after {retry_after_seconds}s"
            
        super().__init__(
            code=FaceDetectionErrorCode.PROVIDER_RATE_LIMITED,
            message=message,
            details={
                "provider": provider_name, 
                "retry_after_seconds": retry_after_seconds
            },
            correlation_id=correlation_id,
        )


class ProviderTimeoutError(FaceDetectionError):
    """AI provider request timed out."""

    def __init__(
        self, 
        provider_name: str, 
        timeout_ms: int,
        correlation_id: Optional[str] = None,
    ) -> None:
        super().__init__(
            code=FaceDetectionErrorCode.PROVIDER_TIMEOUT,
            message=f"Provider '{provider_name}' timed out after {timeout_ms}ms",
            details={"provider": provider_name, "timeout_ms": timeout_ms},
            correlation_id=correlation_id,
        )


class ProviderInvalidResponseError(FaceDetectionError):
    """AI provider returned an invalid or unparseable response."""

    def __init__(
        self, 
        provider_name: str, 
        reason: str,
        correlation_id: Optional[str] = None,
    ) -> None:
        super().__init__(
            code=FaceDetectionErrorCode.PROVIDER_INVALID_RESPONSE,
            message=f"Invalid response from provider '{provider_name}': {reason}",
            details={"provider": provider_name, "reason": reason},
            correlation_id=correlation_id,
        )


class AllProvidersFailedError(FaceDetectionError):
    """All configured AI providers failed."""

    def __init__(
        self, 
        provider_errors: list[dict[str, str]],
        correlation_id: Optional[str] = None,
    ) -> None:
        providers = [e.get("provider", "unknown") for e in provider_errors]
        super().__init__(
            code=FaceDetectionErrorCode.ALL_PROVIDERS_FAILED,
            message=f"All {len(provider_errors)} providers failed: {', '.join(providers)}",
            details={"provider_errors": provider_errors},
            correlation_id=correlation_id,
        )


# =============================================================================
# IMAGE/DETECTION ERRORS
# =============================================================================


class InvalidImageFormatError(FaceDetectionError):
    """Image format is not supported for face detection."""

    def __init__(
        self, 
        format_received: Optional[str] = None,
        supported_formats: Optional[list[str]] = None,
    ) -> None:
        supported = supported_formats or ["JPEG", "PNG", "WebP", "HEIC"]
        message = "Invalid image format"
        if format_received:
            message += f": received '{format_received}'"
        message += f". Supported: {', '.join(supported)}"
        
        super().__init__(
            code=FaceDetectionErrorCode.INVALID_IMAGE_FORMAT,
            message=message,
            details={
                "format_received": format_received,
                "supported_formats": supported,
            },
        )


class ImageTooSmallError(FaceDetectionError):
    """Image is too small for reliable face detection."""

    def __init__(
        self, 
        width: int, 
        height: int, 
        min_width: int = 100, 
        min_height: int = 100,
    ) -> None:
        super().__init__(
            code=FaceDetectionErrorCode.IMAGE_TOO_SMALL,
            message=(
                f"Image too small ({width}x{height}), "
                f"minimum required: {min_width}x{min_height}"
            ),
            details={
                "width": width,
                "height": height,
                "min_width": min_width,
                "min_height": min_height,
            },
        )


class ImageCorruptedError(FaceDetectionError):
    """Image file is corrupted or unreadable."""

    def __init__(self, reason: Optional[str] = None) -> None:
        message = "Image file is corrupted or unreadable"
        if reason:
            message += f": {reason}"
            
        super().__init__(
            code=FaceDetectionErrorCode.IMAGE_CORRUPTED,
            message=message,
            details={"reason": reason},
        )


class DetectionFailedError(FaceDetectionError):
    """Face detection failed for an unknown reason."""

    def __init__(
        self, 
        photo_id: UUID | str, 
        reason: Optional[str] = None,
        correlation_id: Optional[str] = None,
    ) -> None:
        message = f"Face detection failed for photo {photo_id}"
        if reason:
            message += f": {reason}"
            
        super().__init__(
            code=FaceDetectionErrorCode.DETECTION_FAILED,
            message=message,
            details={"photo_id": str(photo_id), "reason": reason},
            correlation_id=correlation_id,
        )


# =============================================================================
# FACE/GROUP NOT FOUND ERRORS
# =============================================================================


class FaceNotFoundError(FaceDetectionError):
    """Face does not exist in the workspace."""

    def __init__(self, face_id: UUID | str) -> None:
        super().__init__(
            code=FaceDetectionErrorCode.FACE_NOT_FOUND,
            message=f"Face {face_id} not found",
            details={"face_id": str(face_id)},
        )


class FaceGroupNotFoundError(FaceDetectionError):
    """Face group does not exist in the workspace."""

    def __init__(self, group_id: UUID | str) -> None:
        super().__init__(
            code=FaceDetectionErrorCode.FACE_GROUP_NOT_FOUND,
            message=f"Face group {group_id} not found",
            details={"group_id": str(group_id)},
        )


# =============================================================================
# FACE GROUP OPERATION ERRORS
# =============================================================================


class InvalidMergeOperationError(FaceDetectionError):
    """Face group merge operation is invalid."""

    def __init__(
        self, 
        reason: str,
        source_group_id: Optional[UUID | str] = None,
        target_group_id: Optional[UUID | str] = None,
    ) -> None:
        details: dict[str, Any] = {"reason": reason}
        if source_group_id:
            details["source_group_id"] = str(source_group_id)
        if target_group_id:
            details["target_group_id"] = str(target_group_id)
            
        super().__init__(
            code=FaceDetectionErrorCode.INVALID_MERGE_OPERATION,
            message=f"Invalid merge operation: {reason}",
            user_message=f"Cannot merge face groups: {reason}",
            details=details,
        )


class InvalidSplitOperationError(FaceDetectionError):
    """Face group split operation is invalid."""

    def __init__(
        self, 
        reason: str,
        group_id: Optional[UUID | str] = None,
    ) -> None:
        details: dict[str, Any] = {"reason": reason}
        if group_id:
            details["group_id"] = str(group_id)
            
        super().__init__(
            code=FaceDetectionErrorCode.INVALID_SPLIT_OPERATION,
            message=f"Invalid split operation: {reason}",
            user_message=f"Cannot split face group: {reason}",
            details=details,
        )


# =============================================================================
# AUTHORIZATION ERRORS
# =============================================================================


class WorkspaceAccessDeniedError(FaceDetectionError):
    """User does not have access to face data in this workspace."""

    def __init__(
        self, 
        workspace_id: UUID | str, 
        user_id: Optional[UUID | str] = None,
    ) -> None:
        message = f"Access denied to face data in workspace {workspace_id}"
        if user_id:
            message += f" for user {user_id}"
            
        super().__init__(
            code=FaceDetectionErrorCode.WORKSPACE_ACCESS_DENIED,
            message=message,
            details={
                "workspace_id": str(workspace_id),
                "user_id": str(user_id) if user_id else None,
            },
        )


class CrossWorkspaceAccessError(FaceDetectionError):
    """Attempted to access face data from another workspace."""

    def __init__(
        self, 
        requested_workspace_id: UUID | str, 
        user_workspace_id: UUID | str,
    ) -> None:
        super().__init__(
            code=FaceDetectionErrorCode.CROSS_WORKSPACE_ACCESS,
            message=(
                f"Cross-workspace access denied: "
                f"requested {requested_workspace_id}, "
                f"user belongs to {user_workspace_id}"
            ),
            details={
                "requested_workspace_id": str(requested_workspace_id),
                "user_workspace_id": str(user_workspace_id),
            },
        )


# =============================================================================
# CONFIGURATION ERRORS
# =============================================================================


class ProviderNotConfiguredError(FaceDetectionError):
    """AI provider is not configured."""

    def __init__(self, provider_name: str) -> None:
        super().__init__(
            code=FaceDetectionErrorCode.PROVIDER_NOT_CONFIGURED,
            message=f"Provider '{provider_name}' is not configured",
            details={"provider": provider_name},
        )


class InvalidConfigurationError(FaceDetectionError):
    """Face detection configuration is invalid."""

    def __init__(self, setting: str, reason: str) -> None:
        super().__init__(
            code=FaceDetectionErrorCode.INVALID_CONFIGURATION,
            message=f"Invalid configuration for '{setting}': {reason}",
            details={"setting": setting, "reason": reason},
        )


# =============================================================================
# EMBEDDING ERRORS
# =============================================================================


class EmbeddingDimensionMismatchError(FaceDetectionError):
    """Face embedding has incorrect dimensions."""

    def __init__(
        self, 
        expected_dim: int = 512, 
        actual_dim: int = 0,
    ) -> None:
        super().__init__(
            code=FaceDetectionErrorCode.EMBEDDING_DIMENSION_MISMATCH,
            message=(
                f"Embedding dimension mismatch: "
                f"expected {expected_dim}, got {actual_dim}"
            ),
            details={
                "expected_dimension": expected_dim,
                "actual_dimension": actual_dim,
            },
        )


class EmbeddingNotNormalizedError(FaceDetectionError):
    """Face embedding is not properly normalized (L2 norm != 1)."""

    def __init__(self, l2_norm: float) -> None:
        super().__init__(
            code=FaceDetectionErrorCode.EMBEDDING_NOT_NORMALIZED,
            message=f"Embedding not normalized: L2 norm = {l2_norm:.6f}, expected 1.0",
            details={"l2_norm": l2_norm},
        )


# =============================================================================
# FEATURE TOGGLE ERRORS
# =============================================================================


class DetectionDisabledError(FaceDetectionError):
    """Face detection is disabled for this workspace."""

    def __init__(
        self,
        workspace_id: UUID | str,
        reason: Optional[str] = None,
    ) -> None:
        message = f"Face detection is disabled for workspace {workspace_id}"
        if reason:
            message += f": {reason}"

        # Build user-friendly message
        if reason and "consent" in reason.lower():
            user_message = "Face detection requires biometric consent. Please grant consent in workspace settings to enable this feature."
        elif reason and "administrator" in reason.lower():
            user_message = "Face detection has been disabled by your administrator. Please contact them for more information."
        else:
            user_message = "Face detection is currently disabled for this workspace."

        super().__init__(
            code=FaceDetectionErrorCode.DETECTION_DISABLED,
            message=message,
            user_message=user_message,
            details={"workspace_id": str(workspace_id), "reason": reason},
        )


# =============================================================================
# RESOURCE NOT FOUND ERRORS
# =============================================================================


class PhotoNotFoundError(FaceDetectionError):
    """Photo does not exist in the workspace."""

    def __init__(self, photo_id: UUID | str) -> None:
        super().__init__(
            code=FaceDetectionErrorCode.PHOTO_NOT_FOUND,
            message=f"Photo {photo_id} not found",
            details={"photo_id": str(photo_id)},
        )
