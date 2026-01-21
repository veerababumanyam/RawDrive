"""Unit tests for FaceRetentionService.

Feature: Face Detection Audit Remediation (002-face-audit-remediation)
Finding: COM-002 - Face Data Retention Policy
Task: T057

Tests face embedding retention policy enforcement including:
- Job creation (scheduled, consent withdrawal, GDPR, manual)
- Job processing with legal hold exemptions
- Progress tracking and statistics
- Audit logging
"""

import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

from app.services.face_retention_service import (
    FaceRetentionService,
    get_face_retention_service,
)
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
    DEFAULT_RETENTION_DAYS,
)


# =============================================================================
# FIXTURES
# =============================================================================


@pytest.fixture
def workspace_id() -> UUID:
    """Test workspace ID."""
    return uuid4()


@pytest.fixture
def user_id() -> UUID:
    """Test user ID."""
    return uuid4()


@pytest.fixture
def job_id() -> UUID:
    """Test job ID."""
    return uuid4()


@pytest.fixture
def mock_repository():
    """Mock FaceRetentionRepository."""
    return AsyncMock()


@pytest.fixture
def mock_audit_service():
    """Mock AuditService."""
    with patch("app.services.face_retention_service.get_audit_service") as mock:
        service = AsyncMock()
        mock.return_value = service
        yield service


@pytest.fixture
def mock_legal_hold_service():
    """Mock LegalHoldService."""
    with patch("app.services.face_retention_service.get_legal_hold_service") as mock:
        service = AsyncMock()
        service.check_deletion_blocked.return_value = MagicMock(blocked=False, hold_id=None)
        mock.return_value = service
        yield service


@pytest.fixture
def service(mock_repository) -> FaceRetentionService:
    """FaceRetentionService with mocked repository."""
    return FaceRetentionService(mock_repository)


@pytest.fixture
def sample_job(workspace_id: UUID) -> FaceEmbeddingRetentionJob:
    """Sample retention job."""
    now = datetime.now(timezone.utc)
    return FaceEmbeddingRetentionJob(
        id=uuid4(),
        workspace_id=workspace_id,
        job_type=RetentionJobType.SCHEDULED_CLEANUP,
        status=RetentionJobStatus.PENDING,
        started_at=None,
        completed_at=None,
        total_embeddings=1000,
        processed_embeddings=0,
        deleted_embeddings=0,
        skipped_embeddings=0,
        batch_size=1000,
        retention_days=DEFAULT_RETENTION_DAYS,
        created_at=now,
        updated_at=now,
    )


@pytest.fixture
def running_job(workspace_id: UUID) -> FaceEmbeddingRetentionJob:
    """Running retention job for progress tests."""
    now = datetime.now(timezone.utc)
    return FaceEmbeddingRetentionJob(
        id=uuid4(),
        workspace_id=workspace_id,
        job_type=RetentionJobType.SCHEDULED_CLEANUP,
        status=RetentionJobStatus.RUNNING,
        started_at=now - timedelta(minutes=5),
        completed_at=None,
        total_embeddings=1000,
        processed_embeddings=500,
        deleted_embeddings=500,
        skipped_embeddings=0,
        batch_size=1000,
        retention_days=DEFAULT_RETENTION_DAYS,
        created_at=now - timedelta(minutes=10),
        updated_at=now,
    )


# =============================================================================
# JOB CREATION TESTS
# =============================================================================


