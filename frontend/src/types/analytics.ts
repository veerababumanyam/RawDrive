/**
 * Analytics Types
 * TypeScript interfaces for analytics data including views, visitors,
 * device breakdown, and RSVP statistics.
 */

// ---------------------------------------------------------------------------
// Device & Platform Types
// ---------------------------------------------------------------------------

/**
 * Device type classification for analytics
 */
export type DeviceType = 'desktop' | 'tablet' | 'phone' | 'unknown';

/**
 * Operating system types
 */
export type OperatingSystem =
  | 'windows'
  | 'macos'
  | 'linux'
  | 'ios'
  | 'android'
  | 'other'
  | 'unknown';

/**
 * Browser types
 */
export type BrowserType =
  | 'chrome'
  | 'safari'
  | 'firefox'
  | 'edge'
  | 'opera'
  | 'other'
  | 'unknown';

/**
 * Referrer source classification
 */
export type ReferrerType =
  | 'direct'
  | 'social'
  | 'search'
  | 'email'
  | 'referral'
  | 'other'
  | 'unknown';

// ---------------------------------------------------------------------------
// Time Period Types
// ---------------------------------------------------------------------------

/**
 * Predefined time period options for analytics queries
 */
export type AnalyticsTimePeriod =
  | '24h'
  | '7d'
  | '30d'
  | '90d'
  | '12m'
  | 'all'
  | 'custom';

/**
 * Analytics date range specification
 */
export interface AnalyticsDateRange {
  /** Start date (ISO 8601 format) */
  start_date: string;
  /** End date (ISO 8601 format) */
  end_date: string;
  /** Time period preset (if applicable) */
  period?: AnalyticsTimePeriod;
  /** Number of days in the range */
  days?: number;
}

// ---------------------------------------------------------------------------
// View Analytics Types
// ---------------------------------------------------------------------------

/**
 * Single page view event record
 */
export interface ViewEvent {
  /** Unique view event identifier */
  view_id: string;
  /** Resource identifier being viewed */
  resource_id: string;
  /** Resource type (gallery, invitation, profile, etc.) */
  resource_type: string;
  /** Workspace ID */
  workspace_id: string;
  /** Hashed visitor identifier for privacy */
  visitor_hash: string;
  /** Session identifier */
  session_id: string;
  /** Device type used */
  device_type: DeviceType;
  /** Browser name */
  browser: BrowserType;
  /** Operating system */
  os: OperatingSystem;
  /** Country code (ISO 3166-1 alpha-2) */
  country_code?: string;
  /** Region/State */
  region?: string;
  /** City */
  city?: string;
  /** Referrer domain */
  referrer_domain?: string;
  /** Referrer type classification */
  referrer_type: ReferrerType;
  /** View duration in seconds */
  duration_seconds?: number;
  /** Page path or URL */
  page_path?: string;
  /** View timestamp (ISO 8601 format) */
  viewed_at: string;
}

/**
 * Aggregated view statistics
 */
export interface ViewStats {
  /** Total number of page views */
  total_views: number;
  /** Number of unique visitors */
  unique_visitors: number;
  /** Average session duration in seconds */
  avg_duration_seconds: number;
  /** Bounce rate as a percentage (0-100) */
  bounce_rate_percent: number;
  /** Pages per session average */
  pages_per_session: number;
}

/**
 * Time-series view data point
 */
export interface ViewTimeSeriesItem {
  /** Date (ISO 8601 format, date portion only) */
  date: string;
  /** Number of views on this date */
  views: number;
  /** Number of unique visitors on this date */
  unique_visitors: number;
}

// ---------------------------------------------------------------------------
// Visitor Analytics Types
// ---------------------------------------------------------------------------

/**
 * Visitor record with session information
 */
