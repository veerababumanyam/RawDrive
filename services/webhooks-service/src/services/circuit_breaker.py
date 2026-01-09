"""
Circuit breaker implementation for webhook endpoints.

Prevents cascade failures by tracking endpoint health and
temporarily blocking requests to failing endpoints.
"""

import time
import logging
import asyncio
from abc import ABC, abstractmethod
from enum import Enum
from dataclasses import dataclass, field
from typing import Dict, Optional, Protocol, Any

from urllib.parse import urlparse

from src.config import settings
from src.observability import metrics

logger = logging.getLogger(__name__)


class CircuitBreakerStorage(Protocol):
    """Protocol for circuit breaker state storage."""

    async def get_circuit_state(self, endpoint: str) -> Dict[str, Any]:
        """Get circuit breaker state for an endpoint."""
        ...

    async def set_circuit_state(
        self,
        endpoint: str,
        state: str,
        failure_count: int,
        last_failure_time: float,
        last_state_change: float,
    ) -> None:
        """Set circuit breaker state for an endpoint."""
        ...

    async def hset(self, key: str, field: str, value: str) -> None:
        """Set a hash field."""
        ...


class RedisCircuitBreakerStorage:
    """Redis-based circuit breaker storage."""

    def __init__(self, redis_client: Any = None):
        self._redis_client = redis_client

    @property
    def redis_client(self) -> Any:
        if self._redis_client is None:
            from src.cache.redis_client import redis_client
            self._redis_client = redis_client
        return self._redis_client

    async def get_circuit_state(self, endpoint: str) -> Dict[str, Any]:
        return await self.self._storage.get_circuit_state(endpoint)

    async def set_circuit_state(
        self,
        endpoint: str,
        state: str,
        failure_count: int,
        last_failure_time: float,
        last_state_change: float,
    ) -> None:
        await self.redis_client.set_circuit_state(
            endpoint=endpoint,
            state=state,
            failure_count=failure_count,
            last_failure_time=last_failure_time,
            last_state_change=last_state_change,
        )

    async def hset(self, key: str, field: str, value: str) -> None:
        await self.self._storage.hset(key, field, value)


class InMemoryCircuitBreakerStorage:
    """In-memory circuit breaker storage for testing."""

    def __init__(self):
        self._states: Dict[str, Dict[str, Any]] = {}

    async def get_circuit_state(self, endpoint: str) -> Dict[str, Any]:
        return self._states.get(endpoint, {})

    async def set_circuit_state(
        self,
        endpoint: str,
        state: str,
        failure_count: int,
        last_failure_time: float,
        last_state_change: float,
    ) -> None:
        self._states[endpoint] = {
            "state": state,
            "failure_count": failure_count,
            "last_failure_time": last_failure_time,
            "last_state_change": last_state_change,
        }

    async def hset(self, key: str, field: str, value: str) -> None:
        endpoint = key.replace("webhook:circuit:", "")
        if endpoint not in self._states:
            self._states[endpoint] = {}
        self._states[endpoint][field] = value

    def reset(self) -> None:
        """Reset all state for testing."""
        self._states.clear()


class CircuitState(str, Enum):
    """Circuit breaker states."""
    CLOSED = "closed"      # Normal operation
    OPEN = "open"          # Failing, reject requests
    HALF_OPEN = "half_open"  # Testing recovery


@dataclass
class CircuitStatus:
    """Current status of a circuit."""
    state: CircuitState
    failure_count: int
    last_failure_time: float
    last_state_change: float
    can_attempt: bool
    remaining_cooldown: float = 0


