/**
 * Webhooks Service - API client for webhook management.
 * Communicates with the webhooks-service microservice.
 */

import api from './api';
import { getStoredWorkspace } from './auth';
import type {
  WebhookSubscription,
  WebhookSubscriptionWithSecret,
  CreateWebhookSubscription,
  UpdateWebhookSubscription,
  WebhookEvent,
  WebhookDelivery,
  WebhookEventType,
  WebhookSubscriptionStats,
  WebhookPlatformStats,
  DeadLetterQueueItem,
  PaginatedResponse,
  WebhookEventFilters,
} from '../types/webhooks';

// Base path for webhooks API (routed through Traefik to webhooks-service)
const WEBHOOKS_BASE = '/api/v1/webhooks';
const ADMIN_BASE = '/api/v1/admin/webhooks';

// Helper to handle API response unwrapping
async function unwrap<T>(promise: Promise<{ data?: T; error?: any }>): Promise<T> {
  const response = await promise;
  if (response.error) {
    throw new Error(response.error.message || 'Request failed');
  }
  if (response.data === undefined) {
    throw new Error('No data received from API');
  }
  return response.data;
}

// Helper to get workspace ID header
function getWorkspaceHeader(): Record<string, string> {
  const workspace = getStoredWorkspace();
  if (workspace?.workspace_id) {
    return { 'X-Workspace-ID': workspace.workspace_id };
  }
  return {};
}

// =============================================================================
// Subscription Management
// =============================================================================

/**
 * Create a new webhook subscription.
 */
export async function createWebhookSubscription(
  data: CreateWebhookSubscription
): Promise<WebhookSubscriptionWithSecret> {
  return unwrap(api.post<WebhookSubscriptionWithSecret>(`${WEBHOOKS_BASE}/subscriptions`, data, { headers: getWorkspaceHeader() }));
}

/**
 * Get all webhook subscriptions for the current workspace.
 */
export async function getWebhookSubscriptions(params?: {
  page?: number;
  page_size?: number;
  is_active?: boolean;
}): Promise<PaginatedResponse<WebhookSubscription>> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', params.page.toString());
  if (params?.page_size) searchParams.set('page_size', params.page_size.toString());
  if (params?.is_active !== undefined) searchParams.set('is_active', params.is_active.toString());

  const query = searchParams.toString();
  const url = `${WEBHOOKS_BASE}/subscriptions${query ? `?${query}` : ''}`;
  return unwrap(api.get<PaginatedResponse<WebhookSubscription>>(url, { headers: getWorkspaceHeader() }));
}

/**
 * Get a specific webhook subscription by ID.
 */
export async function getWebhookSubscription(subscriptionId: string): Promise<WebhookSubscription> {
  return unwrap(api.get<WebhookSubscription>(`${WEBHOOKS_BASE}/subscriptions/${subscriptionId}`, { headers: getWorkspaceHeader() }));
}

/**
 * Update a webhook subscription.
 */
export async function updateWebhookSubscription(
  subscriptionId: string,
  data: UpdateWebhookSubscription
): Promise<WebhookSubscription> {
  return unwrap(api.patch<WebhookSubscription>(`${WEBHOOKS_BASE}/subscriptions/${subscriptionId}`, data, { headers: getWorkspaceHeader() }));
}

/**
 * Delete a webhook subscription.
 */
export async function deleteWebhookSubscription(subscriptionId: string): Promise<void> {
  await unwrap(api.delete<void>(`${WEBHOOKS_BASE}/subscriptions/${subscriptionId}`, undefined, { headers: getWorkspaceHeader() }));
}

/**
 * Send a test webhook to verify the endpoint.
 */
export async function testWebhookSubscription(
  subscriptionId: string,
  eventType?: string
): Promise<{ delivery_id: string; success: boolean; message: string }> {
  return unwrap(api.post<{ delivery_id: string; success: boolean; message: string }>(
    `${WEBHOOKS_BASE}/subscriptions/${subscriptionId}/test`,
    { event_type: eventType },
    { headers: getWorkspaceHeader() }
  ));
}

/**
 * Rotate the secret key for a subscription.
 */
export async function rotateWebhookSecret(
  subscriptionId: string,
  options?: { grace_period_hours?: number }
): Promise<{ secret_key: string; secret_version: number; old_secret_expires_at?: string }> {
  return unwrap(api.post<{ secret_key: string; secret_version: number; old_secret_expires_at?: string }>(
    `${WEBHOOKS_BASE}/subscriptions/${subscriptionId}/rotate-secret`,
    options || {},
    { headers: getWorkspaceHeader() }
  ));
}

/**
 * Get delivery statistics for a subscription.
 */
export async function getWebhookSubscriptionStats(
  subscriptionId: string,
  params?: { days?: number }
): Promise<WebhookSubscriptionStats> {
  const searchParams = new URLSearchParams();
  if (params?.days) searchParams.set('days', params.days.toString());

  const query = searchParams.toString();
  const url = `${WEBHOOKS_BASE}/subscriptions/${subscriptionId}/stats${query ? `?${query}` : ''}`;
  return unwrap(api.get<WebhookSubscriptionStats>(url, { headers: getWorkspaceHeader() }));
}

// =============================================================================
// Event Management
// =============================================================================

/**
 * Get webhook events for the current workspace.
 */
