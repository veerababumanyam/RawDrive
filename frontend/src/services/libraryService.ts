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
}

export const libraryService = new LibraryService();
export default libraryService;
