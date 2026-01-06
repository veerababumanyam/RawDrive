"""Health check endpoints for Kubernetes probes."""

from typing import Dict, Any
from datetime import datetime

from src.database import get_pool
from src.cache.redis_client import redis_client
from src.logging import get_logger

logger = get_logger(__name__)


class HealthChecker:
    """Health check manager for the service."""

    def __init__(self):
        self._start_time = datetime.utcnow()

    async def is_live(self) -> bool:
        """Check if the service is alive (liveness probe)."""
        # Simple check - just return True if process is running
        return True

    async def is_ready(self) -> bool:
        """Check if the service is ready (readiness probe)."""
        try:
            # Check database connection
            pool = await get_pool()
            async with pool.acquire() as conn:
                await conn.fetchval("SELECT 1")

            # Check Redis connection
            await redis_client.ping()

            return True
        except Exception as e:
            logger.error("Readiness check failed", extra={"error": str(e)})
            return False

    async def check_all(self) -> Dict[str, Any]:
        """Perform comprehensive health check."""
        checks = {
            "service": "onboarding-service",
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "uptime_seconds": (datetime.utcnow() - self._start_time).total_seconds(),
            "checks": {},
        }

        # Check database
        try:
            pool = await get_pool()
            async with pool.acquire() as conn:
                await conn.fetchval("SELECT 1")
            checks["checks"]["database"] = {"status": "healthy"}
        except Exception as e:
            checks["checks"]["database"] = {"status": "unhealthy", "error": str(e)}
            checks["status"] = "unhealthy"

        # Check Redis
        try:
            await redis_client.ping()
            checks["checks"]["redis"] = {"status": "healthy"}
        except Exception as e:
            checks["checks"]["redis"] = {"status": "unhealthy", "error": str(e)}
            checks["status"] = "degraded"  # Redis is not critical

        return checks

    def to_dict(self) -> Dict[str, Any]:
        """Convert health status to dictionary."""
        return {
            "service": "onboarding-service",
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
        }


# Global instance
health_checker = HealthChecker()
