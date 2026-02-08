"""Circuit Breaker Factory for Gallery Service.

Provides centralized circuit breaker management for all external services:
- Generic circuit breaker with configurable thresholds
- Service-specific circuit breakers with optimized settings
- Automatic retry with exponential backoff
- Fallback strategy integration
- Health monitoring and metrics

Usage:
    # Get circuit breaker for a service
    breaker = get_circuit_breaker("ai-service")

    # Execute with circuit breaker protection
    try:
        result = await breaker.call_with_retry(
            ai_service_function,
            workspace_id=uuid,
            query="sunset photos"
        )
    except CircuitBreakerError:
        # Service is down, use fallback
        result = await fallback.execute(...)
"""

from __future__ import annotations

import asyncio
import random
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Generic, Optional, TypeVar, Dict
import threading

from src.log_config import get_logger
from src.observability.metrics import get_metrics

from .service_configs import (
    ServiceConfig,
    ServiceCriticality,
    get_service_config,
    list_all_services,
)
from .fallback_strategies import (
    FallbackStrategy,
    NullFallback,
)

logger = get_logger(__name__)
metrics = get_metrics()

T = TypeVar("T")


# =============================================================================
# Circuit Breaker State
# =============================================================================


class CircuitState(str, Enum):
    """Circuit breaker states.

    CLOSED: Normal operation, requests flow through
    OPEN: Failures exceeded threshold, requests rejected immediately
    HALF_OPEN: Testing recovery, limited requests allowed through
    """
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


@dataclass
class BackoffConfig:
    """Exponential backoff configuration."""

    max_retries: int = 3
    base_delay_ms: int = 100
    max_delay_ms: int = 2000
    jitter_ratio: float = 0.1

    def calculate_delay(self, attempt: int) -> float:
        """Calculate delay in seconds for given retry attempt."""
        # Exponential delay: base * 2^attempt, capped at max
        exponential_delay_ms = min(
            self.base_delay_ms * (2 ** attempt),
            self.max_delay_ms
        )

        # Add jitter to prevent thundering herd
        jitter_ms = exponential_delay_ms * self.jitter_ratio * random.random()

        return (exponential_delay_ms + jitter_ms) / 1000  # Convert to seconds


@dataclass
class CircuitBreakerStats:
    """Statistics for circuit breaker monitoring."""

    service_name: str
    state: CircuitState
    failure_count: int
    success_count: int
    consecutive_failures: int
    consecutive_successes: int
    last_failure_time: Optional[datetime]
    last_success_time: Optional[datetime]
    opened_at: Optional[datetime]
    time_in_current_state_seconds: float
    total_requests: int
    total_failures: int
    total_successes: int
    total_rejected: int
    total_retries: int
    successful_retries: int
    backoff_config: BackoffConfig
    config: ServiceConfig

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "service_name": self.service_name,
            "state": self.state.value,
            "failure_count": self.failure_count,
            "success_count": self.success_count,
            "consecutive_failures": self.consecutive_failures,
            "consecutive_successes": self.consecutive_successes,
            "last_failure_time": self.last_failure_time.isoformat() if self.last_failure_time else None,
            "last_success_time": self.last_success_time.isoformat() if self.last_success_time else None,
            "opened_at": self.opened_at.isoformat() if self.opened_at else None,
            "time_in_current_state_seconds": self.time_in_current_state_seconds,
            "total_requests": self.total_requests,
            "total_failures": self.total_failures,
            "total_successes": self.total_successes,
            "total_rejected": self.total_rejected,
            "total_retries": self.total_retries,
            "successful_retries": self.successful_retries,
            "backoff_config": {
                "max_retries": self.backoff_config.max_retries,
                "base_delay_ms": self.backoff_config.base_delay_ms,
                "max_delay_ms": self.backoff_config.max_delay_ms,
                "jitter_ratio": self.backoff_config.jitter_ratio,
            },
            "config": {
                "failure_threshold": self.config.failure_threshold,
                "recovery_timeout_seconds": self.config.recovery_timeout_seconds,
                "half_open_max_calls": self.config.half_open_max_calls,
                "timeout_seconds": self.config.timeout_seconds,
                "criticality": self.config.criticality.value,
            },
        }


class CircuitBreakerError(Exception):
    """Raised when circuit breaker is open."""

    def __init__(
        self,
        message: str,
        service: str,
        open_until: Optional[datetime] = None,
    ):
        super().__init__(message)
        self.service = service
        self.open_until = open_until


# =============================================================================
# Generic Circuit Breaker
# =============================================================================


