"""Service-specific circuit breaker configurations.

Each service has tailored circuit breaker settings based on:
- Criticality (fail-open vs fail-closed)
- Expected load and latency
- Cost of fallback
- Recovery time expectations
"""

from dataclasses import dataclass
from typing import Optional, List
from enum import Enum


class ServiceCriticality(str, Enum):
    """Service criticality determines fallback behavior.

    CRITICAL: Cannot function without this service (fail-closed)
    HIGH: Degraded operation without this service (cached fallback)
    MEDIUM: Optional feature, best-effort (default fallback)
    LOW: Nice-to-have, can fail silently (null fallback)
    """
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


@dataclass
class ServiceConfig:
    """Circuit breaker configuration for a specific external service.

    Attributes:
        service_name: Unique identifier for the service
        base_url: Base URL for the service (or None for non-HTTP services)
        failure_threshold: Consecutive failures before opening circuit
        recovery_timeout_seconds: Time before attempting recovery
        half_open_max_calls: Successful calls needed to close circuit
        timeout_seconds: Request timeout for this service
        max_retries: Maximum retry attempts
        base_delay_ms: Initial backoff delay in milliseconds
        max_delay_ms: Maximum backoff delay cap
        jitter_ratio: Randomization factor (0.0-1.0) to prevent thundering herd
        criticality: How critical this service is to gallery operations
        retryable_exceptions: Exception types that trigger retry
        fallback_enabled: Whether to use fallback when circuit is open
        cache_ttl_seconds: For cache fallback, TTL of cached data
        health_check_path: Endpoint path for health checks (default: /health)
        tags: Additional labels for metrics and monitoring
    """

    service_name: str
    base_url: Optional[str]
    failure_threshold: int
    recovery_timeout_seconds: int
    half_open_max_calls: int
    timeout_seconds: float
    max_retries: int
    base_delay_ms: int
    max_delay_ms: int
    jitter_ratio: float
    criticality: ServiceCriticality
    retryable_exceptions: tuple
    fallback_enabled: bool
    cache_ttl_seconds: Optional[int]
    health_check_path: str
    tags: dict

    def __post_init__(self):
        """Validate configuration."""
        if self.failure_threshold < 1:
            raise ValueError(f"{self.service_name}: failure_threshold must be >= 1")
        if self.recovery_timeout_seconds < 1:
            raise ValueError(f"{self.service_name}: recovery_timeout must be >= 1s")
        if self.half_open_max_calls < 1:
            raise ValueError(f"{self.service_name}: half_open_max_calls must be >= 1")
        if self.timeout_seconds < 0.1:
            raise ValueError(f"{self.service_name}: timeout must be >= 100ms")
        if self.max_delay_ms < self.base_delay_ms:
            raise ValueError(f"{self.service_name}: max_delay must be >= base_delay")
        if not 0 <= self.jitter_ratio <= 1:
            raise ValueError(f"{self.service_name}: jitter_ratio must be 0-1")


# =============================================================================
# Pre-configured Service Circuit Breaker Configurations
# =============================================================================

# AI Service Configuration
# - Fast fail (2s timeout) to prevent cascading delays
# - Moderate retry for transient issues
# - Cache fallback for previously generated recommendations
AI_SERVICE_CONFIG = ServiceConfig(
    service_name="ai-service",
    base_url="http://ai-service:8013",
    failure_threshold=5,
    recovery_timeout_seconds=30,
    half_open_max_calls=2,
    timeout_seconds=2.0,  # 2-second timeout prevents cascading failures
    max_retries=3,
    base_delay_ms=100,  # 100ms
    max_delay_ms=2000,  # 2s cap
    jitter_ratio=0.1,
    criticality=ServiceCriticality.MEDIUM,
    retryable_exceptions=(Exception,),  # Retry on most errors
    fallback_enabled=True,
    cache_ttl_seconds=300,  # 5 minute cache for AI recommendations
    health_check_path="/health",
    tags={"type": "ai", "provider": "mcp"},
)

# Upload Service Configuration
# - Fast detection of upload failures
# - Short timeout to not block user uploads
# - Fail-open to allow retries at application layer
UPLOAD_SERVICE_CONFIG = ServiceConfig(
    service_name="upload-service",
    base_url="http://upload-service:8008",
    failure_threshold=3,
    recovery_timeout_seconds=20,
    half_open_max_calls=2,
    timeout_seconds=5.0,
    max_retries=2,
    base_delay_ms=200,  # 200ms
    max_delay_ms=1000,  # 1s cap
    jitter_ratio=0.15,
    criticality=ServiceCriticality.HIGH,
    retryable_exceptions=(ConnectionError, TimeoutError),
    fallback_enabled=False,  # Let application handle upload retries
    cache_ttl_seconds=None,
    health_check_path="/health/live",
    tags={"type": "storage", "protocol": "tus"},
)

