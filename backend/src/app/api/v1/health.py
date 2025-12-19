"""Health check and monitoring endpoints.

Implements Requirements: 15.1, 15.2, 15.3
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from app.config.settings import AppSettings, get_settings
from app.db.postgres import postgres_healthcheck
from app.db.redis import get_redis_client

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


def _get_settings() -> AppSettings:
    return get_settings()


SettingsDep = Annotated[AppSettings, Depends(_get_settings)]


@router.get(
    "/health",
    summary="Basic health check",
    description="Returns OK if the service is running.",
)
async def health_check() -> dict:
    """Basic health check - returns immediately."""
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get(
    "/ready",
    summary="Readiness check",
    description="Returns OK if all dependencies (DB, Redis) are available.",
)
async def readiness_check(response: Response) -> dict:
    """Readiness check - verifies DB and Redis connectivity."""
    checks = {
        "postgres": False,
        "redis": False,
    }
    
    start = time.perf_counter()

    # Check PostgreSQL
    try:
        checks["postgres"] = await postgres_healthcheck(timeout=2.0)
    except Exception as e:
        logger.warning(f"PostgreSQL health check failed: {e}")
        checks["postgres"] = False

    # Check Redis
    try:
        redis = await get_redis_client()
        pong = await redis.ping()
        checks["redis"] = pong is True
    except Exception as e:
        logger.warning(f"Redis health check failed: {e}")
        checks["redis"] = False

    elapsed_ms = (time.perf_counter() - start) * 1000
    all_healthy = all(checks.values())

    if not all_healthy:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "status": "ok" if all_healthy else "degraded",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "checks": checks,
        "latency_ms": round(elapsed_ms, 2),
    }


@router.get(
    "/live",
    summary="Liveness probe",
    description="For Kubernetes liveness probe - returns OK if process is running.",
)
async def liveness_probe() -> dict:
    """Liveness probe - confirms the process is alive."""
    return {"status": "alive"}


@router.get(
    "/metrics",
    summary="Prometheus metrics",
    description="Returns Prometheus-compatible metrics.",
)
async def metrics(settings: SettingsDep) -> Response:
    """Return Prometheus metrics.
    
    This is a placeholder - in production, use prometheus_client library.
    """
    # Basic metrics format
    metrics_output = []
    
    # App info
    metrics_output.append(
        f'app_info{{version="{settings.app_version}",env="{settings.environment}"}} 1'
    )
    
    # Health status
    try:
        pg_healthy = await postgres_healthcheck(timeout=1.0)
    except Exception:
        pg_healthy = False
    
    try:
        redis = await get_redis_client()
        redis_healthy = await redis.ping() is True
    except Exception:
        redis_healthy = False

    metrics_output.append(f"health_postgres {1 if pg_healthy else 0}")
    metrics_output.append(f"health_redis {1 if redis_healthy else 0}")
    
    content = "\n".join(metrics_output) + "\n"
    
    return Response(
        content=content,
        media_type="text/plain; version=0.0.4; charset=utf-8",
    )


@router.get(
    "/info",
    summary="Application info",
    description="Returns application version and configuration info.",
)
async def app_info(settings: SettingsDep) -> dict:
    """Application info endpoint."""
    return {
        "app_name": settings.app_name,
        "version": settings.app_version,
        "environment": settings.environment,
        "debug": settings.debug,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
