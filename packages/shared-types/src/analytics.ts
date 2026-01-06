/**
 * Analytics & Reporting Types
 *
 * Types for the analytics and reporting system:
 * - Analytics events (user interactions, views, downloads, etc.)
 * - Gallery analytics (views, engagement, device/geo breakdown)
 * - Client analytics (engagement scoring, lifetime value, churn risk)
 * - Custom reports (configuration, scheduling, export)
 * - Dashboard metrics and aggregations
 */

// ---------------------------------------------------------------------------
// Analytics Event Enums
// ---------------------------------------------------------------------------

/**
 * Types of analytics events that can be tracked
 */
export const AnalyticsEventType = {
  // Gallery events
  GALLERY_VIEW: 'gallery_view',
  GALLERY_DOWNLOAD: 'gallery_download',
  GALLERY_SHARE: 'gallery_share',

  // Asset events
  ASSET_VIEW: 'asset_view',
  ASSET_DOWNLOAD: 'asset_download',
  ASSET_FAVORITE: 'asset_favorite',
  ASSET_UNFAVORITE: 'asset_unfavorite',
  ASSET_COMMENT: 'asset_comment',
  ASSET_SELECT: 'asset_select',
  ASSET_DESELECT: 'asset_deselect',

  // Share link events
  SHARE_LINK_CREATED: 'share_link_created',
  SHARE_LINK_ACCESSED: 'share_link_accessed',
  SHARE_LINK_EXPIRED: 'share_link_expired',

  // Client portal events
  CLIENT_LOGIN: 'client_login',
  CLIENT_LOGOUT: 'client_logout',
  CLIENT_REGISTRATION: 'client_registration',

  // Invitation events
  INVITATION_VIEWED: 'invitation_viewed',
  INVITATION_RSVP: 'invitation_rsvp',
  INVITATION_SHARED: 'invitation_shared',

  // Download events
  BULK_DOWNLOAD_STARTED: 'bulk_download_started',
  BULK_DOWNLOAD_COMPLETED: 'bulk_download_completed',

  // Session events
  PAGE_VIEW: 'page_view',
  SESSION_START: 'session_start',
  SESSION_END: 'session_end',
} as const;
export type AnalyticsEventType = typeof AnalyticsEventType[keyof typeof AnalyticsEventType];

/**
 * Categories for grouping analytics events
 */
export const AnalyticsEventCategory = {
  GALLERY: 'gallery',
  ASSET: 'asset',
  CLIENT: 'client',
  INVITATION: 'invitation',
  DOWNLOAD: 'download',
  SHARE: 'share',
  SESSION: 'session',
  PAGE: 'page',
} as const;
export type AnalyticsEventCategory = typeof AnalyticsEventCategory[keyof typeof AnalyticsEventCategory];

/**
 * Types of actors that can generate analytics events
 */
export const AnalyticsActorType = {
  USER: 'user',
  CLIENT: 'client',
  VISITOR: 'visitor',
  SYSTEM: 'system',
} as const;
export type AnalyticsActorType = typeof AnalyticsActorType[keyof typeof AnalyticsActorType];

/**
 * Device types for analytics tracking
 */
export const AnalyticsDeviceType = {
  DESKTOP: 'desktop',
  TABLET: 'tablet',
  MOBILE: 'mobile',
  OTHER: 'other',
} as const;
export type AnalyticsDeviceType = typeof AnalyticsDeviceType[keyof typeof AnalyticsDeviceType];

/**
 * Period types for analytics aggregation
 */
export const AnalyticsPeriodType = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  ALL_TIME: 'all_time',
} as const;
export type AnalyticsPeriodType = typeof AnalyticsPeriodType[keyof typeof AnalyticsPeriodType];

// ---------------------------------------------------------------------------
// Report Enums
// ---------------------------------------------------------------------------

/**
 * Types of custom reports that can be created
 */
export const ReportType = {
  DASHBOARD_SUMMARY: 'dashboard_summary',
  GALLERY_PERFORMANCE: 'gallery_performance',
  CLIENT_ENGAGEMENT: 'client_engagement',
  REVENUE_REPORT: 'revenue_report',
  DOWNLOAD_REPORT: 'download_report',
  CUSTOM: 'custom',
} as const;
export type ReportType = typeof ReportType[keyof typeof ReportType];

