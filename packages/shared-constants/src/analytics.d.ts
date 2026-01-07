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
export { AnalyticsEventType, AnalyticsEventCategory, AnalyticsActorType, AnalyticsDeviceType, AnalyticsPeriodType, ReportType, DateRangeType, ReportExportFormat, ReportRunStatus, ReportExportStatus, } from '@rawdrive/shared-types';
/**
 * Analytics event tracking rate limits
 */
export declare const ANALYTICS_RATE_LIMITS: {
    /** Maximum events per minute per workspace */
    readonly EVENTS_PER_MINUTE: 1000;
    /** Maximum events per session for a single visitor */
    readonly EVENTS_PER_SESSION: 500;
    /** Maximum bulk event inserts per request */
    readonly BULK_INSERT_LIMIT: 100;
    /** Minimum interval between identical events in milliseconds */
    readonly DUPLICATE_EVENT_INTERVAL_MS: 1000;
};
/**
 * Report generation rate limits
 */
export declare const REPORT_RATE_LIMITS: {
    /** Maximum concurrent report generations per workspace */
    readonly MAX_CONCURRENT_REPORTS: 3;
    /** Minimum seconds between report requests for same report */
    readonly PER_REPORT_COOLDOWN_SECONDS: 60;
    /** Maximum exports per day per workspace */
    readonly MAX_EXPORTS_PER_DAY: 50;
    /** Maximum scheduled reports per workspace */
    readonly MAX_SCHEDULED_REPORTS: 20;
};
/**
 * Analytics caching configuration
 */
export declare const ANALYTICS_CACHE: {
    /** Dashboard overview cache TTL in seconds */
    readonly DASHBOARD_TTL_SECONDS: 300;
    /** Gallery analytics cache TTL in seconds */
    readonly GALLERY_ANALYTICS_TTL_SECONDS: 600;
    /** Client analytics cache TTL in seconds */
    readonly CLIENT_ANALYTICS_TTL_SECONDS: 600;
    /** Event aggregation cache TTL in seconds */
    readonly AGGREGATION_TTL_SECONDS: 900;
    /** Report data cache TTL in seconds */
    readonly REPORT_TTL_SECONDS: 1800;
    /** Time series data cache TTL in seconds */
    readonly TIMESERIES_TTL_SECONDS: 300;
    /** Cache key prefix for analytics */
    readonly KEY_PREFIX: "analytics:";
};
/**
 * Analytics data retention policies
 */
export declare const ANALYTICS_RETENTION: {
    /** Raw event retention in days */
    readonly RAW_EVENTS_DAYS: 90;
    /** Daily aggregates retention in days */
    readonly DAILY_AGGREGATES_DAYS: 365;
    /** Weekly aggregates retention in days */
    readonly WEEKLY_AGGREGATES_DAYS: 730;
    /** Monthly aggregates retention in days */
    readonly MONTHLY_AGGREGATES_DAYS: 1825;
    /** Report export retention in days */
    readonly EXPORT_RETENTION_DAYS: 30;
    /** Report run history retention in days */
    readonly RUN_HISTORY_DAYS: 90;
};
/**
 * Analytics timing configuration
 */
export declare const ANALYTICS_TIMING: {
    /** Event recording timeout in milliseconds */
    readonly EVENT_TIMEOUT_MS: 5000;
    /** Aggregation job timeout in minutes */
    readonly AGGREGATION_TIMEOUT_MINUTES: 30;
    /** Report generation timeout in minutes */
    readonly REPORT_TIMEOUT_MINUTES: 10;
    /** Export generation timeout in minutes */
    readonly EXPORT_TIMEOUT_MINUTES: 30;
    /** Dashboard refresh interval in milliseconds (frontend) */
    readonly DASHBOARD_REFRESH_MS: 60000;
    /** Real-time update debounce in milliseconds */
    readonly REALTIME_DEBOUNCE_MS: 5000;
    /** Session timeout in minutes (for session tracking) */
    readonly SESSION_TIMEOUT_MINUTES: 30;
    /** Frontend progress poll interval in milliseconds */
    readonly PROGRESS_POLL_INTERVAL_MS: 2000;
};
/**
 * Analytics aggregation configuration
 */
