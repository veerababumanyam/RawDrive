"""
WebSocket API for real-time proofing updates.

Handles:
- Gallery viewer connections
- Real-time proofing broadcasts (favorites, selections, comments)
- Viewer count updates
- Heartbeat/keepalive
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Dict, Set, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from src.cache.redis_client import redis_client
from src.config import settings
from src.logging import get_logger
from src.observability.metrics import get_metrics

logger = get_logger(__name__)
metrics = get_metrics()

router = APIRouter()


# =============================================================================
# Connection Manager
# =============================================================================


class ConnectionManager:
    """Manages WebSocket connections per gallery."""

    def __init__(self):
        # gallery_id -> set of WebSocket connections
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        # Track viewer counts
        self.viewer_counts: Dict[str, int] = {}

    async def connect(self, websocket: WebSocket, gallery_id: str) -> bool:
        """Accept a new WebSocket connection for a gallery."""
        # Check connection limit
        current_count = len(self.active_connections.get(gallery_id, set()))
        if current_count >= settings.WS_MAX_CONNECTIONS_PER_GALLERY:
            logger.warning(
                f"WebSocket connection limit reached for gallery {gallery_id}",
                extra={"gallery_id": gallery_id, "current": current_count}
            )
            return False

        await websocket.accept()

        if gallery_id not in self.active_connections:
            self.active_connections[gallery_id] = set()

        self.active_connections[gallery_id].add(websocket)
        self.viewer_counts[gallery_id] = len(self.active_connections[gallery_id])

        metrics.websocket_connected()
        metrics.set_active_viewers(gallery_id, self.viewer_counts[gallery_id])

        logger.info(
            f"WebSocket connected to gallery {gallery_id}",
            extra={"gallery_id": gallery_id, "viewers": self.viewer_counts[gallery_id]}
        )

        # Broadcast viewer count update
        await self.broadcast_viewer_count(gallery_id)

        return True

    def disconnect(self, websocket: WebSocket, gallery_id: str):
        """Remove a WebSocket connection."""
        if gallery_id in self.active_connections:
            self.active_connections[gallery_id].discard(websocket)
            self.viewer_counts[gallery_id] = len(self.active_connections[gallery_id])

            if not self.active_connections[gallery_id]:
                del self.active_connections[gallery_id]
                del self.viewer_counts[gallery_id]
            else:
                metrics.set_active_viewers(gallery_id, self.viewer_counts[gallery_id])

        metrics.websocket_disconnected()

        logger.info(
            f"WebSocket disconnected from gallery {gallery_id}",
            extra={"gallery_id": gallery_id}
        )

    async def broadcast_to_gallery(self, gallery_id: str, message: dict):
        """Broadcast a message to all connections for a gallery."""
        if gallery_id not in self.active_connections:
            return

        message_str = json.dumps(message)
        dead_connections = set()

        for connection in self.active_connections[gallery_id]:
            try:
                await connection.send_text(message_str)
                metrics.websocket_message("out", message.get("type", "unknown"))
            except Exception as e:
                logger.warning(f"Failed to send WebSocket message: {e}")
                dead_connections.add(connection)

        # Clean up dead connections
        for connection in dead_connections:
            self.disconnect(connection, gallery_id)

    async def broadcast_viewer_count(self, gallery_id: str):
        """Broadcast current viewer count to all connections."""
        message = {
            "type": "viewer_count",
            "gallery_id": gallery_id,
            "count": self.viewer_counts.get(gallery_id, 0),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        await self.broadcast_to_gallery(gallery_id, message)

    def get_viewer_count(self, gallery_id: str) -> int:
        """Get current viewer count for a gallery."""
        return self.viewer_counts.get(gallery_id, 0)


# Global connection manager instance
manager = ConnectionManager()


# =============================================================================
# Redis Pub/Sub Listener
# =============================================================================


async def start_redis_listener(gallery_id: str):
    """Start listening to Redis pub/sub for proofing updates."""
    channel = f"gallery:{gallery_id}:proofing"
    pubsub = await redis_client.subscribe(channel)

    if not pubsub:
        logger.warning(f"Failed to subscribe to Redis channel: {channel}")
        return

    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                try:
                    data = json.loads(message["data"])
                    await manager.broadcast_to_gallery(gallery_id, data)
                except json.JSONDecodeError:
                    pass
    except Exception as e:
        logger.error(f"Redis listener error: {e}")
    finally:
        await pubsub.unsubscribe(channel)


# =============================================================================
# WebSocket Endpoint
# =============================================================================


@router.websocket("/{gallery_id}")
async def websocket_gallery(
    websocket: WebSocket,
    gallery_id: str,
    token: Optional[str] = Query(None),
    visitor_id: Optional[str] = Query(None),
):
    """
    WebSocket endpoint for real-time gallery updates.

    Connect to receive:
    - Proofing updates (favorites, selections, comments)
    - Viewer count changes
    - Heartbeat messages

    Query params:
    - token: Magic link token for access verification
    - visitor_id: Optional visitor ID for tracking
    """
    # Validate access (in production, verify token)
    # For now, accept all connections

    if not await manager.connect(websocket, gallery_id):
        await websocket.close(code=1008, reason="Connection limit reached")
        return

    # Start Redis listener task for this gallery
    listener_task = asyncio.create_task(start_redis_listener(gallery_id))

    try:
        while True:
            try:
                # Wait for client messages with timeout for heartbeat
                message = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=settings.WS_HEARTBEAT_INTERVAL,
                )

                # Parse and handle client message
                try:
                    data = json.loads(message)
                    metrics.websocket_message("in", data.get("type", "unknown"))

                    if data.get("type") == "ping":
                        # Respond to ping
                        await websocket.send_text(json.dumps({
                            "type": "pong",
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        }))

                except json.JSONDecodeError:
                    pass

            except asyncio.TimeoutError:
                # Send heartbeat
                try:
                    await websocket.send_text(json.dumps({
                        "type": "heartbeat",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }))
                except Exception:
                    break

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        manager.disconnect(websocket, gallery_id)
        listener_task.cancel()

        # Broadcast updated viewer count
        asyncio.create_task(manager.broadcast_viewer_count(gallery_id))
