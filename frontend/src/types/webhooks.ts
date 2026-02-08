/**
 * Webhook types for the frontend.
 * Matches the webhooks-service API schemas.
 */

// =============================================================================
// Webhook Subscription Types
// =============================================================================

export interface WebhookSubscription {
  subscription_id: string;
  workspace_id: string;
  name: string;
  description?: string;
  endpoint_url: string;
  http_method: 'POST' | 'PUT' | 'PATCH';
  event_types: string[];
  event_filters?: Record<string, unknown>;
  is_active: boolean;
  payload_version: string;
  custom_headers?: Record<string, string>;
  max_retries: number;
  secret_key_masked: string;
  secret_version: number;
  created_at: string;
  updated_at: string;
}

export interface CreateWebhookSubscription {
  name: string;
  description?: string;
  endpoint_url: string;
  http_method?: 'POST' | 'PUT' | 'PATCH';
  event_types: string[];
  event_filters?: Record<string, unknown>;
  is_active?: boolean;
  payload_version?: string;
  custom_headers?: Record<string, string>;
  max_retries?: number;
}

export interface UpdateWebhookSubscription {
  name?: string;
  description?: string;
  endpoint_url?: string;
  http_method?: 'POST' | 'PUT' | 'PATCH';
  event_types?: string[];
  event_filters?: Record<string, unknown>;
  is_active?: boolean;
  payload_version?: string;
  custom_headers?: Record<string, string>;
  max_retries?: number;
}

export interface WebhookSubscriptionWithSecret extends WebhookSubscription {
  secret_key: string;
}

// =============================================================================
// Webhook Event Types
// =============================================================================

export type WebhookEventStatus =
  | 'pending'
  | 'processing'
  | 'delivered'
  | 'partially_delivered'
  | 'failed'
  | 'skipped';

export interface WebhookEvent {
  event_id: string;
  workspace_id: string;
  event_type: string;
  event_version: string;
  payload: Record<string, unknown>;
  source_service: string;
  status: WebhookEventStatus;
  idempotency_key?: string;
  correlation_id?: string;
  occurred_at: string;
  created_at: string;
  delivery_count: number;
  success_count: number;
  failure_count: number;
}

// =============================================================================
// Webhook Delivery Types
// =============================================================================

export type WebhookDeliveryStatus =
  | 'pending'
  | 'in_progress'
  | 'succeeded'
  | 'failed'
  | 'retrying'
  | 'exhausted'
  | 'cancelled';

export interface WebhookDelivery {
  delivery_id: string;
  event_id: string;
  subscription_id: string;
  workspace_id: string;
  status: WebhookDeliveryStatus;
  request_url: string;
  request_headers?: Record<string, string>;
  request_body?: Record<string, unknown>;
  response_status_code?: number;
  response_body?: string;
  response_duration_ms?: number;
  attempt_number: number;
  max_attempts: number;
  next_retry_at?: string;
  error_message?: string;
  created_at: string;
  completed_at?: string;
}

// =============================================================================
// Event Type Catalog
// =============================================================================

export interface WebhookEventType {
  event_type: string;
  category: string;
  name: string;
  description: string;
  payload_schema?: Record<string, unknown>;
  sample_payload?: Record<string, unknown>;
  is_active: boolean;
  introduced_version: string;
}

export type EventCategory =
  | 'workspace'
  | 'subscription'
  | 'user'
  | 'asset'
  | 'gallery'
  | 'invitation'
  | 'client';

// =============================================================================
// Statistics Types
// =============================================================================

export interface WebhookSubscriptionStats {
  subscription_id: string;
  total_deliveries: number;
  successful_deliveries: number;
  failed_deliveries: number;
  success_rate: number;
  avg_response_time_ms: number;
  p95_response_time_ms: number;
  last_delivery_at?: string;
  last_success_at?: string;
  last_failure_at?: string;
  circuit_breaker_state: 'closed' | 'open' | 'half_open';
  deliveries_by_status: Record<WebhookDeliveryStatus, number>;
  deliveries_by_day: Array<{
    date: string;
    succeeded: number;
    failed: number;
  }>;
}

