"""Pydantic schemas for notification templates.

This module contains all schemas for the notification template system:
- Request schemas for creating and managing templates
- Response schemas for API endpoints
- Internal schemas for template rendering and validation

Feature: Notifications & Communication Microservice
Task: T017 - Create Pydantic schemas for templates
"""

from datetime import datetime
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from src.schemas.notification import (
    NotificationCategory,
    NotificationChannel,
    NotificationPriority,
    PaginationMeta,
)


# =============================================================================
# ENUMS - Match database enum types from migrations
# =============================================================================


class TemplateStatus(str, Enum):
    """Template lifecycle status.

    Maps to notification_template_status enum in database.
    """

    DRAFT = "draft"  # Template is being developed, not yet usable
    ACTIVE = "active"  # Template is ready for use
    ARCHIVED = "archived"  # Template is no longer in use but preserved
    DEPRECATED = "deprecated"  # Template should not be used, replaced by newer version


# =============================================================================
# TEMPLATE VARIABLE SCHEMAS
# =============================================================================


class TemplateVariableSchema(BaseModel):
    """Schema defining template variable requirements.

    Used to validate that all required variables are provided
    when rendering a template.
    """

    required: list[str] = Field(
        default_factory=list,
        description="List of required variable names",
    )
    optional: list[str] = Field(
        default_factory=list,
        description="List of optional variable names",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "required": ["guest_name", "event_date", "gallery_url"],
                "optional": ["venue_name", "custom_message"],
            }
        }
    )


class TemplateDefaultValues(BaseModel):
    """Default values for optional template variables.

    These values are used when the optional variable is not provided
    during template rendering.
    """

    values: dict[str, Any] = Field(
        default_factory=dict,
        description="Mapping of variable names to default values",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "values": {
                    "venue_name": "TBD",
                    "party_size": 1,
                    "custom_message": "",
                }
            }
        }
    )


# =============================================================================
# EMAIL CONTENT SCHEMAS
# =============================================================================


class EmailContent(BaseModel):
    """Email-specific template content.

    Contains all fields needed to render an email notification.
    Uses Jinja2 template syntax for variable substitution.
    """

    subject: str = Field(
        ...,
        max_length=500,
        description="Email subject line (Jinja2 template)",
    )
    html: Optional[str] = Field(
        None,
        description="HTML email body (Jinja2 template)",
    )
    text: Optional[str] = Field(
        None,
        description="Plain text email body (Jinja2 template)",
    )
    from_name: Optional[str] = Field(
        None,
        max_length=100,
        description="Sender name override",
    )
    reply_to: Optional[str] = Field(
        None,
        max_length=320,
        description="Reply-to email address override",
    )

    @model_validator(mode="after")
    def validate_content(self) -> "EmailContent":
        """Ensure at least one content format is provided."""
        if not self.html and not self.text:
            raise ValueError("At least one of 'html' or 'text' must be provided")
        return self

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "subject": "Your gallery {{ gallery_name }} is ready!",
                "html": "<h1>Hello {{ guest_name }}</h1><p>Your photos are ready...</p>",
                "text": "Hello {{ guest_name }}, your photos are ready...",
                "from_name": "{{ photographer_name }} via RawDrive",
            }
        }
    )


# =============================================================================
# SMS CONTENT SCHEMAS
# =============================================================================


class SMSContent(BaseModel):
    """SMS-specific template content.

    SMS messages have strict length limits - typically 160 chars per segment,
    up to 1600 chars for concatenated SMS.
    """

    content: str = Field(
        ...,
        max_length=1600,
        description="SMS message content (Jinja2 template)",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "content": "Hi {{ guest_name }}! Your gallery is ready: {{ gallery_url }}"
            }
        }
    )


# =============================================================================
# PUSH NOTIFICATION CONTENT SCHEMAS
# =============================================================================


class PushContent(BaseModel):
    """Push notification-specific template content.

    Used for mobile and web push notifications.
    """

    title: str = Field(
        ...,
        max_length=100,
        description="Push notification title (Jinja2 template)",
    )
    body: str = Field(
        ...,
        description="Push notification body (Jinja2 template)",
    )
    action_url: Optional[str] = Field(
        None,
        description="URL to open when notification is clicked",
    )
    icon_url: Optional[str] = Field(
        None,
        description="URL of the notification icon",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "title": "Gallery Ready!",
                "body": "{{ gallery_name }} photos are now available",
                "action_url": "{{ gallery_url }}",
                "icon_url": "https://rawdrive.com/icons/gallery.png",
            }
        }
    )


