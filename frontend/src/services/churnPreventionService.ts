/**
 * Churn Prevention Service
 * API client for churn prediction, intervention campaigns, and A/B testing
 */

import apiClient from './api';

// ---------------------------------------------------------------------------
// Types - Risk and Prediction
// ---------------------------------------------------------------------------

export type ChurnRiskTier = 'critical' | 'high' | 'medium' | 'low' | 'minimal';

export interface ChurnRiskFactor {
  factor: string;
  weight: number;
  description: string;
  severity: 'high' | 'medium' | 'low';
}

export interface ChurnPrediction {
  prediction_id: string;
  client_id: string;
  client_name: string;
  risk_score: number;
  risk_tier: ChurnRiskTier;
  risk_factors: ChurnRiskFactor[];
  days_since_last_activity?: number;
  predicted_churn_date?: string;
  confidence: number;
  created_at: string;
  updated_at: string;
}

export interface AtRiskClient {
  client_id: string;
  client_name: string;
  client_email?: string;
  risk_score: number;
  risk_tier: ChurnRiskTier;
  risk_factors: ChurnRiskFactor[];
  days_since_last_activity?: number;
  last_activity_type?: string;
  requires_immediate_action: boolean;
  intervention_recommended?: string;
  intervention_count: number;
  last_intervention_at?: string;
}

// ---------------------------------------------------------------------------
// Types - Campaigns
// ---------------------------------------------------------------------------

export type CampaignType =
  | 'email_sequence'
  | 'in_app_prompt'
  | 'special_offer'
  | 're_engagement_gallery'
  | 'personal_outreach'
  | 'survey'
  | 'milestone_celebration';

export type CampaignStatus =
  | 'draft'
  | 'active'
  | 'paused'
  | 'completed'
  | 'archived';

export type InterventionActionType =
  | 'email'
  | 'in_app_notification'
  | 'push_notification'
  | 'discount_offer'
  | 'feature_highlight'
  | 'personal_message';

export type DeliveryStatus =
  | 'pending'
  | 'scheduled'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'converted'
  | 'failed'
  | 'bounced';

export type ActionOutcome =
  | 'converted'
  | 'engaged'
  | 'ignored'
  | 'unsubscribed'
  | 'expired';

export interface CampaignAction {
  action_id: string;
  action_type: InterventionActionType;
  template_id?: string;
  subject?: string;
  content?: string;
  delay_hours: number;
  order: number;
}

export interface Campaign {
  campaign_id: string;
  name: string;
  description?: string;
  campaign_type: CampaignType;
  status: CampaignStatus;
  target_risk_tiers: ChurnRiskTier[];
  min_risk_score?: number;
  max_risk_score?: number;
  actions: CampaignAction[];
  start_date?: string;
  end_date?: string;
  created_at: string;
  updated_at: string;
}

export interface CampaignPerformance {
  campaign_id: string;
  campaign_name: string;
  total_targeted: number;
  interventions_sent: number;
  opens: number;
  clicks: number;
  conversions: number;
  open_rate: number;
  click_rate: number;
  conversion_rate: number;
  retention_rate: number;
  clients_retained: number;
  clients_churned: number;
}

export interface InterventionAction {
  intervention_id: string;
  client_id: string;
  client_name: string;
  campaign_id: string;
  campaign_name: string;
  action_type: InterventionActionType;
  delivery_status: DeliveryStatus;
  outcome?: ActionOutcome;
  scheduled_at?: string;
  delivered_at?: string;
  opened_at?: string;
  clicked_at?: string;
  converted_at?: string;
  offer_code?: string;
  offer_expires_at?: string;
  created_at: string;
}

export interface InterventionHistory {
  interventions: InterventionAction[];
  total: number;
  conversions: number;
  conversion_rate: number;
}

// ---------------------------------------------------------------------------
// Types - A/B Testing
// ---------------------------------------------------------------------------

export type ExperimentStatus = 'draft' | 'running' | 'paused' | 'concluded';

export type MetricType =
  | 'conversion_rate'
  | 'retention_rate'
  | 'engagement_increase'
  | 'open_rate'
  | 'click_rate';

export interface ExperimentVariant {
  variant_id: string;
  name: string;
  description?: string;
  campaign_id: string;
  traffic_allocation: number;
  is_control: boolean;
  sample_size: number;
  conversions: number;
  conversion_rate: number;
  confidence_interval?: {
    lower: number;
    upper: number;
  };
}