class GenericCircuitBreaker(Generic[T]):
    """Generic circuit breaker with configurable thresholds.

    Features:
    - Three states: CLOSED, OPEN, HALF_OPEN
    - Exponential backoff with jitter
    - Configurable thresholds per service
    - Prometheus metrics integration
    - Fallback strategy support
    - Thread-safe state management

    Usage:
        breaker = GenericCircuitBreaker(config)

        try:
            result = await breaker.call_with_retry(
                service_function,
                arg1, arg2,
                kwarg1=value1
            )
        except CircuitBreakerError:
            # Circuit is open, handle fallback
    """

    def __init__(
        self,
        config: ServiceConfig,
        fallback: Optional[FallbackStrategy[T]] = None,
    ):
        """Initialize the circuit breaker.

        Args:
            config: Service-specific configuration
            fallback: Optional fallback strategy
        """
        self.config = config
        self.fallback = fallback

        # State
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._consecutive_failures = 0
        self._consecutive_successes = 0
        self._last_failure_time: Optional[float] = None
        self._last_success_time: Optional[float] = None
        self._opened_at: Optional[float] = None
        self._state_changed_at: float = time.time()

        # Lock for thread safety
        self._lock = threading.Lock()

        # Retry statistics
        self._total_retries = 0
        self._successful_retries = 0

        # Request statistics
        self._total_requests = 0
        self._total_failures = 0
        self._total_successes = 0
        self._total_rejected = 0

        # Backoff configuration
        self._backoff = BackoffConfig(
            max_retries=config.max_retries,
            base_delay_ms=config.base_delay_ms,
            max_delay_ms=config.max_delay_ms,
            jitter_ratio=config.jitter_ratio,
        )

        # Log initialization
        logger.info(
            f"Circuit breaker initialized for {config.service_name}: "
            f"threshold={config.failure_threshold}, "
            f"timeout={config.recovery_timeout_seconds}s, "
            f"max_retries={config.max_retries}"
        )

        # Set initial metrics
        self._update_state_metric()

    @property
    def state(self) -> CircuitState:
        """Get current circuit state."""
        return self._state

    @property
    def is_open(self) -> bool:
        """Check if circuit is currently open."""
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
        with self._lock:
            if self._state == CircuitState.CLOSED:
                return True
            if self._state == CircuitState.HALF_OPEN:
                return True
            if self._state == CircuitState.OPEN:
                return self._should_attempt_recovery()
            return False

    async def call(
        self,
        func: Callable[..., T],
        *args: Any,
        **kwargs: Any,
    ) -> T:
        """Execute function with circuit breaker protection (no retry).

        Args:
            func: Async function to execute
            *args: Positional arguments
            **kwargs: Keyword arguments

        Returns:
            Result from function call

        Raises:
            CircuitBreakerError: If circuit is open
            Exception: Original exception if circuit is closed
        """
        with self._lock:
            self._total_requests += 1

            # Check circuit state
            if self._state == CircuitState.OPEN:
                if self._should_attempt_recovery():
                    self._transition_to(CircuitState.HALF_OPEN)
                else:
                    # Circuit still open, fail fast
                    self._total_rejected += 1
                    open_until = self._get_recovery_time()
                    logger.warning(
                        f"Circuit breaker OPEN for {self.config.service_name}, "
                        f"failing fast (open until {open_until})"
                    )
                    metrics.counter_inc(
                        "gallery_circuit_breaker_rejected_total",
                        {"service": self.config.service_name, "state": "open"},
                    )

                    # Try fallback
                    if self.fallback and self.config.fallback_enabled:
                        return await self.fallback.execute(
                            func, args, kwargs, None
                        )

                    raise CircuitBreakerError(
                        f"Circuit breaker is OPEN for {self.config.service_name}",
                        service=self.config.service_name,
                        open_until=open_until,
                    )

        # Execute the function
        try:
            result = await func(*args, **kwargs)
            self._on_success()
            return result

        except Exception as e:
            self._on_failure()

            # Try fallback on error
            if self.fallback and self.config.fallback_enabled:
                try:
                    return await self.fallback.execute(func, args, kwargs, e)
                except Exception:
                    pass  # Fallback also failed, raise original error

            raise

    async def call_with_retry(
        self,
        func: Callable[..., T],
        *args: Any,
        retryable_exceptions: tuple = (asyncio.TimeoutError, ConnectionError, OSError),
        **kwargs: Any,
    ) -> T:
        """Execute with circuit breaker AND exponential backoff retries.

        Args:
            func: Async function to execute
            *args: Positional arguments
            retryable_exceptions: Exception types that trigger retry
            **kwargs: Keyword arguments

        Returns:
            Result from function call

        Raises:
            CircuitBreakerError: If circuit is open
            Exception: Original exception after all retries exhausted
        """
        last_exception: Optional[Exception] = None

        for attempt in range(self._backoff.max_retries + 1):
            try:
                result = await self.call(func, *args, **kwargs)

                # Track successful retry
                if attempt > 0:
                    self._successful_retries += 1
                    logger.info(
                        f"Circuit breaker call succeeded after {attempt} retries "
                        f"for {self.config.service_name}"
                    )
                    metrics.counter_inc(
                        "gallery_circuit_breaker_retry_success_total",
                        {"service": self.config.service_name, "attempt": str(attempt)},
                    )

                return result

            except CircuitBreakerError:
                # Circuit is open - don't retry, propagate immediately
                raise

            except retryable_exceptions as e:
                last_exception = e
                self._total_retries += 1

                # Check if we should retry
                if attempt < self._backoff.max_retries:
                    delay = self._backoff.calculate_delay(attempt)
                    logger.warning(
                        f"Retryable error for {self.config.service_name} "
                        f"(attempt {attempt + 1}/{self._backoff.max_retries + 1}): {e}. "
                        f"Retrying in {delay:.3f}s"
                    )
                    metrics.counter_inc(
                        "gallery_circuit_breaker_retry_total",
                        {"service": self.config.service_name, "attempt": str(attempt)},
                    )

                    await asyncio.sleep(delay)
                else:
                    # All retries exhausted
                    logger.error(
                        f"All {self._backoff.max_retries + 1} attempts exhausted "
                        f"for {self.config.service_name}: {e}"
                    )
                    metrics.counter_inc(
                        "gallery_circuit_breaker_retry_exhausted_total",
                        {"service": self.config.service_name},
                    )
                    raise

            except Exception as e:
                # Non-retryable exception - propagate immediately
                logger.error(
                    f"Non-retryable error for {self.config.service_name}: {e}"
                )
                raise

        # Should not reach here, but just in case
        if last_exception:
            raise last_exception

    def _should_attempt_recovery(self) -> bool:
        """Check if enough time has passed to attempt recovery."""
        if self._opened_at is None:
            return False
        return time.time() - self._opened_at >= self.config.recovery_timeout_seconds

    def _get_recovery_time(self) -> Optional[datetime]:
        """Get the time when recovery will be attempted."""
        if self._opened_at is None:
            return None
        return datetime.fromtimestamp(
            self._opened_at + self.config.recovery_timeout_seconds,
            tz=timezone.utc,
        )

    def _on_success(self) -> None:
        """Handle successful function execution."""
        with self._lock:
            self._success_count += 1
            self._total_successes += 1
            self._last_success_time = time.time()
            self._consecutive_successes += 1

            if self._state == CircuitState.HALF_OPEN:
                logger.debug(
                    f"Circuit breaker success in HALF_OPEN: "
                    f"{self._consecutive_successes}/"
                    f"{self.config.half_open_max_calls}"
                )

                if self._consecutive_successes >= self.config.half_open_max_calls:
                    self._transition_to(CircuitState.CLOSED)

            elif self._state == CircuitState.CLOSED:
                # Reset consecutive failures on success
                self._consecutive_failures = 0

            metrics.counter_inc(
                "gallery_circuit_breaker_calls_total",
                {"service": self.config.service_name, "result": "success"},
            )

    def _on_failure(self) -> None:
        """Handle failed function execution."""
        with self._lock:
            self._failure_count += 1
            self._total_failures += 1
            self._last_failure_time = time.time()
            self._consecutive_failures += 1

            logger.warning(
                f"Circuit breaker failure for {self.config.service_name}: "
                f"{self._consecutive_failures}/{self.config.failure_threshold}"
            )

            if self._state == CircuitState.HALF_OPEN:
                # Any failure in half-open transitions back to open
                self._transition_to(CircuitState.OPEN)

            elif self._state == CircuitState.CLOSED:
                if self._consecutive_failures >= self.config.failure_threshold:
                    self._transition_to(CircuitState.OPEN)

            metrics.counter_inc(
                "gallery_circuit_breaker_calls_total",
                {"service": self.config.service_name, "result": "failure"},
            )

    def _transition_to(self, new_state: CircuitState) -> None:
        """Transition to a new state."""
        previous_state = self._state
        self._state = new_state
        self._state_changed_at = time.time()

        # Reset counters based on new state
        if new_state == CircuitState.CLOSED:
            self._consecutive_failures = 0
            self._consecutive_successes = 0
            self._opened_at = None
            logger.info(
                f"Circuit breaker CLOSING for {self.config.service_name}"
            )

        elif new_state == CircuitState.HALF_OPEN:
            self._consecutive_successes = 0
            logger.info(
                f"Circuit breaker transitioning to HALF_OPEN for "
                f"{self.config.service_name}"
            )

        elif new_state == CircuitState.OPEN:
            self._opened_at = time.time()
            logger.error(
                f"Circuit breaker OPENING for {self.config.service_name} "
                f"after {self._consecutive_failures} failures"
            )
            metrics.counter_inc(
                "gallery_circuit_breaker_opened_total",
                {"service": self.config.service_name},
            )

        # Update metrics
        self._update_state_metric()

    def _update_state_metric(self) -> None:
        """Update the state gauge metric."""
        state_value = {
            CircuitState.CLOSED: 0,
            CircuitState.HALF_OPEN: 1,
            CircuitState.OPEN: 2,
        }[self._state]

        metrics.gauge_set(
            "gallery_circuit_breaker_state",
            state_value,
            {"service": self.config.service_name},
        )

    def get_stats(self) -> CircuitBreakerStats:
        """Get statistics for monitoring.

        Returns:
            CircuitBreakerStats with current state
        """
        with self._lock:
            return CircuitBreakerStats(
                service_name=self.config.service_name,
                state=self._state,
                failure_count=self._failure_count,
                success_count=self._success_count,
                consecutive_failures=self._consecutive_failures,
                consecutive_successes=self._consecutive_successes,
                last_failure_time=datetime.fromtimestamp(self._last_failure_time, tz=timezone.utc) if self._last_failure_time else None,
                last_success_time=datetime.fromtimestamp(self._last_success_time, tz=timezone.utc) if self._last_success_time else None,
                opened_at=datetime.fromtimestamp(self._opened_at, tz=timezone.utc) if self._opened_at else None,
                time_in_current_state_seconds=time.time() - self._state_changed_at,
                total_requests=self._total_requests,
                total_failures=self._total_failures,
                total_successes=self._total_successes,
                total_rejected=self._total_rejected,
                total_retries=self._total_retries,
                successful_retries=self._successful_retries,
                backoff_config=self._backoff,
                config=self.config,
            )

    def reset(self) -> None:
        """Manually reset the circuit breaker to CLOSED state.

        Use with caution - typically for admin override scenarios.
        """
        with self._lock:
            logger.info(
                f"Circuit breaker manually reset for {self.config.service_name}"
            )
            self._transition_to(CircuitState.CLOSED)
            self._last_failure_time = None
            self._failure_count = 0
            self._success_count = 0
            self._total_requests = 0
            self._total_failures = 0
            self._total_successes = 0
            self._total_rejected = 0
            self._total_retries = 0
            self._successful_retries = 0

    def force_open(self) -> None:
        """Manually open the circuit breaker.

        Useful for maintenance or known service issues.
        """
        with self._lock:
            logger.info(
                f"Circuit breaker manually opened for {self.config.service_name}"
            )
            self._transition_to(CircuitState.OPEN)
            self._opened_at = time.time()


