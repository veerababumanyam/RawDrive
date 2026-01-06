"""Pydantic models for Calendar & Booking management.

This module contains models for the calendar integration and booking system:
- CalendarIntegration: External calendar connections (Google, Microsoft)
- ServiceType: Photography service types with pricing
- Booking: Client appointments and sessions
- AvailabilitySettings: Working hours and availability configuration
- AvailabilityOverride: Date-specific availability changes
- SlotHold: Temporary slot reservations
- BookingPolicies: Cancellation and reminder policies

Feature: Calendar Integrations & Booking Management
"""

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


# =============================================================================
# CALENDAR ENUMS
# =============================================================================


class CalendarProvider(str, Enum):
    """Calendar provider types for integration."""

    GOOGLE = "google"
    MICROSOFT = "microsoft"


class CalendarConnectionStatus(str, Enum):
    """Status of a calendar integration connection."""

    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    NEEDS_REAUTH = "needs_reauth"
    ERROR = "error"


class CalendarSyncDirection(str, Enum):
    """Sync direction for calendar integration."""

    READ_ONLY = "read_only"
    WRITE_ONLY = "write_only"
    BIDIRECTIONAL = "bidirectional"


class DayOfWeek(str, Enum):
    """Days of the week for availability."""

    MONDAY = "monday"
    TUESDAY = "tuesday"
    WEDNESDAY = "wednesday"
    THURSDAY = "thursday"
    FRIDAY = "friday"
    SATURDAY = "saturday"
    SUNDAY = "sunday"


# =============================================================================
# BOOKING ENUMS
# =============================================================================


class BookingStatus(str, Enum):
    """Status of a booking."""

    PENDING = "pending"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"
    COMPLETED = "completed"
    NO_SHOW = "no_show"
    RESCHEDULED = "rescheduled"


class BookingPaymentStatus(str, Enum):
    """Payment status for a booking."""

    NONE = "none"
    DEPOSIT_PAID = "deposit_paid"
    FULLY_PAID = "fully_paid"
    REFUNDED = "refunded"
    PARTIALLY_REFUNDED = "partially_refunded"
    FAILED = "failed"


class DurationUnit(str, Enum):
    """Duration unit for service types."""

    MINUTES = "minutes"
    HOURS = "hours"


class BookingSource(str, Enum):
    """Source of a booking."""

    PUBLIC_PAGE = "public_page"
    MANUAL = "manual"
    API = "api"
    IMPORT = "import"


class CancellationPolicyType(str, Enum):
    """Cancellation policy type."""

    NO_REFUND = "no_refund"
    FULL_REFUND = "full_refund"
    PARTIAL_REFUND = "partial_refund"
    FLEXIBLE = "flexible"


# =============================================================================
# CALENDAR INTEGRATION MODELS
# =============================================================================


class CalendarIntegration(BaseModel):
    """External calendar integration for syncing availability.

    Stores OAuth credentials and configuration for Google/Microsoft calendar sync.
    """

    integration_id: UUID
    workspace_id: UUID
    user_id: UUID

    provider: CalendarProvider
    account_email: str = Field(..., max_length=255)
    display_name: Optional[str] = Field(None, max_length=200)

    external_calendar_id: str = Field(..., max_length=500)
    external_calendar_name: Optional[str] = Field(None, max_length=255)

    status: CalendarConnectionStatus = CalendarConnectionStatus.CONNECTED
    sync_direction: CalendarSyncDirection = CalendarSyncDirection.BIDIRECTIONAL
    include_in_availability: bool = True

    # Encrypted OAuth tokens (stored encrypted in DB)
    access_token_encrypted: Optional[str] = None
    refresh_token_encrypted: Optional[str] = None
    token_expires_at: Optional[datetime] = None

    last_sync_at: Optional[datetime] = None
    last_sync_error: Optional[str] = None

    created_at: datetime
    updated_at: datetime


class CalendarIntegrationSummary(BaseModel):
    """Lightweight calendar integration summary for API responses."""

    integration_id: UUID
    provider: CalendarProvider
    account_email: str
    display_name: Optional[str] = None
    external_calendar_name: Optional[str] = None
    status: CalendarConnectionStatus
    sync_direction: CalendarSyncDirection
    include_in_availability: bool
    last_sync_at: Optional[datetime] = None


# =============================================================================
# AVAILABILITY MODELS
# =============================================================================


class TimeWindow(BaseModel):
    """Time window for availability (HH:MM format)."""

    start: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    end: str = Field(..., pattern=r"^\d{2}:\d{2}$")


class DayAvailability(BaseModel):
    """Availability configuration for a single day."""

    day: DayOfWeek
    is_available: bool = True
    time_windows: list[TimeWindow] = Field(default_factory=list)


