/**
 * Webhooks Service API Client
 *
 * Auto-generated TypeScript client for the Webhooks Service API.
 *
 * NOTE: This file will be replaced when running `pnpm generate:api-clients`.
 * This is a placeholder showing the expected API structure.
 *
 * @example
 * ```typescript
 * import { getSubscriptions, createSubscription } from '@rawdrive/api-types/webhooks-service';
 *
 * // List webhook subscriptions
 * const subscriptions = await getSubscriptions({ workspaceId: 'xxx' });
 *
 * // Create new subscription
 * const subscription = await createSubscription({
 *   workspaceId: 'xxx',
 *   data: {
 *     url: 'https://example.com/webhooks',
 *     events: ['gallery.created', 'asset.uploaded'],
 *   },
 * });
 * ```
 */

import { customInstance } from '../lib/axios-instance';

// ============================================================================
// Types
// ============================================================================

export type WebhookEventType =
  | 'gallery.created'
  | 'gallery.updated'
  | 'gallery.published'
  | 'gallery.deleted'
  | 'asset.uploaded'
  | 'asset.processed'
  | 'asset.deleted'
  | 'client.registered'
  | 'client.selection.submitted'
  | 'payment.completed'
  | 'subscription.created'
  | 'subscription.cancelled';

export interface WebhookSubscription {
  id: string;
  workspace_id: string;
  url: string;
  secret: string;
  events: WebhookEventType[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WebhookSubscriptionCreateRequest {
  url: string;
  events: WebhookEventType[];
  secret?: string;
}

export interface WebhookSubscriptionUpdateRequest {
  url?: string;
  events?: WebhookEventType[];
  is_active?: boolean;
}

export interface WebhookDelivery {
  id: string;
  subscription_id: string;
  event_type: WebhookEventType;
  payload: Record<string, unknown>;
  response_status?: number;
  response_body?: string;
  attempts: number;
  delivered_at?: string;
  next_retry_at?: string;
  created_at: string;
}

export interface WebhookDeliveryListResponse {
  data: WebhookDelivery[];
  meta: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface WebhookStats {
  total_deliveries: number;
  successful_deliveries: number;
  failed_deliveries: number;
  pending_deliveries: number;
  average_response_time_ms: number;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Get webhook subscriptions for a workspace.
 *
 * @param params - Request parameters
 * @returns List of subscriptions
 */
export async function getSubscriptions(params: {
  workspaceId: string;
}): Promise<WebhookSubscription[]> {
  return customInstance<WebhookSubscription[]>({
    url: '/api/v1/webhooks/subscriptions',
    method: 'GET',
    headers: { 'X-Workspace-ID': params.workspaceId },
  });
}

/**
 * Get a single subscription by ID.
 *
 * @param params - Request parameters
 * @returns Subscription details
 */
export async function getSubscription(params: {
  workspaceId: string;
  subscriptionId: string;
}): Promise<WebhookSubscription> {
  return customInstance<WebhookSubscription>({
    url: `/api/v1/webhooks/subscriptions/${params.subscriptionId}`,
    method: 'GET',
    headers: { 'X-Workspace-ID': params.workspaceId },
  });
}

/**
 * Create a new webhook subscription.
 *
 * @param params - Request parameters
 * @returns Created subscription
 */
export async function createSubscription(params: {
  workspaceId: string;
  data: WebhookSubscriptionCreateRequest;
}): Promise<WebhookSubscription> {
  return customInstance<WebhookSubscription>({
    url: '/api/v1/webhooks/subscriptions',
    method: 'POST',
    headers: { 'X-Workspace-ID': params.workspaceId },
    data: params.data,
  });
}

/**
 * Update a webhook subscription.
 *
 * @param params - Request parameters
 * @returns Updated subscription
 */
export async function updateSubscription(params: {
  workspaceId: string;
  subscriptionId: string;
  data: WebhookSubscriptionUpdateRequest;
}): Promise<WebhookSubscription> {
  return customInstance<WebhookSubscription>({
    url: `/api/v1/webhooks/subscriptions/${params.subscriptionId}`,
    method: 'PATCH',
    headers: { 'X-Workspace-ID': params.workspaceId },
    data: params.data,
  });
}

/**
 * Delete a webhook subscription.
 *
 * @param params - Request parameters
 */
export async function deleteSubscription(params: {
  workspaceId: string;
  subscriptionId: string;
}): Promise<void> {
  return customInstance<void>({
    url: `/api/v1/webhooks/subscriptions/${params.subscriptionId}`,
    method: 'DELETE',
    headers: { 'X-Workspace-ID': params.workspaceId },
  });
}

/**
 * Get delivery history for a subscription.
 *
 * @param params - Request parameters
 * @returns Paginated list of deliveries
 */
export async function getDeliveries(params: {
  workspaceId: string;
  subscriptionId: string;
  page?: number;
  limit?: number;
}): Promise<WebhookDeliveryListResponse> {
  const queryParams = new URLSearchParams();
  if (params.page) queryParams.append('page', params.page.toString());
  if (params.limit) queryParams.append('limit', params.limit.toString());

  const query = queryParams.toString();

  return customInstance<WebhookDeliveryListResponse>({
    url: `/api/v1/webhooks/subscriptions/${params.subscriptionId}/deliveries${query ? `?${query}` : ''}`,
    method: 'GET',
    headers: { 'X-Workspace-ID': params.workspaceId },
  });
}

/**
 * Retry a failed webhook delivery.
 *
 * @param params - Request parameters
 * @returns Delivery result
 */
export async function retryDelivery(params: {
  workspaceId: string;
  deliveryId: string;
}): Promise<WebhookDelivery> {
  return customInstance<WebhookDelivery>({
    url: `/api/v1/webhooks/deliveries/${params.deliveryId}/retry`,
    method: 'POST',
    headers: { 'X-Workspace-ID': params.workspaceId },
  });
}

/**
 * Get webhook statistics for a workspace.
 *
 * @param params - Request parameters
 * @returns Webhook statistics
 */
export async function getStats(params: {
  workspaceId: string;
  subscriptionId?: string;
  period?: '24h' | '7d' | '30d';
}): Promise<WebhookStats> {
  const queryParams = new URLSearchParams();
  if (params.subscriptionId) queryParams.append('subscription_id', params.subscriptionId);
  if (params.period) queryParams.append('period', params.period);

  const query = queryParams.toString();

  return customInstance<WebhookStats>({
    url: `/api/v1/webhooks/stats${query ? `?${query}` : ''}`,
    method: 'GET',
    headers: { 'X-Workspace-ID': params.workspaceId },
  });
}

/**
 * Test a webhook subscription by sending a test event.
 *
 * @param params - Request parameters
 * @returns Test delivery result
 */
export async function testSubscription(params: {
  workspaceId: string;
  subscriptionId: string;
}): Promise<WebhookDelivery> {
  return customInstance<WebhookDelivery>({
    url: `/api/v1/webhooks/subscriptions/${params.subscriptionId}/test`,
    method: 'POST',
    headers: { 'X-Workspace-ID': params.workspaceId },
  });
}

/**
 * Get available webhook event types.
 *
 * @returns List of event type definitions
 */
export async function getEventTypes(): Promise<{
  event_type: WebhookEventType;
  description: string;
  payload_schema: Record<string, unknown>;
}[]> {
  return customInstance<{
    event_type: WebhookEventType;
    description: string;
    payload_schema: Record<string, unknown>;
  }[]>({
    url: '/api/v1/webhooks/event-types',
    method: 'GET',
  });
}
