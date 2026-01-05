/**
 * Curation Types
 * TypeScript types for Enhanced Smart Curate feature
 *
 * Feature: 023-enhanced-smart-curate
 */

// ---------------------------------------------------------------------------
// Enum Types
// ---------------------------------------------------------------------------

export type CurationStatus =
  | 'pending'
  | 'analyzing'
  | 'grouping'
  | 'curating'
  | 'completed'
  | 'failed';

export type BlurSeverity = 'low' | 'medium' | 'high';
export type BlurType = 'motion' | 'focus' | 'bokeh';
export type BlurRegion = 'center' | 'edges' | 'full';

export type NoiseLevel = 'low' | 'medium' | 'high';

export type SelectionType = 'selected' | 'safety_set' | 'rejected';

// ---------------------------------------------------------------------------
// Curation Preset Types
// ---------------------------------------------------------------------------

export interface CurationPreset {
  preset_id: string;
  workspace_id: string | null;
  name: string;
  description?: string;
  target_count_ratio?: number;
  target_count_fixed?: number;
  quality_threshold: number;
  similarity_threshold: number;
  prioritize_expressions: boolean;
  prioritize_composition: boolean;
  enforce_story_coverage: boolean;
  enforce_person_coverage: boolean;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface CurationPresetCreateRequest {
  name: string;
  description?: string;
  target_count_ratio?: number;
  target_count_fixed?: number;
  quality_threshold?: number;
  similarity_threshold?: number;
  prioritize_expressions?: boolean;
  prioritize_composition?: boolean;
  enforce_story_coverage?: boolean;
  enforce_person_coverage?: boolean;
}

export interface CurationPresetUpdateRequest {
  name?: string;
  description?: string;
  target_count_ratio?: number;
  target_count_fixed?: number;
  quality_threshold?: number;
  similarity_threshold?: number;
  prioritize_expressions?: boolean;
  prioritize_composition?: boolean;
  enforce_story_coverage?: boolean;
  enforce_person_coverage?: boolean;
}

export interface CurationPresetListResponse {
  presets: CurationPreset[];
  total: number;
}

// ---------------------------------------------------------------------------
// Curation Session Types
// ---------------------------------------------------------------------------

export interface CurationSessionProgress {
  percent: number;
  stage?: string;
  total_photos?: number;
  analyzed_count: number;
  groups_count?: number;
  selected_count?: number;
}

export interface CurationSession {
  session_id: string;
  workspace_id: string;
  gallery_id: string;
  user_id: string;
  preset_id?: string;
  name?: string;
  status: CurationStatus;
  target_count?: number;
  quality_threshold: number;
  similarity_threshold: number;
  include_expression_analysis: boolean;
  include_scene_detection: boolean;
  include_diversity: boolean;
  progress: CurationSessionProgress;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CurationSessionCreateRequest {
  name?: string;
  preset_id?: string;
  target_count?: number;
  quality_threshold?: number;
  similarity_threshold?: number;
  include_expression_analysis?: boolean;
  include_scene_detection?: boolean;
  include_diversity?: boolean;
  auto_start?: boolean;
}

export interface CurationSessionUpdateRequest {
  name?: string;
  target_count?: number;
  quality_threshold?: number;
  similarity_threshold?: number;
}

export interface CurationSessionListResponse {
  sessions: CurationSession[];
  total: number;
}

export interface CurationSessionStartRequest {
  resume_from_step?: string;
}

// ---------------------------------------------------------------------------
// Quality Analysis Types
// ---------------------------------------------------------------------------

export interface QualityAnalysisStartRequest {
  session_id?: string;
  asset_ids?: string[];
}

export interface CropSuggestion {
  x: number;
  y: number;
  width: number;
  height: number;
  reason?: string;
}

export interface PhotoQualityResult {
  asset_id: string;
  overall_score: number;
  sharpness_score: number;
  exposure_score: number;
  composition_score: number;
  blur_detected: boolean;
  blur_type?: BlurType;
  blur_confidence?: number;
  blur_severity?: BlurSeverity;
  blur_region?: BlurRegion;
  is_intentional_blur?: boolean;
  is_technical_reject?: boolean;
  highlights_clipped?: boolean;
  shadows_blocked?: boolean;
  noise_level?: NoiseLevel;
  horizon_tilt_degrees?: number;
  crop_suggestion?: CropSuggestion;
  expression_data?: Record<string, unknown>;
  scene_type?: string;
  analyzed_at?: string;
  event_type?: string;
  key_elements?: string[];
  activity?: string;
  semantic_description?: string;
  lighting?: string;
  mood?: string;
}

/** Blur detection result for blur-focused queries */
export interface BlurDetectionResult {
  asset_id: string;
  blur_detected: boolean;
  blur_type?: BlurType;
  blur_confidence: number;
  blur_severity?: BlurSeverity;
  blur_region?: BlurRegion;
  is_intentional_blur: boolean;
  is_technical_reject: boolean;
  sharpness_score: number;
}

/** Summary of blur detection results */
export interface BlurDetectionSummary {
  total_analyzed: number;
  blur_count: number;
  motion_blur_count: number;
  focus_blur_count: number;
  bokeh_count: number;
  technical_reject_count: number;
  severity_low: number;
  severity_medium: number;
  severity_high: number;
}

/** Response for blur detection endpoint */
export interface BlurDetectionResponse {
  gallery_id: string;
  results: BlurDetectionResult[];
  total: number;
  summary: BlurDetectionSummary;
}

export interface QualityAnalysisSummary {
  total_analyzed: number;
  average_score: number;
  blur_count: number;
  excellent_count: number;
  good_count: number;
  fair_count: number;
  poor_count: number;
}

export interface QualityAnalysisResponse {
  gallery_id: string;
  results: PhotoQualityResult[];
  summary: QualityAnalysisSummary;
}

export interface QualityAnalysisProgressResponse {
  session_id: string;
  status: CurationStatus;
  progress_percent: number;
  photos_analyzed: number;
  photos_total: number;
  estimated_remaining_seconds?: number;
}

// ---------------------------------------------------------------------------
// Similarity Grouping Types
// ---------------------------------------------------------------------------

export interface SimilarityGroupMember {
  asset_id: string;
  similarity_score: number;
  is_best: boolean;
  is_user_selected: boolean;
  quality_rank?: number;
  thumbnail_url?: string;
}

export interface SimilarityGroup {
  group_id: string;
  session_id: string;
  best_asset_id?: string;
  user_override_asset_id?: string;
  member_count: number;
  avg_similarity: number;
  best_reason?: string;
  members: SimilarityGroupMember[];
  created_at: string;
}

export interface SimilarityGroupListResponse {
  groups: SimilarityGroup[];
  total: number;
  singleton_count: number;
}

export interface SetBestShotRequest {
  asset_id: string;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Curation Selection Types
// ---------------------------------------------------------------------------

export interface CurationSelectionItem {
  asset_id: string;
  selection_type: SelectionType;
  selection_reason?: string;
  quality_rank?: number;
  diversity_contribution?: number;
  is_user_override: boolean;
}

export interface CurationSelectionsResponse {
  session_id: string;
  selected: CurationSelectionItem[];
  safety_set: CurationSelectionItem[];
  rejected_count: number;
  total_count: number;
}

export interface ModifySelectionRequest {
  asset_id: string;
  selection_type: SelectionType;
  reason?: string;
}

export interface BulkModifySelectionsRequest {
  modifications: ModifySelectionRequest[];
}

export type ApplySelectionsAction =
  | 'create_sub_gallery'
  | 'export'
  | 'add_to_favorites';

export interface ApplySelectionsRequest {
  action: ApplySelectionsAction;
  name?: string;
  include_safety_set?: boolean;
}

export interface ApplySelectionsResponse {
  success: boolean;
  message: string;
  sub_gallery_id?: string;
  export_url?: string;
  photos_count: number;
}

// ---------------------------------------------------------------------------
// User Preferences Types
// ---------------------------------------------------------------------------

export interface UserCurationPreferences {
  quality_weight: number;
  composition_weight: number;
  expression_weight: number;
  diversity_weight: number;
  preferred_focal_lengths: string[];
  preferred_orientations: string[];
  avoid_patterns: string[];
}

export interface UserCurationPreferencesResponse {
  user_id: string;
  preference_data: UserCurationPreferences;
  sessions_analyzed: number;
  last_learned_at?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpdateUserPreferencesRequest {
  is_active?: boolean;
  reset_preferences?: boolean;
}

// ---------------------------------------------------------------------------
// UI Helper Types
// ---------------------------------------------------------------------------

/** Quality tier based on overall score */
export type QualityTier = 'excellent' | 'good' | 'fair' | 'poor';

/** Get quality tier from score */
export function getQualityTier(score: number): QualityTier {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'fair';
  return 'poor';
}

/** Quality tier colors for UI */
export const QUALITY_TIER_COLORS: Record<QualityTier, string> = {
  excellent: 'text-green-500',
  good: 'text-blue-500',
  fair: 'text-yellow-500',
  poor: 'text-red-500',
};

/** Quality tier labels */
export const QUALITY_TIER_LABELS: Record<QualityTier, string> = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
};

/** Convert score to 1-5 star rating */
export function scoreToStars(score: number): number {
  if (score >= 90) return 5;
  if (score >= 75) return 4;
  if (score >= 55) return 3;
  if (score >= 35) return 2;
  return 1;
}

/** Curation status labels for UI */
export const CURATION_STATUS_LABELS: Record<CurationStatus, string> = {
  pending: 'Pending',
  analyzing: 'Analyzing Quality',
  grouping: 'Grouping Similar',
  curating: 'Selecting Best',
  completed: 'Completed',
  failed: 'Failed',
};

/** Curation status colors */
export const CURATION_STATUS_COLORS: Record<CurationStatus, string> = {
  pending: 'text-gray-500',
  analyzing: 'text-blue-500',
  grouping: 'text-purple-500',
  curating: 'text-orange-500',
  completed: 'text-green-500',
  failed: 'text-red-500',
};
