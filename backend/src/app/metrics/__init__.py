"""Prometheus metrics module for RawDrive backend.

This module provides centralized metrics definitions and utilities for monitoring
the application. It implements core metrics for:
- HTTP request tracking (requests, errors, latency)
- Business metrics (custom counters and gauges)
- System health metrics

Requirements: 15.1, 15.2, 15.3
"""

from app.metrics.registry import (
    # HTTP Metrics
    http_requests_total,
    http_request_duration_seconds,
    http_requests_in_progress,
    http_request_size_bytes,
    http_response_size_bytes,
    # Error Metrics
    http_errors_total,
    # Rate Limit Metrics
    rate_limit_hits_total,
    # Business Metrics
    active_users_gauge,
    uploads_total,
    ai_operations_total,
    ai_operation_duration_seconds,
    # Health Metrics
    dependency_health,
    app_info,
    # Utilities
    get_metrics_output,
    normalize_path,
)
from app.metrics.middleware import PrometheusMiddleware

__all__ = [
    # Middleware
    "PrometheusMiddleware",
    # HTTP Metrics
    "http_requests_total",
    "http_request_duration_seconds",
    "http_requests_in_progress",
    "http_request_size_bytes",
    "http_response_size_bytes",
    # Error Metrics
    "http_errors_total",
    # Rate Limit Metrics
    "rate_limit_hits_total",
    # Business Metrics
    "active_users_gauge",
    "uploads_total",
    "ai_operations_total",
    "ai_operation_duration_seconds",
    # Health Metrics
    "dependency_health",
    "app_info",
    # Utilities
    "get_metrics_output",
    "normalize_path",
]
