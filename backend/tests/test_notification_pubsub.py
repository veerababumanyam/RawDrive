"""Tests for notification event pub/sub pipeline.

Covers NOTF-02: notification_event_publisher publishes to notification:events channel,
and websocket_service.emit_event publishes to ws:workspace:{id} channels.
"""

import json
import pytest
from unittest.mock import AsyncMock, patch, call
from uuid import uuid4


class TestNotificationEventPublishedToWsChannel:
    """Test that publish_notification_event publishes correctly to Redis."""

    @pytest.mark.asyncio
    @patch("app.services.notification_event_publisher.get_redis_client")
    async def test_notification_event_published_to_ws_channel(self, mock_get_redis):
        """publish_notification_event should publish to 'notification:events' channel
        with correct payload structure including event_type, workspace_id,
        recipient_email, payload, priority, and published_at.
        """
        mock_redis = AsyncMock()
        mock_get_redis.return_value = mock_redis

        workspace_id = uuid4()
        recipient_email = "client@example.com"
        payload = {
            "gallery_id": str(uuid4()),
            "gallery_name": "Wedding Photos",
        }

        from app.services.notification_event_publisher import publish_notification_event

        await publish_notification_event(
            event_type="gallery.shared",
            workspace_id=workspace_id,
            recipient_email=recipient_email,
            payload=payload,
            priority="high",
        )

        # Verify Redis publish was called
        mock_redis.publish.assert_awaited_once()
        call_args = mock_redis.publish.call_args

        # Channel should be "notification:events"
        assert call_args[0][0] == "notification:events"

        # Parse the published JSON payload
        published_data = json.loads(call_args[0][1])
        assert published_data["event_type"] == "gallery.shared"
        assert published_data["workspace_id"] == str(workspace_id)
        assert published_data["recipient_email"] == recipient_email
        assert published_data["payload"] == payload
        assert published_data["priority"] == "high"
        assert "published_at" in published_data


class TestEmitEventPublishesToWorkspaceChannel:
    """Test that emit_event publishes to the correct ws:workspace:{id} channel."""

    @pytest.mark.asyncio
    @patch("app.services.websocket_service.get_redis_client")
    async def test_emit_event_publishes_to_workspace_channel(self, mock_get_redis):
        """emit_event should publish to ws:workspace:{workspace_id} channel
        with the event type and data merged into the payload.
        """
        mock_redis = AsyncMock()
        mock_get_redis.return_value = mock_redis

        workspace_id = uuid4()
        event_data = {
            "notification_id": str(uuid4()),
            "title": "Gallery shared",
            "body": "Your gallery has been shared with a client",
            "category": "gallery",
        }

        from app.services.websocket_service import emit_event

        await emit_event(
            workspace_id=workspace_id,
            event_type="notification:new",
            data=event_data,
        )

        # Verify Redis publish was called
        mock_redis.publish.assert_awaited_once()
        call_args = mock_redis.publish.call_args

        # Channel should be ws:workspace:{workspace_id}
        expected_channel = f"ws:workspace:{workspace_id}"
        assert call_args[0][0] == expected_channel

        # Parse the published JSON payload
        published_data = json.loads(call_args[0][1])
        assert published_data["type"] == "notification:new"
        assert published_data["workspace_id"] == str(workspace_id)
        assert published_data["notification_id"] == event_data["notification_id"]
        assert published_data["title"] == "Gallery shared"
