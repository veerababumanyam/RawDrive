/**
 * Dashboard service for mobile app
 * Handles dashboard overview, schedule, and activity data
 */

import { apiClient } from './api';
import type { ApiResponse, DashboardOverview, ScheduleItem, ActivityItem } from '../types';

// Response types
interface DashboardOverviewResponse {
  today_schedule: Array<{
    id: string;
    title: string;
    start_time: string;
    end_time: string;
    client_name?: string;
    location?: string;
    type: 'shoot' | 'meeting' | 'delivery' | 'other';
  }>;
  pending_invoices_count: number;
  pending_invoices_total: number;
  active_galleries_count: number;
  total_views_today: number;
  recent_activity: Array<{
    id: string;
    type: 'payment' | 'favorite' | 'comment' | 'view' | 'download';
    message: string;
    timestamp: string;
    gallery_id?: string;
    gallery_name?: string;
  }>;
}

interface ScheduleListResponse {
  items: Array<{
    id: string;
    title: string;
    start_time: string;
    end_time: string;
    client_name?: string;
    location?: string;
    type: 'shoot' | 'meeting' | 'delivery' | 'other';
  }>;
  total: number;
}

interface ActivityListResponse {
  items: Array<{
    id: string;
    type: 'payment' | 'favorite' | 'comment' | 'view' | 'download';
    message: string;
    timestamp: string;
    gallery_id?: string;
    gallery_name?: string;
  }>;
  total: number;
  page: number;
  page_size: number;
}

/**
 * Transform API response to frontend model
 */
function transformScheduleItem(item: DashboardOverviewResponse['today_schedule'][0]): ScheduleItem {
  return {
    id: item.id,
    title: item.title,
    startTime: item.start_time,
    endTime: item.end_time,
    clientName: item.client_name,
    location: item.location,
    type: item.type,
  };
}

function transformActivityItem(item: DashboardOverviewResponse['recent_activity'][0]): ActivityItem {
  return {
    id: item.id,
    type: item.type,
    message: item.message,
    timestamp: item.timestamp,
    galleryId: item.gallery_id,
    galleryName: item.gallery_name,
  };
}

/**
 * Get dashboard overview data
 */
export async function getDashboardOverview(): Promise<ApiResponse<DashboardOverview>> {
  const response = await apiClient.get<DashboardOverviewResponse>('/dashboard/overview');

  if (response.error) {
    return { error: response.error };
  }

  if (!response.data) {
    return { error: { code: 'NO_DATA', message: 'No data returned' } };
  }

  return {
    data: {
      todaySchedule: response.data.today_schedule.map(transformScheduleItem),
      pendingInvoicesCount: response.data.pending_invoices_count,
      pendingInvoicesTotal: response.data.pending_invoices_total,
      activeGalleriesCount: response.data.active_galleries_count,
      totalViewsToday: response.data.total_views_today,
      recentActivity: response.data.recent_activity.map(transformActivityItem),
    },
  };
}

/**
 * Get today's schedule
 */
export async function getTodaySchedule(): Promise<ApiResponse<{ items: ScheduleItem[]; total: number }>> {
  const today = new Date().toISOString().split('T')[0];
  const response = await apiClient.get<ScheduleListResponse>(
    `/schedule?date=${today}`
  );

  if (response.error) {
    return { error: response.error };
  }

  if (!response.data) {
    return { error: { code: 'NO_DATA', message: 'No data returned' } };
  }

  return {
    data: {
      items: response.data.items.map(transformScheduleItem),
      total: response.data.total,
    },
  };
}

/**
 * Get schedule for a date range
 */
export async function getSchedule(
  startDate: string,
  endDate: string
): Promise<ApiResponse<{ items: ScheduleItem[]; total: number }>> {
  const response = await apiClient.get<ScheduleListResponse>(
    `/schedule?start_date=${startDate}&end_date=${endDate}`
  );

  if (response.error) {
    return { error: response.error };
  }

  if (!response.data) {
    return { error: { code: 'NO_DATA', message: 'No data returned' } };
  }

  return {
    data: {
      items: response.data.items.map(transformScheduleItem),
      total: response.data.total,
    },
  };
}

/**
 * Get recent activity feed
 */
export async function getActivityFeed(params?: {
  page?: number;
  pageSize?: number;
  type?: ActivityItem['type'];
}): Promise<ApiResponse<{ items: ActivityItem[]; total: number; page: number; pageSize: number }>> {
  const queryParams = new URLSearchParams();

  if (params?.page) queryParams.set('page', params.page.toString());
  if (params?.pageSize) queryParams.set('page_size', params.pageSize.toString());
  if (params?.type) queryParams.set('type', params.type);

  const queryString = queryParams.toString();
  const endpoint = `/activity${queryString ? `?${queryString}` : ''}`;

  const response = await apiClient.get<ActivityListResponse>(endpoint);

  if (response.error) {
    return { error: response.error };
  }

  if (!response.data) {
    return { error: { code: 'NO_DATA', message: 'No data returned' } };
  }

  return {
    data: {
      items: response.data.items.map(transformActivityItem),
      total: response.data.total,
      page: response.data.page,
      pageSize: response.data.page_size,
    },
  };
}

/**
 * Get quick stats for dashboard
 */
export async function getQuickStats(): Promise<ApiResponse<{
  totalGalleries: number;
  totalClients: number;
  totalViews: number;
  totalDownloads: number;
  monthlyRevenue: number;
}>> {
  const response = await apiClient.get<{
    total_galleries: number;
    total_clients: number;
    total_views: number;
    total_downloads: number;
    monthly_revenue: number;
  }>('/dashboard/stats');

  if (response.error) {
    return { error: response.error };
  }

  if (!response.data) {
    return { error: { code: 'NO_DATA', message: 'No data returned' } };
  }

  return {
    data: {
      totalGalleries: response.data.total_galleries,
      totalClients: response.data.total_clients,
      totalViews: response.data.total_views,
      totalDownloads: response.data.total_downloads,
      monthlyRevenue: response.data.monthly_revenue,
    },
  };
}
