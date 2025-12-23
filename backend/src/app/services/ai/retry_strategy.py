"""Retry Strategy with Exponential Backoff for AI Providers.

This module provides retry functionality for transient failures when calling
AI providers. It implements exponential backoff with jitter to prevent
thundering herd problems.

Key features:
- Configurable retry attempts and delays
- Exponential backoff with optional jitter
- Transient error detection for retry decisions
- Detailed logging for debugging and monitoring

Requirements covered:
- 5.3: Retry logic with exponential backoff for transient failures

Example:
    result = await with_retry(
        operation=lambda: provider.detect_faces(image),
        config=RetryConfig(max_retries=3, initial_delay_ms=1000),
        is_retryable=is_transient_error,
    )
"""

from __future__ import annotations

import asyncio
import logging
import random
from dataclasses import dataclass
from typing import Any, Callable, Optional, TypeVar

from app.api.face_schemas import FaceDetectionErrorCode
from app.services.face_exceptions import (
    FaceDetectionError,
    ProviderRateLimitedError,
    ProviderTimeoutError,
    ProviderUnavailableError,
)

logger = logging.getLogger(__name__)


# =============================================================================
# TYPE DEFINITIONS
# =============================================================================

T = TypeVar("T")  # Generic type for operation results


@dataclass
class RetryConfig:
    """Configuration for retry behavior.
    
    Attributes:
        max_retries: Maximum number of retry attempts (0 = no retries)
        initial_delay_ms: Initial delay before first retry (milliseconds)
        max_delay_ms: Maximum delay between retries (milliseconds)
        backoff_multiplier: Multiplier for exponential backoff
        jitter_factor: Optional jitter factor (0-1) to prevent thundering herd
    """
    max_retries: int = 3
    initial_delay_ms: int = 1000
    max_delay_ms: int = 30000
    backoff_multiplier: float = 2.0
    jitter_factor: float = 0.1
    
    def __post_init__(self) -> None:
        """Validate configuration values."""
        if self.max_retries < 0:
            raise ValueError("max_retries must be non-negative")
        if self.initial_delay_ms < 0:
            raise ValueError("initial_delay_ms must be non-negative")
        if self.max_delay_ms < self.initial_delay_ms:
            raise ValueError("max_delay_ms must be >= initial_delay_ms")
        if self.backoff_multiplier < 1.0:
            raise ValueError("backoff_multiplier must be >= 1.0")
        if not 0.0 <= self.jitter_factor <= 1.0:
            raise ValueError("jitter_factor must be between 0 and 1")


# Default retry configuration for face detection operations
DEFAULT_RETRY_CONFIG = RetryConfig(
    max_retries=3,
    initial_delay_ms=1000,
    max_delay_ms=30000,
    backoff_multiplier=2.0,
    jitter_factor=0.1,
)

# Aggressive retry config for critical operations
AGGRESSIVE_RETRY_CONFIG = RetryConfig(
    max_retries=5,
    initial_delay_ms=500,
    max_delay_ms=60000,
    backoff_multiplier=2.0,
    jitter_factor=0.15,
)

# Conservative retry config for rate-limited scenarios
CONSERVATIVE_RETRY_CONFIG = RetryConfig(
    max_retries=2,
    initial_delay_ms=2000,
    max_delay_ms=10000,
    backoff_multiplier=3.0,
    jitter_factor=0.2,
)


# =============================================================================
# TRANSIENT ERROR DETECTION
# =============================================================================