class AvailabilitySettings(BaseModel):
    """Working hours and availability settings for a workspace.

    Defines standard operating hours, buffer times, and booking windows.
    """

    settings_id: UUID
    workspace_id: UUID

    timezone: str = Field(..., max_length=50)
    weekly_schedule: list[DayAvailability]

    buffer_before_minutes: int = Field(15, ge=0, le=120)
    buffer_after_minutes: int = Field(15, ge=0, le=120)
    minimum_notice_hours: int = Field(24, ge=0, le=720)
    max_advance_days: int = Field(60, ge=1, le=365)
    slot_increment_minutes: int = Field(30, ge=15, le=120)

    created_at: datetime
    updated_at: datetime


class AvailabilityOverride(BaseModel):
    """Date-specific override for availability.

    Used for holidays, vacations, or custom hours on specific dates.
    """

    override_id: UUID
    workspace_id: UUID

    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")  # YYYY-MM-DD
    is_available: bool
    time_windows: Optional[list[TimeWindow]] = None
    reason: Optional[str] = Field(None, max_length=200)

    created_at: datetime


# =============================================================================
# SERVICE TYPE MODELS
# =============================================================================


class ServiceType(BaseModel):
    """Photography service type with pricing.

    Defines bookable services like "Portrait Session" or "Wedding Consultation".
    """

    service_type_id: UUID
    workspace_id: UUID

    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)

    duration: int = Field(..., ge=15, le=1440)  # minutes
    duration_unit: DurationUnit = DurationUnit.MINUTES

    price_cents: int = Field(..., ge=0)
    currency: str = Field("USD", max_length=3)
    deposit_cents: int = Field(0, ge=0)

    is_active: bool = True
    display_order: int = Field(0, ge=0)
    color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")

    location: Optional[str] = Field(None, max_length=500)
    client_location_allowed: bool = False
    max_per_day: Optional[int] = Field(None, ge=1)

    public_notes: Optional[str] = Field(None, max_length=2000)
    private_notes: Optional[str] = Field(None, max_length=2000)

    created_at: datetime
    updated_at: datetime


class ServiceTypeSummary(BaseModel):
    """Lightweight service type summary for API responses."""

    service_type_id: UUID
    name: str
    description: Optional[str] = None
    duration: int
    duration_unit: DurationUnit
    price_cents: int
    currency: str
    deposit_cents: int
    is_active: bool
    color: Optional[str] = None


# =============================================================================
# BOOKING MODELS
# =============================================================================


class BookingRemindersSent(BaseModel):
    """Tracking which reminders have been sent."""

    reminder_24h: bool = False
    reminder_1h: bool = False
    follow_up: bool = False


class Booking(BaseModel):
    """A booking/appointment with a client.

    Represents a scheduled photography session with all details.
    """

    booking_id: UUID
    workspace_id: UUID
    service_type_id: UUID
    service_type_name: str

    client_id: Optional[UUID] = None
    client_name: str = Field(..., min_length=1, max_length=200)
    client_email: str = Field(..., max_length=255)
    client_phone: Optional[str] = Field(None, max_length=50)

    status: BookingStatus = BookingStatus.PENDING
    payment_status: BookingPaymentStatus = BookingPaymentStatus.NONE

    start_time: datetime
    end_time: datetime
    timezone: str = Field(..., max_length=50)

    location: Optional[str] = Field(None, max_length=500)
    client_notes: Optional[str] = Field(None, max_length=2000)
    internal_notes: Optional[str] = Field(None, max_length=2000)

    total_price_cents: int = Field(..., ge=0)
    deposit_amount_cents: int = Field(0, ge=0)
    amount_paid_cents: int = Field(0, ge=0)
    currency: str = Field("USD", max_length=3)

    stripe_payment_intent_id: Optional[str] = Field(None, max_length=255)
    external_event_id: Optional[str] = Field(None, max_length=500)

    source: BookingSource = BookingSource.PUBLIC_PAGE
    confirmation_code: str = Field(..., max_length=20)

    cancellation_reason: Optional[str] = Field(None, max_length=500)
    cancelled_at: Optional[datetime] = None
    cancelled_by: Optional[str] = None  # 'client' | 'photographer'

    rescheduled_from_id: Optional[UUID] = None
    rescheduled_to_id: Optional[UUID] = None

    reminders_sent: BookingRemindersSent = Field(default_factory=BookingRemindersSent)
    hold_expires_at: Optional[datetime] = None

    created_at: datetime
    updated_at: datetime


