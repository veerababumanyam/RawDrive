/**
 * GalleryAnalyticsPanel Component
 *
 * A comprehensive panel for displaying analytics for a specific gallery.
 * Displays summary metrics, engagement breakdown, device/geographic distribution,
 * traffic sources, and views over time chart.
 *
 * Feature: Analytics & Reporting
 * Task: T033 - Create GalleryAnalyticsPanel component
 */

import React, { useState, useMemo, useCallback, ComponentType } from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/AppCard';
import { Tabs, TabItem } from '@/components/ui/Tabs';
import {
  Eye,
  Users,
  Download,
  Heart,
  MessageSquare,
  CheckSquare,
  Share2,
  Clock,
  Globe,
  Monitor,
  Smartphone,
  Tablet,
  Link2,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  AlertCircle,
  BarChart3,
  Activity,
  LucideIcon,
} from 'lucide-react';
import { AnalyticsOverviewCard, StatsGrid } from './AnalyticsOverviewCard';
import {
  AnalyticsChart,
  ViewsOverTimeChart,
  DeviceBreakdownChart,
  EngagementBreakdownChart,
  TrafficSourceChart,
  GeographicBreakdownChart,
  ChartsGrid,
} from './AnalyticsChart';
import {
  useGalleryAnalytics,
  useGalleryViewsTimeSeries,
  useGalleryEngagement,
  UseGalleryAnalyticsReturn,
} from '@/hooks/useGalleryAnalytics';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Type alias for tab icons compatible with the Tabs component */
type TabIconType = ComponentType<{ size?: number; className?: string }>;

export type GalleryAnalyticsPanelTab =
  | 'overview'
  | 'engagement'
  | 'audience'
  | 'sources';

export interface DateRange {
  startDate?: string | Date;
  endDate?: string | Date;
}

export interface GalleryAnalyticsPanelProps {
  /** Gallery ID to fetch analytics for */
  galleryId: string;
  /** Gallery name for display */
  galleryName?: string;
  /** Date range for analytics */
  dateRange?: DateRange;
  /** Period type for summary */
  periodType?: 'daily' | 'weekly' | 'monthly' | 'all_time';
  /** Whether to auto-refresh data */
  autoRefresh?: boolean;
  /** Show compact version (fewer sections) */
  compact?: boolean;
  /** Whether to show the tab navigation */
  showTabs?: boolean;
  /** Initial tab to show */
  initialTab?: GalleryAnalyticsPanelTab;
  /** Callback when user navigates to full analytics page */
  onViewFullAnalytics?: () => void;
  /** Additional CSS classes */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Format duration in milliseconds to human-readable string
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

/**
 * Format percentage with sign
 */
function formatPercentageChange(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

/**
 * Get trend indicator config
 */
function getTrendConfig(
  value: number | undefined
): { icon: LucideIcon; color: string; bgColor: string } | null {
  if (value === undefined || value === null) return null;
  if (value === 0) {
    return { icon: Minus, color: 'text-zinc-500', bgColor: 'bg-zinc-500/10' };
  }
  if (value > 0) {
    return { icon: TrendingUp, color: 'text-green-500', bgColor: 'bg-green-500/10' };
  }
  return { icon: TrendingDown, color: 'text-red-500', bgColor: 'bg-red-500/10' };
}

// ---------------------------------------------------------------------------
// Sub-Components
// ---------------------------------------------------------------------------

/**
 * Loading skeleton for the panel
 */
function PanelSkeleton({ compact }: { compact?: boolean }) {
  return (
    <div className="animate-pulse space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-zinc-700" />
        <div className="flex-1">
          <div className="h-5 w-48 bg-zinc-700 rounded mb-2" />
          <div className="h-4 w-32 bg-zinc-700 rounded" />
        </div>
      </div>

      {/* Stats grid */}
      <div className={cn('grid gap-4', compact ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-4')}>
        {Array.from({ length: compact ? 4 : 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-zinc-700/50 rounded-xl" />
        ))}
      </div>

      {/* Chart */}
      {!compact && (
        <div className="h-64 bg-zinc-700/50 rounded-xl" />
      )}
    </div>
  );
}

/**
 * Error state component
 */
function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Card variant="elevated" className="p-6">
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
          <AlertCircle className="w-6 h-6 text-red-500" />
        </div>
        <h3 className="text-lg font-medium text-text-primary mb-2">
          Failed to Load Analytics
        </h3>
        <p className="text-sm text-text-tertiary mb-4 max-w-sm">
          {message}
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Retry</span>
          </button>
        )}
      </div>
    </Card>
  );
}

