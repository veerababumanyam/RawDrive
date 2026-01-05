import apiClient from './api';
import type {
  AIFilterParams,
  AIFilterResponse,
  AIFilterCountResponse,
  AppliedAIFilterResult,
  GalleryTagsResponse,
  SimilarityGroupsResponse,
  AICreateRequest,
  AICreateResult,
} from '../types/aiFilter';
import type {
  StartAnalysisRequest,
  AnalysisProgress,
  AnalysisSummary,
  RetryFailedAnalysisResponse,
} from '../validation/aiFilterSchemas';

const buildQuery = (params: AIFilterParams) => {
  const search = new URLSearchParams();
  // Quality filters (US1-2)
  if (params.qualityTier) search.append('quality_tier', params.qualityTier);
  if (params.qualityMin !== undefined) search.append('quality_min', params.qualityMin.toString());
  if (params.blurHide) search.append('blur_hide', 'true');
  if (params.blurShowBokeh === false) search.append('blur_show_bokeh', 'false');
  if (params.minSharpness !== undefined) search.append('min_sharpness', params.minSharpness.toString());
  if (params.minExposure !== undefined) search.append('min_exposure', params.minExposure.toString());
  if (params.minComposition !== undefined) search.append('min_composition', params.minComposition.toString());
  // Content/context filters (US4)
  if (params.includeTags?.length) search.append('include_tags', params.includeTags.join(','));
  if (params.excludeTags?.length) search.append('exclude_tags', params.excludeTags.join(','));
  if (params.hasFaces !== undefined) search.append('has_faces', params.hasFaces.toString());
  if (params.minFaces !== undefined) search.append('min_faces', params.minFaces.toString());
  if (params.maxFaces !== undefined) search.append('max_faces', params.maxFaces.toString());
  // Similarity filters (US5)
  if (params.hideSimilar) search.append('hide_similar', 'true');
  if (params.similarityThreshold !== undefined) search.append('similarity_threshold', params.similarityThreshold.toString());
  if (params.showOnlyBestShots) search.append('show_only_best_shots', 'true');
  // Pagination
  if (params.page) search.append('page', params.page.toString());
  if (params.limit) search.append('limit', params.limit.toString());
  return search.toString();
};

