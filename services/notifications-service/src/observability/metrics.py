"""
Prometheus Metrics for the Notifications & Communication Microservice.

Exposes key metrics for KEDA autoscaling and monitoring:
- Request latency and throughput (KEDA trigger)
- Email/SMS delivery success/failure rates
- Notification queue depths (KEDA trigger)
- Template rendering performance
- User preference lookups
- Cache hit/miss rates
- Dead letter queue monitoring
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

import logging

logger = logging.getLogger(__name__)


# =============================================================================
# Metric Definitions - KEDA Scaling Triggers
# =============================================================================

# Request metrics (primary KEDA trigger)
REQUEST_COUNT = Counter(
    "notifications_http_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status_code"],
)

REQUEST_LATENCY = Histogram(
    "notifications_http_request_duration_seconds",
    "HTTP request latency in seconds",
    ["method", "endpoint"],
    buckets=[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
)

# Requests per second gauge (for KEDA Prometheus trigger)
REQUESTS_PER_SECOND = Gauge(
    "notifications_requests_per_second",
    "Current requests per second rate",
)


# =============================================================================
# Notification Event Metrics
# =============================================================================

NOTIFICATION_REQUESTS = Counter(
    "notifications_requests_total",
    "Total notification requests received",
    ["channel", "category", "priority"],
)

NOTIFICATION_SENT = Counter(
    "notifications_sent_total",
    "Total notifications sent through each channel",
    ["channel", "category", "status"],
)

NOTIFICATION_CANCELLED = Counter(
    "notifications_cancelled_total",
    "Total notifications cancelled",
    ["channel", "category"],
)


# =============================================================================
# Email Delivery Metrics
# =============================================================================

EMAIL_SENT = Counter(
    "notifications_emails_sent_total",
    "Total emails sent",
    ["status", "template", "channel"],  # status: success, failed, bounced
)

EMAIL_LATENCY = Histogram(
    "notifications_email_send_duration_seconds",
    "Email send latency in seconds",
    ["provider"],  # sendgrid, ses, etc.
    buckets=[0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0],
)

EMAIL_RETRY_COUNT = Counter(
    "notifications_email_retries_total",
    "Total email retry attempts",
    ["template", "attempt"],  # attempt: 1, 2, 3
)

EMAIL_BOUNCE_RATE = Gauge(
    "notifications_email_bounce_rate",
    "Current email bounce rate (0-1)",
)


# =============================================================================
# SMS Delivery Metrics (placeholder for Phase 2)
# =============================================================================

SMS_SENT = Counter(
    "notifications_sms_sent_total",
    "Total SMS messages sent",
    ["status", "provider"],  # status: success, failed; provider: twilio, etc.
)

SMS_LATENCY = Histogram(
    "notifications_sms_send_duration_seconds",
    "SMS send latency in seconds",
    buckets=[0.5, 1.0, 2.0, 5.0, 10.0, 30.0],
)


# =============================================================================
# Notification Queue Metrics (KEDA Scaling Trigger)
# =============================================================================

QUEUE_DEPTH = Gauge(
    "notifications_queue_depth",
    "Current number of notifications in queue",
    ["queue_type"],  # pending, processing, dead_letter
)

QUEUE_PROCESSING_TIME = Histogram(
    "notifications_queue_processing_duration_seconds",
    "Time to process notification from queue",
    buckets=[0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0],
)

DEAD_LETTER_COUNT = Counter(
    "notifications_dead_letter_total",
    "Total notifications moved to dead letter queue",
    ["reason"],  # max_retries, invalid_recipient, template_error
)


# =============================================================================
# Template Metrics
# =============================================================================

TEMPLATE_RENDERS = Counter(
    "notifications_template_renders_total",
    "Total template render operations",
    ["template_type", "status"],  # template_type: gallery, billing, system; status: success, error
)

TEMPLATE_RENDER_LATENCY = Histogram(
    "notifications_template_render_duration_seconds",
    "Template rendering latency in seconds",
    ["template_type"],
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25],
)

TEMPLATE_CACHE_SIZE = Gauge(
    "notifications_template_cache_size",
    "Number of templates in cache",
)


# =============================================================================
# User Preference Metrics
# =============================================================================

PREFERENCE_LOOKUPS = Counter(
    "notifications_preference_lookups_total",
    "Total user preference lookups",
    ["source"],  # cache, database
)

PREFERENCE_UPDATES = Counter(
    "notifications_preference_updates_total",
    "Total user preference updates",
)

NOTIFICATION_SKIPPED = Counter(
    "notifications_skipped_total",
    "Total notifications skipped due to user preferences",
    ["reason"],  # opt_out, frequency_limit, do_not_disturb
)


# =============================================================================
# Webhook Metrics (SendGrid callbacks)
# =============================================================================

WEBHOOK_EVENTS = Counter(
    "notifications_webhook_events_total",
    "Total webhook events received",
    ["provider", "event_type"],  # provider: sendgrid; event_type: delivered, bounced, opened, etc.
)

WEBHOOK_PROCESSING_LATENCY = Histogram(
    "notifications_webhook_processing_duration_seconds",
    "Webhook processing latency in seconds",
    buckets=[0.01, 0.025, 0.05, 0.1, 0.25, 0.5],
)


# =============================================================================
# Digest Aggregation Metrics
# =============================================================================

DIGEST_AGGREGATED = Counter(
    "notifications_digest_aggregated_total",
    "Total notifications aggregated into digests",
)

DIGEST_SENT = Counter(
    "notifications_digest_sent_total",
    "Total digest emails sent",
    ["frequency"],  # daily, weekly
)


# =============================================================================
# Cache Metrics
# =============================================================================

CACHE_HITS = Counter(
    "notifications_cache_hits_total",
    "Cache hit count",
    ["cache_type"],  # preferences, templates, delivery_status
)

CACHE_MISSES = Counter(
    "notifications_cache_misses_total",
    "Cache miss count",
    ["cache_type"],
)

CACHE_HIT_RATIO = Gauge(
    "notifications_cache_hit_ratio",
    "Cache hit ratio (0-1)",
    ["cache_type"],
)


# =============================================================================
# Database Metrics
# =============================================================================

DB_QUERY_LATENCY = Histogram(
    "notifications_db_query_duration_seconds",
    "Database query latency in seconds",
    ["operation", "read_replica"],
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0],
)

DB_CONNECTIONS_ACTIVE = Gauge(
    "notifications_db_connections_active",
    "Active database connections",
    ["pool"],  # primary, read_replica
)

DB_CONNECTIONS_IDLE = Gauge(
    "notifications_db_connections_idle",
    "Idle database connections",
    ["pool"],
)


# =============================================================================
# Error Metrics
# =============================================================================

ERRORS = Counter(
    "notifications_errors_total",
    "Total errors by type",
    ["error_type", "endpoint"],
)


# =============================================================================
# Circuit Breaker Metrics
# =============================================================================

CIRCUIT_BREAKER_STATE = Gauge(
    "notifications_circuit_breaker_state",
    "Circuit breaker state (0=closed, 1=half_open, 2=open)",
    ["service"],  # redis, database, sendgrid, twilio
)


# =============================================================================
# Rate Limiting Metrics
# =============================================================================

RATE_LIMIT_HITS = Counter(
    "notifications_rate_limit_hits_total",
    "Total rate limit hits",
    ["endpoint", "limit_type"],  # limit_type: per_user, per_workspace, global
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
        with metrics.track_request_duration("GET", "/api/v1/notifications"):
            await handle_request()

        # Track email delivery
        metrics.email_sent("success", "gallery_published")
    """

    def __init__(self):
        self._cache_hits = {"preferences": 0, "templates": 0, "delivery_status": 0}
        self._cache_total = {"preferences": 0, "templates": 0, "delivery_status": 0}

    # =========================================================================
    # Notification Event Tracking
    # =========================================================================

    def notification_request(
        self,
        channel: str,
        category: str,
        priority: str = "normal",
    ) -> None:
        """Record a notification request received."""
        NOTIFICATION_REQUESTS.labels(
            channel=channel,
            category=category,
            priority=priority,
        ).inc()

    def notification_sent(
        self,
        channel: str,
        category: str,
        status: str = "success",
    ) -> None:
        """Record a notification sent through a channel."""
        NOTIFICATION_SENT.labels(
            channel=channel,
            category=category,
            status=status,
        ).inc()

    def notification_cancelled(
        self,
        channel: str,
        category: str,
    ) -> None:
        """Record a notification cancelled."""
        NOTIFICATION_CANCELLED.labels(
            channel=channel,
            category=category,
        ).inc()

    # =========================================================================
    # Request Tracking
    # =========================================================================

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

    def set_requests_per_second(self, rps: float) -> None:
        """Set current requests per second rate for KEDA scaling."""
        REQUESTS_PER_SECOND.set(rps)

    # =========================================================================
    # Email Delivery Tracking
    # =========================================================================

    def email_sent(
        self,
        status: str,
        template: str = "default",
        channel: str = "email",
    ) -> None:
        """Record an email send attempt."""
        EMAIL_SENT.labels(status=status, template=template, channel=channel).inc()

    @contextmanager
    def track_email_duration(self, provider: str = "sendgrid"):
        """Context manager to track email send latency."""
        start_time = time.monotonic()
        try:
            yield
        finally:
            duration = time.monotonic() - start_time
            EMAIL_LATENCY.labels(provider=provider).observe(duration)

    def email_retry(self, template: str, attempt: int) -> None:
        """Record an email retry attempt."""
        EMAIL_RETRY_COUNT.labels(template=template, attempt=str(attempt)).inc()

    def set_email_bounce_rate(self, rate: float) -> None:
        """Set the current email bounce rate."""
        EMAIL_BOUNCE_RATE.set(rate)

    # =========================================================================
    # SMS Delivery Tracking
    # =========================================================================

    def sms_sent(self, status: str, provider: str = "twilio") -> None:
        """Record an SMS send attempt."""
        SMS_SENT.labels(status=status, provider=provider).inc()

    def sms_attempted(
        self,
        status: str,
        template: str = "default",
        provider: str = "twilio",
    ) -> None:
        """Record an SMS send attempt (includes disabled/placeholder attempts).

        Args:
            status: Attempt status (success, failed, disabled)
            template: Template code used
            provider: SMS provider (twilio, etc.)
        """
        SMS_SENT.labels(status=status, provider=provider).inc()

    @contextmanager
    def track_sms_duration(self):
        """Context manager to track SMS send latency."""
        start_time = time.monotonic()
        try:
            yield
        finally:
            duration = time.monotonic() - start_time
            SMS_LATENCY.observe(duration)

    # =========================================================================
    # Queue Tracking (KEDA Scaling)
    # =========================================================================

    def set_queue_depth(self, queue_type: str, depth: int) -> None:
        """Set the current queue depth."""
        QUEUE_DEPTH.labels(queue_type=queue_type).set(depth)

    @contextmanager
    def track_queue_processing(self):
        """Context manager to track notification processing time."""
        start_time = time.monotonic()
        try:
            yield
        finally:
            duration = time.monotonic() - start_time
            QUEUE_PROCESSING_TIME.observe(duration)

    def dead_letter(self, reason: str) -> None:
        """Record a notification moved to dead letter queue."""
        DEAD_LETTER_COUNT.labels(reason=reason).inc()

    # =========================================================================
    # Template Tracking
    # =========================================================================

    def template_rendered(
        self,
        template_type: str,
        status: str = "success",
    ) -> None:
        """Record a template render operation."""
        TEMPLATE_RENDERS.labels(template_type=template_type, status=status).inc()

    @contextmanager
    def track_template_render(self, template_type: str):
        """Context manager to track template rendering latency."""
        start_time = time.monotonic()
        try:
            yield
        finally:
            duration = time.monotonic() - start_time
            TEMPLATE_RENDER_LATENCY.labels(template_type=template_type).observe(duration)

    def set_template_cache_size(self, size: int) -> None:
        """Set the template cache size."""
        TEMPLATE_CACHE_SIZE.set(size)

    # =========================================================================
    # Preference Tracking
    # =========================================================================

    def preference_lookup(self, source: str = "database") -> None:
        """Record a user preference lookup."""
        PREFERENCE_LOOKUPS.labels(source=source).inc()

    def preference_updated(self, source: str = "user") -> None:
        """Record a user preference update.

        Args:
            source: Source of the update (user, admin, api, unsubscribe_link, etc.)
        """
        PREFERENCE_UPDATES.inc()

    def unsubscribe_processed(self, category: str = "global") -> None:
        """Record a processed unsubscribe request.

        Args:
            category: Category that was unsubscribed (or 'global')
        """
        NOTIFICATION_SKIPPED.labels(reason=f"unsubscribe_{category}").inc()

    def notification_skipped(self, reason: str) -> None:
        """Record a notification skipped due to user preferences."""
        NOTIFICATION_SKIPPED.labels(reason=reason).inc()

    # =========================================================================
    # Webhook Tracking
    # =========================================================================

    def webhook_received(
        self,
        provider: str,
        event_type: str,
    ) -> None:
        """Record a webhook event."""
        WEBHOOK_EVENTS.labels(provider=provider, event_type=event_type).inc()

    @contextmanager
    def track_webhook_processing(self):
        """Context manager to track webhook processing latency."""
        start_time = time.monotonic()
        try:
            yield
        finally:
            duration = time.monotonic() - start_time
            WEBHOOK_PROCESSING_LATENCY.observe(duration)

    # =========================================================================
    # Digest Tracking
    # =========================================================================

    def notifications_aggregated(self, count: int = 1) -> None:
        """Record notifications aggregated into digest."""
        DIGEST_AGGREGATED.inc(count)

    def digest_sent(self, frequency: str = "daily", notification_count: int = 1) -> None:
        """Record a digest email sent.

        Args:
            frequency: Digest frequency (daily, weekly)
            notification_count: Number of notifications included in the digest
        """
        DIGEST_SENT.labels(frequency=frequency).inc()
        DIGEST_AGGREGATED.inc(notification_count)

    def digest_scheduled(self, frequency: str, count: int = 1) -> None:
        """Record digest tasks scheduled for processing.

        Args:
            frequency: Digest frequency (daily, weekly)
            count: Number of digest tasks scheduled
        """
        # Use the same counter but track scheduled differently
        # This helps monitor the scheduling pipeline
        DIGEST_AGGREGATED.inc(count)

    # =========================================================================
    # Cache Tracking
    # =========================================================================

    def cache_hit(self, cache_type: str = "preferences") -> None:
        """Record a cache hit."""
        CACHE_HITS.labels(cache_type=cache_type).inc()
        self._cache_hits[cache_type] = self._cache_hits.get(cache_type, 0) + 1
        self._cache_total[cache_type] = self._cache_total.get(cache_type, 0) + 1
        self._update_cache_ratio(cache_type)

    def cache_miss(self, cache_type: str = "preferences") -> None:
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

    # =========================================================================
    # Database Tracking
    # =========================================================================

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

    # =========================================================================
    # Error Tracking
    # =========================================================================

    def error_occurred(
        self,
        error_type: str,
        endpoint: str = "unknown",
    ) -> None:
        """Record an error occurrence."""
        ERRORS.labels(error_type=error_type, endpoint=endpoint).inc()

    # =========================================================================
    # Circuit Breaker Tracking
    # =========================================================================

    def set_circuit_breaker_state(self, service: str, state: int) -> None:
        """Set circuit breaker state (0=closed, 1=half_open, 2=open)."""
        CIRCUIT_BREAKER_STATE.labels(service=service).set(state)

    # =========================================================================
    # Rate Limiting Tracking
    # =========================================================================

    def rate_limit_hit(self, endpoint: str, limit_type: str = "per_user") -> None:
        """Record a rate limit hit."""
        RATE_LIMIT_HITS.labels(endpoint=endpoint, limit_type=limit_type).inc()


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


