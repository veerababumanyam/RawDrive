"""
Invitation Sub-Event Service

Provides business logic for managing sub-events within digital invitations.
Sub-events allow invitations to contain multiple ceremonies or functions
(e.g., Mehndi, Sangeet, Wedding, Reception for an Indian wedding).

Feature: 016-save-the-date Phase 8
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from app.repositories.invitation_sub_event_repository import (
    get_invitation_sub_event_repository,
    InvitationSubEventRepository,
)
from app.models.invitation_sub_event import SubEvent

logger = logging.getLogger(__name__)


class InvitationSubEventService:
    """Service for managing invitation sub-events."""

    def __init__(self, repository: Optional[InvitationSubEventRepository] = None):
        self._repository = repository or get_invitation_sub_event_repository()

    async def create_sub_event(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        name: str,
        event_datetime: datetime,
        event_type: Optional[str] = None,
        event_end_datetime: Optional[datetime] = None,
        event_timezone: str = "Asia/Kolkata",
        venue_name: Optional[str] = None,
        venue_address: Optional[str] = None,
        venue_city: Optional[str] = None,
        venue_map_url: Optional[str] = None,
        display_order: Optional[int] = None,
        show_countdown: bool = True,
        enable_individual_rsvp: bool = False,
        description: Optional[str] = None,
    ) -> SubEvent:
        """Create a new sub-event for an invitation."""
        # If no display_order, get the next order
        if display_order is None:
            existing = await self._repository.list_sub_events(workspace_id, invitation_id)
            display_order = len(existing)

        row = await self._repository.create_sub_event(
            workspace_id=workspace_id,
            invitation_id=invitation_id,
            name=name,
            event_datetime=event_datetime,
            event_type=event_type,
            event_end_datetime=event_end_datetime,
            event_timezone=event_timezone,
            venue_name=venue_name,
            venue_address=venue_address,
            venue_city=venue_city,
            venue_map_url=venue_map_url,
            display_order=display_order,
            show_countdown=show_countdown,
            enable_individual_rsvp=enable_individual_rsvp,
            description=description,
        )
        logger.info(
            f"Created sub-event '{name}' for invitation {invitation_id}"
        )
        return SubEvent(**row)

    async def list_sub_events(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
    ) -> list[SubEvent]:
        """List all sub-events for an invitation, ordered by display_order."""
        rows = await self._repository.list_sub_events(workspace_id, invitation_id)
        return [SubEvent(**row) for row in rows]

    async def get_sub_event(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        sub_event_id: UUID,
    ) -> Optional[SubEvent]:
        """Get a specific sub-event."""
        row = await self._repository.get_sub_event(
            workspace_id, invitation_id, sub_event_id
        )
        return SubEvent(**row) if row else None

    async def update_sub_event(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        sub_event_id: UUID,
        **updates: Any,
    ) -> Optional[SubEvent]:
        """Update a sub-event."""
        # Filter out None values and non-updatable fields
        allowed_fields = {
            "name", "event_type", "event_datetime", "event_end_datetime",
            "event_timezone", "description", "venue_name", "venue_address",
            "venue_city", "venue_map_url", "display_order", "show_countdown",
            "enable_individual_rsvp",
        }
        filtered_updates = {
            k: v for k, v in updates.items()
            if k in allowed_fields and v is not None
        }

        if not filtered_updates:
            return await self.get_sub_event(workspace_id, invitation_id, sub_event_id)

        row = await self._repository.update_sub_event(
            workspace_id, invitation_id, sub_event_id, **filtered_updates
        )
        if row:
            logger.info(f"Updated sub-event {sub_event_id}")
            return SubEvent(**row)
        return None

    async def delete_sub_event(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        sub_event_id: UUID,
    ) -> bool:
        """Delete a sub-event."""
        deleted = await self._repository.delete_sub_event(
            workspace_id, invitation_id, sub_event_id
        )
        if deleted:
            logger.info(f"Deleted sub-event {sub_event_id}")
        return deleted

    async def reorder_sub_events(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        sub_event_ids: list[UUID],
    ) -> list[SubEvent]:
        """Reorder sub-events by updating their display_order."""
        results = []
        for idx, sub_event_id in enumerate(sub_event_ids):
            row = await self._repository.update_sub_event(
                workspace_id, invitation_id, sub_event_id, display_order=idx
            )
            if row:
                results.append(SubEvent(**row))
        
        logger.info(
            f"Reordered {len(results)} sub-events for invitation {invitation_id}"
        )
        return results


# Singleton instance
_invitation_sub_event_service: InvitationSubEventService | None = None


def get_invitation_sub_event_service() -> InvitationSubEventService:
    """Get singleton instance."""
    global _invitation_sub_event_service
    if _invitation_sub_event_service is None:
        _invitation_sub_event_service = InvitationSubEventService()
    return _invitation_sub_event_service
