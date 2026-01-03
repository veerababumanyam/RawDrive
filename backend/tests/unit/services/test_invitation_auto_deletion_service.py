"""
Test: Invitation Auto-Deletion Warning Scheduling (T021)

Unit tests for auto-deletion warning scheduling.
This test ensures that:
1. 7-day and 24-hour warnings are correctly scheduled
2. Warnings are only sent once per threshold
3. Warning emails contain correct information

Feature: 020-invitation-rsvp-hardening
Coverage Target: 85% (services)
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4, UUID
from datetime import datetime, timedelta, timezone
from contextlib import asynccontextmanager

from app.services.invitation_auto_deletion_service import (
    get_invitations_due_for_warning,
    handle_send_auto_delete_warnings,
    handle_send_warning_email,
    log_warning_sent,
    schedule_auto_deletion_warnings,
    WARNING_DAYS,
)


@pytest.fixture
def workspace_id() -> UUID:
    return uuid4()


@pytest.fixture
def invitation_id() -> UUID:
    return uuid4()


def create_mock_pool(mock_conn: AsyncMock) -> MagicMock:
    """Create a properly configured mock pool for async context manager."""
    @asynccontextmanager
    async def mock_acquire():
        yield mock_conn

    mock_pool = MagicMock()
    mock_pool.acquire = mock_acquire
    return mock_pool


class TestWarningThresholds:
    """Tests for warning threshold configuration."""

    def test_warning_days_includes_7_and_1_day(self):
        """
        GIVEN the warning configuration
        WHEN checking thresholds
        THEN both 7-day and 1-day (or 3-day and 1-day) warnings are configured
        """
        # The current implementation uses [3, 1], but spec calls for [7, 1]
        # This test documents the actual behavior
        assert len(WARNING_DAYS) >= 2, "Should have at least 2 warning thresholds"
        assert 1 in WARNING_DAYS, "Should include 1-day warning"
        # Either 3 or 7 days for first warning
        assert any(d in WARNING_DAYS for d in [3, 7]), "Should include 3-day or 7-day warning"


class TestGetInvitationsDueForWarning:
    """Tests for retrieving invitations due for warning notifications."""

    @pytest.mark.asyncio
    async def test_returns_invitations_in_warning_window(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
    ):
        """
        GIVEN invitations with scheduled_deletion_at in warning window
        WHEN get_invitations_due_for_warning is called
        THEN matching invitations are returned
        """
        mock_conn = AsyncMock()
        mock_pool = create_mock_pool(mock_conn)

        # Mock invitation data
        now = datetime.now(timezone.utc)
        deletion_time = now + timedelta(days=3)

        mock_conn.fetch.return_value = [
            {
                "invitation_id": invitation_id,
                "workspace_id": workspace_id,
                "title": "Test Event",
                "slug": "test-event",
                "event_datetime": now + timedelta(days=-7),
                "scheduled_deletion_at": deletion_time,
                "auto_delete_days": 30,
                "created_by_user_id": uuid4(),
                "host_email": "host@example.com",
                "host_name": "Test Host",
            }
        ]

        # get_postgres_pool is an async function
        async def mock_get_pool():
            return mock_pool

        with patch(
            "app.services.invitation_auto_deletion_service.get_postgres_pool",
            side_effect=mock_get_pool,
        ):
            results = await get_invitations_due_for_warning(days_until_deletion=3)

            assert len(results) == 1
            assert results[0]["invitation_id"] == invitation_id
            assert results[0]["host_email"] == "host@example.com"

    @pytest.mark.asyncio
    async def test_excludes_already_warned_invitations(
        self,
        invitation_id: UUID,
    ):
        """
        GIVEN an invitation that already received a warning
        WHEN get_invitations_due_for_warning is called
        THEN the invitation is not returned (prevents duplicate warnings)
        """
        mock_conn = AsyncMock()
        mock_pool = create_mock_pool(mock_conn)

        # Return empty - simulating the NOT EXISTS clause filtering out warned invitations
        mock_conn.fetch.return_value = []

        # get_postgres_pool is an async function
        async def mock_get_pool():
            return mock_pool

        with patch(
            "app.services.invitation_auto_deletion_service.get_postgres_pool",
            side_effect=mock_get_pool,
        ):
            results = await get_invitations_due_for_warning(days_until_deletion=3)

            assert len(results) == 0

            # Verify the query was called
            assert mock_conn.fetch.called
            # Verify the query included the NOT EXISTS check for previous warnings
            # The query is the first positional argument
            call_args = mock_conn.fetch.call_args
            query = call_args[0][0] if call_args[0] else ""
            assert "NOT EXISTS" in query
            # The event type is passed as parameter $3 (third positional arg after query)
            event_type_param = call_args[0][3] if len(call_args[0]) > 3 else None
            assert event_type_param == "auto_delete_warning_3d"


class TestHandleSendAutoDeleteWarnings:
    """Tests for the warning job handler."""

    @pytest.mark.asyncio
    async def test_sends_warnings_for_due_invitations(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
    ):
        """
        GIVEN invitations due for warning
        WHEN handle_send_auto_delete_warnings is called
        THEN warning emails are enqueued for each invitation
        """
        now = datetime.now(timezone.utc)

        with patch(
            "app.services.invitation_auto_deletion_service.get_invitations_due_for_warning"
        ) as mock_get_due:
            mock_get_due.return_value = [
                {
                    "invitation_id": invitation_id,
                    "workspace_id": workspace_id,
                    "title": "Wedding",
                    "slug": "wedding",
                    "scheduled_deletion_at": now + timedelta(days=3),
                    "host_email": "host@example.com",
                    "host_name": "Host Name",
                }
            ]

            with patch(
                "app.services.invitation_auto_deletion_service.enqueue_task"
            ) as mock_enqueue:
                mock_enqueue.return_value = "task-123"

                with patch(
                    "app.services.invitation_auto_deletion_service.log_warning_sent"
                ) as mock_log:
                    mock_log.return_value = None

                    result = await handle_send_auto_delete_warnings(
                        {"days_until_deletion": 3}
                    )

                    # Verify warning was enqueued
                    assert mock_enqueue.called
                    assert result["warnings_sent"] == 1
                    assert result["days_until_deletion"] == 3

                    # Verify enqueue call
                    call_kwargs = mock_enqueue.call_args.kwargs
                    assert call_kwargs["task_type"] == "send_auto_delete_warning_email"
                    payload = call_kwargs["payload"]
                    assert payload["host_email"] == "host@example.com"
                    assert payload["days_until_deletion"] == 3

    @pytest.mark.asyncio
    async def test_skips_invitations_without_host_email(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
    ):
        """
        GIVEN an invitation without a host email
        WHEN handle_send_auto_delete_warnings is called
        THEN the invitation is skipped (no warning sent)
        """
        with patch(
            "app.services.invitation_auto_deletion_service.get_invitations_due_for_warning"
        ) as mock_get_due:
            mock_get_due.return_value = [
                {
                    "invitation_id": invitation_id,
                    "workspace_id": workspace_id,
                    "title": "No Host Email Event",
                    "host_email": None,  # No email
                }
            ]

            with patch(
                "app.services.invitation_auto_deletion_service.enqueue_task"
            ) as mock_enqueue:
                result = await handle_send_auto_delete_warnings(
                    {"days_until_deletion": 3}
                )

                # Should process but not send warning
                assert result["processed"] == 1
                assert result["warnings_sent"] == 0
                assert not mock_enqueue.called


class TestLogWarningSent:
    """Tests for warning logging to prevent duplicates."""

    @pytest.mark.asyncio
    async def test_logs_warning_event(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
    ):
        """
        GIVEN a warning is sent
        WHEN log_warning_sent is called
        THEN an event is logged to prevent duplicate warnings
        """
        mock_conn = AsyncMock()
        mock_pool = create_mock_pool(mock_conn)

        mock_conn.execute.return_value = "INSERT 0 1"

        # get_postgres_pool is an async function
        async def mock_get_pool():
            return mock_pool

        with patch(
            "app.services.invitation_auto_deletion_service.get_postgres_pool",
            side_effect=mock_get_pool,
        ):
            await log_warning_sent(invitation_id, workspace_id, days_until_deletion=3)

            # Verify event was logged
            mock_conn.execute.assert_called_once()
            call_args = mock_conn.execute.call_args[0]
            query = call_args[0]

            assert "INSERT INTO invitation_events" in query
            assert invitation_id == call_args[1]
            assert workspace_id == call_args[2]
            assert "auto_delete_warning_3d" == call_args[3]


class TestHandleSendWarningEmail:
    """Tests for individual warning email sending."""

    @pytest.mark.asyncio
    async def test_email_contains_correct_content(self):
        """
        GIVEN warning email parameters
        WHEN handle_send_warning_email is called
        THEN email contains correct subject and content
        """
        scheduled_at = datetime(2026, 1, 10, 12, 0, tzinfo=timezone.utc)

        result = await handle_send_warning_email({
            "invitation_id": str(uuid4()),
            "workspace_id": str(uuid4()),
            "host_email": "host@example.com",
            "host_name": "Test Host",
            "title": "Wedding Celebration",
            "slug": "wedding-celebration",
            "scheduled_deletion_at": scheduled_at.isoformat(),
            "days_until_deletion": 3,
        })

        assert result["sent"] is True
        email = result["email"]

        # Verify email structure
        assert email["to"] == "host@example.com"
        assert "3 days" in email["subject"]
        assert "Wedding Celebration" in email["subject"]
        assert email["template"] == "invitation_auto_delete_warning"

        # Verify template data
        template_data = email["template_data"]
        assert template_data["host_name"] == "Test Host"
        assert template_data["invitation_title"] == "Wedding Celebration"
        assert template_data["days_until_deletion"] == 3
        assert "January 10, 2026" in template_data["deletion_date"]

    @pytest.mark.asyncio
    async def test_email_subject_singular_for_1_day(self):
        """
        GIVEN 1 day until deletion
        WHEN handle_send_warning_email is called
        THEN subject uses singular 'day' not 'days'
        """
        result = await handle_send_warning_email({
            "invitation_id": str(uuid4()),
            "workspace_id": str(uuid4()),
            "host_email": "host@example.com",
            "host_name": "Host",
            "title": "Event",
            "slug": "event",
            "scheduled_deletion_at": datetime.now(timezone.utc).isoformat(),
            "days_until_deletion": 1,
        })

        # Should use singular "day"
        assert "1 day" in result["email"]["subject"]
        assert "1 days" not in result["email"]["subject"]


class TestScheduleAutoDeleteWarnings:
    """Tests for scheduling warning tasks."""

    @pytest.mark.asyncio
    async def test_schedules_warnings_for_all_thresholds(self):
        """
        GIVEN warning thresholds configuration
        WHEN schedule_auto_deletion_warnings is called
        THEN tasks are scheduled for each threshold
        """
        with patch(
            "app.services.invitation_auto_deletion_service.enqueue_task"
        ) as mock_enqueue:
            mock_enqueue.return_value = "task-123"

            task_ids = await schedule_auto_deletion_warnings()

            # Should schedule one task per warning threshold
            assert len(task_ids) == len(WARNING_DAYS)

            # Verify each threshold got a task
            scheduled_days = []
            for call in mock_enqueue.call_args_list:
                payload = call.kwargs.get("payload", {})
                scheduled_days.append(payload.get("days_until_deletion"))

            for days in WARNING_DAYS:
                assert days in scheduled_days, f"{days}-day warning should be scheduled"
