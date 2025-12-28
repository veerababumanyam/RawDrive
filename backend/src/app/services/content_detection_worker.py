"""Background worker for content detection (AI tagging) processing.

Handles asynchronous processing of content detection jobs:
- Fetch pending detection jobs from queue
- Download asset from storage
- Run content detection with AI providers
- Store AI-generated tags in database

Architecture follows face_detection_worker.py pattern exactly.

Requirements: Smart Tagging Layer - T018
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.services.content_detection_service import (
    ContentDetectionService,
    get_content_detection_service,
)
from app.repositories.content_job_repository import (
    ContentJobRepository,
    get_content_job_repository,
)
from app.services.r2_storage_service import get_r2_storage_service


logger = logging.getLogger(__name__)


# Worker configuration (matches face_detection_worker.py)
BATCH_SIZE = 10  # Jobs to process per batch
MAX_RETRIES = 3  # Maximum retry attempts
RETRY_DELAY_SECONDS = 60  # Initial delay before retry (exponential backoff: 60, 120, 240)
POLLING_INTERVAL_SECONDS = 5  # How often to check for new jobs
JOB_TIMEOUT_SECONDS = 120  # Maximum time for a single job (2 minutes)
STALE_JOB_TIMEOUT_MINUTES = 10  # Jobs "processing" longer than this are stale
CONCURRENT_JOBS = 5  # Number of jobs to process concurrently


class ContentDetectionWorker:
    """Background worker for processing content detection jobs.

    This worker:
    1. Polls for pending content detection jobs
    2. Downloads and decrypts assets from storage
    3. Calls AI providers for label detection
    4. Stores results as AI tags via TagService
    5. Handles retries with exponential backoff

    Follows same patterns as FaceDetectionWorker for consistency.
    """

    def __init__(
        self,
        detection_service: Optional[ContentDetectionService] = None,
        job_repo: Optional[ContentJobRepository] = None,
    ):
        """Initialize the worker with dependencies.

        Args:
            detection_service: Content detection service
            job_repo: Content job repository
        """
        self._detection_service = detection_service
        self._job_repo = job_repo
        self._running = False
        self._storage_service = None

    @property
    def detection_service(self) -> ContentDetectionService:
        """Lazy load detection service."""
        if self._detection_service is None:
            self._detection_service = get_content_detection_service()
        return self._detection_service

    @property
    def job_repo(self) -> ContentJobRepository:
        """Lazy load job repository."""
        if self._job_repo is None:
            self._job_repo = get_content_job_repository()
        return self._job_repo

    @property
    def storage_service(self):
        """Lazy load storage service."""
        if self._storage_service is None:
            self._storage_service = get_r2_storage_service()
        return self._storage_service

    # =========================================================================
    # WORKER LIFECYCLE
    # =========================================================================

    async def start(self) -> None:
        """Start the worker polling loop."""
        if self._running:
            logger.warning("Content detection worker already running")
            return

        self._running = True
        logger.info("Content detection worker started")

        while self._running:
            try:
                # Fetch and process pending jobs
                jobs_processed = await self._process_batch()

                if jobs_processed == 0:
                    # No jobs, wait before polling again
                    await asyncio.sleep(POLLING_INTERVAL_SECONDS)

            except Exception as e:
                logger.exception(
                    "Worker error during batch processing",
                    extra={"error": str(e)},
                )
                await asyncio.sleep(POLLING_INTERVAL_SECONDS)

        logger.info("Content detection worker stopped")

    async def stop(self) -> None:
        """Stop the worker gracefully."""
        logger.info("Stopping content detection worker...")
        self._running = False

    @property
    def is_running(self) -> bool:
        """Check if worker is running."""
        return self._running

    # =========================================================================
    # JOB PROCESSING
    # =========================================================================

    async def _process_batch(self) -> int:
        """Fetch and process a batch of pending jobs concurrently.

        Uses asyncio.gather for concurrent processing with per-job timeouts
        to ensure no single job blocks others.

        Returns:
            Number of jobs processed successfully
        """
        # First, recover any stale jobs that got stuck
        await self._recover_stale_jobs()

        # Fetch jobs using repository (FOR UPDATE SKIP LOCKED)
        jobs = await self.job_repo.fetch_pending_jobs(BATCH_SIZE)

        if not jobs:
            return 0

        # Mark jobs as processing
        for job in jobs:
            await self.job_repo.mark_processing(job["id"])

        # Process jobs concurrently with timeout protection
        async def process_with_timeout(job: dict) -> bool:
            """Process a single job with timeout, returns True on success."""
            try:
                await asyncio.wait_for(
                    self._process_job(job),
                    timeout=JOB_TIMEOUT_SECONDS,
                )
                return True
            except asyncio.TimeoutError:
                logger.error(
                    "Content detection job timed out",
                    extra={
                        "job_id": str(job["id"]),
                        "asset_id": str(job["asset_id"]),
                        "timeout_seconds": JOB_TIMEOUT_SECONDS,
                    },
                )
                await self._handle_job_failure(
                    job, f"Job timed out after {JOB_TIMEOUT_SECONDS}s"
                )
                return False
            except Exception as e:
                logger.exception(
                    "Failed to process content detection job",
                    extra={
                        "job_id": str(job["id"]),
                        "asset_id": str(job["asset_id"]),
                        "error": str(e),
                    },
                )
                await self._handle_job_failure(job, str(e))
                return False

        # Process up to CONCURRENT_JOBS at a time
        results = await asyncio.gather(
            *[process_with_timeout(job) for job in jobs[:CONCURRENT_JOBS]],
            return_exceptions=True,
        )

        # Count successful jobs (not exceptions and returned True)
        processed = sum(1 for r in results if r is True)

        return processed

    async def _recover_stale_jobs(self) -> None:
        """Recover jobs stuck in 'processing' state."""
        try:
            count = await self.job_repo.recover_stale_jobs(
                timeout_minutes=STALE_JOB_TIMEOUT_MINUTES,
                max_retries=MAX_RETRIES,
            )
            if count > 0:
                logger.warning(
                    "Recovered stale content detection jobs",
                    extra={"count": count},
                )
        except Exception as e:
            logger.warning(
                "Failed to recover stale jobs",
                extra={"error": str(e)},
            )

    async def _process_job(self, job: dict[str, Any]) -> None:
        """Process a single content detection job.

        Args:
            job: Job record from database
        """
        job_id = job["id"]
        asset_id = job["asset_id"]
        workspace_id = job["workspace_id"]

        logger.info(
            "Processing content detection job",
            extra={
                "job_id": str(job_id),
                "asset_id": str(asset_id),
                "retry_count": job.get("retry_count", 0),
            },
        )

        # Fetch asset to get storage key
        asset = await self._get_asset(asset_id, workspace_id)
        if not asset:
            await self.job_repo.mark_failed(
                job_id,
                error_message="Asset not found",
            )
            return

        # Get storage key
        object_key = asset.get("original_object_key")
        if not object_key:
            await self.job_repo.mark_failed(
                job_id,
                error_message="Asset has no storage object",
            )
            return

        try:
            # Download encrypted asset from R2
            encrypted_data = await self.storage_service.download_by_object_key(
                object_key
            )

            # Decrypt the asset
            from app.services.encryption_service import get_encryption_service

            encryption_service = get_encryption_service()
            image_buffer = await encryption_service.decrypt_file(
                encrypted_data,
                workspace_id,
                asset_id,
                variant="original",
            )
        except Exception as e:
            await self.job_repo.mark_failed(
                job_id,
                error_message=f"Failed to download/decrypt asset: {str(e)}",
            )
            return

        # Run content detection
        result = await self.detection_service.detect_content(
            asset_id=asset_id,
            workspace_id=workspace_id,
            image_buffer=image_buffer,
        )

        # Mark job as completed
        await self.job_repo.mark_completed(job_id)

        logger.info(
            "Content detection job completed",
            extra={
                "job_id": str(job_id),
                "asset_id": str(asset_id),
                "tags_detected": len(result.get("tags", [])),
                "provider": result.get("provider"),
            },
        )

    async def _handle_job_failure(
        self,
        job: dict[str, Any],
        error_message: str,
    ) -> None:
        """Handle a failed job with retry logic.

        Args:
            job: Failed job record
            error_message: Error description
        """
        job_id = job["id"]
        retry_count = job.get("retry_count", 0)

        if retry_count < MAX_RETRIES:
            # Schedule retry with exponential backoff
            next_retry_count = retry_count + 1
            delay = RETRY_DELAY_SECONDS * (2**retry_count)

            await self.job_repo.schedule_retry(
                job_id,
                retry_count=next_retry_count,
                delay_seconds=delay,
                error_message=error_message,
            )

            logger.info(
                "Content detection job scheduled for retry",
                extra={
                    "job_id": str(job_id),
                    "retry_count": next_retry_count,
                    "delay_seconds": delay,
                },
            )
        else:
            # Max retries exceeded, mark as failed
            await self.job_repo.mark_failed(
                job_id,
                error_message=f"Max retries exceeded. Last error: {error_message}",
            )

            logger.error(
                "Content detection job failed after max retries",
                extra={"job_id": str(job_id)},
            )

    # =========================================================================
    # DATABASE OPERATIONS
    # =========================================================================

    async def _get_asset(
        self,
        asset_id: UUID,
        workspace_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Fetch asset record from database.

        Args:
            asset_id: Asset ID
            workspace_id: Workspace ID for tenant isolation

        Returns:
            Asset record or None if not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT asset_id, workspace_id, original_object_key, status, mime_type
                FROM assets
                WHERE asset_id = $1 AND workspace_id = $2 AND status = 'available'
                """,
                asset_id,
                workspace_id,
            )
            return dict(row) if row else None

    async def get_stats(self) -> dict[str, Any]:
        """Get worker statistics for health endpoint.

        Returns:
            Dict with job queue stats
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            stats = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) as total_jobs,
                    COUNT(*) FILTER (WHERE status = 'completed') as completed,
                    COUNT(*) FILTER (WHERE status = 'pending') as pending,
                    COUNT(*) FILTER (WHERE status = 'processing') as processing,
                    COUNT(*) FILTER (WHERE status = 'failed') as failed
                FROM content_detection_jobs
                """,
            )

            return {
                "total_jobs": stats["total_jobs"],
                "completed": stats["completed"],
                "pending": stats["pending"],
                "processing": stats["processing"],
                "failed": stats["failed"],
                "is_running": self._running,
            }


# =============================================================================
# SINGLETON PATTERN
# =============================================================================

_content_detection_worker: Optional[ContentDetectionWorker] = None


def get_content_detection_worker() -> ContentDetectionWorker:
    """Get singleton content detection worker instance."""
    global _content_detection_worker
    if _content_detection_worker is None:
        _content_detection_worker = ContentDetectionWorker()
    return _content_detection_worker
