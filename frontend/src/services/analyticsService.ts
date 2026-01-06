/**
 * Analytics API Service
 * API client for all analytics and reporting operations
 *
 * Feature: Analytics & Reporting
 * Task: T026 - Create analytics API service
 */

import apiClient from './api';

// ---------------------------------------------------------------------------
// Query Parameter Helpers
// ---------------------------------------------------------------------------

/**
 * Build query string from params object
 */
function buildQueryString<T extends object>(params: T): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      value.forEach((v) => searchParams.append(key, String(v)));
    } else if (value instanceof Date) {
      searchParams.append(key, value.toISOString());
    } else {
      searchParams.append(key, String(value));
    }
  }

  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

// ---------------------------------------------------------------------------
// Request Types
// ---------------------------------------------------------------------------

export interface DateRangeParams {
  startDate?: string | Date;
  endDate?: string | Date;
}

export interface PeriodParams {
  periodType?: 'daily' | 'weekly' | 'monthly' | 'all_time';
}

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface QuickStatsParams {
  period?: '7d' | '30d' | '90d' | '1y' | 'all';
}

export interface GalleryViewsTimeSeriesParams extends DateRangeParams {
  granularity?: 'daily' | 'weekly' | 'monthly';
}

export interface GalleryAnalyticsHistoryParams extends DateRangeParams {
  periodType?: 'daily' | 'weekly' | 'monthly';
  limit?: number;
}

export interface CalculateGalleryAnalyticsParams {
  periodType?: 'daily' | 'weekly' | 'monthly' | 'all_time';
  force?: boolean;
}

export interface CompareGalleriesParams extends DateRangeParams {
  galleryIds: string[];
}

export interface ClientAnalyticsDetailsParams {
  periodType?: 'daily' | 'weekly' | 'monthly' | 'all_time';
  includeHistory?: boolean;
  includeGalleries?: boolean;
  historyLimit?: number;
}

export interface ClientActivityTimeSeriesParams extends DateRangeParams {
  granularity?: 'daily' | 'weekly' | 'monthly';
}

export interface TopClientsParams extends PeriodParams, PaginationParams {
  sortBy?: 'engagement' | 'views' | 'downloads' | 'ltv';
}

export interface ChurnRiskParams extends PaginationParams {
  minRiskScore?: number;
}

export interface CompareClientsParams {
  clientIds: string[];
  periodType?: 'daily' | 'weekly' | 'monthly' | 'all_time';
}

export interface ActivityFeedParams extends PaginationParams {
  eventTypes?: string[];
  galleryId?: string;
  clientId?: string;
}

export interface CreateReportRequest {
  name: string;
  reportType: string;
  description?: string;
  config?: Record<string, unknown>;
  metrics?: string[];
  filters?: Record<string, unknown>;
  grouping?: string[];
  sorting?: Record<string, unknown>;
  dateRangeType?: string;
  customStartDate?: string;
  customEndDate?: string;
  exportFormat?: 'csv' | 'xlsx' | 'pdf';
  exportConfig?: Record<string, unknown>;
  isScheduled?: boolean;
  scheduleCron?: string;
  scheduleTimezone?: string;
  recipients?: ReportRecipient[];
}

export interface UpdateReportRequest {
  name?: string;
  description?: string;
  config?: Record<string, unknown>;
  metrics?: string[];
  filters?: Record<string, unknown>;
  grouping?: string[];
  sorting?: Record<string, unknown>;
  dateRangeType?: string;
  customStartDate?: string;
  customEndDate?: string;
  exportFormat?: 'csv' | 'xlsx' | 'pdf';
  exportConfig?: Record<string, unknown>;
  isScheduled?: boolean;
  scheduleCron?: string;
  scheduleTimezone?: string;
  recipients?: ReportRecipient[];
  isActive?: boolean;
}

export interface ListReportsParams extends PaginationParams {
  reportTypes?: string;
  isActive?: boolean;
  isScheduled?: boolean;
  createdByUserId?: string;
}

export interface RunReportRequest {
  overrideDateRangeType?: string;
  overrideStartDate?: string;
  overrideEndDate?: string;
}

export interface GenerateExportRequest {
  reportType: string;
  exportFormat?: 'csv' | 'xlsx' | 'pdf';
  reportId?: string;
  name?: string;
  dateRangeType?: string;
  customStartDate?: string;
  customEndDate?: string;
  metrics?: string[];
  filters?: Record<string, unknown>;
  grouping?: string[];
}

export interface ListExportsParams extends PaginationParams {
  reportId?: string;
  status?: 'pending' | 'generating' | 'completed' | 'failed' | 'expired';
  format?: 'csv' | 'xlsx' | 'pdf';
  includeExpired?: boolean;
}

export interface RecordEventRequest {
  eventType: string;
  eventCategory: string;
  galleryId?: string;
  assetId?: string;
  clientId?: string;
  shareLinkId?: string;
  invitationId?: string;
  actorType: 'user' | 'client' | 'visitor' | 'system';
  actorId?: string;
  visitorId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
  numericValue?: number;
  durationMs?: number;
  occurredAt?: string;
}

