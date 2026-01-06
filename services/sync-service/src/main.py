"""
Sync Service - Real-time Live Camera Sync Microservice.

A high-performance microservice for managing real-time folder-to-gallery
synchronization with KEDA autoscaling. Handles file event processing,
duplicate detection, and upload orchestration.

Features:
- Sync mapping CRUD operations (folder-to-gallery mappings)
- Sync session management with real-time status
- File event processing and batching
- Duplicate detection via SHA256 hashing
- WebSocket-based real-time sync status updates
- Redis pub/sub for cross-instance event distribution
- Prometheus metrics for KEDA autoscaling
- Integration with upload-service for TUS uploads

Rate Limits:
- Status updates: 50/minute per session
- File events: 200/minute per session
- WebSocket messages: 10/second per connection
"""

from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings
from src.api.v1 import router as api_v1_router
from src.middleware.rate_limiter import RateLimiterMiddleware
from src.middleware.correlation import CorrelationMiddleware
from src.cache.redis_client import redis_client
from src.database import get_pool, close_pool
from src.logging import configure_logging, get_logger
from src.observability.health import health_checker
from src.observability.metrics import (
    generate_latest_metrics,
    init_metrics,
    get_active_sync_sessions,
)

# Configure structured logging with PII filtering
configure_logging(
    log_level=settings.LOG_LEVEL,
    json_format=not settings.DEBUG,
    service_name=settings.SERVICE_NAME,
)
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manage application lifecycle.

    Startup:
    - Initialize Redis connection for caching and pub/sub
    - Initialize PostgreSQL connection pool
    - Initialize Prometheus metrics
    - Start background tasks (session cleanup, etc.)

    Shutdown:
    - Gracefully drain active sync sessions
    - Close Redis connections
    - Close database connections
    - Flush metrics
    """
    # Startup
    logger.info(
        "Starting Sync Service...",
        extra={"version": settings.SERVICE_VERSION}
    )

    # Initialize metrics
    init_metrics(settings.SERVICE_VERSION)

    # Connect to Redis
    await redis_client.connect()

    # Initialize database pool
    await get_pool()

    logger.info(
        "Sync Service started successfully",
        extra={
            "service": settings.SERVICE_NAME,
            "version": settings.SERVICE_VERSION,
            "environment": "development" if settings.DEBUG else "production",
        }
    )

    yield

    # Shutdown
    logger.info("Shutting down Sync Service...")

    # Drain active sync sessions gracefully
    await drain_active_sessions()

    # Disconnect from Redis
    await redis_client.disconnect()

    # Close database pool
    await close_pool()

    logger.info("Sync Service shutdown complete")


async def drain_active_sessions():
    """
    Wait for active sync sessions to complete before shutdown.

    Notifies connected clients of impending shutdown and waits
    for graceful session termination.
    """
    timeout = settings.DRAIN_TIMEOUT_SECONDS
    import asyncio
    import time

    start = time.time()

    while time.time() - start < timeout:
        active_sessions = get_active_sync_sessions()
        if active_sessions == 0:
            logger.info("All sync sessions drained successfully")
            return

        logger.info(
            f"Waiting for {active_sessions} sync sessions to complete...",
            extra={"active_sessions": active_sessions}
        )
        await asyncio.sleep(5)

    logger.warning(
        f"Drain timeout ({timeout}s) reached",
        extra={"timeout": timeout}
    )


app = FastAPI(
    title="RawDrive Sync Service",
    description="""
High-performance microservice for Live Camera Sync.

## Features

- **Sync Mappings**: Create and manage folder-to-gallery sync mappings
- **Sync Sessions**: Real-time sync session management with status tracking
- **File Events**: Process file detection events from browser File System Access API
- **Duplicate Detection**: SHA256-based duplicate detection to prevent re-uploads
- **Real-time Updates**: WebSocket-based live sync status updates
- **KEDA Autoscaling**: Scales based on active sync sessions and upload queue depth

## Rate Limits

- Status Updates: 50/minute per session
- File Events: 200/minute per session
- WebSocket Messages: 10/second per connection

## Authentication

All endpoints require JWT Bearer token authentication.
Workspace membership is validated for all operations.

## WebSocket Protocol

