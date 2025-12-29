/**
 * FavoritesPanel Component Tests
 *
 * Tests for the favorites slide-out panel component.
 * Tests rendering, user interactions, and accessibility.
 *
 * Feature: 012-client-favorites
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FavoritesPanel } from '../FavoritesPanel';
import { favoritesService } from '../../../../services/favoritesService';

// Mock the favorites service
vi.mock('../../../../services/favoritesService', () => ({
  favoritesService: {
    getFavorites: vi.fn(),
    getLists: vi.fn(),
    toggleFavorite: vi.fn(),
    createList: vi.fn(),
  },
}));

// Mock IntersectionObserver globally
class MockIntersectionObserver {
  callback: IntersectionObserverCallback;
  options?: IntersectionObserverInit;

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
  }

  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn().mockReturnValue([]);
  root = null;
  rootMargin = '';
  thresholds = [] as number[];
}

// @ts-expect-error - Mocking IntersectionObserver
globalThis.IntersectionObserver = MockIntersectionObserver;

// Helper to create mock favorite items
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

// Helper to create mock list
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

describe('FavoritesPanel', () => {
  const mockGalleryId = 'gallery-123';
  const mockOnClose = vi.fn();
  const mockOnPhotoClick = vi.fn();
  const mockOnDownload = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock responses
    vi.mocked(favoritesService.getFavorites).mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 50, total: 0, total_pages: 0 },
    });

    vi.mocked(favoritesService.getLists).mockResolvedValue({
      lists: [createMockList('default-list', 'My Favorites', true)],
      total_favorites: 0,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('should not render when isOpen is false', () => {
      render(
        <FavoritesPanel
          galleryId={mockGalleryId}
          isOpen={false}
          onClose={mockOnClose}
        />
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should render panel when isOpen is true', async () => {
      render(
        <FavoritesPanel
          galleryId={mockGalleryId}
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
      // Check for header with "My Favorites" text (the h2 element)
      expect(screen.getByRole('heading', { name: /my favorites/i })).toBeInTheDocument();
    });

    it('should display loading skeleton initially', () => {
      render(
        <FavoritesPanel
          galleryId={mockGalleryId}
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      // Loading skeleton divs with animate-pulse
      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('should display empty state when no favorites', async () => {
      render(
        <FavoritesPanel
          galleryId={mockGalleryId}
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('No favorites yet')).toBeInTheDocument();
      });
      expect(
        screen.getByText('Click the heart icon on photos to add them here')
      ).toBeInTheDocument();
    });

    it('should display favorites grid when items exist', async () => {
      const mockFavorites = [
        createMockFavorite('asset-1'),
        createMockFavorite('asset-2'),
        createMockFavorite('asset-3'),
      ];

      vi.mocked(favoritesService.getFavorites).mockResolvedValue({
        data: mockFavorites,
        meta: { page: 1, limit: 50, total: 3, total_pages: 1 },
      });

      vi.mocked(favoritesService.getLists).mockResolvedValue({
        lists: [createMockList('default-list', 'My Favorites', true)],
        total_favorites: 3,
      });

      render(
        <FavoritesPanel
          galleryId={mockGalleryId}
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        const images = screen.getAllByRole('img');
        expect(images).toHaveLength(3);
      });
    });
  });

  describe('Header', () => {
    it('should display total favorites count', async () => {
      vi.mocked(favoritesService.getLists).mockResolvedValue({
        lists: [createMockList('default-list', 'My Favorites', true)],
        total_favorites: 42,
      });

      render(
        <FavoritesPanel
          galleryId={mockGalleryId}
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('(42)')).toBeInTheDocument();
      });
    });

    it('should call onClose when close button clicked', async () => {
      render(
        <FavoritesPanel
          galleryId={mockGalleryId}
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      const closeButton = screen.getByLabelText('Close favorites panel');
      await userEvent.click(closeButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('List Selector', () => {
    it('should show list dropdown when clicked', async () => {
      const mockLists = [
        createMockList('default-list', 'My Favorites', true),
        createMockList('list-2', 'Best Shots', false),
      ];

      vi.mocked(favoritesService.getLists).mockResolvedValue({
        lists: mockLists,
        total_favorites: 10,
      });

      render(
        <FavoritesPanel
          galleryId={mockGalleryId}
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /my favorites/i })).toBeInTheDocument();
      });

      // Click to open dropdown (the button in the list selector area)
      const dropdownButton = screen.getByRole('button', {
        expanded: false,
      });
      await userEvent.click(dropdownButton);

      // Should show both lists plus "All Favorites" option
      expect(screen.getByText('All Favorites')).toBeInTheDocument();
      expect(screen.getByText('Best Shots')).toBeInTheDocument();
    });
  });

  describe('Actions Bar', () => {
    it('should show Download All button when favorites exist', async () => {
      const mockFavorites = [createMockFavorite('asset-1')];

      vi.mocked(favoritesService.getFavorites).mockResolvedValue({
        data: mockFavorites,
        meta: { page: 1, limit: 50, total: 1, total_pages: 1 },
      });

      vi.mocked(favoritesService.getLists).mockResolvedValue({
        lists: [],
        total_favorites: 1,
      });

      render(
        <FavoritesPanel
          galleryId={mockGalleryId}
          isOpen={true}
          onClose={mockOnClose}
          onDownload={mockOnDownload}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Download All')).toBeInTheDocument();
      });
    });

    it('should call onDownload with asset IDs when Download All clicked', async () => {
      const mockFavorites = [
        createMockFavorite('asset-1'),
        createMockFavorite('asset-2'),
      ];

      vi.mocked(favoritesService.getFavorites).mockResolvedValue({
        data: mockFavorites,
        meta: { page: 1, limit: 50, total: 2, total_pages: 1 },
      });

      vi.mocked(favoritesService.getLists).mockResolvedValue({
        lists: [],
        total_favorites: 2,
      });

      render(
        <FavoritesPanel
          galleryId={mockGalleryId}
          isOpen={true}
          onClose={mockOnClose}
          onDownload={mockOnDownload}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Download All')).toBeInTheDocument();
      });

      await userEvent.click(screen.getByText('Download All'));

      expect(mockOnDownload).toHaveBeenCalledWith(['asset-1', 'asset-2']);
    });
  });

  describe('Photo Interactions', () => {
    it('should call onPhotoClick when photo is clicked', async () => {
      const mockFavorites = [createMockFavorite('asset-1')];

      vi.mocked(favoritesService.getFavorites).mockResolvedValue({
        data: mockFavorites,
        meta: { page: 1, limit: 50, total: 1, total_pages: 1 },
      });

      vi.mocked(favoritesService.getLists).mockResolvedValue({
        lists: [],
        total_favorites: 1,
      });

      render(
        <FavoritesPanel
          galleryId={mockGalleryId}
          isOpen={true}
          onClose={mockOnClose}
          onPhotoClick={mockOnPhotoClick}
        />
      );

      await waitFor(() => {
        expect(screen.getByRole('img')).toBeInTheDocument();
      });

      // Click the photo container
      const photoContainer = screen.getByRole('img').closest('div');
      if (photoContainer) {
        await userEvent.click(photoContainer);
      }

      expect(mockOnPhotoClick).toHaveBeenCalledWith('asset-1');
    });
  });

  describe('Accessibility', () => {
    it('should have proper dialog role and aria attributes', async () => {
      render(
        <FavoritesPanel
          galleryId={mockGalleryId}
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-label', 'Favorites Panel');
    });

    it('should have accessible close button', async () => {
      render(
        <FavoritesPanel
          galleryId={mockGalleryId}
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      const closeButton = await screen.findByLabelText('Close favorites panel');
      expect(closeButton).toBeInTheDocument();
    });

    it('should have accessible remove buttons on favorites', async () => {
      const mockFavorites = [createMockFavorite('asset-1')];

      vi.mocked(favoritesService.getFavorites).mockResolvedValue({
        data: mockFavorites,
        meta: { page: 1, limit: 50, total: 1, total_pages: 1 },
      });

      vi.mocked(favoritesService.getLists).mockResolvedValue({
        lists: [],
        total_favorites: 1,
      });

      render(
        <FavoritesPanel
          galleryId={mockGalleryId}
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByLabelText('Remove from favorites')
        ).toBeInTheDocument();
      });
    });
  });

  describe('Backdrop', () => {
    it('should close panel when backdrop is clicked', async () => {
      render(
        <FavoritesPanel
          galleryId={mockGalleryId}
          isOpen={true}
          onClose={mockOnClose}
        />
      );

      // Click the backdrop (first div with bg-black/50)
      const backdrop = document.querySelector('.bg-black\\/50');
      if (backdrop) {
        await userEvent.click(backdrop);
      }

      expect(mockOnClose).toHaveBeenCalled();
    });
  });
});
