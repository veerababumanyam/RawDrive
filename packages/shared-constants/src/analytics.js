/**
 * Analytics & Reporting Constants
 *
 * Constants for the analytics and reporting system:
 * - Rate limiting and thresholds
 * - Caching configuration
 * - API paths
 * - Default configuration values
 * - Error messages
 * - Engagement scoring weights
 */
// Re-export enums from shared-types for convenience
export { AnalyticsEventType, AnalyticsEventCategory, AnalyticsActorType, AnalyticsDeviceType, AnalyticsPeriodType, ReportType, DateRangeType, ReportExportFormat, ReportRunStatus, ReportExportStatus, } from '@rawdrive/shared-types';
// ---------------------------------------------------------------------------
// Rate Limiting
// ---------------------------------------------------------------------------
/**
 * Analytics event tracking rate limits
 */
export const ANALYTICS_RATE_LIMITS = {
    /** Maximum events per minute per workspace */
    EVENTS_PER_MINUTE: 1000,
    /** Maximum events per session for a single visitor */
    EVENTS_PER_SESSION: 500,
    /** Maximum bulk event inserts per request */
    BULK_INSERT_LIMIT: 100,
    /** Minimum interval between identical events in milliseconds */
    DUPLICATE_EVENT_INTERVAL_MS: 1000,
};
/**
 * Report generation rate limits
 */
export const REPORT_RATE_LIMITS = {
    /** Maximum concurrent report generations per workspace */
    MAX_CONCURRENT_REPORTS: 3,
    /** Minimum seconds between report requests for same report */
    PER_REPORT_COOLDOWN_SECONDS: 60,
    /** Maximum exports per day per workspace */
    MAX_EXPORTS_PER_DAY: 50,
    /** Maximum scheduled reports per workspace */
    MAX_SCHEDULED_REPORTS: 20,
};
// ---------------------------------------------------------------------------
// Caching Configuration
// ---------------------------------------------------------------------------
/**
 * Analytics caching configuration
 */
export const ANALYTICS_CACHE = {
    /** Dashboard overview cache TTL in seconds */
    DASHBOARD_TTL_SECONDS: 300, // 5 minutes
    /** Gallery analytics cache TTL in seconds */
    GALLERY_ANALYTICS_TTL_SECONDS: 600, // 10 minutes
    /** Client analytics cache TTL in seconds */
    CLIENT_ANALYTICS_TTL_SECONDS: 600, // 10 minutes
    /** Event aggregation cache TTL in seconds */
    AGGREGATION_TTL_SECONDS: 900, // 15 minutes
    /** Report data cache TTL in seconds */
    REPORT_TTL_SECONDS: 1800, // 30 minutes
    /** Time series data cache TTL in seconds */
    TIMESERIES_TTL_SECONDS: 300, // 5 minutes
    /** Cache key prefix for analytics */
    KEY_PREFIX: 'analytics:',
};
// ---------------------------------------------------------------------------
// Data Retention
// ---------------------------------------------------------------------------
/**
 * Analytics data retention policies
 */
export const ANALYTICS_RETENTION = {
    /** Raw event retention in days */
    RAW_EVENTS_DAYS: 90,
    /** Daily aggregates retention in days */
    DAILY_AGGREGATES_DAYS: 365,
    /** Weekly aggregates retention in days */
    WEEKLY_AGGREGATES_DAYS: 730, // 2 years
    /** Monthly aggregates retention in days */
    MONTHLY_AGGREGATES_DAYS: 1825, // 5 years
    /** Report export retention in days */
    EXPORT_RETENTION_DAYS: 30,
    /** Report run history retention in days */
    RUN_HISTORY_DAYS: 90,
};
// ---------------------------------------------------------------------------
// Timing Configuration
// ---------------------------------------------------------------------------
/**
 * Analytics timing configuration
 */
export const ANALYTICS_TIMING = {
    /** Event recording timeout in milliseconds */
    EVENT_TIMEOUT_MS: 5000,
    /** Aggregation job timeout in minutes */
    AGGREGATION_TIMEOUT_MINUTES: 30,
    /** Report generation timeout in minutes */
    REPORT_TIMEOUT_MINUTES: 10,
    /** Export generation timeout in minutes */
    EXPORT_TIMEOUT_MINUTES: 30,
    /** Dashboard refresh interval in milliseconds (frontend) */
    DASHBOARD_REFRESH_MS: 60000, // 1 minute
    /** Real-time update debounce in milliseconds */
    REALTIME_DEBOUNCE_MS: 5000,
    /** Session timeout in minutes (for session tracking) */
    SESSION_TIMEOUT_MINUTES: 30,
    /** Frontend progress poll interval in milliseconds */
    PROGRESS_POLL_INTERVAL_MS: 2000,
};
// ---------------------------------------------------------------------------
// Aggregation Settings
// ---------------------------------------------------------------------------
/**
 * Analytics aggregation configuration
 */
