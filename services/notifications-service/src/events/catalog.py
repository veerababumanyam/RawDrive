"""Notification Event Catalog for the Notifications & Communication Microservice.

This module provides a comprehensive catalog of all notification event types that can
trigger notifications in the RawDrive platform. The catalog serves as the central
source of truth for:

- Event type definitions and their human-readable names
- Category mappings for each event type
- Default channel and priority configurations
- Template associations for each event type
- Payload schema definitions
- Transactional vs. marketing classification

The catalog enables:
- Type-safe event handling throughout the system
- Consistent notification routing and processing
- Easy lookup of event metadata for templates and routing
- Documentation of all supported notification events
- Validation of incoming notification requests

Features:
- Gallery events (published, shared, commented, etc.)
- Client interaction events (download, favorite, RSVP, etc.)
- Billing events (payment success/failure, subscription changes)
- System events (security alerts, verification emails)
- Marketing events (campaigns, newsletters)
- Invitation events (sent, accepted, rejected)

Feature: Notifications & Communication Microservice
Task: T037 - Create notification event catalog
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional

from src.schemas.notification import (
    NotificationCategory,
    NotificationChannel,
    NotificationPriority,
)


# =============================================================================
# EVENT TYPE DEFINITIONS
# =============================================================================


class EventType(str, Enum):
    """All supported notification event types in the RawDrive platform.

    Event types follow a namespaced convention: {domain}.{action}
    Examples:
        - gallery.published
        - billing.payment_failed
        - system.security_alert

    This enum ensures type safety and provides autocomplete support.
    """

    # -------------------------------------------------------------------------
    # Gallery Events - When galleries or photos change
    # -------------------------------------------------------------------------
    GALLERY_PUBLISHED = "gallery.published"
    GALLERY_SHARED = "gallery.shared"
    GALLERY_UPDATED = "gallery.updated"
    GALLERY_EXPIRING = "gallery.expiring"
    GALLERY_EXPIRED = "gallery.expired"
    GALLERY_COMMENTED = "gallery.commented"
    GALLERY_FAVORITE = "gallery.favorite"
    GALLERY_DOWNLOADED = "gallery.downloaded"
    GALLERY_SELECTION_SUBMITTED = "gallery.selection_submitted"
    GALLERY_SELECTION_APPROVED = "gallery.selection_approved"

    # -------------------------------------------------------------------------
    # Photo Events - Individual photo interactions
    # -------------------------------------------------------------------------
    PHOTO_COMMENTED = "photo.commented"
    PHOTO_FAVORITED = "photo.favorited"
    PHOTO_DOWNLOADED = "photo.downloaded"

    # -------------------------------------------------------------------------
    # Album Events - Album-specific notifications
    # -------------------------------------------------------------------------
    ALBUM_CREATED = "album.created"
    ALBUM_SHARED = "album.shared"
    ALBUM_DOWNLOADED = "album.downloaded"

    # -------------------------------------------------------------------------
    # Client Interaction Events - Client actions and engagement
    # -------------------------------------------------------------------------
    CLIENT_REGISTERED = "client.registered"
    CLIENT_FIRST_LOGIN = "client.first_login"
    CLIENT_MESSAGE = "client.message"
    CLIENT_REPLY = "client.reply"
    CLIENT_DOWNLOAD_COMPLETE = "client.download_complete"
    CLIENT_FAVORITES_SHARED = "client.favorites_shared"

    # -------------------------------------------------------------------------
    # RSVP Events - Save-the-date and event responses
    # -------------------------------------------------------------------------
    RSVP_RECEIVED = "rsvp.received"
    RSVP_UPDATED = "rsvp.updated"
    RSVP_REMINDER = "rsvp.reminder"
    RSVP_DIGEST = "rsvp.digest"

    # -------------------------------------------------------------------------
    # Billing Events - Payment and subscription notifications
    # -------------------------------------------------------------------------
    BILLING_PAYMENT_SUCCESS = "billing.payment_success"
    BILLING_PAYMENT_FAILED = "billing.payment_failed"
    BILLING_PAYMENT_REFUNDED = "billing.payment_refunded"
    BILLING_SUBSCRIPTION_CREATED = "billing.subscription_created"
    BILLING_SUBSCRIPTION_UPGRADED = "billing.subscription_upgraded"
    BILLING_SUBSCRIPTION_DOWNGRADED = "billing.subscription_downgraded"
    BILLING_SUBSCRIPTION_CANCELLED = "billing.subscription_cancelled"
    BILLING_SUBSCRIPTION_RENEWED = "billing.subscription_renewed"
    BILLING_SUBSCRIPTION_EXPIRING = "billing.subscription_expiring"
    BILLING_INVOICE_CREATED = "billing.invoice_created"
    BILLING_INVOICE_PAID = "billing.invoice_paid"
    BILLING_INVOICE_OVERDUE = "billing.invoice_overdue"
    BILLING_TRIAL_ENDING = "billing.trial_ending"
    BILLING_TRIAL_EXPIRED = "billing.trial_expired"
    BILLING_USAGE_WARNING = "billing.usage_warning"
    BILLING_USAGE_LIMIT_REACHED = "billing.usage_limit_reached"

    # -------------------------------------------------------------------------
    # System Events - Platform notifications and alerts
    # -------------------------------------------------------------------------
    SYSTEM_WELCOME = "system.welcome"
    SYSTEM_MAINTENANCE_SCHEDULED = "system.maintenance_scheduled"
    SYSTEM_MAINTENANCE_COMPLETE = "system.maintenance_complete"
    SYSTEM_FEATURE_ANNOUNCEMENT = "system.feature_announcement"
    SYSTEM_POLICY_UPDATE = "system.policy_update"
    SYSTEM_STORAGE_WARNING = "system.storage_warning"
    SYSTEM_STORAGE_FULL = "system.storage_full"

    # -------------------------------------------------------------------------
    # Security Events - Account security notifications
    # -------------------------------------------------------------------------
    SECURITY_LOGIN_NEW_DEVICE = "security.login_new_device"
    SECURITY_LOGIN_NEW_LOCATION = "security.login_new_location"
    SECURITY_PASSWORD_CHANGED = "security.password_changed"
    SECURITY_PASSWORD_RESET_REQUESTED = "security.password_reset_requested"
    SECURITY_PASSWORD_RESET_COMPLETE = "security.password_reset_complete"
    SECURITY_EMAIL_CHANGED = "security.email_changed"
    SECURITY_TWO_FACTOR_ENABLED = "security.two_factor_enabled"
    SECURITY_TWO_FACTOR_DISABLED = "security.two_factor_disabled"
    SECURITY_SUSPICIOUS_ACTIVITY = "security.suspicious_activity"
    SECURITY_ACCOUNT_LOCKED = "security.account_locked"

    # -------------------------------------------------------------------------
    # Verification Events - Email and phone verification
    # -------------------------------------------------------------------------
    VERIFICATION_EMAIL_CONFIRM = "verification.email_confirm"
    VERIFICATION_EMAIL_RESEND = "verification.email_resend"
    VERIFICATION_PHONE_CONFIRM = "verification.phone_confirm"

    # -------------------------------------------------------------------------
    # Invitation Events - Workspace and collaboration invitations
    # -------------------------------------------------------------------------
    INVITATION_SENT = "invitation.sent"
    INVITATION_ACCEPTED = "invitation.accepted"
    INVITATION_DECLINED = "invitation.declined"
    INVITATION_EXPIRED = "invitation.expired"
    INVITATION_REMINDER = "invitation.reminder"
    INVITATION_CANCELLED = "invitation.cancelled"

    # -------------------------------------------------------------------------
    # Workspace Events - Team and workspace management
    # -------------------------------------------------------------------------
    WORKSPACE_MEMBER_ADDED = "workspace.member_added"
    WORKSPACE_MEMBER_REMOVED = "workspace.member_removed"
    WORKSPACE_ROLE_CHANGED = "workspace.role_changed"
    WORKSPACE_SETTINGS_CHANGED = "workspace.settings_changed"

    # -------------------------------------------------------------------------
    # Marketing Events - Promotional communications
    # -------------------------------------------------------------------------
    MARKETING_NEWSLETTER = "marketing.newsletter"
    MARKETING_PROMOTION = "marketing.promotion"
    MARKETING_FEATURE_SPOTLIGHT = "marketing.feature_spotlight"
    MARKETING_SURVEY = "marketing.survey"
    MARKETING_REENGAGEMENT = "marketing.reengagement"

    # -------------------------------------------------------------------------
    # Report Events - Report generation and delivery
    # -------------------------------------------------------------------------
    REPORT_READY = "report.ready"
    REPORT_SCHEDULED = "report.scheduled"
    REPORT_FAILED = "report.failed"

    # -------------------------------------------------------------------------
    # Export Events - Data export notifications
    # -------------------------------------------------------------------------
    EXPORT_READY = "export.ready"
    EXPORT_FAILED = "export.failed"
    EXPORT_EXPIRING = "export.expiring"


# =============================================================================
# EVENT DEFINITION DATA CLASS
# =============================================================================


@dataclass
class EventDefinition:
    """Complete definition of a notification event type.

    This dataclass contains all metadata needed to process a notification
    of a given event type, including routing, templates, and behavior
    configuration.

    Attributes:
        event_type: The event type enum value
        name: Human-readable name for the event
        description: Detailed description of when this event triggers
        category: The notification category for preference matching
        default_channel: Default delivery channel if not specified
        default_priority: Default priority level for processing
        default_template_code: Template code to use for rendering
        is_transactional: Whether this bypasses user preferences
        supports_digest: Whether this can be included in digests
        supports_batch: Whether multiple can be batched together
        cooldown_minutes: Minimum time between notifications of this type
        required_payload_fields: Fields that must be present in payload
        optional_payload_fields: Optional fields that may be in payload
        sample_payload: Example payload for documentation
        tags: Tags for categorization and filtering
    """

    event_type: EventType
    name: str
    description: str
    category: NotificationCategory
    default_channel: NotificationChannel = NotificationChannel.EMAIL
    default_priority: NotificationPriority = NotificationPriority.NORMAL
    default_template_code: Optional[str] = None
    is_transactional: bool = False
    supports_digest: bool = True
    supports_batch: bool = True
    cooldown_minutes: int = 0
    required_payload_fields: list[str] = field(default_factory=list)
    optional_payload_fields: list[str] = field(default_factory=list)
    sample_payload: dict[str, Any] = field(default_factory=dict)
    tags: list[str] = field(default_factory=list)

    @property
    def event_type_str(self) -> str:
        """Get the string value of the event type."""
        return self.event_type.value

    @property
    def template_code(self) -> str:
        """Get the template code, defaulting to event type with underscores."""
        return self.default_template_code or self.event_type.value.replace(".", "_")


# =============================================================================
# EVENT CATALOG
# =============================================================================


# Complete catalog of all notification events
EVENT_CATALOG: dict[EventType, EventDefinition] = {
    # -------------------------------------------------------------------------
    # Gallery Events
    # -------------------------------------------------------------------------
    EventType.GALLERY_PUBLISHED: EventDefinition(
        event_type=EventType.GALLERY_PUBLISHED,
        name="Gallery Published",
        description="Sent to clients when a photographer publishes a new gallery for them",
        category=NotificationCategory.GALLERY_ACTIVITY,
        default_priority=NotificationPriority.HIGH,
        is_transactional=False,
        supports_digest=True,
        required_payload_fields=["gallery_id", "gallery_name", "gallery_url"],
        optional_payload_fields=["photographer_name", "photo_count", "expiry_date", "cover_photo_url"],
        sample_payload={
            "gallery_id": "uuid",
            "gallery_name": "Wedding Photos - Smith Family",
            "gallery_url": "https://gallery.rawdrive.io/abc123",
            "photographer_name": "John Smith Photography",
            "photo_count": 250,
            "cover_photo_url": "https://cdn.rawdrive.io/cover.jpg",
        },
        tags=["client-facing", "high-engagement"],
    ),
    EventType.GALLERY_SHARED: EventDefinition(
        event_type=EventType.GALLERY_SHARED,
        name="Gallery Shared",
        description="Sent when someone shares a gallery with another person",
        category=NotificationCategory.GALLERY_ACTIVITY,
        default_priority=NotificationPriority.NORMAL,
        required_payload_fields=["gallery_id", "gallery_name", "shared_by_name"],
        optional_payload_fields=["message", "gallery_url"],
        tags=["client-facing", "social"],
    ),
    EventType.GALLERY_UPDATED: EventDefinition(
        event_type=EventType.GALLERY_UPDATED,
        name="Gallery Updated",
        description="Sent when new photos are added to an existing gallery",
        category=NotificationCategory.GALLERY_ACTIVITY,
        default_priority=NotificationPriority.NORMAL,
        supports_digest=True,
        cooldown_minutes=60,  # Don't spam for multiple updates
        required_payload_fields=["gallery_id", "gallery_name", "new_photo_count"],
        optional_payload_fields=["gallery_url", "total_photo_count"],
        tags=["client-facing"],
    ),
    EventType.GALLERY_EXPIRING: EventDefinition(
        event_type=EventType.GALLERY_EXPIRING,
        name="Gallery Expiring Soon",
        description="Warning sent before a gallery expires and is no longer accessible",
        category=NotificationCategory.GALLERY_ACTIVITY,
        default_priority=NotificationPriority.HIGH,
        is_transactional=False,
        supports_digest=False,  # Urgent - should be immediate
        required_payload_fields=["gallery_id", "gallery_name", "expiry_date", "days_remaining"],
        optional_payload_fields=["gallery_url", "download_url"],
        sample_payload={
            "gallery_id": "uuid",
            "gallery_name": "Wedding Photos",
            "expiry_date": "2025-02-01T00:00:00Z",
            "days_remaining": 7,
            "gallery_url": "https://gallery.rawdrive.io/abc123",
        },
        tags=["client-facing", "time-sensitive", "action-required"],
    ),
    EventType.GALLERY_EXPIRED: EventDefinition(
        event_type=EventType.GALLERY_EXPIRED,
        name="Gallery Expired",
        description="Notification when a gallery has expired",
        category=NotificationCategory.GALLERY_ACTIVITY,
        default_priority=NotificationPriority.NORMAL,
        required_payload_fields=["gallery_id", "gallery_name"],
        tags=["client-facing"],
    ),
    EventType.GALLERY_COMMENTED: EventDefinition(
        event_type=EventType.GALLERY_COMMENTED,
        name="New Gallery Comment",
        description="Sent when someone comments on a gallery",
        category=NotificationCategory.CLIENT_INTERACTIONS,
        default_priority=NotificationPriority.NORMAL,
        supports_digest=True,
        cooldown_minutes=5,
        required_payload_fields=["gallery_id", "gallery_name", "commenter_name", "comment_preview"],
        optional_payload_fields=["comment_id", "gallery_url", "photo_id"],
        tags=["engagement", "social"],
    ),
    EventType.GALLERY_FAVORITE: EventDefinition(
        event_type=EventType.GALLERY_FAVORITE,
        name="Gallery Favorited",
        description="Sent to photographer when a client favorites photos in a gallery",
        category=NotificationCategory.CLIENT_INTERACTIONS,
        default_priority=NotificationPriority.LOW,
        supports_digest=True,
        cooldown_minutes=30,
        required_payload_fields=["gallery_id", "gallery_name", "favorite_count"],
        optional_payload_fields=["client_name", "photo_ids"],
        tags=["engagement", "photographer-facing"],
    ),
    EventType.GALLERY_DOWNLOADED: EventDefinition(
        event_type=EventType.GALLERY_DOWNLOADED,
        name="Gallery Downloaded",
        description="Sent to photographer when a client downloads from a gallery",
        category=NotificationCategory.CLIENT_INTERACTIONS,
        default_priority=NotificationPriority.LOW,
        supports_digest=True,
        cooldown_minutes=60,
        required_payload_fields=["gallery_id", "gallery_name", "download_type"],
        optional_payload_fields=["client_name", "photo_count", "download_size_mb"],
        tags=["engagement", "photographer-facing"],
    ),
    EventType.GALLERY_SELECTION_SUBMITTED: EventDefinition(
        event_type=EventType.GALLERY_SELECTION_SUBMITTED,
        name="Selection Submitted",
        description="Sent to photographer when client submits their photo selections",
        category=NotificationCategory.CLIENT_INTERACTIONS,
        default_priority=NotificationPriority.HIGH,
        supports_digest=False,
        required_payload_fields=["gallery_id", "gallery_name", "selection_count", "client_name"],
        optional_payload_fields=["notes", "submission_deadline"],
        tags=["action-required", "photographer-facing"],
    ),
    EventType.GALLERY_SELECTION_APPROVED: EventDefinition(
        event_type=EventType.GALLERY_SELECTION_APPROVED,
        name="Selection Approved",
        description="Sent to client when photographer approves their selections",
        category=NotificationCategory.GALLERY_ACTIVITY,
        default_priority=NotificationPriority.HIGH,
        required_payload_fields=["gallery_id", "gallery_name", "approved_count"],
        optional_payload_fields=["download_url", "next_steps"],
        tags=["client-facing", "milestone"],
    ),

    # -------------------------------------------------------------------------
    # Photo Events
    # -------------------------------------------------------------------------
    EventType.PHOTO_COMMENTED: EventDefinition(
        event_type=EventType.PHOTO_COMMENTED,
        name="New Photo Comment",
        description="Sent when someone comments on a specific photo",
        category=NotificationCategory.CLIENT_INTERACTIONS,
        default_priority=NotificationPriority.NORMAL,
        supports_digest=True,
        cooldown_minutes=5,
        required_payload_fields=["photo_id", "gallery_id", "commenter_name", "comment_preview"],
        optional_payload_fields=["photo_url", "gallery_name"],
        tags=["engagement", "social"],
    ),
    EventType.PHOTO_FAVORITED: EventDefinition(
        event_type=EventType.PHOTO_FAVORITED,
        name="Photo Favorited",
        description="Sent when someone favorites a specific photo",
        category=NotificationCategory.CLIENT_INTERACTIONS,
        default_priority=NotificationPriority.LOW,
        supports_digest=True,
        cooldown_minutes=30,
        required_payload_fields=["photo_id", "gallery_id"],
        optional_payload_fields=["user_name", "photo_url"],
        tags=["engagement"],
    ),
    EventType.PHOTO_DOWNLOADED: EventDefinition(
        event_type=EventType.PHOTO_DOWNLOADED,
        name="Photo Downloaded",
        description="Sent when someone downloads a specific photo",
        category=NotificationCategory.CLIENT_INTERACTIONS,
        default_priority=NotificationPriority.LOW,
        supports_digest=True,
        cooldown_minutes=60,
        required_payload_fields=["photo_id", "gallery_id"],
        optional_payload_fields=["client_name", "download_quality"],
        tags=["engagement", "photographer-facing"],
    ),

    # -------------------------------------------------------------------------
    # Client Events
    # -------------------------------------------------------------------------
    EventType.CLIENT_REGISTERED: EventDefinition(
        event_type=EventType.CLIENT_REGISTERED,
        name="New Client Registered",
        description="Sent to photographer when a new client creates an account",
        category=NotificationCategory.CLIENT_INTERACTIONS,
        default_priority=NotificationPriority.NORMAL,
        required_payload_fields=["client_name", "client_email"],
        optional_payload_fields=["source_gallery_id", "registration_source"],
        tags=["photographer-facing", "new-user"],
    ),
    EventType.CLIENT_FIRST_LOGIN: EventDefinition(
        event_type=EventType.CLIENT_FIRST_LOGIN,
        name="Client First Login",
        description="Sent to photographer when a client logs in for the first time",
        category=NotificationCategory.CLIENT_INTERACTIONS,
        default_priority=NotificationPriority.LOW,
        supports_digest=True,
        required_payload_fields=["client_name", "gallery_id"],
        optional_payload_fields=["gallery_name"],
        tags=["photographer-facing", "engagement"],
    ),
    EventType.CLIENT_MESSAGE: EventDefinition(
        event_type=EventType.CLIENT_MESSAGE,
        name="New Client Message",
        description="Sent when a client sends a message to the photographer",
        category=NotificationCategory.CLIENT_INTERACTIONS,
        default_priority=NotificationPriority.HIGH,
        supports_digest=False,  # Messages should be immediate
        required_payload_fields=["client_name", "message_preview"],
        optional_payload_fields=["message_id", "gallery_id", "reply_url"],
        tags=["photographer-facing", "action-required"],
    ),
    EventType.CLIENT_REPLY: EventDefinition(
        event_type=EventType.CLIENT_REPLY,
        name="Message Reply",
        description="Sent when someone replies to a message",
        category=NotificationCategory.CLIENT_INTERACTIONS,
        default_priority=NotificationPriority.NORMAL,
        required_payload_fields=["sender_name", "message_preview"],
        optional_payload_fields=["message_id", "thread_id", "reply_url"],
        tags=["communication"],
    ),
    EventType.CLIENT_DOWNLOAD_COMPLETE: EventDefinition(
        event_type=EventType.CLIENT_DOWNLOAD_COMPLETE,
        name="Download Ready",
        description="Sent to client when their requested download is ready",
        category=NotificationCategory.GALLERY_ACTIVITY,
        default_priority=NotificationPriority.HIGH,
        is_transactional=True,
        supports_digest=False,
        required_payload_fields=["download_url", "expiry_hours"],
        optional_payload_fields=["gallery_name", "photo_count", "file_size_mb"],
        tags=["client-facing", "action-required"],
    ),
    EventType.CLIENT_FAVORITES_SHARED: EventDefinition(
        event_type=EventType.CLIENT_FAVORITES_SHARED,
        name="Favorites Shared",
        description="Sent to photographer when client shares their favorites",
        category=NotificationCategory.CLIENT_INTERACTIONS,
        default_priority=NotificationPriority.NORMAL,
        required_payload_fields=["client_name", "favorite_count", "gallery_id"],
        optional_payload_fields=["gallery_name", "view_url"],
        tags=["photographer-facing", "engagement"],
    ),

    # -------------------------------------------------------------------------
    # RSVP Events
    # -------------------------------------------------------------------------
    EventType.RSVP_RECEIVED: EventDefinition(
        event_type=EventType.RSVP_RECEIVED,
        name="RSVP Received",
        description="Sent to host when a guest submits an RSVP",
        category=NotificationCategory.CLIENT_INTERACTIONS,
        default_priority=NotificationPriority.NORMAL,
        default_template_code="rsvp_host_immediate",
        supports_digest=True,
        cooldown_minutes=0,
        required_payload_fields=["guest_name", "attending", "party_size", "invitation_title"],
        optional_payload_fields=[
            "dietary_preferences", "message", "dashboard_link",
            "status_text", "invitation_id"
        ],
        sample_payload={
            "guest_name": "Jane Smith",
            "attending": True,
            "party_size": 2,
            "invitation_title": "Wedding Reception",
            "status_text": "Attending",
            "dietary_preferences": "Vegetarian",
            "message": "Looking forward to it!",
            "dashboard_link": "https://rawdrive.io/invitations/abc123/rsvps",
        },
        tags=["save-the-date", "event-host"],
    ),
    EventType.RSVP_UPDATED: EventDefinition(
        event_type=EventType.RSVP_UPDATED,
        name="RSVP Updated",
        description="Sent to host when a guest updates their RSVP response",
        category=NotificationCategory.CLIENT_INTERACTIONS,
        default_priority=NotificationPriority.NORMAL,
        supports_digest=True,
        required_payload_fields=["guest_name", "attending", "invitation_title", "previous_response"],
        optional_payload_fields=["party_size", "dashboard_link"],
        tags=["save-the-date", "event-host"],
    ),
    EventType.RSVP_REMINDER: EventDefinition(
        event_type=EventType.RSVP_REMINDER,
        name="RSVP Reminder",
        description="Reminder sent to guests who haven't responded yet",
        category=NotificationCategory.INVITATION,
        default_priority=NotificationPriority.NORMAL,
        supports_digest=False,
        required_payload_fields=["invitation_title", "deadline_date", "rsvp_url"],
        optional_payload_fields=["event_date", "venue_name", "host_name"],
        tags=["save-the-date", "guest-facing", "action-required"],
    ),
    EventType.RSVP_DIGEST: EventDefinition(
        event_type=EventType.RSVP_DIGEST,
        name="RSVP Daily Digest",
        description="Daily summary of RSVP responses for event hosts",
        category=NotificationCategory.CLIENT_INTERACTIONS,
        default_priority=NotificationPriority.NORMAL,
        default_template_code="rsvp_host_digest",
        supports_digest=False,  # This IS the digest
        required_payload_fields=[
            "invitation_title", "rsvp_count", "attending_count",
            "not_attending_count", "total_party_size", "rsvps"
        ],
        optional_payload_fields=["dashboard_link"],
        tags=["save-the-date", "event-host", "digest"],
    ),

    # -------------------------------------------------------------------------
    # Billing Events
    # -------------------------------------------------------------------------
    EventType.BILLING_PAYMENT_SUCCESS: EventDefinition(
        event_type=EventType.BILLING_PAYMENT_SUCCESS,
        name="Payment Successful",
        description="Confirmation when a payment processes successfully",
        category=NotificationCategory.BILLING,
        default_priority=NotificationPriority.HIGH,
        is_transactional=True,
        supports_digest=False,
        required_payload_fields=["amount", "currency", "payment_date"],
        optional_payload_fields=["invoice_id", "payment_method", "receipt_url"],
        sample_payload={
            "amount": "29.00",
            "currency": "USD",
            "payment_date": "2025-01-07T10:00:00Z",
            "invoice_id": "INV-2025-001",
            "receipt_url": "https://billing.rawdrive.io/receipts/abc123",
        },
        tags=["transactional", "billing"],
    ),
    EventType.BILLING_PAYMENT_FAILED: EventDefinition(
        event_type=EventType.BILLING_PAYMENT_FAILED,
        name="Payment Failed",
        description="Alert when a payment fails to process",
        category=NotificationCategory.BILLING,
        default_priority=NotificationPriority.URGENT,
        is_transactional=True,
        supports_digest=False,
        required_payload_fields=["amount", "currency", "failure_reason"],
        optional_payload_fields=["invoice_id", "retry_date", "update_payment_url"],
        tags=["transactional", "billing", "action-required"],
    ),
    EventType.BILLING_PAYMENT_REFUNDED: EventDefinition(
        event_type=EventType.BILLING_PAYMENT_REFUNDED,
        name="Payment Refunded",
        description="Notification when a refund is processed",
        category=NotificationCategory.BILLING,
        default_priority=NotificationPriority.HIGH,
        is_transactional=True,
        supports_digest=False,
        required_payload_fields=["amount", "currency", "refund_reason"],
        optional_payload_fields=["original_payment_date", "refund_id"],
        tags=["transactional", "billing"],
    ),
    EventType.BILLING_SUBSCRIPTION_CREATED: EventDefinition(
        event_type=EventType.BILLING_SUBSCRIPTION_CREATED,
        name="Subscription Created",
        description="Welcome email when a new subscription starts",
        category=NotificationCategory.BILLING,
        default_priority=NotificationPriority.HIGH,
        is_transactional=True,
        supports_digest=False,
        required_payload_fields=["plan_name", "amount", "billing_cycle"],
        optional_payload_fields=["trial_days", "next_billing_date", "features"],
        tags=["transactional", "billing", "onboarding"],
    ),
    EventType.BILLING_SUBSCRIPTION_UPGRADED: EventDefinition(
        event_type=EventType.BILLING_SUBSCRIPTION_UPGRADED,
        name="Subscription Upgraded",
        description="Confirmation of subscription plan upgrade",
        category=NotificationCategory.BILLING,
        default_priority=NotificationPriority.NORMAL,
        is_transactional=True,
        required_payload_fields=["old_plan", "new_plan", "effective_date"],
        optional_payload_fields=["price_difference", "new_features"],
        tags=["transactional", "billing"],
    ),
    EventType.BILLING_SUBSCRIPTION_DOWNGRADED: EventDefinition(
        event_type=EventType.BILLING_SUBSCRIPTION_DOWNGRADED,
        name="Subscription Downgraded",
        description="Confirmation of subscription plan downgrade",
        category=NotificationCategory.BILLING,
        default_priority=NotificationPriority.NORMAL,
        is_transactional=True,
        required_payload_fields=["old_plan", "new_plan", "effective_date"],
        optional_payload_fields=["features_losing"],
        tags=["transactional", "billing"],
    ),
    EventType.BILLING_SUBSCRIPTION_CANCELLED: EventDefinition(
        event_type=EventType.BILLING_SUBSCRIPTION_CANCELLED,
        name="Subscription Cancelled",
        description="Confirmation when subscription is cancelled",
        category=NotificationCategory.BILLING,
        default_priority=NotificationPriority.HIGH,
        is_transactional=True,
        supports_digest=False,
        required_payload_fields=["plan_name", "cancellation_date", "access_until"],
        optional_payload_fields=["cancellation_reason", "reactivate_url"],
        tags=["transactional", "billing"],
    ),
    EventType.BILLING_SUBSCRIPTION_RENEWED: EventDefinition(
        event_type=EventType.BILLING_SUBSCRIPTION_RENEWED,
        name="Subscription Renewed",
        description="Notification when subscription auto-renews",
        category=NotificationCategory.BILLING,
        default_priority=NotificationPriority.NORMAL,
        is_transactional=True,
        required_payload_fields=["plan_name", "amount", "next_billing_date"],
        optional_payload_fields=["receipt_url"],
        tags=["transactional", "billing"],
    ),
    EventType.BILLING_SUBSCRIPTION_EXPIRING: EventDefinition(
        event_type=EventType.BILLING_SUBSCRIPTION_EXPIRING,
        name="Subscription Expiring",
        description="Warning before subscription expires",
        category=NotificationCategory.BILLING,
        default_priority=NotificationPriority.HIGH,
        is_transactional=True,
        supports_digest=False,
        required_payload_fields=["plan_name", "expiry_date", "days_remaining"],
        optional_payload_fields=["renewal_url", "upgrade_url"],
        tags=["transactional", "billing", "action-required"],
    ),
    EventType.BILLING_INVOICE_CREATED: EventDefinition(
        event_type=EventType.BILLING_INVOICE_CREATED,
        name="Invoice Created",
        description="Notification when a new invoice is generated",
        category=NotificationCategory.BILLING,
        default_priority=NotificationPriority.NORMAL,
        is_transactional=True,
        required_payload_fields=["invoice_id", "amount", "due_date"],
        optional_payload_fields=["invoice_url", "items"],
        tags=["transactional", "billing"],
    ),
    EventType.BILLING_INVOICE_PAID: EventDefinition(
        event_type=EventType.BILLING_INVOICE_PAID,
        name="Invoice Paid",
        description="Confirmation when an invoice is paid",
        category=NotificationCategory.BILLING,
        default_priority=NotificationPriority.NORMAL,
        is_transactional=True,
        required_payload_fields=["invoice_id", "amount", "payment_date"],
        optional_payload_fields=["receipt_url"],
        tags=["transactional", "billing"],
    ),
    EventType.BILLING_INVOICE_OVERDUE: EventDefinition(
        event_type=EventType.BILLING_INVOICE_OVERDUE,
        name="Invoice Overdue",
        description="Alert when an invoice is past due",
        category=NotificationCategory.BILLING,
        default_priority=NotificationPriority.URGENT,
        is_transactional=True,
        supports_digest=False,
        required_payload_fields=["invoice_id", "amount", "due_date", "days_overdue"],
        optional_payload_fields=["payment_url", "late_fee"],
        tags=["transactional", "billing", "action-required"],
    ),
    EventType.BILLING_TRIAL_ENDING: EventDefinition(
        event_type=EventType.BILLING_TRIAL_ENDING,
        name="Trial Ending Soon",
        description="Reminder before trial period ends",
        category=NotificationCategory.BILLING,
        default_priority=NotificationPriority.HIGH,
        is_transactional=True,
        supports_digest=False,
        required_payload_fields=["trial_end_date", "days_remaining"],
        optional_payload_fields=["plan_name", "upgrade_url", "features_used"],
        tags=["transactional", "billing", "action-required"],
    ),
    EventType.BILLING_TRIAL_EXPIRED: EventDefinition(
        event_type=EventType.BILLING_TRIAL_EXPIRED,
        name="Trial Expired",
        description="Notification when trial period ends",
        category=NotificationCategory.BILLING,
        default_priority=NotificationPriority.HIGH,
        is_transactional=True,
        required_payload_fields=["trial_end_date"],
        optional_payload_fields=["upgrade_url", "data_retention_days"],
        tags=["transactional", "billing"],
    ),
    EventType.BILLING_USAGE_WARNING: EventDefinition(
        event_type=EventType.BILLING_USAGE_WARNING,
        name="Usage Warning",
        description="Alert when approaching usage limits",
        category=NotificationCategory.BILLING,
        default_priority=NotificationPriority.NORMAL,
        required_payload_fields=["resource_type", "current_usage", "limit", "percentage"],
        optional_payload_fields=["upgrade_url", "usage_reset_date"],
        tags=["billing", "usage"],
    ),
    EventType.BILLING_USAGE_LIMIT_REACHED: EventDefinition(
        event_type=EventType.BILLING_USAGE_LIMIT_REACHED,
        name="Usage Limit Reached",
        description="Alert when usage limit is reached",
        category=NotificationCategory.BILLING,
        default_priority=NotificationPriority.HIGH,
        is_transactional=True,
        supports_digest=False,
        required_payload_fields=["resource_type", "limit"],
        optional_payload_fields=["upgrade_url", "usage_reset_date", "overage_rate"],
        tags=["transactional", "billing", "usage", "action-required"],
    ),

    # -------------------------------------------------------------------------
    # System Events
    # -------------------------------------------------------------------------
    EventType.SYSTEM_WELCOME: EventDefinition(
        event_type=EventType.SYSTEM_WELCOME,
        name="Welcome",
        description="Welcome email for new users",
        category=NotificationCategory.SYSTEM_ALERTS,
        default_priority=NotificationPriority.HIGH,
        is_transactional=True,
        supports_digest=False,
        required_payload_fields=["user_name"],
        optional_payload_fields=["getting_started_url", "support_url", "features"],
        tags=["transactional", "onboarding"],
    ),
    EventType.SYSTEM_MAINTENANCE_SCHEDULED: EventDefinition(
        event_type=EventType.SYSTEM_MAINTENANCE_SCHEDULED,
        name="Scheduled Maintenance",
        description="Advance notice of planned maintenance",
        category=NotificationCategory.SYSTEM_ALERTS,
        default_priority=NotificationPriority.NORMAL,
        required_payload_fields=["maintenance_start", "maintenance_end", "affected_services"],
        optional_payload_fields=["reason", "status_page_url"],
        tags=["system", "maintenance"],
    ),
    EventType.SYSTEM_MAINTENANCE_COMPLETE: EventDefinition(
        event_type=EventType.SYSTEM_MAINTENANCE_COMPLETE,
        name="Maintenance Complete",
        description="Notification that maintenance is finished",
        category=NotificationCategory.SYSTEM_ALERTS,
        default_priority=NotificationPriority.LOW,
        required_payload_fields=["maintenance_end"],
        optional_payload_fields=["summary", "status_page_url"],
        tags=["system", "maintenance"],
    ),
    EventType.SYSTEM_FEATURE_ANNOUNCEMENT: EventDefinition(
        event_type=EventType.SYSTEM_FEATURE_ANNOUNCEMENT,
        name="New Feature",
        description="Announcement of new platform features",
        category=NotificationCategory.SYSTEM_ALERTS,
        default_priority=NotificationPriority.LOW,
        supports_digest=True,
        required_payload_fields=["feature_name", "feature_description"],
        optional_payload_fields=["learn_more_url", "try_it_url", "video_url"],
        tags=["product", "announcement"],
    ),
    EventType.SYSTEM_POLICY_UPDATE: EventDefinition(
        event_type=EventType.SYSTEM_POLICY_UPDATE,
        name="Policy Update",
        description="Notification of terms or privacy policy updates",
        category=NotificationCategory.SYSTEM_ALERTS,
        default_priority=NotificationPriority.NORMAL,
        is_transactional=True,
        required_payload_fields=["policy_type", "effective_date"],
        optional_payload_fields=["summary", "full_policy_url"],
        tags=["transactional", "legal"],
    ),
    EventType.SYSTEM_STORAGE_WARNING: EventDefinition(
        event_type=EventType.SYSTEM_STORAGE_WARNING,
        name="Storage Warning",
        description="Alert when approaching storage limit",
        category=NotificationCategory.SYSTEM_ALERTS,
        default_priority=NotificationPriority.NORMAL,
        required_payload_fields=["current_usage_gb", "limit_gb", "percentage"],
        optional_payload_fields=["upgrade_url", "cleanup_suggestions"],
        tags=["usage", "action-required"],
    ),
    EventType.SYSTEM_STORAGE_FULL: EventDefinition(
        event_type=EventType.SYSTEM_STORAGE_FULL,
        name="Storage Full",
        description="Alert when storage limit is reached",
        category=NotificationCategory.SYSTEM_ALERTS,
        default_priority=NotificationPriority.URGENT,
        is_transactional=True,
        supports_digest=False,
        required_payload_fields=["current_usage_gb", "limit_gb"],
        optional_payload_fields=["upgrade_url", "cleanup_url"],
        tags=["transactional", "usage", "action-required"],
    ),

    # -------------------------------------------------------------------------
    # Security Events
    # -------------------------------------------------------------------------
    EventType.SECURITY_LOGIN_NEW_DEVICE: EventDefinition(
        event_type=EventType.SECURITY_LOGIN_NEW_DEVICE,
        name="New Device Login",
        description="Alert when account is accessed from a new device",
        category=NotificationCategory.SYSTEM_ALERTS,
        default_priority=NotificationPriority.HIGH,
        is_transactional=True,
        supports_digest=False,
        required_payload_fields=["device_type", "device_name", "login_time"],
        optional_payload_fields=["ip_address", "location", "browser", "secure_account_url"],
        sample_payload={
            "device_type": "desktop",
            "device_name": "Chrome on Windows",
            "login_time": "2025-01-07T10:30:00Z",
            "location": "New York, US",
            "ip_address": "203.0.113.42",
        },
        tags=["transactional", "security"],
    ),
    EventType.SECURITY_LOGIN_NEW_LOCATION: EventDefinition(
        event_type=EventType.SECURITY_LOGIN_NEW_LOCATION,
        name="New Location Login",
        description="Alert when account is accessed from an unusual location",
        category=NotificationCategory.SYSTEM_ALERTS,
        default_priority=NotificationPriority.HIGH,
        is_transactional=True,
        supports_digest=False,
        required_payload_fields=["location", "login_time"],
        optional_payload_fields=["device_name", "ip_address", "secure_account_url"],
        tags=["transactional", "security"],
    ),
    EventType.SECURITY_PASSWORD_CHANGED: EventDefinition(
        event_type=EventType.SECURITY_PASSWORD_CHANGED,
        name="Password Changed",
        description="Confirmation when password is changed",
        category=NotificationCategory.SYSTEM_ALERTS,
        default_priority=NotificationPriority.HIGH,
        is_transactional=True,
        supports_digest=False,
        required_payload_fields=["change_time"],
        optional_payload_fields=["device_name", "location", "secure_account_url"],
        tags=["transactional", "security"],
    ),
    EventType.SECURITY_PASSWORD_RESET_REQUESTED: EventDefinition(
        event_type=EventType.SECURITY_PASSWORD_RESET_REQUESTED,
        name="Password Reset Requested",
        description="Email with password reset link",
        category=NotificationCategory.SYSTEM_ALERTS,
        default_priority=NotificationPriority.URGENT,
        is_transactional=True,
        supports_digest=False,
        required_payload_fields=["reset_link", "expiry_minutes"],
        optional_payload_fields=["ip_address", "location"],
        tags=["transactional", "security", "action-required"],
    ),
    EventType.SECURITY_PASSWORD_RESET_COMPLETE: EventDefinition(
        event_type=EventType.SECURITY_PASSWORD_RESET_COMPLETE,
        name="Password Reset Complete",
        description="Confirmation that password was reset",
        category=NotificationCategory.SYSTEM_ALERTS,
        default_priority=NotificationPriority.HIGH,
        is_transactional=True,
        supports_digest=False,
        required_payload_fields=["reset_time"],
        optional_payload_fields=["device_name", "location", "secure_account_url"],
        tags=["transactional", "security"],
    ),
    EventType.SECURITY_EMAIL_CHANGED: EventDefinition(
        event_type=EventType.SECURITY_EMAIL_CHANGED,
        name="Email Changed",
        description="Alert when account email is changed (sent to both old and new)",
        category=NotificationCategory.SYSTEM_ALERTS,
        default_priority=NotificationPriority.HIGH,
        is_transactional=True,
        supports_digest=False,
        required_payload_fields=["old_email", "new_email", "change_time"],
        optional_payload_fields=["revert_url", "secure_account_url"],
        tags=["transactional", "security"],
    ),
    EventType.SECURITY_TWO_FACTOR_ENABLED: EventDefinition(
        event_type=EventType.SECURITY_TWO_FACTOR_ENABLED,
        name="Two-Factor Enabled",
        description="Confirmation when 2FA is enabled",
        category=NotificationCategory.SYSTEM_ALERTS,
        default_priority=NotificationPriority.NORMAL,
        is_transactional=True,
        required_payload_fields=["enabled_time", "method"],
        optional_payload_fields=["backup_codes_url"],
        tags=["transactional", "security"],
    ),
    EventType.SECURITY_TWO_FACTOR_DISABLED: EventDefinition(
        event_type=EventType.SECURITY_TWO_FACTOR_DISABLED,
        name="Two-Factor Disabled",
        description="Alert when 2FA is disabled",
        category=NotificationCategory.SYSTEM_ALERTS,
        default_priority=NotificationPriority.HIGH,
        is_transactional=True,
        supports_digest=False,
        required_payload_fields=["disabled_time"],
        optional_payload_fields=["device_name", "location", "re_enable_url"],
        tags=["transactional", "security"],
    ),
    EventType.SECURITY_SUSPICIOUS_ACTIVITY: EventDefinition(
        event_type=EventType.SECURITY_SUSPICIOUS_ACTIVITY,
        name="Suspicious Activity",
        description="Alert when suspicious activity is detected",
        category=NotificationCategory.SYSTEM_ALERTS,
        default_priority=NotificationPriority.URGENT,
        is_transactional=True,
        supports_digest=False,
        required_payload_fields=["activity_type", "activity_time"],
        optional_payload_fields=["ip_address", "location", "details", "secure_account_url"],
        tags=["transactional", "security", "action-required"],
    ),
    EventType.SECURITY_ACCOUNT_LOCKED: EventDefinition(
        event_type=EventType.SECURITY_ACCOUNT_LOCKED,
        name="Account Locked",
        description="Notification when account is locked due to security",
        category=NotificationCategory.SYSTEM_ALERTS,
        default_priority=NotificationPriority.URGENT,
        is_transactional=True,
        supports_digest=False,
        required_payload_fields=["lock_reason", "lock_time"],
        optional_payload_fields=["unlock_url", "support_url", "auto_unlock_time"],
        tags=["transactional", "security", "action-required"],
    ),

    # -------------------------------------------------------------------------
    # Verification Events
    # -------------------------------------------------------------------------
    EventType.VERIFICATION_EMAIL_CONFIRM: EventDefinition(
        event_type=EventType.VERIFICATION_EMAIL_CONFIRM,
        name="Confirm Email",
        description="Email verification link for new accounts",
        category=NotificationCategory.SYSTEM_ALERTS,
        default_priority=NotificationPriority.URGENT,
        is_transactional=True,
        supports_digest=False,
        required_payload_fields=["verification_link", "expiry_hours"],
        optional_payload_fields=["user_name"],
        tags=["transactional", "verification", "action-required"],
    ),
    EventType.VERIFICATION_EMAIL_RESEND: EventDefinition(
        event_type=EventType.VERIFICATION_EMAIL_RESEND,
        name="Verification Resent",
        description="Resent email verification link",
        category=NotificationCategory.SYSTEM_ALERTS,
        default_priority=NotificationPriority.URGENT,
        is_transactional=True,
        supports_digest=False,
        required_payload_fields=["verification_link", "expiry_hours"],
        optional_payload_fields=["user_name", "resend_count"],
        tags=["transactional", "verification", "action-required"],
    ),
    EventType.VERIFICATION_PHONE_CONFIRM: EventDefinition(
        event_type=EventType.VERIFICATION_PHONE_CONFIRM,
        name="Confirm Phone",
        description="Phone verification code via SMS",
        category=NotificationCategory.SYSTEM_ALERTS,
        default_channel=NotificationChannel.SMS,
        default_priority=NotificationPriority.URGENT,
        is_transactional=True,
        supports_digest=False,
        required_payload_fields=["verification_code", "expiry_minutes"],
        tags=["transactional", "verification", "sms"],
    ),

    # -------------------------------------------------------------------------
    # Invitation Events
    # -------------------------------------------------------------------------
    EventType.INVITATION_SENT: EventDefinition(
        event_type=EventType.INVITATION_SENT,
        name="Invitation Sent",
        description="Notification to the invitee about a new invitation",
        category=NotificationCategory.INVITATION,
        default_priority=NotificationPriority.HIGH,
        is_transactional=True,
        supports_digest=False,
        required_payload_fields=["inviter_name", "workspace_name", "accept_url"],
        optional_payload_fields=["role", "message", "expiry_date"],
        sample_payload={
            "inviter_name": "John Smith",
            "workspace_name": "Smith Photography",
            "accept_url": "https://rawdrive.io/invites/accept/abc123",
            "role": "editor",
            "message": "Join our team!",
        },
        tags=["transactional", "invitation"],
    ),
    EventType.INVITATION_ACCEPTED: EventDefinition(
        event_type=EventType.INVITATION_ACCEPTED,
        name="Invitation Accepted",
        description="Notification to inviter that invitation was accepted",
        category=NotificationCategory.INVITATION,
        default_priority=NotificationPriority.NORMAL,
        required_payload_fields=["invitee_name", "workspace_name"],
        optional_payload_fields=["role", "joined_at"],
        tags=["invitation"],
    ),
    EventType.INVITATION_DECLINED: EventDefinition(
        event_type=EventType.INVITATION_DECLINED,
        name="Invitation Declined",
        description="Notification to inviter that invitation was declined",
        category=NotificationCategory.INVITATION,
        default_priority=NotificationPriority.LOW,
        required_payload_fields=["invitee_email", "workspace_name"],
        optional_payload_fields=["decline_reason"],
        tags=["invitation"],
    ),
    EventType.INVITATION_EXPIRED: EventDefinition(
        event_type=EventType.INVITATION_EXPIRED,
        name="Invitation Expired",
        description="Notification that an invitation has expired",
        category=NotificationCategory.INVITATION,
        default_priority=NotificationPriority.LOW,
        required_payload_fields=["invitee_email", "workspace_name", "expiry_date"],
        optional_payload_fields=["reinvite_url"],
        tags=["invitation"],
    ),
    EventType.INVITATION_REMINDER: EventDefinition(
        event_type=EventType.INVITATION_REMINDER,
        name="Invitation Reminder",
        description="Reminder about pending invitation",
        category=NotificationCategory.INVITATION,
        default_priority=NotificationPriority.NORMAL,
        required_payload_fields=["inviter_name", "workspace_name", "accept_url"],
        optional_payload_fields=["days_remaining", "expiry_date"],
        tags=["invitation", "reminder"],
    ),
    EventType.INVITATION_CANCELLED: EventDefinition(
        event_type=EventType.INVITATION_CANCELLED,
        name="Invitation Cancelled",
        description="Notification that an invitation was cancelled",
        category=NotificationCategory.INVITATION,
        default_priority=NotificationPriority.LOW,
        required_payload_fields=["workspace_name"],
        optional_payload_fields=["cancellation_reason"],
        tags=["invitation"],
    ),

    # -------------------------------------------------------------------------
    # Workspace Events
    # -------------------------------------------------------------------------
    EventType.WORKSPACE_MEMBER_ADDED: EventDefinition(
        event_type=EventType.WORKSPACE_MEMBER_ADDED,
        name="Member Added",
        description="Notification when a new member joins the workspace",
        category=NotificationCategory.SYSTEM_ALERTS,
        default_priority=NotificationPriority.NORMAL,
        required_payload_fields=["member_name", "workspace_name", "role"],
        optional_payload_fields=["added_by"],
        tags=["workspace", "team"],
    ),
    EventType.WORKSPACE_MEMBER_REMOVED: EventDefinition(
        event_type=EventType.WORKSPACE_MEMBER_REMOVED,
        name="Member Removed",
        description="Notification when a member is removed from workspace",
        category=NotificationCategory.SYSTEM_ALERTS,
        default_priority=NotificationPriority.NORMAL,
        required_payload_fields=["member_name", "workspace_name"],
        optional_payload_fields=["removed_by", "removal_reason"],
        tags=["workspace", "team"],
    ),
    EventType.WORKSPACE_ROLE_CHANGED: EventDefinition(
        event_type=EventType.WORKSPACE_ROLE_CHANGED,
        name="Role Changed",
        description="Notification when a member's role is changed",
        category=NotificationCategory.SYSTEM_ALERTS,
        default_priority=NotificationPriority.NORMAL,
        required_payload_fields=["member_name", "workspace_name", "old_role", "new_role"],
        optional_payload_fields=["changed_by"],
        tags=["workspace", "team"],
    ),
    EventType.WORKSPACE_SETTINGS_CHANGED: EventDefinition(
        event_type=EventType.WORKSPACE_SETTINGS_CHANGED,
        name="Settings Changed",
        description="Notification when workspace settings are modified",
        category=NotificationCategory.SYSTEM_ALERTS,
        default_priority=NotificationPriority.LOW,
        supports_digest=True,
        required_payload_fields=["workspace_name", "changed_settings"],
        optional_payload_fields=["changed_by"],
        tags=["workspace", "admin"],
    ),

    # -------------------------------------------------------------------------
    # Marketing Events
    # -------------------------------------------------------------------------
    EventType.MARKETING_NEWSLETTER: EventDefinition(
        event_type=EventType.MARKETING_NEWSLETTER,
        name="Newsletter",
        description="Regular newsletter updates",
        category=NotificationCategory.MARKETING,
        default_priority=NotificationPriority.LOW,
        is_transactional=False,
        supports_batch=True,
        required_payload_fields=["subject", "content_html"],
        optional_payload_fields=["content_text", "campaign_id", "preview_text"],
        tags=["marketing", "newsletter"],
    ),
    EventType.MARKETING_PROMOTION: EventDefinition(
        event_type=EventType.MARKETING_PROMOTION,
        name="Promotional Offer",
        description="Special offers and promotions",
        category=NotificationCategory.MARKETING,
        default_priority=NotificationPriority.LOW,
        is_transactional=False,
        supports_batch=True,
        required_payload_fields=["offer_title", "offer_description"],
        optional_payload_fields=["discount_code", "expiry_date", "cta_url", "cta_text"],
        tags=["marketing", "promotional"],
    ),
    EventType.MARKETING_FEATURE_SPOTLIGHT: EventDefinition(
        event_type=EventType.MARKETING_FEATURE_SPOTLIGHT,
        name="Feature Spotlight",
        description="Educational content about features",
        category=NotificationCategory.MARKETING,
        default_priority=NotificationPriority.LOW,
        is_transactional=False,
        supports_digest=True,
        required_payload_fields=["feature_name", "feature_description"],
        optional_payload_fields=["tutorial_url", "video_url"],
        tags=["marketing", "educational"],
    ),
    EventType.MARKETING_SURVEY: EventDefinition(
        event_type=EventType.MARKETING_SURVEY,
        name="Survey Request",
        description="Request to participate in surveys or feedback",
        category=NotificationCategory.MARKETING,
        default_priority=NotificationPriority.LOW,
        is_transactional=False,
        required_payload_fields=["survey_title", "survey_url"],
        optional_payload_fields=["estimated_time", "incentive"],
        tags=["marketing", "feedback"],
    ),
    EventType.MARKETING_REENGAGEMENT: EventDefinition(
        event_type=EventType.MARKETING_REENGAGEMENT,
        name="Re-engagement",
        description="Win-back emails for inactive users",
        category=NotificationCategory.MARKETING,
        default_priority=NotificationPriority.LOW,
        is_transactional=False,
        required_payload_fields=["days_inactive"],
        optional_payload_fields=["special_offer", "whats_new", "cta_url"],
        tags=["marketing", "reengagement"],
    ),

    # -------------------------------------------------------------------------
    # Report Events
    # -------------------------------------------------------------------------
    EventType.REPORT_READY: EventDefinition(
        event_type=EventType.REPORT_READY,
        name="Report Ready",
        description="Notification when a requested report is ready",
        category=NotificationCategory.SYSTEM_ALERTS,
        default_priority=NotificationPriority.NORMAL,
        required_payload_fields=["report_name", "download_url"],
        optional_payload_fields=["report_type", "date_range", "expiry_hours"],
        tags=["reports", "action-required"],
    ),
    EventType.REPORT_SCHEDULED: EventDefinition(
        event_type=EventType.REPORT_SCHEDULED,
        name="Report Scheduled",
        description="Confirmation of scheduled report",
        category=NotificationCategory.SYSTEM_ALERTS,
        default_priority=NotificationPriority.LOW,
        required_payload_fields=["report_name", "schedule"],
        optional_payload_fields=["report_type", "next_run_time"],
        tags=["reports"],
    ),
    EventType.REPORT_FAILED: EventDefinition(
        event_type=EventType.REPORT_FAILED,
        name="Report Failed",
        description="Notification when report generation fails",
        category=NotificationCategory.SYSTEM_ALERTS,
        default_priority=NotificationPriority.NORMAL,
        required_payload_fields=["report_name", "failure_reason"],
        optional_payload_fields=["retry_url", "support_url"],
        tags=["reports", "error"],
    ),

    # -------------------------------------------------------------------------
    # Export Events
    # -------------------------------------------------------------------------
    EventType.EXPORT_READY: EventDefinition(
        event_type=EventType.EXPORT_READY,
        name="Export Ready",
        description="Notification when data export is ready for download",
        category=NotificationCategory.SYSTEM_ALERTS,
        default_priority=NotificationPriority.HIGH,
        is_transactional=True,
        supports_digest=False,
        required_payload_fields=["export_type", "download_url", "expiry_hours"],
        optional_payload_fields=["file_size_mb", "record_count"],
        tags=["export", "action-required"],
    ),
    EventType.EXPORT_FAILED: EventDefinition(
        event_type=EventType.EXPORT_FAILED,
        name="Export Failed",
        description="Notification when data export fails",
        category=NotificationCategory.SYSTEM_ALERTS,
        default_priority=NotificationPriority.NORMAL,
        required_payload_fields=["export_type", "failure_reason"],
        optional_payload_fields=["retry_url", "support_url"],
        tags=["export", "error"],
    ),
    EventType.EXPORT_EXPIRING: EventDefinition(
        event_type=EventType.EXPORT_EXPIRING,
        name="Export Expiring",
        description="Reminder that an export download link is expiring",
        category=NotificationCategory.SYSTEM_ALERTS,
        default_priority=NotificationPriority.NORMAL,
        required_payload_fields=["export_type", "download_url", "hours_remaining"],
        optional_payload_fields=["file_size_mb"],
        tags=["export", "time-sensitive"],
    ),
}


# =============================================================================
# CATALOG HELPER FUNCTIONS
# =============================================================================


def get_event_definition(event_type: str | EventType) -> EventDefinition | None:
    """Get the event definition for an event type.

    Args:
        event_type: Event type string or enum

    Returns:
        EventDefinition or None if not found
    """
    if isinstance(event_type, str):
        try:
            event_type = EventType(event_type)
        except ValueError:
            return None
    return EVENT_CATALOG.get(event_type)


def get_category_for_event(event_type: str | EventType) -> NotificationCategory | None:
    """Get the category for an event type.

    Args:
        event_type: Event type string or enum

    Returns:
        NotificationCategory or None if event not found
    """
    definition = get_event_definition(event_type)
    return definition.category if definition else None


def get_default_channel_for_event(event_type: str | EventType) -> NotificationChannel:
    """Get the default channel for an event type.

    Args:
        event_type: Event type string or enum

    Returns:
        NotificationChannel (defaults to EMAIL if not found)
    """
    definition = get_event_definition(event_type)
    return definition.default_channel if definition else NotificationChannel.EMAIL


def get_default_priority_for_event(event_type: str | EventType) -> NotificationPriority:
    """Get the default priority for an event type.

    Args:
        event_type: Event type string or enum

    Returns:
        NotificationPriority (defaults to NORMAL if not found)
    """
    definition = get_event_definition(event_type)
    return definition.default_priority if definition else NotificationPriority.NORMAL


def get_template_code_for_event(event_type: str | EventType) -> str:
    """Get the template code for an event type.

    Args:
        event_type: Event type string or enum

    Returns:
        Template code (defaults to event_type with underscores)
    """
    definition = get_event_definition(event_type)
    if definition:
        return definition.template_code

    # Fallback: convert event type to template code
    if isinstance(event_type, EventType):
        return event_type.value.replace(".", "_")
    return event_type.replace(".", "_")


def is_transactional_event(event_type: str | EventType) -> bool:
    """Check if an event type is transactional (bypasses preferences).

    Args:
        event_type: Event type string or enum

    Returns:
        True if transactional, False otherwise
    """
    definition = get_event_definition(event_type)
    return definition.is_transactional if definition else False


def supports_digest(event_type: str | EventType) -> bool:
    """Check if an event type can be included in digests.

    Args:
        event_type: Event type string or enum

    Returns:
        True if can be digested, False otherwise
    """
    definition = get_event_definition(event_type)
    return definition.supports_digest if definition else True


def get_cooldown_minutes(event_type: str | EventType) -> int:
    """Get the cooldown period for an event type.

    Args:
        event_type: Event type string or enum

    Returns:
        Cooldown in minutes (0 if no cooldown)
    """
    definition = get_event_definition(event_type)
    return definition.cooldown_minutes if definition else 0


def validate_payload(
    event_type: str | EventType,
    payload: dict[str, Any],
) -> tuple[bool, list[str]]:
    """Validate a payload against the event definition.

    Args:
        event_type: Event type string or enum
        payload: Payload to validate

    Returns:
        Tuple of (is_valid, list of missing required fields)
    """
    definition = get_event_definition(event_type)
    if not definition:
        return True, []  # Unknown events pass validation

    missing_fields = []
    for field in definition.required_payload_fields:
        if field not in payload or payload[field] is None:
            missing_fields.append(field)

    return len(missing_fields) == 0, missing_fields


def get_events_by_category(category: NotificationCategory) -> list[EventDefinition]:
    """Get all event definitions for a category.

    Args:
        category: Notification category

    Returns:
        List of EventDefinition instances
    """
    return [
        definition
        for definition in EVENT_CATALOG.values()
        if definition.category == category
    ]


def get_transactional_events() -> list[EventDefinition]:
    """Get all transactional event definitions.

    Returns:
        List of transactional EventDefinition instances
    """
    return [
        definition
        for definition in EVENT_CATALOG.values()
        if definition.is_transactional
    ]


def get_digestable_events() -> list[EventDefinition]:
    """Get all event definitions that support digests.

    Returns:
        List of digestable EventDefinition instances
    """
    return [
        definition
        for definition in EVENT_CATALOG.values()
        if definition.supports_digest
    ]


def get_events_by_tag(tag: str) -> list[EventDefinition]:
    """Get all event definitions with a specific tag.

    Args:
        tag: Tag to filter by

    Returns:
        List of EventDefinition instances with the tag
    """
    return [
        definition
        for definition in EVENT_CATALOG.values()
        if tag in definition.tags
    ]


def list_all_event_types() -> list[str]:
    """Get a list of all event type strings.

    Returns:
        List of event type strings
    """
    return [event_type.value for event_type in EventType]


def list_all_tags() -> list[str]:
    """Get a list of all unique tags used in the catalog.

    Returns:
        Sorted list of unique tags
    """
    tags = set()
    for definition in EVENT_CATALOG.values():
        tags.update(definition.tags)
    return sorted(tags)


# =============================================================================
# CATEGORY HELPERS
# =============================================================================


CATEGORY_EVENT_PREFIXES: dict[str, NotificationCategory] = {
    "gallery.": NotificationCategory.GALLERY_ACTIVITY,
    "album.": NotificationCategory.GALLERY_ACTIVITY,
    "photo.": NotificationCategory.GALLERY_ACTIVITY,
    "client.": NotificationCategory.CLIENT_INTERACTIONS,
    "rsvp.": NotificationCategory.CLIENT_INTERACTIONS,
    "billing.": NotificationCategory.BILLING,
    "payment.": NotificationCategory.BILLING,
    "subscription.": NotificationCategory.BILLING,
    "invoice.": NotificationCategory.BILLING,
    "system.": NotificationCategory.SYSTEM_ALERTS,
    "security.": NotificationCategory.SYSTEM_ALERTS,
    "verification.": NotificationCategory.SYSTEM_ALERTS,
    "workspace.": NotificationCategory.SYSTEM_ALERTS,
    "report.": NotificationCategory.SYSTEM_ALERTS,
    "export.": NotificationCategory.SYSTEM_ALERTS,
    "marketing.": NotificationCategory.MARKETING,
    "invitation.": NotificationCategory.INVITATION,
    "invite.": NotificationCategory.INVITATION,
}


def infer_category_from_event_type(event_type: str) -> NotificationCategory:
    """Infer the category from an event type string using prefixes.

    Useful for handling custom event types not in the catalog.

    Args:
        event_type: Event type string

    Returns:
        Inferred NotificationCategory
    """
    for prefix, category in CATEGORY_EVENT_PREFIXES.items():
        if event_type.startswith(prefix):
            return category
    return NotificationCategory.SYSTEM_ALERTS


# =============================================================================
# EXPORTS
# =============================================================================


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
