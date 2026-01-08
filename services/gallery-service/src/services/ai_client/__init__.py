"""AI Service Integration Client.

Provides integration with the existing ai-service microservice for:
- Semantic photo search (CLIP embeddings)
- Emotion detection
- Vector search (Milvus)
- AI-powered gallery insights
"""

from src.services.ai_client.ai_service_client import AIServiceClient
from src.services.ai_client.circuit_breaker import CircuitBreaker, CircuitBreakerError

__all__ = ["AIServiceClient", "CircuitBreaker", "CircuitBreakerError"]
