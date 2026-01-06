/**
 * useGalleryAnalytics Hook
 * Custom hooks for fetching and managing gallery-specific analytics data
 *
 * Feature: Analytics & Reporting
 * Task: T029 - Create useGalleryAnalytics hook
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  analyticsService,
  DateRangeParams,
  PeriodParams,
  GalleryViewsTimeSeriesParams,
  GalleryAnalyticsHistoryParams,
  CalculateGalleryAnalyticsParams,
  CompareGalleriesParams,
  GalleryAnalyticsDetailsResponse,
  GalleryAnalyticsSummaryResponse,
  GalleryViewsTimeSeriesResponse,
  GalleryEngagementBreakdown,
  GalleryAnalyticsHistoryResponse,
  GalleriesComparisonResponse,
  DailyViewsEntry,
  GalleryHistoryEntry,
  GalleryComparisonEntry,
} from '../services/analyticsService';

// ---------------------------------------------------------------------------
// Cache Configuration
// ---------------------------------------------------------------------------

/** Cache TTL in milliseconds (5 minutes) */
const CACHE_TTL = 5 * 60 * 1000;

/** Auto-refresh interval for gallery analytics (5 minutes) */
const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000;

// In-memory caches for gallery analytics data
const galleryDetailsCache = new Map<string, { data: GalleryAnalyticsDetailsResponse; timestamp: number }>();
const gallerySummaryCache = new Map<string, { data: GalleryAnalyticsSummaryResponse; timestamp: number }>();
const galleryTimeSeriesCache = new Map<string, { data: GalleryViewsTimeSeriesResponse; timestamp: number }>();
const galleryEngagementCache = new Map<string, { data: GalleryEngagementBreakdown; timestamp: number }>();
const galleryHistoryCache = new Map<string, { data: GalleryAnalyticsHistoryResponse; timestamp: number }>();

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Generate a cache key from workspace ID, gallery ID, and params
 */
function generateCacheKey(workspaceId: string, galleryId: string, params?: object): string {
  const base = `${workspaceId}:${galleryId}`;
  if (!params) return base;
  return `${base}:${JSON.stringify(params)}`;
}

/**
 * Check if cached data is still valid
 */
function isCacheValid<T>(cache: Map<string, { data: T; timestamp: number }>, key: string): boolean {
  const cached = cache.get(key);
  if (!cached) return false;
  return Date.now() - cached.timestamp < CACHE_TTL;
}

/**
 * Get cached data if valid
 */
function getCached<T>(cache: Map<string, { data: T; timestamp: number }>, key: string): T | null {
  if (isCacheValid(cache, key)) {
    return cache.get(key)!.data;
  }
  return null;
}

/**
 * Set cached data with timestamp
 */
