import type { GalleryAssetItem } from './gallery';
export type {
  StartAnalysisRequest,
  AnalysisProgress,
  AnalysisSummary,
} from '../validation/aiFilterSchemas';

export type QualityTier = 'all' | 'excellent' | 'good' | 'fair';

export interface AIFilterState {
  // Quality filters (US1-2)
  qualityTier: QualityTier;
  qualityMin?: number;
  blurHide: boolean;
  blurShowBokeh: boolean;
  minSharpness?: number;
  minExposure?: number;
  minComposition?: number;
  // Content/context filters (US4)
  includeTags?: string[];
  excludeTags?: string[];
  hasFaces?: boolean;
  minFaces?: number;
  maxFaces?: number;
  // Similarity filters (US5)
  hideSimilar?: boolean;
  similarityThreshold?: number;
  showOnlyBestShots?: boolean;
}

export interface AIFilterParams extends AIFilterState {
  page?: number;
  limit?: number;
}

export interface AIFilteredAssetPreview {
  asset_id: string;
  overall_score?: number;
  sharpness_score?: number;
  exposure_score?: number;
  composition_score?: number;
  blur_detected?: boolean;
  blur_type?: string | null;
  blur_severity?: string | null;
}

export interface AIFilterResponse {
  assets: AIFilteredAssetPreview[];
  meta: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
  filter_stats: {
    excellentCount: number;
    goodCount: number;
    fairCount: number;
    blurryHidden: number;
    similarityGroupsCount?: number;
  };
  applied_filters: Record<string, unknown>;
}

export interface AIFilterCountResponse {
  count: number;
  similarityGroupsCount: number;
}

export interface AppliedAIFilterResult {
  assetIds: string[];
  meta: AIFilterResponse['meta'];
  filterStats: AIFilterResponse['filter_stats'];
}

export interface VisibleAssetsResult {
  visibleAssets: GalleryAssetItem[];
  applied: boolean;
}

export interface CurationPreset {
  preset_id: string;
  name: string;
  description: string;
  target_count_ratio?: number;
  target_count_fixed?: number;
  quality_threshold: number;
  similarity_threshold: number;
  prioritize_expressions: boolean;
  prioritize_composition: boolean;
  enforce_story_coverage: boolean;
  enforce_person_coverage: boolean;
  is_system: boolean;
}

// ============================================================================
// US4: Content & Context Filtering Types
// ============================================================================

export interface TagOption {
  tag_id: string;
  name: string;
  type: string;
  color?: string;
  usage_count: number;
  source?: 'manual' | 'ai_vision' | 'ai_gemini' | 'ai_local';
}

export interface ContentFilterState {
  includeTags: string[];
  excludeTags: string[];
  hasFaces: boolean | undefined;
  minFaces: number | undefined;
  maxFaces: number | undefined;
}

export interface GalleryTagsResponse {
  tags: TagOption[];
  total: number;
}

// ============================================================================
// US5: Similarity Organization Types
// ============================================================================

export interface SimilarityGroup {
  group_id: string;
  best_asset_id: string | null;
  user_override_asset_id: string | null;
  member_count: number;
  avg_similarity: number;
  best_reason: string | null;
  members: SimilarityGroupMember[];
}

export interface SimilarityGroupMember {
  asset_id: string;
  similarity_score: number;
  is_best: boolean;
  is_user_selected: boolean;
  quality_rank: number | null;
}

export interface SimilarityFilterState {
  hideSimilar: boolean;
  similarityThreshold: number;
  showOnlyBestShots: boolean;
}

export interface SimilarityGroupsResponse {
  groups: SimilarityGroup[];
  total: number;
  singleton_count: number;
}

// ============================================================================
// US6: AI Create Types (Story/Caption generation)
// ============================================================================

export type AICreateMode = 'story' | 'caption' | 'hashtags';

export interface AICreateRequest {
  mode: AICreateMode;
  asset_ids: string[];
  style?: string;
  tone?: string;
  max_length?: number;
}

export interface AICreateResult {
  mode: AICreateMode;
  content: string;
  asset_count: number;
  tokens_used?: number;
}
