"""Health check endpoints for the Upload Service.

Provides Kubernetes-compatible health check endpoints:
- /health: Liveness probe - returns 200 if service is running
- /ready: Readiness probe - returns 200 if all dependencies are healthy

Author: Claude Code Migration
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.core.config import get_settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


# =============================================================================
# Response Models
# =============================================================================


class HealthResponse(BaseModel):
    """Response model for health check endpoints."""

    status: str
    service: str
    timestamp: str


class ReadinessResponse(BaseModel):
    """Response model for readiness probe."""

    status: str
    service: str
    version: str
    timestamp: str
    checks: dict[str, str]
    details: dict[str, Any] | None = None


class DependencyCheck(BaseModel):
    """Individual dependency check result."""

    name: str
    status: str
    latency_ms: float | None = None
    error: str | None = None


# =============================================================================
# Health Check Functions
# =============================================================================


async def check_postgres() -> tuple[bool, float | None, str | None]:
    """Check PostgreSQL connectivity.

    Returns:
        Tuple of (is_healthy, latency_ms, error_message)
    """
    import time

    try:
        from app.core.database import fetch_val

        start = time.time()
        result = await fetch_val("SELECT 1")
        latency_ms = (time.time() - start) * 1000

        if result == 1:
            return True, latency_ms, None
        return False, latency_ms, "Unexpected query result"

    except Exception as e:
        logger.warning("PostgreSQL health check failed", extra={"error": str(e)})
        return False, None, str(e)


async def check_redis() -> tuple[bool, float | None, str | None]:
    """Check Redis connectivity.

    Returns:
        Tuple of (is_healthy, latency_ms, error_message)
    """
    import time

    try:
        from app.core.redis import get_redis_client

        redis = await get_redis_client()
        if redis is None:
            return False, None, "Redis client not initialized"

        start = time.time()
        result = await redis.ping()
        latency_ms = (time.time() - start) * 1000

        return result, latency_ms, None

    except Exception as e:
        logger.warning("Redis health check failed", extra={"error": str(e)})
        return False, None, str(e)


async def check_r2() -> tuple[bool, float | None, str | None]:
    """Check R2 storage connectivity.

    Returns:
        Tuple of (is_healthy, latency_ms, error_message)
    """
    import time

    try:
        from app.services.r2_storage_service import get_r2_storage_service

        r2 = get_r2_storage_service()
        if r2 is None:
            return False, None, "R2 service not initialized"

        start = time.time()
        # Check if bucket exists
        is_healthy = await r2.health_check()
        latency_ms = (time.time() - start) * 1000

        return is_healthy, latency_ms, None

    except Exception as e:
        logger.warning("R2 health check failed", extra={"error": str(e)})
        return False, None, str(e)


async def check_kafka() -> tuple[bool, float | None, str | None]:
    """Check Kafka connectivity.

    Returns:
        Tuple of (is_healthy, latency_ms, error_message)
    """
    import time

    try:
        from app.services.event_producer import get_event_producer

        producer = await get_event_producer()
        if producer is None:
            return True, None, None  # Kafka is optional

        start = time.time()
        is_healthy = await producer.health_check()
        latency_ms = (time.time() - start) * 1000

        return is_healthy, latency_ms, None

    except Exception as e:
        logger.warning("Kafka health check failed", extra={"error": str(e)})
        # Kafka is optional, so we return True but log the error
        return True, None, f"Optional: {str(e)}"


# =============================================================================
# Health Check Endpoints
# =============================================================================


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Liveness probe",
    description="Lightweight health check for Kubernetes liveness probe. "
    "Returns 200 if the service is running.",
)
async def health_check() -> HealthResponse:
    """Liveness probe - always returns 200 if service is running.

    This endpoint is used by Kubernetes to determine if the container
    should be restarted. It does not check dependencies.
    """
    settings = get_settings()
    return HealthResponse(
        status="ok",
        service=settings.SERVICE_NAME,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


@router.get(
    "/ready",
    response_model=ReadinessResponse,
    summary="Readiness probe",
    description="Comprehensive health check for Kubernetes readiness probe. "
    "Returns 200 if all critical dependencies are healthy, 503 otherwise.",
    responses={
        200: {"description": "Service is ready to accept traffic"},
        503: {"description": "Service is not ready - dependencies unhealthy"},
    },
)
async def readiness_check() -> ReadinessResponse:
    """Readiness probe - checks all dependencies.

    This endpoint is used by Kubernetes to determine if the container
    should receive traffic. It checks all critical dependencies.

    Returns:
        ReadinessResponse with status and dependency check results

    Raises:
        HTTPException 503 if any critical dependency is unhealthy
    """
    settings = get_settings()
    checks: dict[str, str] = {}
    details: dict[str, Any] = {}

    # Check PostgreSQL (critical)
    pg_ok, pg_latency, pg_error = await check_postgres()
    checks["postgres"] = "healthy" if pg_ok else "unhealthy"
    details["postgres"] = DependencyCheck(
        name="postgres",
        status="healthy" if pg_ok else "unhealthy",
        latency_ms=pg_latency,
        error=pg_error,
    ).model_dump()

    # Check Redis (critical)
    redis_ok, redis_latency, redis_error = await check_redis()
    checks["redis"] = "healthy" if redis_ok else "unhealthy"
    details["redis"] = DependencyCheck(
        name="redis",
        status="healthy" if redis_ok else "unhealthy",
        latency_ms=redis_latency,
        error=redis_error,
    ).model_dump()

    # Check R2 storage (critical)
    r2_ok, r2_latency, r2_error = await check_r2()
    checks["r2"] = "healthy" if r2_ok else "unhealthy"
    details["r2"] = DependencyCheck(
        name="r2",
        status="healthy" if r2_ok else "unhealthy",
        latency_ms=r2_latency,
        error=r2_error,
    ).model_dump()

    # Check Kafka (optional)
    kafka_ok, kafka_latency, kafka_error = await check_kafka()
    checks["kafka"] = "healthy" if kafka_ok else "degraded"
    details["kafka"] = DependencyCheck(
        name="kafka",
        status="healthy" if kafka_ok else "degraded",
        latency_ms=kafka_latency,
        error=kafka_error,
    ).model_dump()

    # Determine overall status
    # Critical dependencies: postgres, redis, r2
    critical_healthy = pg_ok and redis_ok and r2_ok

    if not critical_healthy:
        logger.warning(
            "Readiness check failed",
            extra={
                "postgres": pg_ok,
                "redis": redis_ok,
                "r2": r2_ok,
                "kafka": kafka_ok,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "status": "unhealthy",
                "service": settings.SERVICE_NAME,
                "version": settings.SERVICE_VERSION,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "checks": checks,
                "details": details,
            },
        )

    return ReadinessResponse(
        status="ok",
        service=settings.SERVICE_NAME,
        version=settings.SERVICE_VERSION,
        timestamp=datetime.now(timezone.utc).isoformat(),
        checks=checks,
        details=details,
    )


@router.get(
    "/startup",
    response_model=HealthResponse,
    summary="Startup probe",
    description="Startup probe for Kubernetes. Returns 200 when service has "
    "completed initialization.",
)
async def startup_check() -> HealthResponse:
    """Startup probe - returns 200 when service is initialized.

    Used during container startup to determine when the application
    has finished initializing. More lenient than readiness probe.
    """
    settings = get_settings()

    # Check if basic initialization is complete
    # For now, just check if we can import core modules
    try:
        from app.core.database import get_connection  # noqa: F401
        from app.core.redis import get_redis_client  # noqa: F401
    except ImportError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "status": "initializing",
                "service": settings.SERVICE_NAME,
                "error": str(e),
            },
        )

    return HealthResponse(
        status="ok",
        service=settings.SERVICE_NAME,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


# =============================================================================
# Module Exports
# =============================================================================

__all__ = [
    "router",
    "health_check",
    "readiness_check",
    "startup_check",
    "check_postgres",
    "check_redis",
    "check_r2",
    "check_kafka",
]
