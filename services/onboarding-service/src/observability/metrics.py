"""Prometheus metrics for the onboarding service."""

from prometheus_client import Counter, Histogram, Gauge, generate_latest
from typing import Optional

# Request metrics
REQUEST_COUNT = Counter(
    "onboarding_http_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status_code"],
)

REQUEST_LATENCY = Histogram(
    "onboarding_http_request_duration_seconds",
    "HTTP request latency",
    ["method", "endpoint"],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
)

# Business metrics
SESSIONS_STARTED = Counter(
    "onboarding_sessions_started_total",
    "Total onboarding sessions started",
    ["utm_source"],
)

SESSIONS_COMPLETED = Counter(
    "onboarding_sessions_completed_total",
    "Total sessions completed successfully",
)

SESSIONS_ABANDONED = Counter(
    "onboarding_sessions_abandoned_total",
    "Total sessions abandoned",
    ["step"],
)

ACTIVE_SESSIONS = Gauge(
    "onboarding_active_sessions",
    "Current active onboarding sessions",
)

PAYMENT_INTENTS_CREATED = Counter(
    "onboarding_payment_intents_created_total",
    "Total Stripe payment intents created",
    ["plan_id"],
)

PAYMENT_INTENTS_SUCCEEDED = Counter(
    "onboarding_payment_intents_succeeded_total",
    "Total successful payments",
    ["plan_id"],
)

PAYMENT_INTENTS_FAILED = Counter(
    "onboarding_payment_intents_failed_total",
    "Total failed payments",
    ["error_code"],
)

EMAIL_VERIFICATIONS_SENT = Counter(
    "onboarding_email_verifications_sent_total",
    "Total verification emails sent",
)

EMAIL_VERIFICATIONS_SUCCEEDED = Counter(
    "onboarding_email_verifications_succeeded_total",
    "Total successful email verifications",
)

# Error metrics
ERRORS_TOTAL = Counter(
    "onboarding_errors_total",
    "Total errors by type",
    ["error_type", "endpoint"],
)

STRIPE_ERRORS = Counter(
    "onboarding_stripe_errors_total",
    "Total Stripe API errors",
    ["error_type"],
)

# Database metrics
DB_QUERIES_TOTAL = Counter(
    "onboarding_db_queries_total",
    "Total database queries",
    ["operation"],
)

DB_QUERY_DURATION = Histogram(
    "onboarding_db_query_duration_seconds",
    "Database query latency",
    ["operation"],
    buckets=[0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0],
)

# Cache metrics
CACHE_HITS = Counter(
    "onboarding_cache_hits_total",
    "Total cache hits",
    ["cache_type"],
)

CACHE_MISSES = Counter(
    "onboarding_cache_misses_total",
    "Total cache misses",
    ["cache_type"],
)


def generate_latest_metrics() -> bytes:
    """Generate Prometheus metrics in text format."""
    return generate_latest()


def record_request(method: str, endpoint: str, status_code: int, duration: float):
    """Record HTTP request metrics."""
    REQUEST_COUNT.labels(method=method, endpoint=endpoint, status_code=status_code).inc()
    REQUEST_LATENCY.labels(method=method, endpoint=endpoint).observe(duration)


def record_session_started(utm_source: Optional[str] = None):
    """Record session start."""
    SESSIONS_STARTED.labels(utm_source=utm_source or "direct").inc()


def record_session_completed():
    """Record session completion."""
    SESSIONS_COMPLETED.inc()


def record_session_abandoned(step: str):
    """Record session abandonment."""
    SESSIONS_ABANDONED.labels(step=step).inc()


def record_payment_intent_created(plan_id: str):
    """Record payment intent creation."""
    PAYMENT_INTENTS_CREATED.labels(plan_id=plan_id).inc()


def record_payment_succeeded(plan_id: str):
    """Record successful payment."""
    PAYMENT_INTENTS_SUCCEEDED.labels(plan_id=plan_id).inc()


def record_payment_failed(error_code: str):
    """Record failed payment."""
    PAYMENT_INTENTS_FAILED.labels(error_code=error_code).inc()


def record_error(error_type: str, endpoint: str):
    """Record error."""
    ERRORS_TOTAL.labels(error_type=error_type, endpoint=endpoint).inc()


def record_stripe_error(error_type: str):
    """Record Stripe error."""
    STRIPE_ERRORS.labels(error_type=error_type).inc()