export const ANALYTICS_AGGREGATION = {
    /** Batch size for event aggregation */
    BATCH_SIZE: 1000,
    /** Maximum records per aggregation query */
    MAX_QUERY_RECORDS: 100000,
    /** Time series data points limit */
    MAX_TIMESERIES_POINTS: 365,
    /** Top N galleries to return */
    TOP_GALLERIES_LIMIT: 10,
    /** Top N clients to return */
    TOP_CLIENTS_LIMIT: 10,
    /** Top N countries for geographic breakdown */
    TOP_COUNTRIES_LIMIT: 10,
    /** Recent activity items limit */
    RECENT_ACTIVITY_LIMIT: 20,
};
// ---------------------------------------------------------------------------
// Engagement Scoring
// ---------------------------------------------------------------------------
/**
 * Weights for calculating gallery engagement score (0-100)
 */
export const GALLERY_ENGAGEMENT_WEIGHTS = {
    /** Weight for unique visitors */
    UNIQUE_VISITORS: 0.15,
    /** Weight for total views */
    TOTAL_VIEWS: 0.10,
    /** Weight for favorites */
    FAVORITES: 0.20,
    /** Weight for comments */
    COMMENTS: 0.20,
    /** Weight for selections */
    SELECTIONS: 0.15,
    /** Weight for downloads */
    DOWNLOADS: 0.10,
    /** Weight for session duration */
    SESSION_DURATION: 0.10,
};
/**
 * Weights for calculating client engagement score (0-100)
 */
export const CLIENT_ENGAGEMENT_WEIGHTS = {
    /** Weight for gallery views */
    GALLERY_VIEWS: 0.10,
    /** Weight for asset views */
    ASSET_VIEWS: 0.10,
    /** Weight for favorites */
    FAVORITES: 0.20,
    /** Weight for comments */
    COMMENTS: 0.20,
    /** Weight for selections */
    SELECTIONS: 0.15,
    /** Weight for downloads */
    DOWNLOADS: 0.15,
    /** Weight for session frequency */
    SESSION_FREQUENCY: 0.10,
};
/**
 * Thresholds for engagement score classification
 */
export const ENGAGEMENT_THRESHOLDS = {
    /** Minimum score for "high" engagement */
    HIGH: 70,
    /** Minimum score for "medium" engagement */
    MEDIUM: 40,
    /** Below this is "low" engagement */
    LOW: 40,
};
// ---------------------------------------------------------------------------
// Churn Risk Scoring
// ---------------------------------------------------------------------------
/**
 * Weights for calculating client churn risk score (0-100)
 */
export const CHURN_RISK_WEIGHTS = {
    /** Weight for days since last activity (higher = more churn risk) */
    DAYS_INACTIVE: 0.35,
    /** Weight for declining engagement trend */
    ENGAGEMENT_DECLINE: 0.25,
    /** Weight for low session frequency */
    LOW_FREQUENCY: 0.20,
    /** Weight for low lifetime value */
    LOW_LTV: 0.10,
    /** Weight for no recent downloads */
    NO_DOWNLOADS: 0.10,
};
/**
 * Thresholds for churn risk classification
 */
export const CHURN_RISK_THRESHOLDS = {
    /** Minimum score for "high" churn risk */
    HIGH: 70,
    /** Minimum score for "medium" churn risk */
    MEDIUM: 40,
    /** Days of inactivity before flagging */
    INACTIVE_DAYS_WARNING: 30,
    /** Days of inactivity for high churn risk */
    INACTIVE_DAYS_CRITICAL: 60,
};
// ---------------------------------------------------------------------------
// Report Configuration
// ---------------------------------------------------------------------------
/**
 * Default report configuration
 */
export const DEFAULT_REPORT_CONFIG = {
    /** Default date range */
    dateRangeType: 'last_30_days',
    /** Default export format */
    exportFormat: 'csv',
    /** Default timezone */
    timezone: 'UTC',
    /** Default page limit for paginated data */
    pageLimit: 100,
};
/**
 * Report export size limits
 */
export const REPORT_SIZE_LIMITS = {
    /** Maximum rows per CSV export */
    MAX_CSV_ROWS: 100000,
    /** Maximum file size in bytes (100MB) */
    MAX_FILE_SIZE_BYTES: 100 * 1024 * 1024,
    /** Maximum pages for PDF export */
    MAX_PDF_PAGES: 500,
};
/**
 * Predefined metrics available for reports
 */
