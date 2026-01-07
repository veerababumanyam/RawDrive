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
export { CalendarProvider, CalendarConnectionStatus, CalendarSyncDirection, BookingStatus, BookingPaymentStatus, DurationUnit, DayOfWeek, CancellationPolicyType, BookingSource, CalendarSyncErrorCode, } from '@rawdrive/shared-types';
/**
 * Timing constants for calendar sync operations (in milliseconds unless noted)
 */
export declare const CALENDAR_SYNC_TIMING: {
    /** Minimum interval between calendar sync polls (5 minutes) */
    readonly MIN_SYNC_INTERVAL_MS: number;
    /** Default sync interval (5 minutes) */
    readonly DEFAULT_SYNC_INTERVAL_MS: number;
    /** Maximum sync interval for low-activity periods (15 minutes) */
    readonly MAX_SYNC_INTERVAL_MS: number;
    /** Time to wait before retrying a failed sync (30 seconds) */
    readonly SYNC_RETRY_DELAY_MS: number;
    /** Timeout for calendar API requests (30 seconds) */
    readonly API_REQUEST_TIMEOUT_MS: number;
    /** How far back to look for events during sync (days) */
    readonly SYNC_LOOKBACK_DAYS: 7;
    /** How far ahead to look for events during sync (days) */
    readonly SYNC_LOOKAHEAD_DAYS: 90;
    /** Cache duration for availability data (5 minutes) */
    readonly AVAILABILITY_CACHE_TTL_MS: number;
    /** Cache duration for busy times (5 minutes) */
    readonly BUSY_TIMES_CACHE_TTL_MS: number;
};
/**
 * Rate limits for calendar sync operations
 */
export declare const CALENDAR_RATE_LIMITS: {
    /** Maximum sync requests per minute per integration */
    readonly SYNC_REQUESTS_PER_MINUTE: 10;
    /** Maximum calendar API calls per minute per workspace */
    readonly API_CALLS_PER_MINUTE: 60;
    /** Maximum concurrent sync operations per workspace */
    readonly MAX_CONCURRENT_SYNCS: 3;
    /** Maximum calendar integrations per workspace */
    readonly MAX_INTEGRATIONS_PER_WORKSPACE: 10;
    /** Rate limit for availability checks (per minute) */
    readonly AVAILABILITY_CHECKS_PER_MINUTE: 100;
};
/**
 * Retry configuration for calendar sync operations
 */
export declare const CALENDAR_SYNC_RETRY: {
    /** Maximum retry attempts for failed sync */
    readonly MAX_SYNC_RETRIES: 3;
    /** Maximum retry attempts for OAuth token refresh */
    readonly MAX_TOKEN_REFRESH_RETRIES: 2;
    /** Base delay for retry backoff (ms) */
    readonly RETRY_BASE_DELAY_MS: 1000;
    /** Maximum delay for retry backoff (ms) */
    readonly RETRY_MAX_DELAY_MS: 60000;
    /** Backoff multiplier for exponential backoff */
    readonly RETRY_BACKOFF_MULTIPLIER: 2;
    /** Days until token expiry to trigger proactive refresh */
    readonly TOKEN_REFRESH_THRESHOLD_DAYS: 7;
};
/**
 * Timing constants for booking operations
 */
export declare const BOOKING_TIMING: {
    /** Duration of temporary slot hold (15 minutes in ms) */
    readonly SLOT_HOLD_DURATION_MS: number;
    /** Duration of temporary slot hold (15 minutes in seconds) */
    readonly SLOT_HOLD_DURATION_SECONDS: number;
    /** Grace period before releasing expired holds (30 seconds) */
    readonly HOLD_EXPIRY_GRACE_PERIOD_MS: number;
    /** Default buffer time before appointments (minutes) */
    readonly DEFAULT_BUFFER_BEFORE_MINUTES: 15;
    /** Default buffer time after appointments (minutes) */
    readonly DEFAULT_BUFFER_AFTER_MINUTES: 15;
    /** Default minimum notice required for bookings (hours) */
    readonly DEFAULT_MIN_NOTICE_HOURS: 24;
    /** Default maximum advance booking window (days) */
    readonly DEFAULT_MAX_ADVANCE_DAYS: 60;
    /** Default slot increment for booking grid (minutes) */
    readonly DEFAULT_SLOT_INCREMENT_MINUTES: 30;
    /** Time before appointment to send 24-hour reminder (ms) */
    readonly REMINDER_24H_BEFORE_MS: number;
    /** Time before appointment to send 1-hour reminder (ms) */
    readonly REMINDER_1H_BEFORE_MS: number;
    /** Default follow-up delay after session (hours) */
    readonly DEFAULT_FOLLOW_UP_DELAY_HOURS: 24;
};
/**
 * Rate limits for booking operations
 */
