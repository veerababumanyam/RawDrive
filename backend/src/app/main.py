"""FastAPI application entrypoint."""

import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException  # type: ignore
from fastapi.middleware.cors import CORSMiddleware  # type: ignore

from app.api.exceptions import register_exception_handlers  # type: ignore
from app.api.v1 import router as v1_router  # type: ignore
from app.config.settings import ensure_settings_loaded
from app.db.postgres import close_postgres_pool, init_postgres_pool, postgres_healthcheck  # type: ignore
from app.db.redis import close_redis_client, init_redis_client, redis_healthcheck  # type: ignore
from app.middleware.audit_logging import AuditLoggingMiddleware  # type: ignore
from app.middleware.rate_limit import RateLimitMiddleware  # type: ignore
from app.middleware.request_id import RequestIdMiddleware  # type: ignore
from app.services.audit_service import start_audit_worker, stop_audit_worker  # type: ignore
from app.services.scheduler import get_scheduler  # type: ignore
from app.services.task_queue import get_task_queue  # type: ignore

settings = ensure_settings_loaded()
logger = logging.getLogger("rawdrive")


@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[override]
    """Initialize shared resources on startup and close on shutdown."""

    await init_postgres_pool(settings)
    await init_redis_client(settings)
    start_audit_worker()  # Start Loki audit log worker

    # Import worker handlers to register them
    # This must happen before starting the worker
    import app.services.asset_processing_worker  # noqa: F401

    # Start background task worker and scheduler (only if not disabled)
    enable_worker = os.getenv("DISABLE_TASK_WORKER", "false").lower() != "true"
    worker_task = None
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

    logger.info("Application configuration loaded", extra={"config": settings.safe_dump()})

    try:
        yield
    finally:
        # Stop background services
        if enable_worker:
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
        await close_redis_client()
        await close_postgres_pool()


app = FastAPI(
    title=settings.app_name,
    version="0.1.3",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Add other middleware (applied in reverse order)
# 1. Request ID - first to process, last to respond
app.add_middleware(RequestIdMiddleware)  # type: ignore
# 2. Audit logging - logs all requests
app.add_middleware(AuditLoggingMiddleware)  # type: ignore
# 3. Rate limiting - before processing
app.add_middleware(RateLimitMiddleware)  # type: ignore

# CORS middleware - MUST be added last to update ALL responses (including errors from other middleware)
app.add_middleware(  # type: ignore
    CORSMiddleware,
    allow_origins=settings.allowed_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)

# Include API v1 routes
app.include_router(v1_router)  # type: ignore

# Register exception handlers
register_exception_handlers(app)  # type: ignore


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
