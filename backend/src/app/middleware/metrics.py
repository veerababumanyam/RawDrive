"""
Prometheus metrics middleware for RawDrive.

Provides observability metrics for:
- HTTP request latency and throughput
- Database connection pool status
- Redis connection pool status
- Scaling and capacity metrics

See: specs/024-5k-concurrent-autoscale/contracts/metrics.yaml
"""

from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager
from typing import Callable, Optional

from fastapi import FastAPI, Request, Response
from prometheus_client import (
    CONTENT_TYPE_LATEST,
    REGISTRY,
    Counter,
    Gauge,
    Histogram,
    generate_latest,
)
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.routing import Match

logger = logging.getLogger(__name__)

# =============================================================================
# HTTP Request Metrics (US1 - Consistent Performance Under Load)
# =============================================================================

# HTTP request duration histogram (p50, p95, p99)
# Buckets optimized for web application response times
HTTP_REQUEST_DURATION = Histogram(
    "rawdrive_http_request_duration_seconds",
    "HTTP request duration in seconds",
    labelnames=["method", "endpoint", "status_code"],
    buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
)

# HTTP requests counter (total requests with labels)
HTTP_REQUESTS_TOTAL = Counter(
    "rawdrive_http_requests_total",
    "Total number of HTTP requests",
    labelnames=["method", "endpoint", "status_code"],
)

# HTTP requests in progress gauge
HTTP_REQUESTS_IN_PROGRESS = Gauge(
    "rawdrive_http_requests_in_progress",
    "Number of HTTP requests currently being processed",
    labelnames=["method", "endpoint"],
)

# =============================================================================
# Database Pool Metrics (US3 - Database Connection Stability)
# =============================================================================

# Database connection pool gauges
DB_POOL_CONNECTIONS_ACTIVE = Gauge(
    "rawdrive_db_pool_connections_active",
    "Number of active (in-use) database connections",
)

DB_POOL_CONNECTIONS_IDLE = Gauge(
    "rawdrive_db_pool_connections_idle",
    "Number of idle database connections in the pool",
)

DB_POOL_CONNECTIONS_MAX = Gauge(
    "rawdrive_db_pool_connections_max",
    "Maximum number of database connections allowed",
)

DB_POOL_CONNECTIONS_TOTAL = Gauge(
    "rawdrive_db_pool_connections_total",
    "Total number of database connections (active + idle)",
)

DB_POOL_UTILIZATION = Gauge(
    "rawdrive_db_pool_utilization_percent",
    "Database connection pool utilization percentage",
)

# =============================================================================
# Redis Pool Metrics (US4 - Cache Layer Scalability)
# =============================================================================

REDIS_POOL_CONNECTIONS_ACTIVE = Gauge(
    "rawdrive_redis_pool_connections_active",
    "Number of active Redis connections",
)

REDIS_POOL_CONNECTIONS_MAX = Gauge(
    "rawdrive_redis_pool_connections_max",
    "Maximum number of Redis connections allowed",
)

REDIS_POOL_CONNECTIONS_IDLE = Gauge(
    "rawdrive_redis_pool_connections_idle",
    "Number of idle Redis connections in the pool",
)

# =============================================================================
# Cache Metrics
# =============================================================================

CACHE_HITS_TOTAL = Counter(
    "rawdrive_cache_hits_total",
    "Total number of cache hits",
    labelnames=["cache_type"],
)

CACHE_MISSES_TOTAL = Counter(
    "rawdrive_cache_misses_total",
    "Total number of cache misses",
    labelnames=["cache_type"],
)

CACHE_HIT_RATE = Gauge(
    "rawdrive_cache_hit_rate",
    "Cache hit rate (0-1)",
    labelnames=["cache_type"],
)

# =============================================================================
# Scaling Metrics (US2 - Automatic Resource Scaling)
# =============================================================================

HPA_CURRENT_REPLICAS = Gauge(
    "rawdrive_hpa_current_replicas",
    "Current number of pod replicas",
)

HPA_DESIRED_REPLICAS = Gauge(
    "rawdrive_hpa_desired_replicas",
    "Desired number of pod replicas from HPA",
)

HPA_MAX_REPLICAS = Gauge(
    "rawdrive_hpa_max_replicas",
    "Maximum number of pod replicas allowed",
)


def get_route_template(request: Request) -> str:
    """Extract the route template (e.g., /api/v1/galleries/{gallery_id}) from the request.

    This normalizes dynamic path parameters to prevent metric label explosion.
    """
    # Try to match against registered routes
    for route in request.app.routes:
        match, _ = route.matches(request.scope)
        if match == Match.FULL:
            return route.path

    # Fallback to the actual path (shouldn't happen for valid routes)
    return request.url.path


