/**
 * User Settings Service
 * API client for user profile, security, notification, privacy, and account deletion operations.
 */

import apiClient from './api';
import type {
  ExtendedUserProfile,
  UpdateProfileRequest,
  AvatarUploadResponse,
  EmailChangeRequest,
  ChangePasswordRequest,
  TwoFactorSetupResponse,
  Verify2FARequest,
  TwoFactorEnabledResponse,
  TwoFactorStatusResponse,
  Disable2FARequest,
  BackupCodesResponse,
  SessionListResponse,
  NotificationPreferencesResponse,
  UpdateNotificationPreferencesRequest,
  PrivacySettingsResponse,
  UpdatePrivacySettingsRequest,
  DataExportResponse,
  DeleteAccountRequest,
  AccountDeletionResponse,
  DeletionStatusResponse,
  MessageResponse,
  PasswordConfirmRequest,
} from '../types/userSettings';

export class UserSettingsService {
  // ---------------------------------------------------------------------------
  // Profile endpoints
  // ---------------------------------------------------------------------------

  /**
   * Get current user's extended profile
   */
  async getProfile(): Promise<ExtendedUserProfile> {
    const response = await apiClient.get<ExtendedUserProfile>('/api/v1/users/me');
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch profile');
    }
    return response.data!;
  }

  /**
   * Update user profile
   */
  async updateProfile(data: UpdateProfileRequest): Promise<ExtendedUserProfile> {
    const response = await apiClient.patch<ExtendedUserProfile>('/api/v1/users/me', data);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to update profile');
    }
    return response.data!;
  }

  /**
   * Upload avatar image
   */
  async uploadAvatar(
    file: File,
    cropData?: { crop_x?: number; crop_y?: number; crop_scale?: number }
  ): Promise<AvatarUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    if (cropData?.crop_x !== undefined) formData.append('crop_x', cropData.crop_x.toString());
    if (cropData?.crop_y !== undefined) formData.append('crop_y', cropData.crop_y.toString());
    if (cropData?.crop_scale !== undefined) formData.append('crop_scale', cropData.crop_scale.toString());

    const response = await apiClient.upload<AvatarUploadResponse>('/api/v1/users/me/avatar', formData);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to upload avatar');
    }
    return response.data!;
  }

  /**
   * Delete avatar
   */
  async deleteAvatar(): Promise<MessageResponse> {
    const response = await apiClient.delete<MessageResponse>('/api/v1/users/me/avatar');
    if (response.error) {
      throw new Error(response.error.message || 'Failed to delete avatar');
    }
    return response.data!;
  }

  /**
   * Request email change (sends verification to new email)
   */
  async requestEmailChange(data: EmailChangeRequest): Promise<MessageResponse> {
    const response = await apiClient.post<MessageResponse>('/api/v1/users/me/email', data);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to request email change');
    }
    return response.data!;
  }

  // ---------------------------------------------------------------------------
  // Security endpoints
  // ---------------------------------------------------------------------------

  /**
   * Change password
   */
  async changePassword(data: ChangePasswordRequest): Promise<MessageResponse> {
    const response = await apiClient.post<MessageResponse>('/api/v1/users/me/password', data);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to change password');
    }
    return response.data!;
  }

  /**
   * Get 2FA status
   */
  async get2FAStatus(): Promise<TwoFactorStatusResponse> {
    const response = await apiClient.get<TwoFactorStatusResponse>('/api/v1/users/me/2fa');
    if (response.error) {
      throw new Error(response.error.message || 'Failed to get 2FA status');
    }
    return response.data!;
  }

  /**
   * Begin 2FA setup (returns secret and QR code)
   */
  async setup2FA(): Promise<TwoFactorSetupResponse> {
    const response = await apiClient.post<TwoFactorSetupResponse>('/api/v1/users/me/2fa/setup', {});
    if (response.error) {
      throw new Error(response.error.message || 'Failed to setup 2FA');
    }
    return response.data!;
  }

  /**
   * Verify and enable 2FA
   */
  async verify2FA(data: Verify2FARequest): Promise<TwoFactorEnabledResponse> {
    const response = await apiClient.post<TwoFactorEnabledResponse>('/api/v1/users/me/2fa/verify', data);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to verify 2FA code');
    }
    return response.data!;
  }

  /**
   * Disable 2FA
   */
  async disable2FA(data: Disable2FARequest): Promise<MessageResponse> {
    const response = await apiClient.delete<MessageResponse>('/api/v1/users/me/2fa', { data });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to disable 2FA');
    }
    return response.data!;
  }

  /**
   * Regenerate backup codes
   */
  async regenerateBackupCodes(data: PasswordConfirmRequest): Promise<BackupCodesResponse> {
    const response = await apiClient.post<BackupCodesResponse>('/api/v1/users/me/2fa/backup-codes', data);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to regenerate backup codes');
    }
    return response.data!;
  }

  /**
   * List active sessions
   */
  async listSessions(): Promise<SessionListResponse> {
    const response = await apiClient.get<SessionListResponse>('/api/v1/users/me/sessions');
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch sessions');
    }
    return response.data!;
  }

  /**
   * Terminate a specific session
   */
  async terminateSession(sessionId: string): Promise<MessageResponse> {
    const response = await apiClient.delete<MessageResponse>(`/api/v1/users/me/sessions/${sessionId}`);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to terminate session');
    }
    return response.data!;
  }

  /**
   * Terminate all other sessions
   */
  async terminateAllOtherSessions(): Promise<MessageResponse> {
    const response = await apiClient.delete<MessageResponse>('/api/v1/users/me/sessions');
    if (response.error) {
      throw new Error(response.error.message || 'Failed to terminate sessions');
    }
    return response.data!;
  }

  // ---------------------------------------------------------------------------
  // Notification preferences endpoints
  // ---------------------------------------------------------------------------

  /**
   * Get notification preferences
   */
  async getNotificationPreferences(): Promise<NotificationPreferencesResponse> {
    const response = await apiClient.get<NotificationPreferencesResponse>('/api/v1/users/me/notifications');
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch notification preferences');
    }
    return response.data!;
  }

  /**
   * Update notification preferences
   */
  async updateNotificationPreferences(
    data: UpdateNotificationPreferencesRequest
  ): Promise<NotificationPreferencesResponse> {
    const response = await apiClient.patch<NotificationPreferencesResponse>('/api/v1/users/me/notifications', data);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to update notification preferences');
    }
    return response.data!;
  }

  // ---------------------------------------------------------------------------
  // Privacy settings endpoints
  // ---------------------------------------------------------------------------

  /**
   * Get privacy settings
   */
  async getPrivacySettings(): Promise<PrivacySettingsResponse> {
    const response = await apiClient.get<PrivacySettingsResponse>('/api/v1/users/me/privacy');
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch privacy settings');
    }
    return response.data!;
  }

  /**
   * Update privacy settings
   */
  async updatePrivacySettings(data: UpdatePrivacySettingsRequest): Promise<PrivacySettingsResponse> {
    const response = await apiClient.patch<PrivacySettingsResponse>('/api/v1/users/me/privacy', data);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to update privacy settings');
    }
    return response.data!;
  }

  /**
   * Request data export
   */
  async requestDataExport(): Promise<DataExportResponse> {
    const response = await apiClient.post<DataExportResponse>('/api/v1/users/me/export', {});
    if (response.error) {
      throw new Error(response.error.message || 'Failed to request data export');
    }
    return response.data!;
  }

  /**
   * Get data export status
   * Returns null if no export exists (404 from server)
   */
  async getDataExportStatus(): Promise<DataExportResponse | null> {
    const response = await apiClient.get<DataExportResponse>('/api/v1/users/me/export');
    if (response.error) {
      // 404 is expected when no export exists - return null instead of throwing
      if (response.error.status === 404) {
        return null;
      }
      throw new Error(response.error.message || 'Failed to fetch export status');
    }
    return response.data!;
  }

  // ---------------------------------------------------------------------------
  // Account deletion endpoints
  // ---------------------------------------------------------------------------

  /**
   * Get account deletion status
   */
  async getDeletionStatus(): Promise<DeletionStatusResponse> {
    const response = await apiClient.get<DeletionStatusResponse>('/api/v1/users/me/deletion');
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch deletion status');
    }
    return response.data!;
  }

  /**
   * Request account deletion
   */
  async requestAccountDeletion(data: DeleteAccountRequest): Promise<AccountDeletionResponse> {
    const response = await apiClient.post<AccountDeletionResponse>('/api/v1/users/me/deletion', data);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to request account deletion');
    }
    return response.data!;
  }

  /**
   * Cancel pending account deletion
   */
  async cancelAccountDeletion(): Promise<MessageResponse> {
    const response = await apiClient.delete<MessageResponse>('/api/v1/users/me/deletion');
    if (response.error) {
      throw new Error(response.error.message || 'Failed to cancel account deletion');
    }
    return response.data!;
  }
}

// Export singleton instance
export const userSettingsService = new UserSettingsService();
export default userSettingsService;