class TestJobCreation:
    """Tests for job creation methods."""

    @pytest.mark.asyncio
    async def test_create_scheduled_cleanup_job(
        self,
        service: FaceRetentionService,
        mock_repository: AsyncMock,
        mock_audit_service: AsyncMock,
        workspace_id: UUID,
        sample_job: FaceEmbeddingRetentionJob,
    ):
        """Test creating scheduled cleanup job."""
        sample_job.job_type = RetentionJobType.SCHEDULED_CLEANUP
        mock_repository.create_job.return_value = sample_job

        result = await service.create_scheduled_cleanup_job(
            workspace_id=workspace_id,
            retention_days=90,
        )

        assert result.job_type == RetentionJobType.SCHEDULED_CLEANUP
        mock_repository.create_job.assert_called_once()

        # Verify job creation data
        call_args = mock_repository.create_job.call_args[0][0]
        assert isinstance(call_args, FaceEmbeddingRetentionJobCreate)
        assert call_args.workspace_id == workspace_id
        assert call_args.retention_days == 90

    @pytest.mark.asyncio
    async def test_create_scheduled_cleanup_job_default_retention(
        self,
        service: FaceRetentionService,
        mock_repository: AsyncMock,
        mock_audit_service: AsyncMock,
        sample_job: FaceEmbeddingRetentionJob,
    ):
        """Test scheduled cleanup uses default retention when not specified."""
        mock_repository.create_job.return_value = sample_job

        await service.create_scheduled_cleanup_job()

        call_args = mock_repository.create_job.call_args[0][0]
        assert call_args.retention_days == DEFAULT_RETENTION_DAYS

    @pytest.mark.asyncio
    async def test_create_consent_withdrawal_job(
        self,
        service: FaceRetentionService,
        mock_repository: AsyncMock,
        mock_audit_service: AsyncMock,
        workspace_id: UUID,
        user_id: UUID,
        sample_job: FaceEmbeddingRetentionJob,
    ):
        """Test creating consent withdrawal job."""
        sample_job.job_type = RetentionJobType.CONSENT_WITHDRAWAL
        mock_repository.create_job.return_value = sample_job

        result = await service.create_consent_withdrawal_job(
            workspace_id=workspace_id,
            triggered_by=user_id,
        )

        assert result.job_type == RetentionJobType.CONSENT_WITHDRAWAL
        mock_repository.create_job.assert_called_once()

        call_args = mock_repository.create_job.call_args[0][0]
        assert call_args.triggered_by == user_id
        assert "consent" in call_args.trigger_reason.lower()

    @pytest.mark.asyncio
    async def test_create_gdpr_deletion_job(
        self,
        service: FaceRetentionService,
        mock_repository: AsyncMock,
        mock_audit_service: AsyncMock,
        workspace_id: UUID,
        user_id: UUID,
        sample_job: FaceEmbeddingRetentionJob,
    ):
        """Test creating GDPR deletion job."""
        sample_job.job_type = RetentionJobType.GDPR_DELETION
        mock_repository.create_job.return_value = sample_job

        result = await service.create_gdpr_deletion_job(
            workspace_id=workspace_id,
            triggered_by=user_id,
            reason="User requested deletion under Article 17",
        )

        assert result.job_type == RetentionJobType.GDPR_DELETION
        call_args = mock_repository.create_job.call_args[0][0]
        assert "GDPR" in call_args.trigger_reason
        assert "Article 17" in call_args.trigger_reason

    @pytest.mark.asyncio
    async def test_create_manual_cleanup_job(
        self,
        service: FaceRetentionService,
        mock_repository: AsyncMock,
        mock_audit_service: AsyncMock,
        workspace_id: UUID,
        user_id: UUID,
        sample_job: FaceEmbeddingRetentionJob,
    ):
        """Test creating manual cleanup job."""
        sample_job.job_type = RetentionJobType.MANUAL_CLEANUP
        mock_repository.create_job.return_value = sample_job

        result = await service.create_manual_cleanup_job(
            workspace_id=workspace_id,
            triggered_by=user_id,
            reason="Admin cleanup for compliance",
            retention_days=30,
        )

        assert result.job_type == RetentionJobType.MANUAL_CLEANUP
        call_args = mock_repository.create_job.call_args[0][0]
        assert call_args.retention_days == 30
        assert "Admin cleanup" in call_args.trigger_reason


# =============================================================================
# JOB PROGRESS TESTS
# =============================================================================


class TestJobProgress:
    """Tests for job progress tracking."""

    @pytest.mark.asyncio
    async def test_get_job_progress_running(
        self,
        service: FaceRetentionService,
        mock_repository: AsyncMock,
        running_job: FaceEmbeddingRetentionJob,
    ):
        """Test getting progress of a running job."""
        mock_repository.get_job.return_value = running_job

        result = await service.get_job_progress(running_job.id)

        assert result is not None
        assert result.job_id == running_job.id
        assert result.status == RetentionJobStatus.RUNNING
        assert result.total_embeddings == 1000
        assert result.processed_embeddings == 500
        assert result.progress_percent == 50.0
        assert result.estimated_remaining_seconds is not None

    @pytest.mark.asyncio
    async def test_get_job_progress_not_found(
        self,
        service: FaceRetentionService,
        mock_repository: AsyncMock,
        job_id: UUID,
    ):
        """Test get_job_progress returns None when not found."""
        mock_repository.get_job.return_value = None

        result = await service.get_job_progress(job_id)

        assert result is None

    @pytest.mark.asyncio
    async def test_get_job_progress_pending(
        self,
        service: FaceRetentionService,
        mock_repository: AsyncMock,
        sample_job: FaceEmbeddingRetentionJob,
    ):
        """Test get_job_progress for pending job (no estimated time)."""
        sample_job.status = RetentionJobStatus.PENDING
        mock_repository.get_job.return_value = sample_job

        result = await service.get_job_progress(sample_job.id)

        assert result is not None
        assert result.status == RetentionJobStatus.PENDING
        assert result.estimated_remaining_seconds is None