# =============================================================================
# Circuit Breaker Factory
# =============================================================================


class CircuitBreakerFactory:
    """Factory for managing circuit breakers for all external services.

    Provides:
    - Centralized circuit breaker creation
    - Service-specific configurations
    - Automatic fallback strategy injection
    - Health monitoring for all circuit breakers

    Usage:
        factory = CircuitBreakerFactory()

        # Get circuit breaker for a service
        ai_breaker = factory.get_breaker("ai-service")

        # Execute with protection
        result = await ai_breaker.call_with_retry(ai_function, arg1, arg2)
    """

    def __init__(self):
        """Initialize the circuit breaker factory."""
        self._breakers: Dict[str, GenericCircuitBreaker] = {}
        self._lock = threading.Lock()
        logger.info("Circuit breaker factory initialized")

    def get_breaker(
        self,
        service_name: str,
        fallback: Optional[FallbackStrategy] = None,
    ) -> GenericCircuitBreaker:
        """Get or create a circuit breaker for the specified service.

        Args:
            service_name: Name of the service (e.g., "ai-service")
            fallback: Optional custom fallback strategy

        Returns:
            GenericCircuitBreaker instance

        Raises:
            ValueError: If service configuration not found
        """
        with self._lock:
            if service_name not in self._breakers:
                # Get service configuration
                config = get_service_config(service_name)
                if config is None:
                    raise ValueError(
                        f"No circuit breaker configuration found for {service_name}. "
                        f"Available services: {list_all_services()}"
                    )

                # Use provided fallback or default null fallback
                effective_fallback = fallback or NullFallback(service_name)

                # Create new circuit breaker
                breaker = GenericCircuitBreaker(config, fallback=effective_fallback)
                self._breakers[service_name] = breaker
                logger.info(f"Created circuit breaker for {service_name}")

            return self._breakers[service_name]

    def get_all_breakers(self) -> Dict[str, GenericCircuitBreaker]:
        """Get all registered circuit breakers.

        Returns:
            Dictionary of service_name -> circuit_breaker
        """
        with self._lock:
            return self._breakers.copy()

    def get_all_stats(self) -> Dict[str, dict]:
        """Get statistics for all circuit breakers.

        Returns:
            Dictionary of service_name -> stats_dict
        """
        stats = {}
        for name, breaker in self.get_all_breakers().items():
            stats[name] = breaker.get_stats().to_dict()
        return stats

    def reset_breaker(self, service_name: str) -> bool:
        """Reset a specific circuit breaker to CLOSED state.

        Args:
            service_name: Name of the service

        Returns:
            True if reset successful, False if breaker not found
        """
        with self._lock:
            if service_name in self._breakers:
                self._breakers[service_name].reset()
                logger.info(f"Reset circuit breaker for {service_name}")
                return True
            return False

    def reset_all(self) -> int:
        """Reset all circuit breakers to CLOSED state.

        Returns:
            Number of circuit breakers reset
        """
        with self._lock:
            count = len(self._breakers)
            for breaker in self._breakers.values():
                breaker.reset()
            logger.info(f"Reset all {count} circuit breakers")
            return count

    def force_open_breaker(self, service_name: str) -> bool:
        """Force a specific circuit breaker to OPEN state.

        Useful for maintenance scenarios.

        Args:
            service_name: Name of the service

        Returns:
            True if successful, False if breaker not found
        """
        with self._lock:
            if service_name in self._breakers:
                self._breakers[service_name].force_open()
                logger.info(f"Forced circuit breaker open for {service_name}")
                return True
            return False

    def health_check(self) -> Dict[str, Any]:
        """Get health status of all circuit breakers.

        Returns:
            Health check result with status and details
        """
        all_stats = self.get_all_stats()
        open_breakers = [
            name for name, stats in all_stats.items()
            if stats["state"] == "open"
        ]

        health_status = "healthy"
        if open_breakers:
            health_status = "degraded" if len(open_breakers) < len(all_stats) else "unhealthy"

        return {
            "status": health_status,
            "total_breakers": len(all_stats),
            "open_breakers": len(open_breakers),
            "open_services": open_breakers,
            "details": all_stats,
        }


