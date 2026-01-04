"""Pydantic schemas for Save The Date digital invitation system.

This module defines request/response schemas for:
- Invitation templates
- Invitations (events)
- RSVP responses
- Guest management
- Check-in operations
- Analytics/stats

Feature: 016-save-the-date
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Literal, Optional
from uuid import UUID

from app.shared.types import EventType as SharedEventType
from app.shared.types import InvitationStatus as SharedInvitationStatus
from app.shared.types import RSVPStatus as SharedRSVPStatus
from app.shared.types import TemplateCategory as SharedTemplateCategory
from pydantic import BaseModel, ConfigDict, EmailStr, Field, HttpUrl, field_validator
import re
import html


# ---------------------------------------------------------------------------
# XSS Protection Utilities (T125)
# ---------------------------------------------------------------------------


def sanitize_text(value: str | None) -> str | None:
    """Remove potentially dangerous HTML/script content from user input.

    This function:
    1. Strips HTML tags completely (no HTML allowed in text fields)
    2. Escapes any remaining special characters
    3. Removes script injections and event handlers

    For fields that legitimately need HTML formatting, use a separate
    rich text sanitizer with allowlists (e.g., bleach library).
    """
    if value is None:
        return None

    # Remove HTML tags
    clean = re.sub(r'<[^>]+>', '', value)

    # Remove javascript: protocol attempts
    clean = re.sub(r'javascript:', '', clean, flags=re.IGNORECASE)

    # Remove data: protocol attempts (base64 XSS)
    clean = re.sub(r'data:', '', clean, flags=re.IGNORECASE)

    # Remove on* event handlers
    clean = re.sub(r'\bon\w+\s*=', '', clean, flags=re.IGNORECASE)

    # Escape HTML entities for safety
    clean = html.escape(clean)

    return clean.strip()


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


InvitationStatus = SharedInvitationStatus
EventType = SharedEventType
TemplateCategory = SharedTemplateCategory
RSVPStatus = SharedRSVPStatus


class RSVPSource(str, Enum):
    """Source/channel of RSVP submission."""

    WEB = "web"
    QR_CODE = "qr_code"
    WHATSAPP = "whatsapp"
    EMAIL_LINK = "email_link"
    PERSONAL_LINK = "personal_link"


class CheckinVerificationMethod(str, Enum):
    """Method used to verify guest check-in."""

    QR_SCAN = "qr_scan"
    MANUAL = "manual"
    NAME_LOOKUP = "name_lookup"
    TOKEN = "token"


class InvitationEventType(str, Enum):
    """Types of audit events for invitations."""

    CREATED = "created"
    UPDATED = "updated"
    PUBLISHED = "published"
    UNPUBLISHED = "unpublished"
    ARCHIVED = "archived"
    VIEWED = "viewed"
    SHARED = "shared"
    RSVP_RECEIVED = "rsvp_received"
    RSVP_UPDATED = "rsvp_updated"
    CHECKIN = "checkin"
    EXPORTED = "exported"
    DELETED = "deleted"


class ImagePurpose(str, Enum):
    """Purpose of an invitation image."""

    COVER = "cover"
    GALLERY = "gallery"
    LOGO = "logo"
    BACKGROUND = "background"
    PATTERN = "pattern"


class NotificationPreference(str, Enum):
    """Host notification preference for RSVP alerts.

    Controls how the host receives notifications when guests submit RSVPs:
    - immediate: Send notification immediately after each RSVP
    - daily_digest: Aggregate RSVPs and send once daily at 9 AM local time
    - disabled: No notifications (host can still view RSVPs in dashboard)
    """

    IMMEDIATE = "immediate"
    DAILY_DIGEST = "daily_digest"
    DISABLED = "disabled"


# ---------------------------------------------------------------------------
# Embedded/Nested Models
# ---------------------------------------------------------------------------


class TemplateLayout(BaseModel):
    """Template layout configuration stored as JSONB."""

    sections: list[str] = Field(
        default_factory=lambda: ["header", "details", "venue", "rsvp", "footer"],
        description="Ordered list of sections in the template",
    )
    fonts: dict[str, str] = Field(
        default_factory=lambda: {"heading": "Playfair Display", "body": "Inter"},
        description="Font family mapping",
    )
    colors: dict[str, str] = Field(
        default_factory=lambda: {
            "primary": "#D4AF37",
            "secondary": "#0F172A",
            "background": "#FFFDF7",
        },
        description="Color scheme (hex values)",
    )
    positions: dict[str, dict] = Field(
        default_factory=dict,
        description="Element positioning configuration",
    )
    assets: dict[str, str] = Field(
        default_factory=dict,
        description="Asset URLs (borders, patterns, etc.)",
    )


class VenueInfo(BaseModel):
    """Venue/location information for an event."""

    name: Optional[str] = Field(None, max_length=300, description="Venue name")
    address: Optional[str] = Field(None, description="Full street address")
    city: Optional[str] = Field(None, max_length=100, description="City")
    state: Optional[str] = Field(None, max_length=100, description="State/province")
    country: str = Field("India", max_length=100, description="Country")
    postal_code: Optional[str] = Field(None, max_length=20, description="ZIP/postal code")
    latitude: Optional[Decimal] = Field(
        None, ge=-90, le=90, description="GPS latitude"
    )
    longitude: Optional[Decimal] = Field(
        None, ge=-180, le=180, description="GPS longitude"
    )
    map_url: Optional[str] = Field(None, description="Google Maps or custom map URL")


class RSVPCustomQuestion(BaseModel):
    """Custom question for RSVP form."""

    question: str = Field(..., min_length=1, max_length=500, description="Question text")
    type: Literal["text", "select", "checkbox"] = Field(
        "text", description="Input type"
    )
    options: Optional[list[str]] = Field(
        None, description="Options for select/checkbox types"
    )
    required: bool = Field(False, description="Whether answer is required")


class RSVPSettings(BaseModel):
    """RSVP configuration for an invitation."""

    enabled: bool = Field(True, description="Whether RSVP is enabled")
    deadline: Optional[datetime] = Field(None, description="RSVP deadline (UTC)")
    max_party_size: int = Field(
        10, ge=1, le=50, description="Maximum guests per RSVP"
    )
    collect_dietary: bool = Field(
        False, description="Collect dietary preferences"
    )
    collect_phone: bool = Field(False, description="Collect phone number")
    custom_questions: list[RSVPCustomQuestion] = Field(
        default_factory=list, description="Additional custom questions"
    )


# ---------------------------------------------------------------------------
# Template Schemas
# ---------------------------------------------------------------------------


class InvitationTemplateBase(BaseModel):
    """Base fields for invitation templates."""

    name: str = Field(..., min_length=1, max_length=200, description="Template name")
    description: Optional[str] = Field(None, description="Template description")
    category: TemplateCategory = Field(..., description="Template category")
    subcategory: Optional[str] = Field(
        None, max_length=50, description="Cultural/style subcategory"
    )
    tags: list[str] = Field(default_factory=list, description="Searchable tags")
    layout: TemplateLayout = Field(
        default_factory=TemplateLayout, description="Layout configuration"
    )
    content_i18n: dict[str, dict] = Field(
        default_factory=dict, description="Localized default content"
    )
    supported_languages: list[str] = Field(
        default=["en-IN"], description="Supported language codes"
    )


class CreateTemplateRequest(InvitationTemplateBase):
    """Request to create a custom invitation template."""

    preview_image_url: Optional[str] = Field(None, description="Preview image URL")
    thumbnail_url: Optional[str] = Field(None, description="Thumbnail URL")
    is_premium: bool = Field(False, description="Premium template flag")


class UpdateTemplateRequest(BaseModel):
    """Request to update an invitation template."""

    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    category: Optional[TemplateCategory] = None
    subcategory: Optional[str] = Field(None, max_length=50)
    tags: Optional[list[str]] = None
    layout: Optional[TemplateLayout] = None
    content_i18n: Optional[dict[str, dict]] = None
    supported_languages: Optional[list[str]] = None
    preview_image_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    is_active: Optional[bool] = None
    is_premium: Optional[bool] = None


class InvitationTemplateResponse(BaseModel):
    """Response schema for invitation template."""

    model_config = ConfigDict(from_attributes=True)

    template_id: UUID
    workspace_id: Optional[UUID] = Field(
        None, description="Null for system templates"
    )
    name: str
    slug: str
    description: Optional[str] = None
    category: str
    subcategory: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    layout: dict = Field(default_factory=dict)
    content_i18n: dict = Field(default_factory=dict)
    supported_languages: list[str] = Field(default=["en-IN"])
    preview_image_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    is_active: bool = True
    is_premium: bool = False
    created_at: datetime
    updated_at: datetime


class TemplateListResponse(BaseModel):
    """Paginated list of templates."""

    data: list[InvitationTemplateResponse]
    meta: dict = Field(
        ..., description="Pagination metadata (page, limit, total, total_pages)"
    )


# ---------------------------------------------------------------------------
# Invitation Schemas
# ---------------------------------------------------------------------------


class CreateInvitationRequest(BaseModel):
    """Request to create a new invitation."""

    template_id: Optional[UUID] = Field(None, description="Base template to use")
    title: str = Field(
        ..., min_length=1, max_length=300, description="Invitation title"
    )
    description: Optional[str] = Field(None, description="Event description")
    event_type: EventType = Field(EventType.wedding, description="Type of event")
    event_datetime: datetime = Field(..., description="Event date/time (UTC)")
    event_end_datetime: Optional[datetime] = Field(
        None, description="Event end time (UTC)"
    )
    event_timezone: str = Field(
        "Asia/Kolkata", max_length=50, description="Timezone identifier"
    )
    venue: Optional[VenueInfo] = Field(None, description="Venue information")
    host_names: list[str] = Field(
        default_factory=list, description="Names of event hosts"
    )
    host_contact_phone: Optional[str] = Field(None, max_length=20)
    host_contact_email: Optional[EmailStr] = Field(None)
    rsvp_settings: Optional[RSVPSettings] = Field(None, description="RSVP configuration")
    primary_language: str = Field("en-IN", max_length=10, description="Primary language")
    secondary_language: Optional[str] = Field(
        None, max_length=10, description="Secondary language for bilingual"
    )
    customization: Optional[dict] = Field(
        None, description="Template customization overrides"
    )


class UpdateInvitationRequest(BaseModel):
    """Request to update an invitation."""

    title: Optional[str] = Field(None, min_length=1, max_length=300)
    description: Optional[str] = None
    event_type: Optional[EventType] = None
    event_datetime: Optional[datetime] = None
    event_end_datetime: Optional[datetime] = None
    event_timezone: Optional[str] = Field(None, max_length=50)
    venue: Optional[VenueInfo] = None
    host_names: Optional[list[str]] = None
    host_contact_phone: Optional[str] = Field(None, max_length=20)
    host_contact_email: Optional[EmailStr] = None
    rsvp_settings: Optional[RSVPSettings] = None
    primary_language: Optional[str] = Field(None, max_length=10)
    secondary_language: Optional[str] = Field(None, max_length=10)
    customization: Optional[dict] = None
    content_i18n: Optional[dict] = None
    # Security
    password_protected: Optional[bool] = None
    password: Optional[str] = Field(
        None, min_length=4, max_length=128, description="New password (will be hashed)"
    )
    remove_password: Optional[bool] = Field(None, description="Remove password protection")
    pin_protected: Optional[bool] = None
    pin: Optional[str] = Field(
        None, pattern=r"^\d{4,6}$", description="New PIN (4-6 digits)"
    )
    remove_pin: Optional[bool] = Field(None, description="Remove PIN protection")
    # Auto-deletion
    auto_delete_enabled: Optional[bool] = None
    auto_delete_days: Optional[int] = Field(None, ge=1, le=365)
    # Notification preferences
    notification_preference: Optional[NotificationPreference] = Field(
        None, description="How to notify host about new RSVPs"
    )

    # Design & Media
    video_object_key: Optional[str] = None
    audio_object_key: Optional[str] = None
    layout_density: Optional[Literal["compact", "normal", "spacious"]] = None
    font_heading: Optional[str] = Field(None, max_length=100)
    font_body: Optional[str] = Field(None, max_length=100)
    ai_generated_content: Optional[dict] = None
    has_sub_events: Optional[bool] = None


class PublishInvitationRequest(BaseModel):
    """Request to publish an invitation."""

    base_url: Optional[str] = Field(
        None,
        description="Base URL for generating the public invitation link",
        max_length=500,
    )


class InvitationResponse(BaseModel):
    """Response schema for a single invitation."""

    model_config = ConfigDict(from_attributes=True)

    invitation_id: UUID
    workspace_id: UUID
    template_id: Optional[UUID] = None
    customization: dict = Field(default_factory=dict)
    title: str
    slug: Optional[str] = None
    description: Optional[str] = None
    event_type: str
    event_datetime: datetime
    event_end_datetime: Optional[datetime] = None
    event_timezone: str = "Asia/Kolkata"
    # Venue as nested object
    venue: VenueInfo = Field(default_factory=VenueInfo)
    # Host info
    host_names: list[str] = Field(default_factory=list)
    host_contact_phone: Optional[str] = None
    host_contact_email: Optional[str] = None
    # RSVP settings as nested object
    rsvp_settings: RSVPSettings = Field(default_factory=RSVPSettings)
    # Cover image
    cover_image_url: Optional[str] = None
    # OG image (1200x630px optimized for social sharing)
    og_image_url: Optional[str] = None
    # Media URLs (resolved from object keys)
    video_url: Optional[str] = None
    audio_url: Optional[str] = None
    # Languages
    primary_language: str = "en-IN"
    secondary_language: Optional[str] = None
    content_i18n: dict = Field(default_factory=dict)
    # Share link
    magic_link_id: Optional[UUID] = None
    public_url: Optional[str] = None
    # Security
    password_protected: bool = False
    pin_protected: bool = False
    # Status
    status: str = "draft"
    published_at: Optional[datetime] = None
    # Auto-deletion
    auto_delete_enabled: bool = True
    auto_delete_days: int = 7
    scheduled_deletion_at: Optional[datetime] = None
    # Analytics
    view_count: int = 0
    unique_view_count: int = 0
    rsvp_count: int = 0
    # Notification preferences
    notification_preference: str = "immediate"

    # Design & Media
    video_object_key: Optional[str] = None
    audio_object_key: Optional[str] = None
    layout_density: str = "normal"
    font_heading: str = "Playfair Display"
    font_body: str = "Lora"
    ai_generated_content: dict = Field(default_factory=dict)
    has_sub_events: bool = False

    # Audit
    created_at: datetime
    updated_at: datetime
    created_by_user_id: UUID


class InvitationListItemResponse(BaseModel):
    """Condensed invitation for list views."""

    model_config = ConfigDict(from_attributes=True)

    invitation_id: UUID
    title: str
    event_type: str
    event_datetime: datetime
    status: str
    venue_name: Optional[str] = None
    venue_city: Optional[str] = None
    cover_image_url: Optional[str] = None
    rsvp_count: int = 0
    view_count: int = 0
    created_at: datetime
    published_at: Optional[datetime] = None


class InvitationListMeta(BaseModel):
    """Pagination metadata for invitation list."""

    page: int
    limit: int
    total: int
    total_pages: int


class InvitationListResponse(BaseModel):
    """Paginated list of invitations."""

    data: list[InvitationListItemResponse]
    meta: InvitationListMeta


# ---------------------------------------------------------------------------
# Invitation Image Schemas
# ---------------------------------------------------------------------------


class UploadInvitationImageRequest(BaseModel):
    """Request metadata for image upload."""

    purpose: ImagePurpose = Field(ImagePurpose.GALLERY, description="Image purpose")
    position: int = Field(0, ge=0, lt=20, description="Display position")


class InvitationImageResponse(BaseModel):
    """Response for an invitation image."""

    model_config = ConfigDict(from_attributes=True)

    image_id: UUID
    invitation_id: UUID
    object_key: str
    url: str
    thumbnail_url: Optional[str] = None
    og_image_url: Optional[str] = Field(
        None, description="1200x630px image optimized for social sharing (cover images only)"
    )
    og_object_key: Optional[str] = None
    filename: str
    mime_type: str
    size_bytes: int
    width: Optional[int] = None
    height: Optional[int] = None
    position: int = 0
    purpose: str = "gallery"
    created_at: datetime


class InvitationImagesResponse(BaseModel):
    """List of invitation images."""

    images: list[InvitationImageResponse]
    total: int


class ReorderImagesRequest(BaseModel):
    """Request to reorder invitation images."""

    image_ids: list[UUID] = Field(
        ..., min_length=1, description="Image IDs in desired order"
    )


# ---------------------------------------------------------------------------
# Guest Schemas
# ---------------------------------------------------------------------------


class AddGuestRequest(BaseModel):
    """Request to add a guest to the guest list."""

    name: str = Field(..., min_length=1, max_length=200, description="Guest name")
    email: Optional[EmailStr] = Field(None, description="Guest email")
    phone: Optional[str] = Field(None, max_length=20, description="Phone number")
    salutation: Optional[str] = Field(
        None, max_length=50, description="Title/salutation"
    )
    group_name: Optional[str] = Field(
        None, max_length=100, description="Guest group (Family, Friends, etc.)"
    )
    personalized_message: Optional[str] = Field(
        None, description="Personal message for this guest"
    )
    expected_party_size: int = Field(1, ge=1, le=20, description="Expected party size")


class UpdateGuestRequest(BaseModel):
    """Request to update a guest."""

    name: Optional[str] = Field(None, min_length=1, max_length=200)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=20)
    salutation: Optional[str] = Field(None, max_length=50)
    group_name: Optional[str] = Field(None, max_length=100)
    personalized_message: Optional[str] = None
    expected_party_size: Optional[int] = Field(None, ge=1, le=20)


class BulkAddGuestsRequest(BaseModel):
    """Request to add multiple guests at once."""

    guests: list[AddGuestRequest] = Field(
        ..., min_length=1, max_length=500, description="Guests to add"
    )


class InvitationGuestResponse(BaseModel):
    """Response for a single guest."""

    model_config = ConfigDict(from_attributes=True)

    guest_id: UUID
    invitation_id: UUID
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    salutation: Optional[str] = None
    group_name: Optional[str] = None
    personalized_message: Optional[str] = None
    expected_party_size: int = 1
    personal_token: Optional[str] = None
    invitation_sent: bool = False
    invitation_sent_at: Optional[datetime] = None
    invitation_viewed: bool = False
    invitation_viewed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class GuestListResponse(BaseModel):
    """Paginated guest list response."""

    data: list[InvitationGuestResponse]
    meta: dict = Field(..., description="Pagination metadata")


class SendInvitationsRequest(BaseModel):
    """Request to send invitations to guests."""

    guest_ids: Optional[list[UUID]] = Field(
        None, description="Specific guests (null = all unsent)"
    )
    channel: Literal["email", "whatsapp", "both"] = Field(
        "email", description="Delivery channel"
    )


class SendInvitationsResponse(BaseModel):
    """Response after sending invitations."""

    sent_count: int
    failed_count: int
    failures: list[dict] = Field(
        default_factory=list, description="Details of failed sends"
    )


# ---------------------------------------------------------------------------
# RSVP Schemas
# ---------------------------------------------------------------------------


class SubmitRSVPRequest(BaseModel):
    """Request to submit an RSVP response."""

    guest_name: str = Field(..., min_length=1, max_length=200, description="Guest name")
    guest_email: EmailStr = Field(..., description="Guest email")
    guest_phone: Optional[str] = Field(None, max_length=20, description="Phone number")
    attending: bool = Field(..., description="Whether attending")
    party_size: int = Field(1, ge=1, le=20, description="Number of guests")
    party_names: list[str] = Field(
        default_factory=list, description="Names of accompanying guests"
    )
    dietary_preferences: Optional[str] = Field(
        None, max_length=500, description="Dietary restrictions/preferences"
    )
    message: Optional[str] = Field(
        None, max_length=1000, description="Message to host"
    )
    custom_answers: dict[str, str] = Field(
        default_factory=dict, description="Answers to custom questions"
    )
    # T124: Optional Turnstile CAPTCHA token (required if workspace has Turnstile enabled)
    turnstile_token: Optional[str] = Field(
        None, max_length=2048, description="Cloudflare Turnstile verification token"
    )

    # T125: XSS protection validators
    @field_validator("guest_name", "dietary_preferences", "message", mode="before")
    @classmethod
    def sanitize_text_fields(cls, v: str | None) -> str | None:
        """Sanitize text fields to prevent XSS attacks."""
        return sanitize_text(v)

    @field_validator("party_names", mode="before")
    @classmethod
    def sanitize_party_names(cls, v: list[str] | None) -> list[str]:
        """Sanitize each party name for XSS protection."""
        if v is None:
            return []
        return [sanitize_text(name) or "" for name in v if name]

    @field_validator("custom_answers", mode="before")
    @classmethod
    def sanitize_custom_answers(cls, v: dict[str, str] | None) -> dict[str, str]:
        """Sanitize custom answer values for XSS protection."""
        if v is None:
            return {}
        return {k: sanitize_text(val) or "" for k, val in v.items()}


class UpdateRSVPRequest(BaseModel):
    """Request to update an existing RSVP."""

    attending: Optional[bool] = None
    party_size: Optional[int] = Field(None, ge=1, le=20)
    party_names: Optional[list[str]] = None
    dietary_preferences: Optional[str] = Field(None, max_length=500)
    message: Optional[str] = Field(None, max_length=1000)
    custom_answers: Optional[dict[str, str]] = None
    status: Optional[RSVPStatus] = None

    # T125: XSS protection validators
    @field_validator("dietary_preferences", "message", mode="before")
    @classmethod
    def sanitize_text_fields(cls, v: str | None) -> str | None:
        """Sanitize text fields to prevent XSS attacks."""
        return sanitize_text(v)

    @field_validator("party_names", mode="before")
    @classmethod
    def sanitize_party_names(cls, v: list[str] | None) -> list[str] | None:
        """Sanitize each party name for XSS protection."""
        if v is None:
            return None
        return [sanitize_text(name) or "" for name in v if name]

    @field_validator("custom_answers", mode="before")
    @classmethod
    def sanitize_custom_answers(cls, v: dict[str, str] | None) -> dict[str, str] | None:
        """Sanitize custom answer values for XSS protection."""
        if v is None:
            return None
        return {k: sanitize_text(val) or "" for k, val in v.items()}


# Aliases for backward compatibility with API imports
RSVPCreate = SubmitRSVPRequest
RSVPUpdate = UpdateRSVPRequest


class InvitationRSVPResponse(BaseModel):
    """Response for a single RSVP."""

    model_config = ConfigDict(from_attributes=True)

    rsvp_id: UUID
    invitation_id: UUID
    workspace_id: UUID
    guest_id: Optional[UUID] = None
    guest_name: str
    guest_email: str
    guest_phone: Optional[str] = None
    attending: bool
    party_size: int = 1
    party_names: list[str] = Field(default_factory=list)
    dietary_preferences: Optional[str] = None
    message: Optional[str] = None
    custom_answers: dict = Field(default_factory=dict)
    source: str = "web"
    status: str = "confirmed"
    created_at: datetime
    updated_at: datetime


# Alias for backward compatibility
RSVPResponse = InvitationRSVPResponse


class RSVPStatsResponse(BaseModel):
    """RSVP statistics for an invitation."""

    total: int = Field(..., description="Total RSVPs received")
    attending: int = Field(..., description="Number attending")
    not_attending: int = Field(..., description="Number not attending")
    pending: int = Field(..., description="Pending responses")
    maybe: int = Field(..., description="Maybe responses")
    total_party_size: int = Field(..., description="Total guests attending")


class RSVPListResponse(BaseModel):
    """Paginated RSVP list with stats."""

    data: list[InvitationRSVPResponse]
    stats: RSVPStatsResponse
    meta: dict = Field(..., description="Pagination metadata")


class RSVPSubmitResponse(BaseModel):
    """Response after RSVP submission."""

    rsvp_id: UUID
    edit_token: Optional[str] = Field(
        None, description="Token to edit this RSVP (show only once)"
    )
    message: str = "RSVP submitted successfully"
    can_edit_until: Optional[datetime] = Field(
        None, description="Token expiration time"
    )


# ---------------------------------------------------------------------------
# Check-in Schemas
# ---------------------------------------------------------------------------


class CheckinRequest(BaseModel):
    """Request to check in a guest."""

    rsvp_id: Optional[UUID] = Field(None, description="Link to RSVP (if available)")
    guest_id: Optional[UUID] = Field(None, description="Link to guest (if available)")
    guest_name: str = Field(..., min_length=1, max_length=200, description="Guest name")
    party_size_checked_in: int = Field(1, ge=1, le=50, description="Guests checking in")
    verification_method: CheckinVerificationMethod = Field(
        CheckinVerificationMethod.QR_SCAN, description="Verification method"
    )
    qr_token_used: Optional[str] = Field(
        None, description="QR token for audit trail"
    )
    notes: Optional[str] = Field(None, max_length=500, description="Check-in notes")
    # Optional location verification
    latitude: Optional[Decimal] = Field(None, ge=-90, le=90)
    longitude: Optional[Decimal] = Field(None, ge=-180, le=180)


class InvitationCheckinResponse(BaseModel):
    """Response for a check-in record."""

    model_config = ConfigDict(from_attributes=True)

    checkin_id: UUID
    invitation_id: UUID
    rsvp_id: Optional[UUID] = None
    guest_id: Optional[UUID] = None
    guest_name: str
    party_size_checked_in: int = 1
    verification_method: str = "qr_scan"
    checked_in_by_user_id: Optional[UUID] = None
    checked_in_at: datetime
    notes: Optional[str] = None


class CheckinListResponse(BaseModel):
    """List of check-ins for an invitation."""

    data: list[InvitationCheckinResponse]
    stats: dict = Field(
        ...,
        description="Check-in stats: total_checked_in, total_party_size",
    )
    meta: dict = Field(..., description="Pagination metadata")


class QRTokenValidateRequest(BaseModel):
    """Request to validate a QR code token."""

    token: str = Field(..., description="JWT token from QR code")


class QRTokenValidateResponse(BaseModel):
    """Response from QR token validation."""

    valid: bool
    invitation_id: Optional[UUID] = None
    rsvp_id: Optional[UUID] = None
    guest_name: Optional[str] = None
    expected_party_size: Optional[int] = None
    already_checked_in: bool = False
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# Stats & Analytics Schemas
# ---------------------------------------------------------------------------


class InvitationStatsResponse(BaseModel):
    """Comprehensive stats for an invitation."""

    invitation_id: UUID
    title: str
    event_datetime: datetime
    status: str
    view_count: int = 0
    unique_view_count: int = 0
    # RSVP breakdown
    rsvp_total: int = 0
    attending_count: int = 0
    not_attending_count: int = 0
    pending_count: int = 0
    total_party_size: int = 0
    # Check-in breakdown
    checked_in_count: int = 0
    total_checked_in_party: int = 0
    checkin_percentage: float = Field(
        0.0, ge=0, le=100, description="% of expected guests checked in"
    )


class WorkspaceInvitationStats(BaseModel):
    """Workspace-level invitation statistics."""

    total_invitations: int = 0
    draft_count: int = 0
    published_count: int = 0
    archived_count: int = 0
    total_rsvps: int = 0
    upcoming_events: int = 0


# ---------------------------------------------------------------------------
# Calendar/ICS Schemas
# ---------------------------------------------------------------------------


class GenerateICSRequest(BaseModel):
    """Request to generate ICS calendar file."""

    include_venue_details: bool = Field(True, description="Include venue in location")
    alarm_minutes_before: Optional[int] = Field(
        60, ge=0, le=10080, description="Reminder before event (minutes)"
    )


class ICSResponse(BaseModel):
    """Response with ICS file content."""

    ics_content: str = Field(..., description="ICS file content")
    filename: str = Field(..., description="Suggested filename")
    content_type: str = "text/calendar"


# ---------------------------------------------------------------------------
# Public/Guest View Schemas
# ---------------------------------------------------------------------------


class PublicInvitationResponse(BaseModel):
    """Public-facing invitation view (no sensitive data)."""

    invitation_id: UUID
    title: str
    description: Optional[str] = None
    event_type: str
    event_datetime: datetime
    event_end_datetime: Optional[datetime] = None
    event_timezone: str = "Asia/Kolkata"
    venue: VenueInfo = Field(default_factory=VenueInfo)
    host_names: list[str] = Field(default_factory=list)
    # Images
    cover_image_url: Optional[str] = None
    og_image_url: Optional[str] = Field(
        None, description="1200x630px image optimized for social sharing"
    )
    gallery_images: list[str] = Field(
        default_factory=list, description="Gallery image URLs"
    )
    # RSVP info (public portion only)
    rsvp_enabled: bool = True
    rsvp_deadline: Optional[datetime] = None
    max_party_size: int = 10
    collect_dietary: bool = False
    collect_phone: bool = False
    custom_questions: list[dict] = Field(default_factory=list)
    # Branding
    primary_language: str = "en-IN"
    secondary_language: Optional[str] = None
    content_i18n: dict = Field(default_factory=dict)
    template_layout: Optional[dict] = None
    customization: dict = Field(default_factory=dict)

    # Design & Media
    video_object_key: Optional[str] = None
    audio_object_key: Optional[str] = None
    layout_density: str = "normal"
    font_heading: str = "Playfair Display"
    font_body: str = "Lora"
    ai_generated_content: dict = Field(default_factory=dict)
    has_sub_events: bool = False


class AccessInvitationRequest(BaseModel):
    """Request to access a password/PIN protected invitation."""

    password: Optional[str] = Field(None, description="Password if required")
    pin: Optional[str] = Field(None, pattern=r"^\d{4,6}$", description="PIN if required")


class AccessInvitationResponse(BaseModel):
    """Response after successful access validation."""

    access_granted: bool
    invitation: Optional[PublicInvitationResponse] = None
    error: Optional[str] = None
    requires_password: bool = False
    requires_pin: bool = False


# ---------------------------------------------------------------------------
# Draft Schemas (Phase 10: Save Draft and Auto-Save)
# ---------------------------------------------------------------------------


class SaveDraftRequest(BaseModel):
    """Request to save/update an invitation draft."""

    draft_id: Optional[str] = Field(None, description="Existing draft ID to update, or None to create new")
    data: dict = Field(..., description="Wizard state data to save")


class DraftResponse(BaseModel):
    """Single draft response."""

    draft_id: str
    workspace_id: str
    user_id: str
    data: dict
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_redis(cls, record: dict) -> "DraftResponse":
        """Create from Redis record."""
        return cls(
            draft_id=record["draft_id"],
            workspace_id=record["workspace_id"],
            user_id=record["user_id"],
            data=record["data"],
            created_at=datetime.fromisoformat(record["created_at"]),
            updated_at=datetime.fromisoformat(record["updated_at"]),
        )


class DraftListResponse(BaseModel):
    """List of drafts response."""

    data: list[DraftResponse]
    total: int


class SaveDraftResponse(BaseModel):
    """Response after saving a draft."""

    draft_id: str
    message: str = "Draft saved successfully"


# ---------------------------------------------------------------------------
# Duplicate Invitation Schemas (T101-T105: Duplicate Invitation)
# ---------------------------------------------------------------------------


class DuplicateInvitationRequest(BaseModel):
    """Request to duplicate an invitation."""

    title: Optional[str] = Field(
        None,
        description="Custom title for the duplicate. If not provided, 'Copy of <original>' is used."
    )


# ---------------------------------------------------------------------------
# Notification Preference Schemas (T106-T111: RSVP Notification Management)
# ---------------------------------------------------------------------------


class UpdateNotificationSettingsRequest(BaseModel):
    """Request to update invitation notification settings."""

    notification_preference: NotificationPreference = Field(
        ..., description="How to notify host about new RSVPs"
    )


class NotificationSettingsResponse(BaseModel):
    """Response with current notification settings."""

    notification_preference: str
    message: str = "Notification settings updated"


# ---------------------------------------------------------------------------
# Check-in Schemas (T112-T120: Guest Check-In via QR)
# ---------------------------------------------------------------------------


class ScanCheckinRequest(BaseModel):
    """Request to scan QR and check in guest."""

    token: str = Field(..., description="JWT token from QR code scan")
    party_size_override: Optional[int] = Field(
        None, ge=1, le=50, description="Override party size if needed"
    )
    latitude: Optional[float] = Field(None, ge=-90, le=90, description="GPS latitude")
    longitude: Optional[float] = Field(None, ge=-180, le=180, description="GPS longitude")
    notes: Optional[str] = Field(None, max_length=500, description="Check-in notes")


class ManualCheckinRequest(BaseModel):
    """Request to manually check in by name lookup."""

    guest_name: str = Field(..., min_length=1, max_length=200, description="Guest name to search")
    party_size_checked_in: int = Field(1, ge=1, le=50, description="Guests checking in")
    notes: Optional[str] = Field(None, max_length=500, description="Check-in notes")


class CheckinVerifyResponse(BaseModel):
    """Response from QR token verification (before check-in)."""

    valid: bool
    rsvp_id: Optional[str] = None
    guest_name: Optional[str] = None
    guest_email: Optional[str] = None
    party_size: Optional[int] = None
    attending: Optional[bool] = None
    dietary_preferences: Optional[str] = None
    already_checked_in: bool = False
    checkin_details: Optional[dict] = None
    error: Optional[str] = None


class CheckinResultResponse(BaseModel):
    """Response after successful check-in."""

    success: bool
    checkin_id: Optional[str] = None
    guest_name: str
    party_size_checked_in: int
    verification_method: str
    checked_in_at: Optional[datetime] = None
    already_checked_in: bool = False
    existing_checkin: Optional[dict] = None
    message: str = "Guest checked in successfully"


class CheckinStatsResponse(BaseModel):
    """Check-in statistics for dashboard."""

    total_checkins: int = 0
    total_guests_checked_in: int = 0
    expected_guests: int = 0
    checkin_rate_percent: float = 0.0
    first_checkin_at: Optional[datetime] = None
    last_checkin_at: Optional[datetime] = None
    by_method: dict = Field(default_factory=dict, description="Breakdown by verification method")
    rsvp_stats: Optional[dict] = None