# =============================================================================
# WORKSPACE JOBS TESTS
# =============================================================================


class TestWorkspaceJobs:
    """Tests for workspace job listing."""

    @pytest.mark.asyncio
    async def test_get_workspace_jobs(
        self,
        service: FaceRetentionService,
        mock_repository: AsyncMock,
        workspace_id: UUID,
    ):
        """Test getting jobs for a workspace."""
        summaries = [
            FaceEmbeddingRetentionJobSummary(
                id=uuid4(),
                workspace_id=workspace_id,
                job_type=RetentionJobType.SCHEDULED_CLEANUP,
                status=RetentionJobStatus.COMPLETED,
                total_embeddings=100,
                processed_embeddings=100,
                deleted_embeddings=50,
                progress_percent=100.0,
                created_at=datetime.now(timezone.utc),
            )
        ]
        mock_repository.get_jobs_by_workspace.return_value = summaries

        result = await service.get_workspace_jobs(workspace_id, limit=10)

        assert len(result) == 1
        mock_repository.get_jobs_by_workspace.assert_called_once_with(workspace_id, 10)


# =============================================================================
# CANCEL JOB TESTS
# =============================================================================


class TestCancelJob:
    """Tests for job cancellation."""

    @pytest.mark.asyncio
    async def test_cancel_pending_job(
        self,
        service: FaceRetentionService,
        mock_repository: AsyncMock,
        sample_job: FaceEmbeddingRetentionJob,
        user_id: UUID,
    ):
        """Test cancelling a pending job."""
        sample_job.status = RetentionJobStatus.PENDING
        mock_repository.get_job.return_value = sample_job

        cancelled_job = sample_job.model_copy()
        cancelled_job.status = RetentionJobStatus.CANCELLED
        mock_repository.update_job.return_value = cancelled_job

        result = await service.cancel_job(sample_job.id, user_id)

        assert result.status == RetentionJobStatus.CANCELLED
        mock_repository.update_job.assert_called_once()

    @pytest.mark.asyncio
    async def test_cancel_running_job(
        self,
        service: FaceRetentionService,
        mock_repository: AsyncMock,
        running_job: FaceEmbeddingRetentionJob,
        user_id: UUID,
    ):
        """Test cancelling a running job."""
        mock_repository.get_job.return_value = running_job

        cancelled_job = running_job.model_copy()
        cancelled_job.status = RetentionJobStatus.CANCELLED
        mock_repository.update_job.return_value = cancelled_job

        result = await service.cancel_job(running_job.id, user_id)

        assert result.status == RetentionJobStatus.CANCELLED

    @pytest.mark.asyncio
    async def test_cannot_cancel_completed_job(
        self,
        service: FaceRetentionService,
        mock_repository: AsyncMock,
        sample_job: FaceEmbeddingRetentionJob,
        user_id: UUID,
    ):
        """Test cannot cancel a completed job."""
        sample_job.status = RetentionJobStatus.COMPLETED
        mock_repository.get_job.return_value = sample_job

        result = await service.cancel_job(sample_job.id, user_id)

        # Should return the job unchanged, not call update
        assert result.status == RetentionJobStatus.COMPLETED
        mock_repository.update_job.assert_not_called()

    @pytest.mark.asyncio
    async def test_cancel_job_not_found(
        self,
        service: FaceRetentionService,
        mock_repository: AsyncMock,
        job_id: UUID,
        user_id: UUID,
    ):
        """Test cancel job returns None when not found."""
        mock_repository.get_job.return_value = None

        result = await service.cancel_job(job_id, user_id)

        assert result is None


# =============================================================================
# RETENTION STATISTICS TESTS
# =============================================================================


