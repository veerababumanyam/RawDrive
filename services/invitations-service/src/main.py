"""
Digital Invitations Microservice

A dedicated microservice for managing digital invitations, guests,
RSVPs, and analytics with Redis caching and rate limiting.

Features:
- Guest management with CSV/Excel import
- Redis-based caching (3-tier)
- Rate limiting with sliding window
- Celery workers for background tasks
- Structured JSON logging with PII filtering
- Correlation IDs for request tracing
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
from src.logging import configure_logging, get_logger
from src.observability.health import health_checker
from src.observability.metrics import generate_latest_metrics

# Configure structured logging with PII filtering
configure_logging(
    log_level=settings.LOG_LEVEL if hasattr(settings, 'LOG_LEVEL') else "INFO",
    json_format=not settings.DEBUG,
    service_name="invitations-service",
)
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle."""
    import asyncio
    import os
    import uuid

    # Startup
    logger.info("Starting Digital Invitations Microservice...")
    
    # Initialize central config client if enabled
    config_client_task = None
    if settings.CENTRAL_CONFIG_ENABLED:
        try:
            from src.services.config_client import get_config_client
            from src.config import reload_settings_from_central
            
            config_client = get_config_client()
            
            # Load initial config from central service
            await reload_settings_from_central()
            
            # Start background refresh
            await config_client.start_background_refresh()
            
            # Start periodic settings reload
            async def settings_reload_loop():
                """Periodically reload settings from central config."""
                while True:
                    try:
                        await asyncio.sleep(settings.CENTRAL_CONFIG_REFRESH_INTERVAL)
                        await reload_settings_from_central()
                    except asyncio.CancelledError:
                        break
                    except Exception as e:
                        logger.warning(f"Settings reload loop error: {e}")
            
            config_client_task = asyncio.create_task(settings_reload_loop())
            logger.info(f"Central config enabled: refreshing every {settings.CENTRAL_CONFIG_REFRESH_INTERVAL}s")
        except Exception as e:
            logger.warning(f"Failed to initialize central config: {e}. Using environment variables.")
    
    await redis_client.connect()
    await get_pool()  # Initialize database pool
    logger.info("Service started successfully")

    # Register service in A2A registry (Phase 4: A2A Integration)
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
        service_name="invitations-service",
        service_id=service_id,
        base_url=os.getenv("SERVICE_BASE_URL", "http://invitations-api:8007"),
        capabilities=[
            ServiceCapability(name="invitations:create", version="1.0", endpoint="/api/v1/invitations"),
            ServiceCapability(name="invitations:rsvp", version="1.0", endpoint="/api/v1/invitations/rsvp"),
            ServiceCapability(name="invitations:bulk", version="1.0", endpoint="/api/v1/invitations/bulk"),
        ],
        health_check_endpoint="/health",
    )

    await registry.register(registration)
    logger.info(f"Invitations service registered in A2A registry: {service_id}")

    # Start heartbeat loop
    async def heartbeat_loop():
        """Send heartbeat every 15 seconds."""
        while True:
            try:
                await asyncio.sleep(15)
                await registry.heartbeat("invitations-service", service_id)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Heartbeat failed: {e}")

    heartbeat_task = asyncio.create_task(heartbeat_loop())

    try:
        yield
    finally:
        # Shutdown: Stop config refresh if enabled
        if config_client_task:
            config_client_task.cancel()
            try:
                await config_client_task
            except asyncio.CancelledError:
                pass
            
            try:
                from src.services.config_client import get_config_client
                config_client = get_config_client()
                await config_client.stop_background_refresh()
            except Exception as e:
                logger.warning(f"Error stopping config client: {e}")
        
        # Shutdown: Unregister from A2A registry
        heartbeat_task.cancel()
        try:
            await heartbeat_task
        except asyncio.CancelledError:
            pass
        await registry.unregister("invitations-service", service_id)
        logger.info("Invitations service unregistered from A2A registry")

        # Original shutdown
        logger.info("Shutting down...")
        await redis_client.disconnect()
        await close_pool()
        logger.info("Shutdown complete")


app = FastAPI(
    title="Digital Invitations Service",
    description="""
Microservice for digital invitation management.

## Features

- **Guest Management**: CRUD operations for invitation guests
- **CSV Import**: Import guests from CSV with column mapping
- **Bulk Operations**: Bulk status updates and invitations
- **Analytics**: Cached analytics with 10-minute TTL
- **Rate Limiting**: Sliding window rate limiting per endpoint

## Rate Limits

- CSV Import: 5 requests/hour
- Bulk Invite: 10 requests/hour
- RSVP Submit: 10 requests/minute
- Analytics: 100 requests/minute (cached)

## Authentication

All endpoints (except public RSVP) require JWT authentication.
Pass the token in the Authorization header: `Bearer <token>`
    """,
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
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


@app.get("/health", tags=["health"])
async def health_check():
    """
    Health check endpoint for load balancers.

    Returns 200 if the service is running.
    """
    return {
        "status": "healthy",
        "service": "invitations",
        "version": "1.0.0",
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


# =============================================================================
# Kubernetes-Compatible Health Probes (Observability)
# =============================================================================


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
        "service": "invitations",
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
# Prometheus Metrics Endpoint
# =============================================================================


@app.get("/metrics", tags=["observability"])
async def prometheus_metrics():
    """
    Prometheus-compatible metrics endpoint.

    Returns metrics in Prometheus text format.
    """
    metrics_output = generate_latest_metrics()
    return Response(
        content=metrics_output,
        media_type="text/plain; charset=utf-8",
    )
