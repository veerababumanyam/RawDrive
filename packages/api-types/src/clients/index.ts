/**
 * Re-exports all generated API clients.
 *
 * @example
 * ```typescript
 * import { backend, galleryService, webhooksService } from '@rawdrive/api-types/clients';
 *
 * // Use backend client
 * const user = await backend.getCurrentUser();
 *
 * // Use gallery service client
 * const galleries = await galleryService.getGalleries({ workspaceId: 'xxx' });
 * ```
 */

// Re-export all client modules
export * as backend from './backend';
export * as galleryService from './gallery-service';
export * as webhooksService from './webhooks-service';

// Re-export individual types for convenience
export type {
  // Auth types
  LoginRequest,
  TokenResponse,
  RefreshRequest,
  // User types
  User,
  UserUpdateRequest,
  // Workspace types
  Workspace,
  WorkspaceMember,
  WorkspaceCreateRequest,
} from './backend';

export type {
  // Gallery types
  Gallery,
  GalleryStatus,
  DownloadPolicy,
  GalleryListResponse,
  GalleryCreateRequest,
  GalleryUpdateRequest,
  SubGallery,
  Asset,
  AssetListResponse,
  PaginationMeta,
} from './gallery-service';

export type {
  // Webhook types
  WebhookEventType,
  WebhookSubscription,
  WebhookSubscriptionCreateRequest,
  WebhookSubscriptionUpdateRequest,
  WebhookDelivery,
  WebhookDeliveryListResponse,
  WebhookStats,
} from './webhooks-service';
