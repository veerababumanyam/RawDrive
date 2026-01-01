"""
Circuit Breaker Pattern Implementation.

Prevents cascading failures by temporarily stopping requests
to failing services. The circuit opens after a threshold of
failures and closes again after a recovery period.

States:
- CLOSED: Normal operation, requests pass through
- OPEN: Service failing, requests rejected immediately
- HALF_OPEN: Testing recovery, limited requests allowed
"""

import asyncio
import time
from dataclasses import dataclass, field
from enum import Enum
from functools import wraps
from typing import Any, Callable, Optional, TypeVar, Awaitable

from src.logging import get_logger

logger = get_logger(__name__)


class CircuitState(str, Enum):
    """Circuit breaker states."""

    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreakerOpen(Exception):
    """Exception raised when circuit breaker is open."""

    def __init__(self, name: str, until: float):
        self.name = name
        self.until = until
        remaining = until - time.monotonic()
        super().__init__(
            f"Circuit breaker '{name}' is open. "
            f"Retry in {remaining:.1f} seconds."
        )


@dataclass
class CircuitBreakerConfig:
    """Configuration for circuit breaker behavior."""

    # Number of failures before opening the circuit
    failure_threshold: int = 5

    # Time in seconds the circuit stays open before testing recovery
    recovery_timeout: float = 30.0

    # Number of successful calls in half-open state to close circuit
    success_threshold: int = 3

    # Time window in seconds for counting failures
    failure_window: float = 60.0

    # Exceptions that should count as failures
    failure_exceptions: tuple = (Exception,)

    # Exceptions that should NOT count as failures (e.g., validation errors)
    excluded_exceptions: tuple = ()


@dataclass
class CircuitBreakerState:
    """Mutable state for a circuit breaker."""

    state: CircuitState = CircuitState.CLOSED
    failures: int = 0
    successes: int = 0
    last_failure_time: float = 0.0
    opened_at: float = 0.0
    failure_times: list = field(default_factory=list)


