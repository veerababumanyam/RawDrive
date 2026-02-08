"""AI Service Integration Client.

Provides integration with the existing ai-service microservice for:
- Semantic photo search (CLIP embeddings)
- Emotion detection
- Vector search (Milvus)
- AI-powered gallery insights

Features:
- Circuit breaker pattern for resilience
- Exponential backoff with jitter for retries
- 2-second timeout to prevent cascading failures
- Fallback responses for graceful degradation
"""

from src.services.ai_client.ai_service_client import AIServiceClient
from src.services.ai_client.circuit_breaker import (
    CircuitBreaker,
    CircuitBreakerError,
    BackoffConfig,
    CircuitState,
)

__all__ = [
    "AIServiceClient",
    "CircuitBreaker",
    "CircuitBreakerError",
    "BackoffConfig",
    "CircuitState",
]
