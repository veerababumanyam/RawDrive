/**
 * useAssetTags Hook
 * Manages asset tags including AI-generated and manual tags
 */

import { useState, useEffect, useCallback } from 'react';
import { apiClient, ApiResponse } from '../services/api';

// Types
export type TagSource = 'manual' | 'ai_vision' | 'ai_gemini' | 'ai_local';

export interface AssetTag {
  tag_id: string;
  name: string;
  type: string;
  color?: string;
  source: TagSource;
  confidence?: number;
  ai_metadata?: Record<string, unknown>;
  created_at?: string;
}

export interface AssetTagsResponse {
  asset_id: string;
  tags: AssetTag[];
  total_count: number;
  manual_count: number;
  ai_count: number;
}

interface UseAssetTagsOptions {
  workspaceId: string;
  assetId?: string;
  source?: 'all' | 'manual' | 'ai';
  autoFetch?: boolean;
}

interface UseAssetTagsReturn {
  tags: AssetTag[];
  manualTags: AssetTag[];
  aiTags: AssetTag[];
  totalCount: number;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  addTag: (name: string) => Promise<void>;
  removeTag: (tagId: string) => Promise<void>;
  isAdding: boolean;
  isRemoving: string | null;
}

// Helper to extract data from API response
function extractData<T>(response: ApiResponse<T>): T {
  if (response.error) {
    throw new Error(response.error.message || 'API request failed');
  }
  if (!response.data) {
    throw new Error('No data in response');
  }
  return response.data;
}

export const useAssetTags = ({
  workspaceId,
  assetId,
  source = 'all',
  autoFetch = true,
}: UseAssetTagsOptions): UseAssetTagsReturn => {
  const [tags, setTags] = useState<AssetTag[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isRemoving, setIsRemoving] = useState<string | null>(null);

  const fetchTags = useCallback(async () => {
    if (!workspaceId || !assetId) {
      setTags([]);
      setTotalCount(0);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (source !== 'all') {
        params.set('source', source);
      }

      const response = await apiClient.get<AssetTagsResponse>(
        `/api/v1/workspaces/${workspaceId}/assets/${assetId}/tags?${params}`
      );
      const result = extractData(response);

      setTags(result.tags);
      setTotalCount(result.total_count);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch tags'));
      setTags([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, assetId, source]);

  useEffect(() => {
    if (autoFetch && assetId) {
      fetchTags();
    }
  }, [autoFetch, assetId, fetchTags]);

  // Add a manual tag
  const addTag = useCallback(
    async (name: string) => {
      if (!workspaceId || !assetId || !name.trim()) return;

      setIsAdding(true);
      setError(null);

      try {
        await apiClient.post(
          `/api/v1/workspaces/${workspaceId}/assets/${assetId}/tags`,
          { name: name.trim() }
        );
        // Refetch to get updated list
        await fetchTags();
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to add tag'));
        throw err;
      } finally {
        setIsAdding(false);
      }
    },
    [workspaceId, assetId, fetchTags]
  );

  // Remove a tag
  const removeTag = useCallback(
    async (tagId: string) => {
      if (!workspaceId || !assetId) return;

      setIsRemoving(tagId);
      setError(null);

      try {
        await apiClient.delete(
          `/api/v1/workspaces/${workspaceId}/assets/${assetId}/tags/${tagId}`
        );
        // Optimistically update local state
        setTags((prev) => prev.filter((t) => t.tag_id !== tagId));
        setTotalCount((prev) => prev - 1);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to remove tag'));
        // Refetch on error to restore state
        await fetchTags();
        throw err;
      } finally {
        setIsRemoving(null);
      }
    },
    [workspaceId, assetId, fetchTags]
  );

  // Computed values
  const manualTags = tags.filter((t) => t.source === 'manual');
  const aiTags = tags.filter((t) => t.source !== 'manual');

  return {
    tags,
    manualTags,
    aiTags,
    totalCount,
    loading,
    error,
    refetch: fetchTags,
    addTag,
    removeTag,
    isAdding,
    isRemoving,
  };
};