export interface Visitor {
  /** Hashed visitor identifier */
  visitor_hash: string;
  /** First visit timestamp */
  first_visit_at: string;
  /** Last visit timestamp */
  last_visit_at: string;
  /** Total number of visits */
  visit_count: number;
  /** Total pages viewed across all visits */
  total_page_views: number;
  /** Total time spent in seconds */
  total_duration_seconds: number;
  /** Country code */
  country_code?: string;
  /** City */
  city?: string;
  /** Primary device type used */
  primary_device: DeviceType;
  /** Primary browser used */
  primary_browser: BrowserType;
  /** Primary referrer source */
  primary_referrer_type: ReferrerType;
}

/**
 * Visitor statistics summary
 */
export interface VisitorStats {
  /** Total unique visitors */
  total_visitors: number;
  /** New visitors in the period */
  new_visitors: number;
  /** Returning visitors in the period */
  returning_visitors: number;
  /** Percentage of returning visitors (0-100) */
  returning_visitor_percent: number;
  /** Average visits per visitor */
  avg_visits_per_visitor: number;
  /** Average time between visits in days */
  avg_days_between_visits?: number;
}

/**
 * Geographic visitor breakdown
 */
export interface GeoBreakdownItem {
  /** Country code (ISO 3166-1 alpha-2) */
  country_code: string;
  /** Country name */
  country_name: string;
  /** Number of visitors from this location */
  visitor_count: number;
  /** Number of views from this location */
  view_count: number;
  /** Percentage of total visitors (0-100) */
  percentage: number;
}

// ---------------------------------------------------------------------------
// Device Breakdown Types
// ---------------------------------------------------------------------------

/**
 * Device type breakdown item
 */
export interface DeviceBreakdownItem {
  /** Device type */
  device_type: DeviceType;
  /** Display label for the device type */
  label: string;
  /** Number of sessions on this device type */
  session_count: number;
  /** Number of unique visitors using this device type */
  visitor_count: number;
  /** Percentage of total sessions (0-100) */
  percentage: number;
}

/**
 * Browser breakdown item
 */
export interface BrowserBreakdownItem {
  /** Browser type */
  browser: BrowserType;
  /** Browser version (if available) */
  version?: string;
  /** Display label */
  label: string;
  /** Number of sessions */
  session_count: number;
  /** Percentage of total (0-100) */
  percentage: number;
}

/**
 * Operating system breakdown item
 */
export interface OSBreakdownItem {
  /** Operating system */
  os: OperatingSystem;
  /** OS version (if available) */
  version?: string;
  /** Display label */
  label: string;
  /** Number of sessions */
  session_count: number;
  /** Percentage of total (0-100) */
  percentage: number;
}

/**
 * Complete device analytics breakdown
 */
export interface DeviceAnalytics {
  /** Breakdown by device type (desktop, tablet, phone) */
  by_device_type: DeviceBreakdownItem[];
  /** Breakdown by browser */
  by_browser: BrowserBreakdownItem[];
  /** Breakdown by operating system */
  by_os: OSBreakdownItem[];
  /** Total sessions analyzed */
  total_sessions: number;
}

// ---------------------------------------------------------------------------
// RSVP Statistics Types
// ---------------------------------------------------------------------------

/**
 * RSVP response status
 */
export type RSVPResponseStatus =
  | 'attending'
  | 'not_attending'
  | 'maybe'
  | 'pending'
  | 'waitlisted';

/**
 * Individual RSVP record
 */
export interface RSVPRecord {
  /** RSVP record identifier */
  rsvp_id: string;
  /** Associated event/invitation ID */
  event_id: string;
  /** Guest identifier */
  guest_id?: string;
  /** Guest name */
  guest_name: string;
  /** Guest email */
  guest_email?: string;
  /** RSVP response status */
  status: RSVPResponseStatus;
  /** Party size (number of guests in party) */
  party_size: number;
  /** RSVP submission timestamp */
  submitted_at: string;
  /** Last update timestamp */
  updated_at?: string;
  /** Dietary restrictions or notes */
  notes?: string;
  /** Custom question responses */
  custom_responses?: Record<string, string | number | boolean>;
}

/**
 * RSVP statistics summary
 */
