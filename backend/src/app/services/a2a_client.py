"""A2A (Agent-to-Agent) Client for Service-to-Service Communication.

Enables microservices to discover and call each other by capability,
with circuit breaker pattern and automatic failover.

Phase 4: Google A2A ADKS Integration
"""

import asyncio
import logging
from typing import Dict, Any, Optional, List
from enum import Enum
from datetime import datetime, timedelta

import httpx
from pydantic import BaseModel, Field

from app.services.service_registry import (
    get_service_registry,
    ServiceInfo,
    ServiceRegistry,
)


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class CircuitState(str, Enum):
    """Circuit breaker states."""

    CLOSED = "closed"  # Normal operation
    OPEN = "open"  # Circuit tripped, rejecting calls
    HALF_OPEN = "half_open"  # Testing if service recovered


class CircuitBreakerConfig(BaseModel):
    """Circuit breaker configuration."""

    failure_threshold: int = Field(
        default=5, description="Number of failures before opening circuit"
    )
    success_threshold: int = Field(
        default=2, description="Number of successes to close circuit from half-open"
    )
    timeout_seconds: int = Field(
        default=60, description="Seconds before attempting to close open circuit"
    )


class CircuitBreaker:
    """Circuit breaker for service calls."""

    def __init__(self, config: Optional[CircuitBreakerConfig] = None):
        """Initialize circuit breaker.

        Args:
            config: Circuit breaker configuration
        """
        self.config = config or CircuitBreakerConfig()
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.success_count = 0
        self.last_failure_time: Optional[datetime] = None

    def record_success(self):
        """Record a successful call."""
        if self.state == CircuitState.HALF_OPEN:
            self.success_count += 1
            if self.success_count >= self.config.success_threshold:
                self._close()
        elif self.state == CircuitState.CLOSED:
            self.failure_count = 0

    def record_failure(self):
        """Record a failed call."""
        self.failure_count += 1
        self.last_failure_time = datetime.utcnow()

        if self.state == CircuitState.CLOSED:
            if self.failure_count >= self.config.failure_threshold:
                self._open()
        elif self.state == CircuitState.HALF_OPEN:
            self._open()

    def can_attempt(self) -> bool:
        """Check if call can be attempted.

        Returns:
            True if call should be attempted, False otherwise
        """
        if self.state == CircuitState.CLOSED:
            return True

        if self.state == CircuitState.OPEN:
            if self._should_attempt_reset():
                self._half_open()
                return True
            return False

        if self.state == CircuitState.HALF_OPEN:
            return True

        return False

    def _should_attempt_reset(self) -> bool:
        """Check if enough time has passed to attempt reset."""
        if not self.last_failure_time:
            return True

        timeout = timedelta(seconds=self.config.timeout_seconds)
        return datetime.utcnow() - self.last_failure_time > timeout

    def _open(self):
        """Open the circuit."""
        self.state = CircuitState.OPEN
        self.failure_count = 0
        self.success_count = 0
        logger.warning("Circuit breaker opened")

    def _half_open(self):
        """Half-open the circuit for testing."""
        self.state = CircuitState.HALF_OPEN
        self.success_count = 0
        logger.info("Circuit breaker half-opened for testing")

    def _close(self):
        """Close the circuit."""
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.success_count = 0
        logger.info("Circuit breaker closed")


# ---------------------------------------------------------------------------
# A2A Client
# ---------------------------------------------------------------------------