# Billing Service Configuration
# - Conservative - billing operations are critical
# - Longer timeout for payment processing
# - Fail-closed to prevent incorrect billing state
BILLING_SERVICE_CONFIG = ServiceConfig(
    service_name="billing-service",
    base_url="http://billing-service:8005",
    failure_threshold=3,
    recovery_timeout_seconds=60,
    half_open_max_calls=3,
    timeout_seconds=10.0,  # Longer for payment processing
    max_retries=1,  # Fewer retries for billing idempotency
    base_delay_ms=500,
    max_delay_ms=2000,
    jitter_ratio=0.1,
    criticality=ServiceCriticality.CRITICAL,
    retryable_exceptions=(ConnectionError, TimeoutError),
    fallback_enabled=False,  # Critical - no fallback
    cache_ttl_seconds=None,
    health_check_path="/health/live",
    tags={"type": "billing", "payment": "stripe,razorpay"},
)

# Client Service Configuration
# - Moderate threshold for client/contact operations
# - Cache fallback for read operations
# - Fail-open for reads, fail-closed for writes
CLIENT_SERVICE_CONFIG = ServiceConfig(
    service_name="client-service",
    base_url="http://client-service:8009",
    failure_threshold=5,
    recovery_timeout_seconds=30,
    half_open_max_calls=2,
    timeout_seconds=3.0,
    max_retries=2,
    base_delay_ms=150,
    max_delay_ms=1500,
    jitter_ratio=0.1,
    criticality=ServiceCriticality.HIGH,
    retryable_exceptions=(ConnectionError, TimeoutError),
    fallback_enabled=True,
    cache_ttl_seconds=600,  # 10 minute cache for client data
    health_check_path="/health/live",
    tags={"type": "crm", "domain": "clients"},
)

# Notifications Service Configuration
# - Fire-and-forget notifications are less critical
# - Queue-based, can be retried later
# - Fail-open to not block gallery operations
NOTIFICATIONS_SERVICE_CONFIG = ServiceConfig(
    service_name="notifications-service",
    base_url="http://notifications-service:8010",
    failure_threshold=10,  # Higher threshold for notifications
    recovery_timeout_seconds=30,
    half_open_max_calls=2,
    timeout_seconds=2.0,
    max_retries=3,
    base_delay_ms=100,
    max_delay_ms=1000,
    jitter_ratio=0.2,
    criticality=ServiceCriticality.LOW,
    retryable_exceptions=(ConnectionError, TimeoutError),
    fallback_enabled=True,
    cache_ttl_seconds=None,
    health_check_path="/health/live",
    tags={"type": "notifications", "channels": "email,sms,push"},
)

# Webhooks Service Configuration
# - Event delivery is important but can queue
# - Dead letter queue handles failures
# - Fail-open with logging
WEBHOOKS_SERVICE_CONFIG = ServiceConfig(
    service_name="webhooks-service",
    base_url="http://webhooks-service:8003",
    failure_threshold=5,
    recovery_timeout_seconds=45,
    half_open_max_calls=2,
    timeout_seconds=3.0,
    max_retries=2,
    base_delay_ms=200,
    max_delay_ms=2000,
    jitter_ratio=0.15,
    criticality=ServiceCriticality.MEDIUM,
    retryable_exceptions=(ConnectionError, TimeoutError),
    fallback_enabled=False,  # Webhooks service has its own retry logic
    cache_ttl_seconds=None,
    health_check_path="/health/live",
    tags={"type": "webhooks", "delivery": "hmac-signed"},
)

# Redis Configuration (in-memory cache)
# - Very fast fail for cache misses
# - Fail-open (cache miss is acceptable)
# - Minimal retries for cache operations
REDIS_CONFIG = ServiceConfig(
    service_name="redis",
    base_url=None,  # Not an HTTP service
    failure_threshold=10,  # Higher threshold for cache
    recovery_timeout_seconds=10,  # Quick recovery for cache
    half_open_max_calls=3,
    timeout_seconds=0.5,  # 500ms timeout for Redis
    max_retries=1,
    base_delay_ms=50,
    max_delay_ms=200,
    jitter_ratio=0.1,
    criticality=ServiceCriticality.MEDIUM,
    retryable_exceptions=(ConnectionError, TimeoutError),
    fallback_enabled=True,
    cache_ttl_seconds=None,  # IS the cache
    health_check_path="PING",
    tags={"type": "cache", "protocol": "redis"},
)


# =============================================================================
# Service Registry
# =============================================================================

SERVICE_CONFIGS = {
    "ai-service": AI_SERVICE_CONFIG,
    "upload-service": UPLOAD_SERVICE_CONFIG,
    "billing-service": BILLING_SERVICE_CONFIG,
    "client-service": CLIENT_SERVICE_CONFIG,
    "notifications-service": NOTIFICATIONS_SERVICE_CONFIG,
    "webhooks-service": WEBHOOKS_SERVICE_CONFIG,
    "redis": REDIS_CONFIG,
}


def get_service_config(service_name: str) -> Optional[ServiceConfig]:
    """Get configuration for a service by name.

    Args:
        service_name: Name of the service

    Returns:
        ServiceConfig if found, None otherwise
    """
    return SERVICE_CONFIGS.get(service_name)


def list_all_services() -> List[str]:
    """List all configured service names.

    Returns:
        List of service names
    """
    return list(SERVICE_CONFIGS.keys())
