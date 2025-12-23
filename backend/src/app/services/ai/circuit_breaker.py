"""Circuit Breaker Implementation for AI Providers.

This module implements the Circuit Breaker pattern to prevent cascading failures
when AI providers become unavailable or start failing.

The circuit breaker has three states:
- CLOSED: Normal operation, requests flow through
- OPEN: Failures exceeded threshold, requests are rejected immediately
- HALF_OPEN: Testing recovery, limited requests allowed through

Key features:
- Automatic state transitions based on failure/success counts
- Configurable failure threshold and recovery time
- Thread-safe state management
- Detailed logging for monitoring and debugging

Requirements covered:
- 10.3: Circuit breaker opens after threshold failures
- 10.4: Unhealthy providers excluded from selection until recovery

Example:
    breaker = CircuitBreaker(CircuitBreakerConfig(
        failure_threshold=5,
        recovery_time_ms=60000,
        half_open_requests=3,
    ))
    
    try:
        result = await breaker.execute(lambda: provider.detect_faces(image))
    except ProviderUnavailableError:
        # Circuit is open, provider temporarily unavailable
        pass
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Generic, Optional, TypeVar

from app.api.face_schemas import FaceDetectionErrorCode
from app.services.face_exceptions import ProviderUnavailableError

logger = logging.getLogger(__name__)


# =============================================================================
# TYPE DEFINITIONS
# =============================================================================

T = TypeVar("T")  # Generic type for operation results


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
class CircuitBreakerConfig:
    """Configuration for circuit breaker behavior.
    
    Tune these values based on provider characteristics and SLAs.
    
    Attributes:
        failure_threshold: Number of consecutive failures before opening circuit
        recovery_time_ms: Time in ms to wait before attempting recovery
        half_open_requests: Number of successful requests needed to close circuit
        name: Optional name for logging and identification
    """
    failure_threshold: int = 5
    recovery_time_ms: int = 60000  # 60 seconds
    half_open_requests: int = 3
    name: str = "default"
    
    def __post_init__(self) -> None:
        """Validate configuration values."""
        if self.failure_threshold < 1:
            raise ValueError("failure_threshold must be at least 1")
        if self.recovery_time_ms < 1000:
            raise ValueError("recovery_time_ms must be at least 1000ms")
        if self.half_open_requests < 1:
            raise ValueError("half_open_requests must be at least 1")


@dataclass
class CircuitBreakerStats:
    """Statistics for circuit breaker monitoring.
    
    Useful for dashboards and alerting.
    """
    state: CircuitState
    failure_count: int
    success_count: int
    last_failure_time: Optional[datetime]
    last_success_time: Optional[datetime]
    total_requests: int
    total_failures: int
    total_successes: int
    time_in_current_state_ms: int


# =============================================================================
# CIRCUIT BREAKER IMPLEMENTATION
# =============================================================================


class CircuitBreaker(Generic[T]):
    """Implements the Circuit Breaker pattern to prevent cascading failures.
    
    When a provider fails repeatedly, the circuit "opens" and immediately
    rejects requests without calling the provider. After a recovery period,
    it enters "half-open" state to test if the provider has recovered.
    
    Thread-safe implementation using asyncio locks for concurrent access.
    
    Example:
        breaker = CircuitBreaker(CircuitBreakerConfig(
            failure_threshold=5,
            recovery_time_ms=60000,
            half_open_requests=3,
            name="cloud_vision",
        ))
        
        # Execute operation through circuit breaker
        result = await breaker.execute(lambda: provider.detect_faces(image))
        
        # Check if circuit is open before attempting
        if not breaker.is_open():
            result = await breaker.execute(operation)
    """

    def __init__(self, config: CircuitBreakerConfig) -> None:
        """Initialize the circuit breaker.
        
        Args:
            config: Configuration for circuit breaker behavior
        """
        self._config = config
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._half_open_successes = 0
        self._half_open_failures = 0
        self._last_failure_time: Optional[float] = None
        self._last_success_time: Optional[float] = None
        self._state_changed_at: float = time.time()
        
        # Statistics for monitoring
        self._total_requests = 0
        self._total_failures = 0
        self._total_successes = 0
        
        # Lock for thread-safe state management
        self._lock = asyncio.Lock()
        
        logger.info(
            "Circuit breaker initialized",
            extra={
                "breaker_name": config.name,
                "failure_threshold": config.failure_threshold,
                "recovery_time_ms": config.recovery_time_ms,
                "half_open_requests": config.half_open_requests,
            },
        )

    @property
    def config(self) -> CircuitBreakerConfig:
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

    async def execute(
        self, 
        operation: Callable[[], Any],
        correlation_id: Optional[str] = None,
    ) -> T:
        """Executes an operation through the circuit breaker.
        
        Args:
            operation: The async or sync operation to execute
            correlation_id: Optional correlation ID for tracing
            
        Returns:
            The result of the operation
            
        Raises:
            ProviderUnavailableError: If circuit is open
            Exception: The original error if operation fails
        """
        async with self._lock:
            self._total_requests += 1
            
            # Check if we should attempt recovery from open state
            if self._state == CircuitState.OPEN:
                if self._should_attempt_recovery():
                    # Transition to half-open to test recovery
                    self._transition_to(CircuitState.HALF_OPEN)
                else:
                    # Circuit is open - fail fast without calling provider
                    recovery_remaining = self._get_recovery_time_remaining()
                    logger.warning(
                        "Circuit breaker is open, rejecting request",
                        extra={
                            "breaker_name": self._config.name,
                            "state": self._state.value,
                            "recovery_in_ms": recovery_remaining,
                            "correlation_id": correlation_id,
                        },
                    )
                    raise ProviderUnavailableError(
                        provider_name=self._config.name,
                        reason=f"Circuit breaker is open, recovery in {recovery_remaining}ms",
                        correlation_id=correlation_id,
                    )

        # Execute the operation outside the lock to avoid blocking
        try:
            # Handle both sync and async operations
            if asyncio.iscoroutinefunction(operation):
                result = await operation()
            else:
                result = operation()
                # If result is a coroutine, await it
                if asyncio.iscoroutine(result):
                    result = await result
            
            # Record success
            async with self._lock:
                self._record_success()
            
            return result
            
        except Exception as error:
            # Record failure
            async with self._lock:
                self._record_failure()
            raise

    def is_open(self) -> bool:
        """Checks if the circuit breaker is currently open.
        
        Used by ProviderManager to skip unavailable providers.
        
        Returns:
            True if circuit is open and should not accept requests
        """
        # Check for recovery opportunity before reporting state
        if self._state == CircuitState.OPEN and self._should_attempt_recovery():
            # Don't transition here - let execute() handle it
            return False
        return self._state == CircuitState.OPEN

    def is_healthy(self) -> bool:
        """Checks if the circuit breaker indicates a healthy provider.
        
        Returns:
            True if circuit is closed (healthy)
        """
        return self._state == CircuitState.CLOSED

    def get_state(self) -> CircuitState:
        """Returns the current state of the circuit breaker.
        
        Useful for monitoring and debugging.
        """
        return self._state

    def get_stats(self) -> CircuitBreakerStats:
        """Returns statistics for monitoring.
        
        Returns:
            CircuitBreakerStats with current metrics
        """
        return CircuitBreakerStats(
            state=self._state,
            failure_count=self._failure_count,
            success_count=self._success_count,
            last_failure_time=(
                datetime.fromtimestamp(self._last_failure_time, tz=timezone.utc)
                if self._last_failure_time else None
            ),
            last_success_time=(
                datetime.fromtimestamp(self._last_success_time, tz=timezone.utc)
                if self._last_success_time else None
            ),
            total_requests=self._total_requests,
            total_failures=self._total_failures,
            total_successes=self._total_successes,
            time_in_current_state_ms=int((time.time() - self._state_changed_at) * 1000),
        )

    def _should_attempt_recovery(self) -> bool:
        """Determines if enough time has passed to attempt recovery.
        
        Returns:
            True if recovery should be attempted
        """
        if self._last_failure_time is None:
            return False
        
        elapsed_ms = (time.time() - self._last_failure_time) * 1000
        return elapsed_ms >= self._config.recovery_time_ms

    def _get_recovery_time_remaining(self) -> int:
        """Calculates remaining time until recovery attempt (in ms).
        
        Returns:
            Milliseconds until recovery, or 0 if ready
        """
        if self._last_failure_time is None:
            return 0
        
        elapsed_ms = (time.time() - self._last_failure_time) * 1000
        return max(0, int(self._config.recovery_time_ms - elapsed_ms))

    def _record_success(self) -> None:
        """Records a successful operation.
        
        In half-open state, tracks progress toward closing the circuit.
        """
        self._success_count += 1
        self._total_successes += 1
        self._last_success_time = time.time()
        
        if self._state == CircuitState.HALF_OPEN:
            self._half_open_successes += 1
            
            logger.debug(
                "Half-open success recorded",
                extra={
                    "breaker_name": self._config.name,
                    "half_open_successes": self._half_open_successes,
                    "required": self._config.half_open_requests,
                },
            )
            
            # Check if we've had enough successes to close the circuit
            if self._half_open_successes >= self._config.half_open_requests:
                self._transition_to(CircuitState.CLOSED)
                
        elif self._state == CircuitState.CLOSED:
            # Reset failure count on success in closed state
            self._failure_count = 0

    def _record_failure(self) -> None:
        """Records a failed operation.
        
        Tracks failures and opens circuit when threshold is exceeded.
        """
        self._failure_count += 1
        self._total_failures += 1
        self._last_failure_time = time.time()
        
        if self._state == CircuitState.HALF_OPEN:
            # Any failure in half-open immediately reopens the circuit
            self._half_open_failures += 1
            logger.warning(
                "Half-open failure, reopening circuit",
                extra={
                    "breaker_name": self._config.name,
                    "half_open_failures": self._half_open_failures,
                },
            )
            self._transition_to(CircuitState.OPEN)
            
        elif self._failure_count >= self._config.failure_threshold:
            # Threshold exceeded - open the circuit
            logger.warning(
                "Failure threshold exceeded, opening circuit",
                extra={
                    "breaker_name": self._config.name,
                    "failure_count": self._failure_count,
                    "threshold": self._config.failure_threshold,
                },
            )
            self._transition_to(CircuitState.OPEN)

    def _transition_to(self, new_state: CircuitState) -> None:
        """Transitions to a new state with appropriate logging and reset.
        
        Args:
            new_state: The state to transition to
        """
        previous_state = self._state
        self._state = new_state
        self._state_changed_at = time.time()

        # Reset counters based on new state
        if new_state == CircuitState.CLOSED:
            self._failure_count = 0
            self._success_count = 0
            self._half_open_successes = 0
            self._half_open_failures = 0
        elif new_state == CircuitState.HALF_OPEN:
            self._half_open_successes = 0
            self._half_open_failures = 0

        logger.info(
            "Circuit breaker state transition",
            extra={
                "breaker_name": self._config.name,
                "previous_state": previous_state.value,
                "new_state": new_state.value,
                "failure_count": self._failure_count,
                "last_failure": (
                    datetime.fromtimestamp(self._last_failure_time, tz=timezone.utc).isoformat()
                    if self._last_failure_time else None
                ),
            },
        )

    def reset(self) -> None:
        """Manually resets the circuit breaker to closed state.
        
        Use with caution - typically for admin override scenarios.
        """
        logger.info(
            "Circuit breaker manually reset",
            extra={
                "breaker_name": self._config.name,
                "previous_state": self._state.value,
            },
        )
        self._transition_to(CircuitState.CLOSED)
        self._last_failure_time = None

    def force_open(self) -> None:
        """Manually opens the circuit breaker.
        
        Useful for maintenance or known provider issues.
        """
        logger.info(
            "Circuit breaker manually opened",
            extra={
                "breaker_name": self._config.name,
                "previous_state": self._state.value,
            },
        )
        self._transition_to(CircuitState.OPEN)
        self._last_failure_time = time.time()
