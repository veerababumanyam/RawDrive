"""Quality Analysis Worker - Standalone Microservice Entry Point.

This module provides the main entry point for the quality analysis worker
when running as a separate microservice/container.

Features:
- Initializes database connections
- Starts the quality analysis worker for curation sessions
- Provides a simple health check HTTP endpoint
- Handles graceful shutdown

Architecture follows content_worker_main.py pattern exactly.

Feature: 023-enhanced-smart-curate
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
from app.workers.quality_analysis_worker import QualityAnalysisWorker
from app.config.settings import ensure_settings_loaded


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


# Worker instance
_worker: Optional[QualityAnalysisWorker] = None
_worker_task: Optional[asyncio.Task] = None
_is_running: bool = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage worker lifecycle."""
    global _worker, _worker_task, _is_running

    # Initialize settings and database
    settings = ensure_settings_loaded()
    await init_postgres_pool(settings)
    logger.info("Database pool initialized for quality analysis worker")

    # Start the quality analysis worker
    _worker = QualityAnalysisWorker()
    _worker_task = asyncio.create_task(_worker.run())
    _is_running = True
    logger.info("Quality analysis worker started")

    try:
        yield
    finally:
        # Graceful shutdown
        logger.info("Shutting down quality analysis worker...")
        _is_running = False

        if _worker:
            _worker.signal_shutdown()

        if _worker_task:
            _worker_task.cancel()
            try:
                await _worker_task
            except asyncio.CancelledError:
                pass

        await close_postgres_pool()
        logger.info("Quality analysis worker shutdown complete")


# Create minimal FastAPI app for health checks
app = FastAPI(
    title="Quality Analysis Worker",
    description="Background worker for processing photo quality analysis (curation sessions)",
    lifespan=lifespan,
)


@app.get("/health")
async def health_check():
    """Health check endpoint for Kubernetes probes."""
    return {
        "status": "ok",
        "service": "quality-analysis-worker",
        "worker_running": _is_running,
    }


@app.get("/ready")
async def readiness_check():
    """Readiness check - only ready when worker is actively running."""
    if not _is_running:
        return {"status": "not_ready", "reason": "Worker not running"}

    return {
        "status": "ready",
    }


@app.get("/stats")
async def get_worker_stats():
    """Get detailed worker statistics."""
    if _worker is None:
        return {"error": "Worker not initialized"}

    # Quality worker doesn't have get_stats yet, return basic info
    return {
        "running": _is_running,
        "service": "quality-analysis-worker",
    }


def handle_signal(signum, frame):
    """Handle shutdown signals."""
    logger.info(f"Received signal {signum}, initiating shutdown...")
    sys.exit(0)


def main():
    """Main entry point for the worker service."""
    # Register signal handlers for graceful shutdown
    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    logger.info("Starting Quality Analysis Worker Service...")

    # Run the FastAPI app with uvicorn
    # Port from environment or default to 8003
    import os
    port = int(os.getenv("PORT", 8003))
    uvicorn.run(
        "app.workers.quality_worker_main:app",
        host="0.0.0.0",
        port=port,
        workers=1,  # Single worker - the async worker handles parallelism
        log_level="info",
    )


if __name__ == "__main__":
    main()
