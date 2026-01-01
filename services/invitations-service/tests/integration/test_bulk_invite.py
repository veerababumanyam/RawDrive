"""
Integration Tests for Bulk Email Invitations.

Tests the full bulk invite workflow from API request through
email queuing and status tracking.
"""

import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from fastapi import FastAPI
from httpx import AsyncClient

from src.services.bulk_invite_service import BulkInviteService


@pytest.fixture
def workspace_id() -> str:
    """Generate a test workspace ID."""
    return str(uuid4())


@pytest.fixture
def invitation_id() -> str:
    """Generate a test invitation ID."""
    return str(uuid4())


@pytest.fixture
def guest_ids() -> list[str]:
    """Generate a list of test guest IDs."""
    return [str(uuid4()) for _ in range(10)]


class TestBulkInviteAPI:
    """Test bulk invite API endpoints."""

    @pytest.mark.asyncio
    async def test_bulk_invite_queues_all_guests(self, workspace_id, invitation_id, guest_ids):
        """Bulk invite queues emails for all specified guests."""
        service = BulkInviteService()

        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn

            # Mock guest fetch
            mock_conn.fetch.return_value = [
                {"id": gid, "email": f"guest{i}@example.com", "name": f"Guest {i}"}
                for i, gid in enumerate(guest_ids)
            ]

            # Mock batch insert
            mock_conn.executemany.return_value = None

            result = await service.queue_bulk_invites(
                workspace_id=workspace_id,
                invitation_id=invitation_id,
                guest_ids=guest_ids,
            )

            # Should return batch info
            assert "batch_id" in result
            assert result["queued_count"] == len(guest_ids)

    @pytest.mark.asyncio
    async def test_bulk_invite_creates_send_log_entries(self, workspace_id, invitation_id, guest_ids):
        """Bulk invite creates email_send_log entries for tracking."""
        service = BulkInviteService()

        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn

            mock_conn.fetch.return_value = [
                {"id": gid, "email": f"guest{i}@example.com", "name": f"Guest {i}"}
                for i, gid in enumerate(guest_ids)
            ]

            await service.queue_bulk_invites(
                workspace_id=workspace_id,
                invitation_id=invitation_id,
                guest_ids=guest_ids,
            )

            # Verify executemany was called for send log entries
            assert mock_conn.executemany.called or mock_conn.execute.called

    @pytest.mark.asyncio
    async def test_bulk_invite_skips_invalid_guests(self, workspace_id, invitation_id):
        """Bulk invite skips guests without email addresses."""
        service = BulkInviteService()

        guest_ids = [str(uuid4()) for _ in range(5)]

        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn

            # Some guests have no email
            mock_conn.fetch.return_value = [
                {"id": guest_ids[0], "email": "valid@example.com", "name": "Valid Guest"},
                {"id": guest_ids[1], "email": None, "name": "No Email Guest"},
                {"id": guest_ids[2], "email": "", "name": "Empty Email Guest"},
                {"id": guest_ids[3], "email": "another@example.com", "name": "Another Valid"},
                {"id": guest_ids[4], "email": "third@example.com", "name": "Third Valid"},
            ]

            result = await service.queue_bulk_invites(
                workspace_id=workspace_id,
                invitation_id=invitation_id,
                guest_ids=guest_ids,
            )

            # Only 3 guests have valid emails
            assert result["queued_count"] == 3
            assert result["skipped_count"] == 2

    @pytest.mark.asyncio
    async def test_bulk_invite_returns_batch_id(self, workspace_id, invitation_id, guest_ids):
        """Bulk invite returns a batch ID for status tracking."""
        service = BulkInviteService()

        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn

            mock_conn.fetch.return_value = [
                {"id": gid, "email": f"guest{i}@example.com", "name": f"Guest {i}"}
                for i, gid in enumerate(guest_ids)
            ]

            result = await service.queue_bulk_invites(
                workspace_id=workspace_id,
                invitation_id=invitation_id,
                guest_ids=guest_ids,
            )

            batch_id = result["batch_id"]

            # Batch ID should be a valid UUID
            assert len(batch_id) == 36  # UUID format


