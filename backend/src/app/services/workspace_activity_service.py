"""WorkspaceActivityService: Tracks and retrieves workspace-wide activity feed.

Provides real-time activity tracking for the dashboard, capturing events like:
- Gallery views by visitors
- Photo downloads
- Comments added
- Favorites and selections
- Upload completions

All operations are workspace-scoped for multi-tenant data isolation.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.services.websocket_service import emit_event

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Activity Types
# ---------------------------------------------------------------------------

ACTIVITY_TYPES = {
    "gallery_viewed",
    "gallery_published",
    "gallery_created",
    "photo_downloaded",
    "photos_downloaded",
    "comment_added",
    "favorite_added",
    "favorite_removed",
    "selection_added",
    "selection_removed",
    "upload_completed",
    "visitor_registered",
    "face_search_performed",
}

ACTOR_TYPES = {"user", "visitor", "guest"}
TARGET_TYPES = {"gallery", "asset", "comment", "visitor"}


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class WorkspaceActivityError(Exception):
    """Base exception for workspace activity errors."""

    def __init__(self, message: str, code: str = "ACTIVITY_ERROR"):
        self.message = message
        self.code = code
        self.status_code = 400
        super().__init__(message)


class InvalidActivityTypeError(WorkspaceActivityError):
    """Invalid activity type."""

    def __init__(self, activity_type: str):
        super().__init__(
            f"Invalid activity type: {activity_type}",
            code="INVALID_ACTIVITY_TYPE",
        )


# ---------------------------------------------------------------------------
# WorkspaceActivityService
# ---------------------------------------------------------------------------


class WorkspaceActivityService:
    """Service for workspace-wide activity tracking and retrieval."""

    # =========================================================================
    # Record Activity
    # =========================================================================

    async def record_activity(
        self,
        workspace_id: UUID,
        activity_type: str,
        target_type: str,
        target_id: UUID,
        *,
        actor_user_id: Optional[UUID] = None,
        actor_visitor_id: Optional[UUID] = None,
        actor_name: Optional[str] = None,
        actor_email: Optional[str] = None,
        actor_avatar_url: Optional[str] = None,
        target_name: Optional[str] = None,
        target_thumbnail_url: Optional[str] = None,
        gallery_id: Optional[UUID] = None,
        gallery_name: Optional[str] = None,
        description: Optional[str] = None,
        metadata: Optional[dict] = None,
        count: int = 1,
        emit_websocket: bool = True,
    ) -> dict:
        """Record a new workspace activity.

        Args:
            workspace_id: Workspace for tenant isolation
            activity_type: Type of activity (e.g., 'gallery_viewed', 'comment_added')
            target_type: Type of target entity ('gallery', 'asset', 'comment', 'visitor')
            target_id: UUID of the target entity
            actor_user_id: Authenticated user who performed action (optional)
            actor_visitor_id: Registered visitor who performed action (optional)
            actor_name: Display name for the actor
            actor_email: Email of the actor (optional)
            actor_avatar_url: Avatar URL for display
            target_name: Name of the target for display
            target_thumbnail_url: Thumbnail URL for the target
            gallery_id: Related gallery (optional)
            gallery_name: Gallery name for display
            description: Human-readable description
            metadata: Additional context as JSONB
            count: Quantity (e.g., number of photos downloaded)
            emit_websocket: Whether to emit real-time event

        Returns:
            Created activity record

        Raises:
            InvalidActivityTypeError: If activity_type is not valid
        """
        if activity_type not in ACTIVITY_TYPES:
            raise InvalidActivityTypeError(activity_type)

        if target_type not in TARGET_TYPES:
            raise WorkspaceActivityError(
                f"Invalid target type: {target_type}",
                code="INVALID_TARGET_TYPE",
            )

        # Determine actor type
        if actor_user_id:
            actor_type = "user"
        elif actor_visitor_id:
            actor_type = "visitor"
        else:
            actor_type = "guest"

        # Generate description if not provided
        if not description:
            description = self._generate_description(
                activity_type=activity_type,
                actor_name=actor_name or "Someone",
                target_name=target_name,
                gallery_name=gallery_name,
                count=count,
            )

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO workspace_activities (
                    workspace_id, activity_type,
                    actor_user_id, actor_visitor_id, actor_name, actor_email,
                    actor_avatar_url, actor_type,
                    target_type, target_id, target_name, target_thumbnail_url,
                    gallery_id, gallery_name,
                    description, metadata, count
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
                RETURNING activity_id, created_at
                """,
                workspace_id,
                activity_type,
                actor_user_id,
                actor_visitor_id,
                actor_name,
                actor_email,
                actor_avatar_url,
                actor_type,
                target_type,
                target_id,
                target_name,
                target_thumbnail_url,
                gallery_id,
                gallery_name,
                description,
                metadata or {},
                count,
            )

            activity = {
                "activity_id": str(row["activity_id"]),
                "workspace_id": str(workspace_id),
                "activity_type": activity_type,
                "actor_type": actor_type,
                "actor_name": actor_name,
                "actor_email": actor_email,
                "actor_avatar_url": actor_avatar_url,
                "target_type": target_type,
                "target_id": str(target_id),
                "target_name": target_name,
                "target_thumbnail_url": target_thumbnail_url,
                "gallery_id": str(gallery_id) if gallery_id else None,
                "gallery_name": gallery_name,
                "description": description,
                "metadata": metadata or {},
                "count": count,
                "created_at": row["created_at"].isoformat(),
            }

            # Emit WebSocket event for real-time updates
            if emit_websocket:
                await emit_event(
                    workspace_id,
                    "activity:created",
                    {"activity": activity},
                )

            logger.info(
                f"Recorded activity: {activity_type}",
                extra={
                    "workspace_id": str(workspace_id),
                    "activity_type": activity_type,
                    "target_type": target_type,
                    "target_id": str(target_id),
                },
            )

            return activity

    def _generate_description(
        self,
        activity_type: str,
        actor_name: str,
        target_name: Optional[str],
        gallery_name: Optional[str],
        count: int,
    ) -> str:
        """Generate human-readable description for an activity."""
        descriptions = {
            "gallery_viewed": f"{actor_name} viewed gallery",
            "gallery_published": f"{actor_name} published gallery",
            "gallery_created": f"{actor_name} created a new gallery",
            "photo_downloaded": f"{actor_name} downloaded a photo",
            "photos_downloaded": f"{actor_name} downloaded {count} photos",
            "comment_added": f"{actor_name} left a comment",
            "favorite_added": f"{actor_name} favorited a photo",
            "favorite_removed": f"{actor_name} removed a favorite",
            "selection_added": f"{actor_name} selected a photo",
            "selection_removed": f"{actor_name} removed a selection",
            "upload_completed": f"{actor_name} uploaded {count} photos",
            "visitor_registered": f"{actor_name} registered as a visitor",
            "face_search_performed": f"{actor_name} searched for faces",
        }

        desc = descriptions.get(activity_type, f"{actor_name} performed an action")

        if gallery_name and activity_type not in ("gallery_created", "gallery_published"):
            desc += f" in {gallery_name}"

        return desc

    # =========================================================================
    # Get Activities
    # =========================================================================

    async def get_recent_activities(
        self,
        workspace_id: UUID,
        limit: int = 10,
        activity_type: Optional[str] = None,
        actor_type: Optional[str] = None,
        gallery_id: Optional[UUID] = None,
        since: Optional[datetime] = None,
    ) -> list[dict]:
        """Get recent activities for a workspace.

        Args:
            workspace_id: Workspace for tenant isolation
            limit: Maximum number of activities to return (1-100)
            activity_type: Filter by activity type
            actor_type: Filter by actor type ('user', 'visitor', 'guest')
            gallery_id: Filter by gallery
            since: Only get activities after this timestamp

        Returns:
            List of activity records, newest first
        """
        limit = max(1, min(100, limit))

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Build dynamic WHERE clause
            where_clauses = ["workspace_id = $1"]
            params: list[Any] = [workspace_id]
            param_idx = 2

            if activity_type:
                where_clauses.append(f"activity_type = ${param_idx}")
                params.append(activity_type)
                param_idx += 1

            if actor_type:
                where_clauses.append(f"actor_type = ${param_idx}")
                params.append(actor_type)
                param_idx += 1

            if gallery_id:
                where_clauses.append(f"gallery_id = ${param_idx}")
                params.append(gallery_id)
                param_idx += 1

            if since:
                where_clauses.append(f"created_at > ${param_idx}")
                params.append(since)
                param_idx += 1

            where_sql = " AND ".join(where_clauses)
            params.append(limit)

            rows = await conn.fetch(
                f"""
                SELECT
                    activity_id, workspace_id, activity_type,
                    actor_user_id, actor_visitor_id, actor_name, actor_email,
                    actor_avatar_url, actor_type,
                    target_type, target_id, target_name, target_thumbnail_url,
                    gallery_id, gallery_name,
                    description, metadata, count, created_at
                FROM workspace_activities
                WHERE {where_sql}
                ORDER BY created_at DESC
                LIMIT ${param_idx}
                """,
                *params,
            )

            return [self._format_activity(row) for row in rows]

    async def get_activity_summary(
        self,
        workspace_id: UUID,
        days: int = 30,
    ) -> dict:
        """Get activity summary statistics.

        Args:
            workspace_id: Workspace for tenant isolation
            days: Number of days to look back

        Returns:
            Summary with counts by type
        """
        since = datetime.now(timezone.utc) - timedelta(days=days)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Count by activity type
            type_counts = await conn.fetch(
                """
                SELECT activity_type, COUNT(*) as count
                FROM workspace_activities
                WHERE workspace_id = $1 AND created_at > $2
                GROUP BY activity_type
                ORDER BY count DESC
                """,
                workspace_id,
                since,
            )

            # Count by actor type
            actor_counts = await conn.fetch(
                """
                SELECT actor_type, COUNT(*) as count
                FROM workspace_activities
                WHERE workspace_id = $1 AND created_at > $2
                GROUP BY actor_type
                """,
                workspace_id,
                since,
            )

            # Total activities
            total = await conn.fetchval(
                """
                SELECT COUNT(*) FROM workspace_activities
                WHERE workspace_id = $1 AND created_at > $2
                """,
                workspace_id,
                since,
            )

            # Most active galleries
            top_galleries = await conn.fetch(
                """
                SELECT gallery_id, gallery_name, COUNT(*) as activity_count
                FROM workspace_activities
                WHERE workspace_id = $1 AND created_at > $2 AND gallery_id IS NOT NULL
                GROUP BY gallery_id, gallery_name
                ORDER BY activity_count DESC
                LIMIT 5
                """,
                workspace_id,
                since,
            )

            return {
                "total_activities": total or 0,
                "by_type": {row["activity_type"]: row["count"] for row in type_counts},
                "by_actor_type": {row["actor_type"]: row["count"] for row in actor_counts},
                "top_galleries": [
                    {
                        "gallery_id": str(row["gallery_id"]),
                        "gallery_name": row["gallery_name"],
                        "activity_count": row["activity_count"],
                    }
                    for row in top_galleries
                ],
                "period_days": days,
            }

    def _format_activity(self, row) -> dict:
        """Format a database row into activity response."""
        return {
            "activity_id": str(row["activity_id"]),
            "workspace_id": str(row["workspace_id"]),
            "activity_type": row["activity_type"],
            "actor": {
                "type": row["actor_type"],
                "user_id": str(row["actor_user_id"]) if row["actor_user_id"] else None,
                "visitor_id": str(row["actor_visitor_id"]) if row["actor_visitor_id"] else None,
                "name": row["actor_name"] or "Guest",
                "email": row["actor_email"],
                "avatar_url": row["actor_avatar_url"],
            },
            "target": {
                "type": row["target_type"],
                "id": str(row["target_id"]),
                "name": row["target_name"],
                "thumbnail_url": row["target_thumbnail_url"],
            },
            "gallery": {
                "id": str(row["gallery_id"]) if row["gallery_id"] else None,
                "name": row["gallery_name"],
            } if row["gallery_id"] else None,
            "description": row["description"],
            "metadata": row["metadata"] or {},
            "count": row["count"],
            "created_at": row["created_at"].isoformat(),
        }

    # =========================================================================
    # Cleanup
    # =========================================================================

    async def cleanup_old_activities(
        self,
        workspace_id: UUID,
        days_to_keep: int = 90,
    ) -> int:
        """Remove activities older than specified days.

        Args:
            workspace_id: Workspace for tenant isolation
            days_to_keep: Number of days of activity to retain

        Returns:
            Number of deleted records
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=days_to_keep)

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM workspace_activities
                WHERE workspace_id = $1 AND created_at < $2
                """,
                workspace_id,
                cutoff,
            )

            # Parse "DELETE X" to get count
            deleted = int(result.split()[-1]) if result else 0

            logger.info(
                f"Cleaned up {deleted} old activities",
                extra={"workspace_id": str(workspace_id), "days_kept": days_to_keep},
            )

            return deleted


