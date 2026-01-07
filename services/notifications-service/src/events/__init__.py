"""Events module for the Notifications & Communication Microservice.

This module provides the notification event catalog which defines all supported
event types, their categories, default configurations, and payload schemas.

Usage:
    from src.events import EventType, get_event_definition

    # Get event definition
    definition = get_event_definition(EventType.GALLERY_PUBLISHED)
    print(definition.category)  # NotificationCategory.GALLERY_ACTIVITY

    # Check if event is transactional
    is_txn = is_transactional_event("billing.payment_failed")  # True

    # Validate payload
    is_valid, missing = validate_payload(
        "gallery.published",
        {"gallery_id": "uuid", "gallery_name": "Photos"}
    )

Feature: Notifications & Communication Microservice
Task: T037 - Create notification event catalog
"""

from src.events.catalog import (
    # Enums
    EventType,
    # Data classes
    EventDefinition,
    # Catalog
    EVENT_CATALOG,
    # Helper functions
    get_event_definition,
    get_category_for_event,
    get_default_channel_for_event,
    get_default_priority_for_event,
    get_template_code_for_event,
    is_transactional_event,
    supports_digest,
    get_cooldown_minutes,
    validate_payload,
    get_events_by_category,
    get_transactional_events,
    get_digestable_events,
    get_events_by_tag,
    list_all_event_types,
    list_all_tags,
    infer_category_from_event_type,
    # Constants
    CATEGORY_EVENT_PREFIXES,
)

__all__ = [
    # Enums
    "EventType",
    # Data classes
    "EventDefinition",
    # Catalog
    "EVENT_CATALOG",
    # Helper functions
    "get_event_definition",
    "get_category_for_event",
    "get_default_channel_for_event",
    "get_default_priority_for_event",
    "get_template_code_for_event",
    "is_transactional_event",
    "supports_digest",
    "get_cooldown_minutes",
    "validate_payload",
    "get_events_by_category",
    "get_transactional_events",
    "get_digestable_events",
    "get_events_by_tag",
    "list_all_event_types",
    "list_all_tags",
    "infer_category_from_event_type",
    # Constants
    "CATEGORY_EVENT_PREFIXES",
]
