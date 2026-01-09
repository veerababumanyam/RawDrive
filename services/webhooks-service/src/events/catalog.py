"""Webhook event catalog - All supported event types with schemas and samples."""

from dataclasses import dataclass, field
from typing import Any


@dataclass
class EventTypeDefinition:
    """Event type definition with metadata and sample payload."""

    event_type: str
    category: str
    name: str
    description: str
    payload_schema: dict[str, Any]
    sample_payload: dict[str, Any]
    is_active: bool = True
    introduced_version: str = "v1"


# Common schema definitions
UUID_SCHEMA = {"type": "string", "format": "uuid"}
TIMESTAMP_SCHEMA = {"type": "string", "format": "date-time"}
STRING_SCHEMA = {"type": "string"}
INTEGER_SCHEMA = {"type": "integer"}
BOOLEAN_SCHEMA = {"type": "boolean"}


def _create_base_schema(properties: dict[str, Any], required: list[str] | None = None) -> dict[str, Any]:
    """Create a JSON Schema with common structure."""
    schema = {
        "type": "object",
        "properties": {
            "workspace_id": UUID_SCHEMA,
            **properties,
        },
        "required": ["workspace_id"] + (required or []),
    }
    return schema


# =============================================================================
# WORKSPACE EVENTS
# =============================================================================

