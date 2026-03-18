"""Tests for WebSocket authentication and notification event forwarding.

Covers NOTF-01: WebSocket endpoint authenticates via JWT and forwards
Redis pub/sub messages to connected clients.
"""

import asyncio
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock
from uuid import uuid4

from starlette.testclient import TestClient

from app.main import app


@pytest.fixture
def test_user_id():
    return uuid4()


@pytest.fixture
def test_workspace_id():
    return uuid4()


class TestWebSocketAuth:
    """Test WebSocket authentication via JWT query parameter."""

    def test_websocket_rejects_without_token(self):
        """WS connection without token should be closed with 1008 POLICY_VIOLATION."""
        client = TestClient(app)
        with pytest.raises(Exception) as exc_info:
            with client.websocket_connect("/api/v1/ws") as ws:
                # Should not reach here -- connection should be rejected
                ws.receive_json()
        # Starlette TestClient raises an exception when WS is closed by server
        # The connection should have been rejected
        assert exc_info.value is not None

    def test_websocket_rejects_invalid_token(self):
        """WS connection with invalid/garbage token should be closed with 1008."""
        client = TestClient(app)
        with pytest.raises(Exception) as exc_info:
            with client.websocket_connect("/api/v1/ws?token=garbage_invalid_token_xyz") as ws:
                ws.receive_json()
        assert exc_info.value is not None

    @patch("app.api.v1.websocket.get_redis_client")
    @patch("app.api.v1.websocket.decode_token")
    def test_websocket_auth_and_event_forward(
        self, mock_decode_token, mock_get_redis, test_user_id, test_workspace_id
    ):
        """Authenticated WS should receive events published to its workspace Redis channel.

        Flow: JWT auth -> subscribe to ws:workspace:{id} -> receive forwarded event.
        """
        # Configure decode_token to return valid auth
        mock_decode_token.return_value = {
            "sub": str(test_user_id),
            "workspace_id": str(test_workspace_id),
        }

        # Build a mock Redis client with pub/sub that yields one test message
        test_event = {
            "type": "notification:new",
            "workspace_id": str(test_workspace_id),
            "notification_id": str(uuid4()),
            "title": "New comment on your gallery",
            "body": "Client left a comment",
            "category": "gallery",
        }

        # Create mock pubsub that yields our test message then stops
        mock_pubsub = AsyncMock()

        async def mock_listen():
            yield {"type": "message", "data": json.dumps(test_event)}
            # After yielding the message, wait indefinitely (simulates long-lived subscription)
            await asyncio.sleep(100)

        mock_pubsub.listen = mock_listen
        mock_pubsub.subscribe = AsyncMock()
        mock_pubsub.unsubscribe = AsyncMock()
        mock_pubsub.close = AsyncMock()

        # Mock Redis client -- pubsub() is a sync method on redis.asyncio.Redis
        mock_redis = AsyncMock()
        mock_redis.pubsub = MagicMock(return_value=mock_pubsub)
        mock_get_redis.return_value = mock_redis

        client = TestClient(app)
        with client.websocket_connect("/api/v1/ws?token=valid_test_token") as ws:
            # First message should be the 'connected' welcome
            connected_msg = ws.receive_json()
            assert connected_msg["type"] == "connected"
            assert connected_msg["workspace_id"] == str(test_workspace_id)

            # Second message should be our forwarded event
            event_msg = ws.receive_json()
            assert event_msg["type"] == "notification:new"
            assert event_msg["workspace_id"] == str(test_workspace_id)
            assert event_msg["title"] == "New comment on your gallery"

        # Verify Redis subscription was on the correct channel
        expected_channel = f"ws:workspace:{test_workspace_id}"
        mock_pubsub.subscribe.assert_awaited_once_with(expected_channel)
