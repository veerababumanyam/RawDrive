"""Face Detection Worker - Standalone Microservice Entry Point.

This module provides the main entry point for the face detection worker
when running as a separate microservice/container.

Features:
- Initializes database connections
- Starts the face detection worker
- Provides a simple health check HTTP endpoint
- Handles graceful shutdown
"""

import asyncio
import logging
import signal
import sys
from contextlib import asynccontextmanager
from typing import Optional

import uvicorn
from fastapi import FastAPI

from app.db.postgres import init_postgres_pool, close_postgres_pool
from app.services.face_detection_worker import (
    FaceDetectionWorker,
    get_face_detection_worker,
)
from app.services.ai.face_embedder import initialize_model, is_model_loaded
from app.config.settings import ensure_settings_loaded


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


# Worker instance
_worker: Optional[FaceDetectionWorker] = None
_worker_task: Optional[asyncio.Task] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage worker lifecycle."""
    global _worker, _worker_task
    
    # Initialize settings and database
    settings = ensure_settings_loaded()
    await init_postgres_pool(settings)
    logger.info("Database pool initialized")
    
    # Eagerly load face recognition model BEFORE accepting jobs
    logger.info("Pre-loading face recognition model...")
    model_loaded = await initialize_model()
    if not model_loaded:
        logger.error(
            "Face recognition model failed to load. "
            "Worker will not start accepting jobs with broken model."
        )
        raise RuntimeError("Face recognition model initialization failed")
    logger.info("Face worker ready - model pre-loaded")

    # Start the face detection worker
    _worker = get_face_detection_worker()
    _worker_task = asyncio.create_task(_worker.start())
    logger.info("Face detection worker started")
    
    try:
        yield
    finally:
        # Graceful shutdown
        logger.info("Shutting down face detection worker...")
        
        if _worker:
            await _worker.stop()
        
        if _worker_task:
            _worker_task.cancel()
            try:
                await _worker_task
            except asyncio.CancelledError:
                pass
        
        await close_postgres_pool()
        logger.info("Worker shutdown complete")


# Create minimal FastAPI app for health checks
app = FastAPI(
    title="Face Detection Worker",
    description="Background worker for processing face detection jobs",
    lifespan=lifespan,
)


@app.get("/health")
async def health_check():
    """Health check endpoint for Kubernetes probes."""
    return {
        "status": "ok",
        "service": "face-detection-worker",
        "worker_running": _worker is not None and _worker._running,
    }


@app.get("/ready")
async def readiness_check():
    """Readiness check - only ready when worker is actively running and model loaded."""
    if _worker is None or not _worker._running:
        return {"status": "not_ready", "reason": "Worker not running"}, 503
    if not is_model_loaded():
        return {"status": "not_ready", "reason": "Model not loaded"}, 503
    return {"status": "ready"}


def handle_signal(signum, frame):
    """Handle shutdown signals."""
    logger.info(f"Received signal {signum}, initiating shutdown...")
    sys.exit(0)


def main():
    """Main entry point for the worker service."""
    import os as _os
    log_level_name = (_os.getenv("LOG_LEVEL") or "INFO").upper()
    logging.getLogger().setLevel(getattr(logging, log_level_name, logging.INFO))
    # Register signal handlers for graceful shutdown
    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)
    
    logger.info("Starting Face Detection Worker Service...")
    
    # Run the FastAPI app with uvicorn
    # Port from environment or default to 8001. LOG_LEVEL=DEBUG for verbose tracing.
    import os
    port = int(os.getenv("PORT", 8001))
    log_level = (os.getenv("LOG_LEVEL") or "info").lower()
    uvicorn.run(
        "app.face_worker_main:app",
        host="0.0.0.0",
        port=port,
        workers=1,  # Single worker - the async worker handles parallelism
        log_level=log_level,
    )


if __name__ == "__main__":
    main()