WORKSPACE_CREATED = EventTypeDefinition(
    event_type="workspace.created",
    category="workspace",
    name="Workspace Created",
    description="Triggered when a new workspace is created",
    payload_schema=_create_base_schema({
        "name": STRING_SCHEMA,
        "slug": STRING_SCHEMA,
        "owner_user_id": UUID_SCHEMA,
        "plan_type": STRING_SCHEMA,
    }, ["name", "slug", "owner_user_id"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "name": "Smith Photography",
        "slug": "smith-photography",
        "owner_user_id": "550e8400-e29b-41d4-a716-446655440002",
        "plan_type": "professional",
    },
)

WORKSPACE_UPDATED = EventTypeDefinition(
    event_type="workspace.updated",
    category="workspace",
    name="Workspace Updated",
    description="Triggered when workspace settings are modified",
    payload_schema=_create_base_schema({
        "changes": {"type": "object", "additionalProperties": True},
        "updated_by_user_id": UUID_SCHEMA,
    }, ["changes"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "changes": {"name": "Smith Photography Studio", "logo_url": "https://..."},
        "updated_by_user_id": "550e8400-e29b-41d4-a716-446655440002",
    },
)

WORKSPACE_DELETED = EventTypeDefinition(
    event_type="workspace.deleted",
    category="workspace",
    name="Workspace Deleted",
    description="Triggered when a workspace is permanently deleted",
    payload_schema=_create_base_schema({
        "deleted_by_user_id": UUID_SCHEMA,
        "reason": STRING_SCHEMA,
    }),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "deleted_by_user_id": "550e8400-e29b-41d4-a716-446655440002",
        "reason": "account_closure",
    },
)

WORKSPACE_MEMBER_ADDED = EventTypeDefinition(
    event_type="workspace.member_added",
    category="workspace",
    name="Workspace Member Added",
    description="Triggered when a new member joins a workspace",
    payload_schema=_create_base_schema({
        "user_id": UUID_SCHEMA,
        "email": STRING_SCHEMA,
        "role": STRING_SCHEMA,
        "invited_by_user_id": UUID_SCHEMA,
    }, ["user_id", "role"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "user_id": "550e8400-e29b-41d4-a716-446655440003",
        "email": "jane@example.com",
        "role": "editor",
        "invited_by_user_id": "550e8400-e29b-41d4-a716-446655440002",
    },
)

WORKSPACE_MEMBER_REMOVED = EventTypeDefinition(
    event_type="workspace.member_removed",
    category="workspace",
    name="Workspace Member Removed",
    description="Triggered when a member is removed from a workspace",
    payload_schema=_create_base_schema({
        "user_id": UUID_SCHEMA,
        "removed_by_user_id": UUID_SCHEMA,
        "reason": STRING_SCHEMA,
    }, ["user_id"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "user_id": "550e8400-e29b-41d4-a716-446655440003",
        "removed_by_user_id": "550e8400-e29b-41d4-a716-446655440002",
        "reason": "voluntary",
    },
)

WORKSPACE_MEMBER_ROLE_CHANGED = EventTypeDefinition(
    event_type="workspace.member_role_changed",
    category="workspace",
    name="Workspace Member Role Changed",
    description="Triggered when a member's role is updated",
    payload_schema=_create_base_schema({
        "user_id": UUID_SCHEMA,
        "old_role": STRING_SCHEMA,
        "new_role": STRING_SCHEMA,
        "changed_by_user_id": UUID_SCHEMA,
    }, ["user_id", "old_role", "new_role"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "user_id": "550e8400-e29b-41d4-a716-446655440003",
        "old_role": "viewer",
        "new_role": "editor",
        "changed_by_user_id": "550e8400-e29b-41d4-a716-446655440002",
    },
)

WORKSPACE_SETTINGS_CHANGED = EventTypeDefinition(
    event_type="workspace.settings_changed",
    category="workspace",
    name="Workspace Settings Changed",
    description="Triggered when workspace configuration settings are modified",
    payload_schema=_create_base_schema({
        "setting_category": STRING_SCHEMA,
        "changes": {"type": "object", "additionalProperties": True},
        "changed_by_user_id": UUID_SCHEMA,
    }, ["setting_category", "changes"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "setting_category": "branding",
        "changes": {"primary_color": "#4F46E5", "logo_position": "center"},
        "changed_by_user_id": "550e8400-e29b-41d4-a716-446655440002",
    },
)

# =============================================================================
# SUBSCRIPTION EVENTS
# =============================================================================

SUBSCRIPTION_CREATED = EventTypeDefinition(
    event_type="subscription.created",
    category="subscription",
    name="Subscription Created",
    description="Triggered when a new subscription is created",
    payload_schema=_create_base_schema({
        "subscription_id": UUID_SCHEMA,
        "plan_id": STRING_SCHEMA,
        "plan_name": STRING_SCHEMA,
        "billing_cycle": STRING_SCHEMA,
        "status": STRING_SCHEMA,
    }, ["subscription_id", "plan_id", "status"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "subscription_id": "550e8400-e29b-41d4-a716-446655440010",
        "plan_id": "pro_monthly",
        "plan_name": "Professional",
        "billing_cycle": "monthly",
        "status": "trialing",
    },
)

SUBSCRIPTION_ACTIVATED = EventTypeDefinition(
    event_type="subscription.activated",
    category="subscription",
    name="Subscription Activated",
    description="Triggered when a subscription becomes active after trial or payment",
    payload_schema=_create_base_schema({
        "subscription_id": UUID_SCHEMA,
        "plan_id": STRING_SCHEMA,
        "activated_at": TIMESTAMP_SCHEMA,
    }, ["subscription_id", "plan_id"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "subscription_id": "550e8400-e29b-41d4-a716-446655440010",
        "plan_id": "pro_monthly",
        "activated_at": "2026-01-09T12:00:00Z",
    },
)

SUBSCRIPTION_UPGRADED = EventTypeDefinition(
    event_type="subscription.upgraded",
    category="subscription",
    name="Subscription Upgraded",
    description="Triggered when a subscription is upgraded to a higher tier",
    payload_schema=_create_base_schema({
        "subscription_id": UUID_SCHEMA,
        "old_plan_id": STRING_SCHEMA,
        "new_plan_id": STRING_SCHEMA,
        "prorated_amount": INTEGER_SCHEMA,
    }, ["subscription_id", "old_plan_id", "new_plan_id"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "subscription_id": "550e8400-e29b-41d4-a716-446655440010",
        "old_plan_id": "pro_monthly",
        "new_plan_id": "business_monthly",
        "prorated_amount": 2500,
    },
)

SUBSCRIPTION_DOWNGRADED = EventTypeDefinition(
    event_type="subscription.downgraded",
    category="subscription",
    name="Subscription Downgraded",
    description="Triggered when a subscription is downgraded to a lower tier",
    payload_schema=_create_base_schema({
        "subscription_id": UUID_SCHEMA,
        "old_plan_id": STRING_SCHEMA,
        "new_plan_id": STRING_SCHEMA,
        "effective_date": TIMESTAMP_SCHEMA,
    }, ["subscription_id", "old_plan_id", "new_plan_id"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "subscription_id": "550e8400-e29b-41d4-a716-446655440010",
        "old_plan_id": "business_monthly",
        "new_plan_id": "pro_monthly",
        "effective_date": "2026-02-01T00:00:00Z",
    },
)

SUBSCRIPTION_CANCELLED = EventTypeDefinition(
    event_type="subscription.cancelled",
    category="subscription",
    name="Subscription Cancelled",
    description="Triggered when a subscription is cancelled",
    payload_schema=_create_base_schema({
        "subscription_id": UUID_SCHEMA,
        "plan_id": STRING_SCHEMA,
        "cancellation_reason": STRING_SCHEMA,
        "effective_date": TIMESTAMP_SCHEMA,
        "cancelled_by_user_id": UUID_SCHEMA,
    }, ["subscription_id"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "subscription_id": "550e8400-e29b-41d4-a716-446655440010",
        "plan_id": "pro_monthly",
        "cancellation_reason": "too_expensive",
        "effective_date": "2026-02-09T00:00:00Z",
        "cancelled_by_user_id": "550e8400-e29b-41d4-a716-446655440002",
    },
)

SUBSCRIPTION_RENEWED = EventTypeDefinition(
    event_type="subscription.renewed",
    category="subscription",
    name="Subscription Renewed",
    description="Triggered when a subscription automatically renews",
    payload_schema=_create_base_schema({
        "subscription_id": UUID_SCHEMA,
        "plan_id": STRING_SCHEMA,
        "renewal_date": TIMESTAMP_SCHEMA,
        "next_billing_date": TIMESTAMP_SCHEMA,
        "amount": INTEGER_SCHEMA,
        "currency": STRING_SCHEMA,
    }, ["subscription_id", "renewal_date"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "subscription_id": "550e8400-e29b-41d4-a716-446655440010",
        "plan_id": "pro_monthly",
        "renewal_date": "2026-01-09T00:00:00Z",
        "next_billing_date": "2026-02-09T00:00:00Z",
        "amount": 4900,
        "currency": "USD",
    },
)

SUBSCRIPTION_PAYMENT_SUCCEEDED = EventTypeDefinition(
    event_type="subscription.payment_succeeded",
    category="subscription",
    name="Subscription Payment Succeeded",
    description="Triggered when a subscription payment is successfully processed",
    payload_schema=_create_base_schema({
        "subscription_id": UUID_SCHEMA,
        "payment_id": STRING_SCHEMA,
        "amount": INTEGER_SCHEMA,
        "currency": STRING_SCHEMA,
        "payment_method": STRING_SCHEMA,
        "invoice_id": STRING_SCHEMA,
    }, ["subscription_id", "payment_id", "amount", "currency"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "subscription_id": "550e8400-e29b-41d4-a716-446655440010",
        "payment_id": "pi_3P1234567890",
        "amount": 4900,
        "currency": "USD",
        "payment_method": "card",
        "invoice_id": "in_3P1234567890",
    },
)

SUBSCRIPTION_PAYMENT_FAILED = EventTypeDefinition(
    event_type="subscription.payment_failed",
    category="subscription",
    name="Subscription Payment Failed",
    description="Triggered when a subscription payment fails",
    payload_schema=_create_base_schema({
        "subscription_id": UUID_SCHEMA,
        "amount": INTEGER_SCHEMA,
        "currency": STRING_SCHEMA,
        "failure_reason": STRING_SCHEMA,
        "failure_code": STRING_SCHEMA,
        "retry_count": INTEGER_SCHEMA,
        "next_retry_at": TIMESTAMP_SCHEMA,
    }, ["subscription_id", "amount", "failure_reason"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "subscription_id": "550e8400-e29b-41d4-a716-446655440010",
        "amount": 4900,
        "currency": "USD",
        "failure_reason": "card_declined",
        "failure_code": "insufficient_funds",
        "retry_count": 1,
        "next_retry_at": "2026-01-12T00:00:00Z",
    },
)

SUBSCRIPTION_TRIAL_ENDING = EventTypeDefinition(
    event_type="subscription.trial_ending",
    category="subscription",
    name="Subscription Trial Ending",
    description="Triggered 3 days before a trial period ends",
    payload_schema=_create_base_schema({
        "subscription_id": UUID_SCHEMA,
        "plan_id": STRING_SCHEMA,
        "trial_end_date": TIMESTAMP_SCHEMA,
        "days_remaining": INTEGER_SCHEMA,
    }, ["subscription_id", "trial_end_date", "days_remaining"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "subscription_id": "550e8400-e29b-41d4-a716-446655440010",
        "plan_id": "pro_monthly",
        "trial_end_date": "2026-01-12T00:00:00Z",
        "days_remaining": 3,
    },
)

SUBSCRIPTION_TRIAL_EXPIRED = EventTypeDefinition(
    event_type="subscription.trial_expired",
    category="subscription",
    name="Subscription Trial Expired",
    description="Triggered when a trial period expires without conversion",
    payload_schema=_create_base_schema({
        "subscription_id": UUID_SCHEMA,
        "plan_id": STRING_SCHEMA,
        "trial_started_at": TIMESTAMP_SCHEMA,
        "trial_ended_at": TIMESTAMP_SCHEMA,
    }, ["subscription_id", "trial_ended_at"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "subscription_id": "550e8400-e29b-41d4-a716-446655440010",
        "plan_id": "pro_monthly",
        "trial_started_at": "2025-12-26T00:00:00Z",
        "trial_ended_at": "2026-01-09T00:00:00Z",
    },
)

# =============================================================================
# USER EVENTS
# =============================================================================

USER_CREATED = EventTypeDefinition(
    event_type="user.created",
    category="user",
    name="User Created",
    description="Triggered when a new user account is created",
    payload_schema=_create_base_schema({
        "user_id": UUID_SCHEMA,
        "email": STRING_SCHEMA,
        "full_name": STRING_SCHEMA,
        "signup_source": STRING_SCHEMA,
    }, ["user_id", "email"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "user_id": "550e8400-e29b-41d4-a716-446655440002",
        "email": "john@example.com",
        "full_name": "John Smith",
        "signup_source": "organic",
    },
)

USER_UPDATED = EventTypeDefinition(
    event_type="user.updated",
    category="user",
    name="User Updated",
    description="Triggered when user profile information is updated",
    payload_schema=_create_base_schema({
        "user_id": UUID_SCHEMA,
        "changes": {"type": "object", "additionalProperties": True},
    }, ["user_id", "changes"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "user_id": "550e8400-e29b-41d4-a716-446655440002",
        "changes": {"full_name": "John D. Smith", "timezone": "America/New_York"},
    },
)

USER_EMAIL_VERIFIED = EventTypeDefinition(
    event_type="user.email_verified",
    category="user",
    name="User Email Verified",
    description="Triggered when a user verifies their email address",
    payload_schema=_create_base_schema({
        "user_id": UUID_SCHEMA,
        "email": STRING_SCHEMA,
        "verified_at": TIMESTAMP_SCHEMA,
    }, ["user_id", "email"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "user_id": "550e8400-e29b-41d4-a716-446655440002",
        "email": "john@example.com",
        "verified_at": "2026-01-09T12:30:00Z",
    },
)

USER_PASSWORD_CHANGED = EventTypeDefinition(
    event_type="user.password_changed",
    category="user",
    name="User Password Changed",
    description="Triggered when a user changes their password",
    payload_schema=_create_base_schema({
        "user_id": UUID_SCHEMA,
        "changed_at": TIMESTAMP_SCHEMA,
        "change_method": STRING_SCHEMA,
    }, ["user_id", "changed_at"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "user_id": "550e8400-e29b-41d4-a716-446655440002",
        "changed_at": "2026-01-09T12:30:00Z",
        "change_method": "settings",
    },
)

USER_LOGIN = EventTypeDefinition(
    event_type="user.login",
    category="user",
    name="User Login",
    description="Triggered when a user successfully logs in",
    payload_schema=_create_base_schema({
        "user_id": UUID_SCHEMA,
        "login_method": STRING_SCHEMA,
        "ip_address": STRING_SCHEMA,
        "user_agent": STRING_SCHEMA,
        "device_type": STRING_SCHEMA,
    }, ["user_id", "login_method"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "user_id": "550e8400-e29b-41d4-a716-446655440002",
        "login_method": "password",
        "ip_address": "192.168.1.1",
        "user_agent": "Mozilla/5.0...",
        "device_type": "desktop",
    },
)

USER_LOGOUT = EventTypeDefinition(
    event_type="user.logout",
    category="user",
    name="User Logout",
    description="Triggered when a user logs out",
    payload_schema=_create_base_schema({
        "user_id": UUID_SCHEMA,
        "logout_method": STRING_SCHEMA,
        "session_duration_seconds": INTEGER_SCHEMA,
    }, ["user_id"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "user_id": "550e8400-e29b-41d4-a716-446655440002",
        "logout_method": "manual",
        "session_duration_seconds": 3600,
    },
)

# =============================================================================
# ASSET EVENTS
# =============================================================================

ASSET_UPLOADED = EventTypeDefinition(
    event_type="asset.uploaded",
    category="asset",
    name="Asset Uploaded",
    description="Triggered when a new asset is uploaded",
    payload_schema=_create_base_schema({
        "asset_id": UUID_SCHEMA,
        "filename": STRING_SCHEMA,
        "file_size": INTEGER_SCHEMA,
        "mime_type": STRING_SCHEMA,
        "uploaded_by_user_id": UUID_SCHEMA,
        "gallery_id": UUID_SCHEMA,
    }, ["asset_id", "filename", "file_size"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "asset_id": "550e8400-e29b-41d4-a716-446655440020",
        "filename": "IMG_2024_001.jpg",
        "file_size": 5242880,
        "mime_type": "image/jpeg",
        "uploaded_by_user_id": "550e8400-e29b-41d4-a716-446655440002",
        "gallery_id": "550e8400-e29b-41d4-a716-446655440015",
    },
)

ASSET_PROCESSED = EventTypeDefinition(
    event_type="asset.processed",
    category="asset",
    name="Asset Processed",
    description="Triggered when asset processing (thumbnails, AI analysis) completes",
    payload_schema=_create_base_schema({
        "asset_id": UUID_SCHEMA,
        "processing_type": STRING_SCHEMA,
        "processing_duration_ms": INTEGER_SCHEMA,
        "thumbnails_generated": {"type": "array", "items": STRING_SCHEMA},
        "ai_tags": {"type": "array", "items": STRING_SCHEMA},
    }, ["asset_id", "processing_type"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "asset_id": "550e8400-e29b-41d4-a716-446655440020",
        "processing_type": "full",
        "processing_duration_ms": 2500,
        "thumbnails_generated": ["small", "medium", "large"],
        "ai_tags": ["outdoor", "wedding", "couple", "sunset"],
    },
)

ASSET_UPDATED = EventTypeDefinition(
    event_type="asset.updated",
    category="asset",
    name="Asset Updated",
    description="Triggered when asset metadata is updated",
    payload_schema=_create_base_schema({
        "asset_id": UUID_SCHEMA,
        "changes": {"type": "object", "additionalProperties": True},
        "updated_by_user_id": UUID_SCHEMA,
    }, ["asset_id", "changes"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "asset_id": "550e8400-e29b-41d4-a716-446655440020",
        "changes": {"title": "Sunset Kiss", "description": "Beautiful moment captured at golden hour"},
        "updated_by_user_id": "550e8400-e29b-41d4-a716-446655440002",
    },
)

ASSET_DELETED = EventTypeDefinition(
    event_type="asset.deleted",
    category="asset",
    name="Asset Deleted",
    description="Triggered when an asset is deleted",
    payload_schema=_create_base_schema({
        "asset_id": UUID_SCHEMA,
        "filename": STRING_SCHEMA,
        "deleted_by_user_id": UUID_SCHEMA,
        "deletion_type": STRING_SCHEMA,
    }, ["asset_id"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "asset_id": "550e8400-e29b-41d4-a716-446655440020",
        "filename": "IMG_2024_001.jpg",
        "deleted_by_user_id": "550e8400-e29b-41d4-a716-446655440002",
        "deletion_type": "permanent",
    },
)

ASSET_DOWNLOADED = EventTypeDefinition(
    event_type="asset.downloaded",
    category="asset",
    name="Asset Downloaded",
    description="Triggered when an asset is downloaded",
    payload_schema=_create_base_schema({
        "asset_id": UUID_SCHEMA,
        "filename": STRING_SCHEMA,
        "download_size": STRING_SCHEMA,
        "downloaded_by": STRING_SCHEMA,
        "client_id": UUID_SCHEMA,
        "ip_address": STRING_SCHEMA,
    }, ["asset_id"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "asset_id": "550e8400-e29b-41d4-a716-446655440020",
        "filename": "IMG_2024_001.jpg",
        "download_size": "original",
        "downloaded_by": "client",
        "client_id": "550e8400-e29b-41d4-a716-446655440030",
        "ip_address": "192.168.1.100",
    },
)

ASSET_TAGGED = EventTypeDefinition(
    event_type="asset.tagged",
    category="asset",
    name="Asset Tagged",
    description="Triggered when tags are added to an asset",
    payload_schema=_create_base_schema({
        "asset_id": UUID_SCHEMA,
        "tags_added": {"type": "array", "items": STRING_SCHEMA},
        "tags_removed": {"type": "array", "items": STRING_SCHEMA},
        "tag_source": STRING_SCHEMA,
        "tagged_by_user_id": UUID_SCHEMA,
    }, ["asset_id"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "asset_id": "550e8400-e29b-41d4-a716-446655440020",
        "tags_added": ["featured", "hero-shot"],
        "tags_removed": [],
        "tag_source": "manual",
        "tagged_by_user_id": "550e8400-e29b-41d4-a716-446655440002",
    },
)

ASSET_FACE_DETECTED = EventTypeDefinition(
    event_type="asset.face_detected",
    category="asset",
    name="Asset Face Detected",
    description="Triggered when faces are detected in an asset",
    payload_schema=_create_base_schema({
        "asset_id": UUID_SCHEMA,
        "faces_count": INTEGER_SCHEMA,
        "faces": {"type": "array", "items": {"type": "object"}},
        "identified_people": {"type": "array", "items": STRING_SCHEMA},
    }, ["asset_id", "faces_count"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "asset_id": "550e8400-e29b-41d4-a716-446655440020",
        "faces_count": 2,
        "faces": [
            {"bounding_box": {"x": 100, "y": 50, "width": 80, "height": 100}},
            {"bounding_box": {"x": 250, "y": 60, "width": 75, "height": 95}},
        ],
        "identified_people": ["bride", "groom"],
    },
)

# =============================================================================
# GALLERY EVENTS
# =============================================================================

GALLERY_CREATED = EventTypeDefinition(
    event_type="gallery.created",
    category="gallery",
    name="Gallery Created",
    description="Triggered when a new gallery is created",
    payload_schema=_create_base_schema({
        "gallery_id": UUID_SCHEMA,
        "title": STRING_SCHEMA,
        "gallery_type": STRING_SCHEMA,
        "created_by_user_id": UUID_SCHEMA,
    }, ["gallery_id", "title"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "gallery_id": "550e8400-e29b-41d4-a716-446655440015",
        "title": "Smith-Johnson Wedding",
        "gallery_type": "wedding",
        "created_by_user_id": "550e8400-e29b-41d4-a716-446655440002",
    },
)

GALLERY_UPDATED = EventTypeDefinition(
    event_type="gallery.updated",
    category="gallery",
    name="Gallery Updated",
    description="Triggered when gallery settings are updated",
    payload_schema=_create_base_schema({
        "gallery_id": UUID_SCHEMA,
        "changes": {"type": "object", "additionalProperties": True},
        "updated_by_user_id": UUID_SCHEMA,
    }, ["gallery_id", "changes"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "gallery_id": "550e8400-e29b-41d4-a716-446655440015",
        "changes": {"title": "Smith-Johnson Wedding 2024", "cover_image_id": "..."},
        "updated_by_user_id": "550e8400-e29b-41d4-a716-446655440002",
    },
)

GALLERY_PUBLISHED = EventTypeDefinition(
    event_type="gallery.published",
    category="gallery",
    name="Gallery Published",
    description="Triggered when a gallery is published and made available to clients",
    payload_schema=_create_base_schema({
        "gallery_id": UUID_SCHEMA,
        "title": STRING_SCHEMA,
        "public_url": STRING_SCHEMA,
        "asset_count": INTEGER_SCHEMA,
        "published_by_user_id": UUID_SCHEMA,
        "expiry_date": TIMESTAMP_SCHEMA,
    }, ["gallery_id", "public_url"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "gallery_id": "550e8400-e29b-41d4-a716-446655440015",
        "title": "Smith-Johnson Wedding",
        "public_url": "https://gallery.rawdrive.ai/g/abc123",
        "asset_count": 450,
        "published_by_user_id": "550e8400-e29b-41d4-a716-446655440002",
        "expiry_date": "2026-04-09T00:00:00Z",
    },
)

GALLERY_UNPUBLISHED = EventTypeDefinition(
    event_type="gallery.unpublished",
    category="gallery",
    name="Gallery Unpublished",
    description="Triggered when a gallery is unpublished and no longer accessible",
    payload_schema=_create_base_schema({
        "gallery_id": UUID_SCHEMA,
        "unpublished_by_user_id": UUID_SCHEMA,
        "reason": STRING_SCHEMA,
    }, ["gallery_id"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "gallery_id": "550e8400-e29b-41d4-a716-446655440015",
        "unpublished_by_user_id": "550e8400-e29b-41d4-a716-446655440002",
        "reason": "manual",
    },
)

GALLERY_DELETED = EventTypeDefinition(
    event_type="gallery.deleted",
    category="gallery",
    name="Gallery Deleted",
    description="Triggered when a gallery is deleted",
    payload_schema=_create_base_schema({
        "gallery_id": UUID_SCHEMA,
        "title": STRING_SCHEMA,
        "asset_count": INTEGER_SCHEMA,
        "deleted_by_user_id": UUID_SCHEMA,
    }, ["gallery_id"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "gallery_id": "550e8400-e29b-41d4-a716-446655440015",
        "title": "Smith-Johnson Wedding",
        "asset_count": 450,
        "deleted_by_user_id": "550e8400-e29b-41d4-a716-446655440002",
    },
)

GALLERY_SHARED = EventTypeDefinition(
    event_type="gallery.shared",
    category="gallery",
    name="Gallery Shared",
    description="Triggered when a gallery is shared with a client",
    payload_schema=_create_base_schema({
        "gallery_id": UUID_SCHEMA,
        "client_id": UUID_SCHEMA,
        "client_email": STRING_SCHEMA,
        "share_link": STRING_SCHEMA,
        "shared_by_user_id": UUID_SCHEMA,
    }, ["gallery_id", "client_email"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "gallery_id": "550e8400-e29b-41d4-a716-446655440015",
        "client_id": "550e8400-e29b-41d4-a716-446655440030",
        "client_email": "bride@example.com",
        "share_link": "https://gallery.rawdrive.ai/g/abc123?token=xyz",
        "shared_by_user_id": "550e8400-e29b-41d4-a716-446655440002",
    },
)

GALLERY_VIEWED = EventTypeDefinition(
    event_type="gallery.viewed",
    category="gallery",
    name="Gallery Viewed",
    description="Triggered when a gallery is viewed by a client",
    payload_schema=_create_base_schema({
        "gallery_id": UUID_SCHEMA,
        "viewer_type": STRING_SCHEMA,
        "client_id": UUID_SCHEMA,
        "ip_address": STRING_SCHEMA,
        "device_type": STRING_SCHEMA,
        "view_duration_seconds": INTEGER_SCHEMA,
    }, ["gallery_id", "viewer_type"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "gallery_id": "550e8400-e29b-41d4-a716-446655440015",
        "viewer_type": "client",
        "client_id": "550e8400-e29b-41d4-a716-446655440030",
        "ip_address": "192.168.1.100",
        "device_type": "mobile",
        "view_duration_seconds": 300,
    },
)

GALLERY_DOWNLOADED = EventTypeDefinition(
    event_type="gallery.downloaded",
    category="gallery",
    name="Gallery Downloaded",
    description="Triggered when a gallery is downloaded as a ZIP archive",
    payload_schema=_create_base_schema({
        "gallery_id": UUID_SCHEMA,
        "asset_count": INTEGER_SCHEMA,
        "download_size_bytes": INTEGER_SCHEMA,
        "download_quality": STRING_SCHEMA,
        "downloaded_by": STRING_SCHEMA,
        "client_id": UUID_SCHEMA,
    }, ["gallery_id", "asset_count"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "gallery_id": "550e8400-e29b-41d4-a716-446655440015",
        "asset_count": 50,
        "download_size_bytes": 524288000,
        "download_quality": "original",
        "downloaded_by": "client",
        "client_id": "550e8400-e29b-41d4-a716-446655440030",
    },
)

GALLERY_EXPIRED = EventTypeDefinition(
    event_type="gallery.expired",
    category="gallery",
    name="Gallery Expired",
    description="Triggered when a gallery reaches its expiry date",
    payload_schema=_create_base_schema({
        "gallery_id": UUID_SCHEMA,
        "title": STRING_SCHEMA,
        "expired_at": TIMESTAMP_SCHEMA,
        "was_published": BOOLEAN_SCHEMA,
    }, ["gallery_id", "expired_at"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "gallery_id": "550e8400-e29b-41d4-a716-446655440015",
        "title": "Smith-Johnson Wedding",
        "expired_at": "2026-04-09T00:00:00Z",
        "was_published": True,
    },
)

GALLERY_SELECTION_SUBMITTED = EventTypeDefinition(
    event_type="gallery.selection_submitted",
    category="gallery",
    name="Gallery Selection Submitted",
    description="Triggered when a client submits their photo selections",
    payload_schema=_create_base_schema({
        "gallery_id": UUID_SCHEMA,
        "client_id": UUID_SCHEMA,
        "selected_asset_ids": {"type": "array", "items": UUID_SCHEMA},
        "selection_count": INTEGER_SCHEMA,
        "submitted_at": TIMESTAMP_SCHEMA,
    }, ["gallery_id", "client_id", "selection_count"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "gallery_id": "550e8400-e29b-41d4-a716-446655440015",
        "client_id": "550e8400-e29b-41d4-a716-446655440030",
        "selected_asset_ids": ["550e8400-e29b-41d4-a716-446655440020", "550e8400-e29b-41d4-a716-446655440021"],
        "selection_count": 50,
        "submitted_at": "2026-01-09T15:30:00Z",
    },
)

GALLERY_COMMENT_ADDED = EventTypeDefinition(
    event_type="gallery.comment_added",
    category="gallery",
    name="Gallery Comment Added",
    description="Triggered when a comment is added to a gallery or asset",
    payload_schema=_create_base_schema({
        "gallery_id": UUID_SCHEMA,
        "asset_id": UUID_SCHEMA,
        "comment_id": UUID_SCHEMA,
        "comment_text": STRING_SCHEMA,
        "commented_by": STRING_SCHEMA,
        "client_id": UUID_SCHEMA,
    }, ["gallery_id", "comment_id"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "gallery_id": "550e8400-e29b-41d4-a716-446655440015",
        "asset_id": "550e8400-e29b-41d4-a716-446655440020",
        "comment_id": "550e8400-e29b-41d4-a716-446655440040",
        "comment_text": "Love this shot!",
        "commented_by": "client",
        "client_id": "550e8400-e29b-41d4-a716-446655440030",
    },
)

# =============================================================================
# INVITATION EVENTS
# =============================================================================

INVITATION_CREATED = EventTypeDefinition(
    event_type="invitation.created",
    category="invitation",
    name="Invitation Created",
    description="Triggered when a new digital invitation is created",
    payload_schema=_create_base_schema({
        "invitation_id": UUID_SCHEMA,
        "title": STRING_SCHEMA,
        "event_date": TIMESTAMP_SCHEMA,
        "event_type": STRING_SCHEMA,
        "created_by_user_id": UUID_SCHEMA,
    }, ["invitation_id", "title"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "invitation_id": "550e8400-e29b-41d4-a716-446655440050",
        "title": "Smith-Johnson Wedding Invitation",
        "event_date": "2026-06-15T16:00:00Z",
        "event_type": "wedding",
        "created_by_user_id": "550e8400-e29b-41d4-a716-446655440002",
    },
)

INVITATION_SENT = EventTypeDefinition(
    event_type="invitation.sent",
    category="invitation",
    name="Invitation Sent",
    description="Triggered when an invitation is sent to recipients",
    payload_schema=_create_base_schema({
        "invitation_id": UUID_SCHEMA,
        "recipient_count": INTEGER_SCHEMA,
        "delivery_method": STRING_SCHEMA,
        "sent_by_user_id": UUID_SCHEMA,
    }, ["invitation_id", "recipient_count"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "invitation_id": "550e8400-e29b-41d4-a716-446655440050",
        "recipient_count": 150,
        "delivery_method": "email",
        "sent_by_user_id": "550e8400-e29b-41d4-a716-446655440002",
    },
)

INVITATION_VIEWED = EventTypeDefinition(
    event_type="invitation.viewed",
    category="invitation",
    name="Invitation Viewed",
    description="Triggered when a recipient views an invitation",
    payload_schema=_create_base_schema({
        "invitation_id": UUID_SCHEMA,
        "guest_id": UUID_SCHEMA,
        "guest_email": STRING_SCHEMA,
        "viewed_at": TIMESTAMP_SCHEMA,
        "device_type": STRING_SCHEMA,
    }, ["invitation_id"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "invitation_id": "550e8400-e29b-41d4-a716-446655440050",
        "guest_id": "550e8400-e29b-41d4-a716-446655440060",
        "guest_email": "guest@example.com",
        "viewed_at": "2026-01-09T18:00:00Z",
        "device_type": "mobile",
    },
)

INVITATION_RSVP_RECEIVED = EventTypeDefinition(
    event_type="invitation.rsvp_received",
    category="invitation",
    name="Invitation RSVP Received",
    description="Triggered when an RSVP response is received",
    payload_schema=_create_base_schema({
        "invitation_id": UUID_SCHEMA,
        "guest_id": UUID_SCHEMA,
        "guest_name": STRING_SCHEMA,
        "guest_email": STRING_SCHEMA,
        "rsvp_status": STRING_SCHEMA,
        "guest_count": INTEGER_SCHEMA,
        "dietary_requirements": STRING_SCHEMA,
        "message": STRING_SCHEMA,
    }, ["invitation_id", "guest_id", "rsvp_status"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "invitation_id": "550e8400-e29b-41d4-a716-446655440050",
        "guest_id": "550e8400-e29b-41d4-a716-446655440060",
        "guest_name": "Jane Doe",
        "guest_email": "jane@example.com",
        "rsvp_status": "attending",
        "guest_count": 2,
        "dietary_requirements": "vegetarian",
        "message": "Looking forward to celebrating with you!",
    },
)

INVITATION_RSVP_UPDATED = EventTypeDefinition(
    event_type="invitation.rsvp_updated",
    category="invitation",
    name="Invitation RSVP Updated",
    description="Triggered when an RSVP response is updated",
    payload_schema=_create_base_schema({
        "invitation_id": UUID_SCHEMA,
        "guest_id": UUID_SCHEMA,
        "old_rsvp_status": STRING_SCHEMA,
        "new_rsvp_status": STRING_SCHEMA,
        "old_guest_count": INTEGER_SCHEMA,
        "new_guest_count": INTEGER_SCHEMA,
    }, ["invitation_id", "guest_id", "new_rsvp_status"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "invitation_id": "550e8400-e29b-41d4-a716-446655440050",
        "guest_id": "550e8400-e29b-41d4-a716-446655440060",
        "old_rsvp_status": "attending",
        "new_rsvp_status": "not_attending",
        "old_guest_count": 2,
        "new_guest_count": 0,
    },
)

INVITATION_EXPIRED = EventTypeDefinition(
    event_type="invitation.expired",
    category="invitation",
    name="Invitation Expired",
    description="Triggered when an invitation RSVP deadline passes",
    payload_schema=_create_base_schema({
        "invitation_id": UUID_SCHEMA,
        "title": STRING_SCHEMA,
        "rsvp_deadline": TIMESTAMP_SCHEMA,
        "total_guests": INTEGER_SCHEMA,
        "attending_count": INTEGER_SCHEMA,
        "not_attending_count": INTEGER_SCHEMA,
        "pending_count": INTEGER_SCHEMA,
    }, ["invitation_id", "rsvp_deadline"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "invitation_id": "550e8400-e29b-41d4-a716-446655440050",
        "title": "Smith-Johnson Wedding Invitation",
        "rsvp_deadline": "2026-05-01T00:00:00Z",
        "total_guests": 150,
        "attending_count": 120,
        "not_attending_count": 15,
        "pending_count": 15,
    },
)

# =============================================================================
# CLIENT EVENTS
# =============================================================================

CLIENT_CREATED = EventTypeDefinition(
    event_type="client.created",
    category="client",
    name="Client Created",
    description="Triggered when a new client is added to the workspace",
    payload_schema=_create_base_schema({
        "client_id": UUID_SCHEMA,
        "name": STRING_SCHEMA,
        "email": STRING_SCHEMA,
        "phone": STRING_SCHEMA,
        "created_by_user_id": UUID_SCHEMA,
    }, ["client_id", "name"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "client_id": "550e8400-e29b-41d4-a716-446655440030",
        "name": "Sarah Johnson",
        "email": "sarah@example.com",
        "phone": "+1234567890",
        "created_by_user_id": "550e8400-e29b-41d4-a716-446655440002",
    },
)

CLIENT_UPDATED = EventTypeDefinition(
    event_type="client.updated",
    category="client",
    name="Client Updated",
    description="Triggered when client information is updated",
    payload_schema=_create_base_schema({
        "client_id": UUID_SCHEMA,
        "changes": {"type": "object", "additionalProperties": True},
        "updated_by_user_id": UUID_SCHEMA,
    }, ["client_id", "changes"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "client_id": "550e8400-e29b-41d4-a716-446655440030",
        "changes": {"email": "sarah.johnson@example.com", "phone": "+1987654321"},
        "updated_by_user_id": "550e8400-e29b-41d4-a716-446655440002",
    },
)

CLIENT_DELETED = EventTypeDefinition(
    event_type="client.deleted",
    category="client",
    name="Client Deleted",
    description="Triggered when a client is removed from the workspace",
    payload_schema=_create_base_schema({
        "client_id": UUID_SCHEMA,
        "name": STRING_SCHEMA,
        "deleted_by_user_id": UUID_SCHEMA,
    }, ["client_id"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "client_id": "550e8400-e29b-41d4-a716-446655440030",
        "name": "Sarah Johnson",
        "deleted_by_user_id": "550e8400-e29b-41d4-a716-446655440002",
    },
)

CLIENT_GALLERY_ACCESSED = EventTypeDefinition(
    event_type="client.gallery_accessed",
    category="client",
    name="Client Gallery Accessed",
    description="Triggered when a client accesses a gallery",
    payload_schema=_create_base_schema({
        "client_id": UUID_SCHEMA,
        "gallery_id": UUID_SCHEMA,
        "access_method": STRING_SCHEMA,
        "ip_address": STRING_SCHEMA,
        "device_type": STRING_SCHEMA,
    }, ["client_id", "gallery_id"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "client_id": "550e8400-e29b-41d4-a716-446655440030",
        "gallery_id": "550e8400-e29b-41d4-a716-446655440015",
        "access_method": "magic_link",
        "ip_address": "192.168.1.100",
        "device_type": "desktop",
    },
)

CLIENT_PHOTO_FAVORITED = EventTypeDefinition(
    event_type="client.photo_favorited",
    category="client",
    name="Client Photo Favorited",
    description="Triggered when a client favorites/unfavorites a photo",
    payload_schema=_create_base_schema({
        "client_id": UUID_SCHEMA,
        "asset_id": UUID_SCHEMA,
        "gallery_id": UUID_SCHEMA,
        "action": STRING_SCHEMA,
    }, ["client_id", "asset_id", "action"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "client_id": "550e8400-e29b-41d4-a716-446655440030",
        "asset_id": "550e8400-e29b-41d4-a716-446655440020",
        "gallery_id": "550e8400-e29b-41d4-a716-446655440015",
        "action": "favorited",
    },
)

CLIENT_SELECTION_MADE = EventTypeDefinition(
    event_type="client.selection_made",
    category="client",
    name="Client Selection Made",
    description="Triggered when a client adds/removes photos from their selection",
    payload_schema=_create_base_schema({
        "client_id": UUID_SCHEMA,
        "gallery_id": UUID_SCHEMA,
        "asset_id": UUID_SCHEMA,
        "action": STRING_SCHEMA,
        "current_selection_count": INTEGER_SCHEMA,
    }, ["client_id", "gallery_id", "action"]),
    sample_payload={
        "workspace_id": "550e8400-e29b-41d4-a716-446655440001",
        "client_id": "550e8400-e29b-41d4-a716-446655440030",
        "gallery_id": "550e8400-e29b-41d4-a716-446655440015",
        "asset_id": "550e8400-e29b-41d4-a716-446655440020",
        "action": "added",
        "current_selection_count": 25,
    },
)


# =============================================================================
# EVENT CATALOG
# =============================================================================

ALL_EVENTS: list[EventTypeDefinition] = [
    # Workspace events
    WORKSPACE_CREATED,
    WORKSPACE_UPDATED,
    WORKSPACE_DELETED,
    WORKSPACE_MEMBER_ADDED,
    WORKSPACE_MEMBER_REMOVED,
    WORKSPACE_MEMBER_ROLE_CHANGED,
    WORKSPACE_SETTINGS_CHANGED,
    # Subscription events
    SUBSCRIPTION_CREATED,
    SUBSCRIPTION_ACTIVATED,
    SUBSCRIPTION_UPGRADED,
    SUBSCRIPTION_DOWNGRADED,
    SUBSCRIPTION_CANCELLED,
    SUBSCRIPTION_RENEWED,
    SUBSCRIPTION_PAYMENT_SUCCEEDED,
    SUBSCRIPTION_PAYMENT_FAILED,
    SUBSCRIPTION_TRIAL_ENDING,
    SUBSCRIPTION_TRIAL_EXPIRED,
    # User events
    USER_CREATED,
    USER_UPDATED,
    USER_EMAIL_VERIFIED,
    USER_PASSWORD_CHANGED,
    USER_LOGIN,
    USER_LOGOUT,
    # Asset events
    ASSET_UPLOADED,
    ASSET_PROCESSED,
    ASSET_UPDATED,
    ASSET_DELETED,
    ASSET_DOWNLOADED,
    ASSET_TAGGED,
    ASSET_FACE_DETECTED,
    # Gallery events
    GALLERY_CREATED,
    GALLERY_UPDATED,
    GALLERY_PUBLISHED,
    GALLERY_UNPUBLISHED,
    GALLERY_DELETED,
    GALLERY_SHARED,
    GALLERY_VIEWED,
    GALLERY_DOWNLOADED,
    GALLERY_EXPIRED,
    GALLERY_SELECTION_SUBMITTED,
    GALLERY_COMMENT_ADDED,
    # Invitation events
    INVITATION_CREATED,
    INVITATION_SENT,
    INVITATION_VIEWED,
    INVITATION_RSVP_RECEIVED,
    INVITATION_RSVP_UPDATED,
    INVITATION_EXPIRED,
    # Client events
    CLIENT_CREATED,
    CLIENT_UPDATED,
    CLIENT_DELETED,
    CLIENT_GALLERY_ACCESSED,
    CLIENT_PHOTO_FAVORITED,
    CLIENT_SELECTION_MADE,
]

# Lookup dictionaries
EVENT_BY_TYPE: dict[str, EventTypeDefinition] = {e.event_type: e for e in ALL_EVENTS}

EVENTS_BY_CATEGORY: dict[str, list[EventTypeDefinition]] = {}
for event in ALL_EVENTS:
    if event.category not in EVENTS_BY_CATEGORY:
        EVENTS_BY_CATEGORY[event.category] = []
    EVENTS_BY_CATEGORY[event.category].append(event)

CATEGORIES: list[str] = list(EVENTS_BY_CATEGORY.keys())


def get_event_type(event_type: str) -> EventTypeDefinition | None:
    """Get event type definition by event type string."""
    return EVENT_BY_TYPE.get(event_type)


def get_events_by_category(category: str) -> list[EventTypeDefinition]:
    """Get all event types for a category."""
    return EVENTS_BY_CATEGORY.get(category, [])


def get_all_event_types() -> list[str]:
    """Get all event type strings."""
    return list(EVENT_BY_TYPE.keys())


def is_valid_event_type(event_type: str) -> bool:
    """Check if event type is valid."""
    return event_type in EVENT_BY_TYPE


# =============================================================================
# HELPER FUNCTIONS (aliases and utilities for common lookups)
# =============================================================================

def get_event_types_for_category(category: str) -> list[EventTypeDefinition]:
    """Get all event types for a category. Alias for get_events_by_category."""
    return get_events_by_category(category)


def get_all_categories() -> list[str]:
    """Get list of all event categories."""
    return CATEGORIES.copy()


def get_event_schema(event_type: str) -> dict[str, Any] | None:
    """Get the JSON schema for an event type."""
    event = get_event_type(event_type)
    return event.payload_schema if event else None


def get_sample_payload(event_type: str) -> dict[str, Any] | None:
    """Get a sample payload for an event type."""
    event = get_event_type(event_type)
    return event.sample_payload if event else None
