"""
Health Check Module for the Invitations Microservice.

Provides Kubernetes-compatible health check endpoints:
- /health/live - Liveness probe (is the service running?)
- /health/ready - Readiness probe (can the service handle requests?)

Individual health checks can be registered for different dependencies.
"""

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Callable, Dict, List, Optional, Awaitable

from src.logging import get_logger

logger = get_logger(__name__)


class HealthStatus(str, Enum):
    """Health status values."""

    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"


@dataclass
class HealthCheckResult:
    """Result of a single health check."""

    name: str
    status: HealthStatus
    message: Optional[str] = None
    latency_ms: Optional[float] = None
    details: Optional[dict] = None


@dataclass
class OverallHealthStatus:
    """Overall health status of the service."""

    status: HealthStatus
    timestamp: str
    checks: List[HealthCheckResult]
    version: str = "1.0.0"

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON response."""
        return {
            "status": self.status.value,
            "timestamp": self.timestamp,
            "version": self.version,
            "checks": [
                {
                    "name": check.name,
                    "status": check.status.value,
                    "message": check.message,
                    "latency_ms": check.latency_ms,
                    "details": check.details,
                }
                for check in self.checks
            ],
        }


# Type alias for health check functions
HealthCheckFunc = Callable[[], Awaitable[HealthCheckResult]]


class HealthChecker:
    """
    Centralized health check manager.

    Registers and runs health checks for various dependencies
    like database, cache, and external services.

    Usage:
        checker = HealthChecker()

        # Register checks
        checker.register("database", check_database)
        checker.register("redis", check_redis)

        # Run all checks
        status = await checker.check_all()
    """

    def __init__(self, version: str = "1.0.0"):
        self._checks: Dict[str, HealthCheckFunc] = {}
        self._version = version

    def register(self, name: str, check_func: HealthCheckFunc) -> None:
        """
        Register a health check function.

        Args:
            name: Unique name for this check
            check_func: Async function that returns HealthCheckResult
        """
        self._checks[name] = check_func
        logger.info("health_check_registered", check_name=name)

    def unregister(self, name: str) -> None:
        """Remove a registered health check."""
        if name in self._checks:
            del self._checks[name]

    async def check_single(self, name: str) -> Optional[HealthCheckResult]:
        """Run a single health check by name."""
        check_func = self._checks.get(name)
        if not check_func:
            return None

        try:
            start_time = asyncio.get_event_loop().time()
            result = await asyncio.wait_for(check_func(), timeout=5.0)
            result.latency_ms = (asyncio.get_event_loop().time() - start_time) * 1000
            return result
        except asyncio.TimeoutError:
            return HealthCheckResult(
                name=name,
                status=HealthStatus.UNHEALTHY,
                message="Health check timed out",
            )
        except Exception as e:
            logger.error("health_check_failed", check_name=name, error=str(e))
            return HealthCheckResult(
                name=name,
                status=HealthStatus.UNHEALTHY,
                message=f"Check failed: {str(e)}",
            )

    async def check_all(self) -> OverallHealthStatus:
        """
        Run all registered health checks.

        Returns:
            OverallHealthStatus with individual check results
        """
        if not self._checks:
            return OverallHealthStatus(
                status=HealthStatus.HEALTHY,
                timestamp=datetime.now(timezone.utc).isoformat(),
                checks=[],
                version=self._version,
            )

        # Run all checks concurrently
        results = await asyncio.gather(
            *[self.check_single(name) for name in self._checks.keys()],
            return_exceptions=True,
        )

        # Process results
        check_results = []
        for i, result in enumerate(results):
            name = list(self._checks.keys())[i]
            if isinstance(result, Exception):
                check_results.append(
                    HealthCheckResult(
                        name=name,
                        status=HealthStatus.UNHEALTHY,
                        message=str(result),
                    )
                )
            elif result:
                check_results.append(result)

        # Determine overall status
        if any(r.status == HealthStatus.UNHEALTHY for r in check_results):
            overall_status = HealthStatus.UNHEALTHY
        elif any(r.status == HealthStatus.DEGRADED for r in check_results):
            overall_status = HealthStatus.DEGRADED
        else:
            overall_status = HealthStatus.HEALTHY

        return OverallHealthStatus(
            status=overall_status,
            timestamp=datetime.now(timezone.utc).isoformat(),
            checks=check_results,
            version=self._version,
        )

    async def is_live(self) -> bool:
        """
        Simple liveness check.

        Returns True if the service is running (doesn't check dependencies).
        """
        return True

    async def is_ready(self) -> bool:
        """
        Readiness check.

        Returns True if the service can handle requests
        (all critical dependencies are healthy).
        """
        status = await self.check_all()
        return status.status in (HealthStatus.HEALTHY, HealthStatus.DEGRADED)


# =============================================================================
# Default Health Checks
# =============================================================================


async def check_database() -> HealthCheckResult:
    """Check database connectivity."""
    try:
        from src.database import get_pool

        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")

        return HealthCheckResult(
            name="database",
            status=HealthStatus.HEALTHY,
            message="Database connection successful",
        )
    except Exception as e:
        return HealthCheckResult(
            name="database",
            status=HealthStatus.UNHEALTHY,
            message=f"Database connection failed: {str(e)}",
        )


async def check_redis() -> HealthCheckResult:
    """Check Redis connectivity."""
    try:
        from src.cache.redis_client import redis_client

        if redis_client:
            await redis_client.ping()
            return HealthCheckResult(
                name="redis",
                status=HealthStatus.HEALTHY,
                message="Redis connection successful",
            )
        else:
            return HealthCheckResult(
                name="redis",
                status=HealthStatus.DEGRADED,
                message="Redis client not initialized",
            )
    except Exception as e:
        return HealthCheckResult(
            name="redis",
            status=HealthStatus.DEGRADED,
            message=f"Redis connection failed: {str(e)}",
            details={"fallback": "In-memory cache active"},
        )


# =============================================================================
# Module-level convenience functions
# =============================================================================

_health_checker: Optional[HealthChecker] = None


def get_health_checker() -> HealthChecker:
    """Get the global health checker instance."""
    global _health_checker
    if _health_checker is None:
        _health_checker = HealthChecker()
        # Register default checks
        _health_checker.register("database", check_database)
        _health_checker.register("redis", check_redis)
    return _health_checker


def register_health_check(name: str, check_func: HealthCheckFunc) -> None:
    """Register a health check function."""
    get_health_checker().register(name, check_func)


async def get_health_status() -> OverallHealthStatus:
    """Get the overall health status."""
    return await get_health_checker().check_all()


# Module-level instance for direct import
health_checker = get_health_checker()
