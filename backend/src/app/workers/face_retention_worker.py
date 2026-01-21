"""Face Embedding Retention Worker.

Background worker that processes face embedding retention jobs.

Runs on a schedule (nightly at 3 AM UTC) and also polls for
pending jobs from consent withdrawal or manual cleanup triggers.

COM-002: Face Data Retention Policy Enforcement
Feature: Face Detection Audit Remediation (002-face-audit-remediation)

Run as standalone:
    python -m app.workers.face_retention_worker

Or via Docker:
    docker-compose up face-retention-worker
"""

from __future__ import annotations

import asyncio
import logging
import signal
from datetime import datetime, time, timezone, timedelta
from typing import Optional

from fastapi import FastAPI
import uvicorn

from app.db.postgres import get_postgres_pool
from app.models.face_embedding_retention_job import (
    FaceEmbeddingRetentionJob,
    RetentionJobStatus,
    RetentionJobType,
)
from app.services.face_retention_service import (
    FaceRetentionService,
    get_face_retention_service,
)


logger = logging.getLogger(__name__)


# =============================================================================
# CONFIGURATION
# =============================================================================

# How often to check for pending jobs (seconds)
POLL_INTERVAL_SECONDS = 60

# Time to run scheduled cleanup (3 AM UTC)
SCHEDULED_CLEANUP_HOUR = 3
SCHEDULED_CLEANUP_MINUTE = 0

# Default retention days if workspace doesn't have setting
DEFAULT_RETENTION_DAYS = 2555  # ~7 years

# Maximum jobs to process per poll cycle
MAX_JOBS_PER_CYCLE = 5

# Health check server port
HEALTH_CHECK_PORT = 8020


# =============================================================================
# WORKER CLASS
# =============================================================================


class FaceRetentionWorker:
    """Worker for processing face embedding retention jobs.

    This worker:
    1. Polls for pending retention jobs
    2. Processes jobs by deleting expired face embeddings
    3. Creates scheduled cleanup jobs at 3 AM UTC
    4. Handles consent withdrawal cascade deletions

    For scheduled jobs:
    - Runs at 3 AM UTC daily
    - Creates system-wide cleanup job for all workspaces
    - Respects per-workspace retention settings

    For on-demand jobs:
    - Consent withdrawal: Deletes ALL embeddings for workspace
    - Manual cleanup: Uses specified retention period
    - GDPR deletion: Deletes ALL embeddings with audit trail
    """

    def __init__(self):
        """Initialize the worker."""
        self._shutdown_event = asyncio.Event()
        self._retention_service: Optional[FaceRetentionService] = None
        self._last_scheduled_check: Optional[datetime] = None
        self._last_scheduled_job: Optional[datetime] = None
        self._is_processing = False

    @property
    def retention_service(self) -> FaceRetentionService:
        """Lazy load retention service."""
        if self._retention_service is None:
            self._retention_service = get_face_retention_service()
        return self._retention_service

    @property
    def is_healthy(self) -> bool:
        """Check if worker is healthy."""
        # Worker is healthy if it's not stuck processing
        return not self._shutdown_event.is_set()

    @property
    def is_ready(self) -> bool:
        """Check if worker is ready to accept work."""
        return not self._shutdown_event.is_set() and not self._is_processing

    def signal_shutdown(self) -> None:
        """Signal the worker to shutdown gracefully."""
        logger.info("Shutdown signal received for face retention worker")
        self._shutdown_event.set()

    async def run(self) -> None:
        """Main worker loop - poll for pending jobs and process them."""
        logger.info("Face retention worker started")

        while not self._shutdown_event.is_set():
            try:
                # Check for and create scheduled jobs
                await self._check_scheduled_cleanup()

                # Fetch and process pending jobs
                jobs = await self._fetch_pending_jobs()

                for job in jobs:
                    if self._shutdown_event.is_set():
                        break
                    await self._process_job(job)

            except Exception as e:
                logger.exception(f"Error in face retention worker loop: {e}")
                await asyncio.sleep(10)

            # Wait before next poll
            try:
                await asyncio.wait_for(
                    self._shutdown_event.wait(),
                    timeout=POLL_INTERVAL_SECONDS,
                )
            except asyncio.TimeoutError:
                pass

        logger.info("Face retention worker stopped")

    async def _fetch_pending_jobs(self) -> list[FaceEmbeddingRetentionJob]:
        """Fetch pending retention jobs."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM face_embedding_retention_jobs
                WHERE status = 'pending'
                ORDER BY
                    -- Prioritize consent withdrawal and GDPR deletions
                    CASE job_type
                        WHEN 'consent_withdrawal' THEN 1
                        WHEN 'gdpr_deletion' THEN 2
                        WHEN 'manual_cleanup' THEN 3
                        ELSE 4
                    END,
                    created_at ASC
                LIMIT $1
                """,
                MAX_JOBS_PER_CYCLE,
            )

            return [FaceEmbeddingRetentionJob(**dict(row)) for row in rows]

    async def _process_job(self, job: FaceEmbeddingRetentionJob) -> None:
        """Process a single retention job."""
        self._is_processing = True

        logger.info(
            "Processing face retention job",
            extra={
                "job_id": str(job.id),
                "workspace_id": str(job.workspace_id) if job.workspace_id else "system",
                "job_type": job.job_type.value,
            },
        )

        try:
            # Process the job using the service
            result = await self.retention_service.process_job(job.id)

            logger.info(
                "Face retention job completed",
                extra={
                    "job_id": str(job.id),
                    "status": result.status.value,
                    "deleted_embeddings": result.deleted_embeddings,
                    "processed_embeddings": result.processed_embeddings,
                },
            )

        except Exception as e:
            logger.exception(
                "Face retention job failed",
                extra={
                    "job_id": str(job.id),
                    "error": str(e),
                },
            )

        finally:
            self._is_processing = False

    async def _check_scheduled_cleanup(self) -> None:
        """Check if it's time to create a scheduled cleanup job."""
        now = datetime.now(timezone.utc)

        # Only check once per minute
        if self._last_scheduled_check is not None:
            elapsed = (now - self._last_scheduled_check).total_seconds()
            if elapsed < 60:
                return

        self._last_scheduled_check = now

        # Check if it's the scheduled cleanup time (3 AM UTC)
        if now.hour != SCHEDULED_CLEANUP_HOUR or now.minute != SCHEDULED_CLEANUP_MINUTE:
            return

        # Check if we already created a job today
        if self._last_scheduled_job is not None:
            if self._last_scheduled_job.date() == now.date():
                return

        logger.info("Creating scheduled face retention cleanup job")

        try:
            # Create a system-wide cleanup job (workspace_id = None)
            job = await self.retention_service.create_scheduled_cleanup_job(
                workspace_id=None,  # System-wide
                retention_days=None,  # Use per-workspace settings
                triggered_by=None,  # System triggered
            )

            self._last_scheduled_job = now

            logger.info(
                "Scheduled face retention cleanup job created",
                extra={
                    "job_id": str(job.id),
                    "scheduled_time": now.isoformat(),
                },
            )

        except Exception as e:
            logger.exception(f"Failed to create scheduled cleanup job: {e}")