class TestRetentionStats:
    """Tests for retention statistics."""

    @pytest.mark.asyncio
    async def test_get_retention_stats(
        self,
        service: FaceRetentionService,
        mock_repository: AsyncMock,
        workspace_id: UUID,
    ):
        """Test getting retention statistics."""
        stats = RetentionStats(
            workspace_id=workspace_id,
            retention_days=2555,
            total_embeddings=5000,
            embeddings_within_retention=4500,
            embeddings_expired=500,
            last_cleanup_at=datetime.now(timezone.utc) - timedelta(days=1),
            pending_deletion_count=0,
        )
        mock_repository.get_retention_stats.return_value = stats

        result = await service.get_retention_stats(workspace_id)

        assert result.workspace_id == workspace_id
        assert result.total_embeddings == 5000
        assert result.embeddings_expired == 500


# =============================================================================
# JOB PROCESSING TESTS
# =============================================================================


class TestJobProcessing:
    """Tests for job processing."""

    @pytest.mark.asyncio
    async def test_process_job_not_found(
        self,
        service: FaceRetentionService,
        mock_repository: AsyncMock,
        job_id: UUID,
    ):
        """Test process_job raises when job not found."""
        mock_repository.get_job.return_value = None

        with pytest.raises(ValueError) as exc:
            await service.process_job(job_id)

        assert "not found" in str(exc.value)

    @pytest.mark.asyncio
    async def test_process_job_not_pending(
        self,
        service: FaceRetentionService,
        mock_repository: AsyncMock,
        running_job: FaceEmbeddingRetentionJob,
    ):
        """Test process_job returns early for non-pending jobs."""
        mock_repository.get_job.return_value = running_job

        result = await service.process_job(running_job.id)

        # Should return without processing
        assert result.status == RetentionJobStatus.RUNNING
        mock_repository.start_job.assert_not_called()

    @pytest.mark.asyncio
    async def test_process_full_deletion_empty(
        self,
        service: FaceRetentionService,
        mock_repository: AsyncMock,
        mock_legal_hold_service: AsyncMock,
        mock_audit_service: AsyncMock,
        workspace_id: UUID,
    ):
        """Test full deletion with no embeddings to delete."""
        now = datetime.now(timezone.utc)
        job = FaceEmbeddingRetentionJob(
            id=uuid4(),
            workspace_id=workspace_id,
            job_type=RetentionJobType.CONSENT_WITHDRAWAL,
            status=RetentionJobStatus.PENDING,
            batch_size=1000,
            created_at=now,
            updated_at=now,
        )
        mock_repository.get_job.return_value = job

        completed_job = job.model_copy()
        completed_job.status = RetentionJobStatus.COMPLETED
        completed_job.deleted_embeddings = 0
        mock_repository.complete_job.return_value = completed_job

        with patch("app.services.face_retention_service.get_postgres_pool") as mock_pool:
            mock_conn = AsyncMock()
            mock_conn.fetchval.return_value = 0  # No embeddings
            pool = AsyncMock()
            pool.acquire.return_value.__aenter__.return_value = mock_conn
            mock_pool.return_value = pool

            result = await service.process_job(job.id)

            assert result.status == RetentionJobStatus.COMPLETED
            mock_repository.complete_job.assert_called_once_with(job.id, 0, 0)

    @pytest.mark.asyncio
    async def test_process_full_deletion_with_embeddings(
        self,
        service: FaceRetentionService,
        mock_repository: AsyncMock,
        mock_legal_hold_service: AsyncMock,
        mock_audit_service: AsyncMock,
        workspace_id: UUID,
    ):
        """Test full deletion processes all embeddings."""
        now = datetime.now(timezone.utc)
        job = FaceEmbeddingRetentionJob(
            id=uuid4(),
            workspace_id=workspace_id,
            job_type=RetentionJobType.CONSENT_WITHDRAWAL,
            status=RetentionJobStatus.PENDING,
            batch_size=100,
            created_at=now,
            updated_at=now,
        )
        mock_repository.get_job.return_value = job

        # Setup batch processing
        face_ids = [uuid4() for _ in range(50)]
        mock_repository.get_expired_face_ids.side_effect = [face_ids, []]  # First batch, then empty
        mock_repository.delete_embeddings.return_value = 50
        mock_repository.update_job.return_value = job

        completed_job = job.model_copy()
        completed_job.status = RetentionJobStatus.COMPLETED
        completed_job.deleted_embeddings = 50
        mock_repository.complete_job.return_value = completed_job

        with patch("app.services.face_retention_service.get_postgres_pool") as mock_pool:
            mock_conn = AsyncMock()
            mock_conn.fetchval.return_value = 50  # 50 embeddings
            pool = AsyncMock()
            pool.acquire.return_value.__aenter__.return_value = mock_conn
            mock_pool.return_value = pool

            result = await service.process_job(job.id)

            assert result.deleted_embeddings == 50
            mock_repository.delete_embeddings.assert_called()

    @pytest.mark.asyncio
    async def test_process_full_deletion_with_legal_hold(
        self,
        service: FaceRetentionService,
        mock_repository: AsyncMock,
        mock_legal_hold_service: AsyncMock,
        mock_audit_service: AsyncMock,
        workspace_id: UUID,
    ):
        """Test full deletion skips faces under legal hold."""
        now = datetime.now(timezone.utc)
        job = FaceEmbeddingRetentionJob(
            id=uuid4(),
            workspace_id=workspace_id,
            job_type=RetentionJobType.CONSENT_WITHDRAWAL,
            status=RetentionJobStatus.PENDING,
            batch_size=100,
            created_at=now,
            updated_at=now,
        )
        mock_repository.get_job.return_value = job

        # Setup batch with mixed legal hold status
        face_ids = [uuid4() for _ in range(10)]

        # First 5 not under hold, last 5 under hold
        def check_deletion_blocked(workspace_id, resource_type, resource_id):
            idx = face_ids.index(resource_id)
            blocked = idx >= 5
            return MagicMock(blocked=blocked, hold_id=uuid4() if blocked else None)

        mock_legal_hold_service.check_deletion_blocked.side_effect = check_deletion_blocked

        mock_repository.get_expired_face_ids.side_effect = [face_ids, []]
        mock_repository.delete_embeddings.return_value = 5  # Only 5 deleted
        mock_repository.update_job.return_value = job

        completed_job = job.model_copy()
        completed_job.status = RetentionJobStatus.COMPLETED
        completed_job.deleted_embeddings = 5
        completed_job.skipped_embeddings = 5
        mock_repository.complete_job.return_value = completed_job

        with patch("app.services.face_retention_service.get_postgres_pool") as mock_pool:
            mock_conn = AsyncMock()
            mock_conn.fetchval.return_value = 10
            pool = AsyncMock()
            pool.acquire.return_value.__aenter__.return_value = mock_conn
            mock_pool.return_value = pool

            result = await service.process_job(job.id)

            # Should have only deleted 5, skipped 5
            assert mock_repository.delete_embeddings.call_count == 1
            call_args = mock_repository.delete_embeddings.call_args[0]
            assert len(call_args[0]) == 5  # Only 5 faces passed to delete

    @pytest.mark.asyncio
    async def test_process_retention_cleanup(
        self,
        service: FaceRetentionService,
        mock_repository: AsyncMock,
        mock_legal_hold_service: AsyncMock,
        mock_audit_service: AsyncMock,
        workspace_id: UUID,
    ):
        """Test retention-based cleanup."""
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(days=90)
        job = FaceEmbeddingRetentionJob(
            id=uuid4(),
            workspace_id=workspace_id,
            job_type=RetentionJobType.SCHEDULED_CLEANUP,
            status=RetentionJobStatus.PENDING,
            retention_cutoff_date=cutoff,
            retention_days=90,
            batch_size=100,
            created_at=now,
            updated_at=now,
        )
        mock_repository.get_job.return_value = job

        face_ids = [uuid4() for _ in range(30)]
        mock_repository.get_expired_face_ids.side_effect = [face_ids, []]
        mock_repository.delete_embeddings.return_value = 30
        mock_repository.update_job.return_value = job

        completed_job = job.model_copy()
        completed_job.status = RetentionJobStatus.COMPLETED
        completed_job.deleted_embeddings = 30
        mock_repository.complete_job.return_value = completed_job

        with patch("app.services.face_retention_service.get_postgres_pool") as mock_pool:
            mock_conn = AsyncMock()
            mock_conn.fetchval.return_value = 30
            pool = AsyncMock()
            pool.acquire.return_value.__aenter__.return_value = mock_conn
            mock_pool.return_value = pool

            result = await service.process_job(job.id)

            assert result.status == RetentionJobStatus.COMPLETED
            mock_repository.get_expired_face_ids.assert_called()

    @pytest.mark.asyncio
    async def test_process_job_failure(
        self,
        service: FaceRetentionService,
        mock_repository: AsyncMock,
        mock_audit_service: AsyncMock,
        workspace_id: UUID,
    ):
        """Test job processing handles failures."""
        now = datetime.now(timezone.utc)
        job = FaceEmbeddingRetentionJob(
            id=uuid4(),
            workspace_id=workspace_id,
            job_type=RetentionJobType.SCHEDULED_CLEANUP,
            status=RetentionJobStatus.PENDING,
            batch_size=100,
            created_at=now,
            updated_at=now,
        )
        mock_repository.get_job.return_value = job

        with patch("app.services.face_retention_service.get_postgres_pool") as mock_pool:
            mock_pool.side_effect = Exception("Database error")

            with pytest.raises(Exception) as exc:
                await service.process_job(job.id)

            assert "Database error" in str(exc.value)
            mock_repository.fail_job.assert_called_once()


