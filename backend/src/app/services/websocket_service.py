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


async def emit_asset_updated(
    workspace_id: UUID,
    asset_id: UUID,
    updates: dict[str, Any],
) -> None:
    """Emit asset:updated event for metadata changes, status updates, etc.

    Used to notify frontend when background processing completes
    (e.g., metadata extraction, thumbnail generation).

    Args:
        workspace_id: Workspace UUID
        asset_id: Asset UUID
        updates: Dictionary of updated fields
    """
    await emit_event(
        workspace_id,
        "asset:updated",
        {
            "asset_id": str(asset_id),
            **updates,
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


async def emit_upload_progress(
    workspace_id: UUID,
    upload_id: UUID,
    status: str,
    progress: int = 0,
    asset_id: Optional[UUID] = None,
    error: Optional[str] = None,
) -> None:
    """Emit upload:progress event for real-time upload status.

    Used to notify frontend of upload processing stages:
    - uploading: File being uploaded (0-100%)
    - encrypting: File being encrypted
    - storing: File being stored to R2
    - processing: Thumbnail generation, etc.
    - complete: Upload finished successfully
    - error: Upload failed

    Args:
        workspace_id: Workspace UUID
        upload_id: Upload session UUID
        status: Current processing status
        progress: Progress percentage (0-100)
        asset_id: Asset UUID (when available)
        error: Error message (for error status)
    """
    data = {
        "upload_id": str(upload_id),
        "status": status,
        "progress": progress,
    }

    if asset_id:
        data["asset_id"] = str(asset_id)

    if error:
        data["error"] = error

    await emit_event(workspace_id, "upload:progress", data)


# ---------------------------------------------------------------------------
# Album Collaboration Events
# ---------------------------------------------------------------------------

ALBUM_COLLABORATION_CHANNEL_PREFIX = "album:collab:"


async def emit_album_operation(
    workspace_id: UUID,
    album_id: UUID,
    session_id: UUID,
    operation_type: str,
    operation_data: dict[str, Any],
    user_id: UUID,
    lamport_timestamp: int,
) -> None:
    """Emit album:operation event for real-time collaborative editing.

    Broadcasts CRDT operations to all participants in an album session.

    Args:
        workspace_id: Workspace UUID
        album_id: Album UUID
        session_id: Collaboration session UUID
        operation_type: Type of operation (spread_update, element_update, etc.)
        operation_data: Operation payload
        user_id: User who performed the operation
        lamport_timestamp: Lamport timestamp for causal ordering
    """
    data = {
        "album_id": str(album_id),
        "session_id": str(session_id),
        "operation_type": operation_type,
        "operation_data": operation_data,
        "user_id": str(user_id),
        "lamport_timestamp": lamport_timestamp,
    }
    await emit_event(workspace_id, "album:operation", data)


async def emit_album_presence(
    workspace_id: UUID,
    album_id: UUID,
    session_id: UUID,
    user_id: UUID,
    user_name: str,
    user_avatar: Optional[str],
    color: str,
    event: str,
    cursor: Optional[dict[str, Any]] = None,
    selection: Optional[list[str]] = None,
) -> None:
    """Emit album:presence event for collaborator presence tracking.

    Used to show who's editing, cursor positions, and selections.

    Args:
        workspace_id: Workspace UUID
        album_id: Album UUID
        session_id: Collaboration session UUID
        user_id: User UUID
        user_name: User display name
        user_avatar: User avatar URL (optional)
        color: Assigned collaborator color
        event: Presence event type (joined, left, cursor_move, selection_change)
        cursor: Cursor position data (optional)
        selection: Selected element IDs (optional)
    """
    data = {
        "album_id": str(album_id),
        "session_id": str(session_id),
        "user_id": str(user_id),
        "user_name": user_name,
        "user_avatar": user_avatar,
        "color": color,
        "event": event,
    }

    if cursor:
        data["cursor"] = cursor

    if selection:
        data["selection"] = selection

    await emit_event(workspace_id, "album:presence", data)


async def emit_album_comment(
    workspace_id: UUID,
    album_id: UUID,
    comment_id: UUID,
    spread_id: Optional[UUID],
    element_id: Optional[UUID],
    user_id: UUID,
    user_name: str,
    content: str,
    mentioned_users: list[dict[str, str]],
    event: str,
) -> None:
    """Emit album:comment event for real-time comment updates.

    Args:
        workspace_id: Workspace UUID
        album_id: Album UUID
        comment_id: Comment UUID
        spread_id: Spread UUID (optional, for spread comments)
        element_id: Element UUID (optional, for element comments)
        user_id: Commenter user UUID
        user_name: Commenter display name
        content: Comment text content
        mentioned_users: List of mentioned users with id and name
        event: Comment event type (created, resolved, deleted)
    """
    data = {
        "album_id": str(album_id),
        "comment_id": str(comment_id),
        "user_id": str(user_id),
        "user_name": user_name,
        "content": content,
        "mentioned_users": mentioned_users,
        "event": event,
    }

    if spread_id:
        data["spread_id"] = str(spread_id)

    if element_id:
        data["element_id"] = str(element_id)

    await emit_event(workspace_id, "album:comment", data)


async def emit_album_version(
    workspace_id: UUID,
    album_id: UUID,
    version_id: UUID,
    version_number: int,
    name: Optional[str],
    user_id: UUID,
    user_name: str,
    event: str,
) -> None:
    """Emit album:version event for version history updates.

    Args:
        workspace_id: Workspace UUID
        album_id: Album UUID
        version_id: Version UUID
        version_number: Version number
        name: Version name (optional)
        user_id: User who created/restored the version
        user_name: User display name
        event: Version event type (created, restored)
    """
    data = {
        "album_id": str(album_id),
        "version_id": str(version_id),
        "version_number": version_number,
        "name": name,
        "user_id": str(user_id),
        "user_name": user_name,
        "event": event,
    }

    await emit_event(workspace_id, "album:version", data)


async def emit_album_lock(
    workspace_id: UUID,
    album_id: UUID,
    resource_type: str,
    resource_id: str,
    user_id: UUID,
    user_name: str,
    event: str,
) -> None:
    """Emit album:lock event for resource locking updates.

    Args:
        workspace_id: Workspace UUID
        album_id: Album UUID
        resource_type: Type of locked resource (spread, element)
        resource_id: Resource identifier
        user_id: User who acquired/released the lock
        user_name: User display name
        event: Lock event type (acquired, released, expired)
    """
    data = {
        "album_id": str(album_id),
        "resource_type": resource_type,
        "resource_id": resource_id,
        "user_id": str(user_id),
        "user_name": user_name,
        "event": event,
    }

    await emit_event(workspace_id, "album:lock", data)


# ---------------------------------------------------------------------------
# Design Studio Collaboration Events
# ---------------------------------------------------------------------------

DESIGN_STUDIO_CHANNEL_PREFIX = "design:studio:"


async def emit_design_cursor(
    workspace_id: UUID,
    gallery_id: UUID,
    user_id: UUID,
    user_name: str,
    user_color: str,
    x: float,
    y: float,
    section: Optional[str] = None,
) -> None:
    """Emit design:cursor event for real-time cursor tracking.

    Args:
        workspace_id: Workspace UUID
        gallery_id: Gallery UUID being designed
        user_id: User UUID
        user_name: User display name
        user_color: Assigned collaborator color
        x: Cursor X position
        y: Cursor Y position
        section: Current active section (optional)
    """
    data = {
        "gallery_id": str(gallery_id),
        "user_id": str(user_id),
        "user_name": user_name,
        "user_color": user_color,
        "cursor": {"x": x, "y": y},
        "section": section,
    }

    await emit_event(workspace_id, "design:cursor", data)


async def emit_design_presence(
    workspace_id: UUID,
    gallery_id: UUID,
    user_id: UUID,
    user_name: str,
    user_avatar: Optional[str],
    user_color: str,
    event: str,
    active_section: Optional[str] = None,
) -> None:
    """Emit design:presence event for collaborator join/leave/status.

    Args:
        workspace_id: Workspace UUID
        gallery_id: Gallery UUID being designed
        user_id: User UUID
        user_name: User display name
        user_avatar: User avatar URL (optional)
        user_color: Assigned collaborator color
        event: Presence event type (joined, left, idle, active)
        active_section: Currently focused section (optional)
    """
    data = {
        "gallery_id": str(gallery_id),
        "user_id": str(user_id),
        "user_name": user_name,
        "user_avatar": user_avatar,
        "user_color": user_color,
        "event": event,
        "active_section": active_section,
    }

    await emit_event(workspace_id, "design:presence", data)


async def emit_design_typing(
    workspace_id: UUID,
    gallery_id: UUID,
    user_id: UUID,
    user_name: str,
    is_typing: bool,
    field: Optional[str] = None,
) -> None:
    """Emit design:typing event for typing indicator.

    Args:
        workspace_id: Workspace UUID
        gallery_id: Gallery UUID being designed
        user_id: User UUID
        user_name: User display name
        is_typing: Whether user is currently typing
        field: Field being edited (optional)
    """
    data = {
        "gallery_id": str(gallery_id),
        "user_id": str(user_id),
        "user_name": user_name,
        "is_typing": is_typing,
        "field": field,
    }

    await emit_event(workspace_id, "design:typing", data)


async def emit_design_update(
    workspace_id: UUID,
    gallery_id: UUID,
    user_id: UUID,
    user_name: str,
    section: str,
    changes: dict[str, Any],
    version: int,
) -> None:
    """Emit design:update event for real-time design changes.

    Args:
        workspace_id: Workspace UUID
        gallery_id: Gallery UUID being designed
        user_id: User UUID
        user_name: User display name
        section: Design section being updated (cover, typography, theme, grid)
        changes: Dictionary of changed config values
        version: Version number for conflict detection
    """
    data = {
        "gallery_id": str(gallery_id),
        "user_id": str(user_id),
        "user_name": user_name,
        "section": section,
        "changes": changes,
        "version": version,
    }

    await emit_event(workspace_id, "design:update", data)


async def emit_design_lock(
    workspace_id: UUID,
    gallery_id: UUID,
    section: str,
    user_id: UUID,
    user_name: str,
    user_color: str,
    event: str,
    lock_id: Optional[str] = None,
) -> None:
    """Emit design:lock event for section locking.

    Args:
        workspace_id: Workspace UUID
        gallery_id: Gallery UUID being designed
        section: Design section (cover, typography, theme, grid)
        user_id: User who acquired/released the lock
        user_name: User display name
        user_color: Assigned collaborator color
        event: Lock event type (acquired, released, expired)
        lock_id: Lock identifier (optional)
    """
    data = {
        "gallery_id": str(gallery_id),
        "section": section,
        "user_id": str(user_id),
        "user_name": user_name,
        "user_color": user_color,
        "event": event,
        "lock_id": lock_id,
    }

    await emit_event(workspace_id, "design:lock", data)


async def emit_design_conflict(
    workspace_id: UUID,
    gallery_id: UUID,
    conflict_id: str,
    section: str,
    field: Optional[str],
    my_value: Any,
    their_value: Any,
    their_user_id: UUID,
    their_user_name: str,
    their_user_color: str,
    my_timestamp: str,
    their_timestamp: str,
) -> None:
    """Emit design:conflict event when concurrent edits conflict.

    Args:
        workspace_id: Workspace UUID
        gallery_id: Gallery UUID being designed
        conflict_id: Unique conflict identifier
        section: Design section with conflict
        field: Specific field with conflict (optional)
        my_value: Local user's value
        their_value: Remote user's value
        their_user_id: Remote user UUID
        their_user_name: Remote user display name
        their_user_color: Remote user's color
        my_timestamp: Local change timestamp
        their_timestamp: Remote change timestamp
    """
    data = {
        "gallery_id": str(gallery_id),
        "conflict_id": conflict_id,
        "section": section,
        "field": field,
        "my_value": my_value,
        "their_value": their_value,
        "their_user_id": str(their_user_id),
        "their_user_name": their_user_name,
        "their_user_color": their_user_color,
        "my_timestamp": my_timestamp,
        "their_timestamp": their_timestamp,
    }

    await emit_event(workspace_id, "design:conflict", data)


async def emit_design_activity(
    workspace_id: UUID,
    gallery_id: UUID,
    activity_id: str,
    action: str,
    user_id: UUID,
    user_name: str,
    user_color: str,
    section: Optional[str] = None,
    details: Optional[str] = None,
) -> None:
    """Emit design:activity event for activity feed.

    Args:
        workspace_id: Workspace UUID
        gallery_id: Gallery UUID being designed
        activity_id: Unique activity identifier
        action: Action type (joined, left, section_locked, section_unlocked, design_updated, etc.)
        user_id: User UUID
        user_name: User display name
        user_color: User's assigned color
        section: Design section involved (optional)
        details: Additional details (optional)
    """
    import datetime

    data = {
        "gallery_id": str(gallery_id),
        "activity_id": activity_id,
        "action": action,
        "user_id": str(user_id),
        "user_name": user_name,
        "user_color": user_color,
        "section": section,
        "details": details,
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
    }

    await emit_event(workspace_id, "design:activity", data)


