import { renderHook, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useAIFilters } from '../../../src/hooks/useAIFilters';

vi.mock('../../../src/services/aiFilterService', () => {
  return {
    aiFilterService: {
      getFilterMatchCount: vi.fn().mockResolvedValue({ count: 5, similarityGroupsCount: 0 }),
      getFilteredAssets: vi.fn().mockResolvedValue({
        assetIds: ['a', 'b', 'c'],
        meta: { page: 1, limit: 100, total: 3, hasMore: false },
        filterStats: { excellentCount: 1, goodCount: 2, fairCount: 0, blurryHidden: 0 },
      }),
    },
  };
});

const { aiFilterService } = await import('../../../src/services/aiFilterService');

describe('useAIFilters', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    vi.mocked(aiFilterService.getFilterMatchCount).mockClear();
    vi.mocked(aiFilterService.getFilteredAssets).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes with defaults and updates match count after debounce', async () => {
    const { result } = renderHook(() =>
      useAIFilters({ workspaceId: 'w1', galleryId: 'g1', countDebounceMs: 10 })
    );

    expect(result.current.filters.qualityTier).toBe('all');

    await act(async () => {
      vi.advanceTimersByTime(20);
    });

    expect(aiFilterService.getFilterMatchCount).toHaveBeenCalledTimes(1);
    expect(result.current.matchCount).toBe(5);
  });

  it('applies filters and stores lastApplied', async () => {
    const { result } = renderHook(() =>
      useAIFilters({ workspaceId: 'w1', galleryId: 'g1', countDebounceMs: 10 })
    );

    await act(async () => {
      const applied = await result.current.applyFilters();
      expect(applied?.assetIds).toEqual(['a', 'b', 'c']);
    });

    expect(result.current.lastApplied?.meta.total).toBe(3);
    expect(aiFilterService.getFilteredAssets).toHaveBeenCalledWith('w1', 'g1', expect.any(Object));
  });

  it('persists to sessionStorage and URL when filters change', async () => {
    const { result } = renderHook(() =>
      useAIFilters({ workspaceId: 'w1', galleryId: 'g1', countDebounceMs: 0 })
    );

    await act(async () => {
      result.current.updateFilter({ qualityTier: 'good', blurHide: true, qualityMin: 70 });
    });

    const stored = sessionStorage.getItem('aiFilters:w1:g1');
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored || '{}');
    expect(parsed.qualityTier).toBe('good');
    expect(parsed.blurHide).toBe(true);
  });
});
