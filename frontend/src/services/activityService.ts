/**
 * Activity Service
 * API client for workspace activity feed operations
 */

import apiClient from './api';
import type { Activity, ActivityListResponse, ActivitySummary } from '../types/activity';

// ---------------------------------------------------------------------------
// Request Types
// ---------------------------------------------------------------------------

export interface GetActivitiesParams {
  limit?: number;
  activity_type?: string;
  actor_type?: string;
  gallery_id?: string;
}

// ---------------------------------------------------------------------------
// Activity Service
// ---------------------------------------------------------------------------

export class ActivityService {
  /**
   * Get recent activities for the dashboard
   */
  async getRecentActivities(
    workspaceId: string,
    params: GetActivitiesParams = {}
  ): Promise<Activity[]> {
    const queryParams = new URLSearchParams();

    if (params.limit) queryParams.set('limit', params.limit.toString());
    if (params.activity_type) queryParams.set('activity_type', params.activity_type);
    if (params.actor_type) queryParams.set('actor_type', params.actor_type);
    if (params.gallery_id) queryParams.set('gallery_id', params.gallery_id);

    const queryString = queryParams.toString();
    const endpoint = `/api/v1/workspaces/${workspaceId}/dashboard/activities${
      queryString ? `?${queryString}` : ''
    }`;

    const response = await apiClient.get<ActivityListResponse>(endpoint);

    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch activities');
    }

    return response.data?.data || [];
  }

  /**
   * Get activity summary statistics
   */
  async getActivitySummary(
    workspaceId: string,
    days: number = 30
  ): Promise<ActivitySummary> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/dashboard/activities/summary?days=${days}`;

    const response = await apiClient.get<ActivitySummary>(endpoint);

    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch activity summary');
    }

    return response.data!;
  }
}

// Export singleton instance
export const activityService = new ActivityService();
export default activityService;
