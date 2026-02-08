"""Repository for face embedding retention jobs.

Provides database operations for face data retention policy enforcement.

Feature: Face Detection Audit Remediation (002-face-audit-remediation)
Finding: COM-002 - Face Data Retention Policy

Tasks: T030-T035
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.models.face_embedding_retention_job import (
    FaceEmbeddingRetentionJob,
    FaceEmbeddingRetentionJobCreate,
    FaceEmbeddingRetentionJobUpdate,
    FaceEmbeddingRetentionJobSummary,
    RetentionJobProgress,
    RetentionJobStatus,
    RetentionJobType,
    RetentionStats,
)

logger = logging.getLogger(__name__)


# Default retention period (30 days per COM-002)
DEFAULT_RETENTION_DAYS = 30


class FaceRetentionRepository:
    """Repository for face embedding retention jobs.

    Provides CRUD operations for retention cleanup jobs
    stored in the face_embedding_retention_jobs table.
    """

    # =========================================================================
    # JOB CRUD OPERATIONS
    # =========================================================================

    async def create_job(
        self,
        job_data: FaceEmbeddingRetentionJobCreate,
    ) -> FaceEmbeddingRetentionJob:
        """Create a new retention job.

        Args:
            job_data: Job creation data

        Returns:
            Created FaceEmbeddingRetentionJob
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO face_embedding_retention_jobs (
                    workspace_id,
                    job_type,
                    status,
                    retention_cutoff_date,
                    retention_days,
                    batch_size,
                    triggered_by,
                    trigger_reason
                ) VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7)
                RETURNING *
                """,
                job_data.workspace_id,
                job_data.job_type.value,
                job_data.retention_cutoff_date,
                job_data.retention_days,
                job_data.batch_size,
                job_data.triggered_by,
                job_data.trigger_reason,
            )

            logger.info(
                "Retention job created",
                extra={
                    "job_id": str(row["id"]),
                    "workspace_id": str(job_data.workspace_id) if job_data.workspace_id else None,
                    "job_type": job_data.job_type.value,
                },
            )

            return self._map_job(row)

    async def get_job(
        self,
        job_id: UUID,
    ) -> Optional[FaceEmbeddingRetentionJob]:
        """Get a retention job by ID.

        Args:
            job_id: Job ID

        Returns:
            FaceEmbeddingRetentionJob or None
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM face_embedding_retention_jobs
                WHERE id = $1
                """,
                job_id,
            )

            if not row:
                return None

            return self._map_job(row)

    async def get_pending_jobs(
        self,
        limit: int = 10,
    ) -> list[FaceEmbeddingRetentionJob]:
        """Get pending jobs ordered by creation time.

        Args:
            limit: Maximum number of jobs to return

        Returns:
            List of pending jobs
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM face_embedding_retention_jobs
                WHERE status = 'pending'
                ORDER BY created_at ASC
                LIMIT $1
                """,
                limit,
            )

            return [self._map_job(row) for row in rows]

    async def get_running_jobs(
        self,
    ) -> list[FaceEmbeddingRetentionJob]:
        """Get currently running jobs.

        Returns:
            List of running jobs
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM face_embedding_retention_jobs
                WHERE status = 'running'
                ORDER BY started_at ASC
                """,
            )

            return [self._map_job(row) for row in rows]

    async def get_jobs_by_workspace(
        self,
        workspace_id: UUID,
        limit: int = 20,
    ) -> list[FaceEmbeddingRetentionJobSummary]:
        """Get jobs for a workspace.

        Args:
            workspace_id: Workspace ID
            limit: Maximum number of jobs to return

        Returns:
            List of job summaries
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT * FROM face_embedding_retention_jobs
                WHERE workspace_id = $1
                ORDER BY created_at DESC
                LIMIT $2
                """,
                workspace_id,
                limit,
            )

            return [self._map_summary(row) for row in rows]

    async def update_job(
        self,
        job_id: UUID,
        update_data: FaceEmbeddingRetentionJobUpdate,
    ) -> Optional[FaceEmbeddingRetentionJob]:
        """Update a retention job.

        Args:
            job_id: Job ID
            update_data: Fields to update

        Returns:
            Updated job or None if not found
        """
        updates = []
        values = [job_id]
        param_idx = 2

        if update_data.status is not None:
            updates.append(f"status = ${param_idx}")
            values.append(update_data.status.value)
            param_idx += 1

            # Set started_at if transitioning to running
            if update_data.status == RetentionJobStatus.RUNNING:
                updates.append(f"started_at = NOW()")

            # Set completed_at if transitioning to terminal state
            if update_data.status in (
                RetentionJobStatus.COMPLETED,
                RetentionJobStatus.FAILED,
                RetentionJobStatus.CANCELLED,
            ):
                updates.append(f"completed_at = NOW()")

        if update_data.processed_embeddings is not None:
            updates.append(f"processed_embeddings = ${param_idx}")
            values.append(update_data.processed_embeddings)
            param_idx += 1

        if update_data.deleted_embeddings is not None:
            updates.append(f"deleted_embeddings = ${param_idx}")
            values.append(update_data.deleted_embeddings)
            param_idx += 1

        if update_data.skipped_embeddings is not None:
            updates.append(f"skipped_embeddings = ${param_idx}")
            values.append(update_data.skipped_embeddings)
            param_idx += 1

        if update_data.last_processed_face_id is not None:
            updates.append(f"last_processed_face_id = ${param_idx}")
            values.append(update_data.last_processed_face_id)
            param_idx += 1

        if update_data.error_message is not None:
            updates.append(f"error_message = ${param_idx}")
            values.append(update_data.error_message)
            param_idx += 1

        if update_data.retry_count is not None:
            updates.append(f"retry_count = ${param_idx}")
            values.append(update_data.retry_count)
            param_idx += 1

        if not updates:
            return await self.get_job(job_id)

        updates.append("updated_at = NOW()")

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                f"""
                UPDATE face_embedding_retention_jobs
                SET {", ".join(updates)}
                WHERE id = $1
                RETURNING *
                """,
                *values,
            )

            if not row:
                return None

            return self._map_job(row)

    async def start_job(
        self,
        job_id: UUID,
        total_embeddings: int,
    ) -> Optional[FaceEmbeddingRetentionJob]:
        """Mark a job as started.

        Args:
            job_id: Job ID
            total_embeddings: Total embeddings to process

        Returns:
            Updated job or None
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE face_embedding_retention_jobs
                SET status = 'running',
                    started_at = NOW(),
                    total_embeddings = $2,
                    updated_at = NOW()
                WHERE id = $1
                AND status = 'pending'
                RETURNING *
                """,
                job_id,
                total_embeddings,
            )

            if not row:
                return None

            logger.info(
                "Retention job started",
                extra={
                    "job_id": str(job_id),
                    "total_embeddings": total_embeddings,
                },
            )

            return self._map_job(row)

    async def complete_job(
        self,
        job_id: UUID,
        deleted_embeddings: int,
        skipped_embeddings: int,
    ) -> Optional[FaceEmbeddingRetentionJob]:
        """Mark a job as completed.

        Args:
            job_id: Job ID
            deleted_embeddings: Total embeddings deleted
            skipped_embeddings: Embeddings skipped

        Returns:
            Updated job or None
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE face_embedding_retention_jobs
                SET status = 'completed',
                    completed_at = NOW(),
                    deleted_embeddings = $2,
                    skipped_embeddings = $3,
                    processed_embeddings = deleted_embeddings + skipped_embeddings,
                    updated_at = NOW()
                WHERE id = $1
                RETURNING *
                """,
                job_id,
                deleted_embeddings,
                skipped_embeddings,
            )

            if not row:
                return None

            logger.info(
                "Retention job completed",
                extra={
                    "job_id": str(job_id),
                    "deleted": deleted_embeddings,
                    "skipped": skipped_embeddings,
                },
            )

            return self._map_job(row)

    async def fail_job(
        self,
        job_id: UUID,
        error_message: str,
    ) -> Optional[FaceEmbeddingRetentionJob]:
        """Mark a job as failed.

        Args:
            job_id: Job ID
            error_message: Error description

        Returns:
            Updated job or None
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE face_embedding_retention_jobs
                SET status = 'failed',
                    completed_at = NOW(),
                    error_message = $2,
                    retry_count = retry_count + 1,
                    updated_at = NOW()
                WHERE id = $1
                RETURNING *
                """,
                job_id,
                error_message,
            )

            if not row:
                return None

            logger.error(
                "Retention job failed",
                extra={
                    "job_id": str(job_id),
                    "error": error_message,
                },
            )

            return self._map_job(row)

    # =========================================================================
    # RETENTION STATISTICS
    # =========================================================================

    async def get_retention_stats(
        self,
        workspace_id: UUID,
    ) -> RetentionStats:
        """Get retention statistics for a workspace.

        Args:
            workspace_id: Workspace ID

        Returns:
            RetentionStats with embedding counts and dates
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Get retention days from workspace settings
            retention_row = await conn.fetchrow(
                """
                SELECT face_embedding_retention_days
                FROM workspace_privacy_settings
                WHERE workspace_id = $1
                """,
                workspace_id,
            )

            retention_days = (
                retention_row["face_embedding_retention_days"]
                if retention_row and retention_row["face_embedding_retention_days"]
                else DEFAULT_RETENTION_DAYS
            )

            cutoff_date = datetime.now(timezone.utc) - timedelta(days=retention_days)

            # Get embedding counts
            counts = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) as total_embeddings,
                    COUNT(*) FILTER (WHERE created_at >= $2) as within_retention,
                    COUNT(*) FILTER (WHERE created_at < $2) as expired
                FROM faces
                WHERE workspace_id = $1
                AND embedding IS NOT NULL
                """,
                workspace_id,
                cutoff_date,
            )

            # Get last cleanup info
            last_cleanup = await conn.fetchrow(
                """
                SELECT completed_at, deleted_embeddings
                FROM face_embedding_retention_jobs
                WHERE workspace_id = $1
                AND status = 'completed'
                ORDER BY completed_at DESC
                LIMIT 1
                """,
                workspace_id,
            )

            # Get next scheduled cleanup
            next_cleanup = await conn.fetchrow(
                """
                SELECT created_at
                FROM face_embedding_retention_jobs
                WHERE workspace_id = $1
                AND status = 'pending'
                ORDER BY created_at ASC
                LIMIT 1
                """,
                workspace_id,
            )

            # Count pending deletions
            pending_jobs = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM face_embedding_retention_jobs
                WHERE workspace_id = $1
                AND status IN ('pending', 'running')
                """,
                workspace_id,
            )

            return RetentionStats(
                workspace_id=workspace_id,
                retention_days=retention_days,
                total_embeddings=counts["total_embeddings"] or 0,
                embeddings_within_retention=counts["within_retention"] or 0,
                embeddings_expired=counts["expired"] or 0,
                last_cleanup_at=last_cleanup["completed_at"] if last_cleanup else None,
                next_scheduled_cleanup=next_cleanup["created_at"] if next_cleanup else None,
                pending_deletion_count=pending_jobs or 0,
            )

    async def get_expired_face_ids(
        self,
        workspace_id: Optional[UUID],
        cutoff_date: datetime,
        batch_size: int = 1000,
        last_processed_id: Optional[UUID] = None,
    ) -> list[UUID]:
        """Get face IDs with expired embeddings.

        Used by the retention worker to find faces to delete.

        Args:
            workspace_id: Workspace ID (None for all workspaces)
            cutoff_date: Delete embeddings older than this
            batch_size: Maximum IDs to return
            last_processed_id: Resume from this ID

        Returns:
            List of face IDs with expired embeddings
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            if workspace_id:
                if last_processed_id:
                    rows = await conn.fetch(
                        """
                        SELECT id FROM faces
                        WHERE workspace_id = $1
                        AND embedding IS NOT NULL
                        AND created_at < $2
                        AND id > $3
                        ORDER BY id
                        LIMIT $4
                        """,
                        workspace_id,
                        cutoff_date,
                        last_processed_id,
                        batch_size,
                    )
                else:
                    rows = await conn.fetch(
                        """
                        SELECT id FROM faces
                        WHERE workspace_id = $1
                        AND embedding IS NOT NULL
                        AND created_at < $2
                        ORDER BY id
                        LIMIT $3
                        """,
                        workspace_id,
                        cutoff_date,
                        batch_size,
                    )
            else:
                if last_processed_id:
                    rows = await conn.fetch(
                        """
                        SELECT id FROM faces
                        WHERE embedding IS NOT NULL
                        AND created_at < $1
                        AND id > $2
                        ORDER BY id
                        LIMIT $3
                        """,
                        cutoff_date,
                        last_processed_id,
                        batch_size,
                    )
                else:
                    rows = await conn.fetch(
                        """
                        SELECT id FROM faces
                        WHERE embedding IS NOT NULL
                        AND created_at < $1
                        ORDER BY id
                        LIMIT $2
                        """,
                        cutoff_date,
                        batch_size,
                    )

            return [row["id"] for row in rows]

    async def delete_embeddings(
        self,
        face_ids: list[UUID],
        workspace_id: Optional[UUID] = None,
    ) -> int:
        """Delete embeddings for specified faces.

        Clears the embedding column but keeps the face record.

        Args:
            face_ids: Face IDs to clear embeddings for
            workspace_id: Optional workspace ID for validation

        Returns:
            Number of embeddings cleared
        """
        if not face_ids:
            return 0

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            if workspace_id:
                result = await conn.execute(
                    """
                    UPDATE faces
                    SET embedding = NULL,
                        updated_at = NOW()
                    WHERE id = ANY($1::uuid[])
                    AND workspace_id = $2
                    AND embedding IS NOT NULL
                    """,
                    face_ids,
                    workspace_id,
                )
            else:
                result = await conn.execute(
                    """
                    UPDATE faces
                    SET embedding = NULL,
                        updated_at = NOW()
                    WHERE id = ANY($1::uuid[])
                    AND embedding IS NOT NULL
                    """,
                    face_ids,
                )

            deleted = int(result.split()[-1]) if result else 0

            logger.info(
                "Embeddings deleted",
                extra={
                    "count": deleted,
                    "workspace_id": str(workspace_id) if workspace_id else None,
                },
            )

            return deleted

    # =========================================================================
    # HELPERS
    # =========================================================================

    def _map_job(self, row) -> FaceEmbeddingRetentionJob:
        """Map database row to FaceEmbeddingRetentionJob model."""
        return FaceEmbeddingRetentionJob(
            id=row["id"],
            workspace_id=row["workspace_id"],
            job_type=RetentionJobType(row["job_type"]),
            status=RetentionJobStatus(row["status"]),
            started_at=row["started_at"],
            completed_at=row["completed_at"],
            total_embeddings=row["total_embeddings"],
            processed_embeddings=row["processed_embeddings"],
            deleted_embeddings=row["deleted_embeddings"],
            skipped_embeddings=row["skipped_embeddings"],
            last_processed_face_id=row["last_processed_face_id"],
            batch_size=row["batch_size"],
            retention_cutoff_date=row["retention_cutoff_date"],
            retention_days=row["retention_days"],
            error_message=row["error_message"],
            retry_count=row["retry_count"],
            max_retries=row["max_retries"],
            triggered_by=row["triggered_by"],
            trigger_reason=row["trigger_reason"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def _map_summary(self, row) -> FaceEmbeddingRetentionJobSummary:
        """Map database row to FaceEmbeddingRetentionJobSummary."""
        total = row["total_embeddings"] or 0
        processed = row["processed_embeddings"] or 0
        progress = (processed / total * 100) if total > 0 else 0.0

        return FaceEmbeddingRetentionJobSummary(
            id=row["id"],
            workspace_id=row["workspace_id"],
            job_type=RetentionJobType(row["job_type"]),
            status=RetentionJobStatus(row["status"]),
            total_embeddings=total,
            processed_embeddings=processed,
            deleted_embeddings=row["deleted_embeddings"] or 0,
            progress_percent=round(progress, 2),
            started_at=row["started_at"],
            completed_at=row["completed_at"],
            created_at=row["created_at"],
        )


# ---------------------------------------------------------------------------
# Singleton Instance
# ---------------------------------------------------------------------------

_repository: Optional[FaceRetentionRepository] = None


def get_face_retention_repository() -> FaceRetentionRepository:
    """Get singleton repository instance."""
    global _repository
    if _repository is None:
        _repository = FaceRetentionRepository()
    return _repository
