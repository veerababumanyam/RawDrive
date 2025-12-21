/**
 * Profile Analytics Service
 *
 * Service for tracking and analyzing profile view metrics,
 * including geographic data, referrer sources, and engagement.
 *
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.7, 14.8
 */

import apiClient, { type ApiResponse } from '@/services/api';
import type {
  ProfileAnalytics,
  ProfileAnalyticsEvent,
  AnalyticsEventType,
} from '@/types/profileEditor';

// =============================================================================
// Types
// =============================================================================

export type TimeRange = '24h' | '7d' | '30d' | '90d' | '1y' | 'all';
export type AggregationType = 'hour' | 'day' | 'week' | 'month';

export interface AnalyticsQuery {
  time_range?: TimeRange;
  start_date?: string;
  end_date?: string;
  event_types?: AnalyticsEventType[];
  aggregation?: AggregationType;
}

export interface ViewsByTimeData {
  timestamp: string;
  views: number;
  unique_visitors: number;
}

export interface GeographicData {
  country: string;
  country_code: string;
  region?: string;
  views: number;
  percentage: number;
}

export interface ReferrerData {
  source: string;
  url?: string;
  views: number;
  percentage: number;
}

export interface LinkClickData {
  label: string;
  url: string;
  clicks: number;
  ctr: number; // Click-through rate
}

export interface EngagementMetrics {
  avg_session_duration_seconds: number;
  bounce_rate: number;
  pages_per_session: number;
  return_visitor_rate: number;
}

export interface ThemeAnalytics {
  theme_id: string;
  theme_name: string;
  usage_count: number;
  avg_session_duration: number;
  conversion_rate: number;
}

export interface PrivacySettings {
  analytics_enabled: boolean;
  ip_anonymization: boolean;
  data_retention_days: number;
  cookie_consent_required: boolean;
}

export interface RealTimeData {
  active_visitors: number;
  last_updated: string;
  recent_events: ProfileAnalyticsEvent[];
}

type AnalyticsChangeListener = (analytics: ProfileAnalytics) => void;

// =============================================================================
// Profile Analytics Service Class
// =============================================================================

class ProfileAnalyticsService {
  private static instance: ProfileAnalyticsService;

  private workspaceId: string | null = null;
  private profileId: string | null = null;
  private cachedAnalytics: ProfileAnalytics | null = null;
  private listeners: Set<AnalyticsChangeListener> = new Set();
  private realTimeInterval: ReturnType<typeof setInterval> | null = null;

  private constructor() {}

  public static getInstance(): ProfileAnalyticsService {
    if (!ProfileAnalyticsService.instance) {
      ProfileAnalyticsService.instance = new ProfileAnalyticsService();
    }
    return ProfileAnalyticsService.instance;
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  /**
   * Initialize service with workspace and profile context
   */
  initialize(workspaceId: string, profileId: string): void {
    this.workspaceId = workspaceId;
    this.profileId = profileId;
  }

  // ===========================================================================
  // Analytics Retrieval
  // ===========================================================================

  /**
   * Get profile analytics summary
   * Requirement 14.1: Analytics view tracking
   */
  async getAnalytics(query: AnalyticsQuery = {}): Promise<ProfileAnalytics | null> {
    if (!this.workspaceId || !this.profileId) {
      throw new Error('Service not initialized');
    }

    const params = new URLSearchParams();

    if (query.time_range) {
      params.set('time_range', query.time_range);
    }
    if (query.start_date) {
      params.set('start_date', query.start_date);
    }
    if (query.end_date) {
      params.set('end_date', query.end_date);
    }
    if (query.event_types?.length) {
      params.set('event_types', query.event_types.join(','));
    }
    if (query.aggregation) {
      params.set('aggregation', query.aggregation);
    }

    const queryString = params.toString();
    const url = `/v1/workspaces/${this.workspaceId}/profile-editor/${this.profileId}/analytics${queryString ? `?${queryString}` : ''}`;

    const response = await apiClient.get<ProfileAnalytics>(url);

    if (response.data) {
      this.cachedAnalytics = response.data;
      this.notifyListeners();
      return response.data;
    }

    return null;
  }

  /**
   * Get views over time
   * Requirement 14.2: Time-based view aggregation
   */
  async getViewsByTime(query: AnalyticsQuery = {}): Promise<ViewsByTimeData[]> {
    if (!this.workspaceId || !this.profileId) {
      throw new Error('Service not initialized');
    }

    const params = new URLSearchParams();

    if (query.time_range) {
      params.set('time_range', query.time_range);
    }
    if (query.aggregation) {
      params.set('aggregation', query.aggregation);
    }

    const queryString = params.toString();
    const response = await apiClient.get<ViewsByTimeData[]>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/${this.profileId}/analytics/views-by-time${queryString ? `?${queryString}` : ''}`
    );

    return response.data || [];
  }

  /**
   * Get geographic distribution
   * Requirement 14.3: Geographic analytics
   */
  async getGeographicData(query: AnalyticsQuery = {}): Promise<GeographicData[]> {
    if (!this.workspaceId || !this.profileId) {
      throw new Error('Service not initialized');
    }

    const params = new URLSearchParams();

    if (query.time_range) {
      params.set('time_range', query.time_range);
    }

    const queryString = params.toString();
    const response = await apiClient.get<GeographicData[]>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/${this.profileId}/analytics/geographic${queryString ? `?${queryString}` : ''}`
    );

    return response.data || [];
  }