/**
 * Predefined date range options for reports
 */
export const DateRangeType = {
  TODAY: 'today',
  YESTERDAY: 'yesterday',
  LAST_7_DAYS: 'last_7_days',
  LAST_30_DAYS: 'last_30_days',
  LAST_90_DAYS: 'last_90_days',
  THIS_MONTH: 'this_month',
  LAST_MONTH: 'last_month',
  THIS_YEAR: 'this_year',
  LAST_YEAR: 'last_year',
  CUSTOM: 'custom',
} as const;
export type DateRangeType = typeof DateRangeType[keyof typeof DateRangeType];

/**
 * Supported export formats for reports
 */
export const ReportExportFormat = {
  CSV: 'csv',
  PDF: 'pdf',
  XLSX: 'xlsx',
} as const;
export type ReportExportFormat = typeof ReportExportFormat[keyof typeof ReportExportFormat];

/**
 * Status of a report run
 */
export const ReportRunStatus = {
  SUCCESS: 'success',
  FAILED: 'failed',
  RUNNING: 'running',
} as const;
export type ReportRunStatus = typeof ReportRunStatus[keyof typeof ReportRunStatus];

/**
 * Status of a report export file
 */
export const ReportExportStatus = {
  GENERATING: 'generating',
  COMPLETED: 'completed',
  FAILED: 'failed',
  EXPIRED: 'expired',
} as const;
export type ReportExportStatus = typeof ReportExportStatus[keyof typeof ReportExportStatus];

// ---------------------------------------------------------------------------
// Analytics Event Interfaces
// ---------------------------------------------------------------------------

/**
 * Analytics event tracking user interactions
 */
export interface AnalyticsEvent {
  eventId: string;
  workspaceId: string;
  eventType: AnalyticsEventType;
  eventCategory: AnalyticsEventCategory;

  // Related entities
  galleryId?: string;
  assetId?: string;
  clientId?: string;
  shareLinkId?: string;
  invitationId?: string;

  // Actor information
  actorType: AnalyticsActorType;
  actorId?: string;
  visitorId?: string;

  // Session and context
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  referrer?: string;

  // Geographic data
  countryCode?: string;
  region?: string;
  city?: string;

  // Device information
  deviceType?: AnalyticsDeviceType;
  browser?: string;
  os?: string;

  // Metadata
  metadata?: Record<string, unknown>;
  numericValue?: number;
  durationMs?: number;

  // Timestamps
  occurredAt: string;
  createdAt: string;
}

/**
 * Request to record a new analytics event
 */
export interface RecordAnalyticsEventRequest {
  eventType: AnalyticsEventType;
  eventCategory: AnalyticsEventCategory;

  // Related entities
  galleryId?: string;
  assetId?: string;
  clientId?: string;
  shareLinkId?: string;
  invitationId?: string;

  // Actor information
  actorType: AnalyticsActorType;
  actorId?: string;
  visitorId?: string;

  // Session and context
  sessionId?: string;

  // Metadata
  metadata?: Record<string, unknown>;
  numericValue?: number;
  durationMs?: number;

  // Optional timestamp (defaults to now)
  occurredAt?: string;
}

/**
 * Lightweight event summary for API responses
 */
export interface AnalyticsEventSummary {
  eventId: string;
  eventType: AnalyticsEventType;
  eventCategory: AnalyticsEventCategory;
  actorType: AnalyticsActorType;
  galleryId?: string;
  clientId?: string;
  occurredAt: string;
}

/**
 * Event count aggregation
 */
export interface EventCount {
  eventType: AnalyticsEventType;
  count: number;
  periodStart?: string;
  periodEnd?: string;
}

/**
 * Breakdown of events by type
 */
export interface EventTypeBreakdown {
  eventType: AnalyticsEventType;
  eventCategory: AnalyticsEventCategory;
  totalCount: number;
  uniqueActors: number;
  percentage: number;
}

/**
 * Geographic breakdown of events
 */
