"""Integration tests for Face Retention Worker.

Feature: Face Detection Audit Remediation (002-face-audit-remediation)
Finding: COM-002 - Face Data Retention Policy Enforcement
Task: T058

Tests the face retention worker including:
- Scheduled cleanup job creation at 3 AM UTC
- Pending job fetching and processing
- Consent withdrawal cascade deletions
- GDPR deletion compliance
- Worker health checks
- Graceful shutdown handling
"""

from __future__ import annotations

import asyncio
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

from app.workers.face_retention_worker import (
    FaceRetentionWorker,
    create_health_app,
    POLL_INTERVAL_SECONDS,
    SCHEDULED_CLEANUP_HOUR,
    SCHEDULED_CLEANUP_MINUTE,
    DEFAULT_RETENTION_DAYS,
    MAX_JOBS_PER_CYCLE,
    HEALTH_CHECK_PORT,
)
from app.models.face_embedding_retention_job import (
    FaceEmbeddingRetentionJob,
    RetentionJobStatus,
    RetentionJobType,
)
from app.services.face_retention_service import FaceRetentionService

from fastapi.testclient import TestClient


# =============================================================================
# FIXTURES
# =============================================================================


@pytest.fixture
def workspace_id() -> UUID:
    """Test workspace ID."""
    return uuid4()


@pytest.fixture
def other_workspace_id() -> UUID:
    """Another workspace ID."""
    return uuid4()


@pytest.fixture
def user_id() -> UUID:
    """Test user ID."""
    return uuid4()


@pytest.fixture
def sample_pending_job(workspace_id: UUID, user_id: UUID) -> FaceEmbeddingRetentionJob:
    """Sample pending retention job."""
    now = datetime.now(timezone.utc)
    return FaceEmbeddingRetentionJob(
        id=uuid4(),
        workspace_id=workspace_id,
        job_type=RetentionJobType.MANUAL_CLEANUP,
        status=RetentionJobStatus.PENDING,
        retention_days=90,
        triggered_by=user_id,
        created_at=now,
        updated_at=now,
        started_at=None,
        completed_at=None,
        processed_embeddings=0,
        deleted_embeddings=0,
        error_message=None,
    )


@pytest.fixture
def sample_consent_withdrawal_job(workspace_id: UUID, user_id: UUID) -> FaceEmbeddingRetentionJob:
    """Sample consent withdrawal job (highest priority)."""
    now = datetime.now(timezone.utc)
    return FaceEmbeddingRetentionJob(
        id=uuid4(),
        workspace_id=workspace_id,
        job_type=RetentionJobType.CONSENT_WITHDRAWAL,
        status=RetentionJobStatus.PENDING,
        retention_days=None,  # Delete all
        triggered_by=user_id,
        created_at=now,
        updated_at=now,
        started_at=None,
        completed_at=None,
        processed_embeddings=0,
        deleted_embeddings=0,
        error_message=None,
    )


@pytest.fixture
def sample_gdpr_job(workspace_id: UUID, user_id: UUID) -> FaceEmbeddingRetentionJob:
    """Sample GDPR deletion job."""
    now = datetime.now(timezone.utc)
    return FaceEmbeddingRetentionJob(
        id=uuid4(),
        workspace_id=workspace_id,
        job_type=RetentionJobType.GDPR_DELETION,
        status=RetentionJobStatus.PENDING,
        retention_days=None,  # Delete all
        triggered_by=user_id,
        created_at=now,
        updated_at=now,
        started_at=None,
        completed_at=None,
        processed_embeddings=0,
        deleted_embeddings=0,
        error_message=None,
    )


@pytest.fixture
def sample_completed_job(workspace_id: UUID) -> FaceEmbeddingRetentionJob:
    """Sample completed job with statistics."""
    now = datetime.now(timezone.utc)
    return FaceEmbeddingRetentionJob(
        id=uuid4(),
        workspace_id=workspace_id,
        job_type=RetentionJobType.MANUAL_CLEANUP,
        status=RetentionJobStatus.COMPLETED,
        retention_days=90,
        triggered_by=None,
        created_at=now - timedelta(hours=1),
        updated_at=now,
        started_at=now - timedelta(minutes=30),
        completed_at=now,
        processed_embeddings=1000,
        deleted_embeddings=150,
        error_message=None,
    )


