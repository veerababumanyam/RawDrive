"""Type definitions for AI providers.

This module defines the interfaces and types used by AI providers
for face detection operations.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Coroutine, Optional, TypeVar

from app.api.face_schemas import FaceDetectionResult


# =============================================================================
# DETECTION OPTIONS
# =============================================================================


@dataclass
class DetectionOptions:
    """Options for face detection operations.
    
    Attributes:
        max_faces: Maximum number of faces to detect (default: 50)
        min_confidence: Minimum confidence threshold (0-1, default: 0.0)
        include_landmarks: Whether to include facial landmarks (default: True)
        include_attributes: Whether to include face attributes (default: True)
    """
    max_faces: int = 50
    min_confidence: float = 0.0
    include_landmarks: bool = True
    include_attributes: bool = True


# =============================================================================
# HEALTH CHECK RESULT
# =============================================================================


@dataclass
class HealthCheckResult:
    """Result of a provider health check.
    
    Attributes:
        healthy: Whether the provider is healthy and operational
        latency_ms: Response latency in milliseconds
        message: Human-readable status message
        details: Additional diagnostic information
    """
    healthy: bool
    latency_ms: float
    message: str
    details: dict[str, Any] = field(default_factory=dict)


# =============================================================================
# PROVIDER STATUS
# =============================================================================


class ProviderHealthStatus(str, Enum):
    """Health status of an AI provider."""
    HEALTHY = "healthy"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"


@dataclass
class ProviderStatus:
    """Status information for an AI provider.
    
    Attributes:
        name: Provider identifier (e.g., 'cloud_vision', 'gemini')
        is_enabled: Whether the provider is enabled in configuration
        health_status: Current health status
        priority: Provider priority (lower = higher preference)
        circuit_breaker_state: Current circuit breaker state
        last_health_check: Timestamp of last health check (ISO format)
    """
    name: str
    is_enabled: bool
    health_status: ProviderHealthStatus
    priority: int
    circuit_breaker_state: str
    last_health_check: Optional[str] = None


# =============================================================================
# AI PROVIDER INTERFACE
# =============================================================================


class IAIProvider(ABC):
    """Abstract interface for AI face detection providers.
    
    All concrete providers must implement this interface to ensure
    consistent behavior across different AI services.
    
    Implementations:
    - CloudVisionProvider: Google Cloud Vision API (primary)
    - GeminiProvider: Google Gemini API (fallback)
    """
    
    @property
    @abstractmethod
    def name(self) -> str:
        """Provider name for identification and logging.
        
        Returns:
            Provider identifier (e.g., 'cloud_vision', 'gemini')
        """
        pass
    
    @abstractmethod
    async def detect_faces(
        self,
        image_buffer: bytes,
        options: Optional[DetectionOptions] = None,
    ) -> list[FaceDetectionResult]:
        """Detect faces in an image.
        
        Args:
            image_buffer: Raw image data as bytes
            options: Detection options (max_faces, min_confidence, etc.)
            
        Returns:
            List of detected faces with bounding boxes and confidence scores
            
        Raises:
            FaceDetectionError: If detection fails
        """
        pass
    
    @abstractmethod
    async def is_healthy(self) -> bool:
        """Check if the provider is healthy and operational.
        
        Performs a lightweight health check to verify:
        - API credentials are valid
        - Service is reachable
        - No critical errors
        
        Returns:
            True if provider is healthy, False otherwise
        """
        pass
    
    async def health_check(self) -> HealthCheckResult:
        """Perform a detailed health check with timing.
        
        Returns:
            HealthCheckResult with status, latency, and details
        """
        import time
        
        start_time = time.time()
        try:
            healthy = await self.is_healthy()
            latency_ms = (time.time() - start_time) * 1000
            
            return HealthCheckResult(
                healthy=healthy,
                latency_ms=latency_ms,
                message="Provider is operational" if healthy else "Provider health check failed",
            )
        except Exception as e:
            latency_ms = (time.time() - start_time) * 1000
            return HealthCheckResult(
                healthy=False,
                latency_ms=latency_ms,
                message=f"Health check error: {str(e)}",
                details={"error": str(e)},
            )


# =============================================================================
# TYPE ALIASES
# =============================================================================


# Generic type for operation results
T = TypeVar("T")

# Type for async operations that can be executed with failover
ProviderOperation = Callable[[IAIProvider], Coroutine[Any, Any, T]]
