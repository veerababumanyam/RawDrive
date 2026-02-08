"""Prometheus metrics for the Growth & Referrals service.

Exposes metrics for:
- HTTP request latency and throughput
- Referral program activity (codes created, conversions)
- Credit ledger operations
- Partner program activity
- Setup goals completions
- Cache hit/miss ratios
- Database query performance

These metrics enable KEDA autoscaling and Grafana dashboards.
Full implementation in T040.
"""

from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST

# =============================================================================
# HTTP Request Metrics
# =============================================================================

REQUEST_COUNT = Counter(
    "growth_http_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status_code"],
)

REQUEST_LATENCY = Histogram(
    "growth_http_request_duration_seconds",
    "HTTP request latency",
    ["method", "endpoint"],
    buckets=[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
)

# =============================================================================
# Referral Program Metrics
# =============================================================================

REFERRAL_CODES_CREATED = Counter(
    "growth_referral_codes_created_total",
    "Total referral codes generated",
    ["workspace_id"],
)

REFERRAL_CODES_VALIDATED = Counter(
    "growth_referral_codes_validated_total",
    "Total referral code validations",
    ["status"],  # valid, invalid, expired
)

REFERRAL_CONVERSIONS = Counter(
    "growth_referral_conversions_total",
    "Total referral conversions",
    ["plan_id"],
)

REFERRAL_REWARDS_DISTRIBUTED = Counter(
    "growth_referral_rewards_distributed_total",
    "Total referral rewards distributed",
    ["reward_type", "currency"],  # reward_type: referrer_credit, referee_discount
)

# =============================================================================
# Credit Ledger Metrics
# =============================================================================

CREDITS_AWARDED = Counter(
    "growth_credits_awarded_total",
    "Total credits awarded",
    ["credit_type", "source"],  # credit_type: ai_credits, bill_credits; source: referral, goal, promo
)

CREDITS_DEDUCTED = Counter(
    "growth_credits_deducted_total",
    "Total credits deducted/used",
    ["credit_type", "reason"],
)

CREDIT_BALANCE_CURRENT = Gauge(
    "growth_credit_balance_total",
    "Current total credit balance across all users (for monitoring)",
    ["credit_type"],
)

# =============================================================================
# Partner Program Metrics
# =============================================================================

PARTNER_APPLICATIONS = Counter(
    "growth_partner_applications_total",
    "Total partner applications submitted",
    ["status"],  # pending, approved, rejected
)

PARTNER_CLICKS = Counter(
    "growth_partner_clicks_total",
    "Total clicks on partner referral links",
)

PARTNER_CONVERSIONS = Counter(
    "growth_partner_conversions_total",
    "Total partner-driven conversions",
)

PARTNER_PAYOUTS_PROCESSED = Counter(
    "growth_partner_payouts_total",
    "Total partner payouts processed",
    ["payout_method", "status"],  # method: stripe, paypal, upi; status: success, failed
)

PARTNER_PAYOUT_AMOUNT = Counter(
    "growth_partner_payout_amount_total",
    "Total payout amounts distributed",
    ["currency"],
)

PARTNER_PENDING_BALANCE = Gauge(
    "growth_partner_pending_balance_total",
    "Total pending partner balance awaiting payout",
    ["currency"],
)

# =============================================================================
# Setup Goals Metrics
# =============================================================================

GOALS_COMPLETED = Counter(
    "growth_goals_completed_total",
    "Total setup goals completed",
    ["goal_id"],
)

GOALS_CREDITS_AWARDED = Counter(
    "growth_goals_credits_awarded_total",
    "Total AI credits awarded from goal completions",
)

ACTIVE_GOAL_USERS = Gauge(
    "growth_active_goal_users",
    "Number of users with incomplete goals",
)

# =============================================================================
# Cache Metrics
# =============================================================================

CACHE_HITS = Counter(
    "growth_cache_hits_total",
    "Total cache hits",
    ["cache_type"],  # referral_code, credit_balance, partner_dashboard, goals_progress
)

CACHE_MISSES = Counter(
    "growth_cache_misses_total",
    "Total cache misses",
    ["cache_type"],
)

# =============================================================================
# Database Metrics
# =============================================================================

DB_QUERIES_TOTAL = Counter(
    "growth_db_queries_total",
    "Total database queries",
    ["operation", "table"],
)

DB_QUERY_DURATION = Histogram(
    "growth_db_query_duration_seconds",
    "Database query latency",
    ["operation"],
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0],
)

