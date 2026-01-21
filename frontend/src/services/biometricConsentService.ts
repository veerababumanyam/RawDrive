/**
 * Biometric Consent Service
 *
 * API client for GDPR Article 9 compliant biometric consent management.
 * Feature: Face Detection Audit Remediation (002-face-audit-remediation)
 * Task: T028
 */

import type {
  BiometricSettingsResponse,
  BiometricConsentGrantRequest,
  ConsentGrantResponse,
  BiometricConsentWithdrawRequest,
  ConsentWithdrawResponse,
  BiometricSettingsUpdateRequest,
  ConsentHistoryResponse,
} from '../types/biometricConsent';
import { apiClient } from './api';

const BASE_PATH = '/api/v1/workspaces';

/**
 * Biometric consent API service.
 */
export const biometricConsentService = {
  /**
   * Get biometric settings for a workspace.
   */
  async getSettings(workspaceId: string): Promise<BiometricSettingsResponse> {
    const response = await apiClient.get<BiometricSettingsResponse>(
      `${BASE_PATH}/${workspaceId}/biometric/settings`
    );
    return response.data;
  },

  /**
   * Grant biometric consent for face detection processing.
   * Requires admin/owner role.
   */
  async grantConsent(
    workspaceId: string,
    data: BiometricConsentGrantRequest
  ): Promise<ConsentGrantResponse> {
    const response = await apiClient.post<ConsentGrantResponse>(
      `${BASE_PATH}/${workspaceId}/biometric/consent/grant`,
      data
    );
    return response.data;
  },

  /**
   * Withdraw biometric consent.
   * Optionally triggers cascade deletion of face data.
   * Requires admin/owner role.
   */
  async withdrawConsent(
    workspaceId: string,
    data: BiometricConsentWithdrawRequest,
    cascadeDelete: boolean = false
  ): Promise<ConsentWithdrawResponse> {
    const response = await apiClient.post<ConsentWithdrawResponse>(
      `${BASE_PATH}/${workspaceId}/biometric/consent/withdraw`,
      data,
      { params: { cascade_delete: cascadeDelete } }
    );
    return response.data;
  },

  /**
   * Update biometric feature settings.
   * Requires active consent and admin/owner role.
   */
  async updateSettings(
    workspaceId: string,
    data: BiometricSettingsUpdateRequest
  ): Promise<BiometricSettingsResponse> {
    const response = await apiClient.patch<BiometricSettingsResponse>(
      `${BASE_PATH}/${workspaceId}/biometric/settings`,
      data
    );
    return response.data;
  },

  /**
   * Get consent history for a workspace.
   */
  async getHistory(
    workspaceId: string,
    page: number = 1,
    pageSize: number = 20
  ): Promise<ConsentHistoryResponse> {
    const response = await apiClient.get<ConsentHistoryResponse>(
      `${BASE_PATH}/${workspaceId}/biometric/consent/history`,
      { params: { page, page_size: pageSize } }
    );
    return response.data;
  },
};

export default biometricConsentService;
