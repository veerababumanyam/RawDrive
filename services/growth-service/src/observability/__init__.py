"""Observability module for health checks and metrics."""

from src.observability.health import health_checker, HealthChecker
from src.observability.metrics import (
    generate_latest_metrics,
    get_prometheus_content_type,
    record_request,
    record_referral_code_created,
    record_referral_validation,
    record_referral_conversion,
    record_credits_awarded,
    record_goal_completed,
    record_partner_application,
    record_partner_payout,
    record_cache_access,
    record_error,
    record_service_call_error,
)

__all__ = [
    "health_checker",
    "HealthChecker",
    "generate_latest_metrics",
    "get_prometheus_content_type",
    "record_request",
    "record_referral_code_created",
    "record_referral_validation",
    "record_referral_conversion",
    "record_credits_awarded",
    "record_goal_completed",
    "record_partner_application",
    "record_partner_payout",
    "record_cache_access",
    "record_error",
    "record_service_call_error",
]
