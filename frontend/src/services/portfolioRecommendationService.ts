/**
 * Portfolio Recommendation Service
 * API client for AI-powered portfolio recommendations, client preferences, and A/B testing
 */

import apiClient from './api';
import { ABTestStatus, SceneCategory, RecommendationStatus } from '@rawdrive/shared-types';

// Re-export types for convenience
export { ABTestStatus, SceneCategory, RecommendationStatus } from '@rawdrive/shared-types';

// ---------------------------------------------------------------------------
// Types - Recommendations
// ---------------------------------------------------------------------------

export type RecommendationType =
  | 'portfolio_selection'
  | 'hero_shots'
  | 'similar_style'
  | 'seasonal_picks'
  | 'trending_shots'
  | 'personalized'
  | 'quick_delivery'
  | 'print_worthy'
  | 'social_media'
  | 'album_cover';

// RecommendationStatus is now imported from @rawdrive/shared-types

export type ClientType =
  | 'wedding_client'
  | 'portrait_client'
  | 'corporate_client'
  | 'event_client'
  | 'family_client'
  | 'commercial_client'
  | 'general';

export interface MatchReason {
  reason: string;
  detail: string;
  weight?: number;
}

export interface ScoreBreakdown {
  similarity_score?: number;
  engagement_score?: number;
  quality_score?: number;
  relevance_score?: number;
  recency_score?: number;
  diversity_score?: number;
}

export interface RecommendationItem {
  item_id: string;
  asset_id: string;
  rank_position: number;
  final_score: number;
  score?: number; // Alias for final_score
  similarity_score?: number;
  engagement_score?: number;
  quality_score?: number;
  relevance_score?: number;
  scene_category?: string;
  visual_tags: string[];
  match_reasons: MatchReason[];
  reason?: string; // Primary reason
  score_breakdown?: ScoreBreakdown;
  asset_url?: string;
  thumbnail_url?: string;
}

export interface Recommendation {
  recommendation_id: string;
  workspace_id: string;
  recommendation_type: RecommendationType;
  status: RecommendationStatus;
  client_id?: string;
  gallery_id?: string;
  occasion_type?: string;
  target_season?: string;
  target_theme?: string;
  total_candidates: number;
  total_recommended: number;
  items: RecommendationItem[];
  avg_similarity_score?: number;
  avg_engagement_score?: number;
  avg_quality_score?: number;
  algorithm_version?: string;
  ab_test_id?: string;
  ab_variant?: string;
  processing_time_ms?: number;
  requested_at: string;
  completed_at?: string;
  expires_at?: string;
}

export interface RecommendationSummary {
  recommendation_id: string;
  recommendation_type: RecommendationType;
  status: RecommendationStatus;
  client_id?: string;
  gallery_id?: string;
  total_recommended: number;
  avg_engagement_score?: number;
  user_rating?: number;
  items_selected: number;
  requested_at: string;
}

// ---------------------------------------------------------------------------
// Types - Requests
// ---------------------------------------------------------------------------

export interface GenerateRecommendationsRequest {
  recommendation_type: RecommendationType;
  client_id?: string;
  gallery_id?: string;
  source_gallery_ids?: string[];
  reference_asset_id?: string;
  occasion_type?: string;
  target_season?: string;
  target_theme?: string;
  limit?: number;
  include_scores?: boolean;
  filter_criteria?: Record<string, unknown>;
  scoring_weights?: Record<string, number>;
}

export interface SimilarAssetRequest {
  reference_asset_id: string;
  limit?: number;
  min_similarity?: number;
  exclude_same_gallery?: boolean;
  scene_filter?: SceneCategory;
}

export interface HeroShotsRequest {
  gallery_ids?: string[];
  limit?: number;
  min_quality_score?: number;
  diversity_factor?: number;
}

export type Season = 'spring' | 'summer' | 'fall' | 'winter';

export interface SeasonalRequest {
  target_season: Season;
  gallery_ids?: string[];
  limit?: number;
  occasion_type?: string;
}

