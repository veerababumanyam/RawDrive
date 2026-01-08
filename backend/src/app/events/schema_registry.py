"""Event Schema Registry for A2A Communication.

Manages event schemas for Kafka messages, providing validation and versioning.
Ensures consistent event structure across microservices.

Phase 4: Google A2A ADKS Integration
"""

import json
import logging
from typing import Dict, Any, Optional, List
from enum import Enum

from pydantic import BaseModel, Field, ValidationError
from jsonschema import validate, ValidationError as JSONSchemaValidationError, Draft7Validator


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class EventType(str, Enum):
    """Standard event types in RawDrive."""

    # Photo/Asset events
    PHOTO_UPLOADED = "photo.uploaded"
    PHOTO_ANALYZED = "photo.analyzed"
    PHOTO_DELETED = "photo.deleted"
    PHOTO_MOVED = "photo.moved"

    # Gallery events
    GALLERY_CREATED = "gallery.created"
    GALLERY_UPDATED = "gallery.updated"
    GALLERY_DELETED = "gallery.deleted"
    GALLERY_SHARED = "gallery.shared"

    # Client events
    CLIENT_CREATED = "client.created"
    CLIENT_UPDATED = "client.updated"
    CLIENT_MERGED = "client.merged"

    # Duplicate detection events
    DUPLICATES_DETECTED = "duplicates.detected"
    DUPLICATE_GROUP_CONFIRMED = "duplicate_group.confirmed"
    DUPLICATE_GROUP_DISMISSED = "duplicate_group.dismissed"

    # Workspace events
    WORKSPACE_CREATED = "workspace.created"
    USER_INVITED = "user.invited"
    USER_JOINED = "user.joined"

    # AI processing events
    AI_PROCESSING_STARTED = "ai_processing.started"
    AI_PROCESSING_COMPLETED = "ai_processing.completed"
    AI_PROCESSING_FAILED = "ai_processing.failed"


class EventSchema(BaseModel):
    """Event schema definition."""

    event_type: str = Field(..., description="Event type identifier")
    version: str = Field(default="1.0.0", description="Schema version (semver)")
    schema: Dict[str, Any] = Field(..., description="JSON Schema definition")
    description: Optional[str] = Field(None, description="Human-readable description")
    example: Optional[Dict[str, Any]] = Field(None, description="Example event payload")


# ---------------------------------------------------------------------------
# Event Schema Registry
# ---------------------------------------------------------------------------


