"""AI Provider implementations for face detection.

This module contains the AI provider implementations for face detection:
- BaseProvider: Abstract base class with common functionality
- CloudVisionProvider: Google Cloud Vision API (primary)
- GeminiProvider: Google Gemini API (fallback)
- ProviderManager: Handles provider selection and failover

The providers follow a multi-provider architecture with automatic failover
and circuit breaker protection to ensure high availability.
"""

from app.services.ai.providers.types import (
    IAIProvider,
    DetectionOptions,
    ProviderStatus,
    HealthCheckResult,
)
from app.services.ai.providers.base_provider import BaseProvider
from app.services.ai.providers.cloud_vision_provider import CloudVisionProvider
from app.services.ai.providers.gemini_provider import GeminiProvider
from app.services.ai.providers.provider_manager import ProviderManager

__all__ = [
    # Interfaces
    "IAIProvider",
    "DetectionOptions",
    "ProviderStatus",
    "HealthCheckResult",
    # Providers
    "BaseProvider",
    "CloudVisionProvider",
    "GeminiProvider",
    "ProviderManager",
]
