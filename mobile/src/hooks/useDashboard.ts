/**
 * React Query hooks for dashboard data
 */

import { useQuery } from '@tanstack/react-query';
import {
  getDashboardOverview,
  getTodaySchedule,
  getActivityFeed,
  getQuickStats,
} from '../services/dashboardService';

// Query keys
export const dashboardKeys = {
  all: ['dashboard'] as const,
  overview: () => [...dashboardKeys.all, 'overview'] as const,
  schedule: () => [...dashboardKeys.all, 'schedule'] as const,
  todaySchedule: () => [...dashboardKeys.schedule(), 'today'] as const,
  activity: () => [...dashboardKeys.all, 'activity'] as const,
  activityList: (filters: Record<string, unknown>) => [...dashboardKeys.activity(), filters] as const,
  stats: () => [...dashboardKeys.all, 'stats'] as const,
};

/**
 * Fetch dashboard overview
 */
export function useDashboardOverview() {
  return useQuery({
    queryKey: dashboardKeys.overview(),
    queryFn: async () => {
      const result = await getDashboardOverview();
      if (result.error) throw new Error(result.error.message);
      return result.data!;
    },
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Fetch today's schedule
 */
export function useTodaySchedule() {
  return useQuery({
    queryKey: dashboardKeys.todaySchedule(),
    queryFn: async () => {
      const result = await getTodaySchedule();
      if (result.error) throw new Error(result.error.message);
      return result.data!;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Fetch activity feed
 */
export function useActivityFeed(params?: {
  page?: number;
  pageSize?: number;
  type?: 'payment' | 'favorite' | 'comment' | 'view' | 'download';
}) {
  return useQuery({
    queryKey: dashboardKeys.activityList(params || {}),
    queryFn: async () => {
      const result = await getActivityFeed(params);
      if (result.error) throw new Error(result.error.message);
      return result.data!;
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Fetch quick stats
 */
export function useQuickStats() {
  return useQuery({
    queryKey: dashboardKeys.stats(),
    queryFn: async () => {
      const result = await getQuickStats();
      if (result.error) throw new Error(result.error.message);
      return result.data!;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