class CircuitBreakerService:
    """
    Per-endpoint circuit breaker.

    States:
    - CLOSED: Normal operation, requests pass through
    - OPEN: Endpoint failing, requests are blocked
    - HALF_OPEN: Recovery testing, limited requests allowed

    Transitions:
    - CLOSED -> OPEN: After failure_threshold consecutive failures
    - OPEN -> HALF_OPEN: After recovery_timeout seconds
    - HALF_OPEN -> CLOSED: After half_open_successes successful requests
    - HALF_OPEN -> OPEN: On any failure during testing
    """

    def __init__(self, storage: Optional[CircuitBreakerStorage] = None):
        """
        Initialize circuit breaker service.

        Args:
            storage: Storage backend for circuit breaker state.
                     Defaults to RedisCircuitBreakerStorage.
        """
        self.failure_threshold = settings.CIRCUIT_BREAKER_FAILURE_THRESHOLD
        self.recovery_timeout = settings.CIRCUIT_BREAKER_RECOVERY_TIMEOUT
        self.half_open_successes = settings.CIRCUIT_BREAKER_HALF_OPEN_REQUESTS
        self._locks: Dict[str, asyncio.Lock] = {}
        self._storage = storage or RedisCircuitBreakerStorage()

    def _get_endpoint_domain(self, endpoint_url: str) -> str:
        """Extract domain from endpoint URL for grouping."""
        try:
            parsed = urlparse(endpoint_url)
            return parsed.netloc or endpoint_url
        except Exception:
            return endpoint_url

    async def _get_lock(self, domain: str) -> asyncio.Lock:
        """Get or create a lock for an endpoint domain."""
        if domain not in self._locks:
            self._locks[domain] = asyncio.Lock()
        return self._locks[domain]

    async def get_status(self, endpoint_url: str) -> CircuitStatus:
        """
        Get current circuit status for an endpoint.

        Args:
            endpoint_url: The webhook endpoint URL

        Returns:
            CircuitStatus with current state and metrics
        """
        domain = self._get_endpoint_domain(endpoint_url)
        data = await self._storage.get_circuit_state(domain)

        state = CircuitState(data.get("state", "closed"))
        failure_count = data.get("failure_count", 0)
        last_failure_time = data.get("last_failure_time", 0)
        last_state_change = data.get("last_state_change", 0)

        current_time = time.monotonic()
        can_attempt = True
        remaining_cooldown = 0

        if state == CircuitState.OPEN:
            time_since_change = current_time - last_state_change
            if time_since_change >= self.recovery_timeout:
                # Transition to half-open
                can_attempt = True
            else:
                can_attempt = False
                remaining_cooldown = self.recovery_timeout - time_since_change

        return CircuitStatus(
            state=state,
            failure_count=failure_count,
            last_failure_time=last_failure_time,
            last_state_change=last_state_change,
            can_attempt=can_attempt,
            remaining_cooldown=remaining_cooldown,
        )

    async def can_execute(self, endpoint_url: str) -> bool:
        """
        Check if request should be allowed.

        Args:
            endpoint_url: The webhook endpoint URL

        Returns:
            True if request should proceed, False if blocked
        """
        domain = self._get_endpoint_domain(endpoint_url)
        lock = await self._get_lock(domain)

        async with lock:
            status = await self.get_status(endpoint_url)

            if status.state == CircuitState.CLOSED:
                return True

            if status.state == CircuitState.OPEN:
                if status.can_attempt:
                    # Transition to half-open
                    await self._set_state(
                        domain,
                        CircuitState.HALF_OPEN,
                        failure_count=0,
                    )
                    logger.info(f"Circuit for {domain} transitioning to HALF_OPEN")
                    metrics.set_circuit_state(domain, CircuitState.HALF_OPEN.value)
                    return True
                return False

            # Half-open: allow limited requests
            return True

    async def record_success(self, endpoint_url: str) -> None:
        """
        Record successful delivery.

        Args:
            endpoint_url: The webhook endpoint URL
        """
        domain = self._get_endpoint_domain(endpoint_url)
        lock = await self._get_lock(domain)

        async with lock:
            data = await self._storage.get_circuit_state(domain)
            state = CircuitState(data.get("state", "closed"))

            if state == CircuitState.HALF_OPEN:
                # Count successes in half-open
                success_count = int(data.get("success_count", 0)) + 1

                if success_count >= self.half_open_successes:
                    # Recovery successful, close circuit
                    await self._set_state(domain, CircuitState.CLOSED)
                    logger.info(f"Circuit for {domain} recovered, now CLOSED")
                    metrics.set_circuit_state(domain, CircuitState.CLOSED.value)
                else:
                    # Update success count
                    await self._storage.hset(
                        f"webhook:circuit:{domain}",
                        "success_count",
                        str(success_count),
                    )
            elif state == CircuitState.CLOSED:
                # Reset failure count on success
                if int(data.get("failure_count", 0)) > 0:
                    await self._set_state(domain, CircuitState.CLOSED)

    async def record_failure(self, endpoint_url: str, error: str) -> None:
        """
        Record delivery failure.

        Args:
            endpoint_url: The webhook endpoint URL
            error: Error message
        """
        domain = self._get_endpoint_domain(endpoint_url)
        lock = await self._get_lock(domain)

        async with lock:
            data = await self._storage.get_circuit_state(domain)
            state = CircuitState(data.get("state", "closed"))
            failure_count = int(data.get("failure_count", 0)) + 1

            if state == CircuitState.HALF_OPEN:
                # Any failure in half-open returns to open
                await self._set_state(
                    domain,
                    CircuitState.OPEN,
                    failure_count=failure_count,
                )
                logger.warning(f"Circuit for {domain} failed recovery, back to OPEN")
                metrics.set_circuit_state(domain, CircuitState.OPEN.value)
                metrics.record_circuit_trip(domain)

            elif state == CircuitState.CLOSED:
                if failure_count >= self.failure_threshold:
                    # Trip the circuit
                    await self._set_state(
                        domain,
                        CircuitState.OPEN,
                        failure_count=failure_count,
                    )
                    logger.warning(
                        f"Circuit for {domain} tripped OPEN after {failure_count} failures"
                    )
                    metrics.set_circuit_state(domain, CircuitState.OPEN.value)
                    metrics.record_circuit_trip(domain)
                else:
                    # Increment failure count
                    await self._set_state(
                        domain,
                        CircuitState.CLOSED,
                        failure_count=failure_count,
                    )

            elif state == CircuitState.OPEN:
                # Already open, update failure count
                await self._set_state(
                    domain,
                    CircuitState.OPEN,
                    failure_count=failure_count,
                )

    async def _set_state(
        self,
        domain: str,
        state: CircuitState,
        failure_count: int = 0,
    ) -> None:
        """Set circuit breaker state in storage."""
        current_time = time.monotonic()
        await self._storage.set_circuit_state(
            endpoint=domain,
            state=state.value,
            failure_count=failure_count,
            last_failure_time=current_time if failure_count > 0 else 0,
            last_state_change=current_time,
        )

    async def reset(self, endpoint_url: str) -> None:
        """
        Manually reset circuit to closed state.

        Args:
            endpoint_url: The webhook endpoint URL
        """
        domain = self._get_endpoint_domain(endpoint_url)
        lock = await self._get_lock(domain)

        async with lock:
            await self._set_state(domain, CircuitState.CLOSED)
            logger.info(f"Circuit for {domain} manually reset to CLOSED")
            metrics.set_circuit_state(domain, CircuitState.CLOSED.value)


# Global singleton
circuit_breaker = CircuitBreakerService()