export interface GeographicBreakdown {
  countryCode: string;
  countryName?: string;
  eventCount: number;
  uniqueVisitors: number;
  percentage: number;
}

/**
 * Device breakdown of events
 */
export interface DeviceBreakdown {
  deviceType: AnalyticsDeviceType;
  eventCount: number;
  percentage: number;
}

// ---------------------------------------------------------------------------
// Gallery Analytics Interfaces
// ---------------------------------------------------------------------------

/**
 * Aggregated gallery-level analytics
 */
export interface GalleryAnalytics {
  galleryAnalyticsId: string;
  workspaceId: string;
  galleryId: string;

  // Aggregation period
  periodType: AnalyticsPeriodType;
  periodStart: string;
  periodEnd: string;

  // View metrics
  totalViews: number;
  uniqueVisitors: number;
  uniqueSessions: number;

  // Engagement metrics
  totalFavorites: number;
  totalComments: number;
  totalSelections: number;
  totalDownloads: number;

  // Time metrics
  totalTimeSpentMs: number;
  avgSessionDurationMs: number;
  bounceRate?: number;

  // Geographic breakdown
  topCountries: GeographicBreakdown[];

  // Device breakdown
  desktopViews: number;
  tabletViews: number;
  mobileViews: number;

  // Source tracking
  directViews: number;
  shareLinkViews: number;
  referralViews: number;

  // Share link metrics
  shareLinksCreated: number;
  shareLinkAccesses: number;
  shareLinkConversions: number;

  // Calculated metrics
  engagementScore?: number;
  conversionRate?: number;

  // Timestamps
  calculatedAt: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Lightweight gallery analytics summary
 */
export interface GalleryAnalyticsSummary {
  galleryAnalyticsId: string;
  galleryId: string;
  periodType: AnalyticsPeriodType;
  periodStart: string;
  periodEnd: string;
  totalViews: number;
  uniqueVisitors: number;
  totalDownloads: number;
  engagementScore?: number;
  calculatedAt: string;
}

/**
 * Time series data point for gallery views
 */
export interface GalleryViewsTimeSeries {
  date: string;
  totalViews: number;
  uniqueVisitors: number;
}

/**
 * Engagement metrics for a gallery
 */
export interface GalleryEngagementMetrics {
  galleryId: string;
  totalFavorites: number;
  totalComments: number;
  totalSelections: number;
  totalDownloads: number;
  avgSessionDurationMs: number;
  bounceRate?: number;
  engagementScore?: number;
}

/**
 * Device breakdown statistics for a gallery
 */
export interface GalleryDeviceStats {
  galleryId: string;
  desktopViews: number;
  desktopPercentage: number;
  tabletViews: number;
  tabletPercentage: number;
  mobileViews: number;
  mobilePercentage: number;
}

/**
 * Traffic source statistics for a gallery
 */
export interface GallerySourceStats {
  galleryId: string;
  directViews: number;
  directPercentage: number;
  shareLinkViews: number;
  shareLinkPercentage: number;
  referralViews: number;
  referralPercentage: number;
}

/**
 * Share link statistics for a gallery
 */
export interface GalleryShareLinkStats {
  galleryId: string;
  shareLinksCreated: number;
  shareLinkAccesses: number;
  shareLinkConversions: number;
  conversionRate?: number;
}

/**
 * Top performing gallery summary
 */
export interface TopGallery {
  galleryId: string;
  galleryName?: string;
  totalViews: number;
  uniqueVisitors: number;
  totalDownloads: number;
  engagementScore?: number;
  trendPercentage?: number;
}

// ---------------------------------------------------------------------------
// Client Analytics Interfaces
// ---------------------------------------------------------------------------

/**
 * Aggregated client-level analytics
 */
export interface ClientAnalytics {
  clientAnalyticsId: string;
  workspaceId: string;
  clientId: string;

  // Aggregation period
  periodType: AnalyticsPeriodType;
  periodStart: string;
  periodEnd: string;

  // Activity metrics
  totalGalleryViews: number;
  totalAssetViews: number;
  totalFavorites: number;
  totalComments: number;
  totalSelections: number;
  totalDownloads: number;

