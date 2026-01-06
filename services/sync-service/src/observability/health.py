"""
Health check module for Sync Service.

Provides health and readiness checks for Kubernetes probes.
Placeholder - full implementation in T011.
"""

from dataclasses import dataclass, field
from typing import Dict, Any

from src.logging import get_logger

logger = get_logger(__name__)


@dataclass
class HealthCheckResult:
    """Result of a health check."""

    name: str
    healthy: bool
    message: str = ""
    details: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "name": self.name,
            "healthy": self.healthy,
            "message": self.message,
            "details": self.details,
        }


@dataclass
class HealthCheckAggregateResult:
    """Aggregated result of all health checks."""

    checks: list[HealthCheckResult] = field(default_factory=list)

    @property
    def is_healthy(self) -> bool:
        """Check if all health checks passed."""
        return all(check.healthy for check in self.checks)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "status": "healthy" if self.is_healthy else "unhealthy",
            "checks": {check.name: check.to_dict() for check in self.checks},
        }


class HealthChecker:
    """
    Health checker for Sync Service.

    Performs health checks on:
    - Database connectivity
    - Redis connectivity
    - Service liveness
    """

    def __init__(self):
        self._is_live = True

    async def is_live(self) -> bool:
        """Check if the service is alive."""
        return self._is_live

    async def is_ready(self) -> bool:
        """Check if the service is ready to handle requests."""
        result = await self.check_all()
        return result.is_healthy

    async def check_database(self) -> HealthCheckResult:
        """Check database connectivity."""
        try:
            from src.database import get_pool

            pool = await get_pool()
            async with pool.acquire() as conn:
                await conn.fetchval("SELECT 1")

            return HealthCheckResult(
                name="database",
                healthy=True,
                message="Connected",
            )
        except Exception as e:
            logger.warning(f"Database health check failed: {e}")
            return HealthCheckResult(
                name="database",
                healthy=False,
                message=str(e),
            )

    async def check_redis(self) -> HealthCheckResult:
        """Check Redis connectivity."""
        try:
            from src.cache.redis_client import redis_client

            is_connected = await redis_client.ping()

            return HealthCheckResult(
                name="redis",
                healthy=is_connected,
                message="Connected" if is_connected else "Not connected",
            )
        except Exception as e:
            logger.warning(f"Redis health check failed: {e}")
            return HealthCheckResult(
                name="redis",
                healthy=False,
                message=str(e),
            )

    async def check_all(self) -> HealthCheckAggregateResult:
        """Run all health checks."""
        checks = [
            await self.check_database(),
            await self.check_redis(),
        ]
        return HealthCheckAggregateResult(checks=checks)


# Global health checker instance
health_checker = HealthChecker()
