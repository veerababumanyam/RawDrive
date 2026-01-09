"""Event Types API endpoints.

This module provides API endpoints for retrieving the notification event
type catalog. The catalog includes all supported event types with their
metadata including categories, channels, priorities, and payload schemas.

Feature: Notification Preferences Feature
"""

from __future__ import annotations

from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from src.middleware.auth import JWTPayload, get_current_user
from src.events.catalog import (
    EVENT_CATALOG,
    EventDefinition,
    EventType,
    get_events_by_category,
    get_transactional_events,
    get_digestable_events,
)
from src.schemas.notification import (
    NotificationCategory,
    NotificationChannel,
    NotificationPriority,
)


# =============================================================================
# RESPONSE SCHEMAS
# =============================================================================


class EventTypeResponse(BaseModel):
    """Response schema for a single event type."""

    event_type: str = Field(description="Event type identifier (e.g., 'gallery.published')")
    name: str = Field(description="Human-readable name")
    description: str = Field(description="Description of when this event triggers")
    category: NotificationCategory = Field(description="Notification category for preference matching")
    default_channel: NotificationChannel = Field(description="Default delivery channel")
    default_priority: NotificationPriority = Field(description="Default processing priority")
    is_transactional: bool = Field(description="Whether this bypasses user preferences")
    supports_digest: bool = Field(description="Whether this can be included in digests")
    template_code: str = Field(description="Template code for rendering")
    required_fields: list[str] = Field(description="Required payload fields")
    optional_fields: list[str] = Field(description="Optional payload fields")
    tags: list[str] = Field(description="Tags for categorization")

    @classmethod
    def from_definition(cls, definition: EventDefinition) -> "EventTypeResponse":
        """Create response from an EventDefinition."""
        return cls(
            event_type=definition.event_type_str,
            name=definition.name,
            description=definition.description,
            category=definition.category,
            default_channel=definition.default_channel,
            default_priority=definition.default_priority,
            is_transactional=definition.is_transactional,
            supports_digest=definition.supports_digest,
            template_code=definition.template_code,
            required_fields=definition.required_payload_fields,
            optional_fields=definition.optional_payload_fields,
            tags=definition.tags,
        )


class CategorySummary(BaseModel):
    """Summary of event types for a category."""

    category: NotificationCategory
    name: str = Field(description="Human-readable category name")
    description: str = Field(description="Category description")
    event_count: int = Field(description="Number of events in this category")
    event_types: list[str] = Field(description="List of event type identifiers")


class EventCatalogResponse(BaseModel):
    """Full event catalog response."""

    categories: list[CategorySummary] = Field(description="Event types grouped by category")
    total_events: int = Field(description="Total number of event types")
    transactional_count: int = Field(description="Number of transactional events")
    digestable_count: int = Field(description="Number of events that support digests")


class EventTypesListResponse(BaseModel):
    """Paginated list of event types."""

    events: list[EventTypeResponse]
    total: int
    category_filter: Optional[NotificationCategory] = None
    transactional_only: bool = False


# =============================================================================
# WORKSPACE ACCESS VERIFICATION
# =============================================================================


async def verify_workspace_access(
    workspace_id: UUID,
    current_user: JWTPayload = Depends(get_current_user),
) -> UUID:
    """
    Verify user has access to the requested workspace.

    Args:
        workspace_id: Workspace ID from path
        current_user: JWT payload from auth

    Returns:
        UUID: Validated workspace ID

    Raises:
        HTTPException: 403 if user doesn't have access
    """
    if str(current_user.workspace_id) != str(workspace_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied to workspace {workspace_id}",
        )
    return workspace_id


# =============================================================================
# CATEGORY METADATA
# =============================================================================


