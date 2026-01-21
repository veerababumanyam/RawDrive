"""Face Embedding Retention Service.

Service layer for managing face data retention policy enforcement.

Feature: Face Detection Audit Remediation (002-face-audit-remediation)
Finding: COM-002 - Face Data Retention Policy

Tasks: T030-T035
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
from uuid import UUID

from app.models.face_embedding_retention_job import (
    FaceEmbeddingRetentionJob,
    FaceEmbeddingRetentionJobCreate,
    FaceEmbeddingRetentionJobSummary,
    RetentionJobStatus,
    RetentionJobType,
    RetentionStats,
    RetentionJobProgress,
)
from app.repositories.face_retention_repository import (
    FaceRetentionRepository,
    get_face_retention_repository,
    DEFAULT_RETENTION_DAYS,
)
from app.services.audit_service import AuditEventType, get_audit_service
from app.services.legal_hold_service import get_legal_hold_service

logger = logging.getLogger(__name__)


class FaceRetentionService:
    """Service for managing face embedding retention.

    Provides business logic for:
    - Creating retention cleanup jobs
    - Processing retention jobs
    - Getting retention statistics
    - Scheduling nightly cleanup
    """

    def __init__(
        self,
        repository: FaceRetentionRepository,
    ):
        self._repo = repository

    # =========================================================================
    # JOB MANAGEMENT
    # =========================================================================

    async def create_scheduled_cleanup_job(
        self,
        workspace_id: Optional[UUID] = None,
        retention_days: Optional[int] = None,
        triggered_by: Optional[UUID] = None,
    ) -> FaceEmbeddingRetentionJob:
        """Create a scheduled cleanup job.

        Args:
            workspace_id: Workspace to clean (None for all)
            retention_days: Retention period (None uses workspace setting)
            triggered_by: User who triggered (None for system)

        Returns:
            Created job
        """
        days = retention_days or DEFAULT_RETENTION_DAYS
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)

        job = await self._repo.create_job(FaceEmbeddingRetentionJobCreate(
            workspace_id=workspace_id,
            job_type=RetentionJobType.SCHEDULED_CLEANUP,
            retention_cutoff_date=cutoff_date,
            retention_days=days,
            triggered_by=triggered_by,
            trigger_reason="Scheduled retention cleanup",
        ))

        # Log audit event
        await self._log_cleanup_started(workspace_id, job.id, "scheduled_cleanup")

        return job

    async def create_consent_withdrawal_job(
        self,
        workspace_id: UUID,
        triggered_by: UUID,
    ) -> FaceEmbeddingRetentionJob:
        """Create a job to delete all embeddings after consent withdrawal.

        Args:
            workspace_id: Workspace ID
            triggered_by: User who withdrew consent

        Returns:
            Created job
        """
        job = await self._repo.create_job(FaceEmbeddingRetentionJobCreate(
            workspace_id=workspace_id,
            job_type=RetentionJobType.CONSENT_WITHDRAWAL,
            triggered_by=triggered_by,
            trigger_reason="Consent withdrawn - cascade delete",
        ))

        # Log audit event
        await self._log_cleanup_started(workspace_id, job.id, "consent_withdrawal")

        return job

    async def create_gdpr_deletion_job(
        self,
        workspace_id: UUID,
        triggered_by: UUID,
        reason: str,
    ) -> FaceEmbeddingRetentionJob:
        """Create a job for GDPR right-to-erasure request.

        Args:
            workspace_id: Workspace ID
            triggered_by: User who requested deletion
            reason: GDPR deletion reason

        Returns:
            Created job
        """
        job = await self._repo.create_job(FaceEmbeddingRetentionJobCreate(
            workspace_id=workspace_id,
            job_type=RetentionJobType.GDPR_DELETION,
            triggered_by=triggered_by,
            trigger_reason=f"GDPR deletion request: {reason}",
        ))

        # Log audit event
        await self._log_cleanup_started(workspace_id, job.id, "gdpr_deletion")

        return job

    async def create_manual_cleanup_job(
        self,
        workspace_id: UUID,
        triggered_by: UUID,
        reason: Optional[str] = None,
        retention_days: Optional[int] = None,
    ) -> FaceEmbeddingRetentionJob:
        """Create a manual cleanup job triggered by admin.

        Args:
            workspace_id: Workspace ID
            triggered_by: Admin user who triggered
            reason: Reason for manual cleanup
            retention_days: Override retention period

        Returns:
            Created job
        """
        days = retention_days or DEFAULT_RETENTION_DAYS
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)

        job = await self._repo.create_job(FaceEmbeddingRetentionJobCreate(
            workspace_id=workspace_id,
            job_type=RetentionJobType.MANUAL_CLEANUP,
            retention_cutoff_date=cutoff_date,
            retention_days=days,
            triggered_by=triggered_by,
            trigger_reason=reason or "Manual cleanup triggered",
        ))

        # Log audit event
        await self._log_cleanup_started(workspace_id, job.id, "manual_cleanup")

        return job

    async def get_job_progress(
        self,
        job_id: UUID,
    ) -> Optional[RetentionJobProgress]:
        """Get progress of a retention job.

        Args:
            job_id: Job ID

        Returns:
            RetentionJobProgress or None
        """
        job = await self._repo.get_job(job_id)
        if not job:
            return None

        # Estimate remaining time based on processing rate
        estimated_remaining = None
        if job.status == RetentionJobStatus.RUNNING and job.started_at:
            elapsed = (datetime.now(timezone.utc) - job.started_at).total_seconds()
            if job.processed_embeddings > 0 and elapsed > 0:
                rate = job.processed_embeddings / elapsed
                remaining = job.total_embeddings - job.processed_embeddings
                if rate > 0:
                    estimated_remaining = int(remaining / rate)

        return RetentionJobProgress(
            job_id=job.id,
            status=job.status,
            total_embeddings=job.total_embeddings,
            processed_embeddings=job.processed_embeddings,
            deleted_embeddings=job.deleted_embeddings,
            skipped_embeddings=job.skipped_embeddings,
            progress_percent=job.progress_percent,
            estimated_remaining_seconds=estimated_remaining,
        )

    async def get_workspace_jobs(
        self,
        workspace_id: UUID,
        limit: int = 20,
    ) -> list[FaceEmbeddingRetentionJobSummary]:
        """Get retention jobs for a workspace.

        Args:
            workspace_id: Workspace ID
            limit: Maximum jobs to return

        Returns:
            List of job summaries
        """
        return await self._repo.get_jobs_by_workspace(workspace_id, limit)

    async def cancel_job(
        self,
        job_id: UUID,
        user_id: UUID,
    ) -> Optional[FaceEmbeddingRetentionJob]:
        """Cancel a pending or running job.

        Args:
            job_id: Job ID
            user_id: User cancelling the job

        Returns:
            Updated job or None
        """
        job = await self._repo.get_job(job_id)
        if not job:
            return None

        if job.status not in (RetentionJobStatus.PENDING, RetentionJobStatus.RUNNING):
            logger.warning(
                "Cannot cancel job in terminal state",
                extra={"job_id": str(job_id), "status": job.status.value},
            )
            return job

        from app.models.face_embedding_retention_job import FaceEmbeddingRetentionJobUpdate

        return await self._repo.update_job(
            job_id,
            FaceEmbeddingRetentionJobUpdate(status=RetentionJobStatus.CANCELLED),
        )

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
            RetentionStats
        """
        return await self._repo.get_retention_stats(workspace_id)

    # =========================================================================
    # JOB PROCESSING (Called by worker)
    # =========================================================================

    async def process_job(
        self,
        job_id: UUID,
    ) -> FaceEmbeddingRetentionJob:
        """Process a retention job.

        This is called by the Celery worker to execute the job.

        Args:
            job_id: Job ID to process

        Returns:
            Completed job

        Raises:
            Exception: If job processing fails
        """
        job = await self._repo.get_job(job_id)
        if not job:
            raise ValueError(f"Job {job_id} not found")

        if job.status != RetentionJobStatus.PENDING:
            logger.warning(
                "Job not in pending state",
                extra={"job_id": str(job_id), "status": job.status.value},
            )
            return job

        try:
            # Determine what to delete based on job type
            if job.job_type in (RetentionJobType.CONSENT_WITHDRAWAL, RetentionJobType.GDPR_DELETION):
                # Delete ALL embeddings for the workspace
                return await self._process_full_deletion(job)
            else:
                # Delete only expired embeddings
                return await self._process_retention_cleanup(job)

        except Exception as e:
            logger.exception(
                "Job processing failed",
                extra={"job_id": str(job_id), "error": str(e)},
            )

            # Mark job as failed
            await self._repo.fail_job(job_id, str(e))

            # Log audit event
            await self._log_cleanup_failed(job.workspace_id, job_id, str(e))

            raise

    async def _process_full_deletion(
        self,
        job: FaceEmbeddingRetentionJob,
    ) -> FaceEmbeddingRetentionJob:
        """Process full deletion (consent withdrawal, GDPR).

        Deletes ALL embeddings for the workspace.

        Args:
            job: The job to process

        Returns:
            Completed job
        """
        from app.db.postgres import get_postgres_pool

        pool = await get_postgres_pool()

        # Count total embeddings
        async with pool.acquire() as conn:
            total = await conn.fetchval(
                """
                SELECT COUNT(*) FROM faces
                WHERE workspace_id = $1
                AND embedding IS NOT NULL
                """,
                job.workspace_id,
            )

        # Start the job
        await self._repo.start_job(job.id, total or 0)

        if total == 0:
            # Nothing to delete
            return await self._repo.complete_job(job.id, 0, 0)

        # Process in batches
        deleted_total = 0
        skipped_total = 0
        last_id: Optional[UUID] = None

        # Get legal hold service for exemption checks (T069)
        legal_hold_service = get_legal_hold_service()

        while True:
            # Get batch of face IDs
            face_ids = await self._repo.get_expired_face_ids(
                workspace_id=job.workspace_id,
                cutoff_date=datetime.max.replace(tzinfo=timezone.utc),  # All dates
                batch_size=job.batch_size,
                last_processed_id=last_id,
            )

            if not face_ids:
                break

            # Filter out faces under legal hold (T069: COM-002 legal hold exemption)
            faces_to_delete = []
            batch_skipped = 0

            for face_id in face_ids:
                result = await legal_hold_service.check_deletion_blocked(
                    workspace_id=job.workspace_id,
                    resource_type="face",
                    resource_id=face_id,
                )
                if result.blocked:
                    batch_skipped += 1
                    logger.info(
                        "Face under legal hold, skipping deletion",
                        extra={
                            "face_id": str(face_id),
                            "hold_id": str(result.hold_id) if result.hold_id else None,
                            "job_id": str(job.id),
                        },
                    )
                else:
                    faces_to_delete.append(face_id)

            last_id = face_ids[-1]
            skipped_total += batch_skipped

            # Delete embeddings (only those not under legal hold)
            if faces_to_delete:
                deleted = await self._repo.delete_embeddings(faces_to_delete, job.workspace_id)
                deleted_total += deleted

            # Update progress
            from app.models.face_embedding_retention_job import FaceEmbeddingRetentionJobUpdate
            await self._repo.update_job(
                job.id,
                FaceEmbeddingRetentionJobUpdate(
                    processed_embeddings=deleted_total + skipped_total,
                    deleted_embeddings=deleted_total,
                    skipped_embeddings=skipped_total,
                    last_processed_face_id=last_id,
                ),
            )

        # Complete the job
        result = await self._repo.complete_job(job.id, deleted_total, skipped_total)

        # Log audit event
        await self._log_cleanup_completed(job.workspace_id, job.id, deleted_total)

        # Update biometric settings if consent withdrawal
        if job.job_type == RetentionJobType.CONSENT_WITHDRAWAL:
            from app.repositories.biometric_settings_repository import get_biometric_settings_repository
            repo = get_biometric_settings_repository()
            await repo.complete_deletion(job.workspace_id)

        return result

    async def _process_retention_cleanup(
        self,
        job: FaceEmbeddingRetentionJob,
    ) -> FaceEmbeddingRetentionJob:
        """Process retention-based cleanup.

        Deletes only embeddings older than the cutoff date.

        Args:
            job: The job to process

        Returns:
            Completed job
        """
        from app.db.postgres import get_postgres_pool

        pool = await get_postgres_pool()

        cutoff_date = job.retention_cutoff_date or (
            datetime.now(timezone.utc) - timedelta(days=job.retention_days or DEFAULT_RETENTION_DAYS)
        )

        # Count total expired embeddings
        async with pool.acquire() as conn:
            if job.workspace_id:
                total = await conn.fetchval(
                    """
                    SELECT COUNT(*) FROM faces
                    WHERE workspace_id = $1
                    AND embedding IS NOT NULL
                    AND created_at < $2
                    """,
                    job.workspace_id,
                    cutoff_date,
                )
            else:
                total = await conn.fetchval(
                    """
                    SELECT COUNT(*) FROM faces
                    WHERE embedding IS NOT NULL
                    AND created_at < $1
                    """,
                    cutoff_date,
                )

        # Start the job
        await self._repo.start_job(job.id, total or 0)

        if total == 0:
            return await self._repo.complete_job(job.id, 0, 0)

        # Process in batches
        deleted_total = 0
        skipped_total = 0
        last_id: Optional[UUID] = None

        # Get legal hold service for exemption checks (T069)
        legal_hold_service = get_legal_hold_service()

        while True:
            # Get batch of expired face IDs
            face_ids = await self._repo.get_expired_face_ids(
                workspace_id=job.workspace_id,
                cutoff_date=cutoff_date,
                batch_size=job.batch_size,
                last_processed_id=last_id,
            )

            if not face_ids:
                break

            # Filter out faces under legal hold (T069: COM-002 legal hold exemption)
            faces_to_delete = []
            batch_skipped = 0

            for face_id in face_ids:
                # For system-wide jobs, we need the face's workspace_id
                check_workspace_id = job.workspace_id
                if check_workspace_id is None:
                    # Get workspace_id from face record for system-wide jobs
                    async with (await get_postgres_pool()).acquire() as conn:
                        check_workspace_id = await conn.fetchval(
                            "SELECT workspace_id FROM faces WHERE id = $1",
                            face_id,
                        )

                if check_workspace_id:
                    result = await legal_hold_service.check_deletion_blocked(
                        workspace_id=check_workspace_id,
                        resource_type="face",
                        resource_id=face_id,
                    )
                    if result.blocked:
                        batch_skipped += 1
                        logger.info(
                            "Face under legal hold, skipping deletion",
                            extra={
                                "face_id": str(face_id),
                                "hold_id": str(result.hold_id) if result.hold_id else None,
                                "job_id": str(job.id),
                            },
                        )
                        continue

                faces_to_delete.append(face_id)

            last_id = face_ids[-1]
            skipped_total += batch_skipped

            # Delete embeddings (only those not under legal hold)
            if faces_to_delete:
                deleted = await self._repo.delete_embeddings(faces_to_delete, job.workspace_id)
                deleted_total += deleted

            # Update progress
            from app.models.face_embedding_retention_job import FaceEmbeddingRetentionJobUpdate
            await self._repo.update_job(
                job.id,
                FaceEmbeddingRetentionJobUpdate(
                    processed_embeddings=deleted_total + skipped_total,
                    deleted_embeddings=deleted_total,
                    skipped_embeddings=skipped_total,
                    last_processed_face_id=last_id,
                ),
            )

        # Complete the job
        result = await self._repo.complete_job(job.id, deleted_total, skipped_total)

        # Log audit event
        await self._log_cleanup_completed(job.workspace_id, job.id, deleted_total)

        return result

    # =========================================================================
    # AUDIT LOGGING
    # =========================================================================

    async def _log_cleanup_started(
        self,
        workspace_id: Optional[UUID],
        job_id: UUID,
        job_type: str,
    ) -> None:
        """Log cleanup started audit event."""
        try:
            audit_service = get_audit_service()
            await audit_service.log_event(
                event_type=AuditEventType.FACE_RETENTION_CLEANUP_STARTED,
                workspace_id=workspace_id,
                details={
                    "job_id": str(job_id),
                    "job_type": job_type,
                },
            )
        except Exception as e:
            logger.warning(f"Failed to log cleanup started event: {e}")

    async def _log_cleanup_completed(
        self,
        workspace_id: Optional[UUID],
        job_id: UUID,
        deleted_count: int,
    ) -> None:
        """Log cleanup completed audit event."""
        try:
            audit_service = get_audit_service()
            await audit_service.log_event(
                event_type=AuditEventType.FACE_RETENTION_CLEANUP_COMPLETED,
                workspace_id=workspace_id,
                details={
                    "job_id": str(job_id),
                    "deleted_count": deleted_count,
                },
            )
        except Exception as e:
            logger.warning(f"Failed to log cleanup completed event: {e}")

    async def _log_cleanup_failed(
        self,
        workspace_id: Optional[UUID],
        job_id: UUID,
        error: str,
    ) -> None:
        """Log cleanup failed audit event."""
        try:
            audit_service = get_audit_service()
            await audit_service.log_event(
                event_type=AuditEventType.FACE_RETENTION_CLEANUP_FAILED,
                workspace_id=workspace_id,
                details={
                    "job_id": str(job_id),
                    "error": error,
                },
            )
        except Exception as e:
            logger.warning(f"Failed to log cleanup failed event: {e}")


# ---------------------------------------------------------------------------
# Singleton Instance
# ---------------------------------------------------------------------------

_service: Optional[FaceRetentionService] = None


def get_face_retention_service() -> FaceRetentionService:
    """Get singleton service instance."""
    global _service
    if _service is None:
        _service = FaceRetentionService(get_face_retention_repository())
    return _service
