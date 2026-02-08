/**
 * Culling Workflow Service
 * API client for bulk photo culling workflow
 */

import { apiClient } from './api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CullingFilters {
  minOverallScore?: number;
  minSharpness?: number;
  minExposure?: number;
  maxExposure?: number;
  hasFaces?: boolean;
  minFaces?: number;
  hideBlur?: boolean;
  showBokeh?: boolean;
  exposureOptimal?: boolean;
}

export interface CullingPhoto {
  asset_id: string;
  thumbnail_url: string | null;
  processed_url: string | null;
  original_filename: string | null;
  overall_score: number;
  sharpness_score: number;
  exposure_score: number;
  composition_score: number;
  blur_detected: boolean;
  blur_type: string | null;
  blur_severity: string | null;
  is_intentional_blur: boolean;
  face_count: number;
  is_selected: boolean;
  is_rejected: boolean;
  rejection_reason: string | null;
  quality_tier: 'excellent' | 'good' | 'fair' | 'poor';
}

export interface CullingStats {
  total_photos: number;
  analyzed_count: number;
  selected_count: number;
  rejected_count: number;
  pending_count: number;
  excellent_count: number;
  good_count: number;
  fair_count: number;
  poor_count: number;
  faces_detected_count: number;
  blur_detected_count: number;
}

export interface CullingPhotosResponse {
  photos: CullingPhoto[];
  stats: CullingStats;
  total: number;
  page: number;
  limit: number;
}

export interface AutoRejectRequest {
  /** Reject photos with overall score below this threshold */
  max_overall_score?: number;
  /** Reject photos with sharpness below this threshold */
  max_sharpness_score?: number;
  /** Whether to reject blurry photos */
  reject_blur?: boolean;
  /** Whether to exclude intentional bokeh from blur rejection */
  exclude_bokeh?: boolean;
}

export interface AutoRejectResponse {
  rejected_count: number;
  asset_ids: string[];
}

export interface BulkActionResponse {
  count: number;
  message: string;
}

export interface ApplySelectionRequest {
  action: 'create_sub_gallery' | 'mark_favorites';
  name?: string;
}

export interface ApplySelectionResponse {
  success: boolean;
  message: string;
  sub_gallery_id?: string;
  count: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class CullingWorkflowService {
  /**
   * Get photos for culling grid with quality scores
   */
  async getPhotos(
    workspaceId: string,
    galleryId: string,
    options: {
      filters?: CullingFilters;
      page?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    } = {}
  ): Promise<CullingPhotosResponse> {
    const { filters = {}, page = 1, limit = 50, sortBy = 'overall_score', sortOrder = 'desc' } = options;

    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(limit));
    params.set('sort_by', sortBy);
    params.set('sort_order', sortOrder);

    // Add filter params
    if (filters.minOverallScore !== undefined) {
      params.set('min_overall_score', String(filters.minOverallScore));
    }
    if (filters.minSharpness !== undefined) {
      params.set('min_sharpness', String(filters.minSharpness));
    }
    if (filters.minExposure !== undefined) {
      params.set('min_exposure', String(filters.minExposure));
    }
    if (filters.maxExposure !== undefined) {
      params.set('max_exposure', String(filters.maxExposure));
    }
    if (filters.hasFaces !== undefined) {
      params.set('has_faces', String(filters.hasFaces));
    }
    if (filters.minFaces !== undefined) {
      params.set('min_faces', String(filters.minFaces));
    }
    if (filters.hideBlur !== undefined) {
      params.set('hide_blur', String(filters.hideBlur));
    }
    if (filters.showBokeh !== undefined) {
      params.set('show_bokeh', String(filters.showBokeh));
    }
    if (filters.exposureOptimal !== undefined) {
      params.set('exposure_optimal', String(filters.exposureOptimal));
    }

    const response = await apiClient.get<CullingPhotosResponse>(
      `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/culling/photos?${params.toString()}`
    );
    return response.data!;
  }

  /**
   * Get culling workflow statistics
   */
  async getStats(workspaceId: string, galleryId: string): Promise<CullingStats> {
    const response = await apiClient.get<CullingStats>(
      `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/culling/stats`
    );
    return response.data!;
  }

  /**
   * Auto-reject low quality photos
   */
  async autoReject(
    workspaceId: string,
    galleryId: string,
    options: AutoRejectRequest = {}
  ): Promise<AutoRejectResponse> {
    const response = await apiClient.post<AutoRejectResponse>(
      `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/culling/auto-reject`,
      {
        max_overall_score: options.max_overall_score ?? 40,
        max_sharpness_score: options.max_sharpness_score ?? 40,
        reject_blur: options.reject_blur ?? true,
        exclude_bokeh: options.exclude_bokeh ?? true,
      }
    );
    return response.data!;
  }

  /**
   * Bulk select photos as best shots
   */
  async bulkSelect(
    workspaceId: string,
    galleryId: string,
    assetIds: string[]
  ): Promise<BulkActionResponse> {
    const response = await apiClient.post<BulkActionResponse>(
      `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/culling/bulk-select`,
      { asset_ids: assetIds }
    );
    return response.data!;
  }

  /**
   * Bulk reject photos
   */
  async bulkReject(
    workspaceId: string,
    galleryId: string,
    assetIds: string[],
    reason?: string
  ): Promise<BulkActionResponse> {
    const response = await apiClient.post<BulkActionResponse>(
      `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/culling/bulk-reject`,
      { asset_ids: assetIds, reason }
    );
    return response.data!;
  }

  /**
   * Reset selection status for photos
   */
  async bulkReset(
    workspaceId: string,
    galleryId: string,
    assetIds: string[]
  ): Promise<BulkActionResponse> {
    const response = await apiClient.post<BulkActionResponse>(
      `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/culling/bulk-reset`,
      { asset_ids: assetIds }
    );
    return response.data!;
  }

  /**
   * Get final selected photos for preview
   */
  async getSelection(
    workspaceId: string,
    galleryId: string,
    page = 1,
    limit = 100
  ): Promise<CullingPhotosResponse> {
    const response = await apiClient.get<CullingPhotosResponse>(
      `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/culling/selection?page=${page}&limit=${limit}`
    );
    return response.data!;
  }

  /**
   * Apply culling selection to gallery
   */
  async applySelection(
    workspaceId: string,
    galleryId: string,
    request: ApplySelectionRequest
  ): Promise<ApplySelectionResponse> {
    const response = await apiClient.post<ApplySelectionResponse>(
      `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/culling/apply`,
      request
    );
    return response.data!;
  }
}

export const cullingWorkflowService = new CullingWorkflowService();
