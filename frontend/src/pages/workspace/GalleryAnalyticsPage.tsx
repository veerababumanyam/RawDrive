/**
 * GalleryAnalyticsPage
 *
 * Dedicated page for viewing analytics across all galleries in the workspace.
 * Features:
 * - List of all galleries with analytics summaries
 * - Filtering and sorting capabilities
 * - Individual gallery analytics drill-down
 * - Comparative metrics and charts
 * - Export functionality
 *
 * NOTE: This page is rendered inside WorkspaceLayout which provides
 * the header, sidebar, and main content area structure.
 *
 * Feature: Analytics & Reporting
 * Task: T037 - Create GalleryAnalyticsPage
 */

import { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BarChart3,
  RefreshCw,
  Eye,
  Download,
  Users,
  Image,
  TrendingUp,
  TrendingDown,
  Calendar,
  ChevronRight,
  ChevronLeft,
  ArrowLeft,
  Search,
  SortAsc,
  SortDesc,
  Filter,
  LayoutGrid,
  List,
  Heart,
  Clock,
  ArrowUpDown,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTopGalleries, useQuickStats } from '../../hooks/useAnalytics';
import {
  useGalleryAnalytics,
  useCompareGalleries,
} from '../../hooks/useGalleryAnalytics';
import {
  AnalyticsOverviewCard,
  StatsGrid,
  GalleryAnalyticsPanel,
  AnalyticsChart,
  ViewsOverTimeChart,
  ChartsGrid,
  type DataPoint,
} from '../../components/features/analytics';

/* =============================================================================
   Types
   ============================================================================= */

type PeriodOption = '7d' | '30d' | '90d' | '1y' | 'all';
type SortField = 'views' | 'visitors' | 'downloads' | 'engagement' | 'name';
type SortDirection = 'asc' | 'desc';
type ViewMode = 'grid' | 'list';

interface PeriodConfig {
  value: PeriodOption;
  label: string;
}

interface SortConfig {
  field: SortField;
  direction: SortDirection;
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

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'views', label: 'Total Views' },
  { value: 'visitors', label: 'Unique Visitors' },
  { value: 'downloads', label: 'Downloads' },
  { value: 'engagement', label: 'Engagement' },
  { value: 'name', label: 'Gallery Name' },
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
  const navigate = useNavigate();
  return (
    <div className="text-center py-16">
      <div className="empty-state-icon mx-auto mb-4">
        <Image className="w-8 h-8" />
      </div>
      <p className="text-text-secondary">{message}</p>
      <p className="text-xs text-text-tertiary mt-2">
        Create galleries and share them to start collecting analytics
      </p>
      <button
        onClick={() => navigate('/workspace/galleries/new')}
        className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary-600 transition-colors"
      >
        <Image size={16} />
        Create Gallery
      </button>
    </div>
  );
}

/**
 * Gallery Analytics Card - Grid View
 */
