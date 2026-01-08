/**
 * Curation Service
 * API client for Enhanced Smart Curate feature
 *
 * Feature: 023-enhanced-smart-curate
 */

import apiClient from './api';
import type {
  CurationPreset,
  CurationPresetCreateRequest,
  CurationPresetUpdateRequest,
  CurationPresetListResponse,
  CurationSession,
  CurationSessionCreateRequest,
  CurationSessionUpdateRequest,
  CurationSessionListResponse,
  CurationSessionStartRequest,
  QualityAnalysisStartRequest,
  QualityAnalysisResponse,
  QualityAnalysisProgressResponse,
  SimilarityGroup,
  SimilarityGroupListResponse,
  SetBestShotRequest,
  CurationSelectionsResponse,
  ModifySelectionRequest,
  BulkModifySelectionsRequest,
  ApplySelectionsRequest,
  ApplySelectionsResponse,
  UserCurationPreferencesResponse,
  UpdateUserPreferencesRequest,
} from '../types/curation';

import type { SmartCurationRequest, CurationResult } from '../types/aiFeatures';

/**
 * Service for managing AI-powered photo curation
 */
export class CurationService {
  // ---------------------------------------------------------------------------
  // Legacy Smart Curation (010-ai-powered-features compatibility)
  // ---------------------------------------------------------------------------