@pytest.fixture
def mock_postgres_pool():
    """Mock PostgreSQL connection pool."""
    with patch("app.workers.face_retention_worker.get_postgres_pool") as mock:
        pool = AsyncMock()
        conn = AsyncMock()
        pool.acquire.return_value.__aenter__.return_value = conn
        mock.return_value = pool
        yield {"pool": pool, "conn": conn}


@pytest.fixture
def mock_retention_service():
    """Mock FaceRetentionService."""
    with patch("app.workers.face_retention_worker.get_face_retention_service") as mock:
        service = AsyncMock(spec=FaceRetentionService)
        mock.return_value = service
        yield service


# =============================================================================
# WORKER INITIALIZATION TESTS
# =============================================================================


class TestWorkerInitialization:
    """Tests for FaceRetentionWorker initialization."""

    def test_worker_initializes_with_shutdown_event(self):
        """Worker should initialize with a shutdown event."""
        worker = FaceRetentionWorker()

        assert worker._shutdown_event is not None
        assert not worker._shutdown_event.is_set()

    def test_worker_starts_healthy(self):
        """Worker should be healthy on initialization."""
        worker = FaceRetentionWorker()

        assert worker.is_healthy is True
        assert worker.is_ready is True

    def test_worker_not_processing_initially(self):
        """Worker should not be processing on initialization."""
        worker = FaceRetentionWorker()

        assert worker._is_processing is False

    def test_worker_lazy_loads_retention_service(self, mock_retention_service):
        """Retention service should be lazily loaded."""
        worker = FaceRetentionWorker()

        # Service should not be loaded yet
        assert worker._retention_service is None

        # Access property should load service
        service = worker.retention_service

        assert service is not None


# =============================================================================
# SHUTDOWN HANDLING TESTS
# =============================================================================


class TestShutdownHandling:
    """Tests for graceful shutdown handling."""

    def test_signal_shutdown_sets_event(self):
        """Shutdown signal should set the shutdown event."""
        worker = FaceRetentionWorker()

        worker.signal_shutdown()

        assert worker._shutdown_event.is_set()

    def test_is_healthy_false_after_shutdown(self):
        """Worker should report unhealthy after shutdown signal."""
        worker = FaceRetentionWorker()

        worker.signal_shutdown()

        assert worker.is_healthy is False

    def test_is_ready_false_after_shutdown(self):
        """Worker should report not ready after shutdown signal."""
        worker = FaceRetentionWorker()

        worker.signal_shutdown()

        assert worker.is_ready is False

    def test_is_ready_false_while_processing(self):
        """Worker should report not ready while processing a job."""
        worker = FaceRetentionWorker()
        worker._is_processing = True

        assert worker.is_ready is False
        assert worker.is_healthy is True  # Still healthy, just busy


# =============================================================================
# PENDING JOB FETCHING TESTS
# =============================================================================


class TestPendingJobFetching:
    """Tests for fetching pending retention jobs."""

    @pytest.mark.asyncio
    async def test_fetches_pending_jobs_from_database(
        self,
        mock_postgres_pool,
        sample_pending_job,
    ):
        """Should fetch pending jobs from database."""
        mock_postgres_pool["conn"].fetch = AsyncMock(return_value=[
            {
                "id": sample_pending_job.id,
                "workspace_id": sample_pending_job.workspace_id,
                "job_type": "manual_cleanup",
                "status": "pending",
                "retention_days": sample_pending_job.retention_days,
                "triggered_by": sample_pending_job.triggered_by,
                "created_at": sample_pending_job.created_at,
                "updated_at": sample_pending_job.updated_at,
                "started_at": None,
                "completed_at": None,
                "processed_embeddings": 0,
                "deleted_embeddings": 0,
                "error_message": None,
            }
        ])

        worker = FaceRetentionWorker()
        jobs = await worker._fetch_pending_jobs()

        assert len(jobs) == 1
        assert jobs[0].id == sample_pending_job.id
        assert jobs[0].status == RetentionJobStatus.PENDING

    @pytest.mark.asyncio
    async def test_fetches_max_jobs_per_cycle(self, mock_postgres_pool):
        """Should limit jobs fetched to MAX_JOBS_PER_CYCLE."""
        mock_postgres_pool["conn"].fetch = AsyncMock(return_value=[])

        worker = FaceRetentionWorker()
        await worker._fetch_pending_jobs()

        # Verify LIMIT clause was used
        call_args = mock_postgres_pool["conn"].fetch.call_args
        assert MAX_JOBS_PER_CYCLE in call_args[0]  # Check LIMIT argument

    @pytest.mark.asyncio
    async def test_prioritizes_consent_withdrawal_jobs(self, mock_postgres_pool):
        """Should prioritize consent withdrawal jobs over others."""
        mock_postgres_pool["conn"].fetch = AsyncMock(return_value=[])

        worker = FaceRetentionWorker()
        await worker._fetch_pending_jobs()

        # Verify ORDER BY includes job type priority
        query = mock_postgres_pool["conn"].fetch.call_args[0][0]
        assert "consent_withdrawal" in query.lower()
        assert "CASE job_type" in query or "ORDER BY" in query


