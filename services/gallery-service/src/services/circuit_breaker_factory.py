"""Circuit Breaker Factory for External Service Calls.

Extends circuit breaker protection beyond AI service to all external services:
- Upload service (asset processing status)
- Billing service (subscription checks)
- Client service (client management)
- Notifications service (message delivery)
- Webhooks service (event delivery)
- LLM service (chat completions)

Usage:
    upload_breaker = get_circuit_breaker("upload-service")
    await upload_breaker.call_with_retry(upload_service.process_asset, asset_id)

    billing_breaker = get_circuit_breaker("billing-service")
    await billing_breaker.call_with_retry(billing_service.check_quota, workspace_id)
"""

from typing import Dict, Optional
from src.services.ai_client.circuit_breaker import CircuitBreaker, BackoffConfig
from src.log_config import get_logger

logger = get_logger(__name__)


# =============================================================================
# Service-Specific Circuit Breaker Configurations
# =============================================================================

CIRCUIT_BREAKER_CONFIGS: Dict[str, Dict] = {
    "upload-service": {
        "failure_threshold": 5,      # Open after 5 consecutive failures
        "timeout": 30,               # Wait 30s before attempting reset
        "success_threshold": 2,      # 2 successes in half-open to close
        "backoff": {
            "max_retries": 3,         # Retry up to 3 times
            "base_delay": 0.5,        # Start with 500ms delay
            "max_delay": 5.0,         # Cap at 5 seconds
            "jitter": 0.15,           # 15% jitter
        }
    },
    "billing-service": {
        "failure_threshold": 3,      # Stricter - billing is critical
        "timeout": 60,               # Wait 60s before attempting reset
        "success_threshold": 3,      # Require 3 successes to close
        "backoff": {
            "max_retries": 2,         # Fewer retries for billing
            "base_delay": 1.0,        # Start with 1s delay
            "max_delay": 10.0,        # Cap at 10 seconds
            "jitter": 0.1,            # 10% jitter
        }
    },
    "client-service": {
        "failure_threshold": 5,
        "timeout": 30,
        "success_threshold": 2,
        "backoff": {
            "max_retries": 3,
            "base_delay": 0.3,
            "max_delay": 3.0,
            "jitter": 0.1,
        }
    },
    "notifications-service": {
        "failure_threshold": 8,      # More tolerant - notifications can queue
        "timeout": 20,
        "success_threshold": 2,
        "backoff": {
            "max_retries": 5,         # More retries for notifications
            "base_delay": 0.2,
            "max_delay": 2.0,
            "jitter": 0.2,            # Higher jitter
        }
    },
    "webhooks-service": {
        "failure_threshold": 5,
        "timeout": 60,
        "success_threshold": 2,
        "backoff": {
            "max_retries": 3,
            "base_delay": 1.0,
            "max_delay": 30.0,        # Longer cap for webhook retries
            "jitter": 0.15,
        }
    },
    "llm-service": {
        "failure_threshold": 5,
        "timeout": 30,
        "success_threshold": 2,
        "backoff": {
            "max_retries": 2,         # Fewer retries for LLM (quick fail)
            "base_delay": 0.5,
            "max_delay": 3.0,
            "jitter": 0.1,
        }
    },
    "ai-service": {
        "failure_threshold": 5,
        "timeout": 60,
        "success_threshold": 2,
        "backoff": {
            "max_retries": 3,
            "base_delay": 0.1,
            "max_delay": 2.0,
            "jitter": 0.1,
        }
    },
    "r2-storage": {
        "failure_threshold": 10,     # Very tolerant - storage is critical
        "timeout": 15,
        "success_threshold": 3,
        "backoff": {
            "max_retries": 5,         # Many retries for storage
            "base_delay": 0.1,        # Quick initial retry
            "max_delay": 1.0,         # Short cap for storage
            "jitter": 0.05,           # Low jitter for storage
        }
    },
    "redis-cache": {
        "failure_threshold": 15,     # Very tolerant - cache failures are non-critical
        "timeout": 10,
        "success_threshold": 2,
        "backoff": {
            "max_retries": 2,         # Fewer retries - fail fast on cache
            "base_delay": 0.05,       # Very quick retry
            "max_delay": 0.5,
            "jitter": 0.1,
        }
    },
}


# =============================================================================
# Circuit Breaker Registry
# =============================================================================

_circuit_breakers: Dict[str, CircuitBreaker] = {}


