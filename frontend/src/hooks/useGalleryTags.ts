/**
 * useGalleryTags Hook
 *
 * Fetches and caches gallery tags for content filtering UI (US4).
 * Tags are loaded from AI analysis results and manual assignments.
 *
 * Feature: 025-ai-filter-simplify
 */

import { useState, useEffect, useCallback } from 'react';
import { aiFilterService } from '../services/aiFilterService';
import type { TagOption, GalleryTagsResponse } from '../types/aiFilter';

export interface UseGalleryTagsOptions {
  workspaceId?: string;
  galleryId?: string;
  /** Filter by tag source: 'all', 'ai', or 'manual' */
  source?: 'all' | 'ai' | 'manual';
  /** Minimum usage count to include a tag */
  minUsage?: number;
  /** Enable automatic fetching */
  enabled?: boolean;
}

export interface UseGalleryTagsReturn {
  tags: TagOption[];
  total: number;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export const useGalleryTags = ({
  workspaceId,
  galleryId,
  source = 'all',
  minUsage = 0,
  enabled = true,
}: UseGalleryTagsOptions): UseGalleryTagsReturn => {
  const [tags, setTags] = useState<TagOption[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchTags = useCallback(async () => {
    if (!workspaceId || !galleryId) {
      setTags([]);
      setTotal(0);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response: GalleryTagsResponse = await aiFilterService.getGalleryTags(
        workspaceId,
        galleryId,
        { source, minUsage }
      );
      setTags(response.tags);
      setTotal(response.total);
    } catch (err) {
      console.error('Failed to fetch gallery tags:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch tags'));
      setTags([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, galleryId, source, minUsage]);

  useEffect(() => {
    if (enabled) {
      fetchTags();
    }
  }, [fetchTags, enabled]);

  return {
    tags,
    total,
    isLoading,
    error,
    refetch: fetchTags,
  };
};
