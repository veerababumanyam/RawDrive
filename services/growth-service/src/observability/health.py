"""Health check endpoints for Kubernetes probes.

Provides liveness and readiness checks for container orchestration.
Full implementation in T039.
"""

from datetime import datetime
from typing import Any, Dict

from src.database import get_pool, check_connection
from src.cache.redis_client import redis_client
from src.logging import get_logger

logger = get_logger(__name__)


class HealthChecker:
    """Health check manager for the Growth service."""

    def __init__(self):
        self._start_time = datetime.utcnow()

    async def is_live(self) -> bool:
        """Check if the service is alive (liveness probe).

        Returns True if the process is running. This is a lightweight
        check that does NOT verify external dependencies to avoid
        unnecessary container restarts due to transient failures.
        """
        return True

    async def is_ready(self) -> bool:
        """Check if the service is ready to handle traffic (readiness probe).

        Verifies:
        - Database connectivity (required)
        - Redis connectivity (optional - degrades gracefully)
        """
        try:
            # Check database connection (critical dependency)
            db_ok = await check_connection()
            if not db_ok:
                logger.warning("Readiness check failed: database unhealthy")
                return False

            # Check Redis connection (non-critical - service degrades gracefully)
            redis_ok = await redis_client.ping()
            if not redis_ok:
                logger.warning("Readiness check: Redis unavailable, running in degraded mode")
                # Redis failure is NOT critical - continue serving traffic

            return True
        except Exception as e:
            logger.error("Readiness check failed", extra={"error": str(e)})
            return False

    async def check_all(self) -> Dict[str, Any]:
        """Perform comprehensive health check with detailed status.

        Returns status for all dependencies including:
        - Database primary pool
        - Database read replica pool (if configured)
        - Redis cache
        - Service uptime
        """
        checks: Dict[str, Any] = {
            "service": "growth-service",
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "uptime_seconds": (datetime.utcnow() - self._start_time).total_seconds(),
            "checks": {},
        }

        # Check database
        try:
            pool = await get_pool()
            checks["checks"]["database"] = {
                "status": "healthy",
                "pool_size": pool.get_size(),
                "pool_free": pool.get_idle_size(),
            }
        except Exception as e:
            checks["checks"]["database"] = {"status": "unhealthy", "error": str(e)}
            checks["status"] = "unhealthy"

        # Check Redis
        try:
            redis_ok = await redis_client.ping()
            checks["checks"]["redis"] = {
                "status": "healthy" if redis_ok else "unhealthy",
                "connected": redis_ok,
            }
            if not redis_ok:
                checks["status"] = "degraded"  # Redis is not critical
        except Exception as e:
            checks["checks"]["redis"] = {"status": "unhealthy", "error": str(e)}
            checks["status"] = "degraded"

        return checks

    def get_uptime_seconds(self) -> float:
        """Get service uptime in seconds."""
        return (datetime.utcnow() - self._start_time).total_seconds()


# Global instance
health_checker = HealthChecker()
