/**
 * Calendar & Booking Constants for RawDrive
 *
 * This module provides shared constants for:
 * - Calendar sync timing and rate limits
 * - Booking configuration (slot holds, buffers, etc.)
 * - OAuth configuration for calendar providers
 * - API paths for calendar and booking endpoints
 * - Error messages for calendar/booking operations
 * - Default values for availability settings
 *
 * @module calendar
 */

import { API_BASE } from './api';

// ---------------------------------------------------------------------------
// Re-export enums from shared-types for convenience
// (These are defined in shared-types to colocate with their TypeScript interfaces)
// ---------------------------------------------------------------------------

export {
  CalendarProvider,
  CalendarConnectionStatus,
  CalendarSyncDirection,
  BookingStatus,
  BookingPaymentStatus,
  DurationUnit,
  DayOfWeek,
  CancellationPolicyType,
  BookingSource,
  CalendarSyncErrorCode,
} from '@rawdrive/shared-types';

// ---------------------------------------------------------------------------
// Calendar Sync Timing Configuration
// ---------------------------------------------------------------------------

/**
 * Timing constants for calendar sync operations (in milliseconds unless noted)
 */
export const CALENDAR_SYNC_TIMING = {
  /** Minimum interval between calendar sync polls (5 minutes) */
  MIN_SYNC_INTERVAL_MS: 5 * 60 * 1000,

  /** Default sync interval (5 minutes) */
  DEFAULT_SYNC_INTERVAL_MS: 5 * 60 * 1000,

  /** Maximum sync interval for low-activity periods (15 minutes) */
  MAX_SYNC_INTERVAL_MS: 15 * 60 * 1000,

  /** Time to wait before retrying a failed sync (30 seconds) */
  SYNC_RETRY_DELAY_MS: 30 * 1000,

  /** Timeout for calendar API requests (30 seconds) */
  API_REQUEST_TIMEOUT_MS: 30 * 1000,

  /** How far back to look for events during sync (days) */
  SYNC_LOOKBACK_DAYS: 7,

  /** How far ahead to look for events during sync (days) */
  SYNC_LOOKAHEAD_DAYS: 90,

  /** Cache duration for availability data (5 minutes) */
  AVAILABILITY_CACHE_TTL_MS: 5 * 60 * 1000,

  /** Cache duration for busy times (5 minutes) */
  BUSY_TIMES_CACHE_TTL_MS: 5 * 60 * 1000,
} as const;

// ---------------------------------------------------------------------------
// Calendar Sync Rate Limits
// ---------------------------------------------------------------------------

/**
 * Rate limits for calendar sync operations
 */
export const CALENDAR_RATE_LIMITS = {
  /** Maximum sync requests per minute per integration */
  SYNC_REQUESTS_PER_MINUTE: 10,

  /** Maximum calendar API calls per minute per workspace */
  API_CALLS_PER_MINUTE: 60,

  /** Maximum concurrent sync operations per workspace */
  MAX_CONCURRENT_SYNCS: 3,

  /** Maximum calendar integrations per workspace */
  MAX_INTEGRATIONS_PER_WORKSPACE: 10,

  /** Rate limit for availability checks (per minute) */
  AVAILABILITY_CHECKS_PER_MINUTE: 100,
} as const;

// ---------------------------------------------------------------------------
// Calendar Sync Retry Configuration
// ---------------------------------------------------------------------------

/**
 * Retry configuration for calendar sync operations
 */
export const CALENDAR_SYNC_RETRY = {
  /** Maximum retry attempts for failed sync */
  MAX_SYNC_RETRIES: 3,

  /** Maximum retry attempts for OAuth token refresh */
  MAX_TOKEN_REFRESH_RETRIES: 2,

  /** Base delay for retry backoff (ms) */
  RETRY_BASE_DELAY_MS: 1000,

  /** Maximum delay for retry backoff (ms) */
  RETRY_MAX_DELAY_MS: 60000,

  /** Backoff multiplier for exponential backoff */
  RETRY_BACKOFF_MULTIPLIER: 2,

  /** Days until token expiry to trigger proactive refresh */
  TOKEN_REFRESH_THRESHOLD_DAYS: 7,
} as const;

// ---------------------------------------------------------------------------
// Booking Timing Configuration
// ---------------------------------------------------------------------------

/**
 * Timing constants for booking operations
 */
