"""Pydantic schemas for notification preferences.

This module contains all schemas for the notification preferences system:
- Request schemas for managing user notification preferences
- Response schemas for API endpoints
- Internal schemas for preference processing and validation

Feature: Notifications & Communication Microservice
Task: T016 - Create Pydantic schemas for preferences
"""

from datetime import datetime, time
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from src.schemas.notification import (
    NotificationCategory,
    NotificationChannel,
    PaginationMeta,
)


# =============================================================================
# ENUMS - Match database enum types from migrations
# =============================================================================


class DigestFrequency(str, Enum):
    """Notification digest frequency.

    Maps to notification_digest_frequency enum in database.
    Controls how notifications are batched for delivery.
    """

    INSTANT = "instant"  # Deliver immediately
    HOURLY = "hourly"  # Batch into hourly digests
    DAILY = "daily"  # Batch into daily digest
    WEEKLY = "weekly"  # Batch into weekly digest
    NEVER = "never"  # Do not send this category


class PreferenceUpdateSource(str, Enum):
    """Source of preference update.

    Tracks how the preference was last modified for audit purposes.
    """

    USER = "user"  # User updated via settings UI
    ADMIN = "admin"  # Admin updated on behalf of user
    API = "api"  # External API call
    MIGRATION = "migration"  # Data migration
    UNSUBSCRIBE_LINK = "unsubscribe_link"  # Email unsubscribe link
    EMAIL_PREFERENCES = "email_preferences"  # Email preferences page


class DayOfWeek(int, Enum):
    """Day of week (0=Sunday, 6=Saturday).

    Used for quiet hours and weekly digest scheduling.
    """

    SUNDAY = 0
    MONDAY = 1
    TUESDAY = 2
    WEDNESDAY = 3
    THURSDAY = 4
    FRIDAY = 5
    SATURDAY = 6


# =============================================================================
# CATEGORY PREFERENCE SCHEMAS
# =============================================================================


class CategoryPreference(BaseModel):
    """Preference settings for a specific notification category.

    Controls whether a category is enabled, which channels to use,
    and the delivery frequency (instant vs digest).
    """

    enabled: bool = Field(
        default=True,
        description="Whether notifications in this category are enabled",
    )
    channels: list[NotificationChannel] = Field(
        default_factory=lambda: [NotificationChannel.EMAIL, NotificationChannel.IN_APP],
        description="Channels to use for this category",
    )
    frequency: DigestFrequency = Field(
        default=DigestFrequency.INSTANT,
        description="Delivery frequency for this category",
    )

    @field_validator("channels", mode="before")
    @classmethod
    def validate_channels(cls, v: Any) -> list[NotificationChannel]:
        """Ensure channels is a list and convert string values."""
        if v is None:
            return []
        if isinstance(v, list):
            return [NotificationChannel(c) if isinstance(c, str) else c for c in v]
        return [NotificationChannel(v) if isinstance(v, str) else v]


class CategoryPreferenceWithName(CategoryPreference):
    """Category preference with category name for response serialization."""

    category: NotificationCategory = Field(..., description="Notification category")


# =============================================================================
# QUIET HOURS SCHEMAS
# =============================================================================


class QuietHoursConfig(BaseModel):
    """Quiet hours / Do-Not-Disturb configuration.

    When enabled, non-urgent notifications are held during the
    specified time window and delivered after quiet hours end.
    """

    enabled: bool = Field(
        default=False,
        description="Whether quiet hours are enabled",
    )
    start_time: Optional[time] = Field(
        None,
        description="Quiet hours start time (24h format, local timezone)",
    )
    end_time: Optional[time] = Field(
        None,
        description="Quiet hours end time (24h format, local timezone)",
    )
    timezone: str = Field(
        default="UTC",
        max_length=50,
        description="IANA timezone for quiet hours (e.g., America/New_York)",
    )
    days: list[DayOfWeek] = Field(
        default_factory=lambda: list(DayOfWeek),
        description="Days of week when quiet hours apply (0=Sunday)",
    )

    @model_validator(mode="after")
    def validate_quiet_hours(self) -> "QuietHoursConfig":
        """Validate that start and end times are both set or both null."""
        if self.enabled:
            if self.start_time is None or self.end_time is None:
                raise ValueError(
                    "Both start_time and end_time must be set when quiet hours are enabled"
                )
        return self

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "enabled": True,
                "start_time": "22:00:00",
                "end_time": "08:00:00",
                "timezone": "America/New_York",
                "days": [0, 1, 2, 3, 4, 5, 6],
            }
        }
    )


