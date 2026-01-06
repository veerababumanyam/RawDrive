"""Content Detection Worker - Standalone Microservice Entry Point.

This module provides the main entry point for the content detection worker
when running as a separate microservice/container.

Features:
- Initializes database connections
- Starts the content detection worker
- Provides a simple health check HTTP endpoint
- Handles graceful shutdown

Architecture follows face_worker_main.py pattern exactly.

Requirements: Smart Tagging Layer - T019
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
from app.services.content_detection_worker import (
    ContentDetectionWorker,
    get_content_detection_worker,
)
from app.config.settings import ensure_settings_loaded


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


# Worker instance
_worker: Optional[ContentDetectionWorker] = None
_worker_task: Optional[asyncio.Task] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage worker lifecycle."""
    global _worker, _worker_task

    # Initialize settings and database
    settings = ensure_settings_loaded()
    await init_postgres_pool(settings)
    logger.info("Database pool initialized for content detection worker")

    # Start the content detection worker
    _worker = get_content_detection_worker()
    _worker_task = asyncio.create_task(_worker.start())
    logger.info("Content detection worker started")

    try:
        yield
    finally:
        # Graceful shutdown
        logger.info("Shutting down content detection worker...")

        if _worker:
            await _worker.stop()

        if _worker_task:
            _worker_task.cancel()
            try:
                await _worker_task
            except asyncio.CancelledError:
                pass

        await close_postgres_pool()
        logger.info("Content detection worker shutdown complete")


# Create minimal FastAPI app for health checks
app = FastAPI(
    title="Content Detection Worker",
    description="Background worker for processing content detection (AI tagging) jobs",
    lifespan=lifespan,
)


@app.get("/health")
async def health_check():
    """Health check endpoint for Kubernetes probes."""
    return {
        "status": "ok",
        "service": "content-detection-worker",
        "worker_running": _worker is not None and _worker.is_running,
    }


@app.get("/ready")
async def readiness_check():
    """Readiness check - only ready when worker is actively running."""
    if _worker is None or not _worker.is_running:
        return {"status": "not_ready", "reason": "Worker not running"}

    # Get stats for additional info
    stats = await _worker.get_stats()

    return {
        "status": "ready",
        "stats": stats,
    }


@app.get("/stats")
async def get_worker_stats():
    """Get detailed worker statistics."""
    if _worker is None:
        return {"error": "Worker not initialized"}

    return await _worker.get_stats()


def handle_signal(signum, frame):
    """Handle shutdown signals."""
    logger.info(f"Received signal {signum}, initiating shutdown...")
    sys.exit(0)


def main():
    """Main entry point for the worker service."""
    # Register signal handlers for graceful shutdown
    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    logger.info("Starting Content Detection Worker Service...")

    # Run the FastAPI app with uvicorn
    # Port from environment or default to 8002
    import os
    port = int(os.getenv("PORT", 8002))
    uvicorn.run(
        "app.workers.content_worker_main:app",
        host="0.0.0.0",
        port=port,
        workers=1,  # Single worker - the async worker handles parallelism
        log_level="info",
    )


if __name__ == "__main__":
    main()