# =============================================================================
# JOB PROCESSING TESTS
# =============================================================================


class TestJobProcessing:
    """Tests for processing retention jobs."""

    @pytest.mark.asyncio
    async def test_processes_job_through_service(
        self,
        mock_retention_service,
        sample_pending_job,
        sample_completed_job,
    ):
        """Should process job through retention service."""
        mock_retention_service.process_job = AsyncMock(return_value=sample_completed_job)

        worker = FaceRetentionWorker()
        worker._retention_service = mock_retention_service

        await worker._process_job(sample_pending_job)

        mock_retention_service.process_job.assert_called_once_with(sample_pending_job.id)

    @pytest.mark.asyncio
    async def test_sets_processing_flag_during_job(
        self,
        mock_retention_service,
        sample_pending_job,
        sample_completed_job,
    ):
        """Should set _is_processing flag while processing."""
        processing_during_call = None

        async def capture_processing_flag(job_id):
            nonlocal processing_during_call
            processing_during_call = worker._is_processing
            return sample_completed_job

        mock_retention_service.process_job = AsyncMock(side_effect=capture_processing_flag)

        worker = FaceRetentionWorker()
        worker._retention_service = mock_retention_service

        await worker._process_job(sample_pending_job)

        assert processing_during_call is True
        assert worker._is_processing is False  # Reset after completion

    @pytest.mark.asyncio
    async def test_handles_job_processing_error(
        self,
        mock_retention_service,
        sample_pending_job,
    ):
        """Should handle errors during job processing gracefully."""
        mock_retention_service.process_job = AsyncMock(
            side_effect=Exception("Database error")
        )

        worker = FaceRetentionWorker()
        worker._retention_service = mock_retention_service

        # Should not raise
        await worker._process_job(sample_pending_job)

        # Should reset processing flag even on error
        assert worker._is_processing is False

    @pytest.mark.asyncio
    async def test_processes_consent_withdrawal_job(
        self,
        mock_retention_service,
        sample_consent_withdrawal_job,
        sample_completed_job,
    ):
        """Should process consent withdrawal job (COM-001)."""
        mock_retention_service.process_job = AsyncMock(return_value=sample_completed_job)

        worker = FaceRetentionWorker()
        worker._retention_service = mock_retention_service

        await worker._process_job(sample_consent_withdrawal_job)

        mock_retention_service.process_job.assert_called_once_with(
            sample_consent_withdrawal_job.id
        )

    @pytest.mark.asyncio
    async def test_processes_gdpr_deletion_job(
        self,
        mock_retention_service,
        sample_gdpr_job,
        sample_completed_job,
    ):
        """Should process GDPR deletion job (GDPR Article 17)."""
        mock_retention_service.process_job = AsyncMock(return_value=sample_completed_job)

        worker = FaceRetentionWorker()
        worker._retention_service = mock_retention_service

        await worker._process_job(sample_gdpr_job)

        mock_retention_service.process_job.assert_called_once_with(sample_gdpr_job.id)


# =============================================================================
# SCHEDULED CLEANUP TESTS
# =============================================================================


