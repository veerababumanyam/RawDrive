"""
Prometheus Metrics for the Gallery Microservice.

Exposes key metrics for KEDA autoscaling and monitoring:
- Request latency and throughput (KEDA trigger)
- Gallery view counts
- WebSocket connections (KEDA trigger)
- Proofing interactions
- Cache hit/miss rates
- Database connection pool stats
"""

import time
from contextlib import contextmanager
from typing import Optional

from prometheus_client import (
    Counter,
    Histogram,
    Gauge,
    generate_latest,
    CONTENT_TYPE_LATEST,
)

from src.log_config import get_logger

logger = get_logger(__name__)


# =============================================================================
# Metric Definitions - KEDA Scaling Triggers
# =============================================================================

# Request metrics (primary KEDA trigger)
REQUEST_COUNT = Counter(
    "gallery_http_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status_code"],
)

REQUEST_LATENCY = Histogram(
    "gallery_http_request_duration_seconds",
    "HTTP request latency in seconds",
    ["method", "endpoint"],
    buckets=[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
)

# Requests per second gauge (for KEDA Prometheus trigger)
REQUESTS_PER_SECOND = Gauge(
    "gallery_requests_per_second",
    "Current requests per second rate",
)

# Gallery view metrics
GALLERY_VIEWS = Counter(
    "gallery_views_total",
    "Total gallery page views",
    ["access_type"],  # magic_link, authenticated, public
)

ACTIVE_GALLERY_VIEWERS = Gauge(
    "gallery_active_viewers",
    "Current active gallery viewers",
    ["gallery_id"],
)

# WebSocket metrics (secondary KEDA trigger)
WEBSOCKET_CONNECTIONS = Gauge(
    "gallery_websocket_connections_active",
    "Active WebSocket connections",
)

WEBSOCKET_MESSAGES = Counter(
    "gallery_websocket_messages_total",
    "Total WebSocket messages",
    ["direction", "type"],  # direction: in/out, type: proofing/heartbeat
)

# Proofing metrics
PROOFING_ACTIONS = Counter(
    "gallery_proofing_actions_total",
    "Total proofing actions",
    ["action_type"],  # favorite, select, comment
)

PROOFING_LATENCY = Histogram(
    "gallery_proofing_action_duration_seconds",
    "Proofing action latency in seconds",
    buckets=[0.01, 0.025, 0.05, 0.1, 0.2, 0.5],
)

# Magic Link metrics
MAGIC_LINK_VALIDATIONS = Counter(
    "gallery_magic_link_validations_total",
    "Total magic link validations",
    ["status"],  # success, expired, invalid
)

# Cache metrics
CACHE_HITS = Counter(
    "gallery_cache_hits_total",
    "Cache hit count",
    ["cache_type"],  # gallery, assets, proofing
)

CACHE_MISSES = Counter(
    "gallery_cache_misses_total",
    "Cache miss count",
    ["cache_type"],
)

CACHE_HIT_RATIO = Gauge(
    "gallery_cache_hit_ratio",
    "Cache hit ratio (0-1)",
    ["cache_type"],
)

# Database metrics
DB_QUERY_LATENCY = Histogram(
    "gallery_db_query_duration_seconds",
    "Database query latency in seconds",
    ["operation", "read_replica"],
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0],
)

DB_CONNECTIONS_ACTIVE = Gauge(
    "gallery_db_connections_active",
    "Active database connections",
    ["pool"],  # primary, read_replica
)

DB_CONNECTIONS_IDLE = Gauge(
    "gallery_db_connections_idle",
    "Idle database connections",
    ["pool"],
)

# Error metrics
ERRORS = Counter(
    "gallery_errors_total",
    "Total errors by type",
    ["error_type", "endpoint"],
)

# Circuit breaker metrics
CIRCUIT_BREAKER_STATE = Gauge(
    "gallery_circuit_breaker_state",
    "Circuit breaker state (0=closed, 1=half_open, 2=open)",
    ["service"],  # redis, database
)

# Cache warming metrics
CACHE_WARM_COMPLETE = Counter(
    "gallery_cache_warm_complete_total",
    "Total successful cache warming operations",
)

CACHE_WARM_GALLERIES = Counter(
    "gallery_cache_warm_galleries_total",
    "Total galleries warmed in cache",
)

CACHE_WARM_ERRORS = Counter(
    "gallery_cache_warm_errors_total",
    "Total cache warming errors",
    ["error_type"],  # gallery_fetch, cache_set, background
)


# =============================================================================
# Metrics Collector
# =============================================================================


