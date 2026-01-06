"""Circuit breaker pattern for R2 storage operations.

Implements a circuit breaker to prevent cascading failures when
the R2 storage service becomes unavailable. Allows the system to
fail fast and recover gracefully.

States:
- CLOSED: Normal operation, requests go through
- OPEN: Failing fast, requests rejected immediately
- HALF_OPEN: Testing recovery, allowing limited requests

Author: Claude Code Migration
"""

from __future__ import annotations

import asyncio
import logging
import time
from enum import Enum
from typing import Any, Callable, Optional, TypeVar

from app.observability.metrics import (
    CIRCUIT_BREAKER_STATE,
    CIRCUIT_BREAKER_TRANSITIONS,
)

logger = logging.getLogger(__name__)

T = TypeVar("T")


class CircuitState(Enum):
    """Circuit breaker states."""

    CLOSED = 0
    OPEN = 1
    HALF_OPEN = 2


class CircuitBreakerError(Exception):
    """Raised when circuit is open and request is rejected."""

    def __init__(
        self,
        message: str = "Circuit breaker is open",
        recovery_time_remaining_ms: int = 0,
    ) -> None:
        super().__init__(message)
        self.recovery_time_remaining_ms = recovery_time_remaining_ms


class StorageUnavailableError(CircuitBreakerError):
    """Raised when R2 storage is unavailable."""

    def __init__(self, recovery_time_remaining_ms: int = 0) -> None:
        super().__init__(
            "Storage service is temporarily unavailable. Please retry later.",
            recovery_time_remaining_ms,
        )