# =============================================================================
# DIGEST SCHEDULE SCHEMAS
# =============================================================================


class DigestSchedule(BaseModel):
    """Digest delivery schedule configuration.

    Controls when daily and weekly digests are delivered.
    """

    daily_digest_time: time = Field(
        default=time(9, 0),
        description="Time for daily digest delivery (local timezone, 24h format)",
    )
    weekly_digest_day: DayOfWeek = Field(
        default=DayOfWeek.MONDAY,
        description="Day of week for weekly digest delivery",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "daily_digest_time": "09:00:00",
                "weekly_digest_day": 1,
            }
        }
    )


# =============================================================================
# PREFERENCE REQUEST SCHEMAS
# =============================================================================


class PreferenceCreateRequest(BaseModel):
    """Request schema for creating notification preferences.

    Creates preferences for a user or workspace defaults (user_id=None).
    """

    # User association (optional - None for workspace defaults)
    user_id: Optional[UUID] = Field(
        None,
        description="User ID for user-specific preferences. None for workspace defaults.",
    )

    # Channel preferences
    email_enabled: bool = Field(default=True, description="Enable email notifications")
    sms_enabled: bool = Field(default=False, description="Enable SMS notifications")
    in_app_enabled: bool = Field(default=True, description="Enable in-app notifications")
    push_enabled: bool = Field(default=True, description="Enable push notifications")

    # Category preferences
    gallery_activity: Optional[CategoryPreference] = Field(
        default=None,
        description="Gallery activity notification preferences",
    )
    client_interactions: Optional[CategoryPreference] = Field(
        default=None,
        description="Client interaction notification preferences",
    )
    system_alerts: Optional[CategoryPreference] = Field(
        default=None,
        description="System alert notification preferences (always instant)",
    )
    billing: Optional[CategoryPreference] = Field(
        default=None,
        description="Billing notification preferences (always instant)",
    )
    marketing: Optional[CategoryPreference] = Field(
        default=None,
        description="Marketing notification preferences",
    )
    invitation: Optional[CategoryPreference] = Field(
        default=None,
        description="Invitation notification preferences",
    )

    # Quiet hours
    quiet_hours: Optional[QuietHoursConfig] = Field(
        default=None,
        description="Quiet hours configuration",
    )

    # Digest schedule
    digest_schedule: Optional[DigestSchedule] = Field(
        default=None,
        description="Digest delivery schedule",
    )

    # Localization
    language: str = Field(
        default="en",
        max_length=5,
        description="Preferred language for notifications (ISO 639-1)",
    )
    timezone: str = Field(
        default="UTC",
        max_length=50,
        description="User timezone for scheduling",
    )

    # Transactional override
    transactional_email_enabled: bool = Field(
        default=True,
        description="Allow transactional emails even when email is disabled",
    )

    # Metadata
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Additional preference settings",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "email_enabled": True,
                "sms_enabled": False,
                "in_app_enabled": True,
                "push_enabled": True,
                "gallery_activity": {
                    "enabled": True,
                    "channels": ["email", "in_app"],
                    "frequency": "instant",
                },
                "marketing": {
                    "enabled": False,
                    "channels": ["email"],
                    "frequency": "weekly",
                },
                "quiet_hours": {
                    "enabled": True,
                    "start_time": "22:00:00",
                    "end_time": "08:00:00",
                    "timezone": "America/New_York",
                    "days": [0, 1, 2, 3, 4, 5, 6],
                },
                "language": "en",
                "timezone": "America/New_York",
            }
        }
    )


class PreferenceUpdateRequest(BaseModel):
    """Request schema for updating notification preferences.

    All fields are optional - only provided fields are updated.
    """

    # Channel preferences
    email_enabled: Optional[bool] = Field(None, description="Enable email notifications")
    sms_enabled: Optional[bool] = Field(None, description="Enable SMS notifications")
    in_app_enabled: Optional[bool] = Field(None, description="Enable in-app notifications")
    push_enabled: Optional[bool] = Field(None, description="Enable push notifications")

    # Category preferences
    gallery_activity: Optional[CategoryPreference] = Field(
        None, description="Gallery activity notification preferences"
    )
    client_interactions: Optional[CategoryPreference] = Field(
        None, description="Client interaction notification preferences"
    )
    system_alerts: Optional[CategoryPreference] = Field(
        None, description="System alert notification preferences"
    )
    billing: Optional[CategoryPreference] = Field(
        None, description="Billing notification preferences"
    )
    marketing: Optional[CategoryPreference] = Field(
        None, description="Marketing notification preferences"
    )
    invitation: Optional[CategoryPreference] = Field(
        None, description="Invitation notification preferences"
    )

    # Quiet hours
    quiet_hours: Optional[QuietHoursConfig] = Field(
        None, description="Quiet hours configuration"
    )

    # Digest schedule
    digest_schedule: Optional[DigestSchedule] = Field(
        None, description="Digest delivery schedule"
    )

    # Localization
    language: Optional[str] = Field(
        None, max_length=5, description="Preferred language for notifications"
    )
    timezone: Optional[str] = Field(
        None, max_length=50, description="User timezone for scheduling"
    )

    # Transactional override
    transactional_email_enabled: Optional[bool] = Field(
        None, description="Allow transactional emails even when email is disabled"
    )

    # Metadata
    metadata: Optional[dict[str, Any]] = Field(
        None, description="Additional preference settings"
    )


