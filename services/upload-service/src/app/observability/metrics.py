"""Prometheus metrics for the Upload Service.

Exposes key metrics for KEDA autoscaling and monitoring:
- upload_concurrent_total: Current concurrent uploads (KEDA trigger)
- upload_chunk_bytes_total: Total bytes uploaded
- upload_session_duration_seconds: Upload session duration histogram
- upload_errors_total: Upload error counter by type
- upload_requests_total: Total upload requests by endpoint

Author: Claude Code Migration
"""

from __future__ import annotations

import time
from typing import Callable, Optional
from functools import wraps

from prometheus_client import (
    Counter,
    Gauge,
    Histogram,
    Info,
    REGISTRY,
    generate_latest,
    CONTENT_TYPE_LATEST,
    CollectorRegistry,
)

# =============================================================================
# Service Info
# =============================================================================

SERVICE_INFO = Info(
    "upload_service",
    "Upload service information",
)

# =============================================================================
# Core Upload Metrics (KEDA triggers)
# =============================================================================

# Gauge for concurrent uploads - primary KEDA trigger
UPLOAD_CONCURRENT = Gauge(
    "upload_concurrent_total",
    "Current number of concurrent uploads in progress",
    ["workspace_id"],
)

# Counter for total uploaded bytes
UPLOAD_BYTES_TOTAL = Counter(
    "upload_chunk_bytes_total",
    "Total bytes uploaded via chunks",
    ["workspace_id", "status"],
)

# Histogram for upload session duration
UPLOAD_DURATION = Histogram(
    "upload_session_duration_seconds",
    "Time from session creation to completion",
    ["workspace_id", "status"],
    buckets=[1, 5, 10, 30, 60, 120, 300, 600, 1800, 3600],
)

# =============================================================================
# Request Metrics
# =============================================================================

# Counter for total requests by endpoint and method
REQUEST_TOTAL = Counter(
    "upload_requests_total",
    "Total HTTP requests to upload service",
    ["method", "endpoint", "status_code"],
)

# Histogram for request latency
REQUEST_LATENCY = Histogram(
    "upload_request_duration_seconds",
    "Request duration in seconds",
    ["method", "endpoint"],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
)

# =============================================================================
# Error Metrics
# =============================================================================

# Counter for upload errors by type
UPLOAD_ERRORS = Counter(
    "upload_errors_total",
    "Total upload errors by error code",
    ["error_code", "workspace_id"],
)

# =============================================================================
# Chunk Metrics
# =============================================================================

# Counter for chunk operations
CHUNK_OPERATIONS = Counter(
    "upload_chunk_operations_total",
    "Total chunk operations",
    ["operation", "status"],
)

# Histogram for chunk size
CHUNK_SIZE = Histogram(
    "upload_chunk_size_bytes",
    "Size of uploaded chunks in bytes",
    buckets=[
        64 * 1024,      # 64KB
        256 * 1024,     # 256KB
        512 * 1024,     # 512KB
        1024 * 1024,    # 1MB
        2 * 1024 * 1024,  # 2MB
        5 * 1024 * 1024,  # 5MB
        10 * 1024 * 1024,  # 10MB
    ],
)

# =============================================================================
# Storage Metrics
# =============================================================================

# Counter for R2 storage operations
STORAGE_OPERATIONS = Counter(
    "upload_storage_operations_total",
    "Total R2 storage operations",
    ["operation", "status"],
)

# Histogram for storage operation latency
STORAGE_LATENCY = Histogram(
    "upload_storage_operation_seconds",
    "Storage operation duration in seconds",
    ["operation"],
    buckets=[0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0],
)

# =============================================================================
# Circuit Breaker Metrics
# =============================================================================

# Gauge for circuit breaker state
CIRCUIT_BREAKER_STATE = Gauge(
    "upload_circuit_breaker_state",
    "Circuit breaker state (0=closed, 1=open, 2=half-open)",
    ["service"],
)

# Counter for circuit breaker state changes
CIRCUIT_BREAKER_TRANSITIONS = Counter(
    "upload_circuit_breaker_transitions_total",
    "Circuit breaker state transitions",
    ["service", "from_state", "to_state"],
)

# =============================================================================
# Redis Metrics
# =============================================================================

# Counter for Redis operations
REDIS_OPERATIONS = Counter(
    "upload_redis_operations_total",
    "Total Redis operations",
    ["operation", "status"],
)

# Histogram for Redis operation latency
REDIS_LATENCY = Histogram(
    "upload_redis_operation_seconds",
    "Redis operation duration in seconds",
    ["operation"],
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0],
)


# =============================================================================
# Metric Helpers
# =============================================================================


def init_metrics(service_version: str) -> None:
    """Initialize service metrics with version info."""
    SERVICE_INFO.info({
        "version": service_version,
        "service": "upload-service",
    })


def get_metrics_output() -> bytes:
    """Generate Prometheus metrics output.

    Returns:
        Prometheus metrics in text exposition format
    """
    return generate_latest(REGISTRY)


def get_metrics_content_type() -> str:
    """Get the Prometheus content type header.

    Returns:
        Content-Type header value for Prometheus metrics
    """
    return CONTENT_TYPE_LATEST


# =============================================================================
# Metric Context Managers
# =============================================================================