Connect to `/api/v1/sync/ws` with JWT token for real-time sync updates.
Supports the `sync-v1` subprotocol.
    """,
    version=settings.SERVICE_VERSION,
    lifespan=lifespan,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    openapi_url="/openapi.json" if settings.DEBUG else None,
)

# =============================================================================
# Middleware Configuration
# =============================================================================

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "*",
        "Authorization",
        "X-Correlation-ID",
        "X-Request-ID",
    ],
    expose_headers=[
        "X-Correlation-ID",
        "X-Request-ID",
        "X-RateLimit-Limit",
        "X-RateLimit-Remaining",
        "X-RateLimit-Reset",
    ],
)

# Correlation ID tracking (must be before other middleware to capture all requests)
app.add_middleware(CorrelationMiddleware)

# Rate limiting
app.add_middleware(RateLimiterMiddleware)

# =============================================================================
# API Routes
# =============================================================================

# Include API v1 routes
app.include_router(api_v1_router, prefix="/api/v1")


# =============================================================================
# Health Check Endpoints
# =============================================================================


@app.get("/health", tags=["health"])
async def health_check() -> dict[str, str]:
    """
    Lightweight liveness probe for Kubernetes.

    Returns 200 if the service is running, regardless of
    downstream dependency status.
    """
    return {
        "status": "healthy",
        "service": settings.SERVICE_NAME,
        "version": settings.SERVICE_VERSION,
    }


@app.get("/ready", tags=["health"])
async def readiness_check() -> dict[str, Any]:
    """
    Readiness probe that validates all dependencies are available.

    Checks:
    - PostgreSQL connection pool
    - Redis connection for caching and pub/sub

    Returns 503 if any critical dependency is unavailable.
    """
    redis_ok = await redis_client.ping()

    # Check database
    db_ok = False
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
            db_ok = True
    except Exception as e:
        logger.warning(f"Database health check failed: {e}")

    status = "ready" if (redis_ok and db_ok) else "degraded"

    return {
        "status": status,
        "service": settings.SERVICE_NAME,
        "version": settings.SERVICE_VERSION,
        "checks": {
            "redis": "connected" if redis_ok else "disconnected",
            "database": "connected" if db_ok else "disconnected",
        },
    }


@app.get("/health/live", tags=["health"])
async def liveness_probe() -> dict[str, str]:
    """
    Kubernetes liveness probe.

    Returns 200 if the service process is running.
    This should NOT check external dependencies.
    """
    is_live = await health_checker.is_live()
    return {
        "status": "alive" if is_live else "dead",
        "service": settings.SERVICE_NAME,
    }


@app.get("/health/ready", tags=["health"])
async def readiness_probe(response: Response) -> dict[str, Any]:
    """
    Kubernetes readiness probe.

    Returns 200 if the service can handle requests.
    Checks database and Redis connectivity.
    """
    result = await health_checker.check_all()
    is_ready = await health_checker.is_ready()

    if not is_ready:
        response.status_code = 503

    return result.to_dict()


# =============================================================================
# Prometheus Metrics Endpoint (KEDA Trigger)
# =============================================================================


@app.get("/metrics", tags=["observability"], include_in_schema=False)
async def prometheus_metrics() -> Response:
    """
    Prometheus-compatible metrics endpoint.

    Returns metrics in Prometheus text format.
    Used by KEDA for autoscaling decisions.

    Key metrics:
    - sync_active_sessions: Number of active sync sessions (KEDA trigger)
    - sync_upload_queue_depth: Files waiting to be uploaded
    - sync_files_processed_total: Total files processed
    - sync_bytes_uploaded_total: Total bytes uploaded
    - sync_websocket_connections: Active WebSocket connections
    - sync_errors_total: Error counter by type
    """
    metrics_output = generate_latest_metrics()
    return Response(
        content=metrics_output,
        media_type="text/plain; charset=utf-8",
    )


# =============================================================================
# Root Endpoint
# =============================================================================


@app.get("/", include_in_schema=False)
async def root() -> dict[str, str]:
    """Service information endpoint."""
    return {
        "service": settings.SERVICE_NAME,
        "version": settings.SERVICE_VERSION,
        "description": "RawDrive Live Camera Sync Service",
        "docs": "/docs" if settings.DEBUG else "disabled",
        "health": "/health",
        "ready": "/ready",
        "metrics": "/metrics",
    }


# =============================================================================
# Main Entry Point
# =============================================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower(),
        ws_ping_interval=settings.WS_HEARTBEAT_INTERVAL,
        ws_ping_timeout=settings.WS_HEARTBEAT_TIMEOUT,
    )