CATEGORY_METADATA: dict[NotificationCategory, tuple[str, str]] = {
    NotificationCategory.GALLERY_ACTIVITY: (
        "Gallery Activity",
        "Notifications about gallery updates, shares, and access changes",
    ),
    NotificationCategory.CLIENT_INTERACTIONS: (
        "Client Interactions",
        "Notifications about client engagement like comments, favorites, and downloads",
    ),
    NotificationCategory.ASSET_PROCESSING: (
        "Asset Processing",
        "Notifications about file uploads, processing status, and AI analysis",
    ),
    NotificationCategory.RSVP: (
        "RSVP Management",
        "Notifications about event RSVPs, responses, and reminders",
    ),
    NotificationCategory.SYSTEM_ALERTS: (
        "System Alerts",
        "Important system notifications including security and maintenance",
    ),
    NotificationCategory.BILLING: (
        "Billing",
        "Payment, subscription, and invoice notifications",
    ),
    NotificationCategory.MARKETING: (
        "Marketing",
        "Promotional communications and newsletters",
    ),
    NotificationCategory.INVITATION: (
        "Invitations",
        "Workspace and collaboration invitation notifications",
    ),
}


# =============================================================================
# API ROUTER
# =============================================================================


router = APIRouter(
    prefix="/api/v1/workspaces/{workspace_id}/event-types",
    tags=["event-types"],
)


@router.get("", response_model=EventTypesListResponse)
async def list_event_types(
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
    category: Optional[NotificationCategory] = Query(
        None, description="Filter by category"
    ),
    transactional_only: bool = Query(
        False, description="Only return transactional events"
    ),
) -> EventTypesListResponse:
    """List all available event types.

    Returns all notification event types that can be configured in preferences.
    Optionally filter by category or transactional status.

    Args:
        workspace_id: Workspace context for the request
        category: Optional category filter
        transactional_only: If True, only return transactional events

    Returns:
        List of event types with metadata
    """
    if transactional_only:
        definitions = get_transactional_events()
    elif category:
        definitions = get_events_by_category(category)
    else:
        definitions = list(EVENT_CATALOG.values())

    events = [EventTypeResponse.from_definition(d) for d in definitions]

    return EventTypesListResponse(
        events=events,
        total=len(events),
        category_filter=category,
        transactional_only=transactional_only,
    )


@router.get("/catalog", response_model=EventCatalogResponse)
async def get_event_catalog(
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
) -> EventCatalogResponse:
    """Get the full event catalog grouped by category.

    Returns a summary of all event types organized by notification category,
    useful for building preference UIs.

    Args:
        workspace_id: Workspace context for the request

    Returns:
        Event catalog with category summaries
    """
    categories = []

    for category in NotificationCategory:
        events = get_events_by_category(category)
        if events:  # Only include categories with events
            name, description = CATEGORY_METADATA.get(
                category, (category.value.replace("_", " ").title(), "")
            )
            categories.append(
                CategorySummary(
                    category=category,
                    name=name,
                    description=description,
                    event_count=len(events),
                    event_types=[e.event_type_str for e in events],
                )
            )

    return EventCatalogResponse(
        categories=categories,
        total_events=len(EVENT_CATALOG),
        transactional_count=len(get_transactional_events()),
        digestable_count=len(get_digestable_events()),
    )


@router.get("/{event_type}", response_model=EventTypeResponse)
async def get_event_type(
    event_type: str,
    workspace_id: UUID = Depends(verify_workspace_access),
    current_user: JWTPayload = Depends(get_current_user),
) -> EventTypeResponse:
    """Get details for a specific event type.

    Args:
        event_type: The event type identifier (e.g., 'gallery.published')
        workspace_id: Workspace context for the request

    Returns:
        Event type details

    Raises:
        404: If event type not found
    """
    from fastapi import HTTPException

    # Try to find the event type
    try:
        event_enum = EventType(event_type)
        definition = EVENT_CATALOG.get(event_enum)
        if definition:
            return EventTypeResponse.from_definition(definition)
    except ValueError:
        pass

    raise HTTPException(
        status_code=404,
        detail=f"Event type '{event_type}' not found",
    )
