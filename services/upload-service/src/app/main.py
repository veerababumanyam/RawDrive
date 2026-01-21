"""
Upload Service - FastAPI Application Entrypoint.

High-performance upload microservice with KEDA autoscaling for handling
50K concurrent uploads. Supports TUS protocol for resumable uploads,
chunked transfer with Redis buffering, and S3-compatible multipart uploads.
"""

import asyncio
import logging
import time
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware

# Core configuration - implemented in T004
from app.core.config import settings

# API routes - implemented in T013
from app.api.v1 import router as v1_router

# Database and Redis
from app.core.database import (
    init_database,
    close_database,
    database_healthcheck,
)
from app.core.redis import (
    init_redis,
    close_redis,
    redis_healthcheck,
)

# Observability
from app.observability.logging import configure_logging
from app.observability.metrics import (
    get_metrics_output,
    get_metrics_content_type,
    init_metrics,
    get_concurrent_uploads,
)

# Middleware
from app.middleware.auth import AuthMiddleware
from app.middleware.rate_limit import RateLimitMiddleware

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Initialize shared resources on startup and cleanup on shutdown.

    Startup:
    - Initialize PostgreSQL connection pool
    - Initialize Redis connection for chunk buffering
    - Configure structured logging
    - Initialize metrics

    Shutdown:
    - Drain in-progress uploads gracefully
    - Close Redis connections
    - Close database connections
    - Flush metrics
    """
    # Configure logging
    configure_logging(
        level=settings.LOG_LEVEL,
        json_output=(str(settings.APP_ENV.value) != "development"),
    )

    # Initialize metrics
    init_metrics(settings.SERVICE_VERSION)

    # Initialize database pool
    await init_database(
        database_url=settings.DATABASE_URL,
        pool_min_size=settings.DB_POOL_MIN_SIZE,
        pool_max_size=settings.DB_POOL_MAX_SIZE,
    )

    # Initialize Redis for chunk buffering
    # Auto-loads config from settings (REDIS_URL, REDIS_MAX_CONNECTIONS, etc.)
    await init_redis()

    # Register service in A2A registry (Phase 4: A2A Integration)
    # This is optional - service will work without it
    registry = None
    service_id = None
    heartbeat_task = None
    try:
        import os
        import uuid
        import sys
        sys.path.insert(0, '/app/backend/src')
        from app.services.service_registry import (
            get_service_registry,
            ServiceRegistration,
            ServiceCapability,
        )

        registry = get_service_registry()
        service_id = os.getenv("SERVICE_ID", str(uuid.uuid4()))
        registration = ServiceRegistration(
            service_name="upload-service",
            service_id=service_id,
            base_url=os.getenv("SERVICE_BASE_URL", "http://upload-service:8008"),
            capabilities=[
                ServiceCapability(name="upload:create", version="1.0", endpoint="/api/v1/uploads"),
                ServiceCapability(name="upload:resume", version="1.0", endpoint="/api/v1/uploads/{upload_id}"),
                ServiceCapability(name="upload:complete", version="1.0", endpoint="/api/v1/uploads/{upload_id}/complete"),
                ServiceCapability(name="upload:tus", version="1.0", endpoint="/api/v1/uploads"),
            ],
            health_check_endpoint="/health",
        )

        await registry.register(registration)
        logger.info(f"Upload service registered in A2A registry: {service_id}")

        # Start heartbeat loop
        async def heartbeat_loop():
            """Send heartbeat every 15 seconds."""
            while True:
                try:
                    await asyncio.sleep(15)
                    await registry.heartbeat("upload-service", service_id)
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error(f"Heartbeat failed: {e}")

        heartbeat_task = asyncio.create_task(heartbeat_loop())
    except (ImportError, ModuleNotFoundError) as e:
        logger.warning(f"A2A service registry not available - skipping registration: {e}")

    logger.info(
        "Upload service started",
        extra={
            "service": settings.SERVICE_NAME,
            "version": settings.SERVICE_VERSION,
            "environment": settings.APP_ENV.value,
        }
    )

    try:
        yield
    finally:
        # Unregister from A2A registry (if registered)
        if heartbeat_task is not None:
            heartbeat_task.cancel()
            try:
                await heartbeat_task
            except asyncio.CancelledError:
                pass
        if registry is not None and service_id is not None:
            try:
                await registry.unregister("upload-service", service_id)
                logger.info("Upload service unregistered from A2A registry")
            except Exception as e:
                logger.warning(f"Failed to unregister from A2A registry: {e}")
        # Shutdown - drain in-progress uploads gracefully
        await drain_in_progress_uploads()

        # Close Redis
        await close_redis()

        # Close database pool
        await close_database()

        logger.info("Upload service shutdown complete")


async def drain_in_progress_uploads():
    """Wait for in-progress uploads to complete before shutdown."""
    timeout = getattr(settings, 'DRAIN_TIMEOUT_SECONDS', 30)
    start = time.time()

    while time.time() - start < timeout:
        concurrent = get_concurrent_uploads()
        if concurrent == 0:
            logger.info("All uploads drained successfully")
            return

        logger.info(
            f"Waiting for {concurrent} uploads to complete...",
            extra={"concurrent_uploads": concurrent}
        )
        await asyncio.sleep(5)

    logger.warning(
        f"Drain timeout ({timeout}s) reached",
        extra={"timeout": timeout}
    )


app = FastAPI(
    title="RawDrive Upload Service",
    description=(
        "High-performance upload microservice for RawDrive. "
        "Handles chunked uploads with TUS protocol support, "
        "client-side encryption, and KEDA-based autoscaling."
    ),
    version=settings.SERVICE_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# CORS middleware - allows frontend to communicate with upload service
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    allow_headers=[
        "*",
        # TUS protocol headers
        "Tus-Resumable",
        "Tus-Version",
        "Tus-Extension",
        "Tus-Max-Size",
        "Upload-Offset",
        "Upload-Length",
        "Upload-Metadata",
        "Upload-Defer-Length",
        "Upload-Checksum",
        "Upload-Concat",
    ],
    expose_headers=[
        "X-Correlation-ID",
        "X-Request-ID",
        # TUS protocol response headers
        "Tus-Resumable",
        "Tus-Version",
        "Tus-Extension",
        "Tus-Max-Size",
        "Upload-Offset",
        "Upload-Length",
        "Upload-Metadata",
        "Location",
    ],
)

# Add auth middleware
app.add_middleware(AuthMiddleware)

# Add rate limiting middleware
app.add_middleware(RateLimitMiddleware)

# Include API v1 routes (T013)
app.include_router(v1_router, prefix="/api")


@app.get("/health", tags=["health"])
async def health_check() -> dict[str, str]:
    """
    Lightweight liveness probe for Kubernetes.

    Returns 200 if the service is running, regardless of
    downstream dependency status.
    """
    return {"status": "ok", "service": settings.SERVICE_NAME}


@app.get("/ready", tags=["health"])
async def readiness_check() -> dict[str, Any]:
    """
    Readiness probe that validates all dependencies are available.

    Checks:
    - PostgreSQL connection pool
    - Redis connection for chunk buffering
    - R2 storage connectivity (optional)

    Returns 503 if any critical dependency is unavailable.
    """
    checks = {
        "postgres": await database_healthcheck(),
        "redis": await redis_healthcheck(),
    }

    # Optional checks for R2 storage
    if settings.R2_ENDPOINT:
        try:
            from app.services.r2_storage_service import r2_healthcheck
            checks["r2"] = await r2_healthcheck()
        except Exception as e:
            logger.warning(f"R2 health check failed: {e}")
            checks["r2"] = False

    all_ok = all([checks["postgres"], checks["redis"]])

    if not all_ok:
        raise HTTPException(
            status_code=503,
            detail={
                "status": "unavailable",
                "checks": checks
            }
        )

    return {
        "status": "ready",
        "service": settings.SERVICE_NAME,
        "version": settings.SERVICE_VERSION,
        "checks": checks,
    }


@app.get("/metrics", include_in_schema=False)
async def metrics() -> Response:
    """
    Expose Prometheus metrics for KEDA autoscaling and monitoring.

    Key metrics exposed:
    - upload_concurrent_total: Current concurrent uploads (KEDA trigger)
    - upload_chunk_bytes_total: Total bytes uploaded
    - upload_session_duration_seconds: Upload session duration histogram
    - upload_errors_total: Upload error counter by type
    """
    return Response(
        content=get_metrics_output(),
        media_type=get_metrics_content_type()
    )


@app.options("/{path:path}")
async def options_handler(path: str) -> Response:
    """
    Handle OPTIONS requests for CORS preflight.

    TUS protocol requires proper OPTIONS handling for
    resumable upload capability discovery.
    """
    return Response(
        status_code=204,
        headers={
            "Tus-Resumable": settings.TUS_RESUMABLE_VERSION,
            "Tus-Version": settings.TUS_RESUMABLE_VERSION,
            "Tus-Extension": settings.TUS_EXTENSIONS,
            "Tus-Max-Size": str(settings.TUS_MAX_SIZE),
            "Tus-Checksum-Algorithm": "sha256",
        }
    )


# Root endpoint for service discovery
@app.get("/", include_in_schema=False)
async def root() -> dict[str, str]:
    """Service information endpoint."""
    return {
        "service": settings.SERVICE_NAME,
        "version": settings.SERVICE_VERSION,
        "docs": "/docs",
        "health": "/health",
        "ready": "/ready",
        "metrics": "/metrics",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.is_development,
        log_level=settings.LOG_LEVEL.lower(),
    )