# =============================================================================
# IN-APP NOTIFICATION CONTENT SCHEMAS
# =============================================================================


class InAppContent(BaseModel):
    """In-app notification-specific template content.

    Used for notifications displayed within the application.
    """

    title: str = Field(
        ...,
        max_length=200,
        description="In-app notification title (Jinja2 template)",
    )
    body: str = Field(
        ...,
        description="In-app notification body (Jinja2 template)",
    )
    action_url: Optional[str] = Field(
        None,
        description="URL/route to navigate to when clicked",
    )
    icon: Optional[str] = Field(
        None,
        max_length=50,
        description="Icon identifier or type (e.g., 'gallery', 'billing', 'alert')",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "title": "New gallery published",
                "body": "{{ photographer_name }} shared {{ gallery_name }} with you",
                "action_url": "/galleries/{{ gallery_id }}",
                "icon": "gallery",
            }
        }
    )


# =============================================================================
# LOCALIZATION SCHEMAS
# =============================================================================


class LocalizedContent(BaseModel):
    """Localized content for a specific language.

    All fields are optional - only provided fields override the default content.
    """

    email_subject: Optional[str] = Field(None, max_length=500)
    email_html: Optional[str] = None
    email_text: Optional[str] = None
    sms_content: Optional[str] = Field(None, max_length=1600)
    push_title: Optional[str] = Field(None, max_length=100)
    push_body: Optional[str] = None
    in_app_title: Optional[str] = Field(None, max_length=200)
    in_app_body: Optional[str] = None


class LocalizedContentMap(BaseModel):
    """Map of language codes to localized content.

    Keys are ISO 639-1 language codes (e.g., 'hi', 'es', 'fr').
    """

    languages: dict[str, LocalizedContent] = Field(
        default_factory=dict,
        description="Localized content keyed by language code",
    )

    @field_validator("languages", mode="before")
    @classmethod
    def validate_language_codes(cls, v: Any) -> dict[str, LocalizedContent]:
        """Validate language codes are valid ISO 639-1 format."""
        if not isinstance(v, dict):
            return {}
        result = {}
        for key, value in v.items():
            if not isinstance(key, str) or len(key) < 2 or len(key) > 5:
                raise ValueError(f"Invalid language code: {key}")
            if isinstance(value, dict):
                result[key.lower()] = LocalizedContent(**value)
            elif isinstance(value, LocalizedContent):
                result[key.lower()] = value
        return result


# =============================================================================
# TEMPLATE REQUEST SCHEMAS
# =============================================================================


