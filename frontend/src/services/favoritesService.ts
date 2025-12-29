/**
 * Favorites Service
 *
 * Client-side service for managing photo favorites in public galleries.
 * Uses localStorage for client token persistence.
 *
 * Feature: 012-client-favorites
 */

import { api } from './apiService';

// ============================================================================
// T022: Client Token Management
// ============================================================================

const CLIENT_TOKEN_KEY = 'rawdrive_client_token';

/**
 * Get or generate a client token for identifying the visitor.
 * Tokens are stored in localStorage for persistence across sessions.
 */
export function getClientToken(): string {
  let token = localStorage.getItem(CLIENT_TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(CLIENT_TOKEN_KEY, token);
  }
  return token;
}

/**
 * Clear the client token (useful for testing or privacy reset).
 */
export function clearClientToken(): void {
  localStorage.removeItem(CLIENT_TOKEN_KEY);
}

// ============================================================================
// T023: API Headers with Client Token
// ============================================================================

/**
 * Get headers with client token for favorites API calls.
 */
function getFavoritesHeaders(): Record<string, string> {
  return {
    'X-Client-Token': getClientToken(),
  };
}

// ============================================================================
// Types
// ============================================================================

export interface ToggleFavoriteRequest {
  asset_id: string;
  favorited: boolean;
  list_id?: string;
}

export interface ToggleFavoriteResponse {
  asset_id: string;
  is_favorited: boolean;
  favorites_count: number;
  list_id: string | null;
}

export interface FavoriteItem {
  interaction_id: string;
  asset_id: string;
  list_id: string;
  thumbnail_url: string | null;
  filename: string;
  width: number;
  height: number;
  favorited_at: string;
}