class CircuitBreaker:
    """
    Circuit breaker for protecting external service calls.

    Usage:
        breaker = CircuitBreaker("email-service")

        try:
            result = await breaker.call(send_email, recipient, subject, body)
        except CircuitBreakerOpen:
            # Handle degraded mode
            await queue_email_for_retry(recipient, subject, body)

        # Or use as decorator
        @breaker.protect
        async def send_email(recipient, subject, body):
            ...
    """

    def __init__(
        self,
        name: str,
        config: Optional[CircuitBreakerConfig] = None,
    ):
        self.name = name
        self.config = config or CircuitBreakerConfig()
        self._state = CircuitBreakerState()
        self._lock = asyncio.Lock()

    @property
    def state(self) -> CircuitState:
        """Get current circuit state."""
        return self._state.state

    @property
    def is_closed(self) -> bool:
        """Check if circuit is closed (normal operation)."""
        return self._state.state == CircuitState.CLOSED

    @property
    def is_open(self) -> bool:
        """Check if circuit is open (rejecting requests)."""
        return self._state.state == CircuitState.OPEN

    @property
    def is_half_open(self) -> bool:
        """Check if circuit is half-open (testing recovery)."""
        return self._state.state == CircuitState.HALF_OPEN

    def _should_count_failure(self, exc: Exception) -> bool:
        """Determine if an exception should count as a failure."""
        if isinstance(exc, self.config.excluded_exceptions):
            return False
        return isinstance(exc, self.config.failure_exceptions)

    def _cleanup_old_failures(self) -> None:
        """Remove failures outside the failure window."""
        cutoff = time.monotonic() - self.config.failure_window
        self._state.failure_times = [
            t for t in self._state.failure_times if t > cutoff
        ]

    async def _transition_to_open(self) -> None:
        """Transition circuit to open state."""
        self._state.state = CircuitState.OPEN
        self._state.opened_at = time.monotonic()
        self._state.successes = 0

        logger.warning(
            "circuit_breaker_opened",
            name=self.name,
            failures=self._state.failures,
            recovery_timeout=self.config.recovery_timeout,
        )

    async def _transition_to_closed(self) -> None:
        """Transition circuit to closed state."""
        self._state.state = CircuitState.CLOSED
        self._state.failures = 0
        self._state.successes = 0
        self._state.failure_times = []

        logger.info(
            "circuit_breaker_closed",
            name=self.name,
        )

    async def _transition_to_half_open(self) -> None:
        """Transition circuit to half-open state."""
        self._state.state = CircuitState.HALF_OPEN
        self._state.successes = 0

        logger.info(
            "circuit_breaker_half_open",
            name=self.name,
        )

    async def _check_recovery(self) -> bool:
        """Check if recovery timeout has passed."""
        if not self.is_open:
            return True

        elapsed = time.monotonic() - self._state.opened_at
        if elapsed >= self.config.recovery_timeout:
            await self._transition_to_half_open()
            return True

        return False

    async def _record_success(self) -> None:
        """Record a successful call."""
        async with self._lock:
            if self.is_half_open:
                self._state.successes += 1
                if self._state.successes >= self.config.success_threshold:
                    await self._transition_to_closed()

    async def _record_failure(self, exc: Exception) -> None:
        """Record a failed call."""
        async with self._lock:
            if not self._should_count_failure(exc):
                return

            now = time.monotonic()
            self._state.failures += 1
            self._state.failure_times.append(now)
            self._state.last_failure_time = now

            # Clean up old failures
            self._cleanup_old_failures()

            # Check if we should open the circuit
            if self.is_closed:
                if len(self._state.failure_times) >= self.config.failure_threshold:
                    await self._transition_to_open()
            elif self.is_half_open:
                # Any failure in half-open reopens the circuit
                await self._transition_to_open()

    async def call(
        self,
        func: Callable[..., Awaitable[Any]],
        *args,
        **kwargs,
    ) -> Any:
        """
        Execute a function through the circuit breaker.

        Args:
            func: Async function to call
            *args: Positional arguments for func
            **kwargs: Keyword arguments for func

        Returns:
            Result of func

        Raises:
            CircuitBreakerOpen: If circuit is open
        """
        # Check if circuit is open
        if self.is_open:
            if not await self._check_recovery():
                until = self._state.opened_at + self.config.recovery_timeout
                raise CircuitBreakerOpen(self.name, until)

        try:
            result = await func(*args, **kwargs)
            await self._record_success()
            return result
        except Exception as e:
            await self._record_failure(e)
            raise

    def protect(
        self,
        func: Callable[..., Awaitable[Any]],
    ) -> Callable[..., Awaitable[Any]]:
        """
        Decorator to protect an async function with the circuit breaker.

        Usage:
            @breaker.protect
            async def call_external_service():
                ...
        """

        @wraps(func)
        async def wrapper(*args, **kwargs):
            return await self.call(func, *args, **kwargs)

        return wrapper

    def get_stats(self) -> dict:
        """Get current circuit breaker statistics."""
        return {
            "name": self.name,
            "state": self._state.state.value,
            "failures": self._state.failures,
            "successes": self._state.successes,
            "recent_failures": len(self._state.failure_times),
            "failure_threshold": self.config.failure_threshold,
            "recovery_timeout": self.config.recovery_timeout,
        }

    async def reset(self) -> None:
        """Manually reset the circuit breaker to closed state."""
        async with self._lock:
            await self._transition_to_closed()


# =============================================================================
# Global Circuit Breakers for Common Services
# =============================================================================

_circuit_breakers: dict[str, CircuitBreaker] = {}


def get_circuit_breaker(
    name: str,
    config: Optional[CircuitBreakerConfig] = None,
) -> CircuitBreaker:
    """
    Get or create a named circuit breaker.

    Args:
        name: Unique name for the circuit breaker
        config: Optional configuration (only used on first call)

    Returns:
        CircuitBreaker instance
    """
    if name not in _circuit_breakers:
        _circuit_breakers[name] = CircuitBreaker(name, config)
    return _circuit_breakers[name]


# Pre-configured breakers for common services
email_breaker = get_circuit_breaker(
    "email-service",
    CircuitBreakerConfig(
        failure_threshold=3,
        recovery_timeout=60.0,
        success_threshold=2,
    ),
)

analytics_breaker = get_circuit_breaker(
    "analytics-service",
    CircuitBreakerConfig(
        failure_threshold=5,
        recovery_timeout=30.0,
        success_threshold=3,
    ),
)
