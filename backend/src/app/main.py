"""FastAPI application entrypoint."""

import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, Response  # type: ignore
from fastapi.middleware.cors import CORSMiddleware  # type: ignore

from app.api.exceptions import register_exception_handlers  # type: ignore
from app.api.v1 import router as v1_router  # type: ignore
from app.config.settings import ensure_settings_loaded
from app.db.postgres import close_postgres_pool, init_postgres_pool, postgres_healthcheck  # type: ignore
from app.db.redis import close_redis_client, init_redis_client, redis_healthcheck  # type: ignore
from app.logging import configure_logging, get_logger  # type: ignore
from app.middleware.audit_logging import AuditLoggingMiddleware  # type: ignore
from app.middleware.correlation import CorrelationMiddleware  # type: ignore
from app.middleware.rate_limit import RateLimitMiddleware  # type: ignore
from app.middleware.request_id import RequestIdMiddleware  # type: ignore
from app.metrics.middleware import PrometheusMiddleware  # type: ignore
from app.api.versioning import VersioningMiddleware  # type: ignore
from app.services.audit_service import start_audit_worker, stop_audit_worker  # type: ignore
from app.services.scheduler import get_scheduler  # type: ignore
from app.services.task_queue import get_task_queue  # type: ignore
from app.services.oauth_service import close_http_client  # type: ignore

settings = ensure_settings_loaded()
configure_logging()
logger = get_logger("rawdrive")


@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[override]
    """Initialize shared resources on startup and close on shutdown."""

    await init_postgres_pool(settings)
    await init_redis_client(settings)
    start_audit_worker()  # Start Loki audit log worker

    # Register service in A2A registry (Phase 4: A2A Integration)
    from app.services.service_registry import (
        get_service_registry,
        ServiceRegistration,
        ServiceCapability,
    )
    import uuid

    registry = get_service_registry()
    service_id = os.getenv("SERVICE_ID", str(uuid.uuid4()))
    registration = ServiceRegistration(
        service_name="backend",
        service_id=service_id,
        base_url=os.getenv("SERVICE_BASE_URL", "http://backend:8000"),
        capabilities=[
            ServiceCapability(name="auth:login", version="1.0", endpoint="/api/v1/auth/login"),
            ServiceCapability(name="users:manage", version="1.0", endpoint="/api/v1/users"),
            ServiceCapability(name="workspaces:manage", version="1.0", endpoint="/api/v1/workspaces"),
            ServiceCapability(name="roles:manage", version="1.0", endpoint="/api/v1/roles"),
            ServiceCapability(name="clients:read", version="1.0", endpoint="/api/v1/clients"),
            ServiceCapability(name="clients:write", version="1.0", endpoint="/api/v1/clients"),
        ],
        health_check_endpoint="/health",
    )

    await registry.register(registration)
    logger.info(f"Backend service registered in A2A registry: {service_id}")

    # Start heartbeat loop for service registry
    async def heartbeat_loop():
        """Send heartbeat every 15 seconds."""
        while True:
            try:
                await asyncio.sleep(15)
                await registry.heartbeat("backend", service_id)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Heartbeat failed: {e}")

    heartbeat_task = asyncio.create_task(heartbeat_loop())

    # Import worker handlers to register them
    # This must happen before starting the worker
    import app.services.asset_processing_worker  # noqa: F401
    import app.services.face_detection_worker  # noqa: F401
    import app.services.invitation_auto_deletion_service  # noqa: F401 (T128, T129)

    # Start background task worker and scheduler (only if not disabled)
    enable_worker = os.getenv("DISABLE_TASK_WORKER", "false").lower() != "true"
    worker_task = None
    face_worker_task = None
    if enable_worker:
        task_queue = get_task_queue()
        # Increase concurrency for asset processing (can be tuned based on load)
        worker_concurrency = int(os.getenv("TASK_WORKER_CONCURRENCY", "10"))
        worker_task = asyncio.create_task(task_queue.start_worker(concurrency=worker_concurrency))
        scheduler = get_scheduler()
        await scheduler.start()
        logger.info(
            f"Background task worker started with concurrency={worker_concurrency}"
        )
        
        # Start face detection worker (only if not running as separate microservice)
        enable_face_worker = os.getenv("DISABLE_FACE_WORKER", "false").lower() != "true"
        if enable_face_worker:
            from app.services.face_detection_worker import get_face_detection_worker
            face_worker = get_face_detection_worker()
            face_worker_task = asyncio.create_task(face_worker.start())
            logger.info("Face detection worker started (embedded)")
        else:
            logger.info("Face detection worker disabled (using separate microservice)")

    logger.info("Application configuration loaded", extra={"config": settings.safe_dump()})

    try:
        yield
    finally:
        # Unregister from A2A registry and stop heartbeat
        heartbeat_task.cancel()
        try:
            await heartbeat_task
        except asyncio.CancelledError:
            pass
        await registry.unregister("backend", service_id)
        logger.info("Backend service unregistered from A2A registry")

        # Stop background services
        if enable_worker:
            # Stop face detection worker (if running embedded)
            if face_worker_task is not None:
                from app.services.face_detection_worker import get_face_detection_worker
                face_worker = get_face_detection_worker()
                await face_worker.stop()
                face_worker_task.cancel()
                try:
                    await face_worker_task
                except asyncio.CancelledError:
                    pass
                logger.info("Face detection worker stopped")
            
            task_queue = get_task_queue()
            task_queue.stop_worker()
            if worker_task is not None:
                worker_task.cancel()
                try:
                    await worker_task
                except asyncio.CancelledError:
                    pass
            scheduler = get_scheduler()
            await scheduler.stop()
            logger.info("Background task worker and scheduler stopped")

        await stop_audit_worker()  # Flush remaining audit logs
        await close_http_client()  # Close OAuth HTTP client connection pool
        await close_redis_client()
        await close_postgres_pool()