  // Session metrics
  totalSessions: number;
  totalTimeSpentMs: number;
  avgSessionDurationMs: number;

  // Gallery interaction metrics
  galleriesViewed: number;
  galleriesWithActivity: number;

  // Engagement scoring
  engagementScore: number;
  engagementTrend?: number;

  // Lifetime value (in cents)
  lifetimeValueCents: number;
  periodRevenueCents: number;

  // Recency metrics
  lastActivityAt?: string;
  daysSinceLastActivity?: number;

  // Frequency metrics
  visitsLast7Days: number;
  visitsLast30Days: number;
  visitsLast90Days: number;

  // Churn risk
  churnRiskScore?: number;

  // Timestamps
  calculatedAt: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Lightweight client analytics summary
 */
export interface ClientAnalyticsSummary {
  clientAnalyticsId: string;
  clientId: string;
  periodType: AnalyticsPeriodType;
  periodStart: string;
  periodEnd: string;
  totalGalleryViews: number;
  totalDownloads: number;
  engagementScore: number;
  lifetimeValueCents: number;
  churnRiskScore?: number;
  calculatedAt: string;
}

/**
 * Time series data point for client activity
 */
export interface ClientActivityTimeSeries {
  date: string;
  galleryViews: number;
  assetViews: number;
  totalEngagementActions: number;
}

/**
 * Engagement metrics for a client
 */
export interface ClientEngagementMetrics {
  clientId: string;
  totalFavorites: number;
  totalComments: number;
  totalSelections: number;
  totalDownloads: number;
  avgSessionDurationMs: number;
  engagementScore: number;
  engagementTrend?: number;
}

/**
 * Value metrics for a client (LTV, revenue)
 */
export interface ClientValueMetrics {
  clientId: string;
  lifetimeValueCents: number;
  periodRevenueCents: number;
  galleriesViewed: number;
  galleriesWithActivity: number;
  totalSessions: number;
  totalTimeSpentMs: number;
}

/**
 * Recency and frequency metrics for a client (RFM analysis)
 */
export interface ClientRecencyFrequencyMetrics {
  clientId: string;
  lastActivityAt?: string;
  daysSinceLastActivity?: number;
  visitsLast7Days: number;
  visitsLast30Days: number;
  visitsLast90Days: number;
  churnRiskScore?: number;
}

/**
 * Churn risk assessment for a client
 */
export interface ClientChurnRisk {
  clientId: string;
  clientName?: string;
  clientEmail?: string;
  churnRiskScore: number;
  daysSinceLastActivity?: number;
  lastActivityAt?: string;
  engagementScore: number;
  engagementTrend?: number;
  riskFactors: string[];
}

/**
 * Top performing client summary
 */
export interface TopClient {
  clientId: string;
  clientName?: string;
  clientEmail?: string;
  totalGalleryViews: number;
  totalDownloads: number;
  engagementScore: number;
  lifetimeValueCents: number;
  trendPercentage?: number;
}

/**
 * Client segment for grouping clients by behavior
 */
export interface ClientSegment {
  segmentName: string;
  clientCount: number;
  avgEngagementScore: number;
  avgLifetimeValueCents: number;
  percentageOfTotal: number;
}

// ---------------------------------------------------------------------------
// Custom Report Interfaces
// ---------------------------------------------------------------------------

/**
 * Report recipient configuration
 */
export interface ReportRecipient {
  email: string;
  name?: string;
  recipientType: 'email' | 'user' | 'client';
  userId?: string;
  clientId?: string;
}

/**
 * Report schedule information
 */
export interface ReportSchedule {
  reportId: string;
  isScheduled: boolean;
  scheduleCron?: string;
  scheduleTimezone: string;
  nextRunAt?: string;
  lastRunAt?: string;
  recipients: ReportRecipient[];
}

/**
 * Configuration for a single metric in a report
 */
export interface ReportMetricConfig {
  metricName: string;
  displayName: string;
  aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max';
  format: 'number' | 'percentage' | 'currency' | 'duration';
  isVisible: boolean;
}

/**
 * Configuration for a single filter in a report
 */
export interface ReportFilterConfig {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'contains';
  value: unknown;
}

/**
 * User-defined custom report configuration
 */
export interface CustomReport {
  reportId: string;
  workspaceId: string;
  name: string;
  description?: string;
  reportType: ReportType;