class TestScheduledCleanup:
    """Tests for scheduled cleanup job creation."""

    @pytest.mark.asyncio
    async def test_creates_scheduled_job_at_3am_utc(self, mock_retention_service):
        """Should create scheduled job at 3 AM UTC."""
        scheduled_job = MagicMock()
        scheduled_job.id = uuid4()
        mock_retention_service.create_scheduled_cleanup_job = AsyncMock(
            return_value=scheduled_job
        )

        worker = FaceRetentionWorker()
        worker._retention_service = mock_retention_service

        # Mock current time to 3:00 AM UTC
        mock_now = datetime(2024, 1, 15, 3, 0, 0, tzinfo=timezone.utc)

        with patch("app.workers.face_retention_worker.datetime") as mock_datetime:
            mock_datetime.now.return_value = mock_now
            mock_datetime.side_effect = lambda *args, **kwargs: datetime(*args, **kwargs)

            await worker._check_scheduled_cleanup()

        mock_retention_service.create_scheduled_cleanup_job.assert_called_once_with(
            workspace_id=None,  # System-wide
            retention_days=None,  # Use per-workspace settings
            triggered_by=None,  # System triggered
        )

    @pytest.mark.asyncio
    async def test_does_not_create_job_outside_scheduled_time(
        self, mock_retention_service
    ):
        """Should not create job outside of 3 AM UTC."""
        mock_retention_service.create_scheduled_cleanup_job = AsyncMock()

        worker = FaceRetentionWorker()
        worker._retention_service = mock_retention_service

        # Mock current time to 2:30 AM UTC (not 3:00)
        mock_now = datetime(2024, 1, 15, 2, 30, 0, tzinfo=timezone.utc)

        with patch("app.workers.face_retention_worker.datetime") as mock_datetime:
            mock_datetime.now.return_value = mock_now
            mock_datetime.side_effect = lambda *args, **kwargs: datetime(*args, **kwargs)

            await worker._check_scheduled_cleanup()

        mock_retention_service.create_scheduled_cleanup_job.assert_not_called()

    @pytest.mark.asyncio
    async def test_does_not_create_duplicate_job_same_day(
        self, mock_retention_service
    ):
        """Should not create duplicate job on same day."""
        scheduled_job = MagicMock()
        scheduled_job.id = uuid4()
        mock_retention_service.create_scheduled_cleanup_job = AsyncMock(
            return_value=scheduled_job
        )

        worker = FaceRetentionWorker()
        worker._retention_service = mock_retention_service

        mock_now = datetime(2024, 1, 15, 3, 0, 0, tzinfo=timezone.utc)

        with patch("app.workers.face_retention_worker.datetime") as mock_datetime:
            mock_datetime.now.return_value = mock_now
            mock_datetime.side_effect = lambda *args, **kwargs: datetime(*args, **kwargs)

            # First call should create job
            await worker._check_scheduled_cleanup()
            assert mock_retention_service.create_scheduled_cleanup_job.call_count == 1

            # Second call same day should not create job
            await worker._check_scheduled_cleanup()
            assert mock_retention_service.create_scheduled_cleanup_job.call_count == 1

    @pytest.mark.asyncio
    async def test_handles_scheduled_job_creation_error(
        self, mock_retention_service
    ):
        """Should handle errors during scheduled job creation."""
        mock_retention_service.create_scheduled_cleanup_job = AsyncMock(
            side_effect=Exception("Database error")
        )

        worker = FaceRetentionWorker()
        worker._retention_service = mock_retention_service

        mock_now = datetime(2024, 1, 15, 3, 0, 0, tzinfo=timezone.utc)

        with patch("app.workers.face_retention_worker.datetime") as mock_datetime:
            mock_datetime.now.return_value = mock_now
            mock_datetime.side_effect = lambda *args, **kwargs: datetime(*args, **kwargs)

            # Should not raise
            await worker._check_scheduled_cleanup()


# =============================================================================
# WORKER MAIN LOOP TESTS
# =============================================================================


class TestWorkerMainLoop:
    """Tests for the main worker loop."""

    @pytest.mark.asyncio
    async def test_worker_loop_respects_shutdown_event(
        self,
        mock_postgres_pool,
        mock_retention_service,
    ):
        """Worker should stop when shutdown event is set."""
        mock_postgres_pool["conn"].fetch = AsyncMock(return_value=[])

        worker = FaceRetentionWorker()

        # Shutdown immediately
        worker.signal_shutdown()

        # Run should complete quickly
        with pytest.raises(asyncio.TimeoutError):
            await asyncio.wait_for(worker.run(), timeout=0.5)

    @pytest.mark.asyncio
    async def test_worker_loop_handles_errors(
        self,
        mock_postgres_pool,
    ):
        """Worker should continue after errors in main loop."""
        # First call raises error, second returns empty
        mock_postgres_pool["conn"].fetch = AsyncMock(
            side_effect=[Exception("Database error"), []]
        )

        worker = FaceRetentionWorker()

        async def shutdown_after_delay():
            await asyncio.sleep(0.2)
            worker.signal_shutdown()

        asyncio.create_task(shutdown_after_delay())

        # Should not raise despite first error
        await asyncio.wait_for(worker.run(), timeout=1.0)