export interface WebhookPlatformStats {
  total_subscriptions: number;
  active_subscriptions: number;
  total_events_today: number;
  total_deliveries_today: number;
  success_rate_today: number;
  avg_response_time_ms: number;
  dead_letter_queue_size: number;
  events_by_type: Record<string, number>;
  deliveries_by_status: Record<WebhookDeliveryStatus, number>;
}

// =============================================================================
// Dead Letter Queue Types
// =============================================================================

export interface DeadLetterQueueItem {
  id: string;
  delivery_id: string;
  event_id: string;
  subscription_id: string;
  workspace_id: string;
  event_type: string;
  endpoint_url: string;
  error_message: string;
  attempts: number;
  created_at: string;
  last_attempt_at: string;
}

// =============================================================================
// Pagination Types
// =============================================================================

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

// =============================================================================
// Filter Types
// =============================================================================

export interface WebhookEventFilters {
  event_type?: string;
  status?: WebhookEventStatus;
  start_date?: string;
  end_date?: string;
}

export interface WebhookDeliveryFilters {
  status?: WebhookDeliveryStatus;
  subscription_id?: string;
  start_date?: string;
  end_date?: string;
}

// =============================================================================
// Integration Template Types
// =============================================================================

export type TemplateCategory =
  | 'communication'
  | 'crm'
  | 'project_management'
  | 'analytics'
  | 'automation'
  | 'notification'
  | 'developer';

export type IntegrationType = 'zapier' | 'make' | 'native' | 'custom';

export type WorkflowStepType =
  | 'trigger'
  | 'transform'
  | 'condition'
  | 'http_request'
  | 'delay'
  | 'branch';

export type WorkflowExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface WorkflowStepDefinition {
  type: WorkflowStepType;
  name: string;
  description?: string;
  event?: string;
  config: Record<string, unknown>;
  input_mapping?: Record<string, string>;
  output_mapping?: Record<string, string>;
  condition?: Record<string, unknown>;
}