# ---------------------------------------------------------------------------
# Convenience Functions for Recording Common Activities
# ---------------------------------------------------------------------------


async def record_gallery_view(
    workspace_id: UUID,
    gallery_id: UUID,
    gallery_name: str,
    visitor_id: Optional[UUID] = None,
    visitor_name: Optional[str] = None,
    visitor_email: Optional[str] = None,
) -> dict:
    """Record a gallery view activity."""
    service = get_workspace_activity_service()
    return await service.record_activity(
        workspace_id=workspace_id,
        activity_type="gallery_viewed",
        target_type="gallery",
        target_id=gallery_id,
        actor_visitor_id=visitor_id,
        actor_name=visitor_name or "Guest",
        actor_email=visitor_email,
        gallery_id=gallery_id,
        gallery_name=gallery_name,
    )


async def record_photo_download(
    workspace_id: UUID,
    gallery_id: UUID,
    gallery_name: str,
    asset_id: UUID,
    asset_name: Optional[str] = None,
    thumbnail_url: Optional[str] = None,
    visitor_id: Optional[UUID] = None,
    visitor_name: Optional[str] = None,
    count: int = 1,
) -> dict:
    """Record a photo download activity."""
    service = get_workspace_activity_service()
    activity_type = "photos_downloaded" if count > 1 else "photo_downloaded"
    return await service.record_activity(
        workspace_id=workspace_id,
        activity_type=activity_type,
        target_type="asset",
        target_id=asset_id,
        actor_visitor_id=visitor_id,
        actor_name=visitor_name or "Guest",
        target_name=asset_name,
        target_thumbnail_url=thumbnail_url,
        gallery_id=gallery_id,
        gallery_name=gallery_name,
        count=count,
    )


