/**
 * useFavoriteLists Hook
 *
 * Manages favorite lists state for public galleries.
 * Handles list CRUD operations with optimistic updates.
 *
 * Feature: 012-client-favorites
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { favoritesService } from '../services/favoritesService';
import type { FavoriteList } from '../services/favoritesService';

export interface UseFavoriteListsOptions {
  /** Gallery ID */
  galleryId: string;
  /** Whether to enable the hook */
  enabled?: boolean;
}

export interface UseFavoriteListsReturn {
  /** All favorite lists */
  lists: FavoriteList[];
  /** Total favorites across all lists */
  totalFavorites: number;
  /** Whether initial data is loading */
  isLoading: boolean;
  /** Whether a mutation is in progress */
  isMutating: boolean;
  /** Error if any */
  error: Error | null;
  /** Create a new list */
  createList: (name: string) => Promise<FavoriteList>;
  /** Update a list */
  updateList: (listId: string, updates: { name?: string; sort_order?: number }) => Promise<FavoriteList>;
  /** Delete a list */
  deleteList: (listId: string) => Promise<void>;
  /** Move a photo between lists */
  movePhotoToList: (sourceListId: string, assetId: string, targetListId: string) => Promise<void>;
  /** Refresh lists data */
  refresh: () => void;
  /** Get the default list */
  defaultList: FavoriteList | null;
}

export function useFavoriteLists({
  galleryId,
  enabled = true,
}: UseFavoriteListsOptions): UseFavoriteListsReturn {
  // State
  const [lists, setLists] = useState<FavoriteList[]>([]);
  const [totalFavorites, setTotalFavorites] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Refs
  const hasLoadedRef = useRef(false);

  // Fetch lists
  const fetchLists = useCallback(async () => {
    if (!galleryId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await favoritesService.getLists(galleryId);
      setLists(response.lists);
      setTotalFavorites(response.total_favorites);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch lists'));
    } finally {
      setIsLoading(false);
    }
  }, [galleryId]);

  // Initial fetch
  useEffect(() => {
    if (enabled && galleryId && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      fetchLists();
    }
  }, [enabled, galleryId, fetchLists]);

  // Reset on gallery change
  useEffect(() => {
    hasLoadedRef.current = false;
    setLists([]);
    setTotalFavorites(0);
    setError(null);
  }, [galleryId]);

  // Create a new list
  const createList = useCallback(
    async (name: string): Promise<FavoriteList> => {
      setIsMutating(true);
      setError(null);

      try {
        const newList = await favoritesService.createList(galleryId, { name });

        // Add to state
        setLists((prev) => [...prev, newList]);

        return newList;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to create list');
        setError(error);
        throw error;
      } finally {
        setIsMutating(false);
      }
    },
    [galleryId]
  );

  // Update a list
  const updateList = useCallback(
    async (
      listId: string,
      updates: { name?: string; sort_order?: number }
    ): Promise<FavoriteList> => {
      setIsMutating(true);
      setError(null);

      // Optimistic update
      const originalLists = [...lists];
      setLists((prev) =>
        prev.map((list) =>
          list.list_id === listId ? { ...list, ...updates } : list
        )
      );

      try {
        const updatedList = await favoritesService.updateList(galleryId, listId, updates);

        // Update with server response
        setLists((prev) =>
          prev.map((list) => (list.list_id === listId ? updatedList : list))
        );

        return updatedList;
      } catch (err) {
        // Rollback on error
        setLists(originalLists);
        const error = err instanceof Error ? err : new Error('Failed to update list');
        setError(error);
        throw error;
      } finally {
        setIsMutating(false);
      }
    },
    [galleryId, lists]
  );

  // Delete a list
  const deleteList = useCallback(
    async (listId: string): Promise<void> => {
      setIsMutating(true);
      setError(null);

      // Find the list being deleted
      const listToDelete = lists.find((l) => l.list_id === listId);
      if (!listToDelete) {
        throw new Error('List not found');
      }

      // Optimistic update - remove from list and adjust default list count
      const originalLists = [...lists];
      const photosToMove = listToDelete.photo_count;

      setLists((prev) =>
        prev
          .filter((list) => list.list_id !== listId)
          .map((list) =>
            list.is_default
              ? { ...list, photo_count: list.photo_count + photosToMove }
              : list
          )
      );

      try {
        await favoritesService.deleteList(galleryId, listId);
      } catch (err) {
        // Rollback on error
        setLists(originalLists);
        const error = err instanceof Error ? err : new Error('Failed to delete list');
        setError(error);
        throw error;
      } finally {
        setIsMutating(false);
      }
    },
    [galleryId, lists]
  );

  // Move a photo between lists
  const movePhotoToList = useCallback(
    async (
      sourceListId: string,
      assetId: string,
      targetListId: string
    ): Promise<void> => {
      setIsMutating(true);
      setError(null);

      // Optimistic update - adjust photo counts
      const originalLists = [...lists];
      setLists((prev) =>
        prev.map((list) => {
          if (list.list_id === sourceListId) {
            return { ...list, photo_count: Math.max(0, list.photo_count - 1) };
          }
          if (list.list_id === targetListId) {
            return { ...list, photo_count: list.photo_count + 1 };
          }
          return list;
        })
      );

      try {
        await favoritesService.moveToList(galleryId, sourceListId, assetId, targetListId);
      } catch (err) {
        // Rollback on error
        setLists(originalLists);
        const error = err instanceof Error ? err : new Error('Failed to move photo');
        setError(error);
        throw error;
      } finally {
        setIsMutating(false);
      }
    },
    [galleryId, lists]
  );

  // Refresh
  const refresh = useCallback(() => {
    hasLoadedRef.current = false;
    fetchLists();
  }, [fetchLists]);

  // Get default list
  const defaultList = lists.find((l) => l.is_default) || null;

  return {
    lists,
    totalFavorites,
    isLoading,
    isMutating,
    error,
    createList,
    updateList,
    deleteList,
    movePhotoToList,
    refresh,
    defaultList,
  };
}

export default useFavoriteLists;
