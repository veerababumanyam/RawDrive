/**
 * Gallery Service API Client
 *
 * Auto-generated TypeScript client for the Gallery Service API.
 *
 * NOTE: This file will be replaced when running `pnpm generate:api-clients`.
 * This is a placeholder showing the expected API structure.
 *
 * @example
 * ```typescript
 * import { getGalleries, getGallery, createGallery } from '@rawdrive/api-types/gallery-service';
 *
 * // List galleries
 * const galleries = await getGalleries({
 *   workspaceId: 'xxx',
 *   page: 1,
 *   limit: 20,
 * });
 *
 * // Get single gallery
 * const gallery = await getGallery({
 *   workspaceId: 'xxx',
 *   galleryId: 'yyy',
 * });
 * ```
 */

import { customInstance } from '../lib/axios-instance';

// ============================================================================
// Types (will be generated from OpenAPI spec)
// ============================================================================

export type GalleryStatus = 'draft' | 'published' | 'archived';
export type DownloadPolicy = 'view_only' | 'web_only' | 'watermarked_only' | 'original_allowed';

export interface Gallery {
  id: string;
  workspace_id: string;
  title: string;
  description?: string | null;
  status: GalleryStatus;
  shoot_date?: string | null;
  cover_asset_id?: string | null;
  download_policy?: DownloadPolicy;
  password_protected?: boolean;
  pin_protected?: boolean;
  created_at: string;
  updated_at: string;
  asset_count?: number;
  pinned?: boolean;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface GalleryListResponse {
  data: Gallery[];
  meta: PaginationMeta;
}

export interface GalleryCreateRequest {
  title: string;
  description?: string;
  shoot_date?: string;
  download_policy?: DownloadPolicy;
  password?: string;
  pin?: string;
}

export interface GalleryUpdateRequest {
  title?: string;
  description?: string;
  shoot_date?: string;
  download_policy?: DownloadPolicy;
  password?: string;
  pin?: string;
}

export interface SubGallery {
  id: string;
  gallery_id: string;
  name: string;
  sort_order: number;
  visible: boolean;
  cover_asset_id?: string | null;
  asset_count?: number;
}

export interface Asset {
  id: string;
  workspace_id: string;
  gallery_id?: string | null;
  sub_gallery_id?: string | null;
  filename: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  width?: number | null;
  height?: number | null;
  sha256: string;
  storage_key: string;
  thumbnail_url?: string;
  preview_url?: string;
  is_favorited?: boolean;
  is_selected?: boolean;
  sort_order?: number;
  created_at: string;
  updated_at: string;
}

export interface AssetListResponse {
  data: Asset[];
  meta: PaginationMeta;
}

// ============================================================================
// API Functions (will be generated from OpenAPI spec)
// ============================================================================

/**
 * List galleries for a workspace.
 *
 * @param params - Query parameters
 * @returns Paginated list of galleries
 */
export async function getGalleries(params: {
  workspaceId: string;
  page?: number;
  limit?: number;
  status?: GalleryStatus;
  search?: string;
  sort?: 'created_at' | 'title' | 'status' | 'shoot_date';
  signal?: AbortSignal;
}): Promise<GalleryListResponse> {
  const queryParams = new URLSearchParams();
  if (params.page) queryParams.append('page', params.page.toString());
  if (params.limit) queryParams.append('limit', params.limit.toString());
  if (params.status) queryParams.append('status', params.status);
  if (params.search) queryParams.append('search', params.search);
  if (params.sort) queryParams.append('sort', params.sort);

  const query = queryParams.toString();

  return customInstance<GalleryListResponse>({
    url: `/api/v1/galleries${query ? `?${query}` : ''}`,
    method: 'GET',
    headers: { 'X-Workspace-ID': params.workspaceId },
  }, { signal: params.signal });
}

/**
 * Get a single gallery by ID.
 *
 * @param params - Path and query parameters
 * @returns Gallery details
 */
export async function getGallery(params: {
  workspaceId: string;
  galleryId: string;
  signal?: AbortSignal;
}): Promise<Gallery> {
  return customInstance<Gallery>({
    url: `/api/v1/galleries/${params.galleryId}`,
    method: 'GET',
    headers: { 'X-Workspace-ID': params.workspaceId },
  }, { signal: params.signal });
}

/**
 * Create a new gallery.
 *
 * @param params - Request parameters
 * @returns Created gallery
 */
export async function createGallery(params: {
  workspaceId: string;
  data: GalleryCreateRequest;
}): Promise<Gallery> {
  return customInstance<Gallery>({
    url: '/api/v1/galleries',
    method: 'POST',
    headers: { 'X-Workspace-ID': params.workspaceId },
    data: params.data,
  });
}

/**
 * Update a gallery.
 *
 * @param params - Request parameters
 * @returns Updated gallery
 */
export async function updateGallery(params: {
  workspaceId: string;
  galleryId: string;
  data: GalleryUpdateRequest;
}): Promise<Gallery> {
  return customInstance<Gallery>({
    url: `/api/v1/galleries/${params.galleryId}`,
    method: 'PATCH',
    headers: { 'X-Workspace-ID': params.workspaceId },
    data: params.data,
  });
}

/**
 * Delete a gallery.
 *
 * @param params - Request parameters
 */
export async function deleteGallery(params: {
  workspaceId: string;
  galleryId: string;
}): Promise<void> {
  return customInstance<void>({
    url: `/api/v1/galleries/${params.galleryId}`,
    method: 'DELETE',
    headers: { 'X-Workspace-ID': params.workspaceId },
  });
}

/**
 * Publish a gallery.
 *
 * @param params - Request parameters
 * @returns Updated gallery
 */
export async function publishGallery(params: {
  workspaceId: string;
  galleryId: string;
}): Promise<Gallery> {
  return customInstance<Gallery>({
    url: `/api/v1/galleries/${params.galleryId}/publish`,
    method: 'POST',
    headers: { 'X-Workspace-ID': params.workspaceId },
    data: { publish: true },
  });
}

/**
 * Unpublish a gallery.
 *
 * @param params - Request parameters
 * @returns Updated gallery
 */
export async function unpublishGallery(params: {
  workspaceId: string;
  galleryId: string;
}): Promise<Gallery> {
  return customInstance<Gallery>({
    url: `/api/v1/galleries/${params.galleryId}/publish`,
    method: 'POST',
    headers: { 'X-Workspace-ID': params.workspaceId },
    data: { publish: false },
  });
}

/**
 * List assets in a gallery.
 *
 * @param params - Query parameters
 * @returns Paginated list of assets
 */
export async function getGalleryAssets(params: {
  workspaceId: string;
  galleryId: string;
  page?: number;
  limit?: number;
  subGalleryId?: string | null;
  picksOnly?: boolean;
  favoritesOnly?: boolean;
  signal?: AbortSignal;
}): Promise<AssetListResponse> {
  const queryParams = new URLSearchParams();
  if (params.page) queryParams.append('page', params.page.toString());
  if (params.limit) queryParams.append('limit', params.limit.toString());
  if (params.subGalleryId !== undefined) {
    queryParams.append('sub_gallery_id', params.subGalleryId || '');
  }
  if (params.picksOnly) queryParams.append('picks_only', 'true');
  if (params.favoritesOnly) queryParams.append('favorites_only', 'true');

  const query = queryParams.toString();

  return customInstance<AssetListResponse>({
    url: `/api/v1/galleries/${params.galleryId}/assets${query ? `?${query}` : ''}`,
    method: 'GET',
    headers: { 'X-Workspace-ID': params.workspaceId },
  }, { signal: params.signal });
}

/**
 * Get sub-galleries for a gallery.
 *
 * @param params - Request parameters
 * @returns List of sub-galleries
 */
export async function getSubGalleries(params: {
  workspaceId: string;
  galleryId: string;
}): Promise<SubGallery[]> {
  return customInstance<SubGallery[]>({
    url: `/api/v1/galleries/${params.galleryId}/sub-galleries`,
    method: 'GET',
    headers: { 'X-Workspace-ID': params.workspaceId },
  });
}

/**
 * Create a sub-gallery.
 *
 * @param params - Request parameters
 * @returns Created sub-gallery
 */
export async function createSubGallery(params: {
  workspaceId: string;
  galleryId: string;
  data: { name: string; sort_order?: number };
}): Promise<SubGallery> {
  return customInstance<SubGallery>({
    url: `/api/v1/galleries/${params.galleryId}/sub-galleries`,
    method: 'POST',
    headers: { 'X-Workspace-ID': params.workspaceId },
    data: params.data,
  });
}

// ============================================================================
// Public Gallery Functions
// ============================================================================

/**
 * Get public gallery details (no auth required).
 *
 * @param galleryId - Gallery ID
 * @returns Gallery details
 */
export async function getPublicGallery(galleryId: string): Promise<Gallery> {
  return customInstance<Gallery>({
    url: `/api/v1/public/galleries/${galleryId}`,
    method: 'GET',
  });
}

/**
 * Verify gallery PIN.
 *
 * @param galleryId - Gallery ID
 * @param pin - PIN to verify
 * @returns Whether PIN is valid
 */
export async function verifyGalleryPin(
  galleryId: string,
  pin: string
): Promise<{ valid: boolean }> {
  return customInstance<{ valid: boolean }>({
    url: `/api/v1/public/galleries/${galleryId}/verify-pin`,
    method: 'POST',
    data: { pin },
  });
}

/**
 * Verify gallery password.
 *
 * @param galleryId - Gallery ID
 * @param password - Password to verify
 * @returns Whether password is valid
 */
export async function verifyGalleryPassword(
  galleryId: string,
  password: string
): Promise<{ valid: boolean }> {
  return customInstance<{ valid: boolean }>({
    url: `/api/v1/public/galleries/${galleryId}/verify-password`,
    method: 'POST',
    data: { password },
  });
}

/**
 * Register a visitor for a public gallery.
 *
 * @param galleryId - Gallery ID
 * @param data - Visitor registration data
 * @returns Visitor details
 */
export async function registerVisitor(
  galleryId: string,
  data: {
    email: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
  }
): Promise<{ visitor_id: string; email: string }> {
  return customInstance<{ visitor_id: string; email: string }>({
    url: `/api/v1/public/galleries/${galleryId}/register`,
    method: 'POST',
    data,
  });
}
