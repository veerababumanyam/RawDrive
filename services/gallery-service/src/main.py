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
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware

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
    # Startup
    logger.info(
        "Starting Gallery Microservice...",
        extra={"version": settings.SERVICE_VERSION}
    )
    await redis_client.connect()
    await get_pool()  # Initialize database pool
    logger.info("Service started successfully")
    yield
    # Shutdown
    logger.info("Shutting down...")
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