export declare const ANALYTICS_AGGREGATION: {
    /** Batch size for event aggregation */
    readonly BATCH_SIZE: 1000;
    /** Maximum records per aggregation query */
    readonly MAX_QUERY_RECORDS: 100000;
    /** Time series data points limit */
    readonly MAX_TIMESERIES_POINTS: 365;
    /** Top N galleries to return */
    readonly TOP_GALLERIES_LIMIT: 10;
    /** Top N clients to return */
    readonly TOP_CLIENTS_LIMIT: 10;
    /** Top N countries for geographic breakdown */
    readonly TOP_COUNTRIES_LIMIT: 10;
    /** Recent activity items limit */
    readonly RECENT_ACTIVITY_LIMIT: 20;
};
/**
 * Weights for calculating gallery engagement score (0-100)
 */
export declare const GALLERY_ENGAGEMENT_WEIGHTS: {
    /** Weight for unique visitors */
    readonly UNIQUE_VISITORS: 0.15;
    /** Weight for total views */
    readonly TOTAL_VIEWS: 0.1;
    /** Weight for favorites */
    readonly FAVORITES: 0.2;
    /** Weight for comments */
    readonly COMMENTS: 0.2;
    /** Weight for selections */
    readonly SELECTIONS: 0.15;
    /** Weight for downloads */
    readonly DOWNLOADS: 0.1;
    /** Weight for session duration */
    readonly SESSION_DURATION: 0.1;
};
/**
 * Weights for calculating client engagement score (0-100)
 */
export declare const CLIENT_ENGAGEMENT_WEIGHTS: {
    /** Weight for gallery views */
    readonly GALLERY_VIEWS: 0.1;
    /** Weight for asset views */
    readonly ASSET_VIEWS: 0.1;
    /** Weight for favorites */
    readonly FAVORITES: 0.2;
    /** Weight for comments */
    readonly COMMENTS: 0.2;
    /** Weight for selections */
    readonly SELECTIONS: 0.15;
    /** Weight for downloads */
    readonly DOWNLOADS: 0.15;
    /** Weight for session frequency */
    readonly SESSION_FREQUENCY: 0.1;
};
/**
 * Thresholds for engagement score classification
 */
export declare const ENGAGEMENT_THRESHOLDS: {
    /** Minimum score for "high" engagement */
    readonly HIGH: 70;
    /** Minimum score for "medium" engagement */
    readonly MEDIUM: 40;
    /** Below this is "low" engagement */
    readonly LOW: 40;
};
/**
 * Weights for calculating client churn risk score (0-100)
 */
export declare const CHURN_RISK_WEIGHTS: {
    /** Weight for days since last activity (higher = more churn risk) */
    readonly DAYS_INACTIVE: 0.35;
    /** Weight for declining engagement trend */
    readonly ENGAGEMENT_DECLINE: 0.25;
    /** Weight for low session frequency */
    readonly LOW_FREQUENCY: 0.2;
    /** Weight for low lifetime value */
    readonly LOW_LTV: 0.1;
    /** Weight for no recent downloads */
    readonly NO_DOWNLOADS: 0.1;
};
/**
 * Thresholds for churn risk classification
 */
export declare const CHURN_RISK_THRESHOLDS: {
    /** Minimum score for "high" churn risk */
    readonly HIGH: 70;
    /** Minimum score for "medium" churn risk */
    readonly MEDIUM: 40;
    /** Days of inactivity before flagging */
    readonly INACTIVE_DAYS_WARNING: 30;
    /** Days of inactivity for high churn risk */
    readonly INACTIVE_DAYS_CRITICAL: 60;
};
/**
 * Default report configuration
 */
export declare const DEFAULT_REPORT_CONFIG: {
    /** Default date range */
    readonly dateRangeType: "last_30_days";
    /** Default export format */
    readonly exportFormat: "csv";
    /** Default timezone */
    readonly timezone: "UTC";
    /** Default page limit for paginated data */
    readonly pageLimit: 100;
};
/**
 * Report export size limits
 */
