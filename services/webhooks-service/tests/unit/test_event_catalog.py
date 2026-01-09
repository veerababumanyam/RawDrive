"""
Unit tests for the Event Catalog.
Tests event type definitions and lookups.
"""

import pytest
from src.events.catalog import (
    ALL_EVENTS,
    EVENT_BY_TYPE,
    EVENTS_BY_CATEGORY,
    EventTypeDefinition,
    get_event_types_for_category,
    get_all_categories,
    get_event_schema,
    get_sample_payload,
)
from tests.constants import (
    MIN_EVENT_TYPES,
    EXPECTED_CATEGORIES,
    MIN_SUBSCRIPTION_EVENTS,
)


class TestEventCatalog:
    """Test suite for event catalog."""

    def test_all_events_not_empty(self):
        """Test that ALL_EVENTS contains events."""
        assert len(ALL_EVENTS) > 0
        assert len(ALL_EVENTS) >= MIN_EVENT_TYPES

    def test_event_by_type_lookup(self):
        """Test EVENT_BY_TYPE dictionary is populated."""
        assert len(EVENT_BY_TYPE) == len(ALL_EVENTS)
        assert "asset.uploaded" in EVENT_BY_TYPE
        assert "gallery.published" in EVENT_BY_TYPE

    def test_events_by_category_lookup(self):
        """Test EVENTS_BY_CATEGORY dictionary is populated."""
        assert len(EVENTS_BY_CATEGORY) > 0
        assert "workspace" in EVENTS_BY_CATEGORY
        assert "asset" in EVENTS_BY_CATEGORY
        assert "gallery" in EVENTS_BY_CATEGORY

    def test_all_events_have_required_fields(self):
        """Test all events have required fields."""
        for event in ALL_EVENTS:
            assert event.event_type is not None
            assert len(event.event_type) > 0
            assert event.category is not None
            assert event.name is not None
            assert event.description is not None
            assert event.payload_schema is not None
            assert event.sample_payload is not None

    def test_event_type_format(self):
        """Test event types follow category.action format."""
        for event in ALL_EVENTS:
            parts = event.event_type.split(".")
            assert len(parts) == 2, f"Invalid format: {event.event_type}"
            assert parts[0] == event.category

    def test_get_event_types_for_category(self):
        """Test fetching events by category."""
        workspace_events = get_event_types_for_category("workspace")
        assert len(workspace_events) > 0
        assert all(e.category == "workspace" for e in workspace_events)

        asset_events = get_event_types_for_category("asset")
        assert len(asset_events) > 0
        assert all(e.category == "asset" for e in asset_events)

    def test_get_all_categories(self):
        """Test fetching all categories."""
        categories = get_all_categories()
        for expected_category in EXPECTED_CATEGORIES:
            assert expected_category in categories

    def test_get_event_schema(self):
        """Test fetching event schema."""
        schema = get_event_schema("asset.uploaded")
        assert schema is not None
        assert isinstance(schema, dict)

    def test_get_event_schema_not_found(self):
        """Test fetching non-existent event schema returns None."""
        schema = get_event_schema("nonexistent.event")
        assert schema is None

    def test_get_sample_payload(self):
        """Test fetching sample payload."""
        sample = get_sample_payload("gallery.published")
        assert sample is not None
        assert isinstance(sample, dict)

    def test_get_sample_payload_not_found(self):
        """Test fetching non-existent sample returns None."""
        sample = get_sample_payload("nonexistent.event")
        assert sample is None


class TestEventTypeDefinition:
    """Test EventTypeDefinition dataclass."""

    def test_create_event_definition(self):
        """Test creating an event definition."""
        event = EventTypeDefinition(
            event_type="test.created",
            category="test",
            name="Test Created",
            description="Test event created",
            payload_schema={"type": "object"},
            sample_payload={"test": "data"},
        )

        assert event.event_type == "test.created"
        assert event.category == "test"
        assert event.is_active is True  # Default
        assert event.introduced_version == "v1"  # Default

    def test_inactive_event(self):
        """Test creating an inactive event."""
        event = EventTypeDefinition(
            event_type="test.deprecated",
            category="test",
            name="Test Deprecated",
            description="Deprecated test event",
            payload_schema={},
            sample_payload={},
            is_active=False,
        )

        assert event.is_active is False


class TestWorkspaceEvents:
    """Test workspace event definitions."""

    def test_workspace_created(self):
        """Test workspace.created event."""
        event = EVENT_BY_TYPE.get("workspace.created")
        assert event is not None
        assert event.category == "workspace"
        assert "workspace_id" in str(event.payload_schema)

    def test_workspace_member_added(self):
        """Test workspace.member_added event."""
        event = EVENT_BY_TYPE.get("workspace.member_added")
        assert event is not None


class TestGalleryEvents:
    """Test gallery event definitions."""

    def test_gallery_published(self):
        """Test gallery.published event."""
        event = EVENT_BY_TYPE.get("gallery.published")
        assert event is not None
        assert event.category == "gallery"

    def test_gallery_selection_submitted(self):
        """Test gallery.selection_submitted event."""
        event = EVENT_BY_TYPE.get("gallery.selection_submitted")
        assert event is not None


class TestAssetEvents:
    """Test asset event definitions."""

    def test_asset_uploaded(self):
        """Test asset.uploaded event."""
        event = EVENT_BY_TYPE.get("asset.uploaded")
        assert event is not None
        assert event.category == "asset"

    def test_asset_face_detected(self):
        """Test asset.face_detected event."""
        event = EVENT_BY_TYPE.get("asset.face_detected")
        assert event is not None


class TestSubscriptionEvents:
    """Test subscription event definitions."""

    def test_subscription_events_exist(self):
        """Test subscription events are defined."""
        subscription_events = get_event_types_for_category("subscription")
        assert len(subscription_events) >= MIN_SUBSCRIPTION_EVENTS

    def test_payment_succeeded(self):
        """Test subscription.payment_succeeded event."""
        event = EVENT_BY_TYPE.get("subscription.payment_succeeded")
        assert event is not None