def get_backoff_config(service_name: str) -> BackoffConfig:
    """Get backoff configuration for a service.

    Args:
        service_name: Name of the service

    Returns:
        BackoffConfig with service-specific settings
    """
    config = CIRCUIT_BREAKER_CONFIGS.get(service_name, {})
    backoff_config = config.get("backoff", {})

    return BackoffConfig(
        max_retries=backoff_config.get("max_retries", 3),
        base_delay=backoff_config.get("base_delay", 0.1),
        max_delay=backoff_config.get("max_delay", 2.0),
        jitter=backoff_config.get("jitter", 0.1),
    )


def get_circuit_breaker(service_name: str) -> CircuitBreaker:
    """Get or create a circuit breaker for a service.

    This factory function creates circuit breakers on-demand with
    service-specific configurations. Each service gets its own
    circuit breaker instance with appropriate thresholds.

    Args:
        service_name: Name of the external service (e.g., "upload-service")

    Returns:
        CircuitBreaker instance configured for the service

    Example:
        upload_breaker = get_circuit_breaker("upload-service")
        await upload_breaker.call_with_retry(
            upload_client.process_asset,
            asset_id,
            retryable_exceptions=(TimeoutError, ConnectionError)
        )
    """
    # Return existing instance if available
    if service_name in _circuit_breakers:
        return _circuit_breakers[service_name]

    # Get service-specific configuration
    config = CIRCUIT_BREAKER_CONFIGS.get(service_name, {})

    # Create backoff config
    backoff = get_backoff_config(service_name)

    # Create new circuit breaker
    breaker = CircuitBreaker(
        service_name=service_name,
        failure_threshold=config.get("failure_threshold", 5),
        timeout=config.get("timeout", 60),
        success_threshold=config.get("success_threshold", 2),
        backoff_config=backoff,
    )

    # Cache and return
    _circuit_breakers[service_name] = breaker

    logger.info(
        f"Created circuit breaker for {service_name}: "
        f"threshold={breaker.failure_threshold}, "
        f"timeout={breaker.timeout}s, "
        f"max_retries={backoff.max_retries}"
    )

    return breaker


def reset_circuit_breaker(service_name: str) -> None:
    """Manually reset a circuit breaker to CLOSED state.

    Use this after confirming a service has recovered, or for testing.

    Args:
        service_name: Name of the service to reset
    """
    if service_name in _circuit_breakers:
        _circuit_breakers[service_name].reset()
        logger.info(f"Manually reset circuit breaker for {service_name}")


def get_all_circuit_breaker_states() -> Dict[str, dict]:
    """Get state of all circuit breakers for monitoring.

    Returns:
        Dictionary mapping service names to their circuit breaker state
    """
    return {
        service_name: breaker.get_state()
        for service_name, breaker in _circuit_breakers.items()
    }


def reset_all_circuit_breakers() -> None:
    """Reset all circuit breakers to CLOSED state.

    Use this after a mass service recovery or for testing.
    """
    for service_name, breaker in _circuit_breakers.items():
        breaker.reset()
        logger.info(f"Reset circuit breaker for {service_name}")


# =============================================================================
# Convenience Functions for Common Services
# =============================================================================

async def call_upload_service(func, *args, **kwargs):
    """Call upload service with circuit breaker protection.

    Args:
        func: Async function to call
        *args: Positional arguments
        **kwargs: Keyword arguments

    Returns:
        Result from function call

    Raises:
        CircuitBreakerError: If circuit is open
        Exception: Original exception after retries
    """
    breaker = get_circuit_breaker("upload-service")
    return await breaker.call_with_retry(func, *args, **kwargs)


async def call_billing_service(func, *args, **kwargs):
    """Call billing service with circuit breaker protection.

    Args:
        func: Async function to call
        *args: Positional arguments
        **kwargs: Keyword arguments

    Returns:
        Result from function call

    Raises:
        CircuitBreakerError: If circuit is open
        Exception: Original exception after retries
    """
    breaker = get_circuit_breaker("billing-service")
    return await breaker.call_with_retry(func, *args, **kwargs)


async def call_client_service(func, *args, **kwargs):
    """Call client service with circuit breaker protection.

    Args:
        func: Async function to call
        *args: Positional arguments
        **kwargs: Keyword arguments

    Returns:
        Result from function call

    Raises:
        CircuitBreakerError: If circuit is open
        Exception: Original exception after retries
    """
    breaker = get_circuit_breaker("client-service")
    return await breaker.call_with_retry(func, *args, **kwargs)


async def call_notifications_service(func, *args, **kwargs):
    """Call notifications service with circuit breaker protection.

    Args:
        func: Async function to call
        *args: Positional arguments
        **kwargs: Keyword arguments

    Returns:
        Result from function call

    Raises:
        CircuitBreakerError: If circuit is open
        Exception: Original exception after retries
    """
    breaker = get_circuit_breaker("notifications-service")
    return await breaker.call_with_retry(func, *args, **kwargs)


