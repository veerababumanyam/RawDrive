"""AI Processing Service entry point.

Handles AI processing for uploaded assets including:
- Smart duplicate detection (perceptual hash + CLIP embeddings)
- Content moderation (Google Vision API + Gemini)
- Automatic AI tagging and analysis
- Image upscaling (Real-ESRGAN GPU-accelerated)
"""

from __future__ import annotations

import asyncio
import logging
import signal
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, status, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse

from config import get_settings

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# Get settings
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan manager.

    Handles startup and shutdown events for the AI processing service.
    """
    # ==========================================================================
    # Startup
    # ==========================================================================
    logger.info("AI Processing Service starting up...")
    logger.info(f"Environment: {settings.ENVIRONMENT.value}")
    logger.info(f"Service: {settings.SERVICE_NAME}")
    logger.info(f"AI Provider: {settings.AI_PROVIDER.value}")

    app.state.startup_errors = []

    # Initialize database connection
    try:
        from core.database import init_database

        await init_database()
        logger.info("Database initialized")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        app.state.startup_errors.append(f"database: {e}")

    # Initialize Redis connection
    try:
        from core.redis import init_redis

        await init_redis()
        logger.info("Redis initialized")
    except Exception as e:
        logger.error(f"Failed to initialize Redis: {e}")
        app.state.startup_errors.append(f"redis: {e}")

    # Initialize Milvus connection (if enabled)
    if settings.MILVUS_ENABLED:
        try:
            from services.milvus_service import get_milvus_service

            milvus = get_milvus_service()
            milvus.connect()
            logger.info("Milvus initialized")
        except Exception as e:
            logger.warning(f"Failed to initialize Milvus (running without vector search): {e}")

    # Start Kafka consumers (if enabled)
    consumer_tasks = []
    if not settings.is_test:
        try:
            logger.info("Starting Kafka consumers...")
            # Import consumers
            # from consumers.duplicate_detector import start_duplicate_detector
            # from consumers.content_moderator import start_content_moderator
            # from consumers.auto_tagger import start_auto_tagger
            # from consumers.upscaler import start_upscaler

            # Start consumer tasks
            # consumer_tasks.append(asyncio.create_task(start_duplicate_detector()))
            # consumer_tasks.append(asyncio.create_task(start_content_moderator()))
            # consumer_tasks.append(asyncio.create_task(start_auto_tagger()))
            # if settings.UPSCALE_GPU_ENABLED:
            #     consumer_tasks.append(asyncio.create_task(start_upscaler()))

            logger.info(f"Started {len(consumer_tasks)} Kafka consumers")
        except Exception as e:
            logger.warning(f"Failed to start Kafka consumers: {e}")

    # Start MCP server (if enabled)
    if settings.MCP_ENABLED and not settings.is_test:
        try:
            logger.info("Starting MCP server...")
            # from mcp.upload_monitoring import start_mcp_server
            # mcp_task = asyncio.create_task(start_mcp_server())
            # consumer_tasks.append(mcp_task)
            logger.info("MCP server started")
        except Exception as e:
            logger.warning(f"Failed to start MCP server: {e}")

    app.state.startup_complete = True
    logger.info("AI Processing Service startup complete")

    # ==========================================================================
    # Yield control to application
    # ==========================================================================
    yield

    # ==========================================================================
    # Shutdown
    # ==========================================================================
    logger.info("AI Processing Service shutting down...")

    # Cancel Kafka consumer tasks
    for task in consumer_tasks:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    # Close Milvus connection
    if settings.MILVUS_ENABLED:
        try:
            from services.milvus_service import get_milvus_service

            milvus = get_milvus_service()
            milvus.disconnect()
            logger.info("Milvus connection closed")
        except Exception as e:
            logger.warning(f"Error closing Milvus: {e}")

    # Close Redis connection
    try:
        from core.redis import close_redis

        await close_redis()
        logger.info("Redis connection closed")
    except Exception as e:
        logger.warning(f"Error closing Redis: {e}")

    # Close database connection
    try:
        from core.database import close_database

        await close_database()
        logger.info("Database connection closed")
    except Exception as e:
        logger.warning(f"Error closing database: {e}")

    logger.info("AI Processing Service shutdown complete")


# =============================================================================
# FastAPI Application
# =============================================================================

app = FastAPI(
    title="AI Processing Service",
    description="AI processing for RawDrive assets (duplicate detection, moderation, tagging, upscaling)",
    version="1.0.0",
    lifespan=lifespan,
    default_response_class=ORJSONResponse,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

# =============================================================================
# Middleware
# =============================================================================

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.is_development else [],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Correlation-ID", "X-Request-ID"],
)

# =============================================================================
# Health Check Routes
# =============================================================================


@app.get("/health/live", status_code=status.HTTP_200_OK)
async def health_check() -> dict:
    """Liveness probe for Kubernetes.

    Returns:
        dict: Service health status.
    """
    return {"status": "alive", "service": settings.SERVICE_NAME}


@app.get("/health/ready")
async def readiness_check():
    """Readiness probe for Kubernetes.

    Checks if service dependencies are available.

    Returns:
        dict: Service readiness status with 200 or 503.
    """
    from core.database import database_healthcheck
    from core.redis import redis_healthcheck

    checks = {"database": False, "redis": False}

    # Check database
    try:
        checks["database"] = await database_healthcheck(timeout=2.0)
    except Exception:
        pass

    # Check Redis
    try:
        checks["redis"] = await redis_healthcheck(timeout=2.0)
    except Exception:
        pass

    all_healthy = all(checks.values())
    status_code = status.HTTP_200_OK if all_healthy else status.HTTP_503_SERVICE_UNAVAILABLE

    return ORJSONResponse(
        status_code=status_code,
        content={
            "status": "ready" if all_healthy else "not_ready",
            "checks": checks,
        },
    )


# =============================================================================
# Metrics Endpoint
# =============================================================================

if settings.METRICS_ENABLED:

    @app.get("/metrics")
    async def metrics() -> str:
        """Prometheus metrics endpoint.

        Returns:
            str: Metrics in Prometheus text format.
        """
        try:
            from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

            return generate_latest().decode("utf-8")
        except Exception as e:
            logger.error(f"Error generating metrics: {e}")
            return ""


# =============================================================================
# API Routes
# =============================================================================

@app.post("/embed/text")
async def embed_text(
    text: str = Body(..., embed=True),
) -> dict:
    """Generate CLIP embedding for text.
    
    Used for semantic search queries.
    """
    try:
        from models.clip_embedder import get_clip_embedder
        
        # NOTE: CLIP can embed text too!
        embedder = get_clip_embedder()
        embedder._ensure_initialized()
        
        # Using the same model/processor for text
        inputs = embedder.processor(text=[text], return_tensors="pt", padding=True)
        inputs = {k: v.to(embedder.device) for k, v in inputs.items()}
        
        import torch
        with torch.no_grad():
            text_features = embedder.model.get_text_features(**inputs)
            text_features = text_features / text_features.norm(dim=-1, keepdim=True)
            
        embedding = text_features[0].cpu().numpy().tolist()
        
        return {"embedding": embedding}
    except Exception as e:
        logger.error(f"Failed to generate text embedding: {e}")
        return ORJSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"error": str(e)}
        )

# API v1 routes (face detection, embedding extraction, etc.)
from api.v1 import router as api_router
app.include_router(api_router, prefix="/api/v1")


# =============================================================================
# Signal Handlers
# =============================================================================


def handle_shutdown(signum, frame):
    """Handle shutdown signals gracefully."""
    logger.info(f"Received signal {signum}, shutting down...")
    raise SystemExit(0)


signal.signal(signal.SIGTERM, handle_shutdown)
signal.signal(signal.SIGINT, handle_shutdown)


# =============================================================================
# Main Entry Point
# =============================================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=settings.RELOAD,
        log_level=settings.LOG_LEVEL.lower(),
        access_log=settings.DEBUG,
    )
