"""ActivityService: Manages client activity timeline and tracking.

Handles recording and retrieving client interactions with:
- Activity recording with type, entity, description, and metadata
- Activity timeline retrieval with pagination and filtering
- Support for various activity types (gallery views, selections, payments, etc.)
- Automatic activity aggregation for related events

All operations are workspace-scoped for multi-tenant data isolation.
"""

from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from typing import Any, Literal, Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool
from app.services.client_exceptions import (
    ActivityNotFoundError,
    ClientNotFoundError,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Valid activity types per the technical specification
VALID_ACTIVITY_TYPES = {
    "gallery_linked",
    "gallery_unlinked",
    "gallery_viewed",
    "gallery_role_changed",
    "selection_made",
    "favorite_added",
    "favorite_removed",
    "comment_added",
    "payment_received",
    "communication_sent",
    "note_added",
    "status_changed",
    "avatar_updated",
    "avatar_removed",
    "profile_updated",
    "contact_added",
    "contact_updated",
    "address_added",
    "address_updated",
    "tag_added",
    "tag_removed",
}

# Valid related entity types
VALID_ENTITY_TYPES = {
    "gallery",
    "asset",
    "payment",
    "communication",
    "contact",
    "address",
    "tag",
    "note",
}

ActivityType = Literal[
    "gallery_linked",
    "gallery_unlinked",
    "gallery_viewed",
    "gallery_role_changed",
    "selection_made",
    "favorite_added",
    "favorite_removed",
    "comment_added",
    "payment_received",
    "communication_sent",
    "note_added",
    "status_changed",
    "avatar_updated",
    "avatar_removed",
    "profile_updated",
    "contact_added",
    "contact_updated",
    "address_added",
    "address_updated",
    "tag_added",
    "tag_removed",
]

EntityType = Literal[
    "gallery",
    "asset",
    "payment",
    "communication",
    "contact",
    "address",
    "tag",
    "note",
]


# ---------------------------------------------------------------------------
# ActivityService
# ---------------------------------------------------------------------------


class ActivityService:
    """Service for managing client activity timeline.

    Provides methods to record activities and retrieve activity timeline
    with pagination and filtering.
    """

    async def record_activity(
        self,
        workspace_id: UUID,
        client_id: UUID,
        activity_type: str,
        description: Optional[str] = None,
        related_entity_type: Optional[str] = None,
        related_entity_id: Optional[UUID] = None,
        metadata: Optional[dict[str, Any]] = None,
        created_by_user_id: Optional[UUID] = None,
    ) -> dict:
        """Record a client activity.

        Creates an activity record in the client's timeline for tracking
        interactions and events.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client the activity belongs to
            activity_type: Type of activity (see VALID_ACTIVITY_TYPES)
            description: Human-readable description of the activity
            related_entity_type: Type of related entity (gallery, asset, etc.)
            related_entity_id: ID of the related entity
            metadata: Additional activity-specific data as JSON
            created_by_user_id: User who triggered the activity (null for client actions)

        Returns:
            Created activity record with activity_id and created_at

        Raises:
            ClientNotFoundError: If client doesn't exist
            ValueError: If activity_type is invalid
        """
        # Validate activity type
        if activity_type not in VALID_ACTIVITY_TYPES:
            logger.warning(
                f"Unknown activity type: {activity_type}, recording anyway",
                extra={"workspace_id": str(workspace_id), "client_id": str(client_id)},
            )

        # Validate entity type if provided
        if related_entity_type and related_entity_type not in VALID_ENTITY_TYPES:
            logger.warning(
                f"Unknown entity type: {related_entity_type}",
                extra={"workspace_id": str(workspace_id)},
            )

        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify client exists
            client_exists = await conn.fetchval(
                """
                SELECT 1 FROM clients
                WHERE workspace_id = $1 AND client_id = $2
                """,
                workspace_id,
                client_id,
            )
            if not client_exists:
                raise ClientNotFoundError(client_id)

            # Create activity record
            activity = await conn.fetchrow(
                """
                INSERT INTO client_activities (
                    workspace_id, client_id, activity_type,
                    related_entity_type, related_entity_id,
                    description, metadata, created_by_user_id
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING activity_id, created_at
                """,
                workspace_id,
                client_id,
                activity_type,
                related_entity_type,
                related_entity_id,
                description,
                metadata,
                created_by_user_id,
            )

            logger.info(
                "Activity recorded",
                extra={
                    "workspace_id": str(workspace_id),
                    "client_id": str(client_id),
                    "activity_id": str(activity["activity_id"]),
                    "activity_type": activity_type,
                },
            )

            return {
                "activity_id": activity["activity_id"],
                "activity_type": activity_type,
                "description": description,
                "related_entity_type": related_entity_type,
                "related_entity_id": related_entity_id,
                "metadata": metadata,
                "created_by_user_id": created_by_user_id,
                "created_at": activity["created_at"],
            }

    async def get_activity_timeline(
        self,
        workspace_id: UUID,
        client_id: UUID,
        page: int = 1,
        limit: int = 20,
        activity_type: Optional[str] = None,
        entity_type: Optional[str] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
    ) -> dict:
        """Get client activity timeline with pagination and filtering.

        Returns activities in reverse chronological order (newest first).

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to get activities for
            page: Page number (1-indexed)
            limit: Items per page (max 100)
            activity_type: Filter by specific activity type
            entity_type: Filter by related entity type
            date_from: Filter activities after this date
            date_to: Filter activities before this date

        Returns:
            Paginated list of activities with metadata

        Raises:
            ClientNotFoundError: If client doesn't exist
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify client exists
            client_exists = await conn.fetchval(
                """
                SELECT 1 FROM clients
                WHERE workspace_id = $1 AND client_id = $2
                """,
                workspace_id,
                client_id,
            )
            if not client_exists:
                raise ClientNotFoundError(client_id)

            # Validate and sanitize inputs
            limit = min(max(1, limit), 100)
            page = max(1, page)
            offset = (page - 1) * limit

            # Build dynamic query with filters
            where_clauses = ["workspace_id = $1", "client_id = $2"]
            params: list[Any] = [workspace_id, client_id]
            param_idx = 3

            if activity_type:
                where_clauses.append(f"activity_type = ${param_idx}")
                params.append(activity_type)
                param_idx += 1

            if entity_type:
                where_clauses.append(f"related_entity_type = ${param_idx}")
                params.append(entity_type)
                param_idx += 1

            if date_from:
                where_clauses.append(f"created_at >= ${param_idx}")
                params.append(date_from)
                param_idx += 1

            if date_to:
                where_clauses.append(f"created_at <= ${param_idx}")
                params.append(date_to)
                param_idx += 1

            where_sql = " AND ".join(where_clauses)

            # Get total count
            total = await conn.fetchval(
                f"SELECT COUNT(*) FROM client_activities WHERE {where_sql}",
                *params,
            )

            # Get activities
            activities = await conn.fetch(
                f"""
                SELECT
                    activity_id, activity_type,
                    related_entity_type, related_entity_id,
                    description, metadata,
                    created_by_user_id, created_at
                FROM client_activities
                WHERE {where_sql}
                ORDER BY created_at DESC
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
                """,
                *params,
                limit,
                offset,
            )

            return {
                "activities": [
                    {
                        "activity_id": a["activity_id"],
                        "activity_type": a["activity_type"],
                        "related_entity_type": a["related_entity_type"],
                        "related_entity_id": a["related_entity_id"],
                        "description": a["description"],
                        "metadata": a["metadata"],
                        "created_by_user_id": a["created_by_user_id"],
                        "created_at": a["created_at"],
                    }
                    for a in activities
                ],
                "meta": {
                    "page": page,
                    "limit": limit,
                    "total": total,
                    "total_pages": math.ceil(total / limit) if total > 0 else 0,
                },
            }

    async def get_recent_activities(
        self,
        workspace_id: UUID,
        client_id: UUID,
        limit: int = 5,
        activity_types: Optional[list[str]] = None,
    ) -> list[dict]:
        """Get most recent activities for a client.

        Convenience method for showing recent activity on profile cards.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to get activities for
            limit: Maximum number of activities to return
            activity_types: Optional list of activity types to filter

        Returns:
            List of recent activities
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            limit = min(max(1, limit), 20)

            if activity_types:
                activities = await conn.fetch(
                    """
                    SELECT
                        activity_id, activity_type,
                        related_entity_type, related_entity_id,
                        description, created_at
                    FROM client_activities
                    WHERE workspace_id = $1
                      AND client_id = $2
                      AND activity_type = ANY($3::text[])
                    ORDER BY created_at DESC
                    LIMIT $4
                    """,
                    workspace_id,
                    client_id,
                    activity_types,
                    limit,
                )
            else:
                activities = await conn.fetch(
                    """
                    SELECT
                        activity_id, activity_type,
                        related_entity_type, related_entity_id,
                        description, created_at
                    FROM client_activities
                    WHERE workspace_id = $1 AND client_id = $2
                    ORDER BY created_at DESC
                    LIMIT $3
                    """,
                    workspace_id,
                    client_id,
                    limit,
                )

            return [
                {
                    "activity_id": a["activity_id"],
                    "activity_type": a["activity_type"],
                    "related_entity_type": a["related_entity_type"],
                    "related_entity_id": a["related_entity_id"],
                    "description": a["description"],
                    "created_at": a["created_at"],
                }
                for a in activities
            ]

    async def get_activity_summary(
        self,
        workspace_id: UUID,
        client_id: UUID,
    ) -> dict:
        """Get activity summary counts for a client.

        Returns counts grouped by activity type for dashboard display.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to get summary for

        Returns:
            Dictionary of activity type counts
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            counts = await conn.fetch(
                """
                SELECT activity_type, COUNT(*) as count
                FROM client_activities
                WHERE workspace_id = $1 AND client_id = $2
                GROUP BY activity_type
                ORDER BY count DESC
                """,
                workspace_id,
                client_id,
            )

            total = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM client_activities
                WHERE workspace_id = $1 AND client_id = $2
                """,
                workspace_id,
                client_id,
            )

            last_activity = await conn.fetchval(
                """
                SELECT created_at
                FROM client_activities
                WHERE workspace_id = $1 AND client_id = $2
                ORDER BY created_at DESC
                LIMIT 1
                """,
                workspace_id,
                client_id,
            )

            return {
                "total_activities": total or 0,
                "last_activity_at": last_activity,
                "by_type": {c["activity_type"] or "unknown": c["count"] for c in counts},
            }

    async def delete_activity(
        self,
        workspace_id: UUID,
        client_id: UUID,
        activity_id: UUID,
    ) -> dict:
        """Delete a specific activity record.

        Used for removing manual notes or correcting errors.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client the activity belongs to
            activity_id: Activity to delete

        Returns:
            Success message

        Raises:
            ValueError: If activity not found
        """
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM client_activities
                WHERE workspace_id = $1 AND client_id = $2 AND activity_id = $3
                """,
                workspace_id,
                client_id,
                activity_id,
            )

            if result == "DELETE 0":
                raise ActivityNotFoundError(activity_id)

            logger.info(
                "Activity deleted",
                extra={
                    "workspace_id": str(workspace_id),
                    "client_id": str(client_id),
                    "activity_id": str(activity_id),
                },
            )

            return {"message": "Activity deleted successfully"}

    async def add_note(
        self,
        workspace_id: UUID,
        client_id: UUID,
        note: str,
        user_id: UUID,
    ) -> dict:
        """Add a manual note to client timeline.

        Convenience method for photographers to add notes.

        Args:
            workspace_id: Workspace for tenant isolation
            client_id: Client to add note to
            note: Note content
            user_id: User adding the note

        Returns:
            Created activity record
        """
        return await self.record_activity(
            workspace_id=workspace_id,
            client_id=client_id,
            activity_type="note_added",
            description=note,
            created_by_user_id=user_id,
        )


# ---------------------------------------------------------------------------
# Singleton Instance
# ---------------------------------------------------------------------------

_activity_service: Optional[ActivityService] = None


def get_activity_service() -> ActivityService:
    """Get singleton activity service instance."""
    global _activity_service
    if _activity_service is None:
        _activity_service = ActivityService()
    return _activity_service
