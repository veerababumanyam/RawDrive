/**
 * useGalleryAssets Hook
 * Manages gallery assets (photos/videos) data fetching and state
 */

import { useState, useEffect, useCallback } from 'react';
import { galleryService } from '../services/galleryService';
import type { GalleryAssetsResponse, GalleryAssetItem } from '../types/gallery';

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
}

interface UseGalleryAssetsReturn {
  assets: GalleryAssetItem[];
  meta: GalleryAssetsResponse['meta'] | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  loadMore: () => Promise<void>;
  hasMore: boolean;
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
}: UseGalleryAssetsOptions): UseGalleryAssetsReturn => {
  const [assets, setAssets] = useState<GalleryAssetItem[]>([]);
  const [meta, setMeta] = useState<GalleryAssetsResponse['meta'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [currentPage, setCurrentPage] = useState(page);

  const fetchAssets = useCallback(
    async (pageNum: number = currentPage, append: boolean = false) => {
      setLoading(true);
      setError(null);
      try {
        const response = await galleryService.listGalleryAssets(workspaceId, galleryId, {
          page: pageNum,
          limit,
          sub_gallery_id: subGalleryId || undefined,
          picks_only: picksOnly,
          favorites_only: favoritesOnly,
          selections_only: selectionsOnly,
          search_query: searchQuery || undefined,
        });
        
        if (append) {
          setAssets((prev) => [...prev, ...response.data]);
        } else {
          setAssets(response.data);
        }
        setMeta(response.meta);
        setCurrentPage(pageNum);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch gallery assets'));
        if (!append) {
          setAssets([]);
          setMeta(null);
        }
      } finally {
        setLoading(false);
      }
    },
    [workspaceId, galleryId, subGalleryId, picksOnly, favoritesOnly, selectionsOnly, searchQuery, limit, currentPage]
  );

  useEffect(() => {
    if (autoFetch && galleryId) {
      fetchAssets(1, false);
    }
  }, [autoFetch, galleryId, subGalleryId, picksOnly, favoritesOnly, selectionsOnly, searchQuery, fetchAssets]);

  const refetch = useCallback(async () => {
    await fetchAssets(1, false);
  }, [fetchAssets]);

  const loadMore = useCallback(async () => {
    if (meta?.hasMore && !loading) {
      await fetchAssets(currentPage + 1, true);
    }
  }, [meta?.hasMore, loading, currentPage, fetchAssets]);

  return {
    assets,
    meta,
    loading,
    error,
    refetch,
    loadMore,
    hasMore: meta?.hasMore || false,
  };
};
