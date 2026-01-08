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
    import asyncio
    import os
    import uuid

    # Startup
    logger.info(f"Starting {settings.SERVICE_NAME} v{settings.SERVICE_VERSION}")

    # Initialize database connection pool
    await get_pool()
    logger.info("Database connection pool initialized")

    # Initialize Redis connection
    await redis_client.connect()
    logger.info("Redis connection initialized")

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
        service_name="billing-service",
        service_id=service_id,
        base_url=os.getenv("SERVICE_BASE_URL", "http://billing-service:8005"),
        capabilities=[
            ServiceCapability(name="subscription:read", version="1.0", endpoint="/api/v1/subscription"),
            ServiceCapability(name="subscription:write", version="1.0", endpoint="/api/v1/subscription"),
            ServiceCapability(name="payment:process", version="1.0", endpoint="/api/v1/subscription/checkout"),
            ServiceCapability(name="webhook:stripe", version="1.0", endpoint="/webhooks/stripe"),
            ServiceCapability(name="webhook:razorpay", version="1.0", endpoint="/webhooks/razorpay"),
        ],
        health_check_endpoint="/health",
    )

    await registry.register(registration)
    logger.info(f"Billing service registered in A2A registry: {service_id}")

    # Start heartbeat loop
    async def heartbeat_loop():
        """Send heartbeat every 15 seconds."""
        while True:
            try:
                await asyncio.sleep(15)
                await registry.heartbeat("billing-service", service_id)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Heartbeat failed: {e}")

    heartbeat_task = asyncio.create_task(heartbeat_loop())

    try:
        yield
    finally:
        # Shutdown: Unregister from A2A registry
        heartbeat_task.cancel()
        try:
            await heartbeat_task
        except asyncio.CancelledError:
            pass
        await registry.unregister("billing-service", service_id)
        logger.info("Billing service unregistered from A2A registry")

        # Original shutdown
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
