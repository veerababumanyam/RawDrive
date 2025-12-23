"""AI Provider Services.

This package contains services for AI provider management including:
- Circuit breaker for fault tolerance
- Retry strategy with exponential backoff
- Provider implementations (Cloud Vision, Gemini)
- Provider manager for failover handling
"""

from app.services.ai.circuit_breaker import (
    CircuitBreaker,
    CircuitBreakerConfig,
    CircuitState,
)
from app.services.ai.retry_strategy import (
    RetryConfig,
    with_retry,
    is_transient_error,
    DEFAULT_RETRY_CONFIG,
)

__all__ = [
    # Circuit Breaker
    "CircuitBreaker",
    "CircuitBreakerConfig",
    "CircuitState",
    # Retry Strategy
    "RetryConfig",
    "with_retry",
    "is_transient_error",
    "DEFAULT_RETRY_CONFIG",
]
