/**
 * useGalleryAnalyticsTab Hook
 *
 * TanStack Query hook for fetching gallery analytics data from the gallery-service.
 * Used by the GalleryAnalyticsTab dashboard component.
 */

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';

// Gallery analytics response types matching backend schema
export interface GalleryAnalyticsSummary {
  total_views: number;
  unique_visitors: number;
  avg_time_spent_seconds: number;
  views_today: number;
  views_this_week: number;
  views_this_month: number;
}

export interface DeviceBreakdown {
  desktop_count: number;
  mobile_count: number;
  tablet_count: number;
  desktop_pct: number;
  mobile_pct: number;
  tablet_pct: number;
}

export interface GeoEntry {
  country_code: string;
  country_name: string;
  count: number;
}

export interface GalleryAnalyticsTimeSeries {
  date: string;
  views: number;
  unique_visitors: number;
}

export interface GalleryAnalyticsResponse {
  gallery_id: string;
  summary: GalleryAnalyticsSummary;
  daily_stats: GalleryAnalyticsTimeSeries[];
  device_breakdown: DeviceBreakdown;
  geo_breakdown: GeoEntry[];
  download_summary: {
    total_downloads: number;
    total_bytes: number;
  };
  period_start: string;
  period_end: string;
}

export type AnalyticsPeriod = '7d' | '30d' | '90d' | 'all';

interface UseGalleryAnalyticsTabOptions {
  galleryId: string;
  period?: AnalyticsPeriod;
  enabled?: boolean;
}

async function fetchGalleryAnalytics(
  workspaceId: string,
  galleryId: string,
  period: AnalyticsPeriod
): Promise<GalleryAnalyticsResponse> {
  const galleryServiceUrl = import.meta.env.VITE_GALLERY_SERVICE_URL || '/api/gallery-service';
  const token = localStorage.getItem('auth_token');

  const response = await fetch(
    `${galleryServiceUrl}/api/v1/galleries/${galleryId}/analytics?period=${period}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Workspace-ID': workspaceId,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch analytics: ${response.status}`);
  }

  return response.json();
}

export function useGalleryAnalyticsTab(options: UseGalleryAnalyticsTabOptions) {
  const { workspace } = useAuth();
  const workspaceId = workspace?.workspace_id;
  const { galleryId, period = '30d', enabled = true } = options;

  return useQuery<GalleryAnalyticsResponse>({
    queryKey: ['gallery-analytics-tab', galleryId, period],
    queryFn: () => fetchGalleryAnalytics(workspaceId!, galleryId, period),
    enabled: enabled && !!workspaceId && !!galleryId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}