class PrometheusMetricsMiddleware(BaseHTTPMiddleware):
    """FastAPI middleware for collecting Prometheus metrics.

    Tracks:
    - Request latency (histogram with p50/p95/p99)
    - Request count (counter with method/endpoint/status)
    - In-flight requests (gauge)
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip metrics endpoint to avoid recursion
        if request.url.path == "/metrics":
            return await call_next(request)

        method = request.method
        endpoint = get_route_template(request)

        # Track in-flight requests
        HTTP_REQUESTS_IN_PROGRESS.labels(method=method, endpoint=endpoint).inc()

        start_time = time.perf_counter()

        try:
            response = await call_next(request)
            status_code = str(response.status_code)
        except Exception:
            status_code = "500"
            raise
        finally:
            # Record request duration
            duration = time.perf_counter() - start_time
            HTTP_REQUEST_DURATION.labels(
                method=method,
                endpoint=endpoint,
                status_code=status_code,
            ).observe(duration)

            # Increment request counter
            HTTP_REQUESTS_TOTAL.labels(
                method=method,
                endpoint=endpoint,
                status_code=status_code,
            ).inc()

            # Decrement in-flight requests
            HTTP_REQUESTS_IN_PROGRESS.labels(method=method, endpoint=endpoint).dec()

        return response


async def update_db_pool_metrics() -> None:
    """Update database connection pool metrics from the current pool state.

    Should be called periodically or on each request to keep metrics current.
    """
    try:
        from app.db.postgres import get_pool_stats

        stats = await get_pool_stats()

        DB_POOL_CONNECTIONS_ACTIVE.set(stats.used_size)
        DB_POOL_CONNECTIONS_IDLE.set(stats.free_size)
        DB_POOL_CONNECTIONS_MAX.set(stats.max_size)
        DB_POOL_CONNECTIONS_TOTAL.set(stats.size)
        DB_POOL_UTILIZATION.set(stats.utilization_percent)

    except Exception as e:
        logger.debug(f"Could not update DB pool metrics: {e}")


async def update_redis_pool_metrics() -> None:
    """Update Redis connection pool metrics from the current pool state.

    Should be called periodically or on each request to keep metrics current.
    """
    try:
        from app.db.redis import get_redis_pool_stats

        stats = await get_redis_pool_stats()

        REDIS_POOL_CONNECTIONS_ACTIVE.set(stats.get("active_connections", 0))
        REDIS_POOL_CONNECTIONS_MAX.set(stats.get("max_connections", 0))
        REDIS_POOL_CONNECTIONS_IDLE.set(stats.get("idle_connections", 0))

    except Exception as e:
        logger.debug(f"Could not update Redis pool metrics: {e}")


def record_cache_access(cache_type: str, hit: bool) -> None:
    """Record a cache access for hit rate calculation.

    Args:
        cache_type: Type of cache (e.g., "gallery", "asset", "session")
        hit: Whether the cache access was a hit (True) or miss (False)
    """
    if hit:
        CACHE_HITS_TOTAL.labels(cache_type=cache_type).inc()
    else:
        CACHE_MISSES_TOTAL.labels(cache_type=cache_type).inc()


@asynccontextmanager
async def track_cache_access(cache_type: str):
    """Context manager to track cache access and calculate hit rate.

    Usage:
        async with track_cache_access("gallery") as tracker:
            result = await cache.get(key)
            if result is not None:
                tracker.hit()
            else:
                tracker.miss()
    """
    class CacheTracker:
        def __init__(self):
            self._hit = None

        def hit(self):
            self._hit = True
            record_cache_access(cache_type, hit=True)

        def miss(self):
            self._hit = False
            record_cache_access(cache_type, hit=False)

    tracker = CacheTracker()
    yield tracker


def log_scaling_event(
    event_type: str,
    current_replicas: int,
    desired_replicas: int,
    trigger_reason: str,
    outcome: str = "pending",
    extra: Optional[dict] = None,
) -> None:
    """Log a scaling event with structured data (T065 - US6 Operational Visibility).

    Args:
        event_type: Type of event (scale_up, scale_down, at_max, approaching_max)
        current_replicas: Current number of pod replicas
        desired_replicas: Desired/target number of replicas
        trigger_reason: What triggered the scaling (cpu_threshold, memory_pressure, etc.)
        outcome: Result of scaling (pending, success, failed, throttled)
        extra: Additional context data
    """
    scaling_data = {
        "event": "scaling",
        "type": event_type,
        "current_replicas": current_replicas,
        "desired_replicas": desired_replicas,
        "trigger_reason": trigger_reason,
        "outcome": outcome,
        "replica_delta": desired_replicas - current_replicas,
    }

    if extra:
        scaling_data.update(extra)

    # Log with structured format for log aggregation
    logger.info(
        f"Scaling event: {event_type}",
        extra={"scaling_event": scaling_data},
    )

    # Update HPA metrics if we have the data
    if current_replicas >= 0:
        HPA_CURRENT_REPLICAS.set(current_replicas)
    if desired_replicas >= 0:
        HPA_DESIRED_REPLICAS.set(desired_replicas)


def log_capacity_warning(
    warning_type: str,
    current_value: float,
    threshold: float,
    resource: str,
    extra: Optional[dict] = None,
) -> None:
    """Log a capacity warning with structured data.

    Args:
        warning_type: Type of warning (pool_saturation, high_latency, error_spike)
        current_value: Current metric value
        threshold: Threshold that was exceeded
        resource: Resource under pressure (db_pool, redis_pool, cpu, memory)
        extra: Additional context
    """
    capacity_data = {
        "event": "capacity_warning",
        "type": warning_type,
        "current_value": current_value,
        "threshold": threshold,
        "resource": resource,
        "percentage_of_threshold": round((current_value / threshold) * 100, 2) if threshold > 0 else 0,
    }

    if extra:
        capacity_data.update(extra)

    logger.warning(
        f"Capacity warning: {warning_type} on {resource}",
        extra={"capacity_event": capacity_data},
    )


def setup_metrics(app: FastAPI) -> None:
    """Set up Prometheus metrics for the FastAPI application.

    Adds:
    - Metrics middleware for HTTP request tracking
    - /metrics endpoint for Prometheus scraping
    """
    # Add metrics middleware
    app.add_middleware(PrometheusMetricsMiddleware)

    # Add metrics endpoint
    @app.get("/metrics", include_in_schema=False)
    async def metrics_endpoint():
        """Prometheus metrics endpoint."""
        # Update pool metrics before generating response
        await update_db_pool_metrics()
        await update_redis_pool_metrics()

        return Response(
            content=generate_latest(REGISTRY),
            media_type=CONTENT_TYPE_LATEST,
        )

    logger.info("Prometheus metrics initialized")