async def record_comment_added(
    workspace_id: UUID,
    gallery_id: UUID,
    gallery_name: str,
    comment_id: UUID,
    author_name: str,
    author_email: Optional[str] = None,
    user_id: Optional[UUID] = None,
    visitor_id: Optional[UUID] = None,
) -> dict:
    """Record a comment added activity."""
    service = get_workspace_activity_service()
    return await service.record_activity(
        workspace_id=workspace_id,
        activity_type="comment_added",
        target_type="comment",
        target_id=comment_id,
        actor_user_id=user_id,
        actor_visitor_id=visitor_id,
        actor_name=author_name,
        actor_email=author_email,
        gallery_id=gallery_id,
        gallery_name=gallery_name,
    )


async def record_favorite_toggle(
    workspace_id: UUID,
    gallery_id: UUID,
    gallery_name: str,
    asset_id: UUID,
    is_favorited: bool,
    visitor_id: Optional[UUID] = None,
    visitor_name: Optional[str] = None,
    thumbnail_url: Optional[str] = None,
) -> dict:
    """Record a favorite toggle activity."""
    service = get_workspace_activity_service()
    activity_type = "favorite_added" if is_favorited else "favorite_removed"
    return await service.record_activity(
        workspace_id=workspace_id,
        activity_type=activity_type,
        target_type="asset",
        target_id=asset_id,
        actor_visitor_id=visitor_id,
        actor_name=visitor_name or "Guest",
        target_thumbnail_url=thumbnail_url,
        gallery_id=gallery_id,
        gallery_name=gallery_name,
    )