class MetricsCollector:
    """
    Centralized metrics collection with helper methods.

    Usage:
        metrics = get_metrics()

        # Track request
        with metrics.track_request("GET", "/api/v1/galleries"):
            await handle_request()

        # Track gallery view
        metrics.gallery_viewed("magic_link")
    """

    def __init__(self):
        self._cache_hits = {"gallery": 0, "assets": 0, "proofing": 0}
        self._cache_total = {"gallery": 0, "assets": 0, "proofing": 0}

    @contextmanager
    def track_request_duration(self, method: str, endpoint: str):
        """Context manager to track request latency."""
        start_time = time.monotonic()
        try:
            yield
        finally:
            duration = time.monotonic() - start_time
            REQUEST_LATENCY.labels(method=method, endpoint=endpoint).observe(duration)

    def request_completed(
        self,
        method: str,
        endpoint: str,
        status_code: int,
    ) -> None:
        """Record a completed HTTP request."""
        REQUEST_COUNT.labels(
            method=method,
            endpoint=endpoint,
            status_code=str(status_code),
        ).inc()

    def gallery_viewed(self, access_type: str = "public") -> None:
        """Record a gallery view."""
        GALLERY_VIEWS.labels(access_type=access_type).inc()

    def set_active_viewers(self, gallery_id: str, count: int) -> None:
        """Set the active viewer count for a gallery."""
        ACTIVE_GALLERY_VIEWERS.labels(gallery_id=gallery_id).set(count)

    def websocket_connected(self) -> None:
        """Record a new WebSocket connection."""
        WEBSOCKET_CONNECTIONS.inc()

    def websocket_disconnected(self) -> None:
        """Record a WebSocket disconnection."""
        WEBSOCKET_CONNECTIONS.dec()

    def websocket_message(self, direction: str, msg_type: str) -> None:
        """Record a WebSocket message."""
        WEBSOCKET_MESSAGES.labels(direction=direction, type=msg_type).inc()

    def proofing_action(self, action_type: str) -> None:
        """Record a proofing action."""
        PROOFING_ACTIONS.labels(action_type=action_type).inc()

    @contextmanager
    def track_proofing_duration(self):
        """Context manager to track proofing action latency."""
        start_time = time.monotonic()
        try:
            yield
        finally:
            duration = time.monotonic() - start_time
            PROOFING_LATENCY.observe(duration)

    def magic_link_validated(self, status: str) -> None:
        """Record a magic link validation."""
        MAGIC_LINK_VALIDATIONS.labels(status=status).inc()

    def cache_hit(self, cache_type: str = "gallery") -> None:
        """Record a cache hit."""
        CACHE_HITS.labels(cache_type=cache_type).inc()
        self._cache_hits[cache_type] = self._cache_hits.get(cache_type, 0) + 1
        self._cache_total[cache_type] = self._cache_total.get(cache_type, 0) + 1
        self._update_cache_ratio(cache_type)

    def cache_miss(self, cache_type: str = "gallery") -> None:
        """Record a cache miss."""
        CACHE_MISSES.labels(cache_type=cache_type).inc()
        self._cache_total[cache_type] = self._cache_total.get(cache_type, 0) + 1
        self._update_cache_ratio(cache_type)

    def _update_cache_ratio(self, cache_type: str) -> None:
        """Update cache hit ratio gauge."""
        total = self._cache_total.get(cache_type, 0)
        hits = self._cache_hits.get(cache_type, 0)
        ratio = hits / total if total > 0 else 0
        CACHE_HIT_RATIO.labels(cache_type=cache_type).set(ratio)

    @contextmanager
    def track_db_query(self, operation: str, read_replica: bool = False):
        """Context manager to track database query latency."""
        start_time = time.monotonic()
        try:
            yield
        finally:
            duration = time.monotonic() - start_time
            DB_QUERY_LATENCY.labels(
                operation=operation,
                read_replica=str(read_replica).lower(),
            ).observe(duration)

    def set_db_connections(
        self,
        pool: str,
        active: int,
        idle: int,
    ) -> None:
        """Set database connection counts."""
        DB_CONNECTIONS_ACTIVE.labels(pool=pool).set(active)
        DB_CONNECTIONS_IDLE.labels(pool=pool).set(idle)

    def error_occurred(
        self,
        error_type: str,
        endpoint: str = "unknown",
    ) -> None:
        """Record an error occurrence."""
        ERRORS.labels(error_type=error_type, endpoint=endpoint).inc()

    def set_circuit_breaker_state(self, service: str, state: int) -> None:
        """Set circuit breaker state (0=closed, 1=half_open, 2=open)."""
        CIRCUIT_BREAKER_STATE.labels(service=service).set(state)

    def set_requests_per_second(self, rps: float) -> None:
        """Set current requests per second rate for KEDA scaling."""
        REQUESTS_PER_SECOND.set(rps)

    def cache_warm_complete(self, galleries_warmed: int) -> None:
        """Record a successful cache warming operation."""
        CACHE_WARM_COMPLETE.inc()
        CACHE_WARM_GALLERIES.inc(galleries_warmed)

    def cache_warm_error(self, error_type: str) -> None:
        """Record a cache warming error."""
        CACHE_WARM_ERRORS.labels(error_type=error_type).inc()


# =============================================================================
# Module-level convenience functions
# =============================================================================

_metrics: Optional[MetricsCollector] = None


def get_metrics() -> MetricsCollector:
    """Get the global metrics collector instance."""
    global _metrics
    if _metrics is None:
        _metrics = MetricsCollector()
    return _metrics


def track_request(method: str, endpoint: str, status_code: int) -> None:
    """Track an HTTP request (convenience function)."""
    get_metrics().request_completed(method, endpoint, status_code)


def track_error(error_type: str, endpoint: str = "unknown") -> None:
    """Track an error (convenience function)."""
    get_metrics().error_occurred(error_type, endpoint)


def get_prometheus_metrics() -> bytes:
    """Get Prometheus metrics in text format."""
    return generate_latest()


def get_prometheus_content_type() -> str:
    """Get the content type for Prometheus metrics."""
    return CONTENT_TYPE_LATEST


def generate_latest_metrics() -> str:
    """Generate Prometheus metrics in text format for HTTP response."""
    return generate_latest().decode("utf-8")
