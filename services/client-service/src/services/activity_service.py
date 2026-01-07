"""
Business logic for client activity timeline.

Provides:
- Manual activity management (notes, calls, meetings)
- System activity auto-tracking (status changes, tag additions)
- Unified timeline from multiple sources
- Activity caching with short TTL (real-time updates)
"""

from datetime import datetime
from typing import List, Dict, Any, Optional
import hashlib
import json

from src.repositories.activity_repository import ActivityRepository
from src.cache.redis_client import redis_client
from src.config import get_settings
from src.log_config import get_logger

settings = get_settings()
logger = get_logger(__name__)


class ActivityService:
    """Service for managing client activities with caching."""

    def __init__(self):
        self.repository = ActivityRepository()
        self.cache_ttl = settings.CACHE_TTL_ACTIVITY_TIMELINE  # 30 seconds

    async def create_activity(
        self,
        workspace_id: str,
        client_id: str,
        activity_type: str,
        title: str,
        description: Optional[str] = None,
        related_entity_type: Optional[str] = None,
        related_entity_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Create a manual activity.

        Args:
            workspace_id: Workspace ID
            client_id: Client ID
            activity_type: Activity type (note_added, call_made, etc.)
            title: Activity title
            description: Optional description
            related_entity_type: Optional related entity type
            related_entity_id: Optional related entity ID
            metadata: Optional additional data

        Returns:
            Created activity
        """
        activity = await self.repository.create(
            workspace_id=workspace_id,
            client_id=client_id,
            activity_type=activity_type,
            title=title,
            description=description,
            related_entity_type=related_entity_type,
            related_entity_id=related_entity_id,
            metadata=metadata,
        )

        # Invalidate activity list caches for this client
        await self._invalidate_activity_caches(workspace_id, client_id)

        logger.info(
            "Activity created",
            extra={
                "activity_id": activity["activity_id"],
                "client_id": client_id,
                "workspace_id": workspace_id,
                "activity_type": activity_type,
            },
        )

        return activity

    async def get_activity(
        self, workspace_id: str, activity_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get activity by ID.

        Args:
            workspace_id: Workspace ID
            activity_id: Activity ID

        Returns:
            Activity or None
        """
        return await self.repository.get_by_id(workspace_id, activity_id)

    async def list_activities(
        self,
        workspace_id: str,
        client_id: str,
        activity_type: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        related_entity_type: Optional[str] = None,
        related_entity_id: Optional[str] = None,
        page: int = 1,
        limit: int = 50,
        sort_by: str = "created_at",
        sort_order: str = "desc",
    ) -> Dict[str, Any]:
        """
        List activities for a client with pagination and caching.

        Args:
            workspace_id: Workspace ID
            client_id: Client ID
            activity_type: Optional activity type filter
            start_date: Optional start date filter
            end_date: Optional end date filter
            related_entity_type: Optional related entity type filter
            related_entity_id: Optional related entity ID filter
            page: Page number
            limit: Items per page
            sort_by: Sort field
            sort_order: Sort order

        Returns:
            Paginated activity list with total count
        """
        offset = (page - 1) * limit

        # Generate cache key from all parameters
        cache_key = self._generate_cache_key(
            workspace_id=workspace_id,
            client_id=client_id,
            activity_type=activity_type,
            start_date=start_date,
            end_date=end_date,
            related_entity_type=related_entity_type,
            related_entity_id=related_entity_id,
            page=page,
            limit=limit,
            sort_by=sort_by,
            sort_order=sort_order,
        )

        # Try cache first
        cached_data = await redis_client.get_json(cache_key)
        if cached_data:
            logger.debug(
                "Activity list cache hit",
                extra={"client_id": client_id, "page": page},
            )
            return cached_data

        # Fetch from database
        activities = await self.repository.list_by_client(
            workspace_id=workspace_id,
            client_id=client_id,
            activity_type=activity_type,
            start_date=start_date,
            end_date=end_date,
            related_entity_type=related_entity_type,
            related_entity_id=related_entity_id,
            limit=limit,
            offset=offset,
            sort_by=sort_by,
            sort_order=sort_order,
        )

        total = await self.repository.count_by_client(
            workspace_id=workspace_id,
            client_id=client_id,
            activity_type=activity_type,
            start_date=start_date,
            end_date=end_date,
        )

        result = {
            "activities": activities,
            "total": total,
            "page": page,
            "limit": limit,
        }

        # Cache with short TTL for real-time updates
        await redis_client.set_json(cache_key, result, ttl=self.cache_ttl)

        logger.debug(
            "Activity list fetched",
            extra={"client_id": client_id, "total": total, "page": page},
        )

        return result

    async def update_activity(
        self,
        workspace_id: str,
        activity_id: str,
        title: Optional[str] = None,
        description: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Update a manual activity.

        Args:
            workspace_id: Workspace ID
            activity_id: Activity ID
            title: Optional new title
            description: Optional new description
            metadata: Optional new metadata

        Returns:
            Updated activity or None
        """
        # Get activity to find client_id for cache invalidation
        existing = await self.repository.get_by_id(workspace_id, activity_id)
        if not existing:
            return None

        activity = await self.repository.update(
            workspace_id=workspace_id,
            activity_id=activity_id,
            title=title,
            description=description,
            metadata=metadata,
        )

        if activity:
            # Invalidate activity list caches
            await self._invalidate_activity_caches(
                workspace_id, existing["client_id"]
            )

            logger.info(
                "Activity updated",
                extra={
                    "activity_id": activity_id,
                    "client_id": existing["client_id"],
                    "workspace_id": workspace_id,
                },
            )

        return activity

    async def delete_activity(self, workspace_id: str, activity_id: str) -> bool:
        """
        Delete a manual activity.

        Args:
            workspace_id: Workspace ID
            activity_id: Activity ID

        Returns:
            True if deleted, False otherwise
        """
        # Get activity to find client_id for cache invalidation
        existing = await self.repository.get_by_id(workspace_id, activity_id)
        if not existing:
            return False

        deleted = await self.repository.delete(workspace_id, activity_id)

        if deleted:
            # Invalidate activity list caches
            await self._invalidate_activity_caches(
                workspace_id, existing["client_id"]
            )

            logger.info(
                "Activity deleted",
                extra={
                    "activity_id": activity_id,
                    "client_id": existing["client_id"],
                    "workspace_id": workspace_id,
                },
            )

        return deleted

    async def create_note(
        self,
        workspace_id: str,
        client_id: str,
        title: str,
        description: Optional[str] = None,
        related_gallery_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create a quick note (simplified activity creation).

        Args:
            workspace_id: Workspace ID
            client_id: Client ID
            title: Note title
            description: Optional note content
            related_gallery_id: Optional related gallery

        Returns:
            Created activity
        """
        return await self.create_activity(
            workspace_id=workspace_id,
            client_id=client_id,
            activity_type="note_added",
            title=title,
            description=description,
            related_entity_type="gallery" if related_gallery_id else None,
            related_entity_id=related_gallery_id,
        )

    async def record_system_event(
        self,
        workspace_id: str,
        client_id: str,
        event_type: str,
        title: str,
        description: Optional[str] = None,
        related_entity_type: Optional[str] = None,
        related_entity_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Record a system event in analytics_events.

        This is called automatically when system actions occur:
        - status_changed: Client status updated
        - tag_added: Tag assigned to client
        - tag_removed: Tag unassigned from client
        - gallery_linked: Gallery linked to client
        - gallery_unlinked: Gallery unlinked from client

        Args:
            workspace_id: Workspace ID
            client_id: Client ID
            event_type: Event type
            title: Event title
            description: Optional description
            related_entity_type: Optional related entity type
            related_entity_id: Optional related entity ID
            metadata: Optional event properties

        Returns:
            Created analytics event
        """
        event = await self.repository.record_system_activity(
            workspace_id=workspace_id,
            client_id=client_id,
            event_type=event_type,
            title=title,
            description=description,
            related_entity_type=related_entity_type,
            related_entity_id=related_entity_id,
            metadata=metadata,
        )

        # Invalidate activity list caches
        await self._invalidate_activity_caches(workspace_id, client_id)

        logger.info(
            "System event recorded",
            extra={
                "event_id": event["event_id"],
                "client_id": client_id,
                "workspace_id": workspace_id,
                "event_type": event_type,
            },
        )

        return event

    def _generate_cache_key(self, **kwargs) -> str:
        """
        Generate cache key from parameters.

        Args:
            **kwargs: All parameters

        Returns:
            Cache key string
        """
        # Convert datetime objects to ISO strings for JSON serialization
        serializable_kwargs = {}
        for key, value in kwargs.items():
            if isinstance(value, datetime):
                serializable_kwargs[key] = value.isoformat()
            else:
                serializable_kwargs[key] = value

        # Create deterministic JSON string
        params_str = json.dumps(serializable_kwargs, sort_keys=True)
        params_hash = hashlib.md5(params_str.encode()).hexdigest()[:8]

        return f"client:activities:{kwargs['client_id']}:{params_hash}"

    async def _invalidate_activity_caches(
        self, workspace_id: str, client_id: str
    ) -> None:
        """
        Invalidate all activity caches for a client.

        Args:
            workspace_id: Workspace ID
            client_id: Client ID
        """
        # Delete all activity list caches for this client
        pattern = f"client:activities:{client_id}:*"
        await redis_client.delete_pattern(pattern)

        # Also invalidate client detail cache (includes activity count)
        await redis_client.delete(f"client:full:{client_id}")

        logger.debug(
            "Activity caches invalidated",
            extra={"client_id": client_id, "workspace_id": workspace_id},
        )


# Singleton instance
_activity_service: Optional[ActivityService] = None


def get_activity_service() -> ActivityService:
    """Get or create ActivityService singleton instance."""
    global _activity_service
    if _activity_service is None:
        _activity_service = ActivityService()
    return _activity_service
