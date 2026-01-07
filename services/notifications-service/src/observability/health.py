"""
Health Check Module for the Notifications & Communication Microservice.

Provides Kubernetes-compatible health check endpoints:
- /health/live - Liveness probe (is the service running?)
- /health/ready - Readiness probe (can the service handle requests?)

Checks:
- Database connectivity (primary + read replica)
- Redis connectivity + circuit breaker state
- SendGrid API availability (non-blocking)
"""

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Awaitable, Callable, Dict, List, Optional

import logging

logger = logging.getLogger(__name__)


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
            "service": "notifications-service",
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

    Registers and runs health checks for various dependencies.
    """

    def __init__(self, version: str = "1.0.0"):
        self._checks: Dict[str, HealthCheckFunc] = {}
        self._version = version

    def register(self, name: str, check_func: HealthCheckFunc) -> None:
        """Register a health check function."""
        self._checks[name] = check_func
        logger.info(f"Health check registered: {name}")

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
            logger.error(f"Health check failed: {name}", extra={"error": str(e)})
            return HealthCheckResult(
                name=name,
                status=HealthStatus.UNHEALTHY,
                message=f"Check failed: {str(e)}",
            )

    async def check_all(self) -> OverallHealthStatus:
        """Run all registered health checks."""
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
        """Simple liveness check - returns True if the service is running."""
        return True

    async def is_ready(self) -> bool:
        """Readiness check - returns True if the service can handle requests."""
        status = await self.check_all()
        return status.status in (HealthStatus.HEALTHY, HealthStatus.DEGRADED)


# =============================================================================
# Default Health Checks
# =============================================================================


async def check_database() -> HealthCheckResult:
    """Check primary database connectivity."""
    try:
        from src.database import get_pool

        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")

        return HealthCheckResult(
            name="database",
            status=HealthStatus.HEALTHY,
            message="Primary database connection successful",
            details={"pool_size": pool.get_size()},
        )
    except Exception as e:
        return HealthCheckResult(
            name="database",
            status=HealthStatus.UNHEALTHY,
            message=f"Database connection failed: {str(e)}",
        )


async def check_read_replica() -> HealthCheckResult:
    """Check read replica database connectivity."""
    try:
        from src.database import get_read_pool
        from src.config import settings

        if not settings.DATABASE_READ_REPLICA_URL:
            return HealthCheckResult(
                name="read_replica",
                status=HealthStatus.HEALTHY,
                message="No read replica configured (using primary)",
            )

        pool = await get_read_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")

        return HealthCheckResult(
            name="read_replica",
            status=HealthStatus.HEALTHY,
            message="Read replica connection successful",
            details={"pool_size": pool.get_size()},
        )
    except Exception as e:
        return HealthCheckResult(
            name="read_replica",
            status=HealthStatus.DEGRADED,
            message=f"Read replica connection failed: {str(e)}",
            details={"fallback": "Using primary database"},
        )


async def check_redis() -> HealthCheckResult:
    """Check Redis connectivity and circuit breaker state."""
    try:
        from src.cache.redis_client import redis_client

        if await redis_client.ping():
            circuit_state = redis_client.get_circuit_state()
            return HealthCheckResult(
                name="redis",
                status=HealthStatus.HEALTHY,
                message="Redis connection successful",
                details={"circuit_breaker": circuit_state},
            )
        else:
            circuit_state = redis_client.get_circuit_state()
            return HealthCheckResult(
                name="redis",
                status=HealthStatus.DEGRADED,
                message="Redis ping failed (circuit breaker may be open)",
                details={"circuit_breaker": circuit_state},
            )
    except Exception as e:
        return HealthCheckResult(
            name="redis",
            status=HealthStatus.DEGRADED,
            message=f"Redis connection failed: {str(e)}",
            details={"fallback": "Operating without cache"},
        )


async def check_sendgrid() -> HealthCheckResult:
    """
    Check SendGrid API availability.

    This is a lightweight check - we don't actually send an email,
    just verify the API key is configured. Full connectivity check
    would require an actual API call which isn't necessary for health.
    """
    try:
        from src.config import settings

        if not settings.SENDGRID_API_KEY:
            return HealthCheckResult(
                name="sendgrid",
                status=HealthStatus.DEGRADED,
                message="SendGrid API key not configured",
                details={"email_enabled": False},
            )

        # API key is configured - assume service is available
        # A full check would use the SendGrid API to verify
        return HealthCheckResult(
            name="sendgrid",
            status=HealthStatus.HEALTHY,
            message="SendGrid API key configured",
            details={
                "email_enabled": True,
                "from_email": settings.SENDGRID_FROM_EMAIL,
            },
        )
    except Exception as e:
        return HealthCheckResult(
            name="sendgrid",
            status=HealthStatus.DEGRADED,
            message=f"SendGrid check failed: {str(e)}",
            details={"email_enabled": False},
        )


async def check_notification_queue() -> HealthCheckResult:
    """Check notification queue status in Redis."""
    try:
        from src.cache.redis_client import redis_client, build_pending_queue_key, build_dead_letter_queue_key

        # Check if Redis is available for queue operations
        if not await redis_client.ping():
            return HealthCheckResult(
                name="notification_queue",
                status=HealthStatus.DEGRADED,
                message="Queue unavailable (Redis not connected)",
                details={"queue_operational": False},
            )

        # Get queue lengths
        pending_len = await redis_client.llen(build_pending_queue_key())
        dlq_len = await redis_client.llen(build_dead_letter_queue_key())

        # Determine status based on dead letter queue size
        # High DLQ count indicates delivery problems
        if dlq_len > 100:
            status = HealthStatus.DEGRADED
            message = f"High dead letter queue count: {dlq_len}"
        else:
            status = HealthStatus.HEALTHY
            message = "Notification queue operational"

        return HealthCheckResult(
            name="notification_queue",
            status=status,
            message=message,
            details={
                "queue_operational": True,
                "pending_count": pending_len,
                "dead_letter_count": dlq_len,
            },
        )
    except Exception as e:
        return HealthCheckResult(
            name="notification_queue",
            status=HealthStatus.DEGRADED,
            message=f"Queue check failed: {str(e)}",
            details={"queue_operational": False},
        )


# =============================================================================
# Module-level convenience functions
# =============================================================================

_health_checker: Optional[HealthChecker] = None


def get_health_checker() -> HealthChecker:
    """Get the global health checker instance."""
    global _health_checker
    if _health_checker is None:
        from src.config import settings

        _health_checker = HealthChecker(version=settings.SERVICE_VERSION)
        # Register default checks
        _health_checker.register("database", check_database)
        _health_checker.register("read_replica", check_read_replica)
        _health_checker.register("redis", check_redis)
        _health_checker.register("sendgrid", check_sendgrid)
        _health_checker.register("notification_queue", check_notification_queue)
    return _health_checker


def register_health_check(name: str, check_func: HealthCheckFunc) -> None:
    """Register a health check function."""
    get_health_checker().register(name, check_func)


def unregister_health_check(name: str) -> None:
    """Unregister a health check function."""
    get_health_checker().unregister(name)


async def get_health_status() -> OverallHealthStatus:
    """Get the overall health status."""
    return await get_health_checker().check_all()


async def is_service_live() -> bool:
    """Check if service is alive (for liveness probe)."""
    return await get_health_checker().is_live()


async def is_service_ready() -> bool:
    """Check if service is ready (for readiness probe)."""
    return await get_health_checker().is_ready()


# Module-level instance for direct import
health_checker = get_health_checker()
