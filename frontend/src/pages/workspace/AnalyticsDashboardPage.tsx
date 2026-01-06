/**
 * AnalyticsDashboardPage
 *
 * Main analytics dashboard page for the workspace showing:
 * - Overview metrics (galleries, assets, views, clients, storage)
 * - Quick stats with trend indicators
 * - Views over time chart
 * - Device and engagement breakdowns
 * - Top performing galleries
 * - Recent activity feed
 *
 * NOTE: This page is rendered inside WorkspaceLayout which provides
 * the header, sidebar, and main content area structure.
 *
 * Feature: Analytics & Reporting
 * Task: T036 - Create AnalyticsDashboardPage
 */

import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BarChart3,
  RefreshCw,
  Eye,
  Download,
  Users,
  Image,
  HardDrive,
  TrendingUp,
  TrendingDown,
  Calendar,
  ChevronRight,
  Activity,
  LayoutGrid,
  Clock,
  FileText,
  ArrowRight,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import {
  useAnalyticsDashboard,
  type UseAnalyticsDashboardOptions,
} from '../../hooks/useAnalytics';
import {
  AnalyticsOverviewCard,
  StatsGrid,
  AnalyticsChart,
  ViewsOverTimeChart,
  DeviceBreakdownChart,
  EngagementBreakdownChart,
  ChartsGrid,
  type DataPoint,
} from '../../components/features/analytics';

/* =============================================================================
   Types
   ============================================================================= */

type PeriodOption = '7d' | '30d' | '90d' | '1y' | 'all';

interface PeriodConfig {
  value: PeriodOption;
  label: string;
}

/* =============================================================================
   Constants
   ============================================================================= */

const PERIOD_OPTIONS: PeriodConfig[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '1y', label: 'Last year' },
  { value: 'all', label: 'All time' },
];

/* =============================================================================
   Helper Components
   ============================================================================= */

/**
 * Period Selector Dropdown
 */
function PeriodSelector({
  value,
  onChange,
}: {
  value: PeriodOption;
  onChange: (value: PeriodOption) => void;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as PeriodOption)}
        className="appearance-none px-4 py-2 pr-10 rounded-xl bg-surface-elevated border border-border/50 text-text-primary text-sm font-medium cursor-pointer hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
      >
        {PERIOD_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
    </div>
  );
}

/**
 * Loading Spinner
 */
function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-full min-h-[400px]">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </div>
  );
}

/**
 * Error State
 */
function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="text-center py-16">
      <div className="empty-state-icon mx-auto mb-4">
        <BarChart3 className="w-8 h-8" />
      </div>
      <p className="text-text-secondary mb-4">{message}</p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary-600 transition-colors"
      >
        <RefreshCw size={16} />
        Try Again
      </button>
    </div>
  );
}

/**
 * Empty State
 */
function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-16">
      <div className="empty-state-icon mx-auto mb-4">
        <BarChart3 className="w-8 h-8" />
      </div>
      <p className="text-text-secondary">{message}</p>
      <p className="text-xs text-text-tertiary mt-2">
        Analytics data will appear as visitors interact with your galleries
      </p>
    </div>
  );
}

/* =============================================================================
   Main Component
   ============================================================================= */