async def record_selection_toggle(
    workspace_id: UUID,
    gallery_id: UUID,
    gallery_name: str,
    asset_id: UUID,
    is_selected: bool,
    visitor_id: Optional[UUID] = None,
    visitor_name: Optional[str] = None,
    thumbnail_url: Optional[str] = None,
) -> dict:
    """Record a selection toggle activity."""
    service = get_workspace_activity_service()
    activity_type = "selection_added" if is_selected else "selection_removed"
    return await service.record_activity(
        workspace_id=workspace_id,
        activity_type=activity_type,
        target_type="asset",
        target_id=asset_id,
        actor_visitor_id=visitor_id,
        actor_name=visitor_name or "Guest",
        target_thumbnail_url=thumbnail_url,
        gallery_id=gallery_id,
        gallery_name=gallery_name,
    )


async def record_upload_completed(
    workspace_id: UUID,
    gallery_id: UUID,
    gallery_name: str,
    user_id: UUID,
    user_name: str,
    photo_count: int,
) -> dict:
    """Record an upload completion activity."""
    service = get_workspace_activity_service()
    return await service.record_activity(
        workspace_id=workspace_id,
        activity_type="upload_completed",
        target_type="gallery",
        target_id=gallery_id,
        actor_user_id=user_id,
        actor_name=user_name,
        gallery_id=gallery_id,
        gallery_name=gallery_name,
        count=photo_count,
    )


