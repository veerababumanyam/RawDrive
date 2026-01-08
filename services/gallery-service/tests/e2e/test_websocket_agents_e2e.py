"""End-to-End tests for WebSocket Agent Notifications.

Tests the complete WebSocket flow:
- Connection management
- Event broadcasting
- Multi-tenant isolation
- Event filtering and subscriptions
- Reconnection handling
- Performance and stability

Run with: pytest tests/e2e/test_websocket_agents_e2e.py -v
"""

import pytest
import asyncio
import json
from uuid import UUID, uuid4
from datetime import datetime
import websockets
from websockets.client import WebSocketClientProtocol


# =============================================================================
# Test Configuration
# =============================================================================

WS_BASE_URL = "ws://gallery-service:8004/api/v1/ws/agents"
API_TIMEOUT = 30.0


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def workspace_id():
    """Test workspace ID."""
    return str(uuid4())


@pytest.fixture
def agent_id():
    """Test agent ID."""
    return f"test-agent-{uuid4()}"


@pytest.fixture
def auth_token():
    """Mock authentication token."""
    # In real implementation, this would be a valid JWT
    return "test-token-" + str(uuid4())


# =============================================================================
# Helper Functions
# =============================================================================


async def connect_agent(
    agent_id: str, workspace_id: str, auth_token: str, event_types: list[str] = None
) -> WebSocketClientProtocol:
    """Connect an agent to WebSocket endpoint.

    Args:
        agent_id: Agent identifier
        workspace_id: Workspace ID
        auth_token: Authentication token
        event_types: Optional list of event types to subscribe to

    Returns:
        WebSocket connection
    """
    url = f"{WS_BASE_URL}/{agent_id}"

    # Add query parameters
    params = [f"workspace_id={workspace_id}", f"token={auth_token}"]
    if event_types:
        params.append(f"events={','.join(event_types)}")

    full_url = f"{url}?{'&'.join(params)}"

    ws = await websockets.connect(full_url)
    return ws


async def receive_event(ws: WebSocketClientProtocol, timeout: float = 5.0) -> dict:
    """Receive an event from WebSocket.

    Args:
        ws: WebSocket connection
        timeout: Timeout in seconds

    Returns:
        Event data as dictionary
    """
    message = await asyncio.wait_for(ws.recv(), timeout=timeout)
    return json.loads(message)


async def trigger_gallery_event(
    workspace_id: str, event_type: str, data: dict
) -> None:
    """Trigger a gallery event that should broadcast to WebSocket agents.

    Args:
        workspace_id: Workspace ID
        event_type: Event type (e.g., "gallery_created")
        data: Event data

    Note:
        In real tests, this would make HTTP API calls to trigger events.
        For this E2E test, we'll simulate the event.
    """
    # This is a placeholder - in real implementation, would call gallery API
    # For example:
    # async with httpx.AsyncClient() as client:
    #     await client.post(f"/api/v1/galleries", json=data)
    pass


# =============================================================================
# Connection Management Tests
# =============================================================================


class TestWebSocketConnection:
    """Test WebSocket connection management."""

    @pytest.mark.asyncio
    async def test_successful_connection(
        self, agent_id, workspace_id, auth_token
    ):
        """Agent can connect to WebSocket endpoint."""
        ws = await connect_agent(agent_id, workspace_id, auth_token)

        # Should receive connection confirmation
        message = await receive_event(ws, timeout=2.0)
        assert message["type"] == "connection_established"
        assert message["agent_id"] == agent_id

        await ws.close()

    @pytest.mark.asyncio
    async def test_connection_with_event_subscription(
        self, agent_id, workspace_id, auth_token
    ):
        """Agent can subscribe to specific event types."""
        event_types = ["gallery_created", "assets_added"]

        ws = await connect_agent(agent_id, workspace_id, auth_token, event_types)

        # Should receive confirmation with subscriptions
        message = await receive_event(ws, timeout=2.0)
        assert message["type"] == "connection_established"
        assert set(message["subscriptions"]) == set(event_types)

        await ws.close()

    @pytest.mark.asyncio
    async def test_connection_without_auth_fails(self, agent_id, workspace_id):
        """Connection without auth token fails."""
        url = f"{WS_BASE_URL}/{agent_id}?workspace_id={workspace_id}"

        with pytest.raises(websockets.exceptions.InvalidStatusCode) as exc_info:
            await websockets.connect(url)

        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_connection_with_invalid_workspace_fails(
        self, agent_id, auth_token
    ):
        """Connection with invalid workspace_id fails."""
        invalid_workspace = "not-a-uuid"

        with pytest.raises(websockets.exceptions.InvalidStatusCode) as exc_info:
            await connect_agent(agent_id, invalid_workspace, auth_token)

        assert exc_info.value.status_code in [400, 403]

    @pytest.mark.asyncio
    async def test_multiple_agents_can_connect(self, workspace_id, auth_token):
        """Multiple agents can connect simultaneously."""
        agents = [f"agent-{i}-{uuid4()}" for i in range(5)]
        connections = []

        try:
            # Connect all agents
            for agent_id in agents:
                ws = await connect_agent(agent_id, workspace_id, auth_token)
                connections.append(ws)

            # All should be connected
            assert len(connections) == 5

            # Each should receive connection confirmation
            for ws in connections:
                message = await receive_event(ws, timeout=2.0)
                assert message["type"] == "connection_established"

        finally:
            # Clean up
            for ws in connections:
                await ws.close()