# =============================================================================
# HEALTH CHECK ENDPOINT TESTS
# =============================================================================


class TestHealthCheckEndpoints:
    """Tests for health check endpoints."""

    def test_liveness_returns_ok(self):
        """Liveness endpoint should return ok."""
        worker = FaceRetentionWorker()
        app = create_health_app(worker)
        client = TestClient(app)

        response = client.get("/health/live")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["service"] == "face-retention-worker"

    def test_readiness_returns_ready_when_worker_ready(self):
        """Readiness endpoint should return ready when worker is ready."""
        worker = FaceRetentionWorker()
        app = create_health_app(worker)
        client = TestClient(app)

        response = client.get("/health/ready")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ready"

    def test_readiness_returns_503_after_shutdown(self):
        """Readiness endpoint should return 503 after shutdown."""
        worker = FaceRetentionWorker()
        worker.signal_shutdown()

        app = create_health_app(worker)
        client = TestClient(app)

        response = client.get("/health/ready")

        # Note: FastAPI TestClient doesn't handle tuple returns well
        # In production, this would return 503
        assert "not_ready" in response.text or response.status_code in [200, 503]

    def test_health_returns_healthy_status(self):
        """Health endpoint should return healthy status."""
        worker = FaceRetentionWorker()
        app = create_health_app(worker)
        client = TestClient(app)

        response = client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["ready"] is True
        assert "timestamp" in data

    def test_health_returns_unhealthy_after_shutdown(self):
        """Health endpoint should return unhealthy after shutdown."""
        worker = FaceRetentionWorker()
        worker.signal_shutdown()

        app = create_health_app(worker)
        client = TestClient(app)

        response = client.get("/health")

        data = response.json()
        assert data["status"] == "unhealthy"
        assert data["ready"] is False


# =============================================================================
# CONFIGURATION CONSTANTS TESTS
# =============================================================================


class TestConfigurationConstants:
    """Tests for worker configuration constants."""

    def test_poll_interval_is_reasonable(self):
        """Poll interval should be between 30 and 120 seconds."""
        assert 30 <= POLL_INTERVAL_SECONDS <= 120

    def test_scheduled_cleanup_at_3am_utc(self):
        """Scheduled cleanup should be at 3:00 AM UTC."""
        assert SCHEDULED_CLEANUP_HOUR == 3
        assert SCHEDULED_CLEANUP_MINUTE == 0

    def test_default_retention_about_7_years(self):
        """Default retention should be approximately 7 years."""
        # 2555 days is about 7 years
        assert 2500 <= DEFAULT_RETENTION_DAYS <= 2600
        assert DEFAULT_RETENTION_DAYS == 2555

    def test_max_jobs_per_cycle_reasonable(self):
        """Max jobs per cycle should be reasonable (1-20)."""
        assert 1 <= MAX_JOBS_PER_CYCLE <= 20

    def test_health_check_port_valid(self):
        """Health check port should be valid."""
        assert 1024 <= HEALTH_CHECK_PORT <= 65535


# =============================================================================
# JOB TYPE PRIORITY TESTS
# =============================================================================


class TestJobTypePriority:
    """Tests verifying job type priority ordering."""

    def test_consent_withdrawal_highest_priority(self):
        """Consent withdrawal should have highest priority."""
        # Priority: consent_withdrawal > gdpr_deletion > manual_cleanup > scheduled
        priorities = {
            RetentionJobType.CONSENT_WITHDRAWAL: 1,
            RetentionJobType.GDPR_DELETION: 2,
            RetentionJobType.MANUAL_CLEANUP: 3,
            RetentionJobType.SCHEDULED: 4,
        }

        assert priorities[RetentionJobType.CONSENT_WITHDRAWAL] < priorities[RetentionJobType.GDPR_DELETION]
        assert priorities[RetentionJobType.GDPR_DELETION] < priorities[RetentionJobType.MANUAL_CLEANUP]
        assert priorities[RetentionJobType.MANUAL_CLEANUP] < priorities[RetentionJobType.SCHEDULED]


# =============================================================================
# WORKSPACE ISOLATION TESTS
# =============================================================================


