/**
 * Calendar & Booking Types for RawDrive
 *
 * This module provides shared types for:
 * - Calendar integrations (Google, Microsoft OAuth)
 * - Availability/working hours configuration
 * - Service types and pricing
 * - Booking management
 * - Public booking flow
 *
 * @module calendar
 */

// ---------------------------------------------------------------------------
// Core Enums / Union Types
// ---------------------------------------------------------------------------

/**
 * Calendar provider types supported for integration
 */
export const CalendarProvider = {
  GOOGLE: 'google',
  MICROSOFT: 'microsoft',
} as const;
export type CalendarProvider = typeof CalendarProvider[keyof typeof CalendarProvider];

/**
 * Status of a calendar integration connection
 */
export const CalendarConnectionStatus = {
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  NEEDS_REAUTH: 'needs_reauth',
  ERROR: 'error',
} as const;
export type CalendarConnectionStatus = typeof CalendarConnectionStatus[keyof typeof CalendarConnectionStatus];

/**
 * Sync direction for calendar integration
 */
export const CalendarSyncDirection = {
  /** Only read busy times from external calendar */
  READ_ONLY: 'read_only',
  /** Only push RawDrive bookings to external calendar */
  WRITE_ONLY: 'write_only',
  /** Bi-directional sync */
  BIDIRECTIONAL: 'bidirectional',
} as const;
export type CalendarSyncDirection = typeof CalendarSyncDirection[keyof typeof CalendarSyncDirection];

/**
 * Status of a booking
 */
export const BookingStatus = {
  /** Temporary hold on slot, awaiting payment */
  PENDING: 'pending',
  /** Payment received, booking confirmed */
  CONFIRMED: 'confirmed',
  /** Booking was cancelled */
  CANCELLED: 'cancelled',
  /** Session completed */
  COMPLETED: 'completed',
  /** Client did not show up */
  NO_SHOW: 'no_show',
  /** Booking was rescheduled (new booking created) */
  RESCHEDULED: 'rescheduled',
} as const;
export type BookingStatus = typeof BookingStatus[keyof typeof BookingStatus];

/**
 * Payment status for a booking
 */
export const BookingPaymentStatus = {
  /** No payment required or not yet initiated */
  NONE: 'none',
  /** Deposit paid */
  DEPOSIT_PAID: 'deposit_paid',
  /** Full amount paid */
  FULLY_PAID: 'fully_paid',
  /** Refund issued */
  REFUNDED: 'refunded',
  /** Partial refund issued */
  PARTIALLY_REFUNDED: 'partially_refunded',
  /** Payment failed */
  FAILED: 'failed',
} as const;
export type BookingPaymentStatus = typeof BookingPaymentStatus[keyof typeof BookingPaymentStatus];

/**
 * Duration unit for service types
 */
export const DurationUnit = {
  MINUTES: 'minutes',
  HOURS: 'hours',
} as const;
export type DurationUnit = typeof DurationUnit[keyof typeof DurationUnit];

/**
 * Days of the week for availability
 */
export const DayOfWeek = {
  MONDAY: 'monday',
  TUESDAY: 'tuesday',
  WEDNESDAY: 'wednesday',
  THURSDAY: 'thursday',
  FRIDAY: 'friday',
  SATURDAY: 'saturday',
  SUNDAY: 'sunday',
} as const;
export type DayOfWeek = typeof DayOfWeek[keyof typeof DayOfWeek];

/**
 * Cancellation policy type
 */
export const CancellationPolicyType = {
  /** No refund for cancellations */
  NO_REFUND: 'no_refund',
  /** Full refund if cancelled before deadline */
  FULL_REFUND: 'full_refund',
  /** Partial refund based on timing */
  PARTIAL_REFUND: 'partial_refund',
  /** Flexible - custom policy per booking */
  FLEXIBLE: 'flexible',
} as const;
export type CancellationPolicyType = typeof CancellationPolicyType[keyof typeof CancellationPolicyType];

