"""Circuit breaker pattern for AI Service.

Implements circuit breaker pattern to prevent cascading failures.
Addresses MEDIUM priority from SECURITY_REVIEW.md: No Circuit Breaker
"""

import os
import logging
from functools import wraps
from typing import Callable, Any, Optional
from datetime import datetime

from circuitbreaker import circuit, CircuitBreaker, CircuitBreakerError

logger = logging.getLogger(__name__)

# Circuit breaker configuration from environment
CIRCUIT_FAILURE_THRESHOLD = int(os.getenv("CIRCUIT_BREAKER_FAILURE_THRESHOLD", "5"))
CIRCUIT_RECOVERY_TIMEOUT = int(os.getenv("CIRCUIT_BREAKER_RECOVERY_TIMEOUT", "30"))
CIRCUIT_EXPECTED_EXCEPTION = Exception


class AIServiceCircuitBreaker(CircuitBreaker):
    """Custom circuit breaker for AI service operations."""
    
    FAILURE_THRESHOLD = CIRCUIT_FAILURE_THRESHOLD
    RECOVERY_TIMEOUT = CIRCUIT_RECOVERY_TIMEOUT
    EXPECTED_EXCEPTION = CIRCUIT_EXPECTED_EXCEPTION
    
    def __init__(self, name: str = "ai_service", **kwargs):
        super().__init__(**kwargs)
        self._name = name
        self._last_failure: Optional[datetime] = None
        self._failure_messages: list[str] = []
    
    def on_failure(self, exc: Exception) -> None:
        """Called when a failure occurs."""
        self._last_failure = datetime.utcnow()
        self._failure_messages.append(str(exc))
        # Keep only last 10 failure messages
        self._failure_messages = self._failure_messages[-10:]
        logger.warning(
            f"Circuit breaker [{self._name}] failure #{self.failure_count}: {exc}"
        )
    
    def on_open(self) -> None:
        """Called when circuit opens (too many failures)."""
        logger.error(
            f"Circuit breaker [{self._name}] OPENED after {self.failure_count} failures. "
            f"Recovery in {CIRCUIT_RECOVERY_TIMEOUT}s"
        )
    
    def on_close(self) -> None:
        """Called when circuit closes (recovered)."""
        logger.info(f"Circuit breaker [{self._name}] CLOSED - service recovered")
        self._failure_messages.clear()
    
    def get_status(self) -> dict:
        """Get current circuit breaker status."""
        return {
            "name": self._name,
            "state": self.state.name if hasattr(self.state, 'name') else str(self.state),
            "failure_count": self.failure_count,
            "failure_threshold": CIRCUIT_FAILURE_THRESHOLD,
            "recovery_timeout": CIRCUIT_RECOVERY_TIMEOUT,
            "last_failure": self._last_failure.isoformat() if self._last_failure else None,
            "recent_failures": self._failure_messages[-5:],
        }


# Named circuit breakers for different services
_circuit_breakers: dict[str, AIServiceCircuitBreaker] = {}


def get_circuit_breaker(name: str) -> AIServiceCircuitBreaker:
    """Get or create a named circuit breaker."""
    if name not in _circuit_breakers:
        _circuit_breakers[name] = AIServiceCircuitBreaker(name=name)
    return _circuit_breakers[name]


def get_all_circuit_breaker_status() -> dict[str, dict]:
    """Get status of all circuit breakers."""
    return {name: cb.get_status() for name, cb in _circuit_breakers.items()}


# Pre-configured circuit breakers for common services
ai_processing_breaker = get_circuit_breaker("ai_processing")
database_breaker = get_circuit_breaker("database")
redis_breaker = get_circuit_breaker("redis")
milvus_breaker = get_circuit_breaker("milvus")


def circuit_protected(circuit_name: str = "default", fallback: Optional[Callable] = None):
    """Decorator to protect a function with a circuit breaker.
    
    Args:
        circuit_name: Name of the circuit breaker to use
        fallback: Optional fallback function to call when circuit is open
        
    Usage:
        @circuit_protected("ai_processing")
        async def call_ai_processing():
            ...
            
        @circuit_protected("database", fallback=lambda: {"status": "degraded"})
        async def query_database():
            ...
    """
    def decorator(func: Callable):
        cb = get_circuit_breaker(circuit_name)
        
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            try:
                with cb:
                    return await func(*args, **kwargs)
            except CircuitBreakerError as e:
                logger.error(f"Circuit [{circuit_name}] is OPEN, call blocked")
                if fallback:
                    return fallback(*args, **kwargs) if callable(fallback) else fallback
                raise
        
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            try:
                with cb:
                    return func(*args, **kwargs)
            except CircuitBreakerError as e:
                logger.error(f"Circuit [{circuit_name}] is OPEN, call blocked")
                if fallback:
                    return fallback(*args, **kwargs) if callable(fallback) else fallback
                raise
        
        # Return appropriate wrapper based on function type
        if hasattr(func, '__wrapped__') or func.__code__.co_flags & 0x80:  # CO_COROUTINE
            return async_wrapper
        return sync_wrapper
    
    return decorator


class CircuitOpenError(Exception):
    """Raised when a circuit breaker is open and call is blocked."""
    
    def __init__(self, circuit_name: str, message: str = None):
        self.circuit_name = circuit_name
        self.message = message or f"Circuit breaker '{circuit_name}' is OPEN"
        super().__init__(self.message)
