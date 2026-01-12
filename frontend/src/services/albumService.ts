/**
 * Album Service
 * API client for album proofing operations
 *
 * Feature: 026-album-proofing
 */

import apiClient from './api';
import type {
  Album,
  AlbumSummary,
  AlbumCreateRequest,
  AlbumUpdateRequest,
  AlbumListResponse,
  AlbumDetailResponse,
  SendProofRequest,
  SendProofResponse,
  AlbumComment,
  AlbumCommentCreateRequest,
  AlbumCommentUpdateRequest,
  CommentSummary,
  AlbumVersion,
  AlbumVersionCreateRequest,
  VersionComparison,
  RollbackRequest,
  RollbackResponse,
  AlbumRender,
  AlbumRenderCreateRequest,
  DownloadResponse,
  AlbumProofResponse,
  ApproveAlbumRequest,
  ApproveAlbumResponse,
  PublicCommentCreateRequest,
} from '../types/album';

/**
 * Album Service
 * Handles album CRUD, proofing, comments, versions, and renders
 */
export class AlbumService {
  // =========================================================================
  // ALBUM CRUD
  // =========================================================================

  /**
   * List albums for a workspace
   */
  async listAlbums(
    workspaceId: string,
    options?: {
      page?: number;
      limit?: number;
      status?: string;
      galleryId?: string;
      search?: string;
      signal?: AbortSignal;
    }
  ): Promise<AlbumListResponse> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.status) params.append('status', options.status);
    if (options?.galleryId) params.append('gallery_id', options.galleryId);
    if (options?.search) params.append('search', options.search);

    const query = params.toString();
    const endpoint = `/api/v1/workspaces/${workspaceId}/albums${query ? `?${query}` : ''}`;

    const response = await apiClient.get<AlbumListResponse>(endpoint, {
      signal: options?.signal,
    } as any);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch albums');
    }
    return response.data!;
  }

  /**
   * Get album details with spreads and comment summary
   */
  async getAlbum(
    workspaceId: string,
    albumId: string,
    signal?: AbortSignal
  ): Promise<AlbumDetailResponse> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/albums/${albumId}`;
    const response = await apiClient.get<AlbumDetailResponse>(endpoint, {
      signal,
    } as any);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch album');
    }
    return response.data!;
  }

  /**
   * Create a new album
   */
  async createAlbum(
    workspaceId: string,
    data: AlbumCreateRequest
  ): Promise<Album> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/albums`;
    const response = await apiClient.post<Album>(endpoint, data);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to create album');
    }
    return response.data!;
  }

  /**
   * Update album
   */
  async updateAlbum(
    workspaceId: string,
    albumId: string,
    data: AlbumUpdateRequest
  ): Promise<Album> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/albums/${albumId}`;
    const response = await apiClient.patch<Album>(endpoint, data);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to update album');
    }
    return response.data!;
  }

  /**
   * Delete album
   */
  async deleteAlbum(workspaceId: string, albumId: string): Promise<void> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/albums/${albumId}`;
    const response = await apiClient.delete<{ message: string }>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to delete album');
    }
  }

  // =========================================================================
  // PROOFING
  // =========================================================================

  /**
   * Send album proof to client via email
   */
  async sendProof(
    workspaceId: string,
    albumId: string,
    data: SendProofRequest
  ): Promise<SendProofResponse> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/albums/${albumId}/send-proof`;
    const response = await apiClient.post<SendProofResponse>(endpoint, data);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to send proof');
    }
    return response.data!;
  }

  // =========================================================================
  // COMMENTS (AUTHENTICATED)
  // =========================================================================

  /**
   * List comments for an album
   */
  async listComments(
    workspaceId: string,
    albumId: string,
    options?: {
      spreadId?: string;
      status?: string;
      includeResolved?: boolean;
      signal?: AbortSignal;
    }
  ): Promise<{ comments: AlbumComment[]; summary: CommentSummary }> {
    const params = new URLSearchParams();
    if (options?.spreadId) params.append('spread_id', options.spreadId);
    if (options?.status) params.append('status', options.status);
    if (options?.includeResolved !== undefined) {
      params.append('include_resolved', options.includeResolved.toString());
    }

    const query = params.toString();
    const endpoint = `/api/v1/workspaces/${workspaceId}/albums/${albumId}/comments${query ? `?${query}` : ''}`;

    const response = await apiClient.get<{ comments: AlbumComment[]; summary: CommentSummary }>(endpoint, {
      signal: options?.signal,
    } as any);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch comments');
    }
    return response.data!;
  }

  /**
   * Update a comment
   */
  async updateComment(
    workspaceId: string,
    albumId: string,
    commentId: string,
    data: AlbumCommentUpdateRequest
  ): Promise<AlbumComment> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/albums/${albumId}/comments/${commentId}`;
    const response = await apiClient.patch<AlbumComment>(endpoint, data);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to update comment');
    }
    return response.data!;
  }

  /**
   * Resolve a comment
   */
  async resolveComment(
    workspaceId: string,
    albumId: string,
    commentId: string
  ): Promise<AlbumComment> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/albums/${albumId}/comments/${commentId}/resolve`;
    const response = await apiClient.post<AlbumComment>(endpoint, {});
    if (response.error) {
      throw new Error(response.error.message || 'Failed to resolve comment');
    }
    return response.data!;
  }

  /**
   * Delete a comment
   */
  async deleteComment(
    workspaceId: string,
    albumId: string,
    commentId: string
  ): Promise<void> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/albums/${albumId}/comments/${commentId}`;
    const response = await apiClient.delete<{ message: string }>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to delete comment');
    }
  }

  // =========================================================================
  // VERSIONS
  // =========================================================================

  /**
   * List album versions
   */
  async listVersions(
    workspaceId: string,
    albumId: string,
    signal?: AbortSignal
  ): Promise<AlbumVersion[]> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/albums/${albumId}/versions`;
    const response = await apiClient.get<AlbumVersion[]>(endpoint, {
      signal,
    } as any);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch versions');
    }
    return response.data!;
  }

  /**
   * Create a new version snapshot
   */
  async createVersion(
    workspaceId: string,
    albumId: string,
    data: AlbumVersionCreateRequest
  ): Promise<AlbumVersion> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/albums/${albumId}/versions`;
    const response = await apiClient.post<AlbumVersion>(endpoint, data);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to create version');
    }
    return response.data!;
  }

  /**
   * Get version details
   */
  async getVersion(
    workspaceId: string,
    albumId: string,
    versionId: string,
    signal?: AbortSignal
  ): Promise<AlbumVersion> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/albums/${albumId}/versions/${versionId}`;
    const response = await apiClient.get<AlbumVersion>(endpoint, {
      signal,
    } as any);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch version');
    }
    return response.data!;
  }

  /**
   * Rollback to a previous version
   */
  async rollbackVersion(
    workspaceId: string,
    albumId: string,
    versionId: string,
    data: RollbackRequest
  ): Promise<RollbackResponse> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/albums/${albumId}/versions/${versionId}/rollback`;
    const response = await apiClient.post<RollbackResponse>(endpoint, data);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to rollback version');
    }
    return response.data!;
  }

  /**
   * Compare two versions
   */
  async compareVersions(
    workspaceId: string,
    albumId: string,
    fromVersionId: string,
    toVersionId: string,
    signal?: AbortSignal
  ): Promise<VersionComparison> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/albums/${albumId}/versions/compare?from_version_id=${fromVersionId}&to_version_id=${toVersionId}`;
    const response = await apiClient.get<VersionComparison>(endpoint, {
      signal,
    } as any);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to compare versions');
    }
    return response.data!;
  }

  // =========================================================================
  // RENDERS
  // =========================================================================

  /**
   * List album renders
   */
  async listRenders(
    workspaceId: string,
    albumId: string,
    signal?: AbortSignal
  ): Promise<AlbumRender[]> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/albums/${albumId}/renders`;
    const response = await apiClient.get<AlbumRender[]>(endpoint, {
      signal,
    } as any);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch renders');
    }
    return response.data!;
  }

  /**
   * Create a new render job
   */
  async createRender(
    workspaceId: string,
    albumId: string,
    data: AlbumRenderCreateRequest
  ): Promise<AlbumRender> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/albums/${albumId}/renders`;
    const response = await apiClient.post<AlbumRender>(endpoint, data);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to create render');
    }
    return response.data!;
  }

  /**
   * Get render status
   */
  async getRender(
    workspaceId: string,
    albumId: string,
    renderId: string,
    signal?: AbortSignal
  ): Promise<AlbumRender> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/albums/${albumId}/renders/${renderId}`;
    const response = await apiClient.get<AlbumRender>(endpoint, {
      signal,
    } as any);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch render');
    }
    return response.data!;
  }

  // =========================================================================
  // PUBLIC ENDPOINTS (NO AUTH)
  // =========================================================================

  /**
   * Get album proof for public viewing via share token
   */
  async getPublicProof(token: string, signal?: AbortSignal): Promise<AlbumProofResponse> {
    const endpoint = `/api/v1/public/albums/proof/${token}`;
    const response = await apiClient.get<AlbumProofResponse>(endpoint, {
      signal,
      headers: undefined,
    } as any);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch album proof');
    }
    return response.data!;
  }

  /**
   * List public comments for album (excludes internal notes)
   */
  async listPublicComments(
    token: string,
    spreadId?: string,
    signal?: AbortSignal
  ): Promise<AlbumComment[]> {
    const params = spreadId ? `?spread_id=${spreadId}` : '';
    const endpoint = `/api/v1/public/albums/proof/${token}/comments${params}`;
    const response = await apiClient.get<AlbumComment[]>(endpoint, {
      signal,
      headers: undefined,
    } as any);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch comments');
    }
    return response.data!;
  }

  /**
   * Create a public comment (client feedback)
   */
  async createPublicComment(
    token: string,
    data: PublicCommentCreateRequest
  ): Promise<AlbumComment> {
    const endpoint = `/api/v1/public/albums/proof/${token}/comments`;
    const response = await apiClient.post<AlbumComment>(endpoint, data, {
      headers: undefined,
    } as any);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to create comment');
    }
    return response.data!;
  }

  /**
   * Approve album (client approval)
   */
  async approveAlbum(
    token: string,
    data: ApproveAlbumRequest
  ): Promise<ApproveAlbumResponse> {
    const endpoint = `/api/v1/public/albums/proof/${token}/approve`;
    const response = await apiClient.post<ApproveAlbumResponse>(endpoint, data, {
      headers: undefined,
    } as any);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to approve album');
    }
    return response.data!;
  }

  /**
   * Get download URL for album preview
   */
  async getDownloadUrl(token: string, signal?: AbortSignal): Promise<DownloadResponse> {
    const endpoint = `/api/v1/public/albums/proof/${token}/download`;
    const response = await apiClient.get<DownloadResponse>(endpoint, {
      signal,
      headers: undefined,
    } as any);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to get download URL');
    }
    return response.data!;
  }
}

// Export singleton instance
export const albumService = new AlbumService();
export default albumService;
