"""Tests for gallery expiration reminder worker.

Verifies the ExpirationReminderWorker correctly identifies galleries
at 7-day, 1-day, and 0-day expiration milestones, enqueues the right
email type, and deduplicates via Redis keys.
"""

import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from src.workers.expiration_reminder_worker import (
    ExpirationReminderWorker,
    MILESTONE_7D,
    MILESTONE_1D,
    MILESTONE_EXPIRED,
)


@pytest.fixture
def worker():
    """Create an ExpirationReminderWorker with mocked dependencies."""
    w = ExpirationReminderWorker()
    w._db_fetch = AsyncMock()
    w._redis_get = AsyncMock(return_value=None)  # No prior notification by default
    w._redis_setex = AsyncMock()
    w._enqueue_email = AsyncMock()
    return w


def _make_gallery(days_until: int, gallery_id=None, owner_email="photographer@test.com"):
    """Helper to create a gallery row expiring in `days_until` days."""
    gid = gallery_id or str(uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(days=days_until, hours=1)
    return {
        "gallery_id": gid,
        "workspace_id": str(uuid4()),
        "title": f"Gallery {gid[:8]}",
        "expires_at": expires_at,
        "owner_email": owner_email,
        "photo_count": 42,
    }


class TestExpirationReminderWorker:
    """Tests for ExpirationReminderWorker.scan_expiring_galleries."""

    @pytest.mark.asyncio
    async def test_enqueues_7d_reminder(self, worker):
        """Worker finds gallery expiring in 7 days and enqueues reminder."""
        gallery = _make_gallery(days_until=7)
        worker._db_fetch.return_value = [gallery]

        await worker.scan_expiring_galleries()

        worker._enqueue_email.assert_called_once()
        call_args = worker._enqueue_email.call_args
        assert call_args[1]["template_code"] == "gallery_expiring_7d"
        assert call_args[1]["recipient_email"] == "photographer@test.com"

    @pytest.mark.asyncio
    async def test_enqueues_1d_reminder(self, worker):
        """Worker finds gallery expiring in 1 day and enqueues urgent reminder."""
        gallery = _make_gallery(days_until=1)
        worker._db_fetch.return_value = [gallery]

        await worker.scan_expiring_galleries()

        worker._enqueue_email.assert_called_once()
        call_args = worker._enqueue_email.call_args
        assert call_args[1]["template_code"] == "gallery_expiring_1d"

    @pytest.mark.asyncio
    async def test_enqueues_expired_notice(self, worker):
        """Worker finds gallery expired today and enqueues expiration notice."""
        gallery = _make_gallery(days_until=0)
        # Adjust so it's actually in the past
        gallery["expires_at"] = datetime.now(timezone.utc) - timedelta(hours=2)
        worker._db_fetch.return_value = [gallery]

        await worker.scan_expiring_galleries()

        worker._enqueue_email.assert_called_once()
        call_args = worker._enqueue_email.call_args
        assert call_args[1]["template_code"] == "gallery_expired"

    @pytest.mark.asyncio
    async def test_deduplication_prevents_resend(self, worker):
        """Worker does not re-send if reminder already sent (Redis key exists)."""
        gallery = _make_gallery(days_until=7)
        worker._db_fetch.return_value = [gallery]
        # Simulate that 7d reminder was already sent
        worker._redis_get.return_value = "1"

        await worker.scan_expiring_galleries()

        worker._enqueue_email.assert_not_called()

    @pytest.mark.asyncio
    async def test_only_processes_non_null_expires_at(self, worker):
        """Worker only processes galleries with non-null expires_at."""
        # This is enforced by the SQL query (WHERE expires_at IS NOT NULL)
        # But verify that if somehow a None row arrives, it's skipped
        gallery_with = _make_gallery(days_until=7)
        gallery_without = {
            "gallery_id": str(uuid4()),
            "workspace_id": str(uuid4()),
            "title": "No Expiry",
            "expires_at": None,
            "owner_email": "test@test.com",
            "photo_count": 10,
        }
        worker._db_fetch.return_value = [gallery_with, gallery_without]

        await worker.scan_expiring_galleries()

        # Only the gallery with expires_at should trigger an email
        assert worker._enqueue_email.call_count == 1

    @pytest.mark.asyncio
    async def test_email_payload_contains_required_fields(self, worker):
        """Email payload includes gallery_name, expires_at, photo_count."""
        gallery = _make_gallery(days_until=7)
        worker._db_fetch.return_value = [gallery]

        await worker.scan_expiring_galleries()

        call_args = worker._enqueue_email.call_args
        payload = call_args[1]["payload"]
        assert "gallery_name" in payload
        assert "expires_at" in payload
        assert "photo_count" in payload
        assert payload["photo_count"] == 42

    @pytest.mark.asyncio
    async def test_sets_redis_dedup_key_after_send(self, worker):
        """Worker sets Redis dedup key after successfully enqueuing email."""
        gallery = _make_gallery(days_until=7)
        worker._db_fetch.return_value = [gallery]

        await worker.scan_expiring_galleries()

        worker._redis_setex.assert_called_once()
        call_args = worker._redis_setex.call_args
        key = call_args[0][0]
        assert f"expiration:notified:{gallery['gallery_id']}:{MILESTONE_7D}" == key

    @pytest.mark.asyncio
    async def test_no_galleries_no_emails(self, worker):
        """Worker does nothing when no expiring galleries found."""
        worker._db_fetch.return_value = []

        await worker.scan_expiring_galleries()

        worker._enqueue_email.assert_not_called()

    @pytest.mark.asyncio
    async def test_multiple_milestones_multiple_galleries(self, worker):
        """Worker handles galleries at different milestones in one scan."""
        g7 = _make_gallery(days_until=7, gallery_id=str(uuid4()))
        g1 = _make_gallery(days_until=1, gallery_id=str(uuid4()))
        worker._db_fetch.return_value = [g7, g1]

        await worker.scan_expiring_galleries()

        assert worker._enqueue_email.call_count == 2