# =============================================================================
# Global Factory Instance
# =============================================================================

_factory: Optional[CircuitBreakerFactory] = None
_factory_lock = threading.Lock()


def get_circuit_breaker(
    service_name: str,
    fallback: Optional[FallbackStrategy] = None,
) -> GenericCircuitBreaker:
    """Get or create a circuit breaker for the specified service.

    This is the primary interface for obtaining circuit breakers.

    Args:
        service_name: Name of the service (e.g., "ai-service")
        fallback: Optional custom fallback strategy

    Returns:
        GenericCircuitBreaker instance

    Example:
        breaker = get_circuit_breaker("ai-service")
        result = await breaker.call_with_retry(ai_function, arg1, arg2)
    """
    global _factory

    if _factory is None:
        with _factory_lock:
            if _factory is None:
                _factory = CircuitBreakerFactory()

    return _factory.get_breaker(service_name, fallback=fallback)


def get_all_circuit_breakers() -> Dict[str, GenericCircuitBreaker]:
    """Get all registered circuit breakers.

    Returns:
        Dictionary of service_name -> circuit_breaker
    """
    global _factory

    if _factory is None:
        with _factory_lock:
            if _factory is None:
                _factory = CircuitBreakerFactory()

    return _factory.get_all_breakers()


def reset_all_circuit_breakers() -> int:
    """Reset all circuit breakers to CLOSED state.

    Returns:
        Number of circuit breakers reset
    """
    global _factory

    if _factory is None:
        return 0

    return _factory.reset_all()


def get_circuit_breaker_health() -> Dict[str, Any]:
    """Get health status of all circuit breakers.

    Returns:
        Health check result with status and details
    """
    global _factory

    if _factory is None:
        with _factory_lock:
            if _factory is None:
                _factory = CircuitBreakerFactory()

    return _factory.health_check()