export declare const BOOKING_RATE_LIMITS: {
    /** Maximum booking requests per minute (per IP for public endpoints) */
    readonly BOOKING_REQUESTS_PER_MINUTE: 20;
    /** Maximum slot hold attempts per minute (per IP) */
    readonly SLOT_HOLD_ATTEMPTS_PER_MINUTE: 10;
    /** Maximum availability check requests per minute (per IP) */
    readonly AVAILABILITY_CHECKS_PER_MINUTE: 60;
    /** Maximum concurrent slot holds per client email */
    readonly MAX_CONCURRENT_HOLDS_PER_EMAIL: 3;
    /** Maximum bookings per day per client email */
    readonly MAX_BOOKINGS_PER_DAY_PER_EMAIL: 5;
    /** Rate limit for public booking pages (requests per minute per IP) */
    readonly PUBLIC_PAGE_REQUESTS_PER_MINUTE: 100;
};
/**
 * Limits for booking operations
 */
export declare const BOOKING_LIMITS: {
    /** Maximum service types per workspace */
    readonly MAX_SERVICE_TYPES_PER_WORKSPACE: 50;
    /** Maximum active bookings per workspace (for free tier) */
    readonly MAX_ACTIVE_BOOKINGS_FREE: 50;
    /** Maximum active bookings per workspace (for pro tier) */
    readonly MAX_ACTIVE_BOOKINGS_PRO: 500;
    /** Maximum active bookings per workspace (for business tier) */
    readonly MAX_ACTIVE_BOOKINGS_BUSINESS: 5000;
    /** Maximum availability overrides per workspace */
    readonly MAX_AVAILABILITY_OVERRIDES: 365;
    /** Maximum reschedules per booking */
    readonly MAX_RESCHEDULES_PER_BOOKING: 3;
    /** Default free cancellation window (hours) */
    readonly DEFAULT_FREE_CANCELLATION_HOURS: 48;
    /** Maximum time windows per day for availability */
    readonly MAX_TIME_WINDOWS_PER_DAY: 5;
    /** Maximum length for booking notes (characters) */
    readonly MAX_BOOKING_NOTES_LENGTH: 2000;
    /** Maximum length for service description (characters) */
    readonly MAX_SERVICE_DESCRIPTION_LENGTH: 1000;
};
/**
 * OAuth configuration for calendar providers
 */
export declare const CALENDAR_OAUTH: {
    readonly GOOGLE: {
        /** Google Calendar OAuth scopes required */
        readonly SCOPES: readonly ["https://www.googleapis.com/auth/calendar.readonly", "https://www.googleapis.com/auth/calendar.events"];
        /** OAuth authorization endpoint */
        readonly AUTH_URL: "https://accounts.google.com/o/oauth2/v2/auth";
        /** OAuth token endpoint */
        readonly TOKEN_URL: "https://oauth2.googleapis.com/token";
        /** Access type for refresh tokens */
        readonly ACCESS_TYPE: "offline";
        /** Prompt type */
        readonly PROMPT: "consent";
    };
    readonly MICROSOFT: {
        /** Microsoft Graph Calendar scopes required */
        readonly SCOPES: readonly ["Calendars.Read", "Calendars.ReadWrite", "offline_access"];
        /** OAuth authorization endpoint */
        readonly AUTH_URL: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
        /** OAuth token endpoint */
        readonly TOKEN_URL: "https://login.microsoftonline.com/common/oauth2/v2.0/token";
    };
};
/**
 * API path constants for calendar endpoints
 */
export declare const CALENDAR_API_PATHS: {
    /** Base path for calendar endpoints */
    readonly BASE: "/api/v1/calendars";
    /** Calendar integrations */
    readonly INTEGRATIONS: "/api/v1/calendars/integrations";
    /** Availability settings */
    readonly AVAILABILITY: "/api/v1/calendars/availability";
    /** Availability overrides */
    readonly OVERRIDES: "/api/v1/calendars/availability/overrides";
    /** Busy times */
    readonly BUSY_TIMES: "/api/v1/calendars/busy-times";
    /** Calendar sync */
    readonly SYNC: "/api/v1/calendars/sync";
    /** Google OAuth callback */
    readonly GOOGLE_CALLBACK: "/api/v1/calendars/oauth/google/callback";
    /** Microsoft OAuth callback */
    readonly MICROSOFT_CALLBACK: "/api/v1/calendars/oauth/microsoft/callback";
};
/**
 * API path constants for booking endpoints
 */