class EventSchemaRegistry:
    """Registry of event schemas for validation.

    Provides JSON Schema validation for Kafka events to ensure
    consistent structure across microservices.
    """

    # Event schemas using JSON Schema Draft 7
    SCHEMAS: Dict[str, EventSchema] = {
        # Photo uploaded event
        EventType.PHOTO_UPLOADED: EventSchema(
            event_type=EventType.PHOTO_UPLOADED,
            version="1.0.0",
            description="Triggered when a photo is successfully uploaded",
            schema={
                "type": "object",
                "properties": {
                    "asset_id": {"type": "string", "format": "uuid"},
                    "workspace_id": {"type": "string", "format": "uuid"},
                    "gallery_id": {"type": "string", "format": "uuid"},
                    "file_name": {"type": "string", "minLength": 1},
                    "file_size": {"type": "integer", "minimum": 0},
                    "mime_type": {"type": "string"},
                    "storage_key": {"type": "string"},
                    "uploaded_by": {"type": "string", "format": "uuid"},
                    "uploaded_at": {"type": "string", "format": "date-time"},
                },
                "required": [
                    "asset_id",
                    "workspace_id",
                    "file_name",
                    "file_size",
                    "uploaded_at",
                ],
            },
            example={
                "asset_id": "550e8400-e29b-41d4-a716-446655440000",
                "workspace_id": "650e8400-e29b-41d4-a716-446655440000",
                "gallery_id": "750e8400-e29b-41d4-a716-446655440000",
                "file_name": "wedding_photo.jpg",
                "file_size": 2048000,
                "mime_type": "image/jpeg",
                "storage_key": "workspaces/650e.../assets/550e.../original/wedding_photo.jpg",
                "uploaded_by": "850e8400-e29b-41d4-a716-446655440000",
                "uploaded_at": "2026-01-08T12:00:00Z",
            },
        ),
        # Photo analyzed event
        EventType.PHOTO_ANALYZED: EventSchema(
            event_type=EventType.PHOTO_ANALYZED,
            version="1.0.0",
            description="Triggered when AI analysis of a photo completes",
            schema={
                "type": "object",
                "properties": {
                    "asset_id": {"type": "string", "format": "uuid"},
                    "workspace_id": {"type": "string", "format": "uuid"},
                    "analysis": {
                        "type": "object",
                        "properties": {
                            "labels": {"type": "array", "items": {"type": "string"}},
                            "faces_detected": {"type": "integer", "minimum": 0},
                            "quality_score": {"type": "number", "minimum": 0, "maximum": 1},
                            "blur_score": {"type": "number", "minimum": 0, "maximum": 1},
                            "is_duplicate": {"type": "boolean"},
                            "duplicate_of": {"type": ["string", "null"], "format": "uuid"},
                        },
                    },
                    "analyzed_at": {"type": "string", "format": "date-time"},
                    "credits_used": {"type": "integer", "minimum": 0},
                },
                "required": ["asset_id", "workspace_id", "analysis", "analyzed_at"],
            },
        ),
        # Duplicates detected event
        EventType.DUPLICATES_DETECTED: EventSchema(
            event_type=EventType.DUPLICATES_DETECTED,
            version="1.0.0",
            description="Triggered when duplicate detection completes",
            schema={
                "type": "object",
                "properties": {
                    "workspace_id": {"type": "string", "format": "uuid"},
                    "entity_type": {"type": "string", "enum": ["photo", "client"]},
                    "detection_method": {
                        "type": "string",
                        "enum": [
                            "perceptual_hash",
                            "gemini_embedding",
                            "levenshtein",
                            "hybrid",
                        ],
                    },
                    "total_groups": {"type": "integer", "minimum": 0},
                    "total_items_scanned": {"type": "integer", "minimum": 0},
                    "items_with_duplicates": {"type": "integer", "minimum": 0},
                    "credits_used": {"type": "integer", "minimum": 0},
                    "detected_at": {"type": "string", "format": "date-time"},
                },
                "required": [
                    "workspace_id",
                    "entity_type",
                    "detection_method",
                    "total_groups",
                    "detected_at",
                ],
            },
        ),
        # Gallery created event
        EventType.GALLERY_CREATED: EventSchema(
            event_type=EventType.GALLERY_CREATED,
            version="1.0.0",
            description="Triggered when a gallery is created",
            schema={
                "type": "object",
                "properties": {
                    "gallery_id": {"type": "string", "format": "uuid"},
                    "workspace_id": {"type": "string", "format": "uuid"},
                    "name": {"type": "string", "minLength": 1},
                    "description": {"type": ["string", "null"]},
                    "created_by": {"type": "string", "format": "uuid"},
                    "created_at": {"type": "string", "format": "date-time"},
                },
                "required": ["gallery_id", "workspace_id", "name", "created_by", "created_at"],
            },
        ),
        # Client created event
        EventType.CLIENT_CREATED: EventSchema(
            event_type=EventType.CLIENT_CREATED,
            version="1.0.0",
            description="Triggered when a client is created",
            schema={
                "type": "object",
                "properties": {
                    "client_id": {"type": "string", "format": "uuid"},
                    "workspace_id": {"type": "string", "format": "uuid"},
                    "full_name": {"type": "string", "minLength": 1},
                    "primary_email": {"type": ["string", "null"], "format": "email"},
                    "primary_phone": {"type": ["string", "null"]},
                    "created_by": {"type": "string", "format": "uuid"},
                    "created_at": {"type": "string", "format": "date-time"},
                },
                "required": ["client_id", "workspace_id", "full_name", "created_at"],
            },
        ),
    }

    @classmethod
    def get_schema(cls, event_type: str) -> Optional[EventSchema]:
        """Get schema for an event type.

        Args:
            event_type: Event type identifier

        Returns:
            Event schema or None if not found
        """
        return cls.SCHEMAS.get(event_type)

    @classmethod
    def validate_event(cls, event_type: str, payload: Dict[str, Any]) -> bool:
        """Validate event payload against its schema.

        Args:
            event_type: Event type identifier
            payload: Event payload to validate

        Returns:
            True if valid, False otherwise

        Raises:
            ValueError: If event type not found
            JSONSchemaValidationError: If validation fails

        Example:
            ```python
            payload = {
                "asset_id": "550e8400-e29b-41d4-a716-446655440000",
                "workspace_id": "650e8400-e29b-41d4-a716-446655440000",
                "file_name": "photo.jpg",
                "file_size": 1024000,
                "uploaded_at": "2026-01-08T12:00:00Z",
            }

            try:
                EventSchemaRegistry.validate_event("photo.uploaded", payload)
                print("Event is valid!")
            except JSONSchemaValidationError as e:
                print(f"Validation error: {e.message}")
            ```
        """
        schema_def = cls.get_schema(event_type)
        if not schema_def:
            raise ValueError(f"Unknown event type: {event_type}")

        # Validate using JSON Schema
        try:
            validate(instance=payload, schema=schema_def.schema)
            logger.debug(f"Event validation passed for {event_type}")
            return True
        except JSONSchemaValidationError as e:
            logger.error(f"Event validation failed for {event_type}: {e.message}")
            raise

    @classmethod
    def list_event_types(cls) -> List[str]:
        """List all registered event types.

        Returns:
            List of event type identifiers
        """
        return list(cls.SCHEMAS.keys())

    @classmethod
    def register_schema(cls, schema: EventSchema):
        """Register a new event schema.

        Args:
            schema: Event schema definition

        Example:
            ```python
            custom_schema = EventSchema(
                event_type="custom.event",
                version="1.0.0",
                description="Custom event type",
                schema={
                    "type": "object",
                    "properties": {
                        "data": {"type": "string"},
                    },
                    "required": ["data"],
                },
            )

            EventSchemaRegistry.register_schema(custom_schema)
            ```
        """
        # Validate the schema itself
        try:
            Draft7Validator.check_schema(schema.schema)
        except Exception as e:
            raise ValueError(f"Invalid JSON Schema: {e}")

        cls.SCHEMAS[schema.event_type] = schema
        logger.info(f"Registered event schema: {schema.event_type} (v{schema.version})")

    @classmethod
    def get_example(cls, event_type: str) -> Optional[Dict[str, Any]]:
        """Get example payload for an event type.

        Args:
            event_type: Event type identifier

        Returns:
            Example payload or None if not available
        """
        schema_def = cls.get_schema(event_type)
        return schema_def.example if schema_def else None


# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------


def validate_kafka_event(event_type: str, payload: Dict[str, Any]) -> bool:
    """Validate a Kafka event payload.

    Convenience function for event validation.

    Args:
        event_type: Event type identifier
        payload: Event payload

    Returns:
        True if valid

    Raises:
        ValueError: If event type unknown
        JSONSchemaValidationError: If validation fails
    """
    return EventSchemaRegistry.validate_event(event_type, payload)


def create_validated_event(event_type: str, **kwargs) -> Dict[str, Any]:
    """Create and validate an event payload.

    Args:
        event_type: Event type identifier
        **kwargs: Event payload fields

    Returns:
        Validated event payload

    Raises:
        ValueError: If event type unknown or validation fails

    Example:
        ```python
        event = create_validated_event(
            event_type="photo.uploaded",
            asset_id="550e8400-e29b-41d4-a716-446655440000",
            workspace_id="650e8400-e29b-41d4-a716-446655440000",
            file_name="photo.jpg",
            file_size=1024000,
            uploaded_at="2026-01-08T12:00:00Z",
        )

        # Send to Kafka
        await kafka_producer.send("photo.uploaded", event)
        ```
    """
    try:
        EventSchemaRegistry.validate_event(event_type, kwargs)
        return kwargs
    except JSONSchemaValidationError as e:
        raise ValueError(f"Event validation failed: {e.message}")
