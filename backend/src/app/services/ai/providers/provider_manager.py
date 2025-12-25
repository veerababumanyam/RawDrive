"""Provider Manager for AI face detection providers.

This module implements the ProviderManager class that handles:
- Provider selection based on priority and health
- Automatic failover when providers fail
- Circuit breaker integration for fault tolerance
- Health monitoring and status reporting

The manager ensures high availability by automatically switching
to backup providers when the primary provider fails.
"""

import asyncio
import logging
from typing import Any, Callable, Coroutine, Optional, TypeVar

from app.api.face_schemas import FaceDetectionResult
from app.services.face_exceptions import (
    AllProvidersFailedError,
    FaceDetectionError,
)
from app.services.ai.circuit_breaker import (
    CircuitBreaker,
    CircuitBreakerConfig,
    CircuitState,
)
from app.services.ai.providers.types import (
    IAIProvider,
    DetectionOptions,
    ProviderStatus,
    ProviderHealthStatus,
    HealthCheckResult,
)
from app.services.ai.providers.cloud_vision_provider import CloudVisionProvider
from app.services.ai.providers.gemini_provider import GeminiProvider
from app.services.ai.providers.local_provider import LocalProvider


logger = logging.getLogger(__name__)


# Type variable for generic operation results
T = TypeVar("T")


