"""Asset Cleanup Worker.

Background worker that runs cleanup analysis to identify:
- Duplicate files (exact sha256 hash match)
- Similar photos (face embedding comparison)
- Unused assets (no views/downloads)

This worker can be run as a standalone process or triggered via Celery.

Feature: Automatic Asset Cleanup
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.repositories.cleanup_repository import get_cleanup_repository
from app.services.cleanup_service import get_cleanup_service


logger = logging.getLogger(__name__)

# Configuration
POLL_INTERVAL_SECONDS = 60  # Check for pending jobs every minute
SCHEDULED_CHECK_INTERVAL_HOURS = 6  # Check for workspaces needing analysis


class CleanupWorker:
    """Worker for executing cleanup analysis jobs.

    This worker:
    1. Polls for pending cleanup jobs
    2. Executes cleanup analysis (duplicates, faces, unused)
    3. Creates recommendations with confidence scores
    4. Updates job progress and status
    5. Optionally auto-approves high-confidence recommendations

    For scheduled jobs, it also:
    - Checks workspaces with auto_analysis_enabled
    - Creates jobs based on auto_analysis_interval_days
    - Respects storage_alert_threshold_percent
    """

    def __init__(self):
        """Initialize the cleanup worker."""
        self._shutdown_event = asyncio.Event()
        self._cleanup_service = None
        self._cleanup_repo = None
        self._last_scheduled_check = None

    @property
    def cleanup_service(self):
        """Lazy load cleanup service."""
        if self._cleanup_service is None:
            self._cleanup_service = get_cleanup_service()
        return self._cleanup_service

    @property
    def cleanup_repo(self):
        """Lazy load cleanup repository."""
        if self._cleanup_repo is None:
            self._cleanup_repo = get_cleanup_repository()
        return self._cleanup_repo

    def signal_shutdown(self) -> None:
        """Signal the worker to shutdown gracefully."""
        logger.info("Shutdown signal received for cleanup worker")
        self._shutdown_event.set()

    async def run(self) -> None:
        """Main worker loop - poll for pending jobs and process them."""
        logger.info("Cleanup worker started")

        while not self._shutdown_event.is_set():
            try:
                # Fetch pending cleanup jobs
                jobs = await self._fetch_pending_jobs()

                for job in jobs:
                    if self._shutdown_event.is_set():
                        break
                    await self._process_job(job)

                # Periodically check for scheduled jobs
                await self._check_scheduled_jobs()

            except Exception as e:
                logger.exception(f"Error in cleanup worker loop: {e}")
                await asyncio.sleep(10)

            # Wait before next poll
            try:
                await asyncio.wait_for(
                    self._shutdown_event.wait(),
                    timeout=POLL_INTERVAL_SECONDS,
                )
            except asyncio.TimeoutError:
                pass

        logger.info("Cleanup worker stopped")

    async def _fetch_pending_jobs(self) -> list[dict[str, Any]]:
        """Fetch all pending cleanup jobs."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM cleanup_jobs
                WHERE status = 'pending'
                ORDER BY created_at ASC
                LIMIT 10
                """
            )
            return [dict(row) for row in rows]

    async def _process_job(self, job: dict[str, Any]) -> None:
        """Process a single cleanup job."""
        job_id = job["id"]
        workspace_id = job["workspace_id"]
        job_type = job["job_type"]

        logger.info(
            "Processing cleanup job",
            extra={
                "job_id": str(job_id),
                "workspace_id": str(workspace_id),
                "job_type": job_type,
            },
        )

        try:
            result = await self.cleanup_service.run_cleanup_analysis(
                workspace_id=workspace_id,
                job_id=job_id,
                job_type=job_type,
            )

            # Handle auto-approval if configured
            await self._handle_auto_approval(workspace_id)

            logger.info(
                "Cleanup job completed",
                extra={
                    "job_id": str(job_id),
                    "recommendations_created": result.get("recommendations_created", 0),
                    "potential_savings_bytes": result.get("potential_savings_bytes", 0),
                },
            )

        except Exception as e:
            logger.exception(
                "Cleanup job failed",
                extra={
                    "job_id": str(job_id),
                    "workspace_id": str(workspace_id),
                    "error": str(e),
                },
            )
            # Job status is updated by the service on failure

    async def _handle_auto_approval(self, workspace_id: UUID) -> None:
        """Auto-approve high-confidence recommendations if enabled."""
        try:
            settings = await self.cleanup_repo.get_settings(workspace_id)
            auto_approve_threshold = settings.get("auto_approve_threshold")

            if auto_approve_threshold is None:
                return

            # Fetch pending recommendations above threshold
            pool = await get_postgres_pool()
            async with pool.acquire() as conn:
                result = await conn.execute(
                    """
                    UPDATE cleanup_recommendations
                    SET status = 'auto_approved',
                        reviewed_at = NOW()
                    WHERE workspace_id = $1
                      AND status = 'pending'
                      AND confidence >= $2
                    """,
                    workspace_id,
                    auto_approve_threshold,
                )

                count = int(result.split()[-1])
                if count > 0:
                    logger.info(
                        "Auto-approved cleanup recommendations",
                        extra={
                            "workspace_id": str(workspace_id),
                            "count": count,
                            "threshold": float(auto_approve_threshold),
                        },
                    )

        except Exception as e:
            logger.warning(
                "Failed to auto-approve recommendations",
                extra={
                    "workspace_id": str(workspace_id),
                    "error": str(e),
                },
            )

    async def _check_scheduled_jobs(self) -> None:
        """Check for workspaces that need scheduled cleanup analysis."""
        import datetime

        now = datetime.datetime.now(datetime.timezone.utc)

        # Only check periodically
        if self._last_scheduled_check is not None:
            hours_since_check = (now - self._last_scheduled_check).total_seconds() / 3600
            if hours_since_check < SCHEDULED_CHECK_INTERVAL_HOURS:
                return

        self._last_scheduled_check = now

        logger.debug("Checking for scheduled cleanup jobs")

        try:
            pool = await get_postgres_pool()
            async with pool.acquire() as conn:
                # Find workspaces with auto-analysis enabled that need a job
                rows = await conn.fetch(
                    """
                    WITH last_jobs AS (
                        SELECT
                            workspace_id,
                            MAX(completed_at) as last_completed
                        FROM cleanup_jobs
                        WHERE status = 'completed'
                        GROUP BY workspace_id
                    )
                    SELECT
                        cs.workspace_id,
                        cs.auto_analysis_interval_days,
                        lj.last_completed
                    FROM cleanup_settings cs
                    LEFT JOIN last_jobs lj ON cs.workspace_id = lj.workspace_id
                    WHERE cs.auto_analysis_enabled = TRUE
                      AND (
                          lj.last_completed IS NULL
                          OR lj.last_completed < NOW() - (cs.auto_analysis_interval_days || ' days')::INTERVAL
                      )
                      -- Also check storage threshold
                      AND should_run_cleanup(cs.workspace_id) = TRUE
                    LIMIT 5
                    """
                )

                for row in rows:
                    workspace_id = row["workspace_id"]

                    # Check if job already exists
                    existing = await self.cleanup_repo.get_running_job(workspace_id)
                    if existing:
                        continue

                    # Create scheduled job
                    await self.cleanup_repo.create_job(
                        workspace_id=workspace_id,
                        job_type="full_scan",
                        scheduled_at=now,
                    )

                    logger.info(
                        "Created scheduled cleanup job",
                        extra={
                            "workspace_id": str(workspace_id),
                            "interval_days": row["auto_analysis_interval_days"],
                        },
                    )

        except Exception as e:
            logger.warning(
                "Failed to check scheduled cleanup jobs",
                extra={"error": str(e)},
            )


async def run_cleanup_worker():
    """Entry point for running the cleanup worker standalone."""
    import signal

    worker = CleanupWorker()

    # Handle shutdown signals
    loop = asyncio.get_event_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, worker.signal_shutdown)

    await worker.run()


def main():
    """Main entry point."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )
    asyncio.run(run_cleanup_worker())


if __name__ == "__main__":
    main()
