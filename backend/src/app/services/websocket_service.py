"""WebSocket service for real-time event broadcasting.

Uses Redis pub/sub to broadcast events to connected WebSocket clients.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional
from uuid import UUID

from app.db.redis import get_redis_client

logger = logging.getLogger(__name__)

# Redis channel prefix for workspace events
WS_CHANNEL_PREFIX = "ws:workspace:"


async def emit_event(
    workspace_id: UUID,
    event_type: str,
    data: dict[str, Any],
) -> None:
    """Emit a WebSocket event to all clients in a workspace.

    Args:
        workspace_id: Workspace UUID
        event_type: Event type (e.g., 'asset:created', 'asset:processed')
        data: Event data payload
    """
    try:
        redis = await get_redis_client()
        channel = f"{WS_CHANNEL_PREFIX}{workspace_id}"

        event = {
            "type": event_type,
            "workspace_id": str(workspace_id),
            **data,
        }

        # Publish to Redis channel
        await redis.publish(channel, json.dumps(event))

        logger.debug(
            f"Emitted WebSocket event: {event_type} to workspace {workspace_id}",
            extra={"workspace_id": str(workspace_id), "event_type": event_type},
        )
    except Exception as e:
        logger.error(
            f"Failed to emit WebSocket event: {e}",
            extra={"workspace_id": str(workspace_id), "event_type": event_type},
            exc_info=True,
        )


async def emit_asset_created(
    workspace_id: UUID,
    gallery_id: Optional[UUID],
    asset_id: UUID,
) -> None:
    """Emit asset:created event.

    Args:
        workspace_id: Workspace UUID
        gallery_id: Gallery UUID or None
        asset_id: Asset UUID
    """
    await emit_event(
        workspace_id,
        "asset:created",
        {
            "gallery_id": str(gallery_id) if gallery_id else None,
            "asset_id": str(asset_id),
        },
    )


async def emit_asset_processed(
    workspace_id: UUID,
    gallery_id: UUID,
    asset_id: UUID,
    status: str = "available",
) -> None:
    """Emit asset:processed event.

    Args:
        workspace_id: Workspace UUID
        gallery_id: Gallery UUID
        asset_id: Asset UUID
        status: Asset status ('available', 'failed')
    """
    await emit_event(
        workspace_id,
        "asset:processed",
        {
            "gallery_id": str(gallery_id),
            "asset_id": str(asset_id),
            "status": status,
        },
    )


async def emit_asset_deleted(
    workspace_id: UUID,
    gallery_id: UUID,
    asset_id: UUID,
) -> None:
    """Emit asset:deleted event.

    Args:
        workspace_id: Workspace UUID
        gallery_id: Gallery UUID
        asset_id: Asset UUID
    """
    await emit_event(
        workspace_id,
        "asset:deleted",
        {
            "gallery_id": str(gallery_id),
            "asset_id": str(asset_id),
        },
    )


async def emit_activity_created(
    workspace_id: UUID,
    activity: dict,
) -> None:
    """Emit activity:created event for real-time dashboard updates.

    Args:
        workspace_id: Workspace UUID
        activity: Activity data dict
    """
    await emit_event(
        workspace_id,
        "activity:created",
        {
            "activity": activity,
        },
    )