export interface Experiment {
  experiment_id: string;
  name: string;
  description?: string;
  status: ExperimentStatus;
  primary_metric: MetricType;
  target_sample_size: number;
  minimum_detectable_effect: number;
  statistical_significance_threshold: number;
  variants: ExperimentVariant[];
  winner_variant_id?: string;
  created_at: string;
  started_at?: string;
  concluded_at?: string;
}

export interface ExperimentAnalysis {
  experiment_id: string;
  experiment_name: string;
  status: ExperimentStatus;
  primary_metric: MetricType;
  statistical_significance: number;
  is_significant: boolean;
  recommended_winner?: string;
  variants: Array<{
    variant_id: string;
    variant_name: string;
    is_control: boolean;
    sample_size: number;
    conversions: number;
    conversion_rate: number;
    confidence_interval: {
      lower: number;
      upper: number;
    };
    relative_improvement?: number;
    p_value?: number;
  }>;
  analyzed_at: string;
}

// ---------------------------------------------------------------------------
// Types - Dashboard
// ---------------------------------------------------------------------------

export interface RiskTierDistribution {
  critical: number;
  high: number;
  medium: number;
  low: number;
  minimal: number;
}

export interface ChurnDashboardSummary {
  total_clients: number;
  at_risk_clients: number;
  critical_risk_clients: number;
  active_campaigns: number;
  interventions_this_month: number;
  retention_rate: number;
  churn_rate: number;
  avg_risk_score: number;
}

export interface ChurnDashboard {
  summary: ChurnDashboardSummary;
  risk_distribution: RiskTierDistribution;
  at_risk_clients: AtRiskClient[];
  active_campaigns: Campaign[];
  recent_interventions: InterventionAction[];
  running_experiments: Experiment[];
  generated_at: string;
}

// ---------------------------------------------------------------------------
// Request Types
// ---------------------------------------------------------------------------

export interface CreateCampaignRequest {
  name: string;
  description?: string;
  campaign_type: CampaignType;
  target_risk_tiers: ChurnRiskTier[];
  min_risk_score?: number;
  max_risk_score?: number;
  actions: Array<{
    action_type: InterventionActionType;
    template_id?: string;
    subject?: string;
    content?: string;
    delay_hours: number;
  }>;
  start_date?: string;
  end_date?: string;
}

export interface UpdateCampaignRequest {
  name?: string;
  description?: string;
  target_risk_tiers?: ChurnRiskTier[];
  min_risk_score?: number;
  max_risk_score?: number;
  start_date?: string;
  end_date?: string;
}

export interface TriggerInterventionRequest {
  campaign_id: string;
  reason?: string;
}

export interface RecordOutcomeRequest {
  outcome: ActionOutcome;
  notes?: string;
}

export interface CreateExperimentRequest {
  name: string;
  description?: string;
  primary_metric: MetricType;
  target_sample_size?: number;
  minimum_detectable_effect?: number;
  statistical_significance_threshold?: number;
}

export interface AddVariantRequest {
  name: string;
  description?: string;
  campaign_id: string;
  traffic_allocation: number;
  is_control?: boolean;
}

export interface ListParams {
  limit?: number;
  offset?: number;
}

export interface AtRiskParams extends ListParams {
  risk_tier?: ChurnRiskTier;
  min_score?: number;
  requires_action?: boolean;
}

export interface CampaignListParams extends ListParams {
  status?: CampaignStatus;
  campaign_type?: CampaignType;
}

export interface ExperimentListParams extends ListParams {
  status?: ExperimentStatus;
}

// ---------------------------------------------------------------------------
// Response Types
// ---------------------------------------------------------------------------

export interface BatchPredictionResult {
  success: Array<{
    client_id: string;
    risk_score: number;
    risk_tier: ChurnRiskTier;
  }>;
  errors: Array<{
    client_id: string;
    error: string;
  }>;
}

export interface TriggerResult {
  triggered: number;
  skipped: number;
  errors: number;
  details: Array<{
    client_id: string;
    status: 'triggered' | 'skipped' | 'error';
    reason?: string;
  }>;
}

export interface SampleSizeEstimate {
  sample_size_per_variant: number;
  total_sample_size: number;
  baseline_rate: number;
  minimum_detectable_effect: number;
  statistical_power: number;
  significance_level: number;
  estimated_duration_days?: number;
}

