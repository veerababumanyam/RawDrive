"""
Notifications & Communication Microservice - FastAPI Application.

A dedicated microservice for multi-channel notifications (email, SMS, in-app)
with templating, user preferences, and delivery tracking.

Features:
- Multi-channel delivery (Email via SendGrid, SMS via Twilio placeholder)
- User notification preferences management
- Template-based message rendering with Jinja2
- Delivery tracking and retry with dead letter queue
- Digest aggregation for batched notifications
- Prometheus metrics for KEDA autoscaling (2-20 replicas)

Port: 8007 (configurable via SERVICE_PORT)
"""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings
from src.database import get_pool, close_pools, check_health as db_check_health
from src.cache.redis_client import redis_client
from src.events.redis_subscriber import subscribe_to_notification_events
from src.log_config import configure_logging, get_logger
from src.services.email_delivery_service import close_http_client

# Configure structured logging with PII filtering
configure_logging(
    log_level=settings.LOG_LEVEL,
    json_format=not settings.DEBUG,  # JSON in production, console in dev
    service_name=settings.SERVICE_NAME,
    service_version=settings.SERVICE_VERSION,
)
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle - startup and shutdown events."""
    # Startup
    logger.info(
        f"Starting {settings.SERVICE_NAME} v{settings.SERVICE_VERSION}..."
    )

    # Initialize database connection pool
    try:
        await get_pool()
        logger.info("Database connection pool initialized")
    except Exception as e:
        logger.error(f"Failed to initialize database pool: {e}")
        raise

    # Initialize Redis connection
    subscriber_task = None
    try:
        await redis_client.connect()
        logger.info("Redis connection initialized")

        # Start background subscriber for notification events -> WebSocket bridging
        subscriber_task = asyncio.create_task(
            subscribe_to_notification_events(redis_client)
        )
        logger.info("Notification event subscriber started")
    except Exception as e:
        # Redis failure is non-fatal - service operates in degraded mode
        logger.warning(f"Redis connection failed: {e}. Service will run without caching.")

    logger.info(
        f"{settings.SERVICE_NAME} started successfully",
        extra={"port": settings.SERVICE_PORT}
    )

    yield

    # Shutdown
    logger.info("Shutting down...")

    # Cancel subscriber task before disconnecting Redis
    if subscriber_task is not None:
        subscriber_task.cancel()
        try:
            await subscriber_task
        except asyncio.CancelledError:
            pass
        logger.info("Notification event subscriber stopped")

    await close_http_client()  # Close SendGrid HTTP client
    await redis_client.disconnect()
    await close_pools()
    logger.info("Shutdown complete")


# Create FastAPI application
app = FastAPI(
    title="RawDrive Notifications Service",
    description="""
Multi-channel notification and communication microservice for RawDrive.

## Features

- **Email Notifications**: Transactional and marketing emails via SendGrid
- **SMS Notifications**: SMS delivery via Twilio (Phase 2)
- **In-App Notifications**: Real-time notification feed
- **User Preferences**: Granular control over notification channels and frequency
- **Template Engine**: Jinja2-based customizable templates per workspace
- **Delivery Tracking**: Full audit trail with retry and dead letter queue
- **Digest Aggregation**: Batched notifications to reduce email fatigue

## Notification Categories

- **Transactional**: Billing, security, verification (cannot be disabled)
- **Gallery**: New galleries, selections, comments
- **Invitations**: Team invites, client access
- **Marketing**: Promotional content (opt-out available)

## Rate Limits

- Send Notification: 50/minute per user
- Webhook Callbacks: 500/minute (SendGrid events)
- Preference Updates: 100/minute per user

## Authentication

All endpoints require JWT Bearer token authentication.
Webhooks use provider-specific signature verification.
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
    allow_methods=["*"],
    allow_headers=["*"],
)

# Correlation ID middleware - must be added first (outermost middleware)
# Ensures every request has a correlation ID for distributed tracing
from src.middleware.correlation import CorrelationMiddleware

app.add_middleware(CorrelationMiddleware)