// ---------------------------------------------------------------------------
// Response Types
// ---------------------------------------------------------------------------

export interface ReportRecipient {
  email: string;
  name?: string;
  recipientType: 'email' | 'user' | 'client';
  userId?: string;
  clientId?: string;
}

export interface OverviewMetrics {
  totalGalleries: number;
  totalAssets: number;
  storageUsedBytes: number;
  storageUsedFormatted: string;
  totalClients: number;
  activeClients: number;
  totalViews: number;
  totalDownloads: number;
}

export interface QuickStats {
  views: number;
  uniqueVisitors: number;
  downloads: number;
  newClients: number;
  newGalleries: number;
}

export interface TrendMetrics {
  viewsChange: number;
  visitorsChange: number;
  downloadsChange: number;
  clientsChange: number;
}

export interface DeviceBreakdown {
  desktop: number;
  desktopPercentage: number;
  mobile: number;
  mobilePercentage: number;
  tablet: number;
  tabletPercentage: number;
}

export interface GeographicEntry {
  countryCode: string;
  countryName?: string;
  count: number;
  percentage: number;
}

export interface TopGalleryEntry {
  galleryId: string;
  galleryName?: string;
  totalViews: number;
  uniqueVisitors: number;
  totalDownloads: number;
  engagementScore?: number;
  trendPercentage?: number;
}

export interface DailyViewsEntry {
  date: string;
  views: number;
  uniqueVisitors: number;
}

export interface DashboardMetricsResponse {
  overview: OverviewMetrics;
  quickStats: QuickStats;
  trends: TrendMetrics;
  deviceBreakdown: DeviceBreakdown;
  geographicBreakdown: GeographicEntry[];
  topGalleries: TopGalleryEntry[];
  dailyViews: DailyViewsEntry[];
  period: Record<string, unknown>;
  generatedAt: string;
}

export interface WorkspaceOverviewResponse {
  totalGalleries: number;
  totalAssets: number;
  storageUsedBytes: number;
  storageUsedFormatted: string;
  totalClients: number;
  activeClients: number;
  totalViews: number;
  totalDownloads: number;
  generatedAt: string;
}

export interface QuickStatsResponse {
  period: string;
  periodLabel: string;
  quickStats: QuickStats;
  trends: TrendMetrics;
  generatedAt: string;
}

export interface ActivityEvent {
  eventId: string;
  eventType: string;
  eventCategory: string;
  galleryId?: string;
  galleryName?: string;
  assetId?: string;
  assetName?: string;
  clientId?: string;
  clientName?: string;
  actorType: string;
  deviceType?: string;
  countryCode?: string;
  occurredAt?: string;
  description?: string;
}

