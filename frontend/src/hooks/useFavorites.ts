/**
 * useFavorites Hook
 *
 * Manages client favorites state for public galleries.
 * Handles toggling, listing, and syncing favorites with the backend.
 * Supports infinite scroll pagination for large favorites lists.
 *
 * Feature: 012-client-favorites
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { favoritesService } from '../services/favoritesService';
import type {
  FavoriteItem,
  FavoriteList,
  ToggleFavoriteResponse,
} from '../services/favoritesService';

export interface UseFavoritesOptions {
  /** Gallery ID to fetch favorites for */
  galleryId: string;
  /** Whether to enable the hook (default: true) */
  enabled?: boolean;
  /** Page size for infinite scroll (default: 50) */
  pageSize?: number;
}

export interface UseFavoritesReturn {
  /** Set of favorited asset IDs for quick lookup */
  favoriteIds: Set<string>;
  /** List of favorite items with full data */
  favorites: FavoriteItem[];
  /** List of favorite lists */
  lists: FavoriteList[];
  /** Total count of favorites */
  totalFavorites: number;
  /** Whether initial data is loading */
  isLoading: boolean;
  /** Whether fetching next page */
  isFetchingNextPage: boolean;
  /** Whether there are more pages to load */
  hasNextPage: boolean;
  /** Whether an operation is in progress */
  isMutating: boolean;
  /** Error if any */
  error: Error | null;
  /** Toggle favorite status for an asset */
  toggleFavorite: (assetId: string, favorited: boolean, listId?: string) => Promise<ToggleFavoriteResponse>;
  /** Check if an asset is favorited */
  isFavorited: (assetId: string) => boolean;
  /** Refresh favorites data */
  refresh: () => void;
  /** Load more favorites (infinite scroll) */
  loadMore: () => void;
  /** Ref for intersection observer (attach to sentinel element) */
  sentinelRef: React.RefObject<HTMLDivElement>;
}

export function useFavorites({
  galleryId,
  enabled = true,
  pageSize = 50,
}: UseFavoritesOptions): UseFavoritesReturn {
  // State for favorites data
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [lists, setLists] = useState<FavoriteList[]>([]);
  const [totalFavorites, setTotalFavorites] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Loading and error states
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingNextPage, setIsFetchingNextPage] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Refs
  const sentinelRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasLoadedRef = useRef(false);

  // Build favoriteIds set for quick lookup
  const favoriteIds = useMemo(() => {
    return new Set(favorites.map((item) => item.asset_id));
  }, [favorites]);

  // Computed hasNextPage
  const hasNextPage = currentPage < totalPages;

  // Fetch favorites for a specific page
  const fetchFavorites = useCallback(
    async (page: number, append: boolean = false) => {
      if (!galleryId) return;

      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
        if (page === 1) {
          setIsLoading(true);
        } else {
          setIsFetchingNextPage(true);
        }
        setError(null);

        const response = await favoritesService.getFavorites(galleryId, {
          page,
          limit: pageSize,
        });

        if (append) {
          setFavorites((prev) => [...prev, ...response.data]);
        } else {
          setFavorites(response.data);
        }

        setCurrentPage(page);
        setTotalPages(response.meta.total_pages);

        // Update total from meta if not from lists
        if (!append) {
          setTotalFavorites(response.meta.total);
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(err);
        }
      } finally {
        setIsLoading(false);
        setIsFetchingNextPage(false);
      }
    },
    [galleryId, pageSize]
  );

  // Fetch favorite lists
  const fetchLists = useCallback(async () => {
    if (!galleryId) return;

    try {
      const response = await favoritesService.getLists(galleryId);
      setLists(response.lists);
      setTotalFavorites(response.total_favorites);
    } catch (err) {
      // Lists are optional, don't set error
      console.error('Failed to fetch favorite lists:', err);
    }
  }, [galleryId]);

  // Initial fetch when enabled
  useEffect(() => {
    if (enabled && galleryId && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      fetchFavorites(1);
      fetchLists();
    }

    // Reset when gallery changes
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [enabled, galleryId, fetchFavorites, fetchLists]);

  // Reset when gallery changes
  useEffect(() => {
    hasLoadedRef.current = false;
    setFavorites([]);
    setLists([]);
    setCurrentPage(1);
    setTotalPages(1);
    setTotalFavorites(0);
    setError(null);
  }, [galleryId]);

  // Toggle favorite handler
  const toggleFavorite = useCallback(
    async (assetId: string, favorited: boolean, listId?: string) => {
      setIsMutating(true);

      // Optimistic update
      if (favorited) {
        // Can't do full optimistic add without asset data
        setTotalFavorites((prev) => prev + 1);
      } else {
        // Remove from list optimistically
        setFavorites((prev) => prev.filter((item) => item.asset_id !== assetId));
        setTotalFavorites((prev) => Math.max(0, prev - 1));
      }

      try {
        const response = await favoritesService.toggleFavorite(galleryId, {
          asset_id: assetId,
          favorited,
          list_id: listId,
        });

        // Refresh data to get accurate state
        await fetchFavorites(1);
        await fetchLists();

        return response;
      } catch (err) {
        // Rollback on error
        if (favorited) {
          setTotalFavorites((prev) => prev - 1);
        } else {
          // Refetch to restore
          await fetchFavorites(1);
        }
        throw err;
      } finally {
        setIsMutating(false);
      }
    },
    [galleryId, fetchFavorites, fetchLists]
  );

  // Check if favorited
  const isFavorited = useCallback(
    (assetId: string) => favoriteIds.has(assetId),
    [favoriteIds]
  );

  // Refresh handler - reset to first page
  const refresh = useCallback(() => {
    hasLoadedRef.current = false;
    setCurrentPage(1);
    fetchFavorites(1);
    fetchLists();
  }, [fetchFavorites, fetchLists]);

  // Load more handler for infinite scroll
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isLoading) {
      fetchFavorites(currentPage + 1, true);
    }
  }, [hasNextPage, isFetchingNextPage, isLoading, currentPage, fetchFavorites]);

  return {
    favoriteIds,
    favorites,
    lists,
    totalFavorites,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    isMutating,
    error,
    toggleFavorite,
    isFavorited,
    refresh,
    loadMore,
    sentinelRef,
  };
}

export default useFavorites;
