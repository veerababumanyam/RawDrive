"""
Prometheus metrics for the Webhooks Service.
"""

from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST

from src.config import settings

# Prefix for all metrics
PREFIX = settings.METRICS_CUSTOM_PREFIX

# Delivery metrics
WEBHOOK_DELIVERIES_TOTAL = Counter(
    f"{PREFIX}_deliveries_total",
    "Total webhook deliveries",
    ["workspace_id", "event_type", "status"],
)

WEBHOOK_DELIVERY_DURATION = Histogram(
    f"{PREFIX}_delivery_duration_seconds",
    "Time taken to deliver webhooks",
    ["endpoint_domain"],
    buckets=[0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0],
)

WEBHOOK_DELIVERY_RESPONSE_CODE = Counter(
    f"{PREFIX}_delivery_response_code_total",
    "Response codes from webhook endpoints",
    ["status_code", "endpoint_domain"],
)

# Queue metrics
WEBHOOK_PENDING_DELIVERIES = Gauge(
    f"{PREFIX}_pending_deliveries",
    "Number of pending webhook deliveries",
)

WEBHOOK_RETRYING_DELIVERIES = Gauge(
    f"{PREFIX}_retrying_deliveries",
    "Number of deliveries waiting for retry",
)

WEBHOOK_DLQ_SIZE = Gauge(
    f"{PREFIX}_dead_letter_queue_size",
    "Number of items in dead letter queue",
    ["workspace_id"],
)

# Circuit breaker metrics
WEBHOOK_CIRCUIT_STATE = Gauge(
    f"{PREFIX}_circuit_breaker_state",
    "Circuit breaker state (0=closed, 1=open, 2=half-open)",
    ["endpoint_domain"],
)

WEBHOOK_CIRCUIT_TRIPS = Counter(
    f"{PREFIX}_circuit_breaker_trips_total",
    "Number of times circuit breaker has tripped",
    ["endpoint_domain"],
)

# Event processing metrics
WEBHOOK_EVENTS_RECEIVED = Counter(
    f"{PREFIX}_events_received_total",
    "Total events received from Kafka",
    ["event_type"],
)

WEBHOOK_EVENTS_ROUTED = Counter(
    f"{PREFIX}_events_routed_total",
    "Events routed to subscribers",
    ["event_type"],
)

WEBHOOK_EVENTS_SKIPPED = Counter(
    f"{PREFIX}_events_skipped_total",
    "Events skipped (no matching subscribers)",
    ["event_type"],
)

# Subscription metrics
WEBHOOK_SUBSCRIPTIONS_ACTIVE = Gauge(
    f"{PREFIX}_subscriptions_active",
    "Number of active webhook subscriptions",
    ["workspace_id"],
)

WEBHOOK_SUBSCRIPTIONS_CREATED = Counter(
    f"{PREFIX}_subscriptions_created_total",
    "Total webhook subscriptions created",
)

WEBHOOK_SUBSCRIPTIONS_DELETED = Counter(
    f"{PREFIX}_subscriptions_deleted_total",
    "Total webhook subscriptions deleted",
)

# API metrics
WEBHOOK_API_REQUESTS = Counter(
    f"{PREFIX}_api_requests_total",
    "Total API requests",
    ["method", "endpoint", "status_code"],
)

WEBHOOK_API_LATENCY = Histogram(
    f"{PREFIX}_api_latency_seconds",
    "API request latency",
    ["method", "endpoint"],
    buckets=[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5],
)

# Retry metrics
WEBHOOK_RETRIES_TOTAL = Counter(
    f"{PREFIX}_retries_total",
    "Total retry attempts",
    ["attempt_number"],
)

WEBHOOK_EXHAUSTED_TOTAL = Counter(
    f"{PREFIX}_exhausted_total",
    "Total deliveries that exhausted all retries",
)


def generate_latest_metrics() -> bytes:
    """Generate Prometheus metrics output."""
    return generate_latest()


def record_delivery(
    workspace_id: str,
    event_type: str,
    status: str,
    duration_seconds: float,
    endpoint_domain: str,
    response_code: int = 0,
) -> None:
    """Record a webhook delivery attempt."""
    WEBHOOK_DELIVERIES_TOTAL.labels(
        workspace_id=workspace_id,
        event_type=event_type,
        status=status,
    ).inc()

    WEBHOOK_DELIVERY_DURATION.labels(
        endpoint_domain=endpoint_domain,
    ).observe(duration_seconds)

    if response_code > 0:
        WEBHOOK_DELIVERY_RESPONSE_CODE.labels(
            status_code=str(response_code),
            endpoint_domain=endpoint_domain,
        ).inc()


def record_event_received(event_type: str) -> None:
    """Record an event received from Kafka."""
    WEBHOOK_EVENTS_RECEIVED.labels(event_type=event_type).inc()


def record_event_routed(event_type: str) -> None:
    """Record an event routed to subscribers."""
    WEBHOOK_EVENTS_ROUTED.labels(event_type=event_type).inc()


def record_event_skipped(event_type: str) -> None:
    """Record an event with no subscribers."""
    WEBHOOK_EVENTS_SKIPPED.labels(event_type=event_type).inc()


def set_circuit_state(endpoint_domain: str, state: str) -> None:
    """Set circuit breaker state metric."""
    state_value = {"closed": 0, "open": 1, "half_open": 2}.get(state, 0)
    WEBHOOK_CIRCUIT_STATE.labels(endpoint_domain=endpoint_domain).set(state_value)


def record_circuit_trip(endpoint_domain: str) -> None:
    """Record circuit breaker trip."""
    WEBHOOK_CIRCUIT_TRIPS.labels(endpoint_domain=endpoint_domain).inc()