export const BOOKING_TIMING = {
  /** Duration of temporary slot hold (15 minutes in ms) */
  SLOT_HOLD_DURATION_MS: 15 * 60 * 1000,

  /** Duration of temporary slot hold (15 minutes in seconds) */
  SLOT_HOLD_DURATION_SECONDS: 15 * 60,

  /** Grace period before releasing expired holds (30 seconds) */
  HOLD_EXPIRY_GRACE_PERIOD_MS: 30 * 1000,

  /** Default buffer time before appointments (minutes) */
  DEFAULT_BUFFER_BEFORE_MINUTES: 15,

  /** Default buffer time after appointments (minutes) */
  DEFAULT_BUFFER_AFTER_MINUTES: 15,

  /** Default minimum notice required for bookings (hours) */
  DEFAULT_MIN_NOTICE_HOURS: 24,

  /** Default maximum advance booking window (days) */
  DEFAULT_MAX_ADVANCE_DAYS: 60,

  /** Default slot increment for booking grid (minutes) */
  DEFAULT_SLOT_INCREMENT_MINUTES: 30,

  /** Time before appointment to send 24-hour reminder (ms) */
  REMINDER_24H_BEFORE_MS: 24 * 60 * 60 * 1000,

  /** Time before appointment to send 1-hour reminder (ms) */
  REMINDER_1H_BEFORE_MS: 60 * 60 * 1000,

  /** Default follow-up delay after session (hours) */
  DEFAULT_FOLLOW_UP_DELAY_HOURS: 24,
} as const;

// ---------------------------------------------------------------------------
// Booking Rate Limits
// ---------------------------------------------------------------------------

/**
 * Rate limits for booking operations
 */
export const BOOKING_RATE_LIMITS = {
  /** Maximum booking requests per minute (per IP for public endpoints) */
  BOOKING_REQUESTS_PER_MINUTE: 20,

  /** Maximum slot hold attempts per minute (per IP) */
  SLOT_HOLD_ATTEMPTS_PER_MINUTE: 10,

  /** Maximum availability check requests per minute (per IP) */
  AVAILABILITY_CHECKS_PER_MINUTE: 60,

  /** Maximum concurrent slot holds per client email */
  MAX_CONCURRENT_HOLDS_PER_EMAIL: 3,

  /** Maximum bookings per day per client email */
  MAX_BOOKINGS_PER_DAY_PER_EMAIL: 5,

  /** Rate limit for public booking pages (requests per minute per IP) */
  PUBLIC_PAGE_REQUESTS_PER_MINUTE: 100,
} as const;

// ---------------------------------------------------------------------------
// Booking Limits
// ---------------------------------------------------------------------------

/**
 * Limits for booking operations
 */
export const BOOKING_LIMITS = {
  /** Maximum service types per workspace */
  MAX_SERVICE_TYPES_PER_WORKSPACE: 50,

  /** Maximum active bookings per workspace (for free tier) */
  MAX_ACTIVE_BOOKINGS_FREE: 50,

  /** Maximum active bookings per workspace (for pro tier) */
  MAX_ACTIVE_BOOKINGS_PRO: 500,

  /** Maximum active bookings per workspace (for business tier) */
  MAX_ACTIVE_BOOKINGS_BUSINESS: 5000,

  /** Maximum availability overrides per workspace */
  MAX_AVAILABILITY_OVERRIDES: 365,

  /** Maximum reschedules per booking */
  MAX_RESCHEDULES_PER_BOOKING: 3,

  /** Default free cancellation window (hours) */
  DEFAULT_FREE_CANCELLATION_HOURS: 48,

  /** Maximum time windows per day for availability */
  MAX_TIME_WINDOWS_PER_DAY: 5,

  /** Maximum length for booking notes (characters) */
  MAX_BOOKING_NOTES_LENGTH: 2000,

  /** Maximum length for service description (characters) */
  MAX_SERVICE_DESCRIPTION_LENGTH: 1000,
} as const;

// ---------------------------------------------------------------------------
// OAuth Configuration
// ---------------------------------------------------------------------------

/**
 * OAuth configuration for calendar providers
 */
