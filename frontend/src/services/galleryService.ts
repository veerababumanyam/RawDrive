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
  GalleryCredentialsResponse,
  UploadSessionRequest,
  UploadSessionResponse,
  UploadCommitRequest,
  UploadCommitResponse,
  CheckDuplicateRequest,
  CheckDuplicateResponse,
  PublicGalleryAsset,
  ValidatedMagicLink,
} from '../types/gallery';

/**
 * Check if a string is a valid UUID format
 */
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

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
   *
   * Handles two scenarios:
   * 1. galleryId is a UUID - calls public galleries endpoint directly
   * 2. galleryId is a magic link token - validates token and extracts gallery data
   */
  async getPublicGallery(galleryIdOrToken: string): Promise<GalleryDetailData> {
    // If it's a valid UUID, use the direct gallery endpoint
    if (isValidUUID(galleryIdOrToken)) {
      const endpoint = `/api/v1/public/galleries/${galleryIdOrToken}`;
      const response = await apiClient.get<GalleryDetailData>(endpoint);
      if (response.error) {
        throw new Error(response.error.message || 'Failed to fetch public gallery');
      }
      return response.data!;
    }

    // Otherwise, treat it as a magic link token
    const validated = await this.validateMagicLink(galleryIdOrToken);

    // Convert ValidatedMagicLink to GalleryDetailData format
    // The magic link response has a nested gallery object that needs to be expanded
    // Note: company_profile from magic link has limited fields, cast to partial
    return {
      gallery_id: validated.gallery.gallery_id,
      workspace_id: '', // Not exposed in magic link response for security
      title: validated.gallery.title,
      status: validated.gallery.status,
      created_by_user_id: '', // Not exposed in magic link response
      created_at: '', // Not exposed in magic link response
      description: validated.gallery.description,
      cover_asset_id: validated.gallery.cover_asset_id,
      primary_color: validated.gallery.primary_color,
      font_family: validated.gallery.font_family,
      custom_links: validated.gallery.custom_links,
      pin_protected: validated.gallery.pin_protected,
      password_protected: false, // Magic links don't expose password protection status
      email_registration_required: validated.gallery.email_registration_required,
      company_profile: validated.company_profile ? {
        profile_id: '',
        workspace_id: '',
        name: validated.company_profile.name,
        slug: '',
        email: '',
        secondary_emails: [],
        secondary_phones: [],
        socials: {},
        custom_links: [],
        company_visibility: {},
        created_at: '',
        updated_at: '',
        logo_url: validated.company_profile.logo_url,
        website: validated.company_profile.website,
        brand_color: validated.company_profile.brand_color,
      } : undefined,
      sub_galleries: [],
      stats: {
        total_items: 0,
        total_photos: 0,
        total_videos: 0,
        favorites_count: 0,
        selections_count: 0,
      },
    };
  }

  /**
   * Validate a magic link token and get gallery data
   */
  async validateMagicLink(token: string): Promise<ValidatedMagicLink> {
    const endpoint = `/api/v1/public/magic-links/${token}`;
    const response = await apiClient.get<ValidatedMagicLink>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to validate magic link');
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
    if (data.client_metadata) {
      formData.append('client_metadata', JSON.stringify(data.client_metadata));
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
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/assets/${assetId}`;
    const response = await apiClient.patch<{ message: string }>(endpoint, data);
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
  /**
   * Register visitor
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

  async addAssetsToGallery(
    workspaceId: string,
    galleryId: string,
    assetIds: string[]
  ): Promise<{ count: number }> {
    const response = await apiClient.post<{ success: boolean; count: number }>(
      `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/assets`,
      { asset_ids: assetIds }
    );
    return response.data!;
  }

  async removeAssetsFromGallery(
    workspaceId: string,
    galleryId: string,
    assetIds: string[]
  ): Promise<{ count: number }> {
    const response = await apiClient.delete<{ success: boolean; count: number }>(
      `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/assets`,
      { asset_ids: assetIds }
    );
    return response.data!;
  }

  async pinGallery(workspaceId: string, galleryId: string): Promise<void> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/pin`;
    const response = await apiClient.post<{ success: boolean }>(endpoint, {});
    if (response.error) {
      throw new Error(response.error.message || 'Failed to pin gallery');
    }
  }

  async unpinGallery(workspaceId: string, galleryId: string): Promise<void> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/unpin`;
    const response = await apiClient.post<{ success: boolean }>(endpoint, {});
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
   * Get public gallery assets with optional filtering
   * Supports workflow tabs: All, Favorites, Selections
   */
  async getPublicGalleryAssetsFiltered(
    galleryId: string,
    filterType?: 'favorites' | 'selections' | null,
    subGalleryId?: string
  ): Promise<PublicGalleryAsset[]> {
    const params = new URLSearchParams();
    if (filterType) params.append('filter_type', filterType);
    if (subGalleryId) params.append('sub_gallery_id', subGalleryId);

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
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/credentials`;
    const response = await apiClient.get<GalleryCredentialsResponse>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to get gallery credentials');
    }
    return response.data!;
  }

  // ---------------------------------------------------------------------------
  // Favorites Analytics Methods (US5 - 012-client-favorites)
  // ---------------------------------------------------------------------------

  /**
   * Get favorites analytics summary for a gallery
   */
  async getFavoritesSummary(
    workspaceId: string,
    galleryId: string
  ): Promise<{
    gallery_id: string;
    gallery_title: string;
    total_favorites: number;
    unique_clients: number;
    favorited_photos: number;
    total_photos: number;
    total_lists: number;
    engagement_rate: number;
    most_favorited_photo: {
      asset_id: string;
      filename: string;
      thumbnail_url: string | null;
      favorite_count: number;
    } | null;
    favorites_by_day: Array<{ date: string; count: number }>;
  }> {
    type SummaryResponse = {
      gallery_id: string;
      gallery_title: string;
      total_favorites: number;
      unique_clients: number;
      favorited_photos: number;
      total_photos: number;
      total_lists: number;
      engagement_rate: number;
      most_favorited_photo: {
        asset_id: string;
        filename: string;
        thumbnail_url: string | null;
        favorite_count: number;
      } | null;
      favorites_by_day: Array<{ date: string; count: number }>;
    };
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/favorites/analytics/summary`;
    const response = await apiClient.get<SummaryResponse>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to get favorites summary');
    }
    return response.data!;
  }

  /**
   * Get paginated photo analytics for favorites
   */
  async getFavoritesAnalytics(
    workspaceId: string,
    galleryId: string,
    options: {
      sort_by?: string;
      order?: 'asc' | 'desc';
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{
    data: Array<{
      asset_id: string;
      filename: string;
      thumbnail_url: string | null;
      width: number | null;
      height: number | null;
      favorite_count: number;
      unique_clients: number;
      first_favorited_at: string | null;
      last_favorited_at: string | null;
    }>;
    meta: {
      page: number;
      limit: number;
      total: number;
      total_pages: number;
    };
  }> {
    type AnalyticsResponse = {
      data: Array<{
        asset_id: string;
        filename: string;
        thumbnail_url: string | null;
        width: number | null;
        height: number | null;
        favorite_count: number;
        unique_clients: number;
        first_favorited_at: string | null;
        last_favorited_at: string | null;
      }>;
      meta: {
        page: number;
        limit: number;
        total: number;
        total_pages: number;
      };
    };
    const params = new URLSearchParams();
    if (options.sort_by) params.append('sort_by', options.sort_by);
    if (options.order) params.append('order', options.order);
    if (options.page) params.append('page', String(options.page));
    if (options.limit) params.append('limit', String(options.limit));

    const query = params.toString();
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/favorites/analytics${query ? `?${query}` : ''}`;
    const response = await apiClient.get<AnalyticsResponse>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to get favorites analytics');
    }
    return response.data!;
  }

  /**
   * Refresh favorites analytics cache
   */
  async refreshFavoritesAnalytics(
    workspaceId: string,
    galleryId: string
  ): Promise<{ success: boolean; message: string }> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/favorites/analytics/refresh`;
    const response = await apiClient.post<{ success: boolean; message: string }>(endpoint, {});
    if (response.error) {
      throw new Error(response.error.message || 'Failed to refresh analytics');
    }
    return response.data!;
  }

  /**
   * Export favorites as CSV
   */
  async exportFavoritesCsv(
    workspaceId: string,
    galleryId: string,
    minFavorites: number = 1
  ): Promise<string> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/favorites/export?min_favorites=${minFavorites}`;
    const response = await apiClient.get<string>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to export CSV');
    }
    return response.data!;
  }

  // ---------------------------------------------------------------------------
  // Favorites Settings Methods (US5 - 012-client-favorites)
  // ---------------------------------------------------------------------------

  /**
   * Get favorites settings for a gallery
   */
  async getFavoritesSettings(
    workspaceId: string,
    galleryId: string
  ): Promise<{
    favorites_enabled: boolean;
    sharing_enabled: boolean;
    download_enabled: boolean;
    max_lists_per_client: number;
    download_resolution: string;
    download_limit_per_client: number;
  }> {
    type SettingsResponse = {
      favorites_enabled: boolean;
      sharing_enabled: boolean;
      download_enabled: boolean;
      max_lists_per_client: number;
      download_resolution: string;
      download_limit_per_client: number;
    };
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/favorites/settings`;
    const response = await apiClient.get<SettingsResponse>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to get favorites settings');
    }
    return response.data!;
  }

  /**
   * Update favorites settings for a gallery
   */
  async updateFavoritesSettings(
    workspaceId: string,
    galleryId: string,
    settings: {
      favorites_enabled?: boolean;
      sharing_enabled?: boolean;
      download_enabled?: boolean;
      max_lists_per_client?: number;
      download_resolution?: string;
      download_limit_per_client?: number;
    }
  ): Promise<{
    favorites_enabled: boolean;
    sharing_enabled: boolean;
    download_enabled: boolean;
    max_lists_per_client: number;
    download_resolution: string;
    download_limit_per_client: number;
  }> {
    type SettingsResponse = {
      favorites_enabled: boolean;
      sharing_enabled: boolean;
      download_enabled: boolean;
      max_lists_per_client: number;
      download_resolution: string;
      download_limit_per_client: number;
    };
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/favorites/settings`;
    const response = await apiClient.patch<SettingsResponse>(endpoint, settings);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to update favorites settings');
    }
    return response.data!;
  }
}

// Export singleton instance
export const galleryService = new GalleryService();
export default galleryService;