# =============================================================================
# Error Metrics
# =============================================================================

ERRORS_TOTAL = Counter(
    "growth_errors_total",
    "Total errors by type",
    ["error_type", "endpoint"],
)

SERVICE_CALL_ERRORS = Counter(
    "growth_service_call_errors_total",
    "Errors calling external services",
    ["service", "error_type"],  # service: billing, notifications
)


# =============================================================================
# Helper Functions
# =============================================================================

def generate_latest_metrics() -> bytes:
    """Generate Prometheus metrics in text format."""
    return generate_latest()


def get_prometheus_content_type() -> str:
    """Get the Prometheus content type for HTTP responses."""
    return CONTENT_TYPE_LATEST


def record_request(method: str, endpoint: str, status_code: int, duration: float) -> None:
    """Record HTTP request metrics."""
    REQUEST_COUNT.labels(method=method, endpoint=endpoint, status_code=str(status_code)).inc()
    REQUEST_LATENCY.labels(method=method, endpoint=endpoint).observe(duration)


def record_referral_code_created(workspace_id: str) -> None:
    """Record referral code creation."""
    REFERRAL_CODES_CREATED.labels(workspace_id=workspace_id).inc()


def record_referral_validation(status: str) -> None:
    """Record referral code validation (valid, invalid, expired)."""
    REFERRAL_CODES_VALIDATED.labels(status=status).inc()


def record_referral_conversion(plan_id: str) -> None:
    """Record successful referral conversion."""
    REFERRAL_CONVERSIONS.labels(plan_id=plan_id).inc()


def record_credits_awarded(credit_type: str, source: str, amount: int = 1) -> None:
    """Record credits awarded."""
    CREDITS_AWARDED.labels(credit_type=credit_type, source=source).inc(amount)


def record_goal_completed(goal_id: str, credits: int) -> None:
    """Record goal completion and credits awarded."""
    GOALS_COMPLETED.labels(goal_id=goal_id).inc()
    GOALS_CREDITS_AWARDED.inc(credits)


def record_partner_application(status: str) -> None:
    """Record partner application."""
    PARTNER_APPLICATIONS.labels(status=status).inc()


def record_partner_payout(method: str, status: str, amount: float, currency: str) -> None:
    """Record partner payout."""
    PARTNER_PAYOUTS_PROCESSED.labels(payout_method=method, status=status).inc()
    if status == "success":
        PARTNER_PAYOUT_AMOUNT.labels(currency=currency).inc(amount)


def record_cache_access(cache_type: str, hit: bool) -> None:
    """Record cache hit or miss."""
    if hit:
        CACHE_HITS.labels(cache_type=cache_type).inc()
    else:
        CACHE_MISSES.labels(cache_type=cache_type).inc()


def record_error(error_type: str, endpoint: str) -> None:
    """Record error occurrence."""
    ERRORS_TOTAL.labels(error_type=error_type, endpoint=endpoint).inc()


def record_service_call_error(service: str, error_type: str) -> None:
    """Record external service call error."""
    SERVICE_CALL_ERRORS.labels(service=service, error_type=error_type).inc()


# =============================================================================
# Convenience Aliases (used by services)
# =============================================================================

def increment_referral_codes_created(workspace_id: str) -> None:
    """Alias for record_referral_code_created."""
    record_referral_code_created(workspace_id)


def increment_conversions(plan_id: str = "default") -> None:
    """Increment conversion counter."""
    REFERRAL_CONVERSIONS.labels(plan_id=plan_id).inc()


def increment_credits_awarded(credit_type: str = "ai_credits", source: str = "referral", amount: int = 1) -> None:
    """Increment credits awarded counter."""
    CREDITS_AWARDED.labels(credit_type=credit_type, source=source).inc(amount)
