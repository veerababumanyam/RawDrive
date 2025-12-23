"""Abstract base class for AI providers.

This module provides the BaseProvider abstract class that implements
common functionality shared by all AI providers:
- Image validation (format, size, corruption)
- Bounding box normalization
- Error wrapping with user-friendly messages
- Request/response logging

All concrete providers (CloudVisionProvider, GeminiProvider) inherit
from this class and implement the abstract methods.
"""

import logging
from abc import abstractmethod
from typing import Any, Optional

from app.api.face_schemas import BoundingBox, FaceDetectionResult
from app.services.face_exceptions import (
    FaceDetectionError,
    InvalidImageFormatError,
    ImageTooSmallError,
    ImageCorruptedError,
    ProviderRateLimitedError,
    ProviderTimeoutError,
    ProviderInvalidResponseError,
)
from app.services.ai.providers.types import (
    IAIProvider,
    DetectionOptions,
)


logger = logging.getLogger(__name__)


class BaseProvider(IAIProvider):
    """Abstract base class for AI face detection providers.
    
    Provides common functionality for all providers:
    - Image validation before sending to API
    - Bounding box coordinate normalization
    - Error wrapping with appropriate error codes
    - Request/response logging for debugging
    
    Subclasses must implement:
    - name property: Provider identifier
    - detect_faces(): Core face detection logic
    - is_healthy(): Health check implementation
    
    Attributes:
        SUPPORTED_FORMATS: List of supported image MIME types
        MAX_IMAGE_SIZE: Maximum image size in bytes (10MB)
        MIN_IMAGE_DIMENSION: Minimum image dimension for reliable detection
    """
    
    # Supported image formats for face detection
    SUPPORTED_FORMATS: list[str] = [
        "image/jpeg",
        "image/png", 
        "image/webp",
        "image/heic",
    ]
    
    # Maximum image size: 10MB
    MAX_IMAGE_SIZE: int = 10 * 1024 * 1024
    
    # Minimum image dimension for reliable face detection
    MIN_IMAGE_DIMENSION: int = 100
    
    # Minimum buffer size to consider image valid (not corrupted)
    MIN_BUFFER_SIZE: int = 100

    def __init__(self) -> None:
        """Initialize the base provider."""
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider name for identification and logging."""
        pass

    @abstractmethod
    async def detect_faces(
        self,
        image_buffer: bytes,
        options: Optional[DetectionOptions] = None,
    ) -> list[FaceDetectionResult]:
        """Detect faces in an image. Must be implemented by subclasses."""
        pass

    @abstractmethod
    async def is_healthy(self) -> bool:
        """Check provider health. Must be implemented by subclasses."""
        pass

    # =========================================================================
    # IMAGE VALIDATION
    # =========================================================================

    def validate_image(
        self,
        image_buffer: bytes,
        mime_type: Optional[str] = None,
    ) -> None:
        """Validate image before sending to provider.
        
        Performs validation checks:
        1. Image size is within limits
        2. MIME type is supported (if provided)
        3. Buffer is not too small (corruption check)
        
        Args:
            image_buffer: Raw image data as bytes
            mime_type: Optional MIME type of the image
            
        Raises:
            InvalidImageFormatError: If MIME type is not supported
            ImageTooSmallError: If image is too small
            ImageCorruptedError: If image appears corrupted
        """
        # Check image size limit
        if len(image_buffer) > self.MAX_IMAGE_SIZE:
            raise FaceDetectionError(
                code="IMAGE_TOO_LARGE",
                message=f"Image size {len(image_buffer)} exceeds maximum {self.MAX_IMAGE_SIZE}",
                user_message="This image is too large. Please use an image under 10MB.",
                details={"size": len(image_buffer), "max_size": self.MAX_IMAGE_SIZE},
            )
        
        # Check MIME type if provided
        if mime_type and mime_type not in self.SUPPORTED_FORMATS:
            raise InvalidImageFormatError(
                mime_type,
                self.SUPPORTED_FORMATS,
            )
        
        # Basic corruption check - ensure buffer has content
        if len(image_buffer) < self.MIN_BUFFER_SIZE:
            raise ImageCorruptedError(
                reason="Image buffer too small, likely corrupted or empty",
            )

    def validate_image_dimensions(
        self,
        width: int,
        height: int,
    ) -> None:
        """Validate image dimensions meet minimum requirements.
        
        Args:
            width: Image width in pixels
            height: Image height in pixels
            
        Raises:
            ImageTooSmallError: If dimensions are below minimum
        """
        if width < self.MIN_IMAGE_DIMENSION or height < self.MIN_IMAGE_DIMENSION:
            raise ImageTooSmallError(width, height)

    # =========================================================================
    # BOUNDING BOX NORMALIZATION
    # =========================================================================

    def normalize_bounding_box(
        self,
        box: dict[str, float],
        image_width: int,
        image_height: int,
    ) -> BoundingBox:
        """Normalize bounding box coordinates to percentages (0-100).
        
        Different providers return coordinates in different formats
        (pixels, normalized 0-1, etc.). This method converts to our
        standard percentage format.
        
        Args:
            box: Raw bounding box with x, y, width, height in pixels
            image_width: Image width in pixels
            image_height: Image height in pixels
            
        Returns:
            BoundingBox with coordinates as percentages (0-100)
        """
        return BoundingBox(
            x=(box["x"] / image_width) * 100,
            y=(box["y"] / image_height) * 100,
            width=(box["width"] / image_width) * 100,
            height=(box["height"] / image_height) * 100,
        )

    def normalize_bounding_box_from_vertices(
        self,
        vertices: list[dict[str, float]],
        image_width: int,
        image_height: int,
    ) -> BoundingBox:
        """Convert polygon vertices to normalized bounding box.
        
        Some providers (like Cloud Vision) return face bounds as
        polygon vertices. This converts to our standard format.
        
        Args:
            vertices: List of vertex dicts with 'x' and 'y' keys
            image_width: Image width in pixels
            image_height: Image height in pixels
            
        Returns:
            BoundingBox with coordinates as percentages (0-100)
        """
        if len(vertices) < 4:
            return BoundingBox(x=0, y=0, width=0, height=0)
        
        # Extract x and y coordinates
        xs = [v.get("x", 0) for v in vertices]
        ys = [v.get("y", 0) for v in vertices]
        
        # Calculate bounding box from vertices
        min_x = min(xs)
        max_x = max(xs)
        min_y = min(ys)
        max_y = max(ys)
        
        # Convert to percentages
        return BoundingBox(
            x=(min_x / image_width) * 100,
            y=(min_y / image_height) * 100,
            width=((max_x - min_x) / image_width) * 100,
            height=((max_y - min_y) / image_height) * 100,
        )

    # =========================================================================
    # LOGGING HELPERS
    # =========================================================================

    def log_request(
        self,
        operation: str,
        details: Optional[dict[str, Any]] = None,
    ) -> None:
        """Log provider request for debugging and monitoring.
        
        Args:
            operation: Name of the operation (e.g., 'detect_faces')
            details: Additional details to log
        """
        log_data = {
            "provider": self.name,
            "operation": operation,
        }
        if details:
            log_data.update(details)
        
        logger.debug(f"{self.name} request: {operation}", extra=log_data)

    def log_response(
        self,
        operation: str,
        success: bool,
        details: Optional[dict[str, Any]] = None,
    ) -> None:
        """Log provider response for debugging and monitoring.
        
        Args:
            operation: Name of the operation
            success: Whether the operation succeeded
            details: Additional details to log
        """
        log_data = {
            "provider": self.name,
            "operation": operation,
            "success": success,
        }
        if details:
            log_data.update(details)
        
        if success:
            logger.debug(f"{self.name} response: {operation} succeeded", extra=log_data)
        else:
            logger.warning(f"{self.name} response: {operation} failed", extra=log_data)

    # =========================================================================
    # ERROR HANDLING
    # =========================================================================

    def wrap_provider_error(
        self,
        error: Exception,
        operation: str,
    ) -> FaceDetectionError:
        """Wrap provider errors in FaceDetectionError with appropriate codes.
        
        Analyzes the error to determine the appropriate error code:
        - Rate limit errors -> PROVIDER_RATE_LIMITED
        - Timeout errors -> PROVIDER_TIMEOUT
        - Other errors -> PROVIDER_INVALID_RESPONSE
        
        Args:
            error: The original exception from the provider
            operation: Name of the operation that failed
            
        Returns:
            FaceDetectionError with appropriate code and user message
        """
        # Check for rate limiting
        if self._is_rate_limit_error(error):
            return ProviderRateLimitedError(
                provider_name=self.name,
                retry_after=self._extract_retry_after(error),
            )
        
        # Check for timeout
        if self._is_timeout_error(error):
            return ProviderTimeoutError(
                provider_name=self.name,
                timeout_ms=30000,  # Default timeout
            )
        
        # Generic provider error
        return ProviderInvalidResponseError(
            provider_name=self.name,
            reason=f"Error during {operation}: {str(error)}",
        )

    def _is_rate_limit_error(self, error: Exception) -> bool:
        """Check if error is a rate limit error.
        
        Override in subclasses for provider-specific detection.
        
        Args:
            error: The exception to check
            
        Returns:
            True if this is a rate limit error
        """
        message = str(error).lower()
        return (
            "rate limit" in message or
            "quota exceeded" in message or
            "resource exhausted" in message or
            getattr(error, "status_code", None) == 429
        )

    def _is_timeout_error(self, error: Exception) -> bool:
        """Check if error is a timeout error.
        
        Override in subclasses for provider-specific detection.
        
        Args:
            error: The exception to check
            
        Returns:
            True if this is a timeout error
        """
        message = str(error).lower()
        return (
            "timeout" in message or
            "timed out" in message or
            getattr(error, "code", None) == "ETIMEDOUT"
        )

    def _extract_retry_after(self, error: Exception) -> Optional[int]:
        """Extract retry-after value from rate limit error.
        
        Args:
            error: The rate limit exception
            
        Returns:
            Retry-after seconds if available, None otherwise
        """
        # Try to extract from error attributes
        retry_after = getattr(error, "retry_after", None)
        if retry_after is not None:
            return int(retry_after)
        
        # Try to extract from response headers (if available)
        response = getattr(error, "response", None)
        if response is not None:
            headers = getattr(response, "headers", {})
            retry_header = headers.get("Retry-After")
            if retry_header:
                try:
                    return int(retry_header)
                except ValueError:
                    pass
        
        return None