export declare const BOOKING_API_PATHS: {
    /** Base path for booking endpoints */
    readonly BASE: "/api/v1/bookings";
    /** Service types */
    readonly SERVICE_TYPES: "/api/v1/service-types";
    /** Booking policies */
    readonly POLICIES: "/api/v1/bookings/policies";
    /** Available slots */
    readonly AVAILABLE_SLOTS: "/api/v1/bookings/available-slots";
    /** Available dates */
    readonly AVAILABLE_DATES: "/api/v1/bookings/available-dates";
    /** Booking statistics */
    readonly STATS: "/api/v1/bookings/stats";
    /** Calendar view */
    readonly CALENDAR_VIEW: "/api/v1/bookings/calendar-view";
    /** ICS file download */
    readonly ICS_DOWNLOAD: (bookingId: string) => string;
};
/**
 * Public booking API paths (no auth required)
 */
export declare const PUBLIC_BOOKING_PATHS: {
    /** Public booking page config */
    readonly PAGE_CONFIG: (workspaceSlug: string) => string;
    /** Available dates (public) */
    readonly AVAILABLE_DATES: (workspaceSlug: string) => string;
    /** Available slots (public) */
    readonly AVAILABLE_SLOTS: (workspaceSlug: string) => string;
    /** Hold a slot */
    readonly HOLD_SLOT: (workspaceSlug: string) => string;
    /** Complete booking */
    readonly COMPLETE_BOOKING: (workspaceSlug: string) => string;
    /** Check booking status */
    readonly CHECK_STATUS: "/api/v1/public/bookings/status";
    /** Client cancel booking */
    readonly CLIENT_CANCEL: "/api/v1/public/bookings/cancel";
    /** Client reschedule booking */
    readonly CLIENT_RESCHEDULE: "/api/v1/public/bookings/reschedule";
};
/**
 * Default working hours schedule (Monday-Friday, 9 AM - 5 PM)
 */
export declare const DEFAULT_WEEKLY_SCHEDULE: readonly [{
    readonly day: "monday";
    readonly is_available: true;
    readonly time_windows: readonly [{
        readonly start: "09:00";
        readonly end: "17:00";
    }];
}, {
    readonly day: "tuesday";
    readonly is_available: true;
    readonly time_windows: readonly [{
        readonly start: "09:00";
        readonly end: "17:00";
    }];
}, {
    readonly day: "wednesday";
    readonly is_available: true;
    readonly time_windows: readonly [{
        readonly start: "09:00";
        readonly end: "17:00";
    }];
}, {
    readonly day: "thursday";
    readonly is_available: true;
    readonly time_windows: readonly [{
        readonly start: "09:00";
        readonly end: "17:00";
    }];
}, {
    readonly day: "friday";
    readonly is_available: true;
    readonly time_windows: readonly [{
        readonly start: "09:00";
        readonly end: "17:00";
    }];
}, {
    readonly day: "saturday";
    readonly is_available: false;
    readonly time_windows: readonly [];
}, {
    readonly day: "sunday";
    readonly is_available: false;
    readonly time_windows: readonly [];
}];
/**
 * Default availability settings values
 */
export declare const DEFAULT_AVAILABILITY_SETTINGS: {
    /** Default timezone (UTC) */
    readonly TIMEZONE: "UTC";
    /** Default buffer before (minutes) */
    readonly BUFFER_BEFORE_MINUTES: 15;
    /** Default buffer after (minutes) */
    readonly BUFFER_AFTER_MINUTES: 15;
    /** Default minimum notice (hours) */
    readonly MIN_NOTICE_HOURS: 24;
    /** Default max advance booking (days) */
    readonly MAX_ADVANCE_DAYS: 60;
    /** Default slot increment (minutes) */
    readonly SLOT_INCREMENT_MINUTES: 30;
};
/**
 * Default booking policy values
 */
