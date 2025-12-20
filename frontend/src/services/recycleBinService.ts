/**
 * Recycle Bin Service
 * API client for recycle bin operations
 */

import apiClient from './api';

export interface RecycleBinItem {
  id: string;
  type: 'gallery' | 'photo';
  name: string;
  thumbnail_url?: string | null;
  asset_id?: string | null;
  gallery_id?: string | null;
  gallery_title?: string | null;
  sub_gallery_id?: string | null;
  sub_gallery_name?: string | null;
  deleted_at: string;
  deleted_by_user_id?: string | null;
  days_until_permanent_delete: number;
}

export interface RecycleBinListResponse {
  items: RecycleBinItem[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

export interface RestoreItemRequest {
  item_id: string;
  item_type: 'gallery' | 'photo';
}

export interface RestoreItemResponse {
  success: boolean;
  message: string;
  restored_id: string;
}

export interface PermanentDeleteRequest {
  item_id: string;
  item_type: 'gallery' | 'photo';
}

export interface PermanentDeleteResponse {
  success: boolean;
  message: string;
  files_deleted: number;
  storage_freed: number;
}

export interface BulkOperationResult {
  item_id: string;
  item_type: 'gallery' | 'photo';
  success: boolean;
  error?: string;
}

export interface BulkRecycleBinResponse {
  success: boolean;
  results: BulkOperationResult[];
  success_count: number;
  failure_count: number;
}

export class RecycleBinService {
  /**
   * List items in the recycle bin
   */
  async listItems(
    workspaceId: string,
    options?: {
      page?: number;
      limit?: number;
      type?: 'all' | 'gallery' | 'photo';
    }
  ): Promise<RecycleBinListResponse> {
    const params = new URLSearchParams();
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.type) params.append('type', options.type);

    const query = params.toString();
    const endpoint = `/api/v1/workspaces/${workspaceId}/recycle-bin${query ? `?${query}` : ''}`;

    const response = await apiClient.get<RecycleBinListResponse>(endpoint);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch recycle bin items');
    }
    return response.data!;
  }

  /**
   * Restore an item from the recycle bin
   */
  async restoreItem(
    workspaceId: string,
    itemId: string,
    itemType: 'gallery' | 'photo'
  ): Promise<RestoreItemResponse> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/recycle-bin/restore`;
    const request: RestoreItemRequest = {
      item_id: itemId,
      item_type: itemType,
    };

    const response = await apiClient.post<RestoreItemResponse>(endpoint, request);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to restore item');
    }
    return response.data!;
  }

  /**
   * Permanently delete an item
   */
  async permanentDelete(
    workspaceId: string,
    itemId: string,
    itemType: 'gallery' | 'photo'
  ): Promise<PermanentDeleteResponse> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/recycle-bin/permanent`;
    const request: PermanentDeleteRequest = {
      item_id: itemId,
      item_type: itemType,
    };

    const response = await apiClient.delete<PermanentDeleteResponse>(endpoint, request);
    if (response.error) {
      throw new Error(response.error.message || 'Failed to permanently delete item');
    }
    return response.data!;
  }

  /**
   * Bulk restore items
   */
  async bulkRestore(
    workspaceId: string,
    items: RestoreItemRequest[]
  ): Promise<BulkRecycleBinResponse> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/recycle-bin/bulk-restore`;

    const response = await apiClient.post<BulkRecycleBinResponse>(endpoint, { items });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to restore items');
    }
    return response.data!;
  }

  /**
   * Bulk permanently delete items
   */
  async bulkPermanentDelete(
    workspaceId: string,
    items: RestoreItemRequest[]
  ): Promise<BulkRecycleBinResponse> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/recycle-bin/bulk-permanent-delete`;

    const response = await apiClient.post<BulkRecycleBinResponse>(endpoint, { items });
    if (response.error) {
      throw new Error(response.error.message || 'Failed to delete items');
    }
    return response.data!;
  }
}

// Export singleton instance
export const recycleBinService = new RecycleBinService();
export default recycleBinService;
