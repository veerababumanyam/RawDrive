"""
Billing Microservice - FastAPI Application

Handles subscriptions, payments, and invoice generation for RawDrive.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import make_asgi_app

from src.config import settings
from src.database import get_pool, close_pool
from src.redis_client import redis_client

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper()),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    # Startup
    logger.info(f"Starting {settings.SERVICE_NAME} v{settings.SERVICE_VERSION}")

    # Initialize database connection pool
    await get_pool()
    logger.info("Database connection pool initialized")

    # Initialize Redis connection
    await redis_client.connect()
    logger.info("Redis connection initialized")

    yield

    # Shutdown
    logger.info("Shutting down...")
    await close_pool()
    await redis_client.disconnect()
    logger.info("Shutdown complete")


# Create FastAPI application
app = FastAPI(
    title="RawDrive Billing Service",
    description="Subscription management, payments, and invoice generation",
    version=settings.SERVICE_VERSION,
    debug=settings.DEBUG,
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Prometheus metrics at /metrics
metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)


# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint for container orchestration."""
    # Check database connection
    try:
        pool = await get_pool()
        db_healthy = pool.get_size() > 0
    except Exception:
        db_healthy = False

    # Check Redis connection
    redis_healthy = await redis_client.ping()

    status = "healthy" if (db_healthy and redis_healthy) else "unhealthy"

    return {
        "status": status,
        "service": settings.SERVICE_NAME,
        "version": settings.SERVICE_VERSION,
        "checks": {
            "database": "up" if db_healthy else "down",
            "redis": "up" if redis_healthy else "down",
        }
    }


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "service": settings.SERVICE_NAME,
        "version": settings.SERVICE_VERSION,
        "status": "running"
    }


# Import and include routers
from src.api.v1 import subscription, webhooks

app.include_router(subscription.router, prefix="/api/v1", tags=["subscriptions"])
app.include_router(webhooks.router, prefix="/webhooks", tags=["webhooks"])