// ---------------------------------------------------------------------------
// Service Class
// ---------------------------------------------------------------------------

function buildQueryString<T extends object>(params: T): string {
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

export class ChurnPreventionService {
  private getBaseUrl(workspaceId: string): string {
    return `/api/v1/workspaces/${workspaceId}/churn-prevention`;
  }

  // ---------------------------------------------------------------------------
  // Predictions
  // ---------------------------------------------------------------------------

  /**
   * Get churn prediction for a specific client
   */
  async getClientPrediction(
    workspaceId: string,
    clientId: string
  ): Promise<ChurnPrediction> {
    const response = await apiClient.get<ChurnPrediction>(
      `${this.getBaseUrl(workspaceId)}/predictions/${clientId}`
    );
    if (!response.data) throw new Error(response.error?.message || 'Failed to get prediction');
    return response.data;
  }

  /**
   * Generate predictions for multiple clients
   */
  async generateBatchPredictions(
    workspaceId: string,
    clientIds: string[]
  ): Promise<BatchPredictionResult> {
    const response = await apiClient.post<BatchPredictionResult>(
      `${this.getBaseUrl(workspaceId)}/predictions/batch`,
      { client_ids: clientIds }
    );
    if (!response.data) throw new Error(response.error?.message || 'Failed to generate predictions');
    return response.data;
  }

  /**
   * Get at-risk clients list
   */
  async getAtRiskClients(
    workspaceId: string,
    params: AtRiskParams = {}
  ): Promise<{ clients: AtRiskClient[]; total: number }> {
    const queryString = buildQueryString(params);
    const response = await apiClient.get<{ clients: AtRiskClient[]; total: number }>(
      `${this.getBaseUrl(workspaceId)}/at-risk${queryString}`
    );
    if (!response.data) throw new Error(response.error?.message || 'Failed to get at-risk clients');
    return response.data;
  }

  /**
   * Get churn prevention dashboard
   */
  async getDashboard(workspaceId: string): Promise<ChurnDashboard> {
    const response = await apiClient.get<ChurnDashboard>(
      `${this.getBaseUrl(workspaceId)}/dashboard`
    );
    if (!response.data) throw new Error(response.error?.message || 'Failed to get dashboard');
    return response.data;
  }

  // ---------------------------------------------------------------------------
  // Campaigns
  // ---------------------------------------------------------------------------

  /**
   * Create a new intervention campaign
   */
  async createCampaign(
    workspaceId: string,
    request: CreateCampaignRequest
  ): Promise<Campaign> {
    const response = await apiClient.post<Campaign>(
      `${this.getBaseUrl(workspaceId)}/campaigns`,
      request
    );
    if (!response.data) throw new Error(response.error?.message || 'Failed to create campaign');
    return response.data;
  }

  /**
   * Get a campaign by ID
   */
  async getCampaign(workspaceId: string, campaignId: string): Promise<Campaign> {
    const response = await apiClient.get<Campaign>(
      `${this.getBaseUrl(workspaceId)}/campaigns/${campaignId}`
    );
    if (!response.data) throw new Error(response.error?.message || 'Failed to get campaign');
    return response.data;
  }

  /**
   * List all campaigns
   */
  async listCampaigns(
    workspaceId: string,
    params: CampaignListParams = {}
  ): Promise<{ campaigns: Campaign[]; total: number }> {
    const queryString = buildQueryString(params);
    const response = await apiClient.get<{ campaigns: Campaign[]; total: number }>(
      `${this.getBaseUrl(workspaceId)}/campaigns${queryString}`
    );
    if (!response.data) throw new Error(response.error?.message || 'Failed to list campaigns');
    return response.data;
  }

  /**
   * Update a campaign
   */
  async updateCampaign(
    workspaceId: string,
    campaignId: string,
    request: UpdateCampaignRequest
  ): Promise<Campaign> {
    const response = await apiClient.patch<Campaign>(
      `${this.getBaseUrl(workspaceId)}/campaigns/${campaignId}`,
      request
    );
    if (!response.data) throw new Error(response.error?.message || 'Failed to update campaign');
    return response.data;
  }

  /**
   * Delete a campaign
   */
  async deleteCampaign(workspaceId: string, campaignId: string): Promise<void> {
    const response = await apiClient.delete(
      `${this.getBaseUrl(workspaceId)}/campaigns/${campaignId}`
    );
    if (response.error) throw new Error(response.error.message || 'Failed to delete campaign');
  }

  /**
   * Activate a campaign
   */
  async activateCampaign(workspaceId: string, campaignId: string): Promise<Campaign> {
    const response = await apiClient.post<Campaign>(
      `${this.getBaseUrl(workspaceId)}/campaigns/${campaignId}/activate`
    );
    if (!response.data) throw new Error(response.error?.message || 'Failed to activate campaign');
    return response.data;
  }

  /**
   * Pause a campaign
   */
  async pauseCampaign(workspaceId: string, campaignId: string): Promise<Campaign> {
    const response = await apiClient.post<Campaign>(
      `${this.getBaseUrl(workspaceId)}/campaigns/${campaignId}/pause`
    );
    if (!response.data) throw new Error(response.error?.message || 'Failed to pause campaign');
    return response.data;
  }

  /**
   * Get campaign performance metrics
   */
  async getCampaignPerformance(
    workspaceId: string,
    campaignId: string
  ): Promise<CampaignPerformance> {
    const response = await apiClient.get<CampaignPerformance>(
      `${this.getBaseUrl(workspaceId)}/campaigns/${campaignId}/performance`
    );
    if (!response.data) throw new Error(response.error?.message || 'Failed to get performance');
    return response.data;
  }

  /**
   * Get clients eligible for a campaign
   */
  async getEligibleClients(
    workspaceId: string,
    campaignId: string,
    limit: number = 50
  ): Promise<AtRiskClient[]> {
    const response = await apiClient.get<AtRiskClient[]>(
      `${this.getBaseUrl(workspaceId)}/campaigns/${campaignId}/eligible?limit=${limit}`
    );
    if (!response.data) throw new Error(response.error?.message || 'Failed to get eligible clients');
    return response.data;
  }

  // ---------------------------------------------------------------------------
  // Interventions
  // ---------------------------------------------------------------------------

  /**
   * Trigger intervention for a specific client
   */
  async triggerIntervention(
    workspaceId: string,
    clientId: string,
    request: TriggerInterventionRequest
  ): Promise<InterventionAction> {
    const response = await apiClient.post<InterventionAction>(
      `${this.getBaseUrl(workspaceId)}/interventions/trigger/${clientId}`,
      request
    );
    if (!response.data) throw new Error(response.error?.message || 'Failed to trigger intervention');
    return response.data;
  }

  /**
   * Trigger interventions for multiple clients
   */
  async triggerBatchInterventions(
    workspaceId: string,
    clientIds: string[],
    campaignId: string
  ): Promise<TriggerResult> {
    const response = await apiClient.post<TriggerResult>(
      `${this.getBaseUrl(workspaceId)}/interventions/trigger/batch`,
      { client_ids: clientIds, campaign_id: campaignId }
    );
    if (!response.data) throw new Error(response.error?.message || 'Failed to trigger batch interventions');
    return response.data;
  }

  /**
   * Record intervention outcome
   */
  async recordOutcome(
    workspaceId: string,
    interventionId: string,
    request: RecordOutcomeRequest
  ): Promise<InterventionAction> {
    const response = await apiClient.post<InterventionAction>(
      `${this.getBaseUrl(workspaceId)}/interventions/${interventionId}/outcome`,
      request
    );
    if (!response.data) throw new Error(response.error?.message || 'Failed to record outcome');
    return response.data;
  }

  /**
   * Get intervention history for a client
   */
  async getClientInterventionHistory(
    workspaceId: string,
    clientId: string,
    limit: number = 20
  ): Promise<InterventionHistory> {
    const response = await apiClient.get<InterventionHistory>(
      `${this.getBaseUrl(workspaceId)}/clients/${clientId}/interventions?limit=${limit}`
    );
    if (!response.data) throw new Error(response.error?.message || 'Failed to get intervention history');
    return response.data;
  }

  /**
   * Redeem an offer code
   */
  async redeemOfferCode(
    workspaceId: string,
    offerCode: string
  ): Promise<{ success: boolean; intervention_id: string; discount_percent?: number }> {
    const response = await apiClient.post<{ success: boolean; intervention_id: string; discount_percent?: number }>(
      `${this.getBaseUrl(workspaceId)}/interventions/redeem/${offerCode}`
    );
    if (!response.data) throw new Error(response.error?.message || 'Failed to redeem offer');
    return response.data;
  }

  // ---------------------------------------------------------------------------
  // A/B Testing / Experiments
  // ---------------------------------------------------------------------------

  /**
   * Create a new experiment
   */
  async createExperiment(
    workspaceId: string,
    request: CreateExperimentRequest
  ): Promise<Experiment> {
    const response = await apiClient.post<Experiment>(
      `${this.getBaseUrl(workspaceId)}/experiments`,
      request
    );
    if (!response.data) throw new Error(response.error?.message || 'Failed to create experiment');
    return response.data;
  }

  /**
   * Get an experiment by ID
   */
  async getExperiment(workspaceId: string, experimentId: string): Promise<Experiment> {
    const response = await apiClient.get<Experiment>(
      `${this.getBaseUrl(workspaceId)}/experiments/${experimentId}`
    );
    if (!response.data) throw new Error(response.error?.message || 'Failed to get experiment');
    return response.data;
  }

  /**
   * List all experiments
   */
  async listExperiments(
    workspaceId: string,
    params: ExperimentListParams = {}
  ): Promise<{ experiments: Experiment[]; total: number }> {
    const queryString = buildQueryString(params);
    const response = await apiClient.get<{ experiments: Experiment[]; total: number }>(
      `${this.getBaseUrl(workspaceId)}/experiments${queryString}`
    );
    if (!response.data) throw new Error(response.error?.message || 'Failed to list experiments');
    return response.data;
  }

  /**
   * Start an experiment
   */
  async startExperiment(workspaceId: string, experimentId: string): Promise<Experiment> {
    const response = await apiClient.post<Experiment>(
      `${this.getBaseUrl(workspaceId)}/experiments/${experimentId}/start`
    );
    if (!response.data) throw new Error(response.error?.message || 'Failed to start experiment');
    return response.data;
  }

  /**
   * Pause an experiment
   */
  async pauseExperiment(workspaceId: string, experimentId: string): Promise<Experiment> {
    const response = await apiClient.post<Experiment>(
      `${this.getBaseUrl(workspaceId)}/experiments/${experimentId}/pause`
    );
    if (!response.data) throw new Error(response.error?.message || 'Failed to pause experiment');
    return response.data;
  }

  /**
   * Conclude an experiment
   */
  async concludeExperiment(
    workspaceId: string,
    experimentId: string,
    winnerVariantId?: string
  ): Promise<Experiment> {
    const response = await apiClient.post<Experiment>(
      `${this.getBaseUrl(workspaceId)}/experiments/${experimentId}/conclude`,
      { winner_variant_id: winnerVariantId }
    );
    if (!response.data) throw new Error(response.error?.message || 'Failed to conclude experiment');
    return response.data;
  }

  /**
   * Add a variant to an experiment
   */
  async addVariant(
    workspaceId: string,
    experimentId: string,
    request: AddVariantRequest
  ): Promise<ExperimentVariant> {
    const response = await apiClient.post<ExperimentVariant>(
      `${this.getBaseUrl(workspaceId)}/experiments/${experimentId}/variants`,
      request
    );
    if (!response.data) throw new Error(response.error?.message || 'Failed to add variant');
    return response.data;
  }

  /**
   * Analyze experiment results
   */
  async analyzeExperiment(
    workspaceId: string,
    experimentId: string
  ): Promise<ExperimentAnalysis> {
    const response = await apiClient.get<ExperimentAnalysis>(
      `${this.getBaseUrl(workspaceId)}/experiments/${experimentId}/analyze`
    );
    if (!response.data) throw new Error(response.error?.message || 'Failed to analyze experiment');
    return response.data;
  }

  /**
   * Estimate required sample size for an experiment
   */
  async estimateSampleSize(
    workspaceId: string,
    baselineRate: number,
    minDetectableEffect: number,
    statisticalPower: number = 0.8,
    significanceLevel: number = 0.05
  ): Promise<SampleSizeEstimate> {
    const response = await apiClient.get<SampleSizeEstimate>(
      `${this.getBaseUrl(workspaceId)}/experiments/sample-size?baseline_rate=${baselineRate}&min_detectable_effect=${minDetectableEffect}&statistical_power=${statisticalPower}&significance_level=${significanceLevel}`
    );
    if (!response.data) throw new Error(response.error?.message || 'Failed to estimate sample size');
    return response.data;
  }
}

// Export singleton instance
export const churnPreventionService = new ChurnPreventionService();