async def record_visitor_registered(
    workspace_id: UUID,
    gallery_id: UUID,
    gallery_name: str,
    visitor_id: UUID,
    visitor_name: str,
    visitor_email: str,
) -> dict:
    """Record a visitor registration activity."""
    service = get_workspace_activity_service()
    return await service.record_activity(
        workspace_id=workspace_id,
        activity_type="visitor_registered",
        target_type="visitor",
        target_id=visitor_id,
        actor_visitor_id=visitor_id,
        actor_name=visitor_name,
        actor_email=visitor_email,
        gallery_id=gallery_id,
        gallery_name=gallery_name,
    )


async def record_gallery_published(
    workspace_id: UUID,
    gallery_id: UUID,
    gallery_name: str,
    user_id: UUID,
    user_name: str,
) -> dict:
    """Record a gallery publish activity."""
    service = get_workspace_activity_service()
    return await service.record_activity(
        workspace_id=workspace_id,
        activity_type="gallery_published",
        target_type="gallery",
        target_id=gallery_id,
        actor_user_id=user_id,
        actor_name=user_name,
        target_name=gallery_name,
        gallery_id=gallery_id,
        gallery_name=gallery_name,
    )


# ---------------------------------------------------------------------------
# Singleton Instance
# ---------------------------------------------------------------------------

_workspace_activity_service: Optional[WorkspaceActivityService] = None


def get_workspace_activity_service() -> WorkspaceActivityService:
    """Get singleton workspace activity service instance."""
    global _workspace_activity_service
    if _workspace_activity_service is None:
        _workspace_activity_service = WorkspaceActivityService()
    return _workspace_activity_service