def is_transient_error(error: Exception) -> bool:
    """Determines if an error is transient and worth retrying.
    
    Retryable errors:
    - Rate limiting (429)
    - Timeouts
    - Temporary network issues
    - Provider temporary unavailability
    
    Non-retryable errors:
    - Invalid input (400)
    - Authentication failures (401, 403)
    - Not found (404)
    - Permanent provider errors
    
    Args:
        error: The exception to check
        
    Returns:
        True if the error is transient and should be retried
    """
    # Check for FaceDetectionError with specific codes
    if isinstance(error, FaceDetectionError):
        retryable_codes = {
            FaceDetectionErrorCode.PROVIDER_RATE_LIMITED,
            FaceDetectionErrorCode.PROVIDER_TIMEOUT,
            FaceDetectionErrorCode.PROVIDER_UNAVAILABLE,
        }
        return error.code in retryable_codes

    # Check for HTTP status codes in generic errors
    http_status = getattr(error, "status", None) or getattr(error, "status_code", None)
    if http_status:
        # 429 (rate limited), 502-504 (gateway errors) are retryable
        if http_status == 429:
            return True
        if 502 <= http_status <= 504:
            return True
        return False

    # Check for network errors by error type name or code
    error_code = getattr(error, "code", None)
    if error_code:
        network_error_codes = {
            "ECONNRESET",
            "ETIMEDOUT", 
            "ECONNREFUSED",
            "EPIPE",
            "ENETUNREACH",
            "EHOSTUNREACH",
        }
        if error_code in network_error_codes:
            return True

    # Check for common transient error types
    error_type = type(error).__name__
    transient_error_types = {
        "ConnectionError",
        "TimeoutError",
        "ConnectionResetError",
        "ConnectionRefusedError",
        "BrokenPipeError",
        "OSError",  # Often network-related
    }
    if error_type in transient_error_types:
        return True

    # Check error message for common transient patterns
    error_message = str(error).lower()
    transient_patterns = [
        "timeout",
        "timed out",
        "connection reset",
        "connection refused",
        "temporarily unavailable",
        "service unavailable",
        "too many requests",
        "rate limit",
        "quota exceeded",
    ]
    for pattern in transient_patterns:
        if pattern in error_message:
            return True

    # Default to not retrying unknown errors
    return False


def get_retry_after_from_error(error: Exception) -> Optional[int]:
    """Extracts retry-after hint from error if available.
    
    Some rate limit errors include a hint about when to retry.
    
    Args:
        error: The exception to check
        
    Returns:
        Retry-after time in milliseconds, or None if not available
    """
    # Check for ProviderRateLimitedError with retry_after
    if isinstance(error, ProviderRateLimitedError):
        retry_after = error.details.get("retry_after_seconds") if error.details else None
        if retry_after:
            return retry_after * 1000  # Convert to milliseconds

    # Check for retry-after header in HTTP errors
    retry_after = getattr(error, "retry_after", None)
    if retry_after:
        if isinstance(retry_after, (int, float)):
            return int(retry_after * 1000)
        # Could be a date string - skip for now
        
    return None


# =============================================================================
# RETRY IMPLEMENTATION
# =============================================================================


async def with_retry(
    operation: Callable[[], Any],
    config: RetryConfig = DEFAULT_RETRY_CONFIG,
    is_retryable: Callable[[Exception], bool] = is_transient_error,
    operation_name: Optional[str] = None,
    correlation_id: Optional[str] = None,
) -> T:
    """Executes an operation with automatic retry on transient failures.
    
    Uses exponential backoff with optional jitter to prevent thundering herd.
    
    Args:
        operation: The async or sync operation to execute
        config: Retry configuration
        is_retryable: Function to determine if an error is retryable
        operation_name: Optional name for logging
        correlation_id: Optional correlation ID for tracing
        
    Returns:
        The result of the successful operation
        
    Raises:
        Exception: The last error if all retries are exhausted
        
    Example:
        result = await with_retry(
            operation=lambda: provider.detect_faces(image),
            config=RetryConfig(max_retries=3, initial_delay_ms=1000),
            operation_name="face_detection",
        )
    """
    last_error: Optional[Exception] = None
    delay_ms = config.initial_delay_ms
    op_name = operation_name or "operation"

    for attempt in range(config.max_retries + 1):
        try:
            # Log retry attempts (skip first attempt)
            if attempt > 0:
                logger.debug(
                    "Retrying operation",
                    extra={
                        "operation": op_name,
                        "attempt": attempt,
                        "max_retries": config.max_retries,
                        "delay_ms": delay_ms,
                        "correlation_id": correlation_id,
                    },
                )

            # Execute the operation
            result = operation()
            
            # Handle async operations
            if asyncio.iscoroutine(result):
                result = await result

            # Log success after retry
            if attempt > 0:
                logger.info(
                    "Operation succeeded after retry",
                    extra={
                        "operation": op_name,
                        "attempt": attempt,
                        "correlation_id": correlation_id,
                    },
                )

            return result

        except Exception as error:
            last_error = error
            
            # Check if we should retry
            should_retry = is_retryable(error) and attempt < config.max_retries
            
            if not should_retry:
                # Either not retryable or out of retries
                if attempt > 0:
                    logger.warning(
                        "Retry exhausted or error not retryable",
                        extra={
                            "operation": op_name,
                            "attempt": attempt,
                            "max_retries": config.max_retries,
                            "error": str(error),
                            "error_type": type(error).__name__,
                            "retryable": is_retryable(error),
                            "correlation_id": correlation_id,
                        },
                    )
                raise

            # Check for retry-after hint from error
            retry_after_hint = get_retry_after_from_error(error)
            if retry_after_hint and retry_after_hint > delay_ms:
                delay_ms = min(retry_after_hint, config.max_delay_ms)

            # Calculate delay with jitter
            jitter = 0.0
            if config.jitter_factor > 0:
                jitter = delay_ms * config.jitter_factor * random.random()
            
            actual_delay_ms = min(delay_ms + jitter, config.max_delay_ms)

            logger.debug(
                "Operation failed, will retry",
                extra={
                    "operation": op_name,
                    "attempt": attempt,
                    "error": str(error),
                    "error_type": type(error).__name__,
                    "next_retry_in_ms": actual_delay_ms,
                    "correlation_id": correlation_id,
                },
            )

            # Wait before next retry
            await asyncio.sleep(actual_delay_ms / 1000.0)
            
            # Increase delay for next iteration (exponential backoff)
            delay_ms = min(
                delay_ms * config.backoff_multiplier,
                config.max_delay_ms,
            )

    # This should never be reached, but TypeScript needs it
    if last_error:
        raise last_error
    raise RuntimeError("Unexpected state in retry loop")


