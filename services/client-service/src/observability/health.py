"""
Health check system for Kubernetes liveness and readiness probes.

Provides endpoints to verify service health and dependency connectivity.
"""

from enum import Enum
from typing import Dict, Any, Optional, Callable, Awaitable
from pydantic import BaseModel
import asyncio

from src.database import check_database_connection
from src.cache.redis_client import redis_client
from src.config import settings


class HealthStatus(str, Enum):
    """Health check status."""

    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"


class HealthCheckResult(BaseModel):
    """Individual health check result."""

    name: str
    status: HealthStatus
    message: Optional[str] = None
    latency_ms: Optional[float] = None


class OverallHealthStatus(BaseModel):
    """Overall service health status."""

    status: HealthStatus
    service: str
    version: str
    checks: Dict[str, HealthCheckResult]

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API response."""
        return {
            "status": self.status.value,
            "service": self.service,
            "version": self.version,
            "checks": {
                name: {
                    "status": check.status.value,
                    "message": check.message,
                    "latency_ms": check.latency_ms,
                }
                for name, check in self.checks.items()
            },
        }


class HealthChecker:
    """
    Health checker with registered checks for dependencies.

    Supports both liveness (service running) and readiness (can serve requests).
    """

    def __init__(self):
        """Initialize health checker."""
        self._checks: Dict[str, Callable[[], Awaitable[HealthCheckResult]]] = {}
        self._register_default_checks()

    def _register_default_checks(self) -> None:
        """Register default health checks for database and Redis."""
        self.register("database", self._check_database)
        self.register("redis", self._check_redis)

    def register(
        self,
        name: str,
        check_func: Callable[[], Awaitable[HealthCheckResult]],
    ) -> None:
        """
        Register a health check.

        Args:
            name: Check name
            check_func: Async function that performs health check
        """
        self._checks[name] = check_func

    async def _check_database(self) -> HealthCheckResult:
        """Check database connectivity."""
        import time

        start = time.time()
        try:
            is_healthy = await asyncio.wait_for(
                check_database_connection(),
                timeout=settings.HEALTH_CHECK_TIMEOUT_SECONDS,
            )
            latency_ms = (time.time() - start) * 1000

            if is_healthy:
                return HealthCheckResult(
                    name="database",
                    status=HealthStatus.HEALTHY,
                    message="Database connected",
                    latency_ms=latency_ms,
                )
            else:
                return HealthCheckResult(
                    name="database",
                    status=HealthStatus.UNHEALTHY,
                    message="Database connection failed",
                    latency_ms=latency_ms,
                )
        except asyncio.TimeoutError:
            return HealthCheckResult(
                name="database",
                status=HealthStatus.UNHEALTHY,
                message="Database health check timeout",
            )
        except Exception as e:
            return HealthCheckResult(
                name="database",
                status=HealthStatus.UNHEALTHY,
                message=f"Database error: {str(e)}",
            )

    async def _check_redis(self) -> HealthCheckResult:
        """Check Redis connectivity."""
        import time

        start = time.time()
        try:
            is_healthy = await asyncio.wait_for(
                redis_client.ping(),
                timeout=settings.HEALTH_CHECK_TIMEOUT_SECONDS,
            )
            latency_ms = (time.time() - start) * 1000

            if is_healthy:
                return HealthCheckResult(
                    name="redis",
                    status=HealthStatus.HEALTHY,
                    message="Redis connected",
                    latency_ms=latency_ms,
                )
            else:
                return HealthCheckResult(
                    name="redis",
                    status=HealthStatus.DEGRADED,
                    message="Redis connection failed (service degraded)",
                    latency_ms=latency_ms,
                )
        except asyncio.TimeoutError:
            return HealthCheckResult(
                name="redis",
                status=HealthStatus.DEGRADED,
                message="Redis health check timeout (service degraded)",
            )
        except Exception as e:
            return HealthCheckResult(
                name="redis",
                status=HealthStatus.DEGRADED,
                message=f"Redis error (service degraded): {str(e)}",
            )

    async def check_all(self) -> OverallHealthStatus:
        """
        Run all registered health checks.

        Returns:
            OverallHealthStatus: Overall health status with individual check results
        """
        check_results: Dict[str, HealthCheckResult] = {}

        # Run all checks concurrently
        tasks = {name: check_func() for name, check_func in self._checks.items()}
        results = await asyncio.gather(*tasks.values(), return_exceptions=True)

        for (name, _), result in zip(tasks.items(), results):
            if isinstance(result, Exception):
                check_results[name] = HealthCheckResult(
                    name=name,
                    status=HealthStatus.UNHEALTHY,
                    message=f"Check failed: {str(result)}",
                )
            else:
                check_results[name] = result

        # Determine overall status
        statuses = [check.status for check in check_results.values()]

        if all(s == HealthStatus.HEALTHY for s in statuses):
            overall_status = HealthStatus.HEALTHY
        elif any(s == HealthStatus.UNHEALTHY for s in statuses):
            overall_status = HealthStatus.UNHEALTHY
        else:
            overall_status = HealthStatus.DEGRADED

        return OverallHealthStatus(
            status=overall_status,
            service=settings.SERVICE_NAME,
            version=settings.SERVICE_VERSION,
            checks=check_results,
        )

    async def is_live(self) -> bool:
        """
        Check if service is alive (for Kubernetes liveness probe).

        This should NOT check external dependencies.
        Returns True if the service process is running.

        Returns:
            bool: True (service is alive)
        """
        return True

    async def is_ready(self) -> bool:
        """
        Check if service is ready to serve requests (for Kubernetes readiness probe).

        Checks critical dependencies (database).
        Redis is NOT critical - service can function without caching.

        Returns:
            bool: True if service can serve requests
        """
        db_check = await self._check_database()
        return db_check.status == HealthStatus.HEALTHY


# Global health checker instance
health_checker = HealthChecker()