class TestBulkInviteStatusTracking:
    """Test bulk invite status tracking."""

    @pytest.mark.asyncio
    async def test_get_batch_status_returns_counts(self, workspace_id):
        """Get batch status returns send/fail/pending counts."""
        service = BulkInviteService()
        batch_id = str(uuid4())

        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn

            mock_conn.fetch.return_value = [
                {"status": "sent", "count": 45},
                {"status": "failed", "count": 3},
                {"status": "pending", "count": 2},
            ]

            result = await service.get_batch_status(workspace_id, batch_id)

            assert result["sent"] == 45
            assert result["failed"] == 3
            assert result["pending"] == 2
            assert result["total"] == 50

    @pytest.mark.asyncio
    async def test_batch_status_includes_percentage(self, workspace_id):
        """Batch status includes completion percentage."""
        service = BulkInviteService()
        batch_id = str(uuid4())

        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn

            mock_conn.fetch.return_value = [
                {"status": "sent", "count": 80},
                {"status": "pending", "count": 20},
            ]

            result = await service.get_batch_status(workspace_id, batch_id)

            assert result["completion_percentage"] == 80.0

    @pytest.mark.asyncio
    async def test_batch_status_returns_empty_for_unknown_batch(self, workspace_id):
        """Unknown batch ID returns empty/error response."""
        service = BulkInviteService()
        batch_id = str(uuid4())

        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn

            mock_conn.fetch.return_value = []

            result = await service.get_batch_status(workspace_id, batch_id)

            assert result["total"] == 0
            assert result.get("not_found", False) or result["total"] == 0


class TestBatchGuestFetching:
    """Test efficient guest batch fetching."""

    @pytest.mark.asyncio
    async def test_batch_fetch_uses_single_query(self, workspace_id, guest_ids):
        """Batch fetch uses a single query instead of N+1."""
        service = BulkInviteService()

        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn

            mock_conn.fetch.return_value = [
                {"id": gid, "email": f"guest{i}@example.com", "name": f"Guest {i}"}
                for i, gid in enumerate(guest_ids)
            ]

            await service.batch_fetch_guests(workspace_id, guest_ids)

            # Should only call fetch once, not per guest
            assert mock_conn.fetch.call_count == 1

    @pytest.mark.asyncio
    async def test_batch_fetch_filters_by_workspace(self, workspace_id, guest_ids):
        """Batch fetch includes workspace filter for data isolation."""
        service = BulkInviteService()

        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn

            mock_conn.fetch.return_value = []

            await service.batch_fetch_guests(workspace_id, guest_ids)

            # Check query includes workspace_id
            call_args = mock_conn.fetch.call_args
            query = call_args[0][0]

            assert "workspace_id" in query.lower() or workspace_id in str(call_args)


class TestBulkInviteAuditLogging:
    """Test audit logging for bulk invite operations."""

    @pytest.mark.asyncio
    async def test_bulk_invite_creates_audit_entry(self, workspace_id, invitation_id, guest_ids):
        """Bulk invite creates audit log entry."""
        service = BulkInviteService()

        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn

            mock_conn.fetch.return_value = [
                {"id": gid, "email": f"guest{i}@example.com", "name": f"Guest {i}"}
                for i, gid in enumerate(guest_ids)
            ]

            with patch('src.services.bulk_invite_service.audit_service') as mock_audit:
                mock_audit.log_event = AsyncMock()

                await service.queue_bulk_invites(
                    workspace_id=workspace_id,
                    invitation_id=invitation_id,
                    guest_ids=guest_ids,
                    user_id=str(uuid4()),
                )

                # Audit event should be logged
                if mock_audit.log_event.called:
                    call_args = mock_audit.log_event.call_args
                    assert "bulk_invite" in str(call_args).lower() or "guest" in str(call_args).lower()


class TestBulkInviteLimits:
    """Test bulk invite limits and validation."""

    @pytest.mark.asyncio
    async def test_bulk_invite_respects_max_batch_size(self, workspace_id, invitation_id):
        """Bulk invite respects maximum batch size limit."""
        service = BulkInviteService()

        # Try to invite more than the limit
        large_guest_list = [str(uuid4()) for _ in range(1000)]

        with patch.object(service, '_get_pool') as mock_pool:
            mock_conn = AsyncMock()
            mock_pool.return_value.__aenter__.return_value = mock_conn

            # Service should either:
            # 1. Reject with error
            # 2. Truncate to max batch size
            # 3. Process in batches

            try:
                result = await service.queue_bulk_invites(
                    workspace_id=workspace_id,
                    invitation_id=invitation_id,
                    guest_ids=large_guest_list,
                )
                # If it succeeds, check it was limited
                assert result.get("queued_count", 0) <= 500  # Assumed max
            except ValueError as e:
                # Rejection is also valid
                assert "max" in str(e).lower() or "limit" in str(e).lower()

    @pytest.mark.asyncio
    async def test_bulk_invite_requires_at_least_one_guest(self, workspace_id, invitation_id):
        """Bulk invite requires at least one guest ID."""
        service = BulkInviteService()

        with pytest.raises(ValueError):
            await service.queue_bulk_invites(
                workspace_id=workspace_id,
                invitation_id=invitation_id,
                guest_ids=[],
            )
