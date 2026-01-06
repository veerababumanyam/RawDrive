/**
 * Asset Cleanup Types
 *
 * Types for the automatic asset cleanup system that identifies and flags
 * unused/duplicate photos for storage optimization.
 */

// =============================================================================
// Cleanup Recommendation Enums
// =============================================================================

/**
 * Types of cleanup recommendations
 */
export enum CleanupRecommendationType {
  /** Exact duplicate file (sha256 match) */
  DUPLICATE = 'duplicate',
  /** Very similar photo with matching face(s) */
  SIMILAR_FACE = 'similar_face',
  /** No views, downloads, or gallery inclusion */
  UNUSED = 'unused',
  /** Below quality threshold */
  LOW_QUALITY = 'low_quality',
  /** Old file with no recent activity */
  OLD_UNUSED = 'old_unused',
}

/**
 * Status of a cleanup recommendation
 */
export enum CleanupRecommendationStatus {
  /** Awaiting user review */
  PENDING = 'pending',
  /** User approved for deletion */
  APPROVED = 'approved',
  /** User rejected, will not delete */
  REJECTED = 'rejected',
  /** Asset has been deleted */
  DELETED = 'deleted',
  /** Auto-approved based on workspace settings */
  AUTO_APPROVED = 'auto_approved',
}

/**
 * Status of a cleanup analysis job
 */
export enum CleanupJobStatus {
  /** Waiting to run */
  PENDING = 'pending',
  /** Currently analyzing */
  RUNNING = 'running',
  /** Analysis complete */
  COMPLETED = 'completed',
  /** Job failed with error */
  FAILED = 'failed',
  /** User cancelled */
  CANCELLED = 'cancelled',
}

/**
 * Type of cleanup analysis job
 */
export enum CleanupJobType {
  /** Complete workspace analysis */
  FULL_SCAN = 'full_scan',
  /** Analyze new assets since last job */
  INCREMENTAL = 'incremental',
  /** Only check for duplicates */
  DUPLICATES_ONLY = 'duplicates_only',
  /** Only check for similar faces */
  FACES_ONLY = 'faces_only',
}

// =============================================================================
// Cleanup Recommendation Interfaces
// =============================================================================

/**
 * Cleanup recommendation details for duplicates
 */
export interface DuplicateDetails {
  sha256_match: boolean;
  original_asset_id: string;
  size_bytes: number;
  duplicate_count: number;
}

/**
 * Cleanup recommendation details for similar faces
 */
export interface SimilarFaceDetails {
  face_similarity: number;
  face_id_1: string;
  face_id_2: string;
  keep_asset_id: string;
  face_group_id: string | null;
}

/**
 * Cleanup recommendation details for unused assets
 */
export interface UnusedDetails {
  days_since_upload: number;
  view_count: number;
  download_count: number;
  last_viewed_at: string | null;
}

/**
 * Union type for recommendation details
 */
export type CleanupRecommendationDetails =
  | DuplicateDetails
  | SimilarFaceDetails
  | UnusedDetails
  | Record<string, unknown>;

/**
 * Cleanup recommendation response
 */
export interface CleanupRecommendation {
  id: string;
  workspace_id: string;
  asset_id: string;
  recommendation_type: CleanupRecommendationType;
  confidence: number;
  status: CleanupRecommendationStatus;
  potential_savings_bytes: number;
  related_asset_id: string | null;
  details: CleanupRecommendationDetails;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  // Asset details from join
  original_object_key?: string;
  mime_type?: string;
  original_bytes?: number;
}

// =============================================================================
// Cleanup Job Interfaces
// =============================================================================

/**
 * Cleanup analysis job response
 */
export interface CleanupJob {
  id: string;
  workspace_id: string;
  status: CleanupJobStatus;
  job_type: CleanupJobType;
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

/**
 * Request to create a cleanup job
 */
export interface CreateCleanupJobRequest {
  job_type: CleanupJobType;
}

// =============================================================================
// Cleanup Settings Interfaces
// =============================================================================

/**
 * Cleanup settings response
 */
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

/**
 * Request to update cleanup settings
 */
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

// =============================================================================
// Cleanup Summary Interfaces
// =============================================================================

/**
 * Storage usage information
 */
export interface StorageUsage {
  storage_used_bytes: number;
  asset_count: number;
  storage_limit_bytes: number;
  plan_code: string | null;
  plan_name: string | null;
  usage_percent: number;
}

/**
 * Cleanup summary response
 */
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

// =============================================================================
// Bulk Action Interfaces
// =============================================================================

/**
 * Request for bulk recommendation actions
 */
export interface BulkRecommendationActionRequest {
  recommendation_ids: string[];
}

/**
 * Response for bulk actions
 */
export interface BulkActionResponse {
  updated_count: number;
}

// =============================================================================
// List Response Interfaces
// =============================================================================

/**
 * List response for cleanup recommendations
 */
export interface CleanupRecommendationsListResponse {
  data: CleanupRecommendation[];
  total: number;
  page: number;
  limit: number;
}

/**
 * List response for cleanup jobs
 */
export interface CleanupJobsListResponse {
  data: CleanupJob[];
}
