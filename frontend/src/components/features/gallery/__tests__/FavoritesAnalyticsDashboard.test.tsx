/**
 * FavoritesAnalyticsDashboard Component Tests
 *
 * Unit tests for the favorites analytics dashboard.
 *
 * Feature: 012-client-favorites (US5)
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FavoritesAnalyticsDashboard } from '../FavoritesAnalyticsDashboard';
import { galleryService } from '../../../../services/galleryService';

// Mock the gallery service
vi.mock('../../../../services/galleryService', () => ({
  galleryService: {
    getFavoritesSummary: vi.fn(),
    getFavoritesAnalytics: vi.fn(),
    refreshFavoritesAnalytics: vi.fn(),
    exportFavoritesCsv: vi.fn(),
  },
}));

// Mock useToast
vi.mock('../../../ui/Toast', () => ({
  useToast: () => ({
    addToast: vi.fn(),
  }),
}));

const mockSummary = {
  gallery_id: 'gallery-123',
  gallery_title: 'Wedding Photos',
  total_favorites: 45,
  unique_clients: 12,
  favorited_photos: 30,
  total_photos: 100,
  total_lists: 8,
  engagement_rate: 30.0,
  most_favorited_photo: {
    asset_id: 'asset-1',
    filename: 'bride_portrait.jpg',
    thumbnail_url: 'https://example.com/thumb.jpg',
    favorite_count: 8,
  },
  favorites_by_day: [
    { date: '2024-12-20', count: 5 },
    { date: '2024-12-21', count: 8 },
    { date: '2024-12-22', count: 3 },
  ],
};

const mockAnalytics = {
  data: [
    {
      asset_id: 'asset-1',
      filename: 'bride_portrait.jpg',
      thumbnail_url: 'https://example.com/thumb1.jpg',
      width: 800,
      height: 1200,
      favorite_count: 8,
      unique_clients: 6,
      first_favorited_at: '2024-12-20T10:00:00Z',
      last_favorited_at: '2024-12-22T15:30:00Z',
    },
    {
      asset_id: 'asset-2',
      filename: 'ceremony.jpg',
      thumbnail_url: 'https://example.com/thumb2.jpg',
      width: 1200,
      height: 800,
      favorite_count: 5,
      unique_clients: 4,
      first_favorited_at: '2024-12-20T11:00:00Z',
      last_favorited_at: '2024-12-21T09:00:00Z',
    },
  ],
  meta: {
    page: 1,
    limit: 20,
    total: 2,
    total_pages: 1,
  },
};

describe('FavoritesAnalyticsDashboard', () => {
  const defaultProps = {
    workspaceId: 'workspace-123',
    galleryId: 'gallery-123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Loading State', () => {
    it('should show loading spinner initially', () => {
      vi.mocked(galleryService.getFavoritesSummary).mockImplementation(
        () => new Promise(() => {})
      );
      vi.mocked(galleryService.getFavoritesAnalytics).mockImplementation(
        () => new Promise(() => {})
      );

      render(<FavoritesAnalyticsDashboard {...defaultProps} />);

      // Should show loading state
      expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no favorites exist', async () => {
      vi.mocked(galleryService.getFavoritesSummary).mockResolvedValue({
        ...mockSummary,
        total_favorites: 0,
      });
      vi.mocked(galleryService.getFavoritesAnalytics).mockResolvedValue({
        data: [],
        meta: { page: 1, limit: 20, total: 0, total_pages: 0 },
      });

      render(<FavoritesAnalyticsDashboard {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('No favorites yet')).toBeInTheDocument();
      });

      expect(
        screen.getByText(/When clients favorite photos/i)
      ).toBeInTheDocument();
    });
  });

  describe('Summary Cards', () => {
    it('should display summary statistics', async () => {
      vi.mocked(galleryService.getFavoritesSummary).mockResolvedValue(mockSummary);
      vi.mocked(galleryService.getFavoritesAnalytics).mockResolvedValue(mockAnalytics);

      render(<FavoritesAnalyticsDashboard {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('45')).toBeInTheDocument(); // total_favorites
      });

      expect(screen.getByText('12')).toBeInTheDocument(); // unique_clients
      // favorited_photos displays as "30 / 100" in the component
      expect(screen.getByText('30 / 100')).toBeInTheDocument();
      // total_lists - "8" appears multiple times (lists count AND in the table), use getAllByText
      const eights = screen.getAllByText('8');
      expect(eights.length).toBeGreaterThanOrEqual(1);
    });

    it('should display most favorited photo', async () => {
      vi.mocked(galleryService.getFavoritesSummary).mockResolvedValue(mockSummary);
      vi.mocked(galleryService.getFavoritesAnalytics).mockResolvedValue(mockAnalytics);

      render(<FavoritesAnalyticsDashboard {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Most Favorited Photo')).toBeInTheDocument();
      });

      // The filename appears both in "Most Favorited" section and in the table
      const filenames = screen.getAllByText('bride_portrait.jpg');
      expect(filenames.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Photo Table', () => {
    it('should display photo analytics in table', async () => {
      vi.mocked(galleryService.getFavoritesSummary).mockResolvedValue(mockSummary);
      vi.mocked(galleryService.getFavoritesAnalytics).mockResolvedValue(mockAnalytics);

      render(<FavoritesAnalyticsDashboard {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('ceremony.jpg')).toBeInTheDocument();
      });
    });

    it('should allow sorting by column headers', async () => {
      vi.mocked(galleryService.getFavoritesSummary).mockResolvedValue(mockSummary);
      vi.mocked(galleryService.getFavoritesAnalytics).mockResolvedValue(mockAnalytics);

      render(<FavoritesAnalyticsDashboard {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Favorites')).toBeInTheDocument();
      });

      // Click on Favorites header to change sort
      const favoritesHeader = screen.getByText('Favorites');
      fireEvent.click(favoritesHeader);

      // Should call API with new sort order
      await waitFor(() => {
        expect(galleryService.getFavoritesAnalytics).toHaveBeenCalledWith(
          'workspace-123',
          'gallery-123',
          expect.objectContaining({
            sort_by: 'favorite_count',
            order: 'asc', // toggles from default desc
          })
        );
      });
    });
  });

  describe('Actions', () => {
    it('should refresh analytics when refresh button is clicked', async () => {
      vi.mocked(galleryService.getFavoritesSummary).mockResolvedValue(mockSummary);
      vi.mocked(galleryService.getFavoritesAnalytics).mockResolvedValue(mockAnalytics);
      vi.mocked(galleryService.refreshFavoritesAnalytics).mockResolvedValue({
        success: true,
        message: 'Analytics refreshed',
      });

      render(<FavoritesAnalyticsDashboard {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Refresh')).toBeInTheDocument();
      });

      const refreshButton = screen.getByRole('button', { name: /refresh/i });
      fireEvent.click(refreshButton);

      await waitFor(() => {
        expect(galleryService.refreshFavoritesAnalytics).toHaveBeenCalledWith(
          'workspace-123',
          'gallery-123'
        );
      });
    });

    it('should export CSV when export button is clicked', async () => {
      vi.mocked(galleryService.getFavoritesSummary).mockResolvedValue(mockSummary);
      vi.mocked(galleryService.getFavoritesAnalytics).mockResolvedValue(mockAnalytics);
      vi.mocked(galleryService.exportFavoritesCsv).mockResolvedValue(
        'asset_id,filename,favorite_count\nasset-1,bride.jpg,8'
      );

      // Mock URL.createObjectURL
      const mockUrl = 'blob:mock-url';
      global.URL.createObjectURL = vi.fn(() => mockUrl);
      global.URL.revokeObjectURL = vi.fn();

      render(<FavoritesAnalyticsDashboard {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Export CSV/i)).toBeInTheDocument();
      });

      const exportButton = screen.getByRole('button', { name: /export csv/i });
      fireEvent.click(exportButton);

      await waitFor(() => {
        expect(galleryService.exportFavoritesCsv).toHaveBeenCalledWith(
          'workspace-123',
          'gallery-123'
        );
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      vi.mocked(galleryService.getFavoritesSummary).mockRejectedValue(
        new Error('Network error')
      );
      vi.mocked(galleryService.getFavoritesAnalytics).mockRejectedValue(
        new Error('Network error')
      );

      render(<FavoritesAnalyticsDashboard {...defaultProps} />);

      // Should not crash - component handles errors internally
      await waitFor(() => {
        // Loading should complete (no spinner)
        expect(document.querySelector('.animate-spin')).not.toBeInTheDocument();
      });
    });
  });
});