class TemplateCreateRequest(BaseModel):
    """Request schema for creating a new notification template."""

    # Identity
    code: str = Field(
        ...,
        min_length=1,
        max_length=100,
        pattern=r"^[a-z0-9._-]+$",
        description="Unique template code (e.g., 'gallery.published', 'billing.payment_failed')",
    )
    name: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Human-readable template name",
    )
    description: Optional[str] = Field(
        None,
        description="Template description for admin purposes",
    )

    # Classification
    category: NotificationCategory = Field(
        ...,
        description="Notification category this template belongs to",
    )
    supported_channels: list[NotificationChannel] = Field(
        default_factory=lambda: [NotificationChannel.EMAIL],
        min_length=1,
        description="Channels this template supports",
    )
    status: TemplateStatus = Field(
        default=TemplateStatus.DRAFT,
        description="Template lifecycle status",
    )

    # Email content (required if email channel supported)
    email: Optional[EmailContent] = Field(
        None,
        description="Email template content",
    )

    # SMS content (required if SMS channel supported)
    sms: Optional[SMSContent] = Field(
        None,
        description="SMS template content",
    )

    # Push content (required if push channel supported)
    push: Optional[PushContent] = Field(
        None,
        description="Push notification template content",
    )

    # In-app content (required if in_app channel supported)
    in_app: Optional[InAppContent] = Field(
        None,
        description="In-app notification template content",
    )

    # Template variables
    variable_schema: TemplateVariableSchema = Field(
        default_factory=TemplateVariableSchema,
        description="Schema defining required and optional variables",
    )
    default_values: dict[str, Any] = Field(
        default_factory=dict,
        description="Default values for optional variables",
    )

    # Localization
    default_language: str = Field(
        default="en",
        max_length=5,
        description="Default language code (ISO 639-1)",
    )
    localized_content: dict[str, LocalizedContent] = Field(
        default_factory=dict,
        description="Localized content overrides by language",
    )

    # Versioning
    version: str = Field(
        default="1.0.0",
        max_length=20,
        pattern=r"^\d+\.\d+\.\d+$",
        description="Semantic version (e.g., '1.0.0')",
    )

    # Delivery options
    default_priority: NotificationPriority = Field(
        default=NotificationPriority.NORMAL,
        description="Default priority for notifications using this template",
    )
    is_transactional: bool = Field(
        default=False,
        description="If true, users cannot opt out of this template",
    )
    ttl_seconds: Optional[int] = Field(
        None,
        ge=0,
        description="Time-to-live in seconds (null = no expiry)",
    )

    # Metadata
    tags: list[str] = Field(
        default_factory=list,
        description="Tags for filtering and categorization",
    )
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Additional metadata (A/B testing, analytics, etc.)",
    )

    @model_validator(mode="after")
    def validate_channel_content(self) -> "TemplateCreateRequest":
        """Validate that content is provided for all supported channels."""
        if NotificationChannel.EMAIL in self.supported_channels and not self.email:
            raise ValueError("Email content is required when email channel is supported")
        if NotificationChannel.SMS in self.supported_channels and not self.sms:
            raise ValueError("SMS content is required when SMS channel is supported")
        if NotificationChannel.PUSH in self.supported_channels and not self.push:
            raise ValueError("Push content is required when push channel is supported")
        if NotificationChannel.IN_APP in self.supported_channels and not self.in_app:
            raise ValueError("In-app content is required when in_app channel is supported")
        return self

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "code": "gallery.published",
                "name": "Gallery Published Notification",
                "description": "Sent when a photographer publishes a gallery for clients",
                "category": "gallery_activity",
                "supported_channels": ["email", "in_app"],
                "status": "draft",
                "email": {
                    "subject": "Your gallery {{ gallery_name }} is ready!",
                    "html": "<h1>Hello {{ guest_name }}</h1>...",
                    "text": "Hello {{ guest_name }}...",
                },
                "in_app": {
                    "title": "Gallery Ready",
                    "body": "{{ gallery_name }} is now available",
                    "action_url": "/galleries/{{ gallery_id }}",
                    "icon": "gallery",
                },
                "variable_schema": {
                    "required": ["guest_name", "gallery_name", "gallery_id"],
                    "optional": ["photographer_name", "custom_message"],
                },
                "default_values": {"photographer_name": "Your photographer"},
                "default_priority": "normal",
                "is_transactional": False,
                "tags": ["gallery", "client-facing"],
            }
        }
    )


class TemplateUpdateRequest(BaseModel):
    """Request schema for updating an existing template.

    All fields are optional - only provided fields are updated.
    """

    # Identity
    name: Optional[str] = Field(
        None,
        min_length=1,
        max_length=200,
        description="Human-readable template name",
    )
    description: Optional[str] = Field(
        None,
        description="Template description",
    )

    # Classification
    category: Optional[NotificationCategory] = Field(
        None,
        description="Notification category",
    )
    supported_channels: Optional[list[NotificationChannel]] = Field(
        None,
        min_length=1,
        description="Channels this template supports",
    )
    status: Optional[TemplateStatus] = Field(
        None,
        description="Template lifecycle status",
    )

    # Content
    email: Optional[EmailContent] = Field(None, description="Email template content")
    sms: Optional[SMSContent] = Field(None, description="SMS template content")
    push: Optional[PushContent] = Field(None, description="Push notification content")
    in_app: Optional[InAppContent] = Field(None, description="In-app notification content")

    # Template variables
    variable_schema: Optional[TemplateVariableSchema] = Field(
        None,
        description="Schema defining required and optional variables",
    )
    default_values: Optional[dict[str, Any]] = Field(
        None,
        description="Default values for optional variables",
    )

    # Localization
    default_language: Optional[str] = Field(
        None,
        max_length=5,
        description="Default language code",
    )
    localized_content: Optional[dict[str, LocalizedContent]] = Field(
        None,
        description="Localized content overrides",
    )

    # Delivery options
    default_priority: Optional[NotificationPriority] = Field(
        None,
        description="Default priority",
    )
    is_transactional: Optional[bool] = Field(
        None,
        description="If true, users cannot opt out",
    )
    ttl_seconds: Optional[int] = Field(
        None,
        ge=0,
        description="Time-to-live in seconds",
    )

    # Metadata
    tags: Optional[list[str]] = Field(
        None,
        description="Tags for filtering",
    )
    metadata: Optional[dict[str, Any]] = Field(
        None,
        description="Additional metadata",
    )