  // Configuration
  config: Record<string, unknown>;
  metrics: string[];
  filters: Record<string, unknown>;
  grouping: string[];
  sorting: Record<string, unknown>;

  // Date range configuration
  dateRangeType: DateRangeType;
  customStartDate?: string;
  customEndDate?: string;

  // Export configuration
  exportFormat: ReportExportFormat;
  exportConfig: Record<string, unknown>;

  // Scheduling
  isScheduled: boolean;
  scheduleCron?: string;
  scheduleTimezone: string;
  nextRunAt?: string;
  lastRunAt?: string;
  recipients: ReportRecipient[];

  // Status and metadata
  isActive: boolean;
  isSystem: boolean;
  runCount: number;
  lastRunStatus?: ReportRunStatus;
  lastRunError?: string;

  // Ownership
  createdByUserId: string;
  updatedByUserId?: string;

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

/**
 * Request to create a new custom report
 */
export interface CreateCustomReportRequest {
  name: string;
  description?: string;
  reportType: ReportType;

  // Configuration
  config?: Record<string, unknown>;
  metrics?: string[];
  filters?: Record<string, unknown>;
  grouping?: string[];
  sorting?: Record<string, unknown>;

  // Date range
  dateRangeType?: DateRangeType;
  customStartDate?: string;
  customEndDate?: string;

  // Export
  exportFormat?: ReportExportFormat;
  exportConfig?: Record<string, unknown>;

  // Scheduling (optional)
  isScheduled?: boolean;
  scheduleCron?: string;
  scheduleTimezone?: string;
  recipients?: ReportRecipient[];
}

/**
 * Request to update an existing custom report
 */
export interface UpdateCustomReportRequest {
  name?: string;
  description?: string;
  reportType?: ReportType;

  // Configuration
  config?: Record<string, unknown>;
  metrics?: string[];
  filters?: Record<string, unknown>;
  grouping?: string[];
  sorting?: Record<string, unknown>;

  // Date range
  dateRangeType?: DateRangeType;
  customStartDate?: string;
  customEndDate?: string;

  // Export
  exportFormat?: ReportExportFormat;
  exportConfig?: Record<string, unknown>;

  // Scheduling
  isScheduled?: boolean;
  scheduleCron?: string;
  scheduleTimezone?: string;
  recipients?: ReportRecipient[];