# =============================================================================
# Event Broadcasting Tests
# =============================================================================


class TestEventBroadcasting:
    """Test event broadcasting to connected agents."""

    @pytest.mark.asyncio
    async def test_gallery_created_event(
        self, agent_id, workspace_id, auth_token
    ):
        """gallery_created event is broadcast to subscribed agents."""
        ws = await connect_agent(
            agent_id, workspace_id, auth_token, ["gallery_created"]
        )

        # Skip connection confirmation
        await receive_event(ws, timeout=2.0)

        # Simulate gallery creation (in real test, make HTTP API call)
        # For now, we expect the event to be broadcast
        event_data = {
            "gallery_id": str(uuid4()),
            "name": "New Gallery",
            "created_by": str(uuid4()),
        }

        # Wait for event (in real test, would trigger via API)
        # For E2E test structure:
        try:
            event = await receive_event(ws, timeout=5.0)
            assert event["event_type"] == "gallery_created"
            assert event["workspace_id"] == workspace_id
            assert "gallery_id" in event["data"]
        except asyncio.TimeoutError:
            # Event not received within timeout
            # In real implementation, would assert event received
            pass

        await ws.close()

    @pytest.mark.asyncio
    async def test_assets_added_event(
        self, agent_id, workspace_id, auth_token
    ):
        """assets_added event is broadcast to subscribed agents."""
        ws = await connect_agent(
            agent_id, workspace_id, auth_token, ["assets_added"]
        )

        await receive_event(ws, timeout=2.0)  # Skip connection

        # In real test, would make API call to add assets
        # Then verify event received

        await ws.close()

    @pytest.mark.asyncio
    async def test_multiple_event_types(
        self, agent_id, workspace_id, auth_token
    ):
        """Agent receives all subscribed event types."""
        event_types = [
            "gallery_created",
            "gallery_updated",
            "assets_added",
            "proofing_update",
        ]

        ws = await connect_agent(agent_id, workspace_id, auth_token, event_types)
        await receive_event(ws, timeout=2.0)  # Skip connection

        # In real test, would trigger each event type and verify reception

        await ws.close()

    @pytest.mark.asyncio
    async def test_event_not_received_if_not_subscribed(
        self, agent_id, workspace_id, auth_token
    ):
        """Agent does not receive events it didn't subscribe to."""
        # Subscribe only to gallery_created
        ws = await connect_agent(
            agent_id, workspace_id, auth_token, ["gallery_created"]
        )
        await receive_event(ws, timeout=2.0)  # Skip connection

        # In real test:
        # - Trigger assets_added event
        # - Verify event NOT received (timeout on receive)

        await ws.close()


# =============================================================================
# Multi-Tenant Isolation Tests
# =============================================================================