export async function getWebhookEvents(params?: {
  page?: number;
  page_size?: number;
  filters?: WebhookEventFilters;
}): Promise<PaginatedResponse<WebhookEvent>> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', params.page.toString());
  if (params?.page_size) searchParams.set('page_size', params.page_size.toString());
  if (params?.filters?.event_type) searchParams.set('event_type', params.filters.event_type);
  if (params?.filters?.status) searchParams.set('status', params.filters.status);
  if (params?.filters?.start_date) searchParams.set('start_date', params.filters.start_date);
  if (params?.filters?.end_date) searchParams.set('end_date', params.filters.end_date);

  const query = searchParams.toString();
  const url = `${WEBHOOKS_BASE}/events${query ? `?${query}` : ''}`;
  return unwrap(api.get<PaginatedResponse<WebhookEvent>>(url, { headers: getWorkspaceHeader() }));
}

/**
 * Get a specific webhook event by ID.
 */
export async function getWebhookEvent(eventId: string): Promise<WebhookEvent> {
  return unwrap(api.get<WebhookEvent>(`${WEBHOOKS_BASE}/events/${eventId}`, { headers: getWorkspaceHeader() }));
}

/**
 * Get deliveries for a specific event.
 */
export async function getWebhookEventDeliveries(
  eventId: string,
  params?: { page?: number; page_size?: number }
): Promise<PaginatedResponse<WebhookDelivery>> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', params.page.toString());
  if (params?.page_size) searchParams.set('page_size', params.page_size.toString());

  const query = searchParams.toString();
  const url = `${WEBHOOKS_BASE}/events/${eventId}/deliveries${query ? `?${query}` : ''}`;
  return unwrap(api.get<PaginatedResponse<WebhookDelivery>>(url, { headers: getWorkspaceHeader() }));
}

// =============================================================================
// Delivery Management
// =============================================================================

/**
 * Manually retry a failed delivery.
 */
export async function retryWebhookDelivery(
  deliveryId: string
): Promise<{ delivery_id: string; status: string; message: string }> {
  return unwrap(api.post<{ delivery_id: string; status: string; message: string }>(
    `${WEBHOOKS_BASE}/deliveries/${deliveryId}/retry`,
    undefined,
    { headers: getWorkspaceHeader() }
  ));
}

// =============================================================================
// Event Types Catalog
// =============================================================================

/**
 * Get all available event types.
 */
export async function getWebhookEventTypes(params?: {
  category?: string;
}): Promise<WebhookEventType[]> {
  const searchParams = new URLSearchParams();
  if (params?.category) searchParams.set('category', params.category);

  const query = searchParams.toString();
  const url = `${WEBHOOKS_BASE}/event-types${query ? `?${query}` : ''}`;
  return unwrap(api.get<WebhookEventType[]>(url));
}

/**
 * Get details for a specific event type.
 */
export async function getWebhookEventType(eventType: string): Promise<WebhookEventType> {
  return unwrap(api.get<WebhookEventType>(`${WEBHOOKS_BASE}/event-types/${eventType}`));
}

// =============================================================================
// Admin Endpoints
// =============================================================================

/**
 * Get platform-wide webhook statistics (admin only).
 */
export async function getWebhookPlatformStats(): Promise<WebhookPlatformStats> {
  return unwrap(api.get<WebhookPlatformStats>(`${ADMIN_BASE}/stats`));
}

/**
 * Get dead letter queue items (admin only).
 */
export async function getDeadLetterQueue(params?: {
  page?: number;
  page_size?: number;
  workspace_id?: string;
}): Promise<PaginatedResponse<DeadLetterQueueItem>> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', params.page.toString());
  if (params?.page_size) searchParams.set('page_size', params.page_size.toString());
  if (params?.workspace_id) searchParams.set('workspace_id', params.workspace_id);

  const query = searchParams.toString();
  const url = `${ADMIN_BASE}/dead-letter-queue${query ? `?${query}` : ''}`;
  return unwrap(api.get<PaginatedResponse<DeadLetterQueueItem>>(url));
}

/**
 * Replay a dead letter queue item (admin only).
 */
export async function replayDeadLetterQueueItem(
  dlqId: string
): Promise<{ delivery_id: string; status: string; message: string }> {
  return unwrap(api.post<{ delivery_id: string; status: string; message: string }>(
    `${ADMIN_BASE}/dead-letter-queue/${dlqId}/replay`
  ));
}

// Export all functions as a service object
export const webhooksService = {
  // Subscriptions
  createSubscription: createWebhookSubscription,
  getSubscriptions: getWebhookSubscriptions,
  getSubscription: getWebhookSubscription,
  updateSubscription: updateWebhookSubscription,
  deleteSubscription: deleteWebhookSubscription,
  testSubscription: testWebhookSubscription,
  rotateSecret: rotateWebhookSecret,
  getSubscriptionStats: getWebhookSubscriptionStats,
  // Events
  getEvents: getWebhookEvents,
  getEvent: getWebhookEvent,
  getEventDeliveries: getWebhookEventDeliveries,
  // Deliveries
  retryDelivery: retryWebhookDelivery,
  // Event Types
  getEventTypes: getWebhookEventTypes,
  getEventType: getWebhookEventType,
  // Admin
  getPlatformStats: getWebhookPlatformStats,
  getDeadLetterQueue: getDeadLetterQueue,
  replayDLQItem: replayDeadLetterQueueItem,
};

export default webhooksService;
