"""Background worker for face detection processing.

Handles asynchronous processing of face detection jobs:
- Fetch pending detection jobs from queue
- Download photo from storage
- Run face detection with AI providers
- Store results in database
- Generate face thumbnails

Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.services.face_detection_service import (
    FaceDetectionService,
    get_face_detection_service,
)
from app.services.face_thumbnail_service import (
    FaceThumbnailService,
    get_face_thumbnail_service,
)
from app.services.face_configuration_service import (
    FaceConfigurationService,
    get_face_configuration_service,
)
from app.services.r2_storage_service import get_r2_storage_service
from app.services.task_queue import register_task_handler
from app.api.face_schemas import FaceDetectionJobStatus


logger = logging.getLogger(__name__)


# Worker configuration
BATCH_SIZE = 10  # Jobs to process per batch
MAX_RETRIES = 3  # Maximum retry attempts
RETRY_DELAY_SECONDS = 60  # Initial delay before retry
POLLING_INTERVAL_SECONDS = 5  # How often to check for new jobs
JOB_TIMEOUT_SECONDS = 120  # Maximum time for a single job (2 minutes)
STALE_JOB_TIMEOUT_MINUTES = 10  # Jobs "processing" longer than this are considered stale
CONCURRENT_JOBS = 5  # Number of jobs to process concurrently (increased for parallel processing)
OLD_JOB_CLEANUP_MINUTES = 60  # Jobs older than this are auto-deleted to prevent blocking


class FaceDetectionWorker:
    """Background worker for processing face detection jobs.
    
    This worker:
    1. Polls for pending detection jobs
    2. Processes jobs with retry logic
    3. Updates job status throughout processing
    4. Respects global processing toggle
    5. Supports priority ordering
    
    Requirements: 5.1-5.6
    """
    
    def __init__(
        self,
        detection_service: Optional[FaceDetectionService] = None,
        thumbnail_service: Optional[FaceThumbnailService] = None,
        config_service: Optional[FaceConfigurationService] = None,
    ):
        """Initialize the worker with dependencies.
        
        Args:
            detection_service: Face detection service
            thumbnail_service: Thumbnail generation service
            config_service: Configuration service
        """
        self._detection_service = detection_service
        self._thumbnail_service = thumbnail_service
        self._config_service = config_service
        self._running = False
        self._storage_service = None
    
    @property
    def detection_service(self) -> FaceDetectionService:
        """Lazy load detection service."""
        if self._detection_service is None:
            self._detection_service = get_face_detection_service()
        return self._detection_service
    
    @property
    def thumbnail_service(self) -> FaceThumbnailService:
        """Lazy load thumbnail service."""
        if self._thumbnail_service is None:
            self._thumbnail_service = get_face_thumbnail_service()
        return self._thumbnail_service
    
    @property
    def config_service(self) -> FaceConfigurationService:
        """Lazy load configuration service."""
        if self._config_service is None:
            self._config_service = get_face_configuration_service()
        return self._config_service
    
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
            logger.warning("Worker already running")
            return
        
        self._running = True
        logger.info("Face detection worker started")
        
        while self._running:
            try:
                # Check if processing is globally enabled
                if not await self._is_processing_enabled():
                    await asyncio.sleep(POLLING_INTERVAL_SECONDS * 2)
                    continue
                
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
        
        logger.info("Face detection worker stopped")
    
    async def stop(self) -> None:
        """Stop the worker gracefully."""
        logger.info("Stopping face detection worker...")
        self._running = False
    
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
        
        # Fetch jobs
        jobs = await self._fetch_pending_jobs(BATCH_SIZE)
        
        if not jobs:
            return 0
        
        # Process jobs concurrently with timeout protection
        async def process_with_timeout(job: dict) -> bool:
            """Process a single job with timeout, returns True on success."""
            try:
                await asyncio.wait_for(
                    self._process_job(job),
                    timeout=JOB_TIMEOUT_SECONDS
                )
                return True
            except asyncio.TimeoutError:
                logger.error(
                    "Job timed out",
                    extra={
                        "job_id": str(job["id"]),
                        "photo_id": str(job["photo_id"]),
                        "timeout_seconds": JOB_TIMEOUT_SECONDS,
                    },
                )
                await self._handle_job_failure(job, f"Job timed out after {JOB_TIMEOUT_SECONDS}s")
                return False
            except Exception as e:
                logger.exception(
                    "Failed to process job",
                    extra={
                        "job_id": str(job["id"]),
                        "photo_id": str(job["photo_id"]),
                        "error": str(e),
                    },
                )
                await self._handle_job_failure(job, str(e))
                return False
        
        # Process up to CONCURRENT_JOBS at a time
        results = await asyncio.gather(
            *[process_with_timeout(job) for job in jobs[:CONCURRENT_JOBS]],
            return_exceptions=True
        )
        
        # Count successful jobs (not exceptions and returned True)
        processed = sum(1 for r in results if r is True)
        
        return processed
    
    async def _recover_stale_jobs(self) -> None:
        """Recover jobs stuck in 'processing' state and cleanup old jobs.

        1. Jobs stuck in 'processing' for more than STALE_JOB_TIMEOUT_MINUTES
           are reset to 'pending' for retry.
        2. Jobs older than OLD_JOB_CLEANUP_MINUTES are auto-deleted to prevent
           blocking new jobs.
        """
        try:
            pool = await get_postgres_pool()
            async with pool.acquire() as conn:
                # First, delete jobs older than 1 hour to prevent blocking
                delete_result = await conn.execute(
                    """
                    DELETE FROM face_detection_jobs
                    WHERE created_at < NOW() - INTERVAL '1 minute' * $1
                    """,
                    OLD_JOB_CLEANUP_MINUTES,
                )

                if delete_result and "DELETE" in delete_result:
                    deleted_count = int(delete_result.split()[1])
                    if deleted_count > 0:
                        logger.warning(
                            "Deleted old jobs blocking queue",
                            extra={"count": deleted_count, "older_than_minutes": OLD_JOB_CLEANUP_MINUTES},
                        )

                # Then recover stale processing jobs
                result = await conn.execute(
                    """
                    UPDATE face_detection_jobs
                    SET status = 'pending',
                        retry_count = retry_count + 1,
                        scheduled_at = NOW() + INTERVAL '30 seconds',
                        error_message = 'Recovered from stale processing state'
                    WHERE status = 'processing'
                      AND started_at < NOW() - INTERVAL '1 minute' * $1
                      AND retry_count < $2
                    """,
                    STALE_JOB_TIMEOUT_MINUTES,
                    MAX_RETRIES,
                )

                # result format is "UPDATE N"
                if result and "UPDATE" in result:
                    count = int(result.split()[1])
                    if count > 0:
                        logger.warning(
                            "Recovered stale jobs",
                            extra={"count": count},
                        )
        except Exception as e:
            logger.warning(
                "Failed to recover stale jobs",
                extra={"error": str(e)},
            )
    
    async def _process_job(self, job: dict[str, Any]) -> None:
        """Process a single detection job.
        
        Args:
            job: Job record from database
        """
        job_id = job["id"]
        photo_id = job["photo_id"]
        workspace_id = job["workspace_id"]
        
        logger.info(
            "Processing detection job",
            extra={
                "job_id": str(job_id),
                "photo_id": str(photo_id),
                "retry_count": job.get("retry_count", 0),
            },
        )
        
        # Fetch photo to get storage key
        photo = await self._get_photo(photo_id, workspace_id)
        if not photo:
            await self._update_job_status(
                job_id,
                FaceDetectionJobStatus.FAILED,
                error_message="Photo not found",
            )
            return
        
        # Download photo from storage
        object_key = photo.get("original_object_key")
        if not object_key:
            await self._update_job_status(
                job_id,
                FaceDetectionJobStatus.FAILED,
                error_message="Photo has no storage object",
            )
            return
        
        try:
            # Download encrypted photo from R2
            encrypted_data = await self.storage_service.download_by_object_key(object_key)
            
            # Decrypt the photo
            from app.services.encryption_service import get_encryption_service
            encryption_service = get_encryption_service()
            image_buffer = await encryption_service.decrypt_file(
                encrypted_data, 
                workspace_id, 
                photo_id, 
                variant="original"
            )
        except Exception as e:
            await self._update_job_status(
                job_id,
                FaceDetectionJobStatus.FAILED,
                error_message=f"Failed to download/decrypt photo: {str(e)}",
            )
            return
        
        # Process the photo (detect faces, cluster, etc.)
        faces = await self.detection_service.process_photo(
            photo_id=photo_id,
            workspace_id=workspace_id,
            image_buffer=image_buffer,
        )
        
        # Generate thumbnails for each face
        for face in faces:
            try:
                thumbnail_urls = await self.thumbnail_service.create_and_upload_thumbnails(
                    face_id=face["id"],
                    workspace_id=workspace_id,
                    image_buffer=image_buffer,
                    bounding_box=face["bounding_box"],
                )
                
                # Update face with thumbnail URLs
                if thumbnail_urls:
                    await self._update_face_thumbnails(
                        face["id"], workspace_id, thumbnail_urls
                    )
            except Exception as e:
                logger.warning(
                    "Failed to generate thumbnails for face",
                    extra={"face_id": str(face["id"]), "error": str(e)},
                )
        
        logger.info(
            "Detection job completed",
            extra={
                "job_id": str(job_id),
                "faces_detected": len(faces),
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
            delay = RETRY_DELAY_SECONDS * (2 ** retry_count)
            
            await self._schedule_retry(job_id, next_retry_count, delay)
            
            logger.info(
                "Job scheduled for retry",
                extra={
                    "job_id": str(job_id),
                    "retry_count": next_retry_count,
                    "delay_seconds": delay,
                },
            )
        else:
            # Max retries exceeded, mark as failed
            await self._update_job_status(
                job_id,
                FaceDetectionJobStatus.FAILED,
                error_message=f"Max retries exceeded. Last error: {error_message}",
            )
            
            logger.error(
                "Job failed after max retries",
                extra={"job_id": str(job_id)},
            )
    
    # =========================================================================
    # DATABASE OPERATIONS
    # =========================================================================
    
    async def _fetch_pending_jobs(self, limit: int) -> list[dict[str, Any]]:
        """Fetch pending jobs ordered by priority.
        
        Args:
            limit: Maximum jobs to fetch
            
        Returns:
            List of job records
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id, workspace_id, photo_id, status, priority, retry_count
                FROM face_detection_jobs
                WHERE status = 'pending'
                  AND (scheduled_at IS NULL OR scheduled_at <= NOW())
                ORDER BY priority DESC, created_at ASC
                LIMIT $1
                FOR UPDATE SKIP LOCKED
                """,
                limit,
            )
            
            if not rows:
                return []
            
            # Mark jobs as processing
            job_ids = [row["id"] for row in rows]
            await conn.execute(
                """
                UPDATE face_detection_jobs
                SET status = 'processing', started_at = NOW()
                WHERE id = ANY($1)
                """,
                job_ids,
            )
            
            return [dict(row) for row in rows]
    
    async def _update_job_status(
        self,
        job_id: UUID,
        status: FaceDetectionJobStatus,
        error_message: Optional[str] = None,
        faces_detected: Optional[int] = None,
    ) -> None:
        """Update job status in database."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            updates = ["status = $2"]
            params = [job_id, status.value]
            param_idx = 3
            
            if status in (FaceDetectionJobStatus.COMPLETED, FaceDetectionJobStatus.FAILED):
                updates.append("completed_at = NOW()")
            
            if error_message:
                updates.append(f"error_message = ${param_idx}")
                params.append(error_message)
                param_idx += 1
            
            if faces_detected is not None:
                updates.append(f"faces_detected = ${param_idx}")
                params.append(faces_detected)
                param_idx += 1
            
            await conn.execute(
                f"""
                UPDATE face_detection_jobs
                SET {", ".join(updates)}
                WHERE id = $1
                """,
                *params,
            )
    
    async def _schedule_retry(
        self,
        job_id: UUID,
        retry_count: int,
        delay_seconds: int,
    ) -> None:
        """Schedule a job for retry after delay."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE face_detection_jobs
                SET status = 'pending',
                    retry_count = $2,
                    scheduled_at = NOW() + INTERVAL '1 second' * $3,
                    error_message = NULL
                WHERE id = $1
                """,
                job_id,
                retry_count,
                delay_seconds,
            )
    
    async def _get_photo(
        self,
        photo_id: UUID,
        workspace_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Fetch photo record from database."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT asset_id, workspace_id, original_object_key
                FROM assets
                WHERE asset_id = $1 AND workspace_id = $2 AND type = 'photo'
                """,
                photo_id,
                workspace_id,
            )
            return dict(row) if row else None
    
    async def _update_face_thumbnails(
        self,
        face_id: UUID,
        workspace_id: UUID,
        thumbnail_urls: dict[str, str],
    ) -> None:
        """Update face with generated thumbnail URLs."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Pass dict directly - asyncpg handles dict -> JSONB conversion
            # Do NOT use json.dumps() as it would double-encode the JSON
            await conn.execute(
                """
                UPDATE faces
                SET thumbnail_urls = $1, updated_at = NOW()
                WHERE id = $2 AND workspace_id = $3
                """,
                thumbnail_urls,  # asyncpg converts dict to JSONB directly
                face_id,
                workspace_id,
            )
    
    async def _is_processing_enabled(self) -> bool:
        """Check if global face detection processing is enabled."""
        try:
            value = await self.config_service.get_face_detection_setting(
                "global_processing_enabled"
            )
            if value is not None:
                return value.lower() == "true"
            return True  # Default to enabled
        except Exception:
            return True


# Task handler for integration with task queue
@register_task_handler("face_detection")
async def process_face_detection_task(payload: dict[str, Any]) -> dict[str, Any]:
    """Task queue handler for face detection.
    
    Args:
        payload: {
            "photo_id": str (UUID),
            "workspace_id": str (UUID),
            "priority": int (optional),
        }
        
    Returns:
        {"status": "queued", "job_id": str}
    """
    photo_id = UUID(payload["photo_id"])
    workspace_id = UUID(payload["workspace_id"])
    priority = payload.get("priority", 0)
    
    detection_service = get_face_detection_service()
    job_id = await detection_service.create_detection_job(
        photo_id=photo_id,
        workspace_id=workspace_id,
        priority=priority,
    )
    
    return {"status": "queued", "job_id": str(job_id)}


# Singleton worker instance
_worker: Optional[FaceDetectionWorker] = None


def get_face_detection_worker() -> FaceDetectionWorker:
    """Get singleton worker instance."""
    global _worker
    if _worker is None:
        _worker = FaceDetectionWorker()
    return _worker