class A2AClient:
    """Client for agent-to-agent (service-to-service) communication.

    Features:
    - Service discovery by capability
    - Circuit breaker pattern for fault tolerance
    - Automatic failover to backup services
    - Request/response logging
    """

    def __init__(
        self,
        service_registry: Optional[ServiceRegistry] = None,
        timeout: float = 5.0,
        max_retries: int = 2,
    ):
        """Initialize A2A client.

        Args:
            service_registry: Service registry instance (default: global)
            timeout: Request timeout in seconds
            max_retries: Maximum retry attempts for failed calls
        """
        self.registry = service_registry or get_service_registry()
        self.timeout = timeout
        self.max_retries = max_retries

        # Circuit breakers per service
        self._circuit_breakers: Dict[str, CircuitBreaker] = {}

    def _get_circuit_breaker(self, service_name: str) -> CircuitBreaker:
        """Get or create circuit breaker for a service.

        Args:
            service_name: Service name

        Returns:
            Circuit breaker instance
        """
        if service_name not in self._circuit_breakers:
            self._circuit_breakers[service_name] = CircuitBreaker()
        return self._circuit_breakers[service_name]

    async def call_service(
        self,
        capability: str,
        method: str,
        params: Optional[Dict[str, Any]] = None,
        timeout: Optional[float] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """Call a service by capability.

        Discovers services, applies circuit breaker, and handles failover.

        Args:
            capability: Service capability (e.g., 'gallery:read')
            method: API method/endpoint
            params: Request parameters (query params for GET, body for POST)
            timeout: Request timeout (default: self.timeout)
            headers: Additional HTTP headers

        Returns:
            Response data

        Raises:
            ValueError: If no services found for capability
            httpx.HTTPError: If all service calls fail

        Example:
            ```python
            client = A2AClient()

            # Call gallery service to get galleries
            galleries = await client.call_service(
                capability="gallery:read",
                method="GET /galleries",
                params={"page": 1, "limit": 20},
                headers={"Authorization": "Bearer token"},
            )
            ```
        """
        timeout = timeout or self.timeout

        # Discover services with capability
        services = await self.registry.discover(capability)
        if not services:
            raise ValueError(f"No services found for capability '{capability}'")

        # Sort services by health (healthy first)
        services.sort(key=lambda s: (not s.is_healthy, s.service_name))

        last_error = None

        # Try each service with failover
        for service in services:
            circuit_breaker = self._get_circuit_breaker(service.service_name)

            # Check circuit breaker
            if not circuit_breaker.can_attempt():
                logger.warning(
                    f"Circuit breaker open for {service.service_name}, skipping"
                )
                continue

            try:
                # Make the call
                response = await self._call_service_instance(
                    service=service,
                    method=method,
                    params=params,
                    timeout=timeout,
                    headers=headers,
                )

                # Record success
                circuit_breaker.record_success()

                logger.info(
                    f"A2A call successful: {service.service_name} - {capability} - {method}"
                )

                return response

            except Exception as e:
                # Record failure
                circuit_breaker.record_failure()
                await self.registry.mark_unhealthy(service.service_name, service.service_id)

                logger.error(
                    f"A2A call failed: {service.service_name} - {capability} - {method}: {e}"
                )

                last_error = e
                # Try next service

        # All services failed
        if last_error:
            raise last_error
        else:
            raise ValueError(f"All services failed for capability '{capability}'")

    async def _call_service_instance(
        self,
        service: ServiceInfo,
        method: str,
        params: Optional[Dict[str, Any]],
        timeout: float,
        headers: Optional[Dict[str, str]],
    ) -> Dict[str, Any]:
        """Call a specific service instance.

        Args:
            service: Service information
            method: HTTP method and path (e.g., 'GET /galleries')
            params: Request parameters
            timeout: Request timeout
            headers: HTTP headers

        Returns:
            Response data

        Raises:
            httpx.HTTPError: If call fails
        """
        # Parse method and path
        parts = method.split(" ", 1)
        if len(parts) == 2:
            http_method, path = parts
        else:
            http_method = "GET"
            path = method

        # Build full URL
        url = f"{service.base_url.rstrip('/')}/{path.lstrip('/')}"

        # Prepare headers
        request_headers = {
            "X-Service-Name": "backend",  # Identify calling service
            "X-Capability": service.capabilities[0].name if service.capabilities else "",
        }
        if headers:
            request_headers.update(headers)

        # Make request
        async with httpx.AsyncClient(timeout=timeout) as client:
            if http_method.upper() == "GET":
                response = await client.get(url, params=params, headers=request_headers)
            elif http_method.upper() == "POST":
                response = await client.post(url, json=params, headers=request_headers)
            elif http_method.upper() == "PUT":
                response = await client.put(url, json=params, headers=request_headers)
            elif http_method.upper() == "DELETE":
                response = await client.delete(url, params=params, headers=request_headers)
            else:
                raise ValueError(f"Unsupported HTTP method: {http_method}")

            response.raise_for_status()

            # Return JSON response or empty dict
            try:
                return response.json()
            except Exception:
                return {}

    async def call_with_retry(
        self,
        capability: str,
        method: str,
        params: Optional[Dict[str, Any]] = None,
        timeout: Optional[float] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """Call service with automatic retry on failure.

        Args:
            capability: Service capability
            method: API method/endpoint
            params: Request parameters
            timeout: Request timeout
            headers: HTTP headers

        Returns:
            Response data

        Raises:
            httpx.HTTPError: If all retries fail
        """
        last_error = None

        for attempt in range(self.max_retries + 1):
            try:
                return await self.call_service(
                    capability=capability,
                    method=method,
                    params=params,
                    timeout=timeout,
                    headers=headers,
                )
            except Exception as e:
                last_error = e

                if attempt < self.max_retries:
                    # Exponential backoff
                    wait_time = 2 ** attempt
                    logger.warning(
                        f"A2A call failed (attempt {attempt + 1}/{self.max_retries + 1}), "
                        f"retrying in {wait_time}s..."
                    )
                    await asyncio.sleep(wait_time)

        # All retries failed
        if last_error:
            raise last_error


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------


_a2a_client: Optional[A2AClient] = None


def get_a2a_client() -> A2AClient:
    """Get the global A2A client instance."""
    global _a2a_client
    if _a2a_client is None:
        _a2a_client = A2AClient()
    return _a2a_client
