/**
 * Gemini Settings Service
 * API client for user Gemini API key and model configuration.
 * Feature: 003-user-gemini-settings
 */

import apiClient from './api';
import type {
  UserGeminiSettings,
  UpdateGeminiSettingsRequest,
  KeyValidationResult,
  GeminiModelsListResponse,
  AIFeatureTogglesResponse,
  UpdateAIFeatureTogglesRequest,
} from '../types/geminiSettings';

export class GeminiSettingsService {
  // ---------------------------------------------------------------------------
  // User Settings endpoints
  // ---------------------------------------------------------------------------

  /**
   * Get current user's Gemini settings
   */
  async getSettings(): Promise<UserGeminiSettings> {
    const response = await apiClient.get<UserGeminiSettings>('/api/v1/users/me/gemini-settings');
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch Gemini settings');
    }
    return response.data!;
  }

  /**
   * Update Gemini settings (API key and/or model selection)
   */
  async updateSettings(data: UpdateGeminiSettingsRequest): Promise<UserGeminiSettings> {
    const response = await apiClient.patch<UserGeminiSettings>('/api/v1/users/me/gemini-settings', data);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to update Gemini settings');
    }
    return response.data!;
  }

  /**
   * Validate a Gemini API key without saving
   */
  async validateKey(apiKey: string): Promise<KeyValidationResult> {
    const response = await apiClient.post<KeyValidationResult>(
      '/api/v1/users/me/gemini-settings/validate',
      { api_key: apiKey }
    );
    if (response.error) {
      throw new Error(response.error.message || 'Failed to validate API key');
    }
    return response.data!;
  }

  /**
   * Revoke the stored API key
   */
  async revokeKey(): Promise<UserGeminiSettings> {
    const response = await apiClient.delete<UserGeminiSettings>('/api/v1/users/me/gemini-settings');
    if (response.error) {
      throw new Error(response.error.message || 'Failed to revoke API key');
    }
    return response.data!;
  }

  // ---------------------------------------------------------------------------
  // Model Catalogue endpoints
  // ---------------------------------------------------------------------------

  /**
   * List available Gemini models
   */
  async listModels(): Promise<GeminiModelsListResponse> {
    const response = await apiClient.get<GeminiModelsListResponse>('/api/v1/gemini-models');
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch Gemini models');
    }
    return response.data!;
  }

  /**
   * Update only the model selection
   */
  async updateModelSelection(modelId: string | null): Promise<UserGeminiSettings> {
    return this.updateSettings({ selected_model_id: modelId });
  }

  // ---------------------------------------------------------------------------
  // AI Feature Toggles endpoints (T080)
  // ---------------------------------------------------------------------------

  /**
   * Get current user's AI feature toggle settings
   */
  async getFeatureToggles(): Promise<AIFeatureTogglesResponse> {
    const response = await apiClient.get<AIFeatureTogglesResponse>(
      '/api/v1/users/me/gemini-settings/feature-toggles'
    );
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch feature toggles');
    }
    return response.data!;
  }

  /**
   * Update AI feature toggle settings
   */
  async updateFeatureToggles(
    data: UpdateAIFeatureTogglesRequest
  ): Promise<AIFeatureTogglesResponse> {
    const response = await apiClient.patch<AIFeatureTogglesResponse>(
      '/api/v1/users/me/gemini-settings/feature-toggles',
      data
    );
    if (response.error) {
      throw new Error(response.error.message || 'Failed to update feature toggles');
    }
    return response.data!;
  }
}

// Export singleton instance
export const geminiSettingsService = new GeminiSettingsService();
export default geminiSettingsService;
