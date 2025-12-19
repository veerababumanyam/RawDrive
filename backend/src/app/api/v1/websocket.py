"""WebSocket API endpoint for real-time updates.

Provides WebSocket connection for receiving real-time events like asset creation,
processing completion, and gallery updates.
"""

from __future__ import annotations

import json
import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect, status
from fastapi.exceptions import HTTPException

from app.api.dependencies.auth import get_current_user_optional
from app.db.redis import get_redis_client
from app.utils.security import decode_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1")

# Store active WebSocket connections per workspace
# Format: {workspace_id: set[WebSocket]}
_active_connections: dict[UUID, set[WebSocket]] = {}


async def authenticate_websocket(
    websocket: WebSocket, token: str | None
) -> tuple[UUID, UUID] | None:
    """Authenticate WebSocket connection via JWT token.

    Args:
        websocket: WebSocket connection
        token: JWT token from query parameter

    Returns:
        Tuple of (user_id, workspace_id) if authenticated, None otherwise
    """
    if not token:
        return None

    try:
        payload = decode_token(token)
        user_id = UUID(payload["sub"])
        # Support both single workspace (current) and multiple workspaces (future)
        workspace_id = None
        if "workspace_id" in payload:
            workspace_id = UUID(payload["workspace_id"])
        elif "wids" in payload:
            workspace_ids = [UUID(w) for w in payload.get("wids", [])]
            if workspace_ids:
                workspace_id = workspace_ids[0]

        if not workspace_id:
            return None

        return (user_id, workspace_id)
    except (ValueError, KeyError) as e:
        logger.warning(f"WebSocket authentication failed: {e}")
        return None


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: Annotated[str | None, Query()] = None,
) -> None:
    """WebSocket endpoint for real-time updates.

    Authentication:
    - JWT token via query parameter: ?token=<jwt_token>
    - Token must be valid and contain workspace_id

    Events:
    - asset:created - When new asset is created
    - asset:processed - When asset processing completes
    - asset:deleted - When asset is deleted

    Event Format:
    {
        "type": "asset:created",
        "workspace_id": "...",
        "gallery_id": "...",
        "asset_id": "...",
        "status": "available" (for asset:processed)
    }
    """
    await websocket.accept()

    # Authenticate connection
    auth_result = await authenticate_websocket(websocket, token)
    if not auth_result:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user_id, workspace_id = auth_result

    # Add connection to workspace room
    if workspace_id not in _active_connections:
        _active_connections[workspace_id] = set()
    _active_connections[workspace_id].add(websocket)

    logger.info(
        f"WebSocket connected: user={user_id}, workspace={workspace_id}",
        extra={"user_id": str(user_id), "workspace_id": str(workspace_id)},
    )

    # Subscribe to Redis channel for this workspace
    redis = await get_redis_client()
    pubsub = redis.pubsub()
    channel = f"ws:workspace:{workspace_id}"
    await pubsub.subscribe(channel)

    try:
        # Send welcome message
        await websocket.send_json(
            {
                "type": "connected",
                "workspace_id": str(workspace_id),
            }
        )

        # Listen for Redis messages and forward to WebSocket
        async def forward_messages():
            async for message in pubsub.listen():
                if message["type"] == "message":
                    try:
                        event_data = json.loads(message["data"])
                        await websocket.send_json(event_data)
                    except Exception as e:
                        logger.error(f"Failed to forward WebSocket message: {e}")

        # Run message forwarding in background
        import asyncio

        forward_task = asyncio.create_task(forward_messages())

        # Keep connection alive and handle client messages
        while True:
            try:
                # Wait for client message (ping/pong or close)
                data = await websocket.receive_text()
                # Echo ping for keepalive
                if data == "ping":
                    await websocket.send_text("pong")
            except WebSocketDisconnect:
                break

    except Exception as e:
        logger.error(f"WebSocket error: {e}", exc_info=True)
    finally:
        # Cleanup
        forward_task.cancel()
        try:
            await forward_task
        except asyncio.CancelledError:
            pass

        await pubsub.unsubscribe(channel)
        await pubsub.close()

        # Remove connection from workspace room
        if workspace_id in _active_connections:
            _active_connections[workspace_id].discard(websocket)
            if not _active_connections[workspace_id]:
                del _active_connections[workspace_id]

        logger.info(
            f"WebSocket disconnected: user={user_id}, workspace={workspace_id}",
            extra={"user_id": str(user_id), "workspace_id": str(workspace_id)},
        )


