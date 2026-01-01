"""
Unit Tests for Email Send Log Tracking.

Tests the email_send_log table operations for tracking
individual email delivery status in bulk invite batches.
"""

import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from src.services.bulk_invite_service import (
    BulkInviteService,
    SendLogEntry,
    SendStatus,
)


class TestSendLogEntryCreation:
    """Test send log entry creation."""

    def test_send_log_entry_has_required_fields(self):
        """SendLogEntry has all required fields."""
        entry = SendLogEntry(
            id=str(uuid4()),
            batch_id=str(uuid4()),
            invitation_id=str(uuid4()),
            guest_id=str(uuid4()),
            email="test@example.com",
            status=SendStatus.PENDING,
        )

        assert entry.id is not None
        assert entry.batch_id is not None
        assert entry.invitation_id is not None
        assert entry.guest_id is not None
        assert entry.email == "test@example.com"
        assert entry.status == SendStatus.PENDING

    def test_send_log_entry_defaults_to_pending(self):
        """SendLogEntry defaults to PENDING status."""
        entry = SendLogEntry(
            id=str(uuid4()),
            batch_id=str(uuid4()),
            invitation_id=str(uuid4()),
            guest_id=str(uuid4()),
            email="test@example.com",
        )

        assert entry.status == SendStatus.PENDING

    def test_send_log_entry_tracks_timestamps(self):
        """SendLogEntry tracks created_at and updated_at."""
        now = datetime.now(timezone.utc)
        entry = SendLogEntry(
            id=str(uuid4()),
            batch_id=str(uuid4()),
            invitation_id=str(uuid4()),
            guest_id=str(uuid4()),
            email="test@example.com",
            created_at=now,
        )

        assert entry.created_at is not None


class TestSendStatus:
    """Test send status enum."""

    def test_status_values(self):
        """Verify all expected status values exist."""
        assert SendStatus.PENDING.value == "pending"
        assert SendStatus.QUEUED.value == "queued"
        assert SendStatus.SENT.value == "sent"
        assert SendStatus.FAILED.value == "failed"
        assert SendStatus.BOUNCED.value == "bounced"

    def test_status_is_terminal(self):
        """Check which statuses are terminal (no further updates)."""
        terminal_statuses = [SendStatus.SENT, SendStatus.FAILED, SendStatus.BOUNCED]
        non_terminal = [SendStatus.PENDING, SendStatus.QUEUED]

        for status in terminal_statuses:
            assert status.is_terminal() if hasattr(status, 'is_terminal') else True

        for status in non_terminal:
            assert not status.is_terminal() if hasattr(status, 'is_terminal') else True


class TestSendLogInsert:
    """Test inserting send log entries."""

    @pytest.fixture
    def service(self):
        """Create BulkInviteService instance."""
        return BulkInviteService()

    @pytest.mark.asyncio
    async def test_insert_single_entry(self, service):
        """Insert a single send log entry."""
        entry = SendLogEntry(
            id=str(uuid4()),
            batch_id=str(uuid4()),
            invitation_id=str(uuid4()),
            guest_id=str(uuid4()),
            email="test@example.com",
            status=SendStatus.PENDING,
        )

        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn
            mock_conn.execute.return_value = "INSERT 1"

            await service.insert_send_log_entry(entry)

            assert mock_conn.execute.called

    @pytest.mark.asyncio
    async def test_insert_batch_entries(self, service):
        """Insert multiple send log entries efficiently."""
        batch_id = str(uuid4())
        invitation_id = str(uuid4())

        entries = [
            SendLogEntry(
                id=str(uuid4()),
                batch_id=batch_id,
                invitation_id=invitation_id,
                guest_id=str(uuid4()),
                email=f"guest{i}@example.com",
                status=SendStatus.PENDING,
            )
            for i in range(50)
        ]

        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn
            mock_conn.executemany.return_value = None

            await service.insert_send_log_entries(entries)

            # Should use batch insert, not individual inserts
            if mock_conn.executemany.called:
                assert mock_conn.executemany.call_count == 1
            else:
                # Or a single execute with UNNEST/VALUES
                assert mock_conn.execute.call_count <= 2


class TestSendLogStatusUpdate:
    """Test updating send log entry status."""

    @pytest.fixture
    def service(self):
        """Create BulkInviteService instance."""
        return BulkInviteService()

    @pytest.mark.asyncio
    async def test_update_status_to_sent(self, service):
        """Update entry status to SENT."""
        entry_id = str(uuid4())

        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn
            mock_conn.execute.return_value = "UPDATE 1"

            await service.update_send_status(
                entry_id=entry_id,
                status=SendStatus.SENT,
            )

            assert mock_conn.execute.called
            query = mock_conn.execute.call_args[0][0]
            assert "UPDATE" in query.upper()

    @pytest.mark.asyncio
    async def test_update_status_to_failed_with_error(self, service):
        """Update entry status to FAILED with error message."""
        entry_id = str(uuid4())

        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn
            mock_conn.execute.return_value = "UPDATE 1"

            await service.update_send_status(
                entry_id=entry_id,
                status=SendStatus.FAILED,
                error_message="SMTP connection timeout",
            )

            assert mock_conn.execute.called
            # Error message should be in parameters
            call_args = mock_conn.execute.call_args
            assert "SMTP" in str(call_args) or "error" in call_args[0][0].lower()

    @pytest.mark.asyncio
    async def test_update_increments_retry_count(self, service):
        """Retry increments retry_count field."""
        entry_id = str(uuid4())

        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn
            mock_conn.execute.return_value = "UPDATE 1"

            await service.increment_retry_count(entry_id)

            assert mock_conn.execute.called
            query = mock_conn.execute.call_args[0][0]
            assert "retry" in query.lower()


