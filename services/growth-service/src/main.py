"""
Growth & Referrals Microservice - FastAPI Application.

A dedicated microservice for driving organic growth through:
- Peer-to-peer referral program (unique codes, rewards tracking)
- Partner/affiliate program (commission tracking, payouts)
- Credit ledger (AI credits, bill credits)
- Setup goals gamification (onboarding incentives)

Designed for KEDA autoscaling (2-20 replicas) with Redis caching
and read replica support for analytics queries.

Port: 8016 (configurable via SERVICE_PORT)
"""

from contextlib import asynccontextmanager
import time

from fastapi import FastAPI, Response, Request
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings
from src.database import get_pool, close_pool
from src.cache.redis_client import redis_client
from src.logging import configure_logging, get_logger
from src.observability.health import health_checker
from src.observability.metrics import (
    generate_latest_metrics,
    get_prometheus_content_type,
    record_request,
)

# Configure structured logging with PII filtering
configure_logging(
    log_level=settings.LOG_LEVEL,
    json_format=not settings.DEBUG,  # JSON in production, console in dev
)
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle - startup and shutdown events.

    Startup:
    - Initialize database connection pool
    - Connect to Redis
    - Register with A2A service registry (when enabled)
    - Start heartbeat loop for service discovery

    Shutdown:
    - Cancel heartbeat task
    - Unregister from A2A registry
    - Close Redis connection
    - Close database pools
    """
    import asyncio
    import os
    import uuid

    # Startup
    logger.info(
        "Starting Growth & Referrals Microservice...",
        extra={
            "version": settings.SERVICE_VERSION,
            "port": settings.SERVICE_PORT,
            "debug": settings.DEBUG,
        },
    )

    try:
        # Initialize Redis connection
        await redis_client.connect()
        logger.info("Redis connected")

        # Initialize database connection pool
        await get_pool()
        logger.info("Database pool initialized")

        # Register service in A2A registry (Phase 4: A2A Integration)
        # Optional - graceful degradation if backend service registry not available
        registry = None
        service_id = None
        heartbeat_task = None

        try:
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
                service_name="growth-service",
                service_id=service_id,
                base_url=os.getenv("SERVICE_BASE_URL", "http://growth-service:8016"),
                capabilities=[
                    # Referral endpoints
                    ServiceCapability(
                        name="referral:create",
                        version="1.0",
                        endpoint="/api/v1/referrals/code",
                    ),
                    ServiceCapability(
                        name="referral:validate",
                        version="1.0",
                        endpoint="/api/v1/referrals/code/{code}/validate",
                    ),
                    ServiceCapability(
                        name="referral:convert",
                        version="1.0",
                        endpoint="/api/v1/referrals/conversions",
                    ),
                    # Credits endpoints
                    ServiceCapability(
                        name="credits:balance",
                        version="1.0",
                        endpoint="/api/v1/credits/balance",
                    ),
                    ServiceCapability(
                        name="credits:transactions",
                        version="1.0",
                        endpoint="/api/v1/credits/transactions",
                    ),
                    # Partner endpoints
                    ServiceCapability(
                        name="partner:apply",
                        version="1.0",
                        endpoint="/api/v1/partners/apply",
                    ),
                    ServiceCapability(
                        name="partner:dashboard",
                        version="1.0",
                        endpoint="/api/v1/partners/dashboard",
                    ),
                    # Goals endpoints
                    ServiceCapability(
                        name="goals:list",
                        version="1.0",
                        endpoint="/api/v1/goals",
                    ),
                    ServiceCapability(
                        name="goals:complete",
                        version="1.0",
                        endpoint="/api/v1/goals/{goal_id}/complete",
                    ),
                ],
                health_endpoint="/health",
            )

            await registry.register(registration)
            logger.info(f"Growth service registered in A2A registry: {service_id}")

            # Start heartbeat loop for service discovery
            async def heartbeat_loop():
                """Send heartbeat every 15 seconds to maintain registration."""
                while True:
                    try:
                        await asyncio.sleep(15)
                        await registry.heartbeat("growth-service", service_id)
                    except asyncio.CancelledError:
                        break
                    except Exception as e:
                        logger.error(f"Heartbeat failed: {e}")

            heartbeat_task = asyncio.create_task(heartbeat_loop())

        except ImportError as e:
            logger.warning(
                "A2A service registry not available - running in standalone mode",
                extra={"error": str(e)},
            )

        logger.info(
            "Growth service started successfully",
            extra={"port": settings.SERVICE_PORT},
        )

    except Exception as e:
        logger.error("Failed to start service", extra={"error": str(e)})
        raise

    try:
        yield
    finally:
        # Shutdown: Unregister from A2A registry (if registered)
        if heartbeat_task is not None:
            heartbeat_task.cancel()
            try:
                await heartbeat_task
            except asyncio.CancelledError:
                pass

        if registry is not None and service_id is not None:
            try:
                await registry.unregister("growth-service", service_id)
                logger.info("Growth service unregistered from A2A registry")
            except Exception as e:
                logger.warning(f"Failed to unregister from A2A registry: {e}")

        # Close connections
        logger.info("Shutting down...")
        await redis_client.disconnect()
        await close_pool()
        logger.info("Shutdown complete")


# Create FastAPI application
app = FastAPI(
    title="RawDrive Growth & Referrals Service",
    description="""
