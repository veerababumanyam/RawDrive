/**
 * Gallery Service
 * API client for gallery operations
 */

import apiClient, { getApiBaseUrl } from './api';
import type {
  GalleryListResponse,
  GalleryDetailData,
  GalleryCreateRequest,
  GalleryUpdateRequest,
  GalleryAssetsResponse,
  GalleryCredentialsResponse,
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
      sort?: 'created_at' | 'title' | 'status' | 'shoot_date' | 'last_accessed_at';
      status?: 'draft' | 'published' | 'archived';
      search?: string;
      startDate?: string; // YYYY-MM-DD
      endDate?: string;   // YYYY-MM-DD
      pinnedOnly?: boolean;
      recentOnly?: boolean;
      signal?: AbortSignal;
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
    if (options?.pinnedOnly) params.append('pinned_only', 'true');
    if (options?.recentOnly) params.append('recent_only', 'true');

    const query = params.toString();
    const endpoint = `/api/v1/galleries${query ? `?${query}` : ''}`;

    const response = await apiClient.get<GalleryListResponse>(endpoint, {
      headers: { 'X-Workspace-ID': workspaceId },
      signal: options?.signal
    } as any);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch galleries');
    }
    const raw = response.data;
    if (!raw || typeof raw !== 'object') {
      return { data: [], meta: { page: 1, limit: options?.limit ?? 20, total: 0, totalPages: 0 } };
    }
    return {
      data: Array.isArray(raw.data) ? raw.data : [],
      meta: raw.meta && typeof raw.meta === 'object'
        ? {
            page: Number(raw.meta.page) || 1,
            limit: Number(raw.meta.limit) || 20,
            total: Number(raw.meta.total) || 0,
            totalPages: Number((raw.meta as { totalPages?: number }).totalPages) ?? (Math.ceil((Number(raw.meta.total) || 0) / (Number(raw.meta.limit) || 20)) || 1),
          }
        : { page: 1, limit: options?.limit ?? 20, total: 0, totalPages: 0 },
    };
  }

  /**
   * Get gallery details
   */
  async getGallery(workspaceId: string, galleryId: string, signal?: AbortSignal): Promise<GalleryDetailData> {
    const endpoint = `/api/v1/galleries/${galleryId}`;
    // Backend returns flat GalleryDetailResponse structure
    // API client wraps it: { data: GalleryDetailResponse }
    const response = await apiClient.get<GalleryDetailData>(endpoint, {
      headers: { 'X-Workspace-ID': workspaceId },
      signal
    } as any);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch gallery');
    }
    return response.data!;
  }

  /**
   * Get public gallery details
   */
  async getPublicGallery(galleryId: string, signal?: AbortSignal): Promise<GalleryDetailData> {
    const endpoint = `/api/v1/public/galleries/${galleryId}`;
    const response = await apiClient.get<GalleryDetailData>(endpoint, { headers: undefined, signal } as any);
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
    const endpoint = `/api/v1/galleries`;
    const response = await apiClient.post<GalleryDetailData>(endpoint, data, {
      headers: { 'X-Workspace-ID': workspaceId }
    });
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
    const endpoint = `/api/v1/galleries/${galleryId}`;
    const response = await apiClient.patch<GalleryDetailData>(endpoint, data, {
      headers: { 'X-Workspace-ID': workspaceId }
    });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to update gallery');
    }
    return response.data!;
  }

  /**
   * Delete gallery
   */
  async deleteGallery(workspaceId: string, galleryId: string): Promise<void> {
    const endpoint = `/api/v1/galleries/${galleryId}`;
    const response = await apiClient.delete<{ message: string }>(endpoint, undefined, {
      headers: { 'X-Workspace-ID': workspaceId }
    });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to delete gallery');
    }
  }

  /**
   * Publish gallery
   */
  async publishGallery(workspaceId: string, galleryId: string): Promise<GalleryDetailData> {
    const endpoint = `/api/v1/galleries/${galleryId}/publish`;
    const response = await apiClient.post<GalleryDetailData>(endpoint, { publish: true }, {
      headers: { 'X-Workspace-ID': workspaceId }
    });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to publish gallery');
    }
    return response.data!;
  }

  /**
   * Unpublish gallery
   */
  async unpublishGallery(workspaceId: string, galleryId: string): Promise<GalleryDetailData> {
    const endpoint = `/api/v1/galleries/${galleryId}/publish`;
    const response = await apiClient.post<GalleryDetailData>(endpoint, { publish: false }, {
      headers: { 'X-Workspace-ID': workspaceId }
    });
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
      sort_by?: string;
      asset_ids?: string[];
      // Emotion filtering (Phase 3: Frontend Integration)
      emotion?: string | null;
      min_emotion_confidence?: number;
      // Face group/person filtering
      face_group_ids?: string[];
      signal?: AbortSignal;
    }
  ): Promise<GalleryAssetsResponse> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.sub_gallery_id !== undefined) {
      params.append('sub_gallery_id', options.sub_gallery_id || '');
    }
    // Emotion filtering parameters
    if (options?.emotion) {
      params.append('emotion', options.emotion);
    }
    if (options?.min_emotion_confidence !== undefined) {
      params.append('min_emotion_confidence', options.min_emotion_confidence.toString());
    }
    if (options?.picks_only) params.append('picks_only', 'true');
    if (options?.favorites_only) params.append('favorites_only', 'true');
    if (options?.selections_only) params.append('selections_only', 'true');
    if (options?.search_query) params.append('search_query', options.search_query);
    if (options?.sort_by) params.append('sort_by', options.sort_by);
    if (options?.asset_ids?.length) {
      options.asset_ids.forEach(id => params.append('asset_ids', id));
    }
    if (options?.face_group_ids?.length) {
      options.face_group_ids.forEach(id => params.append('face_group_ids', id));
    }

    const query = params.toString();
    const endpoint = `/api/v1/galleries/${galleryId}/assets${query ? `?${query}` : ''}`;

    const response = await apiClient.get<GalleryAssetsResponse>(endpoint, {
      headers: { 'X-Workspace-ID': workspaceId },
      signal: options?.signal
    } as any);
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
    // Note: Upload service might still use workspace prefix if not modernized yet?
    // User asked to modernize gallery service. Upload service uses /api/v1/workspaces/{id}/uploads per backend routing (step 414).
    // I will checking upload service modernization status later, for now keep it as is unless instructed.
    // Wait, the User said "yes, completly modernise". This context was about Gallery Service.
    // I should stick to gallery service methods. 
    // createUploadSession uses `/api/v1/workspaces/${workspaceId}/uploads`. 
    // This is routed to `upload-service` or `backend` (uploads_router).
    // I will NOT touch this if it's not part of gallery-service routes.
    // In `traefik`, `upload-service-router-local` is `/api/v1/uploads` (chunked) and `upload-router-local` is `/api/v1/photos/upload`.
    // The `uploads_router` in `backend` is mounted at `/api/v1/workspaces/{workspace_id}/uploads`.
    // So `createUploadSession` calls backend/upload service. I should leave it alone to avoid breaking uploads.
    // I will return the original content for this block or simply not replace it.
    // Actually, I'll abort this chunk and only replace the ones clearly gallery-service related.
    // I will replace unpublishGallery and listGalleryAssets.
    // I will skip createUploadSession for now.
    // Wait, I can't conditionally skip inside a chunk.
    // I will just use the code as is for createUploadSession in the replacement to be safe.

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

    // Use centralized API base URL logic
    const apiBaseUrl = getApiBaseUrl();

    const response = await fetch(`${apiBaseUrl}${endpoint}`, {
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
    if (data.client_metadata) {
      formData.append('client_metadata', JSON.stringify(data.client_metadata));
    }

    // Override Content-Type for multipart/form-data
    const tokens = await import('./tokenStorage').then(m => m.getStoredTokens());
    const headers: Record<string, string> = {};
    if (tokens?.accessToken) {
      headers['Authorization'] = `Bearer ${tokens.accessToken}`;
    }

    // Use VITE_API_URL if set (even if empty string for relative URLs), otherwise default to localhost for dev
    const commitApiBaseUrl = import.meta.env.VITE_API_URL !== undefined
      ? import.meta.env.VITE_API_URL
      : 'http://localhost:8000';

    const response = await fetch(`${commitApiBaseUrl}${endpoint}`, {
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
    const endpoint = `/api/v1/galleries/${galleryId}/sub-galleries`;
    const response = await apiClient.post<{
      sub_gallery_id: string;
      name: string;
      sort_order: number;
      visible: boolean;
    }>(endpoint, data, {
      headers: { 'X-Workspace-ID': workspaceId }
    });
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
    const endpoint = `/api/v1/galleries/${galleryId}/sub-galleries/${subGalleryId}`;
    const response = await apiClient.patch<{ message: string }>(endpoint, data, {
      headers: { 'X-Workspace-ID': workspaceId }
    });
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
    const endpoint = `/api/v1/galleries/${galleryId}/sub-galleries/${subGalleryId}`;
    const response = await apiClient.delete<{ message: string }>(endpoint, undefined, {
      headers: { 'X-Workspace-ID': workspaceId }
    });
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
    const endpoint = `/api/v1/galleries/${galleryId}/assets/sort-order`;
    const response = await apiClient.patch<{ message: string }>(endpoint, { asset_ids: assetIds }, {
      headers: { 'X-Workspace-ID': workspaceId }
    });
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
    const endpoint = `/api/v1/galleries/${galleryId}/assets/move`;
    const response = await apiClient.patch<{ message: string }>(endpoint, {
      asset_ids: assetIds,
      sub_gallery_id: subGalleryId || null,
    }, {
      headers: { 'X-Workspace-ID': workspaceId }
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
    const endpoint = `/api/v1/galleries/${galleryId}/assets`;
    const response = await apiClient.delete<{ message: string }>(endpoint, {
      asset_ids: assetIds,
    }, {
      headers: { 'X-Workspace-ID': workspaceId }
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
    const endpoint = `/api/v1/galleries/${galleryId}/assets/restore`;
    const response = await apiClient.patch<{ message: string }>(endpoint, {
      asset_ids: assetIds,
    }, {
      headers: { 'X-Workspace-ID': workspaceId }
    });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to restore assets');
    }
  }

  /**
   * Update generic asset details (title, description, etc)
   */
  async updateAsset(
    workspaceId: string,
    galleryId: string,
    assetId: string,
    data: {
      title?: string;
      description?: string;
      tags?: string[];
      is_private?: boolean;
    }
  ): Promise<void> {
    const endpoint = `/api/v1/galleries/${galleryId}/assets/${assetId}`;
    const response = await apiClient.patch<{ message: string }>(endpoint, data, {
      headers: { 'X-Workspace-ID': workspaceId }
    });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to update asset');
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
    const endpoint = `/api/v1/galleries/${galleryId}/assets/favorite`;
    const response = await apiClient.patch<{ message: string }>(endpoint, {
      asset_ids: assetIds,
      favorited,
    }, {
      headers: { 'X-Workspace-ID': workspaceId }
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
    const endpoint = `/api/v1/galleries/${galleryId}/assets/selection`;
    const response = await apiClient.patch<{ message: string }>(endpoint, {
      asset_ids: assetIds,
      selected,
    }, {
      headers: { 'X-Workspace-ID': workspaceId }
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
    const endpoint = `/api/v1/galleries/${galleryId}/sub-galleries/sort-order`;
    const response = await apiClient.patch<{ message: string }>(endpoint, {
      sub_gallery_ids: subGalleryIds,
    }, {
      headers: { 'X-Workspace-ID': workspaceId }
    });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to update sub-galleries sort order');
    }
  }
  /**
   * Register visitor with optional UTM tracking parameters
   */
  async registerVisitor(
    galleryId: string,
    data: {
      email: string;
      first_name?: string;
      last_name?: string;
      phone?: string;
      address?: string;
      metadata?: Record<string, any>;
      // UTM tracking parameters for marketing attribution
      utm_source?: string;
      utm_medium?: string;
      utm_campaign?: string;
      utm_content?: string;
      utm_term?: string;
      referrer?: string;
    }
  ): Promise<{ visitor_id: string; email: string }> {
    const endpoint = `/api/v1/public/galleries/${galleryId}/register`;
    const response = await apiClient.post<{ visitor_id: string; email: string }>(endpoint, data);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to register visitor');
    }
    return response.data!;
  }

  /**
   * Verify gallery PIN
   */
  async verifyPin(galleryId: string, pin: string): Promise<boolean> {
    const endpoint = `/api/v1/public/galleries/${galleryId}/verify-pin`;
    const response = await apiClient.post<{ valid: boolean }>(endpoint, { pin });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to verify PIN');
    }
    return response.data!.valid;
  }

  /**
   * Verify gallery Password
   */
  async verifyPassword(galleryId: string, password: string): Promise<boolean> {
    const endpoint = `/api/v1/public/galleries/${galleryId}/verify-password`;
    const response = await apiClient.post<{ valid: boolean }>(endpoint, { password });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to verify password');
    }
    return response.data!.valid;
  }

  /**
   * Request gallery password reset (US9)
   */
  async requestPasswordReset(galleryId: string, email: string): Promise<{ message: string }> {
    const endpoint = `/api/v1/public/galleries/${galleryId}/password/forgot`;
    const response = await apiClient.post<{ message: string }>(endpoint, { email });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to request password reset');
    }
    return response.data!;
  }

  /**
   * Reset gallery password with token (US9)
   */
  async resetPassword(galleryId: string, token: string, newPassword: string): Promise<{ message: string }> {
    const endpoint = `/api/v1/public/galleries/${galleryId}/password/reset`;
    const response = await apiClient.post<{ message: string }>(endpoint, {
      token,
      new_password: newPassword,
    });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to reset password');
    }
    return response.data!;
  }

  async addAssetsToGallery(
    workspaceId: string,
    galleryId: string,
    assetIds: string[]
  ): Promise<{ count: number }> {
    const response = await apiClient.post<{ success: boolean; count: number }>(
      `/api/v1/galleries/${galleryId}/assets`,
      { asset_ids: assetIds },
      { headers: { 'X-Workspace-ID': workspaceId } }
    );
    return response.data!;
  }

  async removeAssetsFromGallery(
    workspaceId: string,
    galleryId: string,
    assetIds: string[]
  ): Promise<{ count: number }> {
    const response = await apiClient.delete<{ success: boolean; count: number }>(
      `/api/v1/galleries/${galleryId}/assets`,
      { asset_ids: assetIds },
      { headers: { 'X-Workspace-ID': workspaceId } }
    );
    return response.data!;
  }

  async pinGallery(workspaceId: string, galleryId: string): Promise<void> {
    const endpoint = `/api/v1/galleries/${galleryId}/pin`;
    const response = await apiClient.post<{ success: boolean }>(endpoint, {}, {
      headers: { 'X-Workspace-ID': workspaceId }
    });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to pin gallery');
    }
  }

  async unpinGallery(workspaceId: string, galleryId: string): Promise<void> {
    const endpoint = `/api/v1/galleries/${galleryId}/unpin`;
    const response = await apiClient.post<{ success: boolean }>(endpoint, {}, {
      headers: { 'X-Workspace-ID': workspaceId }
    });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to unpin gallery');
    }
  }

  // ---------------------------------------------------------------------------
  // Public Gallery Client Interaction Methods
  // ---------------------------------------------------------------------------

  /**
   * Toggle favorite status for an asset in a public gallery
   */
  async togglePublicFavorite(
    galleryId: string,
    assetId: string,
    favorited: boolean,
    visitorId?: string
  ): Promise<{ asset_id: string; is_favorited: boolean; favorites_count: number }> {
    const endpoint = `/api/v1/public/galleries/${galleryId}/assets/${assetId}/favorite`;
    const response = await apiClient.post<{
      asset_id: string;
      is_favorited: boolean;
      favorites_count: number;
    }>(endpoint, { favorited, visitor_id: visitorId });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to update favorite');
    }
    return response.data!;
  }

  /**
   * Toggle selection (pick) status for an asset in a public gallery
   */
  async togglePublicSelection(
    galleryId: string,
    assetId: string,
    selected: boolean,
    visitorId?: string
  ): Promise<{ asset_id: string; is_selected: boolean }> {
    const endpoint = `/api/v1/public/galleries/${galleryId}/assets/${assetId}/selection`;
    const response = await apiClient.post<{
      asset_id: string;
      is_selected: boolean;
    }>(endpoint, { selected, visitor_id: visitorId });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to update selection');
    }
    return response.data!;
  }

  /**
   * Get comments for an asset in a public gallery (proofing)
   */
  async getProofingComments(
    galleryId: string,
    assetId: string,
    visitorToken?: string
  ): Promise<{ id: string; visitor_name: string; text: string; created_at: string }[]> {
    const params = new URLSearchParams();
    if (visitorToken) params.append('visitor_token', visitorToken);
    const endpoint = `/api/v1/public/galleries/${galleryId}/proof/comments/${assetId}?${params.toString()}`;
    const response = await apiClient.get<{
      comments: { id: string; visitor_name: string; text: string; created_at: string }[];
    }>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to load comments');
    }
    return response.data?.comments ?? [];
  }

  /**
   * Add a comment to an asset in a public gallery (proofing)
   */
  async addProofingComment(
    galleryId: string,
    assetId: string,
    commentText: string,
    visitorToken?: string
  ): Promise<void> {
    const endpoint = `/api/v1/public/galleries/${galleryId}/proof/comment`;
    const response = await apiClient.post(endpoint, {
      asset_id: assetId,
      comment_text: commentText,
      visitor_token: visitorToken,
    });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to post comment');
    }
  }

  /**
   * Get public gallery assets with optional filtering
   * Supports workflow tabs: All, Favorites, Selections
   * Also supports emotion-based filtering
   */
  async getPublicGalleryAssetsFiltered(
    galleryId: string,
    filterType?: 'favorites' | 'selections' | null,
    subGalleryId?: string,
    options?: {
      emotion?: string | null;
      minEmotionConfidence?: number;
    }
  ): Promise<PublicGalleryAsset[]> {
    const params = new URLSearchParams();
    if (filterType) params.append('filter_type', filterType);
    if (subGalleryId) params.append('sub_gallery_id', subGalleryId);
    if (options?.emotion) params.append('emotion', options.emotion);
    if (options?.minEmotionConfidence !== undefined) {
      params.append('min_emotion_confidence', options.minEmotionConfidence.toString());
    }

    const query = params.toString();
    const endpoint = `/api/v1/public/galleries/${galleryId}/assets/filtered${query ? `?${query}` : ''}`;
    const response = await apiClient.get<{ data: PublicGalleryAsset[] }>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch filtered assets');
    }
    return response.data!.data;
  }

  /**
   * Get gallery credentials for reveal feature
   */
  async getGalleryCredentials(
    workspaceId: string,
    galleryId: string
  ): Promise<GalleryCredentialsResponse> {
    const endpoint = `/api/v1/galleries/${galleryId}/credentials`;
    const response = await apiClient.get<GalleryCredentialsResponse>(endpoint, {
      headers: { 'X-Workspace-ID': workspaceId }
    });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to get gallery credentials');
    }
    return response.data!;
  }

  // ==========================================================================
  // Favorites Analytics (Feature: 012-client-favorites)
  // ==========================================================================

  /**
   * Get favorites summary statistics for a gallery
   * Returns a flexible record type to accommodate various API response formats
   */
  async getFavoritesSummary(
    workspaceId: string,
    galleryId: string
  ): Promise<Record<string, unknown>> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/favorites/analytics/summary`;
    const response = await apiClient.get<Record<string, unknown>>(endpoint, {
      headers: { 'X-Workspace-ID': workspaceId }
    });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to get favorites summary');
    }
    return response.data!;
  }

  /**
   * Get favorites analytics with pagination
   * Returns a flexible record type to accommodate various API response formats
   */
  async getFavoritesAnalytics(
    workspaceId: string,
    galleryId: string,
    options?: {
      sort_by?: string;
      order?: 'asc' | 'desc';
      page?: number;
      limit?: number;
    }
  ): Promise<{
    data: Array<Record<string, unknown>>;
    meta: {
      page: number;
      limit: number;
      total: number;
      total_pages: number;
    };
  }> {
    const params = new URLSearchParams();
    if (options?.sort_by) params.append('sort_by', options.sort_by);
    if (options?.order) params.append('order', options.order);
    if (options?.page) params.append('page', String(options.page));
    if (options?.limit) params.append('limit', String(options.limit));

    const query = params.toString();
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/favorites/analytics${query ? `?${query}` : ''}`;
    const response = await apiClient.get<{
      data: Array<Record<string, unknown>>;
      meta: {
        page: number;
        limit: number;
        total: number;
        total_pages: number;
      };
    }>(endpoint, { headers: { 'X-Workspace-ID': workspaceId } } as any);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to get favorites analytics');
    }
    return response.data!;
  }

  // ==========================================================================
  // Sub-Gallery Creation (Feature: 025-ai-filter-simplify)
  // ==========================================================================

  /**
   * Create a sub-gallery from filtered asset results
   */
  async createSubGalleryFromFilter(
    workspaceId: string,
    parentGalleryId: string,
    data: {
      name: string;
      asset_ids: string[];
      copy_settings?: boolean;
    }
  ): Promise<{
    gallery_id: string;
    name: string;
    asset_count: number;
    parent_gallery_id: string;
    created_at: string;
  }> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/smart-tagging/galleries/${parentGalleryId}/create-from-filter`;
    const response = await apiClient.post<{
      gallery_id: string;
      name: string;
      asset_count: number;
      parent_gallery_id: string;
      created_at: string;
    }>(endpoint, data);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to create sub-gallery');
    }
    return response.data!;
  }

  /**
   * Refresh favorites analytics
   */
  async refreshFavoritesAnalytics(
    workspaceId: string,
    galleryId: string
  ): Promise<void> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/favorites/analytics/refresh`;
    const response = await apiClient.post(endpoint, undefined, {
      headers: { 'X-Workspace-ID': workspaceId }
    });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to refresh analytics');
    }
  }

  /**
   * Export favorites as CSV
   */
  async exportFavoritesCsv(
    workspaceId: string,
    galleryId: string
  ): Promise<string> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/favorites/analytics/export`;
    const response = await apiClient.get<string>(endpoint, {
      headers: { 'X-Workspace-ID': workspaceId }
    });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to export favorites');
    }
    return response.data!;
  }

  // ==========================================================================
  // Favorites Settings (Feature: 012-client-favorites)
  // ==========================================================================

  /**
   * Get favorites settings for a gallery
   * Returns a flexible record type to accommodate various API response formats
   */
  async getFavoritesSettings(
    workspaceId: string,
    galleryId: string
  ): Promise<Record<string, unknown>> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/favorites/settings`;
    const response = await apiClient.get<Record<string, unknown>>(endpoint, {
      headers: { 'X-Workspace-ID': workspaceId }
    });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to get favorites settings');
    }
    return response.data!;
  }

  /**
   * Update favorites settings for a gallery
   * Returns a flexible record type to accommodate various API response formats
   */
  async updateFavoritesSettings(
    workspaceId: string,
    galleryId: string,
    settings: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/favorites/settings`;
    const response = await apiClient.patch<Record<string, unknown>>(endpoint, settings, {
      headers: { 'X-Workspace-ID': workspaceId }
    });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to update favorites settings');
    }
    return response.data!;
  }
}

// Export singleton instance
export const galleryService = new GalleryService();
export default galleryService;