export const REPORT_METRICS = {
    // Gallery metrics
    GALLERY_VIEWS: 'gallery_views',
    GALLERY_UNIQUE_VISITORS: 'gallery_unique_visitors',
    GALLERY_DOWNLOADS: 'gallery_downloads',
    GALLERY_FAVORITES: 'gallery_favorites',
    GALLERY_COMMENTS: 'gallery_comments',
    GALLERY_ENGAGEMENT_SCORE: 'gallery_engagement_score',
    // Client metrics
    CLIENT_TOTAL_VIEWS: 'client_total_views',
    CLIENT_TOTAL_DOWNLOADS: 'client_total_downloads',
    CLIENT_ENGAGEMENT_SCORE: 'client_engagement_score',
    CLIENT_LIFETIME_VALUE: 'client_lifetime_value',
    CLIENT_CHURN_RISK: 'client_churn_risk',
    // Revenue metrics
    REVENUE_TOTAL: 'revenue_total',
    REVENUE_AVERAGE: 'revenue_average',
    // Session metrics
    SESSION_COUNT: 'session_count',
    SESSION_DURATION_AVG: 'session_duration_avg',
    BOUNCE_RATE: 'bounce_rate',
};
// ---------------------------------------------------------------------------
// API Paths
// ---------------------------------------------------------------------------
/**
 * Analytics API paths
 */
export const ANALYTICS_API_PATHS = {
    /** Base path for analytics endpoints */
    BASE: '/api/v1/workspaces/{workspaceId}/analytics',
    /** Dashboard endpoint */
    DASHBOARD: '/api/v1/workspaces/{workspaceId}/analytics/dashboard',
    /** Record event endpoint */
    EVENTS: '/api/v1/workspaces/{workspaceId}/analytics/events',
    /** Gallery analytics endpoint */
    GALLERY: '/api/v1/workspaces/{workspaceId}/analytics/galleries/{galleryId}',
    /** Gallery time series endpoint */
    GALLERY_TIMESERIES: '/api/v1/workspaces/{workspaceId}/analytics/galleries/{galleryId}/timeseries',
    /** Client analytics endpoint */
    CLIENT: '/api/v1/workspaces/{workspaceId}/analytics/clients/{clientId}',
    /** Client time series endpoint */
    CLIENT_TIMESERIES: '/api/v1/workspaces/{workspaceId}/analytics/clients/{clientId}/timeseries',
    /** Top galleries endpoint */
    TOP_GALLERIES: '/api/v1/workspaces/{workspaceId}/analytics/top-galleries',
    /** Top clients endpoint */
    TOP_CLIENTS: '/api/v1/workspaces/{workspaceId}/analytics/top-clients',
    /** Churn risk endpoint */
    CHURN_RISK: '/api/v1/workspaces/{workspaceId}/analytics/churn-risk',
    /** Reports CRUD endpoint */
    REPORTS: '/api/v1/workspaces/{workspaceId}/analytics/reports',
    /** Single report endpoint */
    REPORT: '/api/v1/workspaces/{workspaceId}/analytics/reports/{reportId}',
    /** Run report endpoint */
    REPORT_RUN: '/api/v1/workspaces/{workspaceId}/analytics/reports/{reportId}/run',
    /** Report schedule endpoint */
    REPORT_SCHEDULE: '/api/v1/workspaces/{workspaceId}/analytics/reports/{reportId}/schedule',
    /** Report exports endpoint */
    EXPORTS: '/api/v1/workspaces/{workspaceId}/analytics/exports',
    /** Single export endpoint */
    EXPORT: '/api/v1/workspaces/{workspaceId}/analytics/exports/{exportId}',
    /** Export download endpoint */
    EXPORT_DOWNLOAD: '/api/v1/workspaces/{workspaceId}/analytics/exports/{exportId}/download',
    /** Stats endpoint */
    STATS: '/api/v1/workspaces/{workspaceId}/analytics/stats',
};
// ---------------------------------------------------------------------------
// Error Messages
// ---------------------------------------------------------------------------
/**
 * Analytics error messages
 */
