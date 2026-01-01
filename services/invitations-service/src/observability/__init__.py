"""
Observability Module for the Invitations Microservice.

Provides Prometheus metrics, health checks, and monitoring utilities
for production observability and alerting.
"""

from src.observability.metrics import (
    MetricsCollector,
    get_metrics,
    track_request,
    track_error,
    track_email_sent,
    track_rsvp_submission,
)
from src.observability.health import (
    HealthChecker,
    get_health_status,
    register_health_check,
)

__all__ = [
    "MetricsCollector",
    "get_metrics",
    "track_request",
    "track_error",
    "track_email_sent",
    "track_rsvp_submission",
    "HealthChecker",
    "get_health_status",
    "register_health_check",
]