# =============================================================================
# HEALTH CHECK SERVER
# =============================================================================


def create_health_app(worker: FaceRetentionWorker) -> FastAPI:
    """Create FastAPI app for health checks."""
    app = FastAPI(
        title="Face Retention Worker Health",
        description="Health check endpoints for face retention worker",
        docs_url=None,
        redoc_url=None,
    )

    @app.get("/health/live")
    async def liveness():
        """Kubernetes liveness probe."""
        return {"status": "ok", "service": "face-retention-worker"}

    @app.get("/health/ready")
    async def readiness():
        """Kubernetes readiness probe."""
        if worker.is_ready:
            return {"status": "ready", "service": "face-retention-worker"}
        return {"status": "not_ready", "service": "face-retention-worker"}, 503

    @app.get("/health")
    async def health():
        """Combined health check."""
        return {
            "status": "healthy" if worker.is_healthy else "unhealthy",
            "ready": worker.is_ready,
            "service": "face-retention-worker",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    return app


async def run_health_server(worker: FaceRetentionWorker) -> None:
    """Run the health check server."""
    app = create_health_app(worker)
    config = uvicorn.Config(
        app,
        host="0.0.0.0",
        port=HEALTH_CHECK_PORT,
        log_level="warning",
    )
    server = uvicorn.Server(config)
    await server.serve()


# =============================================================================
# ENTRY POINTS
# =============================================================================


async def run_face_retention_worker():
    """Entry point for running the worker standalone."""
    worker = FaceRetentionWorker()

    # Handle shutdown signals
    loop = asyncio.get_event_loop()

    def handle_signal():
        worker.signal_shutdown()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, handle_signal)
        except NotImplementedError:
            # Windows doesn't support add_signal_handler
            signal.signal(sig, lambda s, f: handle_signal())

    # Run worker and health server concurrently
    await asyncio.gather(
        worker.run(),
        run_health_server(worker),
        return_exceptions=True,
    )


def main():
    """Main entry point."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )
    asyncio.run(run_face_retention_worker())


if __name__ == "__main__":
    main()
