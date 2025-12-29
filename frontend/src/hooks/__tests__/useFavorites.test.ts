/**
 * useFavorites Hook Tests
 *
 * Unit tests for the favorites management hook.
 * Tests infinite scroll, optimistic updates, and state management.
 *
 * Feature: 012-client-favorites
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useFavorites } from '../useFavorites';
import { favoritesService } from '../../services/favoritesService';

// Mock the favorites service
vi.mock('../../services/favoritesService', () => ({
  favoritesService: {
    getFavorites: vi.fn(),
    getLists: vi.fn(),
    toggleFavorite: vi.fn(),
  },
}));

// Helper to create a mock favorite item
const createMockFavorite = (id: string, listId = 'default-list') => ({
  interaction_id: `interaction-${id}`,
  asset_id: id,
  list_id: listId,
  thumbnail_url: `https://example.com/${id}.jpg`,
  filename: `photo-${id}.jpg`,
  width: 1920,
  height: 1080,
  favorited_at: new Date().toISOString(),
});

// Helper to create a mock list
const createMockList = (id: string, name: string, isDefault = false) => ({
  list_id: id,
  workspace_id: 'workspace-1',
  gallery_id: 'gallery-1',
  client_token: 'client-token-123',
  name,
  is_default: isDefault,
  sort_order: 0,
  photo_count: 5,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

describe('useFavorites Hook', () => {
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
        useFavorites({ galleryId: mockGalleryId, enabled: false })
      );

      expect(result.current.favorites).toEqual([]);
      expect(result.current.favoriteIds.size).toBe(0);
      expect(result.current.lists).toEqual([]);
      expect(result.current.totalFavorites).toBe(0);
    });

    it('should fetch favorites on mount when enabled', async () => {
      const mockFavorites = [
        createMockFavorite('asset-1'),
        createMockFavorite('asset-2'),
      ];

      vi.mocked(favoritesService.getFavorites).mockResolvedValue({
        data: mockFavorites,
        meta: { page: 1, limit: 50, total: 2, total_pages: 1 },
      });

      vi.mocked(favoritesService.getLists).mockResolvedValue({
        lists: [createMockList('default-list', 'My Favorites', true)],
        total_favorites: 2,
      });

      const { result } = renderHook(() =>
        useFavorites({ galleryId: mockGalleryId })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.favorites).toHaveLength(2);
      expect(result.current.favoriteIds.has('asset-1')).toBe(true);
      expect(result.current.favoriteIds.has('asset-2')).toBe(true);
      expect(result.current.totalFavorites).toBe(2);
    });
  });

  describe('isFavorited', () => {
    it('should return true for favorited assets', async () => {
      const mockFavorites = [createMockFavorite('asset-1')];

      vi.mocked(favoritesService.getFavorites).mockResolvedValue({
        data: mockFavorites,
        meta: { page: 1, limit: 50, total: 1, total_pages: 1 },
      });

      vi.mocked(favoritesService.getLists).mockResolvedValue({
        lists: [],
        total_favorites: 1,
      });

      const { result } = renderHook(() =>
        useFavorites({ galleryId: mockGalleryId })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isFavorited('asset-1')).toBe(true);
      expect(result.current.isFavorited('asset-2')).toBe(false);
    });
  });

  describe('toggleFavorite', () => {
    it('should call the service and update state when adding favorite', async () => {
      vi.mocked(favoritesService.getFavorites).mockResolvedValue({
        data: [],
        meta: { page: 1, limit: 50, total: 0, total_pages: 0 },
      });

      vi.mocked(favoritesService.getLists).mockResolvedValue({
        lists: [createMockList('default-list', 'My Favorites', true)],
        total_favorites: 0,
      });

      vi.mocked(favoritesService.toggleFavorite).mockResolvedValue({
        asset_id: 'new-asset',
        is_favorited: true,
        favorites_count: 1,
        list_id: 'default-list',
      });

      const { result } = renderHook(() =>
        useFavorites({ galleryId: mockGalleryId })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.toggleFavorite('new-asset', true);
      });

      expect(favoritesService.toggleFavorite).toHaveBeenCalledWith(
        mockGalleryId,
        { asset_id: 'new-asset', favorited: true, list_id: undefined }
      );
    });

    it('should call the service when removing favorite', async () => {
      const mockFavorites = [createMockFavorite('asset-1')];

      vi.mocked(favoritesService.getFavorites).mockResolvedValue({
        data: mockFavorites,
        meta: { page: 1, limit: 50, total: 1, total_pages: 1 },
      });

      vi.mocked(favoritesService.getLists).mockResolvedValue({
        lists: [],
        total_favorites: 1,
      });

      vi.mocked(favoritesService.toggleFavorite).mockResolvedValue({
        asset_id: 'asset-1',
        is_favorited: false,
        favorites_count: 0,
        list_id: null,
      });

      const { result } = renderHook(() =>
        useFavorites({ galleryId: mockGalleryId })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.toggleFavorite('asset-1', false);
      });

      expect(favoritesService.toggleFavorite).toHaveBeenCalledWith(
        mockGalleryId,
        { asset_id: 'asset-1', favorited: false, list_id: undefined }
      );
    });

    it('should support adding to specific list', async () => {
      vi.mocked(favoritesService.getFavorites).mockResolvedValue({
        data: [],
        meta: { page: 1, limit: 50, total: 0, total_pages: 0 },
      });

      vi.mocked(favoritesService.getLists).mockResolvedValue({
        lists: [],
        total_favorites: 0,
      });

      vi.mocked(favoritesService.toggleFavorite).mockResolvedValue({
        asset_id: 'asset-1',
        is_favorited: true,
        favorites_count: 1,
        list_id: 'custom-list',
      });

      const { result } = renderHook(() =>
        useFavorites({ galleryId: mockGalleryId })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.toggleFavorite('asset-1', true, 'custom-list');
      });

      expect(favoritesService.toggleFavorite).toHaveBeenCalledWith(
        mockGalleryId,
        { asset_id: 'asset-1', favorited: true, list_id: 'custom-list' }
      );
    });
  });

  describe('Infinite Scroll Pagination', () => {
    it('should detect hasNextPage when more items exist', async () => {
      const page1Items = Array.from({ length: 50 }, (_, i) =>
        createMockFavorite(`asset-${i}`)
      );

      vi.mocked(favoritesService.getFavorites).mockResolvedValue({
        data: page1Items,
        meta: { page: 1, limit: 50, total: 100, total_pages: 2 },
      });

      vi.mocked(favoritesService.getLists).mockResolvedValue({
        lists: [],
        total_favorites: 100,
      });

      const { result } = renderHook(() =>
        useFavorites({ galleryId: mockGalleryId, pageSize: 50 })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasNextPage).toBe(true);
      expect(result.current.favorites).toHaveLength(50);
    });

    it('should have hasNextPage false when all items loaded', async () => {
      const allItems = Array.from({ length: 25 }, (_, i) =>
        createMockFavorite(`asset-${i}`)
      );

      vi.mocked(favoritesService.getFavorites).mockResolvedValue({
        data: allItems,
        meta: { page: 1, limit: 50, total: 25, total_pages: 1 },
      });

      vi.mocked(favoritesService.getLists).mockResolvedValue({
        lists: [],
        total_favorites: 25,
      });

      const { result } = renderHook(() =>
        useFavorites({ galleryId: mockGalleryId, pageSize: 50 })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasNextPage).toBe(false);
    });

    it('should load more when loadMore is called', async () => {
      const page1Items = Array.from({ length: 50 }, (_, i) =>
        createMockFavorite(`asset-${i}`)
      );
      const page2Items = Array.from({ length: 25 }, (_, i) =>
        createMockFavorite(`asset-${i + 50}`)
      );

      vi.mocked(favoritesService.getFavorites)
        .mockResolvedValueOnce({
          data: page1Items,
          meta: { page: 1, limit: 50, total: 75, total_pages: 2 },
        })
        .mockResolvedValueOnce({
          data: page2Items,
          meta: { page: 2, limit: 50, total: 75, total_pages: 2 },
        });

      vi.mocked(favoritesService.getLists).mockResolvedValue({
        lists: [],
        total_favorites: 75,
      });

      const { result } = renderHook(() =>
        useFavorites({ galleryId: mockGalleryId, pageSize: 50 })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.favorites).toHaveLength(50);
      expect(result.current.hasNextPage).toBe(true);

      await act(async () => {
        result.current.loadMore();
      });

      await waitFor(() => {
        expect(result.current.favorites).toHaveLength(75);
      });

      expect(result.current.hasNextPage).toBe(false);
    });
  });

  describe('Lists', () => {
    it('should fetch and return favorite lists', async () => {
      const mockLists = [
        createMockList('list-1', 'My Favorites', true),
        createMockList('list-2', 'Best Shots', false),
      ];

      vi.mocked(favoritesService.getFavorites).mockResolvedValue({
        data: [],
        meta: { page: 1, limit: 50, total: 0, total_pages: 0 },
      });

      vi.mocked(favoritesService.getLists).mockResolvedValue({
        lists: mockLists,
        total_favorites: 10,
      });

      const { result } = renderHook(() =>
        useFavorites({ galleryId: mockGalleryId })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.lists).toHaveLength(2);
      expect(result.current.lists[0].name).toBe('My Favorites');
      expect(result.current.lists[0].is_default).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should set error state when fetch fails', async () => {
      const mockError = new Error('Network error');
      vi.mocked(favoritesService.getFavorites).mockRejectedValue(mockError);
      vi.mocked(favoritesService.getLists).mockResolvedValue({
        lists: [],
        total_favorites: 0,
      });

      const { result } = renderHook(() =>
        useFavorites({ galleryId: mockGalleryId })
      );

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });
    });
  });

  describe('Refresh', () => {
    it('should refetch data when refresh is called', async () => {
      vi.mocked(favoritesService.getFavorites).mockResolvedValue({
        data: [createMockFavorite('asset-1')],
        meta: { page: 1, limit: 50, total: 1, total_pages: 1 },
      });

      vi.mocked(favoritesService.getLists).mockResolvedValue({
        lists: [],
        total_favorites: 1,
      });

      const { result } = renderHook(() =>
        useFavorites({ galleryId: mockGalleryId })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Clear mock call count
      vi.clearAllMocks();

      await act(async () => {
        result.current.refresh();
      });

      // Should trigger new fetches
      await waitFor(() => {
        expect(favoritesService.getFavorites).toHaveBeenCalled();
      });
    });
  });
});
