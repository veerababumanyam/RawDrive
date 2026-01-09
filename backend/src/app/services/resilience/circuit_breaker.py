"""Generic Microservice Circuit Breaker.

Provides circuit breaker protection for microservice calls with:
- Configurable failure thresholds (default: 3 for fast fail)
- Exponential backoff on retries (1s -> 2s -> 4s capped)
- Prometheus metrics integration
- Compatible with httpx.AsyncClient

Based on the AI circuit breaker pattern but generalized for microservices.

Example:
    breaker = MicroserviceCircuitBreaker(
        MicroserviceCircuitBreakerConfig(
            service_name="invitations-service",
            failure_threshold=3,
            recovery_time_ms=30000,
        )
    )

    try:
        result = await breaker.execute(lambda: client.post("/api/v1/..."))
    except CircuitBreakerOpen as e:
        # Service temporarily unavailable, fail fast
        return fallback_response()
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Optional, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")


class CircuitState(str, Enum):
    """Circuit breaker states.

    - CLOSED: Normal operation, requests flow through
    - OPEN: Failures exceeded threshold, requests rejected immediately
    - HALF_OPEN: Testing recovery, limited requests allowed through
    """

    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


@dataclass
class MicroserviceCircuitBreakerConfig:
    """Circuit breaker configuration for microservices.

    Tuned for faster failure detection than AI providers:
    - Lower failure threshold (3 vs 5)
    - Shorter recovery time (30s vs 60s)
    - Exponential backoff with cap

    Attributes:
        service_name: Name of the service (for logging and metrics)
        failure_threshold: Number of consecutive failures before opening (default: 3)
        recovery_time_ms: Time to wait before attempting recovery (default: 30000ms)
        half_open_requests: Successful requests needed to close circuit (default: 2)
        initial_backoff_ms: Initial backoff delay (default: 1000ms)
        backoff_multiplier: Multiplier for exponential backoff (default: 2.0)
        max_backoff_ms: Maximum backoff delay cap (default: 4000ms)
    """

    service_name: str
    failure_threshold: int = 3
    recovery_time_ms: int = 30000  # 30 seconds
    half_open_requests: int = 2
    initial_backoff_ms: int = 1000  # 1 second
    backoff_multiplier: float = 2.0
    max_backoff_ms: int = 4000  # 4 seconds cap

    def __post_init__(self) -> None:
        """Validate configuration values."""
        if self.failure_threshold < 1:
            raise ValueError("failure_threshold must be at least 1")
        if self.recovery_time_ms < 1000:
            raise ValueError("recovery_time_ms must be at least 1000ms")
        if self.half_open_requests < 1:
            raise ValueError("half_open_requests must be at least 1")
        if self.initial_backoff_ms < 100:
            raise ValueError("initial_backoff_ms must be at least 100ms")
        if self.max_backoff_ms < self.initial_backoff_ms:
            raise ValueError("max_backoff_ms must be >= initial_backoff_ms")


@dataclass
class CircuitBreakerStats:
    """Statistics for circuit breaker monitoring."""

    state: CircuitState
    failure_count: int
    success_count: int
    last_failure_time: Optional[datetime]
    last_success_time: Optional[datetime]
    total_requests: int
    total_failures: int
    total_successes: int
    total_rejected: int
    time_in_current_state_ms: int
    current_backoff_ms: int


class CircuitBreakerOpen(Exception):
    """Raised when circuit breaker is open and rejecting requests.

    Attributes:
        service_name: Name of the service that is unavailable
        recovery_in_ms: Time until recovery will be attempted
    """

    def __init__(self, service_name: str, recovery_in_ms: int):
        self.service_name = service_name
        self.recovery_in_ms = recovery_in_ms
        super().__init__(
            f"Circuit breaker is open for {service_name}, "
            f"recovery in {recovery_in_ms}ms"
        )


class MicroserviceCircuitBreaker:
    """Circuit breaker for microservice calls.

    Implements the Circuit Breaker pattern to prevent cascading failures
    when downstream services become unavailable or start failing.

    Key differences from AI circuit breaker:
    - Lower failure threshold (3) for faster detection
    - Shorter recovery time (30s) for quicker recovery
    - Exponential backoff with 4s cap
    - No provider-specific error handling

    Thread-safe implementation using asyncio locks.
    """

    def __init__(self, config: MicroserviceCircuitBreakerConfig):
        """Initialize the circuit breaker.

        Args:
            config: Configuration for circuit breaker behavior
        """
        self._config = config
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._half_open_successes = 0
        self._last_failure_time: Optional[float] = None
        self._last_success_time: Optional[float] = None
        self._state_changed_at: float = time.time()
        self._current_backoff_ms = config.initial_backoff_ms

        # Statistics
        self._total_requests = 0
        self._total_failures = 0
        self._total_successes = 0
        self._total_rejected = 0

        # Lock for thread-safe state management
        self._lock = asyncio.Lock()

        # Initialize metrics
        self._init_metrics()

        logger.info(
            "Microservice circuit breaker initialized",
            extra={
                "service_name": config.service_name,
                "failure_threshold": config.failure_threshold,
                "recovery_time_ms": config.recovery_time_ms,
                "half_open_requests": config.half_open_requests,
            },
        )

    def _init_metrics(self) -> None:
        """Initialize Prometheus metrics for this circuit breaker."""
        try:
            from app.metrics.registry import circuit_breaker_state

            circuit_breaker_state.labels(service=self._config.service_name).set(0)
        except ImportError:
            # Metrics not available (e.g., in tests)
            pass

    @property
    def config(self) -> MicroserviceCircuitBreakerConfig:
        """Get the circuit breaker configuration."""
        return self._config

    @property
    def state(self) -> CircuitState:
        """Get the current circuit state."""
        return self._state

    @property
    def failure_count(self) -> int:
        """Get the current failure count."""
        return self._failure_count

    @property
    def is_open(self) -> bool:
        """Check if the circuit breaker is currently open.

        Note: This doesn't check for recovery opportunity.
        Use can_attempt() for a complete check.
        """
        return self._state == CircuitState.OPEN

    def can_attempt(self) -> bool:
        """Check if a request can be attempted.

        Returns True if:
        - Circuit is CLOSED (normal operation)
        - Circuit is HALF_OPEN (testing recovery)
        - Circuit is OPEN but recovery time has passed

        Returns:
            True if a request should be attempted
        """
        if self._state == CircuitState.CLOSED:
            return True
        if self._state == CircuitState.HALF_OPEN:
            return True
        if self._state == CircuitState.OPEN:
            return self._should_attempt_recovery()
        return False

    async def execute(self, operation: Callable[[], Any]) -> T:
        """Execute an operation through the circuit breaker.

        Args:
            operation: The async or sync operation to execute

        Returns:
            The result of the operation

        Raises:
            CircuitBreakerOpen: If circuit is open and not ready for recovery
            Exception: Any exception from the operation
        """
        async with self._lock:
            self._total_requests += 1

            # Check if we should attempt recovery from open state
            if self._state == CircuitState.OPEN:
                if self._should_attempt_recovery():
                    self._transition_to(CircuitState.HALF_OPEN)
                else:
                    recovery_remaining = self._get_recovery_time_remaining()
                    self._total_rejected += 1
                    self._record_metric("rejected")

                    logger.warning(
                        "Circuit breaker is open, rejecting request",
                        extra={
                            "service_name": self._config.service_name,
                            "state": self._state.value,
                            "recovery_in_ms": recovery_remaining,
                        },
                    )
                    raise CircuitBreakerOpen(
                        self._config.service_name,
                        recovery_remaining,
                    )

        # Execute the operation outside the lock
        try:
            if asyncio.iscoroutinefunction(operation):
                result = await operation()
            else:
                result = operation()
                if asyncio.iscoroutine(result):
                    result = await result

            async with self._lock:
                self._record_success()

            return result

        except Exception:
            async with self._lock:
                self._record_failure()
            raise

    def _should_attempt_recovery(self) -> bool:
        """Check if enough time has passed to attempt recovery."""
        if self._last_failure_time is None:
            return False

        elapsed_ms = (time.time() - self._last_failure_time) * 1000
        return elapsed_ms >= self._config.recovery_time_ms

    def _get_recovery_time_remaining(self) -> int:
        """Calculate remaining time until recovery attempt (in ms)."""
        if self._last_failure_time is None:
            return 0

        elapsed_ms = (time.time() - self._last_failure_time) * 1000
        return max(0, int(self._config.recovery_time_ms - elapsed_ms))

    def _record_success(self) -> None:
        """Record a successful operation."""
        self._success_count += 1
        self._total_successes += 1
        self._last_success_time = time.time()
        self._record_metric("success")

        if self._state == CircuitState.HALF_OPEN:
            self._half_open_successes += 1

            logger.debug(
                "Half-open success recorded",
                extra={
                    "service_name": self._config.service_name,
                    "half_open_successes": self._half_open_successes,
                    "required": self._config.half_open_requests,
                },
            )

            # Check if enough successes to close
            if self._half_open_successes >= self._config.half_open_requests:
                self._transition_to(CircuitState.CLOSED)

        elif self._state == CircuitState.CLOSED:
            # Reset failure count on success
            self._failure_count = 0
            self._current_backoff_ms = self._config.initial_backoff_ms

    def _record_failure(self) -> None:
        """Record a failed operation."""
        self._failure_count += 1
        self._total_failures += 1
        self._last_failure_time = time.time()
        self._record_metric("failure")

        if self._state == CircuitState.HALF_OPEN:
            # Any failure in half-open immediately reopens
            logger.warning(
                "Half-open failure, reopening circuit",
                extra={
                    "service_name": self._config.service_name,
                },
            )
            self._transition_to(CircuitState.OPEN)

        elif self._failure_count >= self._config.failure_threshold:
            # Threshold exceeded - open the circuit
            logger.warning(
                "Failure threshold exceeded, opening circuit",
                extra={
                    "service_name": self._config.service_name,
                    "failure_count": self._failure_count,
                    "threshold": self._config.failure_threshold,
                },
            )
            self._transition_to(CircuitState.OPEN)

    def _transition_to(self, new_state: CircuitState) -> None:
        """Transition to a new state."""
        previous_state = self._state
        self._state = new_state
        self._state_changed_at = time.time()

        # Reset counters based on new state
        if new_state == CircuitState.CLOSED:
            self._failure_count = 0
            self._success_count = 0
            self._half_open_successes = 0
            self._current_backoff_ms = self._config.initial_backoff_ms

        elif new_state == CircuitState.HALF_OPEN:
            self._half_open_successes = 0

        elif new_state == CircuitState.OPEN:
            # Calculate next backoff using exponential formula
            self._current_backoff_ms = min(
                int(self._current_backoff_ms * self._config.backoff_multiplier),
                self._config.max_backoff_ms,
            )
            self._record_opens_metric()

        # Update state metric
        state_value = {"closed": 0, "half_open": 1, "open": 2}[new_state.value]
        try:
            from app.metrics.registry import circuit_breaker_state

            circuit_breaker_state.labels(service=self._config.service_name).set(
                state_value
            )
        except ImportError:
            pass

        logger.info(
            "Circuit breaker state transition",
            extra={
                "service_name": self._config.service_name,
                "previous_state": previous_state.value,
                "new_state": new_state.value,
                "failure_count": self._failure_count,
                "current_backoff_ms": self._current_backoff_ms,
            },
        )

    def _record_metric(self, result: str) -> None:
        """Record call result metric."""
        try:
            from app.metrics.registry import circuit_breaker_calls_total

            circuit_breaker_calls_total.labels(
                service=self._config.service_name,
                result=result,
            ).inc()
        except ImportError:
            pass

    def _record_opens_metric(self) -> None:
        """Record circuit open event."""
        try:
            from app.metrics.registry import circuit_breaker_opens_total

            circuit_breaker_opens_total.labels(
                service=self._config.service_name,
            ).inc()
        except ImportError:
            pass

    def get_current_backoff_ms(self) -> int:
        """Get current backoff delay in milliseconds."""
        return self._current_backoff_ms

    def get_stats(self) -> CircuitBreakerStats:
        """Get statistics for monitoring."""
        return CircuitBreakerStats(
            state=self._state,
            failure_count=self._failure_count,
            success_count=self._success_count,
            last_failure_time=(
                datetime.fromtimestamp(self._last_failure_time, tz=timezone.utc)
                if self._last_failure_time
                else None
            ),
            last_success_time=(
                datetime.fromtimestamp(self._last_success_time, tz=timezone.utc)
                if self._last_success_time
                else None
            ),
            total_requests=self._total_requests,
            total_failures=self._total_failures,
            total_successes=self._total_successes,
            total_rejected=self._total_rejected,
            time_in_current_state_ms=int(
                (time.time() - self._state_changed_at) * 1000
            ),
            current_backoff_ms=self._current_backoff_ms,
        )

    def reset(self) -> None:
        """Manually reset the circuit breaker to closed state.

        Use with caution - typically for admin override scenarios.
        """
        logger.info(
            "Circuit breaker manually reset",
            extra={
                "service_name": self._config.service_name,
                "previous_state": self._state.value,
            },
        )
        self._transition_to(CircuitState.CLOSED)
        self._last_failure_time = None

    def force_open(self) -> None:
        """Manually open the circuit breaker.

        Useful for maintenance or known service issues.
        """
        logger.info(
            "Circuit breaker manually opened",
            extra={
                "service_name": self._config.service_name,
                "previous_state": self._state.value,
            },
        )
        self._transition_to(CircuitState.OPEN)
        self._last_failure_time = time.time()
