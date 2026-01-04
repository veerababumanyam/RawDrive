"""Repository for content_detection_jobs table operations.

This module provides the ContentJobRepository class that handles job queue
operations for AI content/vision analysis jobs.

Uses PostgreSQL's FOR UPDATE SKIP LOCKED for concurrent job fetching,
mirroring the face_detection_jobs pattern.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import acquire_conn, get_postgres_pool


logger = logging.getLogger(__name__)


class ContentJobStatus(str, Enum):
    """Content detection job status values."""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


# Job queue configuration (matching face_detection_worker)
DEFAULT_BATCH_SIZE = 10
MAX_RETRIES = 3
RETRY_DELAY_SECONDS = 60
STALE_JOB_TIMEOUT_MINUTES = 10


class ContentJobRepository:
    """Data access layer for content detection jobs.

    Handles job queue operations with proper concurrency control
    using FOR UPDATE SKIP LOCKED.
    """

    # =========================================================================
    # CREATE OPERATIONS
    # =========================================================================

    async def create(
        self,
        asset_id: UUID,
        workspace_id: UUID,
        priority: int = 5,
    ) -> Optional[UUID]:
        """Create a new content detection job.

        Uses ON CONFLICT DO NOTHING to prevent duplicate jobs per asset.

        Args:
            asset_id: Asset to analyze
            workspace_id: Workspace ID for tenant isolation
            priority: Job priority (0=batch, 5=upload, 10=manual)

        Returns:
            Job ID if created, or existing job ID if duplicate
        """
        pool = await get_postgres_pool()
        async with acquire_conn(pool) as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO content_detection_jobs (
                    workspace_id, asset_id, status, priority
                )
                VALUES ($1, $2, 'pending', $3)
                ON CONFLICT (asset_id) DO NOTHING
                RETURNING id
                """,
                workspace_id,
                asset_id,
                priority,
            )

            if row:
                logger.debug(
                    "Content detection job created",
                    extra={
                        "asset_id": str(asset_id),
                        "job_id": str(row["id"]),
                        "priority": priority,
                    },
                )
                return row["id"]

            # Job already exists - return existing
            existing = await conn.fetchval(
                "SELECT id FROM content_detection_jobs WHERE asset_id = $1",
                asset_id,
            )
            return existing

    async def create_or_reset(
        self,
        asset_id: UUID,
        workspace_id: UUID,
        priority: int = 10,
    ) -> UUID:
        """Create a new job or reset existing job for re-analysis.

        Unlike create(), this will reset a completed/failed job to pending
        for re-analysis.

        Args:
            asset_id: Asset to analyze
            workspace_id: Workspace ID
            priority: Job priority (default 10 for manual re-analysis)

        Returns:
            Job ID
        """
        pool = await get_postgres_pool()
        async with acquire_conn(pool) as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO content_detection_jobs (
                    workspace_id, asset_id, status, priority
                )
                VALUES ($1, $2, 'pending', $3)
                ON CONFLICT (asset_id) DO UPDATE SET
                    status = 'pending',
                    priority = GREATEST(content_detection_jobs.priority, EXCLUDED.priority),
                    retry_count = 0,
                    error_message = NULL,
                    started_at = NULL,
                    completed_at = NULL,
                    scheduled_at = NOW(),
                    created_at = NOW()
                RETURNING id
                """,
                workspace_id,
                asset_id,
                priority,
            )

            logger.info(
                "Content detection job created/reset for re-analysis",
                extra={"asset_id": str(asset_id), "job_id": str(row["id"])},
            )

            return row["id"]

    # =========================================================================
    # READ OPERATIONS
    # =========================================================================

    async def find_by_id(
        self,
        job_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Find a job by ID.

        Args:
            job_id: Job ID

        Returns:
            Job record or None
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM content_detection_jobs WHERE id = $1",
                job_id,
            )
            return self._row_to_dict(row) if row else None

    async def find_by_asset_id(
        self,
        asset_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Find a job by asset ID.

        Args:
            asset_id: Asset ID

        Returns:
            Job record or None
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM content_detection_jobs WHERE asset_id = $1",
                asset_id,
            )
            return self._row_to_dict(row) if row else None

    async def fetch_pending_jobs(
        self,
        limit: int = DEFAULT_BATCH_SIZE,
    ) -> list[dict[str, Any]]:
        """Fetch and lock pending jobs for processing.

        Uses FOR UPDATE SKIP LOCKED for concurrent processing:
        - Locks selected rows so other workers skip them
        - Orders by priority (DESC) then scheduled_at (ASC)
        - Automatically marks fetched jobs as 'processing'

        Args:
            limit: Maximum jobs to fetch

        Returns:
            List of job records (already marked as processing)
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Fetch and lock jobs
            rows = await conn.fetch(
                """
                SELECT id, workspace_id, asset_id, status, priority, retry_count
                FROM content_detection_jobs
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

            # Mark as processing in same transaction
            job_ids = [row["id"] for row in rows]
            await conn.execute(
                """
                UPDATE content_detection_jobs
                SET status = 'processing', started_at = NOW()
                WHERE id = ANY($1)
                """,
                job_ids,
            )

            logger.debug(
                "Fetched pending content detection jobs",
                extra={"count": len(rows)},
            )

            return [dict(row) for row in rows]

    async def find_stale_processing_jobs(
        self,
        stale_minutes: int = STALE_JOB_TIMEOUT_MINUTES,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """Find jobs stuck in processing state.

        Args:
            stale_minutes: Minutes after which a processing job is stale
            limit: Maximum results

        Returns:
            List of stale job records
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT *
                FROM content_detection_jobs
                WHERE status = 'processing'
                  AND started_at < NOW() - INTERVAL '1 minute' * $1
                  AND retry_count < $2
                ORDER BY started_at ASC
                LIMIT $3
                """,
                stale_minutes,
                MAX_RETRIES,
                limit,
            )

            return [self._row_to_dict(row) for row in rows]

    async def find_by_workspace(
        self,
        workspace_id: UUID,
        status: Optional[ContentJobStatus] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Find jobs for a workspace.

        Args:
            workspace_id: Workspace ID
            status: Optional status filter
            limit: Maximum results
            offset: Pagination offset

        Returns:
            List of job records
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            if status:
                rows = await conn.fetch(
                    """
                    SELECT *
                    FROM content_detection_jobs
                    WHERE workspace_id = $1 AND status = $2
                    ORDER BY created_at DESC
                    LIMIT $3 OFFSET $4
                    """,
                    workspace_id,
                    status.value,
                    limit,
                    offset,
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT *
                    FROM content_detection_jobs
                    WHERE workspace_id = $1
                    ORDER BY created_at DESC
                    LIMIT $2 OFFSET $3
                    """,
                    workspace_id,
                    limit,
                    offset,
                )

            return [self._row_to_dict(row) for row in rows]

    # =========================================================================
    # UPDATE OPERATIONS
    # =========================================================================

    async def mark_completed(
        self,
        job_id: UUID,
        tags_detected: int,
        provider_used: str,
    ) -> Optional[dict[str, Any]]:
        """Mark a job as successfully completed.

        Args:
            job_id: Job ID
            tags_detected: Number of tags found
            provider_used: AI provider that processed

        Returns:
            Updated job record or None
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE content_detection_jobs
                SET
                    status = 'completed',
                    tags_detected = $2,
                    provider_used = $3,
                    error_message = NULL,
                    completed_at = NOW()
                WHERE id = $1
                RETURNING *
                """,
                job_id,
                tags_detected,
                provider_used,
            )

            if row:
                logger.info(
                    "Content detection job completed",
                    extra={
                        "job_id": str(job_id),
                        "tags_detected": tags_detected,
                        "provider": provider_used,
                    },
                )

            return self._row_to_dict(row) if row else None

    async def mark_failed(
        self,
        job_id: UUID,
        error_message: str,
    ) -> Optional[dict[str, Any]]:
        """Mark a job as failed.

        Args:
            job_id: Job ID
            error_message: Error description

        Returns:
            Updated job record or None
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE content_detection_jobs
                SET
                    status = 'failed',
                    error_message = $2,
                    completed_at = NOW()
                WHERE id = $1
                RETURNING *
                """,
                job_id,
                error_message,
            )

            if row:
                logger.warning(
                    "Content detection job failed",
                    extra={"job_id": str(job_id), "error": error_message},
                )

            return self._row_to_dict(row) if row else None

    async def schedule_retry(
        self,
        job_id: UUID,
        retry_count: int,
        delay_seconds: int,
    ) -> Optional[dict[str, Any]]:
        """Schedule a job for retry after delay.

        Args:
            job_id: Job ID
            retry_count: New retry count
            delay_seconds: Seconds until retry

        Returns:
            Updated job record or None
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE content_detection_jobs
                SET
                    status = 'pending',
                    retry_count = $2,
                    scheduled_at = NOW() + INTERVAL '1 second' * $3,
                    started_at = NULL,
                    error_message = NULL
                WHERE id = $1
                RETURNING *
                """,
                job_id,
                retry_count,
                delay_seconds,
            )

            if row:
                logger.info(
                    "Content detection job scheduled for retry",
                    extra={
                        "job_id": str(job_id),
                        "retry_count": retry_count,
                        "delay_seconds": delay_seconds,
                    },
                )

            return self._row_to_dict(row) if row else None

    async def recover_stale_jobs(
        self,
        stale_minutes: int = STALE_JOB_TIMEOUT_MINUTES,
    ) -> int:
        """Recover jobs stuck in processing state.

        Resets stale processing jobs to pending for retry.

        Args:
            stale_minutes: Minutes after which a job is stale

        Returns:
            Number of jobs recovered
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE content_detection_jobs
                SET
                    status = 'pending',
                    retry_count = retry_count + 1,
                    scheduled_at = NOW() + INTERVAL '30 seconds',
                    started_at = NULL,
                    error_message = 'Recovered from stale processing state'
                WHERE status = 'processing'
                  AND started_at < NOW() - INTERVAL '1 minute' * $1
                  AND retry_count < $2
                """,
                stale_minutes,
                MAX_RETRIES,
            )

            if result and "UPDATE" in result:
                count = int(result.split()[1])
                if count > 0:
                    logger.warning(
                        "Recovered stale content detection jobs",
                        extra={"count": count},
                    )
                return count

            return 0

    # =========================================================================
    # DELETE OPERATIONS
    # =========================================================================

    async def delete(
        self,
        job_id: UUID,
    ) -> bool:
        """Delete a job.

        Args:
            job_id: Job ID

        Returns:
            True if deleted
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM content_detection_jobs WHERE id = $1",
                job_id,
            )
            return result and int(result.split()[-1]) > 0

    async def delete_by_asset_id(
        self,
        asset_id: UUID,
    ) -> bool:
        """Delete job for an asset.

        Args:
            asset_id: Asset ID

        Returns:
            True if deleted
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM content_detection_jobs WHERE asset_id = $1",
                asset_id,
            )
            return result and int(result.split()[-1]) > 0

    async def cleanup_old_jobs(
        self,
        older_than_minutes: int = 60,
    ) -> int:
        """Delete old completed/failed jobs.

        Args:
            older_than_minutes: Age threshold

        Returns:
            Number of jobs deleted
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM content_detection_jobs
                WHERE status IN ('completed', 'failed')
                  AND created_at < NOW() - INTERVAL '1 minute' * $1
                """,
                older_than_minutes,
            )

            if result and "DELETE" in result:
                count = int(result.split()[1])
                if count > 0:
                    logger.info(
                        "Cleaned up old content detection jobs",
                        extra={"count": count},
                    )
                return count

            return 0

    # =========================================================================
    # STATISTICS
    # =========================================================================

    async def count_by_status(
        self,
        workspace_id: Optional[UUID] = None,
    ) -> dict[str, int]:
        """Get job counts by status.

        Args:
            workspace_id: Optional workspace filter

        Returns:
            Dict mapping status -> count
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            if workspace_id:
                rows = await conn.fetch(
                    """
                    SELECT status, COUNT(*) as count
                    FROM content_detection_jobs
                    WHERE workspace_id = $1
                    GROUP BY status
                    """,
                    workspace_id,
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT status, COUNT(*) as count
                    FROM content_detection_jobs
                    GROUP BY status
                    """
                )

            return {row["status"]: row["count"] for row in rows}

    async def get_queue_stats(self) -> dict[str, Any]:
        """Get overall queue statistics.

        Returns:
            Queue stats dict
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) FILTER (WHERE status = 'pending') as pending,
                    COUNT(*) FILTER (WHERE status = 'processing') as processing,
                    COUNT(*) FILTER (WHERE status = 'completed') as completed,
                    COUNT(*) FILTER (WHERE status = 'failed') as failed,
                    MAX(created_at) FILTER (WHERE status = 'completed') as last_completed_at
                FROM content_detection_jobs
                """
            )

            return {
                "pending": row["pending"] or 0,
                "processing": row["processing"] or 0,
                "completed": row["completed"] or 0,
                "failed": row["failed"] or 0,
                "last_completed_at": row["last_completed_at"].isoformat() if row["last_completed_at"] else None,
            }

    # =========================================================================
    # HELPER METHODS
    # =========================================================================

    def _row_to_dict(self, row: Any) -> Optional[dict[str, Any]]:
        """Convert database row to dict."""
        if row is None:
            return None

        result = dict(row)

        # Convert timestamps to ISO strings
        for field in ("scheduled_at", "started_at", "completed_at", "created_at"):
            if field in result and result[field]:
                result[field] = result[field].isoformat()

        return result


# Singleton instance
_repository: Optional[ContentJobRepository] = None


def get_content_job_repository() -> ContentJobRepository:
    """Get singleton repository instance."""
    global _repository
    if _repository is None:
        _repository = ContentJobRepository()
    return _repository