class ProviderManager:
    """Manages AI provider selection, failover, and health monitoring.
    
    Key responsibilities:
    - Select the best available provider based on priority and health
    - Execute operations with automatic failover on failure
    - Monitor provider health and manage circuit breakers
    - Load configuration from admin settings with env var fallback
    
    The manager maintains a registry of providers and their circuit breakers,
    automatically routing requests to healthy providers and failing over
    when necessary.
    
    Attributes:
        _providers: Map of provider name to provider instance
        _circuit_breakers: Map of provider name to circuit breaker
        _config_service: Configuration service for provider settings
        _admin_settings_service: Admin settings service for provider configs
        _initialized: Whether providers have been initialized
    """
    
    # Default circuit breaker configuration
    DEFAULT_FAILURE_THRESHOLD = 5
    DEFAULT_RECOVERY_TIME_MS = 60000  # 1 minute
    DEFAULT_HALF_OPEN_REQUESTS = 3
    
    def __init__(
        self,
        config_service: Any,  # FaceConfigurationService
        admin_settings_service: Optional[Any] = None,  # FaceAdminSettingsService
    ) -> None:
        """Initialize the provider manager.
        
        Args:
            config_service: Configuration service for loading credentials
            admin_settings_service: Optional admin settings service
        """
        self._config_service = config_service
        self._admin_settings_service = admin_settings_service
        
        # Provider registry
        self._providers: dict[str, IAIProvider] = {}
        
        # Circuit breakers for each provider
        self._circuit_breakers: dict[str, CircuitBreaker] = {}
        
        # Initialization state
        self._initialized = False
        self._init_lock = asyncio.Lock()

    # =========================================================================
    # INITIALIZATION
    # =========================================================================

    async def initialize(self) -> None:
        """Initialize all configured providers with their circuit breakers.
        
        Called once during service startup. Creates provider instances
        and configures circuit breakers for fault tolerance.
        """
        if self._initialized:
            return
        
        async with self._init_lock:
            if self._initialized:
                return
            
            await self._initialize_providers()
            self._initialized = True

    async def _initialize_providers(self) -> None:
        """Initialize provider instances and circuit breakers.
        
        Creates instances of all supported providers and configures
        circuit breakers with appropriate thresholds.
        """
        # Initialize Cloud Vision provider (primary)
        cloud_vision_provider = CloudVisionProvider(self._config_service)
        self._providers["cloud_vision"] = cloud_vision_provider
        self._circuit_breakers["cloud_vision"] = CircuitBreaker(
            CircuitBreakerConfig(
                failure_threshold=self.DEFAULT_FAILURE_THRESHOLD,
                recovery_time_ms=self.DEFAULT_RECOVERY_TIME_MS,
                half_open_requests=self.DEFAULT_HALF_OPEN_REQUESTS,
                name="cloud_vision",
            )
        )
        
        # Initialize Gemini provider (fallback)
        gemini_provider = GeminiProvider(self._config_service)
        self._providers["gemini"] = gemini_provider
        self._circuit_breakers["gemini"] = CircuitBreaker(
            CircuitBreakerConfig(
                failure_threshold=self.DEFAULT_FAILURE_THRESHOLD,
                recovery_time_ms=self.DEFAULT_RECOVERY_TIME_MS,
                half_open_requests=self.DEFAULT_HALF_OPEN_REQUESTS,
                name="gemini",
            )
        )
        
        # Initialize Local provider (last resort fallback - no API required)
        local_provider = LocalProvider(self._config_service)
        self._providers["local"] = local_provider
        self._circuit_breakers["local"] = CircuitBreaker(
            CircuitBreakerConfig(
                failure_threshold=self.DEFAULT_FAILURE_THRESHOLD,
                recovery_time_ms=self.DEFAULT_RECOVERY_TIME_MS,
                half_open_requests=self.DEFAULT_HALF_OPEN_REQUESTS,
                name="local",
            )
        )
        
        logger.info(
            "AI providers initialized",
            extra={"providers": list(self._providers.keys())},
        )

    # =========================================================================
    # PROVIDER SELECTION
    # =========================================================================

    async def select_provider(self) -> IAIProvider:
        """Select the best available provider based on priority and health.
        
        Selection criteria (in order):
        1. Provider must be enabled in configuration
        2. Provider's circuit breaker must not be open
        3. Lower priority number = higher preference
        
        Returns:
            The selected provider instance
            
        Raises:
            AllProvidersFailedError: If no healthy providers are available
        """
        await self.initialize()
        
        # Get enabled providers sorted by priority
        enabled_providers = await self._get_enabled_providers()
        
        for provider_config in enabled_providers:
            provider_name = provider_config["provider_name"]
            
            # Get circuit breaker for this provider
            breaker = self._circuit_breakers.get(provider_name)
            
            # Skip providers with open circuit breakers
            if breaker and breaker.is_open():
                logger.debug(
                    "Skipping provider due to open circuit breaker",
                    extra={"provider": provider_name},
                )
                continue
            
            # Get provider instance
            provider = self._providers.get(provider_name)
            if provider:
                logger.debug(
                    "Selected provider",
                    extra={"provider": provider_name},
                )
                return provider
        
        # No healthy providers available
        raise AllProvidersFailedError(
            provider_errors=[
                {"provider": name, "error": "Circuit breaker open or provider unavailable"}
                for name in self._providers.keys()
            ]
        )

    async def _get_enabled_providers(self) -> list[dict[str, Any]]:
        """Get list of enabled providers sorted by priority.
        
        Returns:
            List of provider configurations with name and priority
        """
        # If admin settings service is available, use it
        if self._admin_settings_service:
            try:
                providers = await self._admin_settings_service.get_providers()
                enabled = [
                    {"provider_name": p.provider_name, "priority": p.priority}
                    for p in providers
                    if p.is_enabled
                ]
                enabled.sort(key=lambda x: x["priority"])
                return enabled
            except Exception as e:
                logger.warning(
                    "Failed to get providers from admin settings, using defaults",
                    extra={"error": str(e)},
                )
        
        # Default provider configuration
        # Cloud Vision is primary (priority 1), Gemini is fallback (priority 2),
        # Local is last resort (priority 3) - no API required
        return [
            {"provider_name": "cloud_vision", "priority": 1},
            {"provider_name": "gemini", "priority": 2},
            {"provider_name": "local", "priority": 3},
        ]

    # =========================================================================
    # FAILOVER EXECUTION
    # =========================================================================

    async def execute_with_failover(
        self,
        operation: Callable[[IAIProvider], Coroutine[Any, Any, T]],
    ) -> T:
        """Execute an operation with automatic failover to backup providers.
        
        Failover behavior:
        1. Try primary provider (lowest priority number)
        2. On failure, record in circuit breaker and try next provider
        3. Continue until success or all providers exhausted
        4. Throw aggregated error if all providers fail
        
        Args:
            operation: Async function that takes a provider and returns a result
            
        Returns:
            The result of the successful operation
            
        Raises:
            AllProvidersFailedError: If all providers fail
        """
        await self.initialize()
        
        # Get enabled providers sorted by priority
        enabled_providers = await self._get_enabled_providers()
        
        # Track errors from each provider for debugging
        errors: list[dict[str, Any]] = []
        
        for provider_config in enabled_providers:
            provider_name = provider_config["provider_name"]
            
            # Get provider and circuit breaker
            provider = self._providers.get(provider_name)
            breaker = self._circuit_breakers.get(provider_name)
            
            # Skip if provider or breaker not initialized
            if not provider or not breaker:
                logger.warning(
                    "Provider not properly initialized",
                    extra={"provider": provider_name},
                )
                continue
            
            try:
                # Execute through circuit breaker for failure tracking
                result = await breaker.execute(lambda: operation(provider))
                
                # Log successful failover if this wasn't the first provider
                if errors:
                    logger.info(
                        "Operation succeeded after failover",
                        extra={
                            "successful_provider": provider_name,
                            "failed_providers": [e["provider"] for e in errors],
                        },
                    )
                
                return result
                
            except Exception as e:
                # Record error and continue to next provider
                errors.append({
                    "provider": provider_name,
                    "error": str(e),
                })
                
                logger.warning(
                    "Provider failed, attempting failover",
                    extra={
                        "failed_provider": provider_name,
                        "error": str(e),
                        "remaining_providers": [
                            p["provider_name"]
                            for p in enabled_providers
                            if p["provider_name"] != provider_name
                            and p not in [e["provider"] for e in errors]
                        ],
                    },
                )
        
        # All providers failed
        raise AllProvidersFailedError(provider_errors=errors)

    # =========================================================================
    # FACE DETECTION (CONVENIENCE METHOD)
    # =========================================================================

    async def detect_faces(
        self,
        image_buffer: bytes,
        options: Optional[DetectionOptions] = None,
    ) -> list[FaceDetectionResult]:
        """Detect faces in an image with automatic failover.
        
        Convenience method that wraps detect_faces with failover logic.
        
        Args:
            image_buffer: Raw image data as bytes
            options: Detection options
            
        Returns:
            List of detected faces
            
        Raises:
            AllProvidersFailedError: If all providers fail
        """
        return await self.execute_with_failover(
            lambda provider: provider.detect_faces(image_buffer, options)
        )

    # =========================================================================
    # HEALTH MONITORING
    # =========================================================================

    async def check_health(self, provider_name: str) -> HealthCheckResult:
        """Perform a health check on a specific provider.
        
        Args:
            provider_name: Name of the provider to check
            
        Returns:
            HealthCheckResult with status and latency
        """
        await self.initialize()
        
        provider = self._providers.get(provider_name)
        if not provider:
            return HealthCheckResult(
                healthy=False,
                latency_ms=0,
                message=f"Provider '{provider_name}' not found",
            )
        
        return await provider.health_check()

    async def get_provider_status(self) -> list[ProviderStatus]:
        """Get status information for all providers.
        
        Returns:
            List of ProviderStatus objects with health and config info
        """
        await self.initialize()
        
        # Get enabled providers
        enabled_providers = await self._get_enabled_providers()
        enabled_names = {p["provider_name"] for p in enabled_providers}
        
        statuses = []
        for provider_name, provider in self._providers.items():
            breaker = self._circuit_breakers.get(provider_name)
            
            # Determine health status
            if breaker and breaker.is_open():
                health_status = ProviderHealthStatus.UNHEALTHY
            elif breaker and breaker.state == CircuitState.HALF_OPEN:
                health_status = ProviderHealthStatus.UNKNOWN
            else:
                health_status = ProviderHealthStatus.HEALTHY
            
            # Get priority from config
            priority = next(
                (p["priority"] for p in enabled_providers if p["provider_name"] == provider_name),
                999,
            )
            
            statuses.append(ProviderStatus(
                name=provider_name,
                is_enabled=provider_name in enabled_names,
                health_status=health_status,
                priority=priority,
                circuit_breaker_state=breaker.state.value if breaker else "unknown",
            ))
        
        # Sort by priority
        statuses.sort(key=lambda s: s.priority)
        
        return statuses

    async def get_provider_config(
        self,
        provider_name: str,
    ) -> Optional[dict[str, Any]]:
        """Get configuration for a specific provider.
        
        Args:
            provider_name: Name of the provider
            
        Returns:
            Provider configuration dict or None if not found
        """
        if self._admin_settings_service:
            try:
                providers = await self._admin_settings_service.get_providers()
                for provider in providers:
                    if provider.provider_name == provider_name:
                        return {
                            "provider_name": provider.provider_name,
                            "is_enabled": provider.is_enabled,
                            "priority": provider.priority,
                            "rate_limit_per_minute": provider.rate_limit_per_minute,
                            "timeout_ms": provider.timeout_ms,
                            "health_status": provider.health_status,
                        }
            except Exception:
                pass
        
        return None

    async def update_provider_health(
        self,
        provider_name: str,
        healthy: bool,
    ) -> None:
        """Update the health status of a provider.
        
        Called after health checks to update admin settings.
        
        Args:
            provider_name: Name of the provider
            healthy: Whether the provider is healthy
        """
        if self._admin_settings_service:
            try:
                await self._admin_settings_service.update_provider_health(
                    provider_name,
                    "healthy" if healthy else "unhealthy",
                )
            except Exception as e:
                logger.warning(
                    "Failed to update provider health status",
                    extra={"provider": provider_name, "error": str(e)},
                )

    # =========================================================================
    # CIRCUIT BREAKER ACCESS
    # =========================================================================

    def get_circuit_breaker(self, provider_name: str) -> Optional[CircuitBreaker]:
        """Get the circuit breaker for a provider.
        
        Args:
            provider_name: Name of the provider
            
        Returns:
            CircuitBreaker instance or None if not found
        """
        return self._circuit_breakers.get(provider_name)

    def reset_circuit_breaker(self, provider_name: str) -> bool:
        """Reset the circuit breaker for a provider.
        
        Used to manually recover a provider after fixing issues.
        
        Args:
            provider_name: Name of the provider
            
        Returns:
            True if reset successful, False if provider not found
        """
        breaker = self._circuit_breakers.get(provider_name)
        if breaker:
            breaker.reset()
            logger.info(
                "Circuit breaker reset",
                extra={"provider": provider_name},
            )
            return True
        return False
