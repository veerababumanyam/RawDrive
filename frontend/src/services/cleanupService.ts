/**
 * Asset Cleanup Service
 *
 * API client for the automatic asset cleanup feature that identifies
 * and flags unused/duplicate photos for storage optimization.
 */

import apiClient from './api';

// =============================================================================
// Types (inline until shared-types is rebuilt)
// =============================================================================

export interface StorageUsage {
  storage_used_bytes: number;
  asset_count: number;
  storage_limit_bytes: number;
  plan_code: string | null;
  plan_name: string | null;
  usage_percent: number;
}

export interface CleanupSummary {
  total_recommendations: number;
  pending_recommendations: number;
  potential_savings_bytes: number;
  duplicates_count: number;
  similar_faces_count: number;
  unused_count: number;
  cleanup_recommended: boolean;
  storage: StorageUsage;
}

export interface CleanupRecommendation {
  id: string;
  workspace_id: string;
  asset_id: string;
  recommendation_type: string;
  confidence: number;
  status: string;
  potential_savings_bytes: number;
  related_asset_id: string | null;
  details: Record<string, unknown>;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  original_object_key?: string;
  mime_type?: string;
  original_bytes?: number;
}

export interface CleanupRecommendationsListResponse {
  data: CleanupRecommendation[];
  total: number;
  page: number;
  limit: number;
}

export interface CleanupJob {
  id: string;
  workspace_id: string;
  status: string;
  job_type: string;
  total_assets: number;
  processed_assets: number;
  recommendations_created: number;
  potential_savings_bytes: number;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  initiated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CleanupJobsListResponse {
  data: CleanupJob[];
}

export interface CleanupSettings {
  workspace_id: string;
  auto_analysis_enabled: boolean;
  auto_analysis_interval_days: number;
  auto_approve_threshold: number | null;
  duplicate_confidence_threshold: number;
  face_similarity_threshold: number;
  unused_days_threshold: number;
  include_gallery_assets: boolean;
  storage_alert_threshold_percent: number;
  email_notifications_enabled: boolean;
  notify_on_high_confidence: boolean;
  notify_on_storage_critical: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpdateCleanupSettingsRequest {
  auto_analysis_enabled?: boolean;
  auto_analysis_interval_days?: number;
  auto_approve_threshold?: number | null;
  duplicate_confidence_threshold?: number;
  face_similarity_threshold?: number;
  unused_days_threshold?: number;
  include_gallery_assets?: boolean;
  storage_alert_threshold_percent?: number;
  email_notifications_enabled?: boolean;
  notify_on_high_confidence?: boolean;
  notify_on_storage_critical?: boolean;
}

export interface BulkActionResponse {
  updated_count: number;
}

// =============================================================================
// Helpers
// =============================================================================

function buildQueryString(params: Record<string, unknown>): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      value.forEach((v) => searchParams.append(key, String(v)));
    } else {
      searchParams.append(key, String(value));
    }
  }

  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

// =============================================================================
// Cleanup Service Class
// =============================================================================

export class CleanupService {
  private getBaseUrl(workspaceId: string): string {
    return `/api/v1/workspaces/${workspaceId}/cleanup`;
  }

  // ---------------------------------------------------------------------------
  // Summary & Recommendations
  // ---------------------------------------------------------------------------

  /**
   * Get cleanup summary with storage usage and pending recommendations
   */
  async getSummary(workspaceId: string): Promise<CleanupSummary> {
    const response = await apiClient.get<CleanupSummary>(
      `${this.getBaseUrl(workspaceId)}/summary`
    );
    return response.data!;
  }

  /**
   * List cleanup recommendations for a workspace
   */
  async listRecommendations(
    workspaceId: string,
    params: {
      status?: 'pending' | 'approved' | 'rejected' | 'deleted' | 'auto_approved';
      type?: 'duplicate' | 'similar_face' | 'unused' | 'low_quality' | 'old_unused';
      min_confidence?: number;
      sort_by?: 'confidence' | 'potential_savings_bytes' | 'created_at';
      sort_order?: 'asc' | 'desc';
      page?: number;
      limit?: number;
    } = {}
  ): Promise<CleanupRecommendationsListResponse> {
    const queryString = buildQueryString(params);
    const response = await apiClient.get<CleanupRecommendationsListResponse>(
      `${this.getBaseUrl(workspaceId)}/recommendations${queryString}`
    );
    return response.data!;
  }

  /**
   * Approve a cleanup recommendation
   */
  async approveRecommendation(
    workspaceId: string,
    recommendationId: string
  ): Promise<CleanupRecommendation> {
    const response = await apiClient.post<CleanupRecommendation>(
      `${this.getBaseUrl(workspaceId)}/recommendations/${recommendationId}/approve`
    );
    return response.data!;
  }

