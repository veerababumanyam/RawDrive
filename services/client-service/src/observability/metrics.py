"""
Prometheus metrics for monitoring and KEDA autoscaling.

Exposes metrics for:
- Request counts and rates (KEDA trigger)
- Request latency percentiles (KEDA trigger)
- Cache hit/miss rates
- Database connection pool stats
- Error rates

KEDA uses these metrics to make autoscaling decisions.
"""

from prometheus_client import (
    Counter,
    Histogram,
    Gauge,
    CollectorRegistry,
    generate_latest,
    CONTENT_TYPE_LATEST,
)

from src.config import settings

# Create custom registry
metrics_registry = CollectorRegistry()

# =============================================================================
# Request Metrics (KEDA Primary Triggers)
# =============================================================================

REQUEST_COUNT = Counter(
    f"{settings.METRICS_CUSTOM_PREFIX}_http_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status_code"],
    registry=metrics_registry,
)

REQUEST_LATENCY = Histogram(
    f"{settings.METRICS_CUSTOM_PREFIX}_http_request_duration_seconds",
    "HTTP request latency in seconds",
    ["method", "endpoint"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1.0, 2.5, 5.0, 7.5, 10.0),
    registry=metrics_registry,
)

REQUESTS_PER_SECOND = Gauge(
    f"{settings.METRICS_CUSTOM_PREFIX}_requests_per_second",
    "Current requests per second",
    registry=metrics_registry,
)

# =============================================================================
# Error Metrics
# =============================================================================

ERROR_COUNT = Counter(
    f"{settings.METRICS_CUSTOM_PREFIX}_errors_total",
    "Total errors",
    ["error_type", "endpoint"],
    registry=metrics_registry,
)

RATE_LIMIT_HITS = Counter(
    f"{settings.METRICS_CUSTOM_PREFIX}_rate_limit_hits_total",
    "Total rate limit hits",
    ["endpoint"],
    registry=metrics_registry,
)

# =============================================================================
# Cache Metrics
# =============================================================================

CACHE_HITS = Counter(
    f"{settings.METRICS_CUSTOM_PREFIX}_cache_hits_total",
    "Total cache hits",
    ["cache_type"],
    registry=metrics_registry,
)

CACHE_MISSES = Counter(
    f"{settings.METRICS_CUSTOM_PREFIX}_cache_misses_total",
    "Total cache misses",
    ["cache_type"],
    registry=metrics_registry,
)

CACHE_SET_OPERATIONS = Counter(
    f"{settings.METRICS_CUSTOM_PREFIX}_cache_set_operations_total",
    "Total cache set operations",
    ["cache_type"],
    registry=metrics_registry,
)

CACHE_DELETE_OPERATIONS = Counter(
    f"{settings.METRICS_CUSTOM_PREFIX}_cache_delete_operations_total",
    "Total cache delete operations",
    ["cache_type"],
    registry=metrics_registry,
)

# =============================================================================
# Database Metrics
# =============================================================================

DB_QUERY_DURATION = Histogram(
    f"{settings.METRICS_CUSTOM_PREFIX}_db_query_duration_seconds",
    "Database query duration in seconds",
    ["operation", "table"],
    buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0),
    registry=metrics_registry,
)

DB_POOL_SIZE = Gauge(
    f"{settings.METRICS_CUSTOM_PREFIX}_db_pool_size",
    "Current database connection pool size",
    registry=metrics_registry,
)

DB_POOL_AVAILABLE = Gauge(
    f"{settings.METRICS_CUSTOM_PREFIX}_db_pool_available",
    "Available database connections in pool",
    registry=metrics_registry,
)

DB_ERRORS = Counter(
    f"{settings.METRICS_CUSTOM_PREFIX}_db_errors_total",
    "Total database errors",
    ["error_type"],
    registry=metrics_registry,
)

# =============================================================================
# Business Metrics
# =============================================================================

CLIENT_OPERATIONS = Counter(
    f"{settings.METRICS_CUSTOM_PREFIX}_client_operations_total",
    "Total client operations",
    ["operation"],  # create, update, delete, search
    registry=metrics_registry,
)

IMPORT_OPERATIONS = Counter(
    f"{settings.METRICS_CUSTOM_PREFIX}_import_operations_total",
    "Total import operations",
    ["status"],  # success, failure
    registry=metrics_registry,
)

EXPORT_OPERATIONS = Counter(
    f"{settings.METRICS_CUSTOM_PREFIX}_export_operations_total",
    "Total export operations",
    ["format"],  # csv, vcard
    registry=metrics_registry,
)

BULK_OPERATIONS = Counter(
    f"{settings.METRICS_CUSTOM_PREFIX}_bulk_operations_total",
    "Total bulk operations",
    ["operation"],  # add_tags, remove_tags, change_status, delete
    registry=metrics_registry,
)

VISITOR_CONVERSIONS = Counter(
    f"{settings.METRICS_CUSTOM_PREFIX}_visitor_conversions_total",
    "Total visitor to client conversions",
    ["status"],  # success, duplicate, error
    registry=metrics_registry,
)

# =============================================================================
# Service-Specific Metrics
# =============================================================================

ACTIVE_WORKSPACES = Gauge(
    f"{settings.METRICS_CUSTOM_PREFIX}_active_workspaces",
    "Number of active workspaces making requests",
    registry=metrics_registry,
)

SMART_LIST_EVALUATIONS = Counter(
    f"{settings.METRICS_CUSTOM_PREFIX}_smart_list_evaluations_total",
    "Total smart list evaluations",
    registry=metrics_registry,
)

DUPLICATE_DETECTIONS = Counter(
    f"{settings.METRICS_CUSTOM_PREFIX}_duplicate_detections_total",
    "Total duplicate detection runs",
    ["result"],  # found, none
    registry=metrics_registry,
)


def generate_latest_metrics() -> bytes:
    """
    Generate Prometheus metrics in text format.

    Used by /metrics endpoint for Prometheus scraping and KEDA.

    Returns:
        bytes: Metrics in Prometheus text format
    """
    return generate_latest(metrics_registry)


def get_metrics_content_type() -> str:
    """
    Get content type for Prometheus metrics.

    Returns:
        str: Content type header value
    """
    return CONTENT_TYPE_LATEST
