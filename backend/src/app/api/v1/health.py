"""Health check and monitoring endpoints.

Implements Requirements: 15.1, 15.2, 15.3

This module provides Kubernetes-compatible health probes:
- /startup - Startup probe: Checks if the application has completed initialization
- /live - Liveness probe: Simple check that the process is alive
- /ready - Readiness probe: Checks if all dependencies are healthy
- /health - Basic health check with dependency status
- /health/detailed - Detailed health with connection pool statistics
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Response, status

from app.config.settings import AppSettings, get_settings
from app.db.postgres import get_pool_stats, postgres_healthcheck
from app.db.redis import get_redis_client, get_redis_pool_stats, redis_healthcheck
from app.metrics.registry import get_metrics_output, dependency_health, app_info as app_info_metric

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])

# Application version (should match main.py)
APP_VERSION = "0.1.3"

# Track startup completion
_startup_complete = False


def mark_startup_complete() -> None:
    """Mark the application startup as complete."""
    global _startup_complete
    _startup_complete = True


def is_startup_complete() -> bool:
    """Check if application startup is complete."""
    return _startup_complete


def _get_settings() -> AppSettings:
    return get_settings()


SettingsDep = Annotated[AppSettings, Depends(_get_settings)]


async def _check_postgres(timeout: float = 2.0) -> dict[str, Any]:
    """Check PostgreSQL connectivity and return detailed status."""
    result: dict[str, Any] = {
        "healthy": False,
        "latency_ms": None,
        "error": None,
    }

    start = time.perf_counter()
    try:
        healthy = await asyncio.wait_for(
            postgres_healthcheck(timeout=timeout),
            timeout=timeout + 0.5
        )
        result["healthy"] = healthy
        result["latency_ms"] = round((time.perf_counter() - start) * 1000, 2)
    except asyncio.TimeoutError:
        result["error"] = "timeout"
        logger.warning("PostgreSQL health check timed out")
    except Exception as e:
        result["error"] = str(e)
        logger.warning(f"PostgreSQL health check failed: {e}")

    return result


async def _check_redis(timeout: float = 2.0) -> dict[str, Any]:
    """Check Redis connectivity and return detailed status."""
    result: dict[str, Any] = {
        "healthy": False,
        "latency_ms": None,
        "error": None,
    }

    start = time.perf_counter()
    try:
        redis = await get_redis_client()
        pong = await asyncio.wait_for(redis.ping(), timeout=timeout)
        result["healthy"] = pong is True
        result["latency_ms"] = round((time.perf_counter() - start) * 1000, 2)
    except asyncio.TimeoutError:
        result["error"] = "timeout"
        logger.warning("Redis health check timed out")
    except Exception as e:
        result["error"] = str(e)
        logger.warning(f"Redis health check failed: {e}")

    return result


@router.get(
    "/startup",
    summary="Startup probe",
    description="For Kubernetes startup probe - returns OK when application initialization is complete.",
)
async def startup_probe(response: Response) -> dict:
    """Startup probe - checks if the application has finished initializing.

    This endpoint is used by Kubernetes to determine when the application
    has completed its startup sequence. It verifies:
    1. The startup flag has been set
    2. PostgreSQL connection pool is ready
    3. Redis connection is available

    Returns 503 if startup is not complete.
    """
    checks: dict[str, Any] = {
        "initialized": _startup_complete,
        "postgres_pool": False,
        "redis": False,
    }

    if not _startup_complete:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {
            "status": "starting",
            "message": "Application initialization in progress",
            "checks": checks,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    # Verify database pool is ready
    try:
        pool_stats = await get_pool_stats()
        checks["postgres_pool"] = pool_stats.size >= pool_stats.min_size
    except Exception as e:
        logger.warning(f"Startup probe - PostgreSQL pool check failed: {e}")
        checks["postgres_pool"] = False

    # Verify Redis is ready
    try:
        redis = await get_redis_client()
        pong = await asyncio.wait_for(redis.ping(), timeout=1.0)
        checks["redis"] = pong is True
    except Exception as e:
        logger.warning(f"Startup probe - Redis check failed: {e}")
        checks["redis"] = False

    all_ready = all(checks.values())

    if not all_ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "status": "ready" if all_ready else "starting",
        "checks": checks,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get(
    "/live",
    summary="Liveness probe",
    description="For Kubernetes liveness probe - returns OK if process is running.",
)
async def liveness_probe() -> dict:
    """Liveness probe - confirms the process is alive.

    This is a lightweight check that should always succeed if the
    application process is running. It does not check external dependencies.
    """
    return {
        "status": "alive",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get(
    "/health",
    summary="Basic health check",
    description="Returns OK if the service and its dependencies are healthy.",
)
async def health_check(response: Response) -> dict:
    """Basic health check with dependency status.

    Checks PostgreSQL and Redis connectivity and returns overall health status.
    """
    start = time.perf_counter()

    # Run checks concurrently
    pg_check, redis_check = await asyncio.gather(
        _check_postgres(timeout=2.0),
        _check_redis(timeout=2.0),
    )

    elapsed_ms = (time.perf_counter() - start) * 1000
    all_healthy = pg_check["healthy"] and redis_check["healthy"]

    if not all_healthy:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "status": "ok" if all_healthy else "degraded",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "checks": {
            "postgres": pg_check["healthy"],
            "redis": redis_check["healthy"],
        },
        "latency_ms": round(elapsed_ms, 2),
    }


@router.get(
    "/ready",
    summary="Readiness check",
    description="Returns OK if all dependencies (DB, Redis) are available and ready to serve traffic.",
)
async def readiness_check(response: Response) -> dict:
    """Readiness check - verifies DB and Redis connectivity.

    This endpoint is used by Kubernetes to determine if the pod should
    receive traffic. It checks:
    1. PostgreSQL connection pool has available connections
    2. Redis is responding to pings
    """
    start = time.perf_counter()

    # Run checks concurrently
    pg_check, redis_check = await asyncio.gather(
        _check_postgres(timeout=2.0),
        _check_redis(timeout=2.0),
    )

    # Additional pool availability check
    pool_available = True
    try:
        pool_stats = await get_pool_stats()
        # Consider not ready if pool is fully utilized
        pool_available = pool_stats.free_size > 0 or pool_stats.used_size < pool_stats.max_size
    except Exception as e:
        logger.warning(f"Readiness check - Pool stats unavailable: {e}")
        pool_available = True  # Don't fail readiness if we can't get stats

    elapsed_ms = (time.perf_counter() - start) * 1000
    all_ready = pg_check["healthy"] and redis_check["healthy"] and pool_available

    if not all_ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "status": "ok" if all_ready else "degraded",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "checks": {
            "postgres": pg_check["healthy"],
            "redis": redis_check["healthy"],
            "pool_available": pool_available,
        },
        "latency_ms": round(elapsed_ms, 2),
    }


@router.get(
    "/metrics",
    summary="Prometheus metrics",
    description="Returns Prometheus-compatible metrics.",
)
async def metrics(settings: SettingsDep) -> Response:
    """Return Prometheus metrics.

    Returns all registered Prometheus metrics in the standard text format.
    Includes:
    - HTTP request metrics (counts, latency, in-progress)
    - Error metrics (4xx, 5xx by endpoint)
    - Business metrics (uploads, AI operations)
    - Health metrics (dependency status)
    - Application info
    """
    # Update app info metric
    try:
        # Use app version from main.py (0.1.3) and app_env from settings
        app_info_metric.labels(
            version="0.1.3",
            environment=settings.app_env.value,
        ).set(1)
    except Exception as e:
        logger.warning(f"Failed to set app_info metric: {e}")

    # Update dependency health metrics
    try:
        pg_healthy = await postgres_healthcheck(timeout=1.0)
        dependency_health.labels(dependency="postgres").set(1 if pg_healthy else 0)
    except Exception:
        dependency_health.labels(dependency="postgres").set(0)

    try:
        redis = await get_redis_client()
        redis_healthy = await redis.ping() is True
        dependency_health.labels(dependency="redis").set(1 if redis_healthy else 0)
    except Exception:
        dependency_health.labels(dependency="redis").set(0)

    # Generate Prometheus metrics output
    try:
        content = get_metrics_output()
    except Exception as e:
        logger.error(f"Failed to generate metrics: {e}")
        return Response(
            content=b"# Error generating metrics\n",
            status_code=500,
            media_type="text/plain; version=0.0.4; charset=utf-8",
        )

    return Response(
        content=content,
        media_type="text/plain; version=0.0.4; charset=utf-8",
    )


@router.get(
    "/health/detailed",
    summary="Detailed health check",
    description="Returns detailed health status including connection pool statistics.",
)
async def detailed_health_check(response: Response, settings: SettingsDep) -> dict:
    """Detailed health check with connection pool statistics.

    Provides comprehensive health information including:
    - PostgreSQL connection status and latency
    - PostgreSQL pool statistics (size, utilization, etc.)
    - Redis connection status and latency
    - Redis pool statistics
    - Application metadata
    """
    start = time.perf_counter()

    # Run health checks concurrently
    pg_check, redis_check = await asyncio.gather(
        _check_postgres(timeout=2.0),
        _check_redis(timeout=2.0),
    )

    # Get pool statistics
    postgres_pool: dict[str, Any] = {}
    try:
        pool_stats = await get_pool_stats()
        postgres_pool = {
            "size": pool_stats.size,
            "free_size": pool_stats.free_size,
            "used_size": pool_stats.used_size,
            "min_size": pool_stats.min_size,
            "max_size": pool_stats.max_size,
            "utilization_percent": round(pool_stats.utilization_percent, 2),
        }
    except Exception as e:
        postgres_pool = {"error": str(e)}

    redis_pool = get_redis_pool_stats()

    elapsed_ms = (time.perf_counter() - start) * 1000
    all_healthy = pg_check["healthy"] and redis_check["healthy"]

    if not all_healthy:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "status": "ok" if all_healthy else "degraded",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "application": {
            "name": settings.app_name,
            "version": APP_VERSION,
            "environment": settings.app_env.value,
        },
        "dependencies": {
            "postgres": {
                "healthy": pg_check["healthy"],
                "latency_ms": pg_check["latency_ms"],
                "error": pg_check["error"],
                "pool": postgres_pool,
            },
            "redis": {
                "healthy": redis_check["healthy"],
                "latency_ms": redis_check["latency_ms"],
                "error": redis_check["error"],
                "pool": redis_pool,
            },
        },
        "latency_ms": round(elapsed_ms, 2),
    }


@router.get(
    "/info",
    summary="Application info",
    description="Returns application version and configuration info.",
)
async def app_info(settings: SettingsDep) -> dict:
    """Application info endpoint."""
    return {
        "app_name": settings.app_name,
        "version": APP_VERSION,
        "environment": settings.app_env.value,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
