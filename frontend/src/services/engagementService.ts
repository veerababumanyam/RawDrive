/**
 * Engagement Scoring Service
 * API client for engagement tracking, scoring, and recommendations
 */

import apiClient from './api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Event Types
export type EngagementEventType =
  | 'gallery_view'
  | 'gallery_view_duration'
  | 'photo_view'
  | 'favorite_added'
  | 'favorite_removed'
  | 'selection_made'
  | 'selection_removed'
  | 'download_initiated'
  | 'download_completed'
  | 'rsvp_submitted'
  | 'rsvp_updated'
  | 'comment_added'
  | 'share_created'
  | 'share_accessed'
  | 'email_opened'
  | 'email_clicked'
  | 'email_bounced'
  | 'payment_received'
  | 'invoice_viewed'
  | 'magic_link_accessed'
  | 'qr_code_scanned';

export type ScoreTier =
  | 'champion'
  | 'hot'
  | 'warm'
  | 'cool'
  | 'cold'
  | 'at_risk'
  | 'churned';

export type ScoreTrend = 'rising' | 'stable' | 'declining';

export type RecommendationType =
  | 'email_timing'
  | 'photo_highlight'
  | 'special_offer'
  | 'check_in'
  | 're_engagement'
  | 'upsell'
  | 'feedback_request'
  | 'referral_ask'
  | 'milestone_celebration'
  | 'seasonal_promo';

export type RecommendationPriority = 'urgent' | 'high' | 'medium' | 'low';

export type RecommendationStatus =
  | 'pending'
  | 'scheduled'
  | 'sent'
  | 'completed'
  | 'dismissed'
  | 'expired';

export type RecommendationOutcome =
  | 'converted'
  | 'responded'
  | 'viewed'
  | 'ignored'
  | 'bounced'
  | 'unsubscribed';

// Request Types
export interface RecordEventRequest {
  client_id: string;
  event_type: EngagementEventType;
  gallery_id?: string;
  asset_id?: string;
  invitation_id?: string;
  metadata?: Record<string, unknown>;
  source?: string;
  device_type?: string;
}

export interface UpdateRecommendationRequest {
  status: RecommendationStatus;
  outcome?: RecommendationOutcome;
  dismissed_reason?: string;
}

export interface EventListParams {
  event_types?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}

export interface ScoreListParams {
  tier?: ScoreTier;
  limit?: number;
  offset?: number;
}

// Response Types
export interface EventResponse {
  event_id: string;
  event_type: string;
  event_timestamp: string;
  created_at: string;
  score_updated: boolean;
  new_score?: number;
  score_tier?: string;
}

export interface EventListItem {
  event_id: string;
  event_type: string;
  gallery_id?: string;
  asset_id?: string;
  invitation_id?: string;
  metadata: Record<string, unknown>;
  source?: string;
  device_type?: string;
  engagement_value: number;
  event_timestamp: string;
  created_at: string;
}

export interface EventListResponse {
  events: EventListItem[];
  meta: {
    total: number;
    limit: number;
    offset: number;
  };
}

export interface ScoreComponents {
  activity: number;
  engagement_depth: number;
  conversion: number;
  responsiveness: number;
  loyalty: number;
}

export interface ScoreTrendInfo {
  direction: ScoreTrend;
  velocity: number;
}

export interface ScoreMetrics {
  days_since_last_activity?: number;
  interactions_30d: number;
  interactions_90d: number;
}

export interface EngagementScore {
  client_id: string;
  client_name: string;
  total_score: number;
  score_tier: ScoreTier;
  components: ScoreComponents;
  trend: ScoreTrendInfo;
  metrics: ScoreMetrics;
  score_id: string;
  last_calculated_at: string;
}

export interface ScoreListItem {
  score_id: string;
  client_id: string;
  client_name: string;
  client_status: string;
  total_score: number;
  score_tier: ScoreTier;
  activity_score: number;
  engagement_depth_score: number;
  conversion_score: number;
  responsiveness_score: number;
  loyalty_score: number;
  score_trend: ScoreTrend;
  days_since_last_activity?: number;
  total_interactions_30d: number;
  last_calculated_at?: string;
}

export interface ScoreListResponse {
  scores: ScoreListItem[];
  meta: {
    total: number;
    limit: number;
    offset: number;
  };
}

export interface ScoreHistoryItem {
  history_id: string;
  total_score: number;
  score_tier: ScoreTier;
  activity_score?: number;
  engagement_depth_score?: number;
  conversion_score?: number;
  responsiveness_score?: number;
  loyalty_score?: number;
  high_intent_score?: number;
  churn_risk_score?: number;
  period_start: string;
  period_end: string;
  recorded_at: string;
}

export interface HighIntentSignal {
  signal: string;
  description: string;
  weight: number;
}

export interface ChurnRiskFactor {
  factor: string;
  description: string;
  weight: number;
  severity: 'high' | 'medium' | 'low';
}