// ---------------------------------------------------------------------------
// Types - Client Preferences
// ---------------------------------------------------------------------------

export interface ClientPreference {
  preference_id: string;
  workspace_id: string;
  client_id: string;
  client_type: ClientType;
  occasion_type?: string;
  preferred_styles: string[];
  preferred_colors: string[];
  preferred_compositions: string[];
  preferred_scenes: string[];
  embedding_confidence?: number;
  embedding_sample_size: number;
  total_galleries_viewed: number;
  total_selections_made: number;
  preference_confidence: number;
  last_interaction_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ClientPreferenceUpdate {
  client_type?: ClientType;
  occasion_type?: string;
  preferred_styles?: string[];
  preferred_colors?: string[];
  preferred_compositions?: string[];
  preferred_scenes?: string[];
}

export interface LearnPreferencesRequest {
  favorited_asset_ids?: string[];
  selected_asset_ids?: string[];
}

// ---------------------------------------------------------------------------
// Types - A/B Testing
// ---------------------------------------------------------------------------

export type ABTestType =
  | 'algorithm'
  | 'scoring_weights'
  | 'ui_presentation'
  | 'recommendation_count'
  | 'diversity_factor'
  | 'personalization_level';

export type PrimaryMetric =
  | 'selection_rate'
  | 'download_rate'
  | 'time_to_selection'
  | 'user_rating'
  | 'items_viewed'
  | 'engagement_rate';

export interface ABTestVariant {
  variant_id: string;
  name: string;
  description?: string;
  config: Record<string, unknown>;
  weight: number;
  is_control?: boolean;
  impressions?: number;
  clicks?: number;
  conversions?: number;
}

export interface ABTest {
  test_id: string;
  workspace_id: string;
  name: string;
  description?: string;
  test_name?: string;
  test_description?: string;
  hypothesis?: string;
  test_type: ABTestType;
  status: ABTestStatus;
  target_recommendation_types: string[];
  traffic_percentage: number;
  start_date: string;
  started_at?: string;
  end_date?: string;
  concluded_at?: string;
  primary_metric: PrimaryMetric;
  current_results?: Record<string, unknown>;
  winner_variant?: string;
  winner_variant_id?: string;
  statistical_significance_reached?: boolean;
  created_at: string;
  created_by?: string;
  variants?: ABTestVariant[];
}

export interface CreateABTestRequest {
  test_name: string;
  test_description?: string;
  hypothesis?: string;
  test_type: ABTestType;
  control_config: Record<string, unknown>;
  variants: ABTestVariant[];
  target_recommendation_types?: string[];
  target_client_types?: string[];
  traffic_percentage?: number;
  start_date: string;
  end_date?: string;
  min_sample_size?: number;
  significance_level?: number;
  minimum_detectable_effect?: number;
  primary_metric?: PrimaryMetric;
  secondary_metrics?: string[];
}

export interface ABTestResults {
  test_id: string;
  test_name: string;
  status: ABTestStatus;
  primary_metric: PrimaryMetric;
  variant_results: Record<string, {
    sample_size: number;
    items_recommended?: number;
    items_selected?: number;
    selection_rate: number;
    avg_rating?: number;
  }>;
  significance_results: Record<string, {
    lift: number;
    p_value: number;
    is_significant: boolean;
  }>;
  total_samples?: number;
  total_impressions?: number;
  total_clicks?: number;
  p_value?: number;
  is_significant?: boolean;
  recommended_winner?: string;
  min_sample_size: number;
}

// ---------------------------------------------------------------------------
// Types - Feedback
// ---------------------------------------------------------------------------

export type FeedbackType =
  | 'rating'
  | 'selection'
  | 'rejection'
  | 'reorder'
  | 'comment'
  | 'helpful'
  | 'not_helpful'
  | 'too_few'
  | 'too_many'
  | 'wrong_style';

export interface FeedbackRequest {
  feedback_type: FeedbackType;
  rating?: number;
  comment?: string;
  selected_count?: number;
  rejected_count?: number;
}

export interface Feedback {
  feedback_id: string;
  recommendation_id: string;
  feedback_source: string;
  feedback_type: FeedbackType;
  rating?: number;
  comment?: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Types - Top Assets
// ---------------------------------------------------------------------------

export interface TopAsset {
  asset_id: string;
  gallery_id?: string;
  engagement_score: number;
  total_views: number;
  view_count?: number;
  total_favorites: number;
  favorite_count?: number;
  total_selections: number;
  total_downloads: number;
  download_count?: number;
  conversion_rate: number;
  scene_category?: string;
  aesthetic_score?: number;
  quality_score?: number;
  rank_in_workspace: number;
  rank_in_category?: number;
  percentile: number;
  asset_url?: string;
  thumbnail_url?: string;
}

// ---------------------------------------------------------------------------
// Types - Batch Operations
// ---------------------------------------------------------------------------

export interface BatchEmbeddingRequest {
  gallery_ids?: string[];
  asset_ids?: string[];
  force_regenerate?: boolean;
  batch_size?: number;
}

export interface BatchEmbeddingResponse {
  total_requested: number;
  total_processed: number;
  total_failed: number;
  failed_asset_ids: string[];
  processing_time_ms: number;
}

export interface RefreshEngagementResponse {
  total_assets_updated: number;
  processing_time_ms: number;
}

// ---------------------------------------------------------------------------
// API Functions - Recommendations
// ---------------------------------------------------------------------------

const buildPath = (workspaceId: string, ...segments: string[]) =>
  `/api/v1/workspaces/${workspaceId}/portfolio-recommendations${segments.length ? '/' + segments.join('/') : ''}`;

export const portfolioRecommendationService = {
  /**
   * Generate portfolio recommendations
   */
  async generateRecommendations(
    workspaceId: string,
    request: GenerateRecommendationsRequest
  ): Promise<Recommendation> {
    const response = await apiClient.post<Recommendation>(
      buildPath(workspaceId, 'generate'),
      request
    );
    return response.data!;
  },

  /**
   * Find similar assets
   */
  async findSimilarAssets(
    workspaceId: string,
    request: SimilarAssetRequest
  ): Promise<Recommendation> {
    const response = await apiClient.post<Recommendation>(
      buildPath(workspaceId, 'similar'),
      request
    );
    return response.data!;
  },

  /**
   * Get personalized recommendations for a client
   */
  async getPersonalizedRecommendations(
    workspaceId: string,
    clientId: string,
    options?: {
      galleryIds?: string[];
      limit?: number;
      includeTrending?: boolean;
    }
  ): Promise<Recommendation> {
    const params = new URLSearchParams();
    if (options?.galleryIds) {
      options.galleryIds.forEach((id) => params.append('gallery_ids', id));
    }
    if (options?.limit) params.append('limit', String(options.limit));
    if (options?.includeTrending !== undefined) {
      params.append('include_trending', String(options.includeTrending));
    }

    const response = await apiClient.post<Recommendation>(
      `${buildPath(workspaceId, 'personalized', clientId)}?${params}`
    );
    return response.data!;
  },

  /**
   * Get hero shot recommendations
   */
  async getHeroShots(
    workspaceId: string,
    options?: HeroShotsRequest
  ): Promise<Recommendation> {
    const params = new URLSearchParams();
    if (options?.gallery_ids) {
      options.gallery_ids.forEach((id: string) => params.append('gallery_ids', id));
    }
    if (options?.limit) params.append('limit', String(options.limit));
    if (options?.min_quality_score) params.append('min_quality_score', String(options.min_quality_score));
    if (options?.diversity_factor) params.append('diversity_factor', String(options.diversity_factor));

    const response = await apiClient.post<Recommendation>(
      `${buildPath(workspaceId, 'hero-shots')}?${params}`
    );
    return response.data!;
  },

  /**
   * Get seasonal recommendations
   */
  async getSeasonalRecommendations(
    workspaceId: string,
    request: SeasonalRequest
  ): Promise<Recommendation> {
    const params = new URLSearchParams({
      target_season: request.target_season,
    });
    if (request.gallery_ids) {
      request.gallery_ids.forEach((id: string) => params.append('gallery_ids', id));
    }
    if (request.limit) params.append('limit', String(request.limit));
    if (request.occasion_type) params.append('occasion_type', request.occasion_type);

    const response = await apiClient.post<Recommendation>(
      `${buildPath(workspaceId, 'seasonal')}?${params}`
    );
    return response.data!;
  },

  /**
   * Get recommendation by ID
   */
  async getRecommendation(
    workspaceId: string,
    recommendationId: string,
    options?: {
      includeItems?: boolean;
      includeAssetDetails?: boolean;
    }
  ): Promise<Recommendation> {
    const params = new URLSearchParams();
    if (options?.includeItems !== undefined) {
      params.append('include_items', String(options.includeItems));
    }
    if (options?.includeAssetDetails !== undefined) {
      params.append('include_asset_details', String(options.includeAssetDetails));
    }

    const response = await apiClient.get<Recommendation>(
      `${buildPath(workspaceId, recommendationId)}?${params}`
    );
    return response.data!;
  },

  /**
   * List recommendations
   */
  async listRecommendations(
    workspaceId: string,
    options?: {
      recommendationType?: RecommendationType;
      status?: RecommendationStatus;
      clientId?: string;
      galleryId?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<RecommendationSummary[]> {
    const params = new URLSearchParams();
    if (options?.recommendationType) params.append('recommendation_type', options.recommendationType);
    if (options?.status) params.append('status', options.status);
    if (options?.clientId) params.append('client_id', options.clientId);
    if (options?.galleryId) params.append('gallery_id', options.galleryId);
    if (options?.limit) params.append('limit', String(options.limit));
    if (options?.offset) params.append('offset', String(options.offset));

    const response = await apiClient.get<RecommendationSummary[]>(
      `${buildPath(workspaceId)}?${params}`
    );
    return response.data!;
  },

  // ---------------------------------------------------------------------------
  // Client Preferences
  // ---------------------------------------------------------------------------

  /**
   * Get client preferences
   */
  async getClientPreferences(
    workspaceId: string,
    clientId: string
  ): Promise<ClientPreference | null> {
    const response = await apiClient.get<ClientPreference | null>(
      buildPath(workspaceId, 'clients', clientId, 'preferences')
    );
    return response.data!;
  },

  /**
   * Update client preferences
   */
  async updateClientPreferences(
    workspaceId: string,
    clientId: string,
    preferences: ClientPreferenceUpdate
  ): Promise<ClientPreference> {
    const response = await apiClient.put<ClientPreference>(
      buildPath(workspaceId, 'clients', clientId, 'preferences'),
      preferences
    );
    return response.data!;
  },

  /**
   * Learn client preferences from interactions
   */
  async learnClientPreferences(
    workspaceId: string,
    clientId: string,
    request: LearnPreferencesRequest
  ): Promise<ClientPreference> {
    const response = await apiClient.post<ClientPreference>(
      buildPath(workspaceId, 'clients', clientId, 'learn'),
      request
    );
    return response.data!;
  },

  // ---------------------------------------------------------------------------
  // A/B Testing
  // ---------------------------------------------------------------------------

  /**
   * Create A/B test
   */
  async createABTest(
    workspaceId: string,
    request: CreateABTestRequest
  ): Promise<ABTest> {
    const response = await apiClient.post<ABTest>(
      buildPath(workspaceId, 'ab-tests'),
      request
    );
    return response.data!;
  },

  /**
   * List A/B tests
   */
  async listABTests(
    workspaceId: string,
    options?: {
      status?: ABTestStatus;
      limit?: number;
      offset?: number;
    }
  ): Promise<ABTest[]> {
    const params = new URLSearchParams();
    if (options?.status) params.append('status', options.status);
    if (options?.limit) params.append('limit', String(options.limit));
    if (options?.offset) params.append('offset', String(options.offset));

    const response = await apiClient.get<ABTest[]>(
      `${buildPath(workspaceId, 'ab-tests')}?${params}`
    );
    return response.data!;
  },

  /**
   * Get A/B test by ID
   */
  async getABTest(
    workspaceId: string,
    testId: string
  ): Promise<ABTest> {
    const response = await apiClient.get<ABTest>(
      buildPath(workspaceId, 'ab-tests', testId)
    );
    return response.data!;
  },

  /**
   * Start A/B test
   */
  async startABTest(
    workspaceId: string,
    testId: string
  ): Promise<ABTest> {
    const response = await apiClient.post<ABTest>(
      buildPath(workspaceId, 'ab-tests', testId, 'start')
    );
    return response.data!;
  },

  /**
   * Conclude A/B test
   */
  async concludeABTest(
    workspaceId: string,
    testId: string,
    winnerVariant?: string
  ): Promise<ABTest> {
    const params = winnerVariant ? `?winner_variant=${winnerVariant}` : '';
    const response = await apiClient.post<ABTest>(
      `${buildPath(workspaceId, 'ab-tests', testId, 'conclude')}${params}`
    );
    return response.data!;
  },

  /**
   * Get A/B test results
   */
  async getABTestResults(
    workspaceId: string,
    testId: string
  ): Promise<ABTestResults> {
    const response = await apiClient.get<ABTestResults>(
      buildPath(workspaceId, 'ab-tests', testId, 'results')
    );
    return response.data!;
  },

  // ---------------------------------------------------------------------------
  // Feedback
  // ---------------------------------------------------------------------------

  /**
   * Submit feedback on a recommendation
   */
  async submitFeedback(
    workspaceId: string,
    recommendationId: string,
    feedback: FeedbackRequest
  ): Promise<Feedback> {
    const response = await apiClient.post<Feedback>(
      buildPath(workspaceId, recommendationId, 'feedback'),
      feedback
    );
    return response.data!;
  },

  /**
   * Record item interaction
   */
  async recordItemInteraction(
    workspaceId: string,
    itemId: string,
    interactionType: 'view' | 'select' | 'download' | 'reject',
    viewDurationMs?: number
  ): Promise<void> {
    await apiClient.post(
      buildPath(workspaceId, 'items', itemId, 'interaction'),
      {
        interaction_type: interactionType,
        view_duration_ms: viewDurationMs,
      }
    );
  },

  // ---------------------------------------------------------------------------
  // Top Assets & Analytics
  // ---------------------------------------------------------------------------

  /**
   * Get top performing assets
   */
  async getTopAssets(
    workspaceId: string,
    options?: {
      limit?: number;
      sceneCategory?: SceneCategory;
    }
  ): Promise<TopAsset[]> {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', String(options.limit));
    if (options?.sceneCategory) params.append('scene_category', options.sceneCategory);

    const response = await apiClient.get<TopAsset[]>(
      `${buildPath(workspaceId, 'top-assets')}?${params}`
    );
    return response.data!;
  },

  // ---------------------------------------------------------------------------
  // Embedding Management
  // ---------------------------------------------------------------------------

  /**
   * Generate batch embeddings
   */
  async generateBatchEmbeddings(
    workspaceId: string,
    request: BatchEmbeddingRequest
  ): Promise<BatchEmbeddingResponse> {
    const response = await apiClient.post<BatchEmbeddingResponse>(
      buildPath(workspaceId, 'embeddings', 'batch'),
      request
    );
    return response.data!;
  },

  /**
   * Refresh engagement scores
   */
  async refreshEngagementScores(
    workspaceId: string
  ): Promise<RefreshEngagementResponse> {
    const response = await apiClient.post<RefreshEngagementResponse>(
      buildPath(workspaceId, 'engagement', 'refresh')
    );
    return response.data!;
  },
};

export default portfolioRecommendationService;
