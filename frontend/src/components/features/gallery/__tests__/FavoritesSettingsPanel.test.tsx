/**
 * FavoritesSettingsPanel Component Tests
 *
 * Unit tests for the favorites settings panel.
 *
 * Feature: 012-client-favorites (US5)
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FavoritesSettingsPanel } from '../FavoritesSettingsPanel';
import { galleryService } from '../../../../services/galleryService';

// Mock the gallery service
vi.mock('../../../../services/galleryService', () => ({
  galleryService: {
    getFavoritesSettings: vi.fn(),
    updateFavoritesSettings: vi.fn(),
  },
}));

// Mock useToast
vi.mock('../../../ui/Toast', () => ({
  useToast: () => ({
    addToast: vi.fn(),
  }),
}));

const mockSettings = {
  favorites_enabled: true,
  sharing_enabled: true,
  download_enabled: false,
  max_lists_per_client: 5,
  download_resolution: 'web_only',
  download_limit_per_client: 100,
};

describe('FavoritesSettingsPanel', () => {
  const defaultProps = {
    workspaceId: 'workspace-123',
    galleryId: 'gallery-123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Loading State', () => {
    it('should show loading spinner initially', () => {
      vi.mocked(galleryService.getFavoritesSettings).mockImplementation(
        () => new Promise(() => {})
      );

      render(<FavoritesSettingsPanel {...defaultProps} />);

      expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    });
  });

  describe('Settings Display', () => {
    it('should display all settings after loading', async () => {
      vi.mocked(galleryService.getFavoritesSettings).mockResolvedValue(mockSettings);

      render(<FavoritesSettingsPanel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Favorites Settings')).toBeInTheDocument();
      });

      // Check for setting labels
      expect(screen.getByText('Enable Favorites')).toBeInTheDocument();
      expect(screen.getByText('Enable Sharing')).toBeInTheDocument();
      expect(screen.getByText('Enable Downloads')).toBeInTheDocument();
      expect(screen.getByText('Download Resolution')).toBeInTheDocument();
      expect(screen.getByText('Max Lists per Client')).toBeInTheDocument();
      expect(screen.getByText('Download Limit')).toBeInTheDocument();
    });

    it('should display current setting values', async () => {
      vi.mocked(galleryService.getFavoritesSettings).mockResolvedValue(mockSettings);

      render(<FavoritesSettingsPanel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Enable Favorites')).toBeInTheDocument();
      });

      // Check toggle states
      const favoritesToggle = screen.getByLabelText('Enable favorites');
      expect(favoritesToggle).toBeChecked();

      const sharingToggle = screen.getByLabelText('Enable sharing');
      expect(sharingToggle).toBeChecked();

      const downloadToggle = screen.getByLabelText('Enable downloads');
      expect(downloadToggle).not.toBeChecked();
    });
  });

  describe('Toggle Interactions', () => {
    it('should update favorites_enabled when toggle is clicked', async () => {
      vi.mocked(galleryService.getFavoritesSettings).mockResolvedValue(mockSettings);
      vi.mocked(galleryService.updateFavoritesSettings).mockResolvedValue({
        ...mockSettings,
        favorites_enabled: false,
      });

      render(<FavoritesSettingsPanel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Enable Favorites')).toBeInTheDocument();
      });

      const toggle = screen.getByLabelText('Enable favorites');
      fireEvent.click(toggle);

      await waitFor(() => {
        expect(galleryService.updateFavoritesSettings).toHaveBeenCalledWith(
          'workspace-123',
          'gallery-123',
          { favorites_enabled: false }
        );
      });
    });

    it('should update sharing_enabled when toggle is clicked', async () => {
      vi.mocked(galleryService.getFavoritesSettings).mockResolvedValue(mockSettings);
      vi.mocked(galleryService.updateFavoritesSettings).mockResolvedValue({
        ...mockSettings,
        sharing_enabled: false,
      });

      render(<FavoritesSettingsPanel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Enable Sharing')).toBeInTheDocument();
      });

      const toggle = screen.getByLabelText('Enable sharing');
      fireEvent.click(toggle);

      await waitFor(() => {
        expect(galleryService.updateFavoritesSettings).toHaveBeenCalledWith(
          'workspace-123',
          'gallery-123',
          { sharing_enabled: false }
        );
      });
    });

    it('should update download_enabled when toggle is clicked', async () => {
      vi.mocked(galleryService.getFavoritesSettings).mockResolvedValue(mockSettings);
      vi.mocked(galleryService.updateFavoritesSettings).mockResolvedValue({
        ...mockSettings,
        download_enabled: true,
      });

      render(<FavoritesSettingsPanel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Enable Downloads')).toBeInTheDocument();
      });

      const toggle = screen.getByLabelText('Enable downloads');
      fireEvent.click(toggle);

      await waitFor(() => {
        expect(galleryService.updateFavoritesSettings).toHaveBeenCalledWith(
          'workspace-123',
          'gallery-123',
          { download_enabled: true }
        );
      });
    });
  });

  describe('Cascading Disabled States', () => {
    it('should disable dependent settings when favorites is disabled', async () => {
      vi.mocked(galleryService.getFavoritesSettings).mockResolvedValue({
        ...mockSettings,
        favorites_enabled: false,
      });

      render(<FavoritesSettingsPanel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Enable Favorites')).toBeInTheDocument();
      });

      // Sharing and download toggles should be disabled
      const sharingToggle = screen.getByLabelText('Enable sharing');
      expect(sharingToggle).toBeDisabled();

      const downloadToggle = screen.getByLabelText('Enable downloads');
      expect(downloadToggle).toBeDisabled();
    });

    it('should disable download resolution when downloads are disabled', async () => {
      vi.mocked(galleryService.getFavoritesSettings).mockResolvedValue({
        ...mockSettings,
        download_enabled: false,
      });

      render(<FavoritesSettingsPanel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Download Resolution')).toBeInTheDocument();
      });

      const resolutionSelect = screen.getByLabelText('Download resolution');
      expect(resolutionSelect).toBeDisabled();
    });
  });

  describe('Number Inputs', () => {
    it('should update max_lists_per_client when input changes', async () => {
      vi.mocked(galleryService.getFavoritesSettings).mockResolvedValue(mockSettings);
      vi.mocked(galleryService.updateFavoritesSettings).mockResolvedValue({
        ...mockSettings,
        max_lists_per_client: 10,
      });

      render(<FavoritesSettingsPanel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Max Lists per Client')).toBeInTheDocument();
      });

      const input = screen.getByLabelText('Maximum lists per client');
      fireEvent.change(input, { target: { value: '10' } });

      await waitFor(() => {
        expect(galleryService.updateFavoritesSettings).toHaveBeenCalledWith(
          'workspace-123',
          'gallery-123',
          { max_lists_per_client: 10 }
        );
      });
    });

    it('should clamp max_lists_per_client to valid range', async () => {
      vi.mocked(galleryService.getFavoritesSettings).mockResolvedValue(mockSettings);
      vi.mocked(galleryService.updateFavoritesSettings).mockResolvedValue({
        ...mockSettings,
        max_lists_per_client: 20,
      });

      render(<FavoritesSettingsPanel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Max Lists per Client')).toBeInTheDocument();
      });

      const input = screen.getByLabelText('Maximum lists per client');
      // Try to set value above max (20)
      fireEvent.change(input, { target: { value: '50' } });

      await waitFor(() => {
        // Should be clamped to 20
        expect(galleryService.updateFavoritesSettings).toHaveBeenCalledWith(
          'workspace-123',
          'gallery-123',
          { max_lists_per_client: 20 }
        );
      });
    });
  });

  describe('Select Inputs', () => {
    it('should update download_resolution when selection changes', async () => {
      vi.mocked(galleryService.getFavoritesSettings).mockResolvedValue({
        ...mockSettings,
        download_enabled: true,
      });
      vi.mocked(galleryService.updateFavoritesSettings).mockResolvedValue({
        ...mockSettings,
        download_enabled: true,
        download_resolution: 'original_allowed',
      });

      render(<FavoritesSettingsPanel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Download Resolution')).toBeInTheDocument();
      });

      const select = screen.getByLabelText('Download resolution');
      fireEvent.change(select, { target: { value: 'original_allowed' } });

      await waitFor(() => {
        expect(galleryService.updateFavoritesSettings).toHaveBeenCalledWith(
          'workspace-123',
          'gallery-123',
          { download_resolution: 'original_allowed' }
        );
      });
    });
  });

  describe('Error Handling', () => {
    it('should show error state when settings fail to load', async () => {
      vi.mocked(galleryService.getFavoritesSettings).mockRejectedValue(
        new Error('Network error')
      );

      render(<FavoritesSettingsPanel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Unable to load settings')).toBeInTheDocument();
      });

      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });

    it('should retry loading when Try Again is clicked', async () => {
      vi.mocked(galleryService.getFavoritesSettings)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockSettings);

      render(<FavoritesSettingsPanel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Unable to load settings')).toBeInTheDocument();
      });

      const retryButton = screen.getByText('Try Again');
      fireEvent.click(retryButton);

      await waitFor(() => {
        expect(screen.getByText('Favorites Settings')).toBeInTheDocument();
      });
    });

    it('should rollback on update failure', async () => {
      vi.mocked(galleryService.getFavoritesSettings).mockResolvedValue(mockSettings);
      vi.mocked(galleryService.updateFavoritesSettings).mockRejectedValue(
        new Error('Update failed')
      );

      render(<FavoritesSettingsPanel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Enable Favorites')).toBeInTheDocument();
      });

      // Toggle favorites off
      const toggle = screen.getByLabelText('Enable favorites');
      fireEvent.click(toggle);

      // Wait for rollback
      await waitFor(() => {
        // Should remain checked after rollback
        expect(toggle).toBeChecked();
      });
    });
  });

  describe('Callback', () => {
    it('should call onSettingsChange when settings are updated', async () => {
      const onSettingsChange = vi.fn();
      vi.mocked(galleryService.getFavoritesSettings).mockResolvedValue(mockSettings);

      const updatedSettings = { ...mockSettings, favorites_enabled: false };
      vi.mocked(galleryService.updateFavoritesSettings).mockResolvedValue(updatedSettings);

      render(
        <FavoritesSettingsPanel
          {...defaultProps}
          onSettingsChange={onSettingsChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Enable Favorites')).toBeInTheDocument();
      });

      const toggle = screen.getByLabelText('Enable favorites');
      fireEvent.click(toggle);

      await waitFor(() => {
        expect(onSettingsChange).toHaveBeenCalledWith(updatedSettings);
      });
    });
  });
});