class TemplateVersionRequest(BaseModel):
    """Request schema for creating a new version of an existing template."""

    version: str = Field(
        ...,
        max_length=20,
        pattern=r"^\d+\.\d+\.\d+$",
        description="New semantic version (must be higher than current)",
    )

    # All content fields are optional - inherit from previous version if not provided
    email: Optional[EmailContent] = None
    sms: Optional[SMSContent] = None
    push: Optional[PushContent] = None
    in_app: Optional[InAppContent] = None

    # Other updatable fields
    variable_schema: Optional[TemplateVariableSchema] = None
    default_values: Optional[dict[str, Any]] = None
    localized_content: Optional[dict[str, LocalizedContent]] = None
    metadata: Optional[dict[str, Any]] = None


class TemplateCloneRequest(BaseModel):
    """Request schema for cloning a template."""

    new_code: str = Field(
        ...,
        min_length=1,
        max_length=100,
        pattern=r"^[a-z0-9._-]+$",
        description="Code for the cloned template",
    )
    new_name: Optional[str] = Field(
        None,
        max_length=200,
        description="Name for the cloned template (defaults to original name + ' (Copy)')",
    )
    target_workspace_id: Optional[UUID] = Field(
        None,
        description="Workspace to clone into (null = same workspace or system template)",
    )


# =============================================================================
# TEMPLATE RESPONSE SCHEMAS
# =============================================================================


class TemplateResponse(BaseModel):
    """Full notification template response."""

    template_id: UUID
    workspace_id: Optional[UUID] = Field(
        None,
        description="NULL for system templates",
    )

    # Identity
    code: str
    name: str
    description: Optional[str] = None

    # Classification
    category: NotificationCategory
    supported_channels: list[NotificationChannel]
    status: TemplateStatus

    # Email content
    email_subject: Optional[str] = None
    email_html: Optional[str] = None
    email_text: Optional[str] = None
    email_from_name: Optional[str] = None
    email_reply_to: Optional[str] = None

    # SMS content
    sms_content: Optional[str] = None

    # Push content
    push_title: Optional[str] = None
    push_body: Optional[str] = None
    push_action_url: Optional[str] = None
    push_icon_url: Optional[str] = None

    # In-app content
    in_app_title: Optional[str] = None
    in_app_body: Optional[str] = None
    in_app_action_url: Optional[str] = None
    in_app_icon: Optional[str] = None

    # Template variables
    variable_schema: dict[str, Any] = Field(default_factory=dict)
    default_values: dict[str, Any] = Field(default_factory=dict)

    # Localization
    default_language: str = "en"
    localized_content: dict[str, Any] = Field(default_factory=dict)

    # Versioning
    version: str = "1.0.0"
    previous_version_id: Optional[UUID] = None

    # Delivery options
    default_priority: NotificationPriority = NotificationPriority.NORMAL
    is_transactional: bool = False
    ttl_seconds: Optional[int] = None

    # Metadata
    tags: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)

    # Audit fields
    created_by_user_id: Optional[UUID] = None
    updated_by_user_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @property
    def email(self) -> Optional[EmailContent]:
        """Get email content as EmailContent object."""
        if not self.email_subject:
            return None
        return EmailContent(
            subject=self.email_subject,
            html=self.email_html,
            text=self.email_text,
            from_name=self.email_from_name,
            reply_to=self.email_reply_to,
        )

    @property
    def sms(self) -> Optional[SMSContent]:
        """Get SMS content as SMSContent object."""
        if not self.sms_content:
            return None
        return SMSContent(content=self.sms_content)

    @property
    def push(self) -> Optional[PushContent]:
        """Get push content as PushContent object."""
        if not self.push_title or not self.push_body:
            return None
        return PushContent(
            title=self.push_title,
            body=self.push_body,
            action_url=self.push_action_url,
            icon_url=self.push_icon_url,
        )

    @property
    def in_app(self) -> Optional[InAppContent]:
        """Get in-app content as InAppContent object."""
        if not self.in_app_title or not self.in_app_body:
            return None
        return InAppContent(
            title=self.in_app_title,
            body=self.in_app_body,
            action_url=self.in_app_action_url,
            icon=self.in_app_icon,
        )