  /**
   * Get referrer data
   * Requirement 14.4: Referrer tracking
   */
  async getReferrerData(query: AnalyticsQuery = {}): Promise<ReferrerData[]> {
    if (!this.workspaceId || !this.profileId) {
      throw new Error('Service not initialized');
    }

    const params = new URLSearchParams();

    if (query.time_range) {
      params.set('time_range', query.time_range);
    }

    const queryString = params.toString();
    const response = await apiClient.get<ReferrerData[]>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/${this.profileId}/analytics/referrers${queryString ? `?${queryString}` : ''}`
    );

    return response.data || [];
  }

  /**
   * Get link click analytics
   */
  async getLinkClicks(query: AnalyticsQuery = {}): Promise<LinkClickData[]> {
    if (!this.workspaceId || !this.profileId) {
      throw new Error('Service not initialized');
    }

    const params = new URLSearchParams();

    if (query.time_range) {
      params.set('time_range', query.time_range);
    }

    const queryString = params.toString();
    const response = await apiClient.get<LinkClickData[]>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/${this.profileId}/analytics/link-clicks${queryString ? `?${queryString}` : ''}`
    );

    return response.data || [];
  }

  /**
   * Get engagement metrics
   */
  async getEngagementMetrics(query: AnalyticsQuery = {}): Promise<EngagementMetrics | null> {
    if (!this.workspaceId || !this.profileId) {
      throw new Error('Service not initialized');
    }

    const params = new URLSearchParams();

    if (query.time_range) {
      params.set('time_range', query.time_range);
    }

    const queryString = params.toString();
    const response = await apiClient.get<EngagementMetrics>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/${this.profileId}/analytics/engagement${queryString ? `?${queryString}` : ''}`
    );

    return response.data || null;
  }

  /**
   * Get theme popularity analytics
   * Requirement 14.9: Theme popularity insights
   */
  async getThemeAnalytics(): Promise<ThemeAnalytics[]> {
    if (!this.workspaceId) {
      throw new Error('Service not initialized');
    }

    const response = await apiClient.get<ThemeAnalytics[]>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/analytics/themes`
    );

    return response.data || [];
  }

  // ===========================================================================
  // Real-Time Analytics
  // ===========================================================================

  /**
   * Get real-time visitor data
   */
  async getRealTimeData(): Promise<RealTimeData | null> {
    if (!this.workspaceId || !this.profileId) {
      throw new Error('Service not initialized');
    }

    const response = await apiClient.get<RealTimeData>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/${this.profileId}/analytics/realtime`
    );

    return response.data || null;
  }

  /**
   * Start real-time monitoring
   */
  startRealTimeMonitoring(
    callback: (data: RealTimeData) => void,
    intervalMs = 30000
  ): () => void {
    if (this.realTimeInterval) {
      clearInterval(this.realTimeInterval);
    }

    const poll = async () => {
      try {
        const data = await this.getRealTimeData();
        if (data) {
          callback(data);
        }
      } catch {
        // Silent fail for real-time polling
      }
    };

    // Initial fetch
    poll();

    // Set up interval
    this.realTimeInterval = setInterval(poll, intervalMs);

    // Return cleanup function
    return () => {
      if (this.realTimeInterval) {
        clearInterval(this.realTimeInterval);
        this.realTimeInterval = null;
      }
    };
  }

  // ===========================================================================
  // Privacy & Compliance
  // ===========================================================================

  /**
   * Get privacy settings
   * Requirement 14.7: Privacy compliance
   */
  async getPrivacySettings(): Promise<PrivacySettings | null> {
    if (!this.workspaceId) {
      throw new Error('Service not initialized');
    }

    const response = await apiClient.get<PrivacySettings>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/analytics/privacy`
    );

    return response.data || null;
  }

  /**
   * Update privacy settings
   */
  async updatePrivacySettings(
    settings: Partial<PrivacySettings>
  ): Promise<ApiResponse<PrivacySettings>> {
    if (!this.workspaceId) {
      throw new Error('Service not initialized');
    }

    return apiClient.patch<PrivacySettings>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/analytics/privacy`,
      settings
    );
  }

  /**
   * Opt out of analytics
   * Requirement 14.8: Analytics opt-out
   */
  async optOut(): Promise<void> {
    if (!this.workspaceId) {
      throw new Error('Service not initialized');
    }

    await apiClient.post(
      `/v1/workspaces/${this.workspaceId}/profile-editor/analytics/opt-out`
    );
  }

  /**
   * Delete analytics data (for GDPR compliance)
   */
  async deleteAnalyticsData(): Promise<void> {
    if (!this.workspaceId || !this.profileId) {
      throw new Error('Service not initialized');
    }

    await apiClient.delete(
      `/v1/workspaces/${this.workspaceId}/profile-editor/${this.profileId}/analytics`
    );

    this.cachedAnalytics = null;
    this.notifyListeners();
  }

  // ===========================================================================
  // Event Tracking (Public Profile)
  // ===========================================================================

  /**
   * Track analytics event
   */
  async trackEvent(
    profileId: string,
    event: {
      event_type: AnalyticsEventType;
      link_url?: string;
      link_label?: string;
      referrer_url?: string;
    }
  ): Promise<void> {
    await apiClient.post(`/v1/public/profiles/${profileId}/analytics`, event);
  }

  /**
   * Track page view
   */
  async trackPageView(
    profileId: string,
    referrerUrl?: string
  ): Promise<void> {
    await this.trackEvent(profileId, {
      event_type: 'view',
      referrer_url: referrerUrl,
    });
  }

  /**
   * Track link click
   */
  async trackLinkClick(
    profileId: string,
    linkUrl: string,
    linkLabel?: string
  ): Promise<void> {
    await this.trackEvent(profileId, {
      event_type: 'link_click',
      link_url: linkUrl,
      link_label: linkLabel,
    });
  }

  /**
   * Track vCard download
   */
  async trackVCardDownload(profileId: string): Promise<void> {
    await this.trackEvent(profileId, {
      event_type: 'vcard_download',
    });
  }

  /**
   * Track QR code scan
   */
  async trackQRScan(profileId: string): Promise<void> {
    await this.trackEvent(profileId, {
      event_type: 'qr_scan',
    });
  }

  // ===========================================================================
  // Export
  // ===========================================================================

  /**
   * Export analytics data to CSV
   */
  async exportToCSV(query: AnalyticsQuery = {}): Promise<Blob> {
    if (!this.workspaceId || !this.profileId) {
      throw new Error('Service not initialized');
    }

    const params = new URLSearchParams();

    if (query.time_range) {
      params.set('time_range', query.time_range);
    }
    if (query.start_date) {
      params.set('start_date', query.start_date);
    }
    if (query.end_date) {
      params.set('end_date', query.end_date);
    }

    const queryString = params.toString();
    const response = await fetch(
      `/api/v1/workspaces/${this.workspaceId}/profile-editor/${this.profileId}/analytics/export?${queryString}`,
      {
        method: 'GET',
        headers: {
          Accept: 'text/csv',
        },
      }
    );

    return response.blob();
  }

  /**
   * Download CSV export
   */
  async downloadCSV(query: AnalyticsQuery = {}, filename?: string): Promise<void> {
    const blob = await this.exportToCSV(query);
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `profile-analytics-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // ===========================================================================
  // Subscription Methods
  // ===========================================================================

  /**
   * Subscribe to analytics changes
   */
  subscribe(listener: AnalyticsChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify listeners of changes
   */
  private notifyListeners(): void {
    if (!this.cachedAnalytics) return;

    this.listeners.forEach((listener) => {
      try {
        listener(this.cachedAnalytics!);
      } catch (error) {
        console.error('Analytics listener error:', error);
      }
    });
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Format number with abbreviation
   */
  formatNumber(num: number): string {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  }

  /**
   * Format percentage
   */
  formatPercentage(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
  }

  /**
   * Format duration
   */
  formatDuration(seconds: number): string {
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  }

  /**
   * Get time range label
   */
  getTimeRangeLabel(range: TimeRange): string {
    const labels: Record<TimeRange, string> = {
      '24h': 'Last 24 hours',
      '7d': 'Last 7 days',
      '30d': 'Last 30 days',
      '90d': 'Last 90 days',
      '1y': 'Last year',
      all: 'All time',
    };
    return labels[range];
  }

  /**
   * Calculate percentage change
   */
  calculateChange(current: number, previous: number): {
    value: number;
    direction: 'up' | 'down' | 'neutral';
  } {
    if (previous === 0) {
      return { value: 0, direction: 'neutral' };
    }
    const change = ((current - previous) / previous) * 100;
    return {
      value: Math.abs(change),
      direction: change > 0 ? 'up' : change < 0 ? 'down' : 'neutral',
    };
  }

  /**
   * Get cached analytics
   */
  getCachedAnalytics(): ProfileAnalytics | null {
    return this.cachedAnalytics;
  }

  /**
   * Reset service state (for testing)
   */
  reset(): void {
    this.cachedAnalytics = null;
    this.listeners.clear();
    if (this.realTimeInterval) {
      clearInterval(this.realTimeInterval);
      this.realTimeInterval = null;
    }
    this.workspaceId = null;
    this.profileId = null;
  }
}

// =============================================================================
// Export Singleton Instance
// =============================================================================

export const profileAnalyticsService = ProfileAnalyticsService.getInstance();

// Export class for testing
export { ProfileAnalyticsService };
