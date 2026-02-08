/**
 * useCullingWorkflow Hook
 * State management for bulk photo culling workflow
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  cullingWorkflowService,
  CullingFilters,
  CullingPhoto,
  CullingStats,
  AutoRejectRequest,
} from '../services/cullingWorkflowService';
import { useDebounce } from './useDebounce';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CullingViewMode = 'culling' | 'preview';
export type CullingSortBy = 'overall_score' | 'sharpness_score' | 'exposure_score' | 'composition_score' | 'face_count' | 'filename';

export interface UseCullingWorkflowOptions {
  workspaceId: string;
  galleryId: string;
  initialPageSize?: number;
  autoLoadOnFilterChange?: boolean;
}

export interface UseCullingWorkflowReturn {
  // Data
  photos: CullingPhoto[];
  stats: CullingStats | null;
  total: number;
  page: number;
  pageSize: number;

  // Selection state
  selectedIds: Set<string>;

  // Filters
  filters: CullingFilters;
  sortBy: CullingSortBy;
  sortOrder: 'asc' | 'desc';

  // View mode
  viewMode: CullingViewMode;
  setViewMode: (mode: CullingViewMode) => void;

  // Loading states
  isLoading: boolean;
  isActionLoading: boolean;

  // Error
  error: string | null;

  // Actions
  loadPhotos: () => Promise<void>;
  loadStats: () => Promise<void>;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  setFilters: (filters: Partial<CullingFilters>) => void;
  resetFilters: () => void;
  setSortBy: (sortBy: CullingSortBy) => void;
  setSortOrder: (order: 'asc' | 'desc') => void;

  // Selection actions
  toggleSelection: (assetId: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  selectByQuality: (tier: 'excellent' | 'good' | 'fair' | 'all') => void;

  // Bulk actions
  bulkSelect: () => Promise<void>;
  bulkReject: (reason?: string) => Promise<void>;
  bulkReset: () => Promise<void>;
  autoReject: (options?: AutoRejectRequest) => Promise<void>;

  // Apply selection
  createSubGallery: (name: string) => Promise<string | undefined>;
  markAsFavorites: () => Promise<void>;

  // Preview
  loadPreview: () => Promise<void>;
  previewPhotos: CullingPhoto[];
}

// ---------------------------------------------------------------------------
// Default values
// ---------------------------------------------------------------------------

const DEFAULT_FILTERS: CullingFilters = {
  minOverallScore: undefined,
  minSharpness: undefined,
  minExposure: undefined,
  maxExposure: undefined,
  hasFaces: undefined,
  minFaces: undefined,
  hideBlur: false,
  showBokeh: true,
  exposureOptimal: false,
};

const DEFAULT_STATS: CullingStats = {
  total_photos: 0,
  analyzed_count: 0,
  selected_count: 0,
  rejected_count: 0,
  pending_count: 0,
  excellent_count: 0,
  good_count: 0,
  fair_count: 0,
  poor_count: 0,
  faces_detected_count: 0,
  blur_detected_count: 0,
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const useCullingWorkflow = ({
  workspaceId,
  galleryId,
  initialPageSize = 50,
  autoLoadOnFilterChange = true,
}: UseCullingWorkflowOptions): UseCullingWorkflowReturn => {
  // Data state
  const [photos, setPhotos] = useState<CullingPhoto[]>([]);
  const [stats, setStats] = useState<CullingStats | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  // Preview state
  const [previewPhotos, setPreviewPhotos] = useState<CullingPhoto[]>([]);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Filter state
  const [filters, setFiltersState] = useState<CullingFilters>(DEFAULT_FILTERS);
  const [sortBy, setSortBy] = useState<CullingSortBy>('overall_score');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // View mode
  const [viewMode, setViewMode] = useState<CullingViewMode>('culling');

  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Debounced filters for auto-reload
  const debouncedFilters = useDebounce(filters, 300);

  // ---------------------------------------------------------------------------
  // Data Loading
  // ---------------------------------------------------------------------------

  const loadPhotos = useCallback(async () => {
    if (!workspaceId || !galleryId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await cullingWorkflowService.getPhotos(
        workspaceId,
        galleryId,
        {
          filters,
          page,
          limit: pageSize,
          sortBy,
          sortOrder,
        }
      );

      setPhotos(response.photos);
      setStats(response.stats);
      setTotal(response.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load photos');
      console.error('Failed to load culling photos:', err);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, galleryId, filters, page, pageSize, sortBy, sortOrder]);

  const loadStats = useCallback(async () => {
    if (!workspaceId || !galleryId) return;

    try {
      const statsData = await cullingWorkflowService.getStats(workspaceId, galleryId);
      setStats(statsData);
    } catch (err) {
      console.error('Failed to load culling stats:', err);
    }
  }, [workspaceId, galleryId]);

  const loadPreview = useCallback(async () => {
    if (!workspaceId || !galleryId) return;

    setIsLoading(true);

    try {
      const response = await cullingWorkflowService.getSelection(
        workspaceId,
        galleryId,
        1,
        200
      );

      setPreviewPhotos(response.photos);
      setStats(response.stats);
    } catch (err) {
      console.error('Failed to load preview:', err);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, galleryId]);

  // Auto-load on filter change
  useEffect(() => {
    if (autoLoadOnFilterChange && viewMode === 'culling') {
      loadPhotos();
    }
  }, [debouncedFilters, page, pageSize, sortBy, sortOrder, autoLoadOnFilterChange, viewMode, loadPhotos]);

  // Load preview when switching to preview mode
  useEffect(() => {
    if (viewMode === 'preview') {
      loadPreview();
    }
  }, [viewMode, loadPreview]);

  // ---------------------------------------------------------------------------
  // Filter Actions
  // ---------------------------------------------------------------------------

  const setFilters = useCallback((newFilters: Partial<CullingFilters>) => {
    setFiltersState((prev) => ({ ...prev, ...newFilters }));
    setPage(1); // Reset to first page on filter change
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState(DEFAULT_FILTERS);
    setPage(1);
  }, []);

  // ---------------------------------------------------------------------------
  // Selection Actions
  // ---------------------------------------------------------------------------

  const toggleSelection = useCallback((assetId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    const allIds = photos.map((p) => p.asset_id);
    setSelectedIds(new Set(allIds));
  }, [photos]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selectByQuality = useCallback(
    (tier: 'excellent' | 'good' | 'fair' | 'all') => {
      let filtered: CullingPhoto[];

      switch (tier) {
        case 'excellent':
          filtered = photos.filter((p) => p.quality_tier === 'excellent');
          break;
        case 'good':
          filtered = photos.filter((p) => p.quality_tier === 'good' || p.quality_tier === 'excellent');
          break;
        case 'fair':
          filtered = photos.filter((p) => p.quality_tier !== 'poor');
          break;
        case 'all':
        default:
          filtered = photos;
      }

      setSelectedIds(new Set(filtered.map((p) => p.asset_id)));
    },
    [photos]
  );

  // ---------------------------------------------------------------------------
  // Bulk Actions
  // ---------------------------------------------------------------------------

  const bulkSelect = useCallback(async () => {
    if (selectedIds.size === 0 || !workspaceId || !galleryId) return;

    setIsActionLoading(true);

    try {
      await cullingWorkflowService.bulkSelect(
        workspaceId,
        galleryId,
        Array.from(selectedIds)
      );

      // Refresh data
      await loadPhotos();
      setSelectedIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to select photos');
    } finally {
      setIsActionLoading(false);
    }
  }, [selectedIds, workspaceId, galleryId, loadPhotos]);

  const bulkReject = useCallback(
    async (reason?: string) => {
      if (selectedIds.size === 0 || !workspaceId || !galleryId) return;

      setIsActionLoading(true);

      try {
        await cullingWorkflowService.bulkReject(
          workspaceId,
          galleryId,
          Array.from(selectedIds),
          reason
        );

        // Refresh data
        await loadPhotos();
        setSelectedIds(new Set());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to reject photos');
      } finally {
        setIsActionLoading(false);
      }
    },
    [selectedIds, workspaceId, galleryId, loadPhotos]
  );

  const bulkReset = useCallback(async () => {
    if (selectedIds.size === 0 || !workspaceId || !galleryId) return;

    setIsActionLoading(true);

    try {
      await cullingWorkflowService.bulkReset(
        workspaceId,
        galleryId,
        Array.from(selectedIds)
      );

      // Refresh data
      await loadPhotos();
      setSelectedIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset photos');
    } finally {
      setIsActionLoading(false);
    }
  }, [selectedIds, workspaceId, galleryId, loadPhotos]);

  const autoReject = useCallback(
    async (options?: AutoRejectRequest) => {
      if (!workspaceId || !galleryId) return;

      setIsActionLoading(true);

      try {
        const result = await cullingWorkflowService.autoReject(
          workspaceId,
          galleryId,
          options
        );

        // Refresh data
        await loadPhotos();

        console.log(`Auto-rejected ${result.rejected_count} photos`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to auto-reject');
      } finally {
        setIsActionLoading(false);
      }
    },
    [workspaceId, galleryId, loadPhotos]
  );

  // ---------------------------------------------------------------------------
  // Apply Selection
  // ---------------------------------------------------------------------------

  const createSubGallery = useCallback(
    async (name: string): Promise<string | undefined> => {
      if (!workspaceId || !galleryId) return;

      setIsActionLoading(true);

      try {
        const result = await cullingWorkflowService.applySelection(
          workspaceId,
          galleryId,
          { action: 'create_sub_gallery', name }
        );

        if (result.success) {
          // Refresh stats
          await loadStats();
          return result.sub_gallery_id;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create sub-gallery');
      } finally {
        setIsActionLoading(false);
      }
    },
    [workspaceId, galleryId, loadStats]
  );

  const markAsFavorites = useCallback(async () => {
    if (!workspaceId || !galleryId) return;

    setIsActionLoading(true);

    try {
      await cullingWorkflowService.applySelection(workspaceId, galleryId, {
        action: 'mark_favorites',
      });

      // Refresh stats
      await loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark favorites');
    } finally {
      setIsActionLoading(false);
    }
  }, [workspaceId, galleryId, loadStats]);

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    // Data
    photos,
    stats,
    total,
    page,
    pageSize,

    // Selection
    selectedIds,

    // Filters
    filters,
    sortBy,
    sortOrder,

    // View mode
    viewMode,
    setViewMode,

    // Loading
    isLoading,
    isActionLoading,

    // Error
    error,

    // Data actions
    loadPhotos,
    loadStats,
    setPage,
    setPageSize,
    setFilters,
    resetFilters,
    setSortBy,
    setSortOrder,

    // Selection actions
    toggleSelection,
    selectAll,
    deselectAll,
    selectByQuality,

    // Bulk actions
    bulkSelect,
    bulkReject,
    bulkReset,
    autoReject,

    // Apply selection
    createSubGallery,
    markAsFavorites,

    // Preview
    loadPreview,
    previewPhotos,
  };
};
