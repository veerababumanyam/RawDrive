"""Notification Event Publisher for async notification delivery.

Publishes notification events to Redis for the notifications-service
to consume and process asynchronously. This decouples the notification
delivery from the core business logic.

Events are published to 'notification:events' channel with the format:
{
    "event_type": "album.proof_sent",
    "workspace_id": "uuid",
    "payload": {...}
}

Feature: 026-album-proofing
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from app.db.redis import get_redis_client

logger = logging.getLogger(__name__)

# Redis channel for notification events
NOTIFICATION_CHANNEL = "notification:events"


async def publish_notification_event(
    event_type: str,
    workspace_id: UUID,
    recipient_email: str,
    payload: dict[str, Any],
    priority: str = "normal",
) -> None:
    """Publish a notification event to Redis.

    Args:
        event_type: Event type (e.g., 'album.proof_sent')
        workspace_id: Workspace UUID
        recipient_email: Email of the notification recipient
        payload: Event-specific payload data
        priority: Priority level ('low', 'normal', 'high')
    """
    try:
        redis = await get_redis_client()

        event = {
            "event_type": event_type,
            "workspace_id": str(workspace_id),
            "recipient_email": recipient_email,
            "payload": payload,
            "priority": priority,
            "published_at": datetime.now(timezone.utc).isoformat(),
        }

        await redis.publish(NOTIFICATION_CHANNEL, json.dumps(event))

        logger.info(
            "Published notification event",
            extra={
                "event_type": event_type,
                "workspace_id": str(workspace_id),
                "recipient": recipient_email,
            },
        )
    except Exception as e:
        logger.error(
            f"Failed to publish notification event: {e}",
            extra={"event_type": event_type, "workspace_id": str(workspace_id)},
            exc_info=True,
        )


# =============================================================================
# Album Proofing Notification Events (026-album-proofing)
# =============================================================================


async def notify_album_proof_sent(
    workspace_id: UUID,
    album_id: UUID,
    album_name: str,
    proof_url: str,
    photographer_name: str,
    recipient_email: str,
    spread_count: Optional[int] = None,
    custom_message: Optional[str] = None,
    expiry_date: Optional[str] = None,
    cover_image_url: Optional[str] = None,
) -> None:
    """Notify client that album proof is ready for review.

    Args:
        workspace_id: Workspace UUID
        album_id: Album UUID
        album_name: Album title
        proof_url: Share link URL for the proof
        photographer_name: Name of the photographer
        recipient_email: Client's email address
        spread_count: Number of spreads in the album
        custom_message: Optional personal message from photographer
        expiry_date: When the proof link expires
        cover_image_url: URL of cover image for email preview
    """
    payload = {
        "album_id": str(album_id),
        "album_name": album_name,
        "proof_url": proof_url,
        "photographer_name": photographer_name,
    }

    if spread_count is not None:
        payload["spread_count"] = spread_count
    if custom_message:
        payload["custom_message"] = custom_message
    if expiry_date:
        payload["expiry_date"] = expiry_date
    if cover_image_url:
        payload["cover_image_url"] = cover_image_url

    await publish_notification_event(
        event_type="album.proof_sent",
        workspace_id=workspace_id,
        recipient_email=recipient_email,
        payload=payload,
        priority="high",
    )


async def notify_album_comment_added(
    workspace_id: UUID,
    album_id: UUID,
    album_name: str,
    comment_id: UUID,
    commenter_name: str,
    comment_preview: str,
    spread_number: int,
    recipient_email: str,
    album_url: Optional[str] = None,
    position_x: Optional[float] = None,
    position_y: Optional[float] = None,
) -> None:
    """Notify photographer that client added a comment on album proof.

    Args:
        workspace_id: Workspace UUID
        album_id: Album UUID
        album_name: Album title
        comment_id: Comment UUID
        commenter_name: Name of the commenter
        comment_preview: First ~100 chars of comment
        spread_number: Page number of the comment
        recipient_email: Photographer's email address
        album_url: URL to view the album
        position_x: X position as percentage (0-100)
        position_y: Y position as percentage (0-100)
    """
    payload = {
        "album_id": str(album_id),
        "album_name": album_name,
        "comment_id": str(comment_id),
        "commenter_name": commenter_name,
        "comment_preview": comment_preview[:100] if len(comment_preview) > 100 else comment_preview,
        "spread_number": spread_number,
    }

    if album_url:
        payload["album_url"] = album_url
    if position_x is not None:
        payload["position_x"] = position_x
    if position_y is not None:
        payload["position_y"] = position_y

    await publish_notification_event(
        event_type="album.comment_added",
        workspace_id=workspace_id,
        recipient_email=recipient_email,
        payload=payload,
        priority="normal",
    )


async def notify_album_comment_resolved(
    workspace_id: UUID,
    album_id: UUID,
    album_name: str,
    comment_preview: str,
    recipient_email: str,
    album_url: Optional[str] = None,
    resolved_by: Optional[str] = None,
    resolution_note: Optional[str] = None,
) -> None:
    """Notify client that their comment has been resolved.

    Args:
        workspace_id: Workspace UUID
        album_id: Album UUID
        album_name: Album title
        comment_preview: The comment that was resolved
        recipient_email: Client's email address
        album_url: URL to view the album
        resolved_by: Name of person who resolved
        resolution_note: Optional note explaining resolution
    """
    payload = {
        "album_id": str(album_id),
        "album_name": album_name,
        "comment_preview": comment_preview[:100] if len(comment_preview) > 100 else comment_preview,
    }

    if album_url:
        payload["album_url"] = album_url
    if resolved_by:
        payload["resolved_by"] = resolved_by
    if resolution_note:
        payload["resolution_note"] = resolution_note

    await publish_notification_event(
        event_type="album.comment_resolved",
        workspace_id=workspace_id,
        recipient_email=recipient_email,
        payload=payload,
        priority="low",
    )


async def notify_album_approved(
    workspace_id: UUID,
    album_id: UUID,
    album_name: str,
    client_name: str,
    client_email: str,
    approval_date: str,
    recipient_email: str,
    album_url: Optional[str] = None,
    unresolved_comment_count: int = 0,
    version_number: Optional[int] = None,
) -> None:
    """Notify photographer that client approved the album for print.

    Args:
        workspace_id: Workspace UUID
        album_id: Album UUID
        album_name: Album title
        client_name: Name of the approving client
        client_email: Email of the approving client
        approval_date: ISO date string of approval
        recipient_email: Photographer's email address
        album_url: URL to view the album
        unresolved_comment_count: Number of unresolved comments (if any)
        version_number: Album version that was approved
    """
    payload = {
        "album_id": str(album_id),
        "album_name": album_name,
        "client_name": client_name,
        "client_email": client_email,
        "approval_date": approval_date,
    }

    if album_url:
        payload["album_url"] = album_url
    if unresolved_comment_count > 0:
        payload["unresolved_comment_count"] = unresolved_comment_count
    if version_number is not None:
        payload["version_number"] = version_number

    await publish_notification_event(
        event_type="album.approved",
        workspace_id=workspace_id,
        recipient_email=recipient_email,
        payload=payload,
        priority="high",
    )


async def notify_album_version_created(
    workspace_id: UUID,
    album_id: UUID,
    album_name: str,
    version_number: int,
    version_label: str,
    proof_url: str,
    recipient_email: str,
    photographer_name: Optional[str] = None,
    change_summary: Optional[str] = None,
) -> None:
    """Notify client that a new album version is available.

    Args:
        workspace_id: Workspace UUID
        album_id: Album UUID
        album_name: Album title
        version_number: New version number
        version_label: Label/description for the version
        proof_url: Share link URL for the new version
        recipient_email: Client's email address
        photographer_name: Name of the photographer
        change_summary: Summary of changes in this version
    """
    payload = {
        "album_id": str(album_id),
        "album_name": album_name,
        "version_number": version_number,
        "version_label": version_label,
        "proof_url": proof_url,
    }

    if photographer_name:
        payload["photographer_name"] = photographer_name
    if change_summary:
        payload["change_summary"] = change_summary

    await publish_notification_event(
        event_type="album.version_created",
        workspace_id=workspace_id,
        recipient_email=recipient_email,
        payload=payload,
        priority="normal",
    )


async def notify_album_changes_requested(
    workspace_id: UUID,
    album_id: UUID,
    album_name: str,
    client_name: str,
    comment_count: int,
    recipient_email: str,
    album_url: Optional[str] = None,
    summary: Optional[str] = None,
) -> None:
    """Notify photographer that client requested changes to album.

    Args:
        workspace_id: Workspace UUID
        album_id: Album UUID
        album_name: Album title
        client_name: Name of the client
        comment_count: Number of comments/change requests
        recipient_email: Photographer's email address
        album_url: URL to view the album
        summary: Summary of requested changes
    """
    payload = {
        "album_id": str(album_id),
        "album_name": album_name,
        "client_name": client_name,
        "comment_count": comment_count,
    }

    if album_url:
        payload["album_url"] = album_url
    if summary:
        payload["summary"] = summary

    await publish_notification_event(
        event_type="album.changes_requested",
        workspace_id=workspace_id,
        recipient_email=recipient_email,
        payload=payload,
        priority="high",
    )
