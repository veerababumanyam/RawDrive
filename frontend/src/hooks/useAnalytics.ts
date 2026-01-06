/**
 * useAnalytics Hook
 * Custom hooks for fetching and managing analytics dashboard data
 *
 * Feature: Analytics & Reporting
 * Task: T028 - Create useAnalytics hook for dashboard data
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  analyticsService,
  DateRangeParams,
  QuickStatsParams,
  ActivityFeedParams,
  PaginationParams,
  DashboardMetricsResponse,
  WorkspaceOverviewResponse,
  QuickStatsResponse,
  ActivityFeedResponse,
  TopGalleriesResponse,
  ActivityEvent,
} from '../services/analyticsService';

// ---------------------------------------------------------------------------
// Cache Configuration
// ---------------------------------------------------------------------------

/** Cache TTL in milliseconds (5 minutes) */
const CACHE_TTL = 5 * 60 * 1000;

/** Auto-refresh interval for dashboard data (5 minutes) */
const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000;

// In-memory caches for analytics data
const dashboardMetricsCache = new Map<string, { data: DashboardMetricsResponse; timestamp: number }>();
const workspaceOverviewCache = new Map<string, { data: WorkspaceOverviewResponse; timestamp: number }>();
const quickStatsCache = new Map<string, { data: QuickStatsResponse; timestamp: number }>();

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Generate a cache key from workspace ID and params
 */
