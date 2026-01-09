/**
 * useGalleryAssets Hook
 * Manages gallery assets (photos/videos) data fetching and state
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { galleryService } from '../services/galleryService';
import { aiFilterService } from '../services/aiFilterService';
import type { GalleryAssetsResponse, GalleryAssetItem } from '../types/gallery';
import type { AIFilterState } from '../types/aiFilter';

interface UseGalleryAssetsOptions {
  workspaceId: string;
  galleryId: string;
  subGalleryId?: string | null;
  picksOnly?: boolean;
  favoritesOnly?: boolean;
  selectionsOnly?: boolean;
  searchQuery?: string;
  page?: number;
  limit?: number;
  autoFetch?: boolean;
  /** Sort by: position (default), favorites, picks, newest, oldest */
  sortBy?: 'position' | 'favorites' | 'picks' | 'newest' | 'oldest';
  /** AI Filters state */
  aiFilters?: AIFilterState;
}

interface UseGalleryAssetsReturn {
  assets: GalleryAssetItem[];
  meta: GalleryAssetsResponse['meta'] | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  loadMore: () => Promise<void>;
  hasMore: boolean;
  updateAsset: (assetId: string, changes: Partial<GalleryAssetItem>) => void;
  /** Current page number (for prefetching) */
  currentPage: number;
  /** Total pages (for prefetching) */
  totalPages: number;
}

export const useGalleryAssets = ({
  workspaceId,
  galleryId,
  subGalleryId,
  picksOnly = false,
  favoritesOnly = false,
  selectionsOnly = false,
  searchQuery = '',
  page = 1,
  limit = 50,
  autoFetch = true,
  sortBy = 'position',
  aiFilters,
}: UseGalleryAssetsOptions): UseGalleryAssetsReturn => {
  const [assets, setAssets] = useState<GalleryAssetItem[]>([]);
  const [meta, setMeta] = useState<GalleryAssetsResponse['meta'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [currentPage, setCurrentPage] = useState(page);

  // Track abort controller to cancel in-flight requests on unmount/re-fetch
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchAssets = useCallback(
    async (pageNum: number = currentPage, append: boolean = false) => {
      // Cancel any previous request
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      setLoading(true);
      setError(null);
      try {
        // Check if AI filters are active
        // Note: 0 means "no filter", not "filter by 0"
        const hasAIFilters = aiFilters && (
          aiFilters.qualityTier !== 'all' ||
          aiFilters.qualityMin !== undefined ||
          aiFilters.blurHide ||
          (aiFilters.minSharpness !== undefined && aiFilters.minSharpness > 0) ||
          (aiFilters.minExposure !== undefined && aiFilters.minExposure > 0) ||
          (aiFilters.minComposition !== undefined && aiFilters.minComposition > 0)
        );

        let assetIds: string[] | undefined;
        let aiMeta: GalleryAssetsResponse['meta'] | undefined;

        if (hasAIFilters) {
          const aiResult = await aiFilterService.getFilteredAssets(workspaceId, galleryId, {
            ...aiFilters,
            page: pageNum,
            limit,
          });

          assetIds = aiResult.assetIds;
          aiMeta = aiResult.meta;

          // If no assets match AI filters, return empty result immediately
          if (assetIds.length === 0) {
            if (!append) {
              setAssets([]);
            }
            setMeta(aiMeta);
            setCurrentPage(pageNum);
            setLoading(false);
            return;
          }
        }

        const response = await galleryService.listGalleryAssets(workspaceId, galleryId, {
          page: pageNum,
          limit,
          // Pass sub_gallery_id correctly:
          // - null → '' (root gallery only, no sub-gallery)
          // - undefined → undefined (all assets, no filter - for aggregate views)
          // - string → specific sub-gallery UUID
          sub_gallery_id: subGalleryId === null ? '' : subGalleryId,
          picks_only: picksOnly,
          favorites_only: favoritesOnly,
          selections_only: selectionsOnly,
          search_query: searchQuery || undefined,
          sort_by: sortBy,
          asset_ids: assetIds,
          signal: abortControllerRef.current.signal,
        });

        if (append) {
          setAssets((prev) => [...prev, ...response.data]);
        } else {
          setAssets(response.data);
        }

        // If using AI filters, use the AI meta for total counts/pagination
        setMeta(hasAIFilters && aiMeta ? aiMeta : response.meta);

        setCurrentPage(pageNum);
        setLoading(false);
      } catch (err) {
        // Ignore AbortError - component unmounted or request was cancelled
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setError(err instanceof Error ? err : new Error('Failed to fetch gallery assets'));
        if (!append) {
          setAssets([]);
          setMeta(null);
        }
        setLoading(false);
      }
    },
    [
      workspaceId,
      galleryId,
      subGalleryId,
      picksOnly,
      favoritesOnly,
      selectionsOnly,
      searchQuery,
      sortBy,
      limit,
      currentPage,
      aiFilters,
    ]
  );

  useEffect(() => {
    if (autoFetch && galleryId) {
      fetchAssets(1, false);
    }

    // Cleanup: abort any in-flight request on unmount
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [autoFetch, galleryId, subGalleryId, picksOnly, favoritesOnly, selectionsOnly, searchQuery, sortBy, fetchAssets]);

  const refetch = useCallback(async () => {
    await fetchAssets(1, false);
  }, [fetchAssets]);

  const loadMore = useCallback(async () => {
    if (meta?.hasMore && !loading) {
      await fetchAssets(currentPage + 1, true);
    }
  }, [meta?.hasMore, loading, currentPage, fetchAssets]);

  const updateAsset = useCallback((assetId: string, changes: Partial<GalleryAssetItem>) => {
    setAssets((prev) =>
      prev.map((item) =>
        item.asset_id === assetId ? { ...item, ...changes } : item
      )
    );
  }, []);

  return {
    assets,
    meta,
    loading,
    error,
    refetch,
    loadMore,
    hasMore: meta?.hasMore ?? false,
    updateAsset,
    currentPage,
    totalPages: meta ? Math.ceil(meta.total / (meta.limit || 1)) : 1,
  };
};
