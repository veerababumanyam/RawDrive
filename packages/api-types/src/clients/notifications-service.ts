/**
 * Notifications Service API Client
 *
 * Auto-generated TypeScript client for the Notifications Service API.
 *
 * NOTE: This file will be replaced when running `pnpm generate:api-clients`.
 * This is a placeholder showing the expected API structure.
 *
 * // TODO: Generate with orval when OpenAPI spec is available
 *
 * @example
 * ```typescript
 * import { getNotifications, markAsRead } from '@rawdrive/api-types/notifications-service';
 *
 * const notifications = await getNotifications({ workspaceId: 'xxx' });
 * await markAsRead(notificationId);
 * ```
 */

import { customInstance } from '../lib/axios-instance';

// ============================================================================
// Notification Types
// ============================================================================

export interface Notification {
  id: string;
  workspace_id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  is_read: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export type NotificationType =
  | 'gallery_shared'
  | 'gallery_published'
  | 'upload_complete'
  | 'invitation_received'
  | 'payment_received'
  | 'system';

export interface NotificationListResponse {
  data: Notification[];
  total: number;
  unread_count: number;
  page: number;
  limit: number;
}

export interface NotificationPreferences {
  email_enabled: boolean;
  push_enabled: boolean;
  in_app_enabled: boolean;
  digest_frequency: 'immediate' | 'hourly' | 'daily' | 'weekly';
}

// ============================================================================
// API Functions (stubs)
// ============================================================================

export const getNotifications = (params: { workspace_id: string; page?: number; limit?: number; unread_only?: boolean }) =>
  customInstance<NotificationListResponse>({ url: `/api/v1/notifications`, method: 'get', params });

export const markAsRead = (notificationId: string) =>
  customInstance<void>({ url: `/api/v1/notifications/${notificationId}/read`, method: 'post' });

export const markAllAsRead = (workspaceId: string) =>
  customInstance<void>({ url: `/api/v1/notifications/read-all`, method: 'post', data: { workspace_id: workspaceId } });

export const getPreferences = () =>
  customInstance<NotificationPreferences>({ url: `/api/v1/notifications/preferences`, method: 'get' });

export const updatePreferences = (data: Partial<NotificationPreferences>) =>
  customInstance<NotificationPreferences>({ url: `/api/v1/notifications/preferences`, method: 'put', data });