function generateCacheKey(workspaceId: string, params?: object): string {
  if (!params) return workspaceId;
  return `${workspaceId}:${JSON.stringify(params)}`;
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
// useDashboardMetrics Hook
// ---------------------------------------------------------------------------

export interface UseDashboardMetricsOptions extends DateRangeParams {
  /** Whether to auto-fetch on mount (default: true) */
  enabled?: boolean;
  /** Enable auto-refresh interval (default: true) */
  autoRefresh?: boolean;
  /** Custom refresh interval in milliseconds */
  refreshInterval?: number;
}

export interface UseDashboardMetricsReturn {
  /** Dashboard metrics data */
  metrics: DashboardMetricsResponse | null;
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
}

/**
 * Hook for fetching comprehensive dashboard metrics
 */
export function useDashboardMetrics(
  options: UseDashboardMetricsOptions = {}
): UseDashboardMetricsReturn {
  const { workspace } = useAuth();
  const workspaceId = workspace?.workspace_id;

  const {
    enabled = true,
    autoRefresh = true,
    refreshInterval = AUTO_REFRESH_INTERVAL,
    startDate,
    endDate,
  } = options;

  const [metrics, setMetrics] = useState<DashboardMetricsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const isMountedRef = useRef(true);
  const intervalRef = useRef<number | null>(null);
  const shouldStopFetching = useRef(false);

  const fetchMetrics = useCallback(
    async (forceRefresh = false) => {
      if (!workspaceId || !enabled || shouldStopFetching.current) {
        setIsLoading(false);
        return;
      }

      const params: DateRangeParams = { startDate, endDate };
      const cacheKey = generateCacheKey(workspaceId, params);

      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cached = getCached(dashboardMetricsCache, cacheKey);
        if (cached) {
          setMetrics(cached);
          setIsLoading(false);
          return;
        }
      }

      setIsFetching(true);
      if (!metrics) setIsLoading(true);

      try {
        const data = await analyticsService.getDashboardMetrics(workspaceId, params);
        if (isMountedRef.current) {
          setMetrics(data);
          setCache(dashboardMetricsCache, cacheKey, data);
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
          setError(err instanceof Error ? err : new Error('Failed to fetch dashboard metrics'));
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
          setIsFetching(false);
        }
      }
    },
    [workspaceId, enabled, startDate, endDate, metrics]
  );

  // Initial fetch
  useEffect(() => {
    isMountedRef.current = true;
    fetchMetrics();
    return () => {
      isMountedRef.current = false;
    };
  }, [fetchMetrics]);

  // Auto-refresh interval
  useEffect(() => {
    if (autoRefresh && enabled && workspaceId && refreshInterval > 0) {
      intervalRef.current = window.setInterval(() => {
        fetchMetrics();
      }, refreshInterval);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [autoRefresh, enabled, workspaceId, refreshInterval, fetchMetrics]);

  return {
    metrics,
    isLoading,
    isFetching,
    isError,
    error,
    refetch: fetchMetrics,
  };
}

// ---------------------------------------------------------------------------
// useWorkspaceOverview Hook
// ---------------------------------------------------------------------------

export interface UseWorkspaceOverviewOptions {
  /** Whether to auto-fetch on mount (default: true) */
  enabled?: boolean;
  /** Enable auto-refresh interval (default: true) */
  autoRefresh?: boolean;
}

export interface UseWorkspaceOverviewReturn {
  /** Workspace overview data */
  overview: WorkspaceOverviewResponse | null;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  isError: boolean;
  /** Error object */
  error: Error | null;
  /** Refetch function */
  refetch: (forceRefresh?: boolean) => Promise<void>;
  /** Formatted values for easy display */
  totalGalleries: number;
  totalAssets: number;
  storageUsed: string;
  totalClients: number;
  activeClients: number;
  totalViews: number;
  totalDownloads: number;
}

/**
 * Hook for fetching workspace overview (totals without date filtering)
 */
export function useWorkspaceOverview(
  options: UseWorkspaceOverviewOptions = {}
): UseWorkspaceOverviewReturn {
  const { workspace } = useAuth();
  const workspaceId = workspace?.workspace_id;

  const { enabled = true, autoRefresh = true } = options;

  const [overview, setOverview] = useState<WorkspaceOverviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const isMountedRef = useRef(true);
  const intervalRef = useRef<number | null>(null);

  const fetchOverview = useCallback(
    async (forceRefresh = false) => {
      if (!workspaceId || !enabled) {
        setIsLoading(false);
        return;
      }

      const cacheKey = workspaceId;

      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cached = getCached(workspaceOverviewCache, cacheKey);
        if (cached) {
          setOverview(cached);
          setIsLoading(false);
          return;
        }
      }

      setIsLoading(true);

      try {
        const data = await analyticsService.getWorkspaceOverview(workspaceId);
        if (isMountedRef.current) {
          setOverview(data);
          setCache(workspaceOverviewCache, cacheKey, data);
          setIsError(false);
          setError(null);
        }
      } catch (err) {
        if (isMountedRef.current) {
          setIsError(true);
          setError(err instanceof Error ? err : new Error('Failed to fetch workspace overview'));
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [workspaceId, enabled]
  );

  // Initial fetch
  useEffect(() => {
    isMountedRef.current = true;
    fetchOverview();
    return () => {
      isMountedRef.current = false;
    };
  }, [fetchOverview]);

  // Auto-refresh interval
  useEffect(() => {
    if (autoRefresh && enabled && workspaceId) {
      intervalRef.current = window.setInterval(() => {
        fetchOverview();
      }, AUTO_REFRESH_INTERVAL);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [autoRefresh, enabled, workspaceId, fetchOverview]);

  return {
    overview,
    isLoading,
    isError,
    error,
    refetch: fetchOverview,
    // Derived values for convenience
    totalGalleries: overview?.totalGalleries ?? 0,
    totalAssets: overview?.totalAssets ?? 0,
    storageUsed: overview?.storageUsedFormatted ?? '0 B',
    totalClients: overview?.totalClients ?? 0,
    activeClients: overview?.activeClients ?? 0,
    totalViews: overview?.totalViews ?? 0,
    totalDownloads: overview?.totalDownloads ?? 0,
  };
}

// ---------------------------------------------------------------------------
// useQuickStats Hook
// ---------------------------------------------------------------------------

export interface UseQuickStatsOptions extends QuickStatsParams {
  /** Whether to auto-fetch on mount (default: true) */
  enabled?: boolean;
  /** Enable auto-refresh interval (default: true) */
  autoRefresh?: boolean;
}

export interface UseQuickStatsReturn {
  /** Quick stats data */
  stats: QuickStatsResponse | null;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  isError: boolean;
  /** Error object */
  error: Error | null;
  /** Refetch function */
  refetch: (forceRefresh?: boolean) => Promise<void>;
  /** Derived values for convenience */
  views: number;
  uniqueVisitors: number;
  downloads: number;
  newClients: number;
  newGalleries: number;
  /** Trend metrics */
  viewsChange: number;
  visitorsChange: number;
  downloadsChange: number;
  clientsChange: number;
}

/**
 * Hook for fetching quick stats for a predefined period
 */
export function useQuickStats(options: UseQuickStatsOptions = {}): UseQuickStatsReturn {
  const { workspace } = useAuth();
  const workspaceId = workspace?.workspace_id;

  const { enabled = true, autoRefresh = true, period = '30d' } = options;

  const [stats, setStats] = useState<QuickStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const isMountedRef = useRef(true);
  const intervalRef = useRef<number | null>(null);

  const fetchStats = useCallback(
    async (forceRefresh = false) => {
      if (!workspaceId || !enabled) {
        setIsLoading(false);
        return;
      }

      const params: QuickStatsParams = { period };
      const cacheKey = generateCacheKey(workspaceId, params);

      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cached = getCached(quickStatsCache, cacheKey);
        if (cached) {
          setStats(cached);
          setIsLoading(false);
          return;
        }
      }

      setIsLoading(true);

      try {
        const data = await analyticsService.getQuickStats(workspaceId, params);
        if (isMountedRef.current) {
          setStats(data);
          setCache(quickStatsCache, cacheKey, data);
          setIsError(false);
          setError(null);
        }
      } catch (err) {
        if (isMountedRef.current) {
          setIsError(true);
          setError(err instanceof Error ? err : new Error('Failed to fetch quick stats'));
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [workspaceId, enabled, period]
  );

  // Initial fetch
  useEffect(() => {
    isMountedRef.current = true;
    fetchStats();
    return () => {
      isMountedRef.current = false;
    };
  }, [fetchStats]);

  // Auto-refresh interval
  useEffect(() => {
    if (autoRefresh && enabled && workspaceId) {
      intervalRef.current = window.setInterval(() => {
        fetchStats();
      }, AUTO_REFRESH_INTERVAL);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [autoRefresh, enabled, workspaceId, fetchStats]);

  return {
    stats,
    isLoading,
    isError,
    error,
    refetch: fetchStats,
    // Derived values for convenience
    views: stats?.quickStats?.views ?? 0,
    uniqueVisitors: stats?.quickStats?.uniqueVisitors ?? 0,
    downloads: stats?.quickStats?.downloads ?? 0,
    newClients: stats?.quickStats?.newClients ?? 0,
    newGalleries: stats?.quickStats?.newGalleries ?? 0,
    // Trend metrics
    viewsChange: stats?.trends?.viewsChange ?? 0,
    visitorsChange: stats?.trends?.visitorsChange ?? 0,
    downloadsChange: stats?.trends?.downloadsChange ?? 0,
    clientsChange: stats?.trends?.clientsChange ?? 0,
  };
}

// ---------------------------------------------------------------------------
// useActivityFeed Hook
// ---------------------------------------------------------------------------

export interface UseActivityFeedOptions extends ActivityFeedParams {
  /** Whether to auto-fetch on mount (default: true) */
  enabled?: boolean;
  /** Enable auto-refresh interval (default: true) */
  autoRefresh?: boolean;
  /** Refetch interval in milliseconds (default: 30 seconds) */
  refetchInterval?: number;
}

export interface UseActivityFeedReturn {
  /** Activity events */
  activities: ActivityEvent[];
  /** Loading state */
  isLoading: boolean;
  /** Fetching state (for background refreshes) */
  isFetching: boolean;
  /** Error state */
  isError: boolean;
  /** Error object */
  error: Error | null;
  /** Pagination metadata */
  meta: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  } | null;
  /** Refetch function */
  refetch: () => Promise<void>;
  /** Load more activities */
  loadMore: () => Promise<void>;
}

/**
 * Hook for fetching activity feed with pagination
 */
export function useActivityFeed(options: UseActivityFeedOptions = {}): UseActivityFeedReturn {
  const { workspace } = useAuth();
  const workspaceId = workspace?.workspace_id;

  const {
    enabled = true,
    autoRefresh = true,
    refetchInterval = 30000, // 30 seconds
    limit = 20,
    offset = 0,
    eventTypes,
    galleryId,
    clientId,
  } = options;

  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [meta, setMeta] = useState<UseActivityFeedReturn['meta']>(null);
  const [currentOffset, setCurrentOffset] = useState(offset);

  const isMountedRef = useRef(true);
  const intervalRef = useRef<number | null>(null);

  const fetchActivities = useCallback(
    async (loadingMore = false) => {
      if (!workspaceId || !enabled) {
        setIsLoading(false);
        return;
      }

      if (loadingMore) {
        setIsFetching(true);
      } else {
        setIsLoading(true);
      }

      try {
        const params: ActivityFeedParams = {
          limit,
          offset: loadingMore ? currentOffset : 0,
          eventTypes,
          galleryId,
          clientId,
        };

        const data = await analyticsService.getActivityFeed(workspaceId, params);
        if (isMountedRef.current) {
          if (loadingMore) {
            setActivities((prev) => [...prev, ...data.events]);
          } else {
            setActivities(data.events);
          }
          setMeta(data.meta);
          setCurrentOffset(data.meta.offset + data.events.length);
          setIsError(false);
          setError(null);
        }
      } catch (err) {
        if (isMountedRef.current) {
          setIsError(true);
          setError(err instanceof Error ? err : new Error('Failed to fetch activity feed'));
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
          setIsFetching(false);
        }
      }
    },
    [workspaceId, enabled, limit, currentOffset, eventTypes, galleryId, clientId]
  );

  const loadMore = useCallback(async () => {
    if (meta?.hasMore) {
      await fetchActivities(true);
    }
  }, [fetchActivities, meta?.hasMore]);

  const refetch = useCallback(async () => {
    setCurrentOffset(0);
    await fetchActivities(false);
  }, [fetchActivities]);

  // Initial fetch
  useEffect(() => {
    isMountedRef.current = true;
    fetchActivities(false);
    return () => {
      isMountedRef.current = false;
    };
  }, [workspaceId, enabled, limit, eventTypes, galleryId, clientId]);

  // Auto-refresh interval
  useEffect(() => {
    if (autoRefresh && enabled && workspaceId && refetchInterval > 0) {
      intervalRef.current = window.setInterval(() => {
        // Only refresh first page during auto-refresh
        setCurrentOffset(0);
        fetchActivities(false);
      }, refetchInterval);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [autoRefresh, enabled, workspaceId, refetchInterval]);

  // Listen for real-time activity events via WebSocket
  useEffect(() => {
    if (!workspaceId) return;

    const handleActivityCreated = (event: CustomEvent<{ activity: ActivityEvent }>) => {
      const newActivity = event.detail.activity;

      // Filter based on options
      if (eventTypes && eventTypes.length > 0 && !eventTypes.includes(newActivity.eventType)) {
        return;
      }
      if (galleryId && newActivity.galleryId !== galleryId) {
        return;
      }
      if (clientId && newActivity.clientId !== clientId) {
        return;
      }

      // Add to front of activities list
      setActivities((prev) => {
        const newActivities = [newActivity, ...prev];
        // Keep within limit
        return newActivities.slice(0, limit);
      });
    };

    window.addEventListener(
      'ws:analytics:activity' as keyof WindowEventMap,
      handleActivityCreated as EventListener
    );

    return () => {
      window.removeEventListener(
        'ws:analytics:activity' as keyof WindowEventMap,
        handleActivityCreated as EventListener
      );
    };
  }, [workspaceId, eventTypes, galleryId, clientId, limit]);

  return {
    activities,
    isLoading,
    isFetching,
    isError,
    error,
    meta,
    refetch,
    loadMore,
  };
}

// ---------------------------------------------------------------------------
// useTopGalleries Hook
// ---------------------------------------------------------------------------

export interface UseTopGalleriesOptions extends QuickStatsParams, PaginationParams {
  /** Whether to auto-fetch on mount (default: true) */
  enabled?: boolean;
}

export interface UseTopGalleriesReturn {
  /** Top galleries data */
  galleries: TopGalleriesResponse['galleries'];
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  isError: boolean;
  /** Error object */
  error: Error | null;
  /** Period label */
  periodLabel: string;
  /** Refetch function */
  refetch: () => Promise<void>;
}

/**
 * Hook for fetching top performing galleries
 */
export function useTopGalleries(options: UseTopGalleriesOptions = {}): UseTopGalleriesReturn {
  const { workspace } = useAuth();
  const workspaceId = workspace?.workspace_id;

  const { enabled = true, period = '30d', limit = 10, offset = 0 } = options;

  const [data, setData] = useState<TopGalleriesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const isMountedRef = useRef(true);

  const fetchTopGalleries = useCallback(async () => {
    if (!workspaceId || !enabled) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const response = await analyticsService.getTopGalleries(workspaceId, {
        period,
        limit,
        offset,
      });
      if (isMountedRef.current) {
        setData(response);
        setIsError(false);
        setError(null);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setIsError(true);
        setError(err instanceof Error ? err : new Error('Failed to fetch top galleries'));
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [workspaceId, enabled, period, limit, offset]);

  // Initial fetch
  useEffect(() => {
    isMountedRef.current = true;
    fetchTopGalleries();
    return () => {
      isMountedRef.current = false;
    };
  }, [fetchTopGalleries]);

  return {
    galleries: data?.galleries ?? [],
    isLoading,
    isError,
    error,
    periodLabel: data?.periodLabel ?? '',
    refetch: fetchTopGalleries,
  };
}

// ---------------------------------------------------------------------------
// useAnalyticsDashboard Hook (Combined)
// ---------------------------------------------------------------------------

export interface UseAnalyticsDashboardOptions {
  /** Date range for metrics */
  startDate?: string | Date;
  endDate?: string | Date;
  /** Period for quick stats */
  period?: '7d' | '30d' | '90d' | '1y' | 'all';
  /** Whether to auto-fetch on mount (default: true) */
  enabled?: boolean;
  /** Enable auto-refresh interval (default: true) */
  autoRefresh?: boolean;
}

export interface UseAnalyticsDashboardReturn {
  /** Full dashboard metrics */
  metrics: DashboardMetricsResponse | null;
  /** Workspace overview */
  overview: WorkspaceOverviewResponse | null;
  /** Quick stats */
  quickStats: QuickStatsResponse | null;
  /** Recent activities */
  activities: ActivityEvent[];
  /** Top galleries */
  topGalleries: TopGalleriesResponse['galleries'];
  /** Loading states */
  isLoading: boolean;
  isLoadingMetrics: boolean;
  isLoadingOverview: boolean;
  isLoadingQuickStats: boolean;
  isLoadingActivities: boolean;
  isLoadingTopGalleries: boolean;
  /** Error states */
  isError: boolean;
  errors: {
    metrics: Error | null;
    overview: Error | null;
    quickStats: Error | null;
    activities: Error | null;
    topGalleries: Error | null;
  };
  /** Refetch all data */
  refetchAll: () => Promise<void>;
}

/**
 * Combined hook for fetching all dashboard analytics data
 * Provides a unified interface for the analytics dashboard page
 */
export function useAnalyticsDashboard(
  options: UseAnalyticsDashboardOptions = {}
): UseAnalyticsDashboardReturn {
  const {
    startDate,
    endDate,
    period = '30d',
    enabled = true,
    autoRefresh = true,
  } = options;

  // Use individual hooks for each data type
  const metricsHook = useDashboardMetrics({
    enabled,
    autoRefresh,
    startDate,
    endDate,
  });

  const overviewHook = useWorkspaceOverview({
    enabled,
    autoRefresh,
  });

  const quickStatsHook = useQuickStats({
    enabled,
    autoRefresh,
    period,
  });

  const activitiesHook = useActivityFeed({
    enabled,
    autoRefresh,
    limit: 10,
  });

  const topGalleriesHook = useTopGalleries({
    enabled,
    period,
    limit: 5,
  });

  // Combined loading state
  const isLoading =
    metricsHook.isLoading ||
    overviewHook.isLoading ||
    quickStatsHook.isLoading ||
    activitiesHook.isLoading ||
    topGalleriesHook.isLoading;

  // Combined error state
  const isError =
    metricsHook.isError ||
    overviewHook.isError ||
    quickStatsHook.isError ||
    activitiesHook.isError ||
    topGalleriesHook.isError;

  // Refetch all data
  const refetchAll = useCallback(async () => {
    await Promise.all([
      metricsHook.refetch(true),
      overviewHook.refetch(true),
      quickStatsHook.refetch(true),
      activitiesHook.refetch(),
      topGalleriesHook.refetch(),
    ]);
  }, [metricsHook, overviewHook, quickStatsHook, activitiesHook, topGalleriesHook]);

  return {
    metrics: metricsHook.metrics,
    overview: overviewHook.overview,
    quickStats: quickStatsHook.stats,
    activities: activitiesHook.activities,
    topGalleries: topGalleriesHook.galleries,
    isLoading,
    isLoadingMetrics: metricsHook.isLoading,
    isLoadingOverview: overviewHook.isLoading,
    isLoadingQuickStats: quickStatsHook.isLoading,
    isLoadingActivities: activitiesHook.isLoading,
    isLoadingTopGalleries: topGalleriesHook.isLoading,
    isError,
    errors: {
      metrics: metricsHook.error,
      overview: overviewHook.error,
      quickStats: quickStatsHook.error,
      activities: activitiesHook.error,
      topGalleries: topGalleriesHook.error,
    },
    refetchAll,
  };
}

// ---------------------------------------------------------------------------
// Cache Invalidation Utilities
// ---------------------------------------------------------------------------

/**
 * Invalidate all analytics caches for a workspace
 */
export function invalidateAnalyticsCache(workspaceId: string): void {
  // Clear dashboard metrics cache entries for this workspace
  Array.from(dashboardMetricsCache.keys()).forEach((key) => {
    if (key.startsWith(workspaceId)) {
      dashboardMetricsCache.delete(key);
    }
  });

  // Clear workspace overview cache
  workspaceOverviewCache.delete(workspaceId);

  // Clear quick stats cache entries for this workspace
  Array.from(quickStatsCache.keys()).forEach((key) => {
    if (key.startsWith(workspaceId)) {
      quickStatsCache.delete(key);
    }
  });
}

/**
 * Clear all analytics caches
 */
export function clearAllAnalyticsCaches(): void {
  dashboardMetricsCache.clear();
  workspaceOverviewCache.clear();
  quickStatsCache.clear();
}

// ---------------------------------------------------------------------------
// Default Export
// ---------------------------------------------------------------------------

export default {
  useDashboardMetrics,
  useWorkspaceOverview,
  useQuickStats,
  useActivityFeed,
  useTopGalleries,
  useAnalyticsDashboard,
  invalidateAnalyticsCache,
  clearAllAnalyticsCaches,
};