export interface ActivityFeedResponse {
  events: ActivityEvent[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface TopGalleriesResponse {
  galleries: TopGalleryEntry[];
  period: string;
  periodLabel: string;
  generatedAt: string;
}

export interface EngagementMetric {
  count: number;
  percentage: number;
}

export interface GalleryEngagementBreakdown {
  favorites: EngagementMetric;
  comments: EngagementMetric;
  selections: EngagementMetric;
  downloads: EngagementMetric;
  shares: EngagementMetric;
  totalEngagement: number;
  engagementRate: number;
}

export interface SourceBreakdown {
  direct: EngagementMetric;
  shareLink: EngagementMetric;
  referral: EngagementMetric;
}

export interface ShareLinkStats {
  shareLinksCreated: number;
  shareLinkAccesses: number;
  shareLinkConversions: number;
  conversionRate: number;
}

export interface ReferrerEntry {
  referrer: string;
  count: number;
}

export interface GalleryInfo {
  galleryId: string;
  name?: string;
  clientName?: string;
  eventDate?: string;
  status?: string;
  createdAt?: string;
  assetCount: number;
}

export interface GallerySummaryMetrics {
  totalViews: number;
  uniqueVisitors: number;
  totalSessions: number;
  totalDownloads: number;
  totalFavorites: number;
  totalComments: number;
  totalSelections: number;
  totalShares: number;
  avgSessionDurationMs: number;
  uniqueClients: number;
  uniqueAssetsViewed: number;
  assetViews: number;
}

export interface GalleryTrendMetrics {
  viewsChange?: number;
  visitorsChange?: number;
  downloadsChange?: number;
}

export interface GalleryAnalyticsDetailsResponse {
  gallery: GalleryInfo;
  summary: GallerySummaryMetrics;
  trends: GalleryTrendMetrics;
  engagement: GalleryEngagementBreakdown;
  deviceBreakdown: DeviceBreakdown;
  geographicBreakdown: GeographicEntry[];
  sourceBreakdown: SourceBreakdown;
  shareLinkStats: ShareLinkStats;
  topReferrers: ReferrerEntry[];
  dailyViews: DailyViewsEntry[];
  period: Record<string, unknown>;
  generatedAt: string;
}

export interface GalleryAnalyticsSummaryResponse {
  galleryId: string;
  periodType: string;
  totalViews: number;
  uniqueVisitors: number;
  totalDownloads: number;
  engagementScore?: number;
  calculatedAt?: string;
}

export interface GalleryViewsTimeSeriesResponse {
  galleryId: string;
  granularity: string;
  dataPoints: DailyViewsEntry[];
  summary: {
    totalViews: number;
    totalUniqueVisitors: number;
    avgDailyViews: number;
    peakDate?: string;
    peakViews: number;
  };
  period: Record<string, unknown>;
  generatedAt: string;
}

export interface GalleryHistoryEntry {
  periodStart: string;
  periodEnd: string;
  periodType: string;
  totalViews: number;
  uniqueVisitors: number;
  totalDownloads: number;
  engagementScore?: number;
  calculatedAt?: string;
}

export interface GalleryAnalyticsHistoryResponse {
  galleryId: string;
  periodType: string;
  history: GalleryHistoryEntry[];
  generatedAt: string;
}

export interface GalleryComparisonEntry {
  galleryId: string;
  galleryName?: string;
  totalViews: number;
  uniqueVisitors: number;
  totalDownloads: number;
  totalFavorites: number;
  totalComments: number;
  engagementScore?: number;
  avgSessionDurationMs: number;
}

export interface GalleriesComparisonResponse {
  galleries: GalleryComparisonEntry[];
  period: Record<string, unknown>;
  generatedAt: string;
}

export interface ClientInfo {
  clientId: string;
  name?: string;
  email?: string;
  status?: string;
  createdAt?: string;
}

export interface ClientAnalyticsMetrics {
  totalGalleryViews: number;
  uniqueGalleriesViewed: number;
  totalAssetViews: number;
  totalFavorites: number;
  totalComments: number;
  totalSelections: number;
  totalDownloads: number;
  totalSessions: number;
  avgSessionDurationMs: number;
  engagementScore?: number;
  churnRiskScore?: number;
  lifetimeValueCents: number;
  daysSinceLastActivity?: number;
}

export interface ClientEngagementBreakdown {
  galleryViews: number;
  assetViews: number;
  favorites: number;
  comments: number;
  selections: number;
  downloads: number;
  shares: number;
  totalEngagementActions: number;
  calculatedEngagementScore?: number;
  engagementTier?: string;
}

export interface ClientAnalyticsDetailsResponse {
  clientId: string;
  client?: ClientInfo;
  analytics: ClientAnalyticsMetrics;
  engagementBreakdown: ClientEngagementBreakdown;
  engagementTier: string;
  churnRiskLevel?: string;
  periodType: string;
  history?: ClientHistoryEntry[];
  galleryInteractions?: ClientGalleryInteraction[];
  generatedAt: string;
}

export interface ClientHistoryEntry {
  periodStart: string;
  periodEnd: string;
  periodType: string;
  totalGalleryViews: number;
  totalDownloads: number;
  engagementScore?: number;
  calculatedAt?: string;
}

export interface ClientGalleryInteraction {
  galleryId: string;
  galleryName?: string;
  totalViews: number;
  totalDownloads: number;
  totalFavorites: number;
  lastViewedAt?: string;
  engagementScore: number;
}

export interface ClientAnalyticsSummaryResponse {
  clientId: string;
  periodType: string;
  engagementScore?: number;
  churnRiskScore?: number;
  totalGalleryViews: number;
  totalDownloads: number;
  totalFavorites: number;
  lifetimeValueCents: number;
  engagementTier: string;
  calculatedAt?: string;
}

export interface ClientActivityDataPoint {
  date: string;
  galleryViews: number;
  assetViews: number;
  downloads: number;
  favorites: number;
  engagementActions: number;
}

export interface ClientActivityTimeSeriesResponse {
  clientId: string;
  granularity: string;
  dataPoints: ClientActivityDataPoint[];
  summary: {
    totalGalleryViews: number;
    totalDownloads: number;
    totalFavorites: number;
    avgDailyActions: number;
    mostActiveDate?: string;
  };
  period: Record<string, unknown>;
  generatedAt: string;
}

export interface TopClientEntry {
  clientId: string;
  clientName?: string;
  email?: string;
  engagementScore?: number;
  churnRiskScore?: number;
  totalGalleryViews: number;
  totalDownloads: number;
  totalFavorites: number;
  lifetimeValueCents: number;
  lastActivityAt?: string;
}

export interface TopClientsResponse {
  clients: TopClientEntry[];
  periodType: string;
  generatedAt: string;
}

export interface ChurnRiskEntry {
  clientId: string;
  clientName?: string;
  email?: string;
  churnRiskScore: number;
  daysSinceLastActivity?: number;
  lastActivityAt?: string;
  engagementScore?: number;
  riskFactors: string[];
}

export interface ChurnRiskResponse {
  clients: ChurnRiskEntry[];
  summary: {
    totalAtRisk: number;
    highRisk: number;
    mediumRisk: number;
    lowRisk: number;
    avgDaysSinceActivity?: number;
  };
  generatedAt: string;
}

export interface WorkspaceClientStatsResponse {
  totalClients: number;
  activeClients: number;
  newClientsLast30Days: number;
  engagementBreakdown: Record<string, number>;
  churnRiskBreakdown: Record<string, number>;
  avgEngagementScore?: number;
  avgLifetimeValueCents: number;
  workspaceHealthScore: number;
  segments: Record<string, unknown>;
  periodType: string;
  generatedAt: string;
}

export interface ClientComparisonEntry {
  clientId: string;
  clientName?: string;
  email?: string;
  engagementScore?: number;
  churnRiskScore?: number;
  totalGalleryViews: number;
  totalDownloads: number;
  totalFavorites: number;
  lifetimeValueCents: number;
  totalSessions: number;
}

export interface ClientsComparisonResponse {
  clients: ClientComparisonEntry[];
  periodType: string;
  generatedAt: string;
}

export interface ClientGalleryInteractionsResponse {
  clientId: string;
  galleries: ClientGalleryInteraction[];
  totalGalleries: number;
  summary: Record<string, unknown>;
  generatedAt: string;
}

export interface ReportSummary {
  reportId: string;
  name: string;
  description?: string;
  reportType: string;
  dateRangeType: string;
  exportFormat: string;
  isScheduled: boolean;
  isActive: boolean;
  runCount: number;
  lastRunAt?: string;
  lastRunStatus?: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReportDetails {
  reportId: string;
  workspaceId: string;
  name: string;
  description?: string;
  reportType: string;
  config: Record<string, unknown>;
  metrics: string[];
  filters: Record<string, unknown>;
  grouping: string[];
  sorting: Record<string, unknown>;
  dateRangeType: string;
  customStartDate?: string;
  customEndDate?: string;
  exportFormat: string;
  exportConfig: Record<string, unknown>;
  isScheduled: boolean;
  scheduleCron?: string;
  scheduleTimezone: string;
  nextRunAt?: string;
  lastRunAt?: string;
  recipients: ReportRecipient[];
  isActive: boolean;
  isSystem: boolean;
  runCount: number;
  lastRunStatus?: string;
  lastRunError?: string;
  createdByUserId: string;
  updatedByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReportsListResponse {
  reports: ReportSummary[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface ReportRunResponse {
  reportId: string;
  reportName: string;
  reportType: string;
  dateRange: Record<string, unknown>;
  data: Record<string, unknown>;
  generatedAt: string;
}

export interface ExportSummary {
  exportId: string;
  name: string;
  format: string;
  status: string;
  fileSizeBytes?: number;
  reportId?: string;
  reportName?: string;
  generatedByUserId?: string;
  downloadCount: number;
  createdAt: string;
  expiresAt?: string;
}

export interface ExportDetails {
  exportId: string;
  workspaceId: string;
  reportId?: string;
  name: string;
  format: string;
  reportType: string;
  dateRangeType: string;
  startDate: string;
  endDate: string;
  metrics?: string[];
  filters?: Record<string, unknown>;
  storageKey?: string;
  fileSizeBytes?: number;
  fileHash?: string;
  status: string;
  errorMessage?: string;
  downloadCount: number;
  lastDownloadedAt?: string;
  expiresAt?: string;
  generatedByUserId?: string;
  generationTimeMs?: number;
  createdAt: string;
  completedAt?: string;
}

export interface ExportsListResponse {
  exports: ExportSummary[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface ExportDownloadResponse {
  exportId: string;
  name: string;
  format: string;
  storageKey?: string;
  fileSizeBytes?: number;
  fileHash?: string;
  contentType: string;
  downloadCount: number;
}

export interface RecordEventResponse {
  eventId: string;
  status: string;
  recordedAt: string;
}

// ---------------------------------------------------------------------------
// Analytics Service Class
// ---------------------------------------------------------------------------

export class AnalyticsService {
  private getBaseUrl(workspaceId: string): string {
    return `/api/v1/workspaces/${workspaceId}/analytics`;
  }

  // ---------------------------------------------------------------------------
  // Dashboard Endpoints
  // ---------------------------------------------------------------------------

  /**
   * Get comprehensive dashboard metrics
   */
  async getDashboardMetrics(
    workspaceId: string,
    params: DateRangeParams = {}
  ): Promise<DashboardMetricsResponse> {
    const query = buildQueryString({
      start_date: params.startDate,
      end_date: params.endDate,
    });
    const response = await apiClient.get<DashboardMetricsResponse>(
      `${this.getBaseUrl(workspaceId)}/metrics${query}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch dashboard metrics');
    }

    return response.data!;
  }

  /**
   * Get workspace overview (totals without date filtering)
   */
  async getWorkspaceOverview(workspaceId: string): Promise<WorkspaceOverviewResponse> {
    const response = await apiClient.get<WorkspaceOverviewResponse>(
      `${this.getBaseUrl(workspaceId)}/overview`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch workspace overview');
    }

    return response.data!;
  }

  /**
   * Get quick stats for a predefined period
   */
  async getQuickStats(
    workspaceId: string,
    params: QuickStatsParams = {}
  ): Promise<QuickStatsResponse> {
    const query = buildQueryString({ period: params.period || '30d' });
    const response = await apiClient.get<QuickStatsResponse>(
      `${this.getBaseUrl(workspaceId)}/quick-stats${query}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch quick stats');
    }

    return response.data!;
  }

  /**
   * Get activity feed
   */
  async getActivityFeed(
    workspaceId: string,
    params: ActivityFeedParams = {}
  ): Promise<ActivityFeedResponse> {
    const query = buildQueryString({
      event_types: params.eventTypes?.join(','),
      gallery_id: params.galleryId,
      client_id: params.clientId,
      limit: params.limit,
      offset: params.offset,
    });
    const response = await apiClient.get<ActivityFeedResponse>(
      `${this.getBaseUrl(workspaceId)}/activity${query}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch activity feed');
    }

    return response.data!;
  }

  /**
   * Get top galleries
   */
  async getTopGalleries(
    workspaceId: string,
    params: QuickStatsParams & PaginationParams = {}
  ): Promise<TopGalleriesResponse> {
    const query = buildQueryString({
      period: params.period || '30d',
      limit: params.limit,
      offset: params.offset,
    });
    const response = await apiClient.get<TopGalleriesResponse>(
      `${this.getBaseUrl(workspaceId)}/top-galleries${query}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch top galleries');
    }

    return response.data!;
  }

  // ---------------------------------------------------------------------------
  // Gallery Analytics Endpoints
  // ---------------------------------------------------------------------------

  /**
   * Get comprehensive analytics for a specific gallery
   */
  async getGalleryAnalyticsDetails(
    workspaceId: string,
    galleryId: string,
    params: DateRangeParams = {}
  ): Promise<GalleryAnalyticsDetailsResponse> {
    const query = buildQueryString({
      start_date: params.startDate,
      end_date: params.endDate,
    });
    const response = await apiClient.get<GalleryAnalyticsDetailsResponse>(
      `${this.getBaseUrl(workspaceId)}/galleries/${galleryId}${query}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch gallery analytics');
    }

    return response.data!;
  }

  /**
   * Get simple analytics summary for a gallery
   */
  async getGalleryAnalyticsSummary(
    workspaceId: string,
    galleryId: string,
    params: PeriodParams = {}
  ): Promise<GalleryAnalyticsSummaryResponse> {
    const query = buildQueryString({
      period_type: params.periodType || 'all_time',
    });
    const response = await apiClient.get<GalleryAnalyticsSummaryResponse>(
      `${this.getBaseUrl(workspaceId)}/galleries/${galleryId}/summary${query}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch gallery analytics summary');
    }

    return response.data!;
  }

  /**
   * Get gallery views time series
   */
  async getGalleryViewsTimeSeries(
    workspaceId: string,
    galleryId: string,
    params: GalleryViewsTimeSeriesParams = {}
  ): Promise<GalleryViewsTimeSeriesResponse> {
    const query = buildQueryString({
      start_date: params.startDate,
      end_date: params.endDate,
      granularity: params.granularity || 'daily',
    });
    const response = await apiClient.get<GalleryViewsTimeSeriesResponse>(
      `${this.getBaseUrl(workspaceId)}/galleries/${galleryId}/views-time-series${query}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch gallery views time series');
    }

    return response.data!;
  }

  /**
   * Get gallery engagement breakdown
   */
  async getGalleryEngagementBreakdown(
    workspaceId: string,
    galleryId: string,
    params: DateRangeParams = {}
  ): Promise<GalleryEngagementBreakdown> {
    const query = buildQueryString({
      start_date: params.startDate,
      end_date: params.endDate,
    });
    const response = await apiClient.get<GalleryEngagementBreakdown>(
      `${this.getBaseUrl(workspaceId)}/galleries/${galleryId}/engagement${query}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch gallery engagement breakdown');
    }

    return response.data!;
  }

  /**
   * Get gallery analytics history
   */
  async getGalleryAnalyticsHistory(
    workspaceId: string,
    galleryId: string,
    params: GalleryAnalyticsHistoryParams = {}
  ): Promise<GalleryAnalyticsHistoryResponse> {
    const query = buildQueryString({
      period_type: params.periodType || 'daily',
      start_date: params.startDate,
      end_date: params.endDate,
      limit: params.limit,
    });
    const response = await apiClient.get<GalleryAnalyticsHistoryResponse>(
      `${this.getBaseUrl(workspaceId)}/galleries/${galleryId}/history${query}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch gallery analytics history');
    }

    return response.data!;
  }

  /**
   * Trigger analytics calculation for a gallery
   */
  async calculateGalleryAnalytics(
    workspaceId: string,
    galleryId: string,
    params: CalculateGalleryAnalyticsParams = {}
  ): Promise<{ status: string; galleryId: string; periodType: string; analytics: unknown; calculatedAt: string }> {
    const query = buildQueryString({
      period_type: params.periodType || 'all_time',
      force: params.force,
    });
    const response = await apiClient.post<{
      status: string;
      gallery_id: string;
      period_type: string;
      analytics: unknown;
      calculated_at: string;
    }>(`${this.getBaseUrl(workspaceId)}/galleries/${galleryId}/calculate${query}`);

    if (response.error) {
      throw new Error(response.error.message || 'Failed to calculate gallery analytics');
    }

    return {
      status: response.data!.status,
      galleryId: response.data!.gallery_id,
      periodType: response.data!.period_type,
      analytics: response.data!.analytics,
      calculatedAt: response.data!.calculated_at,
    };
  }

  /**
   * Compare analytics across multiple galleries
   */
  async compareGalleries(
    workspaceId: string,
    params: CompareGalleriesParams
  ): Promise<GalleriesComparisonResponse> {
    const query = buildQueryString({
      gallery_ids: params.galleryIds.join(','),
      start_date: params.startDate,
      end_date: params.endDate,
    });
    const response = await apiClient.post<GalleriesComparisonResponse>(
      `${this.getBaseUrl(workspaceId)}/galleries/compare${query}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to compare galleries');
    }

    return response.data!;
  }

  // ---------------------------------------------------------------------------
  // Client Analytics Endpoints
  // ---------------------------------------------------------------------------

  /**
   * Get comprehensive analytics for a specific client
   */
  async getClientAnalyticsDetails(
    workspaceId: string,
    clientId: string,
    params: ClientAnalyticsDetailsParams = {}
  ): Promise<ClientAnalyticsDetailsResponse> {
    const query = buildQueryString({
      period_type: params.periodType || 'all_time',
      include_history: params.includeHistory,
      include_galleries: params.includeGalleries,
      history_limit: params.historyLimit,
    });
    const response = await apiClient.get<ClientAnalyticsDetailsResponse>(
      `${this.getBaseUrl(workspaceId)}/clients/${clientId}${query}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch client analytics');
    }

    return response.data!;
  }

  /**
   * Get simple analytics summary for a client
   */
  async getClientAnalyticsSummary(
    workspaceId: string,
    clientId: string,
    params: PeriodParams = {}
  ): Promise<ClientAnalyticsSummaryResponse> {
    const query = buildQueryString({
      period_type: params.periodType || 'all_time',
    });
    const response = await apiClient.get<ClientAnalyticsSummaryResponse>(
      `${this.getBaseUrl(workspaceId)}/clients/${clientId}/summary${query}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch client analytics summary');
    }

    return response.data!;
  }

  /**
   * Get client activity time series
   */
  async getClientActivityTimeSeries(
    workspaceId: string,
    clientId: string,
    params: ClientActivityTimeSeriesParams = {}
  ): Promise<ClientActivityTimeSeriesResponse> {
    const query = buildQueryString({
      start_date: params.startDate,
      end_date: params.endDate,
      granularity: params.granularity || 'daily',
    });
    const response = await apiClient.get<ClientActivityTimeSeriesResponse>(
      `${this.getBaseUrl(workspaceId)}/clients/${clientId}/activity-time-series${query}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch client activity time series');
    }

    return response.data!;
  }

  /**
   * Get client gallery interactions
   */
  async getClientGalleryInteractions(
    workspaceId: string,
    clientId: string,
    params: PaginationParams = {}
  ): Promise<ClientGalleryInteractionsResponse> {
    const query = buildQueryString({
      limit: params.limit,
      offset: params.offset,
    });
    const response = await apiClient.get<ClientGalleryInteractionsResponse>(
      `${this.getBaseUrl(workspaceId)}/clients/${clientId}/galleries${query}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch client gallery interactions');
    }

    return response.data!;
  }

  /**
   * Get top clients
   */
  async getTopClients(
    workspaceId: string,
    params: TopClientsParams = {}
  ): Promise<TopClientsResponse> {
    const query = buildQueryString({
      period_type: params.periodType || 'all_time',
      sort_by: params.sortBy || 'engagement',
      limit: params.limit,
      offset: params.offset,
    });
    const response = await apiClient.get<TopClientsResponse>(
      `${this.getBaseUrl(workspaceId)}/top-clients${query}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch top clients');
    }

    return response.data!;
  }

  /**
   * Get clients at churn risk
   */
  async getChurnRiskClients(
    workspaceId: string,
    params: ChurnRiskParams = {}
  ): Promise<ChurnRiskResponse> {
    const query = buildQueryString({
      min_risk_score: params.minRiskScore,
      limit: params.limit,
      offset: params.offset,
    });
    const response = await apiClient.get<ChurnRiskResponse>(
      `${this.getBaseUrl(workspaceId)}/churn-risk${query}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch churn risk clients');
    }

    return response.data!;
  }

  /**
   * Get workspace client statistics
   */
  async getWorkspaceClientStats(
    workspaceId: string,
    params: PeriodParams = {}
  ): Promise<WorkspaceClientStatsResponse> {
    const query = buildQueryString({
      period_type: params.periodType || 'all_time',
    });
    const response = await apiClient.get<WorkspaceClientStatsResponse>(
      `${this.getBaseUrl(workspaceId)}/clients/stats${query}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch workspace client stats');
    }

    return response.data!;
  }

  /**
   * Compare analytics across multiple clients
   */
  async compareClients(
    workspaceId: string,
    params: CompareClientsParams
  ): Promise<ClientsComparisonResponse> {
    const query = buildQueryString({
      client_ids: params.clientIds.join(','),
      period_type: params.periodType || 'all_time',
    });
    const response = await apiClient.post<ClientsComparisonResponse>(
      `${this.getBaseUrl(workspaceId)}/clients/compare${query}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to compare clients');
    }

    return response.data!;
  }

  /**
   * Trigger analytics calculation for a client
   */
  async calculateClientAnalytics(
    workspaceId: string,
    clientId: string,
    params: { periodType?: string; force?: boolean } = {}
  ): Promise<{ status: string; clientId: string; periodType: string; analytics: unknown; calculatedAt: string }> {
    const query = buildQueryString({
      period_type: params.periodType || 'all_time',
      force: params.force,
    });
    const response = await apiClient.post<{
      status: string;
      client_id: string;
      period_type: string;
      analytics: unknown;
      calculated_at: string;
    }>(`${this.getBaseUrl(workspaceId)}/clients/${clientId}/calculate${query}`);

    if (response.error) {
      throw new Error(response.error.message || 'Failed to calculate client analytics');
    }

    return {
      status: response.data!.status,
      clientId: response.data!.client_id,
      periodType: response.data!.period_type,
      analytics: response.data!.analytics,
      calculatedAt: response.data!.calculated_at,
    };
  }

  // ---------------------------------------------------------------------------
  // Reports CRUD Endpoints
  // ---------------------------------------------------------------------------

  /**
   * Create a new custom report
   */
  async createReport(
    workspaceId: string,
    data: CreateReportRequest
  ): Promise<ReportDetails> {
    const response = await apiClient.post<ReportDetails>(
      `${this.getBaseUrl(workspaceId)}/reports`,
      {
        name: data.name,
        report_type: data.reportType,
        description: data.description,
        config: data.config,
        metrics: data.metrics,
        filters: data.filters,
        grouping: data.grouping,
        sorting: data.sorting,
        date_range_type: data.dateRangeType,
        custom_start_date: data.customStartDate,
        custom_end_date: data.customEndDate,
        export_format: data.exportFormat,
        export_config: data.exportConfig,
        is_scheduled: data.isScheduled,
        schedule_cron: data.scheduleCron,
        schedule_timezone: data.scheduleTimezone,
        recipients: data.recipients,
      }
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to create report');
    }

    return response.data!;
  }

  /**
   * List custom reports
   */
  async listReports(
    workspaceId: string,
    params: ListReportsParams = {}
  ): Promise<ReportsListResponse> {
    const query = buildQueryString({
      report_types: params.reportTypes,
      is_active: params.isActive,
      is_scheduled: params.isScheduled,
      created_by_user_id: params.createdByUserId,
      limit: params.limit,
      offset: params.offset,
    });
    const response = await apiClient.get<ReportsListResponse>(
      `${this.getBaseUrl(workspaceId)}/reports${query}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to list reports');
    }

    return response.data!;
  }

  /**
   * Get report details
   */
  async getReport(workspaceId: string, reportId: string): Promise<ReportDetails> {
    const response = await apiClient.get<ReportDetails>(
      `${this.getBaseUrl(workspaceId)}/reports/${reportId}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch report');
    }

    return response.data!;
  }

  /**
   * Update a report
   */
  async updateReport(
    workspaceId: string,
    reportId: string,
    data: UpdateReportRequest
  ): Promise<ReportDetails> {
    const response = await apiClient.put<ReportDetails>(
      `${this.getBaseUrl(workspaceId)}/reports/${reportId}`,
      {
        name: data.name,
        description: data.description,
        config: data.config,
        metrics: data.metrics,
        filters: data.filters,
        grouping: data.grouping,
        sorting: data.sorting,
        date_range_type: data.dateRangeType,
        custom_start_date: data.customStartDate,
        custom_end_date: data.customEndDate,
        export_format: data.exportFormat,
        export_config: data.exportConfig,
        is_scheduled: data.isScheduled,
        schedule_cron: data.scheduleCron,
        schedule_timezone: data.scheduleTimezone,
        recipients: data.recipients,
        is_active: data.isActive,
      }
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to update report');
    }

    return response.data!;
  }

  /**
   * Delete a report
   */
  async deleteReport(workspaceId: string, reportId: string): Promise<void> {
    const response = await apiClient.delete(
      `${this.getBaseUrl(workspaceId)}/reports/${reportId}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to delete report');
    }
  }

  /**
   * Run a report
   */
  async runReport(
    workspaceId: string,
    reportId: string,
    data?: RunReportRequest
  ): Promise<ReportRunResponse> {
    const response = await apiClient.post<ReportRunResponse>(
      `${this.getBaseUrl(workspaceId)}/reports/${reportId}/run`,
      data
        ? {
            override_date_range_type: data.overrideDateRangeType,
            override_start_date: data.overrideStartDate,
            override_end_date: data.overrideEndDate,
          }
        : undefined
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to run report');
    }

    return response.data!;
  }

  /**
   * Get exports for a report
   */
  async getReportExports(
    workspaceId: string,
    reportId: string,
    params: { includeExpired?: boolean; limit?: number } = {}
  ): Promise<ExportsListResponse> {
    const query = buildQueryString({
      include_expired: params.includeExpired,
      limit: params.limit,
    });
    const response = await apiClient.get<ExportsListResponse>(
      `${this.getBaseUrl(workspaceId)}/reports/${reportId}/exports${query}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch report exports');
    }

    return response.data!;
  }

  // ---------------------------------------------------------------------------
  // Export Endpoints
  // ---------------------------------------------------------------------------

  /**
   * Generate a new export
   */
  async generateExport(
    workspaceId: string,
    data: GenerateExportRequest
  ): Promise<ExportDetails> {
    const response = await apiClient.post<ExportDetails>(
      `${this.getBaseUrl(workspaceId)}/exports`,
      {
        report_type: data.reportType,
        export_format: data.exportFormat || 'csv',
        report_id: data.reportId,
        name: data.name,
        date_range_type: data.dateRangeType,
        custom_start_date: data.customStartDate,
        custom_end_date: data.customEndDate,
        metrics: data.metrics,
        filters: data.filters,
        grouping: data.grouping,
      }
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to generate export');
    }

    return response.data!;
  }

  /**
   * List exports
   */
  async listExports(
    workspaceId: string,
    params: ListExportsParams = {}
  ): Promise<ExportsListResponse> {
    const query = buildQueryString({
      report_id: params.reportId,
      status: params.status,
      format: params.format,
      include_expired: params.includeExpired,
      limit: params.limit,
      offset: params.offset,
    });
    const response = await apiClient.get<ExportsListResponse>(
      `${this.getBaseUrl(workspaceId)}/exports${query}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to list exports');
    }

    return response.data!;
  }

  /**
   * Get export details
   */
  async getExport(workspaceId: string, exportId: string): Promise<ExportDetails> {
    const response = await apiClient.get<ExportDetails>(
      `${this.getBaseUrl(workspaceId)}/exports/${exportId}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch export');
    }

    return response.data!;
  }

  /**
   * Get export download information
   */
  async downloadExport(workspaceId: string, exportId: string): Promise<ExportDownloadResponse> {
    const response = await apiClient.get<ExportDownloadResponse>(
      `${this.getBaseUrl(workspaceId)}/exports/${exportId}/download`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to get export download');
    }

    return response.data!;
  }

  /**
   * Delete an export
   */
  async deleteExport(workspaceId: string, exportId: string): Promise<void> {
    const response = await apiClient.delete(
      `${this.getBaseUrl(workspaceId)}/exports/${exportId}`
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to delete export');
    }
  }

  // ---------------------------------------------------------------------------
  // Event Recording
  // ---------------------------------------------------------------------------

  /**
   * Record an analytics event
   */
  async recordEvent(
    workspaceId: string,
    data: RecordEventRequest
  ): Promise<RecordEventResponse> {
    const response = await apiClient.post<RecordEventResponse>(
      `${this.getBaseUrl(workspaceId)}/events`,
      {
        event_type: data.eventType,
        event_category: data.eventCategory,
        gallery_id: data.galleryId,
        asset_id: data.assetId,
        client_id: data.clientId,
        share_link_id: data.shareLinkId,
        invitation_id: data.invitationId,
        actor_type: data.actorType,
        actor_id: data.actorId,
        visitor_id: data.visitorId,
        session_id: data.sessionId,
        metadata: data.metadata,
        numeric_value: data.numericValue,
        duration_ms: data.durationMs,
        occurred_at: data.occurredAt,
      }
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to record event');
    }

    return response.data!;
  }

  /**
   * Record multiple analytics events in batch
   */
  async recordEventsBatch(
    workspaceId: string,
    events: RecordEventRequest[]
  ): Promise<{ recorded: number; failed: number; errors?: string[] }> {
    const response = await apiClient.post<{ recorded: number; failed: number; errors?: string[] }>(
      `${this.getBaseUrl(workspaceId)}/events/batch`,
      {
        events: events.map((event) => ({
          event_type: event.eventType,
          event_category: event.eventCategory,
          gallery_id: event.galleryId,
          asset_id: event.assetId,
          client_id: event.clientId,
          share_link_id: event.shareLinkId,
          invitation_id: event.invitationId,
          actor_type: event.actorType,
          actor_id: event.actorId,
          visitor_id: event.visitorId,
          session_id: event.sessionId,
          metadata: event.metadata,
          numeric_value: event.numericValue,
          duration_ms: event.durationMs,
          occurred_at: event.occurredAt,
        })),
      }
    );

    if (response.error) {
      throw new Error(response.error.message || 'Failed to record events batch');
    }

    return response.data!;
  }
}

// Export singleton instance
export const analyticsService = new AnalyticsService();
export default analyticsService;
