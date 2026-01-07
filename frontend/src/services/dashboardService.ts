/**
 * Dashboard Service
 * API client for dashboard operations
 */

import apiClient from './api';

export interface DashboardStats {
    galleries: number;
    galleries_change?: string;
    photos: number;
    photos_change?: string;
    clients: number;
    clients_change?: string;
    views: number;
    views_change?: string;
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
