"""Events module - Webhook event catalog and definitions."""

from .catalog import (
    ALL_EVENTS,
    CATEGORIES,
    EVENT_BY_TYPE,
    EVENTS_BY_CATEGORY,
    EventTypeDefinition,
    get_all_event_types,
    get_event_type,
    get_events_by_category,
    is_valid_event_type,
)

__all__ = [
    "ALL_EVENTS",
    "CATEGORIES",
    "EVENT_BY_TYPE",
    "EVENTS_BY_CATEGORY",
    "EventTypeDefinition",
    "get_all_event_types",
    "get_event_type",
    "get_events_by_category",
    "is_valid_event_type",
]
