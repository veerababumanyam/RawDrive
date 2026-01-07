"""
Observability Module for Notifications & Communication Microservice.

Provides health checks, metrics, and monitoring capabilities for:
- Kubernetes liveness and readiness probes
- Prometheus metrics for KEDA autoscaling
- Service dependency health monitoring
"""

from src.observability.health import (
    HealthChecker,
    HealthCheckResult,
    HealthStatus,
    OverallHealthStatus,
    get_health_checker,
    get_health_status,
    health_checker,
    is_service_live,
    is_service_ready,
    register_health_check,
    unregister_health_check,
    # Individual check functions
    check_database,
    check_read_replica,
    check_redis,
    check_sendgrid,
    check_notification_queue,
)

from src.observability.metrics import (
    # Main collector
    MetricsCollector,
    get_metrics,
    # Prometheus output
    get_prometheus_metrics,
    get_prometheus_content_type,
    generate_latest_metrics,
    # Convenience functions
    track_request,
    track_error,
    track_email_sent,
    track_sms_sent,
    track_dead_letter,
    track_template_render,
    track_notification_skipped,
    track_webhook_event,
    set_queue_depths,
)

__all__ = [
    # Health Check Classes
    "HealthChecker",
    "HealthCheckResult",
    "HealthStatus",
    "OverallHealthStatus",
    # Health Check Functions
    "get_health_checker",
    "get_health_status",
    "is_service_live",
    "is_service_ready",
    "register_health_check",
    "unregister_health_check",
    # Health Check Instance
    "health_checker",
    # Individual Health Checks
    "check_database",
    "check_read_replica",
    "check_redis",
    "check_sendgrid",
    "check_notification_queue",
    # Metrics
    "MetricsCollector",
    "get_metrics",
    "get_prometheus_metrics",
    "get_prometheus_content_type",
    "generate_latest_metrics",
    # Metrics Convenience Functions
    "track_request",
    "track_error",
    "track_email_sent",
    "track_sms_sent",
    "track_dead_letter",
    "track_template_render",
    "track_notification_skipped",
    "track_webhook_event",
    "set_queue_depths",
]