export interface RSVPStats {
  /** Total RSVPs received */
  total_responses: number;
  /** Number attending */
  attending: number;
  /** Number not attending */
  not_attending: number;
  /** Number who responded maybe */
  maybe: number;
  /** Number pending response */
  pending: number;
  /** Number on waitlist */
  waitlisted: number;
  /** Total party size of all attending guests */
  total_attending_party_size: number;
  /** Response rate as percentage (0-100) */
  response_rate_percent: number;
  /** Attendance rate as percentage of responders (0-100) */
  attendance_rate_percent: number;
}

/**
 * RSVP trend item for time-series data
 */
export interface RSVPTrendItem {
  /** Date (ISO 8601 format) */
  date: string;
  /** Cumulative attending count */
  attending: number;
  /** Cumulative not attending count */
  not_attending: number;
  /** Cumulative maybe count */
  maybe: number;
  /** New responses on this date */
  new_responses: number;
}

/**
 * RSVP breakdown by response status
 */
export interface RSVPBreakdown {
  /** Status type */
  status: RSVPResponseStatus;
  /** Display label */
  label: string;
  /** Count of responses with this status */
  count: number;
  /** Total party size for this status */
  party_size: number;
  /** Percentage of total responses (0-100) */
  percentage: number;
  /** Color code for UI display */
  color?: string;
}

// ---------------------------------------------------------------------------
// Referrer Analytics Types
// ---------------------------------------------------------------------------

/**
 * Referrer source breakdown item
 */
export interface ReferrerBreakdownItem {
  /** Referrer type classification */
  referrer_type: ReferrerType;
  /** Specific domain (if applicable) */
  domain?: string;
  /** Display label */
  label: string;
  /** Number of visits from this referrer */
  visit_count: number;
  /** Number of unique visitors from this referrer */
  visitor_count: number;
  /** Percentage of total (0-100) */
  percentage: number;
}

/**
 * Top referrer item
 */
export interface TopReferrer {
  /** Referrer domain or source */
  source: string;
  /** Referrer type */
  type: ReferrerType;
  /** Number of visits */
  visits: number;
  /** Percentage of total visits (0-100) */
  percentage: number;
}

// ---------------------------------------------------------------------------
// Comprehensive Analytics Response Types
// ---------------------------------------------------------------------------

/**
 * Complete analytics dashboard data
 */
export interface AnalyticsDashboard {
  /** View statistics */
  views: ViewStats;
  /** Visitor statistics */
  visitors: VisitorStats;
  /** Device breakdown analytics */
  devices: DeviceAnalytics;
  /** Geographic breakdown */
  geography: GeoBreakdownItem[];
  /** Top referrers */
  top_referrers: TopReferrer[];
  /** Time-series view data */
  views_over_time: ViewTimeSeriesItem[];
  /** Date range for this data */
  date_range: AnalyticsDateRange;
  /** Timestamp when data was generated */
  generated_at: string;
}

/**
 * Event-specific analytics with RSVP data
 */
export interface EventAnalytics {
  /** Event/invitation identifier */
  event_id: string;
  /** Event title */
  title: string;
  /** Event date */
  event_date?: string;
  /** View statistics */
  views: ViewStats;
  /** Visitor statistics */
  visitors: VisitorStats;
  /** Device breakdown */
  devices: DeviceAnalytics;
  /** RSVP statistics */
  rsvp: RSVPStats;
  /** RSVP breakdown by status */
  rsvp_breakdown: RSVPBreakdown[];
  /** RSVP trend over time */
  rsvp_trend: RSVPTrendItem[];
  /** Top referrers */
  top_referrers: TopReferrer[];
  /** Views over time */
  views_over_time: ViewTimeSeriesItem[];
  /** Date range */
  date_range: AnalyticsDateRange;
  /** Generated timestamp */
  generated_at: string;
}

/**
 * Analytics API response wrapper
 */
export interface AnalyticsResponse<T> {
  /** Analytics data */
  data: T;
  /** Request metadata */
  meta: {
    /** Date range queried */
    date_range: AnalyticsDateRange;
    /** Total records analyzed */
    total_records?: number;
    /** Cache information */
    cached?: boolean;
    /** Cache timestamp */
    cached_at?: string;
  };
}