class CircuitBreaker:
    """Circuit breaker for protecting external service calls.

    Configuration:
    - failure_threshold: Number of failures before opening circuit
    - success_threshold: Number of successes in half-open to close
    - recovery_timeout: Seconds to wait before transitioning to half-open
    - half_open_max_calls: Max concurrent calls in half-open state

    Usage:
        breaker = CircuitBreaker("r2-storage")

        @breaker.protect
        async def upload_to_r2(...):
            ...

        # Or manually:
        async with breaker.call():
            result = await upload_to_r2(...)
    """

    def __init__(
        self,
        name: str,
        failure_threshold: int = 5,
        success_threshold: int = 3,
        recovery_timeout: float = 30.0,
        half_open_max_calls: int = 3,
    ) -> None:
        """Initialize circuit breaker.

        Args:
            name: Name for metrics and logging
            failure_threshold: Failures to trigger open state
            success_threshold: Successes in half-open to close circuit
            recovery_timeout: Seconds before trying again after opening
            half_open_max_calls: Max concurrent calls in half-open state
        """
        self.name = name
        self.failure_threshold = failure_threshold
        self.success_threshold = success_threshold
        self.recovery_timeout = recovery_timeout
        self.half_open_max_calls = half_open_max_calls

        # State
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._last_failure_time: float = 0
        self._half_open_calls = 0
        self._lock = asyncio.Lock()

        # Initialize metrics
        CIRCUIT_BREAKER_STATE.labels(service=name).set(self._state.value)

    @property
    def state(self) -> CircuitState:
        """Get current circuit state."""
        return self._state

    @property
    def is_closed(self) -> bool:
        """Check if circuit is closed (normal operation)."""
        return self._state == CircuitState.CLOSED

    @property
    def is_open(self) -> bool:
        """Check if circuit is open (failing fast)."""
        return self._state == CircuitState.OPEN

    @property
    def is_half_open(self) -> bool:
        """Check if circuit is half-open (testing recovery)."""
        return self._state == CircuitState.HALF_OPEN

    def _get_recovery_time_remaining_ms(self) -> int:
        """Get milliseconds remaining before recovery attempt."""
        if not self.is_open:
            return 0
        elapsed = time.time() - self._last_failure_time
        remaining = max(0, self.recovery_timeout - elapsed)
        return int(remaining * 1000)

    async def _transition(self, new_state: CircuitState) -> None:
        """Transition to a new state.

        Args:
            new_state: Target state
        """
        old_state = self._state
        if old_state == new_state:
            return

        self._state = new_state
        logger.info(
            "Circuit breaker state transition",
            extra={
                "name": self.name,
                "from_state": old_state.name,
                "to_state": new_state.name,
            },
        )

        # Update metrics
        CIRCUIT_BREAKER_STATE.labels(service=self.name).set(new_state.value)
        CIRCUIT_BREAKER_TRANSITIONS.labels(
            service=self.name,
            from_state=old_state.name,
            to_state=new_state.name,
        ).inc()

        # Reset counters on state change
        if new_state == CircuitState.CLOSED:
            self._failure_count = 0
            self._success_count = 0
        elif new_state == CircuitState.HALF_OPEN:
            self._half_open_calls = 0
            self._success_count = 0

    async def _check_state(self) -> None:
        """Check if state should transition based on current conditions."""
        if self._state == CircuitState.OPEN:
            # Check if recovery timeout has passed
            elapsed = time.time() - self._last_failure_time
            if elapsed >= self.recovery_timeout:
                await self._transition(CircuitState.HALF_OPEN)

    async def record_success(self) -> None:
        """Record a successful call."""
        async with self._lock:
            if self._state == CircuitState.HALF_OPEN:
                self._success_count += 1
                self._half_open_calls = max(0, self._half_open_calls - 1)

                # Check if we should close the circuit
                if self._success_count >= self.success_threshold:
                    await self._transition(CircuitState.CLOSED)

            elif self._state == CircuitState.CLOSED:
                # Reset failure count on success
                self._failure_count = 0

    async def record_failure(self, error: Optional[Exception] = None) -> None:
        """Record a failed call.

        Args:
            error: The exception that caused the failure
        """
        async with self._lock:
            self._failure_count += 1
            self._last_failure_time = time.time()

            if self._state == CircuitState.HALF_OPEN:
                # Single failure in half-open reopens circuit
                self._half_open_calls = max(0, self._half_open_calls - 1)
                await self._transition(CircuitState.OPEN)

            elif self._state == CircuitState.CLOSED:
                # Check if we should open the circuit
                if self._failure_count >= self.failure_threshold:
                    logger.warning(
                        "Circuit breaker opened",
                        extra={
                            "name": self.name,
                            "failure_count": self._failure_count,
                            "error": str(error) if error else None,
                        },
                    )
                    await self._transition(CircuitState.OPEN)

    async def can_execute(self) -> bool:
        """Check if a call can be executed.

        Returns:
            True if call should proceed, False if rejected
        """
        async with self._lock:
            await self._check_state()

            if self._state == CircuitState.CLOSED:
                return True

            if self._state == CircuitState.HALF_OPEN:
                # Allow limited calls in half-open
                if self._half_open_calls < self.half_open_max_calls:
                    self._half_open_calls += 1
                    return True
                return False

            # Circuit is open
            return False

    class CallContext:
        """Context manager for protected calls."""

        def __init__(self, breaker: "CircuitBreaker") -> None:
            self.breaker = breaker
            self.success = False

        async def __aenter__(self) -> "CircuitBreaker.CallContext":
            can_exec = await self.breaker.can_execute()
            if not can_exec:
                remaining_ms = self.breaker._get_recovery_time_remaining_ms()
                raise StorageUnavailableError(remaining_ms)
            return self

        async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
            if exc_type is None:
                await self.breaker.record_success()
            else:
                await self.breaker.record_failure(exc_val)

    def call(self) -> CallContext:
        """Get a context manager for a protected call.

        Usage:
            async with breaker.call():
                result = await risky_operation()
        """
        return self.CallContext(self)

    def protect(self, func: Callable[..., T]) -> Callable[..., T]:
        """Decorator to protect an async function with circuit breaker.

        Usage:
            @breaker.protect
            async def risky_operation():
                ...
        """
        async def wrapper(*args: Any, **kwargs: Any) -> T:
            async with self.call():
                return await func(*args, **kwargs)

        return wrapper

    def reset(self) -> None:
        """Force reset the circuit breaker to closed state.

        Use with caution - typically for testing or manual intervention.
        """
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._half_open_calls = 0
        CIRCUIT_BREAKER_STATE.labels(service=self.name).set(0)
        logger.info("Circuit breaker manually reset", extra={"name": self.name})


# =============================================================================
# Global Circuit Breakers
# =============================================================================

# R2 Storage circuit breaker
_r2_circuit_breaker: Optional[CircuitBreaker] = None


def get_r2_circuit_breaker() -> CircuitBreaker:
    """Get the R2 storage circuit breaker.

    Returns:
        CircuitBreaker instance for R2 operations
    """
    global _r2_circuit_breaker
    if _r2_circuit_breaker is None:
        _r2_circuit_breaker = CircuitBreaker(
            name="r2-storage",
            failure_threshold=5,
            success_threshold=3,
            recovery_timeout=30.0,
            half_open_max_calls=3,
        )
    return _r2_circuit_breaker


def reset_circuit_breakers() -> None:
    """Reset all circuit breakers (for testing)."""
    global _r2_circuit_breaker
    if _r2_circuit_breaker:
        _r2_circuit_breaker.reset()


# =============================================================================
# Module Exports
# =============================================================================

__all__ = [
    "CircuitState",
    "CircuitBreakerError",
    "StorageUnavailableError",
    "CircuitBreaker",
    "get_r2_circuit_breaker",
    "reset_circuit_breakers",
]