app = FastAPI(
    title=settings.app_name,
    version="0.3.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Add other middleware (applied in reverse order)
# 1. Correlation ID - first to process for distributed tracing
app.add_middleware(CorrelationMiddleware)  # type: ignore
# 2. Request ID - unique ID per request
app.add_middleware(RequestIdMiddleware)  # type: ignore
# 3. API Versioning - adds version headers and deprecation notices
app.add_middleware(VersioningMiddleware)  # type: ignore
# 4. Audit logging - logs all requests
app.add_middleware(AuditLoggingMiddleware)  # type: ignore
# 5. Rate limiting - before processing
app.add_middleware(RateLimitMiddleware)  # type: ignore
# 6. Prometheus metrics - track request metrics
app.add_middleware(PrometheusMiddleware)  # type: ignore

# CORS middleware - MUST be added last to update ALL responses (including errors from other middleware)
app.add_middleware(  # type: ignore
    CORSMiddleware,
    allow_origins=settings.allowed_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-Correlation-ID", "X-Request-ID", "X-API-Version", "X-API-Min-Version", "X-API-Deprecation-Info", "Deprecation", "Sunset", "Link"],
)

# Include API v1 routes
app.include_router(v1_router)  # type: ignore

# Register exception handlers
register_exception_handlers(app)  # type: ignore


@app.get("/metrics", include_in_schema=False)
async def metrics() -> Response:
    """Expose Prometheus metrics."""
    from app.metrics.registry import get_metrics_output
    return Response(content=get_metrics_output(), media_type="text/plain")


@app.get("/health", tags=["health"])  # type: ignore
async def health_check() -> dict[str, str]:
    """Lightweight liveness probe."""
    return {"status": "ok"}


@app.get("/ready", tags=["health"])  # type: ignore
async def readiness_check() -> dict[str, object]:
    """Readiness probe that validates DB and Redis connectivity."""

    pg_ok = await postgres_healthcheck()
    redis_ok = await redis_healthcheck()

    if not (pg_ok and redis_ok):
        raise HTTPException(status_code=503, detail={"postgres": pg_ok, "redis": redis_ok})

    return {"status": "ok", "postgres": pg_ok, "redis": redis_ok}