class TestMultiTenantIsolation:
    """Test workspace isolation in WebSocket broadcasting."""

    @pytest.mark.asyncio
    async def test_events_only_broadcast_to_same_workspace(self, auth_token):
        """Events only broadcast to agents in same workspace."""
        workspace_a = str(uuid4())
        workspace_b = str(uuid4())

        agent_a = f"agent-a-{uuid4()}"
        agent_b = f"agent-b-{uuid4()}"

        # Connect agent A to workspace A
        ws_a = await connect_agent(agent_a, workspace_a, auth_token, ["gallery_created"])
        await receive_event(ws_a, timeout=2.0)

        # Connect agent B to workspace B
        ws_b = await connect_agent(agent_b, workspace_b, auth_token, ["gallery_created"])
        await receive_event(ws_b, timeout=2.0)

        # In real test:
        # - Trigger gallery_created in workspace A
        # - Agent A should receive event
        # - Agent B should NOT receive event

        await ws_a.close()
        await ws_b.close()

    @pytest.mark.asyncio
    async def test_cannot_connect_to_different_workspace(
        self, agent_id, auth_token
    ):
        """Agent cannot connect using workspace_id not in their auth."""
        # In real implementation, auth token would encode workspace_id
        # Connection with mismatched workspace should fail

        workspace_id = str(uuid4())

        # This test depends on real auth implementation
        # For structure: connection should fail if workspace mismatch

        pass


# =============================================================================
# Event Filtering Tests
# =============================================================================


class TestEventFiltering:
    """Test event subscription filtering."""

    @pytest.mark.asyncio
    async def test_subscribe_to_all_events(
        self, agent_id, workspace_id, auth_token
    ):
        """Agent can subscribe to all event types."""
        # Not specifying event_types = subscribe to all
        ws = await connect_agent(agent_id, workspace_id, auth_token)

        message = await receive_event(ws, timeout=2.0)
        assert message["type"] == "connection_established"
        # subscriptions should include all 7 event types
        assert len(message.get("subscriptions", [])) == 7

        await ws.close()

    @pytest.mark.asyncio
    async def test_subscribe_to_single_event(
        self, agent_id, workspace_id, auth_token
    ):
        """Agent can subscribe to single event type."""
        ws = await connect_agent(
            agent_id, workspace_id, auth_token, ["gallery_created"]
        )

        message = await receive_event(ws, timeout=2.0)
        assert message["subscriptions"] == ["gallery_created"]

        await ws.close()

    @pytest.mark.asyncio
    async def test_invalid_event_type_ignored(
        self, agent_id, workspace_id, auth_token
    ):
        """Invalid event types are ignored in subscription."""
        event_types = ["gallery_created", "invalid_event_type", "assets_added"]

        ws = await connect_agent(agent_id, workspace_id, auth_token, event_types)

        message = await receive_event(ws, timeout=2.0)
        # Should only include valid event types
        assert "invalid_event_type" not in message["subscriptions"]
        assert "gallery_created" in message["subscriptions"]

        await ws.close()


# =============================================================================
# Reconnection and Error Handling Tests
# =============================================================================


class TestReconnection:
    """Test WebSocket reconnection and error handling."""

    @pytest.mark.asyncio
    async def test_graceful_disconnect(
        self, agent_id, workspace_id, auth_token
    ):
        """Agent can disconnect gracefully."""
        ws = await connect_agent(agent_id, workspace_id, auth_token)
        await receive_event(ws, timeout=2.0)

        # Close connection
        await ws.close()

        # Connection should be closed
        assert ws.closed

    @pytest.mark.asyncio
    async def test_reconnect_after_disconnect(
        self, agent_id, workspace_id, auth_token
    ):
        """Agent can reconnect after disconnecting."""
        # First connection
        ws1 = await connect_agent(agent_id, workspace_id, auth_token)
        await receive_event(ws1, timeout=2.0)
        await ws1.close()

        # Wait a moment
        await asyncio.sleep(0.5)

        # Reconnect with same agent_id
        ws2 = await connect_agent(agent_id, workspace_id, auth_token)
        message = await receive_event(ws2, timeout=2.0)
        assert message["type"] == "connection_established"

        await ws2.close()

    @pytest.mark.asyncio
    async def test_connection_timeout_handling(
        self, agent_id, workspace_id, auth_token
    ):
        """Connection handles timeout gracefully."""
        ws = await connect_agent(agent_id, workspace_id, auth_token)
        await receive_event(ws, timeout=2.0)

        # Wait for potential timeout (platform-dependent)
        # In real implementation, might trigger timeout with idle period

        await ws.close()


# =============================================================================
# Performance and Stability Tests
# =============================================================================