# Rate limiting middleware - uses Redis sliding window algorithm
# Applies tiered rate limits based on endpoint patterns
from src.middleware.rate_limiter import RateLimiterMiddleware

app.add_middleware(RateLimiterMiddleware)

# =============================================================================
# API Routes
# =============================================================================

# Import and include the v1 API router with all endpoints
from src.api.v1 import router as api_v1_router

# Include the router - note: individual routers already have their full paths
# (e.g., /api/v1/workspaces/{workspace_id}/notifications)
# so we include without an additional prefix
app.include_router(api_v1_router)


# =============================================================================
# Root & Health Check Endpoints
# =============================================================================


@app.get("/", tags=["root"])
async def root():
    """Root endpoint - service information."""
    return {
        "service": settings.SERVICE_NAME,
        "version": settings.SERVICE_VERSION,
        "status": "running",
        "documentation": "/docs" if settings.DEBUG else "Disabled in production",
    }


@app.get("/health", tags=["health"])
async def health_check():
    """
    Basic health check endpoint for load balancers.

    Returns 200 if the service process is running.
    This is a lightweight check that doesn't verify dependencies.
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

    Verifies that the service can handle requests by checking:
    - Database connectivity (required)
    - Redis connectivity (optional - degrades gracefully)

    Returns 200 if service is ready to handle traffic.
    Returns 503 if critical dependencies are unavailable.
    """
    # Check database
    db_health = await db_check_health()
    db_ok = db_health.get("status") in ("healthy", "degraded")

    # Check Redis
    redis_ok = await redis_client.ping()

    # Determine overall status
    if not db_ok:
        status = "unhealthy"
    elif not redis_ok:
        status = "degraded"  # Redis failure is non-critical
    else:
        status = "ready"

    return {
        "status": status,
        "service": settings.SERVICE_NAME,
        "checks": {
            "database": db_health,
            "redis": {
                "connected": redis_ok,
                "circuit_breaker": redis_client.get_circuit_state(),
            },
        },
    }


@app.get("/health/live", tags=["health"])
async def liveness_probe():
    """
    Kubernetes liveness probe.

    Returns 200 if the service process is running.
    This should NOT check external dependencies to avoid
    unnecessary restarts due to transient failures.
    """
    return {
        "status": "alive",
        "service": settings.SERVICE_NAME,
    }


@app.get("/health/ready", tags=["health"])
async def kubernetes_readiness_probe(response: Response):
    """
    Kubernetes readiness probe.

    Returns 200 if the service can handle requests.
    Returns 503 if critical dependencies are unavailable.

    Used by Kubernetes to determine if traffic should be routed to this pod.
    """
    # Check database (critical dependency)
    db_health = await db_check_health()
    db_ok = db_health.get("status") in ("healthy", "degraded")

    # Check Redis (non-critical - service degrades gracefully)
    redis_ok = await redis_client.ping()

    # Only database failure makes service not ready
    is_ready = db_ok

    if not is_ready:
        response.status_code = 503

    return {
        "status": "ready" if is_ready else "not_ready",
        "service": settings.SERVICE_NAME,
        "checks": {
            "database": {
                "status": db_health.get("status", "unknown"),
                "primary_connected": db_health.get("primary", {}).get("connected", False),
            },
            "redis": {
                "connected": redis_ok,
                "state": redis_client.get_circuit_state().get("state", "unknown"),
            },
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
    - KEDA autoscaling decisions
    - Grafana dashboards
    - Alerting

    Exposes key metrics including:
    - HTTP request latency and throughput
    - Email/SMS delivery rates and latencies
    - Notification queue depths (KEDA trigger)
    - Template rendering performance
    - Cache hit/miss ratios
    - Error counts and circuit breaker states
    """
    from src.observability.metrics import generate_latest_metrics, get_prometheus_content_type

    return Response(
        content=generate_latest_metrics(),
        media_type=get_prometheus_content_type(),
    )


# =============================================================================
# Application Entry Point
# =============================================================================


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host=settings.SERVICE_HOST,
        port=settings.SERVICE_PORT,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower(),
    )