export const CALENDAR_OAUTH = {
  GOOGLE: {
    /** Google Calendar OAuth scopes required */
    SCOPES: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events',
    ],
    /** OAuth authorization endpoint */
    AUTH_URL: 'https://accounts.google.com/o/oauth2/v2/auth',
    /** OAuth token endpoint */
    TOKEN_URL: 'https://oauth2.googleapis.com/token',
    /** Access type for refresh tokens */
    ACCESS_TYPE: 'offline',
    /** Prompt type */
    PROMPT: 'consent',
  },
  MICROSOFT: {
    /** Microsoft Graph Calendar scopes required */
    SCOPES: [
      'Calendars.Read',
      'Calendars.ReadWrite',
      'offline_access',
    ],
    /** OAuth authorization endpoint */
    AUTH_URL: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    /** OAuth token endpoint */
    TOKEN_URL: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  },
} as const;

// ---------------------------------------------------------------------------
// Calendar API Paths
// ---------------------------------------------------------------------------

/**
 * API path constants for calendar endpoints
 */
export const CALENDAR_API_PATHS = {
  /** Base path for calendar endpoints */
  BASE: `${API_BASE}/calendars`,

  /** Calendar integrations */
  INTEGRATIONS: `${API_BASE}/calendars/integrations`,

  /** Availability settings */
  AVAILABILITY: `${API_BASE}/calendars/availability`,

  /** Availability overrides */
  OVERRIDES: `${API_BASE}/calendars/availability/overrides`,

  /** Busy times */
  BUSY_TIMES: `${API_BASE}/calendars/busy-times`,

  /** Calendar sync */
  SYNC: `${API_BASE}/calendars/sync`,

  /** Google OAuth callback */
  GOOGLE_CALLBACK: `${API_BASE}/calendars/oauth/google/callback`,

  /** Microsoft OAuth callback */
  MICROSOFT_CALLBACK: `${API_BASE}/calendars/oauth/microsoft/callback`,
} as const;

/**
 * API path constants for booking endpoints
 */
export const BOOKING_API_PATHS = {
  /** Base path for booking endpoints */
  BASE: `${API_BASE}/bookings`,

  /** Service types */
  SERVICE_TYPES: `${API_BASE}/service-types`,

  /** Booking policies */
  POLICIES: `${API_BASE}/bookings/policies`,

  /** Available slots */
  AVAILABLE_SLOTS: `${API_BASE}/bookings/available-slots`,

  /** Available dates */
  AVAILABLE_DATES: `${API_BASE}/bookings/available-dates`,

  /** Booking statistics */
  STATS: `${API_BASE}/bookings/stats`,

  /** Calendar view */
  CALENDAR_VIEW: `${API_BASE}/bookings/calendar-view`,

  /** ICS file download */
  ICS_DOWNLOAD: (bookingId: string) => `${API_BASE}/bookings/${bookingId}/ics`,
} as const;

/**
 * Public booking API paths (no auth required)
 */
export const PUBLIC_BOOKING_PATHS = {
  /** Public booking page config */
  PAGE_CONFIG: (workspaceSlug: string) => `${API_BASE}/public/book/${workspaceSlug}`,

  /** Available dates (public) */
  AVAILABLE_DATES: (workspaceSlug: string) => `${API_BASE}/public/book/${workspaceSlug}/dates`,

  /** Available slots (public) */
  AVAILABLE_SLOTS: (workspaceSlug: string) => `${API_BASE}/public/book/${workspaceSlug}/slots`,

  /** Hold a slot */
  HOLD_SLOT: (workspaceSlug: string) => `${API_BASE}/public/book/${workspaceSlug}/hold`,

  /** Complete booking */
  COMPLETE_BOOKING: (workspaceSlug: string) => `${API_BASE}/public/book/${workspaceSlug}/complete`,

  /** Check booking status */
  CHECK_STATUS: `${API_BASE}/public/bookings/status`,

  /** Client cancel booking */
  CLIENT_CANCEL: `${API_BASE}/public/bookings/cancel`,

  /** Client reschedule booking */
  CLIENT_RESCHEDULE: `${API_BASE}/public/bookings/reschedule`,
} as const;

// ---------------------------------------------------------------------------
// Default Availability Schedule
// ---------------------------------------------------------------------------

/**
 * Default working hours schedule (Monday-Friday, 9 AM - 5 PM)
 */
export const DEFAULT_WEEKLY_SCHEDULE = [
  { day: 'monday', is_available: true, time_windows: [{ start: '09:00', end: '17:00' }] },
  { day: 'tuesday', is_available: true, time_windows: [{ start: '09:00', end: '17:00' }] },
  { day: 'wednesday', is_available: true, time_windows: [{ start: '09:00', end: '17:00' }] },
  { day: 'thursday', is_available: true, time_windows: [{ start: '09:00', end: '17:00' }] },
  { day: 'friday', is_available: true, time_windows: [{ start: '09:00', end: '17:00' }] },
  { day: 'saturday', is_available: false, time_windows: [] },
  { day: 'sunday', is_available: false, time_windows: [] },
] as const;