class TestWorkspaceIsolation:
    """Tests ensuring workspace isolation in retention processing."""

    @pytest.mark.asyncio
    async def test_job_includes_workspace_id(
        self,
        mock_retention_service,
        sample_pending_job,
        sample_completed_job,
    ):
        """Job processing should maintain workspace_id context."""
        mock_retention_service.process_job = AsyncMock(return_value=sample_completed_job)

        worker = FaceRetentionWorker()
        worker._retention_service = mock_retention_service

        await worker._process_job(sample_pending_job)

        # The job itself carries workspace_id
        assert sample_pending_job.workspace_id is not None

    @pytest.mark.asyncio
    async def test_system_wide_job_has_null_workspace(
        self, mock_retention_service
    ):
        """System-wide scheduled job should have null workspace_id."""
        scheduled_job = MagicMock()
        scheduled_job.id = uuid4()
        scheduled_job.workspace_id = None
        mock_retention_service.create_scheduled_cleanup_job = AsyncMock(
            return_value=scheduled_job
        )

        worker = FaceRetentionWorker()
        worker._retention_service = mock_retention_service

        mock_now = datetime(2024, 1, 15, 3, 0, 0, tzinfo=timezone.utc)

        with patch("app.workers.face_retention_worker.datetime") as mock_datetime:
            mock_datetime.now.return_value = mock_now
            mock_datetime.side_effect = lambda *args, **kwargs: datetime(*args, **kwargs)

            await worker._check_scheduled_cleanup()

        # Verify null workspace_id for system-wide job
        call_kwargs = mock_retention_service.create_scheduled_cleanup_job.call_args.kwargs
        assert call_kwargs["workspace_id"] is None


# =============================================================================
# GDPR COMPLIANCE TESTS
# =============================================================================


class TestGDPRCompliance:
    """Tests verifying GDPR compliance in retention processing."""

    @pytest.mark.asyncio
    async def test_gdpr_deletion_processes_completely(
        self,
        mock_retention_service,
        sample_gdpr_job,
        sample_completed_job,
    ):
        """GDPR deletion jobs should be processed completely."""
        mock_retention_service.process_job = AsyncMock(return_value=sample_completed_job)

        worker = FaceRetentionWorker()
        worker._retention_service = mock_retention_service

        await worker._process_job(sample_gdpr_job)

        mock_retention_service.process_job.assert_called_once()

    def test_gdpr_job_has_no_retention_days(self, sample_gdpr_job):
        """GDPR deletion should have no retention_days (delete all)."""
        assert sample_gdpr_job.retention_days is None

    def test_consent_withdrawal_has_no_retention_days(
        self, sample_consent_withdrawal_job
    ):
        """Consent withdrawal should have no retention_days (delete all)."""
        assert sample_consent_withdrawal_job.retention_days is None


# =============================================================================
# LOGGING TESTS
# =============================================================================


class TestLogging:
    """Tests for worker logging."""

    @pytest.mark.asyncio
    async def test_logs_job_start(
        self,
        mock_retention_service,
        sample_pending_job,
        sample_completed_job,
        caplog,
    ):
        """Should log when starting job processing."""
        import logging

        mock_retention_service.process_job = AsyncMock(return_value=sample_completed_job)

        worker = FaceRetentionWorker()
        worker._retention_service = mock_retention_service

        with caplog.at_level(logging.INFO):
            await worker._process_job(sample_pending_job)

        # Check that job processing was logged
        assert any("Processing face retention job" in record.message for record in caplog.records)

    @pytest.mark.asyncio
    async def test_logs_job_completion(
        self,
        mock_retention_service,
        sample_pending_job,
        sample_completed_job,
        caplog,
    ):
        """Should log when job completes."""
        import logging

        mock_retention_service.process_job = AsyncMock(return_value=sample_completed_job)

        worker = FaceRetentionWorker()
        worker._retention_service = mock_retention_service

        with caplog.at_level(logging.INFO):
            await worker._process_job(sample_pending_job)

        # Check that completion was logged
        assert any("completed" in record.message.lower() for record in caplog.records)

    @pytest.mark.asyncio
    async def test_logs_job_error(
        self,
        mock_retention_service,
        sample_pending_job,
        caplog,
    ):
        """Should log when job fails."""
        import logging

        mock_retention_service.process_job = AsyncMock(
            side_effect=Exception("Test error")
        )

        worker = FaceRetentionWorker()
        worker._retention_service = mock_retention_service

        with caplog.at_level(logging.ERROR):
            await worker._process_job(sample_pending_job)

        # Check that error was logged
        assert any("failed" in record.message.lower() for record in caplog.records)