export declare const DEFAULT_BOOKING_POLICIES: {
    /** Default cancellation policy */
    readonly CANCELLATION_POLICY: {
        readonly type: "full_refund";
        readonly free_cancellation_hours: 48;
        readonly partial_refund_percent: 50;
        readonly description: "Free cancellation up to 48 hours before the appointment. 50% refund for later cancellations.";
    };
    /** Allow rescheduling by default */
    readonly ALLOW_RESCHEDULE: true;
    /** Reschedule deadline (hours before appointment) */
    readonly RESCHEDULE_DEADLINE_HOURS: 24;
    /** Maximum reschedules allowed */
    readonly MAX_RESCHEDULES: 3;
    /** Require deposit by default */
    readonly REQUIRE_DEPOSIT: true;
    /** Don't collect full payment upfront by default */
    readonly COLLECT_FULL_PAYMENT: false;
    /** Default reminder settings */
    readonly REMINDER_SETTINGS: {
        readonly send_24h_reminder: true;
        readonly send_1h_reminder: true;
        readonly send_follow_up: true;
        readonly follow_up_delay_hours: 24;
    };
};
/**
 * Human-readable error messages for calendar error codes
 */
export declare const CALENDAR_ERROR_MESSAGES: {
    readonly TOKEN_EXPIRED: "Your calendar connection has expired. Please reconnect your calendar.";
    readonly TOKEN_REVOKED: "Calendar access was revoked. Please reconnect your calendar.";
    readonly RATE_LIMITED: "Too many calendar requests. Please wait a moment and try again.";
    readonly CALENDAR_NOT_FOUND: "The selected calendar could not be found. It may have been deleted.";
    readonly PERMISSION_DENIED: "Permission denied to access the calendar. Please check your calendar sharing settings.";
    readonly NETWORK_ERROR: "Unable to connect to the calendar service. Please check your internet connection.";
    readonly INVALID_EVENT: "The event data is invalid and could not be synced.";
    readonly CONFLICT: "A scheduling conflict was detected.";
    readonly INTERNAL_ERROR: "An unexpected error occurred. Please try again later.";
};
/**
 * Human-readable error messages for booking operations
 */
export declare const BOOKING_ERROR_MESSAGES: {
    readonly SLOT_NOT_AVAILABLE: "This time slot is no longer available. Please select another time.";
    readonly SLOT_HOLD_EXPIRED: "Your hold on this time slot has expired. Please select a new time.";
    readonly BOOKING_NOT_FOUND: "The booking could not be found.";
    readonly ALREADY_CANCELLED: "This booking has already been cancelled.";
    readonly CANCELLATION_DEADLINE_PASSED: "The cancellation deadline has passed for this booking.";
    readonly RESCHEDULE_LIMIT_REACHED: "This booking has reached the maximum number of reschedules.";
    readonly RESCHEDULE_DEADLINE_PASSED: "The reschedule deadline has passed for this booking.";
    readonly PAYMENT_REQUIRED: "Payment is required to complete this booking.";
    readonly PAYMENT_FAILED: "Payment processing failed. Please try again or use a different payment method.";
    readonly INVALID_CONFIRMATION_CODE: "The confirmation code is invalid or does not match the email provided.";
    readonly SERVICE_TYPE_NOT_FOUND: "The selected service is no longer available.";
    readonly SERVICE_TYPE_INACTIVE: "The selected service is currently not available for booking.";
    readonly MAX_BOOKINGS_REACHED: "Maximum booking limit reached. Please contact support.";
    readonly CONCURRENT_BOOKING_ATTEMPT: "Another booking was made for this slot. Please select a different time.";
    readonly INVALID_TIME_SLOT: "The selected time slot is not valid for this service.";
    readonly OUTSIDE_BOOKING_WINDOW: "The selected date is outside the available booking window.";
    readonly INSUFFICIENT_NOTICE: "The selected time does not meet the minimum notice requirement.";
};
/**
 * Default values for service types
 */
export declare const SERVICE_TYPE_DEFAULTS: {
    /** Default currency */
    readonly CURRENCY: "USD";
    /** Default duration unit */
    readonly DURATION_UNIT: "hours";
    /** Default duration (1 hour) */
    readonly DURATION: 1;
    /** Default deposit percentage (25%) */
    readonly DEPOSIT_PERCENTAGE: 25;
    /** Default color for calendar display */
    readonly COLOR: "#3B82F6";
    /** Default active state */
    readonly IS_ACTIVE: true;
    /** Default client location allowed */
    readonly CLIENT_LOCATION_ALLOWED: false;
};
/**
 * Configuration for confirmation code generation
 */
export declare const CONFIRMATION_CODE_CONFIG: {
    /** Length of confirmation code */
    readonly LENGTH: 8;
    /** Characters to use in confirmation code (uppercase alphanumeric, excluding confusing chars) */
    readonly CHARSET: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    /** Prefix for confirmation codes */
    readonly PREFIX: "RD";
};
/**
 * Configuration for ICS calendar file generation
 */
