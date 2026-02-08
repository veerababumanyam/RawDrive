/**
 * Gallery service for mobile app
 * Handles gallery CRUD operations and asset management
 */

import { apiClient } from './api';
import type { Gallery, Asset, ApiResponse } from '../types';

// Response types
interface GalleryListResponse {
  galleries: Gallery[];
  total: number;
  page: number;
  pageSize: number;
}

interface GalleryResponse {
  gallery: Gallery;
}

interface AssetListResponse {
  assets: Asset[];
  total: number;
  page: number;
  pageSize: number;
}

interface AssetResponse {
  asset: Asset;
}

// Request types
interface CreateGalleryRequest {
  name: string;
  description?: string;
  clientName?: string;
  eventDate?: string;
}

interface UpdateGalleryRequest {
  name?: string;
  description?: string;
  status?: 'draft' | 'published' | 'archived';
  clientName?: string;
  eventDate?: string;
}

interface ListGalleriesParams {
  page?: number;
  pageSize?: number;
  status?: 'draft' | 'published' | 'archived' | 'all';
  search?: string;
  sortBy?: 'created_at' | 'updated_at' | 'name' | 'view_count';
  sortOrder?: 'asc' | 'desc';
}

interface ListAssetsParams {
  page?: number;
  pageSize?: number;
  starred?: boolean;
  rejected?: boolean;
}

/**
 * List galleries with pagination and filters
 */
export async function listGalleries(
  params: ListGalleriesParams = {}
): Promise<ApiResponse<GalleryListResponse>> {
  const queryParams = new URLSearchParams();

  if (params.page) queryParams.set('page', params.page.toString());
  if (params.pageSize) queryParams.set('page_size', params.pageSize.toString());
  if (params.status && params.status !== 'all') queryParams.set('status', params.status);
  if (params.search) queryParams.set('search', params.search);
  if (params.sortBy) queryParams.set('sort_by', params.sortBy);
  if (params.sortOrder) queryParams.set('sort_order', params.sortOrder);

  const queryString = queryParams.toString();
  const endpoint = `/galleries${queryString ? `?${queryString}` : ''}`;

  return apiClient.get<GalleryListResponse>(endpoint);
}

/**
 * Get a single gallery by ID
 */
export async function getGallery(galleryId: string): Promise<ApiResponse<GalleryResponse>> {
  return apiClient.get<GalleryResponse>(`/galleries/${galleryId}`);
}

/**
 * Create a new gallery
 */
export async function createGallery(
  data: CreateGalleryRequest
): Promise<ApiResponse<GalleryResponse>> {
  return apiClient.post<GalleryResponse>('/galleries', {
    name: data.name,
    description: data.description,
    client_name: data.clientName,
    event_date: data.eventDate,
  });
}

/**
 * Update a gallery
 */
export async function updateGallery(
  galleryId: string,
  data: UpdateGalleryRequest
): Promise<ApiResponse<GalleryResponse>> {
  return apiClient.patch<GalleryResponse>(`/galleries/${galleryId}`, {
    name: data.name,
    description: data.description,
    status: data.status,
    client_name: data.clientName,
    event_date: data.eventDate,
  });
}

/**
 * Delete a gallery
 */
export async function deleteGallery(galleryId: string): Promise<ApiResponse<void>> {
  return apiClient.delete<void>(`/galleries/${galleryId}`);
}

/**
 * Publish a gallery
 */
export async function publishGallery(galleryId: string): Promise<ApiResponse<GalleryResponse>> {
  return updateGallery(galleryId, { status: 'published' });
}

/**
 * Archive a gallery
 */
export async function archiveGallery(galleryId: string): Promise<ApiResponse<GalleryResponse>> {
  return updateGallery(galleryId, { status: 'archived' });
}

/**
 * List assets in a gallery
 */
export async function listAssets(
  galleryId: string,
  params: ListAssetsParams = {}
): Promise<ApiResponse<AssetListResponse>> {
  const queryParams = new URLSearchParams();

  if (params.page) queryParams.set('page', params.page.toString());
  if (params.pageSize) queryParams.set('page_size', params.pageSize.toString());
  if (params.starred !== undefined) queryParams.set('starred', params.starred.toString());
  if (params.rejected !== undefined) queryParams.set('rejected', params.rejected.toString());

  const queryString = queryParams.toString();
  const endpoint = `/galleries/${galleryId}/assets${queryString ? `?${queryString}` : ''}`;

  return apiClient.get<AssetListResponse>(endpoint);
}

/**
 * Star an asset
 */
export async function starAsset(
  galleryId: string,
  assetId: string
): Promise<ApiResponse<AssetResponse>> {
  return apiClient.post<AssetResponse>(`/galleries/${galleryId}/assets/${assetId}/star`);
}

/**
 * Unstar an asset
 */
export async function unstarAsset(
  galleryId: string,
  assetId: string
): Promise<ApiResponse<AssetResponse>> {
  return apiClient.delete<AssetResponse>(`/galleries/${galleryId}/assets/${assetId}/star`);
}

/**
 * Reject an asset
 */
export async function rejectAsset(
  galleryId: string,
  assetId: string
): Promise<ApiResponse<AssetResponse>> {
  return apiClient.post<AssetResponse>(`/galleries/${galleryId}/assets/${assetId}/reject`);
}

/**
 * Unreject an asset
 */
export async function unrejectAsset(
  galleryId: string,
  assetId: string
): Promise<ApiResponse<AssetResponse>> {
  return apiClient.delete<AssetResponse>(`/galleries/${galleryId}/assets/${assetId}/reject`);
}

/**
 * Generate a share link for a gallery
 */
export async function generateShareLink(
  galleryId: string,
  options?: {
    expiresAt?: string;
    password?: string;
    allowDownload?: boolean;
  }
): Promise<ApiResponse<{ shareUrl: string; shareCode: string }>> {
  return apiClient.post<{ shareUrl: string; shareCode: string }>(
    `/galleries/${galleryId}/share-link`,
    {
      expires_at: options?.expiresAt,
      password: options?.password,
      allow_download: options?.allowDownload,
    }
  );
}

/**
 * Get gallery statistics
 */
export async function getGalleryStats(
  galleryId: string
): Promise<ApiResponse<{
  viewCount: number;
  downloadCount: number;
  favoriteCount: number;
  assetCount: number;
}>> {
  return apiClient.get<{
    viewCount: number;
    downloadCount: number;
    favoriteCount: number;
    assetCount: number;
  }>(`/galleries/${galleryId}/stats`);
}