def with_retry_sync(
    operation: Callable[[], T],
    config: RetryConfig = DEFAULT_RETRY_CONFIG,
    is_retryable: Callable[[Exception], bool] = is_transient_error,
    operation_name: Optional[str] = None,
) -> T:
    """Synchronous version of with_retry for non-async contexts.
    
    Uses time.sleep instead of asyncio.sleep.
    
    Args:
        operation: The sync operation to execute
        config: Retry configuration
        is_retryable: Function to determine if an error is retryable
        operation_name: Optional name for logging
        
    Returns:
        The result of the successful operation
        
    Raises:
        Exception: The last error if all retries are exhausted
    """
    import time
    
    last_error: Optional[Exception] = None
    delay_ms = config.initial_delay_ms
    op_name = operation_name or "operation"

    for attempt in range(config.max_retries + 1):
        try:
            if attempt > 0:
                logger.debug(
                    "Retrying operation (sync)",
                    extra={
                        "operation": op_name,
                        "attempt": attempt,
                        "max_retries": config.max_retries,
                    },
                )

            result = operation()
            
            if attempt > 0:
                logger.info(
                    "Operation succeeded after retry (sync)",
                    extra={"operation": op_name, "attempt": attempt},
                )

            return result

        except Exception as error:
            last_error = error
            should_retry = is_retryable(error) and attempt < config.max_retries
            
            if not should_retry:
                raise

            # Calculate delay with jitter
            jitter = delay_ms * config.jitter_factor * random.random()
            actual_delay_ms = min(delay_ms + jitter, config.max_delay_ms)

            logger.debug(
                "Operation failed, will retry (sync)",
                extra={
                    "operation": op_name,
                    "attempt": attempt,
                    "error": str(error),
                    "next_retry_in_ms": actual_delay_ms,
                },
            )

            # Wait before next retry
            time.sleep(actual_delay_ms / 1000.0)
            
            # Exponential backoff
            delay_ms = min(delay_ms * config.backoff_multiplier, config.max_delay_ms)

    if last_error:
        raise last_error
    raise RuntimeError("Unexpected state in retry loop")


# =============================================================================
# DECORATOR VERSION
# =============================================================================


def retry(
    config: RetryConfig = DEFAULT_RETRY_CONFIG,
    is_retryable: Callable[[Exception], bool] = is_transient_error,
) -> Callable:
    """Decorator to add retry behavior to async functions.
    
    Args:
        config: Retry configuration
        is_retryable: Function to determine if an error is retryable
        
    Returns:
        Decorated function with retry behavior
        
    Example:
        @retry(config=RetryConfig(max_retries=3))
        async def call_provider():
            return await provider.detect_faces(image)
    """
    def decorator(func: Callable) -> Callable:
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            return await with_retry(
                operation=lambda: func(*args, **kwargs),
                config=config,
                is_retryable=is_retryable,
                operation_name=func.__name__,
            )
        
        # Preserve function metadata
        wrapper.__name__ = func.__name__
        wrapper.__doc__ = func.__doc__
        return wrapper
    
    return decorator