## Growth & Referrals Microservice

Drives organic growth for RawDrive through referral programs, partner affiliates,
credit rewards, and gamification.

### Features

- **Peer-to-Peer Referrals**: Generate unique referral codes, track conversions, distribute rewards
- **Partner Program**: Affiliate tracking, commission calculation, monthly payouts
- **Credit Ledger**: AI credits and bill credits management with ACID compliance
- **Setup Goals**: Gamified onboarding with credit rewards for completing setup tasks

### Referral Program

1. Generate referral code (`POST /api/v1/referrals/code`)
2. Validate code (`GET /api/v1/referrals/code/{code}/validate`)
3. Record conversion (`POST /api/v1/referrals/conversions`)

**Rewards:**
- Referrer: Rs.500 bill credit (or $20 equivalent)
- Referee: 1 month free on Pro plan

### Partner Program

1. Apply for partnership (`POST /api/v1/partners/apply`)
2. View dashboard (`GET /api/v1/partners/dashboard`)
3. Request payout (`POST /api/v1/partners/payout-request`)

**Commission:** 20% of first-year subscription

### Setup Goals

Complete onboarding goals to earn AI credits:
- Upload profile logo (50 credits)
- Create first gallery (100 credits)
- Share gallery with client (100 credits)
- Enable 2FA (100 credits)
- Connect payment method (150 credits)

### Rate Limits

- Referral code creation: 10/minute
- Referral validation: 60/minute
- Conversion recording: 5/minute
- Credit balance check: 120/minute
- Partner application: 3/hour
- Payout request: 5/day
- Default: 100/minute

### Authentication

All endpoints require JWT Bearer token authentication using EdDSA algorithm.
Tokens are issued by the main backend authentication service.
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

# CORS middleware - MUST be first (outermost middleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Note: Additional middleware (correlation, rate limiting) will be added
# when those modules are implemented in T036-T038


# Request timing middleware for metrics
@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    """Record request metrics (latency, status codes) for Prometheus/KEDA."""
    start_time = time.time()
    response = await call_next(request)
    duration = time.time() - start_time

    # Record metrics (normalized endpoint for cardinality control)
    endpoint = request.url.path
    # Normalize dynamic path segments to prevent metric explosion
    if "/api/v1/" in endpoint:
        parts = endpoint.split("/")
        normalized_parts = []
        for i, part in enumerate(parts):
            # Replace UUIDs and numeric IDs with placeholders
            if len(part) == 36 and "-" in part:  # UUID format
                normalized_parts.append("{id}")
            elif part.isdigit():
                normalized_parts.append("{id}")
            else:
                normalized_parts.append(part)
        endpoint = "/".join(normalized_parts)

    record_request(
        method=request.method,
        endpoint=endpoint,
        status_code=response.status_code,
        duration=duration,
    )

    return response


# =============================================================================
# API Routes
# =============================================================================

# Include API v1 router (placeholder until endpoints implemented in T029-T035)
from src.api.v1 import router as api_v1_router
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
    Basic health check for load balancers.

    Returns 200 if the service process is running.
    This is a lightweight check that doesn't verify dependencies.
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

    Returns 200 if the service process is running.
    Does NOT check external dependencies to avoid unnecessary
    container restarts due to transient failures.
    """
    is_live = await health_checker.is_live()
    if not is_live:
        return Response(status_code=503, content="Service not live")
    return {
        "status": "alive",
        "service": settings.SERVICE_NAME,
    }


@app.get("/health/ready", tags=["health"])
async def readiness_probe(response: Response):
    """
    Kubernetes readiness probe.

    Verifies the service can handle requests by checking:
    - Database connectivity (required)
    - Redis connectivity (optional - degrades gracefully)

    Returns 200 if ready, 503 if not ready to receive traffic.
    Used by Kubernetes to determine if traffic should be routed to this pod.
    """
    is_ready = await health_checker.is_ready()
    if not is_ready:
        response.status_code = 503
        return {"status": "not ready"}
    return {"status": "ready"}


@app.get("/health/startup", tags=["health"])
async def startup_probe():
    """
    Kubernetes startup probe.

    Returns 200 once the service has finished starting.
    Used to delay liveness/readiness checks until startup is complete.
    """
    return {"status": "started"}


@app.get("/health/detailed", tags=["health"])
async def detailed_health_check():
    """
    Comprehensive health check with detailed component status.

    Returns detailed information about:
    - Database connection pools (primary and read replica)
    - Redis cache connectivity
    - Service uptime

    Useful for debugging and monitoring dashboards.
    """
    return await health_checker.check_all()


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

    Key metrics exposed:
    - HTTP request latency and throughput
    - Referral codes created and conversions
    - Credits awarded by source
    - Partner conversions and payouts
    - Goals completed
    - Cache hit/miss ratios
    - Database query performance
    """
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
