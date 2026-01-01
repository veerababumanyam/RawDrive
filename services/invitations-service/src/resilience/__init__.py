"""
Resilience Module for the Invitations Microservice.

Provides fault tolerance patterns:
- Circuit breaker for external service calls
- Retry logic with exponential backoff
- Fallback strategies for graceful degradation
- Timeout handling
"""

from src.resilience.circuit_breaker import (
    CircuitBreaker,
    CircuitBreakerOpen,
    CircuitState,
)
from src.resilience.retry import (
    RetryPolicy,
    retry_with_backoff,
    exponential_backoff,
)
from src.resilience.fallback import (
    FallbackHandler,
    with_fallback,
)

__all__ = [
    "CircuitBreaker",
    "CircuitBreakerOpen",
    "CircuitState",
    "RetryPolicy",
    "retry_with_backoff",
    "exponential_backoff",
    "FallbackHandler",
    "with_fallback",
]