export declare const ICS_CONFIG: {
    /** Product ID for ICS files */
    readonly PRODUCT_ID: "-//RawDrive//Calendar//EN";
    /** Calendar name */
    readonly CALENDAR_NAME: "RawDrive Bookings";
    /** Default alarm (reminder) before event (minutes) */
    readonly DEFAULT_ALARM_MINUTES: 60;
    /** File extension */
    readonly FILE_EXTENSION: ".ics";
    /** MIME type */
    readonly MIME_TYPE: "text/calendar";
};
/**
 * Consolidated calendar constants export for convenience
 */
export declare const CALENDAR: {
    readonly SYNC_TIMING: {
        /** Minimum interval between calendar sync polls (5 minutes) */
        readonly MIN_SYNC_INTERVAL_MS: number;
        /** Default sync interval (5 minutes) */
        readonly DEFAULT_SYNC_INTERVAL_MS: number;
        /** Maximum sync interval for low-activity periods (15 minutes) */
        readonly MAX_SYNC_INTERVAL_MS: number;
        /** Time to wait before retrying a failed sync (30 seconds) */
        readonly SYNC_RETRY_DELAY_MS: number;
        /** Timeout for calendar API requests (30 seconds) */
        readonly API_REQUEST_TIMEOUT_MS: number;
        /** How far back to look for events during sync (days) */
        readonly SYNC_LOOKBACK_DAYS: 7;
        /** How far ahead to look for events during sync (days) */
        readonly SYNC_LOOKAHEAD_DAYS: 90;
        /** Cache duration for availability data (5 minutes) */
        readonly AVAILABILITY_CACHE_TTL_MS: number;
        /** Cache duration for busy times (5 minutes) */
        readonly BUSY_TIMES_CACHE_TTL_MS: number;
    };
    readonly RATE_LIMITS: {
        /** Maximum sync requests per minute per integration */
        readonly SYNC_REQUESTS_PER_MINUTE: 10;
        /** Maximum calendar API calls per minute per workspace */
        readonly API_CALLS_PER_MINUTE: 60;
        /** Maximum concurrent sync operations per workspace */
        readonly MAX_CONCURRENT_SYNCS: 3;
        /** Maximum calendar integrations per workspace */
        readonly MAX_INTEGRATIONS_PER_WORKSPACE: 10;
        /** Rate limit for availability checks (per minute) */
        readonly AVAILABILITY_CHECKS_PER_MINUTE: 100;
    };
    readonly SYNC_RETRY: {
        /** Maximum retry attempts for failed sync */
        readonly MAX_SYNC_RETRIES: 3;
        /** Maximum retry attempts for OAuth token refresh */
        readonly MAX_TOKEN_REFRESH_RETRIES: 2;
        /** Base delay for retry backoff (ms) */
        readonly RETRY_BASE_DELAY_MS: 1000;
        /** Maximum delay for retry backoff (ms) */
        readonly RETRY_MAX_DELAY_MS: 60000;
        /** Backoff multiplier for exponential backoff */
        readonly RETRY_BACKOFF_MULTIPLIER: 2;
        /** Days until token expiry to trigger proactive refresh */
        readonly TOKEN_REFRESH_THRESHOLD_DAYS: 7;
    };
    readonly OAUTH: {
        readonly GOOGLE: {
            /** Google Calendar OAuth scopes required */
            readonly SCOPES: readonly ["https://www.googleapis.com/auth/calendar.readonly", "https://www.googleapis.com/auth/calendar.events"];
            /** OAuth authorization endpoint */
            readonly AUTH_URL: "https://accounts.google.com/o/oauth2/v2/auth";
            /** OAuth token endpoint */
            readonly TOKEN_URL: "https://oauth2.googleapis.com/token";
            /** Access type for refresh tokens */
            readonly ACCESS_TYPE: "offline";
            /** Prompt type */
            readonly PROMPT: "consent";
        };
        readonly MICROSOFT: {
            /** Microsoft Graph Calendar scopes required */
            readonly SCOPES: readonly ["Calendars.Read", "Calendars.ReadWrite", "offline_access"];
            /** OAuth authorization endpoint */
            readonly AUTH_URL: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
            /** OAuth token endpoint */
            readonly TOKEN_URL: "https://login.microsoftonline.com/common/oauth2/v2.0/token";
        };
    };
    readonly API_PATHS: {
        /** Base path for calendar endpoints */
        readonly BASE: "/api/v1/calendars";
        /** Calendar integrations */
        readonly INTEGRATIONS: "/api/v1/calendars/integrations";
        /** Availability settings */
        readonly AVAILABILITY: "/api/v1/calendars/availability";
        /** Availability overrides */
        readonly OVERRIDES: "/api/v1/calendars/availability/overrides";
        /** Busy times */
        readonly BUSY_TIMES: "/api/v1/calendars/busy-times";
        /** Calendar sync */
        readonly SYNC: "/api/v1/calendars/sync";
        /** Google OAuth callback */
        readonly GOOGLE_CALLBACK: "/api/v1/calendars/oauth/google/callback";
        /** Microsoft OAuth callback */
        readonly MICROSOFT_CALLBACK: "/api/v1/calendars/oauth/microsoft/callback";
    };
    readonly ERROR_MESSAGES: {
        readonly TOKEN_EXPIRED: "Your calendar connection has expired. Please reconnect your calendar.";
        readonly TOKEN_REVOKED: "Calendar access was revoked. Please reconnect your calendar.";
        readonly RATE_LIMITED: "Too many calendar requests. Please wait a moment and try again.";
        readonly CALENDAR_NOT_FOUND: "The selected calendar could not be found. It may have been deleted.";
        readonly PERMISSION_DENIED: "Permission denied to access the calendar. Please check your calendar sharing settings.";
        readonly NETWORK_ERROR: "Unable to connect to the calendar service. Please check your internet connection.";
        readonly INVALID_EVENT: "The event data is invalid and could not be synced.";
        readonly CONFLICT: "A scheduling conflict was detected.";
        readonly INTERNAL_ERROR: "An unexpected error occurred. Please try again later.";
    };
};
/**
 * Consolidated booking constants export for convenience
 */
