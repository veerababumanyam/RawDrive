/**
 * Analytics Dashboard Component
 *
 * Displays profile analytics including views, geographic data,
 * referrers, link clicks, and engagement metrics.
 *
 * Requirements: 14.1, 14.2, 14.4, 14.6, 14.9
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  Eye,
  Users,
  MousePointerClick,
  Download,
  Globe,
  Link2,
  TrendingUp,
  TrendingDown,
  Palette,
  ChevronDown,
  RefreshCw,
  FileDown,
  Activity,
} from 'lucide-react';

import { AppButton } from '@/components/ui/AppButton';
import {
  profileAnalyticsService,
  type TimeRange,
  type ViewsByTimeData,
  type GeographicData,
  type ReferrerData,
  type LinkClickData,
  type ThemeAnalytics,
  type RealTimeData,
} from '@/services/profileAnalyticsService';
import type { ProfileAnalytics } from '@/types/profileEditor';

// =============================================================================
// Types
// =============================================================================

interface AnalyticsDashboardProps {
  workspaceId: string;
  profileId: string;
  onError?: (error: string) => void;
}

// =============================================================================
// Constants
// =============================================================================

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '1y', label: 'Last year' },
  { value: 'all', label: 'All time' },
];

// =============================================================================
// Stat Card Component
// =============================================================================

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  change?: { value: number; direction: 'up' | 'down' | 'neutral' };
  subtitle?: string;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  change,
  subtitle,
}) => {
  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <div className="flex items-start justify-between mb-2">
        <span className="text-sm text-text-secondary">{title}</span>
        <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
          {icon}
        </div>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-semibold text-text-primary">{value}</span>
        {change && change.direction !== 'neutral' && (
          <span
            className={`flex items-center text-xs font-medium ${
              change.direction === 'up' ? 'text-success' : 'text-error'
            }`}
          >
            {change.direction === 'up' ? (
              <TrendingUp className="w-3 h-3 mr-0.5" />
            ) : (
              <TrendingDown className="w-3 h-3 mr-0.5" />
            )}
            {change.value.toFixed(1)}%
          </span>
        )}
      </div>
      {subtitle && (
        <p className="text-xs text-text-tertiary mt-1">{subtitle}</p>
      )}
    </div>
  );
};

// =============================================================================
// Simple Bar Chart Component
// =============================================================================

interface SimpleBarChartProps {
  data: ViewsByTimeData[];
  height?: number;
}

const SimpleBarChart: React.FC<SimpleBarChartProps> = ({
  data,
  height = 150,
}) => {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-text-tertiary text-sm"
        style={{ height }}
      >
        No data available
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.views), 1);

  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {data.map((item, index) => {
        const barHeight = (item.views / maxValue) * height * 0.9;
        return (
          <div
            key={index}
            className="flex-1 flex flex-col items-center justify-end group"
          >
            {/* Tooltip */}
            <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 bg-text-primary text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
              {item.views} views
            </div>
            {/* Bar */}
            <div
              className="w-full bg-accent rounded-t transition-all duration-300 hover:bg-accent-hover min-h-[4px]"
              style={{ height: Math.max(barHeight, 4) }}
            />
          </div>
        );
      })}
    </div>
  );
};

// =============================================================================
// Geographic List Component
// =============================================================================

interface GeographicListProps {
  data: GeographicData[];
}