class UploadSessionMetrics:
    """Context manager for tracking upload session metrics.

    Usage:
        async with UploadSessionMetrics(workspace_id) as metrics:
            # Upload logic
            metrics.add_bytes(chunk_size)
    """

    def __init__(self, workspace_id: str) -> None:
        self.workspace_id = workspace_id
        self.start_time: float = 0
        self.bytes_uploaded: int = 0
        self.status: str = "success"

    def __enter__(self) -> "UploadSessionMetrics":
        self.start_time = time.time()
        UPLOAD_CONCURRENT.labels(workspace_id=self.workspace_id).inc()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        # Decrement concurrent counter
        UPLOAD_CONCURRENT.labels(workspace_id=self.workspace_id).dec()

        # Record duration
        duration = time.time() - self.start_time
        UPLOAD_DURATION.labels(
            workspace_id=self.workspace_id,
            status=self.status,
        ).observe(duration)

        # Record bytes uploaded
        UPLOAD_BYTES_TOTAL.labels(
            workspace_id=self.workspace_id,
            status=self.status,
        ).inc(self.bytes_uploaded)

    def add_bytes(self, size: int) -> None:
        """Add bytes to the session total."""
        self.bytes_uploaded += size

    def set_failed(self, error_code: str) -> None:
        """Mark the session as failed."""
        self.status = "failed"
        UPLOAD_ERRORS.labels(
            error_code=error_code,
            workspace_id=self.workspace_id,
        ).inc()


class RequestMetrics:
    """Context manager for tracking request metrics.

    Usage:
        with RequestMetrics("POST", "/api/v1/upload/session") as m:
            # Handle request
            m.set_status_code(201)
    """

    def __init__(self, method: str, endpoint: str) -> None:
        self.method = method
        self.endpoint = endpoint
        self.start_time: float = 0
        self.status_code: int = 200

    def __enter__(self) -> "RequestMetrics":
        self.start_time = time.time()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        # Record latency
        duration = time.time() - self.start_time
        REQUEST_LATENCY.labels(
            method=self.method,
            endpoint=self.endpoint,
        ).observe(duration)

        # Increment request counter
        REQUEST_TOTAL.labels(
            method=self.method,
            endpoint=self.endpoint,
            status_code=str(self.status_code),
        ).inc()

    def set_status_code(self, code: int) -> None:
        """Set the response status code."""
        self.status_code = code


class StorageMetrics:
    """Context manager for tracking storage operation metrics.

    Usage:
        with StorageMetrics("upload_object") as m:
            # Storage operation
            pass
    """

    def __init__(self, operation: str) -> None:
        self.operation = operation
        self.start_time: float = 0
        self.status: str = "success"

    def __enter__(self) -> "StorageMetrics":
        self.start_time = time.time()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        # Determine status
        if exc_type is not None:
            self.status = "error"

        # Record latency
        duration = time.time() - self.start_time
        STORAGE_LATENCY.labels(operation=self.operation).observe(duration)

        # Increment operation counter
        STORAGE_OPERATIONS.labels(
            operation=self.operation,
            status=self.status,
        ).inc()


# =============================================================================
# Metric Decorators
# =============================================================================


def track_request(method: str, endpoint: str):
    """Decorator to track request metrics.

    Args:
        method: HTTP method (GET, POST, etc.)
        endpoint: Endpoint path

    Usage:
        @track_request("POST", "/api/v1/upload/session")
        async def create_session(...):
            ...
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            with RequestMetrics(method, endpoint) as m:
                try:
                    result = await func(*args, **kwargs)
                    # Try to extract status code from response
                    if hasattr(result, "status_code"):
                        m.set_status_code(result.status_code)
                    return result
                except Exception as e:
                    m.set_status_code(500)
                    raise
        return wrapper
    return decorator


def track_storage_operation(operation: str):
    """Decorator to track storage operation metrics.

    Args:
        operation: Operation name (upload_object, download_object, etc.)

    Usage:
        @track_storage_operation("upload_object")
        async def upload_to_r2(...):
            ...
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            with StorageMetrics(operation) as m:
                return await func(*args, **kwargs)
        return wrapper
    return decorator


# =============================================================================
# KEDA-Specific Metrics
# =============================================================================


def get_concurrent_uploads(workspace_id: Optional[str] = None) -> float:
    """Get current concurrent upload count.

    Used by KEDA for autoscaling decisions.

    Args:
        workspace_id: Optional workspace to filter by

    Returns:
        Current concurrent upload count
    """
    if workspace_id:
        return UPLOAD_CONCURRENT.labels(workspace_id=workspace_id)._value._value
    # Sum across all workspaces
    return sum(
        sample.value
        for metric in REGISTRY.collect()
        if metric.name == "upload_concurrent_total"
        for sample in metric.samples
    )


# =============================================================================
# Module Exports
# =============================================================================

__all__ = [
    # Info
    "SERVICE_INFO",
    # Core metrics
    "UPLOAD_CONCURRENT",
    "UPLOAD_BYTES_TOTAL",
    "UPLOAD_DURATION",
    # Request metrics
    "REQUEST_TOTAL",
    "REQUEST_LATENCY",
    # Error metrics
    "UPLOAD_ERRORS",
    # Chunk metrics
    "CHUNK_OPERATIONS",
    "CHUNK_SIZE",
    # Storage metrics
    "STORAGE_OPERATIONS",
    "STORAGE_LATENCY",
    # Circuit breaker metrics
    "CIRCUIT_BREAKER_STATE",
    "CIRCUIT_BREAKER_TRANSITIONS",
    # Redis metrics
    "REDIS_OPERATIONS",
    "REDIS_LATENCY",
    # Helpers
    "init_metrics",
    "get_metrics_output",
    "get_metrics_content_type",
    # Context managers
    "UploadSessionMetrics",
    "RequestMetrics",
    "StorageMetrics",
    # Decorators
    "track_request",
    "track_storage_operation",
    # KEDA helpers
    "get_concurrent_uploads",
]