# =============================================================================
# AUDIT LOGGING TESTS
# =============================================================================


class TestAuditLogging:
    """Tests for audit logging."""

    @pytest.mark.asyncio
    async def test_log_cleanup_started(
        self,
        service: FaceRetentionService,
        mock_repository: AsyncMock,
        mock_audit_service: AsyncMock,
        workspace_id: UUID,
        sample_job: FaceEmbeddingRetentionJob,
    ):
        """Test audit event logged on job creation."""
        mock_repository.create_job.return_value = sample_job

        await service.create_scheduled_cleanup_job(workspace_id=workspace_id)

        mock_audit_service.log_event.assert_called_once()
        call_kwargs = mock_audit_service.log_event.call_args[1]
        assert "CLEANUP_STARTED" in str(call_kwargs.get("event_type"))

    @pytest.mark.asyncio
    async def test_audit_logging_error_handled(
        self,
        service: FaceRetentionService,
        mock_repository: AsyncMock,
        mock_audit_service: AsyncMock,
        workspace_id: UUID,
        sample_job: FaceEmbeddingRetentionJob,
    ):
        """Test audit logging errors are caught and don't break job creation."""
        mock_repository.create_job.return_value = sample_job
        mock_audit_service.log_event.side_effect = Exception("Audit service error")

        # Should not raise
        result = await service.create_scheduled_cleanup_job(workspace_id=workspace_id)

        assert result is not None