/**
 * Empty state component
 */
function EmptyState({ galleryName }: { galleryName?: string }) {
  return (
    <Card variant="elevated" className="p-6">
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center mb-4">
          <BarChart3 className="w-6 h-6 text-blue-500" />
        </div>
        <h3 className="text-lg font-medium text-text-primary mb-2">
          No Analytics Data Yet
        </h3>
        <p className="text-sm text-text-tertiary max-w-sm">
          {galleryName
            ? `"${galleryName}" hasn't received any views yet. Share your gallery to start collecting analytics.`
            : 'This gallery hasn\'t received any views yet. Share your gallery to start collecting analytics.'}
        </p>
      </div>
    </Card>
  );
}

/**
 * Single metric stat display
 */
interface MetricStatProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  iconColor?: string;
  iconBgColor?: string;
  change?: number;
  compact?: boolean;
}

function MetricStat({
  label,
  value,
  icon: Icon,
  iconColor = 'text-blue-500',
  iconBgColor = 'bg-blue-500/10',
  change,
  compact,
}: MetricStatProps) {
  const trendConfig = getTrendConfig(change);

  return (
    <div className={cn('flex items-center gap-3', compact && 'gap-2')}>
      <div
        className={cn(
          'flex items-center justify-center shrink-0 rounded-lg',
          iconBgColor,
          compact ? 'w-8 h-8' : 'w-10 h-10'
        )}
      >
        <Icon className={cn(iconColor, compact ? 'w-4 h-4' : 'w-5 h-5')} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-text-tertiary truncate">{label}</p>
        <div className="flex items-center gap-2">
          <span className={cn('font-semibold text-text-primary tabular-nums', compact ? 'text-base' : 'text-lg')}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </span>
          {trendConfig && change !== undefined && (
            <div className={cn('flex items-center gap-0.5 text-xs', trendConfig.color)}>
              <trendConfig.icon className="w-3 h-3" />
              <span className="tabular-nums">{Math.abs(change).toFixed(1)}%</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Panel header with gallery info
 */
interface PanelHeaderProps {
  galleryName?: string;
  lastUpdated?: string;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  onViewFullAnalytics?: () => void;
}

function PanelHeader({
  galleryName,
  lastUpdated,
  isRefreshing,
  onRefresh,
  onViewFullAnalytics,
}: PanelHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-4 mb-6">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-500/10 shrink-0">
          <BarChart3 className="w-5 h-5 text-blue-500" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-text-primary truncate">
            {galleryName ? `${galleryName} Analytics` : 'Gallery Analytics'}
          </h2>
          {lastUpdated && (
            <p className="text-xs text-text-tertiary">
              Last updated: {new Date(lastUpdated).toLocaleString()}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors disabled:opacity-50"
            title="Refresh analytics"
          >
            <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
          </button>
        )}
        {onViewFullAnalytics && (
          <button
            onClick={onViewFullAnalytics}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg text-primary hover:bg-primary/10 transition-colors"
          >
            <span>View Full Analytics</span>
            <ExternalLink className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab Content Components
// ---------------------------------------------------------------------------

/**
 * Overview tab content - summary metrics and views chart
 */
interface OverviewTabProps {
  analytics: UseGalleryAnalyticsReturn;
  compact?: boolean;
}

function OverviewTab({ analytics, compact }: OverviewTabProps) {
  const {
    totalViews,
    uniqueVisitors,
    totalDownloads,
    totalFavorites,
    totalComments,
    engagementRate,
    avgSessionDuration,
    viewsDataPoints,
    isLoadingAnalytics,
    isLoadingTimeSeries,
  } = analytics;

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <StatsGrid columns={compact ? 2 : 4}>
        <AnalyticsOverviewCard
          title="Total Views"
          value={totalViews}
          metricType="views"
          isLoading={isLoadingAnalytics}
          compact={compact}
        />
        <AnalyticsOverviewCard
          title="Unique Visitors"
          value={uniqueVisitors}
          icon={Users}
          iconColor="text-purple-500"
          iconBgColor="bg-purple-500/10"
          isLoading={isLoadingAnalytics}
          compact={compact}
        />
        <AnalyticsOverviewCard
          title="Downloads"
          value={totalDownloads}
          metricType="downloads"
          isLoading={isLoadingAnalytics}
          compact={compact}
        />
        <AnalyticsOverviewCard
          title="Engagement Rate"
          value={`${engagementRate.toFixed(1)}%`}
          icon={Activity}
          iconColor="text-amber-500"
          iconBgColor="bg-amber-500/10"
          isLoading={isLoadingAnalytics}
          compact={compact}
        />
      </StatsGrid>

      {/* Views chart */}
      {!compact && (
        <ViewsOverTimeChart
          data={viewsDataPoints.map((dp) => ({
            date: dp.date,
            views: dp.views,
            uniqueVisitors: dp.uniqueVisitors,
          }))}
          isLoading={isLoadingTimeSeries}
          height={300}
        />
      )}

      {/* Secondary stats */}
      <Card variant="elevated" className="p-4">
        <h3 className="text-sm font-medium text-text-secondary mb-4">Engagement Summary</h3>
        <div className={cn('grid gap-4', compact ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-4')}>
          <MetricStat
            label="Favorites"
            value={totalFavorites}
            icon={Heart}
            iconColor="text-pink-500"
            iconBgColor="bg-pink-500/10"
            compact={compact}
          />
          <MetricStat
            label="Comments"
            value={totalComments}
            icon={MessageSquare}
            iconColor="text-blue-500"
            iconBgColor="bg-blue-500/10"
            compact={compact}
          />
          <MetricStat
            label="Avg. Session"
            value={formatDuration(avgSessionDuration)}
            icon={Clock}
            iconColor="text-green-500"
            iconBgColor="bg-green-500/10"
            compact={compact}
          />
          <MetricStat
            label="Downloads"
            value={totalDownloads}
            icon={Download}
            iconColor="text-emerald-500"
            iconBgColor="bg-emerald-500/10"
            compact={compact}
          />
        </div>
      </Card>
    </div>
  );
}

/**
 * Engagement tab content - detailed engagement breakdown
 */
interface EngagementTabProps {
  analytics: UseGalleryAnalyticsReturn;
  compact?: boolean;
}

function EngagementTab({ analytics, compact }: EngagementTabProps) {
  const { engagement, isLoadingEngagement } = analytics;

  const engagementData = useMemo(() => {
    if (!engagement) return null;
    return {
      favorites: engagement.favorites?.count ?? 0,
      comments: engagement.comments?.count ?? 0,
      selections: engagement.selections?.count ?? 0,
      downloads: engagement.downloads?.count ?? 0,
      shares: engagement.shares?.count ?? 0,
    };
  }, [engagement]);

  if (isLoadingEngagement) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-64 bg-zinc-700/50 rounded-xl" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-24 bg-zinc-700/50 rounded-xl" />
          <div className="h-24 bg-zinc-700/50 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Engagement chart */}
      <EngagementBreakdownChart
        favorites={engagementData?.favorites ?? 0}
        comments={engagementData?.comments ?? 0}
        selections={engagementData?.selections ?? 0}
        downloads={engagementData?.downloads ?? 0}
        shares={engagementData?.shares}
        height={compact ? 200 : 280}
      />

      {/* Engagement metrics cards */}
      <div className={cn('grid gap-4', compact ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-3')}>
        <Card variant="elevated" className="p-4">
          <MetricStat
            label="Total Favorites"
            value={engagementData?.favorites ?? 0}
            icon={Heart}
            iconColor="text-pink-500"
            iconBgColor="bg-pink-500/10"
          />
        </Card>
        <Card variant="elevated" className="p-4">
          <MetricStat
            label="Total Comments"
            value={engagementData?.comments ?? 0}
            icon={MessageSquare}
            iconColor="text-blue-500"
            iconBgColor="bg-blue-500/10"
          />
        </Card>
        <Card variant="elevated" className="p-4">
          <MetricStat
            label="Selections Made"
            value={engagementData?.selections ?? 0}
            icon={CheckSquare}
            iconColor="text-green-500"
            iconBgColor="bg-green-500/10"
          />
        </Card>
        <Card variant="elevated" className="p-4">
          <MetricStat
            label="Downloads"
            value={engagementData?.downloads ?? 0}
            icon={Download}
            iconColor="text-orange-500"
            iconBgColor="bg-orange-500/10"
          />
        </Card>
        {(engagementData?.shares ?? 0) > 0 && (
          <Card variant="elevated" className="p-4">
            <MetricStat
              label="Shares"
              value={engagementData?.shares ?? 0}
              icon={Share2}
              iconColor="text-purple-500"
              iconBgColor="bg-purple-500/10"
            />
          </Card>
        )}
        <Card variant="elevated" className="p-4">
          <MetricStat
            label="Engagement Rate"
            value={`${analytics.engagementRate.toFixed(1)}%`}
            icon={Activity}
            iconColor="text-amber-500"
            iconBgColor="bg-amber-500/10"
          />
        </Card>
      </div>
    </div>
  );
}

/**
 * Audience tab content - device and geographic breakdown
 */
interface AudienceTabProps {
  analytics: UseGalleryAnalyticsReturn;
  compact?: boolean;
}

function AudienceTab({ analytics, compact }: AudienceTabProps) {
  const { analytics: analyticsData, isLoadingAnalytics } = analytics;

  const deviceBreakdown = useMemo(() => {
    if (!analyticsData?.deviceBreakdown) {
      return { desktop: 0, tablet: 0, mobile: 0 };
    }
    return {
      desktop: analyticsData.deviceBreakdown.desktop || 0,
      tablet: analyticsData.deviceBreakdown.tablet || 0,
      mobile: analyticsData.deviceBreakdown.mobile || 0,
    };
  }, [analyticsData]);

  const geographicData = useMemo(() => {
    if (!analyticsData?.geographicBreakdown) return [];
    return analyticsData.geographicBreakdown.map((geo) => ({
      countryCode: geo.countryCode,
      countryName: geo.countryName,
      count: geo.count,
    }));
  }, [analyticsData]);

  if (isLoadingAnalytics) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-64 bg-zinc-700/50 rounded-xl" />
          <div className="h-64 bg-zinc-700/50 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ChartsGrid columns={compact ? 1 : 2}>
        {/* Device breakdown */}
        <DeviceBreakdownChart
          desktop={deviceBreakdown.desktop}
          tablet={deviceBreakdown.tablet}
          mobile={deviceBreakdown.mobile}
          height={compact ? 200 : 280}
        />

        {/* Geographic breakdown */}
        <GeographicBreakdownChart
          data={geographicData}
          height={compact ? 200 : 280}
          limit={6}
        />
      </ChartsGrid>

      {/* Device stats summary */}
      <Card variant="elevated" className="p-4">
        <h3 className="text-sm font-medium text-text-secondary mb-4">Device Summary</h3>
        <div className="grid grid-cols-3 gap-4">
          <MetricStat
            label="Desktop"
            value={deviceBreakdown.desktop}
            icon={Monitor}
            iconColor="text-blue-500"
            iconBgColor="bg-blue-500/10"
            compact
          />
          <MetricStat
            label="Tablet"
            value={deviceBreakdown.tablet}
            icon={Tablet}
            iconColor="text-purple-500"
            iconBgColor="bg-purple-500/10"
            compact
          />
          <MetricStat
            label="Mobile"
            value={deviceBreakdown.mobile}
            icon={Smartphone}
            iconColor="text-green-500"
            iconBgColor="bg-green-500/10"
            compact
          />
        </div>
      </Card>
    </div>
  );
}

/**
 * Sources tab content - traffic source breakdown
 */
interface SourcesTabProps {
  analytics: UseGalleryAnalyticsReturn;
  compact?: boolean;
}

function SourcesTab({ analytics, compact }: SourcesTabProps) {
  const { analytics: analyticsData, isLoadingAnalytics } = analytics;

  const sourceBreakdown = useMemo(() => {
    if (!analyticsData?.sourceBreakdown) {
      return { direct: 0, shareLink: 0, referral: 0 };
    }
    return {
      direct: analyticsData.sourceBreakdown.direct?.count ?? 0,
      shareLink: analyticsData.sourceBreakdown.shareLink?.count ?? 0,
      referral: analyticsData.sourceBreakdown.referral?.count ?? 0,
    };
  }, [analyticsData]);

  const shareLinkStats = useMemo(() => {
    if (!analyticsData?.shareLinkStats) {
      return { created: 0, accesses: 0, conversions: 0, rate: 0 };
    }
    return {
      created: analyticsData.shareLinkStats.shareLinksCreated ?? 0,
      accesses: analyticsData.shareLinkStats.shareLinkAccesses ?? 0,
      conversions: analyticsData.shareLinkStats.shareLinkConversions ?? 0,
      rate: analyticsData.shareLinkStats.conversionRate ?? 0,
    };
  }, [analyticsData]);

  const topReferrers = useMemo(() => {
    return analyticsData?.topReferrers ?? [];
  }, [analyticsData]);

  if (isLoadingAnalytics) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-64 bg-zinc-700/50 rounded-xl" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-24 bg-zinc-700/50 rounded-xl" />
          <div className="h-24 bg-zinc-700/50 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Traffic source chart */}
      <TrafficSourceChart
        direct={sourceBreakdown.direct}
        shareLink={sourceBreakdown.shareLink}
        referral={sourceBreakdown.referral}
        height={compact ? 200 : 280}
      />

      {/* Share link stats */}
      <Card variant="elevated" className="p-4">
        <h3 className="text-sm font-medium text-text-secondary mb-4">Share Link Performance</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricStat
            label="Links Created"
            value={shareLinkStats.created}
            icon={Link2}
            iconColor="text-blue-500"
            iconBgColor="bg-blue-500/10"
            compact
          />
          <MetricStat
            label="Link Accesses"
            value={shareLinkStats.accesses}
            icon={Eye}
            iconColor="text-green-500"
            iconBgColor="bg-green-500/10"
            compact
          />
          <MetricStat
            label="Conversions"
            value={shareLinkStats.conversions}
            icon={CheckSquare}
            iconColor="text-purple-500"
            iconBgColor="bg-purple-500/10"
            compact
          />
          <MetricStat
            label="Conversion Rate"
            value={`${shareLinkStats.rate.toFixed(1)}%`}
            icon={TrendingUp}
            iconColor="text-emerald-500"
            iconBgColor="bg-emerald-500/10"
            compact
          />
        </div>
      </Card>

      {/* Top referrers */}
      {topReferrers.length > 0 && (
        <Card variant="elevated" className="p-4">
          <h3 className="text-sm font-medium text-text-secondary mb-4">Top Referrers</h3>
          <div className="space-y-3">
            {topReferrers.slice(0, 5).map((referrer, index) => (
              <div
                key={referrer.referrer || index}
                className="flex items-center justify-between py-2 border-b border-border last:border-0"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex items-center justify-center w-6 h-6 rounded bg-surface-elevated text-xs text-text-tertiary">
                    {index + 1}
                  </div>
                  <span className="text-sm text-text-primary truncate">
                    {referrer.referrer || 'Direct'}
                  </span>
                </div>
                <span className="text-sm font-medium text-text-secondary tabular-nums">
                  {referrer.count.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function GalleryAnalyticsPanel({
  galleryId,
  galleryName,
  dateRange,
  periodType = 'all_time',
  autoRefresh = true,
  compact = false,
  showTabs = true,
  initialTab = 'overview',
  onViewFullAnalytics,
  className,
}: GalleryAnalyticsPanelProps) {
  const [activeTab, setActiveTab] = useState<GalleryAnalyticsPanelTab>(initialTab);

  // Fetch gallery analytics using the combined hook
  const analytics = useGalleryAnalytics({
    galleryId,
    startDate: dateRange?.startDate,
    endDate: dateRange?.endDate,
    periodType,
    granularity: 'daily',
    enabled: Boolean(galleryId),
    autoRefresh,
  });

  const { isLoading, isError, errors, analytics: analyticsData, refetchAll } = analytics;

  // Tab configuration
  const tabs = useMemo<TabItem<GalleryAnalyticsPanelTab>[]>(
    () => [
      { id: 'overview', label: 'Overview', icon: BarChart3 as TabIconType },
      { id: 'engagement', label: 'Engagement', icon: Heart as TabIconType },
      { id: 'audience', label: 'Audience', icon: Users as TabIconType },
      { id: 'sources', label: 'Sources', icon: Globe as TabIconType },
    ],
    []
  );

  // Handle refresh
  const handleRefresh = useCallback(() => {
    refetchAll();
  }, [refetchAll]);

  // Loading state
  if (isLoading && !analyticsData) {
    return (
      <Card variant="elevated" className={cn('p-6', className)}>
        <PanelSkeleton compact={compact} />
      </Card>
    );
  }

  // Error state
  if (isError && !analyticsData) {
    const errorMessage = errors.analytics?.message || 'An error occurred while loading analytics data.';
    return (
      <div className={className}>
        <ErrorState message={errorMessage} onRetry={handleRefresh} />
      </div>
    );
  }

  // Empty state (no data yet)
  if (analyticsData && analytics.totalViews === 0 && analytics.uniqueVisitors === 0) {
    return (
      <div className={className}>
        <EmptyState galleryName={galleryName} />
      </div>
    );
  }

  // Render active tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewTab analytics={analytics} compact={compact} />;
      case 'engagement':
        return <EngagementTab analytics={analytics} compact={compact} />;
      case 'audience':
        return <AudienceTab analytics={analytics} compact={compact} />;
      case 'sources':
        return <SourcesTab analytics={analytics} compact={compact} />;
      default:
        return <OverviewTab analytics={analytics} compact={compact} />;
    }
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <PanelHeader
        galleryName={galleryName}
        lastUpdated={analyticsData?.generatedAt}
        isRefreshing={analytics.isLoading}
        onRefresh={handleRefresh}
        onViewFullAnalytics={onViewFullAnalytics}
      />

      {/* Tabs navigation */}
      {showTabs && (
        <Tabs
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          ariaLabel="Gallery analytics sections"
          size="sm"
        />
      )}

      {/* Tab content */}
      <div className="min-h-[300px]">
        {renderTabContent()}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Convenience Components
// ---------------------------------------------------------------------------

export interface GalleryAnalyticsSummaryCardProps {
  galleryId: string;
  galleryName?: string;
  onClick?: () => void;
  className?: string;
}

/**
 * A compact summary card showing key gallery metrics
 * Suitable for use in gallery lists or dashboards
 */
export function GalleryAnalyticsSummaryCard({
  galleryId,
  galleryName,
  onClick,
  className,
}: GalleryAnalyticsSummaryCardProps) {
  const analytics = useGalleryAnalytics({
    galleryId,
    enabled: Boolean(galleryId),
    autoRefresh: false,
  });

  const { totalViews, uniqueVisitors, totalDownloads, isLoading } = analytics;

  if (isLoading) {
    return (
      <Card
        variant="elevated"
        className={cn('p-4 animate-pulse', className)}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-lg bg-zinc-700" />
          <div className="h-4 w-32 bg-zinc-700 rounded" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-zinc-700/50 rounded" />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card
      variant="elevated"
      hoverable
      clickable={!!onClick}
      onClick={onClick}
      className={cn('p-4', onClick && 'cursor-pointer', className)}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/10 shrink-0">
          <BarChart3 className="w-4 h-4 text-blue-500" />
        </div>
        <h3 className="text-sm font-medium text-text-primary truncate">
          {galleryName || 'Gallery Analytics'}
        </h3>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center">
          <p className="text-lg font-semibold text-text-primary tabular-nums">
            {totalViews.toLocaleString()}
          </p>
          <p className="text-xs text-text-tertiary">Views</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-text-primary tabular-nums">
            {uniqueVisitors.toLocaleString()}
          </p>
          <p className="text-xs text-text-tertiary">Visitors</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-text-primary tabular-nums">
            {totalDownloads.toLocaleString()}
          </p>
          <p className="text-xs text-text-tertiary">Downloads</p>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Default Export
// ---------------------------------------------------------------------------

export default GalleryAnalyticsPanel;