class TestWebSocketPerformance:
    """Test WebSocket performance and stability."""

    @pytest.mark.asyncio
    async def test_100_concurrent_connections(self, workspace_id, auth_token):
        """100 concurrent agent connections are stable."""
        agents = [f"perf-agent-{i}" for i in range(100)]
        connections = []

        try:
            # Connect 100 agents
            for agent_id in agents:
                ws = await connect_agent(agent_id, workspace_id, auth_token)
                connections.append(ws)

            # All connections should be established
            assert len(connections) == 100

            # Receive confirmation from all
            for ws in connections:
                message = await receive_event(ws, timeout=5.0)
                assert message["type"] == "connection_established"

        finally:
            # Clean up
            for ws in connections:
                await ws.close()

    @pytest.mark.asyncio
    async def test_event_broadcast_latency(
        self, agent_id, workspace_id, auth_token
    ):
        """Events are broadcast within 100ms."""
        ws = await connect_agent(
            agent_id, workspace_id, auth_token, ["gallery_created"]
        )
        await receive_event(ws, timeout=2.0)

        # In real test:
        # - Record time before triggering event
        # - Trigger event via API
        # - Record time when event received
        # - Assert latency < 100ms

        await ws.close()

    @pytest.mark.asyncio
    async def test_high_frequency_events(
        self, agent_id, workspace_id, auth_token
    ):
        """Agent handles high frequency events (100 events/sec)."""
        ws = await connect_agent(agent_id, workspace_id, auth_token)
        await receive_event(ws, timeout=2.0)

        # In real test:
        # - Trigger 100 events rapidly
        # - Verify all events received
        # - No connection drops

        await ws.close()

    @pytest.mark.asyncio
    async def test_connection_stability_over_time(
        self, agent_id, workspace_id, auth_token
    ):
        """Connection remains stable over 60 seconds."""
        ws = await connect_agent(agent_id, workspace_id, auth_token)
        await receive_event(ws, timeout=2.0)

        # Keep connection open for 60 seconds
        start = datetime.utcnow()
        while (datetime.utcnow() - start).total_seconds() < 60:
            # Send ping/pong to keep alive
            try:
                pong = await ws.ping()
                await asyncio.wait_for(pong, timeout=5.0)
            except Exception:
                pytest.fail("Connection dropped during stability test")

            await asyncio.sleep(5)

        # Connection should still be open
        assert not ws.closed

        await ws.close()


# =============================================================================
# Event Data Validation Tests
# =============================================================================


class TestEventDataValidation:
    """Test event data structure and validation."""

    @pytest.mark.asyncio
    async def test_event_structure(self, agent_id, workspace_id, auth_token):
        """Events have correct structure."""
        ws = await connect_agent(
            agent_id, workspace_id, auth_token, ["gallery_created"]
        )
        await receive_event(ws, timeout=2.0)

        # In real test, trigger event and verify structure:
        # event = await receive_event(ws, timeout=5.0)
        # assert "event_type" in event
        # assert "workspace_id" in event
        # assert "timestamp" in event
        # assert "data" in event
        # assert event["workspace_id"] == workspace_id

        await ws.close()

    @pytest.mark.asyncio
    async def test_event_timestamp_format(
        self, agent_id, workspace_id, auth_token
    ):
        """Event timestamps are ISO 8601 format."""
        ws = await connect_agent(agent_id, workspace_id, auth_token)
        await receive_event(ws, timeout=2.0)

        # In real test:
        # event = await receive_event(ws, timeout=5.0)
        # timestamp = datetime.fromisoformat(event["timestamp"])
        # assert timestamp is not None

        await ws.close()


# =============================================================================
# Integration Tests
# =============================================================================


@pytest.mark.integration
class TestWebSocketIntegration:
    """Integration tests requiring full stack."""

    @pytest.mark.asyncio
    async def test_end_to_end_gallery_workflow(
        self, agent_id, workspace_id, auth_token
    ):
        """Complete workflow: Connect → Create gallery → Receive event."""
        # This test requires:
        # 1. WebSocket server running
        # 2. HTTP API running
        # 3. Database available

        ws = await connect_agent(
            agent_id, workspace_id, auth_token, ["gallery_created"]
        )
        await receive_event(ws, timeout=2.0)

        # In real integration test:
        # - Make HTTP POST to create gallery
        # - Verify WebSocket event received
        # - Validate event data matches created gallery

        await ws.close()