/**
 * Booking source - where the booking originated from
 */
export const BookingSource = {
  /** Booked via public booking page */
  PUBLIC_PAGE: 'public_page',
  /** Manually created by photographer */
  MANUAL: 'manual',
  /** Created via API integration */
  API: 'api',
  /** Imported from external system */
  IMPORT: 'import',
} as const;
export type BookingSource = typeof BookingSource[keyof typeof BookingSource];

/**
 * Calendar sync error codes
 */
export const CalendarSyncErrorCode = {
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_REVOKED: 'TOKEN_REVOKED',
  RATE_LIMITED: 'RATE_LIMITED',
  CALENDAR_NOT_FOUND: 'CALENDAR_NOT_FOUND',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  INVALID_EVENT: 'INVALID_EVENT',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
export type CalendarSyncErrorCode = typeof CalendarSyncErrorCode[keyof typeof CalendarSyncErrorCode];

// ---------------------------------------------------------------------------
// Calendar Integration Interfaces
// ---------------------------------------------------------------------------

/**
 * External calendar integration configuration
 */
export interface CalendarIntegration {
  /** Unique integration ID */
  integration_id: string;
  /** Workspace ID */
  workspace_id: string;
  /** User who connected the calendar */
  user_id: string;
  /** Calendar provider */
  provider: CalendarProvider;
  /** Email/account associated with the calendar */
  account_email: string;
  /** Display name for the integration */
  display_name?: string;
  /** External calendar ID (from provider) */
  external_calendar_id: string;
  /** External calendar name */
  external_calendar_name?: string;
  /** Connection status */
  status: CalendarConnectionStatus;
  /** Sync direction configuration */
  sync_direction: CalendarSyncDirection;
  /** Whether to include this calendar in availability calculation */
  include_in_availability: boolean;
  /** Last successful sync timestamp */
  last_sync_at?: string;
  /** Last sync error message */
  last_sync_error?: string;
  /** Last sync error code */
  last_sync_error_code?: CalendarSyncErrorCode;
  /** Creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
}

/**
 * Request to connect a new calendar integration
 */
export interface ConnectCalendarRequest {
  /** Calendar provider */
  provider: CalendarProvider;
  /** OAuth authorization code */
  auth_code: string;
  /** OAuth redirect URI used */
  redirect_uri: string;
  /** Optional display name */
  display_name?: string;
  /** Sync direction (default: bidirectional) */
  sync_direction?: CalendarSyncDirection;
}

/**
 * Response after initiating calendar connection
 */
export interface ConnectCalendarResponse {
  /** The created integration */
  integration: CalendarIntegration;
  /** Available calendars to choose from */
  available_calendars: ExternalCalendarInfo[];
  /** Confirmation message */
  message: string;
}

/**
 * External calendar information from provider
 */
export interface ExternalCalendarInfo {
  /** Calendar ID from provider */
  calendar_id: string;
  /** Calendar display name */
  name: string;
  /** Calendar description */
  description?: string;
  /** Whether this is the primary calendar */
  is_primary: boolean;
  /** Calendar color (hex) */
  color?: string;
  /** Timezone of the calendar */
  timezone?: string;
  /** Access role */
  access_role?: 'owner' | 'writer' | 'reader';
}

/**
 * Request to select which calendar to sync
 */
export interface SelectCalendarRequest {
  /** External calendar ID to sync */
  external_calendar_id: string;
  /** Include in availability calculation */
  include_in_availability?: boolean;
}

/**
 * Request to update calendar integration settings
 */
export interface UpdateCalendarIntegrationRequest {
  /** Display name */
  display_name?: string;
  /** Sync direction */
  sync_direction?: CalendarSyncDirection;
  /** Include in availability calculation */
  include_in_availability?: boolean;
}

/**
 * Calendar sync status information
 */
export interface CalendarSyncStatus {
  /** Integration ID */
  integration_id: string;
  /** Current sync status */
  status: CalendarConnectionStatus;
  /** Last successful sync */
  last_sync_at?: string;
  /** Next scheduled sync */
  next_sync_at?: string;
  /** Number of events synced */
  events_synced: number;
  /** Last error if any */
  last_error?: string;
  /** Last error code */
  last_error_code?: CalendarSyncErrorCode;
}

// ---------------------------------------------------------------------------
// Busy Time Interfaces
// ---------------------------------------------------------------------------

/**
 * A busy time block from an external calendar
 */
export interface BusyTimeBlock {
  /** Start time (ISO datetime) */
  start: string;
  /** End time (ISO datetime) */
  end: string;
  /** Source integration ID */
  integration_id?: string;
  /** Event title (may be hidden for privacy) */
  title?: string;
  /** Whether this is an all-day event */
  is_all_day: boolean;
}

/**
 * Request to fetch busy times
 */
export interface GetBusyTimesRequest {
  /** Start of range (ISO datetime) */
  start: string;
  /** End of range (ISO datetime) */
  end: string;
  /** Specific integration IDs (optional, defaults to all) */
  integration_ids?: string[];
}

/**
 * Response with busy times
 */
export interface GetBusyTimesResponse {
  /** Busy time blocks */
  busy_times: BusyTimeBlock[];
  /** Range start */
  range_start: string;
  /** Range end */
  range_end: string;
}

// ---------------------------------------------------------------------------
// Availability Interfaces
// ---------------------------------------------------------------------------

/**
 * Time window for a specific day
 */
export interface TimeWindow {
  /** Start time in HH:MM format (24-hour) */
  start: string;
  /** End time in HH:MM format (24-hour) */
  end: string;
}

/**
 * Availability configuration for a single day
 */
export interface DayAvailability {
  /** Day of the week */
  day: DayOfWeek;
  /** Whether the photographer is available this day */
  is_available: boolean;
  /** Time windows when available (can have multiple, e.g., morning and evening) */
  time_windows: TimeWindow[];
}

/**
 * Working hours / availability settings
 */
export interface AvailabilitySettings {
  /** Settings ID */
  settings_id: string;
  /** Workspace ID */
  workspace_id: string;
  /** IANA timezone identifier (e.g., "America/New_York") */
  timezone: string;
  /** Weekly availability schedule */
  weekly_schedule: DayAvailability[];
  /** Buffer time before appointments (minutes) */
  buffer_before_minutes: number;
  /** Buffer time after appointments (minutes) */
  buffer_after_minutes: number;
  /** Minimum notice required for bookings (hours) */
  minimum_notice_hours: number;
  /** Maximum advance booking window (days) */
  max_advance_days: number;
  /** Slot duration increment for booking (minutes, e.g., 15, 30, 60) */
  slot_increment_minutes: number;
  /** Creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
}

/**
 * Request to update availability settings
 */
export interface UpdateAvailabilitySettingsRequest {
  /** Timezone */
  timezone?: string;
  /** Weekly schedule */
  weekly_schedule?: DayAvailability[];
  /** Buffer before (minutes) */
  buffer_before_minutes?: number;
  /** Buffer after (minutes) */
  buffer_after_minutes?: number;
  /** Minimum notice (hours) */
  minimum_notice_hours?: number;
  /** Maximum advance booking (days) */
  max_advance_days?: number;
  /** Slot increment (minutes) */
  slot_increment_minutes?: number;
}

/**
 * Date-specific override for availability
 */
export interface AvailabilityOverride {
  /** Override ID */
  override_id: string;
  /** Workspace ID */
  workspace_id: string;
  /** Date of the override (YYYY-MM-DD) */
  date: string;
  /** Whether available on this date */
  is_available: boolean;
  /** Custom time windows (if is_available is true) */
  time_windows?: TimeWindow[];
  /** Reason for the override (e.g., "Holiday", "Vacation") */
  reason?: string;
  /** Creation timestamp */
  created_at: string;
}

/**
 * Request to create an availability override
 */
export interface CreateAvailabilityOverrideRequest {
  /** Date of the override (YYYY-MM-DD) */
  date: string;
  /** Whether available */
  is_available: boolean;
  /** Custom time windows */
  time_windows?: TimeWindow[];
  /** Reason */
  reason?: string;
}

// ---------------------------------------------------------------------------
// Available Slots Interfaces
// ---------------------------------------------------------------------------

/**
 * An available time slot for booking
 */
export interface AvailableSlot {
  /** Start time (ISO datetime) */
  start: string;
  /** End time (ISO datetime) */
  end: string;
  /** Duration in minutes */
  duration_minutes: number;
  /** Whether this slot is still available (for real-time updates) */
  is_available: boolean;
}

/**
 * Request to get available slots
 */
export interface GetAvailableSlotsRequest {
  /** Service type ID (determines duration) */
  service_type_id: string;
  /** Date to get slots for (YYYY-MM-DD) */
  date: string;
  /** Client timezone for display (optional) */
  client_timezone?: string;
}

/**
 * Response with available slots
 */
export interface GetAvailableSlotsResponse {
  /** Date requested */
  date: string;
  /** Available slots */
  slots: AvailableSlot[];
  /** Timezone of the slots */
  timezone: string;
  /** Service type duration (minutes) */
  service_duration_minutes: number;
}

/**
 * Request to get available dates in a range
 */
export interface GetAvailableDatesRequest {
  /** Service type ID */
  service_type_id: string;
  /** Start of range (YYYY-MM-DD) */
  start_date: string;
  /** End of range (YYYY-MM-DD) */
  end_date: string;
}

/**
 * Response with available dates
 */
export interface GetAvailableDatesResponse {
  /** Dates with availability */
  available_dates: string[];
  /** Start of range */
  start_date: string;
  /** End of range */
  end_date: string;
}

// ---------------------------------------------------------------------------
// Service Type Interfaces
// ---------------------------------------------------------------------------

/**
 * Photography service type (e.g., "Portrait Session", "Wedding Package")
 */
export interface ServiceType {
  /** Service type ID */
  service_type_id: string;
  /** Workspace ID */
  workspace_id: string;
  /** Service name */
  name: string;
  /** Service description */
  description?: string;
  /** Duration value */
  duration: number;
  /** Duration unit */
  duration_unit: DurationUnit;
  /** Price in cents */
  price_cents: number;
  /** Currency code (e.g., "USD") */
  currency: string;
  /** Deposit required (in cents, 0 for no deposit) */
  deposit_cents: number;
  /** Whether this service is active and bookable */
  is_active: boolean;
  /** Display order for sorting */
  display_order: number;
  /** Color for calendar display (hex) */
  color?: string;
  /** Location/address for the service */
  location?: string;
  /** Whether location is at client's choice */
  client_location_allowed: boolean;
  /** Maximum number of bookings per day for this service */
  max_per_day?: number;
  /** Additional notes visible to client */
  public_notes?: string;
  /** Internal notes (visible only to photographer) */
  private_notes?: string;
  /** Creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
}

/**
 * Request to create a service type
 */
export interface CreateServiceTypeRequest {
  /** Service name */
  name: string;
  /** Description */
  description?: string;
  /** Duration value */
  duration: number;
  /** Duration unit */
  duration_unit: DurationUnit;
  /** Price in cents */
  price_cents: number;
  /** Currency code */
  currency: string;
  /** Deposit in cents */
  deposit_cents?: number;
  /** Whether active */
  is_active?: boolean;
  /** Display order */
  display_order?: number;
  /** Color (hex) */
  color?: string;
  /** Location */
  location?: string;
  /** Allow client location */
  client_location_allowed?: boolean;
  /** Max per day */
  max_per_day?: number;
  /** Public notes */
  public_notes?: string;
  /** Private notes */
  private_notes?: string;
}

/**
 * Request to update a service type
 */
export interface UpdateServiceTypeRequest {
  /** Service name */
  name?: string;
  /** Description */
  description?: string;
  /** Duration value */
  duration?: number;
  /** Duration unit */
  duration_unit?: DurationUnit;
  /** Price in cents */
  price_cents?: number;
  /** Currency code */
  currency?: string;
  /** Deposit in cents */
  deposit_cents?: number;
  /** Whether active */
  is_active?: boolean;
  /** Display order */
  display_order?: number;
  /** Color (hex) */
  color?: string;
  /** Location */
  location?: string;
  /** Allow client location */
  client_location_allowed?: boolean;
  /** Max per day */
  max_per_day?: number;
  /** Public notes */
  public_notes?: string;
  /** Private notes */
  private_notes?: string;
}

// ---------------------------------------------------------------------------
// Booking Interfaces
// ---------------------------------------------------------------------------

/**
 * A booking/appointment
 */
export interface Booking {
  /** Booking ID */
  booking_id: string;
  /** Workspace ID */
  workspace_id: string;
  /** Service type ID */
  service_type_id: string;
  /** Service type name (denormalized) */
  service_type_name: string;
  /** Client ID (if linked to existing client) */
  client_id?: string;
  /** Client name */
  client_name: string;
  /** Client email */
  client_email: string;
  /** Client phone (optional) */
  client_phone?: string;
  /** Booking status */
  status: BookingStatus;
  /** Payment status */
  payment_status: BookingPaymentStatus;
  /** Start time (ISO datetime) */
  start_time: string;
  /** End time (ISO datetime) */
  end_time: string;
  /** Timezone */
  timezone: string;
  /** Location/address for the session */
  location?: string;
  /** Client-provided notes/requests */
  client_notes?: string;
  /** Photographer's internal notes */
  internal_notes?: string;
  /** Total price in cents */
  total_price_cents: number;
  /** Deposit amount in cents */
  deposit_amount_cents: number;
  /** Amount paid so far in cents */
  amount_paid_cents: number;
  /** Currency code */
  currency: string;
  /** Stripe payment intent ID */
  stripe_payment_intent_id?: string;
  /** External calendar event ID (if synced) */
  external_event_id?: string;
  /** Source of the booking */
  source: BookingSource;
  /** Confirmation code for client reference */
  confirmation_code: string;
  /** Cancellation reason (if cancelled) */
  cancellation_reason?: string;
  /** When the booking was cancelled */
  cancelled_at?: string;
  /** Who cancelled the booking */
  cancelled_by?: 'client' | 'photographer';
  /** Original booking ID (if this is a reschedule) */
  rescheduled_from_id?: string;
  /** New booking ID (if this was rescheduled) */
  rescheduled_to_id?: string;
  /** Reminder sent flags */
  reminders_sent: BookingRemindersSent;
  /** Hold expiration time (for pending bookings) */
  hold_expires_at?: string;
  /** Creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
}

/**
 * Tracking which reminders have been sent
 */
export interface BookingRemindersSent {
  /** 24-hour reminder sent */
  reminder_24h: boolean;
  /** 1-hour reminder sent */
  reminder_1h: boolean;
  /** Follow-up email sent */
  follow_up: boolean;
}

/**
 * Request to create a booking (manual creation by photographer)
 */
export interface CreateBookingRequest {
  /** Service type ID */
  service_type_id: string;
  /** Client ID (optional, can create new client) */
  client_id?: string;
  /** Client name */
  client_name: string;
  /** Client email */
  client_email: string;
  /** Client phone */
  client_phone?: string;
  /** Start time (ISO datetime) */
  start_time: string;
  /** Location */
  location?: string;
  /** Client notes */
  client_notes?: string;
  /** Internal notes */
  internal_notes?: string;
  /** Override price (optional, defaults to service type price) */
  override_price_cents?: number;
  /** Override deposit (optional) */
  override_deposit_cents?: number;
  /** Skip payment requirement */
  skip_payment?: boolean;
  /** Send confirmation email to client */
  send_confirmation?: boolean;
}

/**
 * Request to update a booking
 */
export interface UpdateBookingRequest {
  /** Status */
  status?: BookingStatus;
  /** Start time */
  start_time?: string;
  /** Location */
  location?: string;
  /** Client notes */
  client_notes?: string;
  /** Internal notes */
  internal_notes?: string;
}

/**
 * Request to cancel a booking
 */
export interface CancelBookingRequest {
  /** Cancellation reason */
  reason?: string;
  /** Issue refund */
  issue_refund?: boolean;
  /** Notify client */
  notify_client?: boolean;
}

/**
 * Request to reschedule a booking
 */
export interface RescheduleBookingRequest {
  /** New start time */
  new_start_time: string;
  /** New location (optional) */
  new_location?: string;
  /** Notify client */
  notify_client?: boolean;
  /** Reason for reschedule */
  reason?: string;
}

/**
 * Response after rescheduling
 */
export interface RescheduleBookingResponse {
  /** Original booking (now marked as rescheduled) */
  original_booking: Booking;
  /** New booking */
  new_booking: Booking;
  /** Confirmation message */
  message: string;
}

// ---------------------------------------------------------------------------
// Public Booking Flow Interfaces
// ---------------------------------------------------------------------------

/**
 * Public booking page configuration
 */
export interface PublicBookingPageConfig {
  /** Workspace ID */
  workspace_id: string;
  /** Workspace slug for URL */
  workspace_slug: string;
  /** Business/photographer name */
  business_name: string;
  /** Business logo URL */
  logo_url?: string;
  /** Cover image URL */
  cover_image_url?: string;
  /** Welcome message */
  welcome_message?: string;
  /** Brand color (hex) */
  brand_color?: string;
  /** Available service types */
  service_types: ServiceType[];
  /** Timezone */
  timezone: string;
  /** Cancellation policy */
  cancellation_policy: CancellationPolicy;
  /** Terms and conditions URL */
  terms_url?: string;
  /** Privacy policy URL */
  privacy_url?: string;
}

/**
 * Cancellation policy configuration
 */
export interface CancellationPolicy {
  /** Policy type */
  type: CancellationPolicyType;
  /** Free cancellation window (hours before appointment) */
  free_cancellation_hours?: number;
  /** Refund percentage if cancelled after free window */
  partial_refund_percent?: number;
  /** Policy description displayed to clients */
  description: string;
}

/**
 * Request to hold a slot temporarily
 */
export interface HoldSlotRequest {
  /** Service type ID */
  service_type_id: string;
  /** Start time (ISO datetime) */
  start_time: string;
  /** Client email (for tracking) */
  client_email: string;
}

/**
 * Response after holding a slot
 */
export interface HoldSlotResponse {
  /** Hold ID */
  hold_id: string;
  /** Slot start time */
  start_time: string;
  /** Slot end time */
  end_time: string;
  /** When the hold expires */
  expires_at: string;
  /** Duration of hold in seconds */
  hold_duration_seconds: number;
}

/**
 * Request to complete a public booking
 */
export interface CompletePublicBookingRequest {
  /** Hold ID from HoldSlotResponse */
  hold_id: string;
  /** Client information */
  client_name: string;
  client_email: string;
  client_phone?: string;
  /** Client notes/requests */
  notes?: string;
  /** Preferred location (if client_location_allowed) */
  location?: string;
  /** Stripe payment method ID */
  payment_method_id: string;
  /** Accept terms */
  accept_terms: boolean;
}

/**
 * Response after completing a public booking
 */
export interface CompletePublicBookingResponse {
  /** The created booking */
  booking: Booking;
  /** Confirmation code */
  confirmation_code: string;
  /** Client payment intent status */
  payment_status: string;
  /** Calendar event (.ics) download URL */
  calendar_event_url: string;
  /** Confirmation message */
  message: string;
}

/**
 * Request to check booking status by confirmation code
 */
export interface CheckBookingStatusRequest {
  /** Confirmation code */
  confirmation_code: string;
  /** Client email (for verification) */
  client_email: string;
}

/**
 * Public-facing booking summary (limited information)
 */
export interface PublicBookingSummary {
  /** Confirmation code */
  confirmation_code: string;
  /** Service name */
  service_name: string;
  /** Booking status */
  status: BookingStatus;
  /** Start time */
  start_time: string;
  /** End time */
  end_time: string;
  /** Timezone */
  timezone: string;
  /** Location */
  location?: string;
  /** Photographer/business name */
  business_name: string;
  /** Can be cancelled */
  can_cancel: boolean;
  /** Can be rescheduled */
  can_reschedule: boolean;
  /** Cancellation deadline */
  cancellation_deadline?: string;
}

/**
 * Request for client to cancel their booking
 */
export interface ClientCancelBookingRequest {
  /** Confirmation code */
  confirmation_code: string;
  /** Client email (for verification) */
  client_email: string;
  /** Cancellation reason */
  reason?: string;
}

/**
 * Response after client cancellation
 */
export interface ClientCancelBookingResponse {
  /** Whether cancellation was successful */
  success: boolean;
  /** Refund amount (if applicable) */
  refund_amount_cents?: number;
  /** Message to display */
  message: string;
}

// ---------------------------------------------------------------------------
// Booking Policies Interfaces
// ---------------------------------------------------------------------------

/**
 * Booking policies configuration for a workspace
 */
export interface BookingPolicies {
  /** Policies ID */
  policies_id: string;
  /** Workspace ID */
  workspace_id: string;
  /** Cancellation policy */
  cancellation_policy: CancellationPolicy;
  /** Whether rescheduling is allowed */
  allow_reschedule: boolean;
  /** Reschedule deadline (hours before appointment) */
  reschedule_deadline_hours: number;
  /** Maximum reschedules per booking */
  max_reschedules: number;
  /** Whether to require deposit */
  require_deposit: boolean;
  /** Whether to collect full payment upfront */
  collect_full_payment: boolean;
  /** Booking confirmation message */
  confirmation_message?: string;
  /** Reminder settings */
  reminder_settings: ReminderSettings;
  /** Creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
}

/**
 * Reminder settings
 */
export interface ReminderSettings {
  /** Send 24-hour reminder */
  send_24h_reminder: boolean;
  /** Send 1-hour reminder */
  send_1h_reminder: boolean;
  /** Send follow-up email after session */
  send_follow_up: boolean;
  /** Follow-up delay (hours after session) */
  follow_up_delay_hours: number;
  /** Custom 24h reminder message */
  reminder_24h_message?: string;
  /** Custom 1h reminder message */
  reminder_1h_message?: string;
  /** Custom follow-up message */
  follow_up_message?: string;
}

/**
 * Request to update booking policies
 */
export interface UpdateBookingPoliciesRequest {
  /** Cancellation policy */
  cancellation_policy?: CancellationPolicy;
  /** Allow reschedule */
  allow_reschedule?: boolean;
  /** Reschedule deadline hours */
  reschedule_deadline_hours?: number;
  /** Max reschedules */
  max_reschedules?: number;
  /** Require deposit */
  require_deposit?: boolean;
  /** Collect full payment */
  collect_full_payment?: boolean;
  /** Confirmation message */
  confirmation_message?: string;
  /** Reminder settings */
  reminder_settings?: ReminderSettings;
}

// ---------------------------------------------------------------------------
// Calendar Event Interfaces (for ICS generation)
// ---------------------------------------------------------------------------

/**
 * Calendar event for ICS file generation
 */
export interface CalendarEvent {
  /** Event title */
  title: string;
  /** Event description */
  description?: string;
  /** Start time (ISO datetime) */
  start: string;
  /** End time (ISO datetime) */
  end: string;
  /** Timezone */
  timezone: string;
  /** Location */
  location?: string;
  /** Organizer name */
  organizer_name: string;
  /** Organizer email */
  organizer_email: string;
  /** Attendee name */
  attendee_name: string;
  /** Attendee email */
  attendee_email: string;
  /** Unique identifier for the event */
  uid: string;
  /** Event status */
  status: 'CONFIRMED' | 'CANCELLED' | 'TENTATIVE';
}

// ---------------------------------------------------------------------------
// Query & List Interfaces
// ---------------------------------------------------------------------------

/**
 * Query parameters for listing bookings
 */
export interface ListBookingsQuery {
  /** Filter by status */
  status?: BookingStatus;
  /** Filter by service type */
  service_type_id?: string;
  /** Filter by client ID */
  client_id?: string;
  /** Filter by date range start */
  start_date?: string;
  /** Filter by date range end */
  end_date?: string;
  /** Filter by source */
  source?: BookingSource;
  /** Search by client name or email */
  search?: string;
  /** Page number (1-based) */
  page?: number;
  /** Items per page */
  limit?: number;
  /** Sort field */
  sort_by?: 'start_time' | 'created_at' | 'client_name' | 'status';
  /** Sort direction */
  sort_order?: 'asc' | 'desc';
}

/**
 * Query parameters for listing service types
 */
export interface ListServiceTypesQuery {
  /** Filter by active status */
  is_active?: boolean;
  /** Page number */
  page?: number;
  /** Items per page */
  limit?: number;
  /** Sort field */
  sort_by?: 'display_order' | 'name' | 'price_cents' | 'created_at';
  /** Sort direction */
  sort_order?: 'asc' | 'desc';
}

/**
 * Query parameters for listing calendar integrations
 */
export interface ListCalendarIntegrationsQuery {
  /** Filter by provider */
  provider?: CalendarProvider;
  /** Filter by status */
  status?: CalendarConnectionStatus;
}

// ---------------------------------------------------------------------------
// Statistics & Analytics Interfaces
// ---------------------------------------------------------------------------

/**
 * Booking statistics for a workspace
 */
export interface BookingStats {
  /** Workspace ID */
  workspace_id: string;
  /** Total bookings (all time) */
  total_bookings: number;
  /** Bookings this month */
  bookings_this_month: number;
  /** Bookings by status */
  bookings_by_status: Record<BookingStatus, number>;
  /** Revenue this month (cents) */
  revenue_this_month_cents: number;
  /** Revenue all time (cents) */
  revenue_total_cents: number;
  /** Average booking value (cents) */
  average_booking_value_cents: number;
  /** Cancellation rate (percentage) */
  cancellation_rate_percent: number;
  /** No-show rate (percentage) */
  no_show_rate_percent: number;
  /** Most popular service type */
  most_popular_service?: {
    service_type_id: string;
    name: string;
    booking_count: number;
  };
  /** Upcoming bookings count */
  upcoming_bookings_count: number;
}

/**
 * Calendar view data for a date range
 */
export interface CalendarViewData {
  /** Start of range */
  range_start: string;
  /** End of range */
  range_end: string;
  /** Bookings in range */
  bookings: Booking[];
  /** Busy times from external calendars */
  busy_times: BusyTimeBlock[];
  /** Availability overrides in range */
  overrides: AvailabilityOverride[];
}

/**
 * Request for calendar view data
 */
export interface GetCalendarViewRequest {
  /** Start of range (ISO datetime) */
  start: string;
  /** End of range (ISO datetime) */
  end: string;
  /** Include external busy times */
  include_busy_times?: boolean;
  /** Include availability overrides */
  include_overrides?: boolean;
}