export const aiFilterService = {
  async startAnalysis(
    workspaceId: string,
    galleryId: string,
    request: StartAnalysisRequest = {}
  ): Promise<void> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/smart-tagging/galleries/${galleryId}/analyze`;
    const response = await apiClient.post(endpoint, request);
    
    if (response.error) {
      // If analysis is already in progress (409), treat it as success so polling can resume
      if (response.error.status === 409) {
        return;
      }
      throw new Error(response.error.message || 'Failed to start analysis');
    }
  },

  async getAnalysisProgress(
    workspaceId: string,
    galleryId: string
  ): Promise<AnalysisProgress> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/smart-tagging/galleries/${galleryId}/analyze/progress`;
    const response = await apiClient.get<AnalysisProgress>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch analysis progress');
    }
    return response.data!;
  },

  async getAnalysisSummary(
    workspaceId: string,
    galleryId: string
  ): Promise<AnalysisSummary> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/smart-tagging/galleries/${galleryId}/analyze/summary`;
    const response = await apiClient.get<AnalysisSummary>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch analysis summary');
    }
    return response.data!;
  },

  async getFilteredAssets(
    workspaceId: string,
    galleryId: string,
    params: AIFilterParams
  ): Promise<AppliedAIFilterResult> {
    const query = buildQuery(params);
    const endpoint = `/api/v1/workspaces/${workspaceId}/smart-tagging/galleries/${galleryId}/ai-filter${query ? `?${query}` : ''}`;
    const response = await apiClient.get<AIFilterResponse>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch AI-filtered assets');
    }

    const data = response.data!;
    return {
      assetIds: data.assets.map((a) => a.asset_id),
      meta: data.meta,
      filterStats: data.filter_stats,
    };
  },

  async getFilterMatchCount(
    workspaceId: string,
    galleryId: string,
    params: AIFilterParams
  ): Promise<AIFilterCountResponse> {
    const query = buildQuery(params);
    const endpoint = `/api/v1/workspaces/${workspaceId}/smart-tagging/galleries/${galleryId}/ai-filter/count${query ? `?${query}` : ''}`;
    const response = await apiClient.get<AIFilterCountResponse>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch AI filter count');
    }
    return response.data!;
  },

  async getPresets(
    workspaceId: string
  ): Promise<import('../types/aiFilter').CurationPreset[]> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/smart-tagging/presets`;
    const response = await apiClient.get<{ presets: import('../types/aiFilter').CurationPreset[] }>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch curation presets');
    }
    return response.data!.presets;
  },

  /**
   * Retry analysis for photos that failed or were not analyzed (T023a).
   */
  async retryFailedAnalysis(
    workspaceId: string,
    galleryId: string
  ): Promise<RetryFailedAnalysisResponse> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/smart-tagging/galleries/${galleryId}/analyze/retry-failed`;
    const response = await apiClient.post<RetryFailedAnalysisResponse>(endpoint, {});
    if (response.error) {
      throw new Error(response.error.message || 'Failed to retry failed analysis');
    }
    return response.data!;
  },

  // ===========================================================================
  // US4: Content & Context Filtering
  // ===========================================================================

  /**
   * Get tags used in a gallery for content filtering UI.
   */
  async getGalleryTags(
    workspaceId: string,
    galleryId: string,
    options?: { source?: 'all' | 'ai' | 'manual'; minUsage?: number }
  ): Promise<GalleryTagsResponse> {
    const params = new URLSearchParams();
    if (options?.source) params.append('source', options.source);
    if (options?.minUsage) params.append('min_usage', options.minUsage.toString());
    const query = params.toString();
    const endpoint = `/api/v1/workspaces/${workspaceId}/smart-tagging/galleries/${galleryId}/tags${query ? `?${query}` : ''}`;
    const response = await apiClient.get<GalleryTagsResponse>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch gallery tags');
    }
    return response.data!;
  },

  // ===========================================================================
  // US5: Similarity Organization
  // ===========================================================================

  /**
   * Get similarity groups for a gallery.
   */
  async getSimilarityGroups(
    workspaceId: string,
    galleryId: string,
    options?: { minMembers?: number; includeMembers?: boolean; page?: number; limit?: number }
  ): Promise<SimilarityGroupsResponse> {
    const params = new URLSearchParams();
    if (options?.minMembers) params.append('min_members', options.minMembers.toString());
    if (options?.includeMembers) params.append('include_members', 'true');
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    const query = params.toString();
    const endpoint = `/api/v1/workspaces/${workspaceId}/smart-tagging/galleries/${galleryId}/similarity-groups${query ? `?${query}` : ''}`;
    const response = await apiClient.get<SimilarityGroupsResponse>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch similarity groups');
    }
    return response.data!;
  },

  /**
   * Set the best shot for a similarity group (user override).
   */
  async setBestShot(
    workspaceId: string,
    galleryId: string,
    groupId: string,
    assetId: string
  ): Promise<void> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/smart-tagging/galleries/${galleryId}/similarity-groups/${groupId}/best-shot`;
    const response = await apiClient.put(endpoint, { asset_id: assetId });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to set best shot');
    }
  },

  // ===========================================================================
  // US6: AI Create (Story/Caption generation)
  // ===========================================================================

  /**
   * Generate AI content (story, captions, hashtags) from selected photos.
   */
  async generateContent(
    workspaceId: string,
    galleryId: string,
    request: AICreateRequest
  ): Promise<AICreateResult> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/smart-tagging/galleries/${galleryId}/ai-create`;
    const response = await apiClient.post<AICreateResult>(endpoint, request);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to generate AI content');
    }
    return response.data!;
  },
};