  // Status
  isActive?: boolean;
}

/**
 * Lightweight custom report summary
 */
export interface CustomReportSummary {
  reportId: string;
  workspaceId: string;
  name: string;
  reportType: ReportType;
  dateRangeType: DateRangeType;
  isScheduled: boolean;
  isActive: boolean;
  runCount: number;
  lastRunAt?: string;
  lastRunStatus?: ReportRunStatus;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Report Export Interfaces
// ---------------------------------------------------------------------------

/**
 * Generated report export file
 */
export interface ReportExport {
  exportId: string;
  workspaceId: string;
  reportId?: string;
  name: string;
  format: ReportExportFormat;
  startDate: string;
  endDate: string;
  storageKey: string;
  fileSizeBytes: number;
  fileHash?: string;
  status: ReportExportStatus;
  errorMessage?: string;
  downloadCount: number;
  lastDownloadedAt?: string;
  expiresAt: string;
  generatedByUserId?: string;
  generationTimeMs?: number;
  createdAt: string;
}

/**
 * Lightweight report export summary
 */
export interface ReportExportSummary {
  exportId: string;
  workspaceId: string;
  reportId?: string;
  name: string;
  format: ReportExportFormat;
  startDate: string;
  endDate: string;
  status: ReportExportStatus;
  fileSizeBytes: number;
  downloadCount: number;
  expiresAt: string;
  createdAt: string;
}

/**
 * Download information for a report export
 */
export interface ReportExportDownloadInfo {
  exportId: string;
  name: string;
  format: ReportExportFormat;
  storageKey: string;
  fileSizeBytes: number;
  fileHash?: string;
  expiresAt: string;
  downloadUrl?: string;
}

/**
 * Request to generate a new report export
 */
export interface GenerateReportExportRequest {
  reportId?: string;
  reportType: ReportType;
  name?: string;
  format?: ReportExportFormat;
  dateRangeType?: DateRangeType;
  customStartDate?: string;
  customEndDate?: string;
  metrics?: string[];
  filters?: Record<string, unknown>;
  grouping?: string[];
}

/**
 * Status response for a report generation request
 */
export interface ReportGenerationStatus {
  exportId: string;
  status: ReportExportStatus;
  progressPercentage?: number;
  errorMessage?: string;
  estimatedCompletionTime?: string;
  downloadUrl?: string;
}

// ---------------------------------------------------------------------------
// Dashboard Analytics Interfaces
// ---------------------------------------------------------------------------

/**
 * Overview metrics for the analytics dashboard
 */
export interface DashboardOverviewMetrics {
  totalGalleries: number;
  totalAssets: number;
  storageUsedBytes: number;
  activeClients: number;
  totalViews: number;
  totalDownloads: number;
  newClientsCount: number;
  revenueCents: number;
}

/**
 * Quick stats for a selected period
 */
export interface DashboardQuickStats {
  periodStart: string;
  periodEnd: string;
  views: number;
  viewsChange: number;
  downloads: number;
  downloadsChange: number;
  newClients: number;
  newClientsChange: number;
  revenueCents: number;
  revenueChange: number;
}

/**
 * Activity item for recent activity feed
 */
export interface RecentActivity {
  activityId: string;
  eventType: AnalyticsEventType;
  eventCategory: AnalyticsEventCategory;
  description: string;
  galleryId?: string;
  galleryName?: string;
  clientId?: string;
  clientName?: string;
  occurredAt: string;
}

/**
 * Dashboard analytics response
 */
export interface DashboardAnalyticsResponse {
  overview: DashboardOverviewMetrics;
  quickStats: DashboardQuickStats;
  topGalleries: TopGallery[];
  topClients: TopClient[];
  recentActivity: RecentActivity[];
  viewsTimeSeries: GalleryViewsTimeSeries[];
}

// ---------------------------------------------------------------------------
// API Query Interfaces
// ---------------------------------------------------------------------------

/**
 * Query parameters for listing analytics events
 */
export interface ListAnalyticsEventsQuery {
  eventType?: AnalyticsEventType;
  eventCategory?: AnalyticsEventCategory;
  galleryId?: string;
  clientId?: string;
  actorType?: AnalyticsActorType;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

/**
 * Query parameters for gallery analytics
 */
export interface GetGalleryAnalyticsQuery {
  periodType?: AnalyticsPeriodType;
  startDate?: string;
  endDate?: string;
}

/**
 * Query parameters for client analytics
 */
export interface GetClientAnalyticsQuery {
  periodType?: AnalyticsPeriodType;
  startDate?: string;
  endDate?: string;
}

/**
 * Query parameters for listing custom reports
 */
export interface ListCustomReportsQuery {
  reportType?: ReportType;
  isScheduled?: boolean;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

/**
 * Query parameters for listing report exports
 */
export interface ListReportExportsQuery {
  reportId?: string;
  format?: ReportExportFormat;
  status?: ReportExportStatus;
  page?: number;
  limit?: number;
}

// ---------------------------------------------------------------------------
// API Response Interfaces
// ---------------------------------------------------------------------------

/**
 * Paginated analytics events response
 */
export interface AnalyticsEventsListResponse {
  data: AnalyticsEventSummary[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Paginated custom reports response
 */
export interface CustomReportsListResponse {
  data: CustomReportSummary[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Paginated report exports response
 */
export interface ReportExportsListResponse {
  data: ReportExportSummary[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Analytics statistics for a workspace
 */
export interface WorkspaceAnalyticsStats {
  totalEvents: number;
  totalGalleriesTracked: number;
  totalClientsTracked: number;
  eventsLast7Days: number;
  eventsLast30Days: number;
  topEventTypes: EventTypeBreakdown[];
  cacheHitRate: number;
  dataFreshness: string;
}