export interface FavoritesListResponse {
  data: FavoriteItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface FavoriteList {
  list_id: string;
  workspace_id: string;
  gallery_id: string;
  client_token: string;
  name: string;
  is_default: boolean;
  sort_order: number;
  photo_count: number;
  created_at: string;
  updated_at: string;
}

export interface FavoriteListsResponse {
  lists: FavoriteList[];
  total_favorites: number;
}

export interface CreateListRequest {
  name: string;
}

export interface UpdateListRequest {
  name?: string;
  sort_order?: number;
}

export interface ShareLink {
  share_id: string;
  share_token: string;
  share_url: string;
  expires_at: string | null;
  access_count: number;
  created_at: string;
}

export interface DownloadStatus {
  download_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  file_size_bytes: number | null;
  download_url: string | null;
  error_message: string | null;
  expires_at: string | null;
}

// ============================================================================
// Favorites Service API
// ============================================================================

export const favoritesService = {
  // ==========================================================================
  // Core Favorites (US1)
  // ==========================================================================

  /**
   * Toggle favorite status for a photo.
   */
  async toggleFavorite(
    galleryId: string,
    request: ToggleFavoriteRequest
  ): Promise<ToggleFavoriteResponse> {
    const response = await api.post<ToggleFavoriteResponse>(
      `/public/galleries/${galleryId}/favorites`,
      request,
      { headers: getFavoritesHeaders() }
    );
    return response.data;
  },

  /**
   * Get all favorited photos.
   */
  async getFavorites(
    galleryId: string,
    options?: { listId?: string; page?: number; limit?: number }
  ): Promise<FavoritesListResponse> {
    const params = new URLSearchParams();
    if (options?.listId) params.append('list_id', options.listId);
    if (options?.page) params.append('page', String(options.page));
    if (options?.limit) params.append('limit', String(options.limit));

    const queryString = params.toString();
    const url = `/public/galleries/${galleryId}/favorites${queryString ? `?${queryString}` : ''}`;

    const response = await api.get<FavoritesListResponse>(url, {
      headers: getFavoritesHeaders(),
    });
    return response.data;
  },

  /**
   * Check if a specific asset is favorited.
   * @deprecated Use checkFavoritesBatch for better performance
   */
  async isFavorited(galleryId: string, assetId: string): Promise<boolean> {
    try {
      const result = await this.checkFavoritesBatch(galleryId, [assetId]);
      return result[assetId] ?? false;
    } catch {
      return false;
    }
  },

  /**
   * Check favorite status for multiple assets in a single request.
   * More efficient than calling isFavorited for each asset.
   */
  async checkFavoritesBatch(
    galleryId: string,
    assetIds: string[]
  ): Promise<Record<string, boolean>> {
    if (assetIds.length === 0) {
      return {};
    }

    try {
      const response = await api.post<Record<string, boolean>>(
        `/public/galleries/${galleryId}/favorites/check`,
        assetIds,
        { headers: getFavoritesHeaders() }
      );
      return response.data;
    } catch {
      // Return all false on error
      return Object.fromEntries(assetIds.map((id) => [id, false]));
    }
  },

  // ==========================================================================
  // Favorite Lists (US3)
  // ==========================================================================

  /**
   * Get all favorite lists for the current client.
   */
  async getLists(galleryId: string): Promise<FavoriteListsResponse> {
    const response = await api.get<FavoriteListsResponse>(
      `/public/galleries/${galleryId}/favorites/lists`,
      { headers: getFavoritesHeaders() }
    );
    return response.data;
  },

  /**
   * Create a new favorite list.
   */
  async createList(
    galleryId: string,
    request: CreateListRequest
  ): Promise<FavoriteList> {
    const response = await api.post<FavoriteList>(
      `/public/galleries/${galleryId}/favorites/lists`,
      request,
      { headers: getFavoritesHeaders() }
    );
    return response.data;
  },

  /**
   * Update a favorite list.
   */
  async updateList(
    galleryId: string,
    listId: string,
    request: UpdateListRequest
  ): Promise<FavoriteList> {
    const response = await api.patch<FavoriteList>(
      `/public/galleries/${galleryId}/favorites/lists/${listId}`,
      request,
      { headers: getFavoritesHeaders() }
    );
    return response.data;
  },

  /**
   * Delete a favorite list.
   */
  async deleteList(galleryId: string, listId: string): Promise<void> {
    await api.delete(`/public/galleries/${galleryId}/favorites/lists/${listId}`, {
      headers: getFavoritesHeaders(),
    });
  },

  /**
   * Move a photo to a different list.
   */
  async moveToList(
    galleryId: string,
    listId: string,
    assetId: string,
    targetListId: string
  ): Promise<void> {
    await api.post(
      `/public/galleries/${galleryId}/favorites/lists/${listId}/move`,
      { asset_id: assetId, target_list_id: targetListId },
      { headers: getFavoritesHeaders() }
    );
  },

  // ==========================================================================
  // Sharing (US6)
  // ==========================================================================

  /**
   * Create a share link for a favorites list.
   */
  async createShareLink(
    galleryId: string,
    listId: string,
    expiresInDays?: number
  ): Promise<ShareLink> {
    const response = await api.post<ShareLink>(
      `/public/galleries/${galleryId}/favorites/lists/${listId}/share`,
      { expires_in_days: expiresInDays },
      { headers: getFavoritesHeaders() }
    );
    return response.data;
  },

  /**
   * Get existing share links for a list.
   */
  async getShareLinks(
    galleryId: string,
    listId: string
  ): Promise<{ shares: ShareLink[] }> {
    const response = await api.get<{ shares: ShareLink[] }>(
      `/public/galleries/${galleryId}/favorites/lists/${listId}/share`,
      { headers: getFavoritesHeaders() }
    );
    return response.data;
  },

  /**
   * Revoke a share link.
   */
  async revokeShareLink(
    galleryId: string,
    listId: string,
    shareId: string
  ): Promise<void> {
    await api.delete(
      `/public/galleries/${galleryId}/favorites/lists/${listId}/share/${shareId}`,
      { headers: getFavoritesHeaders() }
    );
  },

  // ==========================================================================
  // Downloads (US4)
  // ==========================================================================

  /**
   * Request a ZIP download of favorites.
   */
  async requestDownload(
    galleryId: string,
    listId: string,
    resolution: 'web' | 'original' = 'web'
  ): Promise<DownloadStatus> {
    const response = await api.post<DownloadStatus>(
      `/public/galleries/${galleryId}/favorites/lists/${listId}/download`,
      { resolution },
      { headers: getFavoritesHeaders() }
    );
    return response.data;
  },

  /**
   * Get download status.
   */
  async getDownloadStatus(
    galleryId: string,
    downloadId: string
  ): Promise<DownloadStatus> {
    const response = await api.get<DownloadStatus>(
      `/public/galleries/${galleryId}/favorites/downloads/${downloadId}`,
      { headers: getFavoritesHeaders() }
    );
    return response.data;
  },
};

export default favoritesService;