# =============================================================================
# SINGLETON TESTS
# =============================================================================


class TestSingleton:
    """Tests for service singleton."""

    def test_get_face_retention_service_returns_singleton(self):
        """Test get_face_retention_service returns same instance."""
        # Clear singleton
        import app.services.face_retention_service as module
        module._service = None

        with patch("app.services.face_retention_service.get_face_retention_repository"):
            service1 = get_face_retention_service()
            service2 = get_face_retention_service()

            assert service1 is service2


# =============================================================================
# MODEL PROPERTY TESTS
# =============================================================================


class TestJobModelProperties:
    """Tests for FaceEmbeddingRetentionJob model properties."""

    def test_progress_percent_zero_total(self):
        """Test progress_percent when total is zero."""
        job = FaceEmbeddingRetentionJob(
            id=uuid4(),
            job_type=RetentionJobType.SCHEDULED_CLEANUP,
            status=RetentionJobStatus.PENDING,
            total_embeddings=0,
            processed_embeddings=0,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )

        assert job.progress_percent == 0.0

    def test_progress_percent_calculation(self):
        """Test progress_percent calculation."""
        job = FaceEmbeddingRetentionJob(
            id=uuid4(),
            job_type=RetentionJobType.SCHEDULED_CLEANUP,
            status=RetentionJobStatus.RUNNING,
            total_embeddings=1000,
            processed_embeddings=333,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )

        assert job.progress_percent == 33.3

    def test_is_active_pending(self):
        """Test is_active for pending job."""
        job = FaceEmbeddingRetentionJob(
            id=uuid4(),
            job_type=RetentionJobType.SCHEDULED_CLEANUP,
            status=RetentionJobStatus.PENDING,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )

        assert job.is_active is True

    def test_is_active_running(self):
        """Test is_active for running job."""
        job = FaceEmbeddingRetentionJob(
            id=uuid4(),
            job_type=RetentionJobType.SCHEDULED_CLEANUP,
            status=RetentionJobStatus.RUNNING,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )

        assert job.is_active is True

    def test_is_active_completed(self):
        """Test is_active for completed job."""
        job = FaceEmbeddingRetentionJob(
            id=uuid4(),
            job_type=RetentionJobType.SCHEDULED_CLEANUP,
            status=RetentionJobStatus.COMPLETED,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )

        assert job.is_active is False

    def test_is_terminal_completed(self):
        """Test is_terminal for completed job."""
        job = FaceEmbeddingRetentionJob(
            id=uuid4(),
            job_type=RetentionJobType.SCHEDULED_CLEANUP,
            status=RetentionJobStatus.COMPLETED,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )

        assert job.is_terminal is True

    def test_is_terminal_failed(self):
        """Test is_terminal for failed job."""
        job = FaceEmbeddingRetentionJob(
            id=uuid4(),
            job_type=RetentionJobType.SCHEDULED_CLEANUP,
            status=RetentionJobStatus.FAILED,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )

        assert job.is_terminal is True

    def test_is_terminal_running(self):
        """Test is_terminal for running job."""
        job = FaceEmbeddingRetentionJob(
            id=uuid4(),
            job_type=RetentionJobType.SCHEDULED_CLEANUP,
            status=RetentionJobStatus.RUNNING,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )

        assert job.is_terminal is False