class CategoryPreferenceUpdateRequest(BaseModel):
    """Request schema for updating a single category's preferences."""

    enabled: Optional[bool] = Field(None, description="Enable this category")
    channels: Optional[list[NotificationChannel]] = Field(
        None, description="Channels for this category"
    )
    frequency: Optional[DigestFrequency] = Field(
        None, description="Delivery frequency for this category"
    )


class ChannelToggleRequest(BaseModel):
    """Request schema for toggling a specific channel on/off."""

    enabled: bool = Field(..., description="Whether to enable the channel")


class UnsubscribeRequest(BaseModel):
    """Request schema for unsubscribe actions via email link."""

    token: UUID = Field(..., description="Unsubscribe token from email")
    category: Optional[NotificationCategory] = Field(
        None,
        description="Specific category to unsubscribe from. None for global unsubscribe.",
    )
    reason: Optional[str] = Field(
        None,
        max_length=500,
        description="Optional reason for unsubscribing",
    )


class ResubscribeRequest(BaseModel):
    """Request schema for resubscribing to notifications."""

    categories: Optional[list[NotificationCategory]] = Field(
        None,
        description="Specific categories to resubscribe to. None for all non-marketing.",
    )


# =============================================================================
# PREFERENCE RESPONSE SCHEMAS
# =============================================================================


class PreferenceResponse(BaseModel):
    """Full notification preference response."""

    preference_id: UUID
    workspace_id: UUID
    user_id: Optional[UUID] = None

    # Channel preferences
    email_enabled: bool = True
    sms_enabled: bool = False
    in_app_enabled: bool = True
    push_enabled: bool = True

    # Category preferences (expanded)
    gallery_activity: CategoryPreference = Field(default_factory=CategoryPreference)
    client_interactions: CategoryPreference = Field(default_factory=CategoryPreference)
    system_alerts: CategoryPreference = Field(default_factory=CategoryPreference)
    billing: CategoryPreference = Field(default_factory=CategoryPreference)
    marketing: CategoryPreference = Field(
        default_factory=lambda: CategoryPreference(
            enabled=False,
            channels=[NotificationChannel.EMAIL],
            frequency=DigestFrequency.WEEKLY,
        )
    )
    invitation: CategoryPreference = Field(default_factory=CategoryPreference)

    # Quiet hours
    quiet_hours: QuietHoursConfig = Field(default_factory=QuietHoursConfig)

    # Digest schedule
    digest_schedule: DigestSchedule = Field(default_factory=DigestSchedule)

    # Localization
    language: str = "en"
    timezone: str = "UTC"

    # Transactional override
    transactional_email_enabled: bool = True

    # Unsubscribe tracking
    global_unsubscribe: bool = False
    global_unsubscribe_at: Optional[datetime] = None
    unsubscribe_token: Optional[UUID] = None

    # Metadata
    metadata: dict[str, Any] = Field(default_factory=dict)
    last_updated_source: PreferenceUpdateSource = PreferenceUpdateSource.USER

    # Timestamps
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PreferenceSummary(BaseModel):
    """Lightweight preference summary for list responses."""

    preference_id: UUID
    workspace_id: UUID
    user_id: Optional[UUID] = None

    # Channel status
    email_enabled: bool = True
    sms_enabled: bool = False
    in_app_enabled: bool = True
    push_enabled: bool = True

    # Global status
    global_unsubscribe: bool = False

    # Key settings
    language: str = "en"
    timezone: str = "UTC"

    # Timestamps
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PreferenceListResponse(BaseModel):
    """Paginated list of preferences."""

    data: list[PreferenceSummary]
    meta: PaginationMeta


# =============================================================================
# PREFERENCE CHECK SCHEMAS - For internal preference evaluation
# =============================================================================