export declare const REPORT_SIZE_LIMITS: {
    /** Maximum rows per CSV export */
    readonly MAX_CSV_ROWS: 100000;
    /** Maximum file size in bytes (100MB) */
    readonly MAX_FILE_SIZE_BYTES: number;
    /** Maximum pages for PDF export */
    readonly MAX_PDF_PAGES: 500;
};
/**
 * Predefined metrics available for reports
 */
export declare const REPORT_METRICS: {
    readonly GALLERY_VIEWS: "gallery_views";
    readonly GALLERY_UNIQUE_VISITORS: "gallery_unique_visitors";
    readonly GALLERY_DOWNLOADS: "gallery_downloads";
    readonly GALLERY_FAVORITES: "gallery_favorites";
    readonly GALLERY_COMMENTS: "gallery_comments";
    readonly GALLERY_ENGAGEMENT_SCORE: "gallery_engagement_score";
    readonly CLIENT_TOTAL_VIEWS: "client_total_views";
    readonly CLIENT_TOTAL_DOWNLOADS: "client_total_downloads";
    readonly CLIENT_ENGAGEMENT_SCORE: "client_engagement_score";
    readonly CLIENT_LIFETIME_VALUE: "client_lifetime_value";
    readonly CLIENT_CHURN_RISK: "client_churn_risk";
    readonly REVENUE_TOTAL: "revenue_total";
    readonly REVENUE_AVERAGE: "revenue_average";
    readonly SESSION_COUNT: "session_count";
    readonly SESSION_DURATION_AVG: "session_duration_avg";
    readonly BOUNCE_RATE: "bounce_rate";
};
/**
 * Analytics API paths
 */
export declare const ANALYTICS_API_PATHS: {
    /** Base path for analytics endpoints */
    readonly BASE: "/api/v1/workspaces/{workspaceId}/analytics";
    /** Dashboard endpoint */
    readonly DASHBOARD: "/api/v1/workspaces/{workspaceId}/analytics/dashboard";
    /** Record event endpoint */
    readonly EVENTS: "/api/v1/workspaces/{workspaceId}/analytics/events";
    /** Gallery analytics endpoint */
    readonly GALLERY: "/api/v1/workspaces/{workspaceId}/analytics/galleries/{galleryId}";
    /** Gallery time series endpoint */
    readonly GALLERY_TIMESERIES: "/api/v1/workspaces/{workspaceId}/analytics/galleries/{galleryId}/timeseries";
    /** Client analytics endpoint */
    readonly CLIENT: "/api/v1/workspaces/{workspaceId}/analytics/clients/{clientId}";
    /** Client time series endpoint */
    readonly CLIENT_TIMESERIES: "/api/v1/workspaces/{workspaceId}/analytics/clients/{clientId}/timeseries";
    /** Top galleries endpoint */
    readonly TOP_GALLERIES: "/api/v1/workspaces/{workspaceId}/analytics/top-galleries";
    /** Top clients endpoint */
    readonly TOP_CLIENTS: "/api/v1/workspaces/{workspaceId}/analytics/top-clients";
    /** Churn risk endpoint */
    readonly CHURN_RISK: "/api/v1/workspaces/{workspaceId}/analytics/churn-risk";
    /** Reports CRUD endpoint */
    readonly REPORTS: "/api/v1/workspaces/{workspaceId}/analytics/reports";
    /** Single report endpoint */
    readonly REPORT: "/api/v1/workspaces/{workspaceId}/analytics/reports/{reportId}";
    /** Run report endpoint */
    readonly REPORT_RUN: "/api/v1/workspaces/{workspaceId}/analytics/reports/{reportId}/run";
    /** Report schedule endpoint */
    readonly REPORT_SCHEDULE: "/api/v1/workspaces/{workspaceId}/analytics/reports/{reportId}/schedule";
    /** Report exports endpoint */
    readonly EXPORTS: "/api/v1/workspaces/{workspaceId}/analytics/exports";
    /** Single export endpoint */
    readonly EXPORT: "/api/v1/workspaces/{workspaceId}/analytics/exports/{exportId}";
    /** Export download endpoint */
    readonly EXPORT_DOWNLOAD: "/api/v1/workspaces/{workspaceId}/analytics/exports/{exportId}/download";
    /** Stats endpoint */
    readonly STATS: "/api/v1/workspaces/{workspaceId}/analytics/stats";
};
/**
 * Analytics error messages
 */