const GeographicList: React.FC<GeographicListProps> = ({ data }) => {
  if (data.length === 0) {
    return (
      <p className="text-sm text-text-tertiary text-center py-4">
        No geographic data available
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {data.slice(0, 5).map((item, index) => (
        <div key={index} className="flex items-center gap-3">
          <span className="text-lg">{getCountryFlag(item.country_code)}</span>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-text-primary">{item.country}</span>
              <span className="text-xs text-text-tertiary">
                {item.views} ({item.percentage.toFixed(1)}%)
              </span>
            </div>
            <div className="h-1.5 bg-surface-hover rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-500"
                style={{ width: `${item.percentage}%` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// =============================================================================
// Referrer List Component
// =============================================================================

interface ReferrerListProps {
  data: ReferrerData[];
}

const ReferrerList: React.FC<ReferrerListProps> = ({ data }) => {
  if (data.length === 0) {
    return (
      <p className="text-sm text-text-tertiary text-center py-4">
        No referrer data available
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {data.slice(0, 5).map((item, index) => (
        <div
          key={index}
          className="flex items-center justify-between p-2 rounded-lg hover:bg-surface-hover transition-colors"
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-surface-hover flex items-center justify-center">
              <Globe className="w-3 h-3 text-text-tertiary" />
            </div>
            <span className="text-sm text-text-primary">{item.source}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text-primary">
              {item.views}
            </span>
            <span className="text-xs text-text-tertiary">
              ({item.percentage.toFixed(1)}%)
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

// =============================================================================
// Link Click List Component
// =============================================================================

interface LinkClickListProps {
  data: LinkClickData[];
}

const LinkClickList: React.FC<LinkClickListProps> = ({ data }) => {
  if (data.length === 0) {
    return (
      <p className="text-sm text-text-tertiary text-center py-4">
        No link click data available
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {data.slice(0, 5).map((item, index) => (
        <div
          key={index}
          className="flex items-center justify-between p-2 rounded-lg hover:bg-surface-hover transition-colors"
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Link2 className="w-4 h-4 text-text-tertiary flex-shrink-0" />
            <span className="text-sm text-text-primary truncate">
              {item.label || item.url}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-text-primary">
              {item.clicks} clicks
            </span>
            <span className="text-xs text-text-tertiary">
              {(item.ctr * 100).toFixed(1)}% CTR
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

// =============================================================================
// Theme Analytics List Component
// =============================================================================

interface ThemeAnalyticsListProps {
  data: ThemeAnalytics[];
}

const ThemeAnalyticsList: React.FC<ThemeAnalyticsListProps> = ({ data }) => {
  if (data.length === 0) {
    return (
      <p className="text-sm text-text-tertiary text-center py-4">
        No theme data available
      </p>
    );
  }

  const maxUsage = Math.max(...data.map((d) => d.usage_count), 1);

  return (
    <div className="space-y-3">
      {data.slice(0, 5).map((item, index) => (
        <div key={index} className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-primary">{item.theme_name}</span>
            <span className="text-xs text-text-tertiary">
              {item.usage_count} profiles
            </span>
          </div>
          <div className="h-1.5 bg-surface-hover rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-500"
              style={{ width: `${(item.usage_count / maxUsage) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

// =============================================================================
// Real-Time Indicator Component
// =============================================================================

interface RealTimeIndicatorProps {
  data: RealTimeData | null;
}

const RealTimeIndicator: React.FC<RealTimeIndicatorProps> = ({ data }) => {
  if (!data) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-success/10 border border-success/20 rounded-full">
      <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
      <span className="text-xs font-medium text-success">
        {data.active_visitors} active visitor{data.active_visitors !== 1 ? 's' : ''}
      </span>
    </div>
  );
};

// =============================================================================
// Helper Functions
// =============================================================================

function getCountryFlag(countryCode: string): string {
  // Convert country code to flag emoji
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

// =============================================================================
// Main Component
// =============================================================================

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
  workspaceId,
  profileId,
  onError,
}) => {
  // State
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [analytics, setAnalytics] = useState<ProfileAnalytics | null>(null);
  const [viewsByTime, setViewsByTime] = useState<ViewsByTimeData[]>([]);
  const [geoData, setGeoData] = useState<GeographicData[]>([]);
  const [referrerData, setReferrerData] = useState<ReferrerData[]>([]);
  const [linkClickData, setLinkClickData] = useState<LinkClickData[]>([]);
  const [themeData, setThemeData] = useState<ThemeAnalytics[]>([]);
  const [realTimeData, setRealTimeData] = useState<RealTimeData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [showTimeRangeDropdown, setShowTimeRangeDropdown] = useState(false);

  // Initialize service
  useEffect(() => {
    profileAnalyticsService.initialize(workspaceId, profileId);
  }, [workspaceId, profileId]);

  // Fetch data
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [
        analyticsData,
        viewsData,
        geo,
        referrers,
        links,
        themes,
      ] = await Promise.all([
        profileAnalyticsService.getAnalytics({ time_range: timeRange }),
        profileAnalyticsService.getViewsByTime({
          time_range: timeRange,
          aggregation: timeRange === '24h' ? 'hour' : 'day',
        }),
        profileAnalyticsService.getGeographicData({ time_range: timeRange }),
        profileAnalyticsService.getReferrerData({ time_range: timeRange }),
        profileAnalyticsService.getLinkClicks({ time_range: timeRange }),
        profileAnalyticsService.getThemeAnalytics(),
      ]);

      setAnalytics(analyticsData);
      setViewsByTime(viewsData);
      setGeoData(geo);
      setReferrerData(referrers);
      setLinkClickData(links);
      setThemeData(themes);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setIsLoading(false);
    }
  }, [timeRange, onError]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time monitoring
  useEffect(() => {
    const stopMonitoring = profileAnalyticsService.startRealTimeMonitoring(
      setRealTimeData,
      30000
    );
    return () => stopMonitoring();
  }, [workspaceId, profileId]);

  // Handle export
  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      await profileAnalyticsService.downloadCSV({ time_range: timeRange });
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Failed to export analytics');
    } finally {
      setIsExporting(false);
    }
  }, [timeRange, onError]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-8 bg-surface-hover rounded animate-pulse w-1/3" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-surface-hover rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="h-48 bg-surface-hover rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-5 h-5 text-text-secondary" />
          <h2 className="text-lg font-semibold text-text-primary">Analytics</h2>
          <RealTimeIndicator data={realTimeData} />
        </div>
        <div className="flex items-center gap-2">
          {/* Time Range Selector */}
          <div className="relative">
            <button
              onClick={() => setShowTimeRangeDropdown(!showTimeRangeDropdown)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm border border-border rounded-lg bg-surface hover:bg-surface-hover transition-colors"
            >
              {TIME_RANGE_OPTIONS.find((o) => o.value === timeRange)?.label}
              <ChevronDown className="w-4 h-4" />
            </button>
            {showTimeRangeDropdown && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowTimeRangeDropdown(false)}
                />
                <div className="absolute right-0 top-full mt-1 w-40 bg-surface border border-border rounded-lg shadow-lg z-20">
                  {TIME_RANGE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setTimeRange(option.value);
                        setShowTimeRangeDropdown(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                        timeRange === option.value
                          ? 'bg-accent/10 text-accent'
                          : 'text-text-primary hover:bg-surface-hover'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Refresh */}
          <AppButton variant="ghost" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4" />
          </AppButton>

          {/* Export */}
          <AppButton
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? (
              <RefreshCw className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <FileDown className="w-4 h-4 mr-2" />
            )}
            Export
          </AppButton>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Views"
          value={profileAnalyticsService.formatNumber(analytics?.total_views || 0)}
          icon={<Eye className="w-4 h-4" />}
        />
        <StatCard
          title="Unique Visitors"
          value={profileAnalyticsService.formatNumber(analytics?.unique_visitors || 0)}
          icon={<Users className="w-4 h-4" />}
        />
        <StatCard
          title="Link Clicks"
          value={profileAnalyticsService.formatNumber(analytics?.link_clicks || 0)}
          icon={<MousePointerClick className="w-4 h-4" />}
        />
        <StatCard
          title="vCard Downloads"
          value={profileAnalyticsService.formatNumber(analytics?.vcard_downloads || 0)}
          icon={<Download className="w-4 h-4" />}
        />
      </div>

      {/* Views Chart */}
      <div className="bg-surface border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-text-primary">
            Views Over Time
          </h3>
          <Activity className="w-4 h-4 text-text-tertiary" />
        </div>
        <SimpleBarChart data={viewsByTime} />
      </div>

      {/* Data Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Geographic */}
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-text-primary">
              Top Countries
            </h3>
            <Globe className="w-4 h-4 text-text-tertiary" />
          </div>
          <GeographicList data={geoData} />
        </div>

        {/* Referrers */}
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-text-primary">
              Top Referrers
            </h3>
            <Link2 className="w-4 h-4 text-text-tertiary" />
          </div>
          <ReferrerList data={referrerData} />
        </div>

        {/* Link Clicks */}
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-text-primary">
              Popular Links
            </h3>
            <MousePointerClick className="w-4 h-4 text-text-tertiary" />
          </div>
          <LinkClickList data={linkClickData} />
        </div>

        {/* Theme Popularity */}
        <div className="bg-surface border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-text-primary">
              Theme Popularity
            </h3>
            <Palette className="w-4 h-4 text-text-tertiary" />
          </div>
          <ThemeAnalyticsList data={themeData} />
        </div>
      </div>

      {/* Footer */}
      <p className="text-xs text-text-tertiary text-center">
        Data updates every 30 seconds. Analytics are privacy-compliant with IP anonymization.
      </p>
    </div>
  );
};

export default AnalyticsDashboard;
