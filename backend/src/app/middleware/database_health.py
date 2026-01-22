"""Database connection health check middleware.

Ensures database connections are healthy before processing requests.
Automatically retries connection pool initialization if needed.
"""

import logging
from typing import Callable
from fastapi import FastAPI, Request, Response, status
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)


class DatabaseHealthMiddleware(BaseHTTPMiddleware):
    """Middleware to verify database connectivity before processing requests."""

    def __init__(self, app: FastAPI, db_getter: Callable):
        super().__init__(app)
        self.db_getter = db_getter
        self.max_retries = 3
        self.is_healthy = False

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Check database health before processing request."""

        # Skip health check endpoints
        if request.url.path in ["/health", "/health/live", "/health/ready", "/metrics"]:
            return await call_next(request)

        # Verify database health
        if not self.is_healthy:
            for attempt in range(self.max_retries):
                try:
                    pool = await self.db_getter()
                    # Test connection
                    async with pool.acquire() as conn:
                        await conn.execute("SELECT 1")
                    self.is_healthy = True
                    logger.info("Database connection verified")
                    break
                except Exception as e:
                    logger.warning(f"Database health check failed (attempt {attempt + 1}): {e}")
                    if attempt == self.max_retries - 1:
                        return Response(
                            content={"error": "Database unavailable"},
                            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        )
                    await asyncio.sleep(1)

        try:
            response = await call_next(request)
            return response
        except Exception as e:
            logger.error(f"Request processing failed: {e}")
            self.is_healthy = False
            raise


def setup_database_health_middleware(app: FastAPI, db_getter: Callable) -> None:
    """Setup database health check middleware."""
    app.add_middleware(DatabaseHealthMiddleware, db_getter=db_getter)
    logger.info("Database health check middleware installed")