# =============================================================================
# EDGE CASES
# =============================================================================


class TestEdgeCases:
    """Tests for edge cases."""

    @pytest.mark.asyncio
    async def test_retention_cleanup_system_wide(
        self,
        service: FaceRetentionService,
        mock_repository: AsyncMock,
        mock_legal_hold_service: AsyncMock,
        mock_audit_service: AsyncMock,
    ):
        """Test system-wide retention cleanup (workspace_id=None)."""
        now = datetime.now(timezone.utc)
        job = FaceEmbeddingRetentionJob(
            id=uuid4(),
            workspace_id=None,  # System-wide
            job_type=RetentionJobType.SCHEDULED_CLEANUP,
            status=RetentionJobStatus.PENDING,
            retention_days=DEFAULT_RETENTION_DAYS,
            batch_size=100,
            created_at=now,
            updated_at=now,
        )
        mock_repository.get_job.return_value = job
        mock_repository.get_expired_face_ids.return_value = []

        completed_job = job.model_copy()
        completed_job.status = RetentionJobStatus.COMPLETED
        mock_repository.complete_job.return_value = completed_job

        with patch("app.services.face_retention_service.get_postgres_pool") as mock_pool:
            mock_conn = AsyncMock()
            mock_conn.fetchval.return_value = 0
            pool = AsyncMock()
            pool.acquire.return_value.__aenter__.return_value = mock_conn
            mock_pool.return_value = pool

            result = await service.process_job(job.id)

            assert result.status == RetentionJobStatus.COMPLETED

    @pytest.mark.asyncio
    async def test_consent_withdrawal_updates_biometric_settings(
        self,
        service: FaceRetentionService,
        mock_repository: AsyncMock,
        mock_legal_hold_service: AsyncMock,
        mock_audit_service: AsyncMock,
        workspace_id: UUID,
    ):
        """Test consent withdrawal updates biometric settings on completion."""
        now = datetime.now(timezone.utc)
        job = FaceEmbeddingRetentionJob(
            id=uuid4(),
            workspace_id=workspace_id,
            job_type=RetentionJobType.CONSENT_WITHDRAWAL,
            status=RetentionJobStatus.PENDING,
            batch_size=100,
            created_at=now,
            updated_at=now,
        )
        mock_repository.get_job.return_value = job
        mock_repository.get_expired_face_ids.return_value = []

        completed_job = job.model_copy()
        completed_job.status = RetentionJobStatus.COMPLETED
        mock_repository.complete_job.return_value = completed_job

        with patch("app.services.face_retention_service.get_postgres_pool") as mock_pool:
            mock_conn = AsyncMock()
            mock_conn.fetchval.return_value = 0
            pool = AsyncMock()
            pool.acquire.return_value.__aenter__.return_value = mock_conn
            mock_pool.return_value = pool

            with patch(
                "app.services.face_retention_service.get_biometric_settings_repository"
            ) as mock_biometric_repo:
                mock_repo = AsyncMock()
                mock_biometric_repo.return_value = mock_repo

                await service.process_job(job.id)

                mock_repo.complete_deletion.assert_called_once_with(workspace_id)