class BookingSummary(BaseModel):
    """Lightweight booking summary for API responses."""

    booking_id: UUID
    service_type_name: str
    client_name: str
    client_email: str
    status: BookingStatus
    payment_status: BookingPaymentStatus
    start_time: datetime
    end_time: datetime
    timezone: str
    total_price_cents: int
    currency: str
    confirmation_code: str
    source: BookingSource


# =============================================================================
# SLOT HOLD MODEL
# =============================================================================


class SlotHold(BaseModel):
    """Temporary hold on a booking slot.

    Prevents double-booking while client completes payment.
    """

    hold_id: UUID
    workspace_id: UUID
    service_type_id: UUID

    start_time: datetime
    end_time: datetime

    client_email: str = Field(..., max_length=255)
    expires_at: datetime

    is_released: bool = False
    released_at: Optional[datetime] = None
    booking_id: Optional[UUID] = None  # Set when converted to booking

    created_at: datetime


# =============================================================================
# BOOKING POLICIES MODEL
# =============================================================================


class CancellationPolicy(BaseModel):
    """Cancellation policy configuration."""

    type: CancellationPolicyType
    free_cancellation_hours: Optional[int] = Field(None, ge=0)
    partial_refund_percent: Optional[int] = Field(None, ge=0, le=100)
    description: str = Field(..., max_length=500)


class ReminderSettings(BaseModel):
    """Reminder settings for bookings."""

    send_24h_reminder: bool = True
    send_1h_reminder: bool = True
    send_follow_up: bool = True
    follow_up_delay_hours: int = Field(24, ge=1, le=168)
    reminder_24h_message: Optional[str] = Field(None, max_length=1000)
    reminder_1h_message: Optional[str] = Field(None, max_length=1000)
    follow_up_message: Optional[str] = Field(None, max_length=1000)


class BookingPolicies(BaseModel):
    """Booking policies configuration for a workspace.

    Defines cancellation, rescheduling, and payment requirements.
    """

    policies_id: UUID
    workspace_id: UUID

    cancellation_policy: CancellationPolicy
    allow_reschedule: bool = True
    reschedule_deadline_hours: int = Field(24, ge=0)
    max_reschedules: int = Field(3, ge=0)

    require_deposit: bool = True
    collect_full_payment: bool = False

    confirmation_message: Optional[str] = Field(None, max_length=2000)
    reminder_settings: ReminderSettings = Field(default_factory=ReminderSettings)

    created_at: datetime
    updated_at: datetime


# =============================================================================
# BUSY TIME & AVAILABLE SLOT MODELS
# =============================================================================


class BusyTimeBlock(BaseModel):
    """A busy time block from an external calendar."""

    start: datetime
    end: datetime
    integration_id: Optional[UUID] = None
    title: Optional[str] = None
    is_all_day: bool = False


class AvailableSlot(BaseModel):
    """An available time slot for booking."""

    start: datetime
    end: datetime
    duration_minutes: int
    is_available: bool = True


# =============================================================================
# STATISTICS MODELS
# =============================================================================


class BookingStats(BaseModel):
    """Booking statistics for a workspace."""

    workspace_id: UUID
    total_bookings: int
    bookings_this_month: int
    bookings_by_status: dict[str, int]
    revenue_this_month_cents: int
    revenue_total_cents: int
    average_booking_value_cents: int
    cancellation_rate_percent: float
    no_show_rate_percent: float
    most_popular_service: Optional[dict[str, Any]] = None
    upcoming_bookings_count: int


class CalendarViewData(BaseModel):
    """Calendar view data for a date range."""

    range_start: datetime
    range_end: datetime
    bookings: list[BookingSummary]
    busy_times: list[BusyTimeBlock]
    overrides: list[AvailabilityOverride]


# =============================================================================
# PUBLIC BOOKING MODELS
# =============================================================================


class PublicBookingPageConfig(BaseModel):
    """Public booking page configuration."""

    workspace_id: UUID
    workspace_slug: str
    business_name: str
    logo_url: Optional[str] = None
    cover_image_url: Optional[str] = None
    welcome_message: Optional[str] = None
    brand_color: Optional[str] = None
    service_types: list[ServiceTypeSummary]
    timezone: str
    cancellation_policy: CancellationPolicy
    terms_url: Optional[str] = None
    privacy_url: Optional[str] = None


class PublicBookingSummary(BaseModel):
    """Public-facing booking summary (limited information)."""

    confirmation_code: str
    service_name: str
    status: BookingStatus
    start_time: datetime
    end_time: datetime
    timezone: str
    location: Optional[str] = None
    business_name: str
    can_cancel: bool
    can_reschedule: bool
    cancellation_deadline: Optional[datetime] = None
