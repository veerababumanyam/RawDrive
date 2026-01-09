"""
Health check implementation for the Webhooks Service.
"""

import logging
from dataclasses import dataclass, field
from typing import Dict, Optional
from datetime import datetime

from src.cache.redis_client import redis_client
from src.database import get_pool

logger = logging.getLogger(__name__)


@dataclass
class HealthCheckResult:
    """Result of a health check."""
    name: str
    status: str  # "healthy", "degraded", "unhealthy"
    message: Optional[str] = None
    latency_ms: Optional[float] = None
    checked_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "status": self.status,
            "message": self.message,
            "latency_ms": self.latency_ms,
            "checked_at": self.checked_at.isoformat(),
        }


@dataclass
class OverallHealthResult:
    """Overall health status."""
    status: str
    checks: Dict[str, HealthCheckResult]

    def to_dict(self) -> dict:
        return {
            "status": self.status,
            "checks": {name: check.to_dict() for name, check in self.checks.items()},
        }


class HealthChecker:
    """Health check manager."""

    async def check_redis(self) -> HealthCheckResult:
        """Check Redis connectivity."""
        import time
        start = time.monotonic()
        try:
            is_healthy = await redis_client.ping()
            latency = (time.monotonic() - start) * 1000
            return HealthCheckResult(
                name="redis",
                status="healthy" if is_healthy else "unhealthy",
                latency_ms=latency,
            )
        except Exception as e:
            latency = (time.monotonic() - start) * 1000
            return HealthCheckResult(
                name="redis",
                status="unhealthy",
                message=str(e),
                latency_ms=latency,
            )

    async def check_database(self) -> HealthCheckResult:
        """Check database connectivity."""
        import time
        start = time.monotonic()
        try:
            pool = await get_pool()
            async with pool.acquire() as conn:
                await conn.fetchval("SELECT 1")
            latency = (time.monotonic() - start) * 1000
            return HealthCheckResult(
                name="database",
                status="healthy",
                latency_ms=latency,
            )
        except Exception as e:
            latency = (time.monotonic() - start) * 1000
            return HealthCheckResult(
                name="database",
                status="unhealthy",
                message=str(e),
                latency_ms=latency,
            )

    async def check_all(self) -> OverallHealthResult:
        """Run all health checks."""
        redis_check = await self.check_redis()
        db_check = await self.check_database()

        checks = {
            "redis": redis_check,
            "database": db_check,
        }

        # Determine overall status
        statuses = [c.status for c in checks.values()]
        if all(s == "healthy" for s in statuses):
            overall = "healthy"
        elif any(s == "unhealthy" for s in statuses):
            overall = "unhealthy"
        else:
            overall = "degraded"

        return OverallHealthResult(status=overall, checks=checks)

    async def is_ready(self) -> bool:
        """Check if service is ready to accept requests."""
        result = await self.check_all()
        return result.status in ["healthy", "degraded"]

    async def is_live(self) -> bool:
        """Check if service process is alive."""
        # Basic liveness - just return True if we can execute
        return True


# Global singleton
health_checker = HealthChecker()