def track_email_sent(
    status: str,
    template: str = "default",
    channel: str = "email",
) -> None:
    """Track an email send (convenience function)."""
    get_metrics().email_sent(status, template, channel)


def track_sms_sent(status: str, provider: str = "twilio") -> None:
    """Track an SMS send (convenience function)."""
    get_metrics().sms_sent(status, provider)


def track_dead_letter(reason: str) -> None:
    """Track a notification moved to dead letter queue (convenience function)."""
    get_metrics().dead_letter(reason)


def track_template_render(template_type: str, status: str = "success") -> None:
    """Track a template render (convenience function)."""
    get_metrics().template_rendered(template_type, status)


def track_notification_skipped(reason: str) -> None:
    """Track a skipped notification (convenience function)."""
    get_metrics().notification_skipped(reason)


def track_webhook_event(provider: str, event_type: str) -> None:
    """Track a webhook event (convenience function)."""
    get_metrics().webhook_received(provider, event_type)


def set_queue_depths(pending: int, processing: int, dead_letter: int) -> None:
    """Set all queue depths for KEDA scaling (convenience function)."""
    metrics = get_metrics()
    metrics.set_queue_depth("pending", pending)
    metrics.set_queue_depth("processing", processing)
    metrics.set_queue_depth("dead_letter", dead_letter)


def get_prometheus_metrics() -> bytes:
    """Get Prometheus metrics in text format."""
    return generate_latest()


def get_prometheus_content_type() -> str:
    """Get the content type for Prometheus metrics."""
    return CONTENT_TYPE_LATEST


def generate_latest_metrics() -> str:
    """Generate Prometheus metrics in text format for HTTP response."""
    return generate_latest().decode("utf-8")
