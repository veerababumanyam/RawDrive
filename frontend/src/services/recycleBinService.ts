/**
 * Recycle Bin Service
 * API client for recycle bin operations
 */

import apiClient from './api';
import {
  RecycleBinItem,
  RecycleBinApiResponse,
  RestoreResponse,
  PermanentDeleteResponse,
  BulkRestoreResponse,
  BulkPermanentDeleteResponse,
  DeletionInfoResponse,
} from '../types/recycleBin';
import { RecycleBinError, RecycleBinErrorCode } from './errors';

export interface RecycleBinListResponse {
  items: RecycleBinItem[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

/* =============================================================================
   Service
   ============================================================================= */

export class RecycleBinService {
  /**
   * Handle API errors and throw typed RecycleBinError
   */
  private handleError(response: any, operation: string): never {
    const error = response.error;

    // Map backend error codes to our error codes
    let errorCode = RecycleBinErrorCode.UNKNOWN_ERROR;
    if (error?.code) {
      switch (error.code) {
        case 'NOT_FOUND':
        case 'ENTITY_NOT_FOUND':
          errorCode = RecycleBinErrorCode.NOT_FOUND;
          break;
        case 'ACCESS_DENIED':
        case 'WORKSPACE_ACCESS_DENIED':
          errorCode = RecycleBinErrorCode.ACCESS_DENIED;
          break;
        case 'NAME_CONFLICT':
          errorCode = RecycleBinErrorCode.NAME_CONFLICT;
          break;
        case 'PARENT_NOT_FOUND':
          errorCode = RecycleBinErrorCode.PARENT_NOT_FOUND;
          break;
        case 'PARENT_DELETED':
          errorCode = RecycleBinErrorCode.PARENT_DELETED;
          break;
        case 'NOT_DELETED':
          errorCode = RecycleBinErrorCode.NOT_DELETED;
          break;
        case 'DELETION_IN_PROGRESS':
          errorCode = RecycleBinErrorCode.DELETION_IN_PROGRESS;
          break;
        default:
          errorCode = RecycleBinErrorCode.UNKNOWN_ERROR;
      }
    } else if (!response.error) {
      // Network error
      errorCode = RecycleBinErrorCode.NETWORK_ERROR;
    }

    throw new RecycleBinError(
      error?.message || `Failed to ${operation}`,
      errorCode,
      response.status || 500,
      error
    );
  }

  /**
   * List items in recycle bin
   */
  async listItems(
    workspaceId: string,
    options?: {
      type?: 'gallery' | 'photo' | 'all';
      page?: number;
      limit?: number;
    }
  ): Promise<RecycleBinListResponse> {
    const params = new URLSearchParams();
    if (options?.type && options.type !== 'all') {
      params.append('type', options.type);
    }
    if (options?.page) params.append('page', options.page.toString());
    if (options?.limit) params.append('limit', options.limit.toString());

    const query = params.toString();
    const endpoint = `/api/v1/workspaces/${workspaceId}/recycle-bin${query ? `?${query}` : ''}`;

    const response = await apiClient.get<RecycleBinApiResponse>(endpoint);
    if (response.error) {
      this.handleError(response, 'fetch recycle bin');
    }

    const apiResponse = response.data!;

    // Backend now returns camelCase fields matching RecycleBinItem interface directly
    // but checks are needed if we want to ensure any transformations
    return {
      items: apiResponse.items,
      total: apiResponse.meta.total,
      page: apiResponse.meta.page,
      limit: apiResponse.meta.limit,
      has_more: apiResponse.meta.page < apiResponse.meta.total_pages,
    };
  }

  /**
   * Restore a single item
   */
  async restoreItem(
    workspaceId: string,
    itemId: string,
    itemType: 'gallery' | 'photo'
  ): Promise<{ message: string; restored_id: string; new_name?: string }> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/recycle-bin/restore`;
    const response = await apiClient.post<RestoreResponse>(endpoint, {
      item_id: itemId,
      item_type: itemType,
    });
    if (response.error) {
      this.handleError(response, 'restore item');
    }
    return {
      message: response.data!.message,
      restored_id: response.data!.entity_id,
      new_name: response.data!.new_name,
    };
  }

  /**
   * Permanently delete a single item
   */
  async permanentDeleteItem(
    workspaceId: string,
    itemId: string,
    itemType: 'gallery' | 'photo'
  ): Promise<{ message: string; deleted_id: string; storage_freed_bytes: number }> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/recycle-bin/permanent`;
    const response = await apiClient.delete<PermanentDeleteResponse>(endpoint, {
      item_id: itemId,
      item_type: itemType,
    });
    if (response.error) {
      this.handleError(response, 'permanently delete item');
    }
    return {
      message: response.data!.message,
      deleted_id: itemId,
      storage_freed_bytes: response.data!.storage_freed,
    };
  }

  /**
   * Bulk restore items
   */
  async bulkRestore(
    workspaceId: string,
    items: Array<{ id: string; type: 'gallery' | 'photo' }>
  ): Promise<{
    message: string;
    success_count: number;
    failure_count: number;
    results: Array<{ id: string; success: boolean; error?: string }>;
  }> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/recycle-bin/bulk-restore`;
    const response = await apiClient.post<BulkRestoreResponse>(endpoint, {
      items: items.map((item) => ({
        item_id: item.id,
        item_type: item.type,
      })),
    });
    if (response.error) {
      this.handleError(response, 'restore items');
    }
    return {
      message: response.data!.success ? 'Items restored successfully' : 'Some items failed to restore',
      success_count: response.data!.success_count,
      failure_count: response.data!.failure_count,
      results: response.data!.results.map((r) => ({
        id: r.item_id,
        success: r.success,
        error: r.error,
      })),
    };
  }

  /**
   * Bulk permanent delete items
   */
  async bulkPermanentDelete(
    workspaceId: string,
    items: Array<{ id: string; type: 'gallery' | 'photo' }>
  ): Promise<{
    message: string;
    success_count: number;
    failure_count: number;
    storage_freed_bytes: number;
    results: Array<{ id: string; success: boolean; error?: string }>;
  }> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/recycle-bin/bulk-permanent-delete`;
    const response = await apiClient.post<BulkPermanentDeleteResponse>(endpoint, {
      items: items.map((item) => ({
        item_id: item.id,
        item_type: item.type,
      })),
    });
    if (response.error) {
      this.handleError(response, 'permanently delete items');
    }
    return {
      message: response.data!.success ? 'Items deleted successfully' : 'Some items failed to delete',
      success_count: response.data!.success_count,
      failure_count: response.data!.failure_count,
      storage_freed_bytes: response.data!.total_storage_freed || 0,
      results: response.data!.results.map((r) => ({
        id: r.item_id,
        success: r.success,
        error: r.error,
      })),
    };
  }

  /**
   * Get deletion info for an item
   */
  async getDeletionInfo(
    workspaceId: string,
    itemId: string,
    itemType: 'gallery' | 'photo'
  ): Promise<DeletionInfoResponse> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/recycle-bin/deletion-info/${itemType}/${itemId}`;
    const response = await apiClient.get<DeletionInfoResponse>(endpoint);
    if (response.error) {
      this.handleError(response, 'get deletion info');
    }
    return response.data!;
  }
}

// Export singleton instance
export const recycleBinService = new RecycleBinService();
export default recycleBinService;
