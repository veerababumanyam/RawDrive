/**
 * useFavoriteLists Hook Tests
 *
 * Unit tests for the favorite lists management hook.
 * Tests CRUD operations for lists with optimistic updates.
 *
 * Feature: 012-client-favorites
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useFavoriteLists } from '../useFavoriteLists';
import { favoritesService } from '../../services/favoritesService';

// Mock the favorites service
vi.mock('../../services/favoritesService', () => ({
  favoritesService: {
    getLists: vi.fn(),
    createList: vi.fn(),
    updateList: vi.fn(),
    deleteList: vi.fn(),
    moveToList: vi.fn(),
  },
}));

// Helper to create a mock list
const createMockList = (
  id: string,
  name: string,
  isDefault = false,
  photoCount = 5
) => ({
  list_id: id,
  workspace_id: 'workspace-1',
  gallery_id: 'gallery-1',
  client_token: 'client-token-123',
  name,
  is_default: isDefault,
  sort_order: 0,
  photo_count: photoCount,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

describe('useFavoriteLists Hook', () => {
  const mockGalleryId = 'gallery-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should return empty state when disabled', async () => {
      const { result } = renderHook(() =>
        useFavoriteLists({ galleryId: mockGalleryId, enabled: false })
      );

      expect(result.current.lists).toEqual([]);
      expect(result.current.totalFavorites).toBe(0);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should fetch lists on mount when enabled', async () => {
      const mockLists = [
        createMockList('list-1', 'My Favorites', true, 10),
        createMockList('list-2', 'Best Shots', false, 5),
      ];

      vi.mocked(favoritesService.getLists).mockResolvedValue({
        lists: mockLists,
        total_favorites: 15,
      });

      const { result } = renderHook(() =>
        useFavoriteLists({ galleryId: mockGalleryId })
      );

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.lists).toHaveLength(2);
      expect(result.current.totalFavorites).toBe(15);
      expect(result.current.defaultList?.name).toBe('My Favorites');
    });
  });

  describe('createList', () => {
    it('should create a new list and add to state', async () => {
      const initialLists = [createMockList('default', 'My Favorites', true, 5)];
      const newList = createMockList('new-list', 'Wedding Picks', false, 0);

      vi.mocked(favoritesService.getLists).mockResolvedValue({
        lists: initialLists,
        total_favorites: 5,
      });

      vi.mocked(favoritesService.createList).mockResolvedValue(newList);

      const { result } = renderHook(() =>
        useFavoriteLists({ galleryId: mockGalleryId })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.lists).toHaveLength(1);

      await act(async () => {
        await result.current.createList('Wedding Picks');
      });

      expect(favoritesService.createList).toHaveBeenCalledWith(mockGalleryId, {
        name: 'Wedding Picks',
      });

      expect(result.current.lists).toHaveLength(2);
      expect(result.current.lists[1].name).toBe('Wedding Picks');
    });

    it('should throw error when creation fails', async () => {
      vi.mocked(favoritesService.getLists).mockResolvedValue({
        lists: [],
        total_favorites: 0,
      });

      vi.mocked(favoritesService.createList).mockRejectedValue(
        new Error('Creation failed')
      );

      const { result } = renderHook(() =>
        useFavoriteLists({ galleryId: mockGalleryId })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let thrownError: Error | null = null;
      await act(async () => {
        try {
          await result.current.createList('New List');
        } catch (err) {
          thrownError = err as Error;
        }
      });

      expect(thrownError).toBeTruthy();
      expect(thrownError?.message).toBe('Creation failed');
      // Error state should be set before re-throwing
      expect(result.current.error?.message).toBe('Creation failed');
    });
  });

  describe('updateList', () => {
    it('should update list with optimistic update', async () => {
      const mockLists = [
        createMockList('list-1', 'Old Name', false, 5),
      ];

      vi.mocked(favoritesService.getLists).mockResolvedValue({
        lists: mockLists,
        total_favorites: 5,
      });

      vi.mocked(favoritesService.updateList).mockResolvedValue({
        ...mockLists[0],
        name: 'New Name',
      });

      const { result } = renderHook(() =>
        useFavoriteLists({ galleryId: mockGalleryId })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Start the update
      act(() => {
        result.current.updateList('list-1', { name: 'New Name' });
      });

      // Optimistic update should be applied immediately
      expect(result.current.lists[0].name).toBe('New Name');

      // Wait for the API call to complete
      await waitFor(() => {
        expect(result.current.isMutating).toBe(false);
      });

      expect(favoritesService.updateList).toHaveBeenCalledWith(
        mockGalleryId,
        'list-1',
        { name: 'New Name' }
      );
    });

    it('should rollback on update failure', async () => {
      const mockLists = [createMockList('list-1', 'Original Name', false, 5)];

      vi.mocked(favoritesService.getLists).mockResolvedValue({
        lists: mockLists,
        total_favorites: 5,
      });

      vi.mocked(favoritesService.updateList).mockRejectedValue(
        new Error('Update failed')
      );

      const { result } = renderHook(() =>
        useFavoriteLists({ galleryId: mockGalleryId })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let thrownError: Error | null = null;
      await act(async () => {
        try {
          await result.current.updateList('list-1', { name: 'New Name' });
        } catch (err) {
          thrownError = err as Error;
        }
      });

      expect(thrownError?.message).toBe('Update failed');
      // Should rollback to original name
      expect(result.current.lists[0].name).toBe('Original Name');
      expect(result.current.error?.message).toBe('Update failed');
    });
  });

  describe('deleteList', () => {
    it('should delete list and adjust default list count', async () => {
      const mockLists = [
        createMockList('default', 'My Favorites', true, 5),
        createMockList('list-to-delete', 'Wedding Picks', false, 3),
      ];

      vi.mocked(favoritesService.getLists).mockResolvedValue({
        lists: mockLists,
        total_favorites: 8,
      });

      vi.mocked(favoritesService.deleteList).mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useFavoriteLists({ galleryId: mockGalleryId })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.lists).toHaveLength(2);

      await act(async () => {
        await result.current.deleteList('list-to-delete');
      });

      expect(favoritesService.deleteList).toHaveBeenCalledWith(
        mockGalleryId,
        'list-to-delete'
      );

      // List should be removed
      expect(result.current.lists).toHaveLength(1);

      // Default list count should be increased by deleted list's photo count
      expect(result.current.lists[0].photo_count).toBe(8);
    });

    it('should rollback on delete failure', async () => {
      const mockLists = [
        createMockList('default', 'My Favorites', true, 5),
        createMockList('list-1', 'Best Shots', false, 3),
      ];

      vi.mocked(favoritesService.getLists).mockResolvedValue({
        lists: mockLists,
        total_favorites: 8,
      });

      vi.mocked(favoritesService.deleteList).mockRejectedValue(
        new Error('Delete failed')
      );

      const { result } = renderHook(() =>
        useFavoriteLists({ galleryId: mockGalleryId })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let thrownError: Error | null = null;
      await act(async () => {
        try {
          await result.current.deleteList('list-1');
        } catch (err) {
          thrownError = err as Error;
        }
      });

      expect(thrownError?.message).toBe('Delete failed');
      // Should rollback - list still present
      expect(result.current.lists).toHaveLength(2);
      expect(result.current.lists.find((l) => l.list_id === 'list-1')).toBeTruthy();
    });

    it('should throw error when deleting non-existent list', async () => {
      vi.mocked(favoritesService.getLists).mockResolvedValue({
        lists: [createMockList('default', 'My Favorites', true, 5)],
        total_favorites: 5,
      });

      const { result } = renderHook(() =>
        useFavoriteLists({ galleryId: mockGalleryId })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let thrownError: Error | null = null;
      await act(async () => {
        try {
          await result.current.deleteList('non-existent');
        } catch (err) {
          thrownError = err as Error;
        }
      });

      expect(thrownError?.message).toBe('List not found');
    });
  });

  describe('movePhotoToList', () => {
    it('should move photo between lists with optimistic update', async () => {
      const mockLists = [
        createMockList('list-1', 'Source List', false, 10),
        createMockList('list-2', 'Target List', false, 5),
      ];

      vi.mocked(favoritesService.getLists).mockResolvedValue({
        lists: mockLists,
        total_favorites: 15,
      });

      vi.mocked(favoritesService.moveToList).mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useFavoriteLists({ galleryId: mockGalleryId })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.movePhotoToList('list-1', 'asset-123', 'list-2');
      });

      expect(favoritesService.moveToList).toHaveBeenCalledWith(
        mockGalleryId,
        'list-1',
        'asset-123',
        'list-2'
      );

      // Source list should have one less photo
      expect(result.current.lists.find((l) => l.list_id === 'list-1')?.photo_count).toBe(9);

      // Target list should have one more photo
      expect(result.current.lists.find((l) => l.list_id === 'list-2')?.photo_count).toBe(6);
    });

    it('should rollback on move failure', async () => {
      const mockLists = [
        createMockList('list-1', 'Source', false, 10),
        createMockList('list-2', 'Target', false, 5),
      ];

      vi.mocked(favoritesService.getLists).mockResolvedValue({
        lists: mockLists,
        total_favorites: 15,
      });

      vi.mocked(favoritesService.moveToList).mockRejectedValue(
        new Error('Move failed')
      );

      const { result } = renderHook(() =>
        useFavoriteLists({ galleryId: mockGalleryId })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let thrownError: Error | null = null;
      await act(async () => {
        try {
          await result.current.movePhotoToList('list-1', 'asset-123', 'list-2');
        } catch (err) {
          thrownError = err as Error;
        }
      });

      expect(thrownError?.message).toBe('Move failed');
      // Counts should be rolled back
      expect(result.current.lists.find((l) => l.list_id === 'list-1')?.photo_count).toBe(10);
      expect(result.current.lists.find((l) => l.list_id === 'list-2')?.photo_count).toBe(5);
    });
  });

  describe('refresh', () => {
    it('should refetch lists when called', async () => {
      vi.mocked(favoritesService.getLists).mockResolvedValue({
        lists: [createMockList('list-1', 'Initial', true, 5)],
        total_favorites: 5,
      });

      const { result } = renderHook(() =>
        useFavoriteLists({ galleryId: mockGalleryId })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Clear mock and set new data
      vi.clearAllMocks();
      vi.mocked(favoritesService.getLists).mockResolvedValue({
        lists: [
          createMockList('list-1', 'Initial', true, 5),
          createMockList('list-2', 'New List', false, 3),
        ],
        total_favorites: 8,
      });

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.lists).toHaveLength(2);
      });

      expect(favoritesService.getLists).toHaveBeenCalledTimes(1);
    });
  });

  describe('defaultList', () => {
    it('should return the default list', async () => {
      const mockLists = [
        createMockList('list-1', 'Custom List', false, 3),
        createMockList('default', 'My Favorites', true, 10),
        createMockList('list-2', 'Another List', false, 2),
      ];

      vi.mocked(favoritesService.getLists).mockResolvedValue({
        lists: mockLists,
        total_favorites: 15,
      });

      const { result } = renderHook(() =>
        useFavoriteLists({ galleryId: mockGalleryId })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.defaultList).toBeTruthy();
      expect(result.current.defaultList?.list_id).toBe('default');
      expect(result.current.defaultList?.is_default).toBe(true);
    });

    it('should return null when no lists', async () => {
      vi.mocked(favoritesService.getLists).mockResolvedValue({
        lists: [],
        total_favorites: 0,
      });

      const { result } = renderHook(() =>
        useFavoriteLists({ galleryId: mockGalleryId })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.defaultList).toBeNull();
    });
  });

  describe('Gallery Change', () => {
    it('should reset state when gallery changes', async () => {
      const mockLists = [createMockList('list-1', 'My Favorites', true, 5)];

      vi.mocked(favoritesService.getLists).mockResolvedValue({
        lists: mockLists,
        total_favorites: 5,
      });

      const { result, rerender } = renderHook(
        ({ galleryId }) => useFavoriteLists({ galleryId }),
        { initialProps: { galleryId: 'gallery-1' } }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.lists).toHaveLength(1);

      // Change gallery
      rerender({ galleryId: 'gallery-2' });

      // State should be reset
      expect(result.current.lists).toEqual([]);
      expect(result.current.totalFavorites).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should set error when fetch fails', async () => {
      vi.mocked(favoritesService.getLists).mockRejectedValue(
        new Error('Network error')
      );

      const { result } = renderHook(() =>
        useFavoriteLists({ galleryId: mockGalleryId })
      );

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });

      expect(result.current.error?.message).toBe('Network error');
      expect(result.current.isLoading).toBe(false);
    });
  });
});
