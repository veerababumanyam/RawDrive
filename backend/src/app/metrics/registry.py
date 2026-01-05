"""Prometheus metrics registry with core metric definitions.

This module defines all Prometheus metrics used throughout the application.
Metrics are organized into categories:
- HTTP Metrics: Request counts, latency, in-progress requests
- Error Metrics: Error counts by type and endpoint
- Rate Limit Metrics: Rate limit violations
- Business Metrics: Application-specific counters and gauges
- Health Metrics: Dependency health status

Requirements: 15.1 (Core metrics), 15.2 (Error tracking), 15.3 (Business metrics)
"""

from __future__ import annotations

import logging
import re
from typing import Optional

from prometheus_client import Counter, Gauge, Histogram, generate_latest, REGISTRY

logger = logging.getLogger(__name__)


# =============================================================================
# HTTP Metrics
# =============================================================================

http_requests_total = Counter(
    "http_requests_total",
    "Total number of HTTP requests",
    ["method", "path", "status_code"],
)

http_request_duration_seconds = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency in seconds",
    ["method", "path", "status_code"],
    buckets=(
        0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5,
        0.75, 1.0, 2.5, 5.0, 7.5, 10.0, float("inf")
    ),
)

http_requests_in_progress = Gauge(
    "http_requests_in_progress",
    "Number of HTTP requests currently being processed",
    ["method", "path"],
)

http_request_size_bytes = Histogram(
    "http_request_size_bytes",
    "HTTP request size in bytes",
    ["method", "path"],
    buckets=(
        100, 1000, 10000, 100000, 1000000, 10000000, float("inf")
    ),
)

http_response_size_bytes = Histogram(
    "http_response_size_bytes",
    "HTTP response size in bytes",
    ["method", "path", "status_code"],
    buckets=(
        100, 1000, 10000, 100000, 1000000, 10000000, float("inf")
    ),
)


# =============================================================================
# Error Metrics
# =============================================================================

http_errors_total = Counter(
    "http_errors_total",
    "Total number of HTTP errors (4xx and 5xx responses)",
    ["method", "path", "status_code", "error_type"],
)


# =============================================================================
# Rate Limit Metrics
# =============================================================================

rate_limit_hits_total = Counter(
    "rate_limit_hits_total",
    "Total number of rate limit violations",
    ["limit_type", "client_type"],
)


# =============================================================================
# Business Metrics
# =============================================================================

active_users_gauge = Gauge(
    "active_users_total",
    "Current number of active users",
    ["workspace_id"],
)

uploads_total = Counter(
    "uploads_total",
    "Total number of file uploads",
    ["status", "file_type"],
)

ai_operations_total = Counter(
    "ai_operations_total",
    "Total number of AI operations",
    ["operation", "provider", "status"],
)

ai_operation_duration_seconds = Histogram(
    "ai_operation_duration_seconds",
    "Duration of AI operations in seconds",
    ["operation", "provider"],
    buckets=(
        0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0, float("inf")
    ),
)


# =============================================================================
# Health Metrics
# =============================================================================

dependency_health = Gauge(
    "dependency_health",
    "Health status of dependencies (1=healthy, 0=unhealthy)",
    ["dependency"],
)

app_info = Gauge(
    "app_info",
    "Application information",
    ["version", "environment"],
)


# =============================================================================
# Path Normalization
# =============================================================================

# Patterns to normalize for avoiding label cardinality explosion
PATH_PATTERNS = [
    # UUID patterns (e.g., /api/v1/workspaces/550e8400-e29b-41d4-a716-446655440000)
    (re.compile(r"/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.IGNORECASE), "/{id}"),
    # Numeric IDs (e.g., /api/v1/users/123)
    (re.compile(r"/\d+(?=/|$)"), "/{id}"),
    # Hex strings (common for file hashes, etc.)
    (re.compile(r"/[0-9a-f]{24,}(?=/|$)", re.IGNORECASE), "/{hash}"),
]


def normalize_path(path: str) -> str:
    """Normalize URL path to prevent label cardinality explosion.

    Replaces dynamic segments like UUIDs and numeric IDs with placeholders.

    Examples:
        /api/v1/workspaces/550e8400-e29b-41d4-a716-446655440000 -> /api/v1/workspaces/{id}
        /api/v1/users/123 -> /api/v1/users/{id}
        /api/v1/media/abc123def456 -> /api/v1/media/{hash}
    """
    if not path:
        return "/"

    normalized = path
    for pattern, replacement in PATH_PATTERNS:
        normalized = pattern.sub(replacement, normalized)

    # Remove trailing slashes for consistency
    if normalized != "/" and normalized.endswith("/"):
        normalized = normalized.rstrip("/")

    return normalized


# =============================================================================
# Metrics Output Generation
# =============================================================================

def get_metrics_output() -> bytes:
    """Generate Prometheus-compatible metrics output.

    Returns:
        Bytes containing the metrics in Prometheus text format.
    """
    return generate_latest(REGISTRY)
