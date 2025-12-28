/**
 * Library Service
 * API client for workspace-wide asset operations (DAM)
 */

import apiClient from './api';
import type { AssetInfo } from '../types/gallery';

export interface LibraryAsset extends AssetInfo {
  asset_id: string;
  workspace_id: string;
  is_assigned: boolean;
  folder_id?: string;
}

export interface LibraryListResponse {
  data: LibraryAsset[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Folder Types
export interface LibraryFolder {
  folder_id: string;
  workspace_id: string;
  name: string;
  parent_folder_id: string | null;
  description: string | null;
  color: string | null;
  sort_order: number;
  cover_asset_id: string | null;
  created_at: string;
  updated_at: string;
  asset_count: number;
  subfolder_count?: number;
}

export interface LibraryFolderDetail extends LibraryFolder {
  breadcrumb: Array<{ folder_id: string; name: string }>;
}

export interface FolderListResponse {
  data: LibraryFolder[];
}

export interface CreateFolderRequest {
  name: string;
  parent_folder_id?: string;
  description?: string;
  color?: string;
}

export interface UpdateFolderRequest {
  name?: string;
  description?: string;
  color?: string;
  cover_asset_id?: string;
}

export interface MoveAssetsRequest {
  asset_ids: string[];
  folder_id: string | null;
}

export class LibraryService {
  /**
   * List assets in the workspace library
   */
  async listAssets(
    workspaceId: string,
    options?: {
      page?: number;
      limit?: number;
      sort?: 'created_at' | 'date_taken' | 'filename';
      type?: 'photo' | 'video';
      unassigned_only?: boolean;
      search?: string;
      startDate?: string;
      endDate?: string;
      folder_id?: string;
      face_group_id?: string;
    }
  ): Promise<LibraryListResponse> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.sort) params.append('sort', options.sort);
    if (options?.type) params.append('type', options.type);
    if (options?.unassigned_only) params.append('unassigned_only', 'true');
    if (options?.search) params.append('search', options.search);
    if (options?.startDate) params.append('start_date', options.startDate);
    if (options?.endDate) params.append('end_date', options.endDate);
    if (options?.folder_id) params.append('folder_id', options.folder_id);
    if (options?.face_group_id) params.append('face_group_id', options.face_group_id);

    const query = params.toString();
    const endpoint = `/api/v1/workspaces/${workspaceId}/library/assets${query ? `?${query}` : ''}`;

    const response = await apiClient.get<LibraryListResponse>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch library assets');
    }
    return response.data!;
  }

  /**
   * Delete assets from the library
   */
  async deleteAssets(workspaceId: string, assetIds: string[]): Promise<{ success: boolean; count: number }> {
    const response = await apiClient.delete<{ success: boolean; count: number }>(
      `/api/v1/workspaces/${workspaceId}/library/assets`,
      { asset_ids: assetIds }
    );
    if (response.error) {
      throw new Error(response.error.message || 'Failed to delete assets');
    }
    return response.data!;
  }

  // -------------------------------------------------------------------------
  // Folder Operations
  // -------------------------------------------------------------------------

  /**
   * List folders in the library
   */
  async listFolders(
    workspaceId: string,
    parentFolderId?: string
  ): Promise<LibraryFolder[]> {
    const params = new URLSearchParams();
    if (parentFolderId) params.append('parent_folder_id', parentFolderId);

    const query = params.toString();
    const endpoint = `/api/v1/workspaces/${workspaceId}/library/folders${query ? `?${query}` : ''}`;

    const response = await apiClient.get<FolderListResponse>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch folders');
    }
    return response.data?.data || [];
  }

  /**
   * Create a new folder
   */
  async createFolder(
    workspaceId: string,
    data: CreateFolderRequest
  ): Promise<LibraryFolder> {
    const response = await apiClient.post<LibraryFolder>(
      `/api/v1/workspaces/${workspaceId}/library/folders`,
      data
    );
    if (response.error) {
      throw new Error(response.error.message || 'Failed to create folder');
    }
    return response.data!;
  }

  /**
   * Get folder details with breadcrumb
   */
  async getFolder(
    workspaceId: string,
    folderId: string
  ): Promise<LibraryFolderDetail> {
    const response = await apiClient.get<LibraryFolderDetail>(
      `/api/v1/workspaces/${workspaceId}/library/folders/${folderId}`
    );
    if (response.error) {
      throw new Error(response.error.message || 'Failed to get folder');
    }
    return response.data!;
  }

  /**
   * Update a folder
   */
  async updateFolder(
    workspaceId: string,
    folderId: string,
    data: UpdateFolderRequest
  ): Promise<LibraryFolder> {
    const response = await apiClient.patch<LibraryFolder>(
      `/api/v1/workspaces/${workspaceId}/library/folders/${folderId}`,
      data
    );
    if (response.error) {
      throw new Error(response.error.message || 'Failed to update folder');
    }
    return response.data!;
  }

  /**
   * Delete a folder
   */
  async deleteFolder(
    workspaceId: string,
    folderId: string,
    moveAssetsToRoot: boolean = true
  ): Promise<{ deleted: boolean; folders_deleted: number }> {
    const params = new URLSearchParams();
    params.append('move_assets_to_root', moveAssetsToRoot.toString());

    const response = await apiClient.delete<{ deleted: boolean; folders_deleted: number }>(
      `/api/v1/workspaces/${workspaceId}/library/folders/${folderId}?${params.toString()}`
    );
    if (response.error) {
      throw new Error(response.error.message || 'Failed to delete folder');
    }
    return response.data!;
  }

  /**
   * Move assets to a folder (or root if folderId is null)
   */
  async moveAssetsToFolder(
    workspaceId: string,
    assetIds: string[],
    folderId: string | null
  ): Promise<{ moved: boolean; count: number }> {
    const response = await apiClient.post<{ moved: boolean; count: number }>(
      `/api/v1/workspaces/${workspaceId}/library/assets/move`,
      { asset_ids: assetIds, folder_id: folderId }
    );
    if (response.error) {
      throw new Error(response.error.message || 'Failed to move assets');
    }
    return response.data!;
  }
}

export const libraryService = new LibraryService();
export default libraryService;