/**
 * Default availability settings values
 */
export const DEFAULT_AVAILABILITY_SETTINGS = {
  /** Default timezone (UTC) */
  TIMEZONE: 'UTC',

  /** Default buffer before (minutes) */
  BUFFER_BEFORE_MINUTES: BOOKING_TIMING.DEFAULT_BUFFER_BEFORE_MINUTES,

  /** Default buffer after (minutes) */
  BUFFER_AFTER_MINUTES: BOOKING_TIMING.DEFAULT_BUFFER_AFTER_MINUTES,

  /** Default minimum notice (hours) */
  MIN_NOTICE_HOURS: BOOKING_TIMING.DEFAULT_MIN_NOTICE_HOURS,

  /** Default max advance booking (days) */
  MAX_ADVANCE_DAYS: BOOKING_TIMING.DEFAULT_MAX_ADVANCE_DAYS,

  /** Default slot increment (minutes) */
  SLOT_INCREMENT_MINUTES: BOOKING_TIMING.DEFAULT_SLOT_INCREMENT_MINUTES,
} as const;

// ---------------------------------------------------------------------------
// Default Booking Policies
// ---------------------------------------------------------------------------

/**
 * Default booking policy values
 */
export const DEFAULT_BOOKING_POLICIES = {
  /** Default cancellation policy */
  CANCELLATION_POLICY: {
    type: 'full_refund',
    free_cancellation_hours: BOOKING_LIMITS.DEFAULT_FREE_CANCELLATION_HOURS,
    partial_refund_percent: 50,
    description: 'Free cancellation up to 48 hours before the appointment. 50% refund for later cancellations.',
  },

  /** Allow rescheduling by default */
  ALLOW_RESCHEDULE: true,

  /** Reschedule deadline (hours before appointment) */
  RESCHEDULE_DEADLINE_HOURS: 24,

  /** Maximum reschedules allowed */
  MAX_RESCHEDULES: BOOKING_LIMITS.MAX_RESCHEDULES_PER_BOOKING,

  /** Require deposit by default */
  REQUIRE_DEPOSIT: true,

  /** Don't collect full payment upfront by default */
  COLLECT_FULL_PAYMENT: false,

  /** Default reminder settings */
  REMINDER_SETTINGS: {
    send_24h_reminder: true,
    send_1h_reminder: true,
    send_follow_up: true,
    follow_up_delay_hours: BOOKING_TIMING.DEFAULT_FOLLOW_UP_DELAY_HOURS,
  },
} as const;

// ---------------------------------------------------------------------------
// Calendar Error Messages
// ---------------------------------------------------------------------------

/**
 * Human-readable error messages for calendar error codes
 */
export const CALENDAR_ERROR_MESSAGES = {
  TOKEN_EXPIRED: 'Your calendar connection has expired. Please reconnect your calendar.',
  TOKEN_REVOKED: 'Calendar access was revoked. Please reconnect your calendar.',
  RATE_LIMITED: 'Too many calendar requests. Please wait a moment and try again.',
  CALENDAR_NOT_FOUND: 'The selected calendar could not be found. It may have been deleted.',
  PERMISSION_DENIED: 'Permission denied to access the calendar. Please check your calendar sharing settings.',
  NETWORK_ERROR: 'Unable to connect to the calendar service. Please check your internet connection.',
  INVALID_EVENT: 'The event data is invalid and could not be synced.',
  CONFLICT: 'A scheduling conflict was detected.',
  INTERNAL_ERROR: 'An unexpected error occurred. Please try again later.',
} as const;

/**
 * Human-readable error messages for booking operations
 */
