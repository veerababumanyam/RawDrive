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
