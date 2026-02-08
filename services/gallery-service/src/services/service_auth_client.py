"""Service-to-Service HTTP Client with Automatic JWT Authentication.

Provides a resilient HTTP client for making authenticated inter-service calls:

Features:
- Automatic JWT token generation and injection
- Token caching and rotation
- Circuit breaker for fault tolerance
- Retry logic with exponential backoff
- Connection pooling for performance
- Comprehensive observability

Usage:
    # Create client for calling backend service
    client = ServiceAuthClient(
        target_service="backend",
        base_url="http://backend:8000"
    )

    # Make authenticated call
    response = await client.get("/api/v1/galleries")
    data = await client.post("/api/v1/assets", json={"name": "test"})

Configuration (via environment):
    - SERVICE_JWT_TTL_SECONDS: Token lifetime (default: 3600)
    - SERVICE_CLIENT_TIMEOUT_SECONDS: Request timeout (default: 30)
    - SERVICE_CLIENT_MAX_RETRIES: Max retry attempts (default: 3)
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Optional
from dataclasses import dataclass

import httpx
from httpx import TimeoutException, ConnectError

from src.config import settings
from src.log_config import get_logger
from src.middleware.service_auth import (
    generate_service_token,
    ServicePermission,
    DEFAULT_SERVICE_PERMISSIONS,
)
from src.services.ai_client.circuit_breaker import (
    CircuitBreaker,
    CircuitBreakerError,
    BackoffConfig,
)

logger = get_logger(__name__)


# =============================================================================
# Configuration
# =============================================================================


@dataclass
class ServiceClientConfig:
    """Configuration for service-to-service client."""

    # Service identification
    service_name: str = "gallery-service"
    service_id: str | None = None  # Auto-generated if None

    # Token configuration
    token_ttl_seconds: int = 3600  # 1 hour default
    token_refresh_buffer_seconds: int = 300  # Refresh 5 min before expiry

    # HTTP configuration
    timeout_seconds: float = 30.0
    connect_timeout_seconds: float = 5.0
    pool_connections: int = 100
    pool_maxsize: int = 100

    # Retry configuration
    max_retries: int = 3
    retry_base_delay: float = 0.1  # 100ms
    retry_max_delay: float = 2.0  # 2 seconds
    retry_jitter: float = 0.1  # 10% jitter

    # Circuit breaker configuration
    circuit_breaker_enabled: bool = True
    circuit_breaker_failure_threshold: int = 5
    circuit_breaker_recovery_timeout: int = 30


# =============================================================================
# Token Manager
# =============================================================================


class ServiceTokenManager:
    """Manages JWT token generation, caching, and rotation.

    Handles:
    - Generating service tokens with proper claims
    - Caching tokens until near expiration
    - Automatic token refresh
    """

    def __init__(
        self,
        service_name: str,
        service_id: str | None = None,
        ttl_seconds: int = 3600,
        refresh_buffer: int = 300,
    ):
        """Initialize token manager.

        Args:
            service_name: Name of this service
            service_id: Unique instance ID (auto-generated if None)
            ttl_seconds: Token lifetime in seconds
            refresh_buffer: Seconds before expiry to trigger refresh
        """
        self.service_name = service_name
        self.service_id = service_id or str(uuid.uuid4())
        self.ttl_seconds = ttl_seconds
        self.refresh_buffer = refresh_buffer

        self._current_token: str | None = None
        self._token_expires_at: datetime | None = None
        self._permissions = set(DEFAULT_SERVICE_PERMISSIONS.get(service_name, []))

        logger.info(
            f"ServiceTokenManager initialized",
            extra={
                "service_name": service_name,
                "service_id": self.service_id,
                "ttl_seconds": ttl_seconds,
            },
        )

    def get_token(self) -> str:
        """Get current valid token, generating or refreshing if needed.

        Returns:
            Valid JWT token string
        """
        now = datetime.now(timezone.utc)

        # Generate new token if needed
        if (
            self._current_token is None
            or self._token_expires_at is None
            or now >= (self._token_expires_at - timedelta(seconds=self.refresh_buffer))
        ):
            self._refresh_token()

        return self._current_token

    def get_token_for_user(
        self,
        user_id: uuid.UUID,
        workspace_id: uuid.UUID | None = None,
    ) -> str:
        """Generate a token with user context.

        Use this when making calls on behalf of a specific user.

        Args:
            user_id: User ID to include in token
            workspace_id: Optional workspace ID for scoping

        Returns:
            JWT token with user context
        """
        return generate_service_token(
            service_name=self.service_name,
            service_id=self.service_id,
            permissions=self._permissions,
            user_id=user_id,
            workspace_id=workspace_id,
            expires_in=timedelta(seconds=self.ttl_seconds),
        )

    def _refresh_token(self) -> None:
        """Generate a new token and cache it."""
        self._current_token = generate_service_token(
            service_name=self.service_name,
            service_id=self.service_id,
            permissions=self._permissions,
            expires_in=timedelta(seconds=self.ttl_seconds),
        )

        # Calculate expiration
        now = datetime.now(timezone.utc)
        self._token_expires_at = now + timedelta(seconds=self.ttl_seconds)

        logger.debug(
            f"Service token refreshed",
            extra={
                "service_name": self.service_name,
                "service_id": self.service_id,
                "expires_at": self._token_expires_at.isoformat(),
            },
        )


# =============================================================================
# Service Auth Client
# =============================================================================


class ServiceAuthClient:
    """HTTP client for authenticated service-to-service calls.

    Handles:
    - Automatic JWT token generation and injection
    - Circuit breaker for fault tolerance
    - Retry logic with exponential backoff
    - Connection pooling
    - Observability (metrics, logging)

    Example:
        # Create client
        client = ServiceAuthClient(
            target_service="backend",
            base_url="http://backend:8000"
        )

        # Make authenticated calls
        response = await client.get("/api/v1/galleries")
        data = await client.post("/api/v1/assets", json={"name": "test"})
    """

    def __init__(
        self,
        target_service: str,
        base_url: str,
        config: ServiceClientConfig | None = None,
    ):
        """Initialize service auth client.

        Args:
            target_service: Name of service being called
            base_url: Base URL of target service
            config: Client configuration (uses defaults if None)
        """
        self.target_service = target_service
        self.base_url = base_url.rstrip("/")
        self.config = config or ServiceClientConfig()

        # Token manager for authentication
        self.token_manager = ServiceTokenManager(
            service_name=self.config.service_name,
            service_id=self.config.service_id,
            ttl_seconds=self.config.token_ttl_seconds,
            refresh_buffer=self.config.token_refresh_buffer_seconds,
        )

        # Circuit breaker for resilience
        self.circuit_breaker: CircuitBreaker | None = None
        if self.config.circuit_breaker_enabled:
            backoff_config = BackoffConfig(
                max_retries=self.config.max_retries,
                base_delay=self.config.retry_base_delay,
                max_delay=self.config.retry_max_delay,
                jitter=self.config.retry_jitter,
            )
            self.circuit_breaker = CircuitBreaker(
                service_name=target_service,
                failure_threshold=self.config.circuit_breaker_failure_threshold,
                timeout=self.config.circuit_breaker_recovery_timeout,
                success_threshold=2,
                backoff_config=backoff_config,
            )

        # HTTP client with connection pooling
        timeout = httpx.Timeout(
            timeout=self.config.timeout_seconds,
            connect=self.config.connect_timeout_seconds,
        )
        limits = httpx.Limits(
            max_connections=self.config.pool_connections,
            max_keepalive_connections=self.config.pool_maxsize,
        )

        self.http_client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=timeout,
            limits=limits,
        )

        logger.info(
            f"ServiceAuthClient initialized",
            extra={
                "target_service": target_service,
                "base_url": self.base_url,
                "circuit_breaker_enabled": self.config.circuit_breaker_enabled,
                "timeout_seconds": self.config.timeout_seconds,
            },
        )

    async def get(
        self,
        path: str,
        params: dict | None = None,
        headers: dict | None = None,
        user_id: uuid.UUID | None = None,
        workspace_id: uuid.UUID | None = None,
    ) -> dict:
        """Make authenticated GET request.

        Args:
            path: Request path (e.g., "/api/v1/galleries")
            params: Query parameters
            headers: Additional headers
            user_id: Optional user ID for user-context token
            workspace_id: Optional workspace ID for scoping

        Returns:
            Response JSON as dict

        Raises:
            CircuitBreakerError: If circuit breaker is open
            httpx.HTTPError: On HTTP errors
        """
        return await self._request(
            method="GET",
            path=path,
            params=params,
            headers=headers,
            user_id=user_id,
            workspace_id=workspace_id,
        )

    async def post(
        self,
        path: str,
        json: dict | None = None,
        data: Any | None = None,
        headers: dict | None = None,
        user_id: uuid.UUID | None = None,
        workspace_id: uuid.UUID | None = None,
    ) -> dict:
        """Make authenticated POST request.

        Args:
            path: Request path
            json: JSON body
            data: Form data or other body
            headers: Additional headers
            user_id: Optional user ID for user-context token
            workspace_id: Optional workspace ID for scoping

        Returns:
            Response JSON as dict
        """
        return await self._request(
            method="POST",
            path=path,
            json=json,
            data=data,
            headers=headers,
            user_id=user_id,
            workspace_id=workspace_id,
        )

    async def put(
        self,
        path: str,
        json: dict | None = None,
        headers: dict | None = None,
        user_id: uuid.UUID | None = None,
        workspace_id: uuid.UUID | None = None,
    ) -> dict:
        """Make authenticated PUT request."""
        return await self._request(
            method="PUT",
            path=path,
            json=json,
            headers=headers,
            user_id=user_id,
            workspace_id=workspace_id,
        )

    async def delete(
        self,
        path: str,
        params: dict | None = None,
        headers: dict | None = None,
        user_id: uuid.UUID | None = None,
        workspace_id: uuid.UUID | None = None,
    ) -> dict:
        """Make authenticated DELETE request."""
        return await self._request(
            method="DELETE",
            path=path,
            params=params,
            headers=headers,
            user_id=user_id,
            workspace_id=workspace_id,
        )

    async def _request(
        self,
        method: str,
        path: str,
        params: dict | None = None,
        json: dict | None = None,
        data: Any | None = None,
        headers: dict | None = None,
        user_id: uuid.UUID | None = None,
        workspace_id: uuid.UUID | None = None,
    ) -> dict:
        """Make authenticated HTTP request with retry and circuit breaker.

        Args:
            method: HTTP method
            path: Request path
            params: Query parameters
            json: JSON body
            data: Form data or other body
            headers: Additional headers
            user_id: Optional user ID for user-context token
            workspace_id: Optional workspace ID for scoping

        Returns:
            Response JSON as dict
        """
        start_time = datetime.now(timezone.utc)

        # Get appropriate token
        if user_id:
            token = self.token_manager.get_token_for_user(user_id, workspace_id)
        else:
            token = self.token_manager.get_token()

        # Build headers
        request_headers = {
            "Authorization": f"Bearer {token}",
            "X-Service-Name": self.config.service_name,
            "X-Service-ID": self.token_manager.service_id,
            "Content-Type": "application/json",
        }
        if headers:
            request_headers.update(headers)

        async def _make_request() -> dict:
            """Internal request function."""
            response = await self.http_client.request(
                method=method,
                url=path,
                params=params,
                json=json,
                content=data,
                headers=request_headers,
            )
            response.raise_for_status()
            return response.json()

        # Execute with circuit breaker and retry
        try:
            if self.circuit_breaker:
                result = await self.circuit_breaker.call_with_retry(
                    _make_request,
                    retryable_exceptions=(
                        TimeoutException,
                        ConnectError,
                        OSError,
                    ),
                )
            else:
                result = await _make_request()

            # Log success
            duration_ms = int((datetime.now(timezone.utc) - start_time).total_seconds() * 1000)
            logger.info(
                f"Service call successful",
                extra={
                    "target_service": self.target_service,
                    "method": method,
                    "path": path,
                    "duration_ms": duration_ms,
                    "user_id": str(user_id) if user_id else None,
                },
            )

            return result

        except CircuitBreakerError as e:
            duration_ms = int((datetime.now(timezone.utc) - start_time).total_seconds() * 1000)
            logger.warning(
                f"Circuit breaker open for service call",
                extra={
                    "target_service": self.target_service,
                    "method": method,
                    "path": path,
                    "duration_ms": duration_ms,
                    "error": str(e),
                },
            )
            raise

        except (TimeoutException, ConnectError) as e:
            duration_ms = int((datetime.now(timezone.utc) - start_time).total_seconds() * 1000)
            logger.error(
                f"Service call timeout/connection error",
                extra={
                    "target_service": self.target_service,
                    "method": method,
                    "path": path,
                    "duration_ms": duration_ms,
                    "error": str(e),
                },
            )
            raise

        except httpx.HTTPStatusError as e:
            duration_ms = int((datetime.now(timezone.utc) - start_time).total_seconds() * 1000)
            logger.error(
                f"Service call HTTP error",
                extra={
                    "target_service": self.target_service,
                    "method": method,
                    "path": path,
                    "status_code": e.response.status_code,
                    "duration_ms": duration_ms,
                },
            )
            raise

    async def health_check(self) -> dict:
        """Check target service health.

        Returns:
            Health check response
        """
        try:
            response = await self.http_client.get(
                "/health/live",
                timeout=5.0,
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Health check failed for {self.target_service}: {e}")
            return {
                "status": "unhealthy",
                "error": str(e),
            }

    def get_circuit_breaker_state(self) -> dict | None:
        """Get current circuit breaker state.

        Returns:
            Circuit breaker state or None if disabled
        """
        if self.circuit_breaker:
            return self.circuit_breaker.get_state()
        return None

    async def close(self) -> None:
        """Close HTTP client connections."""
        await self.http_client.aclose()
        logger.info(f"ServiceAuthClient closed for {self.target_service}")

    async def __aenter__(self):
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.close()


# =============================================================================
# Client Registry
# =============================================================================


class ServiceClientRegistry:
    """Registry for managing service client instances.

    Provides singleton access to service clients to enable
    connection reuse and consistent configuration.

    Example:
        # Get client for backend service
        backend_client = ServiceClientRegistry.get_client("backend")
        response = await backend_client.get("/api/v1/galleries")
    """

    _clients: dict[str, ServiceAuthClient] = {}

    @classmethod
    def register_client(
        cls,
        service_name: str,
        base_url: str,
        config: ServiceClientConfig | None = None,
    ) -> ServiceAuthClient:
        """Register a new service client.

        Args:
            service_name: Name of target service
            base_url: Base URL of service
            config: Optional client configuration

        Returns:
            ServiceAuthClient instance
        """
        if service_name in cls._clients:
            logger.warning(f"Client for {service_name} already registered, returning existing")
            return cls._clients[service_name]

        client = ServiceAuthClient(
            target_service=service_name,
            base_url=base_url,
            config=config,
        )
        cls._clients[service_name] = client

        logger.info(f"Registered service client: {service_name} -> {base_url}")
        return client

    @classmethod
    def get_client(cls, service_name: str) -> ServiceAuthClient | None:
        """Get registered service client.

        Args:
            service_name: Name of target service

        Returns:
            ServiceAuthClient or None if not registered
        """
        return cls._clients.get(service_name)

    @classmethod
    async def close_all(cls) -> None:
        """Close all registered clients."""
        for client in cls._clients.values():
            await client.close()
        cls._clients.clear()
        logger.info("All service clients closed")


# =============================================================================
# Pre-configured Clients
# =============================================================================


def get_backend_client() -> ServiceAuthClient:
    """Get or create client for backend service."""
    client = ServiceClientRegistry.get_client("backend")
    if client is None:
        client = ServiceClientRegistry.register_client(
            service_name="backend",
            base_url=settings.AI_SERVICE_URL.replace("ai-service", "backend").replace(":8013", ":8000"),
        )
    return client


def get_ai_service_client() -> ServiceAuthClient:
    """Get or create client for AI service."""
    client = ServiceClientRegistry.get_client("ai-service")
    if client is None:
        client = ServiceClientRegistry.register_client(
            service_name="ai-service",
            base_url=settings.AI_SERVICE_URL,
        )
    return client


def get_webhooks_service_client() -> ServiceAuthClient:
    """Get or create client for webhooks service."""
    client = ServiceClientRegistry.get_client("webhooks-service")
    if client is None:
        client = ServiceClientRegistry.register_client(
            service_name="webhooks-service",
            base_url="http://webhooks-service:8003",
        )
    return client
