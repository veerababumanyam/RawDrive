"""Resilience patterns for microservice communication.

This package provides:
- MicroserviceCircuitBreaker: Circuit breaker for service calls
- CircuitBreakerOpen: Exception when circuit is open

Usage:
    from app.services.resilience import (
        MicroserviceCircuitBreaker,
        MicroserviceCircuitBreakerConfig,
        CircuitBreakerOpen,
    )

    breaker = MicroserviceCircuitBreaker(
        MicroserviceCircuitBreakerConfig(
            service_name="invitations-service",
            failure_threshold=3,
            recovery_time_ms=30000,
        )
    )

    result = await breaker.execute(lambda: client.request(...))
"""

from app.services.resilience.circuit_breaker import (
    CircuitBreakerOpen,
    CircuitState,
    MicroserviceCircuitBreaker,
    MicroserviceCircuitBreakerConfig,
)

__all__ = [
    "CircuitBreakerOpen",
    "CircuitState",
    "MicroserviceCircuitBreaker",
    "MicroserviceCircuitBreakerConfig",
]
