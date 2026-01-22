/**
 * ReviewModePage Component
 * Pro Review Mode page entry point
 * Feature: 029-pro-review-xmp-sync
 * Task: T031
 *
 * Full-screen Lightroom-style review interface for professional photo culling
 * with keyboard shortcuts, rating, flagging, and color labels.
 */

import React, { useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useGallery } from '../../hooks/useGallery';
import { useReviewMode } from '../../hooks/useReviewMode';
import { ReviewWorkbench } from '../../components/features/gallery/review';
import type { AssetRating, AssetFlag, ColorLabel, ReviewFilterOptions } from '../../types/reviewMode';

/**
 * ReviewModePage - Pro Review Mode entry point
 */
const ReviewModePage: React.FC = () => {
  const { id: galleryId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { workspace, user } = useAuth();

  // Get initial asset ID from URL if provided
  const initialAssetId = searchParams.get('asset') || undefined;
  const subGalleryId = searchParams.get('subgallery') || undefined;

  // Parse initial filters from URL
  const initialFilters = useMemo((): ReviewFilterOptions => {
    const filters: ReviewFilterOptions = {};

    const minRating = searchParams.get('minRating');
    if (minRating) {
      filters.minRating = parseInt(minRating, 10) as AssetRating;
    }

    const flags = searchParams.get('flags');
    if (flags) {
      filters.flags = flags.split(',') as AssetFlag[];
    }

    const colors = searchParams.get('colors');
    if (colors) {
      filters.colorLabels = colors.split(',') as ColorLabel[];
    }

    return filters;
  }, [searchParams]);

  // Fetch gallery info
  const { gallery, loading: galleryLoading, error: galleryError } = useGallery({
    galleryId: galleryId || '',
    workspaceId: workspace?.id || '',
  });

  // Initialize review mode
  const {
    assets,
    currentIndex,
    currentAsset,
    stats,
    filters,
    isLoading,
    isUpdating,
    isSyncing,
    error,
    // Navigation
    goToNext,
    goToPrev,
    goToFirst,
    goToLast,
    goToIndex,
    // Metadata actions
    setRating,
    setFlag,
    setColorLabel,
    // Filter actions
    setFilters,
    // Settings
    autoAdvance,
    setAutoAdvance,
  } = useReviewMode({
    workspaceId: workspace?.id || '',
    galleryId: galleryId || '',
    initialAssetId,
    subGalleryId,
    initialFilters,
    autoAdvance: true,
    onExit: () => handleExit(),
  });

  // Handle navigation
  const handleNavigate = useCallback(
    (direction: 'prev' | 'next' | 'first' | 'last' | number) => {
      if (typeof direction === 'number') {
        goToIndex(direction);
      } else {
        switch (direction) {
          case 'prev':
            goToPrev();
            break;
          case 'next':
            goToNext();
            break;
          case 'first':
            goToFirst();
            break;
          case 'last':
            goToLast();
            break;
        }
      }
    },
    [goToNext, goToPrev, goToFirst, goToLast, goToIndex]
  );

  // Handle rating change
  const handleRatingChange = useCallback(
    (rating: AssetRating) => {
      if (currentAsset) {
        setRating(rating);
      }
    },
    [currentAsset, setRating]
  );

  // Handle flag change
  const handleFlagChange = useCallback(
    (flag: AssetFlag) => {
      if (currentAsset) {
        setFlag(flag);
      }
    },
    [currentAsset, setFlag]
  );

  // Handle color label change
  const handleColorLabelChange = useCallback(
    (label: ColorLabel) => {
      if (currentAsset) {
        setColorLabel(label);
      }
    },
    [currentAsset, setColorLabel]
  );

  // Handle filter change
  const handleFilterChange = useCallback(
    (newFilters: ReviewFilterOptions) => {
      setFilters(newFilters);

      // Update URL params
      const params = new URLSearchParams(searchParams);
      if (newFilters.minRating !== undefined) {
        params.set('minRating', String(newFilters.minRating));
      } else {
        params.delete('minRating');
      }
      if (newFilters.flags && newFilters.flags.length > 0) {
        params.set('flags', newFilters.flags.join(','));
      } else {
        params.delete('flags');
      }
      if (newFilters.colorLabels && newFilters.colorLabels.length > 0) {
        params.set('colors', newFilters.colorLabels.join(','));
      } else {
        params.delete('colors');
      }

      navigate({ search: params.toString() }, { replace: true });
    },
    [setFilters, searchParams, navigate]
  );

  // Handle exit
  const handleExit = useCallback(() => {
    // Navigate back to gallery detail page
    if (galleryId) {
      navigate(`/workspace/galleries/${galleryId}`);
    } else {
      navigate('/workspace/galleries');
    }
  }, [galleryId, navigate]);

  // Update document title
  useEffect(() => {
    const title = gallery?.title ? `Review: ${gallery.title}` : 'Review Mode';
    document.title = `${title} | RawDrive`;

    return () => {
      document.title = 'RawDrive';
    };
  }, [gallery?.title]);

  // Handle keyboard navigation at page level (escape to exit)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle Escape at page level - other shortcuts handled by useKeyboardShortcuts
      if (e.key === 'Escape' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        // Let the workbench handle it first
        // This is a fallback
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Error state
  if (galleryError || error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-white mb-2">Error Loading Gallery</h1>
          <p className="text-white/70 mb-4">{galleryError?.message || error || 'Unknown error'}</p>
          <button
            onClick={handleExit}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
          >
            Back to Gallery
          </button>
        </div>
      </div>
    );
  }

  // Loading state
  if (galleryLoading && assets.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-white/70">Loading gallery...</p>
        </div>
      </div>
    );
  }

  // Empty state
  if (!isLoading && assets.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-white mb-2">No Photos Found</h1>
          <p className="text-white/70 mb-4">
            {Object.keys(filters).length > 0
              ? 'No photos match your current filters. Try adjusting your filters.'
              : 'This gallery has no photos to review.'}
          </p>
          <button
            onClick={handleExit}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
          >
            Back to Gallery
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden">
      <ReviewWorkbench
        assets={assets}
        currentIndex={currentIndex}
        currentAsset={currentAsset}
        galleryTitle={gallery?.title || 'Review Mode'}
        stats={stats ?? undefined}
        filters={filters}
        isLoading={isLoading}
        isUpdating={isUpdating}
        isSyncing={isSyncing}
        autoAdvance={autoAdvance}
        onNavigate={handleNavigate}
        onRatingChange={handleRatingChange}
        onFlagChange={handleFlagChange}
        onColorLabelChange={handleColorLabelChange}
        onFilterChange={handleFilterChange}
        onAutoAdvanceToggle={setAutoAdvance}
        onExit={handleExit}
      />
    </div>
  );
};

export default ReviewModePage;