const AnalyticsDashboardPage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation(['analytics', 'common']);
  const { workspace } = useAuth();

  // State
  const [period, setPeriod] = useState<PeriodOption>('30d');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Analytics hook options
  const dashboardOptions: UseAnalyticsDashboardOptions = useMemo(
    () => ({
      period,
      enabled: !!workspace?.workspace_id,
      autoRefresh: true,
    }),
    [period, workspace?.workspace_id]
  );

  // Fetch analytics data
  const {
    metrics,
    overview,
    quickStats,
    activities,
    topGalleries,
    isLoading,
    isLoadingMetrics,
    isLoadingOverview,
    isLoadingQuickStats,
    isLoadingActivities,
    isLoadingTopGalleries,
    isError,
    errors,
    refetchAll,
  } = useAnalyticsDashboard(dashboardOptions);

  // Handlers
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetchAll();
    } finally {
      setIsRefreshing(false);
    }
  }, [refetchAll]);

  const handlePeriodChange = useCallback((newPeriod: PeriodOption) => {
    setPeriod(newPeriod);
  }, []);

  // Prepare chart data from metrics
  const viewsOverTimeData = useMemo(() => {
    if (!metrics?.dailyViews) return [];
    return metrics.dailyViews.map((d) => ({
      date: d.date,
      views: d.views,
      uniqueVisitors: d.uniqueVisitors,
    }));
  }, [metrics?.dailyViews]);

  const deviceBreakdown = useMemo(
    () =>
      metrics?.deviceBreakdown || {
        desktop: 0,
        mobile: 0,
        tablet: 0,
      },
    [metrics?.deviceBreakdown]
  );

  // Geographic data for bar chart
  const geographicData: DataPoint[] = useMemo(() => {
    if (!metrics?.geographicBreakdown) return [];
    return metrics.geographicBreakdown.slice(0, 6).map((entry) => ({
      label: entry.countryName || entry.countryCode,
      value: entry.count,
    }));
  }, [metrics?.geographicBreakdown]);

  // Stats configuration for overview cards
  const overviewStats = useMemo(
    () => [
      {
        id: 'views',
        title: t('stats.totalViews', { defaultValue: 'Total Views' }),
        value: overview?.totalViews || quickStats?.quickStats?.views || 0,
        change: quickStats?.trends?.viewsChange,
        changeIsPositive: (quickStats?.trends?.viewsChange || 0) >= 0,
        metricType: 'views' as const,
      },
      {
        id: 'downloads',
        title: t('stats.downloads', { defaultValue: 'Downloads' }),
        value:
          overview?.totalDownloads || quickStats?.quickStats?.downloads || 0,
        change: quickStats?.trends?.downloadsChange,
        changeIsPositive: (quickStats?.trends?.downloadsChange || 0) >= 0,
        metricType: 'downloads' as const,
      },
      {
        id: 'clients',
        title: t('stats.activeClients', { defaultValue: 'Active Clients' }),
        value: overview?.activeClients || 0,
        change: quickStats?.trends?.clientsChange,
        changeIsPositive: (quickStats?.trends?.clientsChange || 0) >= 0,
        metricType: 'clients' as const,
      },
      {
        id: 'galleries',
        title: t('stats.galleries', { defaultValue: 'Galleries' }),
        value: overview?.totalGalleries || 0,
        metricType: 'galleries' as const,
      },
    ],
    [overview, quickStats, t]
  );

  const secondaryStats = useMemo(
    () => [
      {
        id: 'assets',
        title: t('stats.totalAssets', { defaultValue: 'Total Assets' }),
        value: overview?.totalAssets || 0,
        metricType: 'assets' as const,
      },
      {
        id: 'storage',
        title: t('stats.storageUsed', { defaultValue: 'Storage Used' }),
        value: 0,
        formattedValue: overview?.storageUsedFormatted || '0 B',
        metricType: 'storage' as const,
      },
      {
        id: 'visitors',
        title: t('stats.uniqueVisitors', { defaultValue: 'Unique Visitors' }),
        value: quickStats?.quickStats?.uniqueVisitors || 0,
        change: quickStats?.trends?.visitorsChange,
        changeIsPositive: (quickStats?.trends?.visitorsChange || 0) >= 0,
        metricType: 'views' as const,
      },
      {
        id: 'newClients',
        title: t('stats.newClients', { defaultValue: 'New Clients' }),
        value: quickStats?.quickStats?.newClients || 0,
        metricType: 'clients' as const,
      },
    ],
    [overview, quickStats, t]
  );

  // Initial loading state
  if (isLoading && !metrics && !overview) {
    return (
      <div className="h-full overflow-auto bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
        <LoadingSpinner />
      </div>
    );
  }

  // Error state
  if (isError && !metrics && !overview) {
    return (
      <div className="h-full overflow-auto bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
        <ErrorState
          message={
            errors.metrics?.message ||
            errors.overview?.message ||
            'Failed to load analytics data'
          }
          onRetry={handleRefresh}
        />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
      {/* Page Header */}
      <div className="sticky top-0 z-10 glass-premium border-b border-white/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gradient">
                {t('title', { defaultValue: 'Analytics' })}
              </h1>
              <p className="text-sm text-text-secondary hidden sm:block mt-0.5">
                {t('subtitle', {
                  defaultValue: 'Track your gallery performance and engagement',
                })}
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* Period Selector */}
              <PeriodSelector value={period} onChange={handlePeriodChange} />

              {/* Refresh Button */}
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="p-2.5 rounded-xl bg-surface-elevated border border-border/50 text-text-secondary hover:text-primary hover:border-primary/50 transition-all disabled:opacity-50"
                aria-label="Refresh data"
              >
                <RefreshCw
                  size={18}
                  className={isRefreshing ? 'animate-spin' : ''}
                />
              </button>

              {/* View Reports Button */}
              <button
                onClick={() => navigate('/workspace/analytics/reports')}
                className="hidden sm:flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-medium rounded-xl shadow-lg shadow-violet-500/25 transition-all hover:shadow-xl hover:shadow-violet-500/30 hover:-translate-y-0.5 active:scale-95"
              >
                <FileText size={18} />
                <span>Reports</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Primary Stats Grid */}
        <StatsGrid columns={4}>
          {overviewStats.map((stat) => (
            <AnalyticsOverviewCard
              key={stat.id}
              title={stat.title}
              value={stat.value}
              change={stat.change}
              changeIsPositive={stat.changeIsPositive}
              metricType={stat.metricType}
              isLoading={isLoadingOverview || isLoadingQuickStats}
              changeLabel={
                period === 'all'
                  ? 'total'
                  : `vs prev ${period.replace('d', ' days').replace('y', ' year')}`
              }
              hoverable
              onClick={() => {
                if (stat.id === 'galleries')
                  navigate('/workspace/analytics/galleries');
                if (stat.id === 'clients')
                  navigate('/workspace/analytics/clients');
              }}
            />
          ))}
        </StatsGrid>

        {/* Secondary Stats Grid */}
        <div className="glass-card glass-card-hover rounded-2xl p-4 sm:p-6">
          <div className="section-header mb-4">
            <h2 className="text-base sm:text-lg font-semibold text-text-primary flex items-center gap-2">
              <div className="section-header-icon icon-container-accent">
                <TrendingUp className="w-5 h-5" />
              </div>
              {t('sections.overview', { defaultValue: 'Overview Metrics' })}
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            {secondaryStats.map((stat) => (
              <AnalyticsOverviewCard
                key={stat.id}
                title={stat.title}
                value={stat.value}
                formattedValue={stat.formattedValue}
                change={stat.change}
                changeIsPositive={stat.changeIsPositive}
                metricType={stat.metricType}
                isLoading={isLoadingOverview || isLoadingQuickStats}
                compact
              />
            ))}
          </div>
        </div>

        {/* Charts Section */}
        <div className="space-y-6">
          {/* Views Over Time Chart */}
          <ViewsOverTimeChart
            data={viewsOverTimeData}
            isLoading={isLoadingMetrics}
            isError={!!errors.metrics}
            trend={quickStats?.trends?.viewsChange}
            height={350}
          />

          {/* Breakdown Charts Grid */}
          <ChartsGrid columns={2}>
            <DeviceBreakdownChart
              desktop={deviceBreakdown.desktop}
              tablet={deviceBreakdown.tablet}
              mobile={deviceBreakdown.mobile}
              isLoading={isLoadingMetrics}
              isError={!!errors.metrics}
            />

            {geographicData.length > 0 ? (
              <AnalyticsChart
                type="bar"
                title={t('charts.geographic', {
                  defaultValue: 'Geographic Distribution',
                })}
                subtitle={t('charts.geographicSubtitle', {
                  defaultValue: 'Top countries by views',
                })}
                data={geographicData}
                isLoading={isLoadingMetrics}
                isError={!!errors.metrics}
                height={250}
                showLegend={false}
                showLabels
              />
            ) : (
              <AnalyticsChart
                type="bar"
                title={t('charts.geographic', {
                  defaultValue: 'Geographic Distribution',
                })}
                subtitle={t('charts.geographicSubtitle', {
                  defaultValue: 'Top countries by views',
                })}
                data={[]}
                isLoading={isLoadingMetrics}
                isError={!!errors.metrics}
                height={250}
                emptyMessage="No geographic data available yet"
              />
            )}
          </ChartsGrid>
        </div>

        {/* Main Content Grid - Top Galleries & Activity */}
        <div className="grid lg:grid-cols-3 gap-6 sm:gap-8">
          {/* Top Galleries */}
          <div className="lg:col-span-2 glass-card glass-card-hover rounded-2xl overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-border/50">
              <div className="section-header flex items-center justify-between">
                <h2 className="text-base sm:text-lg font-semibold text-text-primary flex items-center gap-2">
                  <div className="section-header-icon icon-container-accent">
                    <LayoutGrid className="w-5 h-5" />
                  </div>
                  {t('sections.topGalleries', {
                    defaultValue: 'Top Performing Galleries',
                  })}
                </h2>
                <button
                  onClick={() => navigate('/workspace/analytics/galleries')}
                  className="text-sm font-medium text-primary hover:text-primary-600 flex items-center gap-1 hover:gap-2 transition-all"
                >
                  {t('common:actions.viewAll', { defaultValue: 'View all' })}
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            <div className="divide-y divide-border/50">
              {isLoadingTopGalleries ? (
                // Loading skeleton
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="p-4 animate-pulse">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-surface-hover" />
                      <div className="flex-1">
                        <div className="h-4 bg-surface-hover rounded w-1/3 mb-2" />
                        <div className="h-3 bg-surface-hover rounded w-1/2" />
                      </div>
                    </div>
                  </div>
                ))
              ) : topGalleries.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="empty-state-icon mx-auto mb-3">
                    <LayoutGrid className="w-8 h-8" />
                  </div>
                  <p className="text-text-secondary">
                    {t('empty.noGalleries', {
                      defaultValue: 'No gallery data yet',
                    })}
                  </p>
                </div>
              ) : (
                topGalleries.map((gallery, index) => (
                  <div
                    key={gallery.galleryId}
                    onClick={() =>
                      navigate(
                        `/workspace/analytics/galleries/${gallery.galleryId}`
                      )
                    }
                    className="group row-hover p-3 sm:p-4 cursor-pointer"
                  >
                    <div className="flex items-center gap-3 sm:gap-4">
                      {/* Rank Badge */}
                      <div
                        className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                          index === 0
                            ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white'
                            : index === 1
                              ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-white'
                              : index === 2
                                ? 'bg-gradient-to-br from-amber-600 to-amber-700 text-white'
                                : 'bg-surface-hover text-text-secondary'
                        }`}
                      >
                        {index + 1}
                      </div>

                      {/* Gallery Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-text-primary truncate text-sm sm:text-base group-hover:text-primary transition-colors">
                          {gallery.galleryName || 'Untitled Gallery'}
                        </h3>
                        <div className="flex items-center gap-4 text-xs text-text-tertiary mt-1">
                          <span className="flex items-center gap-1">
                            <Eye size={12} />
                            {gallery.totalViews.toLocaleString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users size={12} />
                            {gallery.uniqueVisitors.toLocaleString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <Download size={12} />
                            {gallery.totalDownloads.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* Trend Indicator */}
                      {gallery.trendPercentage !== undefined && (
                        <div
                          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${
                            gallery.trendPercentage >= 0
                              ? 'bg-green-500/10 text-green-500'
                              : 'bg-red-500/10 text-red-500'
                          }`}
                        >
                          {gallery.trendPercentage >= 0 ? (
                            <TrendingUp size={12} />
                          ) : (
                            <TrendingDown size={12} />
                          )}
                          {Math.abs(gallery.trendPercentage).toFixed(1)}%
                        </div>
                      )}

                      <ChevronRight
                        size={16}
                        className="text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity"
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Activity Feed */}
          <div className="glass-card glass-card-hover rounded-2xl overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-border/50">
              <h2 className="text-base sm:text-lg font-semibold text-text-primary flex items-center gap-2">
                <div className="section-header-icon icon-container-accent">
                  <Activity className="w-5 h-5" />
                </div>
                {t('sections.recentActivity', {
                  defaultValue: 'Recent Activity',
                })}
              </h2>
            </div>

            <div className="divide-y divide-border/50 max-h-[400px] overflow-y-auto">
              {isLoadingActivities ? (
                // Loading skeleton
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="p-3 sm:p-4 animate-pulse">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-surface-hover" />
                      <div className="flex-1">
                        <div className="h-4 bg-surface-hover rounded w-3/4 mb-2" />
                        <div className="h-3 bg-surface-hover rounded w-1/2" />
                      </div>
                    </div>
                  </div>
                ))
              ) : activities.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="empty-state-icon mx-auto mb-3">
                    <Activity className="w-8 h-8" />
                  </div>
                  <p className="text-text-secondary">
                    {t('empty.noActivity', {
                      defaultValue: 'No recent activity',
                    })}
                  </p>
                  <p className="text-xs text-text-tertiary mt-1">
                    Activities will appear as visitors interact with your
                    galleries
                  </p>
                </div>
              ) : (
                activities.map((event) => {
                  // Get icon and color based on event type
                  const getEventIcon = () => {
                    switch (event.eventType) {
                      case 'gallery_view':
                      case 'asset_view':
                        return { Icon: Eye, color: 'from-blue-500 to-cyan-500' };
                      case 'asset_download':
                      case 'gallery_download':
                        return {
                          Icon: Download,
                          color: 'from-violet-500 to-purple-600',
                        };
                      case 'favorite_added':
                        return {
                          Icon: TrendingUp,
                          color: 'from-pink-500 to-rose-500',
                        };
                      default:
                        return {
                          Icon: Activity,
                          color: 'from-gray-500 to-gray-600',
                        };
                    }
                  };

                  const { Icon, color } = getEventIcon();

                  return (
                    <div
                      key={event.eventId}
                      className="group row-hover p-3 sm:p-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="relative flex-shrink-0">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br ${color}`}
                          >
                            <Icon size={16} className="text-white" />
                          </div>
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-text-primary">
                            <span className="font-medium">
                              {event.clientName ||
                                event.actorType ||
                                'Visitor'}
                            </span>
                            {' '}
                            <span className="text-text-secondary">
                              {event.description ||
                                event.eventType.replace(/_/g, ' ')}
                            </span>
                          </p>
                          <p className="text-xs text-text-tertiary mt-0.5 flex items-center gap-1.5">
                            {event.galleryName && (
                              <>
                                <span className="truncate max-w-[150px]">
                                  {event.galleryName}
                                </span>
                                <span className="text-border">*</span>
                              </>
                            )}
                            <Clock size={10} />
                            <span className="whitespace-nowrap">
                              {event.occurredAt
                                ? formatDistanceToNow(
                                    new Date(event.occurredAt),
                                    { addSuffix: true }
                                  )
                                : 'Recently'}
                            </span>
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {activities.length > 0 && (
              <div className="p-4 border-t border-border/50 bg-gradient-to-t from-surface-hover/30 to-transparent">
                <button
                  onClick={() => navigate('/workspace/activity')}
                  className="w-full text-sm font-medium text-primary hover:text-primary-600 flex items-center justify-center gap-1 hover:gap-2 transition-all py-2 rounded-xl hover:bg-primary/5"
                >
                  {t('common:actions.viewAll', { defaultValue: 'View all' })}{' '}
                  activity
                  <ArrowRight size={16} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Quick Links Section */}
        <div className="glass-card glass-card-hover rounded-2xl p-4 sm:p-6">
          <div className="section-header mb-4">
            <h2 className="text-base sm:text-lg font-semibold text-text-primary flex items-center gap-2">
              <div className="section-header-icon icon-container-accent">
                <BarChart3 className="w-5 h-5" />
              </div>
              {t('sections.exploreMore', { defaultValue: 'Explore Analytics' })}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={() => navigate('/workspace/analytics/galleries')}
              className="group glass-list-item relative overflow-hidden rounded-xl p-4 hover:shadow-lg hover:-translate-y-0.5 transition-all text-left"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500 to-purple-600 opacity-0 group-hover:opacity-10 transition-opacity duration-300" />
              <div className="relative flex items-center gap-3">
                <div className="icon-container icon-container-lg rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg group-hover:scale-110 transition-transform">
                  <Image className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-medium text-text-primary group-hover:text-primary transition-colors">
                    {t('nav.galleryAnalytics', {
                      defaultValue: 'Gallery Analytics',
                    })}
                  </h3>
                  <p className="text-xs text-text-tertiary">
                    Deep dive into gallery performance
                  </p>
                </div>
                <ChevronRight
                  size={16}
                  className="ml-auto text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity"
                />
              </div>
            </button>

            <button
              onClick={() => navigate('/workspace/analytics/clients')}
              className="group glass-list-item relative overflow-hidden rounded-xl p-4 hover:shadow-lg hover:-translate-y-0.5 transition-all text-left"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 to-teal-500 opacity-0 group-hover:opacity-10 transition-opacity duration-300" />
              <div className="relative flex items-center gap-3">
                <div className="icon-container icon-container-lg rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg group-hover:scale-110 transition-transform">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-medium text-text-primary group-hover:text-primary transition-colors">
                    {t('nav.clientAnalytics', {
                      defaultValue: 'Client Analytics',
                    })}
                  </h3>
                  <p className="text-xs text-text-tertiary">
                    Client engagement & insights
                  </p>
                </div>
                <ChevronRight
                  size={16}
                  className="ml-auto text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity"
                />
              </div>
            </button>

            <button
              onClick={() => navigate('/workspace/analytics/reports')}
              className="group glass-list-item relative overflow-hidden rounded-xl p-4 hover:shadow-lg hover:-translate-y-0.5 transition-all text-left"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-cyan-500 opacity-0 group-hover:opacity-10 transition-opacity duration-300" />
              <div className="relative flex items-center gap-3">
                <div className="icon-container icon-container-lg rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg group-hover:scale-110 transition-transform">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-medium text-text-primary group-hover:text-primary transition-colors">
                    {t('nav.reports', { defaultValue: 'Custom Reports' })}
                  </h3>
                  <p className="text-xs text-text-tertiary">
                    Build & export reports
                  </p>
                </div>
                <ChevronRight
                  size={16}
                  className="ml-auto text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity"
                />
              </div>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AnalyticsDashboardPage;