class TemplateSummary(BaseModel):
    """Lightweight template summary for list responses."""

    template_id: UUID
    workspace_id: Optional[UUID] = None
    code: str
    name: str
    category: NotificationCategory
    supported_channels: list[NotificationChannel]
    status: TemplateStatus
    version: str
    is_transactional: bool = False
    tags: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TemplateListResponse(BaseModel):
    """Paginated list of templates."""

    data: list[TemplateSummary]
    meta: PaginationMeta


class TemplateVersionHistory(BaseModel):
    """Version history entry for a template."""

    template_id: UUID
    version: str
    status: TemplateStatus
    created_at: datetime
    created_by_user_id: Optional[UUID] = None
    changelog: Optional[str] = None


class TemplateVersionListResponse(BaseModel):
    """List of template versions."""

    code: str
    current_version: str
    versions: list[TemplateVersionHistory]


# =============================================================================
# TEMPLATE RENDERING SCHEMAS
# =============================================================================


class TemplateRenderRequest(BaseModel):
    """Request schema for rendering a template with variables."""

    template_id: Optional[UUID] = Field(
        None,
        description="Template ID (use this or code)",
    )
    template_code: Optional[str] = Field(
        None,
        max_length=100,
        description="Template code (use this or template_id)",
    )
    channel: NotificationChannel = Field(
        ...,
        description="Channel to render content for",
    )
    variables: dict[str, Any] = Field(
        default_factory=dict,
        description="Variables to substitute in the template",
    )
    language: str = Field(
        default="en",
        max_length=5,
        description="Language for localized content",
    )

    @model_validator(mode="after")
    def validate_template_reference(self) -> "TemplateRenderRequest":
        """Ensure either template_id or template_code is provided."""
        if not self.template_id and not self.template_code:
            raise ValueError("Either template_id or template_code must be provided")
        return self

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "template_code": "gallery.published",
                "channel": "email",
                "variables": {
                    "guest_name": "John Smith",
                    "gallery_name": "Wedding Photos",
                    "gallery_url": "https://gallery.example.com/abc123",
                },
                "language": "en",
            }
        }
    )


class RenderedEmail(BaseModel):
    """Rendered email content."""

    subject: str
    html: Optional[str] = None
    text: Optional[str] = None
    from_name: Optional[str] = None
    reply_to: Optional[str] = None


class RenderedSMS(BaseModel):
    """Rendered SMS content."""

    content: str
    segment_count: int = Field(
        default=1,
        description="Number of SMS segments (based on length)",
    )


class RenderedPush(BaseModel):
    """Rendered push notification content."""

    title: str
    body: str
    action_url: Optional[str] = None
    icon_url: Optional[str] = None


class RenderedInApp(BaseModel):
    """Rendered in-app notification content."""

    title: str
    body: str
    action_url: Optional[str] = None
    icon: Optional[str] = None


class TemplateRenderResponse(BaseModel):
    """Response from template rendering."""

    template_id: UUID
    template_code: str
    channel: NotificationChannel
    language: str

    # Rendered content (only the requested channel is populated)
    email: Optional[RenderedEmail] = None
    sms: Optional[RenderedSMS] = None
    push: Optional[RenderedPush] = None
    in_app: Optional[RenderedInApp] = None

    # Variables used (including defaults)
    variables_used: dict[str, Any] = Field(default_factory=dict)

    # Validation info
    missing_variables: list[str] = Field(
        default_factory=list,
        description="Required variables that were not provided",
    )
    warnings: list[str] = Field(
        default_factory=list,
        description="Non-fatal issues encountered during rendering",
    )


class TemplatePreviewRequest(BaseModel):
    """Request schema for previewing template with sample data."""

    template_id: Optional[UUID] = None
    template_code: Optional[str] = None
    channel: NotificationChannel = NotificationChannel.EMAIL

    # Optional: provide custom content to preview without saving
    email: Optional[EmailContent] = None
    sms: Optional[SMSContent] = None
    push: Optional[PushContent] = None
    in_app: Optional[InAppContent] = None

    # Sample variables for preview
    sample_variables: dict[str, Any] = Field(
        default_factory=dict,
        description="Sample variables for preview rendering",
    )
    language: str = "en"

    @model_validator(mode="after")
    def validate_source(self) -> "TemplatePreviewRequest":
        """Ensure template reference or custom content is provided."""
        has_template = self.template_id or self.template_code
        has_content = self.email or self.sms or self.push or self.in_app
        if not has_template and not has_content:
            raise ValueError(
                "Either template reference (template_id/template_code) or "
                "custom content must be provided"
            )
        return self


