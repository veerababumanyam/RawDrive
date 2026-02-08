"""Resilience patterns for gallery-service.

Provides circuit breaker protection for all external service calls with:
- Configurable failure thresholds per service
- Exponential backoff with jitter
- Service-specific fallback strategies
- Prometheus metrics integration
- State monitoring and health checks
"""

from .circuit_breaker_factory import (
    CircuitBreakerFactory,
    get_circuit_breaker,
    get_all_circuit_breakers,
    reset_all_circuit_breakers,
)
from .fallback_strategies import (
    FallbackStrategy,
    CacheFallback,
    DefaultFallback,
    NullFallback,
)
from .service_configs import (
    ServiceConfig,
    AI_SERVICE_CONFIG,
    UPLOAD_SERVICE_CONFIG,
    BILLING_SERVICE_CONFIG,
    CLIENT_SERVICE_CONFIG,
    NOTIFICATIONS_SERVICE_CONFIG,
    WEBHOOKS_SERVICE_CONFIG,
    REDIS_CONFIG,
)

__all__ = [
    "CircuitBreakerFactory",
    "get_circuit_breaker",
    "get_all_circuit_breakers",
    "reset_all_circuit_breakers",
    "FallbackStrategy",
    "CacheFallback",
    "DefaultFallback",
    "NullFallback",
    "ServiceConfig",
    "AI_SERVICE_CONFIG",
    "UPLOAD_SERVICE_CONFIG",
    "BILLING_SERVICE_CONFIG",
    "CLIENT_SERVICE_CONFIG",
    "NOTIFICATIONS_SERVICE_CONFIG",
    "WEBHOOKS_SERVICE_CONFIG",
    "REDIS_CONFIG",
]
