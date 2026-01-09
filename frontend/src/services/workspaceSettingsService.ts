import api from './api';
import {
    WorkspaceAISettings,
    UpdateWorkspaceAISettingsRequest,
    WorkspaceSecuritySettings,
    UpdateWorkspaceSecuritySettingsRequest,
    WorkspaceNotificationSettings,
    UpdateWorkspaceNotificationSettingsRequest,
    WorkspacePrivacySettings,
    UpdateWorkspacePrivacySettingsRequest,
    WorkspaceDeletionRequest
} from '../types/workspaceSettings';

const API_PREFIX = '/api/v1';

class WorkspaceSettingsService {
    async getAISettings(workspaceId: string): Promise<WorkspaceAISettings> {
        const response = await api.get<WorkspaceAISettings>(`${API_PREFIX}/workspaces/${workspaceId}/company-profile/settings/ai`);
        if (!response.data) throw new Error(response.error?.message || 'Failed to fetch AI settings');
        return response.data;
    }

    async updateAISettings(workspaceId: string, data: UpdateWorkspaceAISettingsRequest): Promise<WorkspaceAISettings> {
        const response = await api.patch<WorkspaceAISettings>(`${API_PREFIX}/workspaces/${workspaceId}/company-profile/settings/ai`, data);
        if (!response.data) throw new Error(response.error?.message || 'Failed to update AI settings');
        return response.data;
    }

    async getSecuritySettings(workspaceId: string): Promise<WorkspaceSecuritySettings> {
        const response = await api.get<WorkspaceSecuritySettings>(`${API_PREFIX}/workspaces/${workspaceId}/company-profile/settings/security`);
        if (!response.data) throw new Error(response.error?.message || 'Failed to fetch security settings');
        return response.data;
    }

    async updateSecuritySettings(workspaceId: string, data: UpdateWorkspaceSecuritySettingsRequest): Promise<WorkspaceSecuritySettings> {
        const response = await api.patch<WorkspaceSecuritySettings>(`${API_PREFIX}/workspaces/${workspaceId}/company-profile/settings/security`, data);
        if (!response.data) throw new Error(response.error?.message || 'Failed to update security settings');
        return response.data;
    }

    async getNotificationSettings(workspaceId: string): Promise<WorkspaceNotificationSettings> {
        const response = await api.get<WorkspaceNotificationSettings>(`${API_PREFIX}/workspaces/${workspaceId}/company-profile/settings/notifications`);
        if (!response.data) throw new Error(response.error?.message || 'Failed to fetch notification settings');
        return response.data;
    }

    async updateNotificationSettings(workspaceId: string, data: UpdateWorkspaceNotificationSettingsRequest): Promise<WorkspaceNotificationSettings> {
        const response = await api.patch<WorkspaceNotificationSettings>(`${API_PREFIX}/workspaces/${workspaceId}/company-profile/settings/notifications`, data);
        if (!response.data) throw new Error(response.error?.message || 'Failed to update notification settings');
        return response.data;
    }

    async getPrivacySettings(workspaceId: string): Promise<WorkspacePrivacySettings> {
        const response = await api.get<WorkspacePrivacySettings>(`${API_PREFIX}/workspaces/${workspaceId}/company-profile/settings/privacy`);
        if (!response.data) throw new Error(response.error?.message || 'Failed to fetch privacy settings');
        return response.data;
    }

    async updatePrivacySettings(workspaceId: string, data: UpdateWorkspacePrivacySettingsRequest): Promise<WorkspacePrivacySettings> {
        const response = await api.patch<WorkspacePrivacySettings>(`${API_PREFIX}/workspaces/${workspaceId}/company-profile/settings/privacy`, data);
        if (!response.data) throw new Error(response.error?.message || 'Failed to update privacy settings');
        return response.data;
    }

    async requestWorkspaceDeletion(workspaceId: string, data: WorkspaceDeletionRequest): Promise<void> {
        const response = await api.post(`${API_PREFIX}/workspaces/${workspaceId}/company-profile/delete`, data);
        if (response.error) throw new Error(response.error.message || 'Failed to request workspace deletion');
    }

    async cancelWorkspaceDeletion(workspaceId: string): Promise<void> {
        const response = await api.delete(`${API_PREFIX}/workspaces/${workspaceId}/company-profile/delete`);
        if (response.error) throw new Error(response.error.message || 'Failed to cancel workspace deletion');
    }

    async getDeletionStatus(workspaceId: string): Promise<{ is_deletion_pending: boolean; scheduled_at?: string }> {
        const response = await api.get<{ is_deletion_pending: boolean; scheduled_at?: string }>(`${API_PREFIX}/workspaces/${workspaceId}/company-profile/delete/status`);
        if (!response.data) throw new Error(response.error?.message || 'Failed to fetch deletion status');
        return response.data;
    }
}

export const workspaceSettingsService = new WorkspaceSettingsService();