  /**
   * Legacy smart curation method for SmartCurationPanel compatibility
   * Uses the /smart-tagging/curate endpoint
   */
  static async curateGallery(
    workspaceId: string,
    galleryId: string,
    request: SmartCurationRequest
  ): Promise<CurationResult> {
    // Note: smart-tagging router prefix comes before /galleries/
    const endpoint = `/api/v1/workspaces/${workspaceId}/smart-tagging/galleries/${galleryId}/curate`;
    const response = await apiClient.post<CurationResult>(endpoint, request);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to curate gallery');
    }
    return response.data!;
  }

  // ---------------------------------------------------------------------------
  // Curation Presets
  // ---------------------------------------------------------------------------

  /**
   * List curation presets (system + workspace-specific)
   */
  async listPresets(workspaceId: string): Promise<CurationPresetListResponse> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/curation-presets`;
    const response = await apiClient.get<CurationPresetListResponse>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch presets');
    }
    return response.data!;
  }

  /**
   * Get a specific preset
   */
  async getPreset(workspaceId: string, presetId: string): Promise<CurationPreset> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/curation-presets/${presetId}`;
    const response = await apiClient.get<CurationPreset>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch preset');
    }
    return response.data!;
  }

  /**
   * Create a workspace-specific preset
   */
  async createPreset(
    workspaceId: string,
    data: CurationPresetCreateRequest
  ): Promise<CurationPreset> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/curation-presets`;
    const response = await apiClient.post<CurationPreset>(endpoint, data);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to create preset');
    }
    return response.data!;
  }

  /**
   * Update a preset (only workspace-specific presets can be updated)
   */
  async updatePreset(
    workspaceId: string,
    presetId: string,
    data: CurationPresetUpdateRequest
  ): Promise<CurationPreset> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/curation-presets/${presetId}`;
    const response = await apiClient.patch<CurationPreset>(endpoint, data);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to update preset');
    }
    return response.data!;
  }

  /**
   * Delete a workspace-specific preset
   */
  async deletePreset(workspaceId: string, presetId: string): Promise<void> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/curation-presets/${presetId}`;
    const response = await apiClient.delete(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to delete preset');
    }
  }

  // ---------------------------------------------------------------------------
  // Curation Sessions
  // ---------------------------------------------------------------------------

  /**
   * List curation sessions for a gallery
   */
  async listSessions(
    workspaceId: string,
    galleryId: string,
    options?: {
      status?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<CurationSessionListResponse> {
    const params = new URLSearchParams();
    if (options?.status) params.append('status', options.status);
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());

    const query = params.toString();
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/curation-sessions${query ? `?${query}` : ''}`;

    const response = await apiClient.get<CurationSessionListResponse>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch sessions');
    }
    return response.data!;
  }

  /**
   * Get a specific curation session
   */
  async getSession(
    workspaceId: string,
    galleryId: string,
    sessionId: string
  ): Promise<CurationSession> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/curation-sessions/${sessionId}`;
    const response = await apiClient.get<CurationSession>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch session');
    }
    return response.data!;
  }

  /**
   * Create a new curation session
   */
  async createSession(
    workspaceId: string,
    galleryId: string,
    data: CurationSessionCreateRequest
  ): Promise<CurationSession> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/curation-sessions`;
    const response = await apiClient.post<CurationSession>(endpoint, data);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to create session');
    }
    return response.data!;
  }

  /**
   * Update a curation session
   */
  async updateSession(
    workspaceId: string,
    galleryId: string,
    sessionId: string,
    data: CurationSessionUpdateRequest
  ): Promise<CurationSession> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/curation-sessions/${sessionId}`;
    const response = await apiClient.patch<CurationSession>(endpoint, data);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to update session');
    }
    return response.data!;
  }

  /**
   * Start or resume a curation session
   */
  async startSession(
    workspaceId: string,
    galleryId: string,
    sessionId: string,
    data?: CurationSessionStartRequest
  ): Promise<CurationSession> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/curation-sessions/${sessionId}/start`;
    const response = await apiClient.post<CurationSession>(endpoint, data || {});
    if (response.error) {
      throw new Error(response.error.message || 'Failed to start session');
    }
    return response.data!;
  }

  /**
   * Pause a curation session
   */
  async pauseSession(
    workspaceId: string,
    galleryId: string,
    sessionId: string
  ): Promise<CurationSession> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/curation-sessions/${sessionId}/pause`;
    const response = await apiClient.post<CurationSession>(endpoint, {});
    if (response.error) {
      throw new Error(response.error.message || 'Failed to pause session');
    }
    return response.data!;
  }

  /**
   * Delete a curation session
   */
  async deleteSession(
    workspaceId: string,
    galleryId: string,
    sessionId: string
  ): Promise<void> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/curation-sessions/${sessionId}`;
    const response = await apiClient.delete(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to delete session');
    }
  }

  // ---------------------------------------------------------------------------
  // Quality Analysis
  // ---------------------------------------------------------------------------

  /**
   * Start quality analysis for a gallery
   * Note: Uses smart-tagging router prefix
   */
  async startQualityAnalysis(
    workspaceId: string,
    galleryId: string,
    data?: QualityAnalysisStartRequest
  ): Promise<CurationSession> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/smart-tagging/galleries/${galleryId}/quality-analysis`;
    const response = await apiClient.post<CurationSession>(endpoint, data || {});
    if (response.error) {
      throw new Error(response.error.message || 'Failed to start analysis');
    }
    return response.data!;
  }

  /**
   * Get quality analysis results
   * Note: Uses smart-tagging router prefix
   */
  async getQualityAnalysis(
    workspaceId: string,
    galleryId: string,
    options?: {
      sessionId?: string;
      minScore?: number;
      maxScore?: number;
      blurOnly?: boolean;
      limit?: number;
      offset?: number;
    }
  ): Promise<QualityAnalysisResponse> {
    const params = new URLSearchParams();
    if (options?.sessionId) params.append('session_id', options.sessionId);
    if (options?.minScore !== undefined) params.append('min_score', options.minScore.toString());
    if (options?.maxScore !== undefined) params.append('max_score', options.maxScore.toString());
    if (options?.blurOnly) params.append('blur_only', 'true');
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());

    const query = params.toString();
    const endpoint = `/api/v1/workspaces/${workspaceId}/smart-tagging/galleries/${galleryId}/quality-analysis${query ? `?${query}` : ''}`;
    const response = await apiClient.get<QualityAnalysisResponse>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch analysis');
    }
    return response.data!;
  }

  /**
   * Get quality analysis progress
   * Note: Uses smart-tagging router prefix
   */
  async getQualityAnalysisProgress(
    workspaceId: string,
    galleryId: string,
    sessionId: string
  ): Promise<QualityAnalysisProgressResponse> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/smart-tagging/galleries/${galleryId}/quality-analysis/progress?session_id=${sessionId}`;
    const response = await apiClient.get<QualityAnalysisProgressResponse>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch progress');
    }
    return response.data!;
  }

  // ---------------------------------------------------------------------------
  // Similarity Grouping
  // ---------------------------------------------------------------------------

  /**
   * Start similarity grouping for a gallery
   */
  async startSimilarityGrouping(
    workspaceId: string,
    galleryId: string,
    sessionId: string
  ): Promise<CurationSession> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/similarity-groups`;
    const response = await apiClient.post<CurationSession>(endpoint, { session_id: sessionId });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to start grouping');
    }
    return response.data!;
  }

  /**
   * Get similarity groups
   */
  async getSimilarityGroups(
    workspaceId: string,
    galleryId: string,
    options?: {
      sessionId?: string;
      minMembers?: number;
      includeMembers?: boolean;
      limit?: number;
      offset?: number;
    }
  ): Promise<SimilarityGroupListResponse> {
    const params = new URLSearchParams();
    if (options?.sessionId) params.append('session_id', options.sessionId);
    if (options?.minMembers) params.append('min_members', options.minMembers.toString());
    if (options?.includeMembers !== undefined)
      params.append('include_members', options.includeMembers.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());

    const query = params.toString();
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/similarity-groups${query ? `?${query}` : ''}`;

    const response = await apiClient.get<SimilarityGroupListResponse>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch groups');
    }
    return response.data!;
  }

  /**
   * Get a specific similarity group with members
   */
  async getSimilarityGroup(
    workspaceId: string,
    galleryId: string,
    groupId: string
  ): Promise<SimilarityGroup> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/similarity-groups/${groupId}`;
    const response = await apiClient.get<SimilarityGroup>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch group');
    }
    return response.data!;
  }

  /**
   * Override the best shot for a similarity group
   */
  async setBestShot(
    workspaceId: string,
    galleryId: string,
    groupId: string,
    data: SetBestShotRequest
  ): Promise<SimilarityGroup> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/similarity-groups/${groupId}/best-shot`;
    const response = await apiClient.put<SimilarityGroup>(endpoint, data);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to set best shot');
    }
    return response.data!;
  }

  // ---------------------------------------------------------------------------
  // Curation Selections
  // ---------------------------------------------------------------------------

  /**
   * Get curation selections for a session
   */
  async getSelections(
    workspaceId: string,
    galleryId: string,
    sessionId: string,
    options?: {
      includeReasons?: boolean;
    }
  ): Promise<CurationSelectionsResponse> {
    const params = new URLSearchParams();
    if (options?.includeReasons) params.append('include_reasons', 'true');

    const query = params.toString();
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/curation-sessions/${sessionId}/selections${query ? `?${query}` : ''}`;

    const response = await apiClient.get<CurationSelectionsResponse>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch selections');
    }
    return response.data!;
  }

  /**
   * Modify a single selection
   */
  async modifySelection(
    workspaceId: string,
    galleryId: string,
    sessionId: string,
    data: ModifySelectionRequest
  ): Promise<CurationSelectionsResponse> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/curation-sessions/${sessionId}/selections`;
    const response = await apiClient.patch<CurationSelectionsResponse>(endpoint, data);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to modify selection');
    }
    return response.data!;
  }

  /**
   * Bulk modify selections
   */
  async bulkModifySelections(
    workspaceId: string,
    galleryId: string,
    sessionId: string,
    data: BulkModifySelectionsRequest
  ): Promise<CurationSelectionsResponse> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/curation-sessions/${sessionId}/selections/bulk`;
    const response = await apiClient.post<CurationSelectionsResponse>(endpoint, data);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to modify selections');
    }
    return response.data!;
  }

  /**
   * Apply selections (create sub-gallery, export, or add to favorites)
   */
  async applySelections(
    workspaceId: string,
    galleryId: string,
    sessionId: string,
    data: ApplySelectionsRequest
  ): Promise<ApplySelectionsResponse> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/curation-sessions/${sessionId}/selections/apply`;
    const response = await apiClient.post<ApplySelectionsResponse>(endpoint, data);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to apply selections');
    }
    return response.data!;
  }

  // ---------------------------------------------------------------------------
  // User Preferences
  // ---------------------------------------------------------------------------

  /**
   * Get user's curation preferences
   */
  async getUserPreferences(): Promise<UserCurationPreferencesResponse> {
    const endpoint = '/api/v1/users/me/curation-preferences';
    const response = await apiClient.get<UserCurationPreferencesResponse>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch preferences');
    }
    return response.data!;
  }

  /**
   * Update user's curation preferences
   */
  async updateUserPreferences(
    data: UpdateUserPreferencesRequest
  ): Promise<UserCurationPreferencesResponse> {
    const endpoint = '/api/v1/users/me/curation-preferences';
    const response = await apiClient.patch<UserCurationPreferencesResponse>(endpoint, data);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to update preferences');
    }
    return response.data!;
  }
}

// Export singleton instance
export const curationService = new CurationService();

// Export default for compatibility
export default curationService;