class PreferenceCheckRequest(BaseModel):
    """Request to check if a notification should be sent based on preferences.

    Used internally by notification service to filter notifications.
    """

    user_id: UUID = Field(..., description="User to check preferences for")
    workspace_id: UUID = Field(..., description="Workspace context")
    category: NotificationCategory = Field(..., description="Notification category")
    channel: NotificationChannel = Field(..., description="Delivery channel")
    is_transactional: bool = Field(
        default=False,
        description="Whether this is a transactional notification",
    )


class PreferenceCheckResult(BaseModel):
    """Result of preference check for a notification.

    Indicates whether the notification should be sent and any modifications.
    """

    should_send: bool = Field(..., description="Whether to send the notification")
    reason: Optional[str] = Field(
        None, description="Reason if notification is blocked"
    )
    digest_frequency: Optional[DigestFrequency] = Field(
        None, description="Digest frequency if applicable"
    )
    is_quiet_hours: bool = Field(
        default=False, description="Whether currently in quiet hours"
    )
    delay_until: Optional[datetime] = Field(
        None, description="Time to delay notification until (quiet hours end)"
    )


# =============================================================================
# PREFERENCE MERGE SCHEMAS - For merging user and workspace defaults
# =============================================================================


class MergedPreferences(BaseModel):
    """Merged preferences from user and workspace defaults.

    User preferences take precedence over workspace defaults.
    """

    # Source tracking
    user_preference_id: Optional[UUID] = Field(
        None, description="User preference ID if exists"
    )
    workspace_default_id: Optional[UUID] = Field(
        None, description="Workspace default preference ID"
    )
    is_using_defaults: bool = Field(
        ..., description="Whether using workspace defaults (no user preferences)"
    )

    # Merged channel preferences
    email_enabled: bool = True
    sms_enabled: bool = False
    in_app_enabled: bool = True
    push_enabled: bool = True

    # Merged category preferences
    gallery_activity: CategoryPreference = Field(default_factory=CategoryPreference)
    client_interactions: CategoryPreference = Field(default_factory=CategoryPreference)
    system_alerts: CategoryPreference = Field(default_factory=CategoryPreference)
    billing: CategoryPreference = Field(default_factory=CategoryPreference)
    marketing: CategoryPreference = Field(
        default_factory=lambda: CategoryPreference(
            enabled=False,
            channels=[NotificationChannel.EMAIL],
            frequency=DigestFrequency.WEEKLY,
        )
    )
    invitation: CategoryPreference = Field(default_factory=CategoryPreference)

    # Merged quiet hours
    quiet_hours: QuietHoursConfig = Field(default_factory=QuietHoursConfig)

    # Merged localization
    language: str = "en"
    timezone: str = "UTC"

    # Global status
    global_unsubscribe: bool = False
    transactional_email_enabled: bool = True


# =============================================================================
# BULK PREFERENCE SCHEMAS
# =============================================================================


class BulkPreferenceUpdateRequest(BaseModel):
    """Request for bulk updating preferences across multiple users."""

    user_ids: list[UUID] = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="User IDs to update",
    )
    updates: PreferenceUpdateRequest = Field(
        ..., description="Updates to apply to all users"
    )


class BulkPreferenceUpdateResponse(BaseModel):
    """Response for bulk preference update."""

    updated: int = Field(..., description="Number of preferences updated")
    failed: int = Field(..., description="Number of updates that failed")
    errors: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Error details for failed updates",
    )


# =============================================================================
# PREFERENCE EXPORT/IMPORT SCHEMAS
# =============================================================================


class PreferenceExport(BaseModel):
    """Exportable preference data for data portability."""

    workspace_id: UUID
    user_id: Optional[UUID] = None

    # All preference data
    email_enabled: bool
    sms_enabled: bool
    in_app_enabled: bool
    push_enabled: bool

    gallery_activity: CategoryPreference
    client_interactions: CategoryPreference
    system_alerts: CategoryPreference
    billing: CategoryPreference
    marketing: CategoryPreference
    invitation: CategoryPreference

    quiet_hours: QuietHoursConfig
    digest_schedule: DigestSchedule

    language: str
    timezone: str
    transactional_email_enabled: bool

    global_unsubscribe: bool
    metadata: dict[str, Any]

    exported_at: datetime = Field(default_factory=datetime.utcnow)


class PreferenceImportRequest(BaseModel):
    """Request to import preferences from export data."""

    data: PreferenceExport = Field(..., description="Preference data to import")
    overwrite: bool = Field(
        default=False,
        description="Whether to overwrite existing preferences",
    )