export declare const ANALYTICS_ERROR_MESSAGES: {
    readonly RATE_LIMITED: "Analytics rate limit exceeded. Please wait before sending more events.";
    readonly EXPORT_RATE_LIMITED: "Export rate limit exceeded. Please wait before requesting another export.";
    readonly TOO_MANY_SCHEDULED_REPORTS: "Maximum number of scheduled reports reached.";
    readonly INVALID_DATE_RANGE: "Invalid date range. Start date must be before end date.";
    readonly DATE_RANGE_TOO_LARGE: "Date range exceeds maximum allowed span.";
    readonly INVALID_EVENT_TYPE: "Invalid analytics event type.";
    readonly INVALID_PERIOD_TYPE: "Invalid analytics period type.";
    readonly INVALID_REPORT_TYPE: "Invalid report type.";
    readonly INVALID_EXPORT_FORMAT: "Invalid export format.";
    readonly INVALID_CRON_EXPRESSION: "Invalid cron expression for report schedule.";
    readonly GALLERY_NOT_FOUND: "Gallery not found.";
    readonly CLIENT_NOT_FOUND: "Client not found.";
    readonly REPORT_NOT_FOUND: "Report not found.";
    readonly EXPORT_NOT_FOUND: "Export not found.";
    readonly AGGREGATION_FAILED: "Analytics aggregation failed. Please try again later.";
    readonly REPORT_GENERATION_FAILED: "Report generation failed. Please try again.";
    readonly EXPORT_GENERATION_FAILED: "Export generation failed. Please try again.";
    readonly EXPORT_EXPIRED: "Export has expired. Please generate a new export.";
    readonly REPORT_IN_PROGRESS: "Report generation already in progress.";
    readonly NO_DATA_AVAILABLE: "No analytics data available for the selected period.";
    readonly INSUFFICIENT_DATA: "Insufficient data to calculate metrics.";
    readonly DATA_STALE: "Analytics data may be stale. Last updated: {timestamp}.";
    readonly UNAUTHORIZED: "Not authorized to access analytics for this workspace.";
};
/**
 * Date range configuration for predefined periods
 */
export declare const DATE_RANGE_CONFIG: {
    readonly today: {
        readonly days: 0;
        readonly label: "Today";
    };
    readonly yesterday: {
        readonly days: 1;
        readonly label: "Yesterday";
    };
    readonly last_7_days: {
        readonly days: 7;
        readonly label: "Last 7 Days";
    };
    readonly last_30_days: {
        readonly days: 30;
        readonly label: "Last 30 Days";
    };
    readonly last_90_days: {
        readonly days: 90;
        readonly label: "Last 90 Days";
    };
    readonly this_month: {
        readonly days: 0;
        readonly label: "This Month";
        readonly isCalendarBased: true;
    };
    readonly last_month: {
        readonly days: 0;
        readonly label: "Last Month";
        readonly isCalendarBased: true;
    };
    readonly this_year: {
        readonly days: 0;
        readonly label: "This Year";
        readonly isCalendarBased: true;
    };
    readonly last_year: {
        readonly days: 0;
        readonly label: "Last Year";
        readonly isCalendarBased: true;
    };
    readonly custom: {
        readonly days: 0;
        readonly label: "Custom Range";
    };
};
/**
 * Maximum date range spans in days
 */
export declare const MAX_DATE_RANGE_DAYS: {
    /** Maximum for raw event queries */
    readonly RAW_EVENTS: 90;
    /** Maximum for aggregated queries */
    readonly AGGREGATED: 365;
    /** Maximum for time series queries */
    readonly TIMESERIES: 365;
    /** Maximum for report exports */
    readonly EXPORTS: 365;
};
/**
 * Browser name mappings for analytics
 */
export declare const BROWSER_NAMES: {
    readonly chrome: "Google Chrome";
    readonly firefox: "Mozilla Firefox";
    readonly safari: "Safari";
    readonly edge: "Microsoft Edge";
    readonly opera: "Opera";
    readonly ie: "Internet Explorer";
    readonly other: "Other";
};
/**
 * Operating system name mappings for analytics
 */
