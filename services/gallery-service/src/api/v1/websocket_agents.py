"""WebSocket Agent Notifications.

Provides real-time event notifications for AI agents via WebSocket connections.
Agents can subscribe to specific event types and receive updates as they happen.

Architecture: PostgreSQL (metadata) + Milvus (vectors via ai-service)
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, HTTPException
from typing import Dict, Set, Optional
import json
import asyncio
from datetime import datetime
from uuid import UUID

from src.log_config import get_logger
from src.observability.metrics import get_metrics
from src.middleware.auth import verify_jwt_token

logger = get_logger(__name__)
metrics = get_metrics()

router = APIRouter()


# =============================================================================
# WebSocket Connection Manager
# =============================================================================


class AgentConnectionManager:
    """Manages WebSocket connections for AI agents.

    Handles:
    - Multiple concurrent agent connections
    - Event broadcasting to specific agents or all agents
    - Connection lifecycle (connect, disconnect, heartbeat)
    - Event filtering by type and workspace
    """

    def __init__(self):
        # agent_id -> WebSocket
        self.active_connections: Dict[str, WebSocket] = {}
        # agent_id -> workspace_id (for multi-tenant isolation)
        self.agent_workspaces: Dict[str, str] = {}
        # agent_id -> Set of subscribed event types
        self.agent_subscriptions: Dict[str, Set[str]] = {}

    async def connect(
        self,
        agent_id: str,
        workspace_id: str,
        websocket: WebSocket,
        event_types: Optional[Set[str]] = None
    ):
        """Accept new agent WebSocket connection."""
        await websocket.accept()
        self.active_connections[agent_id] = websocket
        self.agent_workspaces[agent_id] = workspace_id

        # Subscribe to event types (default: all)
        if event_types:
            self.agent_subscriptions[agent_id] = event_types
        else:
            self.agent_subscriptions[agent_id] = {
                "gallery_created",
                "gallery_updated",
                "gallery_deleted",
                "assets_added",
                "assets_removed",
                "proofing_update",
                "magic_link_created",
            }

        logger.info(
            f"Agent connected: {agent_id} (workspace: {workspace_id}, "
            f"subscriptions: {len(self.agent_subscriptions[agent_id])})"
        )

        # Track metric
        metrics.gauge_set(
            "gallery_agent_websocket_connections",
            len(self.active_connections),
            {"agent_type": "ai"}
        )

    def disconnect(self, agent_id: str):
        """Remove agent connection."""
        if agent_id in self.active_connections:
            del self.active_connections[agent_id]
        if agent_id in self.agent_workspaces:
            del self.agent_workspaces[agent_id]
        if agent_id in self.agent_subscriptions:
            del self.agent_subscriptions[agent_id]

        logger.info(f"Agent disconnected: {agent_id}")

        # Update metric
        metrics.gauge_set(
            "gallery_agent_websocket_connections",
            len(self.active_connections),
            {"agent_type": "ai"}
        )

    async def send_to_agent(self, agent_id: str, message: dict):
        """Send message to specific agent."""
        if agent_id in self.active_connections:
            try:
                await self.active_connections[agent_id].send_json(message)
            except Exception as e:
                logger.error(f"Error sending to agent {agent_id}: {e}")
                self.disconnect(agent_id)

    async def broadcast_event(
        self,
        event_type: str,
        workspace_id: str,
        data: dict,
    ):
        """Broadcast event to all subscribed agents in the workspace.

        Args:
            event_type: Event type (e.g., "gallery_created")
            workspace_id: Workspace UUID for multi-tenant isolation
            data: Event data payload
        """
        event_message = {
            "event_type": event_type,
            "workspace_id": workspace_id,
            "timestamp": datetime.utcnow().isoformat(),
            "data": data,
        }

        disconnected_agents = []

        for agent_id, websocket in self.active_connections.items():
            # Multi-tenant isolation: only send to agents in same workspace
            if self.agent_workspaces.get(agent_id) != workspace_id:
                continue

            # Event filtering: only send if agent is subscribed
            if event_type not in self.agent_subscriptions.get(agent_id, set()):
                continue

            try:
                await websocket.send_json(event_message)
                logger.debug(f"Event sent to agent {agent_id}: {event_type}")
            except Exception as e:
                logger.error(f"Error broadcasting to agent {agent_id}: {e}")
                disconnected_agents.append(agent_id)

        # Clean up disconnected agents
        for agent_id in disconnected_agents:
            self.disconnect(agent_id)

    def get_connection_count(self, workspace_id: Optional[str] = None) -> int:
        """Get count of active connections (optionally filtered by workspace)."""
        if workspace_id:
            return sum(
                1 for wid in self.agent_workspaces.values()
                if wid == workspace_id
            )
        return len(self.active_connections)


# Global connection manager
manager = AgentConnectionManager()


# =============================================================================
# WebSocket Endpoint
# =============================================================================


@router.websocket("/agents/{agent_id}")
async def agent_websocket(
    websocket: WebSocket,
    agent_id: str,
    workspace_id: str = Query(..., description="Workspace UUID for isolation"),
    token: str = Query(..., description="JWT authentication token"),
    event_types: Optional[str] = Query(
        None,
        description="Comma-separated event types to subscribe (default: all)"
    ),
):
    """
    WebSocket endpoint for AI agent notifications.

    **Connection:**
    ```
    WS ws://gallery-service:8004/ws/agents/{agent_id}?workspace_id={uuid}&token={jwt_token}&event_types=gallery_created,gallery_updated
    ```

    **Authentication:**
    Requires valid JWT token passed as query parameter. Token must match workspace_id.

    **Event Types:**
    - `gallery_created` - New gallery created
    - `gallery_updated` - Gallery metadata updated
    - `gallery_deleted` - Gallery soft deleted
    - `assets_added` - Assets added to gallery
    - `assets_removed` - Assets removed from gallery
    - `proofing_update` - New selection or favorite
    - `magic_link_created` - Magic Link created

    **Event Message Format:**
    ```json
    {
      "event_type": "gallery_created",
      "workspace_id": "uuid",
      "timestamp": "2026-01-08T12:00:00",
      "data": {
        "gallery_id": "uuid",
        "title": "New Gallery",
        ...
      }
    }
    ```

    **Heartbeat:**
    Server sends heartbeat every 30 seconds:
    ```json
    {"type": "heartbeat", "timestamp": "2026-01-08T12:00:00"}
    ```

    **Multi-Tenant Isolation:**
    Agents only receive events for their workspace.

    **Event Filtering:**
    Agents only receive subscribed event types.
    """
    # SECURITY: Validate JWT token before accepting connection
    try:
        user_payload = verify_jwt_token(token)

        # Verify workspace_id from JWT matches requested workspace_id
        jwt_workspace_id = user_payload.get("workspace_id")
        if not jwt_workspace_id or str(jwt_workspace_id) != str(workspace_id):
            logger.warning(
                f"WebSocket auth failed: JWT workspace {jwt_workspace_id} != "
                f"requested workspace {workspace_id}"
            )
            await websocket.close(code=1008, reason="Workspace mismatch")
            return

        logger.info(
            f"WebSocket authenticated: agent_id={agent_id}, "
            f"user_id={user_payload.get('user_id')}, workspace_id={workspace_id}"
        )
    except HTTPException as e:
        logger.warning(f"WebSocket auth failed for agent {agent_id}: {e.detail}")
        await websocket.close(code=1008, reason="Authentication failed")
        return
    except Exception as e:
        logger.error(f"WebSocket auth error for agent {agent_id}: {e}")
        await websocket.close(code=1011, reason="Internal error")
        return

    # Parse event types
    subscription_types = None
    if event_types:
        subscription_types = set(event_types.split(","))

    # Connect agent
    await manager.connect(agent_id, workspace_id, websocket, subscription_types)

    try:
        # Send connection success message
        await websocket.send_json({
            "type": "connected",
            "agent_id": agent_id,
            "workspace_id": workspace_id,
            "subscriptions": list(manager.agent_subscriptions.get(agent_id, [])),
            "timestamp": datetime.utcnow().isoformat(),
        })

        # Keep connection alive with heartbeat
        heartbeat_interval = 30  # seconds

        async def send_heartbeat():
            """Send periodic heartbeat to keep connection alive."""
            while True:
                try:
                    await asyncio.sleep(heartbeat_interval)
                    await websocket.send_json({
                        "type": "heartbeat",
                        "timestamp": datetime.utcnow().isoformat(),
                        "connection_count": manager.get_connection_count(workspace_id),
                    })
                except:
                    break

        # Start heartbeat task
        heartbeat_task = asyncio.create_task(send_heartbeat())

        # Listen for client messages (ping, subscription updates)
        try:
            while True:
                data = await websocket.receive_text()
                message = json.loads(data)

                # Handle ping/pong
                if message.get("type") == "ping":
                    await websocket.send_json({
                        "type": "pong",
                        "timestamp": datetime.utcnow().isoformat()
                    })

                # Handle subscription update
                elif message.get("type") == "update_subscriptions":
                    new_types = set(message.get("event_types", []))
                    manager.agent_subscriptions[agent_id] = new_types
                    await websocket.send_json({
                        "type": "subscriptions_updated",
                        "event_types": list(new_types),
                        "timestamp": datetime.utcnow().isoformat()
                    })

        except WebSocketDisconnect:
            logger.info(f"Agent {agent_id} disconnected normally")
        finally:
            heartbeat_task.cancel()

    except Exception as e:
        logger.error(f"Agent WebSocket error: {e}", exc_info=True)
    finally:
        manager.disconnect(agent_id)


# =============================================================================
# Event Broadcast Functions (Called by Services)
# =============================================================================


async def broadcast_gallery_created(workspace_id: str, gallery_data: dict):
    """Broadcast gallery_created event to all subscribed agents."""
    await manager.broadcast_event(
        event_type="gallery_created",
        workspace_id=workspace_id,
        data=gallery_data,
    )


async def broadcast_gallery_updated(workspace_id: str, gallery_data: dict):
    """Broadcast gallery_updated event to all subscribed agents."""
    await manager.broadcast_event(
        event_type="gallery_updated",
        workspace_id=workspace_id,
        data=gallery_data,
    )


async def broadcast_gallery_deleted(workspace_id: str, gallery_id: str):
    """Broadcast gallery_deleted event to all subscribed agents."""
    await manager.broadcast_event(
        event_type="gallery_deleted",
        workspace_id=workspace_id,
        data={"gallery_id": gallery_id, "deleted": True},
    )


async def broadcast_assets_added(
    workspace_id: str, gallery_id: str, asset_ids: list[str], count: int
):
    """Broadcast assets_added event to all subscribed agents."""
    await manager.broadcast_event(
        event_type="assets_added",
        workspace_id=workspace_id,
        data={
            "gallery_id": gallery_id,
            "asset_ids": asset_ids,
            "count": count,
        },
    )


async def broadcast_assets_removed(
    workspace_id: str, gallery_id: str, asset_ids: list[str], count: int
):
    """Broadcast assets_removed event to all subscribed agents."""
    await manager.broadcast_event(
        event_type="assets_removed",
        workspace_id=workspace_id,
        data={
            "gallery_id": gallery_id,
            "asset_ids": asset_ids,
            "count": count,
        },
    )


async def broadcast_proofing_update(
    workspace_id: str, gallery_id: str, update_type: str, asset_id: str
):
    """Broadcast proofing_update event to all subscribed agents.

    Args:
        workspace_id: Workspace UUID
        gallery_id: Gallery UUID
        update_type: Type of update ("selection" or "favorite")
        asset_id: Asset UUID that was selected/favorited
    """
    await manager.broadcast_event(
        event_type="proofing_update",
        workspace_id=workspace_id,
        data={
            "gallery_id": gallery_id,
            "update_type": update_type,
            "asset_id": asset_id,
        },
    )


async def broadcast_magic_link_created(workspace_id: str, magic_link_data: dict):
    """Broadcast magic_link_created event to all subscribed agents."""
    await manager.broadcast_event(
        event_type="magic_link_created",
        workspace_id=workspace_id,
        data=magic_link_data,
    )


# =============================================================================
# Connection Management Endpoint
# =============================================================================


@router.get("/agents/connections")
async def get_agent_connections(
    workspace_id: Optional[str] = Query(None, description="Filter by workspace")
):
    """
    Get count of active agent WebSocket connections.

    **Example:**
    ```
    GET /ws/agents/connections?workspace_id=uuid
    ```

    **Response:**
    ```json
    {
      "total_connections": 5,
      "workspace_connections": 3,
      "active_agents": ["agent1", "agent2", "agent3"]
    }
    ```
    """
    total = manager.get_connection_count()
    workspace_count = manager.get_connection_count(workspace_id) if workspace_id else None

    active_agents = []
    if workspace_id:
        active_agents = [
            agent_id for agent_id, wid in manager.agent_workspaces.items()
            if wid == workspace_id
        ]
    else:
        active_agents = list(manager.active_connections.keys())

    return {
        "total_connections": total,
        "workspace_connections": workspace_count,
        "active_agents": active_agents,
        "timestamp": datetime.utcnow().isoformat(),
    }
