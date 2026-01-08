"""Circuit Breaker Pattern Implementation.

Prevents cascading failures when calling external services (ai-service).
Implements the circuit breaker pattern with three states:
- CLOSED: Normal operation, requests pass through
- OPEN: Too many failures, requests fail immediately
- HALF_OPEN: Testing if service recovered

Architecture: Protects gallery-service from ai-service failures
"""

import time
from enum import Enum
from typing import Callable, Any, TypeVar, Generic
import asyncio
from datetime import datetime

from src.log_config import get_logger
from src.observability.metrics import get_metrics

logger = get_logger(__name__)
metrics = get_metrics()

T = TypeVar('T')


class CircuitState(Enum):
    """Circuit breaker states."""
    CLOSED = "closed"        # Normal operation
    OPEN = "open"            # Circuit is open, failing fast
    HALF_OPEN = "half_open"  # Testing if service recovered


class CircuitBreakerError(Exception):
    """Raised when circuit breaker is open."""

    def __init__(self, message: str, service: str, open_until: datetime):
        super().__init__(message)
        self.service = service
        self.open_until = open_until


class CircuitBreaker(Generic[T]):
    """Circuit breaker for protecting against cascading failures.

    Usage:
        breaker = CircuitBreaker("ai-service", failure_threshold=5, timeout=60)

        try:
            result = await breaker.call(some_async_function, arg1, arg2)
        except CircuitBreakerError:
            # Circuit is open, use fallback
            result = fallback_value

    Args:
        service_name: Name of the service being protected
        failure_threshold: Number of failures before opening circuit
        timeout: Seconds to wait before attempting half-open state
        success_threshold: Number of successes in half-open before closing
    """

    def __init__(
        self,
        service_name: str,
        failure_threshold: int = 5,
        timeout: int = 60,
        success_threshold: int = 2,
    ):
        self.service_name = service_name
        self.failure_threshold = failure_threshold
        self.timeout = timeout  # seconds
        self.success_threshold = success_threshold

        # State
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.success_count = 0
        self.last_failure_time: float | None = None
        self.opened_at: float | None = None

        logger.info(
            f"Circuit breaker initialized for {service_name}: "
            f"threshold={failure_threshold}, timeout={timeout}s"
        )

    async def call(self, func: Callable[..., Any], *args, **kwargs) -> Any:
        """Execute function with circuit breaker protection.

        Args:
            func: Async function to execute
            *args: Positional arguments for function
            **kwargs: Keyword arguments for function

        Returns:
            Result from function call

        Raises:
            CircuitBreakerError: If circuit is open
            Exception: Original exception if circuit is closed
        """
        # Check circuit state
        if self.state == CircuitState.OPEN:
            if self._should_attempt_reset():
                self._transition_to_half_open()
            else:
                # Circuit still open, fail fast
                open_until = datetime.fromtimestamp(self.opened_at + self.timeout)
                logger.warning(
                    f"Circuit breaker OPEN for {self.service_name}, "
                    f"failing fast (open until {open_until})"
                )
                metrics.counter_inc(
                    "gallery_circuit_breaker_rejected_total",
                    {"service": self.service_name, "state": "open"}
                )
                raise CircuitBreakerError(
                    f"Circuit breaker is OPEN for {self.service_name}",
                    service=self.service_name,
                    open_until=open_until,
                )

        # Attempt to call function
        try:
            result = await func(*args, **kwargs)
            self._on_success()
            return result

        except Exception as e:
            self._on_failure()
            raise

    def _should_attempt_reset(self) -> bool:
        """Check if enough time has passed to attempt reset."""
        if self.opened_at is None:
            return False
        return time.time() - self.opened_at >= self.timeout

    def _transition_to_half_open(self):
        """Transition from OPEN to HALF_OPEN state."""
        logger.info(
            f"Circuit breaker transitioning to HALF_OPEN for {self.service_name}"
        )
        self.state = CircuitState.HALF_OPEN
        self.success_count = 0

        metrics.gauge_set(
            "gallery_circuit_breaker_state",
            1,  # 0=CLOSED, 1=HALF_OPEN, 2=OPEN
            {"service": self.service_name}
        )

    def _on_success(self):
        """Handle successful function execution."""
        if self.state == CircuitState.HALF_OPEN:
            self.success_count += 1
            logger.debug(
                f"Circuit breaker success in HALF_OPEN: "
                f"{self.success_count}/{self.success_threshold}"
            )

            if self.success_count >= self.success_threshold:
                self._transition_to_closed()

        elif self.state == CircuitState.CLOSED:
            # Reset failure count on success
            self.failure_count = 0

        metrics.counter_inc(
            "gallery_circuit_breaker_calls_total",
            {"service": self.service_name, "result": "success"}
        )

    def _on_failure(self):
        """Handle failed function execution."""
        self.last_failure_time = time.time()
        self.failure_count += 1

        logger.warning(
            f"Circuit breaker failure for {self.service_name}: "
            f"{self.failure_count}/{self.failure_threshold}"
        )

        if self.state == CircuitState.HALF_OPEN:
            # Any failure in half-open transitions back to open
            self._transition_to_open()

        elif self.state == CircuitState.CLOSED:
            if self.failure_count >= self.failure_threshold:
                self._transition_to_open()

        metrics.counter_inc(
            "gallery_circuit_breaker_calls_total",
            {"service": self.service_name, "result": "failure"}
        )

    def _transition_to_open(self):
        """Transition to OPEN state."""
        logger.error(
            f"Circuit breaker OPENING for {self.service_name} "
            f"after {self.failure_count} failures"
        )
        self.state = CircuitState.OPEN
        self.opened_at = time.time()

        metrics.gauge_set(
            "gallery_circuit_breaker_state",
            2,  # 0=CLOSED, 1=HALF_OPEN, 2=OPEN
            {"service": self.service_name}
        )
        metrics.counter_inc(
            "gallery_circuit_breaker_opened_total",
            {"service": self.service_name}
        )

    def _transition_to_closed(self):
        """Transition to CLOSED state."""
        logger.info(
            f"Circuit breaker CLOSING for {self.service_name} "
            f"after {self.success_count} successful attempts"
        )
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.success_count = 0
        self.opened_at = None

        metrics.gauge_set(
            "gallery_circuit_breaker_state",
            0,  # 0=CLOSED, 1=HALF_OPEN, 2=OPEN
            {"service": self.service_name}
        )

    def get_state(self) -> dict:
        """Get current circuit breaker state for monitoring.

        Returns:
            Dictionary with circuit breaker state information
        """
        return {
            "service_name": self.service_name,
            "state": self.state.value,
            "failure_count": self.failure_count,
            "success_count": self.success_count,
            "failure_threshold": self.failure_threshold,
            "success_threshold": self.success_threshold,
            "timeout": self.timeout,
            "last_failure_time": datetime.fromtimestamp(self.last_failure_time).isoformat() if self.last_failure_time else None,
            "opened_at": datetime.fromtimestamp(self.opened_at).isoformat() if self.opened_at else None,
        }

    def reset(self):
        """Manually reset the circuit breaker to CLOSED state."""
        logger.info(f"Circuit breaker manually reset for {self.service_name}")
        self._transition_to_closed()
