"""
Client Microservice - Production-grade Client CRM and Relationship Management.

A dedicated microservice for comprehensive client management with:
- Client CRUD operations with multi-tenancy
- Contact and address management
- Gallery linking and proofing integration
- Activity timeline and communication history
- Smart lists and client segmentation
- CSV import/export
- Bulk operations
- Visitor to client conversion
- Analytics and reporting

Scalable architecture:
- 2-20 pod autoscaling via KEDA
- 3-tier Redis caching
- asyncpg connection pooling
- Prometheus metrics
- Graceful degradation
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings
from src.api.v1 import router as api_v1_router
from src.middleware.correlation import CorrelationMiddleware
from src.middleware.rate_limiter import RateLimiterMiddleware
from src.cache.redis_client import redis_client
from src.database import get_pool, close_pool
from src.log_config import configure_logging, get_logger
from src.observability.health import health_checker
from src.observability.metrics import generate_latest_metrics, get_metrics_content_type

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
    Manage application lifecycle (startup and shutdown).

    Startup:
    - Connect to Redis
    - Initialize database connection pools
    - Log service start

    Shutdown:
    - Disconnect from Redis
    - Close database connection pools
    - Log service shutdown
    """
    # ========== STARTUP ==========
    logger.info(
        "Starting Client Microservice...",
        extra={"version": settings.SERVICE_VERSION, "debug": settings.DEBUG},
    )

    # Connect to Redis (graceful degradation if fails)
    await redis_client.connect()

    # Initialize database connection pools
    await get_pool()

    logger.info(
        "Service started successfully",
        extra={
            "service": settings.SERVICE_NAME,
            "version": settings.SERVICE_VERSION,
            "db_pool_size": settings.DB_POOL_MAX_SIZE,
            "redis_connected": await redis_client.ping(),
        },
    )

    yield

    # ========== SHUTDOWN ==========
    logger.info("Shutting down Client Microservice...")

    # Disconnect from Redis
    await redis_client.disconnect()

    # Close database connection pools
    await close_pool()

    logger.info("Shutdown complete")


# =============================================================================
# FastAPI Application
# =============================================================================

app = FastAPI(
    title="Client Service",
    description="""
High-performance microservice for Client CRM and Relationship Management.

## Features

- **Client Management**: Complete CRUD with multi-tenant isolation
- **Contact Management**: Multiple emails, phones, addresses per client
- **Gallery Linking**: Associate clients with galleries and track proofing
- **Activity Timeline**: Comprehensive client interaction history
- **Communication History**: Log emails, calls, and follow-ups
- **Smart Lists**: Dynamic client segmentation with custom criteria
- **Import/Export**: CSV import/export for bulk operations
- **Visitor Conversion**: Automatically convert gallery visitors to clients
- **Analytics**: Client engagement metrics and reporting

## Rate Limits

- Client CRUD: 100-200 requests/minute
- Search: 100 requests/minute
- Import: 10 requests/hour
- Export: 20 requests/hour
- Bulk Operations: 30 requests/minute
- Smart Lists: 30 requests/minute

## Authentication

All endpoints require JWT authentication via Authorization header.
Workspace context provided via X-Workspace-ID header or JWT claim.

## Multi-Tenancy

ALL operations are scoped by workspace_id to ensure complete data isolation.
    """,
    version=settings.SERVICE_VERSION,
    lifespan=lifespan,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

# =============================================================================
# Middleware Stack (ORDER MATTERS!)
# =============================================================================

# 1. CORS (MUST be first)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=settings.CORS_ALLOW_METHODS,
    allow_headers=settings.CORS_ALLOW_HEADERS,
)

# 2. Correlation ID tracking (for distributed tracing)
app.add_middleware(CorrelationMiddleware)

# 3. Rate limiting (Redis-based sliding window)
if settings.RATE_LIMIT_ENABLED:
    app.add_middleware(RateLimiterMiddleware)

# =============================================================================
# API Routes
# =============================================================================

app.include_router(api_v1_router, prefix="/api/v1")


# =============================================================================
# Health Check Endpoints (Kubernetes Probes)
# =============================================================================


@app.get("/health", tags=["health"])
async def health_check():
    """
    Simple health check endpoint.

    Returns 200 if the service is running.
    Used by load balancers and basic monitoring.

    Returns:
        dict: Service status information
    """
    return {
        "status": "healthy",
        "service": settings.SERVICE_NAME,
        "version": settings.SERVICE_VERSION,
    }


@app.get("/health/live", tags=["health"])
async def liveness_probe():
    """
    Kubernetes liveness probe.

    Returns 200 if the service process is alive.
    DOES NOT check external dependencies.

    Kubernetes will restart the pod if this fails.

    Returns:
        dict: Liveness status
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
    Checks critical dependencies (database).

    Kubernetes will remove pod from service if this fails.

    Args:
        response: FastAPI response object

    Returns:
        dict: Readiness status with dependency checks
    """
    result = await health_checker.check_all()
    is_ready = await health_checker.is_ready()

    if not is_ready:
        response.status_code = 503

    return result.to_dict()


@app.get("/ready", tags=["health"])
async def ready_check():
    """
    Legacy readiness endpoint (alias for /health/ready).

    Returns:
        dict: Readiness status
    """
    redis_ok = await redis_client.ping()

    # Check database
    from src.database import check_database_connection

    db_ok = await check_database_connection()

    status = "ready" if (redis_ok and db_ok) else "degraded"

    return {
        "status": status,
        "checks": {
            "redis": "connected" if redis_ok else "disconnected",
            "database": "connected" if db_ok else "disconnected",
        },
    }


# =============================================================================
# Prometheus Metrics Endpoint (KEDA Trigger)
# =============================================================================


@app.get("/metrics", tags=["observability"])
async def prometheus_metrics():
    """
    Prometheus-compatible metrics endpoint.

    Returns metrics in Prometheus text format for:
    - Request counts and rates (KEDA autoscaling trigger)
    - Request latency percentiles (KEDA autoscaling trigger)
    - Cache hit/miss rates
    - Database connection pool stats
    - Error rates
    - Business metrics

    Used by:
    - Prometheus for monitoring
    - KEDA for autoscaling decisions
    - Grafana for dashboards

    Returns:
        Response: Metrics in Prometheus text format
    """
    metrics_output = generate_latest_metrics()
    return Response(
        content=metrics_output,
        media_type=get_metrics_content_type(),
    )


# =============================================================================
# Root Endpoint
# =============================================================================


@app.get("/", tags=["root"])
async def root():
    """
    Root endpoint with service information.

    Returns:
        dict: Service metadata
    """
    return {
        "service": settings.SERVICE_NAME,
        "version": settings.SERVICE_VERSION,
        "status": "operational",
        "documentation": "/docs" if settings.DEBUG else None,
    }
