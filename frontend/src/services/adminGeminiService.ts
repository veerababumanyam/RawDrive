/**
 * Admin Gemini Models Service
 * API client for admin management of the Gemini model catalogue.
 * Feature: 003-user-gemini-settings
 */

import apiClient from './api';
import type {
  GeminiModelAdmin,
  CreateGeminiModelRequest,
  UpdateGeminiModelRequest,
  ReorderGeminiModelsRequest,
  GeminiAdminStats,
} from '../types/geminiSettings';

const BASE_URL = '/api/v1/admin/gemini-models';

export class AdminGeminiService {
  // ---------------------------------------------------------------------------
  // Model CRUD Operations
  // ---------------------------------------------------------------------------

  /**
   * List all Gemini models (including inactive ones)
   */
  async listModels(includeInactive = true): Promise<GeminiModelAdmin[]> {
    const response = await apiClient.get<GeminiModelAdmin[]>(
      `${BASE_URL}?include_inactive=${includeInactive}`
    );
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch models');
    }
    return response.data!;
  }

  /**
   * Get a specific model by ID
   */
  async getModel(modelId: string): Promise<GeminiModelAdmin> {
    const response = await apiClient.get<GeminiModelAdmin>(`${BASE_URL}/${modelId}`);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch model');
    }
    return response.data!;
  }

  /**
   * Create a new Gemini model
   */
  async createModel(data: CreateGeminiModelRequest): Promise<GeminiModelAdmin> {
    const response = await apiClient.post<GeminiModelAdmin>(BASE_URL, data);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to create model');
    }
    return response.data!;
  }

  /**
   * Update an existing Gemini model
   */
  async updateModel(modelId: string, data: UpdateGeminiModelRequest): Promise<GeminiModelAdmin> {
    const response = await apiClient.patch<GeminiModelAdmin>(`${BASE_URL}/${modelId}`, data);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to update model');
    }
    return response.data!;
  }

  /**
   * Delete a Gemini model
   * Users with this model selected will be migrated to the default model.
   */
  async deleteModel(modelId: string): Promise<void> {
    const response = await apiClient.delete<void>(`${BASE_URL}/${modelId}`);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to delete model');
    }
  }

  // ---------------------------------------------------------------------------
  // Model Management Operations
  // ---------------------------------------------------------------------------

  /**
   * Reorder models by providing list of model IDs in new order
   */
  async reorderModels(modelIds: string[]): Promise<GeminiModelAdmin[]> {
    const payload: ReorderGeminiModelsRequest = { model_ids: modelIds };
    const response = await apiClient.patch<GeminiModelAdmin[]>(`${BASE_URL}/reorder`, payload);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to reorder models');
    }
    return response.data!;
  }

  /**
   * Set a model as the platform default
   */
  async setDefaultModel(modelId: string): Promise<GeminiModelAdmin> {
    const response = await apiClient.patch<GeminiModelAdmin>(`${BASE_URL}/${modelId}/default`);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to set default model');
    }
    return response.data!;
  }

  /**
   * Toggle model active status
   */
  async toggleModelActive(modelId: string, isActive: boolean): Promise<GeminiModelAdmin> {
    return this.updateModel(modelId, { is_active: isActive });
  }

  // ---------------------------------------------------------------------------
  // Statistics (Phase 8 - Admin Visibility)
  // ---------------------------------------------------------------------------

  /**
   * Get aggregate Gemini configuration statistics
   * Note: This endpoint will be implemented in Phase 8 (T048-T053)
   */
  async getStats(): Promise<GeminiAdminStats> {
    const response = await apiClient.get<GeminiAdminStats>(`${BASE_URL}/stats`);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch statistics');
    }
    return response.data!;
  }
}

// Export singleton instance
export const adminGeminiService = new AdminGeminiService();
export default adminGeminiService;