export interface PredictiveScore {
  client_id: string;
  high_intent: {
    score: number;
    signals: HighIntentSignal[];
  };
  churn_risk: {
    score: number;
    factors: ChurnRiskFactor[];
  };
  predictions: {
    conversion_probability: number;
    ltv_tier: string;
  };
  urgency: {
    requires_immediate_action: boolean;
    action_deadline?: string;
  };
  prediction_id: string;
  predicted_at: string;
}

export interface Recommendation {
  recommendation_id: string;
  recommendation_type: RecommendationType;
  priority: RecommendationPriority;
  optimal_contact_time?: string;
  optimal_day_of_week?: string;
  optimal_time_of_day?: string;
  subject_suggestion?: string;
  message_template?: string;
  trigger_reason: string;
  supporting_data: Record<string, unknown>;
  highlighted_asset_ids: string[];
  offer_details?: Record<string, unknown>;
  status: RecommendationStatus;
  scheduled_for?: string;
  created_at: string;
  expires_at?: string;
}

export interface PendingRecommendation {
  recommendation_id: string;
  client_id: string;
  client_name: string;
  recommendation_type: RecommendationType;
  priority: RecommendationPriority;
  optimal_contact_time?: string;
  subject_suggestion?: string;
  trigger_reason: string;
  engagement_score?: number;
  score_tier?: ScoreTier;
  high_intent_score?: number;
  churn_risk_score?: number;
  created_at: string;
  expires_at?: string;
}

export interface HighIntentClient {
  client_id: string;
  client_name: string;
  high_intent_score: number;
  high_intent_signals: HighIntentSignal[];
  predicted_conversion_probability?: number;
  requires_immediate_action: boolean;
  engagement_score?: number;
  score_tier?: ScoreTier;
}

export interface ChurnRiskClient {
  client_id: string;
  client_name: string;
  churn_risk_score: number;
  churn_risk_factors: ChurnRiskFactor[];
  requires_immediate_action: boolean;
  recommended_action_deadline?: string;
  engagement_score?: number;
  score_tier?: ScoreTier;
  days_since_last_activity?: number;
}

export interface TierDistribution {
  champion: number;
  hot: number;
  warm: number;
  cool: number;
  cold: number;
  at_risk: number;
  churned: number;
}

export interface DashboardSummary {
  total_scored_clients: number;
  engaged_clients: number;
  at_risk_clients: number;
  engagement_rate: number;
}

export interface EngagementDashboard {
  summary: DashboardSummary;
  tier_distribution: TierDistribution;
  high_intent_clients: HighIntentClient[];
  churn_risk_clients: ChurnRiskClient[];
  pending_recommendations: PendingRecommendation[];
  generated_at: string;
}

export interface RecalculateResponse {
  workspace_id: string;
  total_clients: number;
  processed: number;
  errors: number;
}

// ---------------------------------------------------------------------------
// Service Class
// ---------------------------------------------------------------------------

