"""
Prometheus Metrics for the Invitations Microservice.

Exposes key metrics for monitoring:
- Request latency and throughput
- Email send success/failure rates
- RSVP submission rates
- Error counts by type
- Active invitation counts
"""

import time
from contextlib import contextmanager
from typing import Callable, Optional

from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST

from src.logging import get_logger

logger = get_logger(__name__)


# =============================================================================
# Metric Definitions
# =============================================================================

# Request metrics
REQUEST_COUNT = Counter(
    "invitations_http_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status_code"],
)

REQUEST_LATENCY = Histogram(
    "invitations_http_request_duration_seconds",
    "HTTP request latency in seconds",
    ["method", "endpoint"],
    buckets=[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
)

# Email metrics
EMAIL_SENT = Counter(
    "invitations_emails_sent_total",
    "Total emails sent",
    ["status", "template"],
)

EMAIL_LATENCY = Histogram(
    "invitations_email_send_duration_seconds",
    "Email send latency in seconds",
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0],
)

# RSVP metrics
RSVP_SUBMISSIONS = Counter(
    "invitations_rsvp_submissions_total",
    "Total RSVP submissions",
    ["response", "has_plus_ones"],
)

RSVP_UPDATES = Counter(
    "invitations_rsvp_updates_total",
    "Total RSVP updates (changed responses)",
)

# Guest metrics
GUEST_IMPORTS = Counter(
    "invitations_guest_imports_total",
    "Total guests imported",
    ["source"],
)

GUEST_IMPORT_ERRORS = Counter(
    "invitations_guest_import_errors_total",
    "Guest import errors",
    ["error_type"],
)

# Invitation metrics
ACTIVE_INVITATIONS = Gauge(
    "invitations_active_count",
    "Number of active invitations",
    ["workspace_id"],
)

INVITATION_VIEWS = Counter(
    "invitations_views_total",
    "Total invitation page views",
    ["device_type", "browser"],
)

# Error metrics
ERRORS = Counter(
    "invitations_errors_total",
    "Total errors by type",
    ["error_type", "endpoint"],
)

# Database metrics
DB_QUERY_LATENCY = Histogram(
    "invitations_db_query_duration_seconds",
    "Database query latency in seconds",
    ["operation"],
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0],
)

DB_CONNECTIONS = Gauge(
    "invitations_db_connections_active",
    "Active database connections",
)

# Cache metrics
CACHE_HITS = Counter(
    "invitations_cache_hits_total",
    "Cache hit count",
    ["cache_type"],
)

CACHE_MISSES = Counter(
    "invitations_cache_misses_total",
    "Cache miss count",
    ["cache_type"],
)


# =============================================================================
# Metrics Collector
# =============================================================================


class MetricsCollector:
    """
    Centralized metrics collection with helper methods.

    Usage:
        metrics = MetricsCollector()

        # Track request
        with metrics.track_request("GET", "/api/invitations"):
            await handle_request()

        # Track email
        metrics.email_sent("success", "invitation")
    """

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

    def email_sent(
        self,
        status: str,
        template: str = "default",
    ) -> None:
        """Record an email send attempt."""
        EMAIL_SENT.labels(status=status, template=template).inc()

    @contextmanager
    def track_email_duration(self):
        """Context manager to track email send latency."""
        start_time = time.monotonic()
        try:
            yield
        finally:
            duration = time.monotonic() - start_time
            EMAIL_LATENCY.observe(duration)

    def rsvp_submitted(
        self,
        response: str,
        has_plus_ones: bool = False,
    ) -> None:
        """Record an RSVP submission."""
        RSVP_SUBMISSIONS.labels(
            response=response,
            has_plus_ones=str(has_plus_ones).lower(),
        ).inc()

    def rsvp_updated(self) -> None:
        """Record an RSVP update."""
        RSVP_UPDATES.inc()

    def guests_imported(
        self,
        count: int,
        source: str = "csv",
    ) -> None:
        """Record guests imported."""
        GUEST_IMPORTS.labels(source=source).inc(count)

    def import_error(self, error_type: str) -> None:
        """Record a guest import error."""
        GUEST_IMPORT_ERRORS.labels(error_type=error_type).inc()

    def invitation_viewed(
        self,
        device_type: str = "unknown",
        browser: str = "unknown",
    ) -> None:
        """Record an invitation view."""
        INVITATION_VIEWS.labels(
            device_type=device_type,
            browser=browser,
        ).inc()

    def error_occurred(
        self,
        error_type: str,
        endpoint: str = "unknown",
    ) -> None:
        """Record an error occurrence."""
        ERRORS.labels(error_type=error_type, endpoint=endpoint).inc()

    @contextmanager
    def track_db_query(self, operation: str):
        """Context manager to track database query latency."""
        start_time = time.monotonic()
        try:
            yield
        finally:
            duration = time.monotonic() - start_time
            DB_QUERY_LATENCY.labels(operation=operation).observe(duration)

    def set_db_connections(self, count: int) -> None:
        """Set the active database connection count."""
        DB_CONNECTIONS.set(count)

    def cache_hit(self, cache_type: str = "redis") -> None:
        """Record a cache hit."""
        CACHE_HITS.labels(cache_type=cache_type).inc()

    def cache_miss(self, cache_type: str = "redis") -> None:
        """Record a cache miss."""
        CACHE_MISSES.labels(cache_type=cache_type).inc()

    def set_active_invitations(
        self,
        workspace_id: str,
        count: int,
    ) -> None:
        """Set the active invitation count for a workspace."""
        ACTIVE_INVITATIONS.labels(workspace_id=workspace_id).set(count)


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


def track_email_sent(status: str, template: str = "default") -> None:
    """Track an email send (convenience function)."""
    get_metrics().email_sent(status, template)


def track_rsvp_submission(response: str, has_plus_ones: bool = False) -> None:
    """Track an RSVP submission (convenience function)."""
    get_metrics().rsvp_submitted(response, has_plus_ones)


def get_prometheus_metrics() -> bytes:
    """
    Get Prometheus metrics in text format.

    Returns:
        Prometheus metrics as bytes
    """
    return generate_latest()


def get_prometheus_content_type() -> str:
    """
    Get the content type for Prometheus metrics.

    Returns:
        Content-Type header value
    """
    return CONTENT_TYPE_LATEST


def generate_latest_metrics() -> str:
    """
    Generate Prometheus metrics in text format.

    Returns:
        Prometheus metrics as string for HTTP response
    """
    return generate_latest().decode("utf-8")