function GalleryAnalyticsCard({
  gallery,
  index,
  onClick,
}: {
  gallery: {
    galleryId: string;
    galleryName?: string;
    totalViews: number;
    uniqueVisitors: number;
    totalDownloads: number;
    totalFavorites?: number;
    engagementRate?: number;
    trendPercentage?: number;
  };
  index: number;
  onClick: () => void;
}) {
  const trendIsPositive = (gallery.trendPercentage ?? 0) >= 0;

  return (
    <div
      onClick={onClick}
      className="group glass-card glass-card-hover rounded-2xl p-4 sm:p-5 cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
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
          <div className="min-w-0">
            <h3 className="font-semibold text-text-primary truncate text-sm sm:text-base group-hover:text-primary transition-colors">
              {gallery.galleryName || 'Untitled Gallery'}
            </h3>
          </div>
        </div>

        {/* Trend Indicator */}
        {gallery.trendPercentage !== undefined && (
          <div
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${
              trendIsPositive
                ? 'bg-green-500/10 text-green-500'
                : 'bg-red-500/10 text-red-500'
            }`}
          >
            {trendIsPositive ? (
              <TrendingUp size={12} />
            ) : (
              <TrendingDown size={12} />
            )}
            {Math.abs(gallery.trendPercentage).toFixed(1)}%
          </div>
        )}
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <Eye size={14} className="text-blue-500" />
          </div>
          <div>
            <p className="text-xs text-text-tertiary">Views</p>
            <p className="text-sm font-semibold text-text-primary tabular-nums">
              {gallery.totalViews.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
            <Users size={14} className="text-purple-500" />
          </div>
          <div>
            <p className="text-xs text-text-tertiary">Visitors</p>
            <p className="text-sm font-semibold text-text-primary tabular-nums">
              {gallery.uniqueVisitors.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
            <Download size={14} className="text-green-500" />
          </div>
          <div>
            <p className="text-xs text-text-tertiary">Downloads</p>
            <p className="text-sm font-semibold text-text-primary tabular-nums">
              {gallery.totalDownloads.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-pink-500/10 flex items-center justify-center">
            <Heart size={14} className="text-pink-500" />
          </div>
          <div>
            <p className="text-xs text-text-tertiary">Favorites</p>
            <p className="text-sm font-semibold text-text-primary tabular-nums">
              {(gallery.totalFavorites ?? 0).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* View Details Link */}
      <div className="mt-4 pt-3 border-t border-border/50">
        <span className="text-xs font-medium text-primary flex items-center gap-1 group-hover:gap-2 transition-all">
          View Details
          <ChevronRight size={14} />
        </span>
      </div>
    </div>
  );
}

/**
 * Gallery Analytics Row - List View
 */
function GalleryAnalyticsRow({
  gallery,
  index,
  onClick,
}: {
  gallery: {
    galleryId: string;
    galleryName?: string;
    totalViews: number;
    uniqueVisitors: number;
    totalDownloads: number;
    totalFavorites?: number;
    engagementRate?: number;
    trendPercentage?: number;
  };
  index: number;
  onClick: () => void;
}) {
  const trendIsPositive = (gallery.trendPercentage ?? 0) >= 0;

  return (
    <div
      onClick={onClick}
      className="group row-hover p-3 sm:p-4 cursor-pointer border-b border-border/50 last:border-0"
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
        </div>

        {/* Metrics */}
        <div className="hidden sm:flex items-center gap-6 text-sm">
          <div className="text-center min-w-[60px]">
            <p className="font-semibold text-text-primary tabular-nums">
              {gallery.totalViews.toLocaleString()}
            </p>
            <p className="text-xs text-text-tertiary">Views</p>
          </div>
          <div className="text-center min-w-[60px]">
            <p className="font-semibold text-text-primary tabular-nums">
              {gallery.uniqueVisitors.toLocaleString()}
            </p>
            <p className="text-xs text-text-tertiary">Visitors</p>
          </div>
          <div className="text-center min-w-[60px]">
            <p className="font-semibold text-text-primary tabular-nums">
              {gallery.totalDownloads.toLocaleString()}
            </p>
            <p className="text-xs text-text-tertiary">Downloads</p>
          </div>
        </div>

        {/* Mobile Metrics */}
        <div className="flex sm:hidden items-center gap-4 text-xs text-text-tertiary">
          <span className="flex items-center gap-1">
            <Eye size={12} />
            {gallery.totalViews.toLocaleString()}
          </span>
          <span className="flex items-center gap-1">
            <Users size={12} />
            {gallery.uniqueVisitors.toLocaleString()}
          </span>
        </div>

        {/* Trend Indicator */}
        {gallery.trendPercentage !== undefined && (
          <div
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${
              trendIsPositive
                ? 'bg-green-500/10 text-green-500'
                : 'bg-red-500/10 text-red-500'
            }`}
          >
            {trendIsPositive ? (
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
  );
}

/* =============================================================================
   Gallery Detail View Component
   ============================================================================= */

function GalleryDetailView({
  galleryId,
  onBack,
  period,
}: {
  galleryId: string;
  onBack: () => void;
  period: PeriodOption;
}) {
  const { t } = useTranslation(['analytics', 'common']);
  const navigate = useNavigate();

  // Convert period to date range
  const dateRange = useMemo(() => {
    const endDate = new Date();
    let startDate: Date | undefined;

    switch (period) {
      case '7d':
        startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        startDate = new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      case 'all':
      default:
        startDate = undefined;
    }

    return { startDate, endDate };
  }, [period]);

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
      >
        <ArrowLeft size={16} />
        Back to Gallery List
      </button>

      {/* Gallery Analytics Panel */}
      <GalleryAnalyticsPanel
        galleryId={galleryId}
        dateRange={dateRange}
        autoRefresh
        showTabs
        onViewFullAnalytics={() => navigate(`/workspace/galleries/${galleryId}`)}
      />
    </div>
  );
}

/* =============================================================================
   Main Component
   ============================================================================= */

const GalleryAnalyticsPage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation(['analytics', 'common']);
  const { workspace } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // State from URL params
  const selectedGalleryId = searchParams.get('gallery');

  // Local State
  const [period, setPeriod] = useState<PeriodOption>('30d');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    field: 'views',
    direction: 'desc',
  });
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  // Fetch top galleries data
  const {
    galleries,
    isLoading: isLoadingGalleries,
    isError,
    error,
    refetch: refetchGalleries,
  } = useTopGalleries({
    period,
    limit: 100, // Get more galleries for the full list
    enabled: !!workspace?.workspace_id,
  });

  // Fetch workspace quick stats for summary
  const { stats: quickStats, isLoading: isLoadingStats } = useQuickStats({
    period,
    enabled: !!workspace?.workspace_id,
  });

  // Filter and sort galleries
  const filteredAndSortedGalleries = useMemo(() => {
    let result = [...galleries];

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((g) =>
        (g.galleryName || 'Untitled Gallery').toLowerCase().includes(query)
      );
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortConfig.field) {
        case 'views':
          comparison = a.totalViews - b.totalViews;
          break;
        case 'visitors':
          comparison = a.uniqueVisitors - b.uniqueVisitors;
          break;
        case 'downloads':
          comparison = a.totalDownloads - b.totalDownloads;
          break;
        case 'engagement':
          comparison = (a.trendPercentage ?? 0) - (b.trendPercentage ?? 0);
          break;
        case 'name':
          comparison = (a.galleryName || '').localeCompare(b.galleryName || '');
          break;
      }
      return sortConfig.direction === 'desc' ? -comparison : comparison;
    });

    return result;
  }, [galleries, searchQuery, sortConfig]);

  // Summary stats
  const summaryStats = useMemo(() => {
    const totalViews = galleries.reduce((sum, g) => sum + g.totalViews, 0);
    const totalVisitors = galleries.reduce((sum, g) => sum + g.uniqueVisitors, 0);
    const totalDownloads = galleries.reduce((sum, g) => sum + g.totalDownloads, 0);
    const avgEngagement =
      galleries.length > 0
        ? galleries.reduce((sum, g) => sum + (g.trendPercentage ?? 0), 0) /
          galleries.length
        : 0;

    return {
      totalGalleries: galleries.length,
      totalViews,
      totalVisitors,
      totalDownloads,
      avgEngagement,
    };
  }, [galleries]);

  // Handlers
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetchGalleries();
    } finally {
      setIsRefreshing(false);
    }
  }, [refetchGalleries]);

  const handlePeriodChange = useCallback((newPeriod: PeriodOption) => {
    setPeriod(newPeriod);
  }, []);

  const handleGalleryClick = useCallback(
    (galleryId: string) => {
      setSearchParams({ gallery: galleryId });
    },
    [setSearchParams]
  );

  const handleBackToList = useCallback(() => {
    setSearchParams({});
  }, [setSearchParams]);

  const handleSortChange = useCallback((field: SortField) => {
    setSortConfig((prev) => ({
      field,
      direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  }, []);

  // If a gallery is selected, show detail view
  if (selectedGalleryId) {
    return (
      <div className="h-full overflow-auto bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <GalleryDetailView
            galleryId={selectedGalleryId}
            onBack={handleBackToList}
            period={period}
          />
        </main>
      </div>
    );
  }

  // Initial loading state
  if (isLoadingGalleries && galleries.length === 0) {
    return (
      <div className="h-full overflow-auto bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
        <LoadingSpinner />
      </div>
    );
  }

  // Error state
  if (isError && galleries.length === 0) {
    return (
      <div className="h-full overflow-auto bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
        <ErrorState
          message={error?.message || 'Failed to load gallery analytics'}
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
            <div className="flex items-center gap-3">
              {/* Back to Dashboard */}
              <button
                onClick={() => navigate('/workspace/analytics')}
                className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-gradient">
                  {t('galleryAnalytics.title', { defaultValue: 'Gallery Analytics' })}
                </h1>
                <p className="text-sm text-text-secondary hidden sm:block mt-0.5">
                  {t('galleryAnalytics.subtitle', {
                    defaultValue: 'Performance metrics for all your galleries',
                  })}
                </p>
              </div>
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
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Summary Stats */}
        <StatsGrid columns={4}>
          <AnalyticsOverviewCard
            title={t('stats.totalGalleries', { defaultValue: 'Total Galleries' })}
            value={summaryStats.totalGalleries}
            metricType="galleries"
            isLoading={isLoadingGalleries}
          />
          <AnalyticsOverviewCard
            title={t('stats.totalViews', { defaultValue: 'Total Views' })}
            value={summaryStats.totalViews}
            change={quickStats?.trends?.viewsChange}
            changeIsPositive={(quickStats?.trends?.viewsChange ?? 0) >= 0}
            metricType="views"
            isLoading={isLoadingGalleries || isLoadingStats}
          />
          <AnalyticsOverviewCard
            title={t('stats.uniqueVisitors', { defaultValue: 'Unique Visitors' })}
            value={summaryStats.totalVisitors}
            change={quickStats?.trends?.visitorsChange}
            changeIsPositive={(quickStats?.trends?.visitorsChange ?? 0) >= 0}
            icon={Users}
            iconColor="text-purple-500"
            iconBgColor="bg-purple-500/10"
            isLoading={isLoadingGalleries || isLoadingStats}
          />
          <AnalyticsOverviewCard
            title={t('stats.totalDownloads', { defaultValue: 'Total Downloads' })}
            value={summaryStats.totalDownloads}
            change={quickStats?.trends?.downloadsChange}
            changeIsPositive={(quickStats?.trends?.downloadsChange ?? 0) >= 0}
            metricType="downloads"
            isLoading={isLoadingGalleries || isLoadingStats}
          />
        </StatsGrid>

        {/* Toolbar */}
        <div className="glass-card rounded-2xl p-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search galleries..."
                className="w-full pl-9 pr-4 py-2 rounded-lg bg-surface-elevated border border-border/50 text-text-primary text-sm placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-tertiary hidden sm:inline">Sort by:</span>
              <select
                value={sortConfig.field}
                onChange={(e) => handleSortChange(e.target.value as SortField)}
                className="appearance-none px-3 py-2 pr-8 rounded-lg bg-surface-elevated border border-border/50 text-text-primary text-sm cursor-pointer hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() =>
                  setSortConfig((prev) => ({
                    ...prev,
                    direction: prev.direction === 'desc' ? 'asc' : 'desc',
                  }))
                }
                className="p-2 rounded-lg bg-surface-elevated border border-border/50 text-text-secondary hover:text-primary hover:border-primary/50 transition-all"
                aria-label={`Sort ${sortConfig.direction === 'desc' ? 'ascending' : 'descending'}`}
              >
                {sortConfig.direction === 'desc' ? (
                  <SortDesc size={16} />
                ) : (
                  <SortAsc size={16} />
                )}
              </button>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 p-1 rounded-lg bg-surface-elevated border border-border/50">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-md transition-all ${
                  viewMode === 'grid'
                    ? 'bg-primary text-white'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
                aria-label="Grid view"
              >
                <LayoutGrid size={16} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-md transition-all ${
                  viewMode === 'list'
                    ? 'bg-primary text-white'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
                aria-label="List view"
              >
                <List size={16} />
              </button>
            </div>
          </div>

          {/* Results Count */}
          <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between text-sm">
            <span className="text-text-tertiary">
              {filteredAndSortedGalleries.length} of {galleries.length} galleries
              {searchQuery && ` matching "${searchQuery}"`}
            </span>
          </div>
        </div>

        {/* Gallery List */}
        {filteredAndSortedGalleries.length === 0 ? (
          searchQuery ? (
            <div className="glass-card rounded-2xl p-8 text-center">
              <div className="empty-state-icon mx-auto mb-4">
                <Search className="w-8 h-8" />
              </div>
              <p className="text-text-secondary">No galleries match your search</p>
              <button
                onClick={() => setSearchQuery('')}
                className="mt-3 text-sm text-primary hover:text-primary-600"
              >
                Clear search
              </button>
            </div>
          ) : (
            <div className="glass-card rounded-2xl p-8">
              <EmptyState message="No galleries with analytics data yet" />
            </div>
          )
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {filteredAndSortedGalleries.map((gallery, index) => (
              <GalleryAnalyticsCard
                key={gallery.galleryId}
                gallery={gallery}
                index={index}
                onClick={() => handleGalleryClick(gallery.galleryId)}
              />
            ))}
          </div>
        ) : (
          <div className="glass-card rounded-2xl overflow-hidden">
            {/* List Header */}
            <div className="hidden sm:grid grid-cols-[auto_1fr_repeat(3,60px)_80px_auto] gap-4 px-4 py-3 bg-surface-elevated border-b border-border/50 text-xs font-medium text-text-tertiary">
              <span className="w-8">#</span>
              <span>Gallery</span>
              <span className="text-center">Views</span>
              <span className="text-center">Visitors</span>
              <span className="text-center">Downloads</span>
              <span className="text-center">Trend</span>
              <span></span>
            </div>
            {filteredAndSortedGalleries.map((gallery, index) => (
              <GalleryAnalyticsRow
                key={gallery.galleryId}
                gallery={gallery}
                index={index}
                onClick={() => handleGalleryClick(gallery.galleryId)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default GalleryAnalyticsPage;
