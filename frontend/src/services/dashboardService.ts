/**
 * Dashboard Service
 * API client for dashboard operations
 */

import apiClient from './api';

export interface DashboardStats {
    galleries: number;
    photos: number;
    clients: number;
    views: number;
}

export class DashboardService {
    /**
     * Get dashboard statistics
     */
    async getStats(workspaceId: string): Promise<DashboardStats> {
        const endpoint = `/api/v1/workspaces/${workspaceId}/dashboard/stats`;
        const response = await apiClient.get<DashboardStats>(endpoint);

        if (response.error) {
            throw new Error(response.error.message || 'Failed to fetch dashboard stats');
        }

        return response.data!;
    }
}

// Export singleton instance
export const dashboardService = new DashboardService();
export default dashboardService;
