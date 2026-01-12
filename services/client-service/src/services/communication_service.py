"""
Business logic for client communication management.

Provides:
- Communication logging (email, calls, SMS, meetings)
- Follow-up tracking and reminders
- Overdue follow-up detection
- Communication caching with short TTL
"""

from datetime import datetime
from typing import List, Dict, Any, Optional
import hashlib
import json

from src.repositories.communication_repository import CommunicationRepository
from src.cache.redis_client import redis_client
from src.config import get_settings
from src.log_config import get_logger

settings = get_settings()
logger = get_logger(__name__)


class CommunicationService:
    """Service for managing client communications with caching."""

    def __init__(self):
        self.repository = CommunicationRepository()
        self.cache_ttl = settings.CACHE_TTL_CLIENT_DETAILS  # 2 minutes

    async def create_communication(
        self,
        workspace_id: str,
        client_id: str,
        communication_type: str,
        direction: str,
        subject: Optional[str] = None,
        body: Optional[str] = None,
        related_gallery_id: Optional[str] = None,
        duration_minutes: Optional[int] = None,
        follow_up_required: bool = False,
        follow_up_date: Optional[datetime] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Create a new communication record.

        Args:
            workspace_id: Workspace ID
            client_id: Client ID
            communication_type: Type (email, call, sms, meeting, video_call)
            direction: Direction (inbound/outbound)
            subject: Optional subject line
            body: Optional content
            related_gallery_id: Optional related gallery
            duration_minutes: Optional duration
            follow_up_required: Whether follow-up is needed
            follow_up_date: When to follow up
            metadata: Optional additional data

        Returns:
            Created communication
        """
        communication = await self.repository.create(
            workspace_id=workspace_id,
            client_id=client_id,
            communication_type=communication_type,
            direction=direction,
            subject=subject,
            body=body,
            related_gallery_id=related_gallery_id,
            duration_minutes=duration_minutes,
            follow_up_required=follow_up_required,
            follow_up_date=follow_up_date,
            metadata=metadata,
        )

        # Invalidate communication list caches for this client
        await self._invalidate_communication_caches(workspace_id, client_id)

        # Also record as activity
        from src.services.activity_service import get_activity_service

        activity_service = get_activity_service()
        await activity_service.record_system_event(
            workspace_id=workspace_id,
            client_id=client_id,
            event_type=f"communication_{direction}",
            title=f"{communication_type.capitalize()} {direction}",
            description=subject or f"{communication_type} communication",
            related_entity_type="gallery" if related_gallery_id else None,
            related_entity_id=related_gallery_id,
            metadata={
                "communication_id": communication["communication_id"],
                "communication_type": communication_type,
                "direction": direction,
            },
        )

        logger.info(
            "Communication created",
            extra={
                "communication_id": communication["communication_id"],
                "client_id": client_id,
                "workspace_id": workspace_id,
                "communication_type": communication_type,
                "direction": direction,
            },
        )

        return communication

    async def get_communication(
        self, workspace_id: str, communication_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get communication by ID.

        Args:
            workspace_id: Workspace ID
            communication_id: Communication ID

        Returns:
            Communication or None
        """
        return await self.repository.get_by_id(workspace_id, communication_id)

    async def list_communications(
        self,
        workspace_id: str,
        client_id: str,
        communication_type: Optional[str] = None,
        direction: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        related_gallery_id: Optional[str] = None,
        follow_up_required: Optional[bool] = None,
        follow_up_overdue: Optional[bool] = None,
        page: int = 1,
        limit: int = 50,
        sort_by: str = "created_at",
        sort_order: str = "desc",
    ) -> Dict[str, Any]:
        """
        List communications for a client with pagination and caching.

        Args:
            workspace_id: Workspace ID
            client_id: Client ID
            communication_type: Optional type filter
            direction: Optional direction filter
            start_date: Optional start date filter
            end_date: Optional end date filter
            related_gallery_id: Optional gallery filter
            follow_up_required: Optional follow-up status filter
            follow_up_overdue: Optional overdue follow-up filter
            page: Page number
            limit: Items per page
            sort_by: Sort field
            sort_order: Sort order

        Returns:
            Paginated communication list with total count
        """
        offset = (page - 1) * limit

        # Generate cache key from all parameters
        cache_key = self._generate_cache_key(
            workspace_id=workspace_id,
            client_id=client_id,
            communication_type=communication_type,
            direction=direction,
            start_date=start_date,
            end_date=end_date,
            related_gallery_id=related_gallery_id,
            follow_up_required=follow_up_required,
            follow_up_overdue=follow_up_overdue,
            page=page,
            limit=limit,
            sort_by=sort_by,
            sort_order=sort_order,
        )

        # Try cache first
        cached_data = await redis_client.get_json(cache_key)
        if cached_data:
            logger.debug(
                "Communication list cache hit",
                extra={"client_id": client_id, "page": page},
            )
            return cached_data

        # Fetch from database
        communications = await self.repository.list_by_client(
            workspace_id=workspace_id,
            client_id=client_id,
            communication_type=communication_type,
            direction=direction,
            start_date=start_date,
            end_date=end_date,
            related_gallery_id=related_gallery_id,
            follow_up_required=follow_up_required,
            follow_up_overdue=follow_up_overdue,
            limit=limit,
            offset=offset,
            sort_by=sort_by,
            sort_order=sort_order,
        )

        total = await self.repository.count_by_client(
            workspace_id=workspace_id,
            client_id=client_id,
            communication_type=communication_type,
            direction=direction,
            start_date=start_date,
            end_date=end_date,
            follow_up_required=follow_up_required,
            follow_up_overdue=follow_up_overdue,
        )

        result = {
            "communications": communications,
            "total": total,
            "page": page,
            "limit": limit,
        }

        # Cache with short TTL
        await redis_client.set_json(cache_key, result, ex=self.cache_ttl)

        logger.debug(
            "Communications listed",
            extra={"client_id": client_id, "total": total, "page": page},
        )

        return result

    async def update_communication(
        self,
        workspace_id: str,
        communication_id: str,
        subject: Optional[str] = None,
        body: Optional[str] = None,
        duration_minutes: Optional[int] = None,
        follow_up_required: Optional[bool] = None,
        follow_up_date: Optional[datetime] = None,
        follow_up_completed_at: Optional[datetime] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Update a communication record.

        Args:
            workspace_id: Workspace ID
            communication_id: Communication ID
            subject: Optional new subject
            body: Optional new body
            duration_minutes: Optional new duration
            follow_up_required: Optional new follow-up required flag
            follow_up_date: Optional new follow-up date
            follow_up_completed_at: Optional follow-up completion timestamp
            metadata: Optional new metadata

        Returns:
            Updated communication or None
        """
        # Get communication to find client_id for cache invalidation
        existing = await self.repository.get_by_id(workspace_id, communication_id)
        if not existing:
            return None

        communication = await self.repository.update(
            workspace_id=workspace_id,
            communication_id=communication_id,
            subject=subject,
            body=body,
            duration_minutes=duration_minutes,
            follow_up_required=follow_up_required,
            follow_up_date=follow_up_date,
            follow_up_completed_at=follow_up_completed_at,
            metadata=metadata,
        )

        if communication:
            # Invalidate communication list caches
            await self._invalidate_communication_caches(
                workspace_id, existing["client_id"]
            )

            logger.info(
                "Communication updated",
                extra={
                    "communication_id": communication_id,
                    "client_id": existing["client_id"],
                    "workspace_id": workspace_id,
                },
            )

        return communication

    async def delete_communication(
        self, workspace_id: str, communication_id: str
    ) -> bool:
        """
        Delete a communication record.

        Args:
            workspace_id: Workspace ID
            communication_id: Communication ID

        Returns:
            True if deleted, False otherwise
        """
        # Get communication to find client_id for cache invalidation
        existing = await self.repository.get_by_id(workspace_id, communication_id)
        if not existing:
            return False

        deleted = await self.repository.delete(workspace_id, communication_id)

        if deleted:
            # Invalidate communication list caches
            await self._invalidate_communication_caches(
                workspace_id, existing["client_id"]
            )

            logger.info(
                "Communication deleted",
                extra={
                    "communication_id": communication_id,
                    "client_id": existing["client_id"],
                    "workspace_id": workspace_id,
                },
            )

        return deleted

    async def complete_follow_up(
        self, workspace_id: str, communication_id: str, notes: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Mark a follow-up as completed.

        Args:
            workspace_id: Workspace ID
            communication_id: Communication ID
            notes: Optional completion notes

        Returns:
            Updated communication or None
        """
        # Get communication to find client_id
        existing = await self.repository.get_by_id(workspace_id, communication_id)
        if not existing:
            return None

        communication = await self.repository.complete_follow_up(
            workspace_id=workspace_id,
            communication_id=communication_id,
            notes=notes,
        )

        if communication:
            # Invalidate communication list caches
            await self._invalidate_communication_caches(
                workspace_id, existing["client_id"]
            )

            # Record activity
            from src.services.activity_service import get_activity_service

            activity_service = get_activity_service()
            await activity_service.record_system_event(
                workspace_id=workspace_id,
                client_id=existing["client_id"],
                event_type="follow_up_completed",
                title="Follow-up completed",
                description=notes or "Follow-up task completed",
                metadata={"communication_id": communication_id},
            )

            logger.info(
                "Follow-up completed",
                extra={
                    "communication_id": communication_id,
                    "client_id": existing["client_id"],
                    "workspace_id": workspace_id,
                },
            )

        return communication

    async def get_overdue_follow_ups(
        self, workspace_id: str, client_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get all overdue follow-ups for a workspace or specific client.

        Args:
            workspace_id: Workspace ID
            client_id: Optional client ID to filter

        Returns:
            List of overdue communications
        """
        return await self.repository.get_overdue_follow_ups(workspace_id, client_id)

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

        return f"client:communications:{kwargs['client_id']}:{params_hash}"

    async def _invalidate_communication_caches(
        self, workspace_id: str, client_id: str
    ) -> None:
        """
        Invalidate all communication caches for a client.

        Args:
            workspace_id: Workspace ID
            client_id: Client ID
        """
        # Delete all communication list caches for this client
        pattern = f"client:communications:{client_id}:*"
        await redis_client.delete_pattern(pattern)

        # Also invalidate client detail cache
        await redis_client.delete(f"client:full:{client_id}")

        logger.debug(
            "Communication caches invalidated",
            extra={"client_id": client_id, "workspace_id": workspace_id},
        )


# Singleton instance
_communication_service: Optional[CommunicationService] = None


def get_communication_service() -> CommunicationService:
    """Get or create CommunicationService singleton instance."""
    global _communication_service
    if _communication_service is None:
        _communication_service = CommunicationService()
    return _communication_service
