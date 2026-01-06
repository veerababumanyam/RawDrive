"""
Prometheus metrics module for Sync Service.

Provides metrics for KEDA autoscaling and monitoring.
Placeholder - full implementation in T011.
"""

from typing import Optional
from prometheus_client import (
    Counter,
    Gauge,
    Histogram,
    generate_latest,
    CONTENT_TYPE_LATEST,
    CollectorRegistry,
)

from src.config import settings
from src.logging import get_logger

logger = get_logger(__name__)

# Custom registry to avoid conflicts
REGISTRY = CollectorRegistry(auto_describe=True)

# =============================================================================
# Sync Session Metrics (KEDA Triggers)
# =============================================================================

SYNC_ACTIVE_SESSIONS = Gauge(
    f"{settings.METRICS_CUSTOM_PREFIX}_active_sessions",
    "Number of active sync sessions",
    registry=REGISTRY,
)

SYNC_UPLOAD_QUEUE_DEPTH = Gauge(
    f"{settings.METRICS_CUSTOM_PREFIX}_upload_queue_depth",
    "Number of files waiting to be uploaded",
    registry=REGISTRY,
)

SYNC_WEBSOCKET_CONNECTIONS = Gauge(
    f"{settings.METRICS_CUSTOM_PREFIX}_websocket_connections",
    "Number of active WebSocket connections",
    registry=REGISTRY,
)

# =============================================================================
# File Processing Metrics
# =============================================================================

SYNC_FILES_DETECTED = Counter(
    f"{settings.METRICS_CUSTOM_PREFIX}_files_detected_total",
    "Total number of files detected",
    ["mapping_id"],
    registry=REGISTRY,
)

SYNC_FILES_PROCESSED = Counter(
    f"{settings.METRICS_CUSTOM_PREFIX}_files_processed_total",
    "Total number of files processed",
    ["status"],  # completed, failed, skipped, duplicate
    registry=REGISTRY,
)

SYNC_BYTES_UPLOADED = Counter(
    f"{settings.METRICS_CUSTOM_PREFIX}_bytes_uploaded_total",
    "Total bytes uploaded",
    registry=REGISTRY,
)

# =============================================================================
# Latency Metrics
# =============================================================================

SYNC_FILE_DETECTION_LATENCY = Histogram(
    f"{settings.METRICS_CUSTOM_PREFIX}_file_detection_latency_seconds",
    "Time from file creation to detection",
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0],
    registry=REGISTRY,
)

SYNC_UPLOAD_LATENCY = Histogram(
    f"{settings.METRICS_CUSTOM_PREFIX}_upload_latency_seconds",
    "Time to upload a file",
    buckets=[1.0, 5.0, 10.0, 30.0, 60.0, 120.0, 300.0],
    registry=REGISTRY,
)

# =============================================================================
# Error Metrics
# =============================================================================

SYNC_ERRORS = Counter(
    f"{settings.METRICS_CUSTOM_PREFIX}_errors_total",
    "Total number of sync errors",
    ["error_code"],
    registry=REGISTRY,
)

# =============================================================================
# Request Metrics
# =============================================================================

SYNC_REQUESTS = Counter(
    f"{settings.METRICS_CUSTOM_PREFIX}_requests_total",
    "Total number of API requests",
    ["method", "endpoint", "status"],
    registry=REGISTRY,
)

SYNC_REQUEST_LATENCY = Histogram(
    f"{settings.METRICS_CUSTOM_PREFIX}_request_latency_seconds",
    "Request latency in seconds",
    ["method", "endpoint"],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
    registry=REGISTRY,
)


# =============================================================================
# Metric Functions
# =============================================================================


def init_metrics(version: str) -> None:
    """Initialize metrics with service information."""
    logger.info(f"Initializing metrics for version {version}")
    # Set initial values
    SYNC_ACTIVE_SESSIONS.set(0)
    SYNC_UPLOAD_QUEUE_DEPTH.set(0)
    SYNC_WEBSOCKET_CONNECTIONS.set(0)


def generate_latest_metrics() -> bytes:
    """Generate Prometheus metrics output."""
    return generate_latest(REGISTRY)


def get_metrics_content_type() -> str:
    """Get the content type for Prometheus metrics."""
    return CONTENT_TYPE_LATEST


def get_active_sync_sessions() -> int:
    """Get the current number of active sync sessions."""
    # This returns the current gauge value
    # In a real implementation, this would query Redis or the database
    return int(SYNC_ACTIVE_SESSIONS._value.get())


def increment_active_sessions() -> None:
    """Increment the active sessions counter."""
    SYNC_ACTIVE_SESSIONS.inc()


def decrement_active_sessions() -> None:
    """Decrement the active sessions counter."""
    SYNC_ACTIVE_SESSIONS.dec()


def set_upload_queue_depth(depth: int) -> None:
    """Set the upload queue depth."""
    SYNC_UPLOAD_QUEUE_DEPTH.set(depth)


def increment_websocket_connections() -> None:
    """Increment WebSocket connections counter."""
    SYNC_WEBSOCKET_CONNECTIONS.inc()


def decrement_websocket_connections() -> None:
    """Decrement WebSocket connections counter."""
    SYNC_WEBSOCKET_CONNECTIONS.dec()


def record_file_detected(mapping_id: str) -> None:
    """Record a file detection event."""
    SYNC_FILES_DETECTED.labels(mapping_id=mapping_id).inc()


def record_file_processed(status: str) -> None:
    """Record a file processing completion."""
    SYNC_FILES_PROCESSED.labels(status=status).inc()


def record_bytes_uploaded(bytes_count: int) -> None:
    """Record bytes uploaded."""
    SYNC_BYTES_UPLOADED.inc(bytes_count)


def record_sync_error(error_code: str) -> None:
    """Record a sync error."""
    SYNC_ERRORS.labels(error_code=error_code).inc()


def observe_file_detection_latency(latency_seconds: float) -> None:
    """Observe file detection latency."""
    SYNC_FILE_DETECTION_LATENCY.observe(latency_seconds)


def observe_upload_latency(latency_seconds: float) -> None:
    """Observe upload latency."""
    SYNC_UPLOAD_LATENCY.observe(latency_seconds)