function setCache<T>(cache: Map<string, { data: T; timestamp: number }>, key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

// ---------------------------------------------------------------------------
// useGalleryAnalyticsDetails Hook
// ---------------------------------------------------------------------------

export interface UseGalleryAnalyticsDetailsOptions extends DateRangeParams {
  /** Gallery ID to fetch analytics for */
  galleryId: string;
  /** Whether to auto-fetch on mount (default: true) */
  enabled?: boolean;
  /** Enable auto-refresh interval (default: true) */
  autoRefresh?: boolean;
  /** Custom refresh interval in milliseconds */
  refreshInterval?: number;
}

export interface UseGalleryAnalyticsDetailsReturn {
  /** Comprehensive gallery analytics data */
  analytics: GalleryAnalyticsDetailsResponse | null;
  /** Loading state */
  isLoading: boolean;
  /** Fetching state (for background refreshes) */
  isFetching: boolean;
  /** Error state */
  isError: boolean;
  /** Error object */
  error: Error | null;
  /** Refetch function */
  refetch: (forceRefresh?: boolean) => Promise<void>;
  /** Derived metrics for convenience */
  totalViews: number;
  uniqueVisitors: number;
  totalDownloads: number;
  totalFavorites: number;
  totalComments: number;
  engagementRate: number;
  avgSessionDuration: number;
}

/**
 * Hook for fetching comprehensive analytics for a specific gallery
 */
export function useGalleryAnalyticsDetails(
  options: UseGalleryAnalyticsDetailsOptions
): UseGalleryAnalyticsDetailsReturn {
  const { workspace } = useAuth();
  const workspaceId = workspace?.workspace_id;

  const {
    galleryId,
    enabled = true,
    autoRefresh = true,
    refreshInterval = AUTO_REFRESH_INTERVAL,
    startDate,
    endDate,
  } = options;

  const [analytics, setAnalytics] = useState<GalleryAnalyticsDetailsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const isMountedRef = useRef(true);
  const intervalRef = useRef<number | null>(null);
  const shouldStopFetching = useRef(false);

  const fetchAnalytics = useCallback(
    async (forceRefresh = false) => {
      if (!workspaceId || !galleryId || !enabled || shouldStopFetching.current) {
        setIsLoading(false);
        return;
      }

      const params: DateRangeParams = { startDate, endDate };
      const cacheKey = generateCacheKey(workspaceId, galleryId, params);

      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cached = getCached(galleryDetailsCache, cacheKey);
        if (cached) {
          setAnalytics(cached);
          setIsLoading(false);
          return;
        }
      }

      setIsFetching(true);
      if (!analytics) setIsLoading(true);

      try {
        const data = await analyticsService.getGalleryAnalyticsDetails(workspaceId, galleryId, params);
        if (isMountedRef.current) {
          setAnalytics(data);
          setCache(galleryDetailsCache, cacheKey, data);
          setIsError(false);
          setError(null);
        }
      } catch (err) {
        if (isMountedRef.current) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          // Stop fetching on auth errors
          if (errorMessage.includes('401') || errorMessage.toLowerCase().includes('unauthorized')) {
            shouldStopFetching.current = true;
            setIsLoading(false);
            setIsFetching(false);
            return;
          }
          setIsError(true);
          setError(err instanceof Error ? err : new Error('Failed to fetch gallery analytics'));
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
          setIsFetching(false);
        }
      }
    },
    [workspaceId, galleryId, enabled, startDate, endDate, analytics]
  );

  // Initial fetch
  useEffect(() => {
    isMountedRef.current = true;
    fetchAnalytics();
    return () => {
      isMountedRef.current = false;
    };
  }, [fetchAnalytics]);

  // Auto-refresh interval
  useEffect(() => {
    if (autoRefresh && enabled && workspaceId && galleryId && refreshInterval > 0) {
      intervalRef.current = window.setInterval(() => {
        fetchAnalytics();
      }, refreshInterval);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [autoRefresh, enabled, workspaceId, galleryId, refreshInterval, fetchAnalytics]);

  return {
    analytics,
    isLoading,
    isFetching,
    isError,
    error,
    refetch: fetchAnalytics,
    // Derived values for convenience
    totalViews: analytics?.summary?.totalViews ?? 0,
    uniqueVisitors: analytics?.summary?.uniqueVisitors ?? 0,
    totalDownloads: analytics?.summary?.totalDownloads ?? 0,
    totalFavorites: analytics?.summary?.totalFavorites ?? 0,
    totalComments: analytics?.summary?.totalComments ?? 0,
    engagementRate: analytics?.engagement?.engagementRate ?? 0,
    avgSessionDuration: analytics?.summary?.avgSessionDurationMs ?? 0,
  };
}

// ---------------------------------------------------------------------------
// useGalleryAnalyticsSummary Hook
// ---------------------------------------------------------------------------

export interface UseGalleryAnalyticsSummaryOptions extends PeriodParams {
  /** Gallery ID to fetch analytics for */
  galleryId: string;
  /** Whether to auto-fetch on mount (default: true) */
  enabled?: boolean;
}

export interface UseGalleryAnalyticsSummaryReturn {
  /** Simple gallery analytics summary */
  summary: GalleryAnalyticsSummaryResponse | null;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  isError: boolean;
  /** Error object */
  error: Error | null;
  /** Refetch function */
  refetch: (forceRefresh?: boolean) => Promise<void>;
  /** Derived metrics for convenience */
  totalViews: number;
  uniqueVisitors: number;
  totalDownloads: number;
  engagementScore: number;
}

/**
 * Hook for fetching a simple analytics summary for a gallery
 */
export function useGalleryAnalyticsSummary(
  options: UseGalleryAnalyticsSummaryOptions
): UseGalleryAnalyticsSummaryReturn {
  const { workspace } = useAuth();
  const workspaceId = workspace?.workspace_id;

  const { galleryId, enabled = true, periodType = 'all_time' } = options;

  const [summary, setSummary] = useState<GalleryAnalyticsSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const isMountedRef = useRef(true);

  const fetchSummary = useCallback(
    async (forceRefresh = false) => {
      if (!workspaceId || !galleryId || !enabled) {
        setIsLoading(false);
        return;
      }

      const params: PeriodParams = { periodType };
      const cacheKey = generateCacheKey(workspaceId, galleryId, params);

      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cached = getCached(gallerySummaryCache, cacheKey);
        if (cached) {
          setSummary(cached);
          setIsLoading(false);
          return;
        }
      }

      setIsLoading(true);

      try {
        const data = await analyticsService.getGalleryAnalyticsSummary(workspaceId, galleryId, params);
        if (isMountedRef.current) {
          setSummary(data);
          setCache(gallerySummaryCache, cacheKey, data);
          setIsError(false);
          setError(null);
        }
      } catch (err) {
        if (isMountedRef.current) {
          setIsError(true);
          setError(err instanceof Error ? err : new Error('Failed to fetch gallery analytics summary'));
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [workspaceId, galleryId, enabled, periodType]
  );

  // Initial fetch
  useEffect(() => {
    isMountedRef.current = true;
    fetchSummary();
    return () => {
      isMountedRef.current = false;
    };
  }, [fetchSummary]);

  return {
    summary,
    isLoading,
    isError,
    error,
    refetch: fetchSummary,
    // Derived values for convenience
    totalViews: summary?.totalViews ?? 0,
    uniqueVisitors: summary?.uniqueVisitors ?? 0,
    totalDownloads: summary?.totalDownloads ?? 0,
    engagementScore: summary?.engagementScore ?? 0,
  };
}

// ---------------------------------------------------------------------------
// useGalleryViewsTimeSeries Hook
// ---------------------------------------------------------------------------

export interface UseGalleryViewsTimeSeriesOptions extends GalleryViewsTimeSeriesParams {
  /** Gallery ID to fetch time series for */
  galleryId: string;
  /** Whether to auto-fetch on mount (default: true) */
  enabled?: boolean;
}

export interface UseGalleryViewsTimeSeriesReturn {
  /** Time series data */
  timeSeries: GalleryViewsTimeSeriesResponse | null;
  /** Data points for chart rendering */
  dataPoints: DailyViewsEntry[];
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  isError: boolean;
  /** Error object */
  error: Error | null;
  /** Refetch function */
  refetch: (forceRefresh?: boolean) => Promise<void>;
  /** Summary metrics */
  totalViews: number;
  totalUniqueVisitors: number;
  avgDailyViews: number;
  peakDate: string | null;
  peakViews: number;
}

/**
 * Hook for fetching gallery views time series data (for charts)
 */
export function useGalleryViewsTimeSeries(
  options: UseGalleryViewsTimeSeriesOptions
): UseGalleryViewsTimeSeriesReturn {
  const { workspace } = useAuth();
  const workspaceId = workspace?.workspace_id;

  const { galleryId, enabled = true, startDate, endDate, granularity = 'daily' } = options;

  const [timeSeries, setTimeSeries] = useState<GalleryViewsTimeSeriesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const isMountedRef = useRef(true);

  const fetchTimeSeries = useCallback(
    async (forceRefresh = false) => {
      if (!workspaceId || !galleryId || !enabled) {
        setIsLoading(false);
        return;
      }

      const params: GalleryViewsTimeSeriesParams = { startDate, endDate, granularity };
      const cacheKey = generateCacheKey(workspaceId, galleryId, params);

      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cached = getCached(galleryTimeSeriesCache, cacheKey);
        if (cached) {
          setTimeSeries(cached);
          setIsLoading(false);
          return;
        }
      }

      setIsLoading(true);

      try {
        const data = await analyticsService.getGalleryViewsTimeSeries(workspaceId, galleryId, params);
        if (isMountedRef.current) {
          setTimeSeries(data);
          setCache(galleryTimeSeriesCache, cacheKey, data);
          setIsError(false);
          setError(null);
        }
      } catch (err) {
        if (isMountedRef.current) {
          setIsError(true);
          setError(err instanceof Error ? err : new Error('Failed to fetch gallery views time series'));
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [workspaceId, galleryId, enabled, startDate, endDate, granularity]
  );

  // Initial fetch
  useEffect(() => {
    isMountedRef.current = true;
    fetchTimeSeries();
    return () => {
      isMountedRef.current = false;
    };
  }, [fetchTimeSeries]);

  return {
    timeSeries,
    dataPoints: timeSeries?.dataPoints ?? [],
    isLoading,
    isError,
    error,
    refetch: fetchTimeSeries,
    // Summary metrics
    totalViews: timeSeries?.summary?.totalViews ?? 0,
    totalUniqueVisitors: timeSeries?.summary?.totalUniqueVisitors ?? 0,
    avgDailyViews: timeSeries?.summary?.avgDailyViews ?? 0,
    peakDate: timeSeries?.summary?.peakDate ?? null,
    peakViews: timeSeries?.summary?.peakViews ?? 0,
  };
}

// ---------------------------------------------------------------------------
// useGalleryEngagement Hook
// ---------------------------------------------------------------------------

export interface UseGalleryEngagementOptions extends DateRangeParams {
  /** Gallery ID to fetch engagement for */
  galleryId: string;
  /** Whether to auto-fetch on mount (default: true) */
  enabled?: boolean;
}

export interface UseGalleryEngagementReturn {
  /** Engagement breakdown data */
  engagement: GalleryEngagementBreakdown | null;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  isError: boolean;
  /** Error object */
  error: Error | null;
  /** Refetch function */
  refetch: (forceRefresh?: boolean) => Promise<void>;
  /** Derived metrics for convenience */
  totalEngagement: number;
  engagementRate: number;
  favoritesCount: number;
  commentsCount: number;
  selectionsCount: number;
  downloadsCount: number;
  sharesCount: number;
}

/**
 * Hook for fetching gallery engagement breakdown
 */
export function useGalleryEngagement(
  options: UseGalleryEngagementOptions
): UseGalleryEngagementReturn {
  const { workspace } = useAuth();
  const workspaceId = workspace?.workspace_id;

  const { galleryId, enabled = true, startDate, endDate } = options;

  const [engagement, setEngagement] = useState<GalleryEngagementBreakdown | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const isMountedRef = useRef(true);

  const fetchEngagement = useCallback(
    async (forceRefresh = false) => {
      if (!workspaceId || !galleryId || !enabled) {
        setIsLoading(false);
        return;
      }

      const params: DateRangeParams = { startDate, endDate };
      const cacheKey = generateCacheKey(workspaceId, galleryId, params);

      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cached = getCached(galleryEngagementCache, cacheKey);
        if (cached) {
          setEngagement(cached);
          setIsLoading(false);
          return;
        }
      }

      setIsLoading(true);

      try {
        const data = await analyticsService.getGalleryEngagementBreakdown(workspaceId, galleryId, params);
        if (isMountedRef.current) {
          setEngagement(data);
          setCache(galleryEngagementCache, cacheKey, data);
          setIsError(false);
          setError(null);
        }
      } catch (err) {
        if (isMountedRef.current) {
          setIsError(true);
          setError(err instanceof Error ? err : new Error('Failed to fetch gallery engagement'));
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [workspaceId, galleryId, enabled, startDate, endDate]
  );

  // Initial fetch
  useEffect(() => {
    isMountedRef.current = true;
    fetchEngagement();
    return () => {
      isMountedRef.current = false;
    };
  }, [fetchEngagement]);

  return {
    engagement,
    isLoading,
    isError,
    error,
    refetch: fetchEngagement,
    // Derived metrics for convenience
    totalEngagement: engagement?.totalEngagement ?? 0,
    engagementRate: engagement?.engagementRate ?? 0,
    favoritesCount: engagement?.favorites?.count ?? 0,
    commentsCount: engagement?.comments?.count ?? 0,
    selectionsCount: engagement?.selections?.count ?? 0,
    downloadsCount: engagement?.downloads?.count ?? 0,
    sharesCount: engagement?.shares?.count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// useGalleryAnalyticsHistory Hook
// ---------------------------------------------------------------------------

export interface UseGalleryAnalyticsHistoryOptions extends GalleryAnalyticsHistoryParams {
  /** Gallery ID to fetch history for */
  galleryId: string;
  /** Whether to auto-fetch on mount (default: true) */
  enabled?: boolean;
}

export interface UseGalleryAnalyticsHistoryReturn {
  /** Analytics history data */
  history: GalleryAnalyticsHistoryResponse | null;
  /** History entries for chart/table rendering */
  entries: GalleryHistoryEntry[];
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  isError: boolean;
  /** Error object */
  error: Error | null;
  /** Refetch function */
  refetch: (forceRefresh?: boolean) => Promise<void>;
}

/**
 * Hook for fetching gallery analytics history over time
 */
export function useGalleryAnalyticsHistory(
  options: UseGalleryAnalyticsHistoryOptions
): UseGalleryAnalyticsHistoryReturn {
  const { workspace } = useAuth();
  const workspaceId = workspace?.workspace_id;

  const { galleryId, enabled = true, periodType = 'daily', startDate, endDate, limit } = options;

  const [history, setHistory] = useState<GalleryAnalyticsHistoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const isMountedRef = useRef(true);

  const fetchHistory = useCallback(
    async (forceRefresh = false) => {
      if (!workspaceId || !galleryId || !enabled) {
        setIsLoading(false);
        return;
      }

      const params: GalleryAnalyticsHistoryParams = { periodType, startDate, endDate, limit };
      const cacheKey = generateCacheKey(workspaceId, galleryId, params);

      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cached = getCached(galleryHistoryCache, cacheKey);
        if (cached) {
          setHistory(cached);
          setIsLoading(false);
          return;
        }
      }

      setIsLoading(true);

      try {
        const data = await analyticsService.getGalleryAnalyticsHistory(workspaceId, galleryId, params);
        if (isMountedRef.current) {
          setHistory(data);
          setCache(galleryHistoryCache, cacheKey, data);
          setIsError(false);
          setError(null);
        }
      } catch (err) {
        if (isMountedRef.current) {
          setIsError(true);
          setError(err instanceof Error ? err : new Error('Failed to fetch gallery analytics history'));
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [workspaceId, galleryId, enabled, periodType, startDate, endDate, limit]
  );

  // Initial fetch
  useEffect(() => {
    isMountedRef.current = true;
    fetchHistory();
    return () => {
      isMountedRef.current = false;
    };
  }, [fetchHistory]);

  return {
    history,
    entries: history?.history ?? [],
    isLoading,
    isError,
    error,
    refetch: fetchHistory,
  };
}

// ---------------------------------------------------------------------------
// useCalculateGalleryAnalytics Hook
// ---------------------------------------------------------------------------

export interface UseCalculateGalleryAnalyticsOptions {
  /** Gallery ID to calculate analytics for */
  galleryId: string;
}

export interface UseCalculateGalleryAnalyticsReturn {
  /** Trigger analytics calculation */
  calculate: (params?: CalculateGalleryAnalyticsParams) => Promise<void>;
  /** Loading state */
  isCalculating: boolean;
  /** Error state */
  isError: boolean;
  /** Error object */
  error: Error | null;
  /** Last calculation result */
  result: {
    status: string;
    galleryId: string;
    periodType: string;
    calculatedAt: string;
  } | null;
}

/**
 * Hook for triggering analytics calculation for a gallery
 */
export function useCalculateGalleryAnalytics(
  options: UseCalculateGalleryAnalyticsOptions
): UseCalculateGalleryAnalyticsReturn {
  const { workspace } = useAuth();
  const workspaceId = workspace?.workspace_id;

  const { galleryId } = options;

  const [isCalculating, setIsCalculating] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<UseCalculateGalleryAnalyticsReturn['result']>(null);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const calculate = useCallback(
    async (params: CalculateGalleryAnalyticsParams = {}) => {
      if (!workspaceId || !galleryId) {
        return;
      }

      setIsCalculating(true);
      setIsError(false);
      setError(null);

      try {
        const data = await analyticsService.calculateGalleryAnalytics(workspaceId, galleryId, params);
        if (isMountedRef.current) {
          setResult({
            status: data.status,
            galleryId: data.galleryId,
            periodType: data.periodType,
            calculatedAt: data.calculatedAt,
          });

          // Invalidate caches for this gallery
          invalidateGalleryAnalyticsCache(workspaceId, galleryId);
        }
      } catch (err) {
        if (isMountedRef.current) {
          setIsError(true);
          setError(err instanceof Error ? err : new Error('Failed to calculate gallery analytics'));
        }
      } finally {
        if (isMountedRef.current) {
          setIsCalculating(false);
        }
      }
    },
    [workspaceId, galleryId]
  );

  return {
    calculate,
    isCalculating,
    isError,
    error,
    result,
  };
}

// ---------------------------------------------------------------------------
// useCompareGalleries Hook
// ---------------------------------------------------------------------------

export interface UseCompareGalleriesOptions extends Omit<CompareGalleriesParams, 'galleryIds'> {
  /** Gallery IDs to compare */
  galleryIds: string[];
  /** Whether to auto-fetch on mount (default: true) */
  enabled?: boolean;
}

export interface UseCompareGalleriesReturn {
  /** Comparison data */
  comparison: GalleriesComparisonResponse | null;
  /** Gallery comparison entries */
  galleries: GalleryComparisonEntry[];
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  isError: boolean;
  /** Error object */
  error: Error | null;
  /** Refetch function */
  refetch: () => Promise<void>;
}

/**
 * Hook for comparing analytics across multiple galleries
 */
export function useCompareGalleries(
  options: UseCompareGalleriesOptions
): UseCompareGalleriesReturn {
  const { workspace } = useAuth();
  const workspaceId = workspace?.workspace_id;

  const { galleryIds, enabled = true, startDate, endDate } = options;

  const [comparison, setComparison] = useState<GalleriesComparisonResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const isMountedRef = useRef(true);

  const fetchComparison = useCallback(async () => {
    if (!workspaceId || !enabled || galleryIds.length < 2) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const data = await analyticsService.compareGalleries(workspaceId, {
        galleryIds,
        startDate,
        endDate,
      });
      if (isMountedRef.current) {
        setComparison(data);
        setIsError(false);
        setError(null);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setIsError(true);
        setError(err instanceof Error ? err : new Error('Failed to compare galleries'));
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [workspaceId, enabled, galleryIds, startDate, endDate]);

  // Initial fetch
  useEffect(() => {
    isMountedRef.current = true;
    fetchComparison();
    return () => {
      isMountedRef.current = false;
    };
  }, [fetchComparison]);

  return {
    comparison,
    galleries: comparison?.galleries ?? [],
    isLoading,
    isError,
    error,
    refetch: fetchComparison,
  };
}

// ---------------------------------------------------------------------------
// useGalleryAnalytics Combined Hook
// ---------------------------------------------------------------------------

export interface UseGalleryAnalyticsOptions {
  /** Gallery ID to fetch analytics for */
  galleryId: string;
  /** Date range for metrics */
  startDate?: string | Date;
  endDate?: string | Date;
  /** Period type for summary */
  periodType?: 'daily' | 'weekly' | 'monthly' | 'all_time';
  /** Granularity for time series */
  granularity?: 'daily' | 'weekly' | 'monthly';
  /** Whether to auto-fetch on mount (default: true) */
  enabled?: boolean;
  /** Enable auto-refresh interval (default: true) */
  autoRefresh?: boolean;
}

export interface UseGalleryAnalyticsReturn {
  /** Comprehensive gallery analytics */
  analytics: GalleryAnalyticsDetailsResponse | null;
  /** Views time series data */
  timeSeries: GalleryViewsTimeSeriesResponse | null;
  /** Engagement breakdown */
  engagement: GalleryEngagementBreakdown | null;
  /** Loading states */
  isLoading: boolean;
  isLoadingAnalytics: boolean;
  isLoadingTimeSeries: boolean;
  isLoadingEngagement: boolean;
  /** Error states */
  isError: boolean;
  errors: {
    analytics: Error | null;
    timeSeries: Error | null;
    engagement: Error | null;
  };
  /** Summary metrics */
  totalViews: number;
  uniqueVisitors: number;
  totalDownloads: number;
  totalFavorites: number;
  totalComments: number;
  engagementRate: number;
  avgSessionDuration: number;
  /** Time series data points */
  viewsDataPoints: DailyViewsEntry[];
  /** Refetch all data */
  refetchAll: () => Promise<void>;
}

/**
 * Combined hook for fetching all gallery analytics data
 * Provides a unified interface for the gallery analytics page/panel
 */
export function useGalleryAnalytics(
  options: UseGalleryAnalyticsOptions
): UseGalleryAnalyticsReturn {
  const {
    galleryId,
    startDate,
    endDate,
    periodType = 'all_time',
    granularity = 'daily',
    enabled = true,
    autoRefresh = true,
  } = options;

  // Use individual hooks for each data type
  const analyticsHook = useGalleryAnalyticsDetails({
    galleryId,
    enabled,
    autoRefresh,
    startDate,
    endDate,
  });

  const timeSeriesHook = useGalleryViewsTimeSeries({
    galleryId,
    enabled,
    startDate,
    endDate,
    granularity,
  });

  const engagementHook = useGalleryEngagement({
    galleryId,
    enabled,
    startDate,
    endDate,
  });

  // Combined loading state
  const isLoading =
    analyticsHook.isLoading ||
    timeSeriesHook.isLoading ||
    engagementHook.isLoading;

  // Combined error state
  const isError =
    analyticsHook.isError ||
    timeSeriesHook.isError ||
    engagementHook.isError;

  // Refetch all data
  const refetchAll = useCallback(async () => {
    await Promise.all([
      analyticsHook.refetch(true),
      timeSeriesHook.refetch(true),
      engagementHook.refetch(true),
    ]);
  }, [analyticsHook, timeSeriesHook, engagementHook]);

  return {
    analytics: analyticsHook.analytics,
    timeSeries: timeSeriesHook.timeSeries,
    engagement: engagementHook.engagement,
    isLoading,
    isLoadingAnalytics: analyticsHook.isLoading,
    isLoadingTimeSeries: timeSeriesHook.isLoading,
    isLoadingEngagement: engagementHook.isLoading,
    isError,
    errors: {
      analytics: analyticsHook.error,
      timeSeries: timeSeriesHook.error,
      engagement: engagementHook.error,
    },
    totalViews: analyticsHook.totalViews,
    uniqueVisitors: analyticsHook.uniqueVisitors,
    totalDownloads: analyticsHook.totalDownloads,
    totalFavorites: analyticsHook.totalFavorites,
    totalComments: analyticsHook.totalComments,
    engagementRate: analyticsHook.engagementRate,
    avgSessionDuration: analyticsHook.avgSessionDuration,
    viewsDataPoints: timeSeriesHook.dataPoints,
    refetchAll,
  };
}

// ---------------------------------------------------------------------------
// Cache Invalidation Utilities
// ---------------------------------------------------------------------------

/**
 * Invalidate all analytics caches for a specific gallery
 */
export function invalidateGalleryAnalyticsCache(workspaceId: string, galleryId: string): void {
  const prefix = `${workspaceId}:${galleryId}`;

  // Clear gallery details cache entries for this gallery
  Array.from(galleryDetailsCache.keys()).forEach((key) => {
    if (key.startsWith(prefix)) {
      galleryDetailsCache.delete(key);
    }
  });

  // Clear gallery summary cache entries
  Array.from(gallerySummaryCache.keys()).forEach((key) => {
    if (key.startsWith(prefix)) {
      gallerySummaryCache.delete(key);
    }
  });

  // Clear gallery time series cache entries
  Array.from(galleryTimeSeriesCache.keys()).forEach((key) => {
    if (key.startsWith(prefix)) {
      galleryTimeSeriesCache.delete(key);
    }
  });

  // Clear gallery engagement cache entries
  Array.from(galleryEngagementCache.keys()).forEach((key) => {
    if (key.startsWith(prefix)) {
      galleryEngagementCache.delete(key);
    }
  });

  // Clear gallery history cache entries
  Array.from(galleryHistoryCache.keys()).forEach((key) => {
    if (key.startsWith(prefix)) {
      galleryHistoryCache.delete(key);
    }
  });
}

/**
 * Invalidate all gallery analytics caches for a workspace
 */
export function invalidateWorkspaceGalleryAnalyticsCache(workspaceId: string): void {
  // Clear all caches for this workspace
  [
    galleryDetailsCache,
    gallerySummaryCache,
    galleryTimeSeriesCache,
    galleryEngagementCache,
    galleryHistoryCache,
  ].forEach((cache) => {
    Array.from(cache.keys()).forEach((key) => {
      if (key.startsWith(workspaceId)) {
        cache.delete(key);
      }
    });
  });
}

/**
 * Clear all gallery analytics caches
 */
export function clearAllGalleryAnalyticsCaches(): void {
  galleryDetailsCache.clear();
  gallerySummaryCache.clear();
  galleryTimeSeriesCache.clear();
  galleryEngagementCache.clear();
  galleryHistoryCache.clear();
}

// ---------------------------------------------------------------------------
// Default Export
// ---------------------------------------------------------------------------

export default {
  useGalleryAnalyticsDetails,
  useGalleryAnalyticsSummary,
  useGalleryViewsTimeSeries,
  useGalleryEngagement,
  useGalleryAnalyticsHistory,
  useCalculateGalleryAnalytics,
  useCompareGalleries,
  useGalleryAnalytics,
  invalidateGalleryAnalyticsCache,
  invalidateWorkspaceGalleryAnalyticsCache,
  clearAllGalleryAnalyticsCaches,
};