# =============================================================================
# TEMPLATE VALIDATION SCHEMAS
# =============================================================================


class TemplateValidationRequest(BaseModel):
    """Request schema for validating template content."""

    email: Optional[EmailContent] = None
    sms: Optional[SMSContent] = None
    push: Optional[PushContent] = None
    in_app: Optional[InAppContent] = None
    variable_schema: Optional[TemplateVariableSchema] = None


class TemplateValidationError(BaseModel):
    """Single validation error."""

    field: str = Field(..., description="Field path with error")
    message: str = Field(..., description="Error description")
    code: str = Field(..., description="Error code")


class TemplateValidationResult(BaseModel):
    """Result of template validation."""

    valid: bool = Field(..., description="Whether the template is valid")
    errors: list[TemplateValidationError] = Field(
        default_factory=list,
        description="Validation errors",
    )
    warnings: list[TemplateValidationError] = Field(
        default_factory=list,
        description="Validation warnings (non-blocking)",
    )
    detected_variables: list[str] = Field(
        default_factory=list,
        description="Variables detected in template content",
    )


# =============================================================================
# TEMPLATE SEARCH SCHEMAS
# =============================================================================


class TemplateSearchRequest(BaseModel):
    """Request schema for searching templates."""

    query: Optional[str] = Field(
        None,
        max_length=200,
        description="Search query (searches code, name, description)",
    )
    category: Optional[NotificationCategory] = Field(
        None,
        description="Filter by category",
    )
    channels: Optional[list[NotificationChannel]] = Field(
        None,
        description="Filter by supported channels",
    )
    status: Optional[TemplateStatus] = Field(
        None,
        description="Filter by status",
    )
    tags: Optional[list[str]] = Field(
        None,
        description="Filter by tags (any match)",
    )
    is_transactional: Optional[bool] = Field(
        None,
        description="Filter by transactional flag",
    )
    include_system: bool = Field(
        default=True,
        description="Include system templates in results",
    )

    # Pagination
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=20, ge=1, le=100)


# =============================================================================
# INTERNAL TEMPLATE SCHEMAS
# =============================================================================


class TemplateForRendering(BaseModel):
    """Internal schema with template data prepared for rendering.

    Used by the template service to pass template data to the renderer.
    """

    template_id: UUID
    code: str
    channel: NotificationChannel
    language: str

    # Content to render (for the requested channel)
    subject: Optional[str] = None  # Email subject
    html_content: Optional[str] = None  # Email HTML or in-app body
    text_content: Optional[str] = None  # Email text, SMS, or push body
    title: Optional[str] = None  # Push or in-app title
    action_url: Optional[str] = None
    icon_url: Optional[str] = None
    from_name: Optional[str] = None
    reply_to: Optional[str] = None
    icon: Optional[str] = None  # In-app icon type

    # Variable info
    required_variables: list[str] = Field(default_factory=list)
    default_values: dict[str, Any] = Field(default_factory=dict)


class TemplateRenderResult(BaseModel):
    """Internal result of template rendering operation."""

    success: bool
    template_id: UUID
    channel: NotificationChannel

    # Rendered content
    rendered_subject: Optional[str] = None
    rendered_html: Optional[str] = None
    rendered_text: Optional[str] = None
    rendered_title: Optional[str] = None
    rendered_action_url: Optional[str] = None

    # Additional fields for email
    from_name: Optional[str] = None
    reply_to: Optional[str] = None

    # Additional fields for in-app/push
    icon_url: Optional[str] = None
    icon: Optional[str] = None

    # Error info
    error_message: Optional[str] = None
    missing_variables: list[str] = Field(default_factory=list)


# =============================================================================
# BULK TEMPLATE OPERATIONS
# =============================================================================


class BulkTemplateStatusUpdate(BaseModel):
    """Request to update status of multiple templates."""

    template_ids: list[UUID] = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Template IDs to update",
    )
    status: TemplateStatus = Field(
        ...,
        description="New status to apply",
    )


class BulkTemplateUpdateResponse(BaseModel):
    """Response for bulk template operations."""

    updated: int = Field(..., description="Number of templates updated")
    failed: int = Field(..., description="Number of updates that failed")
    errors: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Error details for failed updates",
    )
