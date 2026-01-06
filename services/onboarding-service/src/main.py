"""
Onboarding Microservice - User registration and onboarding flow.

A dedicated microservice for handling new user onboarding including:
- Plan selection
- User registration (email or OAuth)
- Email verification
- Payment processing (Stripe)
- Workspace creation

Designed for low-scale (100-500 concurrent users) with simple architecture.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI, Response, Request
from fastapi.middleware.cors import CORSMiddleware
import time

from src.config import settings
from src.api.v1 import router as api_v1_router
from src.middleware.rate_limiter import RateLimiterMiddleware
from src.middleware.correlation import CorrelationMiddleware
from src.cache.redis_client import redis_client
from src.database import get_pool, close_pool
from src.logging import configure_logging, get_logger
from src.observability.health import health_checker
from src.observability.metrics import generate_latest_metrics, record_request

# Configure structured logging
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
        "Starting Onboarding Microservice...",
        extra={"version": settings.SERVICE_VERSION, "debug": settings.DEBUG},
    )

    try:
        # Initialize Redis
        await redis_client.connect()
        logger.info("Redis connected")

        # Initialize database pool
        await get_pool()
        logger.info("Database pool initialized")

        logger.info("Service started successfully")
    except Exception as e:
        logger.error("Failed to start service", extra={"error": str(e)})
        raise

    yield

    # Shutdown
    logger.info("Shutting down...")
    await redis_client.disconnect()
    await close_pool()
    logger.info("Shutdown complete")


# Create FastAPI application
app = FastAPI(
    title="Onboarding Service",
    description="""
## Onboarding Microservice

Handles the complete user onboarding flow for RawDrive.

### Features

- **Plan Selection**: Choose subscription plan (monthly/annual)
- **User Registration**: Email/password or Google OAuth
- **Email Verification**: Secure token-based verification
- **Payment Processing**: Stripe integration for subscriptions
- **Workspace Creation**: Automatic workspace setup on completion

### Flow Steps

1. Start session (`POST /api/v1/onboarding/start`)
2. Select plan (`POST /api/v1/onboarding/select-plan`)
3. Register (`POST /api/v1/onboarding/register`)
4. Verify email (`POST /api/v1/onboarding/verify-email`)
5. Create payment intent (`POST /api/v1/onboarding/payment/create-intent`)
6. Confirm payment (`POST /api/v1/onboarding/payment/confirm`)
7. Complete onboarding (`POST /api/v1/onboarding/complete`)

### Rate Limits

- Start session: 10/minute
- Email verification: 5/minute
- Payment: 20/minute
- Default: 100/minute

### Authentication

Session-based via httpOnly cookies or X-Onboarding-Token header.
    """,
    version=settings.SERVICE_VERSION,
    lifespan=lifespan,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

# CORS middleware (MUST be first)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=settings.CORS_ALLOW_METHODS,
    allow_headers=settings.CORS_ALLOW_HEADERS,
)

# Correlation ID middleware
app.add_middleware(CorrelationMiddleware)

# Rate limiting middleware
if settings.RATE_LIMIT_ENABLED:
    app.add_middleware(RateLimiterMiddleware)

# Request timing middleware
@app.middleware("http")
async def add_metrics_middleware(request: Request, call_next):
    """Record request metrics."""
    start_time = time.time()
    response = await call_next(request)
    duration = time.time() - start_time

    # Record metrics
    record_request(
        method=request.method,
        endpoint=request.url.path,
        status_code=response.status_code,
        duration=duration,
    )

    return response

# Include API v1 router
app.include_router(api_v1_router, prefix="/api/v1")

# Health check endpoints (required for Kubernetes)
@app.get("/health")
async def health():
    """Basic health check."""
    return {"status": "healthy"}


@app.get("/health/live")
async def liveness_probe():
    """Kubernetes liveness probe - checks if process is alive."""
    is_live = await health_checker.is_live()
    if not is_live:
        return Response(status_code=503, content="Service not live")
    return {"status": "alive"}


@app.get("/health/ready")
async def readiness_probe(response: Response):
    """Kubernetes readiness probe - checks if service can handle traffic."""
    is_ready = await health_checker.is_ready()
    if not is_ready:
        response.status_code = 503
        return {"status": "not ready"}
    return {"status": "ready"}


@app.get("/health/startup")
async def startup_probe():
    """Kubernetes startup probe - checks if service has finished starting."""
    return {"status": "started"}


@app.get("/metrics")
async def prometheus_metrics():
    """Prometheus metrics endpoint."""
    metrics_output = generate_latest_metrics()
    return Response(
        content=metrics_output,
        media_type="text/plain; charset=utf-8",
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
        log_level=settings.LOG_LEVEL.lower(),
    )