export declare const OS_NAMES: {
    readonly windows: "Windows";
    readonly macos: "macOS";
    readonly linux: "Linux";
    readonly ios: "iOS";
    readonly android: "Android";
    readonly other: "Other";
};
/**
 * Analytics pagination defaults
 */
export declare const ANALYTICS_PAGINATION: {
    readonly DEFAULT_PAGE: 1;
    readonly DEFAULT_LIMIT: 20;
    readonly MAX_LIMIT: 100;
    readonly EVENTS_MAX_LIMIT: 500;
};
/**
 * All analytics constants consolidated
 */
export declare const ANALYTICS: {
    readonly RATE_LIMITS: {
        /** Maximum events per minute per workspace */
        readonly EVENTS_PER_MINUTE: 1000;
        /** Maximum events per session for a single visitor */
        readonly EVENTS_PER_SESSION: 500;
        /** Maximum bulk event inserts per request */
        readonly BULK_INSERT_LIMIT: 100;
        /** Minimum interval between identical events in milliseconds */
        readonly DUPLICATE_EVENT_INTERVAL_MS: 1000;
    };
    readonly REPORT_RATE_LIMITS: {
        /** Maximum concurrent report generations per workspace */
        readonly MAX_CONCURRENT_REPORTS: 3;
        /** Minimum seconds between report requests for same report */
        readonly PER_REPORT_COOLDOWN_SECONDS: 60;
        /** Maximum exports per day per workspace */
        readonly MAX_EXPORTS_PER_DAY: 50;
        /** Maximum scheduled reports per workspace */
        readonly MAX_SCHEDULED_REPORTS: 20;
    };
    readonly CACHE: {
        /** Dashboard overview cache TTL in seconds */
        readonly DASHBOARD_TTL_SECONDS: 300;
        /** Gallery analytics cache TTL in seconds */
        readonly GALLERY_ANALYTICS_TTL_SECONDS: 600;
        /** Client analytics cache TTL in seconds */
        readonly CLIENT_ANALYTICS_TTL_SECONDS: 600;
        /** Event aggregation cache TTL in seconds */
        readonly AGGREGATION_TTL_SECONDS: 900;
        /** Report data cache TTL in seconds */
        readonly REPORT_TTL_SECONDS: 1800;
        /** Time series data cache TTL in seconds */
        readonly TIMESERIES_TTL_SECONDS: 300;
        /** Cache key prefix for analytics */
        readonly KEY_PREFIX: "analytics:";
    };
    readonly RETENTION: {
        /** Raw event retention in days */
        readonly RAW_EVENTS_DAYS: 90;
        /** Daily aggregates retention in days */
        readonly DAILY_AGGREGATES_DAYS: 365;
        /** Weekly aggregates retention in days */
        readonly WEEKLY_AGGREGATES_DAYS: 730;
        /** Monthly aggregates retention in days */
        readonly MONTHLY_AGGREGATES_DAYS: 1825;
        /** Report export retention in days */
        readonly EXPORT_RETENTION_DAYS: 30;
        /** Report run history retention in days */
        readonly RUN_HISTORY_DAYS: 90;
    };
    readonly TIMING: {
        /** Event recording timeout in milliseconds */
        readonly EVENT_TIMEOUT_MS: 5000;
        /** Aggregation job timeout in minutes */
        readonly AGGREGATION_TIMEOUT_MINUTES: 30;
        /** Report generation timeout in minutes */
        readonly REPORT_TIMEOUT_MINUTES: 10;
        /** Export generation timeout in minutes */
        readonly EXPORT_TIMEOUT_MINUTES: 30;
        /** Dashboard refresh interval in milliseconds (frontend) */
        readonly DASHBOARD_REFRESH_MS: 60000;
        /** Real-time update debounce in milliseconds */
        readonly REALTIME_DEBOUNCE_MS: 5000;
        /** Session timeout in minutes (for session tracking) */
        readonly SESSION_TIMEOUT_MINUTES: 30;
        /** Frontend progress poll interval in milliseconds */
        readonly PROGRESS_POLL_INTERVAL_MS: 2000;
    };
    readonly AGGREGATION: {
        /** Batch size for event aggregation */
        readonly BATCH_SIZE: 1000;
        /** Maximum records per aggregation query */
        readonly MAX_QUERY_RECORDS: 100000;
        /** Time series data points limit */
        readonly MAX_TIMESERIES_POINTS: 365;
        /** Top N galleries to return */
        readonly TOP_GALLERIES_LIMIT: 10;
        /** Top N clients to return */
        readonly TOP_CLIENTS_LIMIT: 10;
        /** Top N countries for geographic breakdown */
        readonly TOP_COUNTRIES_LIMIT: 10;
        /** Recent activity items limit */
        readonly RECENT_ACTIVITY_LIMIT: 20;
    };
    readonly GALLERY_ENGAGEMENT_WEIGHTS: {
        /** Weight for unique visitors */
        readonly UNIQUE_VISITORS: 0.15;
        /** Weight for total views */
        readonly TOTAL_VIEWS: 0.1;
        /** Weight for favorites */
        readonly FAVORITES: 0.2;
        /** Weight for comments */
        readonly COMMENTS: 0.2;
        /** Weight for selections */
        readonly SELECTIONS: 0.15;
        /** Weight for downloads */
        readonly DOWNLOADS: 0.1;
        /** Weight for session duration */
        readonly SESSION_DURATION: 0.1;
    };
    readonly CLIENT_ENGAGEMENT_WEIGHTS: {
        /** Weight for gallery views */
        readonly GALLERY_VIEWS: 0.1;
        /** Weight for asset views */
        readonly ASSET_VIEWS: 0.1;
        /** Weight for favorites */
        readonly FAVORITES: 0.2;
        /** Weight for comments */
        readonly COMMENTS: 0.2;
        /** Weight for selections */
        readonly SELECTIONS: 0.15;
        /** Weight for downloads */
        readonly DOWNLOADS: 0.15;
        /** Weight for session frequency */
        readonly SESSION_FREQUENCY: 0.1;
    };
    readonly ENGAGEMENT_THRESHOLDS: {
        /** Minimum score for "high" engagement */
        readonly HIGH: 70;
        /** Minimum score for "medium" engagement */
        readonly MEDIUM: 40;
        /** Below this is "low" engagement */
        readonly LOW: 40;
    };
    readonly CHURN_RISK_WEIGHTS: {
        /** Weight for days since last activity (higher = more churn risk) */
        readonly DAYS_INACTIVE: 0.35;
        /** Weight for declining engagement trend */
        readonly ENGAGEMENT_DECLINE: 0.25;
        /** Weight for low session frequency */
        readonly LOW_FREQUENCY: 0.2;
        /** Weight for low lifetime value */
        readonly LOW_LTV: 0.1;
        /** Weight for no recent downloads */
        readonly NO_DOWNLOADS: 0.1;
    };
    readonly CHURN_RISK_THRESHOLDS: {
        /** Minimum score for "high" churn risk */
        readonly HIGH: 70;
        /** Minimum score for "medium" churn risk */
        readonly MEDIUM: 40;
        /** Days of inactivity before flagging */
        readonly INACTIVE_DAYS_WARNING: 30;
        /** Days of inactivity for high churn risk */
        readonly INACTIVE_DAYS_CRITICAL: 60;
    };
    readonly DEFAULT_REPORT_CONFIG: {
        /** Default date range */
        readonly dateRangeType: "last_30_days";
        /** Default export format */
        readonly exportFormat: "csv";
        /** Default timezone */
        readonly timezone: "UTC";
        /** Default page limit for paginated data */
        readonly pageLimit: 100;
    };
    readonly REPORT_SIZE_LIMITS: {
        /** Maximum rows per CSV export */
        readonly MAX_CSV_ROWS: 100000;
        /** Maximum file size in bytes (100MB) */
        readonly MAX_FILE_SIZE_BYTES: number;
        /** Maximum pages for PDF export */
        readonly MAX_PDF_PAGES: 500;
    };
    readonly REPORT_METRICS: {
        readonly GALLERY_VIEWS: "gallery_views";
        readonly GALLERY_UNIQUE_VISITORS: "gallery_unique_visitors";
        readonly GALLERY_DOWNLOADS: "gallery_downloads";
        readonly GALLERY_FAVORITES: "gallery_favorites";
        readonly GALLERY_COMMENTS: "gallery_comments";
        readonly GALLERY_ENGAGEMENT_SCORE: "gallery_engagement_score";
        readonly CLIENT_TOTAL_VIEWS: "client_total_views";
        readonly CLIENT_TOTAL_DOWNLOADS: "client_total_downloads";
        readonly CLIENT_ENGAGEMENT_SCORE: "client_engagement_score";
        readonly CLIENT_LIFETIME_VALUE: "client_lifetime_value";
        readonly CLIENT_CHURN_RISK: "client_churn_risk";
        readonly REVENUE_TOTAL: "revenue_total";
        readonly REVENUE_AVERAGE: "revenue_average";
        readonly SESSION_COUNT: "session_count";
        readonly SESSION_DURATION_AVG: "session_duration_avg";
        readonly BOUNCE_RATE: "bounce_rate";
    };
    readonly API_PATHS: {
        /** Base path for analytics endpoints */
        readonly BASE: "/api/v1/workspaces/{workspaceId}/analytics";
        /** Dashboard endpoint */
        readonly DASHBOARD: "/api/v1/workspaces/{workspaceId}/analytics/dashboard";
        /** Record event endpoint */
        readonly EVENTS: "/api/v1/workspaces/{workspaceId}/analytics/events";
        /** Gallery analytics endpoint */
        readonly GALLERY: "/api/v1/workspaces/{workspaceId}/analytics/galleries/{galleryId}";
        /** Gallery time series endpoint */
        readonly GALLERY_TIMESERIES: "/api/v1/workspaces/{workspaceId}/analytics/galleries/{galleryId}/timeseries";
        /** Client analytics endpoint */
        readonly CLIENT: "/api/v1/workspaces/{workspaceId}/analytics/clients/{clientId}";
        /** Client time series endpoint */
        readonly CLIENT_TIMESERIES: "/api/v1/workspaces/{workspaceId}/analytics/clients/{clientId}/timeseries";
        /** Top galleries endpoint */
        readonly TOP_GALLERIES: "/api/v1/workspaces/{workspaceId}/analytics/top-galleries";
        /** Top clients endpoint */
        readonly TOP_CLIENTS: "/api/v1/workspaces/{workspaceId}/analytics/top-clients";
        /** Churn risk endpoint */
        readonly CHURN_RISK: "/api/v1/workspaces/{workspaceId}/analytics/churn-risk";
        /** Reports CRUD endpoint */
        readonly REPORTS: "/api/v1/workspaces/{workspaceId}/analytics/reports";
        /** Single report endpoint */
        readonly REPORT: "/api/v1/workspaces/{workspaceId}/analytics/reports/{reportId}";
        /** Run report endpoint */
        readonly REPORT_RUN: "/api/v1/workspaces/{workspaceId}/analytics/reports/{reportId}/run";
        /** Report schedule endpoint */
        readonly REPORT_SCHEDULE: "/api/v1/workspaces/{workspaceId}/analytics/reports/{reportId}/schedule";
        /** Report exports endpoint */
        readonly EXPORTS: "/api/v1/workspaces/{workspaceId}/analytics/exports";
        /** Single export endpoint */
        readonly EXPORT: "/api/v1/workspaces/{workspaceId}/analytics/exports/{exportId}";
        /** Export download endpoint */
        readonly EXPORT_DOWNLOAD: "/api/v1/workspaces/{workspaceId}/analytics/exports/{exportId}/download";
        /** Stats endpoint */
        readonly STATS: "/api/v1/workspaces/{workspaceId}/analytics/stats";
    };
    readonly ERROR_MESSAGES: {
        readonly RATE_LIMITED: "Analytics rate limit exceeded. Please wait before sending more events.";
        readonly EXPORT_RATE_LIMITED: "Export rate limit exceeded. Please wait before requesting another export.";
        readonly TOO_MANY_SCHEDULED_REPORTS: "Maximum number of scheduled reports reached.";
        readonly INVALID_DATE_RANGE: "Invalid date range. Start date must be before end date.";
        readonly DATE_RANGE_TOO_LARGE: "Date range exceeds maximum allowed span.";
        readonly INVALID_EVENT_TYPE: "Invalid analytics event type.";
        readonly INVALID_PERIOD_TYPE: "Invalid analytics period type.";
        readonly INVALID_REPORT_TYPE: "Invalid report type.";
        readonly INVALID_EXPORT_FORMAT: "Invalid export format.";
        readonly INVALID_CRON_EXPRESSION: "Invalid cron expression for report schedule.";
        readonly GALLERY_NOT_FOUND: "Gallery not found.";
        readonly CLIENT_NOT_FOUND: "Client not found.";
        readonly REPORT_NOT_FOUND: "Report not found.";
        readonly EXPORT_NOT_FOUND: "Export not found.";
        readonly AGGREGATION_FAILED: "Analytics aggregation failed. Please try again later.";
        readonly REPORT_GENERATION_FAILED: "Report generation failed. Please try again.";
        readonly EXPORT_GENERATION_FAILED: "Export generation failed. Please try again.";
        readonly EXPORT_EXPIRED: "Export has expired. Please generate a new export.";
        readonly REPORT_IN_PROGRESS: "Report generation already in progress.";
        readonly NO_DATA_AVAILABLE: "No analytics data available for the selected period.";
        readonly INSUFFICIENT_DATA: "Insufficient data to calculate metrics.";
        readonly DATA_STALE: "Analytics data may be stale. Last updated: {timestamp}.";
        readonly UNAUTHORIZED: "Not authorized to access analytics for this workspace.";
    };
    readonly DATE_RANGE_CONFIG: {
        readonly today: {
            readonly days: 0;
            readonly label: "Today";
        };
        readonly yesterday: {
            readonly days: 1;
            readonly label: "Yesterday";
        };
        readonly last_7_days: {
            readonly days: 7;
            readonly label: "Last 7 Days";
        };
        readonly last_30_days: {
            readonly days: 30;
            readonly label: "Last 30 Days";
        };
        readonly last_90_days: {
            readonly days: 90;
            readonly label: "Last 90 Days";
        };
        readonly this_month: {
            readonly days: 0;
            readonly label: "This Month";
            readonly isCalendarBased: true;
        };
        readonly last_month: {
            readonly days: 0;
            readonly label: "Last Month";
            readonly isCalendarBased: true;
        };
        readonly this_year: {
            readonly days: 0;
            readonly label: "This Year";
            readonly isCalendarBased: true;
        };
        readonly last_year: {
            readonly days: 0;
            readonly label: "Last Year";
            readonly isCalendarBased: true;
        };
        readonly custom: {
            readonly days: 0;
            readonly label: "Custom Range";
        };
    };
    readonly MAX_DATE_RANGE_DAYS: {
        /** Maximum for raw event queries */
        readonly RAW_EVENTS: 90;
        /** Maximum for aggregated queries */
        readonly AGGREGATED: 365;
        /** Maximum for time series queries */
        readonly TIMESERIES: 365;
        /** Maximum for report exports */
        readonly EXPORTS: 365;
    };
    readonly BROWSER_NAMES: {
        readonly chrome: "Google Chrome";
        readonly firefox: "Mozilla Firefox";
        readonly safari: "Safari";
        readonly edge: "Microsoft Edge";
        readonly opera: "Opera";
        readonly ie: "Internet Explorer";
        readonly other: "Other";
    };
    readonly OS_NAMES: {
        readonly windows: "Windows";
        readonly macos: "macOS";
        readonly linux: "Linux";
        readonly ios: "iOS";
        readonly android: "Android";
        readonly other: "Other";
    };
    readonly PAGINATION: {
        readonly DEFAULT_PAGE: 1;
        readonly DEFAULT_LIMIT: 20;
        readonly MAX_LIMIT: 100;
        readonly EVENTS_MAX_LIMIT: 500;
    };
};
//# sourceMappingURL=analytics.d.ts.map