  /**
   * Reject a cleanup recommendation
   */
  async rejectRecommendation(
    workspaceId: string,
    recommendationId: string
  ): Promise<CleanupRecommendation> {
    const response = await apiClient.post<CleanupRecommendation>(
      `${this.getBaseUrl(workspaceId)}/recommendations/${recommendationId}/reject`
    );
    return response.data!;
  }

  /**
   * Bulk approve multiple recommendations
   */
  async bulkApprove(
    workspaceId: string,
    recommendationIds: string[]
  ): Promise<BulkActionResponse> {
    const response = await apiClient.post<BulkActionResponse>(
      `${this.getBaseUrl(workspaceId)}/recommendations/bulk-approve`,
      { recommendation_ids: recommendationIds }
    );
    return response.data!;
  }

  /**
   * Bulk reject multiple recommendations
   */
  async bulkReject(
    workspaceId: string,
    recommendationIds: string[]
  ): Promise<BulkActionResponse> {
    const response = await apiClient.post<BulkActionResponse>(
      `${this.getBaseUrl(workspaceId)}/recommendations/bulk-reject`,
      { recommendation_ids: recommendationIds }
    );
    return response.data!;
  }

  // ---------------------------------------------------------------------------
  // Jobs
  // ---------------------------------------------------------------------------

  /**
   * Start a new cleanup analysis job
   */
  async createJob(
    workspaceId: string,
    jobType: 'full_scan' | 'incremental' | 'duplicates_only' | 'faces_only' = 'full_scan'
  ): Promise<CleanupJob> {
    const response = await apiClient.post<CleanupJob>(
      `${this.getBaseUrl(workspaceId)}/jobs`,
      { job_type: jobType }
    );
    return response.data!;
  }

  /**
   * List cleanup jobs for a workspace
   */
  async listJobs(
    workspaceId: string,
    params: {
      status?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<CleanupJobsListResponse> {
    const queryString = buildQueryString(params);
    const response = await apiClient.get<CleanupJobsListResponse>(
      `${this.getBaseUrl(workspaceId)}/jobs${queryString}`
    );
    return response.data!;
  }

  /**
   * Get a specific cleanup job
   */
  async getJob(workspaceId: string, jobId: string): Promise<CleanupJob> {
    const response = await apiClient.get<CleanupJob>(
      `${this.getBaseUrl(workspaceId)}/jobs/${jobId}`
    );
    return response.data!;
  }

  /**
   * Cancel a running or pending cleanup job
   */
  async cancelJob(workspaceId: string, jobId: string): Promise<CleanupJob> {
    const response = await apiClient.post<CleanupJob>(
      `${this.getBaseUrl(workspaceId)}/jobs/${jobId}/cancel`
    );
    return response.data!;
  }

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  /**
   * Get cleanup settings for a workspace
   */
  async getSettings(workspaceId: string): Promise<CleanupSettings> {
    const response = await apiClient.get<CleanupSettings>(
      `${this.getBaseUrl(workspaceId)}/settings`
    );
    return response.data!;
  }

  /**
   * Update cleanup settings for a workspace
   */
  async updateSettings(
    workspaceId: string,
    settings: UpdateCleanupSettingsRequest
  ): Promise<CleanupSettings> {
    const response = await apiClient.patch<CleanupSettings>(
      `${this.getBaseUrl(workspaceId)}/settings`,
      settings
    );
    return response.data!;
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

export const cleanupService = new CleanupService();

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format bytes to human-readable string
 */
export function formatStorageSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Get human-readable recommendation type label
 */
export function getRecommendationTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    duplicate: 'Duplicate',
    similar_face: 'Similar Photo',
    unused: 'Unused',
    low_quality: 'Low Quality',
    old_unused: 'Old & Unused',
  };
  return labels[type] || type;
}

/**
 * Get human-readable status label
 */
export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Pending Review',
    approved: 'Approved',
    rejected: 'Rejected',
    deleted: 'Deleted',
    auto_approved: 'Auto-Approved',
  };
  return labels[status] || status;
}

/**
 * Get color for recommendation confidence
 */
export function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.9) return 'text-red-600';
  if (confidence >= 0.75) return 'text-orange-500';
  if (confidence >= 0.6) return 'text-yellow-500';
  return 'text-gray-500';
}

/**
 * Calculate progress percentage for a job
 */
export function getJobProgress(job: CleanupJob): number {
  if (job.total_assets === 0) return 0;
  return Math.round((job.processed_assets / job.total_assets) * 100);
}