export const ANALYTICS_ERROR_MESSAGES = {
    // Rate limiting
    RATE_LIMITED: 'Analytics rate limit exceeded. Please wait before sending more events.',
    EXPORT_RATE_LIMITED: 'Export rate limit exceeded. Please wait before requesting another export.',
    TOO_MANY_SCHEDULED_REPORTS: 'Maximum number of scheduled reports reached.',
    // Validation
    INVALID_DATE_RANGE: 'Invalid date range. Start date must be before end date.',
    DATE_RANGE_TOO_LARGE: 'Date range exceeds maximum allowed span.',
    INVALID_EVENT_TYPE: 'Invalid analytics event type.',
    INVALID_PERIOD_TYPE: 'Invalid analytics period type.',
    INVALID_REPORT_TYPE: 'Invalid report type.',
    INVALID_EXPORT_FORMAT: 'Invalid export format.',
    INVALID_CRON_EXPRESSION: 'Invalid cron expression for report schedule.',
    // Not found
    GALLERY_NOT_FOUND: 'Gallery not found.',
    CLIENT_NOT_FOUND: 'Client not found.',
    REPORT_NOT_FOUND: 'Report not found.',
    EXPORT_NOT_FOUND: 'Export not found.',
    // Processing
    AGGREGATION_FAILED: 'Analytics aggregation failed. Please try again later.',
    REPORT_GENERATION_FAILED: 'Report generation failed. Please try again.',
    EXPORT_GENERATION_FAILED: 'Export generation failed. Please try again.',
    EXPORT_EXPIRED: 'Export has expired. Please generate a new export.',
    REPORT_IN_PROGRESS: 'Report generation already in progress.',
    // Data
    NO_DATA_AVAILABLE: 'No analytics data available for the selected period.',
    INSUFFICIENT_DATA: 'Insufficient data to calculate metrics.',
    DATA_STALE: 'Analytics data may be stale. Last updated: {timestamp}.',
    // Permissions
    UNAUTHORIZED: 'Not authorized to access analytics for this workspace.',
};
// ---------------------------------------------------------------------------
// Date Range Configuration
// ---------------------------------------------------------------------------
/**
 * Date range configuration for predefined periods
 */
export const DATE_RANGE_CONFIG = {
    today: { days: 0, label: 'Today' },
    yesterday: { days: 1, label: 'Yesterday' },
    last_7_days: { days: 7, label: 'Last 7 Days' },
    last_30_days: { days: 30, label: 'Last 30 Days' },
    last_90_days: { days: 90, label: 'Last 90 Days' },
    this_month: { days: 0, label: 'This Month', isCalendarBased: true },
    last_month: { days: 0, label: 'Last Month', isCalendarBased: true },
    this_year: { days: 0, label: 'This Year', isCalendarBased: true },
    last_year: { days: 0, label: 'Last Year', isCalendarBased: true },
    custom: { days: 0, label: 'Custom Range' },
};
/**
 * Maximum date range spans in days
 */
export const MAX_DATE_RANGE_DAYS = {
    /** Maximum for raw event queries */
    RAW_EVENTS: 90,
    /** Maximum for aggregated queries */
    AGGREGATED: 365,
    /** Maximum for time series queries */
    TIMESERIES: 365,
    /** Maximum for report exports */
    EXPORTS: 365,
};
// ---------------------------------------------------------------------------
// Device and Geographic Constants
// ---------------------------------------------------------------------------
/**
 * Browser name mappings for analytics
 */
export const BROWSER_NAMES = {
    chrome: 'Google Chrome',
    firefox: 'Mozilla Firefox',
    safari: 'Safari',
    edge: 'Microsoft Edge',
    opera: 'Opera',
    ie: 'Internet Explorer',
    other: 'Other',
};
/**
 * Operating system name mappings for analytics
 */
export const OS_NAMES = {
    windows: 'Windows',
    macos: 'macOS',
    linux: 'Linux',
    ios: 'iOS',
    android: 'Android',
    other: 'Other',
};
// ---------------------------------------------------------------------------
// Pagination Defaults
// ---------------------------------------------------------------------------
/**
 * Analytics pagination defaults
 */
export const ANALYTICS_PAGINATION = {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100,
    EVENTS_MAX_LIMIT: 500,
};
// ---------------------------------------------------------------------------
// Consolidated Export
// ---------------------------------------------------------------------------
/**
 * All analytics constants consolidated
 */
export const ANALYTICS = {
    RATE_LIMITS: ANALYTICS_RATE_LIMITS,
    REPORT_RATE_LIMITS,
    CACHE: ANALYTICS_CACHE,
    RETENTION: ANALYTICS_RETENTION,
    TIMING: ANALYTICS_TIMING,
    AGGREGATION: ANALYTICS_AGGREGATION,
    GALLERY_ENGAGEMENT_WEIGHTS,
    CLIENT_ENGAGEMENT_WEIGHTS,
    ENGAGEMENT_THRESHOLDS,
    CHURN_RISK_WEIGHTS,
    CHURN_RISK_THRESHOLDS,
    DEFAULT_REPORT_CONFIG,
    REPORT_SIZE_LIMITS,
    REPORT_METRICS,
    API_PATHS: ANALYTICS_API_PATHS,
    ERROR_MESSAGES: ANALYTICS_ERROR_MESSAGES,
    DATE_RANGE_CONFIG,
    MAX_DATE_RANGE_DAYS,
    BROWSER_NAMES,
    OS_NAMES,
    PAGINATION: ANALYTICS_PAGINATION,
};