export interface WebhookTemplate {
  template_id: string;
  slug: string;
  name: string;
  short_description: string;
  long_description?: string;
  category: TemplateCategory;
  integration_type: IntegrationType;
  tags: string[];
  provider?: string;
  provider_logo_url?: string;
  provider_website?: string;
  trigger_events: string[];
  default_config: Record<string, unknown>;
  workflow_steps?: WorkflowStepDefinition[];
  sample_payload?: Record<string, unknown>;
  required_fields: string[];
  setup_instructions?: string;
  use_cases?: string[];
  best_practices?: Record<string, unknown>;
  documentation_url?: string;
  usage_count: number;
  rating?: number;
  rating_count: number;
  is_featured: boolean;
  is_premium: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WebhookTemplateSummary {
  template_id: string;
  slug: string;
  name: string;
  short_description: string;
  category: TemplateCategory;
  integration_type: IntegrationType;
  tags: string[];
  provider?: string;
  provider_logo_url?: string;
  trigger_events: string[];
  usage_count: number;
  rating?: number;
  is_featured: boolean;
  is_premium: boolean;
}

export interface TemplateListResponse {
  templates: WebhookTemplateSummary[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface TemplateFilterParams {
  category?: TemplateCategory;
  integration_type?: IntegrationType;
  provider?: string;
  tags?: string[];
  search?: string;
  event_type?: string;
  featured_only?: boolean;
  page?: number;
  page_size?: number;
}

export interface TemplateCategoryStats {
  category: TemplateCategory;
  total_templates: number;
  featured_count: number;
  total_usage: number;
}

// =============================================================================
// Workflow Types
// =============================================================================

export interface WebhookWorkflow {
  workflow_id: string;
  workspace_id: string;
  name: string;
  description?: string;
  template_id?: string;
  subscription_id?: string;
  trigger_events: string[];
  trigger_conditions?: Record<string, unknown>;
  workflow_steps: WorkflowStepResponse[];
  configuration: Record<string, unknown>;
  retry_policy?: Record<string, unknown>;
  timeout_seconds: number;
  rate_limit?: number;
  is_active: boolean;
  last_executed_at?: string;
  execution_count: number;
  success_count: number;
  failure_count: number;
  created_by_user_id?: string;
  created_at: string;
  updated_at: string;
}

export interface WorkflowStepResponse {
  step_id: string;
  workflow_id: string;
  step_order: number;
  step_type: WorkflowStepType;
  name: string;
  description?: string;
  configuration: Record<string, unknown>;
  input_mapping?: Record<string, string>;
  output_mapping?: Record<string, string>;
  condition?: Record<string, unknown>;
  continue_on_error: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkflowSummary {
  workflow_id: string;
  name: string;
  description?: string;
  template_id?: string;
  trigger_events: string[];
  is_active: boolean;
  last_executed_at?: string;
  execution_count: number;
  success_count: number;
  failure_count: number;
  success_rate: number;
}

export interface WorkflowListResponse {
  workflows: WorkflowSummary[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface CreateWorkflowFromTemplateRequest {
  template_id: string;
  name: string;
  description?: string;
  configuration?: Record<string, unknown>;
  is_active?: boolean;
}

export interface CreateCustomWorkflowRequest {
  name: string;
  description?: string;
  trigger_events: string[];
  trigger_conditions?: Record<string, unknown>;
  workflow_steps: WorkflowStepDefinition[];
  configuration?: Record<string, unknown>;
  timeout_seconds?: number;
  rate_limit?: number;
  is_active?: boolean;
}

export interface UpdateWorkflowRequest {
  name?: string;
  description?: string;
  trigger_events?: string[];
  trigger_conditions?: Record<string, unknown>;
  workflow_steps?: WorkflowStepDefinition[];
  configuration?: Record<string, unknown>;
  timeout_seconds?: number;
  rate_limit?: number;
  is_active?: boolean;
}

// =============================================================================
// Workflow Execution Types
// =============================================================================

export interface WorkflowStepResult {
  step_id: string;
  step_name: string;
  status: 'success' | 'failed' | 'skipped';
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
}

export interface WorkflowExecution {
  execution_id: string;
  workflow_id: string;
  workspace_id: string;
  trigger_event_id?: string;
  trigger_event_type: string;
  trigger_payload?: Record<string, unknown>;
  status: WorkflowExecutionStatus;
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
  steps_completed: number;
  steps_total: number;
  step_results?: WorkflowStepResult[];
  error_message?: string;
  error_step_id?: string;
  retry_count: number;
  output?: Record<string, unknown>;
  created_at: string;
}

export interface WorkflowExecutionSummary {
  execution_id: string;
  workflow_id: string;
  trigger_event_type: string;
  status: WorkflowExecutionStatus;
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
  steps_completed: number;
  steps_total: number;
  error_message?: string;
  created_at: string;
}

export interface WorkflowExecutionListResponse {
  executions: WorkflowExecutionSummary[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// =============================================================================
// Visual Workflow Builder Types
// =============================================================================

export interface WorkflowBuilderNode {
  id: string;
  type: WorkflowStepType;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  connections: string[];
}

export interface WorkflowBuilderEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface WorkflowBuilderState {
  nodes: WorkflowBuilderNode[];
  edges: WorkflowBuilderEdge[];
  viewport?: { x: number; y: number; zoom: number };
}

export interface SaveWorkflowBuilderRequest {
  name: string;
  description?: string;
  builder_state: WorkflowBuilderState;
  configuration?: Record<string, unknown>;
  is_active?: boolean;
}

export interface WorkflowValidationResult {
  is_valid: boolean;
  errors: string[];
  warnings: string[];
}

// =============================================================================
// Template Stats
// =============================================================================

export interface TemplateStatsResponse {
  total_templates: number;
  total_workflows: number;
  categories: TemplateCategoryStats[];
  top_templates: WebhookTemplateSummary[];
  recent_workflows: WorkflowSummary[];
}
