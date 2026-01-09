"""
Webhooks Microservice - Event-driven webhook delivery system.

A dedicated microservice for managing webhook subscriptions and delivering
platform events to external endpoints with reliability guarantees.

Features:
- Webhook subscription management (CRUD)
- Event payload versioning
- Retry logic with exponential backoff
- HMAC-SHA256 signature verification
- Circuit breaker per endpoint
- Dead letter queue for failed deliveries
- Prometheus metrics for monitoring
"""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware

from src.config import settings
from src.api.v1 import router as api_v1_router
from src.middleware.correlation import CorrelationMiddleware
from src.middleware.rate_limiter import RateLimiterMiddleware
from src.cache.redis_client import redis_client
from src.database import get_pool, close_pool
from src.observability.health import health_checker
from src.observability.metrics import generate_latest_metrics

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper()),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle."""
    # Startup
    logger.info(
        f"Starting {settings.SERVICE_NAME} v{settings.SERVICE_VERSION}..."
    )

    # Initialize connections
    await redis_client.connect()
    await get_pool()

    # Start background workers
    from src.workers.delivery_worker import DeliveryWorker
    from src.workers.event_consumer import WebhookEventConsumer

    delivery_worker = DeliveryWorker()
    event_consumer = WebhookEventConsumer()

    # Store workers on app state for graceful shutdown
    app.state.delivery_worker = delivery_worker
    app.state.event_consumer = event_consumer

    # Start workers as background tasks
    delivery_task = asyncio.create_task(delivery_worker.start())
    consumer_task = asyncio.create_task(event_consumer.start())

    logger.info("Workers started successfully")

    yield

    # Shutdown
    logger.info("Shutting down...")

    # Stop workers gracefully
    await delivery_worker.stop()
    await event_consumer.stop()

    # Cancel background tasks
    delivery_task.cancel()
    consumer_task.cancel()

    try:
        await asyncio.gather(delivery_task, consumer_task, return_exceptions=True)
    except asyncio.CancelledError:
        pass

    # Close connections
    await redis_client.disconnect()
    await close_pool()

    logger.info("Shutdown complete")


app = FastAPI(
    title="Webhooks Service",
    description="""
Event-driven webhook delivery microservice for RawDrive.

## Features

- **Webhook Subscriptions**: Create, update, delete webhook endpoints
- **Event Catalog**: 40+ event types across 7 categories
- **Reliable Delivery**: Exponential backoff retry, circuit breakers
- **Security**: HMAC-SHA256 signatures with timestamp validation
- **Monitoring**: Success/failure rates, delivery latency metrics

## Event Categories

- **workspace**: Workspace CRUD, member management
- **subscription**: Billing events, payment status
- **user**: User lifecycle events
- **asset**: Upload, processing, tagging
- **gallery**: Publish, share, client interactions
- **invitation**: RSVP tracking
- **client**: Client activity tracking

## Rate Limits

- Subscription CRUD: 100/minute
- Event logs: 200/minute
- Admin endpoints: 50/minute
    """,
    version=settings.SERVICE_VERSION,
    lifespan=lifespan,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Correlation ID middleware
app.add_middleware(CorrelationMiddleware)

# Rate limiting middleware
app.add_middleware(RateLimiterMiddleware)

# Debug middleware to log all incoming requests
class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # #region agent log
        import json
        import os
        try:
            with open(r"c:\Users\admin\Desktop\RawDrive\.cursor\debug.log", "a") as f:
                f.write(json.dumps({"id":"log_request_in","timestamp":int(__import__("time").time()*1000),"location":"main.py:RequestLoggingMiddleware","message":"Incoming request","data":{"method":request.method,"path":str(request.url.path),"query":str(request.url.query),"headers":dict(request.headers)},"sessionId":"debug-session","runId":"run1","hypothesisId":"B"})+"\n")
        except: pass
        # #endregion
        response = await call_next(request)
        # #region agent log
        try:
            with open(r"c:\Users\admin\Desktop\RawDrive\.cursor\debug.log", "a") as f:
                f.write(json.dumps({"id":"log_request_out","timestamp":int(__import__("time").time()*1000),"location":"main.py:RequestLoggingMiddleware","message":"Request completed","data":{"status_code":response.status_code,"path":str(request.url.path)},"sessionId":"debug-session","runId":"run1","hypothesisId":"B"})+"\n")
        except: pass
        # #endregion
        return response

app.add_middleware(RequestLoggingMiddleware)


# Exception handlers
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle all unhandled exceptions."""
    logger.exception(
        "Unhandled exception",
        extra={
            "path": request.url.path,
            "method": request.method,
            "exception_type": type(exc).__name__,
        }
    )
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "An internal error occurred",
                "requestId": getattr(request.state, "correlation_id", None),
            }
        }
    )


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Handle HTTP exceptions."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": "HTTP_ERROR",
                "message": str(exc.detail),
                "requestId": getattr(request.state, "correlation_id", None),
            }
        }
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Handle validation errors."""
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Request validation failed",
                "details": exc.errors(),
                "requestId": getattr(request.state, "correlation_id", None),
            }
        }
    )


# API routes
# #region agent log
import json
import os
try:
    with open(r"c:\Users\admin\Desktop\RawDrive\.cursor\debug.log", "a") as f:
        f.write(json.dumps({"id":"log_main_router","timestamp":int(__import__("time").time()*1000),"location":"main.py:205","message":"Including API v1 router","data":{"prefix":"/api/v1","router_type":str(type(api_v1_router))},"sessionId":"debug-session","runId":"run1","hypothesisId":"B"})+"\n")
except: pass
# #endregion
app.include_router(api_v1_router, prefix="/api/v1")


# Health check endpoints
@app.get("/health", tags=["health"])
async def health_check():
    """Health check for load balancers."""
    return {
        "status": "healthy",
        "service": settings.SERVICE_NAME,
        "version": settings.SERVICE_VERSION,
    }


@app.get("/ready", tags=["health"])
async def readiness_check():
    """Readiness check for Kubernetes."""
    redis_ok = await redis_client.ping()

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
        "checks": {
            "redis": "connected" if redis_ok else "disconnected",
            "database": "connected" if db_ok else "disconnected",
        },
    }


@app.get("/health/live", tags=["health"])
async def liveness_probe():
    """Kubernetes liveness probe."""
    is_live = await health_checker.is_live()
    return {
        "status": "alive" if is_live else "dead",
        "service": settings.SERVICE_NAME,
    }


@app.get("/health/ready", tags=["health"])
async def readiness_probe(response: Response):
    """Kubernetes readiness probe."""
    result = await health_checker.check_all()
    is_ready = await health_checker.is_ready()

    if not is_ready:
        response.status_code = 503

    return result.to_dict()


@app.get("/metrics", tags=["observability"])
async def prometheus_metrics():
    """Prometheus metrics endpoint for KEDA autoscaling."""
    metrics_output = generate_latest_metrics()
    return Response(
        content=metrics_output,
        media_type="text/plain; charset=utf-8",
    )