export const BOOKING_ERROR_MESSAGES = {
  SLOT_NOT_AVAILABLE: 'This time slot is no longer available. Please select another time.',
  SLOT_HOLD_EXPIRED: 'Your hold on this time slot has expired. Please select a new time.',
  BOOKING_NOT_FOUND: 'The booking could not be found.',
  ALREADY_CANCELLED: 'This booking has already been cancelled.',
  CANCELLATION_DEADLINE_PASSED: 'The cancellation deadline has passed for this booking.',
  RESCHEDULE_LIMIT_REACHED: 'This booking has reached the maximum number of reschedules.',
  RESCHEDULE_DEADLINE_PASSED: 'The reschedule deadline has passed for this booking.',
  PAYMENT_REQUIRED: 'Payment is required to complete this booking.',
  PAYMENT_FAILED: 'Payment processing failed. Please try again or use a different payment method.',
  INVALID_CONFIRMATION_CODE: 'The confirmation code is invalid or does not match the email provided.',
  SERVICE_TYPE_NOT_FOUND: 'The selected service is no longer available.',
  SERVICE_TYPE_INACTIVE: 'The selected service is currently not available for booking.',
  MAX_BOOKINGS_REACHED: 'Maximum booking limit reached. Please contact support.',
  CONCURRENT_BOOKING_ATTEMPT: 'Another booking was made for this slot. Please select a different time.',
  INVALID_TIME_SLOT: 'The selected time slot is not valid for this service.',
  OUTSIDE_BOOKING_WINDOW: 'The selected date is outside the available booking window.',
  INSUFFICIENT_NOTICE: 'The selected time does not meet the minimum notice requirement.',
} as const;

// ---------------------------------------------------------------------------
// Service Type Defaults
// ---------------------------------------------------------------------------

/**
 * Default values for service types
 */
export const SERVICE_TYPE_DEFAULTS = {
  /** Default currency */
  CURRENCY: 'USD',

  /** Default duration unit */
  DURATION_UNIT: 'hours',

  /** Default duration (1 hour) */
  DURATION: 1,

  /** Default deposit percentage (25%) */
  DEPOSIT_PERCENTAGE: 25,

  /** Default color for calendar display */
  COLOR: '#3B82F6',

  /** Default active state */
  IS_ACTIVE: true,

  /** Default client location allowed */
  CLIENT_LOCATION_ALLOWED: false,
} as const;

// ---------------------------------------------------------------------------
// Confirmation Code Generation
// ---------------------------------------------------------------------------

/**
 * Configuration for confirmation code generation
 */
export const CONFIRMATION_CODE_CONFIG = {
  /** Length of confirmation code */
  LENGTH: 8,

  /** Characters to use in confirmation code (uppercase alphanumeric, excluding confusing chars) */
  CHARSET: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',

  /** Prefix for confirmation codes */
  PREFIX: 'RD',
} as const;

// ---------------------------------------------------------------------------
// ICS Calendar Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for ICS calendar file generation
 */
export const ICS_CONFIG = {
  /** Product ID for ICS files */
  PRODUCT_ID: '-//RawDrive//Calendar//EN',

  /** Calendar name */
  CALENDAR_NAME: 'RawDrive Bookings',

  /** Default alarm (reminder) before event (minutes) */
  DEFAULT_ALARM_MINUTES: 60,

  /** File extension */
  FILE_EXTENSION: '.ics',

  /** MIME type */
  MIME_TYPE: 'text/calendar',
} as const;

// ---------------------------------------------------------------------------
// Consolidated Calendar Constants Export
// ---------------------------------------------------------------------------

/**
 * Consolidated calendar constants export for convenience
 */
export const CALENDAR = {
  SYNC_TIMING: CALENDAR_SYNC_TIMING,
  RATE_LIMITS: CALENDAR_RATE_LIMITS,
  SYNC_RETRY: CALENDAR_SYNC_RETRY,
  OAUTH: CALENDAR_OAUTH,
  API_PATHS: CALENDAR_API_PATHS,
  ERROR_MESSAGES: CALENDAR_ERROR_MESSAGES,
} as const;

/**
 * Consolidated booking constants export for convenience
 */
export const BOOKING = {
  TIMING: BOOKING_TIMING,
  RATE_LIMITS: BOOKING_RATE_LIMITS,
  LIMITS: BOOKING_LIMITS,
  API_PATHS: BOOKING_API_PATHS,
  PUBLIC_PATHS: PUBLIC_BOOKING_PATHS,
  ERROR_MESSAGES: BOOKING_ERROR_MESSAGES,
  DEFAULTS: {
    AVAILABILITY: DEFAULT_AVAILABILITY_SETTINGS,
    WEEKLY_SCHEDULE: DEFAULT_WEEKLY_SCHEDULE,
    POLICIES: DEFAULT_BOOKING_POLICIES,
    SERVICE_TYPE: SERVICE_TYPE_DEFAULTS,
  },
  CONFIRMATION_CODE: CONFIRMATION_CODE_CONFIG,
  ICS: ICS_CONFIG,
} as const;