// ---------------------------------------------------------------------------
// Analytics Query Parameters
// ---------------------------------------------------------------------------

/**
 * Parameters for analytics queries
 */
export interface AnalyticsQueryParams {
  /** Start date (ISO 8601 format) */
  start_date?: string;
  /** End date (ISO 8601 format) */
  end_date?: string;
  /** Predefined time period */
  period?: AnalyticsTimePeriod;
  /** Resource ID to filter by */
  resource_id?: string;
  /** Resource type to filter by */
  resource_type?: string;
  /** Device type filter */
  device_type?: DeviceType;
  /** Country code filter */
  country_code?: string;
  /** Referrer type filter */
  referrer_type?: ReferrerType;
  /** Granularity for time-series data */
  granularity?: 'hour' | 'day' | 'week' | 'month';
  /** Include geographic breakdown */
  include_geo?: boolean;
  /** Include device breakdown */
  include_devices?: boolean;
  /** Include referrer breakdown */
  include_referrers?: boolean;
}

/**
 * RSVP query parameters
 */
export interface RSVPQueryParams {
  /** Event/invitation ID */
  event_id: string;
  /** Filter by status */
  status?: RSVPResponseStatus;
  /** Search by guest name */
  search?: string;
  /** Page number for pagination */
  page?: number;
  /** Items per page */
  limit?: number;
  /** Sort field */
  sort_by?: 'submitted_at' | 'guest_name' | 'party_size' | 'status';
  /** Sort order */
  sort_order?: 'asc' | 'desc';
}

// ---------------------------------------------------------------------------
// Real-time Analytics Types
// ---------------------------------------------------------------------------

/**
 * Real-time analytics snapshot
 */
export interface RealTimeAnalytics {
  /** Current active visitors */
  active_visitors: number;
  /** Visitors in last 5 minutes */
  visitors_last_5min: number;
  /** Visitors in last 30 minutes */
  visitors_last_30min: number;
  /** Current page views per minute */
  views_per_minute: number;
  /** Top active pages */
  top_pages: Array<{
    path: string;
    active_visitors: number;
  }>;
  /** Geographic distribution of active visitors */
  active_by_country: Array<{
    country_code: string;
    count: number;
  }>;
  /** Last updated timestamp */
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Comparison Analytics Types
// ---------------------------------------------------------------------------

/**
 * Analytics comparison between two periods
 */
export interface AnalyticsComparison {
  /** Current period data */
  current: ViewStats & VisitorStats;
  /** Previous period data */
  previous: ViewStats & VisitorStats;
  /** Percentage changes */
  changes: {
    views_change_percent: number;
    visitors_change_percent: number;
    duration_change_percent: number;
    bounce_rate_change_percent: number;
  };
  /** Current period date range */
  current_period: AnalyticsDateRange;
  /** Previous period date range */
  previous_period: AnalyticsDateRange;
}

// ---------------------------------------------------------------------------
// Export Analytics Types
// ---------------------------------------------------------------------------

/**
 * Analytics export format options
 */
export type AnalyticsExportFormat = 'csv' | 'json' | 'xlsx' | 'pdf';

/**
 * Analytics export request
 */
export interface AnalyticsExportRequest {
  /** Export format */
  format: AnalyticsExportFormat;
  /** Date range */
  date_range: AnalyticsDateRange;
  /** Sections to include */
  include_sections: Array<
    'views' | 'visitors' | 'devices' | 'geography' | 'referrers' | 'rsvp'
  >;
  /** Resource ID (optional) */
  resource_id?: string;
  /** Resource type (optional) */
  resource_type?: string;
}

/**
 * Analytics export response
 */
export interface AnalyticsExportResponse {
  /** Export ID for tracking */
  export_id: string;
  /** Download URL */
  download_url?: string;
  /** Export status */
  status: 'pending' | 'processing' | 'completed' | 'failed';
  /** File size in bytes (when completed) */
  file_size_bytes?: number;
  /** Expiration timestamp for download URL */
  expires_at?: string;
  /** Error message (if failed) */
  error_message?: string;
}
