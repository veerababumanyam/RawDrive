/**
 * Gallery Service
 * API client for gallery operations
 */

import apiClient from './api';
import type {
  GalleryListResponse,
  GalleryDetailData,
  GalleryCreateRequest,
  GalleryUpdateRequest,
  GalleryAssetsResponse,
  UploadSessionRequest,
  UploadSessionResponse,
  UploadCommitRequest,
  UploadCommitResponse,
  CheckDuplicateRequest,
  CheckDuplicateResponse,
  PublicGalleryAsset,
} from '../types/gallery';

export class GalleryService {
  /**
   * List galleries for a workspace
   */
  async listGalleries(
    workspaceId: string,
    options?: {
      page?: number;
      limit?: number;
      sort?: 'created_at' | 'title' | 'status' | 'shoot_date';
      status?: 'draft' | 'published' | 'archived';
      search?: string;
      startDate?: string; // YYYY-MM-DD
      endDate?: string;   // YYYY-MM-DD
    }
  ): Promise<GalleryListResponse> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.sort) params.append('sort', options.sort);
    if (options?.status) params.append('status', options.status);
    if (options?.search) params.append('search', options.search);
    if (options?.startDate) params.append('start_date', options.startDate);
    if (options?.endDate) params.append('end_date', options.endDate);

    const query = params.toString();
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries${query ? `?${query}` : ''}`;

    const response = await apiClient.get<GalleryListResponse>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch galleries');
    }
    return response.data!;
  }

  /**
   * Get gallery details
   */
  async getGallery(workspaceId: string, galleryId: string): Promise<GalleryDetailData> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}`;
    // Backend returns flat GalleryDetailResponse structure
    // API client wraps it: { data: GalleryDetailResponse }
    const response = await apiClient.get<GalleryDetailData>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch gallery');
    }
    return response.data!;
  }

  /**
   * Get public gallery details
   */
  async getPublicGallery(galleryId: string): Promise<GalleryDetailData> {
    const endpoint = `/api/v1/public/galleries/${galleryId}`;
    const response = await apiClient.get<GalleryDetailData>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch public gallery');
    }
    return response.data!;
  }

  /**
   * Create a new gallery
   */
  async createGallery(
    workspaceId: string,
    data: GalleryCreateRequest
  ): Promise<GalleryDetailData> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries`;
    const response = await apiClient.post<GalleryDetailData>(endpoint, data);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to create gallery');
    }
    return response.data!;
  }

  /**
   * Update gallery
   */
  async updateGallery(
    workspaceId: string,
    galleryId: string,
    data: GalleryUpdateRequest
  ): Promise<GalleryDetailData> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}`;
    const response = await apiClient.patch<GalleryDetailData>(endpoint, data);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to update gallery');
    }
    return response.data!;
  }

  /**
   * Delete gallery
   */
  async deleteGallery(workspaceId: string, galleryId: string): Promise<void> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}`;
    const response = await apiClient.delete<{ message: string }>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to delete gallery');
    }
  }

  /**
   * Publish gallery
   */
  async publishGallery(workspaceId: string, galleryId: string): Promise<GalleryDetailData> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/publish`;
    const response = await apiClient.post<GalleryDetailData>(endpoint, { publish: true });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to publish gallery');
    }
    return response.data!;
  }

  /**
   * Unpublish gallery
   */
  async unpublishGallery(workspaceId: string, galleryId: string): Promise<GalleryDetailData> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/publish`;
    const response = await apiClient.post<GalleryDetailData>(endpoint, { publish: false });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to unpublish gallery');
    }
    return response.data!;
  }

  /**
   * List gallery assets
   */
  async listGalleryAssets(
    workspaceId: string,
    galleryId: string,
    options?: {
      page?: number;
      limit?: number;
      sub_gallery_id?: string | null;
      picks_only?: boolean;
      favorites_only?: boolean;
      selections_only?: boolean;
      search_query?: string;
    }
  ): Promise<GalleryAssetsResponse> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.sub_gallery_id !== undefined) {
      params.append('sub_gallery_id', options.sub_gallery_id || '');
    }
    if (options?.picks_only) params.append('picks_only', 'true');
    if (options?.favorites_only) params.append('favorites_only', 'true');
    if (options?.selections_only) params.append('selections_only', 'true');
    if (options?.search_query) params.append('search_query', options.search_query);

    const query = params.toString();
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/assets${query ? `?${query}` : ''}`;

    const response = await apiClient.get<GalleryAssetsResponse>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch gallery assets');
    }
    return response.data!;
  }

  /**
   * Create upload session
   */
  async createUploadSession(
    workspaceId: string,
    data: UploadSessionRequest
  ): Promise<UploadSessionResponse> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/uploads`;
    const response = await apiClient.post<UploadSessionResponse>(endpoint, data);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to create upload session');
    }
    return response.data!;
  }

  /**
   * Upload file data to session
   */
  async uploadFileData(
    workspaceId: string,
    uploadId: string,
    file: File
  ): Promise<{ message: string; size: number; upload_id: string }> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/uploads/${uploadId}/upload`;

    // Create FormData for file upload
    const formData = new FormData();
    formData.append('file', file);

    // Override Content-Type for multipart/form-data
    const tokens = await import('./tokenStorage').then(m => m.getStoredTokens());
    const headers: Record<string, string> = {};
    if (tokens?.accessToken) {
      headers['Authorization'] = `Bearer ${tokens.accessToken}`;
    }

    const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}${endpoint}`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || 'Failed to upload file');
    }

    return await response.json();
  }

  /**
   * Commit upload
   */
  async commitUpload(
    workspaceId: string,
    uploadId: string,
    data: UploadCommitRequest
  ): Promise<UploadCommitResponse> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/uploads/${uploadId}/commit`;

    // Create FormData for file upload
    const formData = new FormData();
    // File is uploaded via PUT to /upload endpoint
    formData.append('sha256', data.sha256);
    if (data.etag) {
      formData.append('etag', data.etag);
    }

    // Override Content-Type for multipart/form-data
    const tokens = await import('./tokenStorage').then(m => m.getStoredTokens());
    const headers: Record<string, string> = {};
    if (tokens?.accessToken) {
      headers['Authorization'] = `Bearer ${tokens.accessToken}`;
    }

    const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}${endpoint}`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || 'Failed to commit upload');
    }

    return await response.json();
  }

  /**
   * Check for duplicate assets by SHA256 checksum
   */
  async checkDuplicate(
    workspaceId: string,
    sha256: string,
    galleryId?: string
  ): Promise<CheckDuplicateResponse> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/uploads/check-duplicate`;
    const request: CheckDuplicateRequest = {
      sha256,
      gallery_id: galleryId,
    };

    const response = await apiClient.post<CheckDuplicateResponse>(endpoint, request);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to check for duplicates');
    }
    return response.data!;
  }

  /**
   * Get signed URL for asset
   */
  async getSignedUrl(
    workspaceId: string,
    assetId: string,
    variant: 'thumbnail' | 'preview' | 'original' = 'thumbnail',
    download: boolean = false
  ): Promise<string> {
    const { signedUrlService } = await import('./signedUrlService');
    return signedUrlService.getSignedUrl(workspaceId, assetId, variant, download);
  }

  /**
   * Create sub-gallery
   */
  async createSubGallery(
    workspaceId: string,
    galleryId: string,
    data: { name: string; sort_order?: number }
  ): Promise<{ sub_gallery_id: string; name: string; sort_order: number; visible: boolean }> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/sub-galleries`;
    const response = await apiClient.post<{
      sub_gallery_id: string;
      name: string;
      sort_order: number;
      visible: boolean;
    }>(endpoint, data);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to create sub-gallery');
    }
    return response.data!;
  }

  /**
   * Update sub-gallery
   */
  async updateSubGallery(
    workspaceId: string,
    galleryId: string,
    subGalleryId: string,
    data: { name?: string; sort_order?: number; visible?: boolean; cover_asset_id?: string }
  ): Promise<void> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/sub-galleries/${subGalleryId}`;
    const response = await apiClient.patch<{ message: string }>(endpoint, data);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to update sub-gallery');
    }
  }

  /**
   * Delete sub-gallery
   */
  async deleteSubGallery(
    workspaceId: string,
    galleryId: string,
    subGalleryId: string
  ): Promise<void> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/sub-galleries/${subGalleryId}`;
    const response = await apiClient.delete<{ message: string }>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to delete sub-gallery');
    }
  }

  /**
   * Update gallery assets sort order
   */
  async updateSortOrder(
    workspaceId: string,
    galleryId: string,
    assetIds: string[]
  ): Promise<void> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/assets/sort-order`;
    const response = await apiClient.patch<{ message: string }>(endpoint, { asset_ids: assetIds });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to update sort order');
    }
  }

  /**
   * Get public gallery assets
   */
  async getPublicGalleryAssets(galleryId: string): Promise<PublicGalleryAsset[]> {
    const endpoint = `/api/v1/public/galleries/${galleryId}/assets`;
    const response = await apiClient.get<{ data: PublicGalleryAsset[] }>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch public gallery assets');
    }
    return response.data!.data;
  }

  /**
   * Reorder gallery assets (deprecated - use updateSortOrder)
   */
  async reorderAssets(
    workspaceId: string,
    galleryId: string,
    assetIds: string[]
  ): Promise<void> {
    return this.updateSortOrder(workspaceId, galleryId, assetIds);
  }

  /**
   * Move assets to sub-gallery
   */
  async moveAssets(
    workspaceId: string,
    galleryId: string,
    assetIds: string[],
    subGalleryId: string | null
  ): Promise<void> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/assets/move`;
    const response = await apiClient.patch<{ message: string }>(endpoint, {
      asset_ids: assetIds,
      sub_gallery_id: subGalleryId || null,
    });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to move assets');
    }
  }

  /**
   * Delete assets from gallery (soft delete)
   */
  async deleteAssets(
    workspaceId: string,
    galleryId: string,
    assetIds: string[]
  ): Promise<void> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/assets`;
    const response = await apiClient.delete<{ message: string }>(endpoint, {
      asset_ids: assetIds,
    });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to delete assets');
    }
  }

  /**
   * Restore deleted assets (set visible = TRUE)
   */
  async restoreAssets(
    workspaceId: string,
    galleryId: string,
    assetIds: string[]
  ): Promise<void> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/assets/restore`;
    const response = await apiClient.patch<{ message: string }>(endpoint, {
      asset_ids: assetIds,
    });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to restore assets');
    }
  }

  /**
   * Toggle favorite status for gallery assets
   */
  async toggleFavorite(
    workspaceId: string,
    galleryId: string,
    assetIds: string[],
    favorited: boolean
  ): Promise<void> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/assets/favorite`;
    const response = await apiClient.patch<{ message: string }>(endpoint, {
      asset_ids: assetIds,
      favorited,
    });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to toggle favorite');
    }
  }

  /**
   * Toggle selection (pick) status for gallery assets
   */
  async toggleSelection(
    workspaceId: string,
    galleryId: string,
    assetIds: string[],
    selected: boolean
  ): Promise<void> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/assets/selection`;
    const response = await apiClient.patch<{ message: string }>(endpoint, {
      asset_ids: assetIds,
      selected,
    });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to toggle selection');
    }
  }

  /**
   * Update sub-galleries sort order
   */
  async updateSubGalleriesSortOrder(
    workspaceId: string,
    galleryId: string,
    subGalleryIds: string[]
  ): Promise<void> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/sub-galleries/sort-order`;
    const response = await apiClient.patch<{ message: string }>(endpoint, {
      sub_gallery_ids: subGalleryIds,
    });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to update sub-galleries sort order');
    }
  }
}

// Export singleton instance
export const galleryService = new GalleryService();
export default galleryService;

