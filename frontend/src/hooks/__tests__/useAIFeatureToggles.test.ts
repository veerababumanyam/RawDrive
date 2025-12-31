/**
 * Tests for useAIFeatureToggles Hook
 * Feature: 010-ai-powered-features
 * Task: T081 - E2E tests for complete user workflows
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAIFeatureToggles } from '../useGeminiSettings';
import { geminiSettingsService } from '../../services/geminiSettingsService';
import type { AIFeatureTogglesResponse } from '../../types/geminiSettings';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../services/geminiSettingsService', () => ({
  geminiSettingsService: {
    getFeatureToggles: vi.fn(),
    updateFeatureToggles: vi.fn(),
  },
}));

const mockTogglesResponse: AIFeatureTogglesResponse = {
  toggles: {
    photo_analysis: true,
    captions: true,
    hashtags: true,
    gallery_story: true,
    smart_curation: true,
  },
  has_api_key: true,
  api_status: 'connected',
};

describe('useAIFeatureToggles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Initial Fetch Tests
  // ---------------------------------------------------------------------------

  describe('Initial Fetch', () => {
    it('fetches feature toggles on mount when autoFetch is true', async () => {
      vi.mocked(geminiSettingsService.getFeatureToggles).mockResolvedValue(
        mockTogglesResponse
      );

      const { result } = renderHook(() => useAIFeatureToggles());

      // Initially loading
      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.featureToggles).toEqual(mockTogglesResponse);
      expect(geminiSettingsService.getFeatureToggles).toHaveBeenCalledTimes(1);
    });

    it('does not fetch when autoFetch is false', async () => {
      const { result } = renderHook(() => useAIFeatureToggles({ autoFetch: false }));

      // Should not be loading and no data
      expect(result.current.loading).toBe(false);
      expect(result.current.featureToggles).toBeNull();
      expect(geminiSettingsService.getFeatureToggles).not.toHaveBeenCalled();
    });

    it('handles fetch error gracefully', async () => {
      const testError = new Error('Network error');
      vi.mocked(geminiSettingsService.getFeatureToggles).mockRejectedValue(testError);

      const { result } = renderHook(() => useAIFeatureToggles());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();
      expect(result.current.error?.message).toBe('Network error');
      expect(result.current.featureToggles).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Toggle Feature Tests
  // ---------------------------------------------------------------------------

  describe('toggleFeature', () => {
    it('toggles a feature from enabled to disabled', async () => {
      vi.mocked(geminiSettingsService.getFeatureToggles).mockResolvedValue(
        mockTogglesResponse
      );

      const updatedToggles: AIFeatureTogglesResponse = {
        ...mockTogglesResponse,
        toggles: {
          ...mockTogglesResponse.toggles,
          photo_analysis: false,
        },
      };

      vi.mocked(geminiSettingsService.updateFeatureToggles).mockResolvedValue(
        updatedToggles
      );

      const { result } = renderHook(() => useAIFeatureToggles());

      await waitFor(() => {
        expect(result.current.featureToggles).not.toBeNull();
      });

      // Toggle photo_analysis
      await act(async () => {
        await result.current.toggleFeature('photo_analysis');
      });

      expect(geminiSettingsService.updateFeatureToggles).toHaveBeenCalledWith({
        photo_analysis: false,
      });
      expect(result.current.featureToggles?.toggles.photo_analysis).toBe(false);
    });

    it('toggles a feature from disabled to enabled', async () => {
      const disabledToggles: AIFeatureTogglesResponse = {
        ...mockTogglesResponse,
        toggles: {
          ...mockTogglesResponse.toggles,
          captions: false,
        },
      };

      vi.mocked(geminiSettingsService.getFeatureToggles).mockResolvedValue(
        disabledToggles
      );

      const enabledToggles: AIFeatureTogglesResponse = {
        ...disabledToggles,
        toggles: {
          ...disabledToggles.toggles,
          captions: true,
        },
      };

      vi.mocked(geminiSettingsService.updateFeatureToggles).mockResolvedValue(
        enabledToggles
      );

      const { result } = renderHook(() => useAIFeatureToggles());

      await waitFor(() => {
        expect(result.current.featureToggles).not.toBeNull();
      });

      // Toggle captions
      await act(async () => {
        await result.current.toggleFeature('captions');
      });

      expect(geminiSettingsService.updateFeatureToggles).toHaveBeenCalledWith({
        captions: true,
      });
      expect(result.current.featureToggles?.toggles.captions).toBe(true);
    });

    it('throws error if toggles not loaded', async () => {
      const { result } = renderHook(() => useAIFeatureToggles({ autoFetch: false }));

      await expect(
        result.current.toggleFeature('photo_analysis')
      ).rejects.toThrow('Feature toggles not loaded');
    });

    it('handles toggle error gracefully', async () => {
      vi.mocked(geminiSettingsService.getFeatureToggles).mockResolvedValue(
        mockTogglesResponse
      );
      vi.mocked(geminiSettingsService.updateFeatureToggles).mockRejectedValue(
        new Error('Update failed')
      );

      const { result } = renderHook(() => useAIFeatureToggles());

      await waitFor(() => {
        expect(result.current.featureToggles).not.toBeNull();
      });

      await expect(
        act(async () => {
          await result.current.toggleFeature('photo_analysis');
        })
      ).rejects.toThrow('Update failed');

      expect(result.current.error).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // Update Toggles Tests
  // ---------------------------------------------------------------------------

  describe('updateToggles', () => {
    it('updates multiple toggles at once', async () => {
      vi.mocked(geminiSettingsService.getFeatureToggles).mockResolvedValue(
        mockTogglesResponse
      );

      const updatedToggles: AIFeatureTogglesResponse = {
        ...mockTogglesResponse,
        toggles: {
          ...mockTogglesResponse.toggles,
          hashtags: false,
          gallery_story: false,
        },
      };

      vi.mocked(geminiSettingsService.updateFeatureToggles).mockResolvedValue(
        updatedToggles
      );

      const { result } = renderHook(() => useAIFeatureToggles());

      await waitFor(() => {
        expect(result.current.featureToggles).not.toBeNull();
      });

      await act(async () => {
        await result.current.updateToggles({
          hashtags: false,
          gallery_story: false,
        });
      });

      expect(geminiSettingsService.updateFeatureToggles).toHaveBeenCalledWith({
        hashtags: false,
        gallery_story: false,
      });
      expect(result.current.featureToggles?.toggles.hashtags).toBe(false);
      expect(result.current.featureToggles?.toggles.gallery_story).toBe(false);
    });

    it('only updates specified toggles', async () => {
      vi.mocked(geminiSettingsService.getFeatureToggles).mockResolvedValue(
        mockTogglesResponse
      );

      const updatedToggles: AIFeatureTogglesResponse = {
        ...mockTogglesResponse,
        toggles: {
          ...mockTogglesResponse.toggles,
          smart_curation: false,
        },
      };

      vi.mocked(geminiSettingsService.updateFeatureToggles).mockResolvedValue(
        updatedToggles
      );

      const { result } = renderHook(() => useAIFeatureToggles());

      await waitFor(() => {
        expect(result.current.featureToggles).not.toBeNull();
      });

      await act(async () => {
        await result.current.updateToggles({ smart_curation: false });
      });

      // Only smart_curation should change
      expect(result.current.featureToggles?.toggles.smart_curation).toBe(false);
      expect(result.current.featureToggles?.toggles.photo_analysis).toBe(true);
      expect(result.current.featureToggles?.toggles.captions).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // isFeatureEnabled Tests
  // ---------------------------------------------------------------------------

  describe('isFeatureEnabled', () => {
    it('returns true for enabled features', async () => {
      vi.mocked(geminiSettingsService.getFeatureToggles).mockResolvedValue(
        mockTogglesResponse
      );

      const { result } = renderHook(() => useAIFeatureToggles());

      await waitFor(() => {
        expect(result.current.featureToggles).not.toBeNull();
      });

      expect(result.current.isFeatureEnabled('photo_analysis')).toBe(true);
      expect(result.current.isFeatureEnabled('captions')).toBe(true);
      expect(result.current.isFeatureEnabled('hashtags')).toBe(true);
    });

    it('returns false for disabled features', async () => {
      const mixedToggles: AIFeatureTogglesResponse = {
        ...mockTogglesResponse,
        toggles: {
          ...mockTogglesResponse.toggles,
          photo_analysis: false,
          gallery_story: false,
        },
      };

      vi.mocked(geminiSettingsService.getFeatureToggles).mockResolvedValue(
        mixedToggles
      );

      const { result } = renderHook(() => useAIFeatureToggles());

      await waitFor(() => {
        expect(result.current.featureToggles).not.toBeNull();
      });

      expect(result.current.isFeatureEnabled('photo_analysis')).toBe(false);
      expect(result.current.isFeatureEnabled('gallery_story')).toBe(false);
      expect(result.current.isFeatureEnabled('captions')).toBe(true);
    });

    it('defaults to true when toggles not loaded', () => {
      const { result } = renderHook(() => useAIFeatureToggles({ autoFetch: false }));

      // Should default to enabled when no data
      expect(result.current.isFeatureEnabled('photo_analysis')).toBe(true);
      expect(result.current.isFeatureEnabled('captions')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Refetch Tests
  // ---------------------------------------------------------------------------

  describe('refetch', () => {
    it('refetches feature toggles', async () => {
      vi.mocked(geminiSettingsService.getFeatureToggles).mockResolvedValue(
        mockTogglesResponse
      );

      const { result } = renderHook(() => useAIFeatureToggles());

      await waitFor(() => {
        expect(result.current.featureToggles).not.toBeNull();
      });

      expect(geminiSettingsService.getFeatureToggles).toHaveBeenCalledTimes(1);

      // Refetch
      await act(async () => {
        await result.current.refetch();
      });

      expect(geminiSettingsService.getFeatureToggles).toHaveBeenCalledTimes(2);
    });

    it('updates data after refetch', async () => {
      vi.mocked(geminiSettingsService.getFeatureToggles).mockResolvedValue(
        mockTogglesResponse
      );

      const { result } = renderHook(() => useAIFeatureToggles());

      await waitFor(() => {
        expect(result.current.featureToggles).not.toBeNull();
      });

      // Change mock response for refetch
      const updatedToggles: AIFeatureTogglesResponse = {
        ...mockTogglesResponse,
        toggles: {
          ...mockTogglesResponse.toggles,
          photo_analysis: false,
        },
      };
      vi.mocked(geminiSettingsService.getFeatureToggles).mockResolvedValue(
        updatedToggles
      );

      await act(async () => {
        await result.current.refetch();
      });

      expect(result.current.featureToggles?.toggles.photo_analysis).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Loading State Tests
  // ---------------------------------------------------------------------------

  describe('Loading States', () => {
    it('sets loading true during fetch', async () => {
      let resolvePromise: (value: AIFeatureTogglesResponse) => void;
      const pendingPromise = new Promise<AIFeatureTogglesResponse>((resolve) => {
        resolvePromise = resolve;
      });

      vi.mocked(geminiSettingsService.getFeatureToggles).mockReturnValue(
        pendingPromise
      );

      const { result } = renderHook(() => useAIFeatureToggles());

      // Should be loading
      expect(result.current.loading).toBe(true);

      // Resolve the promise
      await act(async () => {
        resolvePromise!(mockTogglesResponse);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it('sets loading true during update', async () => {
      vi.mocked(geminiSettingsService.getFeatureToggles).mockResolvedValue(
        mockTogglesResponse
      );

      let resolveUpdate: (value: AIFeatureTogglesResponse) => void;
      const pendingUpdate = new Promise<AIFeatureTogglesResponse>((resolve) => {
        resolveUpdate = resolve;
      });

      vi.mocked(geminiSettingsService.updateFeatureToggles).mockReturnValue(
        pendingUpdate
      );

      const { result } = renderHook(() => useAIFeatureToggles());

      await waitFor(() => {
        expect(result.current.featureToggles).not.toBeNull();
      });

      // Start update - this will set loading to true
      let updatePromise: Promise<AIFeatureTogglesResponse>;
      act(() => {
        updatePromise = result.current.updateToggles({ photo_analysis: false });
      });

      // Should be loading during update
      expect(result.current.loading).toBe(true);

      // Resolve the update
      await act(async () => {
        resolveUpdate!({
          ...mockTogglesResponse,
          toggles: { ...mockTogglesResponse.toggles, photo_analysis: false },
        });
        await updatePromise;
      });

      expect(result.current.loading).toBe(false);
    });
  });
});