async def call_webhooks_service(func, *args, **kwargs):
    """Call webhooks service with circuit breaker protection.

    Args:
        func: Async function to call
        *args: Positional arguments
        **kwargs: Keyword arguments

    Returns:
        Result from function call

    Raises:
        CircuitBreakerError: If circuit is open
        Exception: Original exception after retries
    """
    breaker = get_circuit_breaker("webhooks-service")
    return await breaker.call_with_retry(func, *args, **kwargs)


async def call_llm_service(func, *args, **kwargs):
    """Call LLM service with circuit breaker protection.

    Args:
        func: Async function to call
        *args: Positional arguments
        **kwargs: Keyword arguments

    Returns:
        Result from function call

    Raises:
        CircuitBreakerError: If circuit is open
        Exception: Original exception after retries
    """
    breaker = get_circuit_breaker("llm-service")
    return await breaker.call_with_retry(func, *args, **kwargs)


# =============================================================================
# Fallback Strategies
# =============================================================================

class FallbackStrategy:
    """Provides fallback responses when services are unavailable."""

    @staticmethod
    def upload_service_fallback(operation: str, **kwargs):
        """Fallback response for upload service failures.

        Args:
            operation: Type of operation (e.g., "process_asset", "get_status")
            **kwargs: Operation parameters

        Returns:
            Fallback response or None
        """
        if operation == "get_status":
            # Return cached or pending status
            return {
                "status": "pending",
                "message": "Upload status temporarily unavailable",
                "fallback": True
            }
        return None

    @staticmethod
    def billing_service_fallback(operation: str, **kwargs):
        """Fallback response for billing service failures.

        Args:
            operation: Type of operation
            **kwargs: Operation parameters

        Returns:
            Fallback response or None
        """
        if operation == "check_quota":
            # On billing failures, allow operation but log for later reconciliation
            logger.warning(
                "Billing service unavailable, allowing operation with fallback",
                extra={"operation": operation, "kwargs": kwargs}
            )
            return {
                "allowed": True,
                "quota_remaining": None,
                "fallback": True,
                "message": "Quota check temporarily unavailable"
            }
        return None

    @staticmethod
    def client_service_fallback(operation: str, **kwargs):
        """Fallback response for client service failures."""
        if operation == "get_clients":
            return {"clients": [], "fallback": True}
        return None

    @staticmethod
    def notifications_service_fallback(operation: str, **kwargs):
        """Fallback response for notifications service failures."""
        # Notification failures are logged but don't block operations
        logger.warning(
            "Notification service unavailable, message queued",
            extra={"operation": operation, "kwargs": kwargs}
        )
        return {"queued": True, "fallback": True}

    @staticmethod
    def webhooks_service_fallback(operation: str, **kwargs):
        """Fallback response for webhooks service failures."""
        # Webhook failures are logged but don't block operations
        logger.warning(
            "Webhook service unavailable, event not delivered",
            extra={"operation": operation, "kwargs": kwargs}
        )
        return {"delivered": False, "fallback": True}


async def call_with_fallback(
    service_name: str,
    func,
    *args,
    fallback_func=None,
    **kwargs
):
    """Call service with circuit breaker and fallback support.

    Args:
        service_name: Name of the service
        func: Async function to call
        *args: Positional arguments
        fallback_func: Optional fallback function
        **kwargs: Keyword arguments

    Returns:
        Result from function call or fallback
    """
    breaker = get_circuit_breaker(service_name)

    try:
        return await breaker.call_with_retry(func, *args, **kwargs)
    except Exception as e:
        # Circuit breaker open or all retries exhausted
        logger.warning(
            f"Service call failed for {service_name}, attempting fallback",
            extra={"error": str(e)}
        )

        # Use provided fallback or default
        if fallback_func:
            return await fallback_func(*args, **kwargs)

        # Try default fallback strategy
        fallback_strategy = getattr(FallbackStrategy, f"{service_name.replace('-', '_')}_fallback", None)
        if fallback_strategy:
            operation = kwargs.get("operation", "unknown")
            return fallback_strategy(operation, **kwargs)

        # No fallback available
        raise


__all__ = [
    "get_circuit_breaker",
    "reset_circuit_breaker",
    "reset_all_circuit_breakers",
    "get_all_circuit_breaker_states",
    "call_upload_service",
    "call_billing_service",
    "call_client_service",
    "call_notifications_service",
    "call_webhooks_service",
    "call_llm_service",
    "call_with_fallback",
    "FallbackStrategy",
    "CIRCUIT_BREAKER_CONFIGS",
]
