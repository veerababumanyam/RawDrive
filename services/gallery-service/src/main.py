"""
Gallery Microservice - High-performance gallery viewing and proofing.

A dedicated microservice capable of serving 50K concurrent Magic Link views
and proofing interactions with KEDA autoscaling.

Features:
- Gallery CRUD operations
- Magic Link validation and gallery sharing
- Real-time proofing via WebSocket
- 3-tier Redis caching
- Prometheus metrics for KEDA autoscaling
- Read replica support for public endpoints
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from src.config import settings
from src.api.v1 import router as api_v1_router
from src.middleware.rate_limiter import RateLimiterMiddleware
from src.middleware.correlation import CorrelationMiddleware
from src.cache.redis_client import redis_client
from src.database import get_pool, close_pool
from src.log_config import configure_logging, get_logger
from src.observability.health import health_checker
from src.observability.metrics import generate_latest_metrics

# Configure structured logging with PII filtering
configure_logging(
    log_level=settings.LOG_LEVEL,
    json_format=not settings.DEBUG,
    service_name=settings.SERVICE_NAME,
)
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle."""
    import asyncio
    import os
    import uuid

    # Startup
    logger.info(
        "Starting Gallery Microservice...",
        extra={"version": settings.SERVICE_VERSION}
    )
    await redis_client.connect()
    await get_pool()  # Initialize database pool

    # Register service in A2A registry (Phase 4: A2A Integration)
    # Optional: Only register if backend service_registry is available
    import sys
    sys.path.insert(0, '/app/backend/src')  # Adjust path as needed
    try:
        from app.services.service_registry import (
            get_service_registry,
            ServiceRegistration,
            ServiceCapability,
        )
        registry = get_service_registry()
        service_id = os.getenv("SERVICE_ID", str(uuid.uuid4()))
        registration = ServiceRegistration(
            service_name="gallery-service",
            service_id=service_id,
            base_url=os.getenv("SERVICE_BASE_URL", "http://gallery-service:8004"),
            capabilities=[
                ServiceCapability(name="gallery:read", version="1.0", endpoint="/api/v1/galleries"),
                ServiceCapability(name="gallery:write", version="1.0", endpoint="/api/v1/galleries"),
                ServiceCapability(name="photo:search", version="1.0", endpoint="/api/v1/search"),
                ServiceCapability(name="face:search", version="1.0", endpoint="/api/v1/face-groups/search"),
                ServiceCapability(name="magic-links:validate", version="1.0", endpoint="/api/v1/magic-links"),
            ],
            health_check_endpoint="/health",
        )

        await registry.register(registration)
        logger.info(f"Gallery service registered in A2A registry: {service_id}")

        # Start heartbeat loop
        async def heartbeat_loop():
            """Send heartbeat every 15 seconds."""
            while True:
                try:
                    await asyncio.sleep(15)
                    await registry.heartbeat("gallery-service", service_id)
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error(f"Heartbeat failed: {e}")

        heartbeat_task = asyncio.create_task(heartbeat_loop())
    except (ImportError, ModuleNotFoundError):
        logger.warning("A2A service registry not available - skipping registration")
        registry = None
        heartbeat_task = None

    logger.info("Service started successfully")
    yield
    # Shutdown
    logger.info("Shutting down...")

    # Unregister from A2A registry
    if heartbeat_task:
        heartbeat_task.cancel()
        try:
            await heartbeat_task
        except asyncio.CancelledError:
            pass
    if registry:
        try:
            await registry.unregister("gallery-service", service_id)
            logger.info("Gallery service unregistered from A2A registry")
        except Exception as e:
            logger.warning(f"Failed to unregister from A2A registry: {e}")

    await redis_client.disconnect()
    await close_pool()
    logger.info("Shutdown complete")


app = FastAPI(
    title="Gallery Service",
    description="""
High-performance microservice for gallery viewing and proofing.

## Features

- **Gallery Management**: CRUD operations for galleries and sub-galleries
- **Magic Links**: Secure gallery sharing with expiration and PIN protection
- **Real-time Proofing**: WebSocket-based live updates for favorites/selections
- **Face Search**: pgvector-powered face similarity search
- **KEDA Autoscaling**: Scales 5-20 pods based on request rate

## Rate Limits

- Public Gallery Views: 1000/minute per IP
- Proofing Actions: 100/minute per visitor
- Face Search: 20/minute per visitor
- PIN Verification: 10/minute per IP (brute force protection)

## Authentication

- Public endpoints: Magic Link token or no auth
- Authenticated endpoints: JWT Bearer token
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

# Correlation ID tracking (must be before other middleware to capture all requests)
app.add_middleware(CorrelationMiddleware)

# Rate limiting
app.add_middleware(RateLimiterMiddleware)

# Exception handlers
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle all unhandled exceptions and return JSON response."""
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
    """Handle HTTP exceptions and return JSON response."""
    # Handle detail - it can be a dict, string, or list
    detail = exc.detail
    if isinstance(detail, dict):
        # If detail is a dict, use it directly or extract error info
        error_code = detail.get("error", "HTTP_ERROR")
        error_message = detail.get("message", str(detail))
    elif isinstance(detail, list):
        # If detail is a list (validation errors), join them
        error_code = "VALIDATION_ERROR"
        error_message = "; ".join(str(item) for item in detail)
    else:
        # If detail is a string
        error_code = "HTTP_ERROR"
        error_message = str(detail)
    
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": error_code,
                "message": error_message,
                "requestId": getattr(request.state, "correlation_id", None),
            }
        }
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Handle validation errors and return JSON response."""
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
app.include_router(api_v1_router, prefix="/api/v1")


# =============================================================================
# Health Check Endpoints
# =============================================================================


@app.get("/health", tags=["health"])
async def health_check():
    """
    Health check endpoint for load balancers.

    Returns 200 if the service is running.
    """
    return {
        "status": "healthy",
        "service": settings.SERVICE_NAME,
        "version": settings.SERVICE_VERSION,
    }


@app.get("/ready", tags=["health"])
async def readiness_check():
    """
    Readiness check for Kubernetes/container orchestration.

    Checks Redis and database connectivity.
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
        "checks": {
            "redis": "connected" if redis_ok else "disconnected",
            "database": "connected" if db_ok else "disconnected",
        },
    }


@app.get("/health/live", tags=["health"])
async def liveness_probe():
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
async def readiness_probe(response: Response):
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


@app.get("/metrics", tags=["observability"])
async def prometheus_metrics():
    """
    Prometheus-compatible metrics endpoint.

    Returns metrics in Prometheus text format.
    Used by KEDA for autoscaling decisions.
    """
    metrics_output = generate_latest_metrics()
    return Response(
        content=metrics_output,
        media_type="text/plain; charset=utf-8",
    )
