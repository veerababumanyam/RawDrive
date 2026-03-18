"""Tests for churn intervention notification wiring (NOTF-03).

Verifies that the churn intervention worker publishes notification events
to Redis instead of just logging 'Would send', and emits WebSocket events
for real-time in-app notification delivery.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest


@pytest.fixture
def action_data():
    """Build a test action dict matching the format used in the worker."""
    return {
        "action_id": uuid4(),
        "workspace_id": uuid4(),
        "campaign_id": uuid4(),
        "client_id": uuid4(),
        "client_email": "client@example.com",
        "client_name": "Jane Doe",
        "action_type": "email_sent",
        "personalization_data": {
            "client_name": "Jane Doe",
            "first_name": "Jane",
            "offer_code": "SAVE20",
            "offer_value": "20%",
            "offer_type": "discount",
            "offer_expires_at": "2026-04-01",
        },
        "content_snapshot": {
            "template": "re_engagement_default",
            "subject": "We miss you, Jane Doe!",
            "extra_data": {},
        },
    }


@pytest.fixture
def worker():
    """Create a ChurnInterventionWorker instance."""
    from app.workers.churn_intervention_worker import ChurnInterventionWorker

    return ChurnInterventionWorker()


@pytest.mark.asyncio
async def test_churn_email_intervention_publishes_event(worker, action_data):
    """Verify _send_email_intervention calls publish_notification_event
    with correct event_type, workspace_id, client_email, and payload."""

    with patch(
        "app.workers.churn_intervention_worker.publish_notification_event",
        new_callable=AsyncMock,
    ) as mock_publish:
        result = await worker._send_email_intervention(
            action=action_data,
            personalization=action_data["personalization_data"],
            content=action_data["content_snapshot"],
        )

        assert result is True
        mock_publish.assert_called_once()

        call_kwargs = mock_publish.call_args
        # Support both positional and keyword calling conventions
        if call_kwargs.kwargs:
            assert call_kwargs.kwargs["event_type"] == "churn.intervention.email"
            assert call_kwargs.kwargs["workspace_id"] == action_data["workspace_id"]
            assert call_kwargs.kwargs["recipient_email"] == "client@example.com"
            payload = call_kwargs.kwargs["payload"]
        else:
            # positional: event_type, workspace_id, recipient_email, payload
            assert call_kwargs.args[0] == "churn.intervention.email"
            assert call_kwargs.args[1] == action_data["workspace_id"]
            assert call_kwargs.args[2] == "client@example.com"
            payload = call_kwargs.args[3]

        assert payload["client_name"] == "Jane Doe"
        assert payload["offer_code"] == "SAVE20"


@pytest.mark.asyncio
async def test_churn_in_app_notification_emits_websocket(worker, action_data):
    """Verify _create_in_app_notification calls emit_event for real-time
    WebSocket delivery after DB insert."""

    mock_conn = AsyncMock()

    # Build a proper async context manager for pool.acquire()
    class FakeAcquire:
        async def __aenter__(self):
            return mock_conn

        async def __aexit__(self, *args):
            return False

    mock_pool = MagicMock()
    mock_pool.acquire.return_value = FakeAcquire()

    with patch(
        "app.workers.churn_intervention_worker.get_postgres_pool",
        new_callable=AsyncMock,
        return_value=mock_pool,
    ), patch(
        "app.workers.churn_intervention_worker.emit_event",
        new_callable=AsyncMock,
    ) as mock_emit:
        result = await worker._create_in_app_notification(
            action=action_data,
            personalization=action_data["personalization_data"],
            content={
                "title": "Special offer for you!",
                "body": "Check out what's new!",
            },
        )

        assert result is True
        mock_emit.assert_called_once()

        call_kwargs = mock_emit.call_args
        if call_kwargs.kwargs:
            assert call_kwargs.kwargs["workspace_id"] == action_data["workspace_id"]
            assert call_kwargs.kwargs["event_type"] == "churn:intervention_created"
            data = call_kwargs.kwargs["data"]
        else:
            assert call_kwargs.args[0] == action_data["workspace_id"]
            assert call_kwargs.args[1] == "churn:intervention_created"
            data = call_kwargs.args[2]

        assert data["client_id"] == str(action_data["client_id"])
        assert data["title"] == "Special offer for you!"