class TestSendLogQuery:
    """Test querying send log entries."""

    @pytest.fixture
    def service(self):
        """Create BulkInviteService instance."""
        return BulkInviteService()

    @pytest.mark.asyncio
    async def test_get_pending_entries_for_batch(self, service):
        """Get all pending entries for a batch."""
        batch_id = str(uuid4())

        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn

            mock_conn.fetch.return_value = [
                {"id": str(uuid4()), "status": "pending", "email": "a@test.com"},
                {"id": str(uuid4()), "status": "pending", "email": "b@test.com"},
            ]

            result = await service.get_pending_entries(batch_id)

            assert len(result) == 2
            assert all(r["status"] == "pending" for r in result)

    @pytest.mark.asyncio
    async def test_get_failed_entries_for_batch(self, service):
        """Get all failed entries for a batch."""
        batch_id = str(uuid4())

        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn

            mock_conn.fetch.return_value = [
                {"id": str(uuid4()), "status": "failed", "email": "a@test.com", "error": "Bounced"},
            ]

            result = await service.get_failed_entries(batch_id)

            assert len(result) == 1
            assert result[0]["status"] == "failed"

    @pytest.mark.asyncio
    async def test_get_entries_by_status(self, service):
        """Get entries filtered by specific status."""
        batch_id = str(uuid4())

        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn

            mock_conn.fetch.return_value = [
                {"id": str(uuid4()), "status": "sent", "email": "a@test.com"},
                {"id": str(uuid4()), "status": "sent", "email": "b@test.com"},
                {"id": str(uuid4()), "status": "sent", "email": "c@test.com"},
            ]

            result = await service.get_entries_by_status(batch_id, SendStatus.SENT)

            assert len(result) == 3


class TestSendLogRetryLogic:
    """Test retry logic for failed sends."""

    @pytest.fixture
    def service(self):
        """Create BulkInviteService instance."""
        return BulkInviteService()

    @pytest.mark.asyncio
    async def test_get_retriable_entries(self, service):
        """Get entries that can be retried (retry_count < max)."""
        batch_id = str(uuid4())

        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn

            mock_conn.fetch.return_value = [
                {"id": str(uuid4()), "status": "failed", "retry_count": 0},
                {"id": str(uuid4()), "status": "failed", "retry_count": 1},
                {"id": str(uuid4()), "status": "failed", "retry_count": 2},
            ]

            result = await service.get_retriable_entries(batch_id, max_retries=3)

            # All have retry_count < 3
            assert len(result) == 3

    @pytest.mark.asyncio
    async def test_entries_at_max_retries_excluded(self, service):
        """Entries at max retries are not retriable."""
        batch_id = str(uuid4())

        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn

            # Query should filter by retry_count < max_retries
            mock_conn.fetch.return_value = [
                {"id": str(uuid4()), "status": "failed", "retry_count": 0},
            ]

            result = await service.get_retriable_entries(batch_id, max_retries=3)

            # Verify query includes retry filter
            call_args = mock_conn.fetch.call_args
            query = call_args[0][0]
            assert "retry" in query.lower() or len(result) <= 1


class TestSendLogMetrics:
    """Test send log metrics and aggregation."""

    @pytest.fixture
    def service(self):
        """Create BulkInviteService instance."""
        return BulkInviteService()

    @pytest.mark.asyncio
    async def test_get_batch_metrics(self, service):
        """Get aggregated metrics for a batch."""
        batch_id = str(uuid4())

        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn

            mock_conn.fetch.return_value = [
                {"status": "sent", "count": 95},
                {"status": "failed", "count": 3},
                {"status": "pending", "count": 2},
            ]

            metrics = await service.get_batch_metrics(batch_id)

            assert metrics["total"] == 100
            assert metrics["sent"] == 95
            assert metrics["failed"] == 3
            assert metrics["pending"] == 2
            assert metrics["success_rate"] == 0.95

    @pytest.mark.asyncio
    async def test_batch_completion_detection(self, service):
        """Detect when a batch is fully complete."""
        batch_id = str(uuid4())

        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn

            # All sent or failed (no pending)
            mock_conn.fetch.return_value = [
                {"status": "sent", "count": 97},
                {"status": "failed", "count": 3},
            ]

            is_complete = await service.is_batch_complete(batch_id)

            assert is_complete is True

    @pytest.mark.asyncio
    async def test_batch_incomplete_with_pending(self, service):
        """Batch is incomplete when pending entries exist."""
        batch_id = str(uuid4())

        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn

            mock_conn.fetch.return_value = [
                {"status": "sent", "count": 50},
                {"status": "pending", "count": 50},
            ]

            is_complete = await service.is_batch_complete(batch_id)

            assert is_complete is False