export declare const BOOKING: {
    readonly TIMING: {
        /** Duration of temporary slot hold (15 minutes in ms) */
        readonly SLOT_HOLD_DURATION_MS: number;
        /** Duration of temporary slot hold (15 minutes in seconds) */
        readonly SLOT_HOLD_DURATION_SECONDS: number;
        /** Grace period before releasing expired holds (30 seconds) */
        readonly HOLD_EXPIRY_GRACE_PERIOD_MS: number;
        /** Default buffer time before appointments (minutes) */
        readonly DEFAULT_BUFFER_BEFORE_MINUTES: 15;
        /** Default buffer time after appointments (minutes) */
        readonly DEFAULT_BUFFER_AFTER_MINUTES: 15;
        /** Default minimum notice required for bookings (hours) */
        readonly DEFAULT_MIN_NOTICE_HOURS: 24;
        /** Default maximum advance booking window (days) */
        readonly DEFAULT_MAX_ADVANCE_DAYS: 60;
        /** Default slot increment for booking grid (minutes) */
        readonly DEFAULT_SLOT_INCREMENT_MINUTES: 30;
        /** Time before appointment to send 24-hour reminder (ms) */
        readonly REMINDER_24H_BEFORE_MS: number;
        /** Time before appointment to send 1-hour reminder (ms) */
        readonly REMINDER_1H_BEFORE_MS: number;
        /** Default follow-up delay after session (hours) */
        readonly DEFAULT_FOLLOW_UP_DELAY_HOURS: 24;
    };
    readonly RATE_LIMITS: {
        /** Maximum booking requests per minute (per IP for public endpoints) */
        readonly BOOKING_REQUESTS_PER_MINUTE: 20;
        /** Maximum slot hold attempts per minute (per IP) */
        readonly SLOT_HOLD_ATTEMPTS_PER_MINUTE: 10;
        /** Maximum availability check requests per minute (per IP) */
        readonly AVAILABILITY_CHECKS_PER_MINUTE: 60;
        /** Maximum concurrent slot holds per client email */
        readonly MAX_CONCURRENT_HOLDS_PER_EMAIL: 3;
        /** Maximum bookings per day per client email */
        readonly MAX_BOOKINGS_PER_DAY_PER_EMAIL: 5;
        /** Rate limit for public booking pages (requests per minute per IP) */
        readonly PUBLIC_PAGE_REQUESTS_PER_MINUTE: 100;
    };
    readonly LIMITS: {
        /** Maximum service types per workspace */
        readonly MAX_SERVICE_TYPES_PER_WORKSPACE: 50;
        /** Maximum active bookings per workspace (for free tier) */
        readonly MAX_ACTIVE_BOOKINGS_FREE: 50;
        /** Maximum active bookings per workspace (for pro tier) */
        readonly MAX_ACTIVE_BOOKINGS_PRO: 500;
        /** Maximum active bookings per workspace (for business tier) */
        readonly MAX_ACTIVE_BOOKINGS_BUSINESS: 5000;
        /** Maximum availability overrides per workspace */
        readonly MAX_AVAILABILITY_OVERRIDES: 365;
        /** Maximum reschedules per booking */
        readonly MAX_RESCHEDULES_PER_BOOKING: 3;
        /** Default free cancellation window (hours) */
        readonly DEFAULT_FREE_CANCELLATION_HOURS: 48;
        /** Maximum time windows per day for availability */
        readonly MAX_TIME_WINDOWS_PER_DAY: 5;
        /** Maximum length for booking notes (characters) */
        readonly MAX_BOOKING_NOTES_LENGTH: 2000;
        /** Maximum length for service description (characters) */
        readonly MAX_SERVICE_DESCRIPTION_LENGTH: 1000;
    };
    readonly API_PATHS: {
        /** Base path for booking endpoints */
        readonly BASE: "/api/v1/bookings";
        /** Service types */
        readonly SERVICE_TYPES: "/api/v1/service-types";
        /** Booking policies */
        readonly POLICIES: "/api/v1/bookings/policies";
        /** Available slots */
        readonly AVAILABLE_SLOTS: "/api/v1/bookings/available-slots";
        /** Available dates */
        readonly AVAILABLE_DATES: "/api/v1/bookings/available-dates";
        /** Booking statistics */
        readonly STATS: "/api/v1/bookings/stats";
        /** Calendar view */
        readonly CALENDAR_VIEW: "/api/v1/bookings/calendar-view";
        /** ICS file download */
        readonly ICS_DOWNLOAD: (bookingId: string) => string;
    };
    readonly PUBLIC_PATHS: {
        /** Public booking page config */
        readonly PAGE_CONFIG: (workspaceSlug: string) => string;
        /** Available dates (public) */
        readonly AVAILABLE_DATES: (workspaceSlug: string) => string;
        /** Available slots (public) */
        readonly AVAILABLE_SLOTS: (workspaceSlug: string) => string;
        /** Hold a slot */
        readonly HOLD_SLOT: (workspaceSlug: string) => string;
        /** Complete booking */
        readonly COMPLETE_BOOKING: (workspaceSlug: string) => string;
        /** Check booking status */
        readonly CHECK_STATUS: "/api/v1/public/bookings/status";
        /** Client cancel booking */
        readonly CLIENT_CANCEL: "/api/v1/public/bookings/cancel";
        /** Client reschedule booking */
        readonly CLIENT_RESCHEDULE: "/api/v1/public/bookings/reschedule";
    };
    readonly ERROR_MESSAGES: {
        readonly SLOT_NOT_AVAILABLE: "This time slot is no longer available. Please select another time.";
        readonly SLOT_HOLD_EXPIRED: "Your hold on this time slot has expired. Please select a new time.";
        readonly BOOKING_NOT_FOUND: "The booking could not be found.";
        readonly ALREADY_CANCELLED: "This booking has already been cancelled.";
        readonly CANCELLATION_DEADLINE_PASSED: "The cancellation deadline has passed for this booking.";
        readonly RESCHEDULE_LIMIT_REACHED: "This booking has reached the maximum number of reschedules.";
        readonly RESCHEDULE_DEADLINE_PASSED: "The reschedule deadline has passed for this booking.";
        readonly PAYMENT_REQUIRED: "Payment is required to complete this booking.";
        readonly PAYMENT_FAILED: "Payment processing failed. Please try again or use a different payment method.";
        readonly INVALID_CONFIRMATION_CODE: "The confirmation code is invalid or does not match the email provided.";
        readonly SERVICE_TYPE_NOT_FOUND: "The selected service is no longer available.";
        readonly SERVICE_TYPE_INACTIVE: "The selected service is currently not available for booking.";
        readonly MAX_BOOKINGS_REACHED: "Maximum booking limit reached. Please contact support.";
        readonly CONCURRENT_BOOKING_ATTEMPT: "Another booking was made for this slot. Please select a different time.";
        readonly INVALID_TIME_SLOT: "The selected time slot is not valid for this service.";
        readonly OUTSIDE_BOOKING_WINDOW: "The selected date is outside the available booking window.";
        readonly INSUFFICIENT_NOTICE: "The selected time does not meet the minimum notice requirement.";
    };
    readonly DEFAULTS: {
        readonly AVAILABILITY: {
            /** Default timezone (UTC) */
            readonly TIMEZONE: "UTC";
            /** Default buffer before (minutes) */
            readonly BUFFER_BEFORE_MINUTES: 15;
            /** Default buffer after (minutes) */
            readonly BUFFER_AFTER_MINUTES: 15;
            /** Default minimum notice (hours) */
            readonly MIN_NOTICE_HOURS: 24;
            /** Default max advance booking (days) */
            readonly MAX_ADVANCE_DAYS: 60;
            /** Default slot increment (minutes) */
            readonly SLOT_INCREMENT_MINUTES: 30;
        };
        readonly WEEKLY_SCHEDULE: readonly [{
            readonly day: "monday";
            readonly is_available: true;
            readonly time_windows: readonly [{
                readonly start: "09:00";
                readonly end: "17:00";
            }];
        }, {
            readonly day: "tuesday";
            readonly is_available: true;
            readonly time_windows: readonly [{
                readonly start: "09:00";
                readonly end: "17:00";
            }];
        }, {
            readonly day: "wednesday";
            readonly is_available: true;
            readonly time_windows: readonly [{
                readonly start: "09:00";
                readonly end: "17:00";
            }];
        }, {
            readonly day: "thursday";
            readonly is_available: true;
            readonly time_windows: readonly [{
                readonly start: "09:00";
                readonly end: "17:00";
            }];
        }, {
            readonly day: "friday";
            readonly is_available: true;
            readonly time_windows: readonly [{
                readonly start: "09:00";
                readonly end: "17:00";
            }];
        }, {
            readonly day: "saturday";
            readonly is_available: false;
            readonly time_windows: readonly [];
        }, {
            readonly day: "sunday";
            readonly is_available: false;
            readonly time_windows: readonly [];
        }];
        readonly POLICIES: {
            /** Default cancellation policy */
            readonly CANCELLATION_POLICY: {
                readonly type: "full_refund";
                readonly free_cancellation_hours: 48;
                readonly partial_refund_percent: 50;
                readonly description: "Free cancellation up to 48 hours before the appointment. 50% refund for later cancellations.";
            };
            /** Allow rescheduling by default */
            readonly ALLOW_RESCHEDULE: true;
            /** Reschedule deadline (hours before appointment) */
            readonly RESCHEDULE_DEADLINE_HOURS: 24;
            /** Maximum reschedules allowed */
            readonly MAX_RESCHEDULES: 3;
            /** Require deposit by default */
            readonly REQUIRE_DEPOSIT: true;
            /** Don't collect full payment upfront by default */
            readonly COLLECT_FULL_PAYMENT: false;
            /** Default reminder settings */
            readonly REMINDER_SETTINGS: {
                readonly send_24h_reminder: true;
                readonly send_1h_reminder: true;
                readonly send_follow_up: true;
                readonly follow_up_delay_hours: 24;
            };
        };
        readonly SERVICE_TYPE: {
            /** Default currency */
            readonly CURRENCY: "USD";
            /** Default duration unit */
            readonly DURATION_UNIT: "hours";
            /** Default duration (1 hour) */
            readonly DURATION: 1;
            /** Default deposit percentage (25%) */
            readonly DEPOSIT_PERCENTAGE: 25;
            /** Default color for calendar display */
            readonly COLOR: "#3B82F6";
            /** Default active state */
            readonly IS_ACTIVE: true;
            /** Default client location allowed */
            readonly CLIENT_LOCATION_ALLOWED: false;
        };
    };
    readonly CONFIRMATION_CODE: {
        /** Length of confirmation code */
        readonly LENGTH: 8;
        /** Characters to use in confirmation code (uppercase alphanumeric, excluding confusing chars) */
        readonly CHARSET: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        /** Prefix for confirmation codes */
        readonly PREFIX: "RD";
    };
    readonly ICS: {
        /** Product ID for ICS files */
        readonly PRODUCT_ID: "-//RawDrive//Calendar//EN";
        /** Calendar name */
        readonly CALENDAR_NAME: "RawDrive Bookings";
        /** Default alarm (reminder) before event (minutes) */
        readonly DEFAULT_ALARM_MINUTES: 60;
        /** File extension */
        readonly FILE_EXTENSION: ".ics";
        /** MIME type */
        readonly MIME_TYPE: "text/calendar";
    };
};
//# sourceMappingURL=calendar.d.ts.map