function buildQueryString<T extends Record<string, unknown>>(params: T): string {
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

export class EngagementService {
  private getBaseUrl(workspaceId: string): string {
    return `/api/v1/workspaces/${workspaceId}/engagement`;
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  /**
   * Record an engagement event
   */
  async recordEvent(
    workspaceId: string,
    request: RecordEventRequest
  ): Promise<EventResponse> {
    const response = await apiClient.post<EventResponse>(
      `${this.getBaseUrl(workspaceId)}/events`,
      request
    );
    return response.data;
  }

  /**
   * Get events for a client
   */
  async getClientEvents(
    workspaceId: string,
    clientId: string,
    params: EventListParams = {}
  ): Promise<EventListResponse> {
    const queryString = buildQueryString(params);
    const response = await apiClient.get<EventListResponse>(
      `${this.getBaseUrl(workspaceId)}/clients/${clientId}/events${queryString}`
    );
    return response.data;
  }

  // ---------------------------------------------------------------------------
  // Scores
  // ---------------------------------------------------------------------------

  /**
   * Get all engagement scores
   */
  async getScores(
    workspaceId: string,
    params: ScoreListParams = {}
  ): Promise<ScoreListResponse> {
    const queryString = buildQueryString(params);
    const response = await apiClient.get<ScoreListResponse>(
      `${this.getBaseUrl(workspaceId)}/scores${queryString}`
    );
    return response.data;
  }

  /**
   * Get engagement score for a client
   */
  async getClientScore(
    workspaceId: string,
    clientId: string
  ): Promise<EngagementScore> {
    const response = await apiClient.get<EngagementScore>(
      `${this.getBaseUrl(workspaceId)}/clients/${clientId}/score`
    );
    return response.data;
  }

  /**
   * Recalculate score for a client
   */
  async recalculateClientScore(
    workspaceId: string,
    clientId: string
  ): Promise<EngagementScore> {
    const response = await apiClient.post<EngagementScore>(
      `${this.getBaseUrl(workspaceId)}/clients/${clientId}/score/recalculate`
    );
    return response.data;
  }

  /**
   * Get score history for a client
   */
  async getClientScoreHistory(
    workspaceId: string,
    clientId: string,
    snapshotType: 'daily' | 'weekly' | 'monthly' = 'daily',
    limit: number = 30
  ): Promise<ScoreHistoryItem[]> {
    const response = await apiClient.get<ScoreHistoryItem[]>(
      `${this.getBaseUrl(workspaceId)}/clients/${clientId}/score/history?snapshot_type=${snapshotType}&limit=${limit}`
    );
    return response.data;
  }

  /**
   * Get tier distribution
   */
  async getTierDistribution(workspaceId: string): Promise<TierDistribution> {
    const response = await apiClient.get<TierDistribution>(
      `${this.getBaseUrl(workspaceId)}/tier-distribution`
    );
    return response.data;
  }

  /**
   * Recalculate all scores
   */
  async recalculateAllScores(workspaceId: string): Promise<RecalculateResponse> {
    const response = await apiClient.post<RecalculateResponse>(
      `${this.getBaseUrl(workspaceId)}/scores/recalculate-all`
    );
    return response.data;
  }

  // ---------------------------------------------------------------------------
  // Predictive Scores
  // ---------------------------------------------------------------------------

  /**
   * Get predictive scores for a client
   */
  async getClientPredictions(
    workspaceId: string,
    clientId: string
  ): Promise<PredictiveScore> {
    const response = await apiClient.get<PredictiveScore>(
      `${this.getBaseUrl(workspaceId)}/clients/${clientId}/predictions`
    );
    return response.data;
  }

  /**
   * Get high-intent clients
   */
  async getHighIntentClients(
    workspaceId: string,
    minScore: number = 70,
    limit: number = 20
  ): Promise<HighIntentClient[]> {
    const response = await apiClient.get<HighIntentClient[]>(
      `${this.getBaseUrl(workspaceId)}/high-intent?min_score=${minScore}&limit=${limit}`
    );
    return response.data;
  }

  /**
   * Get churn risk clients
   */
  async getChurnRiskClients(
    workspaceId: string,
    minScore: number = 60,
    limit: number = 20
  ): Promise<ChurnRiskClient[]> {
    const response = await apiClient.get<ChurnRiskClient[]>(
      `${this.getBaseUrl(workspaceId)}/churn-risk?min_score=${minScore}&limit=${limit}`
    );
    return response.data;
  }

  // ---------------------------------------------------------------------------
  // Recommendations
  // ---------------------------------------------------------------------------

  /**
   * Get recommendations for a client
   */
  async getClientRecommendations(
    workspaceId: string,
    clientId: string,
    status?: RecommendationStatus,
    limit: number = 10
  ): Promise<Recommendation[]> {
    const params: Record<string, string | number> = { limit };
    if (status) params.status = status;
    const queryString = buildQueryString(params);
    const response = await apiClient.get<Recommendation[]>(
      `${this.getBaseUrl(workspaceId)}/clients/${clientId}/recommendations${queryString}`
    );
    return response.data;
  }

  /**
   * Generate recommendations for a client
   */
  async generateRecommendations(
    workspaceId: string,
    clientId: string
  ): Promise<Recommendation[]> {
    const response = await apiClient.post<Recommendation[]>(
      `${this.getBaseUrl(workspaceId)}/clients/${clientId}/recommendations/generate`
    );
    return response.data;
  }

  /**
   * Get all pending recommendations
   */
  async getPendingRecommendations(
    workspaceId: string,
    recommendationTypes?: RecommendationType[],
    priority?: RecommendationPriority,
    limit: number = 50
  ): Promise<PendingRecommendation[]> {
    const params: Record<string, string | number> = { limit };
    if (recommendationTypes?.length) {
      params.recommendation_types = recommendationTypes.join(',');
    }
    if (priority) params.priority = priority;
    const queryString = buildQueryString(params);
    const response = await apiClient.get<PendingRecommendation[]>(
      `${this.getBaseUrl(workspaceId)}/recommendations${queryString}`
    );
    return response.data;
  }

  /**
   * Update recommendation status
   */
  async updateRecommendationStatus(
    workspaceId: string,
    recommendationId: string,
    request: UpdateRecommendationRequest
  ): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.patch<{ success: boolean; message: string }>(
      `${this.getBaseUrl(workspaceId)}/recommendations/${recommendationId}`,
      request
    );
    return response.data;
  }

  // ---------------------------------------------------------------------------
  // Dashboard
  // ---------------------------------------------------------------------------

  /**
   * Get engagement dashboard
   */
  async getDashboard(workspaceId: string): Promise<EngagementDashboard> {
    const response = await apiClient.get<EngagementDashboard>(
      `${this.getBaseUrl(workspaceId)}/dashboard`
    );
    return response.data;
  }
}

// Export singleton instance
export const engagementService = new EngagementService();
